import { io, Socket } from 'socket.io-client';
import { getStoredToken, clearStoredToken } from '@/services/auth';
import type { CurrentLocationResponse, SharingMode } from '@/types';

const LOCATION_UPDATED_EVENT = 'location:updated';
const LOCATION_HIDDEN_EVENT = 'location:hidden';
const SHARING_CHANGED_EVENT = 'sharing:changed';
const LOCATION_UPDATE_EVENT = 'location:update';
const STOP_VIEWING_EVENT = 'viewing:stop';
const START_VIEWING_EVENT = 'viewing:start';
const ERROR_EVENT = 'error';

const FRIEND_REQUEST_EVENT = 'friend:request';
const FRIEND_ACCEPTED_EVENT = 'friend:accepted';
const FRIEND_REMOVED_EVENT = 'friend:removed';

export type LocationUpdatedPayload = {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};

export type LocationHiddenPayload = {
  userId: string;
};

export type SharingChangedPayload = {
  userId: string;
  mode: SharingMode;
};

export type SocketErrorPayload = {
  code: string;
  message: string;
};

export type FriendRequestPayload = {
  requestId: string;
  senderId: string;
  senderUsername: string;
};

export type FriendAcceptedPayload = {
  requestId: string;
  acceptorId: string;
  acceptorUsername: string;
};

export type FriendRemovedPayload = {
  removedByUserId: string;
  removedByUsername: string;
};

type ListenerKey =
  | typeof LOCATION_UPDATED_EVENT
  | typeof LOCATION_HIDDEN_EVENT
  | typeof SHARING_CHANGED_EVENT
  | typeof ERROR_EVENT
  | typeof FRIEND_REQUEST_EVENT
  | typeof FRIEND_ACCEPTED_EVENT
  | typeof FRIEND_REMOVED_EVENT;

type ListenerMap = {
  [LOCATION_UPDATED_EVENT]: (p: LocationUpdatedPayload) => void;
  [LOCATION_HIDDEN_EVENT]: (p: LocationHiddenPayload) => void;
  [SHARING_CHANGED_EVENT]: (p: SharingChangedPayload) => void;
  [ERROR_EVENT]: (p: SocketErrorPayload) => void;
  [FRIEND_REQUEST_EVENT]: (p: FriendRequestPayload) => void;
  [FRIEND_ACCEPTED_EVENT]: (p: FriendAcceptedPayload) => void;
  [FRIEND_REMOVED_EVENT]: (p: FriendRemovedPayload) => void;
};

type ConnectionListener = (status: 'connected' | 'disconnected' | 'connect_error') => void;

class LocationSocketService {
  private socket: Socket | null = null;
  private listeners: Map<ListenerKey, Set<ListenerMap[ListenerKey]>> =
    new Map();
  private connectionListeners: Set<ConnectionListener> = new Set();
  private reconnecting = false;

  ensureConnected(): Socket | null {
    if (this.socket) {
      if (this.socket.disconnected) {
        this.socket.connect();
      }
      return this.socket;
    }
    const token = getStoredToken();
    if (!token) {
      return null;
    }

    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
    const socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', () => {
      this.reconnecting = false;
      this.notifyConnection('connected');
    });

    socket.on('disconnect', () => {
      this.notifyConnection('disconnected');
    });

    socket.on('connect_error', () => {
      if (!this.reconnecting) {
        this.notifyConnection('connect_error');
      }
      this.reconnecting = true;
    });

    socket.on(LOCATION_UPDATED_EVENT, (payload) => {
      this.emit(LOCATION_UPDATED_EVENT, payload as LocationUpdatedPayload);
    });

    socket.on(LOCATION_HIDDEN_EVENT, (payload) => {
      this.emit(LOCATION_HIDDEN_EVENT, payload as LocationHiddenPayload);
    });

    socket.on(SHARING_CHANGED_EVENT, (payload) => {
      this.emit(SHARING_CHANGED_EVENT, payload as SharingChangedPayload);
    });

    socket.on(FRIEND_REQUEST_EVENT, (payload) => {
      this.emit(FRIEND_REQUEST_EVENT, payload as FriendRequestPayload);
    });

    socket.on(FRIEND_ACCEPTED_EVENT, (payload) => {
      this.emit(FRIEND_ACCEPTED_EVENT, payload as FriendAcceptedPayload);
    });

    socket.on(FRIEND_REMOVED_EVENT, (payload) => {
      this.emit(FRIEND_REMOVED_EVENT, payload as FriendRemovedPayload);
    });

    socket.on(ERROR_EVENT, (payload) => {
      this.emit(ERROR_EVENT, payload as SocketErrorPayload);
      if (
        payload &&
        typeof payload === 'object' &&
        'code' in payload &&
        (payload.code === 'INVALID_TOKEN' ||
          payload.code === 'USER_NOT_FOUND' ||
          payload.code === 'AUTH_TOKEN_MISSING')
      ) {
        clearStoredToken();
      }
    });

    this.socket = socket;
    return socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
    this.connectionListeners.clear();
  }

  sendLocationUpdate(location: CurrentLocationResponse): void {
    const socket = this.ensureConnected();
    if (!socket) return;
    socket.emit(LOCATION_UPDATE_EVENT, {
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
    });
  }

  stopViewing(ownerId: string): void {
    const socket = this.ensureConnected();
    if (!socket) return;
    socket.emit(STOP_VIEWING_EVENT, { ownerId });
  }

  startViewing(ownerId: string): void {
    const socket = this.ensureConnected();
    if (!socket) return;
    socket.emit(START_VIEWING_EVENT, { ownerId });
  }

  on<K extends ListenerKey>(
    event: K,
    listener: ListenerMap[K],
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as never);
    return () => {
      this.listeners.get(event)?.delete(listener as never);
    };
  }

  onConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  private emit<K extends ListenerKey>(
    event: K,
    payload: Parameters<ListenerMap[K]>[0],
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of Array.from(set)) {
      try {
        (listener as (arg0: typeof payload) => void)(payload);
      } catch (err) {
        console.error('Socket listener error', err);
      }
    }
  }

  private notifyConnection(status: 'connected' | 'disconnected' | 'connect_error'): void {
    for (const listener of Array.from(this.connectionListeners)) {
      try {
        listener(status);
      } catch (err) {
        console.error('Connection listener error', err);
      }
    }
  }
}

export const socketService = new LocationSocketService();
