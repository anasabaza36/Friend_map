<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import L from 'leaflet';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore, STALE_MS } from '@/stores/location';
import { socketService } from '@/services/socket';
import { getFriends } from '@/services/friends';
import { getMyCurrentLocation, getFriendCurrentLocation, publishMyLocation } from '@/services/location';
import { getSharingSettings } from '@/services/sharing';
import { formatRelativeTime, initials } from '@/utils/time';
import type { FriendMarkerState, FriendSummary, SharingMode } from '@/types';

const authStore = useAuthStore();
const locationStore = useLocationStore();
const { t } = useI18n();

const mapContainer = ref<HTMLElement | null>(null);
const mapReady = ref(false);
const loading = ref(true);
const error = ref<string | null>(null);
const geolocError = ref<string | null>(null);
const stopViewingOwners = ref<Set<string>>(new Set());
const selectedMarker = ref<FriendMarkerState | null>(null);
const selectedSharingMode = ref<SharingMode | null>(null);

let map: L.Map | null = null;
let myMarker: L.Marker | null = null;
let myCircle: L.Circle | null = null;
let friendLayer: L.LayerGroup | null = null;
const friendMarkers = new Map<string, L.Marker>();
const popupsOpen = new Map<string, boolean>();
let watchId: number | null = null;
let staleCheckTimer: number | null = null;

function popupContent(marker: FriendMarkerState): string {
  const relative = formatRelativeTime(marker.timestamp);
  const stale = marker.stale ? `<span class="stale-tag">${t('map.staleTag')}</span>` : '';
  const mode = marker.sharingMode
    ? `<div class="sharing-mode">${t('map.sharing')} <strong>${marker.sharingMode}</strong></div>`
    : '';
  const stopBtn = stopViewingOwners.value.has(marker.userId)
    ? `<button class="start-view-btn" data-user="${marker.userId}">${t('map.resumeViewing')}</button>`
    : `<button class="stop-view-btn" data-user="${marker.userId}">${t('map.stopViewing')}</button>`;
  return `
    <div class="marker-popup">
      <div class="popup-header">
        <strong>${marker.username}</strong> ${stale}
      </div>
      <div class="popup-time">${t('map.updated')} ${relative}</div>
      ${mode}
      <div class="popup-actions">${stopBtn}</div>
    </div>
  `;
}

function avatarIcon(marker: FriendMarkerState): L.DivIcon {
  const init = initials(marker.username);
  const staleCls = marker.stale ? 'stale' : '';
  return L.divIcon({
    className: `friend-marker ${staleCls}`,
    html: `
      <div class="marker-avatar">
        <span class="initials">${init}</span>
        <span class="marker-name">${marker.username}</span>
        <span class="marker-time">${formatRelativeTime(marker.timestamp)}</span>
        ${marker.stale ? '<span class="stale-dot"></span>' : '<span class="live-dot"></span>'}
      </div>
    `,
    iconSize: marker.stale ? [120, 58] : [120, 58],
    iconAnchor: [60, 58],
  });
}

function myselfIcon(): L.DivIcon {
  const name = authStore.user?.username ?? 'Me';
  return L.divIcon({
    className: 'me-marker',
    html: `
      <div class="me-avatar">
        <span class="initials">${initials(name)}</span>
        <span class="me-label">${t('map.you')}</span>
      </div>
    `,
    iconSize: [80, 56],
    iconAnchor: [40, 56],
  });
}

function updateOrCreateFriendMarker(marker: FriendMarkerState): void {
  if (!map || !friendLayer) return;
  if (stopViewingOwners.value.has(marker.userId)) return;

  const latlng: L.LatLngTuple = [marker.lat, marker.lng];
  const icon = avatarIcon(marker);
  const existing = friendMarkers.get(marker.userId);

  if (existing) {
    existing.setLatLng(latlng);
    existing.setIcon(icon);
    if (popupsOpen.get(marker.userId)) {
      existing.setPopupContent(popupContent(marker));
    }
  } else {
    const m = L.marker(latlng, { icon });
    m.bindPopup(popupContent(marker), { maxWidth: 280, className: 'friend-popup' });
    m.on('popupopen', () => {
      popupsOpen.set(marker.userId, true);
      selectedMarker.value = marker;
      selectedSharingMode.value = marker.sharingMode;
    });
    m.on('popupclose', () => {
      popupsOpen.set(marker.userId, false);
      selectedMarker.value = null;
      selectedSharingMode.value = null;
    });
    m.on('click', () => {
      selectedMarker.value = marker;
      selectedSharingMode.value = marker.sharingMode;
    });
    friendMarkers.set(marker.userId, m);
    friendLayer.addLayer(m);
  }
}

