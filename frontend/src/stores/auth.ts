import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  clearStoredToken,
  fetchProfile,
  getStoredToken,
  login as loginRequest,
  register as registerRequest,
  setStoredToken,
} from '@/services/auth';
import type { LoginPayload, RegisterPayload, UserProfile } from '@/types/auth';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getStoredToken());
  const user = ref<UserProfile | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => token.value !== null);

  async function register(payload: RegisterPayload): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await registerRequest(payload);
      token.value = response.accessToken;
      setStoredToken(response.accessToken);
      user.value = await fetchProfile();
    } catch (err: unknown) {
      error.value = extractErrorMessage(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function login(payload: LoginPayload): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await loginRequest(payload);
      token.value = response.accessToken;
      setStoredToken(response.accessToken);
      user.value = await fetchProfile();
    } catch (err: unknown) {
      error.value = extractErrorMessage(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function loadProfile(): Promise<void> {
    if (!token.value) {
      return;
    }

    try {
      user.value = await fetchProfile();
    } catch {
      logout();
    }
  }

  function logout(): void {
    token.value = null;
    user.value = null;
    clearStoredToken();
  }

  return {
    token,
    user,
    loading,
    error,
    isAuthenticated,
    register,
    login,
    loadProfile,
    logout,
  };
});

function extractErrorMessage(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as { response?: { data?: { message?: string | string[] } } })
      .response?.data?.message === 'string'
  ) {
    return (err as { response: { data: { message: string } } }).response.data
      .message;
  }

  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    Array.isArray(
      (err as { response?: { data?: { message?: string | string[] } } })
        .response?.data?.message,
    )
  ) {
    const messages = (err as { response: { data: { message: string[] } } })
      .response.data.message;
    return messages.join(', ');
  }

  return 'Request failed';
}
