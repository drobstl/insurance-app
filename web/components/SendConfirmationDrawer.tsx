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
      if ('canShare' in navigator) setHasShareApi(true);
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      setPlatform('mac');
      if ('canShare' in navigator) setHasShareApi(true);
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
  }, [buildFiles, message, stampSent, attachedReport, onSent, buildSmsUrl, leadPhone]);

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
                <strong>On your phone:</strong> Tap Send → your share sheet opens with
                files + message ready. Pick Messages → tap send. Done.
              </>
            )}
            {platform !== 'mobile' && (
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
          {platform === 'mobile' && (
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

            {/* Primary action diverges by platform:
                - mobile: tap Web Share to Messages. Body + files
                  pre-filled; recipient is NOT pre-filled by the Web
                  Share spec — we copy the lead's phone to clipboard
                  in handleSendMobile so the agent can paste into the
                  To: field with one long-press.
                - desktop (Mac or other): show the QR — agent scans
                  with their phone, AFL opens on phone with the drawer
                  mounted, they tap Send there. */}
            {platform === 'mobile' ? (
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
