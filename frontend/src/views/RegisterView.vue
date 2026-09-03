<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import AuthLayout from '@/components/AuthLayout.vue';
import logoUrl from '@/assets/logo.png';

const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();
const toast = useToast();

const email = ref('');
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const localError = ref<string | null>(null);

async function onSubmit(): Promise<void> {
  localError.value = null;
  try {
    await authStore.register({
      email: email.value,
      username: username.value,
      password: password.value,
    });
    await router.push({ name: 'map' });
  } catch {
    localError.value = authStore.error;
    toast.error(authStore.error ?? t('register.failed'));
  }
}
</script>

<template>
  <AuthLayout>
    <div class="brand-head">
      <img :src="logoUrl" alt="FriendMap" class="brand-img" />
      <h1 class="brand-name">FriendMap</h1>
      <span class="brand-tagline">{{ t('register.tagline') }}</span>
    </div>

    <h2 class="headline">{{ t('register.title') }}</h2>
    <p class="subtitle">{{ t('register.subtitle') }}</p>

    <form @submit.prevent="onSubmit" class="auth-form">
      <div class="field">
        <svg class="f-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h16v10H4z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          :placeholder="t('register.email')"
        />
      </div>

      <div class="field">
        <svg class="f-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
        <input
          v-model="username"
          type="text"
          required
          minlength="3"
          maxlength="30"
          pattern="[a-zA-Z0-9_]+"
          autocomplete="username"
          :placeholder="t('register.username')"
        />
      </div>

      <div class="field">
        <svg class="f-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="9" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M8 9V7a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          required
          minlength="8"
          autocomplete="new-password"
          :placeholder="t('register.password')"
        />
        <button
          type="button"
          class="eye-btn"
          :aria-label="showPassword ? 'hide' : 'show'"
          @click="showPassword = !showPassword"
        >
          <svg v-if="showPassword" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M1 1l22 22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7" />
          </svg>
        </button>
      </div>

      <button type="submit" class="btn-primary" :disabled="authStore.loading">
        {{ authStore.loading ? t('register.creatingAccount') : t('register.register') }}
      </button>
    </form>

    <p v-if="localError" class="error">{{ localError }}</p>

    <p class="switch-auth">
      {{ t('register.haveAccount') }}
      <router-link to="/login" class="switch-link">{{ t('register.loginLink') }}</router-link>
    </p>
  </AuthLayout>
</template>

<style scoped>
.brand-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 2.4rem;
}
.brand-img {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  object-fit: contain;
  filter: drop-shadow(0 4px 14px rgba(196, 0, 255, 0.4));
}
.brand-name {
  font-family: 'Poppins', system-ui, sans-serif;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #fff;
  background: linear-gradient(135deg, #ff7a00 0%, #ff3d81 50%, #c400ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.brand-tagline {
  margin-left: auto;
  color: #b8a6cc;
  font-size: 0.82rem;
  font-weight: 500;
}

.headline {
  font-family: 'Poppins', system-ui, sans-serif;
  font-size: clamp(1.7rem, 2.6vw, 2.2rem);
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 1.12;
  color: #fff;
  margin: 0 0 0.7rem;
}
.subtitle {
  color: #c7b6dd;
  font-size: 0.98rem;
  line-height: 1.6;
  max-width: 34rem;
  margin: 0 0 2rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 30rem;
}

.field {
  position: relative;
  display: flex;
  align-items: center;
}
.f-icon {
  position: absolute;
  left: 1.05rem;
  width: 20px;
  height: 20px;
  color: #b8a6cc;
  pointer-events: none;
  transition: color 0.2s ease;
}
.field input {
  width: 100%;
  height: 58px;
  padding: 0 3rem 0 3.1rem;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 0.98rem;
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(190, 100, 255, 0.25);
  border-radius: 14px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}
.field input::placeholder {
  color: rgba(255, 255, 255, 0.55);
}
.field input:focus {
  outline: none;
  border-color: #c400ff;
  background: rgba(255, 255, 255, 0.07);
  box-shadow: 0 0 0 3px rgba(196, 0, 255, 0.18), 0 0 20px rgba(255, 61, 129, 0.18);
}
.field:focus-within .f-icon {
  color: #ff9de4;
}

.eye-btn {
  position: absolute;
  right: 0.5rem;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #b8a6cc;
  border-radius: 10px;
  transition: color 0.2s ease, background 0.2s ease;
}
.eye-btn:hover {
  color: #ff9de4;
  background: rgba(255, 255, 255, 0.06);
}
.eye-btn svg {
  width: 20px;
  height: 20px;
}
.field:focus-within .eye-btn {
  color: #ff9de4;
}

.btn-primary {
  margin-top: 0.4rem;
  height: 56px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #ff7a00 0%, #ff3d81 50%, #c400ff 100%);
  color: #fff;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(255, 61, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}
.btn-primary:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 14px 34px rgba(196, 0, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}
.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #ff6b6b;
  font-size: 0.9rem;
  margin-top: 1rem;
}

.switch-auth {
  margin-top: 1.8rem;
  color: #b8a6cc;
  font-size: 0.92rem;
}
.switch-link {
  color: #ff4b9b;
  font-weight: 600;
  text-decoration: none;
  margin-left: 0.3rem;
  transition: color 0.2s ease;
}
.switch-link:hover {
  color: #ff7a00;
}
</style>
