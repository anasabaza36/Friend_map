<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import logoUrl from '@/assets/logo.png';

const { t } = useI18n();

withDefaults(
  defineProps<{
    brandName?: string;
  }>(),
  { brandName: 'FriendMap' },
);
</script>

<template>
  <div class="auth-shell">
    <!-- Layered cinematic background -->
    <div class="bg-layer">
      <div class="bg-glow bg-glow--right"></div>
      <div class="bg-glow bg-glow--map"></div>
      <div class="bg-glow bg-glow--orange"></div>
      <div class="bg-grid"></div>
      <div class="bg-vignette"></div>
    </div>

    <!-- Two columns -->
    <div class="auth-cols">
      <!-- LEFT : form -->
      <section class="auth-panel">
        <slot />
      </section>

      <!-- RIGHT : map visual -->
      <aside class="map-panel" aria-hidden="true">
        <div class="map-inner">
          <!-- grid -->
          <svg class="map-grid" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="gmGrid" width="52" height="52" patternUnits="userSpaceOnUse">
                <path d="M52 0 H0 V52" fill="none" stroke="rgba(196,0,255,0.08)" stroke-width="1" />
              </pattern>
              <!-- roads -->
              <linearGradient id="roadGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#C400FF" stop-opacity="0.5" />
                <stop offset="50%" stop-color="#8A00D4" stop-opacity="0.35" />
                <stop offset="100%" stop-color="#FF3D81" stop-opacity="0.5" />
              </linearGradient>
              <!-- marker gradient -->
              <linearGradient id="pinGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#FF6A00" />
                <stop offset="50%" stop-color="#FF3D81" />
                <stop offset="100%" stop-color="#C400FF" />
              </linearGradient>
              <linearGradient id="pinGradAlt" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#FF3D81" />
                <stop offset="100%" stop-color="#7B00FF" />
              </linearGradient>
              <filter id="lineGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect width="800" height="900" fill="url(#gmGrid)" />

            <!-- roads -->
            <g class="gm-roads">
              <path d="M0 640 H800" />
              <path d="M0 420 H800" />
              <path d="M560 0 V900" />
              <path d="M250 0 V900" />
              <path d="M120 900 C 260 720, 300 560, 300 420" />
              <path d="M560 640 C 600 520, 640 420, 700 300" />
            </g>

            <!-- connection / route lines with animated dash -->
            <g class="gm-routes" filter="url(#lineGlow)">
              <path d="M180 330 L 330 260" />
              <path d="M330 260 L 500 300" />
              <path d="M500 300 L 640 220" />
              <path d="M640 220 L 720 520" />
              <path d="M140 700 L 560 640" />
              <path d="M560 640 L 470 760" />
            </g>

            <!-- glowing dots -->
            <g class="gm-dots">
              <circle cx="180" cy="330" r="4" />
              <circle cx="330" cy="260" r="4" />
              <circle cx="500" cy="300" r="4" />
              <circle cx="640" cy="220" r="4" />
              <circle cx="720" cy="520" r="4" />
              <circle cx="140" cy="700" r="4" />
              <circle cx="470" cy="760" r="4" />
              <circle cx="560" cy="640" r="4" />
            </g>
          </svg>

          <!-- avatar + marker cluster -->
          <div class="map-avatars">
            <!-- Avatar 1 : female -->
            <div class="cluster cluster--a1">
              <div class="avatar ring-a">
                <img
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=140&q=80&fit=crop&crop=faces"
                  alt=""
                />
                <span class="status-dot"></span>
              </div>
              <span class="name-tag">Lea</span>
            </div>

            <!-- Avatar 2 : male -->
            <div class="cluster cluster--a2">
              <div class="avatar ring-b">
                <img
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=140&q=80&fit=crop&crop=faces"
                  alt=""
                />
                <span class="status-dot"></span>
              </div>
              <span class="name-tag">Max</span>
            </div>

            <!-- Avatar 3 : female -->
            <div class="cluster cluster--a3">
              <div class="avatar ring-c">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=140&q=80&fit=crop&crop=faces"
                  alt=""
                />
                <span class="status-dot"></span>
              </div>
              <span class="name-tag">Sara</span>
            </div>

            <!-- Avatar 4 : male -->
            <div class="cluster cluster--a4">
              <div class="avatar ring-d">
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=140&q=80&fit=crop&crop=faces"
                  alt=""
                />
                <span class="status-dot"></span>
              </div>
              <span class="name-tag">Omar</span>
            </div>

            <!-- Avatar 5 : female -->
            <div class="cluster cluster--a5">
              <div class="avatar ring-e">
                <img
                  src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=140&q=80&fit=crop&crop=faces"
                  alt=""
                />
                <span class="status-dot"></span>
              </div>
              <span class="name-tag">Nour</span>
            </div>

            <!-- Central FriendMap gradient marker with pulse -->
            <div class="central-marker">
              <div class="pin-pulse"></div>
              <div class="pin">
                <img :src="logoUrl" alt="" />
              </div>
            </div>
          </div>

          <!-- bottom-left floating chips -->
          <div class="map-chip chip--tl">
            <span class="chip-icon">📍</span>
            <div>
              <strong>12 amis en ligne</strong>
              <small>autour de toi</small>
            </div>
          </div>
          <div class="map-chip chip--br">
            <span class="live-dot"></span>
            Temps réel
          </div>
        </div>
      </aside>
    </div>

    <footer class="auth-footer">
      <div class="footer-brand">
        <img :src="logoUrl" alt="FriendMap" class="footer-logo" />
        <span>FriendMap</span>
      </div>
      <nav class="footer-links">
        <a href="#" @click.prevent>{{ t('footer.contact') }}</a>
        <a href="#" @click.prevent>{{ t('footer.privacy') }}</a>
        <a href="#" @click.prevent>{{ t('footer.terms') }}</a>
        <a href="#" @click.prevent>{{ t('footer.help') }}</a>
      </nav>
      <span class="footer-copy">© 2026 Triptek — {{ t('footer.rights') }}</span>
    </footer>
  </div>
</template>

<style scoped>
.auth-shell {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #10001f;
}

/* ---------- background ---------- */
.bg-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
}
.bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  mix-blend-mode: screen;
}
.bg-glow--right {
  width: 60vw;
  height: 60vw;
  top: -10vw;
  right: -15vw;
  background: radial-gradient(circle, rgba(138, 0, 212, 0.4), transparent 70%);
}
.bg-glow--map {
  width: 55vw;
  height: 55vw;
  top: 35%;
  right: -12vw;
  background: radial-gradient(circle, rgba(196, 0, 255, 0.28), transparent 70%);
}
.bg-glow--orange {
  width: 40vw;
  height: 40vw;
  bottom: -12vw;
  right: 10vw;
  background: radial-gradient(circle, rgba(255, 61, 129, 0.16), transparent 70%);
}
.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(139, 63, 224, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(139, 63, 224, 0.05) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(120% 100% at 75% 50%, #000 20%, transparent 75%);
  -webkit-mask-image: radial-gradient(120% 100% at 75% 50%, #000 20%, transparent 75%);
}
.bg-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 100% at 18% 50%, rgba(8, 0, 18, 0.55) 0%, transparent 60%);
}

