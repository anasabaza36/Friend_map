<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  getSharingSettings,
  setExceptFriends,
  setSelectedFriends,
  updateSharingMode,
} from '@/services/sharing';
import { getFriends } from '@/services/friends';
import { useToast } from '@/composables/useToast';
import type { FriendSummary, SharingMode } from '@/types';

const { t } = useI18n();
const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const saveError = ref<string | null>(null);

const mode = ref<SharingMode>('EVERYONE');
const friends = ref<FriendSummary[]>([]);
const selectedIds = ref<Set<string>>(new Set());
const exceptIds = ref<Set<string>>(new Set());

const supportsCheckboxList = computed(
  () => mode.value === 'SELECTED' || mode.value === 'EXCEPT_SELECTED',
);

const currentCheckboxIds = computed<Set<string>>(() => {
  if (mode.value === 'SELECTED') return selectedIds.value;
  if (mode.value === 'EXCEPT_SELECTED') return exceptIds.value;
  return new Set();
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [sharingResult, friendsResult] = await Promise.all([
      getSharingSettings(),
      getFriends(),
    ]);
    mode.value = sharingResult.mode;
    friends.value = friendsResult.friends;
    selectedIds.value = new Set(
      sharingResult.selectedFriends.map((f: FriendSummary) => f.id),
    );
    exceptIds.value = new Set(
      sharingResult.exceptFriends.map((f: FriendSummary) => f.id),
    );
  } catch (err) {
    error.value = extractError(err) ?? t('settings.loadFailed');
    console.error(err);
  } finally {
    loading.value = false;
  }
}

