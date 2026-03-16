import type { AgentAggregates } from './stats-aggregation';

export type BadgeIcon =
  | 'shield'
  | 'chat'
  | 'star'
  | 'heart'
  | 'trophy'
  | 'diamond'
  | 'flame'
  | 'target'
  | 'recruit';

export type BadgeTier = 'starter' | 'mid' | 'elite' | 'legendary';

export interface Badge {
  id: string;
  name: string;
  icon: BadgeIcon;
  color: string;
  tier: BadgeTier;
}

export interface EarnedBadge extends Badge {
  earnedIndex: number;
}

export interface BadgeDefinition extends Badge {
  check: (stats: AgentAggregates) => boolean;
  description: string;
  progressLabel: string;
  current: (s: AgentAggregates) => number;
  target: number;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ── Starter tier (circle) ──────────────────────────────────
  {
    id: 'first-save',
    name: 'Guardian',
    icon: 'shield',
    color: '#16a34a',
    tier: 'starter',
    check: (s) => s.savedPolicies.count >= 1,
    description: 'Saved your first at-risk policy',
    progressLabel: 'policies saved',
    current: (s) => s.savedPolicies.count,
    target: 1,
  },
  {
    id: 'first-referral',
    name: 'Connector',
    icon: 'chat',
    color: '#2563eb',
    tier: 'starter',
    check: (s) => s.referrals.total >= 1,
    description: 'Generated your first referral',
    progressLabel: 'referrals',
    current: (s) => s.referrals.total,
    target: 1,
  },
  {
    id: 'touchpoint-pro',
    name: 'Heartbeat',
    icon: 'heart',
    color: '#ec4899',
    tier: 'starter',
    check: (s) => s.touchpoints.total >= 10,
    description: 'Sent 10 client touchpoints',
    progressLabel: 'touchpoints sent',
    current: (s) => s.touchpoints.total,
    target: 10,
  },
  // ── Mid tier (shield) ──────────────────────────────────────
  {
    id: '5-referrals',
    name: 'Networker',
    icon: 'chat',
    color: '#2563eb',
    tier: 'mid',
    check: (s) => s.referrals.total >= 5,
    description: 'Generated 5 referrals',
    progressLabel: 'referrals',
    current: (s) => s.referrals.total,
    target: 5,
  },
  {
    id: '5-saves',
    name: 'Sentinel',
    icon: 'shield',
    color: '#16a34a',
    tier: 'mid',
    check: (s) => s.savedPolicies.count >= 5,
    description: 'Saved 5 at-risk policies',
    progressLabel: 'policies saved',
    current: (s) => s.savedPolicies.count,
    target: 5,
  },
  {
    id: '1k-apv',
    name: 'Momentum',
    icon: 'star',
    color: '#005851',
    tier: 'mid',
    check: (s) => s.totalApv >= 1000,
    description: 'Reached $1K in annual premium value',
    progressLabel: 'APV',
    current: (s) => s.totalApv,
    target: 1000,
  },
  {
    id: 'agent-recruiter',
    name: 'Scout',
    icon: 'recruit',
    color: '#0d9488',
    tier: 'mid',
    check: (s) => (s.agentsReferred ?? 0) >= 1,
    description: 'Recruited your first fellow agent',
    progressLabel: 'agents recruited',
    current: (s) => s.agentsReferred ?? 0,
    target: 1,
  },
  // ── Elite tier (hexagon) ───────────────────────────────────
  {
    id: '10-saves',
    name: 'Fortress',
    icon: 'trophy',
    color: '#d97706',
    tier: 'elite',
    check: (s) => s.savedPolicies.count >= 10,
    description: 'Saved 10 at-risk policies',
    progressLabel: 'policies saved',
    current: (s) => s.savedPolicies.count,
    target: 10,
  },
  {
    id: '5k-apv',
    name: 'Powerhouse',
    icon: 'diamond',
    color: '#7c3aed',
    tier: 'elite',
    check: (s) => s.totalApv >= 5000,
    description: 'Reached $5K in annual premium value',
    progressLabel: 'APV',
    current: (s) => s.totalApv,
    target: 5000,
  },
  {
    id: 'rewrite-master',
    name: 'Alchemist',
    icon: 'target',
    color: '#ea580c',
    tier: 'elite',
    check: (s) => s.successfulRewrites.count >= 5,
    description: 'Completed 5 successful rewrites',
    progressLabel: 'rewrites',
    current: (s) => s.successfulRewrites.count,
    target: 5,
  },
  {
    id: 'team-builder',
    name: 'Captain',
    icon: 'recruit',
    color: '#4f46e5',
    tier: 'elite',
    check: (s) => (s.agentsReferred ?? 0) >= 3,
    description: 'Recruited 3 fellow agents',
    progressLabel: 'agents recruited',
    current: (s) => s.agentsReferred ?? 0,
    target: 3,
  },
  // ── Legendary tier (star) ──────────────────────────────────
  {
    id: 'elite-agent',
    name: 'Titan',
    icon: 'diamond',
    color: '#005851',
    tier: 'legendary',
    check: (s) => s.totalApv >= 10000,
    description: 'Reached $10K in annual premium value',
    progressLabel: 'APV',
    current: (s) => s.totalApv,
    target: 10000,
  },
  {
    id: 'agency-leader',
    name: 'AgentForLife',
    icon: 'recruit',
    color: '#b45309',
    tier: 'legendary',
    check: (s) => (s.agentsReferred ?? 0) >= 5,
    description: 'Recruited 5 fellow agents — the highest honor',
    progressLabel: 'agents recruited',
    current: (s) => s.agentsReferred ?? 0,
    target: 5,
  },
];

export function computeBadges(stats: AgentAggregates): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  for (let i = 0; i < BADGE_DEFINITIONS.length; i++) {
    const def = BADGE_DEFINITIONS[i];
    if (def.check(stats)) {
      earned.push({
        id: def.id,
        name: def.name,
        icon: def.icon,
        color: def.color,
        tier: def.tier,
        earnedIndex: i,
      });
    }
  }
  return earned;
}

export function getMostRecentBadge(
  stats: AgentAggregates,
): EarnedBadge | null {
  const earned = computeBadges(stats);
  return earned.length > 0 ? earned[earned.length - 1] : null;
}

export function getNextUnearned(
  stats: AgentAggregates,
): BadgeDefinition | null {
  for (const def of BADGE_DEFINITIONS) {
    if (!def.check(stats)) return def;
  }
  return null;
}

export function getTotalBadgeCount(): number {
  return BADGE_DEFINITIONS.length;
}
