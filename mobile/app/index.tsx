import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { registerForPushNotificationsAsync } from './_layout';
import * as SecureStore from 'expo-secure-store';

const API_BASE = __DEV__ ? 'http://192.168.1.210:3000' : 'https://agentforlife.app';

const SESSION_KEY = 'client_session';
const PROFILE_CACHE_KEY = 'profile_cache';

interface SavedSession {
  clientCode: string;
  agentId: string;
  clientId: string;
}

type LookupResult = {
  agentId: string;
  clientId: string;
  clientData: Record<string, unknown>;
  agentData: Record<string, unknown>;
  accessType?: 'client' | 'beneficiary';
  /** Phase 1 Track B — Linq line phone number for the in-app Activate screen. */
  linqLinePhone?: string;
};

class InvalidCodeError extends Error {
  constructor() {
    super('Invalid client code');
    this.name = 'InvalidCodeError';
  }
}

async function saveSession(session: SavedSession) {
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

async function saveProfileCache(result: LookupResult) {
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

async function lookupClientCode(clientCode: string): Promise<LookupResult> {
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

function navigateToProfile(
  agentId: string,
  clientId: string,
  clientData: Record<string, unknown>,
  agentData: Record<string, unknown>,
  accessType: 'client' | 'beneficiary' = 'client',
  linqLinePhone: string = '',
) {
  const clientCode = (clientData.clientCode as string) || '';
  if (accessType === 'client') {
    registerAndSavePushToken(clientCode).catch((err) =>
      console.warn('Push token registration failed:', err),
    );
  }

  // Phase 1 Track B — route unactivated clients through the in-app
  // Activate screen first. v3.1 §3.3: client taps Activate, which
  // composes a pre-filled sms: outbound to the Linq line; the webhook
  // (web/app/api/linq/webhook/route.ts > handleWelcomeActivationInbound)
  // recognizes the inbound via the welcome_pending_{clientId}
  // placeholder thread the action item writer pre-registered.
  //
  // Beneficiaries skip the Activate screen for now — the v3.1
  // beneficiary invite mechanic (parallel architecture, deferred to
  // Phase 2 per CONTEXT.md > Phased Roadmap > Phase 2) will introduce
  // a beneficiary-specific activation flow when it ships.
  const alreadyActivated = !!clientData.clientActivatedAt;
  const shouldShowActivate = accessType === 'client' && !alreadyActivated;

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

  if (shouldShowActivate) {
    // expo-router regenerates its typed pathname union from the
    // filesystem on every dev-server / EAS build; until that runs,
    // '/activate' is missing from the union and TS errors. Cast keeps
    // tsc green; runtime behavior is identical.
    router.replace({
      pathname: '/activate' as never,
      params: {
        ...sharedParams,
        linqLinePhone,
      },
    });
    return;
  }

  router.replace({
    pathname: '/agent-profile',
    params: sharedParams,
  });
}

export default function LoginScreen() {
  const [clientCode, setClientCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session) {
          setCheckingSession(false);
          return;
        }

        let result: LookupResult | null = null;
        let networkFailed = false;

        try {
          result = await lookupClientCode(session.clientCode);
        } catch (err) {
          if (err instanceof InvalidCodeError) {
            await clearSession();
            setCheckingSession(false);
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
              setCheckingSession(false);
              return;
            }
            console.warn('Auto-login retry failed, falling back to cache');
          }
        }

        if (!result) {
          const cached = await getProfileCache();
          if (cached) {
            navigateToProfile(cached.agentId, cached.clientId, cached.clientData, cached.agentData, cached.accessType || 'client', cached.linqLinePhone || '');
            return;
          }
          setCheckingSession(false);
          return;
        }

        await saveProfileCache(result);
        navigateToProfile(result.agentId, result.clientId, result.clientData, result.agentData, result.accessType || 'client', result.linqLinePhone || '');
      } catch (err) {
        console.error('Auto-login error:', err);
        const cached = await getProfileCache();
        if (cached) {
          navigateToProfile(cached.agentId, cached.clientId, cached.clientData, cached.agentData, cached.accessType || 'client', cached.linqLinePhone || '');
          return;
        }
        setCheckingSession(false);
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (!clientCode.trim()) {
      setError('Please enter your client code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await lookupClientCode(clientCode);

      await saveSession({
        clientCode: clientCode.trim().toUpperCase(),
        agentId: result.agentId,
        clientId: result.clientId,
      });
      await saveProfileCache(result);

      navigateToProfile(result.agentId, result.clientId, result.clientData, result.agentData, result.accessType || 'client', result.linqLinePhone || '');
    } catch (err) {
      if (err instanceof InvalidCodeError) {
        setError('Invalid client code. Please check and try again.');
      } else {
        console.error('Login error:', err);
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <View style={styles.outerContainer}>
        <SafeAreaView style={styles.topSafeArea} />
        <View style={styles.loadingContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoIconText}>✓</Text>
          </View>
          <Text style={styles.loadingTitle}>My Insurance</Text>
          <ActivityIndicator color="#3DD6C3" size="large" style={{ marginTop: 24 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <SafeAreaView style={styles.topSafeArea} />
      
      <View style={styles.container}>
      <View style={styles.headerSection}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoIconText}>✓</Text>
        </View>
        <Text style={styles.title}>My Insurance</Text>
        <Text style={styles.subtitle}>Access your policy information</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.contentSection}
      >
          <SafeAreaView style={styles.formSafeArea}>
        <View style={styles.formContainer}>
          <Text style={styles.label}>Client Code</Text>
          <TextInput
            style={styles.input}
            value={clientCode}
            onChangeText={(text) => {
              setClientCode(text.toUpperCase());
              setError('');
            }}
            placeholder="Enter your code"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!loading}
          />

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helpText}>
            Your client code was provided by your insurance agent.
            Contact your agent if you need assistance.
          </Text>
        </View>
          </SafeAreaView>
      </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topSafeArea: {
    backgroundColor: '#0D4D4D',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0D4D4D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 20,
  },
  container: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 24,
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
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  contentSection: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  formSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 36,
    justifyContent: 'flex-start',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 22,
    color: '#2D3748',
    marginBottom: 20,
    letterSpacing: 3,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#3DD6C3',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#3DD6C3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  helpText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
});