function toggleFriend(id: string): void {
  const set =
    mode.value === 'SELECTED'
      ? selectedIds
      : mode.value === 'EXCEPT_SELECTED'
        ? exceptIds
        : null;
  if (!set) return;
  const next = new Set(set.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  if (mode.value === 'SELECTED') selectedIds.value = next;
  else exceptIds.value = next;
}

async function saveMode(): Promise<void> {
  saveError.value = null;
  saving.value = true;
  try {
    await updateSharingMode(mode.value);
    toast.success(t('settings.modeUpdated'));
  } catch (err) {
    saveError.value = extractError(err) ?? t('settings.updateModeFailed');
    toast.error(saveError.value);
  } finally {
    saving.value = false;
  }
}

async function saveList(): Promise<void> {
  saveError.value = null;
  saving.value = true;
  try {
    const ids = Array.from(currentCheckboxIds.value);
    if (mode.value === 'SELECTED') {
      await setSelectedFriends(ids);
    } else if (mode.value === 'EXCEPT_SELECTED') {
      await setExceptFriends(ids);
    }
    toast.success(t('settings.listUpdated'));
  } catch (err) {
    saveError.value = extractError(err) ?? t('settings.updateListFailed');
    toast.error(saveError.value);
  } finally {
    saving.value = false;
  }
}

watch(mode, () => {
  saveError.value = null;
});

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

const MODES = computed<
  { value: SharingMode; label: string; description: string; icon: string; hint: string }[]
>(() => [
  {
    value: 'GHOST',
    label: t('settings.modes.GHOST'),
    description: t('settings.modes.GHOST_desc'),
    icon: '👻',
    hint: t('settings.modes.GHOST_hint'),
  },
  {
    value: 'EVERYONE',
    label: t('settings.modes.EVERYONE'),
    description: t('settings.modes.EVERYONE_desc'),
    icon: '🌍',
    hint: t('settings.modes.EVERYONE_hint'),
  },
  {
    value: 'SELECTED',
    label: t('settings.modes.SELECTED'),
    description: t('settings.modes.SELECTED_desc'),
    icon: '🎯',
    hint: t('settings.modes.SELECTED_hint'),
  },
  {
    value: 'EXCEPT_SELECTED',
    label: t('settings.modes.EXCEPT_SELECTED'),
    description: t('settings.modes.EXCEPT_SELECTED_desc'),
    icon: '🚫',
    hint: t('settings.modes.EXCEPT_SELECTED_hint'),
  },
]);

const currentMode = computed(() => MODES.value.find((m) => m.value === mode.value));

onMounted(() => load());
</script>

<template>
  <section class="settings-page">
    <header class="hero">
      <div class="hero-badge">🔒 {{ t('settings.heroBadge') }}</div>
      <h1 class="hero-title">{{ t('settings.title') }}</h1>
      <p class="hero-subtitle">{{ t('settings.subtitle') }}</p>
    </header>

    <section v-if="error" class="glass panel">
      <p class="error">{{ error }}</p>
      <button class="btn-ghost" @click="load(); error = null">{{ t('common.retry') }}</button>
    </section>

    <template v-else-if="!loading">
      <!-- Current status summary -->
      <div v-if="currentMode" class="glass status-card">
        <span class="status-icon">{{ currentMode.icon }}</span>
        <div class="status-text">
          <span class="status-label">{{ t('settings.currentStatus') }}</span>
          <strong class="status-name">{{ currentMode.label }}</strong>
          <p class="status-desc">{{ currentMode.hint }}</p>
        </div>
        <span class="status-pill" :class="'status-pill--' + mode.toLowerCase()">
          {{ t('settings.active') }}
        </span>
      </div>

      <!-- Mode selection -->
      <section class="glass panel modes-section">
        <h2 class="section-title">{{ t('settings.whoCanSee') }}</h2>
        <div class="modes">
          <label
            v-for="opt in MODES"
            :key="opt.value"
            class="mode-tile"
            :class="{ active: mode === opt.value }"
          >
            <input
              v-model="mode"
              type="radio"
              :value="opt.value"
              :name="'sharing-mode'"
            />
            <div class="tile-icon">{{ opt.icon }}</div>
            <div class="tile-body">
              <strong class="tile-name">{{ opt.label }}</strong>
              <p class="tile-desc">{{ opt.description }}</p>
            </div>
            <span v-if="mode === opt.value" class="tile-check">✓</span>
          </label>
        </div>

        <div class="actions-row">
          <button
            type="button"
            class="primary"
            @click="saveMode()"
            :disabled="saving"
          >
            {{ saving ? t('common.saving') : t('settings.saveMode') }}
          </button>
        </div>
      </section>

      <!-- Friend list (selected / except) -->
      <section v-if="supportsCheckboxList" class="glass panel friends-section">
        <h2 class="section-title">
          {{ mode === 'SELECTED' ? t('settings.allowedFriends') : t('settings.blockedFriends') }}
        </h2>
        <p v-if="friends.length === 0" class="empty">{{ t('settings.noFriends') }}</p>
        <div v-else class="friend-grid">
          <label
            v-for="f in friends"
            :key="f.id"
            class="friend-card"
            :class="{ picked: currentCheckboxIds.has(f.id) }"
          >
            <input
              type="checkbox"
              :checked="currentCheckboxIds.has(f.id)"
              @change="toggleFriend(f.id)"
            />
            <div class="avatar-gradient friend-avatar">
              <span class="avatar-inner">{{ f.username[0].toUpperCase() }}</span>
            </div>
            <div class="friend-meta">
              <strong class="friend-name">{{ f.username }}</strong>
              <span class="friend-email">{{ f.email }}</span>
            </div>
            <span class="friend-check">✓</span>
          </label>
        </div>
        <div class="actions-row">
          <button
            type="button"
            class="primary"
            @click="saveList()"
            :disabled="saving"
          >
            {{ saving ? t('common.saving') : t('settings.saveList') }}
          </button>
        </div>
      </section>

      <section class="glass panel notes" v-if="saveError">
        <p class="error">{{ saveError }}</p>
      </section>
    </template>

    <section v-else class="glass panel">
      <p>{{ t('settings.loading') }}</p>
    </section>
  </section>
</template>

<style scoped>
.settings-page {
  padding: 1.75rem;
  max-width: 1120px;
  margin: 0 auto 2.5rem auto;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
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
  max-width: 520px;
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
  padding: 1.4rem 1.6rem;
}
.section-title {
  margin: 0 0 1rem 0;
  font-size: 1.05rem;
  color: var(--text-secondary);
}

/* ---------- Status summary ---------- */
.status-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.1rem 1.4rem;
  border-left: 3px solid transparent;
  border-left-color: #c400ff;
  position: relative;
}
.status-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.7rem;
  background: rgba(255, 61, 129, 0.12);
  border: 1px solid rgba(196, 100, 255, 0.28);
  flex-shrink: 0;
  box-shadow: 0 0 20px rgba(196, 0, 255, 0.18);
}
.status-text {
  flex: 1;
  min-width: 0;
}
.status-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.status-name {
  display: block;
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--text-primary);
}
.status-desc {
  margin: 0.15rem 0 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.status-pill {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.32rem 0.8rem;
  border-radius: var(--radius-full);
}
.status-pill--ghost { background: rgba(139, 92, 246, 0.14); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.3); }
.status-pill--everyone { background: rgba(34, 197, 94, 0.14); color: var(--color-success); border: 1px solid rgba(34, 197, 94, 0.3); }
.status-pill--selected { background: rgba(196, 0, 255, 0.14); color: #e2a7ff; border: 1px solid rgba(196, 0, 255, 0.3); }
.status-pill--except_selected { background: rgba(245, 158, 11, 0.14); color: var(--color-warning); border: 1px solid rgba(245, 158, 11, 0.3); }

/* ---------- Mode tiles ---------- */
.modes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
  margin-bottom: 1.2rem;
}
.mode-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 1.1rem 1.1rem 1rem;
  border: 1px solid rgba(190, 100, 255, 0.25);
  border-radius: 18px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, transform 0.15s ease;
}
.mode-tile:hover {
  border-color: rgba(196, 0, 255, 0.55);
  background: rgba(255, 255, 255, 0.06);
  transform: translateY(-2px);
}
.mode-tile.active {
  border-color: #c400ff;
  background: linear-gradient(160deg, rgba(196, 0, 255, 0.18), rgba(255, 61, 129, 0.08));
  box-shadow: 0 0 0 3px rgba(196, 0, 255, 0.16), 0 0 26px rgba(255, 61, 129, 0.18);
}
.mode-tile input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.tile-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  background: rgba(255, 61, 129, 0.1);
  border: 1px solid rgba(196, 100, 255, 0.25);
}
.mode-tile.active .tile-icon {
  background: rgba(196, 0, 255, 0.22);
  box-shadow: 0 0 16px rgba(196, 0, 255, 0.35);
}
.tile-name {
  font-family: var(--font-display);
  font-size: 1rem;
  color: var(--text-primary);
  display: block;
}
.tile-desc {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text-muted);
}
.tile-check {
  position: absolute;
  top: 0.7rem;
  right: 0.7rem;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--gradient-brand);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(255, 61, 129, 0.4);
}
.actions-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* ---------- Buttons ---------- */
.btn-ghost {
  height: 40px;
  padding: 0 1rem;
  border: 1px solid rgba(196, 100, 255, 0.35);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}
