import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  Linking,
} from 'react-native';
import { router } from 'expo-router';

/**
 * /agent-welcome — fallback landing for agents who installed AFL from
 * the App Store and tapped "Open" inside the App Store (instead of
 * tapping back to return to Safari, where the pair flow would have
 * auto-resumed).
 *
 * Reached via a discreet "Are you an agent?" link on /activate. Clients
 * who tap it confused will read "head to your dashboard on your laptop"
 * and back out — no harm done.
 *
 * This screen does NOT try to be a sign-in UI. The agent has no email
 * sign-in in the first build of this feature — the only sign-in path
 * is the QR pair scan from the dashboard. So we just direct them back
 * to where they need to start.
 */
const DASHBOARD_URL = 'https://agentforlife.app/dashboard/pair-phone';

export default function AgentWelcomeScreen() {
  const handleOpenDashboard = () => {
    Linking.openURL(DASHBOARD_URL).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Welcome to Agent for Life.</Text>
          <Text style={styles.subtitle}>
            Looks like you’re an agent setting up your phone.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardHeader}>Two-minute setup</Text>
            <View style={styles.step}>
              <Text style={styles.stepNum}>1</Text>
              <Text style={styles.stepText}>
                On your laptop, go to{'\n'}
                <Text style={styles.url}>agentforlife.app/dashboard</Text>
              </Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNum}>2</Text>
              <Text style={styles.stepText}>
                Click your profile (top-right) →{'\n'}
                <Text style={styles.bold}>Set up my phone</Text>
              </Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNum}>3</Text>
              <Text style={styles.stepText}>
                Point your iPhone camera at the QR code
              </Text>
            </View>
            <Text style={styles.afterStep}>
              You’ll land back in this app, signed in. Bookings on the dashboard will
              buzz your phone with a notification you tap to send the confirmation.
            </Text>
          </View>

          <Pressable style={styles.primaryButton} onPress={handleOpenDashboard}>
            <Text style={styles.primaryButtonText}>Open dashboard</Text>
          </Pressable>
          <Text style={styles.primaryButtonHint}>
            Better on a laptop — the QR’s easier to scan from a bigger screen.
          </Text>

          <Pressable
            style={styles.backLink}
            onPress={() => router.replace('/' as never)}
          >
            <Text style={styles.backLinkText}>Not an agent — go back</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  safe: {
    flex: 1,
  },
  scroll: {
    padding: 24,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 8,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
  },
  cardHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0D4D4D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0D4D4D',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  url: {
    fontWeight: '700',
    color: '#0D4D4D',
  },
  bold: {
    fontWeight: '700',
  },
  afterStep: {
    fontSize: 13,
    color: '#555',
    marginTop: 8,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  primaryButton: {
    backgroundColor: '#3DD6C3',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0D4D4D',
    fontSize: 16,
    fontWeight: '700',
  },
  primaryButtonHint: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  backLink: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 28,
  },
  backLinkText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
