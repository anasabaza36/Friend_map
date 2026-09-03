import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SharingMode, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FriendshipsService } from '../friendships/friendships.service';
import { UserSummary } from '../common/types/user-summary.type';
import { UpdateSharingFriendsDto } from './dto/update-sharing-friends.dto';
import { UpdateSharingSettingsDto } from './dto/update-sharing-settings.dto';
import { SharingSettingsResponse } from './types/sharing-response.type';

type PrivacyNotifier = {
  notifySharingModeChanged: (
    ownerId: string,
    oldMode: SharingMode | null,
    newMode: SharingMode,
  ) => Promise<void> | void;
  notifySharingListChanged: (
    ownerId: string,
    mode: SharingMode,
  ) => Promise<void> | void;
};

@Injectable()
export class SharingService implements OnModuleInit {
  private privacyNotifier: PrivacyNotifier | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly friendshipsService: FriendshipsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    try {
      const notifier = this.moduleRef.get<PrivacyNotifier>(
        'PrivacyRealtimeService' as never,
        { strict: false },
      );
      if (notifier && typeof notifier.notifySharingModeChanged === 'function') {
        this.privacyNotifier = notifier;
      }
    } catch {
      this.privacyNotifier = null;
    }
  }

  async getSettings(userId: string): Promise<SharingSettingsResponse> {
    const settings = await this.getOrCreateSettings(userId);
    return this.buildResponse(userId, settings.mode);
  }

  async updateMode(
    userId: string,
    dto: UpdateSharingSettingsDto,
  ): Promise<SharingSettingsResponse> {
    const oldMode = await this.getModeForUser(userId);

    await this.prisma.sharingSettings.upsert({
      where: { userId },
      update: { mode: dto.mode },
      create: { userId, mode: dto.mode },
    });

    if (this.privacyNotifier) {
      void this.privacyNotifier.notifySharingModeChanged(
        userId,
        oldMode,
        dto.mode,
      );
    }

    return this.buildResponse(userId, dto.mode);
  }

  async updateSelectedFriends(
    userId: string,
    dto: UpdateSharingFriendsDto,
  ): Promise<SharingSettingsResponse> {
    await this.assertConfirmedFriends(userId, dto.friendIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.sharingSettings.upsert({
        where: { userId },
        update: { mode: SharingMode.SELECTED },
        create: { userId, mode: SharingMode.SELECTED },
      });

      await tx.sharingSelectedFriend.deleteMany({ where: { ownerId: userId } });

      if (dto.friendIds.length > 0) {
        await tx.sharingSelectedFriend.createMany({
          data: dto.friendIds.map((friendId) => ({ ownerId: userId, friendId })),
          skipDuplicates: true,
        });
      }
    });

    if (this.privacyNotifier) {
      void this.privacyNotifier.notifySharingListChanged(
        userId,
        SharingMode.SELECTED,
      );
    }

    return this.buildResponse(userId, SharingMode.SELECTED);
  }

  async updateExceptFriends(
    userId: string,
    dto: UpdateSharingFriendsDto,
  ): Promise<SharingSettingsResponse> {
    await this.assertConfirmedFriends(userId, dto.friendIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.sharingSettings.upsert({
        where: { userId },
        update: { mode: SharingMode.EXCEPT_SELECTED },
        create: { userId, mode: SharingMode.EXCEPT_SELECTED },
      });

      await tx.sharingExceptFriend.deleteMany({ where: { ownerId: userId } });

      if (dto.friendIds.length > 0) {
        await tx.sharingExceptFriend.createMany({
          data: dto.friendIds.map((friendId) => ({ ownerId: userId, friendId })),
          skipDuplicates: true,
        });
      }
    });

    if (this.privacyNotifier) {
      void this.privacyNotifier.notifySharingListChanged(
        userId,
        SharingMode.EXCEPT_SELECTED,
      );
    }

    return this.buildResponse(userId, SharingMode.EXCEPT_SELECTED);
  }

  async getModeForUser(userId: string): Promise<SharingMode> {
    const settings = await this.prisma.sharingSettings.findUnique({
      where: { userId },
    });

    return settings?.mode ?? SharingMode.GHOST;
  }

  async isSelectedFriend(ownerId: string, viewerId: string): Promise<boolean> {
    const entry = await this.prisma.sharingSelectedFriend.findUnique({
      where: { ownerId_friendId: { ownerId, friendId: viewerId } },
    });

    return entry !== null;
  }

  async isExceptFriend(ownerId: string, viewerId: string): Promise<boolean> {
    const entry = await this.prisma.sharingExceptFriend.findUnique({
      where: { ownerId_friendId: { ownerId, friendId: viewerId } },
    });

    return entry !== null;
  }

  private async getOrCreateSettings(userId: string) {
    return this.prisma.sharingSettings.upsert({
      where: { userId },
      update: {},
      create: { userId, mode: SharingMode.GHOST },
    });
  }

  private async buildResponse(
    userId: string,
    mode: SharingMode,
  ): Promise<SharingSettingsResponse> {
    const [selectedEntries, exceptEntries] = await Promise.all([
      this.prisma.sharingSelectedFriend.findMany({
        where: { ownerId: userId },
        include: { friend: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.sharingExceptFriend.findMany({
        where: { ownerId: userId },
        include: { friend: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      mode,
      selectedFriends: selectedEntries.map((entry) =>
        this.toUserSummary(entry.friend),
      ),
      exceptFriends: exceptEntries.map((entry) =>
        this.toUserSummary(entry.friend),
      ),
    };
  }

  private async assertConfirmedFriends(
    ownerId: string,
    friendIds: string[],
  ): Promise<void> {
    const uniqueFriendIds = [...new Set(friendIds)];

    if (uniqueFriendIds.includes(ownerId)) {
      throw new BadRequestException('You cannot include yourself in sharing lists');
    }

    for (const friendId of uniqueFriendIds) {
      const userExists = await this.prisma.user.findUnique({
        where: { id: friendId },
        select: { id: true },
      });

      if (!userExists) {
        throw new NotFoundException(`User ${friendId} not found`);
      }

      const areFriends = await this.friendshipsService.areFriends(
        ownerId,
        friendId,
      );

      if (!areFriends) {
        throw new BadRequestException(
          'All selected users must be confirmed friends',
        );
      }
    }
  }

  private toUserSummary(user: User): UserSummary {
    return {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
    };
  }
}
