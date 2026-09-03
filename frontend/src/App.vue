<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore } from '@/stores/location';
import { useNotificationStore } from '@/stores/notifications';
import { socketService } from '@/services/socket';
import { initFirebase, requestNotificationPermission, onForegroundMessage } from '@/services/firebase';
import { useToast } from '@/composables/useToast';
import { persistLocale, type Locale } from '@/i18n';
import ToastContainer from '@/components/ToastContainer.vue';
import NotificationPanel from '@/components/NotificationPanel.vue';
import logoUrl from '@/assets/logo.png';

const authStore = useAuthStore();
const locationStore = useLocationStore();
const notifStore = useNotificationStore();
const { t, locale } = useI18n();
const router = useRouter();
const initialized = ref(false);
const toast = useToast();
const showNotifications = ref(false);
const bellRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
let unsubFg: (() => void) | null = null;
let appBootstrapped = false;

const languages: { code: Locale; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ar', label: 'العربية', flag: '🇹🇳' },
];

function setLocale(code: Locale): void {
  locale.value = code;
  persistLocale(code);
}

async function onLogout(): Promise<void> {
  notifStore.stopPolling();
  notifStore.stopSocketListeners();
  socketService.disconnect();
  locationStore.clearAll();
  authStore.logout();
  showNotifications.value = false;
  await router.push({ name: 'login' });
}

function toggleNotifications(): void {
  showNotifications.value = !showNotifications.value;
  if (showNotifications.value) {
    notifStore.markAllRead();
  }
}

function closeNotifications(): void {
  showNotifications.value = false;
}

function onClickOutside(e: MouseEvent): void {
  if (!showNotifications.value) return;
  const target = e.target as Node;
  if (bellRef.value?.contains(target)) return;
  if (panelRef.value?.contains(target)) return;
  showNotifications.value = false;
}

function bindForegroundMessage(): void {
  unsubFg = onForegroundMessage((payload) => {
    toast.info(payload.body ?? payload.title ?? t('notifications.newNotification'));
    notifStore.addNotification(
      payload.title ?? 'FriendMap',
      payload.body ?? '',
      'info',
    );
    if (Notification.permission === 'granted') {
      new Notification(payload.title ?? 'FriendMap', {
        body: payload.body,
        icon: logoUrl,
      });
    }
  });
}

async function bootstrapAuthedApp(): Promise<void> {
  if (appBootstrapped) return;
  appBootstrapped = true;
  socketService.ensureConnected();
  locationStore.bindSocketListeners();
  initialized.value = true;

  notifStore.startSocketListeners();
  notifStore.startPolling(15000);

  requestNotificationPermission().catch(() => {});
  bindForegroundMessage();
}

onMounted(async () => {
  document.addEventListener('click', onClickOutside);
  initFirebase();

  if (authStore.token) {
    if (!authStore.user) {
      try {
        await authStore.loadProfile();
      } catch {
        return;
      }
    }
    await bootstrapAuthedApp();
  } else {
    await router.push({ name: 'login' });
  }
});

watch(
  () => authStore.user,
  async (user) => {
    if (user && !appBootstrapped) {
      await bootstrapAuthedApp();
    }
  },
  { flush: 'post' },
);

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside);
  unsubFg?.();
  notifStore.stopPolling();
  notifStore.stopSocketListeners();
});
</script>

