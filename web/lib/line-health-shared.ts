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
  /** Concrete action the admin should take right now while Phase A
   *  visibility-only is in effect (no auto-throttle yet). */
  recommendedAction: string;
  badgeClassName: string;
}

export const TIER_DISPLAY: Readonly<Record<LineHealthTier, TierDisplay>> = {
  0: {
    label: 'Healthy',
    description: 'Reply rate within target. Normal operation.',
    recommendedAction: 'No action needed. Keep an eye on the trend.',
    badgeClassName: 'bg-green-100 text-green-800 border-green-300',
  },
  1: {
    label: 'Watch',
    description:
      'Reply rate slipping below the 25% target. Phase A is visibility only — no auto-throttle yet.',
    recommendedAction:
      'Check the per-lane breakdown to see if one lane is dragging the rate. Review recent outbound copy on that lane. No action required if volume is small (single bad day).',
    badgeClassName: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  2: {
    label: 'Throttle',
    description:
      'Reply rate below 20% — concerning. Phase B (when it ships) will halve daily Linq cap and pause referral cold outreach.',
    recommendedAction:
      'Manually pause referral cold outreach if the per-lane breakdown shows referral as the offender. Audit the last 7 days of outbound for spam-trigger patterns. Consider emailing Linq PSM for context if the trend persists 2+ days.',
    badgeClassName: 'bg-orange-100 text-orange-900 border-orange-300',
  },
  3: {
    label: 'Pause',
    description:
      'Reply rate below 15% OR an admin-set tier (e.g. Linq PSM warning email). All Linq automated outbound should halt.',
    recommendedAction:
      'Set LINQ_OUTBOUND_DISABLED=true in Vercel to halt the Linq line immediately. Email Linq PSM. Push, agent-phone one-tap, and email keep working — agents can still operate.',
    badgeClassName: 'bg-red-100 text-red-800 border-red-300',
  },
  4: {
    label: 'Lockdown',
    description:
      'Linq Limited status, or repeat Tier 3 within 30 days. Mandatory review.',
    recommendedAction:
      'Set LINQ_OUTBOUND_DISABLED=true. Coordinate directly with Linq PSM on line health. Number replacement playbook is on the table — discuss before any new outbound resumes.',
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
