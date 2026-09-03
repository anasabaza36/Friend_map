import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis/redis.service';
import {
  RATE_LIMIT_MAX_UPDATES,
  locationRateLimitKey,
} from './constants/location.constants';
import { LocationRateLimitService } from './location-rate-limit.service';

describe('LocationRateLimitService', () => {
  let service: LocationRateLimitService;

  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let counter = 0;

  const redisClient = {
    incr: jest.fn(async () => {
      counter += 1;
      return counter;
    }),
    expire: jest.fn(async () => 1),
  };

  beforeEach(async () => {
    counter = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationRateLimitService,
        {
          provide: RedisService,
          useValue: {
            getClient: () => redisClient,
          },
        },
      ],
    }).compile();

    service = module.get(LocationRateLimitService);
  });

  it('allows updates within the configured limit', async () => {
    for (let index = 0; index < RATE_LIMIT_MAX_UPDATES; index += 1) {
      await expect(service.assertWithinLimit(userId)).resolves.toBeUndefined();
    }

    expect(redisClient.incr).toHaveBeenCalledWith(locationRateLimitKey(userId));
    expect(redisClient.expire).toHaveBeenCalled();
  });

  it('rejects updates above the configured limit with HTTP 429', async () => {
    for (let index = 0; index < RATE_LIMIT_MAX_UPDATES; index += 1) {
      await service.assertWithinLimit(userId);
    }

    let caughtError: unknown;
    try {
      await service.assertWithinLimit(userId);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(HttpException);
    if (caughtError instanceof HttpException) {
      expect(caughtError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });
});
