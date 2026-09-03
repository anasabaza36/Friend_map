import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FriendRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { FriendshipsService } from '../friendships/friendships.service';
import { FriendsService } from './friends.service';

describe('FriendsService authorization', () => {
  let service: FriendsService;

  const senderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const receiverId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const otherUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const requestId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const prisma = {
    friendRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    friendship: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const usersService = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
  };

  const friendshipsService = {
    areFriends: jest.fn(),
    listFriends: jest.fn(),
    removeFriendship: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<void>) => callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: FriendshipsService, useValue: friendshipsService },
      ],
    }).compile();

    service = module.get(FriendsService);
  });

  describe('sendFriendRequest', () => {
    it('rejects sending a request to yourself', async () => {
      usersService.findByUsername.mockResolvedValue({
        id: senderId,
        email: 'alice@example.com',
        username: 'alice',
        passwordHash: 'hash',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.sendFriendRequest(senderId, { username: 'alice' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate pending requests in either direction', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: receiverId,
        email: 'bob@example.com',
        username: 'bob',
        passwordHash: 'hash',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      friendshipsService.areFriends.mockResolvedValue(false);
      prisma.friendRequest.findFirst.mockResolvedValue({
        id: requestId,
        senderId: receiverId,
        receiverId: senderId,
        status: FriendRequestStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.sendFriendRequest(senderId, { email: 'bob@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects request to invalid user', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.sendFriendRequest(senderId, { email: 'missing@example.com' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('acceptFriendRequest', () => {
    it('rejects when caller is not the receiver', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: requestId,
        senderId,
        receiverId,
        status: FriendRequestStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.acceptFriendRequest(otherUserId, requestId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the receiver to accept a pending request', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: requestId,
        senderId,
        receiverId,
        status: FriendRequestStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.friendRequest.update.mockResolvedValue({});
      prisma.friendship.upsert.mockResolvedValue({});
      prisma.friendRequest.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.acceptFriendRequest(receiverId, requestId);

      expect(result).toEqual({ id: requestId, status: 'ACCEPTED' });
      expect(prisma.friendship.upsert).toHaveBeenCalled();
    });
  });

  describe('rejectFriendRequest', () => {
    it('rejects when caller is not the receiver', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: requestId,
        senderId,
        receiverId,
        status: FriendRequestStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.rejectFriendRequest(senderId, requestId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeFriend', () => {
    it('rejects removing a non-friend', async () => {
      friendshipsService.areFriends.mockResolvedValue(false);

      await expect(
        service.removeFriend(senderId, receiverId),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows removing an existing friendship', async () => {
      friendshipsService.areFriends.mockResolvedValue(true);
      friendshipsService.removeFriendship.mockResolvedValue(undefined);

      const result = await service.removeFriend(senderId, receiverId);

      expect(result).toEqual({ removed: true, userId: receiverId });
      expect(friendshipsService.removeFriendship).toHaveBeenCalledWith(
        senderId,
        receiverId,
      );
    });
  });
});
