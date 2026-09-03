<script setup lang="ts">
import { computed, onErrorCaptured } from 'vue';
import { useI18n } from 'vue-i18n';

// This view is no longer the primary entry (Map is). Keep it for backwards compatibility
// as a simple redirect target that never actually renders (router redirects / to /map).
const { t } = useI18n();
const redirecting = computed(() => true);
onErrorCaptured(() => {
  // swallow
  return false;
});
void redirecting;
</script>

<template>
  <section class="page">
    <h1>Welcome to <span class="brand-text">FriendMap</span></h1>
    <p>
      {{ t('nav.map') }}:
      <router-link to="/map">{{ t('nav.map') }}</router-link>
      · <router-link to="/friends">{{ t('nav.friends') }}</router-link>
      · <router-link to="/settings">{{ t('nav.settings') }}</router-link>
    </p>
  </section>
</template>

<style scoped>
.page {
  padding: 2rem 1.5rem;
  max-width: 720px;
  margin: 0 auto;
}

.brand-text {
  background: var(--gradient-hero);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
