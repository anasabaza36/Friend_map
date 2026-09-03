<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const { t } = useI18n();

const resolvedCancel = computed(() => props.cancelText ?? t('common.cancel'));
const resolvedConfirm = computed(() => props.confirmText ?? t('common.confirm'));
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-overlay" @click.self="emit('cancel')">
        <div class="modal-card" :class="variant ?? 'danger'">
          <div class="modal-icon">
            <svg v-if="variant === 'danger'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h3 class="modal-title">{{ title }}</h3>
          <p class="modal-message">{{ message }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="emit('cancel')">
              {{ resolvedCancel }}
            </button>
            <button class="btn-confirm" :class="variant ?? 'danger'" @click="emit('confirm')">
              {{ resolvedConfirm }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 3, 20, 0.7);
  backdrop-filter: blur(6px);
  padding: 1rem;
}

.modal-card {
  background: rgba(26, 0, 51, 0.65);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-lg);
  padding: 2rem 1.75rem 1.5rem;
  max-width: 380px;
  width: 100%;
  text-align: center;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  animation: modalIn 0.2s ease-out;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
}

.danger .modal-icon {
  background: rgba(239, 68, 68, 0.12);
  color: var(--color-error);
}

.primary .modal-icon {
  background: rgba(34, 197, 94, 0.12);
  color: var(--color-success);
}

.modal-title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.modal-message {
  margin: 0 0 1.5rem;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.btn-cancel {
  flex: 1;
  height: 46px;
  padding: 0 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(190, 100, 255, 0.25);
  color: var(--text-secondary);
  border-radius: 12px;
  font-weight: 500;
  transition: border-color 0.2s, background 0.2s;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(196, 0, 255, 0.5);
}

.btn-confirm {
  flex: 1;
  height: 46px;
  padding: 0 1rem;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  color: #fff;
  transition: filter 0.15s, transform 0.1s;
}

.btn-confirm:hover {
  filter: brightness(1.08);
}

.btn-confirm.danger {
  background: linear-gradient(135deg, #ff4d4d, #ff6b6b);
  box-shadow: 0 6px 18px rgba(255, 77, 77, 0.3);
}

.btn-confirm.primary {
  background: var(--gradient-brand);
  box-shadow: 0 6px 18px rgba(255, 61, 129, 0.3);
}

/* Transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
