import { Injectable } from '@nestjs/common';
import { SharingMode } from '@prisma/client';
import { FriendshipsService } from '../friendships/friendships.service';
import { LocationRedisService } from '../locations/location-redis.service';
import { LocationVisibilityService } from '../location-visibility/location-visibility.service';
import { SharingService } from '../sharing/sharing.service';
import {
  SOCKET_EVENT_LOCATION_HIDDEN,
  SOCKET_EVENT_SHARING_CHANGED,
  userRoom,
} from './constants/realtime.constants';
import { LocationGateway } from './location.gateway';
import {
  LocationHiddenPayload,
  SharingChangedPayload,
} from './types/realtime.types';

@Injectable()
export class PrivacyRealtimeService {
  private gateway: LocationGateway | null = null;

  constructor(
    private readonly friendshipsService: FriendshipsService,
    private readonly visibilityService: LocationVisibilityService,
    private readonly sharingService: SharingService,
    private readonly locationRedisService: LocationRedisService,
  ) {}

  setGateway(gateway: LocationGateway): void {
    this.gateway = gateway;
  }

  async notifySharingModeChanged(
    ownerId: string,
    oldMode: SharingMode | null,
    newMode: SharingMode,
  ): Promise<void> {
    const friendIds = await this.friendshipsService.getFriendIds(ownerId);
    const sharingPayload: SharingChangedPayload = {
      userId: ownerId,
      mode: newMode,
    };

    for (const friendId of friendIds) {
      this.emitToSocket(friendId, SOCKET_EVENT_SHARING_CHANGED, sharingPayload);
    }

    for (const friendId of friendIds) {
      const allowed = await this.visibilityService.canViewerSeeOwner(
        friendId,
        ownerId,
      );
      if (!allowed) {
        const hiddenPayload: LocationHiddenPayload = { userId: ownerId };
        this.emitToSocket(friendId, SOCKET_EVENT_LOCATION_HIDDEN, hiddenPayload);
      }
    }

    if (newMode === SharingMode.GHOST) {
      await this.locationRedisService.deleteCurrentLocation(ownerId);
    }

    void oldMode;
  }

  async notifySharingListChanged(
    ownerId: string,
    mode: SharingMode,
  ): Promise<void> {
    const friendIds = await this.friendshipsService.getFriendIds(ownerId);

    for (const friendId of friendIds) {
      const allowed = await this.visibilityService.canViewerSeeOwner(
        friendId,
        ownerId,
      );
      if (allowed) {
        const sharingPayload: SharingChangedPayload = {
          userId: ownerId,
          mode,
        };
        this.emitToSocket(friendId, SOCKET_EVENT_SHARING_CHANGED, sharingPayload);
      } else {
        const hiddenPayload: LocationHiddenPayload = { userId: ownerId };
        this.emitToSocket(friendId, SOCKET_EVENT_LOCATION_HIDDEN, hiddenPayload);
      }
    }
  }

  async sendHideToDisallowedViewers(ownerId: string): Promise<void> {
    const friendIds = await this.friendshipsService.getFriendIds(ownerId);
    for (const friendId of friendIds) {
      const allowed = await this.visibilityService.canViewerSeeOwner(
        friendId,
        ownerId,
      );
      if (!allowed) {
        const hiddenPayload: LocationHiddenPayload = { userId: ownerId };
        this.emitToSocket(friendId, SOCKET_EVENT_LOCATION_HIDDEN, hiddenPayload);
      }
    }
  }

  private emitToSocket(
    userId: string,
    event: string,
    payload: LocationHiddenPayload | SharingChangedPayload,
  ): void {
    if (this.gateway) {
      this.gateway.emitToRoom(userRoom(userId), event, payload);
    }
  }
}
