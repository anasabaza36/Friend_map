import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { FriendRequestStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { FriendshipsService } from '../friendships/friendships.service';
import { UserSummary } from '../common/types/user-summary.type';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import {
  FriendRequestActionResponse,
  FriendRequestResponse,
  FriendsResponse,
  RemoveFriendResponse,
} from './types/friends-response.type';
import { LocationGateway } from '../realtime/location.gateway';

@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name);
  private gateway: LocationGateway | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly friendshipsService: FriendshipsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async sendFriendRequest(
    senderId: string,
    dto: SendFriendRequestDto,
  ): Promise<FriendRequestResponse> {
    const receiver = await this.resolveTargetUser(dto);
    if (!receiver) {
      throw new NotFoundException('User not found');
    }

    if (receiver.id === senderId) {
      throw new BadRequestException('You cannot send a friend request to yourself');
    }

    const alreadyFriends = await this.friendshipsService.areFriends(
      senderId,
      receiver.id,
    );
    if (alreadyFriends) {
      throw new ConflictException('You are already friends with this user');
    }

    await this.assertNoPendingRequestBetween(senderId, receiver.id);

    await this.prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId, receiverId: receiver.id },
          { senderId: receiver.id, receiverId: senderId },
        ],
      },
    });

    const request = await this.prisma.friendRequest.create({
      data: {
        senderId,
        receiverId: receiver.id,
        status: FriendRequestStatus.PENDING,
      },
      include: { receiver: true, sender: true },
    });

    this.emitFriendRequestReceived(
      receiver.id,
      request.id,
      senderId,
      request.sender.username,
    );

    return {
      id: request.id,
      user: this.toUserSummary(request.receiver),
      createdAt: request.createdAt,
    };
  }

  async getIncomingRequests(
    userId: string,
  ): Promise<FriendRequestResponse[]> {
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        receiverId: userId,
        status: FriendRequestStatus.PENDING,
      },
      include: { sender: true },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((request) => ({
      id: request.id,
      user: this.toUserSummary(request.sender),
      createdAt: request.createdAt,
    }));
  }

  async listFriends(userId: string): Promise<UserSummary[]> {
    return this.friendshipsService.listFriends(userId);
  }

  async listOutgoingRequests(
    userId: string,
  ): Promise<FriendRequestResponse[]> {
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        senderId: userId,
        status: FriendRequestStatus.PENDING,
      },
      include: { receiver: true },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((request) => ({
      id: request.id,
      user: this.toUserSummary(request.receiver),
      createdAt: request.createdAt,
    }));
  }

  async getFriendsComposite(userId: string): Promise<FriendsResponse> {
    const [friends, incomingRaw, outgoingRaw] = await Promise.all([
      this.listFriends(userId),
      this.prisma.friendRequest.findMany({
        where: {
          receiverId: userId,
          status: FriendRequestStatus.PENDING,
        },
        include: { sender: true, receiver: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.friendRequest.findMany({
        where: {
          senderId: userId,
          status: FriendRequestStatus.PENDING,
        },
        include: { sender: true, receiver: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const incomingRequests = incomingRaw.map((r) => ({
      id: r.id,
      requester: this.toUserSummary(r.sender),
      addressee: this.toUserSummary(r.receiver),
      createdAt: r.createdAt.toISOString(),
    }));

    const outgoingRequests = outgoingRaw.map((r) => ({
      id: r.id,
      requester: this.toUserSummary(r.sender),
      addressee: this.toUserSummary(r.receiver),
      createdAt: r.createdAt.toISOString(),
    }));

    return { friends, incomingRequests, outgoingRequests };
  }

  async acceptFriendRequest(
    userId: string,
    requestId: string,
  ): Promise<FriendRequestActionResponse> {
    const request = await this.getPendingRequestForReceiver(userId, requestId);

    const sender = await this.usersService.findById(request.senderId);
    const acceptor = await this.usersService.findById(userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.friendRequest.update({
        where: { id: request.id },
        data: { status: FriendRequestStatus.ACCEPTED },
      });

      const { userAId, userBId } = this.normalizePair(
        request.senderId,
        request.receiverId,
      );

      await tx.friendship.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        update: {},
        create: { userAId, userBId },
      });

      await tx.friendRequest.updateMany({
        where: {
          status: FriendRequestStatus.PENDING,
          OR: [
            { senderId: request.senderId, receiverId: request.receiverId },
            { senderId: request.receiverId, receiverId: request.senderId },
          ],
          id: { not: request.id },
        },
        data: { status: FriendRequestStatus.REJECTED },
      });
    });

    this.emitFriendAccepted(
      request.senderId,
      request.id,
      userId,
      acceptor?.username ?? 'Unknown',
    );

    return { id: request.id, status: 'ACCEPTED' };
  }

  async rejectFriendRequest(
    userId: string,
    requestId: string,
  ): Promise<FriendRequestActionResponse> {
    const request = await this.getPendingRequestForReceiver(userId, requestId);

    await this.prisma.friendRequest.update({
      where: { id: request.id },
      data: { status: FriendRequestStatus.REJECTED },
    });

    return { id: request.id, status: 'REJECTED' };
  }

  async removeFriend(
    userId: string,
    friendUserId: string,
  ): Promise<RemoveFriendResponse> {
    if (userId === friendUserId) {
      throw new BadRequestException('You cannot remove yourself as a friend');
    }

    const areFriends = await this.friendshipsService.areFriends(
      userId,
      friendUserId,
    );
    if (!areFriends) {
      throw new NotFoundException('Friendship not found');
    }

    const remover = await this.usersService.findById(userId);
    await this.friendshipsService.removeFriendship(userId, friendUserId);

    this.emitFriendRemoved(
      friendUserId,
      userId,
      remover?.username ?? 'Unknown',
    );

    return { removed: true, userId: friendUserId };
  }

  private async resolveTargetUser(
    dto: SendFriendRequestDto,
  ): Promise<User | null> {
    const target = dto.recipient?.trim();
    if (target) {
      const looksLikeEmail = target.includes('@');
      if (looksLikeEmail) {
        const byEmail = await this.usersService.findByEmail(target.toLowerCase());
        if (byEmail) return byEmail;
      }
      const byUsername = await this.usersService.findByUsername(target);
      if (byUsername) return byUsername;
      if (!looksLikeEmail) {
        const byEmailFallback = await this.usersService.findByEmail(
          target.toLowerCase(),
        );
        if (byEmailFallback) return byEmailFallback;
      }
      return null;
    }

    if (dto.email) {
      return this.usersService.findByEmail(dto.email.toLowerCase());
    }

    if (dto.username) {
      return this.usersService.findByUsername(dto.username);
    }

    return null;
  }

  private async assertNoPendingRequestBetween(
    userId1: string,
    userId2: string,
  ): Promise<void> {
    const pending = await this.prisma.friendRequest.findFirst({
      where: {
        status: FriendRequestStatus.PENDING,
        OR: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 },
        ],
      },
    });

    if (pending) {
      throw new ConflictException('A pending friend request already exists');
    }
  }

  private async getPendingRequestForReceiver(
    receiverId: string,
    requestId: string,
  ) {
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.status !== FriendRequestStatus.PENDING) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.receiverId !== receiverId) {
      throw new ForbiddenException(
        'You are not allowed to modify this friend request',
      );
    }

    return request;
  }

  private normalizePair(userId1: string, userId2: string) {
    return userId1 < userId2
      ? { userAId: userId1, userBId: userId2 }
      : { userAId: userId2, userBId: userId1 };
  }

  private toUserSummary(user: User): UserSummary {
    return {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
    };
  }

  private getGateway(): LocationGateway | null {
    if (this.gateway) return this.gateway;
    try {
      this.gateway = this.moduleRef.get(LocationGateway, { strict: false });
    } catch {
      this.gateway = null;
    }
    return this.gateway;
  }

  private emitFriendRequestReceived(
    receiverId: string,
    requestId: string,
    senderId: string,
    senderUsername: string,
  ): void {
    try {
      this.getGateway()?.notifyFriendRequestReceived(receiverId, {
        requestId,
        senderId,
        senderUsername,
      });
    } catch (err) {
      this.logger.warn('Failed to emit friend:request', err);
    }
  }

  private emitFriendAccepted(
    senderId: string,
    requestId: string,
    acceptorId: string,
    acceptorUsername: string,
  ): void {
    try {
      this.getGateway()?.notifyFriendAccepted(senderId, {
        requestId,
        acceptorId,
        acceptorUsername,
      });
    } catch (err) {
      this.logger.warn('Failed to emit friend:accepted', err);
    }
  }

  private emitFriendRemoved(
    removedUserId: string,
    removedByUserId: string,
    removedByUsername: string,
  ): void {
    try {
      this.getGateway()?.notifyFriendRemoved(removedUserId, {
        removedByUserId,
        removedByUsername,
      });
    } catch (err) {
      this.logger.warn('Failed to emit friend:removed', err);
    }
  }
}
