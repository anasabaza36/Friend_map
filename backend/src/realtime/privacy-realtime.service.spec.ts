import { Test, TestingModule } from '@nestjs/testing';
import { SharingMode } from '@prisma/client';
import { FriendshipsService } from '../friendships/friendships.service';
import { LocationRedisService } from '../locations/location-redis.service';
import { LocationVisibilityService } from '../location-visibility/location-visibility.service';
import { SharingService } from '../sharing/sharing.service';
import { PrivacyRealtimeService } from './privacy-realtime.service';
import { userRoom } from './constants/realtime.constants';
import { LocationGateway } from './location.gateway';
import {
  LocationHiddenPayload,
  SharingChangedPayload,
} from './types/realtime.types';

describe('PrivacyRealtimeService', () => {
  let service: PrivacyRealtimeService;
  let friendshipsService: jest.Mocked<
    Pick<FriendshipsService, 'getFriendIds'>
  >;
  let visibilityService: jest.Mocked<
    Pick<LocationVisibilityService, 'canViewerSeeOwner'>
  >;
  let sharingService: jest.Mocked<Pick<SharingService, never>>;
  let locationRedisService: jest.Mocked<
    Pick<LocationRedisService, 'deleteCurrentLocation'>
  >;

  type MockGateway = Pick<LocationGateway, 'emitToRoom'>;
  let mockGateway: { emitToRoom: jest.Mock };

  const aliceId = 'alice-1111-4111-8111-alicealice01';
  const bobId = 'bob-2222-4222-8222-bobbobbobb02';
  const charlieId = 'charlie-3333-4333-8333-charliecharlie03';

  beforeEach(async () => {
    friendshipsService = {
      getFriendIds: jest.fn(),
    };
    visibilityService = {
      canViewerSeeOwner: jest.fn(),
    };
    sharingService = {} as jest.Mocked<Pick<SharingService, never>>;
    locationRedisService = {
      deleteCurrentLocation: jest.fn().mockResolvedValue(undefined),
    };
    mockGateway = {
      emitToRoom: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyRealtimeService,
        { provide: FriendshipsService, useValue: friendshipsService },
        { provide: LocationVisibilityService, useValue: visibilityService },
        { provide: SharingService, useValue: sharingService },
        { provide: LocationRedisService, useValue: locationRedisService },
      ],
    }).compile();

    service = module.get(PrivacyRealtimeService);
    service.setGateway(mockGateway as unknown as MockGateway as LocationGateway);
  });

  describe('Scenario A (Everywhere → Everyone: Alice sends to Bob)', () => {
    it('sends sharing:changed but no location:hidden when Everyone allows friend', async () => {
      friendshipsService.getFriendIds.mockResolvedValue([bobId, charlieId]);
      visibilityService.canViewerSeeOwner
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      await service.notifySharingModeChanged(
        aliceId,
        SharingMode.GHOST,
        SharingMode.EVERYONE,
      );

      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        userRoom(bobId),
        'sharing:changed',
        { userId: aliceId, mode: SharingMode.EVERYONE } as SharingChangedPayload,
      );
      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        userRoom(charlieId),
        'sharing:changed',
        { userId: aliceId, mode: SharingMode.EVERYONE } as SharingChangedPayload,
      );
    });
  });

  describe('Scenario B (Everyone → Ghost: Bob stops receiving Alice)', () => {
    it('sends location:hidden to ALL friends and deletes Redis cache in GHOST mode', async () => {
      friendshipsService.getFriendIds.mockResolvedValue([bobId, charlieId]);
      visibilityService.canViewerSeeOwner
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      await service.notifySharingModeChanged(
        aliceId,
        SharingMode.EVERYONE,
        SharingMode.GHOST,
      );

      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        userRoom(bobId),
        'location:hidden',
        { userId: aliceId } as LocationHiddenPayload,
      );
      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        userRoom(charlieId),
        'location:hidden',
        { userId: aliceId } as LocationHiddenPayload,
      );
      expect(locationRedisService.deleteCurrentLocation).toHaveBeenCalledWith(
        aliceId,
      );
    });
  });

  describe('Scenario C (stranger Charlie): no privacy leakage', () => {
    it('stranger is never in the friends list and never receives events', async () => {
      friendshipsService.getFriendIds.mockResolvedValue([bobId]);
      visibilityService.canViewerSeeOwner.mockResolvedValue(true);

      await service.notifySharingModeChanged(
        aliceId,
        SharingMode.GHOST,
        SharingMode.EVERYONE,
      );

      expect(mockGateway.emitToRoom).not.toHaveBeenCalledWith(
        userRoom(charlieId),
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  describe('Scenario E (Everyone → Selected & removes Bob)', () => {
    it('sends location:hidden only to the disallowed friend Bob, sharing:changed to all', async () => {
      friendshipsService.getFriendIds.mockResolvedValue([bobId, charlieId]);
      visibilityService.canViewerSeeOwner
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await service.notifySharingListChanged(
        aliceId,
        SharingMode.SELECTED,
      );

      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        userRoom(bobId),
        'location:hidden',
        { userId: aliceId } as LocationHiddenPayload,
      );
      expect(mockGateway.emitToRoom).not.toHaveBeenCalledWith(
        userRoom(charlieId),
        'location:hidden',
        { userId: aliceId } as LocationHiddenPayload,
      );
      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        userRoom(charlieId),
        'sharing:changed',
        { userId: aliceId, mode: SharingMode.SELECTED } as SharingChangedPayload,
      );
    });
  });

  describe('EXCEPT_SELECTED mode changes', () => {
    it('sends location:hidden to friend who is in the except list', async () => {
      friendshipsService.getFriendIds.mockResolvedValue([bobId, charlieId]);
      visibilityService.canViewerSeeOwner
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await service.notifySharingListChanged(
        aliceId,
        SharingMode.EXCEPT_SELECTED,
      );

      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        userRoom(bobId),
        'location:hidden',
        { userId: aliceId } as LocationHiddenPayload,
      );
    });
  });
});
