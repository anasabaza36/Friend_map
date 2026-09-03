import { Test, TestingModule } from '@nestjs/testing';
import { StopViewingService } from './stop-viewing.service';
import { RedisService } from '../redis/redis.service';

describe('StopViewingService', () => {
  let service: StopViewingService;

  const viewerId = 'viewer-1111-4111-8111-viewerviewer01';
  const ownerId1 = 'owner-2222-4222-8222-ownerownerowner02';
  const ownerId2 = 'owner-3333-4333-8333-ownerownerowner03';

  const sets = new Map<string, Set<string>>();

  type MockRedisClient = {
    sadd: jest.Mock;
    srem: jest.Mock;
    sismember: jest.Mock;
    del: jest.Mock;
    expire: jest.Mock;
    pipeline: jest.Mock;
    exec: jest.Mock;
  };

  const redisClient: MockRedisClient = {
    sadd: jest.fn(async (key: string, value: string) => {
      let set = sets.get(key);
      if (!set) {
        set = new Set();
        sets.set(key, set);
      }
      set.add(value);
      return 1;
    }),
    srem: jest.fn(async (key: string, value: string) => {
      const set = sets.get(key);
      if (set?.has(value)) {
        set.delete(value);
        return 1;
      }
      return 0;
    }),
    sismember: jest.fn(async (key: string, value: string) => {
      return sets.get(key)?.has(value) ? 1 : 0;
    }),
    del: jest.fn(async (key: string) => {
      sets.delete(key);
      return 1;
    }),
    expire: jest.fn(),
    pipeline: jest.fn((): MockRedisClient => redisClient),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    sets.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StopViewingService,
        {
          provide: RedisService,
          useValue: { getClient: () => redisClient },
        },
      ],
    }).compile();

    service = module.get(StopViewingService);
  });

  it('returns false when not stopped, true after stopViewing', async () => {
    expect(await service.isViewingStopped(viewerId, ownerId1)).toBe(false);
    await service.stopViewing(viewerId, ownerId1);
    expect(await service.isViewingStopped(viewerId, ownerId1)).toBe(true);
    expect(await service.isViewingStopped(viewerId, ownerId2)).toBe(false);
  });

  it('startViewing removes the owner from the stop list', async () => {
    await service.stopViewing(viewerId, ownerId1);
    expect(await service.isViewingStopped(viewerId, ownerId1)).toBe(true);
    await service.startViewing(viewerId, ownerId1);
    expect(await service.isViewingStopped(viewerId, ownerId1)).toBe(false);
  });

  it('clearAllForSession wipes all session-level stop records', async () => {
    await service.stopViewing(viewerId, ownerId1);
    await service.stopViewing(viewerId, ownerId2);
    await service.clearAllForSession('socket-xyz', viewerId);
    expect(await service.isViewingStopped(viewerId, ownerId1)).toBe(false);
    expect(await service.isViewingStopped(viewerId, ownerId2)).toBe(false);
  });
});
