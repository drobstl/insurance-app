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
