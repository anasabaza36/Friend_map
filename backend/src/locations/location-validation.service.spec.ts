import { LocationValidationService } from './location-validation.service';
import {
  LocationUpdateInput,
  LocationValidationFailure,
  StoredLocation,
} from './types/location.types';

describe('LocationValidationService', () => {
  let service: LocationValidationService;
  const now = new Date('2026-09-02T12:00:00.000Z');

  beforeEach(() => {
    service = new LocationValidationService();
  });

  const baseUpdate = (overrides: Partial<LocationUpdateInput> = {}): LocationUpdateInput => ({
    lat: 48.8566,
    lng: 2.3522,
    accuracy: 10,
    timestamp: now.getTime(),
    ...overrides,
  });

  const previousLocation = (overrides: Partial<StoredLocation> = {}): StoredLocation => ({
    lat: 48.8566,
    lng: 2.3522,
    accuracy: 10,
    timestamp: now.getTime() - 60_000,
    ...overrides,
  });

  it('accepts the first location when valid', () => {
    const result = service.validateUpdate(baseUpdate(), null, now);

    expect(result).toEqual({ valid: true });
  });

  it('accepts valid movement within speed limits', () => {
    const previous = previousLocation({
      lat: 48.8566,
      lng: 2.3522,
      timestamp: now.getTime() - 60_000,
    });

    const update = baseUpdate({
      lat: 48.9,
      lng: 2.4,
      timestamp: now.getTime(),
    });

    const result = service.validateUpdate(update, previous, now);

    expect(result).toEqual({ valid: true });
  });

  it('rejects impossible movement above 500 km/h', () => {
    const previous = previousLocation({
      lat: 48.8566,
      lng: 2.3522,
      timestamp: now.getTime() - 1_000,
    });

    const update = baseUpdate({
      lat: 40.7128,
      lng: -74.006,
      timestamp: now.getTime(),
    });

    const result = service.validateUpdate(update, previous, now);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(LocationValidationFailure.IMPOSSIBLE_MOVEMENT);
    }
  });

  it('rejects stale timestamps older than 5 minutes', () => {
    const update = baseUpdate({
      timestamp: now.getTime() - 6 * 60 * 1000,
    });

    const result = service.validateUpdate(update, null, now);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(LocationValidationFailure.STALE_TIMESTAMP);
    }
  });

  it('rejects out-of-order timestamps', () => {
    const previous = previousLocation({ timestamp: now.getTime() });

    const update = baseUpdate({
      timestamp: now.getTime() - 1_000,
    });

    const result = service.validateUpdate(update, previous, now);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(LocationValidationFailure.OUT_OF_ORDER);
    }
  });

  it('rejects invalid latitude', () => {
    const result = service.validateUpdate(baseUpdate({ lat: 91 }), null, now);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(LocationValidationFailure.INVALID_LATITUDE);
    }
  });

  it('rejects invalid longitude', () => {
    const result = service.validateUpdate(baseUpdate({ lng: 181 }), null, now);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(LocationValidationFailure.INVALID_LONGITUDE);
    }
  });

  it('rejects future timestamps beyond allowed clock skew', () => {
    const update = baseUpdate({
      timestamp: now.getTime() + 60_000,
    });

    const result = service.validateUpdate(update, null, now);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe(LocationValidationFailure.FUTURE_TIMESTAMP);
    }
  });

  it('normalizes ISO timestamp strings', () => {
    const normalized = service.normalizeTimestamp('2026-09-02T12:00:00.000Z');

    expect(normalized).toBe(now.getTime());
  });
});
