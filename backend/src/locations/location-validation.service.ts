import { Injectable } from '@nestjs/common';
import {
  MAX_CLOCK_SKEW_MS,
  MAX_GROUND_SPEED_KMH,
  MAX_LOCATION_AGE_MS,
} from './constants/location.constants';
import {
  LocationUpdateInput,
  LocationValidationFailure,
  LocationValidationResult,
  StoredLocation,
} from './types/location.types';
import {
  calculateSpeedKmh,
  haversineDistanceKm,
} from './utils/haversine.util';

@Injectable()
export class LocationValidationService {
  validateUpdate(
    update: LocationUpdateInput,
    previous: StoredLocation | null,
    now: Date = new Date(),
  ): LocationValidationResult {
    const coordinateResult = this.validateCoordinates(update);
    if (!coordinateResult.valid) {
      return coordinateResult;
    }

    const timestampResult = this.validateTimestamp(update.timestamp, now);
    if (!timestampResult.valid) {
      return timestampResult;
    }

    if (previous !== null) {
      const orderResult = this.validateOrder(update.timestamp, previous.timestamp);
      if (!orderResult.valid) {
        return orderResult;
      }

      const speedResult = this.validateSpeed(update, previous);
      if (!speedResult.valid) {
        return speedResult;
      }
    }

    return { valid: true };
  }

  normalizeTimestamp(timestamp: number | string): number {
    if (typeof timestamp === 'number') {
      return timestamp;
    }

    return Date.parse(timestamp);
  }

  toStoredLocation(update: LocationUpdateInput): StoredLocation {
    return {
      lat: update.lat,
      lng: update.lng,
      accuracy: update.accuracy,
      timestamp: update.timestamp,
    };
  }

  private validateCoordinates(update: LocationUpdateInput): LocationValidationResult {
    if (update.lat < -90 || update.lat > 90) {
      return {
        valid: false,
        reason: LocationValidationFailure.INVALID_LATITUDE,
        message: 'Latitude must be between -90 and 90',
      };
    }

    if (update.lng < -180 || update.lng > 180) {
      return {
        valid: false,
        reason: LocationValidationFailure.INVALID_LONGITUDE,
        message: 'Longitude must be between -180 and 180',
      };
    }

    if (update.accuracy < 0) {
      return {
        valid: false,
        reason: LocationValidationFailure.INVALID_ACCURACY,
        message: 'Accuracy must be greater than or equal to 0',
      };
    }

    return { valid: true };
  }

  private validateTimestamp(
    timestamp: number,
    now: Date,
  ): LocationValidationResult {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return {
        valid: false,
        reason: LocationValidationFailure.INVALID_TIMESTAMP,
        message: 'Timestamp must be a valid positive Unix time in milliseconds',
      };
    }

    const nowMs = now.getTime();
    const ageMs = nowMs - timestamp;

    if (ageMs > MAX_LOCATION_AGE_MS) {
      return {
        valid: false,
        reason: LocationValidationFailure.STALE_TIMESTAMP,
        message: `Location timestamp is older than ${MAX_LOCATION_AGE_MS / 1000} seconds`,
      };
    }

    if (timestamp > nowMs + MAX_CLOCK_SKEW_MS) {
      return {
        valid: false,
        reason: LocationValidationFailure.FUTURE_TIMESTAMP,
        message: `Location timestamp is more than ${MAX_CLOCK_SKEW_MS / 1000} seconds in the future`,
      };
    }

    return { valid: true };
  }

  private validateOrder(
    newTimestamp: number,
    previousTimestamp: number,
  ): LocationValidationResult {
    if (newTimestamp <= previousTimestamp) {
      return {
        valid: false,
        reason: LocationValidationFailure.OUT_OF_ORDER,
        message: 'Location timestamp must be strictly newer than the previous update',
      };
    }

    return { valid: true };
  }

  private validateSpeed(
    update: LocationUpdateInput,
    previous: StoredLocation,
  ): LocationValidationResult {
    const elapsedMs = update.timestamp - previous.timestamp;
    const distanceKm = haversineDistanceKm(
      previous.lat,
      previous.lng,
      update.lat,
      update.lng,
    );
    const speedKmh = calculateSpeedKmh(distanceKm, elapsedMs);

    if (speedKmh > MAX_GROUND_SPEED_KMH) {
      return {
        valid: false,
        reason: LocationValidationFailure.IMPOSSIBLE_MOVEMENT,
        message: `Implied speed ${speedKmh.toFixed(1)} km/h exceeds maximum of ${MAX_GROUND_SPEED_KMH} km/h`,
      };
    }

    return { valid: true };
  }
}
