import { useCallback, useEffect, useRef, useState } from 'react';
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
// Important: the top-level `expo-file-system` import in SDK 54+ is
// the new File/Directory API which DOES NOT export `cacheDirectory`,
// `writeAsStringAsync`, or `downloadAsync`. The legacy path-based API
// these calls rely on lives at `expo-file-system/legacy`. Importing
// from the top level here was a silent bug: `cacheDirectory` came
// back as undefined and the attachment materialize step bailed out
// before doing anything, producing an iMessage composer with no
// attachments and no visible error.
import * as FileSystem from 'expo-file-system/legacy';
import { auth } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getAgentIdToken } from '../../lib/agent-session';
import { API_BASE } from '../../lib/api-base';

/**
 * /send/[apptId] — the magic moment.
 *
 * Triggered by a push notification tap (or scanning a send-link QR
 * during testing). Wakes up, fetches everything needed to send the
 * booking confirmation, then honors the agent's saved channel:
 *   - text  → materializes attachments + opens iMessage with recipient
 *     + body + attachments pre-filled (the magic moment), then stamps.
 *   - email → shows a review screen first (email is irreversible, with
 *     no native composer to confirm in); on confirm, the server sends
 *     via Resend and stamps server-side.
 * Either way the agent can switch channel at the decision point.
 *
 * Result states:
 *   - 'loading'   — fetching appointment data or downloading attachments
 *   - 'composing' — Messages composer is open (waiting on the user)
 *   - 'review'    — email default: confirm recipient + body before send
 *   - 'sent'      — send succeeded, timestamp stamped
 *   - 'cancelled' — user dismissed the composer without sending
 *   - 'error'     — something blew up; show retry / the other channel
 *
 * After 'sent' or 'cancelled', we auto-route back to /agent-home after
 * a brief beat so the agent isn't stuck on this screen.
 */

type Status = 'loading' | 'composing' | 'review' | 'sent' | 'cancelled' | 'error';

interface ConfirmationBundle {
  appointmentId: string;
  kind: 'confirmation' | 'reminder';
  leadFirstName: string;
  leadPhone: string;
  leadEmail: string;
  leadStateCode: string;
  /** Agent's saved delivery default; the phone can override per-send. */
  channel: 'text' | 'email';
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
  const [attachmentDebug, setAttachmentDebug] = useState<string>('');
  const [bundle, setBundle] = useState<ConfirmationBundle | null>(null);

  // Carried across button-triggered sends (which can fire after the
  // initial load effect resolved), so we don't re-fetch the token or
  // set state on an unmounted screen.
  const idTokenRef = useRef<string>('');
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const goHomeSoon = useCallback(() => {
    setTimeout(() => {
      if (mountedRef.current) router.replace('/agent-home' as never);
    }, 1500);
  }, []);

