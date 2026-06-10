'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  type MultiFactorResolver,
} from 'firebase/auth';
import { auth } from '../firebase';

/**
 * SMS MFA sign-in challenge. Rendered by the login page when
 * `signInWithEmailAndPassword` throws `auth/multi-factor-auth-required`.
 * Sends a code to the enrolled phone and resolves the sign-in on success.
 */
export default function MfaChallenge({
  resolver,
  onResolved,
  onCancel,
}: {
  resolver: MultiFactorResolver;
  onResolved: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'sending' | 'codeSent' | 'verifying'>('sending');
  const [error, setError] = useState<string | null>(null);
  const verificationIdRef = useRef<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sentRef = useRef(false);

  const hint = resolver.hints[0];
  const maskedPhone = (hint as { phoneNumber?: string })?.phoneNumber ?? 'your phone';

  const send = useCallback(async () => {
    setError(null);
    setPhase('sending');
    try {
      if (!recaptchaRef.current && hostRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, hostRef.current, { size: 'invisible' });
      }
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(
        { multiFactorHint: hint, session: resolver.session },
        recaptchaRef.current!,
      );
      verificationIdRef.current = verificationId;
      setPhase('codeSent');
    } catch (e) {
      try {
        recaptchaRef.current?.clear();
      } catch {
        /* noop */
      }
      recaptchaRef.current = null;
      setError(e instanceof Error ? e.message : 'Could not send the code. Try “Resend”.');
      setPhase('codeSent');
    }
  }, [hint, resolver]);

  // Auto-send the code once on mount.
  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    const id = setTimeout(() => void send(), 0);
    return () => clearTimeout(id);
  }, [send]);

  const verify = useCallback(async () => {
    if (!verificationIdRef.current || code.trim().length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setPhase('verifying');
    setError(null);
    try {
      const cred = PhoneAuthProvider.credential(verificationIdRef.current, code.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await resolver.resolveSignIn(assertion);
      onResolved();
    } catch (e) {
      setPhase('codeSent');
      setError(e instanceof Error ? e.message : 'That code didn’t work — try again.');
    }
  }, [code, resolver, onResolved]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[#005851]">Two-step verification</h2>
        <p className="text-[#707070] mt-1 text-sm">
          {phase === 'sending' ? 'Sending a code…' : `Enter the 6-digit code sent to ${maskedPhone}.`}
        </p>
      </div>

      {error && <div className="bg-red-50 border border-[#f95951] rounded-[5px] p-3 text-sm text-[#b20221]">{error}</div>}

      <input
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="6-digit code"
        className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-center tracking-widest text-[#000000]"
      />

      <button
        onClick={verify}
        disabled={phase === 'sending' || phase === 'verifying'}
        className="w-full py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#a1c3be] text-white font-semibold rounded-[5px]"
      >
        {phase === 'verifying' ? 'Verifying…' : 'Verify & continue'}
      </button>

      <div className="flex items-center justify-between text-sm">
        <button
          onClick={() => void send()}
          disabled={phase === 'sending'}
          className="text-[#45bcaa] hover:text-[#005751] font-medium disabled:opacity-50"
        >
          Resend code
        </button>
        <button onClick={onCancel} className="text-[#707070] hover:text-[#005851]">
          Cancel
        </button>
      </div>

      {/* invisible reCAPTCHA host */}
      <div ref={hostRef} />
    </div>
  );
}
