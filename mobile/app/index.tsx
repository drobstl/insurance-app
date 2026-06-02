import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { registerForPushNotificationsAsync } from './_layout';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '../lib/api-base';
import { getAgentSession } from '../lib/agent-session';

const SESSION_KEY = 'client_session';
const PROFILE_CACHE_KEY = 'profile_cache';

export interface SavedSession {
  clientCode: string;
  agentId: string;
  clientId: string;
}

export type LookupResult = {
  agentId: string;
  clientId: string;
  clientData: Record<string, unknown>;
  agentData: Record<string, unknown>;
  accessType?: 'client' | 'beneficiary' | 'lead';
  /** Phase 1 Track B — Linq line phone number for the in-app Activate screen. */
  linqLinePhone?: string;
};

export class InvalidCodeError extends Error {
  constructor() {
    super('Invalid client code');
    this.name = 'InvalidCodeError';
  }
}

export async function saveSession(session: SavedSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function getSession(): Promise<SavedSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedSession;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(PROFILE_CACHE_KEY);
}

export async function saveProfileCache(result: LookupResult) {
  await SecureStore.setItemAsync(PROFILE_CACHE_KEY, JSON.stringify(result));
}

async function getProfileCache(): Promise<LookupResult | null> {
  const raw = await SecureStore.getItemAsync(PROFILE_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LookupResult;
  } catch {
    return null;
  }
}

export async function lookupClientCode(clientCode: string): Promise<LookupResult> {
  const normalizedCode = clientCode.trim().toUpperCase();
  const res = await fetch(`${API_BASE}/api/mobile/lookup-client-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientCode: normalizedCode }),
  });
  if (res.status === 404) throw new InvalidCodeError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Lookup failed (${res.status})`);
  }
  const data = await res.json();
  return {
    agentId: data.agentId,
    clientId: data.clientId,
    clientData: data.clientData ?? {},
    agentData: data.agentData ?? {},
    accessType:
      data.accessType === 'beneficiary' ? 'beneficiary' :
      data.accessType === 'lead' ? 'lead' :
      'client',
    linqLinePhone: typeof data.linqLinePhone === 'string' ? data.linqLinePhone : '',
  };
}

/**
 * Register for push notifications and save the token via the server API.
 * Retries up to 3 times with exponential backoff.
 * Exported so _layout.tsx can call it on app resume.
 */
export async function registerAndSavePushToken(clientCode: string): Promise<boolean> {
  if (!clientCode) return false;

  const pushToken = await registerForPushNotificationsAsync();
  if (!pushToken) {
    console.log('Push token unavailable (permission denied or simulator)');
    return false;
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/api/push-token/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode, pushToken }),
      });

      if (res.ok) {
        console.log('Push token registered successfully');
        return true;
      }

      const body = await res.json().catch(() => ({}));
      console.warn(`Push token register attempt ${attempt} failed (${res.status}):`, body);
    } catch (networkErr) {
      console.warn(`Push token register attempt ${attempt} network error:`, networkErr);
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  console.error('Push token registration failed after all retries');
  return false;
}

export function navigateToProfile(
  agentId: string,
  clientId: string,
  clientData: Record<string, unknown>,
  agentData: Record<string, unknown>,
  accessType: 'client' | 'beneficiary' | 'lead' = 'client',
  linqLinePhone: string = '',
) {
  const clientCode = (clientData.clientCode as string) || '';
  const clientActivatedAt = (clientData.clientActivatedAt as string | null | undefined) || null;
  const isUnactivatedClient = accessType === 'client' && !clientActivatedAt;

  // Push-token registration is deliberately scoped to ACTIVATED clients
  // only. Unactivated clients land on `/notify` (below), which fires the
  // iOS notification prompt and saves the token in one motion — calling
  // `registerAndSavePushToken` here would double-prompt. Leads and
  // beneficiaries don't participate in the push permission ritual
  // (per the May 18 push-token narrowing: leads get a verbal close-of-
  // sale walkthrough; beneficiaries are invite-only and rely on the
  // policyholder's app). When a lead is converted to a client, the
  // lookup endpoint follows `convertedToClientId` and returns
  // `accessType: 'client'` + `!clientActivatedAt`, routing the prospect
  // to /notify where the prompt fires fresh for the first time.
  if (accessType === 'client' && clientActivatedAt) {
    registerAndSavePushToken(clientCode).catch((err) =>
      console.warn('Push token registration failed:', err),
    );
  }

  const sharedParams = {
    agentId,
    agentName: (agentData.name as string) || 'Your Agent',
    agentEmail: (agentData.email as string) || '',
    agentPhone: (agentData.phoneNumber as string) || '',
    agentPhotoBase64: (agentData.photoBase64 as string) || '',
    agencyName: (agentData.agencyName as string) || '',
    agencyLogoBase64: (agentData.agencyLogoBase64 as string) || '',
    clientId,
    clientCode,
    clientName: (clientData.name as string) || 'Client',
    referralMessage: (agentData.referralMessage as string) || '',
    businessCardBase64: (agentData.businessCardBase64 as string) || '',
  };

  // Lead-mode home is the indoctrination screen (intro video + assessment
  // + FAQ + case studies). Leads do NOT see /activate or the iOS
  // notification prompt — that prompt is saved for the close-of-sale
  // activation ritual (post-convert, the lookup endpoint redirects to
  // the client identity and the next branch routes them to /activate).
  if (accessType === 'lead') {
    router.replace({
      pathname: '/lead-home',
      params: sharedParams,
    });
    return;
  }

  // Unactivated clients land on /notify (the branded push pre-prompt),
  // which fires the OS notification dialog and then forwards to
  // /activate, where the activation SMS to the Linq line composes.
  // This reverses the May 8 "activate-first / login-after" inversion:
  // login is now the unauthenticated entry, and the onboarding pair is
  // gated BEHIND identification so leads bypass it cleanly. Activation
  // remains a hard gate for clients per
  // `feedback_no_client_activate_skip.md`.
  if (isUnactivatedClient) {
    router.replace({
      pathname: '/notify',
      params: { ...sharedParams, linqLinePhone },
    });
    return;
  }

  // Activated clients + beneficiaries land directly on the agent profile.
  router.replace({
    pathname: '/agent-profile',
    params: sharedParams,
  });
}

