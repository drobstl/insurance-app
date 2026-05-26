import { isAdminEmail } from './admin';
import { LEAD_MODE_ENABLED, ACTIVITY_ENABLED, isLeadModeVisibleForEmail } from './feature-flags';

/**
 * Tier-based feature gating (locked May 26, 2026).
 *
 * Single source of truth for "can this agent see X?" decisions.
 * Per CONTEXT.md §"Tier gating (locked May 26, 2026)":
 *
 *   Starter (legacy / grandfathered)  → post-sale features only
 *   Growth ($49)                       → post-sale features only
 *   Pro ($99)                          → + pre-sale: Leads, Activity,
 *                                          Close-the-sale, SME/FIF,
 *                                          Performance page (individual)
 *   Agency ($349+ band)                → + team-aggregation Performance,
 *                                          Team tab, mentor calendar,
 *                                          chargeback comparison, pooled
 *                                          conversation budget
 *   Founding 34                        → post-sale features (same as
 *                                          Growth). To unlock pre-sale,
 *                                          upgrades to Pro at $49/mo
 *                                          effective ($99 Pro SKU with
 *                                          a permanent $50 founding
 *                                          Stripe Coupon).
 *
 * Admin emails (per NEXT_PUBLIC_ADMIN_EMAILS) override every tier check
 * so Daniel can dogfood without juggling subscriptions.
 *
 * Env-var gates (LEAD_MODE_ENABLED, ACTIVITY_ENABLED) still apply on top
 * of the tier check — if the surface is globally disabled, nobody sees
 * it regardless of tier. The `LEAD_MODE_ADMIN_ONLY` second-axis flag
 * from `feature-flags.ts` is also still respected: when on, only admins
 * see Leads even if their tier would otherwise qualify.
 */

export type MembershipTier =
  | 'starter'
  | 'growth'
  | 'pro'
  | 'agency'
  | 'founding'
  | 'unknown'
  // Permit string here so callers can pass `agentProfile.membershipTier`
  // (typed string | undefined) without casting; the helpers below narrow
  // unknown / unexpected values to the most restrictive treatment.
  | string;

export type MaybeTier = MembershipTier | null | undefined;

/**
 * True when the tier unlocks Pro-level features (pre-sale tools,
 * individual Performance page, SME/FIF). Agency is a superset of Pro,
 * so it returns true as well.
 *
 * Unknown / missing tiers default to false (most-restrictive).
 */
export function isProOrAbove(tier: MaybeTier): boolean {
  return tier === 'pro' || tier === 'agency';
}

/**
 * True when the tier is Agency. Used for team-only features
 * (team Performance aggregation, Team tab, mentor calendar, chargeback
 * comparison, pooled conversation budget).
 */
export function isAgency(tier: MaybeTier): boolean {
  return tier === 'agency';
}

/**
 * Resolves whether an agent can access the Leads surface.
 *
 * Three gates stacked:
 *   1. `LEAD_MODE_ENABLED` env var (build-time) — global kill-switch.
 *   2. `LEAD_MODE_ADMIN_ONLY` env var (build-time) — dogfood gate.
 *   3. Tier — Pro or Agency. Admin override always wins.
 *
 * Returns:
 *   - `true`  → render the Leads UI / allow the route.
 *   - `false` → either env-disabled OR tier-locked. Use
 *               `leadsAccessReason(...)` to distinguish for UX.
 */
export function canAccessLeads(
  tier: MaybeTier,
  email: string | null | undefined,
): boolean {
  if (!isLeadModeVisibleForEmail(email)) return false;
  if (isAdminEmail(email)) return true;
  return isProOrAbove(tier);
}

/**
 * Same shape as `canAccessLeads` but for the Activity surface.
 *
 * Activity has no admin-only second axis — when `ACTIVITY_ENABLED` is
 * on, the only gate is tier (or admin).
 */
export function canAccessActivity(
  tier: MaybeTier,
  email: string | null | undefined,
): boolean {
  if (!ACTIVITY_ENABLED) return false;
  if (isAdminEmail(email)) return true;
  return isProOrAbove(tier);
}

/**
 * Performance page — individual scoring. Pro+ surface (same gating
 * shape as Leads/Activity minus the env flag — Performance page itself
 * doesn't have an env kill-switch today).
 *
 * Not yet wired into a route — included here so the Performance page
 * implementation PR can use it from day one.
 */
export function canAccessIndividualPerformance(
  tier: MaybeTier,
  email: string | null | undefined,
): boolean {
  if (isAdminEmail(email)) return true;
  return isProOrAbove(tier);
}

/**
 * Performance page — team aggregation (leaderboards, coaching
 * priorities, agency-wide trends). Agency-only.
 */
export function canAccessTeamPerformance(
  tier: MaybeTier,
  email: string | null | undefined,
): boolean {
  if (isAdminEmail(email)) return true;
  return isAgency(tier);
}

/**
 * Reason why the Leads surface is gated off for this agent. Lets the
 * UI render different copy:
 *   - `'env_off'`     → "Coming soon" (matches existing pre-tier-gating UX)
 *   - `'tier_locked'` → "Upgrade to Pro" prompt + CTA to /pricing
 *   - `'accessible'`  → no gate; the agent can use it
 *
 * The route guards in /dashboard/leads + /leads/[leadId] read this to
 * pick between redirecting to /dashboard (env off) and rendering the
 * UpgradeToProCard (tier locked).
 */
export type AccessGateReason = 'accessible' | 'env_off' | 'tier_locked';

export function leadsAccessReason(
  tier: MaybeTier,
  email: string | null | undefined,
): AccessGateReason {
  if (!LEAD_MODE_ENABLED) return 'env_off';
  if (!isLeadModeVisibleForEmail(email)) return 'env_off';
  if (isAdminEmail(email)) return 'accessible';
  return isProOrAbove(tier) ? 'accessible' : 'tier_locked';
}

export function activityAccessReason(
  tier: MaybeTier,
  email: string | null | undefined,
): AccessGateReason {
  if (!ACTIVITY_ENABLED) return 'env_off';
  if (isAdminEmail(email)) return 'accessible';
  return isProOrAbove(tier) ? 'accessible' : 'tier_locked';
}
