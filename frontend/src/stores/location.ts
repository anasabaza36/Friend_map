import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { FriendMarkerState, SharingMode } from '@/types';
import type {
  LocationHiddenPayload,
  LocationUpdatedPayload,
  SharingChangedPayload,
} from '@/services/socket';
import { socketService } from '@/services/socket';

const STALE_THRESHOLD_MS = 60_000;
const STALE_POLL_INTERVAL_MS = 5_000;

export type ConnectionStatus =
  | 'idle'
  | 'connected'
  | 'disconnected'
  | 'connect_error';

export const useLocationStore = defineStore('location', () => {
  const markers = ref<Map<string, FriendMarkerState>>(new Map());
  const socketStatus = ref<ConnectionStatus>('idle');
  const initialLoading = ref(false);
  const lastTickMs = ref<number>(Date.now());

  let staleTimer: number | null = null;
  let locationUpdatedOff: (() => void) | null = null;
  let locationHiddenOff: (() => void) | null = null;
  let sharingChangedOff: (() => void) | null = null;
  let connectionOff: (() => void) | null = null;

  const markerList = computed(
    () => Array.from(markers.value.values()),
  );

  function getMarker(userId: string): FriendMarkerState | undefined {
    return markers.value.get(userId);
  }

  function applyLocationUpdate(payload: LocationUpdatedPayload): void {
    const now = Date.now();
    const existing = markers.value.get(payload.userId);
    const next: FriendMarkerState = {
      userId: payload.userId,
      username: existing?.username ?? 'Friend',
      avatarUrl: existing?.avatarUrl ?? null,
      lat: payload.lat,
      lng: payload.lng,
      accuracy: payload.accuracy,
      timestamp: payload.timestamp,
      firstSeenAt: existing?.firstSeenAt ?? now,
      stale: now - payload.timestamp > STALE_THRESHOLD_MS,
      sharingMode: existing?.sharingMode ?? null,
    };
    markers.value = new Map(markers.value.set(payload.userId, next));
  }

  function applyLocationHidden(payload: LocationHiddenPayload): void {
    const next = new Map(markers.value);
    next.delete(payload.userId);
    markers.value = next;
  }

  function applySharingChanged(payload: SharingChangedPayload): void {
    const marker = markers.value.get(payload.userId);
    if (marker) {
      marker.sharingMode = payload.mode;
    }
    if (payload.mode === 'GHOST') {
      applyLocationHidden({ userId: payload.userId });
    }
  }

  function updateStaleFlags(): void {
    const now = Date.now();
    lastTickMs.value = now;
    const next = new Map<string, FriendMarkerState>();
    for (const [id, marker] of markers.value.entries()) {
      next.set(id, {
        ...marker,
        stale: now - marker.timestamp > STALE_THRESHOLD_MS,
      });
    }
    markers.value = next;
  }

  function setFriendMeta(
    userId: string,
    meta: { username: string; avatarUrl: string | null; sharingMode: SharingMode | null },
  ): void {
    const existing = markers.value.get(userId);
    const firstSeenAt = existing?.firstSeenAt ?? Date.now();
    markers.value = new Map(
      markers.value.set(userId, {
        userId,
        username: meta.username,
        avatarUrl: meta.avatarUrl,
        lat: existing?.lat ?? 0,
        lng: existing?.lng ?? 0,
        accuracy: existing?.accuracy ?? 0,
        timestamp: existing?.timestamp ?? 0,
        firstSeenAt,
        stale:
          existing?.timestamp === undefined
            ? true
            : Date.now() - existing.timestamp > STALE_THRESHOLD_MS,
        sharingMode: meta.sharingMode,
      }),
    );
  }

  function clearAll(): void {
    markers.value = new Map();
    socketStatus.value = 'idle';
  }

  function bindSocketListeners(): void {
    if (locationUpdatedOff) return;
    locationUpdatedOff = socketService.on('location:updated', applyLocationUpdate);
    locationHiddenOff = socketService.on('location:hidden', applyLocationHidden);
    sharingChangedOff = socketService.on('sharing:changed', applySharingChanged);
    connectionOff = socketService.onConnection((status) => {
      socketStatus.value = status;
    });
    if (staleTimer === null) {
      staleTimer = window.setInterval(
        updateStaleFlags,
        STALE_POLL_INTERVAL_MS,
      );
    }
  }

  function unbindSocketListeners(): void {
    locationUpdatedOff?.();
    locationHiddenOff?.();
    sharingChangedOff?.();
    connectionOff?.();
    locationUpdatedOff = null;
    locationHiddenOff = null;
    sharingChangedOff = null;
    connectionOff = null;
    if (staleTimer !== null) {
      window.clearInterval(staleTimer);
      staleTimer = null;
    }
  }

  return {
    markers,
    markerList,
    socketStatus,
    initialLoading,
    lastTickMs,
    bindSocketListeners,
    unbindSocketListeners,
    setFriendMeta,
    getMarker,
    applyLocationUpdate,
    applyLocationHidden,
    applySharingChanged,
    clearAll,
  };
});

export const STALE_MS = STALE_THRESHOLD_MS;
