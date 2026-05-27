import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SMS from 'expo-sms';
import * as FileSystem from 'expo-file-system';
import { auth } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getAgentIdToken } from '../../lib/agent-session';
import { API_BASE } from '../../lib/api-base';

/**
 * /send/[apptId] — the magic moment.
 *
 * Triggered by a push notification tap (or scanning a send-link QR
 * during testing). Wakes up, fetches everything needed to send the
 * booking confirmation, materializes attachments, opens iMessage with
 * recipient + body + attachments all pre-filled, and stamps the
 * appointment as confirmation-sent.
 *
 * Result states:
 *   - 'loading'  — fetching appointment data or downloading attachments
 *   - 'composing' — Messages composer is open (waiting on the user)
 *   - 'sent'      — composer reported success, send timestamp stamped
 *   - 'cancelled' — user dismissed the composer without sending
 *   - 'error'     — something blew up; show retry
 *
 * After 'sent' or 'cancelled', we auto-route back to /agent-home after
 * a brief beat so the agent isn't stuck on this screen.
 */

type Status = 'loading' | 'composing' | 'sent' | 'cancelled' | 'error';

interface ConfirmationBundle {
  appointmentId: string;
  kind: 'confirmation' | 'reminder';
  leadFirstName: string;
  leadPhone: string;
  leadStateCode: string;
  agentFirstName: string;
  scheduledAtMs: number;
  scheduledAtTimeZone: string | null;
  meetingUrl: string | null;
  message: string;
  attachments: {
    businessCard: {
      base64: string;
      mimeType: string;
      alreadySent: boolean;
    } | null;
    license: {
      signedUrl: string;
      mimeType: string;
      alreadySent: boolean;
    } | null;
  };
}

