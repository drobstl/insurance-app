'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const errorMessage = err.message;
        if (errorMessage.includes('user-not-found')) {
          setError('No account found with this email address.');
        } else if (errorMessage.includes('invalid-email')) {
          setError('Please enter a valid email address.');
        } else if (errorMessage.includes('too-many-requests')) {
          setError('Too many attempts. Please try again later.');
        } else {
          setError('Failed to send reset email. Please try again.');
        }
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#e4e4e4] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-[#005851] to-[#003e3a]">
          <div className="absolute top-16 left-10 w-64 h-64 bg-[#45bcaa] rounded-full blur-3xl opacity-15"></div>
          <div className="absolute top-8 right-10 w-80 h-80 bg-[#45bcaa] rounded-full blur-3xl opacity-10"></div>
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-12">
        {/* Logo/Brand Section */}
        <Link href="/" className="flex items-center gap-3 mb-8 group">
          <img 
            src="/logo.png" 
            alt="AgentForLife Logo" 
            className="w-20 h-12 object-contain group-hover:scale-105 transition-transform" 
          />
          <span className="text-2xl font-bold text-white">AgentForLife</span>
        </Link>

        {/* Reset Password Card */}
        <div className="w-full max-w-md">
          <div className="bg-white rounded-[5px] shadow-xl border border-[#d0d0d0] p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#005851] rounded-[5px] flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#45bcaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-[#005851]">Reset Password</h1>
              <p className="text-[#707070] mt-2">
                Enter your email and we'll send you a link to reset your password.
              </p>
            </div>

            {success ? (
              <div className="text-center">
                <div className="bg-[#cbfbef] border border-[#45bcaa] rounded-[5px] p-6 mb-6">
                  <div className="w-12 h-12 bg-[#daf3f0] rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-[#005851] mb-2">Check Your Email</h3>
                  <p className="text-[#337973] text-sm">
                    We've sent a password reset link to <strong>{email}</strong>. 
                    Click the link in the email to create a new password.
                  </p>
                </div>
                <p className="text-[#707070] text-sm mb-4">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <button
                  onClick={() => {
                    setSuccess(false);
                    setEmail('');
                  }}
                  className="text-[#45bcaa] hover:text-[#005751] font-medium transition-colors"
                >
                  Try a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-5">
                {error && (
                  <div className="bg-red-50 border border-[#f95951] rounded-[5px] p-4 flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#f95951] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[#b20221] text-sm">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#000000] mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-[#f8f8f8] border border-[#a4a4a4bf] rounded-[5px] text-[#000000] placeholder-[#707070] focus:outline-none focus:ring-2 focus:ring-[#45bcaa]/50 focus:border-[#45bcaa] transition-all duration-200"
                    placeholder="agent@insurance.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#44bbaa] hover:bg-[#005751] disabled:bg-[#a1c3be] disabled:cursor-not-allowed text-white font-semibold rounded-[5px] shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Link href="/login" className="text-[#707070] hover:text-[#005851] text-sm transition-colors inline-flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Login
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[#707070] text-sm mt-8">
          © 2026 AgentForLife. All rights reserved.
        </p>
      </div>
    </div>
  );
}
