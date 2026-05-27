import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { PairCodeError, signInWithPairCode } from '../../lib/agent-session';

/**
 * Deep-link landing for `agentforlife://pair/{code}`.
 *
 * What happens here:
 *   1. The QR on the dashboard encodes `https://agentforlife.app/pair/{code}`.
 *   2. The agent scans it; iOS opens Safari, which redirects to
 *      `agentforlife://pair/{code}`.
 *   3. iOS launches AFL; expo-router routes the deep link here.
 *   4. We pull the code from the path param, exchange it for a
 *      custom token, sign in with Firebase Auth, and navigate to
 *      /agent-home.
 *
 * Failure modes are surfaced clearly because the agent is one tap from
 * a fresh dashboard QR if anything's wrong (expired, already used, etc).
 */
export default function PairCodeScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorCode, setErrorCode] = useState<PairCodeError['code'] | null>(null);

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setErrorCode('invalid-code');
      return;
    }
    (async () => {
      try {
        await signInWithPairCode(code);
        setStatus('success');
        // Brief beat so the user sees "signed in", then route.
        setTimeout(() => router.replace('/agent-home' as never), 600);
      } catch (err) {
        setStatus('error');
        if (err instanceof PairCodeError) {
          setErrorCode(err.code);
        } else {
          setErrorCode('internal');
        }
      }
    })();
  }, [code]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        {status === 'pending' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#3DD6C3" />
            <Text style={styles.title}>Signing you in…</Text>
            <Text style={styles.body}>
              Pairing your phone with your dashboard.
            </Text>
          </View>
        )}

        {status === 'success' && (
          <View style={styles.center}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.title}>You’re paired.</Text>
            <Text style={styles.body}>
              When a lead books, you’ll get a notification here.
            </Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.center}>
            <Text style={styles.title}>{errorTitle(errorCode)}</Text>
            <Text style={styles.body}>{errorBody(errorCode)}</Text>
            <Pressable
              style={styles.button}
              onPress={() => router.replace('/' as never)}
            >
              <Text style={styles.buttonText}>Back</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function errorTitle(code: PairCodeError['code'] | null): string {
  switch (code) {
    case 'expired':
      return 'That code expired.';
    case 'already-used':
      return 'That code was already used.';
    case 'invalid-code':
      return 'That code didn’t work.';
    case 'network':
      return 'No internet connection.';
    default:
      return 'Something went wrong.';
  }
}

function errorBody(code: PairCodeError['code'] | null): string {
  switch (code) {
    case 'expired':
    case 'already-used':
      return 'Pull up a fresh QR on your dashboard and scan it again.';
    case 'invalid-code':
      return 'The pairing code looked off. Try scanning a fresh QR.';
    case 'network':
      return 'Check your connection and try again.';
    default:
      return 'Try again, or refresh the QR on your dashboard.';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  safe: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 24,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 22,
  },
  checkmark: {
    fontSize: 60,
    color: '#3DD6C3',
    fontWeight: '700',
  },
  button: {
    marginTop: 32,
    backgroundColor: '#3DD6C3',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: '#0D4D4D',
    fontSize: 16,
    fontWeight: '700',
  },
});
