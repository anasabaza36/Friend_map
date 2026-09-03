import { api } from '@/services/auth';
import type {
  CurrentLocationResponse,
  LocationHistoryEntry,
} from '@/types';

export type LocationUpdatePayload = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};

export async function publishMyLocation(
  payload: LocationUpdatePayload,
): Promise<CurrentLocationResponse> {
  const { data } = await api.post<CurrentLocationResponse>(
    '/locations',
    payload,
  );
  return data;
}

export async function getMyCurrentLocation(): Promise<CurrentLocationResponse | null> {
  try {
    const { data } = await api.get<CurrentLocationResponse>('/locations/me');
    return data;
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'response' in err
    ) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      if (status === 404) {
        return null;
      }
    }
    throw err;
  }
}

export async function getFriendCurrentLocation(
  userId: string,
): Promise<CurrentLocationResponse | null> {
  try {
    const { data } = await api.get<CurrentLocationResponse>(
      `/locations/users/${userId}`,
    );
    return data;
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'response' in err
    ) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      if (status === 404 || status === 403 || status === 401) {
        return null;
      }
    }
    throw err;
  }
}

export async function getMyLocationHistory(): Promise<LocationHistoryEntry[]> {
  const { data } = await api.get<LocationHistoryEntry[]>(
    '/locations/history',
  );
  return data;
}
