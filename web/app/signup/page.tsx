'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Store agent profile in Firestore
      await setDoc(doc(db, 'agents', user.uid), {
        name,
        email,
        createdAt: serverTimestamp(),
      });

      router.push('/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        const errorMessage = err.message;
        if (errorMessage.includes('email-already-in-use')) {
          setError('An account with this email already exists.');
        } else if (errorMessage.includes('weak-password')) {
          setError('Password should be at least 6 characters.');
        } else if (errorMessage.includes('invalid-email')) {
          setError('Please enter a valid email address.');
        } else {
          setError('Failed to create account. Please try again.');
        }
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D4D4D] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#3DD6C3] rounded-2xl mb-4 shadow-lg shadow-[#3DD6C3]/30">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Create Account</h1>
          <p className="text-white/70 mt-2">Join as an insurance agent</p>
        </div>

        {/* Signup Form Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSignup} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-[#2D3748] mb-2">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[#2D3748] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/50 focus:border-[#3DD6C3] transition-all duration-200"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-[#2D3748] mb-2">
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

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-[#2D3748] mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[#2D3748] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/50 focus:border-[#3DD6C3] transition-all duration-200"
                placeholder="••••••••"
              />
              <p className="text-gray-500 text-xs mt-2">Must be at least 6 characters</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-[#3DD6C3] hover:bg-[#2cc5b2] disabled:bg-[#3DD6C3]/50 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-lg shadow-[#3DD6C3]/30 hover:shadow-[#3DD6C3]/40 transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="text-[#3DD6C3] hover:text-[#0D4D4D] font-semibold transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/60 text-sm mt-8">
          © 2026 Insurance Agent Portal. All rights reserved.
        </p>
      </div>
    </div>
  );
}
