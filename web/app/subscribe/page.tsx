'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

type Interval = 'monthly' | 'annual';

interface TierInfo {
  id: string;
  name: string;
  total: number;
  status: 'open' | 'full' | 'upcoming';
  spotsFilled: number;
  spotsRemaining: number;
}

interface SpotsData {
  activeTier: string;
  activeTierName: string;
  spotsRemaining: number;
  tiers: TierInfo[];
}

const TIER_CONFIG: Record<string, { monthly: number; annual: number; planPrefix: string; tagline: string }> = {
  founding: { monthly: 0, annual: 0, planPrefix: 'founding', tagline: 'Free for life' },
  charter: { monthly: 25, annual: 250, planPrefix: 'charter', tagline: 'Locked in for life' },
  inner_circle: { monthly: 35, annual: 350, planPrefix: 'inner_circle', tagline: 'Locked in for life' },
  standard: { monthly: 49, annual: 490, planPrefix: '', tagline: 'Full price' },
};

export default function SubscribePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedInterval, setSelectedInterval] = useState<Interval>('annual');
  const [spotsData, setSpotsData] = useState<SpotsData | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }

      const agentDoc = await getDoc(doc(db, 'agents', currentUser.uid));
      if (agentDoc.exists()) {
        const data = agentDoc.data();
        if (data.subscriptionStatus === 'active') {
          router.push('/dashboard');
          return;
        }
      }

      // Auto-activate approved founding members (no Stripe, no credit card)
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch('/api/founding-member/activate', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await res.json();
        if (result.activated) {
          router.push('/dashboard');
          return;
        }
      } catch {
        // Activation check failed — fall through to normal subscribe flow
      }

      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then((res) => res.json())
      .then((data) => {
        if (data.activeTier) setSpotsData(data);
      })
      .catch(() => {});
  }, []);

  const activeTier = spotsData?.activeTier ?? 'standard';
  const config = TIER_CONFIG[activeTier] ?? TIER_CONFIG.standard;
  const isFree = activeTier === 'founding';
  const isDiscounted = activeTier !== 'standard';

  const handleCheckout = async () => {
    if (!user) return;
    if (isFree) {
      router.push('/founding-member');
      return;
    }

    setCheckoutLoading(true);
    setError('');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const plan =
        config.planPrefix
          ? `${config.planPrefix}_${selectedInterval}`
          : selectedInterval;

      const token = await user.getIdToken();
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        console.error('Checkout error:', data);
        let errorMsg = 'Unable to start checkout. ';
        if (data.error?.includes('Price ID not configured')) {
          errorMsg += 'Payment system is being configured. Please try again in a few minutes or contact support.';
        } else if (data.error?.includes('Stripe')) {
          errorMsg += 'Payment service temporarily unavailable. Please try again.';
        } else {
          errorMsg += data.details || data.error || 'Please try again or contact support.';
        }
        throw new Error(errorMsg);
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned. Please try again.');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Please check your internet connection and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
      }
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
            {isFree ? 'Founding Member — Free for Life' : `Choose Your ${spotsData?.activeTierName ?? ''} Plan`}
          </h2>
          <p className="text-[#6B7280] text-lg max-w-xl mx-auto">
            {isDiscounted ? (
              <>Standard price is <span className="line-through font-semibold">$49/mo</span>.{' '}
              {isFree
                ? 'Founding Members get it free — forever.'
                : `${spotsData?.activeTierName} members lock in a lower rate for life.`}</>
            ) : (
              'Get unlimited access to manage all your clients and policies with our professional agent dashboard.'
            )}
          </p>
          {isDiscounted && spotsData && (
            <p className="text-sm text-[#0D4D4D] font-semibold mt-3">
              {spotsData.spotsRemaining > 0
                ? `Only ${spotsData.spotsRemaining} of ${spotsData.tiers.find(t => t.id === activeTier)?.total ?? 50} spots remaining`
                : 'Spots are filling fast'}
            </p>
          )}
        </div>

        {isFree ? (
          /* Founding member — single card, no interval picker */
          <div className="max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-[#a158ff]">
              <div className="bg-[#0D4D4D] py-8 px-6 text-center">
                <h3 className="text-xl font-semibold text-white mb-2">Founding Member</h3>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-[#9CA3AF] text-2xl line-through">$49/mo</span>
                  <span className="text-5xl font-bold text-[#a158ff]">FREE</span>
                </div>
                <p className="text-[#a158ff] text-sm mt-2 font-medium">For life — no credit card required</p>
              </div>
              <div className="p-8">
                <FeatureList />
                <button
                  onClick={handleCheckout}
                  className="w-full py-4 px-6 bg-[#a158ff] hover:bg-[#8a3ee8] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#a158ff]/30"
                >
                  Apply for Founding Member
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Paid tiers — interval picker + card */
          <>
            {/* Interval Selection */}
            <div className="max-w-2xl mx-auto mb-8">
              <div className="bg-white rounded-2xl p-2 shadow-lg border border-gray-200 flex gap-2">
                <button
                  onClick={() => setSelectedInterval('monthly')}
                  className={`flex-1 py-4 px-6 rounded-xl transition-all duration-200 ${
                    selectedInterval === 'monthly'
                      ? 'bg-[#0D4D4D] text-white shadow-lg'
                      : 'bg-transparent text-[#6B7280] hover:bg-gray-50'
                  }`}
                >
                  <div className="text-center">
                    <p className="font-semibold text-lg">Monthly</p>
                    <p className={`text-2xl font-bold mt-1 ${selectedInterval === 'monthly' ? 'text-[#3DD6C3]' : 'text-[#0D4D4D]'}`}>
                      {isDiscounted && (
                        <span className="text-base line-through text-[#9CA3AF] mr-2">$49</span>
                      )}
                      ${config.monthly}<span className="text-sm font-normal opacity-70">/mo</span>
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedInterval('annual')}
                  className={`flex-1 py-4 px-6 rounded-xl transition-all duration-200 relative ${
                    selectedInterval === 'annual'
                      ? 'bg-[#0D4D4D] text-white shadow-lg'
                      : 'bg-transparent text-[#6B7280] hover:bg-gray-50'
                  }`}
                >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full shadow-md">
                      SAVE {Math.round((1 - config.annual / (config.monthly * 12)) * 100)}%
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-lg">Annual</p>
                    <p className={`text-2xl font-bold mt-1 ${selectedInterval === 'annual' ? 'text-[#3DD6C3]' : 'text-[#0D4D4D]'}`}>
                      {isDiscounted && (
                        <span className="text-base line-through text-[#9CA3AF] mr-2">$490</span>
                      )}
                      ${config.annual}<span className="text-sm font-normal opacity-70">/year</span>
                    </p>
                    <p className={`text-xs mt-1 ${selectedInterval === 'annual' ? 'text-white/70' : 'text-[#6B7280]'}`}>
                      That&apos;s only ${(config.annual / 12).toFixed(2)}/mo
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Pricing Card */}
            <div className="max-w-md mx-auto">
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-[#3DD6C3]">
                <div className="bg-[#0D4D4D] py-8 px-6 text-center relative">
                  {selectedInterval === 'annual' && (
                    <div className="absolute top-4 right-4 px-3 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full">
                      BEST VALUE
                    </div>
                  )}
                  <h3 className="text-xl font-semibold text-white mb-2">{spotsData?.activeTierName ?? 'Professional'} Plan</h3>
                  <div className="flex items-baseline justify-center gap-2">
                    {isDiscounted && (
                      <span className="text-2xl text-[#9CA3AF] line-through">
                        {selectedInterval === 'monthly' ? '$49' : '$490'}
                      </span>
                    )}
                    {selectedInterval === 'monthly' ? (
                      <>
                        <span className="text-5xl font-bold text-[#3DD6C3]">${config.monthly}</span>
                        <span className="text-[#9CA3AF] text-lg">/month</span>
                      </>
                    ) : (
                      <>
                        <span className="text-5xl font-bold text-[#3DD6C3]">${config.annual}</span>
                        <span className="text-[#9CA3AF] text-lg">/year</span>
                      </>
                    )}
                  </div>
                  {isDiscounted && (
                    <p className="text-[#3DD6C3] text-sm mt-2 font-medium">{config.tagline}</p>
                  )}
                  {selectedInterval === 'annual' && !isDiscounted && (
                    <p className="text-[#3DD6C3] text-sm mt-2 font-medium">
                      Save ${(config.monthly * 12) - config.annual} compared to monthly!
                    </p>
                  )}
                </div>

                <div className="p-8">
                  <FeatureList />

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
                        Subscribe Now — {selectedInterval === 'monthly' ? `$${config.monthly}/mo` : `$${config.annual}/year`}
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

              <div className="mt-8 text-center">
                <p className="text-[#6B7280] text-sm">
                  Cancel anytime. No long-term contracts.
                </p>
                <p className="text-[#6B7280] text-sm mt-2">
                  Questions? Contact us at support@agentforlife.app
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function FeatureList() {
  const features = [
    'Unlimited Clients & Policies',
    'Branded Client Mobile App',
    'AI Referral Assistant',
    'Conservation Alerts',
    'Automated Touchpoints',
    'Anniversary Rewrite Alerts',
    'CSV & PDF Import',
    'Push Notifications',
  ];

  return (
    <ul className="space-y-4 mb-8">
      {features.map((feature) => (
        <li key={feature} className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-[#2D3748]">{feature}</span>
        </li>
      ))}
    </ul>
  );
}
