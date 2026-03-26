import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';

const INTEGRATIONS_COLLECTION = 'integrations';
const GOOGLE_SUBCOLLECTION = 'google';
const DRIVE_DOC_ID = 'drive';
const OAUTH_STATES_SUBCOLLECTION = 'oauthStates';
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

interface GoogleDriveDocShape {
  provider: 'google_drive';
  connected: boolean;
  googleEmail?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDateMs?: number | null;
  tokenType?: string | null;
  scope?: string | null;
  connectedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface GoogleOAuthStateDocShape {
  stateId: string;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  expiresAtMs: number;
}

export interface GoogleDriveIntegrationRecord {
  connected: boolean;
  googleEmail?: string;
  accessToken?: string;
  refreshToken?: string;
  expiryDateMs?: number;
  tokenType?: string;
  scope?: string;
  connectedAt?: string;
  updatedAt?: string;
}

export function getGoogleDriveDocRef(agentId: string) {
  return getAdminFirestore()
    .collection(INTEGRATIONS_COLLECTION)
    .doc(agentId)
    .collection(GOOGLE_SUBCOLLECTION)
    .doc(DRIVE_DOC_ID);
}

export function getGoogleOAuthStateDocRef(agentId: string, stateId: string) {
  return getAdminFirestore()
    .collection(INTEGRATIONS_COLLECTION)
    .doc(agentId)
    .collection(GOOGLE_SUBCOLLECTION)
    .doc(OAUTH_STATES_SUBCOLLECTION)
    .collection('items')
    .doc(stateId);
}

export async function upsertGoogleDriveTokens(
  agentId: string,
  tokens: {
    googleEmail?: string;
    accessToken?: string;
    refreshToken?: string;
    expiryDateMs?: number;
    tokenType?: string;
    scope?: string;
  },
): Promise<void> {
  const ref = getGoogleDriveDocRef(agentId);
  const payload: GoogleDriveDocShape = {
    provider: 'google_drive',
    connected: true,
    googleEmail: tokens.googleEmail ?? null,
    accessToken: tokens.accessToken ?? null,
    refreshToken: tokens.refreshToken ?? null,
    expiryDateMs: tokens.expiryDateMs ?? null,
    tokenType: tokens.tokenType ?? null,
    scope: tokens.scope ?? null,
    connectedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await ref.set(compactObject(payload), { merge: true });
}

export async function updateGoogleDriveTokens(
  agentId: string,
  tokens: {
    googleEmail?: string;
    accessToken?: string;
    refreshToken?: string;
    expiryDateMs?: number;
    tokenType?: string;
    scope?: string;
  },
): Promise<void> {
  const ref = getGoogleDriveDocRef(agentId);
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (tokens.googleEmail !== undefined) payload.googleEmail = tokens.googleEmail;
  if (tokens.accessToken !== undefined) payload.accessToken = tokens.accessToken;
  if (tokens.refreshToken !== undefined) payload.refreshToken = tokens.refreshToken;
  if (tokens.expiryDateMs !== undefined) payload.expiryDateMs = tokens.expiryDateMs;
  if (tokens.tokenType !== undefined) payload.tokenType = tokens.tokenType;
  if (tokens.scope !== undefined) payload.scope = tokens.scope;

  await ref.set(payload, { merge: true });
}

export async function getGoogleDriveIntegration(agentId: string): Promise<GoogleDriveIntegrationRecord | null> {
  const snap = await getGoogleDriveDocRef(agentId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    connected: data.connected === true,
    googleEmail: typeof data.googleEmail === 'string' ? data.googleEmail : undefined,
    accessToken: typeof data.accessToken === 'string' ? data.accessToken : undefined,
    refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : undefined,
    expiryDateMs: typeof data.expiryDateMs === 'number' ? data.expiryDateMs : undefined,
    tokenType: typeof data.tokenType === 'string' ? data.tokenType : undefined,
    scope: typeof data.scope === 'string' ? data.scope : undefined,
    connectedAt: toIsoStringOptional(data.connectedAt),
    updatedAt: toIsoStringOptional(data.updatedAt),
  };
}

export async function clearGoogleDriveIntegration(agentId: string): Promise<void> {
  await getGoogleDriveDocRef(agentId).delete().catch(() => {});
}

export async function createGoogleOAuthState(agentId: string, stateId: string): Promise<void> {
  const ref = getGoogleOAuthStateDocRef(agentId, stateId);
  const now = Date.now();
  const payload: GoogleOAuthStateDocShape = {
    stateId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAtMs: now + OAUTH_STATE_TTL_MS,
  };
  await ref.set(payload);
}

export async function consumeGoogleOAuthState(stateRaw: string): Promise<{ agentId: string } | null> {
  const [agentId, stateId] = decodeState(stateRaw);
  if (!agentId || !stateId) return null;

  const ref = getGoogleOAuthStateDocRef(agentId, stateId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const data = snap.data() as Record<string, unknown>;
  const expiresAtMs = typeof data.expiresAtMs === 'number' ? data.expiresAtMs : 0;
  await ref.delete().catch(() => {});
  if (!expiresAtMs || Date.now() > expiresAtMs) return null;

  return { agentId };
}

export function buildGoogleOAuthState(agentId: string, stateId: string): string {
  return Buffer.from(`${agentId}:${stateId}`, 'utf8').toString('base64url');
}

function decodeState(stateRaw: string): [string | null, string | null] {
  try {
    const decoded = Buffer.from(stateRaw, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 2) return [null, null];
    const [agentId, stateId] = parts;
    if (!agentId || !stateId) return [null, null];
    return [agentId, stateId];
  } catch {
    return [null, null];
  }
}

function compactObject<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== undefined) {
      out[k as keyof T] = v as T[keyof T];
    }
  }
  return out;
}

function toIsoStringOptional(value: unknown): string | undefined {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : undefined;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
