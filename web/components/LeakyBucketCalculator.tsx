'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

export interface CalculatorValues {
  bookSize: number;
  retentionRate: number;
  referralRate: number;
  rewriteRate: number;
  lostRevenue: number;
  missedReferrals: number;
  missedReferralRevenue: number;
  missedRewrites: number;
  missedRewriteRevenue: number;
  totalBleed: number;
}

interface LeakyBucketCalculatorProps {
  initialBookSize?: number;
  initialRetentionRate?: number;
  initialReferralRate?: number;
  initialRewriteRate?: number;
  ctaHref?: string;
  ctaText?: string;
  layout?: 'vertical' | 'horizontal';
  onValuesChange?: (values: CalculatorValues) => void;
}

const AVG_POLICY_VALUE = 1200;

const formatNumber = (num: number) =>
  num.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function LeakyBucketCalculator({
  initialBookSize = 250000,
  initialRetentionRate = 70,
  initialReferralRate = 5,
  initialRewriteRate = 10,
  ctaHref = '/signup',
  ctaText = 'Stop the Bleeding →',
  layout = 'vertical',
  onValuesChange,
}: LeakyBucketCalculatorProps) {
  const [bookSize, setBookSize] = useState(initialBookSize);
  const [bookSizeInput, setBookSizeInput] = useState(formatNumber(initialBookSize));
  const [retentionRate, setRetentionRate] = useState(initialRetentionRate);
  const [referralRate, setReferralRate] = useState(initialReferralRate);
  const [rewriteRate, setRewriteRate] = useState(initialRewriteRate);

  const lostRevenue = bookSize * (1 - retentionRate / 100);
  const totalClients = Math.round(bookSize / AVG_POLICY_VALUE);
  const missedReferrals = Math.round(totalClients * ((25 - referralRate) / 100));
  const missedReferralRevenue = missedReferrals * AVG_POLICY_VALUE;
  const missedRewrites = Math.round(totalClients * ((35 - rewriteRate) / 100));
  const missedRewriteRevenue = missedRewrites * AVG_POLICY_VALUE;
  const totalBleed = lostRevenue + missedReferralRevenue + missedRewriteRevenue;

  const stableOnValuesChange = useCallback(
    (v: CalculatorValues) => onValuesChange?.(v),
    [onValuesChange],
  );

  useEffect(() => {
    stableOnValuesChange({
      bookSize,
      retentionRate,
      referralRate,
      rewriteRate,
      lostRevenue,
      missedReferrals,
      missedReferralRevenue,
      missedRewrites,
      missedRewriteRevenue,
      totalBleed,
    });
  }, [bookSize, retentionRate, referralRate, rewriteRate, lostRevenue, missedReferrals, missedReferralRevenue, missedRewrites, missedRewriteRevenue, totalBleed, stableOnValuesChange]);

  const handleBookSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    const numValue = parseInt(rawValue) || 0;
    setBookSize(numValue);
    setBookSizeInput(numValue > 0 ? formatNumber(numValue) : '');
  };

  const isH = layout === 'horizontal';

  const inputsSection = (
    <>
      <div className={isH ? 'mb-5' : 'mb-8'}>
        <label htmlFor="bookSize" className={`block font-bold text-[#0D4D4D] ${isH ? 'text-base mb-2' : 'text-lg mb-3'}`}>Annual Book Size</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] text-xl font-medium">$</span>
          <input
            type="text"
            id="bookSize"
            value={bookSizeInput}
            onChange={handleBookSizeChange}
            placeholder="250,000"
            className={`w-full pl-10 pr-4 font-bold text-[#0D4D4D] bg-[#F8F9FA] border-2 border-gray-200 rounded-xl focus:border-[#3DD6C3] focus:outline-none focus:ring-4 focus:ring-[#3DD6C3]/20 transition-all ${isH ? 'py-3 text-xl' : 'py-4 text-2xl'}`}
          />
        </div>
      </div>

      <div className={isH ? 'mb-4' : 'mb-6'}>
        <div className={`flex items-center justify-between ${isH ? 'mb-2' : 'mb-3'}`}>
          <label htmlFor="retentionRate" className={`font-bold text-[#0D4D4D] ${isH ? 'text-sm' : 'text-base'}`}>Current Retention Rate</label>
          <span className={`font-extrabold text-[#3DD6C3] ${isH ? 'text-lg' : 'text-xl'}`}>{retentionRate}%</span>
        </div>
        <input
          type="range"
          id="retentionRate"
          min="40"
          max="95"
          value={retentionRate}
          onChange={(e) => setRetentionRate(parseInt(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
          style={{ background: `linear-gradient(to right, #3DD6C3 0%, #3DD6C3 ${((retentionRate - 40) / 55) * 100}%, #E5E7EB ${((retentionRate - 40) / 55) * 100}%, #E5E7EB 100%)` }}
        />
        <div className="flex justify-between text-xs text-[#6B7280] mt-1"><span>40%</span><span>95%</span></div>
      </div>

      <div className={isH ? 'mb-4' : 'mb-6'}>
        <div className={`flex items-center justify-between ${isH ? 'mb-2' : 'mb-3'}`}>
          <label htmlFor="referralRate" className={`font-bold text-[#0D4D4D] ${isH ? 'text-sm' : 'text-base'}`}>Current Referral Rate</label>
          <span className={`font-extrabold text-[#fdcc02] ${isH ? 'text-lg' : 'text-xl'}`}>{referralRate}%</span>
        </div>
        <input
          type="range"
          id="referralRate"
          min="0"
          max="25"
          value={referralRate}
          onChange={(e) => setReferralRate(parseInt(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
          style={{ background: `linear-gradient(to right, #fdcc02 0%, #fdcc02 ${(referralRate / 25) * 100}%, #E5E7EB ${(referralRate / 25) * 100}%, #E5E7EB 100%)` }}
        />
        <div className="flex justify-between text-xs text-[#6B7280] mt-1"><span>0%</span><span>25% (possible)</span></div>
      </div>

      <div className={isH ? '' : 'mb-8'}>
        <div className={`flex items-center justify-between ${isH ? 'mb-2' : 'mb-3'}`}>
          <label htmlFor="rewriteRate" className={`font-bold text-[#0D4D4D] ${isH ? 'text-sm' : 'text-base'}`}>Current Rewrite Rate</label>
          <span className={`font-extrabold text-[#0D4D4D] ${isH ? 'text-lg' : 'text-xl'}`}>{rewriteRate}%</span>
        </div>
        <input
          type="range"
          id="rewriteRate"
          min="0"
          max="35"
          value={rewriteRate}
          onChange={(e) => setRewriteRate(parseInt(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
          style={{ background: `linear-gradient(to right, #0D4D4D 0%, #0D4D4D ${(rewriteRate / 35) * 100}%, #E5E7EB ${(rewriteRate / 35) * 100}%, #E5E7EB 100%)` }}
        />
        <div className="flex justify-between text-xs text-[#6B7280] mt-1"><span>0%</span><span>35% (possible)</span></div>
      </div>
    </>
  );

  const resultsSection = (
    <>
      <div className={`bg-gradient-to-br from-red-50 to-red-100 rounded-2xl border-2 border-red-200 ${isH ? 'p-5 mb-4' : 'p-6 md:p-8 mb-8'}`}>
        {bookSize > 0 ? (
          <>
            <p className="text-center text-[#6B7280] mb-1 font-medium text-sm">You&apos;re leaving on the table</p>
            <p className="text-center">
              <span className={`font-black text-red-500 ${isH ? 'text-4xl lg:text-5xl' : 'text-5xl md:text-6xl'}`}>
                ${formatNumber(totalBleed)}
              </span>
            </p>
            <p className="text-center text-red-400 font-semibold mt-1 text-sm">/year in missed opportunity</p>
            <div className={`border-t border-red-200 space-y-2 text-sm ${isH ? 'mt-4 pt-4' : 'mt-6 pt-6 space-y-3'}`}>
              <div className="flex justify-between items-center py-1 border-b border-red-100">
                <span className="text-[#6B7280]">Lost to churn ({100 - retentionRate}%)</span>
                <span className="font-semibold text-red-500">-${formatNumber(lostRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-red-100">
                <span className="text-[#6B7280]">Missed referrals ({missedReferrals} clients)</span>
                <span className="font-semibold text-[#fdcc02]">-${formatNumber(missedReferralRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[#6B7280]">Missed rewrites ({missedRewrites} opportunities)</span>
                <span className="font-semibold text-[#0D4D4D]">-${formatNumber(missedRewriteRevenue)}</span>
              </div>
            </div>
            <div className={`bg-[#D1FAE5] rounded-lg p-3 border border-[#3DD6C3] ${isH ? 'mt-4' : 'mt-6 pt-4'}`}>
              <p className="text-center text-[#0D4D4D] text-sm"><span className="font-bold text-[#3DD6C3]">Agent For Life</span> helps you capture this revenue with <span className="font-bold">automated retention</span>, one-tap referrals, and anniversary rewrites.</p>
            </div>
          </>
        ) : (
          <p className="text-center text-[#6B7280] py-4">Enter your annual book size to see your losses.</p>
        )}
      </div>

      <Link
        href={ctaHref}
        className={`block w-full bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all text-center shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:scale-[1.02] active:scale-[0.98] ${isH ? 'py-4 text-lg' : 'py-5 text-xl'}`}
      >
        {ctaText}
      </Link>
    </>
  );

  if (isH) {
    return (
      <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="flex flex-col justify-center">{inputsSection}</div>
          <div className="flex flex-col justify-center">{resultsSection}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-8 md:p-10 shadow-2xl">
      {inputsSection}
      {resultsSection}
    </div>
  );
}
