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
  shareText: string;
  progressLabel: string;
  current: (s: AgentAggregates) => number;
  target: number;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ── Founding Member (special) ────────────────────────────────
  {
    id: 'founding-member',
    name: 'Founding Member',
    icon: 'diamond',
    color: '#a158ff',
    tier: 'legendary',
    check: (s) => s.isFoundingMember === true,
    description: 'One of the original 50 — free for life',
    shareText: 'I\'m one of the original 50 founding members of AgentForLife — locked in free for life. This AI-first platform is changing the game for insurance agents, and I got in on the ground floor.',
    progressLabel: 'founding member',
    current: (s) => s.isFoundingMember ? 1 : 0,
    target: 1,
  },
  // ── Starter tier (circle) ──────────────────────────────────
  {
    id: 'first-save',
    name: 'Guardian',
    icon: 'shield',
    color: '#16a34a',
    tier: 'starter',
    check: (s) => s.savedPolicies.count >= 1,
    description: 'Saved your first at-risk policy',
    shareText: 'This incredible AI-first system automatically saved an at-risk policy for me, securing this annual premium while I focused on new business. True automatic income that works in the background while I sleep!',
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
    shareText: 'My first referral just came in — completely on autopilot. This AI system is surfacing growth opportunities I never would have caught on my own.',
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
    shareText: 'Ten personalized touchpoints sent to my clients automatically. They feel taken care of and stay loyal — all without me spending hours on outreach.',
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
    shareText: 'Five referrals generated on autopilot. My network is growing without cold calls or awkward asks — just smart AI outreach running in the background.',
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
    shareText: 'Five policies saved on autopilot — five clients who would have lapsed without me lifting a finger. This AI system protects my book while I focus on growth.',
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
    shareText: 'Just crossed $1,000 in annual premium value — generated entirely on autopilot. This AI system is building real, recurring revenue while I sleep.',
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
    shareText: 'Just brought my first fellow agent onto the platform. When you find something this powerful, you can\'t help but share it with your network.',
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
    shareText: 'Ten policies saved automatically. My book of business is locked down tight — AI watches every at-risk policy around the clock so nothing slips through.',
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
    shareText: 'Over $5,000 in annual premium secured on autopilot. This isn\'t a side tool — it\'s a serious revenue engine running 24/7 in the background.',
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
    shareText: 'Five successful policy rewrites — done automatically. My AI doesn\'t just save policies, it finds better coverage that keeps clients happy and premiums strong.',
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
    shareText: 'Three agents recruited and growing. I\'m building a team of forward-thinking agents who all benefit from AI-powered retention and growth.',
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
    shareText: '$10,000+ in annual premium generated automatically. This AI-first system has fundamentally changed what\'s possible for a single insurance agent.',
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
    shareText: 'Five agents recruited — the highest honor on the platform. This system doesn\'t just protect my book; it\'s helping me build a movement.',
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
