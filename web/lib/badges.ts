import type { AgentAggregates } from './stats-aggregation';

export type BadgeIcon =
  | 'shield'
  | 'chat'
  | 'star'
  | 'heart'
  | 'trophy'
  | 'diamond'
  | 'flame'
  | 'target';

export interface Badge {
  id: string;
  name: string;
  icon: BadgeIcon;
  color: string;
}

export interface EarnedBadge extends Badge {
  earnedIndex: number;
}

interface BadgeDefinition extends Badge {
  check: (stats: AgentAggregates) => boolean;
}

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first-save',
    name: 'First Save',
    icon: 'shield',
    color: '#16a34a',
    check: (s) => s.savedPolicies.count >= 1,
  },
  {
    id: 'first-referral',
    name: 'First Referral',
    icon: 'chat',
    color: '#2563eb',
    check: (s) => s.referrals.total >= 1,
  },
  {
    id: 'touchpoint-pro',
    name: 'Touchpoint Pro',
    icon: 'heart',
    color: '#ec4899',
    check: (s) => s.touchpoints.total >= 10,
  },
  {
    id: '5-referrals',
    name: '5 Referrals',
    icon: 'chat',
    color: '#2563eb',
    check: (s) => s.referrals.total >= 5,
  },
  {
    id: '5-saves',
    name: '5 Policies Saved',
    icon: 'shield',
    color: '#16a34a',
    check: (s) => s.savedPolicies.count >= 5,
  },
  {
    id: '1k-apv',
    name: '$1K APV',
    icon: 'star',
    color: '#005851',
    check: (s) => s.totalApv >= 1000,
  },
  {
    id: '10-saves',
    name: '10 Saves',
    icon: 'trophy',
    color: '#d97706',
    check: (s) => s.savedPolicies.count >= 10,
  },
  {
    id: '5k-apv',
    name: '$5K APV',
    icon: 'diamond',
    color: '#7c3aed',
    check: (s) => s.totalApv >= 5000,
  },
  {
    id: 'rewrite-master',
    name: 'Rewrite Master',
    icon: 'target',
    color: '#ea580c',
    check: (s) => s.successfulRewrites.count >= 5,
  },
  {
    id: 'elite-agent',
    name: 'Elite Agent',
    icon: 'diamond',
    color: '#005851',
    check: (s) => s.totalApv >= 10000,
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

export function getTotalBadgeCount(): number {
  return BADGE_DEFINITIONS.length;
}
