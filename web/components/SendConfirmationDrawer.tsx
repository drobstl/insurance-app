'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import { composeMessage } from '../lib/booking-confirmation';

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
  /** Lead's state from PDF extraction (`address.state`). May be null/empty. */
  leadState?: string | null;
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

const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA',
  'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX',
  'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'PR',
];

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
    // Fetch the PDF bytes for the share sheet.
    const pdfRes = await fetch(url);
    if (!pdfRes.ok) return { file: null, signedUrl: url };
    const blob = await pdfRes.blob();
    const file = new File([blob], `${stateCode}-license.pdf`, { type: 'application/pdf' });
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
  leadState,
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
  }), [leadName, agentName, scheduledAt, scheduledAtTimeZone, leadState, meetingUrl, kind]);

  const [message, setMessage] = useState(initialMessage);

  // State for license matching. If the lead has a state from
  // extraction, default to it; otherwise the agent picks. We let
  // the agent override either way.
  const initialState = (leadState || '').toUpperCase();
  const [pickedState, setPickedState] = useState<string>(
    initialState && US_STATE_CODES.includes(initialState) ? initialState : '',
  );
  const matchedLicense = pickedState ? licenses[pickedState] : null;
  const agentLicensedStates = useMemo(() => Object.keys(licenses).sort(), [licenses]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licenseSignedUrl, setLicenseSignedUrl] = useState<string | null>(null);
  const [hasShareApi, setHasShareApi] = useState(false);
  // After the desktop sms: send fires, swap the drawer body to a
  // "Drag these in" panel with previews + Copy buttons. Lets the
  // agent finish the attachment hand-off without leaving AFL.
  const [postSendOpen, setPostSendOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Platform tier:
  //   - 'mobile' (iPhone/Android) → Web Share is direct-to-Messages
  //     with recipient + body + all files (including PDFs) pre-filled.
  //     Magical, one-tap.
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
      if ('canShare' in navigator) setHasShareApi(true);
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      setPlatform('mac');
      if ('canShare' in navigator) setHasShareApi(true);
    } else {
      setPlatform('other');
      // Other desktops use sms: + drag fallback, no Web Share path.
    }
  }, []);

  // Mac two-button state machine. 'idle' shows "Open message draft".
  // After step 1 fires, advances to 'opened' which shows "Attach card
  // + license". After step 2 fires, stamps sent + closes.
  const [macStep, setMacStep] = useState<'idle' | 'opened'>('idle');

  // QR/deep-link to iPhone modal.
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

  // Determine which attachments to actually include based on what's
  // already been sent to this lead. Agents shouldn't re-send the
  // same business card / license PDF on every reminder — once it's
  // on the lead's phone, it stays there.
  const licenseAlreadySent = pickedState
    ? Boolean(attachmentsSent?.licensesByState?.[pickedState])
    : false;
  const willAttachBusinessCard = !businessCardAlreadySent && Boolean(businessCardFile);
  const willAttachLicense = !licenseAlreadySent && Boolean(licenseFile) && Boolean(matchedLicense);

  /**
   * Fire a browser download for a File by creating a temporary
   * blob-URL anchor and clicking it. Used in the desktop sms: path
   * (which can't carry attachments) so the agent has the files
   * waiting in their Downloads to drag into Messages.
   */
  const triggerBrowserDownload = useCallback((file: File) => {
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a short delay so the download actually picks up.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.warn('triggerBrowserDownload failed:', err);
    }
  }, []);

  /**
   * Copy a File to the clipboard so the agent can paste it into
   * Messages with Cmd+V. Images go in as image data; PDFs fall back
   * to a download (Clipboard API doesn't reliably accept PDFs across
   * browsers).
   */
  const copyFileToClipboard = useCallback(async (file: File, key: string) => {
    try {
      if (file.type.startsWith('image/') && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({ [file.type]: file }),
        ]);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800);
        return;
      }
      // PDFs / non-image fallback — re-download. Most macOS Messages
      // flows accept drag from Downloads more reliably than clipboard
      // PDFs anyway.
      triggerBrowserDownload(file);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800);
    } catch (err) {
      console.warn('copyFileToClipboard failed:', err);
      triggerBrowserDownload(file);
    }
  }, [triggerBrowserDownload]);

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
   *  this opens Messages via Continuity. */
  const buildSmsUrl = useCallback(() => {
    const phoneDigits = leadPhone.replace(/\D/g, '');
    if (phoneDigits.length < 7) return null;
    // iPhone/iPad URL grammar uses `&` between phone and body;
    // everything else (macOS, Android desktop) uses `?`.
    const delim = navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad') ? '&' : '?';
    return `sms:${phoneDigits}${delim}body=${encodeURIComponent(message)}`;
  }, [leadPhone, message]);

  // ── Send paths (one per platform tier) ──

  /** Mobile (iPhone / Android) — Web Share API delivers recipient +
   *  body + files in one shot. No `title` (would surface as an
   *  iMessage subject and confuse the lead). */
  const handleSendMobile = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const files = buildFiles();
      if (
        files.length > 0 &&
        typeof navigator !== 'undefined' &&
        'canShare' in navigator &&
        navigator.canShare({ files, text: message })
      ) {
        await navigator.share({ files, text: message });
        await stampSent(attachedReport);
        onSent();
        return;
      }
      // No files (already-sent dedup) or canShare false: fall back to
      // sms: which on iOS opens Messages with phone + body filled.
      const url = buildSmsUrl();
      if (url) window.location.href = url;
      await stampSent(attachedReport);
      onSent();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled the share sheet — don't stamp.
        return;
      }
      console.error('mobile send error:', err);
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }, [buildFiles, message, stampSent, attachedReport, onSent, buildSmsUrl]);

  /** Mac step 1 — fire `sms:` to open Messages with recipient + body.
   *  No files attached yet. Advances state so the drawer footer shows
   *  step 2. */
  const handleMacStep1 = useCallback(() => {
    setError(null);
    const url = buildSmsUrl();
    if (!url) {
      setError('Lead phone number is missing or too short');
      return;
    }
    // Note: `window.location.href = sms:…` would navigate the page
    // away. We use a click on a hidden <a> to open the URL in a
    // way that keeps the AFL tab focused (anchor click is treated
    // as an external app launch, not a navigation).
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setMacStep('opened');
  }, [buildSmsUrl]);

  /** Mac step 2 — `navigator.share({ files })` only (no text, no
   *  title). The picked Messages target should land files into the
   *  thread already focused from step 1. Bet is verified empirically
   *  by Daniel. */
  const handleMacStep2 = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const files = buildFiles();
      if (files.length === 0) {
        // No attachments to send — treat as sent.
        await stampSent(attachedReport);
        onSent();
        return;
      }
      if (typeof navigator === 'undefined' || !('canShare' in navigator) || !navigator.canShare({ files })) {
        setError('This browser cannot attach files via share sheet');
        return;
      }
      await navigator.share({ files });
      await stampSent(attachedReport);
      onSent();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('mac step2 error:', err);
      setError(err instanceof Error ? err.message : 'Attach failed');
    } finally {
      setBusy(false);
    }
  }, [buildFiles, stampSent, attachedReport, onSent]);

  /** Windows / Linux desktop — sms: URL + auto-download attachments
   *  + show drag panel so the agent can drag files into Messages
   *  (or the equivalent SMS bridge on those platforms). */
  const handleSendOther = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (willAttachBusinessCard && businessCardFile) triggerBrowserDownload(businessCardFile);
      if (willAttachLicense && licenseFile) triggerBrowserDownload(licenseFile);
      const url = buildSmsUrl();
      if (url) {
        setTimeout(() => { window.location.href = url; }, 150);
      }
      setPostSendOpen(true);
      await stampSent(attachedReport);
    } catch (err) {
      console.error('desktop send error:', err);
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }, [
    willAttachBusinessCard,
    businessCardFile,
    willAttachLicense,
    licenseFile,
    buildSmsUrl,
    stampSent,
    attachedReport,
    triggerBrowserDownload,
  ]);

  /** "Send from phone" deep-link URL — agent scans QR with phone, the
   *  URL opens AFL in iPhone Safari deep-linked to this drawer. */
  const phoneHandoffUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/dashboard/leads/${leadId}?openConfirmation=${appointmentId}`;
  }, [leadId, appointmentId]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onCancel()} />
      <div className="relative w-full max-w-lg bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-[#ececec] shrink-0">
          <div>
            <h3 className="text-xl font-bold text-[#000000]">
              {kind === 'reminder' ? 'Send reminder' : 'Send confirmation'}
            </h3>
            <p className="text-xs text-[#707070] mt-0.5">
              Sends from your phone.
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
            <p className="text-[11px] text-[#707070] mt-1">To: {leadPhone}</p>
          </div>

          {/* State / license matching */}
          <div className="rounded-[5px] border border-[#d0d0d0] bg-[#fafafa] p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-xs font-semibold text-[#374151]">License attachment</p>
                {matchedLicense && licenseAlreadySent ? (
                  <p className="text-[11px] text-[#707070] mt-0.5">
                    {pickedState} license already on file with this lead — won&apos;t re-attach.
                  </p>
                ) : matchedLicense ? (
                  <p className="text-[11px] text-[#005851] mt-0.5">
                    {pickedState} license #{matchedLicense.number} will be attached.
                    {licenseLoading && (
                      <span className="ml-1.5 text-amber-700">· Loading PDF…</span>
                    )}
                  </p>
                ) : pickedState ? (
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    You&apos;re not licensed in {pickedState}. Sending without license.
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Lead&apos;s state isn&apos;t on file. Pick the state to attach a license.
                  </p>
                )}
              </div>
            </div>
            <select
              value={pickedState}
              onChange={(e) => setPickedState(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
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

          {/* Send method explanation, branched by platform tier. */}
          <div className="rounded-[5px] border border-[#45bcaa]/30 bg-[#daf3f0]/30 p-3 text-xs text-[#0D4D4D] leading-relaxed">
            {platform === 'mobile' && (
              <>
                <strong>iPhone / Android:</strong> Tap Send → your share sheet opens with
                files + message ready. Pick Messages → tap send. Done.
              </>
            )}
            {platform === 'mac' && (
              <>
                <strong>macOS:</strong> Two clicks. <strong>1.</strong> Opens Messages with
                the recipient + message ready. <strong>2.</strong> Pops the share sheet
                so you can drop the card + license into the open thread. Or use the
                <em> Send from iPhone</em> link below for a one-tap version on your phone.
              </>
            )}
            {platform === 'other' && (
              <>
                <strong>Desktop:</strong> Tap Send → Messages opens with the text ready.
                Attachments don&apos;t auto-attach via SMS protocol — files download to
                your tray and a panel appears so you can drag them into the message.
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
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={busy}
              className="flex-1 max-w-[140px] py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
            >
              Not now
            </button>

            {/* Platform-specific primary action.
                - mobile (iPhone/Android): single-tap Web Share. Magic.
                - mac: two-button flow — step 1 fires `sms:` URL,
                  step 2 fires `navigator.share({ files })` so files
                  land in the focused Messages thread.
                - other desktop: sms: + auto-download + drag panel. */}
            {platform === 'mobile' && (
              <button
                onClick={handleSendMobile}
                disabled={busy || licenseLoading}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
                title={licenseLoading ? 'Waiting for license PDF to finish loading…' : undefined}
              >
                {licenseLoading ? 'Loading license…' : busy ? 'Opening…' : 'Send'}
              </button>
            )}

            {platform === 'mac' && macStep === 'idle' && (
              <button
                onClick={handleMacStep1}
                disabled={busy || licenseLoading}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
                title={licenseLoading ? 'Waiting for license PDF to finish loading…' : undefined}
              >
                {licenseLoading ? 'Loading license…' : '1. Open message draft →'}
              </button>
            )}

            {platform === 'mac' && macStep === 'opened' && (
              <button
                onClick={handleMacStep2}
                disabled={busy}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#005851] hover:bg-[#004440] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50 animate-pulse"
              >
                {busy ? 'Opening…' : `2. Attach ${willAttachBusinessCard && willAttachLicense ? 'card + license' : willAttachBusinessCard ? 'card' : 'license'} →`}
              </button>
            )}

            {platform === 'other' && (
              <button
                onClick={handleSendOther}
                disabled={busy || licenseLoading}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
                title={licenseLoading ? 'Waiting for license PDF to finish loading…' : undefined}
              >
                {licenseLoading ? 'Loading license…' : busy ? 'Opening…' : 'Send'}
              </button>
            )}
          </div>

          {/* Mac step-1 hint between clicks. Confirms Messages should
              be open and tells the agent what's about to happen. */}
          {platform === 'mac' && macStep === 'opened' && (
            <p className="text-[11px] text-[#005851] text-center px-2">
              Messages opened with the text — now click <strong>Attach</strong> and pick Messages in the share sheet. Files will drop into the open thread.
            </p>
          )}

          {/* "Send from phone" hand-off — available on every desktop
              tier. Opens a QR modal that the agent scans with their
              iPhone; the URL deep-links into AFL on the phone where
              iOS Web Share delivers the magical one-tap flow. */}
          {platform !== 'mobile' && (
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              disabled={busy}
              className="w-full py-2 px-3 text-xs font-semibold text-[#005851] hover:text-[#003832] hover:bg-white rounded-[5px] transition-colors disabled:opacity-50"
            >
              📱 Or scan with your iPhone to send from there →
            </button>
          )}
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
                <h3 className="text-xl font-bold text-[#005851]">Send from your iPhone</h3>
                <p className="text-xs text-[#707070] mt-1 leading-relaxed max-w-md">
                  Open your iPhone&apos;s camera, point it at the QR code, and tap the notification. AFL opens on your phone with this confirmation ready to send — one tap and it&apos;s out the door.
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

        {/* Post-send overlay — appears AFTER the sms: fires on desktop.
            Files have been auto-downloaded; this panel shows previews +
            Copy/Drag affordances so the agent can paste them into Messages
            without leaving AFL. Closes via "Done" → onSent(). */}
        {postSendOpen && (
          <div className="absolute inset-0 z-10 bg-white flex flex-col">
            <div className="p-5 border-b border-[#ececec]">
              <h3 className="text-xl font-bold text-[#005851]">Drag these into Messages →</h3>
              <p className="text-xs text-[#707070] mt-1 leading-relaxed">
                Messages is opening with the text + phone prefilled. The files are saved to your Downloads folder. Drag them into the chat (or click <strong>Copy</strong> below and paste with Cmd+V), then hit Send in Messages.
              </p>
            </div>
            <div className="overflow-y-auto p-5 space-y-3 flex-1">
              {willAttachBusinessCard && businessCardFile && (
                <div className="flex items-center gap-3 rounded-[5px] border border-[#d0d0d0] bg-[#fafafa] p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={agentBusinessCardBase64 ? `data:image/jpeg;base64,${agentBusinessCardBase64}` : ''}
                    alt="Business card"
                    className="h-14 w-14 object-cover rounded border border-[#d0d0d0]"
                    draggable
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#374151]">Business card</p>
                    <p className="text-[11px] text-[#707070] truncate">{businessCardFile.name}</p>
                  </div>
                  <button
                    onClick={() => copyFileToClipboard(businessCardFile, 'card')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#005851] hover:bg-[#004440] rounded-[5px]"
                  >
                    {copiedKey === 'card' ? 'Copied ✓' : 'Copy'}
                  </button>
                  <button
                    onClick={() => triggerBrowserDownload(businessCardFile)}
                    className="px-3 py-1.5 text-xs font-semibold text-[#0D4D4D] bg-white border border-[#d0d0d0] rounded-[5px] hover:bg-[#f8f8f8]"
                  >
                    Re-save
                  </button>
                </div>
              )}
              {willAttachLicense && licenseFile && (
                <div className="flex items-center gap-3 rounded-[5px] border border-[#d0d0d0] bg-[#fafafa] p-3">
                  <div className="h-14 w-14 rounded border border-[#d0d0d0] bg-white flex items-center justify-center text-[10px] font-bold text-[#005851]">
                    PDF
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#374151]">{pickedState} license</p>
                    <p className="text-[11px] text-[#707070] truncate">{licenseFile.name}</p>
                  </div>
                  <button
                    onClick={() => copyFileToClipboard(licenseFile, 'license')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#005851] hover:bg-[#004440] rounded-[5px]"
                  >
                    {copiedKey === 'license' ? 'Copied ✓' : 'Copy'}
                  </button>
                  <button
                    onClick={() => triggerBrowserDownload(licenseFile)}
                    className="px-3 py-1.5 text-xs font-semibold text-[#0D4D4D] bg-white border border-[#d0d0d0] rounded-[5px] hover:bg-[#f8f8f8]"
                  >
                    Re-save
                  </button>
                </div>
              )}
              {!willAttachBusinessCard && !willAttachLicense && (
                <p className="text-sm text-[#707070]">
                  No attachments for this send — message only. Hit Done when you&apos;ve sent in Messages.
                </p>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-[#ececec] bg-[#fafafa]">
              <button
                onClick={() => { setPostSendOpen(false); onSent(); }}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
