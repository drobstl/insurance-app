'use client';

import { useMemo } from 'react';
import type { AgentAggregates } from '../lib/stats-aggregation';
import {
  BADGE_DEFINITIONS,
  computeBadges,
  getNextBadgeToChase,
  type BadgeTier,
} from '../lib/badges';
import PremiumBadge from './PremiumBadge';

const TIERS: { key: BadgeTier; label: string }[] = [
  { key: 'starter', label: 'Starter' },
  { key: 'mid', label: 'Mid' },
  { key: 'elite', label: 'Elite' },
  { key: 'legendary', label: 'Legendary' },
];

function fmtApv(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n.toLocaleString('en-US')}`;
}

interface Props {
  stats: AgentAggregates;
  /** Open the full BadgeShelf (all badges, locked + earned, share). */
  onViewAll: () => void;
}

/**
 * Persistent "Your badges" trophy case for the dashboard home. Leads with the
 * next badge to chase — name + plain how-to-earn line + a progress bar — so a
 * new agent always knows what a badge is and how to get it. Renders even at
 * zero badges (the hero becomes "your first badge"), which is exactly the case
 * the old click-to-open hero icon left blank.
 */
export default function BadgeProgressCard({ stats, onViewAll }: Props) {
  const earned = useMemo(() => computeBadges(stats), [stats]);
  const earnedIds = useMemo(() => new Set(earned.map((b) => b.id)), [earned]);
  const next = useMemo(() => getNextBadgeToChase(stats), [stats]);

  const tierCounts = TIERS.map((t) => {
    const defs = BADGE_DEFINITIONS.filter((d) => d.tier === t.key);
    return {
      ...t,
      got: defs.filter((d) => earnedIds.has(d.id)).length,
      total: defs.length,
    };
  });

  const isApv = next?.progressLabel === 'APV';
  const cur = next ? next.current(stats) : 0;
  const tgt = next ? next.target : 0;
  const pct = next && tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
  const remaining = Math.max(0, tgt - cur);
  const fmt = (n: number) => (isApv ? fmtApv(n) : n.toLocaleString('en-US'));

  return (
    <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
      {/* header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-bold text-[#005851]">Your badges</h2>
          <span className="text-sm text-[#707070]">
            {earned.length} of {BADGE_DEFINITIONS.length} earned
          </span>
        </div>
        <button
          onClick={onViewAll}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#0f766e] hover:text-[#005851] transition-colors"
        >
          View all
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* tier progress chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tierCounts.map((t) => {
          const complete = t.total > 0 && t.got === t.total;
          return (
            <span
              key={t.key}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[#f1f1f1] border border-[#e0e0e0]"
            >
              <span className="font-semibold text-[#000000]">{t.label}</span>
              <span className="text-[#707070]">{t.got}/{t.total}</span>
              {complete && (
                <svg className="w-3 h-3 text-[#16a34a]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </span>
          );
        })}
      </div>

      {/* next-badge hero */}
      {next ? (
        <button
          onClick={onViewAll}
          className="w-full flex items-center gap-4 bg-[#f0faf8] border border-[#cdeae3] rounded-lg p-3.5 text-left hover:bg-[#e7f6f2] transition-colors"
        >
          <div className="relative shrink-0">
            <PremiumBadge badgeId={next.id} size={56} />
            <span className="absolute -top-2 -right-3 bg-[#005851] text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {earned.length === 0 ? 'Start' : 'Next'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-[#000000]">{next.name}</span>
              <span className="text-[11px] text-[#9ca3af] capitalize">{next.tier} badge</span>
            </div>
            <p className="text-[13px] text-[#4b5563] mt-0.5 mb-2">{next.howToEarn}.</p>
            <div className="h-1.5 bg-[#dbeae6] rounded-full overflow-hidden">
              <div className="h-full bg-[#005851] rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[12px] text-[#707070] mt-1">
              {fmt(cur)} / {fmt(tgt)}{!isApv && ` ${next.progressLabel}`}
              <span className="text-[#0f766e] font-semibold"> · {fmt(remaining)} to go</span>
            </div>
          </div>
        </button>
      ) : (
        <div className="bg-[#f0faf8] border border-[#cdeae3] rounded-lg p-4 text-center text-sm font-semibold text-[#005851]">
          🏆 Every badge earned — you&apos;re a legend.
        </div>
      )}

      {/* earned row */}
      <div className="mt-4">
        {earned.length > 0 ? (
          <div className="flex flex-wrap gap-3 items-start">
            {earned.map((b) => (
              <div key={b.id} className="flex flex-col items-center gap-1 w-[58px]">
                <PremiumBadge badgeId={b.id} size={42} shimmer />
                <span className="text-[10px] text-[#707070] text-center leading-tight">{b.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#9ca3af]">
            Your trophy case is empty — the badge above is your first one to earn.
          </p>
        )}
      </div>
    </div>
  );
}
