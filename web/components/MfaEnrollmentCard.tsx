'use client';

import { useCallback, useRef, useState } from 'react';
import {
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  sendEmailVerification,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';

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
 * Two-step verification (SMS MFA) enrollment card for Settings → Account.
 *
 * Lifecycle: email must be verified first (Firebase requires a verified
 * email for phone MFA), then enroll a phone → SMS code → done. Enrolled
 * users see their factor + a "Turn off" action. All Firebase phone flows
 * need a reCAPTCHA app-verifier; we bind an invisible one to a hidden div.
 *
 * The caller (Settings) renders this only when NEXT_PUBLIC_MFA_ENABLED is on.
 */
export default function MfaEnrollmentCard({ user }: { user: User }) {
  const [factors, setFactors] = useState(() => multiFactor(user).enrolledFactors);
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'codeSent' | 'verifying'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const getRecaptcha = useCallback((): RecaptchaVerifier => {
    if (!recaptchaRef.current && hostRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, hostRef.current, { size: 'invisible' });
    }
    return recaptchaRef.current!;
  }, []);

  const sendVerificationEmail = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendEmailVerification(user);
      setNotice('Verification email sent — open it, then tap “I’ve verified.”');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the email.');
    } finally {
      setBusy(false);
    }
  }, [user]);

  const refreshEmailVerified = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await user.reload();
      setEmailVerified(user.emailVerified);
      if (!user.emailVerified) setError('Still not verified — open the email link, then try again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh.');
    } finally {
      setBusy(false);
    }
  }, [user]);

  const sendCode = useCallback(async () => {
    const e164 = toE164(phone);
    if (!e164) {
      setError('Enter a valid 10-digit US mobile number.');
      return;
    }
    setPhase('sending');
    setError(null);
    setNotice(null);
    try {
      const session = await multiFactor(user).getSession();
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber({ phoneNumber: e164, session }, getRecaptcha());
      verificationIdRef.current = verificationId;
      setPhase('codeSent');
      setNotice(`Code sent to ${formatPhone(phone)}.`);
    } catch (e) {
      resetRecaptcha();
      setPhase('idle');
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    }
  }, [phone, user, getRecaptcha, resetRecaptcha]);

  const confirmCode = useCallback(async () => {
    if (!verificationIdRef.current || code.trim().length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setPhase('verifying');
    setError(null);
    try {
      const cred = PhoneAuthProvider.credential(verificationIdRef.current, code.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(user).enroll(assertion, 'Phone');
      setFactors(multiFactor(user).enrolledFactors);
      setPhase('idle');
      setCode('');
      setPhone('');
      setNotice('Two-step verification is on. You’ll be asked for a code at sign-in.');
      resetRecaptcha();
    } catch (e) {
      setPhase('codeSent');
      setError(e instanceof Error ? e.message : 'That code didn’t work — try again.');
    }
  }, [code, user, resetRecaptcha]);

  const unenroll = useCallback(async () => {
    if (!factors[0]) return;
    setBusy(true);
    setError(null);
    try {
      await multiFactor(user).unenroll(factors[0]);
      setFactors(multiFactor(user).enrolledFactors);
      setNotice('Two-step verification turned off.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn it off.');
    } finally {
      setBusy(false);
    }
  }, [factors, user]);

  const enrolled = factors.length > 0;

  return (
    <div className="bg-white rounded-[5px] border border-[#d0d0d0] p-6">
      <h3 className="text-base font-semibold text-[#005851] mb-1">Two-step verification</h3>
      <p className="text-sm text-[#707070] mb-4">
        Add an SMS code at sign-in so a stolen password isn’t enough to get into your account.
      </p>

      {error && (
        <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-[5px] px-3 py-2">{error}</div>
      )}
      {notice && (
        <div className="mb-3 text-sm text-[#005851] bg-[#daf3f0] border border-[#45bcaa]/40 rounded-[5px] px-3 py-2">
          {notice}
        </div>
      )}

      {enrolled ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-[#2D3748]">
            <span className="font-semibold text-[#005851]">✓ On</span>
            <span className="ml-2 text-[#707070]">{(factors[0] as { phoneNumber?: string }).phoneNumber ?? 'Phone'}</span>
          </div>
          <button
            onClick={unenroll}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg border border-[#d0d0d0] text-[#b42318] hover:bg-[#fde6e6] disabled:opacity-50"
          >
            {busy ? '…' : 'Turn off'}
          </button>
        </div>
      ) : !emailVerified ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[#707070]">Verify your email first.</span>
          <button
            onClick={sendVerificationEmail}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg bg-[#44bbaa] hover:bg-[#005751] text-white disabled:opacity-50"
          >
            {busy ? '…' : 'Send verification email'}
          </button>
          <button
            onClick={refreshEmailVerified}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg border border-[#d0d0d0] text-[#005851] hover:bg-[#f3f3f3] disabled:opacity-50"
          >
            I’ve verified
          </button>
        </div>
      ) : phase === 'codeSent' || phase === 'verifying' ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            className="w-32 px-3 py-2 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-sm"
          />
          <button
            onClick={confirmCode}
            disabled={phase === 'verifying'}
            className="px-3 py-2 text-sm rounded-lg bg-[#44bbaa] hover:bg-[#005751] text-white disabled:opacity-50"
          >
            {phase === 'verifying' ? 'Verifying…' : 'Verify & turn on'}
          </button>
          <button
            onClick={() => {
              setPhase('idle');
              setCode('');
              resetRecaptcha();
            }}
            className="px-3 py-2 text-sm rounded-lg border border-[#d0d0d0] text-[#707070] hover:bg-[#f3f3f3]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="tel"
            value={formatPhone(phone)}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="w-44 px-3 py-2 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-sm"
          />
          <button
            onClick={sendCode}
            disabled={phase === 'sending'}
            className="px-3 py-2 text-sm rounded-lg bg-[#44bbaa] hover:bg-[#005751] text-white disabled:opacity-50"
          >
            {phase === 'sending' ? 'Sending…' : 'Send code'}
          </button>
        </div>
      )}

      {/* invisible reCAPTCHA host for phone verification */}
      <div ref={hostRef} />
    </div>
  );
}
