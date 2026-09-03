import { Injectable } from '@nestjs/common';
import { Friendship, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeFriendPair } from '../common/utils/friendship.util';
import { UserSummary } from '../common/types/user-summary.type';

@Injectable()
export class FriendshipsService {
  constructor(private readonly prisma: PrismaService) {}

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const { userAId, userBId } = normalizeFriendPair(userId1, userId2);

    const friendship = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });

    return friendship !== null;
  }

  async createFriendship(userId1: string, userId2: string): Promise<Friendship> {
    const { userAId, userBId } = normalizeFriendPair(userId1, userId2);

    return this.prisma.friendship.create({
      data: { userAId, userBId },
    });
  }

  async removeFriendship(userId1: string, userId2: string): Promise<void> {
    const { userAId, userBId } = normalizeFriendPair(userId1, userId2);

    await this.prisma.friendship.deleteMany({
      where: { userAId, userBId },
    });
  }

  async listFriends(userId: string): Promise<UserSummary[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: true,
        userB: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return friendships.map((friendship) =>
      this.toUserSummary(this.getFriendFromFriendship(friendship, userId)),
    );
  }

  async getFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { userAId: true, userBId: true },
    });

    return friendships.map((friendship) =>
      friendship.userAId === userId ? friendship.userBId : friendship.userAId,
    );
  }

  async validateAllAreFriends(
    ownerId: string,
    friendIds: string[],
  ): Promise<void> {
    const uniqueFriendIds = [...new Set(friendIds)];

    for (const friendId of uniqueFriendIds) {
      const areFriends = await this.areFriends(ownerId, friendId);
      if (!areFriends) {
        throw new Error(`User ${friendId} is not a confirmed friend`);
      }
    }
  }

  private getFriendFromFriendship(
    friendship: Friendship & { userA: User; userB: User },
    currentUserId: string,
  ): User {
    return friendship.userAId === currentUserId
      ? friendship.userB
      : friendship.userA;
  }

  private toUserSummary(user: User): UserSummary {
    return {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
    };
  }
}
