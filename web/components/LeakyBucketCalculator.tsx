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
  theme?: 'default' | 'closr';
  onValuesChange?: (values: CalculatorValues) => void;
}

const AVG_POLICY_VALUE = 1200;

const formatNumber = (num: number) =>
  num.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** Signed dollar delta: +$4,800 / -$4,800. */
const formatDelta = (num: number) =>
  `${num >= 0 ? '+' : '-'}$${formatNumber(Math.abs(num))}`;

export default function LeakyBucketCalculator({
  initialBookSize = 250000,
  initialRetentionRate = 70,
  initialReferralRate = 5,
  initialRewriteRate = 10,
  ctaHref = '/pricing',
  ctaText = 'Stop the Bleeding →',
  layout = 'vertical',
  theme = 'default',
  onValuesChange,
}: LeakyBucketCalculatorProps) {
  const [bookSize, setBookSize] = useState(initialBookSize);
  const [bookSizeInput, setBookSizeInput] = useState(formatNumber(initialBookSize));
  const [retentionRate, setRetentionRate] = useState(initialRetentionRate);
  const [referralRate, setReferralRate] = useState(initialReferralRate);
  const [rewriteRate, setRewriteRate] = useState(initialRewriteRate);
  // The locked-in "current rates" the improvement readout compares
  // against. Starts UNSET: the user first sets the sliders to where they
  // are today, locks them in, and only then does moving a lever show the
  // dollar improvement — so dialing in a low starting reality never
  // flashes a confusing negative delta. Rates only — dollar figures are
  // derived against the CURRENT book size so editing the book doesn't
  // produce a stale delta.
  const [baseline, setBaseline] = useState<{
    retention: number;
    referral: number;
    rewrite: number;
  } | null>(null);

  const lostRevenue = bookSize * (1 - retentionRate / 100);
  const totalClients = Math.round(bookSize / AVG_POLICY_VALUE);
  const missedReferrals = Math.round(totalClients * ((25 - referralRate) / 100));
  const missedReferralRevenue = missedReferrals * AVG_POLICY_VALUE;
  const missedRewrites = Math.round(totalClients * ((35 - rewriteRate) / 100));
  const missedRewriteRevenue = missedRewrites * AVG_POLICY_VALUE;
  const totalBleed = lostRevenue + missedReferralRevenue + missedRewriteRevenue;

  // Improvement vs the locked-in current rates, computed with the same
  // formulas (and the same client-count rounding) as the bleed above, so
  // the lever lines always sum to the total. Positive = money added to
  // the bottom line.
  const baselineLostRevenue = baseline ? bookSize * (1 - baseline.retention / 100) : 0;
  const baselineMissedReferralRevenue = baseline
    ? Math.round(totalClients * ((25 - baseline.referral) / 100)) * AVG_POLICY_VALUE
    : 0;
  const baselineMissedRewriteRevenue = baseline
    ? Math.round(totalClients * ((35 - baseline.rewrite) / 100)) * AVG_POLICY_VALUE
    : 0;
  const retentionDelta = baselineLostRevenue - lostRevenue;
  const referralDelta = baselineMissedReferralRevenue - missedReferralRevenue;
  const rewriteDelta = baselineMissedRewriteRevenue - missedRewriteRevenue;
  const totalDelta = retentionDelta + referralDelta + rewriteDelta;
  const hasDelta =
    baseline !== null &&
    (retentionRate !== baseline.retention ||
      referralRate !== baseline.referral ||
      rewriteRate !== baseline.rewrite);

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
  const isClosr = theme === 'closr';
  const palette = isClosr
    ? {
        heading: '#1A1A1A',
        muted: '#1A1A1AB3',
        shellBg: '#FFFDF3',
        shellBorder: 'border-[#1A1A1A]',
        inputBg: '#F8F6EF',
        inputBorder: 'border-[#1A1A1A]/20',
        inputFocusBorder: '#1A1A1A',
        inputFocusRing: 'rgba(240,215,255,0.4)',
        sliderInactive: '#E7E1D4',
        positive: '#0F5F56',
        retention: '#0F5F56',
        referral: '#B077E8',
        rewrite: '#1A1A1A',
        resultsBgFrom: '#FFF7FA',
        resultsBgTo: '#F8EEF6',
        resultsBorder: 'border-[#1A1A1A]/20',
        danger: '#7F1C34',
        referralText: '#8451B8',
        ctaBg: 'bg-[#F0D7FF]',
        ctaHoverBg: 'hover:bg-[#E4C3FA]',
        ctaText: 'text-[#1A1A1A]',
        ctaShadow: 'shadow-[3px_3px_0_0_#1A1A1A]',
        ctaHoverShadow: 'hover:shadow-[2px_2px_0_0_#1A1A1A]',
      }
    : {
        heading: '#0D4D4D',
        muted: '#6B7280',
        shellBg: '#FFFFFF',
        shellBorder: 'border-transparent',
        inputBg: '#F8F9FA',
        inputBorder: 'border-gray-200',
        inputFocusBorder: '#3DD6C3',
        inputFocusRing: 'rgba(61,214,195,0.2)',
        sliderInactive: '#E5E7EB',
        positive: '#16A34A',
        retention: '#3DD6C3',
        referral: '#fdcc02',
        rewrite: '#0D4D4D',
        resultsBgFrom: '#FEF2F2',
        resultsBgTo: '#FEE2E2',
        resultsBorder: 'border-red-200',
        danger: '#EF4444',
        referralText: '#fdcc02',
        ctaBg: 'bg-red-500',
        ctaHoverBg: 'hover:bg-red-600',
        ctaText: 'text-white',
        ctaShadow: 'shadow-lg shadow-red-500/30',
        ctaHoverShadow: 'hover:shadow-red-500/50',
      };

  const inputsSection = (
    <>
      <div className={isH ? 'mb-5' : 'mb-8'}>
        <label htmlFor="bookSize" className={`block font-bold ${isH ? 'text-base mb-2' : 'text-lg mb-3'}`} style={{ color: palette.heading }}>Annual Book Size</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-medium" style={{ color: palette.muted }}>$</span>
          <input
            type="text"
            id="bookSize"
            value={bookSizeInput}
            onChange={handleBookSizeChange}
            placeholder="250,000"
            className={`w-full pl-10 pr-4 font-bold rounded-xl border-2 transition-all focus:outline-none focus:ring-4 ${palette.inputBorder} ${isH ? 'py-3 text-xl' : 'py-4 text-2xl'}`}
            style={{
              color: palette.heading,
              backgroundColor: palette.inputBg,
              borderColor: undefined,
              boxShadow: undefined,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = palette.inputFocusBorder;
              e.currentTarget.style.boxShadow = `0 0 0 4px ${palette.inputFocusRing}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '';
              e.currentTarget.style.boxShadow = '';
            }}
          />
        </div>
      </div>

      <div className={isH ? 'mb-4' : 'mb-6'}>
        <div className={`flex items-center justify-between ${isH ? 'mb-2' : 'mb-3'}`}>
          <label htmlFor="retentionRate" className={`font-bold ${isH ? 'text-sm' : 'text-base'}`} style={{ color: palette.heading }}>Current Retention Rate</label>
          <span className={`font-extrabold ${isH ? 'text-lg' : 'text-xl'}`} style={{ color: palette.retention }}>{retentionRate}%</span>
        </div>
        <input
          type="range"
          id="retentionRate"
          min="40"
          max="95"
          value={retentionRate}
          onChange={(e) => setRetentionRate(parseInt(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
          style={{ background: `linear-gradient(to right, ${palette.retention} 0%, ${palette.retention} ${((retentionRate - 40) / 55) * 100}%, ${palette.sliderInactive} ${((retentionRate - 40) / 55) * 100}%, ${palette.sliderInactive} 100%)` }}
        />
        <div className="mt-1 flex justify-between text-xs" style={{ color: palette.muted }}><span>40%</span><span>95%</span></div>
      </div>

      <div className={isH ? 'mb-4' : 'mb-6'}>
        <div className={`flex items-center justify-between ${isH ? 'mb-2' : 'mb-3'}`}>
          <label htmlFor="referralRate" className={`font-bold ${isH ? 'text-sm' : 'text-base'}`} style={{ color: palette.heading }}>Current Referral Rate</label>
          <span className={`font-extrabold ${isH ? 'text-lg' : 'text-xl'}`} style={{ color: palette.referral }}>{referralRate}%</span>
        </div>
        <input
          type="range"
          id="referralRate"
          min="0"
          max="25"
          value={referralRate}
          onChange={(e) => setReferralRate(parseInt(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
          style={{ background: `linear-gradient(to right, ${palette.referral} 0%, ${palette.referral} ${(referralRate / 25) * 100}%, ${palette.sliderInactive} ${(referralRate / 25) * 100}%, ${palette.sliderInactive} 100%)` }}
        />
        <div className="mt-1 flex justify-between text-xs" style={{ color: palette.muted }}><span>0%</span><span>25% (possible)</span></div>
      </div>

      <div className={isH ? '' : 'mb-8'}>
        <div className={`flex items-center justify-between ${isH ? 'mb-2' : 'mb-3'}`}>
          <label htmlFor="rewriteRate" className={`font-bold ${isH ? 'text-sm' : 'text-base'}`} style={{ color: palette.heading }}>Current Rewrite Rate</label>
          <span className={`font-extrabold ${isH ? 'text-lg' : 'text-xl'}`} style={{ color: palette.rewrite }}>{rewriteRate}%</span>
        </div>
        <input
          type="range"
          id="rewriteRate"
          min="0"
          max="35"
          value={rewriteRate}
          onChange={(e) => setRewriteRate(parseInt(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer slider-thumb"
          style={{ background: `linear-gradient(to right, ${palette.rewrite} 0%, ${palette.rewrite} ${(rewriteRate / 35) * 100}%, ${palette.sliderInactive} ${(rewriteRate / 35) * 100}%, ${palette.sliderInactive} 100%)` }}
        />
        <div className="mt-1 flex justify-between text-xs" style={{ color: palette.muted }}><span>0%</span><span>35% (possible)</span></div>
      </div>
    </>
  );

  const resultsSection = (
    <>
      <div
        className={`rounded-2xl border-2 ${palette.resultsBorder} ${isH ? 'p-5 mb-4' : 'p-6 md:p-8 mb-8'}`}
        style={{ background: `linear-gradient(to bottom right, ${palette.resultsBgFrom}, ${palette.resultsBgTo})` }}
      >
        {bookSize > 0 ? (
          <>
            <p className="mb-1 text-center text-sm font-medium" style={{ color: palette.muted }}>You&apos;re leaving on the table</p>
            <p className="text-center">
              <span className={`font-black ${isH ? 'text-4xl lg:text-5xl' : 'text-5xl md:text-6xl'}`} style={{ color: palette.danger }}>
                ${formatNumber(totalBleed)}
              </span>
            </p>
            <p className="mt-1 text-center text-sm font-semibold" style={{ color: palette.danger }}>/year in missed opportunity</p>
            <div className={`space-y-2 border-t text-sm ${isH ? 'mt-4 pt-4' : 'mt-6 pt-6 space-y-3'}`} style={{ borderColor: `${palette.heading}22` }}>
              <div className="flex items-center justify-between border-b py-1" style={{ borderColor: `${palette.heading}18` }}>
                <span style={{ color: palette.muted }}>Lost to churn ({100 - retentionRate}%)</span>
                <span className="font-semibold" style={{ color: palette.danger }}>-${formatNumber(lostRevenue)}</span>
              </div>
              <div className="flex items-center justify-between border-b py-1" style={{ borderColor: `${palette.heading}18` }}>
                <span style={{ color: palette.muted }}>Missed referrals ({missedReferrals} clients)</span>
                <span className="font-semibold" style={{ color: palette.referralText }}>-${formatNumber(missedReferralRevenue)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span style={{ color: palette.muted }}>Missed rewrites ({missedRewrites} opportunities)</span>
                <span className="font-semibold" style={{ color: palette.rewrite }}>-${formatNumber(missedRewriteRevenue)}</span>
              </div>
            </div>
            {baseline === null ? (
              <div className={`rounded-xl border-2 border-dashed p-4 text-center ${isH ? 'mt-4' : 'mt-6'}`} style={{ borderColor: `${palette.heading}33`, backgroundColor: '#FFFFFF' }}>
                <p className="text-sm font-semibold" style={{ color: palette.heading }}>
                  Set the sliders to where you are <span className="underline">today</span>, then:
                </p>
                <button
                  type="button"
                  onClick={() => setBaseline({ retention: retentionRate, referral: referralRate, rewrite: rewriteRate })}
                  className="mt-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.03] active:scale-[0.97]"
                  style={{ backgroundColor: palette.positive }}
                >
                  Lock in my current rates
                </button>
                <p className="mt-2 text-xs" style={{ color: palette.muted }}>
                  Then raise any slider to see what improving it adds to your bottom line.
                </p>
              </div>
            ) : hasDelta ? (
              <div
                className={`rounded-xl border-2 p-4 ${isH ? 'mt-4' : 'mt-6'}`}
                style={{
                  borderColor: totalDelta >= 0 ? palette.positive : palette.danger,
                  backgroundColor: '#FFFFFF',
                }}
              >
                <p className="text-center text-xs font-semibold uppercase tracking-wide" style={{ color: palette.muted }}>
                  {totalDelta >= 0 ? 'Improving these rates adds' : 'Slipping to these rates costs'}
                </p>
                <p className="mt-1 text-center">
                  <span className={`font-black ${isH ? 'text-3xl' : 'text-4xl'}`} style={{ color: totalDelta >= 0 ? palette.positive : palette.danger }}>
                    {formatDelta(totalDelta)}
                  </span>
                </p>
                <p className="text-center text-sm font-semibold" style={{ color: totalDelta >= 0 ? palette.positive : palette.danger }}>
                  /year to your bottom line
                </p>
                <div className="mt-3 space-y-1.5 border-t pt-3 text-sm" style={{ borderColor: `${palette.heading}18` }}>
                  {retentionRate !== baseline.retention && (
                    <div className="flex items-center justify-between">
                      <span style={{ color: palette.muted }}>Retention {baseline.retention}% → {retentionRate}%</span>
                      <span className="font-bold" style={{ color: retentionDelta >= 0 ? palette.positive : palette.danger }}>{formatDelta(retentionDelta)}</span>
                    </div>
                  )}
                  {referralRate !== baseline.referral && (
                    <div className="flex items-center justify-between">
                      <span style={{ color: palette.muted }}>Referrals {baseline.referral}% → {referralRate}%</span>
                      <span className="font-bold" style={{ color: referralDelta >= 0 ? palette.positive : palette.danger }}>{formatDelta(referralDelta)}</span>
                    </div>
                  )}
                  {rewriteRate !== baseline.rewrite && (
                    <div className="flex items-center justify-between">
                      <span style={{ color: palette.muted }}>Rewrites {baseline.rewrite}% → {rewriteRate}%</span>
                      <span className="font-bold" style={{ color: rewriteDelta >= 0 ? palette.positive : palette.danger }}>{formatDelta(rewriteDelta)}</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setBaseline({ retention: retentionRate, referral: referralRate, rewrite: rewriteRate })}
                  className="mx-auto mt-3 block text-xs font-semibold underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-70"
                  style={{ color: palette.muted }}
                >
                  Update my current rates
                </button>
              </div>
            ) : (
              <p className={`text-center text-xs font-medium ${isH ? 'mt-4' : 'mt-6'}`} style={{ color: palette.muted }}>
                Current rates locked in ✓ — now raise a slider to see what improving it is worth.
              </p>
            )}
            <div className={`rounded-lg border p-3 ${isH ? 'mt-4' : 'mt-6 pt-4'}`} style={{ backgroundColor: '#F8F6EF', borderColor: `${palette.heading}26` }}>
              <p className="text-center text-sm" style={{ color: palette.heading }}><span className="font-bold" style={{ color: palette.retention }}>Agent For Life</span> helps you capture this revenue with <span className="font-bold">automated retention</span>, one-tap referrals, and anniversary rewrites.</p>
            </div>
          </>
        ) : (
          <p className="py-4 text-center" style={{ color: palette.muted }}>Enter your annual book size to see your losses.</p>
        )}
      </div>

      <Link
        href={ctaHref}
        className={`block w-full rounded-xl text-center font-bold transition-all hover:scale-[1.02] active:scale-[0.98] ${palette.ctaBg} ${palette.ctaHoverBg} ${palette.ctaText} ${palette.ctaShadow} ${palette.ctaHoverShadow} ${isH ? 'py-4 text-lg' : 'py-5 text-xl'}`}
      >
        {ctaText}
      </Link>
    </>
  );

  if (isH) {
    return (
      <div className={`rounded-3xl border-2 p-6 lg:p-8 ${palette.shellBorder} ${isClosr ? '' : 'shadow-2xl'}`} style={{ backgroundColor: palette.shellBg, boxShadow: isClosr ? '4px 4px 0 0 #1A1A1A' : undefined }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="flex flex-col justify-center">{inputsSection}</div>
          <div className="flex flex-col justify-center">{resultsSection}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-3xl border-2 p-8 md:p-10 ${palette.shellBorder} ${isClosr ? '' : 'shadow-2xl'}`} style={{ backgroundColor: palette.shellBg, boxShadow: isClosr ? '4px 4px 0 0 #1A1A1A' : undefined }}>
      {inputsSection}
      {resultsSection}
    </div>
  );
}
