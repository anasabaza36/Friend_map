import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  STOP_VIEWING_TTL_SECONDS,
  stopViewingRedisKey,
} from './constants/realtime.constants';

@Injectable()
export class StopViewingService {
  constructor(private readonly redisService: RedisService) {}

  private stopViewingLocalState: Map<string, Set<string>> = new Map();

  async startViewing(viewerId: string, ownerId: string): Promise<void> {
    this.removeFromLocalState(viewerId, ownerId);
    const set = await this.redisService
      .getClient()
      .srem(stopViewingRedisKey(viewerId), ownerId);
    void set;
  }

  async stopViewing(viewerId: string, ownerId: string): Promise<void> {
    this.addToLocalState(viewerId, ownerId);
    const pipeline = this.redisService.getClient().pipeline();
    pipeline.sadd(stopViewingRedisKey(viewerId), ownerId);
    pipeline.expire(stopViewingRedisKey(viewerId), STOP_VIEWING_TTL_SECONDS);
    await pipeline.exec();
  }

  async isViewingStopped(viewerId: string, ownerId: string): Promise<boolean> {
    const localSet = this.stopViewingLocalState.get(viewerId);
    if (localSet?.has(ownerId)) {
      return true;
    }
    const count = await this.redisService
      .getClient()
      .sismember(stopViewingRedisKey(viewerId), ownerId);
    return count > 0;
  }

  async clearAllForSession(viewerSocketId: string, viewerId: string): Promise<void> {
    void viewerSocketId;
    this.stopViewingLocalState.delete(viewerId);
    await this.redisService.getClient().del(stopViewingRedisKey(viewerId));
  }

  private addToLocalState(viewerId: string, ownerId: string): void {
    let set = this.stopViewingLocalState.get(viewerId);
    if (!set) {
      set = new Set();
      this.stopViewingLocalState.set(viewerId, set);
    }
    set.add(ownerId);
  }

  private removeFromLocalState(viewerId: string, ownerId: string): void {
    const set = this.stopViewingLocalState.get(viewerId);
    if (set) {
      set.delete(ownerId);
      if (set.size === 0) {
        this.stopViewingLocalState.delete(viewerId);
      }
    }
  }
}
