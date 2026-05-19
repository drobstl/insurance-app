import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';

const INTEGRATIONS_COLLECTION = 'integrations';
const GOOGLE_SUBCOLLECTION = 'google';
const CALENDAR_DOC_ID = 'calendar';

interface GoogleCalendarDocShape {
  provider: 'google_calendar';
  connected: boolean;
  googleEmail?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDateMs?: number | null;
  tokenType?: string | null;
  scope?: string | null;
  calendarId?: string | null;
  connectedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface GoogleCalendarIntegrationRecord {
  connected: boolean;
  googleEmail?: string;
  accessToken?: string;
  refreshToken?: string;
  expiryDateMs?: number;
  tokenType?: string;
  scope?: string;
  calendarId?: string;
  connectedAt?: string;
  updatedAt?: string;
}

export function getGoogleCalendarDocRef(agentId: string) {
  return getAdminFirestore()
    .collection(INTEGRATIONS_COLLECTION)
    .doc(agentId)
    .collection(GOOGLE_SUBCOLLECTION)
    .doc(CALENDAR_DOC_ID);
}

export async function upsertGoogleCalendarTokens(
  agentId: string,
  tokens: {
    googleEmail?: string;
    accessToken?: string;
    refreshToken?: string;
    expiryDateMs?: number;
    tokenType?: string;
    scope?: string;
    calendarId?: string;
  },
): Promise<void> {
  const ref = getGoogleCalendarDocRef(agentId);
  const payload: GoogleCalendarDocShape = {
    provider: 'google_calendar',
    connected: true,
    googleEmail: tokens.googleEmail ?? null,
    accessToken: tokens.accessToken ?? null,
    refreshToken: tokens.refreshToken ?? null,
    expiryDateMs: tokens.expiryDateMs ?? null,
    tokenType: tokens.tokenType ?? null,
    scope: tokens.scope ?? null,
    calendarId: tokens.calendarId ?? null,
    connectedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await ref.set(compactObject(payload), { merge: true });
}

export async function updateGoogleCalendarTokens(
  agentId: string,
  tokens: {
    googleEmail?: string;
    accessToken?: string;
    refreshToken?: string;
    expiryDateMs?: number;
    tokenType?: string;
    scope?: string;
    calendarId?: string;
  },
): Promise<void> {
  const ref = getGoogleCalendarDocRef(agentId);
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (tokens.googleEmail !== undefined) payload.googleEmail = tokens.googleEmail;
  if (tokens.accessToken !== undefined) payload.accessToken = tokens.accessToken;
  if (tokens.refreshToken !== undefined) payload.refreshToken = tokens.refreshToken;
  if (tokens.expiryDateMs !== undefined) payload.expiryDateMs = tokens.expiryDateMs;
  if (tokens.tokenType !== undefined) payload.tokenType = tokens.tokenType;
  if (tokens.scope !== undefined) payload.scope = tokens.scope;
  if (tokens.calendarId !== undefined) payload.calendarId = tokens.calendarId;

  await ref.set(payload, { merge: true });
}

export async function getGoogleCalendarIntegration(
  agentId: string,
): Promise<GoogleCalendarIntegrationRecord | null> {
  const snap = await getGoogleCalendarDocRef(agentId).get();
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
    calendarId: typeof data.calendarId === 'string' ? data.calendarId : undefined,
    connectedAt: toIsoStringOptional(data.connectedAt),
    updatedAt: toIsoStringOptional(data.updatedAt),
  };
}

export async function clearGoogleCalendarIntegration(agentId: string): Promise<void> {
  await getGoogleCalendarDocRef(agentId).delete().catch(() => {});
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
