import Link from 'next/link';
import {
  AGENCY_SALES_EMAIL,
  PRICING_TIERS,
  type PricingTier,
} from '../../lib/pricing';

/**
 * /pricing — public pricing surface.
 *
 * SOURCE OF TRUTH: `web/lib/pricing.ts`.
 *
 * Model (Entry-mechanism cutover, June 2026):
 *   - ONE front door: the no-card 14-day trial (`/signup`, bare — no
 *     `?tier=`). Every primary CTA on this page points there. There is
 *     no "card required at signup" path on the public page anymore;
 *     paid conversion happens in-app (the day-12 PlanPickerGate +
 *     dashboard settings → /api/stripe/create-checkout-session).
 *   - Growth ($49) is the hero plan — the post-sale engine, "keep the
 *     book you have." Free ($0) is the floor you land on if you don't
 *     pick a paid plan (book preserved, engine paused).
 *   - Pro ($99, comingSoon) and Agency (from $349, comingSoon) are the
 *     "grow the book / run the team" expansion — surfaced via a
 *     talk-to-us mailto and deliberately kept secondary so the Growth
 *     story stays crisp.
 *
 * Lead with the business outcome (keep + grow the book), not the
 * conversation-budget mechanic — that lives lower, in the FAQ. Starter
 * is grandfathered + closed to new signups (May 26 lock), so it never
 * appears here.
 */

export const metadata = {
  title: 'Pricing — AgentForLife',
  description:
    'Keep the book you built and grow the one you want. Start with full access free for 14 days — no credit card.',
};