function removeFriendMarker(userId: string): void {
  const m = friendMarkers.get(userId);
  if (m) {
    friendLayer?.removeLayer(m);
    m.remove();
  }
  friendMarkers.delete(userId);
  popupsOpen.delete(userId);
}

function updateAllMarkers(): void {
  const seen = new Set<string>();
  for (const marker of locationStore.markerList) {
    seen.add(marker.userId);
    updateOrCreateFriendMarker(marker);
  }
  for (const [id] of Array.from(friendMarkers.entries())) {
    if (!seen.has(id)) {
      removeFriendMarker(id);
    }
  }
}

function updateMyMarker(lat: number, lng: number, accuracy: number): void {
  if (!map) return;
  const latlng: L.LatLngTuple = [lat, lng];
  if (myMarker) {
    myMarker.setLatLng(latlng);
    myMarker.setIcon(myselfIcon());
  } else {
    myMarker = L.marker(latlng, { icon: myselfIcon() });
    myMarker.addTo(map);
  }
  if (myCircle) {
    myCircle.setLatLng(latlng);
    myCircle.setRadius(accuracy);
  } else {
    myCircle = L.circle(latlng, {
      radius: accuracy,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 1,
    });
    myCircle.addTo(map);
  }
}

async function hydrateFriendMeta(): Promise<void> {
  try {
    const { friends } = await getFriends();
    const sharing = await getSharingSettings();
    const byId = new Map<string, FriendSummary>();
    for (const f of friends) byId.set(f.id, f);
    for (const friend of friends) {
      const mode: SharingMode | null = sharing.selectedFriends.some(
        (f) => f.id === friend.id,
      )
        ? 'SELECTED'
        : sharing.exceptFriends.some((f) => f.id === friend.id)
          ? 'EXCEPT_SELECTED'
          : sharing.mode === 'EVERYONE'
            ? 'EVERYONE'
            : sharing.mode === 'GHOST'
              ? 'GHOST'
              : null;
      locationStore.setFriendMeta(friend.id, {
        username: friend.username,
        avatarUrl: friend.avatarUrl,
        sharingMode: mode,
      });
      try {
        const loc = await getFriendCurrentLocation(friend.id);
        if (loc) {
          locationStore.applyLocationUpdate({
            userId: friend.id,
            lat: loc.lat,
            lng: loc.lng,
            accuracy: loc.accuracy,
            timestamp: loc.timestamp,
          });
        }
      } catch {
        // ignore - visibility may not allow
      }
    }
  } catch (err) {
    console.error('Failed to hydrate friend metadata', err);
  }
}

function initMap(): void {
  if (!mapContainer.value) return;
  map = L.map(mapContainer.value, {
    zoomControl: true,
    worldCopyJump: true,
  }).setView([48.8566, 2.3522], 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  friendLayer = L.layerGroup().addTo(map);
  mapReady.value = true;
}

function startGeolocation(): void {
  if (!('geolocation' in navigator)) {
    geolocError.value = t('map.geolocUnsupported');
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      geolocError.value = null;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;
      const timestamp = pos.timestamp;
      updateMyMarker(lat, lng, accuracy);
      try {
        await publishMyLocation({ lat, lng, accuracy, timestamp });
        socketService.sendLocationUpdate({
          userId: authStore.user?.id ?? '',
          lat,
          lng,
          accuracy,
          timestamp,
        });
      } catch {
        // silent - backend validates and will reject invalid
      }
    },
    (err) => {
      geolocError.value = `Geolocation error: ${err.message}`;
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    },
  );
}

function handleStopViewing(ownerId: string): void {
  const next = new Set(stopViewingOwners.value);
  next.add(ownerId);
  stopViewingOwners.value = next;
  removeFriendMarker(ownerId);
  socketService.stopViewing(ownerId);
  if (selectedMarker.value?.userId === ownerId) {
    selectedMarker.value = null;
    selectedSharingMode.value = null;
  }
}

function handleStartViewing(ownerId: string): void {
  const next = new Set(stopViewingOwners.value);
  next.delete(ownerId);
  stopViewingOwners.value = next;
  socketService.startViewing(ownerId);
  const marker = locationStore.getMarker(ownerId);
  if (marker) updateOrCreateFriendMarker(marker);
}

function bindPopupActions(): void {
  if (!mapContainer.value) return;
  mapContainer.value.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    if (target.classList.contains('stop-view-btn')) {
      const userId = target.getAttribute('data-user');
      if (userId) handleStopViewing(userId);
    } else if (target.classList.contains('start-view-btn')) {
      const userId = target.getAttribute('data-user');
      if (userId) handleStartViewing(userId);
    }
  });
}

