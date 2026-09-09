import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LocationVisibilityService } from '../location-visibility/location-visibility.service';
import { LocationHistoryService } from './location-history.service';
import { LocationRateLimitService } from './location-rate-limit.service';
import { LocationRedisService } from './location-redis.service';
import { LocationValidationService } from './location-validation.service';
import { LocationsService } from './locations.service';
import { StoredLocation } from './types/location.types';

describe('LocationsService authorization', () => {
  let service: LocationsService;

  const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const viewerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const strangerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const storedLocation: StoredLocation = {
    lat: 48.8566,
    lng: 2.3522,
    accuracy: 10,
    timestamp: Date.now(),
  };

  const validationService = {
    normalizeTimestamp: jest.fn((value: number | string) =>
      typeof value === 'number' ? value : Date.parse(value),
    ),
    validateUpdate: jest.fn(() => ({ valid: true as const })),
    toStoredLocation: jest.fn((update: StoredLocation) => update),
  };

  const redisService = {
    getCurrentLocation: jest.fn(),
    setCurrentLocation: jest.fn(),
  };

  const rateLimitService = {
    assertWithinLimit: jest.fn(),
  };

  const historyService = {
    saveEntry: jest.fn(),
    getOwnHistory: jest.fn(),
  };

  const visibilityService = {
    canViewerSeeOwner: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: LocationValidationService, useValue: validationService },
        { provide: LocationRedisService, useValue: redisService },
        { provide: LocationRateLimitService, useValue: rateLimitService },
        { provide: LocationHistoryService, useValue: historyService },
        { provide: LocationVisibilityService, useValue: visibilityService },
      ],
    }).compile();

    service = module.get(LocationsService);
  });

  describe('getFriendCurrentLocation', () => {
    it('denies access when visibility rules fail', async () => {
      visibilityService.canViewerSeeOwner.mockResolvedValue(false);

      await expect(
        service.getFriendCurrentLocation(strangerId, ownerId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows access when visibility rules pass', async () => {
      visibilityService.canViewerSeeOwner.mockResolvedValue(true);
      redisService.getCurrentLocation.mockResolvedValue(storedLocation);

      const result = await service.getFriendCurrentLocation(viewerId, ownerId);

      expect(result).toEqual({ ...storedLocation, userId: ownerId });
      expect(visibilityService.canViewerSeeOwner).toHaveBeenCalledWith(
        viewerId,
        ownerId,
      );
    });

    it('returns not found when owner has no current location', async () => {
      visibilityService.canViewerSeeOwner.mockResolvedValue(true);
      redisService.getCurrentLocation.mockResolvedValue(null);

      await expect(
        service.getFriendCurrentLocation(viewerId, ownerId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getOwnHistory', () => {
    it('returns only the authenticated user history via service boundary', async () => {
      historyService.getOwnHistory.mockResolvedValue([
        {
          id: 'history-id',
          ...storedLocation,
          recordedAt: new Date(),
        },
      ]);

      const result = await service.getOwnHistory(ownerId);

      expect(result).toHaveLength(1);
      expect(historyService.getOwnHistory).toHaveBeenCalledWith(ownerId);
      expect(historyService.getOwnHistory).not.toHaveBeenCalledWith(viewerId);
    });
  });
});