/* ---------- columns ---------- */
.auth-cols {
  position: relative;
  z-index: 1;
  flex: 1;
  display: grid;
  grid-template-columns: 42% 58%;
  width: 100%;
}

.auth-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem 4.5rem;
  position: relative;
}

/* ---------- map panel ---------- */
.map-panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.map-inner {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.map-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.gm-roads path {
  fill: none;
  stroke: inherit;
  stroke-width: 2;
}
.gm-roads :nth-child(1),
.gm-roads :nth-child(2),
.gm-roads :nth-child(3),
.gm-roads :nth-child(4) {
  stroke: url(#roadGrad);
  opacity: 0.5;
}
.gm-roads :nth-child(5),
.gm-roads :nth-child(6) {
  stroke: rgba(255, 61, 129, 0.4);
  stroke-width: 1.4;
}

.gm-routes path {
  fill: none;
  stroke: url(#pinGrad);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 3 9;
  opacity: 0.75;
  animation: routeFlow 16s linear infinite;
}
@keyframes routeFlow {
  to { stroke-dashoffset: -120; }
}

.gm-dots circle {
  fill: #ffd9f2;
}
.gm-dots circle:nth-child(1),
.gm-dots circle:nth-child(2),
.gm-dots circle:nth-child(3),
.gm-dots circle:nth-child(4) {
  fill: #f7aef0;
}
.gm-dots circle:nth-child(-n + 4) {
  filter: drop-shadow(0 0 6px rgba(255, 157, 219, 0.9));
}

/* ---------- avatars & markers ---------- */
.map-avatars {
  position: absolute;
  inset: 0;
}

.cluster {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: floaty 7s ease-in-out infinite;
}

.avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  padding: 3px;
  background: linear-gradient(135deg, #ff7a00, #ff3d81, #c400ff);
  position: relative;
  box-shadow: 0 0 22px rgba(196, 0, 255, 0.35);
}
.avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  background: #28004a;
}
.status-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #21d07a;
  border: 2.5px solid #10001f;
  z-index: 2;
}
.name-tag {
  font-size: 0.72rem;
  font-weight: 600;
  color: #eadcff;
  background: rgba(24, 0, 47, 0.6);
  border: 1px solid rgba(196, 0, 255, 0.25);
  padding: 2px 9px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}

@keyframes floaty {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

/* cluster positions */
.cluster--a1 { top: 24%; left: 22%; }
.cluster--a2 { top: 20%; left: 55%; animation-delay: 1.2s; }
.cluster--a3 { top: 40%; left: 72%; animation-delay: 2.1s; }
.cluster--a4 { top: 68%; left: 18%; animation-delay: 0.6s; }
.cluster--a5 { top: 74%; left: 62%; animation-delay: 1.7s; }

/* central marker */
.central-marker {
  position: absolute;
  top: 52%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.pin {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 25%, #ffa54d, #ff3d81 55%, #c400ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 34px rgba(255, 61, 129, 0.55), 0 10px 26px rgba(0, 0, 0, 0.4);
  position: relative;
  z-index: 2;
}
.pin img {
  width: 46%;
  height: 46%;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}
.pin-pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(255, 61, 129, 0.7);
  animation: pulse 2.4s ease-out infinite;
  z-index: 1;
}
@keyframes pulse {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(2.1); opacity: 0; }
}

/* floating chips */
.map-chip {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(40, 0, 74, 0.5);
  border: 1px solid rgba(196, 0, 255, 0.28);
  border-radius: 14px;
  padding: 10px 14px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  color: #fff;
  z-index: 3;
  animation: floaty 8s ease-in-out infinite;
}
.chip--tl { top: 16%; left: 8%; }
.chip--br { bottom: 12%; right: 8%; font-size: 0.85rem; font-weight: 600; animation-delay: 1.4s; }
.map-chip small {
  display: block;
  color: #b8a6cc;
  font-size: 0.72rem;
}
.chip-icon { font-size: 1.2rem; }
.live-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #21d07a;
  box-shadow: 0 0 0 0 rgba(33, 208, 122, 0.7);
  animation: livePulse 2s infinite;
}
@keyframes livePulse {
  0% { box-shadow: 0 0 0 0 rgba(33, 208, 122, 0.6); }
  70% { box-shadow: 0 0 0 8px rgba(33, 208, 122, 0); }
  100% { box-shadow: 0 0 0 0 rgba(33, 208, 122, 0); }
}

