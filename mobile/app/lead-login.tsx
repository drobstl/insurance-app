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
 * Lead-login (code-entry) screen. Reached from a small link on /activate
 * for users who got their app code from an agent before being sold a
 * policy. Two acceptable code shapes:
 *
 *   - **Derived (default)**: 10 digits = the lead's own phone number.
 *     The agent says "your code is your phone number" on the call.
 *   - **Random fallback**: `L` + 7 alphanumerics. Generated when the
 *     phone-derived code collides with another lead in the system.
 *
 * Distinct from /login (the post-Activate code-entry for clients) for
 * two reasons:
 *
 * 1. We can't add a "skip Activate" link on /activate that lets clients
 *    bypass the welcome flow — Daniel locked that path for clients (see
 *    feedback_no_client_activate_skip.md). A separate route lets us
 *    refuse non-lead codes at this entry point and route any client
 *    codes back through the Activate gate.
 *
 * 2. Copy + UX is different. Leads are pre-clients; the framing here is
 *    "this'll get you ready for your call with [agent]" rather than
 *    "you're almost in to your account."
 *
 * If a user accidentally enters a client code, we show a clear error
 * rather than silently routing them past Activate.
 */

function looksLikeLeadCode(code: string): boolean {
  if (code.length === 10 && /^\d{10}$/.test(code)) return true;       // derived
  if (code.length === 8 && code.startsWith('L')) return true;         // fallback
  return false;
}

export default function LeadLoginScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter your phone number');
      return;
    }
    if (!looksLikeLeadCode(trimmed)) {
      // Most likely a client code (6 chars) or a typo.
      setError(
        'That doesn\'t look right. Enter your 10-digit phone number (just the digits, no dashes).',
      );
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await lookupClientCode(trimmed);
      if (result.accessType !== 'lead') {
        // Defense in depth: server says it's not a lead. Refuse here too.
        setError(
          'That code isn\'t for the lead app. Go back and tap Activate to set up your account.',
        );
        return;
      }

      await saveSession({
        clientCode: trimmed,
        agentId: result.agentId,
        clientId: result.clientId,
      });
      await saveProfileCache(result);

      navigateToProfile(
        result.agentId,
        result.clientId,
        result.clientData,
        result.agentData,
        result.accessType,
        result.linqLinePhone || '',
      );
    } catch (err) {
      if (err instanceof InvalidCodeError) {
        setError("We couldn't find that code. Double-check it with your agent.");
      } else {
        console.error('lead login error:', err);
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
          <Text style={styles.title}>Get ready for your call.</Text>
          <Text style={styles.subtitle}>
            Enter your phone number — that&apos;s your code.
          </Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.contentSection}
        >
          <SafeAreaView style={styles.formSafeArea}>
            <View style={styles.formContainer}>
              <Text style={styles.label}>Your Phone Number</Text>
              <Text style={styles.helper}>
                Just the 10 digits, no dashes. Example: 8163821302
              </Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={(text) => {
                  // Phone-only mode: strip non-digits as the user types so
                  // "(816) 382-1302" still becomes "8163821302".
                  setCode(text.replace(/\D/g, ''));
                  setError('');
                }}
                placeholder="8163821302"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!loading}
                maxLength={10}
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
                  <Text style={styles.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace('/activate' as never)}
                style={styles.backLink}
              >
                <Text style={styles.backLinkText}>← Back</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  topSafeArea: { backgroundColor: '#0D4D4D' },
  container: { flex: 1, backgroundColor: '#0D4D4D' },
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
  logoIconText: { fontSize: 38, color: '#FFFFFF', fontWeight: 'bold' },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
  },
  contentSection: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  formSafeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  formContainer: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 36,
    justifyContent: 'flex-start',
  },
  label: { fontSize: 16, fontWeight: '600', color: '#2D3748', marginBottom: 6 },
  helper: { fontSize: 13, color: '#6B7280', marginBottom: 12, lineHeight: 18 },
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
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center', fontWeight: '500' },
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
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  backLink: { alignSelf: 'center', paddingVertical: 12 },
  backLinkText: { color: '#6B7280', fontSize: 15, fontWeight: '500' },
});
