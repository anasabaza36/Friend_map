import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  PRESENCE_TTL_SECONDS,
  presenceRedisKey,
} from './constants/realtime.constants';

export type PresenceState = {
  online: boolean;
  lastSeen: number;
};

@Injectable()
export class PresenceService {
  constructor(private readonly redisService: RedisService) {}

  async markOnline(userId: string): Promise<void> {
    const payload: PresenceState = {
      online: true,
      lastSeen: Date.now(),
    };
    await this.redisService
      .getClient()
      .set(
        presenceRedisKey(userId),
        JSON.stringify(payload),
        'EX',
        PRESENCE_TTL_SECONDS,
      );
  }

  async markOffline(userId: string): Promise<void> {
    await this.redisService.getClient().del(presenceRedisKey(userId));
  }

  async heartbeat(userId: string): Promise<void> {
    const key = presenceRedisKey(userId);
    const existing = await this.redisService.getClient().get(key);
    if (existing) {
      await this.redisService
        .getClient()
        .expire(key, PRESENCE_TTL_SECONDS);
    } else {
      await this.markOnline(userId);
    }
  }

  async getPresence(userId: string): Promise<PresenceState> {
    const raw = await this.redisService.getClient().get(presenceRedisKey(userId));
    if (!raw) {
      return { online: false, lastSeen: 0 };
    }
    try {
      const parsed = JSON.parse(raw) as { online?: boolean; lastSeen?: number };
      return {
        online: parsed.online === true,
        lastSeen: typeof parsed.lastSeen === 'number' ? parsed.lastSeen : 0,
      };
    } catch {
      return { online: false, lastSeen: 0 };
    }
  }

  async isOnline(userId: string): Promise<boolean> {
    const raw = await this.redisService.getClient().exists(presenceRedisKey(userId));
    return raw > 0;
  }
}
