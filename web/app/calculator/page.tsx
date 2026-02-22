'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import LeakyBucketCalculator, {
  type CalculatorValues,
} from '@/components/LeakyBucketCalculator';

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function CalculatorPageInner() {
  const searchParams = useSearchParams();

  const initBook = Number(searchParams.get('book')) || 250000;
  const initRet = clamp(Number(searchParams.get('ret')) || 70, 40, 95);
  const initRef = clamp(Number(searchParams.get('ref')) || 5, 0, 25);
  const initRew = clamp(Number(searchParams.get('rew')) || 10, 0, 35);

  const valuesRef = useRef<CalculatorValues | null>(null);
  const [copied, setCopied] = useState(false);

  const handleValuesChange = useCallback((v: CalculatorValues) => {
    valuesRef.current = v;
  }, []);

  const handleShare = async () => {
    const v = valuesRef.current;
    if (!v) return;

    const url = new URL('https://agentforlife.app/calculator');
    url.searchParams.set('book', String(v.bookSize));
    url.searchParams.set('ret', String(v.retentionRate));
    url.searchParams.set('ref', String(v.referralRate));
    url.searchParams.set('rew', String(v.rewriteRate));

    const formatNum = (n: number) =>
      n.toLocaleString('en-US', { maximumFractionDigits: 0 });

    const text = [
      `I'm leaving $${formatNum(v.totalBleed)}/yr on the table.`,
      `Lost to churn: $${formatNum(v.lostRevenue)}`,
      `Missed referrals: $${formatNum(v.missedReferralRevenue)}`,
      `Missed rewrites: $${formatNum(v.missedRewriteRevenue)}`,
      '',
      `Try the calculator: ${url.toString()}`,
    ].join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: 'AgentForLife Revenue Calculator', text });
        return;
      } catch {
        // user cancelled or share not supported, fall through to clipboard
      }
    }

    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0D4D4D]">
      {/* Header */}
      <header className="bg-[#0D4D4D] border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="AgentForLife Logo"
              className="w-10 h-6 object-contain"
            />
            <span className="text-lg text-white brand-title">AgentForLife</span>
          </Link>
          <a
            href="https://agentforlife.app"
            className="text-white/60 hover:text-white text-sm transition-colors hidden sm:block"
          >
            agentforlife.app
          </a>
        </div>
      </header>

      {/* Hero Headline */}
      <div className="relative">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-red-500 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-red-500 rounded-full blur-[120px]"></div>
        </div>

        <div className="relative max-w-2xl mx-auto px-4 pt-12 pb-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-full mb-6">
            <svg
              className="w-5 h-5 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-red-400 font-semibold text-sm uppercase tracking-wide">
              The Leaky Bucket
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
            How Much Revenue Are You{' '}
            <span className="text-red-400">Leaving on the Table?</span>
          </h1>
          <p className="text-base sm:text-lg text-white/70 max-w-xl mx-auto">
            See how much your book of business is really worth &mdash; and how
            much you&apos;re losing without a retention, referral, and rewrite
            system.
          </p>
        </div>
      </div>

      {/* Calculator */}
      <div className="relative flex-1">
        <div className="max-w-2xl mx-auto px-4 pb-8">
          <LeakyBucketCalculator
            initialBookSize={initBook}
            initialRetentionRate={initRet}
            initialReferralRate={initRef}
            initialRewriteRate={initRew}
            ctaHref="/signup"
            ctaText="Stop the Bleeding →"
            onValuesChange={handleValuesChange}
          />
        </div>

        {/* Share Button */}
        <div className="max-w-2xl mx-auto px-4 pb-4">
          <button
            onClick={handleShare}
            className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Link Copied!
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                Share Your Results
              </>
            )}
          </button>
        </div>

        {/* CTA Section */}
        <div className="max-w-2xl mx-auto px-4 pb-12">
          <div className="bg-gradient-to-r from-[#005851] to-[#0D4D4D] rounded-2xl p-8 text-center border border-white/10">
            <p className="text-white text-lg sm:text-xl font-bold mb-2">
              Stop the leak.
            </p>
            <p className="text-white/80 mb-6">
              AgentForLife recovers the missing revenue for{' '}
              <span className="text-[#3DD6C3] font-bold">$49/month</span>.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-3 px-10 py-4 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg font-bold rounded-full transition-all shadow-lg shadow-[#fdcc02]/30 hover:shadow-[#fdcc02]/50 hover:scale-105 active:scale-[0.98]"
            >
              Get Started Free
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#0D4D4D] border-t border-white/10 py-8">
        <div className="max-w-3xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="AgentForLife Logo"
              className="w-10 h-6 object-contain"
            />
            <span className="text-lg text-white brand-title">AgentForLife</span>
          </Link>
          <a
            href="https://agentforlife.app"
            className="text-white/60 hover:text-white text-sm transition-colors"
          >
            agentforlife.app
          </a>
          <p className="text-white/40 text-sm">&copy; 2026 AgentForLife</p>
        </div>
      </footer>
    </div>
  );
}

export default function CalculatorPage() {
  return (
    <Suspense>
      <CalculatorPageInner />
    </Suspense>
  );
}
