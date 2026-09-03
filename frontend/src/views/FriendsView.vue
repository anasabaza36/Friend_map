<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  acceptFriendRequest,
  getFriends,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
  searchUsers,
} from '@/services/friends';
import { useToast } from '@/composables/useToast';
import ConfirmModal from '@/components/ConfirmModal.vue';
import type { FriendRequestSummary, FriendSummary, UserSummary } from '@/types';

const { t } = useI18n();
const toast = useToast();
const loading = ref(true);
const error = ref<string | null>(null);
const friends = ref<FriendSummary[]>([]);
const incomingRequests = ref<FriendRequestSummary[]>([]);
const outgoingRequests = ref<FriendRequestSummary[]>([]);

const recipient = ref('');
const sendLoading = ref(false);
const sendError = ref<string | null>(null);

type TabKey = 'friends' | 'incoming' | 'outgoing';
const activeTab = ref<TabKey>('friends');

const tabs = computed(() => {
  const base: { key: TabKey; label: string; count: number }[] = [
    { key: 'friends', label: t('friends.yourFriends'), count: friends.value.length },
    { key: 'incoming', label: t('friends.incoming'), count: incomingRequests.value.length },
    { key: 'outgoing', label: t('friends.outgoing'), count: outgoingRequests.value.length },
  ];
  return base.filter((tab) => tab.key === 'friends' || tab.count > 0);
});

const searchResults = ref<UserSummary[]>([]);
const searchLoading = ref(false);
const showDropdown = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const confirmOpen = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmVariant = ref<'danger' | 'primary'>('danger');
let confirmAction: (() => Promise<void>) | null = null;

function openConfirm(
  title: string,
  message: string,
  action: () => Promise<void>,
  variant: 'danger' | 'primary' = 'danger',
): void {
  confirmTitle.value = title;
  confirmMessage.value = message;
  confirmVariant.value = variant;
  confirmAction = action;
  confirmOpen.value = true;
}

async function handleConfirm(): Promise<void> {
  confirmOpen.value = false;
  if (confirmAction) {
    await confirmAction();
    confirmAction = null;
  }
}

function handleCancel(): void {
  confirmOpen.value = false;
  confirmAction = null;
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const result = await getFriends();
    friends.value = result.friends;
    incomingRequests.value = result.incomingRequests;
    outgoingRequests.value = result.outgoingRequests;
  } catch (err) {
    error.value = t('friends.loadFailed');
    console.error(err);
  } finally {
    loading.value = false;
  }
}

function onInput(): void {
  showDropdown.value = true;
  if (searchTimer) clearTimeout(searchTimer);
  const q = recipient.value.trim();
  if (q.length < 2) {
    searchResults.value = [];
    searchLoading.value = false;
    return;
  }
  searchLoading.value = true;
  searchTimer = setTimeout(async () => {
    try {
      searchResults.value = await searchUsers(q);
    } catch {
      searchResults.value = [];
    } finally {
      searchLoading.value = false;
    }
  }, 250);
}

function selectUser(user: UserSummary): void {
  recipient.value = user.username;
  showDropdown.value = false;
  searchResults.value = [];
}

function onClickOutside(e: MouseEvent): void {
  if (!showDropdown.value) return;
  const target = e.target as Node;
  if (dropdownRef.value?.contains(target)) return;
  if (inputRef.value?.contains(target)) return;
  showDropdown.value = false;
}

watch(recipient, () => {
  onInput();
});

async function onSendRequest(): Promise<void> {
  sendError.value = null;
  const target = recipient.value.trim();
  if (!target) {
    sendError.value = t('friends.enterTarget');
    return;
  }
  sendLoading.value = true;
  showDropdown.value = false;
  try {
    await sendFriendRequest(target);
    toast.success(t('friends.sentTo', { name: target }));
    recipient.value = '';
    searchResults.value = [];
    await refresh();
  } catch (err) {
    sendError.value = extractError(err) ?? t('friends.requestFailed');
    toast.error(sendError.value);
  } finally {
    sendLoading.value = false;
  }
}

