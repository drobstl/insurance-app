/**
 * Pricing v3 source of truth — May 10, 2026 (Track C, Phase 1).
 *
 * SOURCE OF TRUTH: `docs/AFL_Pricing_Packaging_Playbook_v3.md` +
 * `CONTEXT.md` > Business Model. Conversation-based pricing,
 * not message-based or seat-based. The conversation budget is for
 * Linq pooled-line SMS only — push, agent-personal-phone one-tap,
 * and email are unlimited across all tiers.
 *
 * Daniel's locked May 9-10 decisions:
 * - The legacy `charter` ($25) and `inner_circle` ($35) tiers are
 *   removed. No grandfather, no migration — they had no active
 *   subscribers.
 * - Three Stripe-billable tiers ship: Starter, Growth, Pro.
 * - Agency is presented on the pricing page as "Contact Sales"
 *   (mailto link) with no Stripe SKU yet — defers per-seat /
 *   pooled-capacity / team-admin engineering until a real customer
 *   asks.
 * - Founding 34 stay on the `isFoundingMember=true` flag, free for
 *   life, with no Stripe subscription. The 4 founding agents who
 *   signed up before the no-CC flow have inert Stripe customer
 *   records — left untouched.
 * - 14-day free trial on Starter and Growth; CC required at
 *   signup (standard pattern, Stripe-native via
 *   `trial_period_days`). Pro and Agency have no trial per
 *   `docs/AFL_Pricing_Packaging_Playbook_v3.md`.
 * - Monthly billing only at v3 launch. Annual prepay is deferred
 *   to Phase 4+ pending demand signal.
 */

export type PricingTierId = 'starter' | 'growth' | 'pro' | 'agency';

export type StripeBillableTierId = Exclude<PricingTierId, 'agency'>;

export interface PricingTier {
  id: PricingTierId;
  name: string;
  /** Monthly price in USD (whole dollars). Agency price is the
   *  base ($199/mo platform fee); seat pricing is sales-led. */
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
}

export const PRICING_TIERS: Readonly<Record<PricingTierId, PricingTier>> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 29,
    tagline: 'For agents getting started',
    conversationsPerMonth: 30,
    dailyConversationCap: 3,
    trialDays: 14,
    bullets: [
      'Light book — AI conversations sized for a small book',
      'Unlimited push, one-tap, email',
      'Branded client mobile app',
      'AFL referral assistant',
      'Retention + anniversary lanes',
    ],
    bestFor: 'Year-1 agent with a small book',
    isStripeBillable: true,
    stripePriceIdEnvVar: 'STRIPE_PRICE_ID_STARTER_MONTHLY',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceMonthly: 59,
    tagline: 'For established producers',
    conversationsPerMonth: 75,
    dailyConversationCap: 8,
    trialDays: 14,
    bullets: [
      'Active book — more AI conversations for a growing book',
      'Everything in Starter',
      'Bulk import onboarding ceremony',
      'Anniversary rewrite alerts',
      'Conservation + retention drip',
    ],
    bestFor: 'Established producer running a steady book',
    isStripeBillable: true,
    stripePriceIdEnvVar: 'STRIPE_PRICE_ID_GROWTH_MONTHLY',
    emphasis: 'popular',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 119,
    tagline: 'For top producers',
    conversationsPerMonth: 200,
    dailyConversationCap: 20,
    trialDays: 0,
    bullets: [
      'Full book — high-volume AI conversations',
      'Everything in Growth',
      'Advanced analytics',
      'Priority support',
      'Higher daily caps',
    ],
    bestFor: 'Top producer with a large active book',
    isStripeBillable: true,
    stripePriceIdEnvVar: 'STRIPE_PRICE_ID_PRO_MONTHLY',
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    priceMonthly: 199,
    tagline: 'For agency owners with a downline',
    conversationsPerMonth: null,
    dailyConversationCap: null,
    trialDays: 0,
    bullets: [
      'Team pool — pooled AI conversations across your team',
      'Team admin tools',
      'Per-agent dashboard',
      'Concierge onboarding',
      'Mentor + SME calendars (when available)',
    ],
    bestFor: 'Agency owner with a downline of agents',
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
  return id === 'starter' || id === 'growth' || id === 'pro' || id === 'agency';
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
