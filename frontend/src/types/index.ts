export type SharingMode = 'GHOST' | 'EVERYONE' | 'SELECTED' | 'EXCEPT_SELECTED';

export type UserSummary = {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
};

export type FriendSummary = UserSummary & {
  friendshipId?: string;
};

export type FriendRequestSummary = {
  id: string;
  requester: UserSummary;
  addressee: UserSummary;
  createdAt: string;
};

export type FriendsResponse = {
  friends: FriendSummary[];
  incomingRequests: FriendRequestSummary[];
  outgoingRequests: FriendRequestSummary[];
};

export type SharingSettingsResponse = {
  mode: SharingMode;
  selectedFriends: FriendSummary[];
  exceptFriends: FriendSummary[];
};

export type CurrentLocationResponse = {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};

export type FriendLocation = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  firstSeenAt: number;
};

export type FriendMarkerState = FriendLocation & {
  stale: boolean;
  sharingMode: SharingMode | null;
};

export type LocationHistoryEntry = {
  id: string;
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
  createdAt: string;
};
