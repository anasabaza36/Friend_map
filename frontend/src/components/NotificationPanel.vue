<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useNotificationStore } from '@/stores/notifications';

const emit = defineEmits<{
  close: [];
}>();

const router = useRouter();
const { t } = useI18n();
const notifStore = useNotificationStore();

const notifications = computed(() => notifStore.items);
const hasUnread = computed(() => notifStore.unreadCount > 0);

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return t('time.justNow');
  if (diff < 3600) return t('time.minAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('time.hrAgo', { n: Math.floor(diff / 3600) });
  return t('time.dayAgo', { n: Math.floor(diff / 86400) });
}

function handleNotificationClick(id: string, link?: string): void {
  notifStore.markRead(id);
  if (link) {
    router.push(link);
  }
  emit('close');
}

function handleMarkAllRead(): void {
  notifStore.markAllRead();
}

function handleClearAll(): void {
  notifStore.clearAll();
}
</script>

<template>
  <div class="notif-panel">
    <div class="notif-header">
      <h3>{{ t('notifications.title') }}</h3>
      <div class="notif-header-actions">
        <button v-if="hasUnread" class="header-btn" @click="handleMarkAllRead">
          {{ t('notifications.markAllRead') }}
        </button>
        <button v-if="notifications.length > 0" class="header-btn danger" @click="handleClearAll">
          {{ t('notifications.clear') }}
        </button>
      </div>
    </div>

    <div v-if="notifications.length === 0" class="notif-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
      <p>{{ t('notifications.emptyTitle') }}</p>
      <span>{{ t('notifications.emptyBody') }}</span>
    </div>

    <div v-else class="notif-list">
      <button
        v-for="notif in notifications"
        :key="notif.id"
        class="notif-item"
        :class="{ unread: !notif.read, [notif.type]: true }"
        @click="handleNotificationClick(notif.id, notif.link)"
      >
        <div class="notif-icon">
          <svg v-if="notif.type === 'friend_request'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="8.5" cy="7" r="4"/>
            <line x1="20" y1="8" x2="20" y2="14"/>
            <line x1="23" y1="11" x2="17" y2="11"/>
          </svg>
          <svg v-else-if="notif.type === 'friend_accepted'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <svg v-else-if="notif.type === 'friend_removed'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </div>
        <div class="notif-content">
          <div class="notif-title">{{ notif.title }}</div>
          <div class="notif-body">{{ notif.body }}</div>
          <div class="notif-time">{{ timeAgo(notif.createdAt) }}</div>
        </div>
        <span v-if="!notif.read" class="unread-dot"></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.notif-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 340px;
  max-height: 420px;
  background: rgba(26, 0, 51, 0.6);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  z-index: 9998;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: panelIn 0.15s ease-out;
}

@keyframes panelIn {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem 0.65rem;
  border-bottom: 1px solid var(--border-subtle);
}

.notif-header h3 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.notif-header-actions {
  display: flex;
  gap: 0.4rem;
}

.header-btn {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.header-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-secondary);
}

.header-btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--color-error);
  border-color: rgba(239, 68, 68, 0.25);
}

.notif-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-muted);
}

.notif-empty svg {
  opacity: 0.3;
  margin-bottom: 0.5rem;
}

.notif-empty p {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.notif-empty span {
  font-size: 0.75rem;
}

.notif-list {
  overflow-y: auto;
  flex: 1;
}

.notif-item {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.7rem 1rem;
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  position: relative;
}

.notif-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.notif-item.unread {
  background: rgba(196, 0, 255, 0.06);
}

.notif-item.unread:hover {
  background: rgba(196, 0, 255, 0.1);
}

.notif-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.1rem;
}

.notif-item.friend_request .notif-icon {
  background: rgba(196, 0, 255, 0.15);
  color: #c400ff;
}

.notif-item.friend_accepted .notif-icon {
  background: rgba(34, 197, 94, 0.15);
  color: var(--color-success);
}

.notif-item.info .notif-icon {
  background: rgba(245, 158, 11, 0.15);
  color: var(--color-warning);
}

.notif-item.friend_removed .notif-icon {
  background: rgba(239, 68, 68, 0.15);
  color: var(--color-error);
}

.notif-content {
  flex: 1;
  min-width: 0;
}

.notif-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.1rem;
}

.notif-body {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-time {
  font-size: 0.65rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
  opacity: 0.7;
}

.unread-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  background: #c400ff;
  border-radius: 50%;
  margin-top: 0.4rem;
  box-shadow: 0 0 6px rgba(196, 0, 255, 0.6);
}
</style>
