import { initializeApp } from 'firebase/app';
// initializeAuth + getReactNativePersistence wire Firebase Auth to
// a persistent store so the signed-in user survives app restarts.
// Without this, auth state lives in memory only and an agent who
// paired via the QR flow gets bounced back to login on every cold
// launch — including from a notification tap, which breaks the
// whole booking-push experience.
import {
  initializeAuth,
  // @ts-expect-error — getReactNativePersistence is exported from the
  //   firebase/auth React Native subset (index.rn.d.ts) but not from
  //   the .d.ts the TypeScript compiler picks for our config. The
  //   runtime resolution picks the RN export via Metro's resolver,
  //   so this works at runtime. Confirmed via @firebase/auth's
  //   index.rn.d.ts which exports `getReactNativePersistence`.
  getReactNativePersistence,
  getAuth,
  type Auth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import * as SecureStore from 'expo-secure-store';

const firebaseConfig = {
  apiKey: 'AIzaSyAnDu3i7vsOcPX66VZkhgXYCEhcdOJ6PD0',
  authDomain: 'insurance-agent-app-6f613.firebaseapp.com',
  projectId: 'insurance-agent-app-6f613',
  storageBucket: 'insurance-agent-app-6f613.firebasestorage.app',
  messagingSenderId: '527695351928',
  appId: '1:527695351928:web:0634bda34ec7dffe0b5d8d',
};

const app = initializeApp(firebaseConfig);

/**
 * Adapter that exposes expo-secure-store as the AsyncStorage-shaped
 * interface that Firebase Auth's React Native persistence expects.
 *
 * Why SecureStore (rather than adding @react-native-async-storage):
 *   - SecureStore is already a dependency in this project and is
 *     used elsewhere for session storage. Avoids adding a new native
 *     module that would require a fresh app build.
 *   - The Firebase Auth persistence payload is small (refresh token
 *     + uid + provider data), well under SecureStore's per-item size
 *     limit (2 KB on iOS Keychain, larger on Android).
 *   - SecureStore-backed credentials live in the iOS Keychain, which
 *     is a strictly better security posture than AsyncStorage's
 *     plaintext-on-disk default anyway.
 *
 * Firebase calls `setItem` with key `firebase:authUser:<appId>:<name>`,
 * which contains a `:` and `[`, both of which SecureStore rejects in
 * keys. We hash-flatten to keep the key valid.
 */
function sanitizeKey(key: string): string {
  // SecureStore keys must match [A-Za-z0-9._-]. Firebase keys contain
  // `:` and `[]`; replace them with `_` to keep the key unique-ish.
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(sanitizeKey(key)),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(sanitizeKey(key), value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(sanitizeKey(key)),
};

// initializeAuth fails if called twice for the same app, which can
// happen if a hot-reload re-evaluates this file. Wrap in try/catch
// and fall back to getAuth if initializeAuth has already run.
let _auth: Auth;
try {
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(SecureStoreAdapter),
  });
} catch {
  _auth = getAuth(app);
}

export const auth = _auth;
export const db = getFirestore(app);
export const storage = getStorage(app);
