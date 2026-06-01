import { useState } from 'react';
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
import {
  InvalidCodeError,
  lookupClientCode,
  saveSession,
  saveProfileCache,
  navigateToProfile,
} from './index';

/**
 * Login (code-entry) screen.
 *
 * Reached from the activate-first entry (`/activate`) after the user
 * sends the activation SMS, OR by direct routing for users who reach
 * the app without going through activate-first (unusual today; a
 * future deep-link or recovery path could route here directly).
 *
 * Auto-login from cached session does NOT route here — it routes
 * straight to /agent-profile via the index.tsx session router.
 *
 * Prior to the May 8, 2026 flow inversion (Daniel's call), this UI
 * lived in `index.tsx` as the default route. Splitting it out so the
 * default route can be the activate-first screen instead.
 */
export default function LoginScreen() {
  const [clientCode, setClientCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // After a "not found" error we surface an agent-specific hint so an
  // agent who installed the app and tried entering their phone number
  // here (instead of pairing from the dashboard) has a clear next step.
  // We don't try to detect agents server-side at this entry point —
  // the canonical agent sign-in is the QR pair flow.
  const [showAgentHint, setShowAgentHint] = useState(false);

  const handleLogin = async () => {
    if (!clientCode.trim()) {
      setError('Please enter your phone number or code');
      return;
    }

    setError('');
    setShowAgentHint(false);
    setLoading(true);

    try {
      const result = await lookupClientCode(clientCode);

      await saveSession({
        clientCode: clientCode.trim().toUpperCase(),
        agentId: result.agentId,
        clientId: result.clientId,
      });
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
      if (err instanceof InvalidCodeError) {
        setError('We couldn\'t find that. Check the number/code and try again.');
        setShowAgentHint(true);
      } else {
        console.error('Login error:', err);
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.outerContainer}>
      <SafeAreaView style={styles.topSafeArea} />

      <View style={styles.container}>
        <View style={styles.headerSection}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoIconText}>✓</Text>
          </View>
          <Text style={styles.title}>Welcome.</Text>
          <Text style={styles.subtitle}>Enter your phone number or the code your agent sent you.</Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.contentSection}
        >
          <SafeAreaView style={styles.formSafeArea}>
            <View style={styles.formContainer}>
              {/* Notification pre-warning — primes the user (and the
                  agent verbally walking them through this) so the
                  iOS popup that fires on the next screen lands at
                  a moment when they're expecting it and ready to
                  tap Allow. Daniel's call: notifications are
                  load-bearing for the close-of-sale ritual, so the
                  copy needs to set the expectation up front. */}
              <View style={styles.notifyBanner}>
                <Text style={styles.notifyBannerEmoji}>🔔</Text>
                <Text style={styles.notifyBannerText}>
                  We send a notification when your agent has updates about your
                  policies. Tap <Text style={styles.notifyBannerBold}>Allow</Text>{' '}
                  on the next screen.
                </Text>
              </View>

              <Text style={styles.label}>Phone Number or Code</Text>
              <TextInput
                style={styles.input}
                value={clientCode}
                onChangeText={(text) => {
                  setClientCode(text.toUpperCase());
                  setError('');
                  setShowAgentHint(false);
                }}
                placeholder="(555) 123-4567 or AB12CD3"
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
                Use your phone number, or the code your insurance
                agent sent you. Contact your agent if you need help.
              </Text>

              {/* Agent fallback — only shown after a "not found"
                  error. An agent who installed the app and tried to
                  sign in here (instead of pairing via the dashboard
                  QR) gets a clear route to the right path. */}
              {showAgentHint && (
                <TouchableOpacity
                  style={styles.agentHint}
                  onPress={() => router.replace('/agent-welcome' as never)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.agentHintText}>
                    Setting up your phone as an agent? →
                  </Text>
                </TouchableOpacity>
              )}
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
    textAlign: 'center',
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
  notifyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f0f9f8',
    borderWidth: 1,
    borderColor: '#cce5e1',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    gap: 10,
  },
  notifyBannerEmoji: {
    fontSize: 20,
    lineHeight: 22,
  },
  notifyBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  notifyBannerBold: {
    fontWeight: '700',
    color: '#0D4D4D',
  },
  agentHint: {
    marginTop: 24,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  agentHintText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
