import { UserSummary } from '../../common/types/user-summary.type';

/** Minimal user info for friend request responses (no email). */
export type FriendRequestResponse = {
  id: string;
  user: UserSummary;
  createdAt: Date;
};

export type FriendRequestSummary = {
  id: string;
  requester: UserSummary;
  addressee: UserSummary;
  createdAt: string;
};

export type FriendsResponse = {
  friends: UserSummary[];
  incomingRequests: FriendRequestSummary[];
  outgoingRequests: FriendRequestSummary[];
};

export type FriendRequestActionResponse = {
  id: string;
  status: 'ACCEPTED' | 'REJECTED';
};

export type RemoveFriendResponse = {
  removed: true;
  userId: string;
};
