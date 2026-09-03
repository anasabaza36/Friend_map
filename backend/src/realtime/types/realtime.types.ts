import { AuthenticatedUser } from '../../common/types';

export type AuthenticatedSocket = {
  user: AuthenticatedUser;
  data: {
    user: AuthenticatedUser;
  };
} & {
  id: string;
  handshake: {
    auth: { token?: string };
    query: { token?: string };
    headers: Record<string, string | string[] | undefined>;
  };
  join(room: string): void;
  leave(room: string): void;
  emit(event: string, ...args: unknown[]): void;
  disconnect(close?: boolean): void;
  to(room: string): { emit(event: string, ...args: unknown[]): void };
  rooms: Set<string>;
};

export type LocationBroadcastPayload = {
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
  mode: string;
};

export type PresenceUpdatedPayload = {
  userId: string;
  online: boolean;
};

export type SocketErrorPayload = {
  code: string;
  message: string;
};
