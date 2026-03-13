import type { AgentAggregates } from './stats-aggregation';

/**
 * Computes a 0-100 "Book Health" score from agent aggregates.
 *
 * Weights:
 *   Retention  35% — save rate, penalized by urgent alerts
 *   Referrals  30% — appointment rate + client conversions
 *   Engagement 20% — touchpoint volume
 *   Rewrites   15% — successful rewrite count
 */
export function computeBookHealth(
  stats: AgentAggregates,
  urgentAlertCount: number,
): number {
  const retention = Math.max(
    0,
    stats.rates.conservationSaveRate * 100 - urgentAlertCount * 5,
  );

  const referralBase = stats.rates.referralAppointmentRate * 100;
  const referralBonus = Math.min(stats.clientsFromReferrals * 5, 20);
  const referrals = Math.min(referralBase + referralBonus, 100);

  const engagement = Math.min((stats.touchpoints.total / 50) * 100, 100);

  const rewrites = Math.min((stats.successfulRewrites.count / 5) * 100, 100);

  const raw =
    retention * 0.35 +
    referrals * 0.3 +
    engagement * 0.2 +
    rewrites * 0.15;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

export interface BookHealthBreakdown {
  overall: number;
  retention: { score: number; weight: 0.35; label: 'Retention' };
  referrals: { score: number; weight: 0.30; label: 'Referrals' };
  engagement: { score: number; weight: 0.20; label: 'Engagement' };
  rewrites: { score: number; weight: 0.15; label: 'Rewrites' };
}

export function computeBookHealthBreakdown(
  stats: AgentAggregates,
  urgentAlertCount: number,
): BookHealthBreakdown {
  const retentionScore = Math.round(Math.max(
    0,
    stats.rates.conservationSaveRate * 100 - urgentAlertCount * 5,
  ));

  const referralBase = stats.rates.referralAppointmentRate * 100;
  const referralBonus = Math.min(stats.clientsFromReferrals * 5, 20);
  const referralsScore = Math.round(Math.min(referralBase + referralBonus, 100));

  const engagementScore = Math.round(Math.min((stats.touchpoints.total / 50) * 100, 100));

  const rewritesScore = Math.round(Math.min((stats.successfulRewrites.count / 5) * 100, 100));

  const raw =
    retentionScore * 0.35 +
    referralsScore * 0.3 +
    engagementScore * 0.2 +
    rewritesScore * 0.15;

  return {
    overall: Math.round(Math.max(0, Math.min(100, raw))),
    retention: { score: retentionScore, weight: 0.35, label: 'Retention' },
    referrals: { score: referralsScore, weight: 0.30, label: 'Referrals' },
    engagement: { score: engagementScore, weight: 0.20, label: 'Engagement' },
    rewrites: { score: rewritesScore, weight: 0.15, label: 'Rewrites' },
  };
}