.btn-ghost:hover {
  border-color: #c400ff;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}
button.primary {
  height: 50px;
  padding: 0 1.6rem;
  background: var(--gradient-brand);
  color: #fff;
  border: none;
  font-weight: 600;
  font-size: 0.98rem;
  border-radius: 14px;
  box-shadow: 0 10px 26px rgba(255, 61, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}
button.primary:hover {
  filter: brightness(1.08);
  box-shadow: 0 14px 34px rgba(196, 0, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
button.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ---------- Friend selection grid ---------- */
.friend-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 0.9rem;
  margin-bottom: 1.2rem;
}
.friend-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.045);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}
.friend-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(196, 100, 255, 0.4);
}
.friend-card.picked {
  border-color: #c400ff;
  background: rgba(196, 0, 255, 0.12);
  box-shadow: 0 0 0 3px rgba(196, 0, 255, 0.12);
}
.friend-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.avatar-gradient {
  border-radius: 50%;
  background: conic-gradient(from 210deg, #ff7a00, #ff3d81, #c400ff, #7b00ff, #ff7a00);
  padding: 3px;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
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
.friend-meta {
  flex: 1;
  min-width: 0;
}
.friend-name {
  display: block;
  font-size: 0.94rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.friend-email {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.friend-check {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: 1.5px solid rgba(196, 100, 255, 0.4);
  color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.friend-card.picked .friend-check {
  background: var(--gradient-brand);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 10px rgba(255, 61, 129, 0.4);
}

/* ---------- Misc ---------- */
.empty {
  color: var(--text-muted);
  font-style: italic;
  margin: 0 0 0.5rem;
}
.error {
  color: var(--color-error);
  margin: 0.35rem 0;
}
.notes {
  padding: 0.9rem 1.2rem;
}

@media (max-width: 640px) {
  .settings-page { padding: 1rem; }
  .panel { padding: 1.1rem 1.1rem; }
  .status-card { flex-wrap: wrap; }
  .hero-title { font-size: 1.6rem; }
}
</style>
