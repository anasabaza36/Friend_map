import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  LOCATION_REDIS_TTL_SECONDS,
  locationRedisKey,
} from './constants/location.constants';
import { StoredLocation } from './types/location.types';

@Injectable()
export class LocationRedisService {
  constructor(private readonly redisService: RedisService) {}

  async getCurrentLocation(userId: string): Promise<StoredLocation | null> {
    const raw = await this.redisService.getClient().get(locationRedisKey(userId));

    if (!raw) {
      return null;
    }

    return this.parseStoredLocation(raw);
  }

  async setCurrentLocation(
    userId: string,
    location: StoredLocation,
  ): Promise<void> {
    const payload = JSON.stringify(location);

    await this.redisService
      .getClient()
      .set(locationRedisKey(userId), payload, 'EX', LOCATION_REDIS_TTL_SECONDS);
  }

  async deleteCurrentLocation(userId: string): Promise<void> {
    await this.redisService.getClient().del(locationRedisKey(userId));
  }

  private parseStoredLocation(raw: string): StoredLocation | null {
    try {
      const parsed: unknown = JSON.parse(raw);

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('lat' in parsed) ||
        !('lng' in parsed) ||
        !('accuracy' in parsed) ||
        !('timestamp' in parsed)
      ) {
        return null;
      }

      const record = parsed as Record<string, unknown>;

      if (
        typeof record.lat !== 'number' ||
        typeof record.lng !== 'number' ||
        typeof record.accuracy !== 'number' ||
        typeof record.timestamp !== 'number'
      ) {
        return null;
      }

      return {
        lat: record.lat,
        lng: record.lng,
        accuracy: record.accuracy,
        timestamp: record.timestamp,
      };
    } catch {
      return null;
    }
  }
}
