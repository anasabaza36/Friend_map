import { api } from '@/services/auth';
import type { SharingMode, SharingSettingsResponse } from '@/types';

export async function getSharingSettings(): Promise<SharingSettingsResponse> {
  const { data } = await api.get<SharingSettingsResponse>('/sharing-settings');
  return data;
}

export async function updateSharingMode(
  mode: SharingMode,
): Promise<SharingSettingsResponse> {
  const { data } = await api.put<SharingSettingsResponse>('/sharing-settings', {
    mode,
  });
  return data;
}

export async function setSelectedFriends(
  friendIds: string[],
): Promise<SharingSettingsResponse> {
  const { data } = await api.put<SharingSettingsResponse>(
    '/sharing-settings/selected',
    { friendIds },
  );
  return data;
}

export async function setExceptFriends(
  friendIds: string[],
): Promise<SharingSettingsResponse> {
  const { data } = await api.put<SharingSettingsResponse>(
    '/sharing-settings/except',
    { friendIds },
  );
  return data;
}