async function onAccept(id: string): Promise<void> {
  try {
    await acceptFriendRequest(id);
    toast.success(t('friends.acceptedToast'));
    await refresh();
  } catch (err) {
    const msg = extractError(err) ?? t('friends.acceptFailed');
    error.value = msg;
    toast.error(msg);
  }
}

function onRejectConfirm(id: string): void {
  openConfirm(
    t('friends.rejectConfirmTitle'),
    t('friends.rejectConfirmBody'),
    async () => {
      try {
        await rejectFriendRequest(id);
        toast.success(t('friends.rejectedToast'));
        await refresh();
      } catch (err) {
        const msg = extractError(err) ?? t('friends.rejectFailed');
        error.value = msg;
        toast.error(msg);
      }
    },
  );
}

function onRemoveConfirm(friendId: string, username: string): void {
  openConfirm(
    t('friends.removeConfirmTitle', { name: username }),
    t('friends.removeConfirmBody'),
    async () => {
      try {
        await removeFriend(friendId);
        toast.success(t('friends.removedToast', { name: username }));
        await refresh();
      } catch (err) {
        const msg = extractError(err) ?? t('friends.removeFailed');
        error.value = msg;
        toast.error(msg);
      }
    },
  );
}

function extractError(err: unknown): string | null {
  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err
  ) {
    const r = err as { response?: { data?: { message?: string | string[] } } };
    const m = r.response?.data?.message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(', ');
  }
  return null;
}

const emptyIncoming = computed(
  () => incomingRequests.value.length === 0,
);
const emptyOutgoing = computed(
  () => outgoingRequests.value.length === 0,
);
const emptyFriends = computed(() => friends.value.length === 0);

const tints = [
  'rgba(255,61,129,0.18)',
  'rgba(196,0,255,0.18)',
  'rgba(255,122,0,0.18)',
  'rgba(0,196,170,0.16)',
  'rgba(120,60,255,0.18)',
];

onMounted(() => {
  document.addEventListener('click', onClickOutside);
  refresh();
});
</script>

