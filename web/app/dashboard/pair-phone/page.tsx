'use client';

import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDashboard } from '../DashboardContext';

/**
 * /dashboard/pair-phone — agent-facing page for getting the AFL mobile
 * app signed in on their phone.
 *
 * Flow:
 *   1. Agent visits this page (signed in on the dashboard).
 *   2. Clicks "Show QR code" → we mint a one-time code via
 *      /api/agent-pair/mint and render a QR encoding
 *      https://agentforlife.app/pair/{code}.
 *   3. Agent points iPhone camera at the QR. iOS opens the pair
 *      bridge page, which bounces to agentforlife://pair/{code}.
 *   4. AFL app catches the deep link, calls /api/agent-pair/exchange,
 *      signs in with the resulting custom token. Done.
 *
 * Codes are 5-minute single-use. We show a countdown so the agent
 * knows whether to refresh; refresh is a single click.
 *
 * Future home: this page is reachable by direct URL for now. Once
 * Slice 1 settles, we'll add a "Set up my phone" entry in the
 * settings tab list and possibly an onboarding prompt for agents
 * who haven't paired yet.
 */

const CODE_TTL_SECONDS = 5 * 60;

type MintResponse = {
  code: string;
  expiresAtMs: number;
  ttlSeconds: number;
};

export default function PairPhonePage() {
  const { user } = useDashboard();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Countdown updater — recomputes every second so the agent sees a
  // shrinking timer instead of a stale QR. Once it hits 0 we surface
  // the "expired, get a new one" state.
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

  // Build the URL that the QR encodes. We use an https URL (not the
  // custom scheme directly) so the iPhone Camera shows a clean tappable
  // banner. The pair page at that URL bounces to the custom scheme.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const qrUrl = code ? `${origin}/pair/${code}` : '';

  const expired = code !== null && secondsLeft === 0;

  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-bold text-[#0D4D4D] mb-2">Set up my phone</h1>
      <p className="text-[#555] mb-8 leading-relaxed">
        When a lead books an appointment, your phone will buzz with a notification.
        Tap it and the message to your lead is ready to send — no typing, no copy
        and paste. Set it up once and you’re done.
      </p>

      {!code && (
        <button
          type="button"
          onClick={requestCode}
          disabled={busy || !user}
          className="bg-[#0D4D4D] text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Show QR code'}
        </button>
      )}

      {error && (
        <p className="mt-4 text-red-600 text-sm">{error}</p>
      )}

      {code && (
        <div className="mt-8 bg-white border border-[#ececec] rounded-xl p-6">
          {!expired ? (
            <>
              <div className="flex justify-center mb-4">
                <QRCodeSVG value={qrUrl} size={260} level="M" />
              </div>
              <p className="text-center text-[#555] mb-2">
                Point your iPhone camera at this code.
              </p>
              <p className="text-center text-[#888] text-sm">
                Expires in {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, '0')}
              </p>
            </>
          ) : (
            <div className="text-center">
              <p className="text-[#555] mb-4">This code expired. Generate a new one.</p>
              <button
                type="button"
                onClick={requestCode}
                disabled={busy}
                className="bg-[#0D4D4D] text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Generate new code'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-10 text-[#888] text-sm">
        <p className="mb-2 font-semibold text-[#555]">Don’t have the app yet?</p>
        <p>
          Install Agent for Life from the App Store, sign in once, and the QR will
          pick up from there.
        </p>
      </div>
    </div>
  );
}
