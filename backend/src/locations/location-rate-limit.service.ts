import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  locationRateLimitKey,
  RATE_LIMIT_MAX_UPDATES,
  RATE_LIMIT_WINDOW_SECONDS,
} from './constants/location.constants';

@Injectable()
export class LocationRateLimitService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Allows up to 12 location updates per 60-second window per user.
   * Normal client cadence is one update every 5–15 seconds (~4–12/min).
   */
  async assertWithinLimit(userId: string): Promise<void> {
    const key = locationRateLimitKey(userId);
    const client = this.redisService.getClient();

    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > RATE_LIMIT_MAX_UPDATES) {
      throw new HttpException(
        {
          status: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Location update rate limit exceeded (${RATE_LIMIT_MAX_UPDATES} updates per ${RATE_LIMIT_WINDOW_SECONDS} seconds)`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
