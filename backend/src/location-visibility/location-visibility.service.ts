import { Injectable } from '@nestjs/common';
import { SharingMode } from '@prisma/client';
import { FriendshipsService } from '../friendships/friendships.service';
import { SharingService } from '../sharing/sharing.service';

@Injectable()
export class LocationVisibilityService {
  constructor(
    private readonly friendshipsService: FriendshipsService,
    private readonly sharingService: SharingService,
  ) {}

  async canViewerSeeOwner(
    viewerId: string,
    ownerId: string,
  ): Promise<boolean> {
    if (viewerId === ownerId) {
      return false;
    }

    const areFriends = await this.friendshipsService.areFriends(
      viewerId,
      ownerId,
    );
    if (!areFriends) {
      return false;
    }

    const mode = await this.sharingService.getModeForUser(ownerId);

    switch (mode) {
      case SharingMode.GHOST:
        return false;
      case SharingMode.EVERYONE:
        return true;
      case SharingMode.SELECTED:
        return this.sharingService.isSelectedFriend(ownerId, viewerId);
      case SharingMode.EXCEPT_SELECTED:
        return this.isViewerAllowedInExceptMode(ownerId, viewerId);
      default:
        return false;
    }
  }

  private async isViewerAllowedInExceptMode(
    ownerId: string,
    viewerId: string,
  ): Promise<boolean> {
    const isBlocked = await this.sharingService.isExceptFriend(ownerId, viewerId);
    return !isBlocked;
  }
}
