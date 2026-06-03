'use client';

import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDashboard } from '../DashboardContext';

/**
 * /dashboard/pair-phone — agent-facing page for getting the AFL mobile
 * app signed in on their phone.
 *
 * Two-step structure:
 *   Step 1 — Install the app. Always visible. App Store + Play Store
 *     buttons. Leading with this prevents the "I scanned the QR and
 *     nothing happened" dead-end for agents who didn't realize the app
 *     was required.
 *   Step 2 — Scan the QR. Code is minted on demand (no wasted codes if
 *     the agent reads the page and leaves).
 *
 * Codes are 5-minute single-use. The QR encodes an HTTPS URL that bounces
 * through `/pair/[code]` to the AFL custom scheme.
 *
 * TODO: replace the placeholder App Store / Play Store URLs with the
 * real listings once they're published.
 */

const APP_STORE_URL = 'https://apps.apple.com/app/agentforlife';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.danielroberts.agentforlife';

type MintResponse = {
  code: string;
  expiresAtMs: number;
  ttlSeconds: number;
};

export default function PairPhonePage() {
  const { user, agentProfile } = useDashboard();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Test-buzz state. 'sent' = Expo accepted the push (now ask the agent
  // whether it actually buzzed — their phone is the real receipt).
  // 'unreachable' = no usable token or Expo rejected it → route to re-pair.
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'unreachable'>('idle');

  // If the agent's already paired, this whole page is unnecessary —
  // show a success state instead of asking them to re-pair.
  const alreadyPaired = Boolean(agentProfile.phonePaired);

  // Countdown updater.
  useEffect(() => {
    if (!expiresAtMs) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAtMs]);

  const requestCode = useCallback(async () => {
    if (!user) {
      setError('You need to be signed in.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent-pair/mint', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Could not generate a code right now.');
        return;
      }
      const data: MintResponse = await res.json();
      setCode(data.code);
      setExpiresAtMs(data.expiresAtMs);
    } catch (err) {
      console.error('mint error:', err);
      setError('Could not generate a code right now. Try again.');
    } finally {
      setBusy(false);
    }
  }, [user]);

  const sendTestPush = useCallback(async () => {
    if (!user) {
      setError('You need to be signed in.');
      return;
    }
    setTestState('sending');
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent-push-token/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json().catch(() => ({}));
      // Only a clean 'sent' means Expo accepted the push. No usable token
      // or a rejected send both mean we couldn't reach the phone — surface
      // re-pair either way.
      setTestState(res.ok && data?.outcome === 'sent' ? 'sent' : 'unreachable');
    } catch (err) {
      console.error('test push error:', err);
      setTestState('unreachable');
    }
  }, [user]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const qrUrl = code ? `${origin}/pair/${code}` : '';
  const expired = code !== null && secondsLeft === 0;

  // ── Already-paired success state ──
  if (alreadyPaired) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-6">
        <h1 className="text-2xl font-bold text-[#0D4D4D] mb-2">Set up my phone</h1>
        <div className="mt-8 bg-[#f4f9f9] border border-[#d4e8e6] rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#3DD6C3] flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-[#0D4D4D] font-semibold">Your phone is paired.</p>
              <p className="text-[#555] text-sm mt-0.5">
                When a lead books, your phone will buzz with a notification.
              </p>
            </div>
          </div>
          {/* Test buzz — the honest check. "Paired" above only means we
              hold a push token we haven't been told is dead; a real push
              with the agent's phone as the receipt is the only way to
              confirm notifications actually land. */}
          <div className="mt-5">
            <button
              type="button"
              onClick={sendTestPush}
              disabled={testState === 'sending'}
              className="bg-[#0D4D4D] text-white px-5 py-2.5 rounded-md text-sm font-semibold disabled:opacity-50"
            >
              {testState === 'sending' ? 'Sending…' : 'Send a test notification to my phone'}
            </button>

            {testState === 'sent' && (
              <div className="mt-3 text-sm">
                <p className="text-[#0D4D4D] font-semibold">Sent. Did your phone buzz?</p>
                <p className="mt-0.5 text-[#555]">
                  If nothing came through after a few seconds, your phone may have
                  dropped off.{' '}
                  <button
                    type="button"
                    onClick={requestCode}
                    disabled={busy}
                    className="text-[#0D4D4D] underline font-medium disabled:opacity-50"
                  >
                    {busy ? 'Working…' : 'Re-pair your phone'}
                  </button>
                  .
                </p>
              </div>
            )}

            {testState === 'unreachable' && (
              <div className="mt-3 text-sm">
                <p className="text-[#b45309] font-semibold">We couldn’t reach your phone.</p>
                <p className="mt-0.5 text-[#555]">
                  The connection looks stale. Re-pair to reconnect it.{' '}
                  <button
                    type="button"
                    onClick={requestCode}
                    disabled={busy}
                    className="text-[#0D4D4D] underline font-medium disabled:opacity-50"
                  >
                    {busy ? 'Working…' : 'Re-pair your phone'}
                  </button>
                  .
                </p>
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}

          {/* Escape hatch: connect a different device entirely. */}
          <button
            type="button"
            onClick={requestCode}
            disabled={busy}
            className="mt-4 block text-[#0D4D4D] text-sm underline disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Pair a different phone'}
          </button>
        </div>

        {code && (
          <div className="mt-6 bg-white border border-[#ececec] rounded-xl p-6">
            {!expired ? (
              <>
                <div className="flex justify-center mb-4">
                  <QRCodeSVG value={qrUrl} size={220} level="M" />
                </div>
                <p className="text-center text-[#555] mb-2 text-sm">
                  Point your iPhone camera at this code.
                </p>
                <p className="text-center text-[#888] text-xs">
                  Expires in {Math.floor(secondsLeft / 60)}:
                  {String(secondsLeft % 60).padStart(2, '0')}
                </p>
              </>
            ) : (
              <div className="text-center">
                <p className="text-[#555] mb-4 text-sm">This code expired.</p>
                <button
                  type="button"
                  onClick={requestCode}
                  disabled={busy}
                  className="bg-[#0D4D4D] text-white px-5 py-2.5 rounded-md text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? 'Working…' : 'Generate new code'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Setup state — two-step layout ──
  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-bold text-[#0D4D4D] mb-2">Set up my phone</h1>
      <p className="text-[#555] mb-8 leading-relaxed">
        When a lead books an appointment, your phone will buzz with a notification.
        Tap it and the message to your lead is ready to send — no typing, no copy
        and paste. Set it up once and you’re done.
      </p>

      {/* Step 1 — Install */}
      <div className="bg-white border border-[#ececec] rounded-xl p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-[#0D4D4D] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
            1
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[#0D4D4D] mb-1">Install Agent for Life on your phone</h2>
            <p className="text-[#555] text-sm mb-4">
              You only need to install it. You don’t need to open it or sign in —
              the QR below handles that.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-black text-white px-4 py-2.5 rounded-md hover:bg-[#222] transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                <span className="text-sm font-semibold">App Store</span>
              </a>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-black text-white px-4 py-2.5 rounded-md hover:bg-[#222] transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.609 1.814 13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893 2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198 2.807 1.626a1 1 0 0 1 0 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658 16.802 8.99l-2.303 2.303-8.635-8.635z"/>
                </svg>
                <span className="text-sm font-semibold">Google Play</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Step 2 — Scan QR */}
      <div className="bg-white border border-[#ececec] rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-[#0D4D4D] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
            2
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[#0D4D4D] mb-1">Scan this QR with your iPhone camera</h2>
            <p className="text-[#555] text-sm mb-4">
              Once the app is installed, point your camera at the code. iOS will
              prompt you to open Agent for Life and the rest is automatic.
            </p>

            {!code && (
              <button
                type="button"
                onClick={requestCode}
                disabled={busy || !user}
                className="bg-[#0D4D4D] text-white px-5 py-2.5 rounded-md font-semibold text-sm disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Show QR code'}
              </button>
            )}

            {error && (
              <p className="mt-3 text-red-600 text-sm">{error}</p>
            )}

            {code && !expired && (
              <div className="mt-2">
                <div className="flex justify-center mb-3">
                  <QRCodeSVG value={qrUrl} size={240} level="M" />
                </div>
                <p className="text-center text-[#888] text-xs">
                  Expires in {Math.floor(secondsLeft / 60)}:
                  {String(secondsLeft % 60).padStart(2, '0')}
                </p>
              </div>
            )}

            {code && expired && (
              <div className="mt-2 text-center">
                <p className="text-[#555] mb-3 text-sm">This code expired.</p>
                <button
                  type="button"
                  onClick={requestCode}
                  disabled={busy}
                  className="bg-[#0D4D4D] text-white px-5 py-2.5 rounded-md text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? 'Working…' : 'Generate new code'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
