/// <reference lib="webworker" />
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

initializeApp({
  apiKey: 'AIzaSyAonVWOwKI6goxaQJqPTwNlOxYHod-83TM',
  authDomain: 'triptek-f274e.firebaseapp.com',
  projectId: 'triptek-f274e',
  storageBucket: 'triptek-f274e.firebasestorage.app',
  messagingSenderId: '727716097089',
  appId: '1:727716097089:web:595f09588bd239d59f2ac0',
  measurementId: 'G-WCLLP4S6T8',
});

const messaging = getMessaging();

onBackgroundMessage(messaging, (payload) => {
  const notificationTitle = payload.notification?.title || 'FriendMap';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/logo.png',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});

export {};
