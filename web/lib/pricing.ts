/**
 * Pricing source of truth — last relock May 26, 2026.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > Business Model + Tier Gating
 * (sections last updated May 26, 2026). Conversation-based pricing,
 * not message-based or seat-based. The conversation budget is for
 * AFL pooled-line SMS only — push, agent-personal-phone one-tap,
 * and email are unlimited across all tiers.
 *
 * May 26, 2026 relock (supersedes the May 9-10 v3 numbers):
 * - Starter $29 → grandfathered for the May 26 11-agent pitch cohort
 *   + future case-by-case. **Killed for general new signups** — the
 *   pricing page filters it out below. Existing $29 customers stay
 *   forever.
 * - Growth $59 → **$49**. Repositioned as the post-sale-only anchor.
 *   No pre-sale tools (Leads / Activity / Close-the-sale) at this
 *   tier — those move up to Pro.
 * - Pro $119 → **$99**. Now carries the pre-sale unlock (Leads,
 *   Activity, Close-the-sale conveyor, SME/FIF) + UNLIMITED individual
 *   Performance / Coaching (metered on Growth at 4/mo per the May 30
 *   Growth Lock §4 — coaching is a metered feature, not a pre-sale
 *   tool). Tangible feature unlock, not just "more conversations."
 * - Agency $199 + $39/seat → **$349+ band pricing**. Per-seat is OUT.
 *   Band specifics deferred to the "Pricing band parking lot" in
 *   CONTEXT. Still sales-led via the mailto CTA.
 * - Founding 34 → free Growth-equivalent post-sale forever. To unlock
 *   pre-sale they upgrade to Pro: $99 Pro SKU with a permanent $50
 *   founding Stripe Coupon = $49 effective. See CONTEXT > Founding 34.
 *
 * Earlier locked decisions still in force:
 * - The legacy `charter` ($25) and `inner_circle` ($35) tiers are
 *   removed. No grandfather, no migration — they had no active
 *   subscribers.
 * - Founding 34 stay on the `isFoundingMember=true` flag.
 * - 14-day free trial on Growth (and on Starter for the legacy
 *   grandfathered cohort, mechanically still set here but
 *   functionally moot for new signups). CC required at signup
 *   (standard pattern, Stripe-native via `trial_period_days`).
 *   Pro and Agency have no trial.
 * - Monthly billing only. Annual prepay deferred to Phase 4+ pending
 *   demand signal.
 *
 * Stripe Price IDs were edited in-place in the Stripe Dashboard
 * on May 26, 2026 (Stripe permits `unit_amount` edits on Prices with
 * no active subscribers — verified empirically). The
 * `STRIPE_PRICE_ID_GROWTH_MONTHLY` and `STRIPE_PRICE_ID_PRO_MONTHLY`
 * env vars in Vercel point to the same Price IDs as before; only
 * the amounts they bill changed.
 */

export type PricingTierId = 'free' | 'starter' | 'growth' | 'pro' | 'agency';

// Free is not Stripe-billable (no card, $0), same as Agency (sales-led).
export type StripeBillableTierId = Exclude<PricingTierId, 'agency' | 'free'>;

export interface PricingTier {
  id: PricingTierId;
  name: string;
  /** Monthly price in USD (whole dollars). Agency price is the
   *  band-1 floor ($349/mo), rendered as "from $349" on the pricing
   *  page; specific band thresholds are sales-led. */
  priceMonthly: number;
  /** One-line positioning under the tier name. */
  tagline: string;
  /** Conversation budget per month (Linq pooled-line SMS only).
   *  null for Agency since pooled capacity is sales-discussed. */
  conversationsPerMonth: number | null;
  /** Daily new-conversation cap. null for Agency. */
  dailyConversationCap: number | null;
  /** Trial period in days. 0 = no trial. */
  trialDays: number;
  /** Bullets shown on the pricing card (kept short — full feature
   *  list lives in marketing copy). */
  bullets: readonly string[];
  /** Best-fit description for the audience selector / FAQ. */
  bestFor: string;
  /** Whether this tier checks out via Stripe (vs. contact sales). */
  isStripeBillable: boolean;
  /** Stripe price ID env var name. Empty for Agency. */
  stripePriceIdEnvVar: string;
  /** UI emphasis. `'popular'` shows a "Most Popular" badge. */
  emphasis?: 'popular';
  /** When true, the tier card renders a "Coming soon" badge, swaps the
   *  buy CTA for a `mailto:` notify-me link, and the signup chain
   *  (`/signup?tier=X` + `/api/signup/start-checkout`) rejects the tier
   *  with `tier_not_yet_available`. Bullets render as-is — the
   *  card describes the eventual product; the badge + disabled
   *  button communicate that it's not bookable yet. */
  comingSoon?: boolean;
}

