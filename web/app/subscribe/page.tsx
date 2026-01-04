'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

type PlanType = 'monthly' | 'annual';

export default function SubscribePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }

      // Check if user already has active subscription
      const agentDoc = await getDoc(doc(db, 'agents', currentUser.uid));
      if (agentDoc.exists()) {
        const data = agentDoc.data();
        if (data.subscriptionStatus === 'active') {
          router.push('/dashboard');
          return;
        }
      }

      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleCheckout = async () => {
    if (!user) return;

    setCheckoutLoading(true);
    setError('');

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email,
          plan: selectedPlan,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout using the session URL
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#3DD6C3] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[#2D3748]">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <header className="bg-[#0D4D4D] text-white py-6 px-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-[#3DD6C3] rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="7" r="3" />
              <path d="M12 12c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
              <circle cx="4" cy="10" r="2" opacity="0.7" />
              <circle cx="20" cy="10" r="2" opacity="0.7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">AgentForLife</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-[#0D4D4D] mb-4">
            Choose Your Plan
          </h2>
          <p className="text-[#6B7280] text-lg max-w-xl mx-auto">
            Get unlimited access to manage all your clients and policies with our professional agent dashboard.
          </p>
        </div>

        {/* Plan Selection */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="bg-white rounded-2xl p-2 shadow-lg border border-gray-200 flex gap-2">
            {/* Monthly Option */}
            <button
              onClick={() => setSelectedPlan('monthly')}
              className={`flex-1 py-4 px-6 rounded-xl transition-all duration-200 ${
                selectedPlan === 'monthly'
                  ? 'bg-[#0D4D4D] text-white shadow-lg'
                  : 'bg-transparent text-[#6B7280] hover:bg-gray-50'
              }`}
            >
              <div className="text-center">
                <p className="font-semibold text-lg">Monthly</p>
                <p className={`text-2xl font-bold mt-1 ${selectedPlan === 'monthly' ? 'text-[#3DD6C3]' : 'text-[#0D4D4D]'}`}>
                  $9.99<span className="text-sm font-normal opacity-70">/mo</span>
                </p>
              </div>
            </button>

            {/* Annual Option */}
            <button
              onClick={() => setSelectedPlan('annual')}
              className={`flex-1 py-4 px-6 rounded-xl transition-all duration-200 relative ${
                selectedPlan === 'annual'
                  ? 'bg-[#0D4D4D] text-white shadow-lg'
                  : 'bg-transparent text-[#6B7280] hover:bg-gray-50'
              }`}
            >
              {/* Best Value Badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full shadow-md">
                  SAVE 17%
                </span>
              </div>
              <div className="text-center">
                <p className="font-semibold text-lg">Annual</p>
                <p className={`text-2xl font-bold mt-1 ${selectedPlan === 'annual' ? 'text-[#3DD6C3]' : 'text-[#0D4D4D]'}`}>
                  $100<span className="text-sm font-normal opacity-70">/year</span>
                </p>
                <p className={`text-xs mt-1 ${selectedPlan === 'annual' ? 'text-white/70' : 'text-[#6B7280]'}`}>
                  That's only $8.33/mo
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Pricing Card */}
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-[#3DD6C3]">
            {/* Plan Header */}
            <div className="bg-[#0D4D4D] py-8 px-6 text-center relative">
              {selectedPlan === 'annual' && (
                <div className="absolute top-4 right-4 px-3 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full">
                  BEST VALUE
                </div>
              )}
              <h3 className="text-xl font-semibold text-white mb-2">Professional Plan</h3>
              <div className="flex items-baseline justify-center gap-1">
                {selectedPlan === 'monthly' ? (
                  <>
                    <span className="text-5xl font-bold text-[#3DD6C3]">$9.99</span>
                    <span className="text-[#9CA3AF] text-lg">/month</span>
                  </>
                ) : (
                  <>
                    <span className="text-5xl font-bold text-[#3DD6C3]">$100</span>
                    <span className="text-[#9CA3AF] text-lg">/year</span>
                  </>
                )}
              </div>
              {selectedPlan === 'annual' && (
                <p className="text-[#3DD6C3] text-sm mt-2 font-medium">
                  Save $20 compared to monthly!
                </p>
              )}
            </div>

            {/* Features */}
            <div className="p-8">
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#2D3748]">Unlimited Clients</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#2D3748]">Unlimited Policies</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#2D3748]">Client Mobile App Access</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#2D3748]">Agent Profile & Photo</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#2D3748]">Secure Cloud Storage</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#2D3748]">Priority Support</span>
                </li>
              </ul>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="w-full py-4 px-6 bg-[#3DD6C3] hover:bg-[#2BB5A5] text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#3DD6C3]/30"
              >
                {checkoutLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Subscribe Now - {selectedPlan === 'monthly' ? '$9.99/mo' : '$100/year'}
                  </>
                )}
              </button>

              <p className="text-center text-sm text-[#9CA3AF] mt-4">
                Secure payment powered by Stripe
              </p>
              <p className="text-center text-xs text-[#9CA3AF] mt-2">
                Have a promo code? You can enter it on the checkout page.
              </p>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-8 text-center">
            <p className="text-[#6B7280] text-sm">
              Cancel anytime. No long-term contracts.
            </p>
            <p className="text-[#6B7280] text-sm mt-2">
              Questions? Contact us at support@agentforlife.app
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
