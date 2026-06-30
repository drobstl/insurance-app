'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';

/**
 * Lead intro-text drawer — the "teed up" first-touch SMS.
 *
 * Simpler sibling of SendConfirmationDrawer: no attachments, so a plain
 * `sms:` deep link pre-fills BOTH recipient and body in one shot (better
 * than the confirmation flow's Web Share clipboard dance, which only
 * exists there to carry the business-card + license PDFs). The agent
 * sends from their own phone so it lands from their cell number.
 *
 *   - mobile / mac → `sms:` opens Messages with the lead + body filled.
 *   - other (Win/Linux) → no reliable `sms:` handler; lead with the QR
 *     hand-off so the agent sends from their phone, with copy fallbacks.
 *
 * The body is pre-composed by the parent (tokens already filled via
 * renderIntroText) and editable here. On send we POST /intro-sent to
 * stamp on intent — there's no OS delivery callback.
 *
 * Portaled to <body>: in Call mode this lives inside the slide-belt whose
 * CSS transform makes `position: fixed` resolve against the belt and
 * clips it. Portaling escapes that so fixed = viewport again.
 */

interface Props {
  user: User | null;
  leadId: string;
  leadName: string;
  leadPhone: string;
  /** Pre-composed intro body (tokens already substituted by the parent). */
  initialMessage: string;
  onSent: () => void;
  onCancel: () => void;
}

export default function SendIntroDrawer({
  user,
  leadId,
  leadName,
  leadPhone,
  initialMessage,
  onSent,
  onCancel,
}: Props) {
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'msg' | 'num' | null>(null);
  const [platform, setPlatform] = useState<'mobile' | 'mac' | 'other'>('other');
  const [showQr, setShowQr] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent;
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) setPlatform('mobile');
    else if (/Macintosh|Mac OS X/i.test(ua)) setPlatform('mac');
    else setPlatform('other');
  }, []);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const leadFirstName = (leadName || '').trim().split(/\s+/)[0] || 'lead';
  const phoneDigits = (leadPhone || '').replace(/\D/g, '');
  const hasPhone = phoneDigits.length >= 7;
  // 'other' desktops can't fire sms:; they hand off to the phone via QR.
  const canSmsDirect = (platform === 'mobile' || platform === 'mac') && hasPhone;

  const smsUrl = useMemo(() => {
    if (!hasPhone) return null;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const delim = ua.includes('iPhone') || ua.includes('iPad') ? '&' : '?';
    return `sms:${phoneDigits}${delim}body=${encodeURIComponent(message)}`;
  }, [hasPhone, phoneDigits, message]);

  const phoneHandoffUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/dashboard/leads/${leadId}?openIntro=1`;
  }, [leadId]);

  const stampSent = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`/api/leads/${leadId}/intro-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // Stamp is best-effort; don't block the agent's send on it.
      console.error('intro stampSent error:', err);
    }
  }, [user, leadId]);

  const handleSend = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (smsUrl) window.location.href = smsUrl;
      await stampSent();
      onSent();
    } catch (err) {
      console.error('intro send error:', err);
      setError(err instanceof Error ? err.message : 'Could not open Messages.');
    } finally {
      setBusy(false);
    }
  }, [smsUrl, stampSent, onSent]);

  const handleMarkSent = useCallback(async () => {
    setBusy(true);
    await stampSent();
    setBusy(false);
    onSent();
  }, [stampSent, onSent]);

  const copy = useCallback((text: string, which: 'msg' | 'num') => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1500);
    }).catch(() => { /* non-fatal */ });
  }, []);

  if (typeof document === 'undefined') return null;

  const showQrBlock = showQr || platform === 'other';

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onCancel()} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border-2 border-[#1A1A1A] shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#ececec] bg-[#daf3f0]/50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z" />
            </svg>
            <h3 className="text-sm font-bold text-[#005851]">Text intro to {leadFirstName}</h3>
          </div>
          <button
            onClick={() => !busy && onCancel()}
            className="p-1 rounded hover:bg-black/5 text-[#707070]"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Editable body */}
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">Message (edit if you want)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 rounded-[5px] border border-gray-300 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa] resize-y"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xs text-[#707070]">
                {hasPhone ? <>To <span className="font-mono">{leadPhone}</span></> : 'No phone number on this lead'}
              </span>
              <button
                type="button"
                onClick={() => copy(message, 'msg')}
                className="text-xs font-semibold text-[#005851] hover:text-[#004440]"
              >
                {copied === 'msg' ? 'Copied ✓' : 'Copy message'}
              </button>
            </div>
          </div>

          {!hasPhone && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-[5px] px-3 py-2">
              Add a phone number to this lead to text them.
            </p>
          )}

          {/* Primary send (mobile / mac) */}
          {canSmsDirect && (
            <>
              <button
                onClick={handleSend}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#44bbaa] hover:bg-[#005751] disabled:opacity-60 text-white font-semibold rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z" />
                </svg>
                Text {leadFirstName}
              </button>
              <p className="text-[11px] text-[#707070] text-center -mt-1">
                Opens Messages with {leadFirstName} and the text ready — you tap Send. It comes from your number.
              </p>
              <button
                type="button"
                onClick={() => setShowQr((v) => !v)}
                className="block mx-auto text-xs font-semibold text-[#005851] hover:text-[#004440]"
              >
                {showQr ? 'Hide phone hand-off' : 'Send from a different phone'}
              </button>
            </>
          )}

          {/* QR hand-off — default path on Win/Linux, optional elsewhere */}
          {showQrBlock && hasPhone && (
            <div className="rounded-[8px] border border-[#ececec] bg-[#fafafa] p-4 text-center">
              <p className="text-xs font-semibold text-[#005851] mb-2">
                Scan to send from your phone
              </p>
              <div className="inline-block bg-white p-2 rounded-lg border border-gray-200">
                <QRCodeSVG value={phoneHandoffUrl} size={168} level="M" />
              </div>
              <p className="text-[11px] text-[#707070] mt-2 leading-snug">
                Opens this lead on your phone — tap <span className="font-semibold">Text {leadFirstName}</span> there
                so it sends from your cell number.
              </p>
              <div className="mt-3 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => copy(leadPhone, 'num')}
                  className="text-xs font-semibold text-[#005851] hover:text-[#004440]"
                >
                  {copied === 'num' ? 'Copied ✓' : 'Copy number'}
                </button>
                <span className="text-[#d0d0d0]">·</span>
                <button
                  type="button"
                  onClick={handleMarkSent}
                  disabled={busy}
                  className="text-xs font-semibold text-[#005851] hover:text-[#004440] disabled:opacity-60"
                >
                  Mark as sent
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
