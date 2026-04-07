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
  const credentialSource = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT?.trim().startsWith('{')
    ? 'FIREBASE_ADMIN_SERVICE_ACCOUNT'
    : process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64
      ? 'FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64'
      : 'none';
  // #region agent log
  fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId:'pre-fix',hypothesisId:'H9',location:'firebase-admin.ts:getAdminApp:entry',message:'firebase_admin_init_attempt',data:{credentialSource,hasServiceAccountJson:Boolean(serviceAccountJson)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!serviceAccountJson) {
    throw new Error('Firebase Admin credentials are not configured.');
  }

  try {
    const credential = cert(JSON.parse(serviceAccountJson));
    adminApp = getApps().length
      ? getApps()[0]
      : initializeApp({ credential, storageBucket: STORAGE_BUCKET });
    // #region agent log
    fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId:'pre-fix',hypothesisId:'H9',location:'firebase-admin.ts:getAdminApp:success',message:'firebase_admin_init_success',data:{credentialSource},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return adminApp;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId:'pre-fix',hypothesisId:'H9',location:'firebase-admin.ts:getAdminApp:catch',message:'firebase_admin_init_failed',data:{credentialSource,errorType:error instanceof Error?error.name:typeof error,errorMessage:error instanceof Error?error.message:String(error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw error;
  }
};

export const getAdminAuth = () => getAuth(getAdminApp());
export const getAdminFirestore = () => getFirestore(getAdminApp());
export const getAdminStorage = () => getStorage(getAdminApp());