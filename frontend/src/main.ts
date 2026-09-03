import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { watch } from 'vue';
import App from './App.vue';
import router from './router';
import i18n, { persistLocale, type Locale } from './i18n';
import './assets/main.css';

function applyDirection(locale: string): void {
  document.documentElement.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.lang = locale;
}

applyDirection(i18n.global.locale.value);

watch(
  () => i18n.global.locale.value,
  (locale) => {
    applyDirection(locale);
    persistLocale(locale as Locale);
  },
);

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.mount('#app');
