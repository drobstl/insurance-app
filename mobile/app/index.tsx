import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { registerForPushNotificationsAsync } from './_layout';
import * as SecureStore from 'expo-secure-store';

const API_BASE = __DEV__ ? 'http://192.168.1.210:3000' : 'https://agentforlife.app';

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
  accessType?: 'client' | 'beneficiary';
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
    accessType: data.accessType === 'beneficiary' ? 'beneficiary' : 'client',
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
  accessType: 'client' | 'beneficiary' = 'client',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _linqLinePhone: string = '',
) {
  const clientCode = (clientData.clientCode as string) || '';
  if (accessType === 'client') {
    registerAndSavePushToken(clientCode).catch((err) =>
      console.warn('Push token registration failed:', err),
    );
  }

  // May 8, 2026 flow inversion: activation happens BEFORE login on
  // the activate-first entry screen (`/activate`), not after. So
  // post-login we always route straight to /agent-profile regardless
  // of `clientActivatedAt`. If activation never fired (race, user
  // backed out of iMessage), the client just doesn't get push
  // notifications — agent profile still works.
  const sharedParams = {
    agentId,
    agentName: (agentData.name as string) || 'Your Agent',
    agentEmail: (agentData.email as string) || '',
    agentPhone: (agentData.phoneNumber as string) || '',
    agentPhotoBase64: (agentData.photoBase64 as string) || '',
    agencyName: (agentData.agencyName as string) || '',
    agencyLogoBase64: (agentData.agencyLogoBase64 as string) || '',
    clientId,
    clientName: (clientData.name as string) || 'Client',
    referralMessage: (agentData.referralMessage as string) || '',
    businessCardBase64: (agentData.businessCardBase64 as string) || '',
  };

  router.replace({
    pathname: '/agent-profile',
    params: sharedParams,
  });
}

/**
 * Default route — session router.
 *
 * Pre-May-8 the default route was the login (code-entry) screen, with
 * activation gated behind it. The May 8 flow inversion makes the
 * activate-first screen the unauthenticated entry. So this default
 * route is now a thin session check:
 *
 *   - With cached session → auto-login → `/agent-profile`
 *   - No cached session → `/activate` (depersonalized; user activates
 *     first, then enters code on `/login`)
 *
 * The login (code-entry) UI now lives in `mobile/app/login.tsx`.
 */
export default function IndexScreen() {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session) {
          router.replace('/activate' as never);
          return;
        }

        let result: LookupResult | null = null;
        let networkFailed = false;

        try {
          result = await lookupClientCode(session.clientCode);
        } catch (err) {
          if (err instanceof InvalidCodeError) {
            await clearSession();
            router.replace('/activate' as never);
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
              router.replace('/activate' as never);
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
        <Text style={styles.loadingTitle}>My Insurance</Text>
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
