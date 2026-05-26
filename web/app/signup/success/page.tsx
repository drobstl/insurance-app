'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  signInWithCustomToken,
  updatePassword,
  type User,
} from 'firebase/auth';
import { auth } from '../../../firebase';

/**
 * /signup/success — landing page after Stripe Checkout completes.
 *
 * Polls /api/signup/finalize until the webhook has provisioned the
 * Firebase Auth user, signs in with the returned custom token, then
 * prompts the user to set their password. After password is set,
 * routes to /dashboard.
 *
 * If polling exhausts (webhook didn't fire) the page surfaces a
 * fallback: their welcome email also contains a password-set link,
 * so they're never locked out.
 */

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 30; // ~45s total — generous for webhook latency

export default function SignupSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-8 h-8 text-[#44bbaa]" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

type Stage = 'finalizing' | 'set-password' | 'error';

function SuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get('session_id');

  // Initial stage is derived from sessionId presence so we don't have
  // to dispatch an error setState inside the effect (eslint rule
  // react-hooks/set-state-in-effect).
  const [stage, setStage] = useState<Stage>(() => (sessionId ? 'finalizing' : 'error'));
  const [error, setError] = useState<string | null>(() =>
    sessionId ? null : 'Missing session id — open the link in your welcome email to finish setup.',
  );
  const [user, setUser] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Self-contained polling loop. Lives entirely inside one effect so
  // there's no useCallback/setTimeout recursion footgun. `cancelled`
  // makes sure a late timer doesn't flip state after unmount.
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const tick = async () => {
      attempts += 1;
      try {
        const res = await fetch('/api/signup/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.status === 202) {
          if (attempts >= POLL_MAX_ATTEMPTS) {
            setStage('error');
            setError(
              'We received your payment but account setup is taking longer than expected. Check your email — we sent a link to finish setup.',
            );
            return;
          }
          timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
          return;
        }

        if (!res.ok) {
          setStage('error');
          setError(
            data?.error === 'unpaid'
              ? 'Payment is still processing. Please refresh in a minute, or check your email for a setup link.'
              : 'We could not verify your account. Check your email for a link to finish setup, or contact support@agentforlife.app.',
          );
          return;
        }

        const customToken = data?.customToken;
        if (typeof customToken !== 'string') {
          setStage('error');
          setError('Account verification failed. Check your email for a setup link.');
          return;
        }

        const credential = await signInWithCustomToken(auth, customToken);
        if (cancelled) return;
        setUser(credential.user);
        setStage('set-password');
      } catch (err) {
        if (cancelled) return;
        console.error('[signup/success] finalize error', err);
        setStage('error');
        setError('Network error verifying your account. Check your email for a setup link.');
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(user, password);
      router.replace('/dashboard?subscription=success');
    } catch (err) {
      console.error('[signup/success] set password error', err);
      setError('Could not save password. Refresh and try again, or use the link in your welcome email.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#e4e4e4] relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-[#005851] to-[#003e3a]">
          <div className="absolute top-16 left-10 w-64 h-64 bg-[#45bcaa] rounded-full blur-3xl opacity-15"></div>
          <div className="absolute top-8 right-10 w-80 h-80 bg-[#45bcaa] rounded-full blur-3xl opacity-10"></div>
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <Link href="/" className="flex items-center gap-3 mb-8 group">
          <img
            src="/logo.png"
            alt="AgentForLife Logo"
            className="w-20 h-12 object-contain group-hover:scale-105 transition-transform"
          />
          <span className="text-2xl text-white brand-title">AgentForLife™</span>
        </Link>

        <div className="w-full max-w-md">
          <div className="bg-white rounded-[5px] shadow-xl border border-[#d0d0d0] p-8">
            {stage === 'finalizing' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Spinner />
                <p className="text-[#005851] font-semibold">Setting up your account...</p>
                <p className="text-[#707070] text-sm text-center">
                  Payment confirmed. Just a moment while we finish provisioning.
                </p>
              </div>
            )}

            {stage === 'set-password' && (
              <>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-[#ECFDF5] rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h1 className="text-2xl font-bold text-[#005851]">You&apos;re in</h1>
                  <p className="text-[#707070] mt-2">Set a password so you can log in next time.</p>
                </div>

                <form onSubmit={handleSetPassword} className="space-y-5">
                  {error && (
                    <div className="bg-red-50 border border-[#f95951] rounded-[5px] p-3 text-sm text-[#b20221]">
                      {error}
                    </div>
                  )}

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-[#000000] mb-2">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                      placeholder="••••••••"
                    />
                    <p className="text-[#707070] text-xs mt-2">At least 6 characters</p>
                  </div>

                  <div>
                    <label htmlFor="confirm" className="block text-sm font-medium text-[#000000] mb-2">
                      Confirm password
                    </label>
                    <input
                      id="confirm"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                      placeholder="••••••••"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#a1c3be] disabled:cursor-not-allowed text-white font-semibold rounded-[5px] shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Spinner />
                        Saving...
                      </>
                    ) : (
                      'Save and continue'
                    )}
                  </button>
                </form>
              </>
            )}

            {stage === 'error' && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-12 h-12 bg-[#FEF3C7] rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#D97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-[#005851]">Almost there</h1>
                <p className="text-[#707070]">{error}</p>
                <Link
                  href="/login"
                  className="text-[#45bcaa] hover:text-[#005751] font-semibold transition-colors"
                >
                  Go to log in
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
