/**
 * Linq line health — types + display constants safe to import from
 * both server and client modules.
 *
 * Pairs with `web/lib/line-health.ts` (server-only — counters,
 * Firestore reads, increment hooks). The split exists so the admin
 * widget client component can import types and TIER_DISPLAY without
 * dragging firebase-admin into the browser bundle.
 */

export type LineHealthTier = 0 | 1 | 2 | 3 | 4;

export type LineHealthLane =
  | 'welcome_activation'
  | 'conservation'
  | 'referral'
  | 'policy_review'
  | 'beneficiary'
  | 'manual'
  | 'unknown';

export interface LineHealthThresholds {
  tier0MinReplyRate: number;
  tier1MinReplyRate: number;
  tier2MinReplyRate: number;
  tier3MinReplyRate: number;
  minOutboundForClassification: number;
}

export const DEFAULT_THRESHOLDS: LineHealthThresholds = {
  tier0MinReplyRate: 0.25,
  tier1MinReplyRate: 0.25,
  tier2MinReplyRate: 0.2,
  tier3MinReplyRate: 0.15,
  minOutboundForClassification: 10,
};

export interface LineHealthMetrics {
  outboundCount: number;
  inboundCount: number;
  newConversationCount: number;
  replyRate: number;
  outboundToday: number;
  inboundToday: number;
  outboundByLane: Partial<Record<LineHealthLane, number>>;
  computedAt: string;
}

export interface LineHealthSnapshot {
  metrics: LineHealthMetrics;
  autoTier: LineHealthTier;
  manualTier: LineHealthTier | null;
  manualOverrideReason: string | null;
  manualOverrideSetBy: string | null;
  manualOverrideSetAt: string | null;
  effectiveTier: LineHealthTier;
}

export interface TierDisplay {
  label: string;
  description: string;
  badgeClassName: string;
}

export const TIER_DISPLAY: Readonly<Record<LineHealthTier, TierDisplay>> = {
  0: {
    label: 'Healthy',
    description: 'Reply rate within target. Normal operation.',
    badgeClassName: 'bg-green-100 text-green-800 border-green-300',
  },
  1: {
    label: 'Watch',
    description:
      'Reply rate slipping below target. Surface alert; no auto-throttle yet (Phase A).',
    badgeClassName: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  2: {
    label: 'Throttle',
    description:
      'Reply rate concerning. Phase B will halve daily Linq cap and suspend referral cold outreach.',
    badgeClassName: 'bg-orange-100 text-orange-900 border-orange-300',
  },
  3: {
    label: 'Pause',
    description:
      'All Linq automated outbound halted (when Phase B ships). Push, agent-phone, email keep working.',
    badgeClassName: 'bg-red-100 text-red-800 border-red-300',
  },
  4: {
    label: 'Lockdown',
    description:
      'Linq Limited or repeat Tier 3. Mandatory review. Number replacement playbook on the table.',
    badgeClassName: 'bg-red-200 text-red-900 border-red-500',
  },
};

/**
 * Pure classifier — no Firestore, no I/O. Safe to import anywhere.
 * Falls back to Tier 0 when outbound volume is below
 * `minOutboundForClassification` (a quiet line isn't a problem).
 */
export function classifyLineHealth(
  metrics: LineHealthMetrics,
  thresholds: LineHealthThresholds = DEFAULT_THRESHOLDS,
): LineHealthTier {
  if (metrics.outboundCount < thresholds.minOutboundForClassification) {
    return 0;
  }
  const rate = metrics.replyRate;
  if (rate < thresholds.tier3MinReplyRate) return 3;
  if (rate < thresholds.tier2MinReplyRate) return 2;
  if (rate < thresholds.tier1MinReplyRate) return 1;
  return 0;
}