function staleCheckTick(): void {
  for (const [userId, marker] of friendMarkers.entries()) {
    const state = locationStore.getMarker(userId);
    if (!state) continue;
    state.stale = Date.now() - state.timestamp > STALE_MS;
    marker.setIcon(avatarIcon(state));
  }
}

watch(
  () => locationStore.markerList,
  () => {
    updateAllMarkers();
  },
  { deep: true },
);

watch(
  () => locationStore.lastTickMs,
  () => {
    updateAllMarkers();
  },
);

onMounted(async () => {
  try {
    loading.value = true;
    error.value = null;
    await nextTick();
    initMap();
    bindPopupActions();
    await hydrateFriendMeta();
    updateAllMarkers();
    const myLoc = await getMyCurrentLocation();
    if (myLoc && map) {
      updateMyMarker(myLoc.lat, myLoc.lng, myLoc.accuracy);
      map.setView([myLoc.lat, myLoc.lng], 14);
    }
    startGeolocation();
    staleCheckTimer = window.setInterval(staleCheckTick, 5000);
  } catch (err) {
    error.value = t('map.initFailed');
    console.error(err);
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (staleCheckTimer !== null) window.clearInterval(staleCheckTimer);
  friendMarkers.clear();
  popupsOpen.clear();
  if (map) {
    map.remove();
    map = null;
  }
  myMarker = null;
  myCircle = null;
  friendLayer = null;
});

const hasNoFriendsVisible = computed(
  () =>
    !loading.value &&
    mapReady.value &&
    Array.from(friendMarkers.values()).length === 0,
);
</script>

<template>
  <div class="map-page">
    <div class="status-bar">
      <div class="status-left">
        <span
          class="socket-chip"
          :class="locationStore.socketStatus"
        >
          {{ t('map.socket') }}: {{ locationStore.socketStatus }}
        </span>
        <span v-if="geolocError" class="geo-chip error">
          {{ geolocError }}
        </span>
      </div>
      <div class="status-right">
        <span class="count-chip">
          {{ t('map.visibleFriends', { count: Array.from(friendMarkers).length }) }}
        </span>
      </div>
    </div>

    <div v-if="error" class="map-error">
      <p>{{ error }}</p>
    </div>

    <div v-if="loading" class="map-loading">{{ t('map.loadingMap') }}</div>

    <div ref="mapContainer" class="map-container"></div>

    <div v-if="hasNoFriendsVisible" class="empty-overlay">
      <div class="empty-card">
        <h3>{{ t('map.noFriendsVisible') }}</h3>
        <p>
          {{ t('map.noFriendsBody') }}
        </p>
        <router-link to="/friends" class="btn-primary">{{ t('map.goToFriends') }}</router-link>
      </div>
    </div>

    <div v-if="selectedMarker" class="info-panel">
      <h4>{{ selectedMarker.username }}</h4>
      <p>{{ t('map.lastUpdated', { time: formatRelativeTime(selectedMarker.timestamp) }) }}</p>
      <p v-if="selectedMarker.stale" class="stale">
        {{ t('map.staleWarning') }}
      </p>
      <p v-if="selectedSharingMode">
        {{ t('map.sharingStatus') }} <strong>{{ selectedSharingMode }}</strong>
      </p>
      <div class="info-actions">
        <button
          v-if="!stopViewingOwners.has(selectedMarker.userId)"
          @click="handleStopViewing(selectedMarker.userId)"
          class="danger"
        >
          {{ t('map.stopViewing') }}
        </button>
        <button
          v-else
          @click="handleStartViewing(selectedMarker.userId)"
          class="primary"
        >
          {{ t('map.resumeViewing') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-page {
  position: relative;
  width: 100%;
  height: calc(100vh - 60px);
  min-height: 480px;
}

.map-container {
  width: 100%;
  height: 100%;
}

.status-bar {
  position: absolute;
  top: 0.6rem;
  left: 0.6rem;
  right: 0.6rem;
  z-index: 500;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  pointer-events: none;
}

.status-left,
.status-right {
  display: flex;
  gap: 0.5rem;
  pointer-events: auto;
  flex-wrap: wrap;
}

.socket-chip,
.geo-chip,
.count-chip {
  background: rgba(26, 6, 48, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.socket-chip.connected {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.3);
  color: var(--color-success);
}

.socket-chip.disconnected,
.socket-chip.connect_error {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: var(--color-error);
}

.geo-chip.error {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: var(--color-error);
}

.map-loading,
.map-error {
  position: absolute;
  top: 3rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 600;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  padding: 0.6rem 1.25rem;
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  font-size: 0.95rem;
  color: var(--text-primary);
}

.map-error {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: var(--color-error);
}

.empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 450;
  pointer-events: none;
}

.empty-card {
  background: rgba(26, 0, 51, 0.6);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-lg);
  padding: 1.75rem 2rem;
  max-width: 420px;
  pointer-events: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  text-align: center;
}

.empty-card h3 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
}

.empty-card p {
  color: var(--text-muted);
  margin: 0 0 1rem 0;
  line-height: 1.5;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-brand);
  color: #fff;
  padding: 0.6rem 1.4rem;
  border-radius: 12px;
  text-decoration: none;
  font-weight: 600;
  border: none;
  font-size: 0.95rem;
  box-shadow: 0 10px 26px rgba(255, 61, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.btn-primary:hover {
  filter: brightness(1.08);
  background: var(--gradient-brand);
  box-shadow: 0 14px 34px rgba(196, 0, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.info-panel {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  z-index: 500;
  background: rgba(26, 0, 51, 0.6);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  padding: 1rem 1.25rem;
  min-width: 260px;
  max-width: 360px;
}

.info-panel h4 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
}

.info-panel p {
  margin: 0.25rem 0;
  color: var(--text-secondary);
}

.info-panel .stale {
  color: var(--color-warning);
}

.info-actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
}

button.primary {
  background: var(--gradient-brand);
  color: #fff;
  border: none;
  font-weight: 600;
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(255, 61, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

button.primary:hover {
  filter: brightness(1.08);
  background: var(--gradient-brand);
  box-shadow: 0 12px 28px rgba(196, 0, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

button.danger {
  background: rgba(255, 107, 107, 0.12);
  border-color: rgba(255, 107, 107, 0.3);
  color: var(--color-error);
  border-radius: 10px;
}

button.danger:hover {
  background: rgba(255, 107, 107, 0.2);
}
</style>

<style>
@import 'leaflet/dist/leaflet.css';

.friend-marker,
.me-marker {
  background: transparent !important;
  border: none !important;
}

.marker-avatar,
.me-avatar {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(-50%);
}

.marker-avatar .initials,
.me-avatar .initials {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: conic-gradient(from 210deg, #ff7a00, #ff3d81, #c400ff, #7b00ff, #ff7a00);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
  box-shadow: 0 0 14px rgba(196, 0, 255, 0.45);
  border: 2px solid var(--bg-dark-start);
}

.me-avatar .initials {
  background: conic-gradient(from 210deg, #22c55e, #16a34a, #22c55e);
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4);
}

.marker-name {
  margin-top: 2px;
  background: rgba(26, 0, 51, 0.92);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-subtle);
}

.marker-time {
  font-size: 0.62rem;
  color: var(--text-muted);
  background: rgba(26, 0, 51, 0.8);
  padding: 0 4px;
  border-radius: 3px;
}

.me-label {
  margin-top: 2px;
  background: rgba(34, 197, 94, 0.9);
  color: #fff;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.friend-marker.stale .initials {
  background: var(--text-muted);
  box-shadow: none;
}

.friend-marker.stale .marker-time {
  color: var(--color-warning);
  font-weight: 600;
}

.live-dot {
  position: absolute;
  bottom: 20px;
  right: calc(50% - 22px);
  width: 10px;
  height: 10px;
  background: var(--color-success);
  border: 2px solid var(--bg-dark-start);
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6);
  animation: pulse 1.8s infinite;
}

.stale-dot {
  position: absolute;
  bottom: 20px;
  right: calc(50% - 22px);
  width: 10px;
  height: 10px;
  background: var(--color-warning);
  border: 2px solid var(--bg-dark-start);
  border-radius: 50%;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}

/* Leaflet popup overrides */
.leaflet-popup-content-wrapper {
  background: rgba(26, 0, 51, 0.92) !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
  color: var(--text-primary) !important;
}

.leaflet-popup-tip {
  background: rgba(26, 0, 51, 0.92) !important;
  border: 1px solid var(--border-subtle) !important;
  box-shadow: none !important;
}

.marker-popup .popup-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1rem;
  margin-bottom: 0.25rem;
  color: var(--text-primary);
}

.marker-popup .stale-tag {
  background: rgba(245, 158, 11, 0.2);
  color: var(--color-warning);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  text-transform: uppercase;
  font-weight: 600;
}

.marker-popup .popup-time {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0.2rem 0;
}

.marker-popup .sharing-mode {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin: 0.35rem 0;
}

.marker-popup .popup-actions {
  margin-top: 0.5rem;
}

.stop-view-btn,
.start-view-btn {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.7rem;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
}

.stop-view-btn {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
  color: var(--color-error);
}

.stop-view-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

.start-view-btn {
  background: rgba(139, 63, 224, 0.15);
  border-color: rgba(139, 63, 224, 0.3);
  color: var(--violet-accent);
}

.start-view-btn:hover {
  background: rgba(139, 63, 224, 0.25);
}
</style>
