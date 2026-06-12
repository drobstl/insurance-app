'use client';

import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  EmailAuthProvider,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  reauthenticateWithCredential,
  RecaptchaVerifier,
} from 'firebase/auth';
import { auth } from '../firebase';
import { withTimeout } from '../lib/timeout';
import { useDashboard } from '../app/dashboard/DashboardContext';

const MFA_ENABLED = process.env.NEXT_PUBLIC_MFA_ENABLED === 'true';

// Enforcement go-live. Before this instant the gate only shows a heads-up
// banner; on/after it, enrollment is required. Midnight ET (EDT, UTC-4) on
// Jun 15 2026 — required the moment June 15 begins. The env flag above is the
// master switch (and kill switch); this only schedules when enforcement starts.
const MFA_GO_LIVE = Date.parse('2026-06-15T00:00:00-04:00');

// Failsafe for a hung send. If `verifyPhoneNumber` never settles (a stalled
// reCAPTCHA or flaky network), the catch below never runs and `busy` stays true,
// wedging "Send my code". Cap the wait so a stall rejects into the catch instead.
const SEND_CODE_TIMEOUT_MS = 20_000;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function toE164(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/**
 * Dismissible heads-up banner for the pre-go-live window. Rendered by the
 * dashboard shell INSIDE the content column (not by MfaGate as a sibling), so
 * it clears the fixed sidebar and the mobile top bar instead of being
 * underlapped by them. Self-gating: null unless the flag is on, the agent is
 * signed in, unenrolled, and we're before MFA_GO_LIVE.
 */
export function MfaHeadsUpBanner() {
  const { user } = useDashboard();
  const [hidden, setHidden] = useState(false);

  if (!MFA_ENABLED || hidden || !user) return null;
  if (multiFactor(user).enrolledFactors.length > 0) return null;
  // eslint-disable-next-line react-hooks/purity
  if (Date.now() >= MFA_GO_LIVE) return null;

  return (
    <div className="bg-[#FEF3C7] text-[#92400E] border-b border-[#FCD34D] px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
      <span className="text-center">
        <span className="font-semibold">🔒 Heads up:</span> two-step verification becomes required on{' '}
        <span className="font-semibold">June 15</span>. You&apos;ll add your mobile number once, then
        confirm a texted code at sign-in — we&apos;ll walk you through it. Nothing to do right now.
      </span>
      <button
        onClick={() => setHidden(true)}
        aria-label="Dismiss"
        className="shrink-0 text-[#92400E]/60 hover:text-[#92400E] text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Mandatory two-step verification (SMS MFA) gate.
 *
 * Rendered inside the authenticated, paid dashboard chokepoint
 * (SubscriptionGate → MfaGate → DashboardShell). When NEXT_PUBLIC_MFA_ENABLED
 * is on, it runs in two phases around MFA_GO_LIVE: BEFORE go-live only the
 * heads-up banner shows (no enforcement); ON/AFTER go-live, an agent with no
 * enrolled second factor is BLOCKED until they enroll. No skip, no opt-in.
 *
 * Enrollment is a linear flow: confirm password → mobile number → SMS code →
 * done. We re-authenticate up front (Firebase requires a recent sign-in for the
 * security-sensitive enroll, and persisted sessions are stale), so the actual
 * enroll never trips `auth/requires-recent-login`. Firebase's verified-email
 * prerequisite is satisfied invisibly via /api/auth/ensure-email-verified.
 * Lost-phone recovery is admin-side (npm run reset-mfa). When the flag is off,
 * this renders children verbatim — zero production change until the flag flips.
 */
export default function MfaGate({ children }: { children: React.ReactNode }) {
  const { user, handleLogout } = useDashboard();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<'password' | 'phone' | 'code'>('password');
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const verificationIdRef = useRef<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const resetRecaptcha = useCallback(() => {
    try {
      recaptchaRef.current?.clear();
    } catch {
      /* noop */
    }
    recaptchaRef.current = null;
  }, []);

  // Step 1 — confirm the password. Re-authenticates so the upcoming enroll has a
  // fresh sign-in (avoids requires-recent-login on stale/persisted sessions).
  const confirmPassword = useCallback(async () => {
    if (!user?.email) {
      setError('Please sign out and sign back in to continue.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      setPassword('');
      setStep('phone');
    } catch (e) {
      const errCode = (e as { code?: string })?.code;
      setError(
        errCode === 'auth/wrong-password' || errCode === 'auth/invalid-credential'
          ? 'That password didn’t match — try again.'
          : e instanceof Error
            ? e.message
            : 'Could not confirm your password. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [user, password]);

  // Satisfy Firebase's verified-email prerequisite without an inbox round-trip.
  // The user is authenticated; the server verifies only the caller's own email.
  const ensureEmailVerified = useCallback(async () => {
    if (!user || user.emailVerified) return;
    const token = await user.getIdToken();
    const res = await fetch('/api/auth/ensure-email-verified', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('We could not prepare your account. Please try again.');
    await user.reload();
    await user.getIdToken(true);
  }, [user]);

  // Step 2 — text a code to the number.
  const sendCode = useCallback(async () => {
    if (!user) return;
    const e164 = toE164(phone);
    if (!e164) {
      setError('Enter a valid 10-digit US mobile number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ensureEmailVerified();
      if (!recaptchaRef.current && hostRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, hostRef.current, { size: 'invisible' });
      }
      const session = await multiFactor(user).getSession();
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await withTimeout(
        provider.verifyPhoneNumber({ phoneNumber: e164, session }, recaptchaRef.current!),
        SEND_CODE_TIMEOUT_MS,
        'Couldn’t reach the verification service — check your connection and tap “Send my code” again.',
      );
      verificationIdRef.current = verificationId;
      setStep('code');
    } catch (e) {
      resetRecaptcha();
      // We re-auth in step 1, so this is rare — but if the session aged out
      // between steps, send them back to confirm their password again.
      if ((e as { code?: string })?.code === 'auth/requires-recent-login') {
        setStep('password');
        setError('Please confirm your password again to continue.');
      } else {
        setError(e instanceof Error ? e.message : 'Could not send the code. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [user, phone, ensureEmailVerified, resetRecaptcha]);

  // Step 3 — verify the code and enroll.
  const verifyCode = useCallback(async () => {
    if (!user || !verificationIdRef.current || code.trim().length < 6) {
      setError('Enter the 6-digit code we texted you.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cred = PhoneAuthProvider.credential(verificationIdRef.current, code.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(user).enroll(assertion, 'Phone');
      resetRecaptcha();
      setDone(true);
    } catch (e) {
      const errCode = (e as { code?: string })?.code;
      setError(
        errCode === 'auth/network-request-failed'
          ? 'Network hiccup — tap “Verify & finish” again.'
          : errCode === 'auth/invalid-verification-code'
            ? 'That code wasn’t right — double-check the text and re-enter it.'
            : errCode === 'auth/code-expired'
              ? 'That code expired — tap “Use a different number” to send a fresh one.'
              : e instanceof Error
                ? e.message
                : 'That code didn’t work — try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [user, code, resetRecaptcha]);

  // Flag off / no user → pass straight through.
  if (!MFA_ENABLED || !user) return <>{children}</>;

  // Just enrolled in THIS session → confirm success once, then continue.
  if (done) {
    if (acknowledged) return <>{children}</>;
    return (
      <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-[5px] shadow-xl border border-[#d0d0d0] p-8 text-center">
            <div className="w-14 h-14 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#005851]">You&apos;re all set</h1>
            <p className="mt-3 text-sm text-[#4a5568] leading-relaxed">
              Two-step verification is on
              {phone ? (
                <>
                  {' '}
                  for <span className="font-semibold">{formatPhone(phone)}</span>
                </>
              ) : null}
              . Next time you sign in, we&apos;ll text you a one-time code right after your password —
              that&apos;s the whole change.
            </p>
            <button
              onClick={() => setAcknowledged(true)}
              className="w-full mt-6 py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors"
            >
              Continue to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Enrolled before this session → straight through. (Enrolled users are
  // challenged for their SMS code by MfaChallenge at sign-in.)
  if (multiFactor(user).enrolledFactors.length > 0) return <>{children}</>;

  // `?mfa=setup` forces the enrollment gate before go-live so the flow can be
  // dry-run on prod/preview ahead of the 15th. An agent who stumbles onto it
  // just enrolls early — the intended end state — so it's harmless.
  const forceSetup = searchParams.get('mfa') === 'setup';

  // Before go-live (and not forcing setup): pass through. The heads-up banner is
  // rendered by <MfaHeadsUpBanner/> inside the dashboard shell. Reads the clock
  // in render (intentionally impure); safe because the boundary is constant and
  // the gate re-evaluates on every mount/navigation.
  if (!forceSetup && Date.now() < MFA_GO_LIVE) return <>{children}</>;

  // Go-live onward: hard gate. Linear flow — confirm password → number → code.
  return (
    <div className="min-h-screen bg-[#e4e4e4] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-[5px] shadow-xl border border-[#d0d0d0] p-8">
          <div className="w-14 h-14 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-[#005851] text-center">Securing your account</h1>
          <p className="text-center text-[#45bcaa] font-medium mt-1">
            Two-step verification is now standard for every agent
          </p>

          <div className="mt-5 space-y-3 text-sm text-[#4a5568] leading-relaxed">
            <p>
              As part of our ongoing commitment to protecting every AgentForLife account — and the
              client data inside it — we&apos;ve enabled two-step verification across the platform.
            </p>
            <p>
              From here on, signing in takes two things: your password, plus a one-time security code
              we text to your phone. It&apos;s the same SMS-based multi-factor authentication trusted
              by banks, brokerages, and the national carriers — and independent security research
              credits it with stopping{' '}
              <span className="font-semibold text-[#005851]">
                over 99% of automated account-takeover attempts
              </span>
              . Your phone becomes a second key only you hold, so a stolen password alone can never
              reach your book of business.
            </p>
            <p>
              Thank you for being an AgentForLife early adopter. It takes about 30 seconds — confirm
              your password, add your mobile number, and you&apos;re done.
            </p>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border border-[#f95951] rounded-[5px] px-3 py-2 text-sm text-[#b20221]">
              {error}
            </div>
          )}

          <div className="mt-5">
            {step === 'password' ? (
              <>
                <label className="block text-sm font-medium text-[#000000] mb-1">
                  Confirm your password
                </label>
                <p className="text-xs text-[#707070] mb-2">A quick security check before we turn this on.</p>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your AgentForLife password"
                  autoComplete="current-password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void confirmPassword();
                  }}
                  className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa]"
                />
                <button
                  onClick={() => void confirmPassword()}
                  disabled={busy}
                  className="w-full mt-3 py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#a1c3be] text-white font-semibold rounded-[5px] transition-colors"
                >
                  {busy ? 'Confirming…' : 'Continue'}
                </button>
              </>
            ) : step === 'phone' ? (
              <>
                <label className="block text-sm font-medium text-[#000000] mb-2">Mobile number</label>
                <input
                  type="tel"
                  value={formatPhone(phone)}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sendCode();
                  }}
                  className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa]"
                />
                <button
                  onClick={() => void sendCode()}
                  disabled={busy}
                  className="w-full mt-3 py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#a1c3be] text-white font-semibold rounded-[5px] transition-colors"
                >
                  {busy ? 'Sending code…' : 'Send my code'}
                </button>
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-[#000000] mb-2">
                  Enter the 6-digit code sent to {formatPhone(phone)}
                </label>
                <input
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void verifyCode();
                  }}
                  className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-center tracking-widest text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa]"
                />
                <button
                  onClick={() => void verifyCode()}
                  disabled={busy}
                  className="w-full mt-3 py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#a1c3be] text-white font-semibold rounded-[5px] transition-colors"
                >
                  {busy ? 'Verifying…' : 'Verify & finish'}
                </button>
                <button
                  onClick={() => {
                    setStep('phone');
                    setCode('');
                    setError(null);
                    resetRecaptcha();
                  }}
                  className="w-full mt-2 text-sm text-[#707070] hover:text-[#005851] transition-colors"
                >
                  Use a different number
                </button>
              </>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-[#eeeeee] text-center">
            <button
              onClick={() => void handleLogout()}
              className="text-sm text-[#707070] hover:text-[#005851] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* invisible reCAPTCHA host for phone verification */}
        <div ref={hostRef} />
      </div>
    </div>
  );
}