function formatPrice(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

function Bullets({ tier }: { tier: PricingTier }) {
  return (
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
  );
}

/** Growth — the hero plan. The everyday post-sale engine and the only
 *  paid plan bookable today. Its CTA is the shared no-card front door. */
function GrowthCard({ signupHref }: { signupHref: string }) {
  const tier = PRICING_TIERS.growth;
  return (
    <article className="relative flex flex-col rounded-2xl border-2 border-[#3DD6C3] bg-white p-7 shadow-[0_4px_24px_rgba(61,214,195,0.18)]">
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#3DD6C3] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0D4D4D]">
        Most agents start here
      </span>
      <header className="mb-4">
        <h3 className="text-xl font-bold text-[#0D4D4D]">{tier.name}</h3>
        <p className="mt-1 text-sm font-medium text-[#6B7280]">{tier.tagline}</p>
      </header>
      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-extrabold text-[#0D4D4D]">{formatPrice(tier.priceMonthly)}</span>
          <span className="text-sm font-medium text-[#6B7280]">/mo</span>
        </div>
        <p className="mt-2 text-xs text-[#6B7280]">after your 14-day free trial</p>
      </div>
      <Bullets tier={tier} />
      <div className="mt-auto">
        <Link
          href={signupHref}
          className="block w-full rounded-xl bg-[#3DD6C3] px-4 py-3 text-center text-sm font-bold text-[#0D4D4D] transition-colors hover:bg-[#32c4b2]"
        >
          Start 14-day free trial
        </Link>
        <p className="mt-2 text-center text-[11px] text-[#6B7280]">
          Full access · No credit card · Cancel anytime
        </p>
      </div>
    </article>
  );
}

/** Free — the floor. Not a thing you buy; it's where you land if you
 *  don't pick a paid plan. Shown so the trial never feels like a trap. */
function FreeCard() {
  const tier = PRICING_TIERS.free;
  return (
    <article className="relative flex flex-col rounded-2xl border-2 border-[#E5E7EB] bg-white p-7 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      <header className="mb-4">
        <h3 className="text-xl font-bold text-[#0D4D4D]">{tier.name}</h3>
        <p className="mt-1 text-sm font-medium text-[#6B7280]">{tier.tagline}</p>
      </header>
      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-extrabold text-[#0D4D4D]">{formatPrice(tier.priceMonthly)}</span>
          <span className="text-sm font-medium text-[#6B7280]">/mo</span>
        </div>
        <p className="mt-2 text-xs text-[#6B7280]">no card, ever</p>
      </div>
      <Bullets tier={tier} />
      <div className="mt-auto rounded-xl bg-[#F3F4F6] px-4 py-3 text-center text-[12px] leading-relaxed text-[#6B7280]">
        Where you land if your trial ends and you haven&apos;t picked a paid plan. Your whole
        book stays put — upgrade anytime to switch the engine back on.
      </div>
    </article>
  );
}

/** Pro + Agency — the "grow / run the team" expansion. Not bookable
 *  yet; the CTA opens a talk-to-us email so it's sold by hand and the
 *  Growth story stays the headline. */
function SoonCard({ tier }: { tier: PricingTier }) {
  const mailto = `mailto:${AGENCY_SALES_EMAIL}?subject=${encodeURIComponent(`${tier.name} — tell me more`)}`;
  const isAgency = tier.id === 'agency';
  return (
    <article className="relative flex flex-col rounded-2xl border-2 border-[#E5E7EB] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0D4D4D] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
        Coming Soon
      </span>
      <header className="mb-4">
        <h3 className="text-xl font-bold text-[#0D4D4D]">{tier.name}</h3>
        <p className="mt-1 text-sm font-medium text-[#6B7280]">{tier.tagline}</p>
      </header>
      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          {isAgency && <span className="mr-1 text-sm font-medium text-[#6B7280]">from</span>}
          <span className="text-4xl font-extrabold text-[#0D4D4D]">{formatPrice(tier.priceMonthly)}</span>
          <span className="text-sm font-medium text-[#6B7280]">/mo</span>
        </div>
        <p className="mt-2 text-xs text-[#6B7280]">
          {isAgency ? 'team pool · band pricing' : 'adds the pre-sale system'}
        </p>
      </div>
      <Bullets tier={tier} />
      <div className="mt-auto">
        <a
          href={mailto}
          className="block w-full rounded-xl border-2 border-[#0D4D4D] bg-white px-4 py-3 text-center text-sm font-bold text-[#0D4D4D] transition-colors hover:bg-gray-50"
        >
          Talk to us
        </a>
        <p className="mt-2 text-center text-[11px] text-[#6B7280]">
          {isAgency
            ? "Built for downlines — let's talk about your team."
            : 'Rolling out to agents one at a time. Tell us about your pipeline.'}
        </p>
      </div>
    </article>
  );
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawRef = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const refCode =
    typeof rawRef === 'string' && rawRef.trim().length > 0
      ? rawRef.trim().toUpperCase()
      : null;
  // ONE front door: the bare no-card trial. refCode rides along as the
  // first query param (the signup page reads ?ref=) so referral
  // attribution survives the click.
  const signupHref = refCode ? `/signup?ref=${encodeURIComponent(refCode)}` : '/signup';

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
        <section className="mb-12 text-center">
          <h1 className="text-3xl font-extrabold text-[#0D4D4D] sm:text-4xl">
            Keep the book you built.{' '}
            <span className="text-[#3DD6C3]">Grow the one you want.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#4B5563]">
            AgentForLife runs your post-sale book on autopilot — retention check-ins,
            anniversary rewrite alerts, and referral asks that turn the clients you already
            have into new business. Start with full access free for 14 days.
          </p>
          <div className="mt-7 flex flex-col items-center gap-2">
            <Link
              href={signupHref}
              className="inline-block rounded-xl bg-[#3DD6C3] px-8 py-4 text-base font-bold text-[#0D4D4D] shadow-lg shadow-[#3DD6C3]/20 transition-colors hover:bg-[#32c4b2]"
            >
              Start your 14-day free trial
            </Link>
            <p className="text-xs text-[#6B7280]">Full access · No credit card · No commitment</p>
          </div>
        </section>

        {/* Available today: Growth (hero) + Free (the floor you land on). */}
        <section className="mx-auto grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          <GrowthCard signupHref={signupHref} />
          <FreeCard />
        </section>

        {/* The expansion — deliberately secondary so Growth stays the headline. */}
        <section className="mt-16">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-[#0D4D4D]">When you&apos;re ready to grow</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[#6B7280]">
              Growth keeps the book you have. These add the engine for winning new business —
              rolling out now, one agent at a time.
            </p>
          </div>
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
            <SoonCard tier={PRICING_TIERS.pro} />
            <SoonCard tier={PRICING_TIERS.agency} />
          </div>
        </section>

        <section className="mt-16 mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-xl font-bold text-[#0D4D4D]">
            Common questions
          </h2>
          <div className="space-y-4">
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                How does the free trial work?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Sign up in about two minutes — just your name, email, and phone number, no
                credit card. You get full access for 14 days. Near the end of the trial you
                choose how to keep going: stay on Growth at $49/mo, or move to Free. Either
                way your whole book stays put, and nothing is ever charged unless you pick a
                paid plan.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                What&apos;s the difference between Free, Growth, and Pro?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Free keeps your book safe with the automated engine paused — a place to land,
                not a place to work from. Growth is the everyday plan: it runs your post-sale
                book for you — retention, anniversaries, referrals, and rewrite alerts on the
                clients you already have. Pro adds the full pre-sale system on top — a lead
                pipeline, AI call coaching, and the close-the-sale flow — and is rolling out
                to agents one at a time. If that&apos;s you, talk to us.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                Can I switch plans later?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Anytime. Upgrades take effect immediately and are prorated; downgrades take
                effect at the end of your current billing period. You can also drop to Free
                and keep your whole book.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                Do I need to set up any phone numbers or messaging accounts?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                No. AgentForLife handles all of the messaging for you, including the line your
                automated retention and referral texts go out on. Nothing to configure.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <h3 className="text-sm font-bold text-[#0D4D4D]">
                What&apos;s this about &ldquo;conversations&rdquo;?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Your automated text outreach runs on a shared messaging line, and each plan
                includes a monthly budget for it — 75 a month on Growth, 200 on Pro. Push
                notifications, one-tap texts from your own phone, and email are unlimited and
                never count. Most agents stay well under their budget.
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