  // ── TEXT send — the magic moment ──
  // Materialize attachments, open the native Messages composer with
  // recipient + body + attachments pre-filled, then stamp the send.
  const runTextSend = useCallback(
    async (b: ConfirmationBundle) => {
      try {
        if (!b.leadPhone) {
          setStatus('error');
          setErrorMessage('This lead doesn’t have a phone number on file.');
          return;
        }
        setStatus('loading');
        setStatusDetail('Preparing attachments…');
        const { attachments, status: attachStatus } = await materializeAttachments(b);
        if (!mountedRef.current) return;
        setAttachmentDebug(attachStatus);

        // Confirm SMS is even available. False on simulator + browser
        // + devices with no SMS account configured.
        const smsAvailable = await SMS.isAvailableAsync();
        if (!mountedRef.current) return;
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
          [b.leadPhone],
          b.message,
          attachments.length > 0 ? { attachments } : undefined,
        );
        if (!mountedRef.current) return;

        // Treat 'sent' and 'unknown' the same — Android always returns
        // 'unknown', and on iOS 'unknown' shouldn't happen for us. We
        // only skip the stamp on an explicit 'cancelled'.
        if (result === 'cancelled') {
          setStatus('cancelled');
          goHomeSoon();
          return;
        }

        // Stamp the appointment as confirmation/reminder sent.
        setStatusDetail('Saving…');
        await stampSent({
          apptId: b.appointmentId,
          kind,
          idToken: idTokenRef.current,
          attachedBusinessCard: attachments.some((a) => a.filename.includes('business-card')),
          attachedLicenseState: attachments.some((a) => a.filename.includes('-license'))
            ? b.leadStateCode
            : '',
        });
        if (!mountedRef.current) return;
        setStatus('sent');
        goHomeSoon();
      } catch (err) {
        if (!mountedRef.current) return;
        console.error('text send error:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      }
    },
    [kind, goHomeSoon],
  );

  // ── EMAIL send — server-side, irreversible ──
  // No native composer; the server sends via Resend and stamps the
  // appointment itself, so there's nothing to stamp client-side.
  const runEmailSend = useCallback(
    async (b: ConfirmationBundle) => {
      try {
        if (!b.leadEmail || !b.leadEmail.includes('@')) {
          setStatus('error');
          setErrorMessage('This lead doesn’t have an email on file. You can text it instead.');
          return;
        }
        setStatus('loading');
        setStatusDetail('Sending email…');
        await sendConfirmationEmail({
          apptId: b.appointmentId,
          kind,
          idToken: idTokenRef.current,
          message: b.message,
        });
        if (!mountedRef.current) return;
        setStatus('sent');
        goHomeSoon();
      } catch (err) {
        if (!mountedRef.current) return;
        console.error('email send error:', err);
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: string }).code)
            : '';
        setStatus('error');
        setErrorMessage(
          code === 'no_email'
            ? 'This lead doesn’t have an email on file. You can text it instead.'
            : err instanceof Error
              ? err.message
              : 'Email failed to send.',
        );
      }
    },
    [kind, goHomeSoon],
  );

  // The main flow: fetch the bundle, then route to the agent's saved
  // channel. Text auto-fires (the magic moment). Email shows a review
  // screen first — email is irreversible and there's no native
  // composer to confirm in, so we never auto-send it.
  useEffect(() => {
    if (!apptId) {
      setStatus('error');
      setErrorMessage('No appointment ID. Try opening the notification again.');
      return;
    }
    (async () => {
      try {
        setStatus('loading');
        setStatusDetail('Loading appointment…');

        const idToken = await getAgentIdToken();
        if (!mountedRef.current) return;
        if (!idToken) {
          setStatus('error');
          setErrorMessage('You need to be signed in. Pair your phone again from the dashboard.');
          return;
        }
        idTokenRef.current = idToken;

        const fetchUrl = `${API_BASE}/api/mobile/agent-confirmation/${encodeURIComponent(apptId)}?kind=${kind}`;
        const res = await fetch(fetchUrl, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Could not load appointment (${res.status})`);
        }
        const b: ConfirmationBundle = await res.json();
        if (!mountedRef.current) return;
        setBundle(b);

        const wantsEmail =
          b.channel === 'email' && Boolean(b.leadEmail && b.leadEmail.includes('@'));
        if (wantsEmail) {
          // Email default + a usable address → let the agent confirm
          // before the (irreversible) send.
          setStatus('review');
        } else {
          // Text default, or email default with no address on file →
          // fall through to the text auto-fire so the agent always
          // lands somewhere actionable.
          await runTextSend(b);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        console.error('send-confirmation load error:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      }
    })();
    // We intentionally only re-fire if apptId/kind changes, not on
    // every render — load is a one-shot per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apptId, kind]);

  const canEmail = Boolean(bundle?.leadEmail && bundle.leadEmail.includes('@'));

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {status === 'loading' || status === 'composing' ? (
            <>
              <ActivityIndicator size="large" color="#3DD6C3" />
              <Text style={styles.title}>{statusDetail}</Text>
            </>
          ) : status === 'review' ? (
            <>
              <Text style={styles.title}>Send by email?</Text>
              <Text style={styles.recipient}>To: {bundle?.leadEmail}</Text>
              <View style={styles.previewBox}>
                <Text style={styles.previewText}>{bundle?.message}</Text>
              </View>
              <Text style={styles.fineprint}>
                Sends from AgentForLife with your name — replies come straight to your inbox.
              </Text>
              <Pressable style={styles.button} onPress={() => bundle && runEmailSend(bundle)}>
                <Text style={styles.buttonText}>Send email</Text>
              </Pressable>
              <Pressable
                style={styles.buttonSecondary}
                onPress={() => bundle && runTextSend(bundle)}
              >
                <Text style={styles.buttonSecondaryText}>Text it instead</Text>
              </Pressable>
            </>
          ) : status === 'sent' ? (
            <>
              <Text style={styles.bigGlyph}>✓</Text>
              <Text style={styles.title}>Sent.</Text>
              <Text style={styles.body}>Confirmation is on its way.</Text>
              {attachmentDebug ? (
                <Text style={styles.debug}>{attachmentDebug}</Text>
              ) : null}
            </>
          ) : status === 'cancelled' ? (
            <>
              <Text style={styles.title}>Didn’t send</Text>
              <Text style={styles.body}>No worries — you can resend from the dashboard.</Text>
              {canEmail && bundle ? (
                <Pressable style={styles.button} onPress={() => runEmailSend(bundle)}>
                  <Text style={styles.buttonText}>Email it instead</Text>
                </Pressable>
              ) : null}
              {attachmentDebug ? (
                <Text style={styles.debug}>{attachmentDebug}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.title}>Couldn’t send</Text>
              <Text style={styles.body}>{errorMessage}</Text>
              {canEmail && bundle ? (
                <Pressable style={styles.button} onPress={() => runEmailSend(bundle)}>
                  <Text style={styles.buttonText}>Email it instead</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={canEmail ? styles.buttonSecondary : styles.button}
                onPress={() => router.replace('/agent-home' as never)}
              >
                <Text style={canEmail ? styles.buttonSecondaryText : styles.buttonText}>Back</Text>
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
async function materializeAttachments(bundle: ConfirmationBundle): Promise<{
  attachments: Array<{ uri: string; mimeType: string; filename: string }>;
  status: string;
}> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return { attachments: [], status: 'no cache dir' };

  const out: Array<{ uri: string; mimeType: string; filename: string }> = [];
  const debug: string[] = [];

  // Business card (image, from base64).
  const card = bundle.attachments.businessCard;
  if (!card) {
    debug.push('card: not in bundle');
  } else if (card.alreadySent) {
    debug.push('card: already sent');
  } else if (!card.base64) {
    debug.push('card: no base64');
  } else {
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
      debug.push('card: ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('business card materialize failed (non-fatal):', err);
      debug.push(`card: FAIL ${msg.slice(0, 60)}`);
    }
  }

  // License (PDF/image, from signed URL).
  const lic = bundle.attachments.license;
  if (!lic) {
    debug.push('license: not in bundle');
  } else if (lic.alreadySent) {
    debug.push('license: already sent');
  } else if (!lic.signedUrl) {
    debug.push('license: no signedUrl');
  } else {
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
      debug.push(`license: ok (${downloaded.status})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('license materialize failed (non-fatal):', err);
      debug.push(`license: FAIL ${msg.slice(0, 60)}`);
    }
  }

  return { attachments: out, status: debug.join(' | ') };
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

/**
 * POST to the email-delivery endpoint. Unlike the text path, the
 * server does the actual send (via Resend) AND the sent-stamp, so on
 * success there's nothing left to do client-side. On failure we throw
 * an Error carrying the server's `code` (e.g. 'no_email') so the
 * caller can show a tailored message + offer the text fallback.
 */
async function sendConfirmationEmail(args: {
  apptId: string;
  kind: 'confirmation' | 'reminder';
  idToken: string;
  message: string;
}): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/appointments/${encodeURIComponent(args.apptId)}/send-confirmation-email`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.idToken}`,
      },
      body: JSON.stringify({ kind: args.kind, message: args.message }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.error || `Email failed (${res.status})`) as Error & {
      code?: string;
    };
    if (body?.code) err.code = body.code;
    throw err;
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
  buttonSecondary: {
    marginTop: 14,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  buttonSecondaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  recipient: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
    textAlign: 'center',
  },
  previewBox: {
    alignSelf: 'stretch',
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  previewText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 21,
  },
  fineprint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 14,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  debug: {
    marginTop: 24,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