export default function SendConfirmationScreen() {
  const { apptId, kind: kindParam } = useLocalSearchParams<{
    apptId: string;
    kind?: string;
  }>();
  const kind: 'confirmation' | 'reminder' =
    kindParam === 'reminder' ? 'reminder' : 'confirmation';

  const [status, setStatus] = useState<Status>('loading');
  const [statusDetail, setStatusDetail] = useState('Loading appointment…');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Gate on Firebase auth state. If we got here via push tap on a
  // device that's not signed in as the agent (shouldn't happen, but
  // possible after a sign-out), bounce to root.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/' as never);
      }
    });
    return () => unsub();
  }, []);

  // The main flow.
  useEffect(() => {
    if (!apptId) {
      setStatus('error');
      setErrorMessage('No appointment ID. Try opening the notification again.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setStatus('loading');
        setStatusDetail('Loading appointment…');

        const idToken = await getAgentIdToken();
        if (!idToken) {
          if (cancelled) return;
          setStatus('error');
          setErrorMessage('You need to be signed in. Pair your phone again from the dashboard.');
          return;
        }

        // Fetch the bundle
        const fetchUrl = `${API_BASE}/api/mobile/agent-confirmation/${encodeURIComponent(apptId)}?kind=${kind}`;
        const res = await fetch(fetchUrl, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Could not load appointment (${res.status})`);
        }
        const bundle: ConfirmationBundle = await res.json();
        if (cancelled) return;

        if (!bundle.leadPhone) {
          setStatus('error');
          setErrorMessage('This lead doesn’t have a phone number on file.');
          return;
        }

        // Materialize attachments to local files. We skip anything
        // already-sent (the server signals this via `alreadySent`).
        setStatusDetail('Preparing attachments…');
        const attachments = await materializeAttachments(bundle);
        if (cancelled) return;

        // Confirm SMS is even available. False on simulator + browser
        // + devices with no SMS account configured.
        const smsAvailable = await SMS.isAvailableAsync();
        if (!smsAvailable) {
          setStatus('error');
          setErrorMessage(
            'Your phone doesn’t look ready to send a text. If you’re on a real device with iMessage set up, restart the app and try again.',
          );
          return;
        }

        // Open the composer.
        setStatus('composing');
        setStatusDetail('Opening Messages…');

        const { result } = await SMS.sendSMSAsync(
          [bundle.leadPhone],
          bundle.message,
          attachments.length > 0 ? { attachments } : undefined,
        );

        if (cancelled) return;

        // Treat 'sent' and 'unknown' the same — Android always returns
        // 'unknown', and on iOS 'unknown' shouldn't happen for us. We
        // only skip the stamp on an explicit 'cancelled'.
        if (result === 'cancelled') {
          setStatus('cancelled');
          // Don't stamp, but still route back so the agent isn't stuck.
          setTimeout(() => {
            if (!cancelled) router.replace('/agent-home' as never);
          }, 1500);
          return;
        }

        // Stamp the appointment as confirmation/reminder sent.
        setStatusDetail('Saving…');
        await stampSent({
          apptId,
          kind,
          idToken,
          attachedBusinessCard: attachments.some((a) => a.filename.includes('business-card')),
          attachedLicenseState: attachments.some((a) => a.filename.includes('-license'))
            ? bundle.leadStateCode
            : '',
        });
        if (cancelled) return;
        setStatus('sent');
        setTimeout(() => {
          if (!cancelled) router.replace('/agent-home' as never);
        }, 1500);
      } catch (err) {
        if (cancelled) return;
        console.error('send-confirmation error:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only re-fire if apptId/kind changes, not on
    // every render — composing is a one-shot per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apptId, kind]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {status === 'loading' || status === 'composing' ? (
            <>
              <ActivityIndicator size="large" color="#3DD6C3" />
              <Text style={styles.title}>{statusDetail}</Text>
            </>
          ) : status === 'sent' ? (
            <>
              <Text style={styles.bigGlyph}>✓</Text>
              <Text style={styles.title}>Sent.</Text>
              <Text style={styles.body}>Confirmation is on its way.</Text>
            </>
          ) : status === 'cancelled' ? (
            <>
              <Text style={styles.title}>Didn’t send</Text>
              <Text style={styles.body}>No worries — you can resend from the dashboard.</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Couldn’t send</Text>
              <Text style={styles.body}>{errorMessage}</Text>
              <Pressable
                style={styles.button}
                onPress={() => router.replace('/agent-home' as never)}
              >
                <Text style={styles.buttonText}>Back</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * Download and write attachments to the device cache, skipping any
 * the lead already has. Returns the list ready for expo-sms.
 *
 * Errors here are non-fatal — if one attachment fails to materialize,
 * we send without it rather than blocking the whole confirmation.
 */
async function materializeAttachments(bundle: ConfirmationBundle): Promise<
  Array<{ uri: string; mimeType: string; filename: string }>
> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return [];

  const out: Array<{ uri: string; mimeType: string; filename: string }> = [];

  // Business card (image, from base64).
  const card = bundle.attachments.businessCard;
  if (card && !card.alreadySent && card.base64) {
    try {
      const filename = 'business-card.jpg';
      const path = `${cacheDir}${filename}`;
      const cleaned = card.base64.replace(/^data:.+;base64,/, '');
      await FileSystem.writeAsStringAsync(path, cleaned, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const uri =
        Platform.OS === 'android' ? await FileSystem.getContentUriAsync(path) : path;
      out.push({ uri, mimeType: card.mimeType, filename });
    } catch (err) {
      console.warn('business card materialize failed (non-fatal):', err);
    }
  }

  // License (PDF/image, from signed URL).
  const lic = bundle.attachments.license;
  if (lic && !lic.alreadySent && lic.signedUrl) {
    try {
      const ext =
        lic.mimeType === 'image/jpeg' ? 'jpg' :
        lic.mimeType === 'image/png' ? 'png' : 'pdf';
      const filename = `${bundle.leadStateCode || 'license'}-license.${ext}`;
      const path = `${cacheDir}${filename}`;
      const downloaded = await FileSystem.downloadAsync(lic.signedUrl, path);
      const uri =
        Platform.OS === 'android'
          ? await FileSystem.getContentUriAsync(downloaded.uri)
          : downloaded.uri;
      out.push({ uri, mimeType: lic.mimeType, filename });
    } catch (err) {
      console.warn('license materialize failed (non-fatal):', err);
    }
  }

  return out;
}

/**
 * POST to the existing /confirmation-sent or /reminder-sent endpoint
 * to stamp the timestamp + lead-attachments-sent record.
 */
async function stampSent(args: {
  apptId: string;
  kind: 'confirmation' | 'reminder';
  idToken: string;
  attachedBusinessCard: boolean;
  attachedLicenseState: string;
}): Promise<void> {
  const endpoint =
    args.kind === 'reminder'
      ? `/api/appointments/${encodeURIComponent(args.apptId)}/reminder-sent`
      : `/api/appointments/${encodeURIComponent(args.apptId)}/confirmation-sent`;
  try {
    await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.idToken}`,
      },
      body: JSON.stringify({
        attachedBusinessCard: args.attachedBusinessCard,
        attachedLicenseState: args.attachedLicenseState,
      }),
    });
  } catch (err) {
    // Best-effort. The user-visible send already happened; we don't
    // want to fail the screen because the stamp fetch hiccuped. The
    // next push trigger will re-evaluate based on this missing stamp,
    // which means the agent might get a redundant notification — but
    // that's better than telling them their send failed.
    console.warn('stampSent failed (non-fatal):', err);
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
  bigGlyph: {
    fontSize: 64,
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