<template>
  <div class="app-shell">
    <ToastContainer />
    <header v-if="authStore.user && initialized" class="top-nav">
      <div class="brand">
        <img :src="logoUrl" alt="FriendMap" class="brand-logo" />
        <strong>FriendMap</strong>
        <span v-if="authStore.user" class="me"
          >· {{ authStore.user.username }}</span
        >
      </div>
      <nav class="nav-links">
        <router-link to="/map">{{ t('nav.map') }}</router-link>
        <router-link to="/friends">{{ t('nav.friends') }}</router-link>
        <router-link to="/settings">{{ t('nav.settings') }}</router-link>
        <div class="lang-switcher">
          <button
            v-for="lang in languages"
            :key="lang.code"
            type="button"
            class="lang-btn"
            :class="{ active: locale === lang.code }"
            :title="lang.label"
            @click="setLocale(lang.code)"
          >
            {{ lang.flag }}
          </button>
        </div>
        <div class="notif-wrapper" ref="bellRef">
          <button
            type="button"
            class="icon-btn notification-btn"
            :class="{ active: showNotifications }"
            @click.stop="toggleNotifications"
            :title="t('nav.notifications')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span v-if="notifStore.unreadCount > 0" class="notif-badge">
              {{ notifStore.unreadCount > 9 ? '9+' : notifStore.unreadCount }}
            </span>
          </button>
          <Transition name="panel">
            <div v-if="showNotifications" ref="panelRef" class="notif-panel-wrap">
              <NotificationPanel @close="closeNotifications" />
            </div>
          </Transition>
        </div>
        <button type="button" class="logout-btn" @click="onLogout">
          {{ t('nav.logout') }}
        </button>
      </nav>
      <div
        class="socket-status"
        :class="locationStore.socketStatus"
      >
        {{ locationStore.socketStatus }}
      </div>
    </header>
    <main class="view">
      <router-view />
    </main>
  </div>
</template>

<style>
/* Global styles now in assets/main.css */
</style>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 1.25rem;
  background: rgba(16, 0, 31, 0.72);
  backdrop-filter: blur(14px) saturate(130%);
  -webkit-backdrop-filter: blur(14px) saturate(130%);
  border-bottom: 1px solid rgba(196, 100, 255, 0.18);
  gap: 1rem;
  flex-wrap: wrap;
}

.brand {
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: contain;
}

.brand strong {
  background: linear-gradient(135deg, #ff7a00 0%, #ff3d81 50%, #c400ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-size: 1.15rem;
}

.brand .me {
  color: var(--text-muted);
  font-size: 0.85rem;
  -webkit-text-fill-color: var(--text-muted);
}

.nav-links {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
}

.nav-links a {
  text-decoration: none;
  padding: 0.4rem 0.7rem;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-weight: 500;
  transition: background 0.15s ease, color 0.15s ease;
  font-size: 0.9rem;
}

.nav-links a:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.nav-links a.router-link-exact-active {
  background: rgba(196, 0, 255, 0.16);
  color: #ff9de4;
  font-weight: 600;
}

.notif-wrapper {
  position: relative;
}

.lang-switcher {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.15rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
}

.lang-btn {
  background: none;
  border: none;
  font-size: 1.05rem;
  line-height: 1;
  padding: 0.2rem 0.35rem;
  border-radius: var(--radius-full);
  cursor: pointer;
  opacity: 0.55;
  filter: grayscale(0.6);
  transition: opacity 0.15s, filter 0.15s, transform 0.1s;
}

.lang-btn:hover {
  opacity: 0.9;
}

.lang-btn.active {
  opacity: 1;
  filter: grayscale(0);
  background: rgba(139, 63, 224, 0.2);
  transform: scale(1.05);
}

.icon-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: background 0.15s, color 0.15s;
  position: relative;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.icon-btn.active {
  background: rgba(139, 63, 224, 0.2);
  color: var(--violet-accent);
}

.notification-btn {
  position: relative;
}

.notif-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--color-error);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(26, 6, 48, 0.9);
  line-height: 1;
}

.notif-panel-wrap {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 9998;
}

.logout-btn {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #EF4444;
  font-size: 0.85rem;
  padding: 0.35rem 0.7rem;
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.25);
}

.socket-status {
  padding: 0.2rem 0.55rem;
  font-size: 0.65rem;
  border-radius: var(--radius-full);
  background: var(--bg-card);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.socket-status.connected {
  background: rgba(34, 197, 94, 0.15);
  color: var(--color-success);
}

.socket-status.disconnected,
.socket-status.connect_error {
  background: rgba(239, 68, 68, 0.15);
  color: var(--color-error);
}

.view {
  flex: 1;
}

/* Panel transition */
.panel-enter-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.panel-leave-active {
  transition: opacity 0.1s ease-in, transform 0.1s ease-in;
}
.panel-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
.panel-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
