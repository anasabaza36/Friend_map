import { api } from '@/services/auth';
import type { FriendsResponse, UserSummary } from '@/types';

export async function getFriends(): Promise<FriendsResponse> {
  const { data } = await api.get<FriendsResponse>('/friends');
  return data;
}

export async function searchUsers(query: string): Promise<UserSummary[]> {
  const { data } = await api.get<UserSummary[]>('/users/search', {
    params: { q: query },
  });
  return data;
}

export async function sendFriendRequest(
  recipient: string,
): Promise<{ requestId: string; id: string }> {
  const { data } = await api.post<{ requestId: string; id: string }>(
    '/friends/requests',
    { recipient },
  );
  return data;
}

export async function acceptFriendRequest(
  requestId: string,
): Promise<{ friendshipId: string }> {
  const { data } = await api.post<{ friendshipId: string; id: string }>(
    `/friends/requests/${requestId}/accept`,
  );
  return { friendshipId: data.friendshipId ?? data.id };
}

export async function rejectFriendRequest(
  requestId: string,
): Promise<void> {
  await api.post(`/friends/requests/${requestId}/reject`);
}

export async function removeFriend(friendId: string): Promise<void> {
  await api.delete(`/friends/${friendId}`);
}