/**
 * Default route — session router.
 *
 * Reverted to login-first on May 25, 2026 once leads existed as a
 * first-class user type. The May 8 "activate-first" flow optimized for
 * a client-only world; with leads in the mix, /activate is the wrong
 * unauthenticated entry — it fires the iOS notification prompt and uses
 * client-funnel copy that confuses leads who haven't bought yet.
 *
 *   - With cached session → auto-login → `navigateToProfile` routes by
 *     `accessType` + `clientActivatedAt` (lead → /lead-home, unactivated
 *     client → /notify → /activate, activated client / beneficiary →
 *     /agent-profile).
 *   - No cached session → `/login` (user enters phone or code; server
 *     resolves identity; navigateToProfile routes appropriately).
 *
 * Activation remains a hard gate for clients (per
 * `feedback_no_client_activate_skip.md`) — just gated post-login now
 * instead of pre-login.
 */
export default function IndexScreen() {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Agent path takes precedence: a device that's been paired as
        // an agent should always land on /agent-home, even if there's
        // also a leftover client session from earlier dev/testing.
        // /agent-home validates Firebase auth state and clears the
        // marker + routes back here if the session is stale.
        const agentSession = await getAgentSession();
        if (agentSession) {
          router.replace('/agent-home' as never);
          return;
        }

        const session = await getSession();
        if (!session) {
          // Fresh install — no session at all. Route to the
          // phone/code entry screen, which figures out the user's
          // role (lead, client, beneficiary, or hints at agent if
          // not found) and routes them to the right next screen.
          //
          // Previously this routed to /activate, which only works
          // for users who already have a session populated with
          // agent info. Without that data /activate renders broken
          // copy and the user is stranded.
          router.replace('/login' as never);
          return;
        }

        let result: LookupResult | null = null;
        let networkFailed = false;

        try {
          result = await lookupClientCode(session.clientCode);
        } catch (err) {
          if (err instanceof InvalidCodeError) {
            await clearSession();
            router.replace('/login' as never);
            return;
          }
          networkFailed = true;
          console.warn('Auto-login API failed, will retry once:', err);
        }

        if (networkFailed) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            result = await lookupClientCode(session.clientCode);
          } catch (retryErr) {
            if (retryErr instanceof InvalidCodeError) {
              await clearSession();
              router.replace('/login' as never);
              return;
            }
            console.warn('Auto-login retry failed, falling back to cache');
          }
        }

        if (!result) {
          const cached = await getProfileCache();
          if (cached) {
            navigateToProfile(
              cached.agentId,
              cached.clientId,
              cached.clientData,
              cached.agentData,
              cached.accessType || 'client',
              cached.linqLinePhone || '',
            );
            return;
          }
          // No fresh result + no cache — show retry rather than
          // bouncing the user to /activate (which would lose their
          // session).
          setShowRetry(true);
          return;
        }

        await saveProfileCache(result);
        navigateToProfile(
          result.agentId,
          result.clientId,
          result.clientData,
          result.agentData,
          result.accessType || 'client',
          result.linqLinePhone || '',
        );
      } catch (err) {
        console.error('Auto-login error:', err);
        const cached = await getProfileCache();
        if (cached) {
          navigateToProfile(
            cached.agentId,
            cached.clientId,
            cached.clientData,
            cached.agentData,
            cached.accessType || 'client',
            cached.linqLinePhone || '',
          );
          return;
        }
        setShowRetry(true);
      }
    })();
  }, []);

  return (
    <View style={styles.outerContainer}>
      <SafeAreaView style={styles.topSafeArea} />
      <View style={styles.loadingContainer}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoIconText}>✓</Text>
        </View>
        <Text style={styles.loadingTitle}>AgentForLife</Text>
        {showRetry ? (
          <Text style={styles.retryHint}>
            Trouble connecting. Pull down to refresh, or restart the app.
          </Text>
        ) : (
          <ActivityIndicator color="#3DD6C3" size="large" style={{ marginTop: 24 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  topSafeArea: {
    backgroundColor: '#0D4D4D',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0D4D4D',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#3DD6C3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#3DD6C3',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  logoIconText: {
    fontSize: 38,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  loadingTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 20,
  },
  retryHint: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
});