export const PRICING_TIERS: Readonly<Record<PricingTierId, PricingTier>> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    // Entry-mechanism cutover, Phase 2: the day-14 default landing spot.
    // NOT a functional tier — it's data-preserved + engine-paused. The
    // agent keeps their WHOLE book and can log in to view / export it, but
    // the active engine (automated outreach + new application parsing)
    // pauses until they pick a paid plan. No quantitative caps: hiding a
    // Free agent's own clients would contradict "your data is preserved."
    // The pause itself is enforced separately (outbound crons skip Free;
    // new uploads gated at the UI) — not modeled on this record.
    tagline: 'Your book stays — the engine pauses',
    conversationsPerMonth: 0,
    dailyConversationCap: 0,
    trialDays: 0,
    bullets: [
      'Your whole book stays — clients, policies, history, notes',
      'Log in anytime to view or export everything',
      'Automatic texts, retention nudges & new app parsing pause',
      'Upgrade anytime to switch the engine back on',
    ],
    bestFor: 'Agents between active stretches who want their book kept safe without paying — and the engine back on the moment they upgrade',
    isStripeBillable: false,
    stripePriceIdEnvVar: '',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 29,
    tagline: 'Grandfathered — closed to new signups',
    conversationsPerMonth: 30,
    dailyConversationCap: 3,
    trialDays: 14,
    bullets: [
      'Light book — sized for a small post-sale book',
      'Branded client mobile app',
      'Retention + anniversary + referral AI',
      'Unlimited push, one-tap, email',
    ],
    bestFor: 'Legacy cohort only (pitched at $29 before May 26 lock)',
    isStripeBillable: true,
    stripePriceIdEnvVar: 'STRIPE_PRICE_ID_STARTER_MONTHLY',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceMonthly: 49,
    tagline: 'Keep the book you have',
    conversationsPerMonth: 75,
    dailyConversationCap: 8,
    trialDays: 14,
    bullets: [
      'Active book — full post-sale engine for a steady book',
      'Branded client mobile app',
      'Retention + anniversary + referral AI',
      'Bulk import onboarding ceremony',
      'Anniversary rewrite alerts',
      'AI call coaching — 4 scored calls a month (R.E.A.L. framework)',
    ],
    bestFor: 'Established producer focused on retaining + monetizing the book they already have',
    isStripeBillable: true,
    stripePriceIdEnvVar: 'STRIPE_PRICE_ID_GROWTH_MONTHLY',
    emphasis: 'popular',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 99,
    tagline: 'Grow the book',
    conversationsPerMonth: 200,
    dailyConversationCap: 20,
    trialDays: 0,
    bullets: [
      'Full book — adds pre-sale tools to the post-sale engine',
      'Everything in Growth',
      'Lead management, Calendar + Activity dashboard',
      'Close-the-sale ritual: lead → client → policy → activation',
      'AI call coaching — unlimited (Growth includes 4 scored calls a month)',
      'SME / FIF tracking for advanced-market referrals',
    ],
    bestFor: 'Producer running a lead pipeline who wants unlimited AI coaching on their calls',
    isStripeBillable: true,
    stripePriceIdEnvVar: 'STRIPE_PRICE_ID_PRO_MONTHLY',
    comingSoon: true,
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    /** Displayed as "from $349" on the pricing page. Band specifics
     *  are sales-led — see CONTEXT.md > Pricing band parking lot. */
    priceMonthly: 349,
    tagline: 'Run the team',
    conversationsPerMonth: null,
    dailyConversationCap: null,
    trialDays: 0,
    bullets: [
      'Team pool — pooled AI conversation budget across all seats',
      'Everything in Pro for every agent',
      'Team Performance dashboard (leaderboards + coaching priorities)',
      'Team admin tools + per-agent dashboards',
      'Mentor calendar + chargeback comparison vs Symmetry',
    ],
    bestFor: 'Agency owner running a downline who wants team-level visibility + coaching',
    comingSoon: true,
    isStripeBillable: false,
    stripePriceIdEnvVar: '',
  },
};

export const PRICING_TIER_ORDER: readonly PricingTierId[] = [
  'starter',
  'growth',
  'pro',
  'agency',
];

/** Overage rate. $0.50 per conversation across all tiers. Not yet
 *  enforced — overage billing is a Phase 3 follow-up after the
 *  conversation counter ships. */
export const OVERAGE_USD_PER_CONVERSATION = 0.5;

/** Sales contact for Agency tier inquiries. Used as the `mailto:`
 *  target on the Agency tier card's CTA. */
export const AGENCY_SALES_EMAIL = 'support@agentforlife.app';

/** Type guard: is this tier id one we bill via Stripe Checkout? */
export function isStripeBillableTier(id: string): id is StripeBillableTierId {
  return id === 'starter' || id === 'growth' || id === 'pro';
}

/** Type guard: is this string a known pricing tier id? */
export function isPricingTierId(id: string): id is PricingTierId {
  return (
    id === 'free' ||
    id === 'starter' ||
    id === 'growth' ||
    id === 'pro' ||
    id === 'agency'
  );
}

/** Resolve the Stripe price ID for a billable tier from the
 *  configured env var, or `null` if unset. The route handlers
 *  treat `null` as a 500 since pricing should never be deployed
 *  without Stripe configured. */
export function resolveStripePriceId(tierId: StripeBillableTierId): string | null {
  const envVar = PRICING_TIERS[tierId].stripePriceIdEnvVar;
  const value = process.env[envVar];
  return value && value.trim().length > 0 ? value.trim() : null;
}

/** Map a Stripe price ID back to a tier id. Used by the webhook to
 *  determine which tier a subscription belongs to. Returns null for
 *  unknown price ids (which the webhook logs as an alarm). */
export function tierIdFromStripePriceId(priceId: string | null | undefined): StripeBillableTierId | null {
  if (!priceId) return null;
  for (const tierId of ['starter', 'growth', 'pro'] as const) {
    if (resolveStripePriceId(tierId) === priceId) return tierId;
  }
  return null;
}
