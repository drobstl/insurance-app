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
    <div className="min-h-screen bg-[#F8F9FA] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 right-0 h-96 bg-[#0D4D4D]">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#3DD6C3] rounded-full blur-3xl opacity-20"></div>
          <div className="absolute top-10 right-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-3xl opacity-10"></div>
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-12">
        {/* Logo/Brand Section */}
        <Link href="/" className="flex items-center gap-2 mb-8">
          <div className="w-12 h-12 bg-[#3DD6C3] rounded-xl flex items-center justify-center shadow-lg shadow-[#3DD6C3]/30">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="7" r="3" />
              <path d="M12 12c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
              <circle cx="4" cy="10" r="2" opacity="0.7" />
              <circle cx="20" cy="10" r="2" opacity="0.7" />
              <path d="M6 10h3M15 10h3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white">AgentForLife</span>
        </Link>

        {/* Reset Password Card */}
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-[#0D4D4D]">Reset Password</h1>
              <p className="text-[#6B7280] mt-2">
                Enter your email and we'll send you a link to reset your password.
              </p>
            </div>

            {success ? (
              <div className="text-center">
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-green-800 mb-2">Check Your Email</h3>
                  <p className="text-green-700 text-sm">
                    We've sent a password reset link to <strong>{email}</strong>. 
                    Click the link in the email to create a new password.
                  </p>
                </div>
                <p className="text-[#6B7280] text-sm mb-4">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <button
                  onClick={() => {
                    setSuccess(false);
                    setEmail('');
                  }}
                  className="text-[#3DD6C3] hover:text-[#2BB5A5] font-medium transition-colors"
                >
                  Try a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-5">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#2D3748] mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[#2D3748] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/50 focus:border-[#3DD6C3] transition-all duration-200"
                    placeholder="agent@insurance.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#3DD6C3] hover:bg-[#2BB5A5] disabled:bg-[#3DD6C3]/50 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-lg shadow-[#3DD6C3]/30 hover:shadow-[#3DD6C3]/40 transition-all duration-200 flex items-center justify-center gap-2"
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
              <Link href="/login" className="text-[#6B7280] hover:text-[#0D4D4D] text-sm transition-colors inline-flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Login
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[#9CA3AF] text-sm mt-8">
          © 2026 AgentForLife. All rights reserved.
        </p>
      </div>
    </div>
  );
}

