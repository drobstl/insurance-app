import Link from 'next/link';
import {
  AGENCY_SALES_EMAIL,
  PRICING_TIERS,
  PRICING_TIER_ORDER,
  type PricingTier,
} from '../../lib/pricing';

/**
 * /pricing — Track C public pricing surface (May 10, 2026).
 *
 * SOURCE OF TRUTH: `web/lib/pricing.ts`. Renders the v3 tier
 * cards (Starter / Growth / Pro / Agency) with Stripe-billable
 * tiers routing through `/signup?tier=X` and Agency routing to
 * a `mailto:` sales contact. Trial copy reflects the locked
 * "CC at signup, 14 days free" pattern (Stripe-native).
 *
 * The full marketing rebuild lives in a separate next-up project.
 * This page is intentionally minimal — clean tier cards, short
 * FAQ, link back to the existing landing pages. Conversion polish
 * (testimonials, comparison table, founding badge) is deferred.
 */

export const metadata = {
  title: 'Pricing — AgentForLife',
  description:
    'Simple, conversation-based pricing for life insurance agents. 14-day free trial on Growth.',
};

function formatPrice(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

function ctaForTier(
  tier: PricingTier,
  refCode: string | null,
): { href: string; label: string; isMailto: boolean } {
  if (!tier.isStripeBillable) {
    return {
      href: `mailto:${AGENCY_SALES_EMAIL}?subject=${encodeURIComponent('Agency tier inquiry')}`,
      label: 'Contact Sales',
      isMailto: true,
    };
  }
  const refSuffix = refCode ? `&ref=${encodeURIComponent(refCode)}` : '';
  if (tier.trialDays > 0) {
    return {
      href: `/signup?tier=${tier.id}${refSuffix}`,
      label: `Start ${tier.trialDays}-day free trial`,
      isMailto: false,
    };
  }
  return {
    href: `/signup?tier=${tier.id}${refSuffix}`,
    label: `Get ${tier.name}`,
    isMailto: false,
  };
}

function TierCard({ tier, refCode }: { tier: PricingTier; refCode: string | null }) {
  const cta = ctaForTier(tier, refCode);
  const isPopular = tier.emphasis === 'popular';

  return (
    <article
      className={`relative flex flex-col rounded-2xl border-2 bg-white p-6 transition-shadow ${
        isPopular
          ? 'border-[#3DD6C3] shadow-[0_4px_24px_rgba(61,214,195,0.18)]'
          : 'border-[#E5E7EB] shadow-[0_2px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.08)]'
      }`}
    >
      {isPopular ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#3DD6C3] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0D4D4D]">
          Most Popular
        </span>
      ) : null}

      <header className="mb-4">
        <h3 className="text-xl font-bold text-[#0D4D4D]">{tier.name}</h3>
        <p className="mt-1 text-xs font-medium text-[#6B7280]">{tier.tagline}</p>
      </header>

      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          {tier.id === 'agency' && (
            <span className="text-sm font-medium text-[#6B7280] mr-1">from</span>
          )}
          <span className="text-4xl font-extrabold text-[#0D4D4D]">
            {formatPrice(tier.priceMonthly)}
          </span>
          <span className="text-sm font-medium text-[#6B7280]">/mo</span>
        </div>
        {tier.id === 'starter' ? (
          <p className="mt-2 text-xs text-[#6B7280]">
            <span className="font-bold text-[#0D4D4D]">Light book</span>
          </p>
        ) : tier.id === 'growth' ? (
          <p className="mt-2 text-xs text-[#6B7280]">
            <span className="font-bold text-[#0D4D4D]">Active book</span>
          </p>
        ) : tier.id === 'pro' ? (
          <p className="mt-2 text-xs text-[#6B7280]">
            <span className="font-bold text-[#0D4D4D]">Full book</span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-[#6B7280]">
            <span className="font-bold text-[#0D4D4D]">Team pool · band pricing</span>
          </p>
        )}
      </div>

      <ul className="mb-6 space-y-2 text-sm text-[#2D3748]">
        {tier.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-[#3DD6C3]"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="leading-snug">{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        {cta.isMailto ? (
          <a
            href={cta.href}
            className={`block w-full rounded-xl px-4 py-3 text-center text-sm font-bold transition-colors ${
              isPopular
                ? 'bg-[#0D4D4D] text-white hover:bg-[#0B3E3E]'
                : 'border-2 border-[#0D4D4D] bg-white text-[#0D4D4D] hover:bg-gray-50'
            }`}
          >
            {cta.label}
          </a>
        ) : (
          <Link
            href={cta.href}
            className={`block w-full rounded-xl px-4 py-3 text-center text-sm font-bold transition-colors ${
              isPopular
                ? 'bg-[#3DD6C3] text-[#0D4D4D] hover:bg-[#32c4b2]'
                : 'border-2 border-[#0D4D4D] bg-white text-[#0D4D4D] hover:bg-gray-50'
            }`}
          >
            {cta.label}
          </Link>
        )}
        {tier.trialDays > 0 && tier.isStripeBillable ? (
          <p className="mt-2 text-center text-[11px] text-[#6B7280]">
            Card required at signup · Not charged for {tier.trialDays} days
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  // Starter is grandfathered for legacy customers only — killed for
  // general new signups per the May 26 pricing lock. Hide it from the
  // public pricing page; the 11 legacy Starter agents already have
  // their subscription, they don't need a card here. The Starter tier
  // metadata stays in PRICING_TIERS so existing customers' membership
  // tier still resolves and the Stripe webhook + tier-gating still
  // know what 'starter' means.
  const tiers = PRICING_TIER_ORDER
    .filter((id) => id !== 'starter')
    .map((id) => PRICING_TIERS[id]);
  const params = await searchParams;
  const rawRef = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const refCode = typeof rawRef === 'string' && rawRef.trim().length > 0
    ? rawRef.trim().toUpperCase()
    : null;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="bg-[#0D4D4D] py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 text-white">
            <img src="/logo.png" alt="AgentForLife" className="w-[44px] h-[25px] object-contain" />
            <span className="text-base font-bold brand-title">AgentForLife™</span>
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-white/80 hover:text-white"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12">
        <section className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold text-[#0D4D4D] sm:text-4xl">
            Pricing built around conversations
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-[#4B5563]">
            One simple monthly fee. Unlimited push notifications, agent-phone one-tap, and
            email — across every tier. AI conversations are budgeted per tier and sized to
            match the book you're running.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => (
            <TierCard key={tier.id} tier={tier} refCode={refCode} />
          ))}
        </section>

        <section className="mt-16 mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-xl font-bold text-[#0D4D4D]">
            Common questions
          </h2>
          <div className="space-y-4">
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                What counts as a “conversation”?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                A conversation is a unique outbound text thread on the AFL pooled SMS
                line — typically a referral, a retention check-in, or a beneficiary
                message. Push notifications, agent-phone one-tap texts, and email are
                unlimited on every tier and don&apos;t count.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                How many conversations does each tier include?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Active book (Growth): 75 / month · Full book (Pro): 200 / month · Team
                pool (Agency): pooled across your team, sized to your agency. Daily caps
                apply on every tier to keep your line health clean.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                What&apos;s the difference between Growth and Pro?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Growth runs your post-sale book — retention, anniversaries, referrals,
                bulk import. Pro adds the pre-sale tools on top: Leads management, the
                Activity dashboard, the close-the-sale conveyor (lead → client → policy →
                activation in one flow), plus the Performance page where you paste call
                transcripts and get AI coaching scores. If you&apos;re actively running a
                lead pipeline, Pro pays for itself.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                What happens if I run out of conversations mid-month?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Overage is $0.50 per additional conversation, or you can upgrade to the
                next tier. Push, agent-phone, and email keep working. Most agents stay
                well under their monthly budget.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                How does the free trial work?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Growth comes with a 14-day free trial. You add a card at signup so we
                can keep your account active without interruption when the trial ends,
                but you&apos;re not charged for the first 14 days. Cancel anytime during
                the trial and you owe nothing.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                Can I switch tiers later?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Yes. Upgrades take effect immediately and are prorated. Downgrades take
                effect at the end of your current billing period.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                Do I need to set up any phone numbers or messaging accounts?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                No. AFL handles all the messaging infrastructure for you — including the
                pooled SMS line used for AI-driven referral and retention conversations.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 text-center text-xs text-[#6B7280]">
          Questions? Email{' '}
          <a
            className="font-semibold text-[#0D4D4D] hover:underline"
            href={`mailto:${AGENCY_SALES_EMAIL}`}
          >
            {AGENCY_SALES_EMAIL}
          </a>
          .
        </section>
      </main>
    </div>
  );
}
