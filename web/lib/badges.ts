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

export interface Badge {
  id: string;
  name: string;
  icon: BadgeIcon;
  color: string;
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
  {
    id: 'first-save',
    name: 'First Save',
    icon: 'shield',
    color: '#16a34a',
    check: (s) => s.savedPolicies.count >= 1,
    description: 'Save your first at-risk policy',
    progressLabel: 'policies saved',
    current: (s) => s.savedPolicies.count,
    target: 1,
  },
  {
    id: 'first-referral',
    name: 'First Referral',
    icon: 'chat',
    color: '#2563eb',
    check: (s) => s.referrals.total >= 1,
    description: 'Generate your first referral',
    progressLabel: 'referrals',
    current: (s) => s.referrals.total,
    target: 1,
  },
  {
    id: 'touchpoint-pro',
    name: 'Touchpoint Pro',
    icon: 'heart',
    color: '#ec4899',
    check: (s) => s.touchpoints.total >= 10,
    description: 'Send 10 client touchpoints',
    progressLabel: 'touchpoints sent',
    current: (s) => s.touchpoints.total,
    target: 10,
  },
  {
    id: '5-referrals',
    name: '5 Referrals',
    icon: 'chat',
    color: '#2563eb',
    check: (s) => s.referrals.total >= 5,
    description: 'Generate 5 referrals',
    progressLabel: 'referrals',
    current: (s) => s.referrals.total,
    target: 5,
  },
  {
    id: '5-saves',
    name: '5 Policies Saved',
    icon: 'shield',
    color: '#16a34a',
    check: (s) => s.savedPolicies.count >= 5,
    description: 'Save 5 at-risk policies',
    progressLabel: 'policies saved',
    current: (s) => s.savedPolicies.count,
    target: 5,
  },
  {
    id: '1k-apv',
    name: '$1K APV',
    icon: 'star',
    color: '#005851',
    check: (s) => s.totalApv >= 1000,
    description: 'Reach $1,000 in total annual premium value',
    progressLabel: 'APV',
    current: (s) => s.totalApv,
    target: 1000,
  },
  {
    id: 'agent-recruiter',
    name: 'Agent Recruiter',
    icon: 'recruit',
    color: '#0d9488',
    check: (s) => (s.agentsReferred ?? 0) >= 1,
    description: 'Recruit your first fellow agent',
    progressLabel: 'agents recruited',
    current: (s) => s.agentsReferred ?? 0,
    target: 1,
  },
  {
    id: '10-saves',
    name: '10 Saves',
    icon: 'trophy',
    color: '#d97706',
    check: (s) => s.savedPolicies.count >= 10,
    description: 'Save 10 at-risk policies',
    progressLabel: 'policies saved',
    current: (s) => s.savedPolicies.count,
    target: 10,
  },
  {
    id: '5k-apv',
    name: '$5K APV',
    icon: 'diamond',
    color: '#7c3aed',
    check: (s) => s.totalApv >= 5000,
    description: 'Reach $5,000 in total annual premium value',
    progressLabel: 'APV',
    current: (s) => s.totalApv,
    target: 5000,
  },
  {
    id: 'rewrite-master',
    name: 'Rewrite Master',
    icon: 'target',
    color: '#ea580c',
    check: (s) => s.successfulRewrites.count >= 5,
    description: 'Complete 5 successful policy rewrites',
    progressLabel: 'rewrites',
    current: (s) => s.successfulRewrites.count,
    target: 5,
  },
  {
    id: 'team-builder',
    name: 'Team Builder',
    icon: 'recruit',
    color: '#4f46e5',
    check: (s) => (s.agentsReferred ?? 0) >= 3,
    description: 'Recruit 3 fellow agents',
    progressLabel: 'agents recruited',
    current: (s) => s.agentsReferred ?? 0,
    target: 3,
  },
  {
    id: 'elite-agent',
    name: 'Elite Agent',
    icon: 'diamond',
    color: '#005851',
    check: (s) => s.totalApv >= 10000,
    description: 'Reach $10,000 in total annual premium value',
    progressLabel: 'APV',
    current: (s) => s.totalApv,
    target: 10000,
  },
  {
    id: 'agency-leader',
    name: 'Agency Leader',
    icon: 'recruit',
    color: '#b45309',
    check: (s) => (s.agentsReferred ?? 0) >= 5,
    description: 'Recruit 5 fellow agents',
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