/* ---------- footer ---------- */
.auth-footer {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  width: 100%;
  padding: 1.1rem 4.5rem;
  background: rgba(16, 0, 31, 0.4);
  backdrop-filter: blur(12px) saturate(130%);
  -webkit-backdrop-filter: blur(12px) saturate(130%);
  border-top: 1px solid rgba(196, 100, 255, 0.15);
}
.footer-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 600;
  font-family: var(--font-display);
  color: #fff;
  background: linear-gradient(135deg, #ff7a00 0%, #ff3d81 50%, #c400ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.footer-logo {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  object-fit: contain;
}
.footer-links {
  display: flex;
  gap: 1.4rem;
}
.footer-links a {
  color: #b8a6cc;
  text-decoration: none;
  font-size: 0.85rem;
  transition: color 0.2s ease;
}
.footer-links a:hover {
  color: #ff9de4;
}
.footer-copy {
  color: #8a76a8;
  font-size: 0.8rem;
}

/* ---------- responsive ---------- */
@media (max-width: 1000px) {
  .auth-cols { grid-template-columns: 50% 50%; }
  .auth-panel { padding: 2.5rem 3rem; }
  .auth-footer { padding: 1.1rem 3rem; }
}
@media (max-width: 860px) {
  .auth-cols { grid-template-columns: 1fr; }
  .map-panel { display: none; }
  .auth-panel { padding: 2.5rem 1.5rem; min-height: 100vh; }
  .auth-footer { padding: 1rem 1.5rem; }
  .footer-links { gap: 1rem; }
  .bg-vignette { display: none; }
}
</style>
