/**
 * Location ingestion thresholds (documented for operators and tests).
 *
 * MAX_LOCATION_AGE_MS — reject GPS points older than 5 minutes.
 * MAX_CLOCK_SKEW_MS   — allow up to 30 seconds of client clock drift into the future.
 * MAX_GROUND_SPEED_KMH — reject implied speeds above 500 km/h (impossible ground travel).
 * LOCATION_REDIS_TTL_SECONDS — hot state expires after 24 hours.
 * LOCATION_HISTORY_RETENTION_MS — PostgreSQL history retained for 24 hours.
 * RATE_LIMIT_MAX_UPDATES — maximum location publishes per window.
 * RATE_LIMIT_WINDOW_SECONDS — sliding counter window for rate limiting.
 */
export const MAX_LOCATION_AGE_MS = 5 * 60 * 1000;
export const MAX_CLOCK_SKEW_MS = 30 * 1000;
export const MAX_GROUND_SPEED_KMH = 500;
export const LOCATION_REDIS_TTL_SECONDS = 24 * 60 * 60;
export const LOCATION_HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;
export const RATE_LIMIT_MAX_UPDATES = 12;
export const RATE_LIMIT_WINDOW_SECONDS = 60;

export const LOCATION_REDIS_KEY_PREFIX = 'location:';
export const LOCATION_RATE_LIMIT_KEY_PREFIX = 'location:ratelimit:';

export function locationRedisKey(userId: string): string {
  return `${LOCATION_REDIS_KEY_PREFIX}${userId}`;
}

export function locationRateLimitKey(userId: string): string {
  return `${LOCATION_RATE_LIMIT_KEY_PREFIX}${userId}`;
}
