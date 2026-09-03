import { Test, TestingModule } from '@nestjs/testing';
import { PresenceService } from './presence.service';
import { RedisService } from '../redis/redis.service';
import {
  PRESENCE_TTL_SECONDS,
  presenceRedisKey,
} from './constants/realtime.constants';

describe('PresenceService', () => {
  let service: PresenceService;

  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const store = new Map<string, string>();
  const ttlStore = new Map<string, number>();

  type MockRedisClient = {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    exists: jest.Mock;
    expire: jest.Mock;
    pipeline: jest.Mock;
    exec: jest.Mock;
  };

  const redisClient: MockRedisClient = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(
      (
        key: string,
        value: string,
        mode?: string,
        ttl?: number,
      ): Promise<string> => {
        store.set(key, value);
        if (mode === 'EX' && ttl !== undefined) {
          ttlStore.set(key, ttl);
        }
        return Promise.resolve('OK');
      },
    ),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      ttlStore.delete(key);
      return 1;
    }),
    exists: jest.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    expire: jest.fn(async (key: string, ttl: number) => {
      if (store.has(key)) {
        ttlStore.set(key, ttl);
        return 1;
      }
      return 0;
    }),
    pipeline: jest.fn((): MockRedisClient => redisClient),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    store.clear();
    ttlStore.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceService,
        {
          provide: RedisService,
          useValue: { getClient: () => redisClient },
        },
      ],
    }).compile();

    service = module.get(PresenceService);
  });

  it('marks user online with 60s TTL', async () => {
    await service.markOnline(userId);
    expect(redisClient.set).toHaveBeenCalledWith(
      presenceRedisKey(userId),
      expect.stringContaining('"online":true'),
      'EX',
      PRESENCE_TTL_SECONDS,
    );
    expect(await service.isOnline(userId)).toBe(true);
  });

  it('marks user offline by deleting the key', async () => {
    await service.markOnline(userId);
    await service.markOffline(userId);
    expect(await service.isOnline(userId)).toBe(false);
  });

  it('heartbeat refreshes TTL when key exists', async () => {
    await service.markOnline(userId);
    ttlStore.set(presenceRedisKey(userId), 10);
    await service.heartbeat(userId);
    expect(redisClient.expire).toHaveBeenCalledWith(
      presenceRedisKey(userId),
      PRESENCE_TTL_SECONDS,
    );
  });

  it('getPresence returns offline state when empty/corrupt', async () => {
    const state = await service.getPresence(userId);
    expect(state.online).toBe(false);
  });
});
