import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, type Messaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'AIzaSyAonVWOwKI6goxaQJqPTwNlOxYHod-83TM',
  authDomain: 'triptek-f274e.firebaseapp.com',
  projectId: 'triptek-f274e',
  storageBucket: 'triptek-f274e.firebasestorage.app',
  messagingSenderId: '727716097089',
  appId: '1:727716097089:web:595f09588bd239d59f2ac0',
  measurementId: 'G-WCLLP4S6T8',
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

const VAPID_KEY = 'BFRMCn-DBmN0yCrGGjJrFIJSrNFXdOFk5AJU9BFnQPLQJCe_gB6DVLmJKEJJYdUOEjJOVzS3sVrGCGJYD40BpFo';

const SW_SCOPE = '/firebase-cloud-messaging-push-scope';
const SW_URL = '/firebase-messaging-sw.js';

let messageSw: ServiceWorkerRegistration | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

function getFirebaseMessaging(): Messaging | null {
  if (!('serviceWorker' in navigator)) return null;
  try {
    if (!messaging) {
      messaging = getMessaging(getFirebaseApp());
    }
    return messaging;
  } catch {
    return null;
  }
}

async function getMessageSw(): Promise<ServiceWorkerRegistration | null> {
  if (messageSw) return messageSw;
  try {
    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: SW_SCOPE,
      type: 'module',
    });
    await navigator.serviceWorker.ready;
    messageSw = registration;
    return registration;
  } catch (err) {
    console.error('Failed to register message service worker', err);
    return null;
  }
}

export async function requestNotificationPermission(): Promise<string | null> {
  const messaging = getFirebaseMessaging();
  if (!messaging) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  try {
    const registration = await getMessageSw();
    if (!registration) return null;
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token;
  } catch (err) {
    console.error('Failed to get FCM token', err);
    return null;
  }
}

export function onForegroundMessage(
  callback: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void,
): () => void {
  const messaging = getFirebaseMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: payload.data as Record<string, string> | undefined,
    });
  });
}

export function initFirebase(): void {
  getFirebaseApp();
}