<template>
  <section class="friends-page">
    <ConfirmModal
      :open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :variant="confirmVariant"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />

    <header class="hero">
      <div class="hero-badge">{{ t('friends.heroBadge') }}</div>
      <h1 class="hero-title">{{ t('friends.title') }}</h1>
      <p class="hero-subtitle">{{ t('friends.subtitle') }}</p>
    </header>

    <section class="glass send-panel">
      <div class="send-heading">
        <span class="send-icon">＋</span>
        <h2>{{ t('friends.sendSection') }}</h2>
      </div>
      <form @submit.prevent="onSendRequest" class="send-row">
        <label class="grow search-wrap">
          <div class="search-input-wrap" ref="inputRef">
            <svg class="search-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              v-model="recipient"
              type="text"
              :placeholder="t('friends.searchPlaceholder')"
              autocomplete="off"
              @focus="showDropdown = true"
            />
            <div v-if="searchLoading" class="search-spinner"></div>
          </div>
          <Transition name="dropdown">
            <div
              v-if="showDropdown && (searchResults.length > 0 || searchLoading || (recipient.trim().length >= 2 && !searchLoading))"
              class="search-dropdown"
              ref="dropdownRef"
            >
              <div v-if="searchLoading && searchResults.length === 0" class="dropdown-loading">
                {{ t('common.searching') }}
              </div>
              <div v-else-if="searchResults.length === 0 && !searchLoading" class="dropdown-empty">
                {{ t('common.noUsersFound') }}
              </div>
              <button
                v-for="user in searchResults"
                :key="user.id"
                type="button"
                class="dropdown-item"
                @mousedown.prevent="selectUser(user)"
              >
                <div class="avatar-sm">{{ user.username[0].toUpperCase() }}</div>
                <div class="dropdown-item-info">
                  <span class="dropdown-item-name">{{ user.username }}</span>
                  <span class="dropdown-item-email">{{ user.email }}</span>
                </div>
              </button>
            </div>
          </Transition>
        </label>
        <button type="submit" class="btn-send" :disabled="sendLoading">
          {{ sendLoading ? t('common.sending') : t('friends.sendRequest') }}
        </button>
      </form>
      <p v-if="sendError" class="error">{{ sendError }}</p>
    </section>

    <section v-if="error" class="glass panel">
      <p class="error">{{ error }}</p>
      <button class="btn-ghost" @click="refresh(); error = null">{{ t('common.retry') }}</button>
    </section>

    <section v-if="loading" class="glass panel">
      <div class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('common.loading') }}</span>
      </div>
    </section>

    <template v-else>
      <nav class="tabs" v-if="tabs.length > 1">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="tab-count">{{ tab.count }}</span>
        </button>
      </nav>

      <!-- FRIENDS -->
      <section v-if="activeTab === 'friends'" class="section-block">
        <div v-if="emptyFriends" class="glass panel empty-panel">
          <div class="empty-emoji">🤝</div>
          <p class="empty-title">{{ t('friends.noFriends') }}</p>
          <p class="empty-hint">{{ t('friends.noFriendsHint') }}</p>
        </div>
        <div v-else class="card-grid">
          <article
            v-for="(friend, idx) in friends"
            :key="friend.id"
            class="profile-card"
            :style="{ '--tint': tints[idx % tints.length] }"
          >
            <div class="pc-top">
              <div class="avatar-gradient pc-avatar">
                <span class="avatar-inner">
                  {{ friend.avatarUrl ? '' : friend.username[0].toUpperCase() }}
                </span>
              </div>
              <div class="pc-meta">
                <strong class="pc-name">{{ friend.username }}</strong>
                <span class="pc-email">{{ friend.email }}</span>
              </div>
            </div>
            <div class="pc-underline"></div>
            <div class="pc-actions">
              <button class="pc-btn pc-btn--profile" @click="toast.info(friend.username)">
                {{ t('friends.viewProfile') }}
              </button>
              <button class="pc-btn pc-btn--danger" @click="onRemoveConfirm(friend.id, friend.username)">
                {{ t('friends.remove') }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- INCOMING -->
      <section v-if="activeTab === 'incoming'" class="section-block">
        <div v-if="emptyIncoming" class="glass panel empty-panel">
          <div class="empty-emoji">📥</div>
          <p class="empty-title">{{ t('friends.noIncoming') }}</p>
        </div>
        <div v-else class="request-grid">
          <article
            v-for="req in incomingRequests"
            :key="req.id"
            class="request-card"
          >
            <div class="pc-top">
              <div class="avatar-gradient pc-avatar pc-avatar--orange">
                <span class="avatar-inner">{{ req.requester.username[0].toUpperCase() }}</span>
              </div>
              <div class="pc-meta">
                <strong class="pc-name">{{ req.requester.username }}</strong>
                <span class="pc-email">{{ req.requester.email }}</span>
              </div>
              <span class="req-tag">{{ t('friends.requestTag') }}</span>
            </div>
            <div class="pc-actions">
              <button class="pc-btn pc-btn--accept" @click="onAccept(req.id)">
                {{ t('friends.accept') }}
              </button>
              <button class="pc-btn pc-btn--danger" @click="onRejectConfirm(req.id)">
                {{ t('friends.reject') }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- OUTGOING -->
      <section v-if="activeTab === 'outgoing'" class="section-block">
        <div v-if="emptyOutgoing" class="glass panel empty-panel">
          <div class="empty-emoji">📤</div>
          <p class="empty-title">{{ t('friends.noOutgoing') }}</p>
        </div>
        <div v-else class="request-grid">
          <article
            v-for="req in outgoingRequests"
            :key="req.id"
            class="request-card"
          >
            <div class="pc-top">
              <div class="avatar-gradient pc-avatar pc-avatar--amber">
                <span class="avatar-inner">{{ req.addressee.username[0].toUpperCase() }}</span>
              </div>
              <div class="pc-meta">
                <strong class="pc-name">{{ req.addressee.username }}</strong>
                <span class="pc-email">{{ req.addressee.email }}</span>
              </div>
            </div>
            <div class="pc-status">
              <span class="status-pill status-pill--pending">⏳ {{ t('friends.pending') }}</span>
            </div>
          </article>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.friends-page {
  padding: 1.75rem;
  max-width: 1120px;
  margin: 0 auto 2.5rem auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* ---------- Hero ---------- */
.hero {
  text-align: center;
  padding: 0.75rem 0 0.25rem;
}
.hero-badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #ff9de4;
  padding: 0.35rem 0.9rem;
  border-radius: var(--radius-full);
  background: rgba(196, 0, 255, 0.14);
  border: 1px solid rgba(196, 100, 255, 0.28);
  margin-bottom: 0.9rem;
}
.hero-title {
  margin: 0;
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  background: linear-gradient(120deg, #ff9a4d 0%, #ff3d81 50%, #d66bff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hero-subtitle {
  margin: 0.4rem auto 0;
  color: var(--text-muted);
  max-width: 460px;
}

/* ---------- Glass panels ---------- */
.glass {
  background: rgba(26, 0, 51, 0.45);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.panel {
  padding: 1.25rem 1.5rem;
}

/* ---------- Send panel ---------- */
.send-panel {
  padding: 1.35rem 1.5rem;
}
.send-heading {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.85rem;
}
.send-heading h2 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--text-secondary);
}
.send-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--gradient-brand);
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 14px rgba(255, 61, 129, 0.5);
}
.send-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}
.grow {
  flex: 1;
}
.search-wrap {
  position: relative;
}
.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
  z-index: 1;
}
.search-input-wrap input {
  width: 100%;
  padding-left: 2.5rem;
  padding-right: 2.4rem;
}
.search-spinner {
  position: absolute;
  right: 0.9rem;
  width: 15px;
  height: 15px;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--violet-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.btn-send {
  height: 50px;
  padding: 0 1.5rem;
  border: none;
  background: var(--gradient-brand);
  color: #fff;
  font-weight: 600;
  border-radius: 14px;
  white-space: nowrap;
  box-shadow: 0 10px 26px rgba(255, 61, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}
.btn-send:hover {
  filter: brightness(1.08);
  box-shadow: 0 14px 34px rgba(196, 0, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}
.btn-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ---------- Tabs ---------- */
.tabs {
  display: inline-flex;
  gap: 0.4rem;
  padding: 0.35rem;
  align-self: center;
  background: rgba(26, 0, 51, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
  backdrop-filter: blur(14px);
}
.tab {
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 0.5rem 1.1rem;
  border-radius: var(--radius-full);
  font-size: 0.9rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  transition: background 0.2s ease, color 0.2s ease;
}
.tab:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}
.tab.active {
  background: var(--gradient-brand);
  color: #fff;
  box-shadow: 0 6px 18px rgba(255, 61, 129, 0.35);
}
.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.18);
  font-size: 0.7rem;
  font-weight: 700;
}
.tab.active .tab-count {
  background: rgba(0, 0, 0, 0.22);
}

/* ---------- Card grids ---------- */
.section-block {
  animation: fadeIn 0.3s ease;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1.1rem;
}
.request-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.1rem;
}

