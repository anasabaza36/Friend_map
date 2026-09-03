import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getFriends } from '@/services/friends';
import i18n from '@/i18n';
import {
  socketService,
  type FriendRequestPayload,
  type FriendAcceptedPayload,
  type FriendRemovedPayload,
} from '@/services/socket';

const { t } = i18n.global;

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  type: 'friend_request' | 'friend_accepted' | 'friend_removed' | 'info';
  read: boolean;
  createdAt: number;
  link?: string;
};

export const useNotificationStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([]);
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let prevRequestIds = new Set<string>();
  let socketCleanups: (() => void)[] = [];

  const unreadCount = computed(() => items.value.filter((n) => !n.read).length);

  function addNotification(
    title: string,
    body: string,
    type: AppNotification['type'] = 'info',
    link?: string,
  ): void {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    items.value.unshift({
      id,
      title,
      body,
      type,
      read: false,
      createdAt: Date.now(),
      link,
    });
    if (items.value.length > 50) {
      items.value = items.value.slice(0, 50);
    }
  }

  function markAllRead(): void {
    for (const n of items.value) {
      n.read = true;
    }
  }

  function markRead(id: string): void {
    const n = items.value.find((x) => x.id === id);
    if (n) n.read = true;
  }

  function clearAll(): void {
    items.value = [];
  }

  async function pollFriendRequests(): Promise<void> {
    try {
      const result = await getFriends();
      const currentIds = new Set(result.incomingRequests.map((r) => r.id));

      for (const req of result.incomingRequests) {
        if (!prevRequestIds.has(req.id)) {
          addNotification(
            t('notifications.newFriendRequest'),
            t('notifications.wantsToBeFriend', { name: req.requester.username }),
            'friend_request',
            '/friends',
          );
        }
      }

      prevRequestIds = currentIds;
    } catch {
      // silent
    }
  }

  function startPolling(intervalMs = 10000): void {
    stopPolling();
    pollFriendRequests();
    pollTimer = setInterval(pollFriendRequests, intervalMs);
  }

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    prevRequestIds = new Set();
  }

  function startSocketListeners(): void {
    stopSocketListeners();

    const u1 = socketService.on('friend:request', (p: FriendRequestPayload) => {
      addNotification(
        t('notifications.newFriendRequest'),
        t('notifications.wantsToBeFriend', { name: p.senderUsername }),
        'friend_request',
        '/friends',
      );
    });

    const u2 = socketService.on('friend:accepted', (p: FriendAcceptedPayload) => {
      addNotification(
        t('notifications.requestAccepted'),
        t('notifications.acceptedYourRequest', { name: p.acceptorUsername }),
        'friend_accepted',
        '/friends',
      );
    });

    const u3 = socketService.on('friend:removed', (p: FriendRemovedPayload) => {
      addNotification(
        t('notifications.friendRemoved'),
        t('notifications.removedYouAsFriend', { name: p.removedByUsername }),
        'friend_removed',
        '/friends',
      );
    });

    socketCleanups = [u1, u2, u3];
  }

  function stopSocketListeners(): void {
    for (const cleanup of socketCleanups) cleanup();
    socketCleanups = [];
  }

  return {
    items,
    unreadCount,
    addNotification,
    markAllRead,
    markRead,
    clearAll,
    startPolling,
    stopPolling,
    startSocketListeners,
    stopSocketListeners,
  };
});
