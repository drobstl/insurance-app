'use client';

import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
} from 'firebase/auth';
import { auth } from '../firebase';
import { useDashboard } from '../app/dashboard/DashboardContext';

const MFA_ENABLED = process.env.NEXT_PUBLIC_MFA_ENABLED === 'true';

// Enforcement go-live. Before this instant the gate only shows a heads-up
// banner; on/after it, enrollment is required. 9:00am ET, Jun 15 2026 — a
// daytime activation so it's monitorable, not a midnight surprise. The env
// flag above is the master switch (and kill switch); this only schedules when
// enforcement begins once the flag is on.
const MFA_GO_LIVE = Date.parse('2026-06-15T13:00:00Z');

function HeadsUpBanner() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
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
 * Mandatory two-step verification (SMS MFA) gate.
 *
 * Rendered inside the authenticated, paid dashboard chokepoint
 * (SubscriptionGate → MfaGate → DashboardShell). When NEXT_PUBLIC_MFA_ENABLED
 * is on, it runs in two phases around MFA_GO_LIVE: BEFORE go-live it only shows
 * a dismissible heads-up banner (no enforcement); ON/AFTER go-live, an agent
 * with no enrolled second factor is BLOCKED until they enroll an SMS factor —
 * there is no skip and no opt-in setting. This is the "required at sign-in"
 * model: an agent who isn't yet
 * enrolled lands here on their next dashboard load; once enrolled, every future
 * sign-in challenges them for an SMS code (handled by MfaChallenge on /login).
 *
 * Firebase phone MFA requires a verified email; we satisfy that invisibly via
 * /api/auth/ensure-email-verified just before enrollment, so the agent only
 * ever sees: number → code → done. Lost-phone recovery is admin-side
 * (/api/admin/reset-mfa). When the flag is off, this renders children verbatim
 * (zero production behavior change until the flag is flipped + rebuilt).
 */
export default function MfaGate({ children }: { children: React.ReactNode }) {
  const { user, handleLogout } = useDashboard();
  const searchParams = useSearchParams();

  const [done, setDone] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'phone' | 'sending' | 'code' | 'verifying'>('phone');
  const [error, setError] = useState<string | null>(null);
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

  // Satisfy Firebase's verified-email prerequisite for phone MFA without an
  // inbox round-trip. The user is already authenticated; the server verifies
  // only the caller's own email. No-op if already verified.
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

  const sendCode = useCallback(async () => {
    if (!user) return;
    const e164 = toE164(phone);
    if (!e164) {
      setError('Enter a valid 10-digit US mobile number.');
      return;
    }
    setPhase('sending');
    setError(null);
    try {
      await ensureEmailVerified();
      if (!recaptchaRef.current && hostRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, hostRef.current, { size: 'invisible' });
      }
      const session = await multiFactor(user).getSession();
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(
        { phoneNumber: e164, session },
        recaptchaRef.current!,
      );
      verificationIdRef.current = verificationId;
      setPhase('code');
    } catch (e) {
      resetRecaptcha();
      setPhase('phone');
      setError(e instanceof Error ? e.message : 'Could not send the code. Please try again.');
    }
  }, [user, phone, ensureEmailVerified, resetRecaptcha]);

  const verifyCode = useCallback(async () => {
    if (!user || !verificationIdRef.current || code.trim().length < 6) {
      setError('Enter the 6-digit code we texted you.');
      return;
    }
    setPhase('verifying');
    setError(null);
    try {
      const cred = PhoneAuthProvider.credential(verificationIdRef.current, code.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(user).enroll(assertion, 'Phone');
      resetRecaptcha();
      setDone(true);
    } catch (e) {
      setPhase('code');
      setError(e instanceof Error ? e.message : 'That code didn’t work — try again.');
    }
  }, [user, code, resetRecaptcha]);

  const enrolled = !!user && (done || multiFactor(user).enrolledFactors.length > 0);

  // Flag off / no user / already enrolled → pass straight through. (Enrolled
  // users are challenged for their SMS code by MfaChallenge at sign-in.)
  if (!MFA_ENABLED || !user || enrolled) return <>{children}</>;

  // `?mfa=setup` forces the enrollment gate before go-live so the flow can be
  // dry-run on prod/preview ahead of the 15th. An agent who stumbles onto it
  // just enrolls early — the intended end state — so it's harmless.
  const forceSetup = searchParams.get('mfa') === 'setup';

  // Heads-up window (before go-live): announce, don't enforce. Reads the clock
  // in render (intentionally impure) to decide which side of the fixed go-live
  // instant we're on — safe because the boundary is constant and the gate
  // re-evaluates on every mount/navigation, so there's no stale-state hazard.
  // eslint-disable-next-line react-hooks/purity
  if (Date.now() < MFA_GO_LIVE && !forceSetup) {
    return (
      <>
        <HeadsUpBanner />
        {children}
      </>
    );
  }

  // Go-live onward: hard gate until an SMS factor is enrolled.
  const onPhone = phase === 'phone' || phase === 'sending';

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
              Thank you for being an AgentForLife early adopter. Setup takes about 30 seconds — just
              confirm the mobile number where you&apos;d like to receive your codes.
            </p>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border border-[#f95951] rounded-[5px] px-3 py-2 text-sm text-[#b20221]">
              {error}
            </div>
          )}

          <div className="mt-5">
            {onPhone ? (
              <>
                <label className="block text-sm font-medium text-[#000000] mb-2">Mobile number</label>
                <input
                  type="tel"
                  value={formatPhone(phone)}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa]"
                />
                <button
                  onClick={() => void sendCode()}
                  disabled={phase === 'sending'}
                  className="w-full mt-3 py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#a1c3be] text-white font-semibold rounded-[5px] transition-colors"
                >
                  {phase === 'sending' ? 'Sending code…' : 'Send my code'}
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
                  className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-center tracking-widest text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa]"
                />
                <button
                  onClick={() => void verifyCode()}
                  disabled={phase === 'verifying'}
                  className="w-full mt-3 py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#a1c3be] text-white font-semibold rounded-[5px] transition-colors"
                >
                  {phase === 'verifying' ? 'Verifying…' : 'Verify & finish'}
                </button>
                <button
                  onClick={() => {
                    setPhase('phone');
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