/* ---------- Profile card ---------- */
.profile-card,
.request-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(39, 4, 72, 0.7), rgba(20, 0, 40, 0.7));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 1.25rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  transition: transform 0.2s ease, box-shadow 0.25s ease, border-color 0.2s ease;
}
.profile-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 90% at 0% 0%, var(--tint), transparent 55%);
  opacity: 0.65;
  pointer-events: none;
}
.profile-card::after {
  content: '';
  position: absolute;
  top: -40px;
  right: -40px;
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: var(--tint);
  filter: blur(34px);
  opacity: 0.35;
  pointer-events: none;
}
.profile-card:hover,
.request-card:hover {
  transform: translateY(-5px);
  border-color: rgba(196, 100, 255, 0.45);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5), 0 0 26px rgba(196, 0, 255, 0.18);
}

.pc-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.pc-avatar {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}
.pc-avatar .avatar-inner {
  font-size: 1.35rem;
}
.pc-avatar--orange .avatar-inner {
  font-size: 1.15rem;
}
.avatar-gradient {
  border-radius: 50%;
  background: conic-gradient(from 210deg, #ff7a00, #ff3d81, #c400ff, #7b00ff, #ff7a00);
  padding: 3px;
  box-shadow: 0 0 18px rgba(196, 0, 255, 0.3);
}
.avatar-gradient .avatar-inner {
  border-radius: 50%;
  background: var(--bg-dark-start);
  color: #fff;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.pc-avatar--orange {
  background: conic-gradient(from 210deg, #ffd166, #ff9a44, #ff6a55, #ffd166);
}
.pc-avatar--amber {
  background: conic-gradient(from 210deg, #ffe082, #ffb300, #ff6f00, #ffe082);
}
.pc-meta {
  min-width: 0;
  flex: 1;
}
.pc-name {
  display: block;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-email {
  display: block;
  color: var(--text-muted);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.req-tag {
  flex-shrink: 0;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #ffd166;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-full);
  background: rgba(255, 209, 102, 0.12);
  border: 1px solid rgba(255, 209, 102, 0.25);
}
.pc-underline {
  position: relative;
  z-index: 1;
  height: 1px;
  margin: 0.9rem 0 0.85rem;
  background: linear-gradient(90deg, rgba(196, 100, 255, 0.35), transparent);
}
.pc-actions {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.pc-btn {
  flex: 1;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0 0.7rem;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.12s ease;
}
.pc-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}
.pc-btn--profile {
  border-color: rgba(196, 100, 255, 0.35);
  color: #d6aaff;
}
.pc-btn--profile:hover {
  border-color: #c400ff;
  color: #fff;
  background: rgba(196, 0, 255, 0.14);
}
.pc-btn--danger {
  color: var(--color-error);
  border-color: rgba(255, 107, 107, 0.25);
}
.pc-btn--danger:hover {
  background: rgba(255, 107, 107, 0.14);
  border-color: rgba(255, 107, 107, 0.5);
}
.pc-btn--accept {
  color: var(--color-success);
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.1);
}
.pc-btn--accept:hover {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.6);
}
.pc-status {
  position: relative;
  z-index: 1;
  margin-top: 0.9rem;
  display: flex;
}
.status-pill {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.3rem 0.8rem;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.status-pill--pending {
  background: rgba(245, 158, 11, 0.14);
  color: var(--color-warning);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

/* ---------- Empty panels ---------- */
.empty-panel {
  text-align: center;
  padding: 3rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}
.empty-emoji {
  font-size: 2.4rem;
  margin-bottom: 0.4rem;
}
.empty-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-secondary);
}
.empty-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* ---------- Loading / error ---------- */
.loading-state {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-muted);
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--violet-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.error {
  color: var(--color-error);
  margin: 0.35rem 0;
}

/* ---------- Search dropdown ---------- */
.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  z-index: 100;
  max-height: 260px;
  overflow-y: auto;
  padding: 0.3rem;
}
.dropdown-loading,
.dropdown-empty {
  padding: 0.6rem 0.8rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  text-align: center;
}
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}
.dropdown-item:hover {
  background: rgba(139, 63, 224, 0.1);
}
.avatar-sm {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: conic-gradient(from 210deg, #ff7a00, #ff3d81, #c400ff, #7b00ff, #ff7a00);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.75rem;
  flex-shrink: 0;
}
.dropdown-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dropdown-item-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
}
.dropdown-item-email {
  font-size: 0.72rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-enter-active { transition: opacity 0.12s ease-out, transform 0.12s ease-out; }
.dropdown-leave-active { transition: opacity 0.08s ease-in, transform 0.08s ease-in; }
.dropdown-enter-from { opacity: 0; transform: translateY(-4px); }
.dropdown-leave-to { opacity: 0; transform: translateY(-2px); }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 640px) {
  .friends-page { padding: 1rem; }
  .send-row { flex-direction: column; align-items: stretch; }
  .card-grid, .request-grid { grid-template-columns: 1fr; }
  .hero-title { font-size: 1.6rem; }
}
</style>
