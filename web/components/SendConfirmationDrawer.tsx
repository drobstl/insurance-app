'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { User } from 'firebase/auth';
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

  // Web Share API on every platform that supports it — including
  // macOS desktop. Daniel verified empirically (May 14, commit
  // 8203ece) that macOS Safari/Chrome's share-sheet → Messages path
  // pre-fills recipient + body + business card image when both
  // `text` and `title` are passed to navigator.share(); the share
  // sheet appears to parse the title for contact context. A May 15
  // pass disabled this gate based on a different machine's test —
  // we're restoring the original behavior. macOS-specific fallback
  // (sms: + auto-download + drag panel) only fires if Web Share
  // throws or canShare returns false.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'canShare' in navigator) {
      setHasShareApi(true);
    }
  }, []);

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

  // ── Send flow ──
  const handleSend = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const phoneDigits = leadPhone.replace(/\D/g, '');
      const files: File[] = [];
      if (willAttachBusinessCard && businessCardFile) files.push(businessCardFile);
      if (willAttachLicense && licenseFile) files.push(licenseFile);

      const attachedReport = {
        businessCard: willAttachBusinessCard,
        licenseState: willAttachLicense ? pickedState : '',
      };

      // Try Web Share API with files first.
      if (
        hasShareApi &&
        files.length > 0 &&
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        'canShare' in navigator &&
        navigator.canShare({ files, text: message })
      ) {
        try {
          // Pass `title` along with files + text. Daniel verified
          // empirically that macOS share-sheet → Messages uses the
          // title for context inference — it pre-fills the recipient
          // when the title contains the lead's name (the share sheet
          // appears to do a Contacts / Messages-history lookup against
          // the name). A May 15 commit removed title claiming it
          // leaked into SMS bodies on macOS — that observation may
          // have been a different bug, and removing title is what
          // broke the recipient pre-fill. Restoring.
          await navigator.share({
            files,
            text: message,
            title: `Appointment ${kind === 'reminder' ? 'reminder' : 'confirmation'} for ${leadName}`,
          });
          await stampSent(attachedReport);
          onSent();
          return;
        } catch (shareErr) {
          // User cancelled the share sheet — don't stamp, don't error.
          if (shareErr instanceof Error && shareErr.name === 'AbortError') {
            setBusy(false);
            return;
          }
          // Fall through to sms: path
          console.warn('Web Share failed, falling back to sms:', shareErr);
        }
      }

      // Fallback: open Messages with body via `sms:` AND auto-download
      // attachments. The `sms:` protocol can't carry files, so the
      // agent drags them in from Downloads (or pastes via the Copy
      // buttons in the drawer's "Drag these in" panel that renders
      // post-send). On macOS this round-trips through Continuity so
      // Messages opens with phone + body prefilled.
      if (willAttachBusinessCard && businessCardFile) {
        triggerBrowserDownload(businessCardFile);
      }
      if (willAttachLicense && licenseFile) {
        triggerBrowserDownload(licenseFile);
      }
      if (phoneDigits.length >= 7) {
        const delim = navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad') ? '&' : '?';
        const url = `sms:${phoneDigits}${delim}body=${encodeURIComponent(message)}`;
        // Brief delay so the downloads fire before navigation steals
        // focus — important on Chrome where window.location.href can
        // cancel pending downloads.
        setTimeout(() => {
          window.location.href = url;
        }, 150);
      }
      // Show the post-send "Drag these in" panel so the agent has a
      // visual handoff (preview + Copy buttons) for the dragged files.
      setPostSendOpen(true);
      await stampSent(attachedReport);
      // Don't call onSent() here — the agent still needs the post-send
      // panel visible while they drag the files into Messages. They
      // close it via the Done button at the bottom of the panel.
    } catch (err) {
      console.error('send confirmation error:', err);
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }, [
    hasShareApi,
    willAttachBusinessCard,
    willAttachLicense,
    pickedState,
    businessCardFile,
    licenseFile,
    message,
    leadPhone,
    leadName,
    kind,
    stampSent,
    onSent,
    triggerBrowserDownload,
  ]);

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

          {/* Send method explanation */}
          <div className="rounded-[5px] border border-[#45bcaa]/30 bg-[#daf3f0]/30 p-3 text-xs text-[#0D4D4D] leading-relaxed">
            {hasShareApi ? (
              <>
                <strong>iPhone / Android:</strong> Tap Send → your share sheet opens with
                files + message ready. Pick Messages → tap send. Done.
              </>
            ) : (
              <>
                <strong>Desktop:</strong> Tap Send → Messages opens with the text ready.
                Attachments don&apos;t auto-attach via SMS protocol — use the buttons below
                to download then drag into the message.
              </>
            )}
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-[5px] px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-[#ececec] bg-[#fafafa] shrink-0">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 max-w-[180px] py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
          >
            Not now
          </button>
          <button
            onClick={handleSend}
            disabled={busy || licenseLoading}
            className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
            title={licenseLoading ? 'Waiting for license PDF to finish loading…' : undefined}
          >
            {licenseLoading ? 'Loading license…' : busy ? 'Opening…' : 'Send'}
          </button>
        </div>

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
