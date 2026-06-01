import * as SecureStore from 'expo-secure-store';
import { signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { API_BASE } from './api-base';

/**
 * Agent session helpers — distinct from the client session in
 * `mobile/app/index.tsx`. Agents authenticate via Firebase Auth using
 * a custom token issued by `/api/agent-pair/exchange` after a QR pair
 * scan. We keep a small marker in SecureStore so the app can show a
 * splash + route to /agent-home immediately on cold start without
 * waiting for Firebase auth-state hydration.
 *
 * Client sessions remain untouched — different code path, different
 * storage key, no shared state. An agent who somehow also has a
 * client session on the same device would resolve to /agent-home
 * (agent check runs first in the root index).
 */

const AGENT_SESSION_KEY = 'agent_session';

export interface AgentSession {
  /** Firebase Auth uid — matches `agents/{uid}` in Firestore. */
  uid: string;
  /** Agent's display name, cached so /agent-home can render before any
   *  network call settles. */
  agentName: string;
  /** Cached agency name (optional, for the welcome screen header). */
  agencyName?: string;
  /** Wall-clock millis when the pair completed. */
  pairedAtMs: number;
}

export async function saveAgentSession(session: AgentSession): Promise<void> {
  await SecureStore.setItemAsync(AGENT_SESSION_KEY, JSON.stringify(session));
}

export async function getAgentSession(): Promise<AgentSession | null> {
  const raw = await SecureStore.getItemAsync(AGENT_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentSession;
  } catch {
    return null;
  }
}

export async function clearAgentSession(): Promise<void> {
  await SecureStore.deleteItemAsync(AGENT_SESSION_KEY);
  try {
    await signOut(auth);
  } catch (err) {
    // Sign-out is best-effort here. The SecureStore delete is the
    // authoritative "you're signed out as far as this app cares" gate.
    console.warn('Firebase sign-out failed during agent session clear:', err);
  }
}

/**
 * Errors the pair endpoint can return. Surface these in the UI so the
 * agent knows whether to ask the dashboard for a fresh code or just
 * tap "try again".
 */
export class PairCodeError extends Error {
  code: 'invalid-code' | 'expired' | 'already-used' | 'internal' | 'network';
  constructor(code: PairCodeError['code'], message?: string) {
    super(message || code);
    this.name = 'PairCodeError';
    this.code = code;
  }
}

/**
 * Trade the scanned pairing code for a Firebase custom token, sign in,
 * fetch the agent profile basics for the cached session, save it.
 *
 * On success, the Firebase auth state is now the agent's user — the
 * caller can navigate to /agent-home and the rest of the app can use
 * `auth.currentUser` and `getIdToken()` normally.
 *
 * On failure, throws PairCodeError with a `code` field the UI uses to
 * render a specific message.
 */
export async function signInWithPairCode(code: string): Promise<AgentSession> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/agent-pair/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch (err) {
    throw new PairCodeError('network', String(err));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errCode = body?.error || 'internal';
    if (errCode === 'expired' || errCode === 'already-used' || errCode === 'invalid-code') {
      throw new PairCodeError(errCode);
    }
    throw new PairCodeError('internal');
  }

  const data: { customToken: string; agentId: string } = await res.json();

  // Firebase exchange of custom token → ID token + session. This is
  // synchronous-ish; on success `auth.currentUser` is populated.
  const userCred = await signInWithCustomToken(auth, data.customToken);
  const user = userCred.user;

  // Pull a few profile fields so /agent-home can render without
  // a network hop on next launch. Read directly from Firestore —
  // the agent is now signed in and security rules allow reading
  // their own agent doc. Best-effort — if these fail we still
  // proceed with sensible defaults.
  let agentName = user.displayName || 'Agent';
  let agencyName = '';
  try {
    const agentDoc = await getDoc(doc(db, 'agents', data.agentId));
    if (agentDoc.exists()) {
      const profile = agentDoc.data();
      const candidateName =
        typeof profile?.name === 'string' ? profile.name :
        typeof profile?.fullName === 'string' ? profile.fullName :
        typeof profile?.displayName === 'string' ? profile.displayName :
        '';
      if (candidateName) agentName = candidateName;
      if (typeof profile?.agencyName === 'string') agencyName = profile.agencyName;
    }
  } catch (err) {
    console.warn('agent profile read failed (non-fatal):', err);
  }

  const session: AgentSession = {
    uid: data.agentId,
    agentName: agentName || 'Agent',
    agencyName,
    pairedAtMs: Date.now(),
  };
  await saveAgentSession(session);
  return session;
}

/**
 * Get a fresh Firebase ID token for the currently signed-in agent.
 * Returns null if no agent is signed in.
 */
export async function getAgentIdToken(): Promise<string | null> {
  const user: User | null = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch (err) {
    console.warn('getAgentIdToken failed:', err);
    return null;
  }
}

/**
 * Register this device's Expo push token against the agent's profile.
 * Idempotent — calling twice with the same token is fine.
 *
 * Designed to be called from /agent-home after the session is in
 * place. Push permission must already be granted (the standard
 * registerForPushNotificationsAsync from _layout handles that).
 */
export async function registerAgentPushToken(pushToken: string): Promise<boolean> {
  if (!pushToken) return false;
  const idToken = await getAgentIdToken();
  if (!idToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/agent-push-token/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ pushToken }),
    });
    return res.ok;
  } catch (err) {
    console.warn('registerAgentPushToken failed:', err);
    return false;
  }
}
