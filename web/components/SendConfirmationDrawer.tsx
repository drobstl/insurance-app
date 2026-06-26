'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { US_STATE_CODES, normalizeUsStateCode } from '../lib/us-states';
import { composeMessage } from '../lib/booking-confirmation';
import { deriveLeadCode } from '../lib/lead-code-derive';
import { canAccessLeads } from '../lib/tier-gating';
import { useDashboard } from '../app/dashboard/DashboardContext';
import { db } from '../firebase';
import { captureEvent } from '../lib/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';

// Canonical app smart-download link (mirrors the bundle endpoint at
// web/app/api/mobile/agent-confirmation/[apptId]/route.ts).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/$/, '');
const APP_DOWNLOAD_URL = `${APP_URL}/app`;

/**
 * Booking-confirmation drawer (Chunk 4e).
 *
 * Opens automatically right after the agent saves a booking, and is
 * also reachable from a "Send confirmation" button on existing
 * appointment cards.
 *
 * Composes the locked template with appointment + agent + lead
 * names, looks up the state-matched license PDF, and provides a
 * one-tap "Send" affordance:
 *
 *   - **Web Share API path**: on iOS Safari (15+) and Android Chrome
 *     where `navigator.canShare({ files })` is true, opens the
 *     system share sheet with files + body queued — agent picks
 *     Messages, taps Send.
 *   - **Fallback `sms:` path**: opens the dialer/Messages with body
 *     pre-filled (no attachments — those are surfaced as separate
 *     download links). Used on macOS, desktop browsers, and any
 *     environment without Web Share file support.
 *
 * Either way, after firing the share intent, the drawer POSTs to
 * `/api/appointments/[apptId]/confirmation-sent` to stamp the
 * appointment's sentConfirmationAt. We can't verify the message
 * actually went out (no OS callback), so we stamp on intent.
 */

interface LicenseEntry {
  number: string;
  expiresOn: string | null;
  pdfStoragePath: string;
  uploadedAt: string;
}

interface AttachmentsSent {
  businessCardAt?: string;
  licensesByState?: Record<string, string>;
}

interface Props {
  user: User | null;
  appointmentId: string;
  /** Used to build the deep-link URL for the "Send from phone" QR
   *  hand-off — `${origin}/dashboard/leads/{leadId}?openConfirmation={appointmentId}`. */
  leadId: string;
  leadName: string;
  leadPhone: string;
  /** Lead's email (`lead.email`). Required for the Email channel; when
   *  empty the Email option is shown but blocked with a clear message. */
  leadEmail?: string;
  /**
   * Lead's app login code. Authoritative `lead.leadCode` when present;
   * the drawer falls back to deriving from the phone. Drives the
   * app-access block in the message body (download link + this code).
   */
  leadCode?: string;
  /** Lead's state (`address.state`). May be null/empty. This is the
   *  source of truth for which license attaches — the picker below
   *  defaults to it, and editing the picker rewrites it on the lead. */
  leadState?: string | null;
  /** Notified when the agent edits the state in the picker (after the
   *  drawer has persisted it to the lead). Parents that show their own
   *  state editor (LeadDetailPanel) use it to stay in sync. Optional —
   *  persistence happens regardless of whether this is provided. */
  onLeadStateChange?: (stateCode: string) => void;
  scheduledAt: Date;
  /** IANA TZ captured at booking time; renders time + TZ label in the message. */
  scheduledAtTimeZone?: string | null;
  /** Per-appointment meeting URL; if set, appended as "Join here: …" in the SMS. */
  meetingUrl?: string | null;
  agentName: string;
  /** From agentProfile.businessCardBase64. May be empty. */
  agentBusinessCardBase64?: string;
  /** From agentProfile.licenses keyed by state code. */
  licenses: Record<string, LicenseEntry>;
  /**
   * What's already been sent to this lead. The drawer reads this to
   * skip attachments that the lead already has — agents shouldn't
   * re-send the same business card / license PDF on every reminder.
   * Pass an empty object (or omit) for first-time sends.
   */
  attachmentsSent?: AttachmentsSent;
  /**
   * Which template + which stamp endpoint:
   *   - 'confirmation' → composeMessage({kind:'confirmation'}) + /confirmation-sent
   *   - 'reminder'     → composeMessage({kind:'reminder'})    + /reminder-sent
   * Defaults to 'confirmation' for backward-compat with existing call sites.
   */
  kind?: 'confirmation' | 'reminder';
  onSent: () => void;
  onCancel: () => void;
}

/**
 * Convert a base64 string + mime to a File the Web Share API accepts.
 * The agent's business card lives as base64 on agentProfile —
 * decoding it client-side is fine (small images).
 */
function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const cleaned = base64.replace(/^data:.+;base64,/, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mimeType });
}

