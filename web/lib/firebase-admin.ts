import 'server-only';

import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const STORAGE_BUCKET = 'insurance-agent-app-6f613.firebasestorage.app';

let adminApp: App | null = null;

const getServiceAccountJson = () => {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (raw && raw.trim().startsWith('{')) {
    return raw;
  }

  const base64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64;
  if (base64) {
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  return null;
};

const getAdminApp = () => {
  if (adminApp) return adminApp;

  const serviceAccountJson = getServiceAccountJson();
  if (!serviceAccountJson) {
    throw new Error('Firebase Admin credentials are not configured.');
  }

  const credential = cert(JSON.parse(serviceAccountJson));
  adminApp = getApps().length
    ? getApps()[0]
    : initializeApp({ credential, storageBucket: STORAGE_BUCKET });
  return adminApp;
};

export const getAdminAuth = () => getAuth(getAdminApp());
export const getAdminFirestore = () => getFirestore(getAdminApp());
export const getAdminStorage = () => getStorage(getAdminApp());