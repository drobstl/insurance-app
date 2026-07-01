import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyAnDu3i7vsOcPX66VZkhgXYCEhcdOJ6PD0",
  authDomain: "insurance-agent-app-6f613.firebaseapp.com",
  projectId: "insurance-agent-app-6f613",
  storageBucket: "insurance-agent-app-6f613.firebasestorage.app",
  messagingSenderId: "527695351928",
  appId: "1:527695351928:web:0634bda34ec7dffe0b5d8d",
  measurementId: "G-E1315GMPZM"
};

// Prevent duplicate-app error during HMR / SSR re-evaluation
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// CI-only escape hatch for the e2e suite: skip phone-auth app verification
// (reCAPTCHA) so Firebase *test* phone numbers complete headlessly. Only honored
// on localhost — a leaked flag is inert on real domains. Never set in Vercel.
if (
  process.env.NEXT_PUBLIC_E2E_AUTH_TEST_MODE === 'true' &&
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
) {
  auth.settings.appVerificationDisabledForTesting = true;
}
// Firestore with an on-device (IndexedDB) cache so `onSnapshot` paints
// from the last-known data INSTANTLY on revisit, then reconciles from the
// server — killing the blank-then-fill flash on navigation. Browser-only
// (IndexedDB); SSR/node falls back to the plain in-memory client.
// `persistentMultipleTabManager` keeps multiple open tabs consistent.
function initDb() {
  if (typeof window === 'undefined') return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialized (HMR re-eval) or persistence unavailable →
    // return the existing/plain client.
    return getFirestore(app);
  }
}
export const db = initDb();
export const storage = getStorage(app);

// Initialize Analytics (only runs in the browser, safe for SSR)
export const analytics = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);