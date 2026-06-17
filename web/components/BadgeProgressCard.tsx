'use client';

import { useMemo, useState } from 'react';
import type { AgentAggregates } from '../lib/stats-aggregation';
import {
  BADGE_DEFINITIONS,
  computeBadges,
  getNextBadgeToChase,
  type BadgeTier,
  type BadgeDefinition,
  type EarnedBadge,
} from '../lib/badges';
import PremiumBadge from './PremiumBadge';
import BadgeSpotlight from './BadgeSpotlight';

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

function progressFor(def: BadgeDefinition, stats: AgentAggregates) {
  const isApv = def.progressLabel === 'APV';
  const cur = def.current(stats);
  const tgt = def.target;
  const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
  const remaining = Math.max(0, tgt - cur);
  const fmt = (n: number) => (isApv ? fmtApv(n) : n.toLocaleString('en-US'));
  const unit = isApv ? '' : ` ${def.progressLabel}`;
  return { isApv, cur, tgt, pct, remaining, fmt, unit };
}

interface Props {
  stats: AgentAggregates;
  /** Fired when the agent shares an earned badge from the spotlight. */
  onShareBadge?: (badge: EarnedBadge) => void;
}

/**
 * Persistent "Your badges" trophy case for the dashboard home. Shows the next
 * badge to chase (with how-to-earn + progress) above the full collection — every
 * badge in one row, earned in color, locked grayed out. Clicking any badge opens
 * a full-screen close-up of the art + its details. No separate drawer.
 */
export default function BadgeProgressCard({ stats, onShareBadge }: Props) {
  const earned = useMemo(() => computeBadges(stats), [stats]);
  const earnedIds = useMemo(() => new Set(earned.map((b) => b.id)), [earned]);
  const next = useMemo(() => getNextBadgeToChase(stats), [stats]);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  const tierCounts = TIERS.map((t) => {
    const defs = BADGE_DEFINITIONS.filter((d) => d.tier === t.key);
    return {
      ...t,
      got: defs.filter((d) => earnedIds.has(d.id)).length,
      total: defs.length,
    };
  });

  const heroProg = next ? progressFor(next, stats) : null;

  const spotlightDef = spotlightId
    ? BADGE_DEFINITIONS.find((d) => d.id === spotlightId) ?? null
    : null;
  const spotlightEarned = spotlightId ? earnedIds.has(spotlightId) : false;
  const spotlightEarnedBadge = spotlightId
    ? earned.find((b) => b.id === spotlightId) ?? null
    : null;
  const spotlightProg = spotlightDef ? progressFor(spotlightDef, stats) : null;

  return (
    <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
      {/* header */}
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-base font-bold text-[#005851]">Your badges</h2>
        <span className="text-sm text-[#707070]">
          {earned.length} of {BADGE_DEFINITIONS.length} earned
        </span>
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

      {/* next-badge hero (click → spotlight) */}
      {next && heroProg ? (
        <button
          onClick={() => setSpotlightId(next.id)}
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
              <div className="h-full bg-[#005851] rounded-full" style={{ width: `${heroProg.pct}%` }} />
            </div>
            <div className="text-[12px] text-[#707070] mt-1">
              {heroProg.fmt(heroProg.cur)} / {heroProg.fmt(heroProg.tgt)}{heroProg.unit}
              <span className="text-[#0f766e] font-semibold"> · {heroProg.fmt(heroProg.remaining)} to go</span>
            </div>
          </div>
        </button>
      ) : (
        <div className="bg-[#f0faf8] border border-[#cdeae3] rounded-lg p-4 text-center text-sm font-semibold text-[#005851]">
          🏆 Every badge earned — you&apos;re a legend.
        </div>
      )}

      {/* full collection — every badge, earned in color, locked grayed */}
      <div className="mt-5 flex flex-wrap gap-x-3 gap-y-4">
        {BADGE_DEFINITIONS.map((def) => {
          const isEarned = earnedIds.has(def.id);
          const isNext = next?.id === def.id;
          return (
            <button
              key={def.id}
              onClick={() => setSpotlightId(def.id)}
              className="flex flex-col items-center gap-1 w-[56px] hover:-translate-y-0.5 transition-transform"
              title={def.name}
            >
              <PremiumBadge badgeId={def.id} size={44} shimmer={isEarned} grayscale={!isEarned && !isNext} />
              <span
                className={`text-[10px] text-center leading-tight ${
                  isEarned ? 'text-[#4b5563]' : isNext ? 'text-[#005851] font-semibold' : 'text-[#9ca3af]'
                }`}
              >
                {def.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* full-screen spotlight — cinematic reveal + up-close inspection */}
      {spotlightDef && spotlightProg && (
        <BadgeSpotlight
          def={spotlightDef}
          earned={spotlightEarned}
          prog={spotlightProg}
          onShare={
            onShareBadge && spotlightEarnedBadge
              ? () => onShareBadge(spotlightEarnedBadge)
              : undefined
          }
          onClose={() => setSpotlightId(null)}
        />
      )}
    </div>
  );
}