async function fetchLicenseFile(
  user: User,
  stateCode: string,
): Promise<{ file: File | null; signedUrl: string | null }> {
  try {
    const token = await user.getIdToken();
    const res = await fetch(`/api/agent-licenses/${stateCode}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { file: null, signedUrl: null };
    const data = await res.json();
    const url = data?.url;
    if (!url) return { file: null, signedUrl: null };
    // contentType is returned by the API as of the JPEG/PNG license
    // support; missing on responses cached before that ships → assume
    // PDF for back-compat.
    const contentType: string = (typeof data?.contentType === 'string' && data.contentType)
      || 'application/pdf';
    const ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'pdf';
    // Fetch the file bytes for the share sheet.
    const fileRes = await fetch(url);
    if (!fileRes.ok) return { file: null, signedUrl: url };
    const blob = await fileRes.blob();
    const file = new File([blob], `${stateCode}-license.${ext}`, { type: contentType });
    return { file, signedUrl: url };
  } catch (err) {
    console.error('fetchLicenseFile error:', err);
    return { file: null, signedUrl: null };
  }
}

export default function SendConfirmationDrawer({
  user,
  appointmentId,
  leadId,
  leadName,
  leadPhone,
  leadEmail,
  leadCode,
  leadState,
  onLeadStateChange,
  scheduledAt,
  scheduledAtTimeZone,
  meetingUrl,
  agentName,
  agentBusinessCardBase64,
  licenses,
  attachmentsSent,
  kind = 'confirmation',
  onSent,
  onCancel,
}: Props) {
  // Pair-phone callout: shown above the message editor when the agent
  // hasn't paired their phone yet. Quiet but persistent — the moment
  // right after booking is the highest-conversion spot for this prompt.
  const router = useRouter();
  const { agentProfile } = useDashboard();
  const phonePaired = Boolean(agentProfile.phonePaired);

  // Delivery channel. Initialized from the agent's saved default; the
  // segmented control below lets them override for THIS send only (we
  // never write the override back to the profile).
  const [channel, setChannel] = useState<'text' | 'email'>(
    agentProfile.confirmationChannel === 'email' ? 'email' : 'text',
  );
  const leadHasEmail = Boolean(leadEmail && leadEmail.includes('@'));

  // App-access hand-off block (download link + the lead's login code).
  // Mirror the server gate in /api/mobile/agent-confirmation so the
  // text and email bodies match: Pro+ access, opted in (undefined ⇒ ON;
  // only an explicit false opts out), a real intro video recorded, and
  // a resolvable login code. Confirmation-only — composeMessage skips
  // the block on reminders.
  const appAccess = useMemo(() => {
    const proOk = canAccessLeads(
      agentProfile.membershipTier,
      agentProfile.email,
      agentProfile.trialEndsAt,
    );
    const optedIn = agentProfile.includeAppAccessInConfirmations !== false;
    const hasIntro = Boolean(agentProfile.leadContent?.intro?.url?.trim());
    const code = (leadCode || '').trim() || deriveLeadCode(leadPhone) || '';
    if (proOk && optedIn && hasIntro && code) {
      return { downloadUrl: APP_DOWNLOAD_URL, code };
    }
    return null;
  }, [
    agentProfile.membershipTier,
    agentProfile.email,
    agentProfile.trialEndsAt,
    agentProfile.includeAppAccessInConfirmations,
    agentProfile.leadContent,
    leadCode,
    leadPhone,
  ]);

  // Resend-push state for paired agents who didn't catch the auto-push.
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'no_token' | 'failed'>('idle');
  const [resendReason, setResendReason] = useState<string>('');

  // Live "sent from phone" detection.
  //
  // When the agent taps the push notification on their paired phone
  // and either sends or cancels the iMessage composer, the phone-side
  // calls /api/appointments/[id]/confirmation-sent (or reminder-sent)
  // which stamps a timestamp on the appointment doc. By subscribing
  // to the appointment doc here, the dashboard sees that update the
  // moment it lands — and we can show the agent visible confirmation
  // ("Sent from your phone ✓") and auto-close the drawer.
  //
  // Capture the initial timestamp at mount so a reschedule of a
  // previously-sent appointment doesn't immediately trigger the
  // success state. We only fire success when the timestamp CHANGES
  // from whatever it was when this drawer opened.
  const [sentFromPhone, setSentFromPhone] = useState(false);
  const initialStampRef = useRef<number | null>(null);
  // True once this browser's own send has stamped the appointment, so
  // the snapshot listener below treats the resulting timestamp bump as
  // "us", not a phone-push send (otherwise it would flash "Sent from
  // your phone" over the honest local outcome overlay).
  const localSendRef = useRef(false);

  // Post-send outcome — what ACTUALLY went out, not what we intended.
  // Drives a brief honest overlay so the agent knows whether the card /
  // license attached as files, rode along as tap-to-save links, or
  // couldn't be delivered on this device. Set by handleSendMobile.
  //   - 'attached'    → real file delivered via Web Share
  //   - 'link'        → tap-to-save link appended to the SMS body
  //   - 'unavailable' → we wanted to include it but had no URL/file
  //   - 'skip'        → nothing to include (none on file / already sent)
  const [sendOutcome, setSendOutcome] = useState<{
    method: 'share' | 'sms';
    card: 'attached' | 'link' | 'unavailable' | 'skip';
    license: 'attached' | 'link' | 'unavailable' | 'skip';
  } | null>(null);

  // Funnel: at most ONE booking_confirmation_sent per drawer open,
  // whichever channel lands first — the phone-push stamp snapshot can
  // re-deliver and the agent can hammer a send button; the ref guard
  // absorbs both.
  const confirmationTrackedRef = useRef(false);
  const trackConfirmationSent = useCallback(
    (sentVia: 'phone_push' | 'share_sheet' | 'sms_url' | 'email') => {
      if (confirmationTrackedRef.current) return;
      confirmationTrackedRef.current = true;
      captureEvent(ANALYTICS_EVENTS.BOOKING_CONFIRMATION_SENT, {
        lead_id: leadId,
        appointment_id: appointmentId,
        channel: sentVia,
        kind,
      });
    },
    [leadId, appointmentId, kind],
  );

  useEffect(() => {
    if (!user || !appointmentId) return;
    const apptRef = doc(db, 'agents', user.uid, 'appointments', appointmentId);
    const stampField = kind === 'reminder' ? 'sentReminderAt' : 'sentConfirmationAt';
    const unsub = onSnapshot(apptRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const raw = data?.[stampField];
      // Firestore Timestamps have toMillis(); seconds-based shapes
      // expose seconds + nanoseconds. Either way we want a comparable
      // number; null/undefined means "no stamp yet".
      const ms =
        raw && typeof raw.toMillis === 'function' ? raw.toMillis() :
        raw && typeof raw === 'object' && typeof raw.seconds === 'number' ? raw.seconds * 1000 :
        null;
      if (initialStampRef.current === null) {
        initialStampRef.current = ms ?? 0;
        return;
      }
      if (ms !== null && ms > (initialStampRef.current ?? 0)) {
        if (localSendRef.current) {
          // Our own send stamped this — advance the baseline and let the
          // local outcome overlay (not "Sent from your phone") report it.
          initialStampRef.current = ms;
          return;
        }
        trackConfirmationSent('phone_push');
        setSentFromPhone(true);
      }
    });
    return () => unsub();
  }, [user, appointmentId, kind, trackConfirmationSent]);

  // Once the phone-side stamp lands, give the agent a beat to see the
  // success overlay, then fire onSent which closes the drawer.
  useEffect(() => {
    if (!sentFromPhone) return;
    const t = window.setTimeout(() => {
      onSent();
    }, 1800);
    return () => window.clearTimeout(t);
  }, [sentFromPhone, onSent]);

  // After a local (this-browser) send, hold the honest outcome overlay
  // briefly so the agent reads what actually went out, then close.
  useEffect(() => {
    if (!sendOutcome) return;
    const t = window.setTimeout(() => {
      onSent();
    }, 2400);
    return () => window.clearTimeout(t);
  }, [sendOutcome, onSent]);

  const handleResendPush = useCallback(async () => {
    if (!user) return;
    setResendStatus('sending');
    setResendReason('');
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/appointments/${appointmentId}/resend-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResendStatus('failed');
        setResendReason(`http ${res.status}: ${data?.error || 'unknown'}`);
        return;
      }
      if (data.outcome === 'ok') setResendStatus('sent');
      else if (data.outcome === 'no_token' || data.outcome === 'ineligible') {
        setResendStatus('no_token');
        setResendReason(data.reason || data.outcome);
      } else {
        setResendStatus('failed');
        setResendReason(data.reason || data.outcome || 'unknown');
      }
    } catch (err) {
      console.warn('resend push failed:', err);
      setResendStatus('failed');
      setResendReason(err instanceof Error ? err.message : String(err));
    }
  }, [user, appointmentId, kind]);

  // Has the agent's business card already been sent to this lead?
  const businessCardAlreadySent = Boolean(attachmentsSent?.businessCardAt);
  // Has the matched-state license already been sent to this lead?
  // Computed against the picked state below.
  const initialMessage = useMemo(() => composeMessage({
    leadFirstName: leadName,
    agentFirstName: agentName,
    scheduledAt,
    timeZone: scheduledAtTimeZone || undefined,
    // Lead's state drives the SMS-rendered TZ — they read this in
    // their local time, not the agent's.
    leadStateCode: leadState || undefined,
    meetingUrl: meetingUrl || undefined,
    kind,
    appAccess,
  }), [leadName, agentName, scheduledAt, scheduledAtTimeZone, leadState, meetingUrl, kind, appAccess]);

  const [message, setMessage] = useState(initialMessage);

  // State for license matching. The picker IS the lead's state — it
  // defaults to whatever the lead has on file, and editing it rewrites
  // the lead (below) rather than silently attaching a different state's
  // license. So the attached license always matches where the lead lives.
  const [pickedState, setPickedState] = useState<string>(normalizeUsStateCode(leadState));
  const matchedLicense = pickedState ? licenses[pickedState] : null;
  const agentLicensedStates = useMemo(() => Object.keys(licenses).sort(), [licenses]);

  // Persist a picker edit straight to the lead doc. Works from every
  // drawer mount site (panel, leads list, calendar, upcoming card), so
  // the correction sticks regardless of which surface opened the drawer.
  const persistLeadState = useCallback(async (code: string) => {
    if (!user || !leadId) return;
    try {
      await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
        'address.state': code || null,
      });
    } catch (err) {
      console.error('lead state write-back failed:', err);
    }
  }, [user, leadId]);

  const handlePickStateChange = useCallback((raw: string) => {
    const code = normalizeUsStateCode(raw);
    setPickedState(code);
    void persistLeadState(code);
    onLeadStateChange?.(code);
  }, [persistLeadState, onLeadStateChange]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licenseSignedUrl, setLicenseSignedUrl] = useState<string | null>(null);

  // Platform tier:
  //   - 'mobile' (iPhone/Android) → Web Share opens Messages with
  //     body + all files (including PDFs) pre-filled. The Web Share
  //     spec has NO recipient field, so iOS hands the agent an empty
  //     To: line. We copy the lead's phone to clipboard right before
  //     invoking share so the agent can paste it with one tap. The
  //     heads-up text under the Send button (line ~410) explains this.
  //   - 'mac' → macOS desktop. Two-button flow: step 1 fires `sms:`
  //     to open Messages with recipient + body; step 2 fires
  //     `navigator.share({ files })` (files only) so the picked
  //     Messages target lands the files in the currently-focused
  //     thread. Drops `title` to avoid the leak Daniel observed.
  //   - 'other' → Windows/Linux desktop. Falls back to the sms: +
  //     auto-download + drag-panel path.
  const [platform, setPlatform] = useState<'mobile' | 'mac' | 'other'>('other');
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent;
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
      setPlatform('mobile');
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      setPlatform('mac');
    } else {
      setPlatform('other');
      // Other desktops use sms: + drag fallback, no Web Share path.
    }
  }, []);

  // QR/deep-link to phone modal — the canonical desktop bridge.
  const [showQrModal, setShowQrModal] = useState(false);

  // True while we're fetching the license PDF bytes for the matched
  // state. We disable the Send button during this window so the agent
  // doesn't fire the share before the file is ready (would have
  // resulted in the license missing from the attached share).
  const [licenseLoading, setLicenseLoading] = useState(false);

  // Resolve the matched license PDF as a File whenever the state changes.
  useEffect(() => {
    let cancelled = false;
    if (!user || !pickedState || !matchedLicense) {
      setLicenseFile(null);
      setLicenseSignedUrl(null);
      setLicenseLoading(false);
      return;
    }
    setLicenseLoading(true);
    void (async () => {
      const { file, signedUrl } = await fetchLicenseFile(user, pickedState);
      if (cancelled) return;
      setLicenseFile(file);
      setLicenseSignedUrl(signedUrl);
      setLicenseLoading(false);
    })();
    return () => { cancelled = true; setLicenseLoading(false); };
  }, [user, pickedState, matchedLicense]);

  const businessCardFile = useMemo<File | null>(() => {
    if (!agentBusinessCardBase64) return null;
    try {
      return base64ToFile(agentBusinessCardBase64, 'business-card.jpg', 'image/jpeg');
    } catch {
      return null;
    }
  }, [agentBusinessCardBase64]);

  const stampSent = useCallback(async (
    attached: { businessCard: boolean; licenseState: string },
  ) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const endpoint = kind === 'reminder'
        ? `/api/appointments/${appointmentId}/reminder-sent`
        : `/api/appointments/${appointmentId}/confirmation-sent`;
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          attachedBusinessCard: attached.businessCard,
          attachedLicenseState: attached.licenseState,
        }),
      });
    } catch (err) {
      console.error('stampSent error:', err);
    }
  }, [user, appointmentId, kind]);

  // Fetch the agent's business card as a stable public URL. Used only
  // by the SMS fallback (Android / any device where Web Share can't
  // carry files), so the lead still gets a tap-to-save card link in the
  // message body. Server uploads-and-caches on first call; null when
  // the agent has no card on file.
  const fetchBusinessCardUrl = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent-business-card-url', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      return typeof data?.url === 'string' && data.url ? data.url : null;
    } catch (err) {
      console.error('fetchBusinessCardUrl error:', err);
      return null;
    }
  }, [user]);

  // Determine which attachments to actually include based on what's
  // already been sent to this lead. Agents shouldn't re-send the
  // same business card / license PDF on every reminder — once it's
  // on the lead's phone, it stays there.
  const licenseAlreadySent = pickedState
    ? Boolean(attachmentsSent?.licensesByState?.[pickedState])
    : false;
  const willAttachBusinessCard = !businessCardAlreadySent && Boolean(businessCardFile);
  const willAttachLicense = !licenseAlreadySent && Boolean(licenseFile) && Boolean(matchedLicense);

  // ── Helpers shared across send paths ──
  const buildFiles = useCallback(() => {
    const files: File[] = [];
    if (willAttachBusinessCard && businessCardFile) files.push(businessCardFile);
    if (willAttachLicense && licenseFile) files.push(licenseFile);
    return files;
  }, [willAttachBusinessCard, businessCardFile, willAttachLicense, licenseFile]);

  const attachedReport = useMemo(
    () => ({
      businessCard: willAttachBusinessCard,
      licenseState: willAttachLicense ? pickedState : '',
    }),
    [willAttachBusinessCard, willAttachLicense, pickedState],
  );

  /** Build the `sms:` URL with recipient + body pre-filled. On macOS
   *  this opens Messages via Continuity. Defaults to the composed
   *  message; the Android fallback passes a body augmented with
   *  tap-to-save card/license links. */
  const buildSmsUrl = useCallback((body: string = message) => {
    const phoneDigits = leadPhone.replace(/\D/g, '');
    if (phoneDigits.length < 7) return null;
    // iPhone/iPad URL grammar uses `&` between phone and body;
    // everything else (macOS, Android desktop) uses `?`.
    const delim = navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad') ? '&' : '?';
    return `sms:${phoneDigits}${delim}body=${encodeURIComponent(body)}`;
  }, [leadPhone, message]);

  // ── Send paths (one per platform tier) ──

  /** Mobile (iPhone / Android) — Web Share API delivers body + files
   *  in one shot. Recipient pre-fill is NOT supported by the Web
   *  Share spec, so we copy the lead's phone to the system clipboard
   *  right before invoking share. iOS keeps the clipboard alive
   *  across the share-sheet → Messages transition; the agent
   *  long-presses the To: field and taps Paste to fill in the number.
   *  No `title` field (would surface as an iMessage subject and
   *  confuse the lead). */
  const handleSendMobile = useCallback(async () => {
    setError(null);
    setBusy(true);
    // Mark that THIS browser is doing the send, so the appointment-doc
    // snapshot listener doesn't mistake our own stamp for a phone-push
    // send and flash the misleading "Sent from your phone" overlay over
    // the honest local outcome.
    localSendRef.current = true;
    try {
      // Clipboard write must happen inside the same user-gesture as
      // the share invocation. We don't fail the send if clipboard
      // write rejects — Permissions API or transient errors shouldn't
      // block the actual confirmation message.
      const phoneDigits = leadPhone.replace(/\D/g, '');
      if (phoneDigits.length >= 7 && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(leadPhone);
        } catch (clipboardErr) {
          console.warn('clipboard write failed (non-fatal):', clipboardErr);
        }
      }

      const files = buildFiles();
      const hasCanShare = typeof navigator !== 'undefined' && 'canShare' in navigator;

      // ── Path 1 — Web Share with files + text (iOS Safari; modern
      //    Android Chrome). The ONLY path where the card/license
      //    physically attach, so the ONLY path that stamps them sent.
      if (files.length > 0 && hasCanShare && navigator.canShare({ files, text: message })) {
        await navigator.share({ files, text: message });
        trackConfirmationSent('share_sheet');
        await stampSent(attachedReport);
        setSendOutcome({
          method: 'share',
          card: willAttachBusinessCard ? 'attached' : 'skip',
          license: willAttachLicense ? 'attached' : 'skip',
        });
        return;
      }

      // ── Path 2 — `sms:` fallback. Reliable on every phone, but it
      //    CANNOT carry attachments. This was the Android bug: the old
      //    code fell here yet still stamped `attachedReport` (intent),
      //    recording businessCard:true with nothing actually sent.
      //
      //    Fix: (a) append tap-to-save card/license links to the body so
      //    the lead still gets them, and (b) stamp the TRUTH — no files
      //    attached, so businessCard:false / licenseState:''.
      //
      //    Note: the plan floated a bare `navigator.share({ files })`
      //    (files-only) retry for Android targets that reject files+text
      //    together. We intentionally don't do that: a files-only share
      //    drops the message body, and a booking confirmation's text
      //    (date/time/meeting link) is its essential payload. The link
      //    fallback below keeps BOTH the text and the card.
      let cardUrl: string | null = null;
      if (willAttachBusinessCard) cardUrl = await fetchBusinessCardUrl();
      const licenseUrl = willAttachLicense ? licenseSignedUrl : null;

      const extras: string[] = [];
      if (willAttachBusinessCard && cardUrl) extras.push(`My business card: ${cardUrl}`);
      if (willAttachLicense && licenseUrl) extras.push(`My ${pickedState} license: ${licenseUrl}`);
      const body = extras.length > 0 ? `${message}\n\n${extras.join('\n')}` : message;

      const url = buildSmsUrl(body);
      if (url) window.location.href = url;
      trackConfirmationSent('sms_url');
      // Truthful stamp: nothing physically attached over sms:.
      await stampSent({ businessCard: false, licenseState: '' });
      setSendOutcome({
        method: 'sms',
        card: !willAttachBusinessCard ? 'skip' : cardUrl ? 'link' : 'unavailable',
        license: !willAttachLicense ? 'skip' : licenseUrl ? 'link' : 'unavailable',
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled the share sheet — don't stamp, don't close.
        localSendRef.current = false;
        return;
      }
      console.error('mobile send error:', err);
      localSendRef.current = false;
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }, [
    buildFiles, message, stampSent, attachedReport, buildSmsUrl, leadPhone,
    trackConfirmationSent, fetchBusinessCardUrl, licenseSignedUrl,
    willAttachBusinessCard, willAttachLicense, pickedState,
  ]);

  /** Email — server-side send via AFL's verified domain (Resend). The
   *  endpoint composes attachments (business card + state license),
   *  applies the same already-sent dedup, routes replies to the agent's
   *  inbox, and stamps sentConfirmationAt/sentReminderAt itself — so
   *  there's no client-side stampSent here. Works on every platform
   *  (no phone hand-off needed). */
  const handleSendEmail = useCallback(async () => {
    if (!user) return;
    setError(null);
    if (!leadHasEmail) {
      setError('This lead has no email on file. Switch to Text, or add an email to the lead first.');
      return;
    }
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/appointments/${appointmentId}/send-confirmation-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Send the picked state so the server matches the license to the
        // lead's state authoritatively, without racing the write-back above.
        body: JSON.stringify({ kind, message, leadState: pickedState }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === 'no_email') {
          setError('This lead has no email on file. Switch to Text, or add an email to the lead first.');
        } else {
          setError(data?.error || `Email send failed (${res.status})`);
        }
        return;
      }
      trackConfirmationSent('email');
      onSent();
    } catch (err) {
      console.error('email send error:', err);
      setError(err instanceof Error ? err.message : 'Email send failed');
    } finally {
      setBusy(false);
    }
  }, [user, leadHasEmail, appointmentId, kind, message, pickedState, onSent, trackConfirmationSent]);

  /** "Send from phone" deep-link URL — agent scans QR with phone, the
   *  URL opens AFL in iPhone Safari deep-linked to this drawer. */
  const phoneHandoffUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/dashboard/leads/${leadId}?openConfirmation=${appointmentId}`;
  }, [leadId, appointmentId]);

  // Honest, human-readable summary of what physically went out — backs
  // the post-send overlay. 'warn' tone when something the agent expected
  // to send couldn't be attached OR linked on this device.
  const outcomeMessage = useMemo<
    { tone: 'ok' | 'info' | 'warn'; title: string; detail: string } | null
  >(() => {
    if (!sendOutcome) return null;
    const o = sendOutcome;
    // Which items (card/license) ended up in the given status.
    const itemsWith = (...statuses: Array<typeof o.card>) => {
      const parts: string[] = [];
      if (statuses.includes(o.card)) parts.push('business card');
      if (statuses.includes(o.license)) parts.push('license');
      return parts;
    };

    if (o.method === 'share') {
      const attached = itemsWith('attached');
      if (attached.length === 0) {
        return { tone: 'ok', title: 'Confirmation sent', detail: 'Pick Messages and tap send.' };
      }
      return {
        tone: 'ok',
        title: 'Card attached',
        detail: `Your ${attached.join(' + ')} ${attached.length > 1 ? 'are' : 'is'} attached — pick Messages and tap send.`,
      };
    }

    // sms: fallback
    const linked = itemsWith('link');
    const missing = itemsWith('unavailable');
    if (linked.length > 0) {
      return {
        tone: 'info',
        title: 'Card link added to your message',
        detail: `This phone can’t attach files to a text, so a tap-to-save ${linked.join(' + ')} link is in the message instead.`,
      };
    }
    if (missing.length > 0) {
      return {
        tone: 'warn',
        title: 'Couldn’t attach on this device',
        detail: `Your message was sent, but your ${missing.join(' + ')} couldn’t be attached here. Use Email to include ${missing.length > 1 ? 'them' : 'it'}.`,
      };
    }
    return { tone: 'ok', title: 'Confirmation sent', detail: 'Your message is on its way.' };
  }, [sendOutcome]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && !sentFromPhone && !sendOutcome && onCancel()} />
      <div className="relative w-full max-w-lg bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {sentFromPhone && (
          <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center px-6 animate-in fade-in duration-300">
            <div className="w-20 h-20 rounded-full bg-[#3DD6C3] flex items-center justify-center mb-4">
              <svg
                className="w-12 h-12 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xl font-bold text-[#0D4D4D]">Sent from your phone</p>
            <p className="text-sm text-[#555] mt-2 text-center">
              {leadName.split(/\s+/)[0] || 'Your lead'} has the confirmation.
            </p>
          </div>
        )}
        {/* Honest post-send overlay — tells the agent what ACTUALLY went
            out (inline attachment vs tap-to-save link vs nothing). */}
        {sendOutcome && outcomeMessage && (
          <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center px-6 animate-in fade-in duration-300">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
                outcomeMessage.tone === 'warn' ? 'bg-[#F59E0B]' : 'bg-[#3DD6C3]'
              }`}
            >
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                {outcomeMessage.tone === 'warn' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.01M10.34 3.94l-7.2 12.45A1.5 1.5 0 004.44 18.75h15.12a1.5 1.5 0 001.3-2.36L13.66 3.94a1.5 1.5 0 00-2.6 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                )}
              </svg>
            </div>
            <p className="text-xl font-bold text-[#0D4D4D] text-center">{outcomeMessage.title}</p>
            <p className="text-sm text-[#555] mt-2 text-center max-w-xs">{outcomeMessage.detail}</p>
          </div>
        )}
        <div className="flex items-start justify-between p-5 border-b border-[#ececec] shrink-0">
          <div>
            <h3 className="text-xl font-bold text-[#000000]">
              {kind === 'reminder' ? 'Send reminder' : 'Send confirmation'}
            </h3>
            <p className="text-xs text-[#707070] mt-0.5">
              {channel === 'email' ? 'Emails from your account.' : 'Sends from your phone.'}
              {' '}
              {willAttachBusinessCard && willAttachLicense
                ? 'Business card + license attached.'
                : willAttachBusinessCard
                ? 'Business card attached.'
                : willAttachLicense
                ? 'License attached.'
                : (businessCardAlreadySent || licenseAlreadySent)
                ? 'Lead already has your card / license — message only.'
                : 'Message only.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {/* Channel: Text vs Email. Defaults to the agent's saved
              preference (Settings → Booking confirmations); this control
              overrides it for THIS send only. */}
          <div>
            <label className="block text-sm font-medium text-[#000000] mb-1">Send as</label>
            <div className="inline-flex rounded-[5px] border border-[#d0d0d0] overflow-hidden">
              <button
                type="button"
                onClick={() => setChannel('text')}
                disabled={busy}
                className={`px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  channel === 'text' ? 'bg-[#44bbaa] text-white' : 'bg-white text-[#0D4D4D] hover:bg-[#f4f9f9]'
                }`}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setChannel('email')}
                disabled={busy}
                className={`px-5 py-2 text-sm font-semibold border-l border-[#d0d0d0] transition-colors disabled:opacity-50 ${
                  channel === 'email' ? 'bg-[#44bbaa] text-white' : 'bg-white text-[#0D4D4D] hover:bg-[#f4f9f9]'
                }`}
              >
                Email
              </button>
            </div>
            {channel === 'email' && (
              leadHasEmail ? (
                <p className="text-[11px] text-[#707070] mt-1">
                  Sends from AgentForLife with your name; replies come to your inbox.
                </p>
              ) : (
                <p className="text-[11px] text-amber-700 mt-1">
                  This lead has no email on file. Add one to the lead, or switch to Text.
                </p>
              )
            )}
          </div>

          {/* Pair-phone callout — shown only when the agent hasn't paired
              their phone yet. This is the highest-signal moment to nudge
              them: they're about to send a confirmation manually, and the
              alternative is "next time tap your phone twice and you're done."
              Text-channel only — irrelevant to an email send. */}
          {channel === 'text' && !phonePaired && (
            <button
              type="button"
              onClick={() => router.push('/dashboard/pair-phone')}
              className="w-full text-left flex items-start gap-3 p-3 bg-[#f4f9f9] border border-[#d4e8e6] rounded-lg hover:bg-[#eaf3f2] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[#0D4D4D]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#0D4D4D]">
                  Send these in two taps from your phone next time
                </p>
                <p className="text-xs text-[#555] mt-0.5">
                  Pair your phone once — bookings will pop up there automatically.
                </p>
              </div>
              <svg className="w-4 h-4 text-[#0D4D4D] flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Resend-to-phone callout — shown for paired agents. The
              server already fired a push when the appointment was
              created; this gives the agent a recovery path if their
              phone missed it (off, dead battery, weak signal).
              Text-channel only — irrelevant to an email send. */}
          {channel === 'text' && phonePaired && (
            <div className="flex items-start gap-3 p-3 bg-[#f4f9f9] border border-[#d4e8e6] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[#0D4D4D]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#0D4D4D]">
                  Already sent to your phone
                </p>
                <p className="text-xs text-[#555] mt-0.5">
                  {resendStatus === 'sent'
                    ? 'Another notification is on its way.'
                    : resendStatus === 'no_token'
                    ? `Notifications look off on your paired phone. ${resendReason ? `(${resendReason})` : ''}`
                    : resendStatus === 'failed'
                    ? `Couldn’t resend. ${resendReason ? `(${resendReason})` : 'Try again or send below.'}`
                    : 'Didn’t get it? Resend the notification.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResendPush}
                disabled={resendStatus === 'sending' || resendStatus === 'sent'}
                className="text-xs font-semibold text-[#0D4D4D] underline hover:text-[#072f2f] disabled:opacity-50 flex-shrink-0 mt-1"
              >
                {resendStatus === 'sending' ? 'Sending…' : resendStatus === 'sent' ? 'Sent' : 'Resend'}
              </button>
            </div>
          )}

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-[#000000] mb-1">
              Message <span className="text-[#9CA3AF] font-normal">(edit if you want)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
              rows={6}
              className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm leading-relaxed font-mono focus:outline-none focus:border-[#45bcaa]"
            />
            <p className="text-[11px] text-[#707070] mt-1">
              To: {channel === 'email' ? (leadEmail || 'no email on file') : leadPhone}
            </p>
          </div>

          {/* State / license matching */}
          <div className="rounded-[5px] border border-[#d0d0d0] bg-[#fafafa] p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-xs font-semibold text-[#374151]">Lead&apos;s state &amp; license</p>
                {matchedLicense && licenseAlreadySent ? (
                  <p className="text-[11px] text-[#707070] mt-0.5">
                    {pickedState} license already on file with this lead — won&apos;t re-attach.
                  </p>
                ) : matchedLicense ? (
                  <p className="text-[11px] text-[#005851] mt-0.5">
                    Your {pickedState} license #{matchedLicense.number} attaches — matches where the lead lives.
                    {licenseLoading && (
                      <span className="ml-1.5 text-amber-700">· Loading…</span>
                    )}
                  </p>
                ) : pickedState ? (
                  <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                    ⚠ No {pickedState} license on file — this goes out with no license. Upload it in
                    Settings → Licenses, or correct the lead&apos;s state below.
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                    ⚠ This lead&apos;s state isn&apos;t set. Pick it below so your matching license attaches —
                    it saves to the lead too.
                  </p>
                )}
              </div>
            </div>
            <select
              value={pickedState}
              onChange={(e) => handlePickStateChange(e.target.value)}
              disabled={busy}
              className={`w-full px-3 py-2 bg-white border rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa] ${
                pickedState ? 'border-[#d0d0d0]' : 'border-[#FCD34D] bg-[#FFFBEB]'
              }`}
            >
              <option value="">— Pick lead&apos;s state —</option>
              <optgroup label="States you're licensed in">
                {agentLicensedStates.map((s) => (
                  <option key={s} value={s}>{s} (license on file)</option>
                ))}
              </optgroup>
              <optgroup label="All states">
                {US_STATE_CODES.filter((s) => !licenses[s]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </optgroup>
            </select>
            <p className="text-[11px] text-[#707070] mt-1">
              This is where the lead lives. Changing it updates the lead&apos;s state so the right
              license attaches every time.
            </p>
            {licenseSignedUrl && (
              <a
                href={licenseSignedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-2 text-[11px] text-[#44bbaa] hover:text-[#005751] font-semibold"
              >
                Preview {pickedState} license PDF →
              </a>
            )}
          </div>

          {/* Business card preview */}
          <div className="rounded-[5px] border border-[#d0d0d0] bg-[#fafafa] p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-xs font-semibold text-[#374151]">Business card</p>
              {agentBusinessCardBase64 && businessCardAlreadySent && (
                <span className="text-[11px] text-[#707070] font-medium">
                  Already on file with this lead — won&apos;t re-attach
                </span>
              )}
            </div>
            {agentBusinessCardBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/jpeg;base64,${agentBusinessCardBase64}`}
                alt="Your business card"
                className={`max-h-32 rounded border border-[#d0d0d0] ${
                  businessCardAlreadySent ? 'opacity-50' : ''
                }`}
              />
            ) : (
              <p className="text-xs text-amber-700">
                No business card uploaded. Add one in Settings → Branding so it gets
                attached automatically going forward.
              </p>
            )}
          </div>

          {/* Send method explanation, branched by channel then platform. */}
          <div className="rounded-[5px] border border-[#45bcaa]/30 bg-[#daf3f0]/30 p-3 text-xs text-[#0D4D4D] leading-relaxed">
            {channel === 'email' ? (
              <>
                <strong>Email:</strong> Tap Send → we email it from AgentForLife with
                your name on it, your card + license attached. Replies land in your
                inbox. No phone needed.
              </>
            ) : platform === 'mobile' ? (
              <>
                <strong>On your phone:</strong> Tap Send → your share sheet opens with
                files + message ready. Pick Messages → tap send. Done.
                {(willAttachBusinessCard || willAttachLicense) && (
                  <span className="block mt-1 text-[#0D4D4D]/80">
                    If your phone can’t attach files to a text, we’ll add a tap-to-save
                    link instead so your{' '}
                    {willAttachBusinessCard && willAttachLicense
                      ? 'card + license'
                      : willAttachBusinessCard
                      ? 'card'
                      : 'license'}{' '}
                    still gets through.
                  </span>
                )}
              </>
            ) : (
              <>
                <strong>Desktop:</strong> Tap <strong>📱 Send from your phone</strong> →
                a QR pops up → scan it with your phone&apos;s camera → AFL opens on
                your phone with this confirmation ready → tap Send. One smooth flow,
                no copying or dragging.
              </>
            )}
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-[5px] px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-[#ececec] bg-[#fafafa] shrink-0 space-y-2">
          {channel === 'text' && platform === 'mobile' && (
            <div className="rounded-[5px] bg-[#FEF3C7] border border-[#FCD34D] px-3 py-2 text-[11px] text-[#92400E] leading-relaxed">
              <strong>Heads up:</strong> iOS won&apos;t pre-fill the recipient. Tap Send —
              we&apos;ll copy
              <span className="font-mono mx-1">{leadPhone}</span>
              to your clipboard so you can long-press the To: field in Messages and paste.
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={busy}
              className="flex-1 max-w-[140px] py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
            >
              Not now
            </button>

            {/* Primary action diverges by channel, then platform:
                - email: server-side send via Resend — one button, works
                  everywhere, no phone hand-off.
                - text + mobile: tap Web Share to Messages. Body + files
                  pre-filled; recipient is NOT pre-filled by the Web
                  Share spec — we copy the lead's phone to clipboard
                  in handleSendMobile so the agent can paste into the
                  To: field with one long-press.
                - text + desktop (Mac or other): show the QR — agent
                  scans with their phone, AFL opens on phone with the
                  drawer mounted, they tap Send there. */}
            {channel === 'email' ? (
              <button
                onClick={handleSendEmail}
                disabled={busy || !leadHasEmail}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
                title={!leadHasEmail ? 'This lead has no email on file' : undefined}
              >
                {busy ? 'Sending…' : 'Send email'}
              </button>
            ) : platform === 'mobile' ? (
              <button
                onClick={handleSendMobile}
                disabled={busy || licenseLoading}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
                title={licenseLoading ? 'Waiting for license PDF to finish loading…' : undefined}
              >
                {licenseLoading ? 'Loading license…' : busy ? 'Opening…' : 'Send'}
              </button>
            ) : (
              <button
                onClick={() => setShowQrModal(true)}
                disabled={busy || licenseLoading}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
                title={licenseLoading ? 'Waiting for license PDF to finish loading…' : undefined}
              >
                {licenseLoading ? 'Loading license…' : '📱 Send from your phone →'}
              </button>
            )}
          </div>

        </div>

        {/* "Send from phone" QR overlay. Encodes a URL that, when
            opened on the agent's iPhone, deep-links into AFL at the
            lead's detail page with the confirmation drawer auto-open
            for this appointment. Once the agent is on their iPhone,
            iOS Web Share delivers the magical one-tap flow that's
            unattainable on macOS desktop. */}
        {showQrModal && (
          <div className="absolute inset-0 z-20 bg-white flex flex-col">
            <div className="p-5 border-b border-[#ececec] flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#005851]">Scan with your phone</h3>
                <p className="text-xs text-[#707070] mt-1 leading-relaxed max-w-md">
                  Point your phone&apos;s camera at the QR code (iPhone Camera app, or Android Camera / Google Lens). Tap the notification — AFL opens on your phone with this confirmation ready to send. One tap and it&apos;s out the door.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 shrink-0"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center gap-4">
              <div className="bg-white p-4 rounded-[5px] border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px]">
                <QRCodeSVG value={phoneHandoffUrl} size={220} level="M" />
              </div>
              <p className="text-[11px] text-[#9CA3AF] break-all text-center max-w-md px-4">
                {phoneHandoffUrl}
              </p>
              {/^https?:\/\/(localhost|127\.|192\.168\.|10\.|0\.0\.0\.0)/.test(phoneHandoffUrl) && (
                <div className="max-w-md mx-2 px-3 py-2 rounded-[5px] bg-[#FEF3C7] border border-[#FCD34D] text-[11px] text-[#92400E] leading-relaxed">
                  <strong>Dev mode:</strong> your phone can&apos;t reach <code>localhost</code> from Wi-Fi. To test the hand-off locally, start the dev server bound to your Mac&apos;s LAN IP (e.g. <code>HOST=0.0.0.0 npm run dev</code>) and replace <code>localhost</code> in the URL above with your Mac&apos;s IP. Or wait until AFL is deployed — the QR works automatically against the deployed domain.
                </div>
              )}
            </div>
            <div className="p-5 border-t border-[#ececec] bg-[#fafafa]">
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-full py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
