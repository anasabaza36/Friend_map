export const PRESENCE_REDIS_KEY_PREFIX = 'presence:';
export const PRESENCE_TTL_SECONDS = 60;
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000;

export const STOP_VIEWING_REDIS_KEY_PREFIX = 'stop-viewing:';
export const STOP_VIEWING_TTL_SECONDS = 24 * 60 * 60;

export const USER_ROOM_PREFIX = 'user:';

export const SOCKET_EVENT_LOCATION_UPDATE = 'location:update';
export const SOCKET_EVENT_LOCATION_UPDATED = 'location:updated';
export const SOCKET_EVENT_LOCATION_HIDDEN = 'location:hidden';
export const SOCKET_EVENT_SHARING_CHANGED = 'sharing:changed';
export const SOCKET_EVENT_STOP_VIEWING = 'viewing:stop';
export const SOCKET_EVENT_START_VIEWING = 'viewing:start';
export const SOCKET_EVENT_PRESENCE_UPDATED = 'presence:updated';
export const SOCKET_EVENT_ERROR = 'error';

export const SOCKET_EVENT_FRIEND_REQUEST = 'friend:request';
export const SOCKET_EVENT_FRIEND_ACCEPTED = 'friend:accepted';
export const SOCKET_EVENT_FRIEND_REMOVED = 'friend:removed';

export function userRoom(userId: string): string {
  return `${USER_ROOM_PREFIX}${userId}`;
}

export function presenceRedisKey(userId: string): string {
  return `${PRESENCE_REDIS_KEY_PREFIX}${userId}`;
}

export function stopViewingRedisKey(viewerId: string): string {
  return `${STOP_VIEWING_REDIS_KEY_PREFIX}${viewerId}`;
}
