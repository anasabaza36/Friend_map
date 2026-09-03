export type StoredLocation = {
  lat: number;
  lng: number;
  accuracy: number;
  /** Unix timestamp in milliseconds (client-reported GPS time). */
  timestamp: number;
};

export type LocationUpdateInput = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};

export enum LocationValidationFailure {
  INVALID_LATITUDE = 'INVALID_LATITUDE',
  INVALID_LONGITUDE = 'INVALID_LONGITUDE',
  INVALID_ACCURACY = 'INVALID_ACCURACY',
  INVALID_TIMESTAMP = 'INVALID_TIMESTAMP',
  STALE_TIMESTAMP = 'STALE_TIMESTAMP',
  FUTURE_TIMESTAMP = 'FUTURE_TIMESTAMP',
  OUT_OF_ORDER = 'OUT_OF_ORDER',
  IMPOSSIBLE_MOVEMENT = 'IMPOSSIBLE_MOVEMENT',
}

export type LocationValidationResult =
  | { valid: true }
  | { valid: false; reason: LocationValidationFailure; message: string };

export type LocationResponse = StoredLocation & {
  userId: string;
};

export type LocationHistoryEntry = {
  id: string;
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
  createdAt: string;
};
