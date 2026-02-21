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
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { registerForPushNotificationsAsync } from './_layout';
import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://agentforlife.app';

const SESSION_KEY = 'client_session';

interface SavedSession {
  clientCode: string;
  agentId: string;
  clientId: string;
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
}

async function lookupClientCode(clientCode: string) {
  const agentsRef = collection(db, 'agents');
  const agentsSnapshot = await getDocs(agentsRef);

  for (const agentDoc of agentsSnapshot.docs) {
    const clientsRef = collection(db, 'agents', agentDoc.id, 'clients');
    const clientQuery = query(clientsRef, where('clientCode', '==', clientCode.trim().toUpperCase()));
    const clientSnapshot = await getDocs(clientQuery);

    if (!clientSnapshot.empty) {
      return {
        clientId: clientSnapshot.docs[0].id,
        clientData: clientSnapshot.docs[0].data(),
        agentId: agentDoc.id,
      };
    }
  }
  return null;
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

async function navigateToProfile(agentId: string, clientId: string, clientData: Record<string, unknown>) {
  const agentDocRef = doc(db, 'agents', agentId);
  const agentDocSnap = await getDoc(agentDocRef);

  if (!agentDocSnap.exists()) {
    throw new Error('Agent data not found.');
  }

  const agentData = agentDocSnap.data();

  const photoBase64 = (agentData.photoBase64 as string) || '';
  const agentName = (agentData.name as string) || 'Your Agent';
  const agentEmail = (agentData.email as string) || '';
  const agentPhone = (agentData.phoneNumber as string) || '';
  const agencyName = (agentData.agencyName as string) || '';
  const agencyLogoBase64 = (agentData.agencyLogoBase64 as string) || '';
  const referralMessage = (agentData.referralMessage as string) || '';
  const clientName = (clientData.name as string) || 'Client';

  const clientCode = (clientData.clientCode as string) || '';
  registerAndSavePushToken(clientCode).catch((err) =>
    console.warn('Push token registration failed:', err),
  );

  router.replace({
    pathname: '/agent-profile',
    params: {
      agentId,
      agentName,
      agentEmail,
      agentPhone,
      agentPhotoBase64: photoBase64,
      agencyName,
      agencyLogoBase64,
      clientId,
      clientName,
      referralMessage,
      businessCardBase64: (agentData.businessCardBase64 as string) || '',
    },
  });
}

export default function LoginScreen() {
  const [clientCode, setClientCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  // On mount, check for a saved session and auto-login
  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session) {
          setCheckingSession(false);
          return;
        }

        // Validate the saved session is still valid in Firestore
        const clientDocRef = doc(db, 'agents', session.agentId, 'clients', session.clientId);
        const clientDocSnap = await getDoc(clientDocRef);

        if (!clientDocSnap.exists()) {
          // Client was deleted -- clear stale session and show login
          await clearSession();
          setCheckingSession(false);
          return;
        }

        const clientData = clientDocSnap.data();

        // Verify the code still matches (agent may have regenerated it)
        if (clientData.clientCode !== session.clientCode) {
          await clearSession();
          setCheckingSession(false);
          return;
        }

        await navigateToProfile(session.agentId, session.clientId, clientData);
      } catch (err) {
        console.error('Auto-login error:', err);
        await clearSession();
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

      if (result) {
        // Save session for future auto-login
        await saveSession({
          clientCode: clientCode.trim().toUpperCase(),
          agentId: result.agentId,
          clientId: result.clientId,
        });

        await navigateToProfile(result.agentId, result.clientId, result.clientData);
      } else {
        setError('Invalid client code. Please check and try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show a loading screen while checking for saved session
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
      {/* Status bar area with teal background */}
      <SafeAreaView style={styles.topSafeArea} />
      
      <View style={styles.container}>
      {/* Dark Teal Header Section */}
      <View style={styles.headerSection}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoIconText}>✓</Text>
        </View>
        <Text style={styles.title}>My Insurance</Text>
        <Text style={styles.subtitle}>Access your policy information</Text>
      </View>

        {/* White Content Section - extends to bottom */}
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
