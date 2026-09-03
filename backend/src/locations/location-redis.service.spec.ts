import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis/redis.service';
import {
  LOCATION_REDIS_TTL_SECONDS,
  locationRedisKey,
} from './constants/location.constants';
import { LocationRedisService } from './location-redis.service';
import { StoredLocation } from './types/location.types';

describe('LocationRedisService', () => {
  let service: LocationRedisService;

  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const location: StoredLocation = {
    lat: 48.8566,
    lng: 2.3522,
    accuracy: 12,
    timestamp: 1_756_812_000_000,
  };

  const redisStore = new Map<string, string>();
  const ttlStore = new Map<string, number>();

  const redisClient = {
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    set: jest.fn(
      async (key: string, value: string, mode: string, ttl: number) => {
        if (mode === 'EX') {
          redisStore.set(key, value);
          ttlStore.set(key, ttl);
        }
      },
    ),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key);
      ttlStore.delete(key);
    }),
  };

  beforeEach(async () => {
    redisStore.clear();
    ttlStore.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationRedisService,
        {
          provide: RedisService,
          useValue: {
            getClient: () => redisClient,
          },
        },
      ],
    }).compile();

    service = module.get(LocationRedisService);
  });

  it('returns null when no location is stored', async () => {
    const result = await service.getCurrentLocation(userId);

    expect(result).toBeNull();
  });

  it('stores and retrieves current location with 24h TTL', async () => {
    await service.setCurrentLocation(userId, location);

    expect(redisClient.set).toHaveBeenCalledWith(
      locationRedisKey(userId),
      JSON.stringify(location),
      'EX',
      LOCATION_REDIS_TTL_SECONDS,
    );

    const result = await service.getCurrentLocation(userId);
    expect(result).toEqual(location);
    expect(ttlStore.get(locationRedisKey(userId))).toBe(
      LOCATION_REDIS_TTL_SECONDS,
    );
  });

  it('deletes current location', async () => {
    await service.setCurrentLocation(userId, location);
    await service.deleteCurrentLocation(userId);

    const result = await service.getCurrentLocation(userId);
    expect(result).toBeNull();
  });
});
