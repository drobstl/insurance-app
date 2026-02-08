import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Analytics (only runs in the browser, safe for SSR)
export const analytics = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);