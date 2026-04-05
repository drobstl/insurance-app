'use client';

import Link from 'next/link';
import { useTierCTA } from '@/hooks/useTierCTA';

const serif =
  "var(--font-serif), 'EB Garamond', Georgia, 'Times New Roman', serif";
const sans =
  "var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function StampButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full border-2 border-[#1A1A1A] bg-[#F0D7FF] px-6 py-3 text-sm font-semibold text-[#1A1A1A] shadow-[3px_3px_0_0_#1A1A1A] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#1A1A1A]"
      style={{ fontFamily: sans }}
    >
      {children}
    </Link>
  );
}

function PlaceholderCard({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#FFFDF3] p-6 shadow-[4px_4px_0_0_#1A1A1A]">
      <p className="text-xs uppercase tracking-[0.12em] text-[#1A1A1A]/55" style={{ fontFamily: sans }}>
        Asset Preview
      </p>
      <div className="mt-4 rounded-xl border border-[#1A1A1A]/15 bg-white p-4">
        <div className="mb-3 h-2 w-24 rounded bg-[#0F5F56]/20" />
        <div className="mb-2 h-2 w-full rounded bg-[#1A1A1A]/10" />
        <div className="mb-2 h-2 w-5/6 rounded bg-[#1A1A1A]/10" />
        <div className="h-2 w-3/4 rounded bg-[#1A1A1A]/10" />
      </div>
      <p className="mt-3 text-sm text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
        {label}
      </p>
    </div>
  );
}

export default function ClosrStyleLandingB() {
  const tier = useTierCTA();

  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#1A1A1A]">
      <nav className="sticky top-0 z-40 border-b border-[#1A1A1A]/15 bg-[#F5F0E8]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="AgentForLife" className="h-6 w-10 object-contain" />
            <span className="text-base text-[#1A1A1A]" style={{ fontFamily: serif }}>
              AgentForLife
            </span>
          </div>
          <div className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm text-[#1A1A1A]/85" style={{ fontFamily: sans }}>
              Features
            </a>
            <a href="#pricing" className="text-sm text-[#1A1A1A]/85" style={{ fontFamily: sans }}>
              Pricing
            </a>
            <Link href="/login" className="text-sm text-[#1A1A1A]/85" style={{ fontFamily: sans }}>
              Log in
            </Link>
            <StampButton href={tier.ctaHref}>{tier.isFoundingOpen ? 'Get Started Free' : tier.ctaText}</StampButton>
          </div>
        </div>
      </nav>

      <section className="px-6 pb-20 pt-16 text-center">
        <div className="mx-auto max-w-4xl">
          <h1
            className="text-5xl leading-[0.95] tracking-[-0.02em] md:text-7xl"
            style={{ fontFamily: serif }}
          >
            <span className="text-[#1A1A1A]/45">Chargebacks happen</span>
            <br />
            <span className="text-[#1A1A1A]/45">when clients forget </span>
            <span className="font-bold text-[#1A1A1A]">you</span>
            <span className="text-[#1A1A1A]"> exist.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
            We built a post-sale system that keeps your clients engaged, protects your book, and creates
            referrals without adding manual overhead.
          </p>
          <div className="mt-8">
            <StampButton href={tier.ctaHref}>
              {tier.isFoundingOpen ? 'Lock In My Free Spot' : tier.ctaText}
            </StampButton>
          </div>
        </div>
      </section>

      <section className="border-y border-[#1A1A1A]/15 px-6 py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 text-center md:grid-cols-4">
          {[
            ['97%', 'Retention Lift'],
            ['3x', 'Referral Velocity'],
            ['$0', 'Founding Access'],
            ['10 min', 'Setup'],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="text-5xl leading-none text-[#1A1A1A]" style={{ fontFamily: serif }}>
                {value}
              </p>
              <p className="mt-2 text-sm text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-4 mt-10 rounded-[42px] bg-[#1A1A1A] px-7 py-12 text-[#FFFDEB] md:mx-6 md:px-12">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-xs uppercase tracking-[0.14em] text-[#FFFDEB]/60" style={{ fontFamily: sans }}>
            Your Speed Advantage
          </p>
          <h2 className="mt-4 text-center text-4xl leading-[1.05] md:text-6xl" style={{ fontFamily: serif }}>
            Three ways data gets in
          </h2>
          <div className="mt-10 grid gap-7 md:grid-cols-3">
            {[
              ['Import your book', 'Upload CSV or policy docs and map clients quickly.'],
              ['Automate touchpoints', 'Holiday, anniversary, and retention outreach without manual follow-up.'],
              ['Activate referrals', 'AI handles qualification and routes warm leads into your flow.'],
            ].map(([title, body]) => (
              <article key={title}>
                <h3 className="text-xl text-[#FFFDEB]" style={{ fontFamily: sans }}>
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#FFFDEB]/72" style={{ fontFamily: sans }}>
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-5xl gap-14">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <h3 className="text-4xl leading-[1.08] text-[#1A1A1A] md:text-5xl" style={{ fontFamily: serif }}>
                Your numbers, one glance
              </h3>
              <p className="mt-4 text-base leading-relaxed text-[#1A1A1A]/72" style={{ fontFamily: sans }}>
                See retention, referral activity, and conservation risk in one place. Coach from clean signal,
                not stale spreadsheets.
              </p>
            </div>
            <PlaceholderCard label="Dashboard KPI asset from current AFL set" />
          </div>
          <div className="grid items-center gap-8 md:grid-cols-2">
            <PlaceholderCard label="Client app / conversation asset from current AFL set" />
            <div>
              <h3 className="text-4xl leading-[1.08] text-[#1A1A1A] md:text-5xl" style={{ fontFamily: serif }}>
                Know who needs coaching, and why
              </h3>
              <p className="mt-4 text-base leading-relaxed text-[#1A1A1A]/72" style={{ fontFamily: sans }}>
                Catch drop-offs early and prompt action before churn and missed referrals compound.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-4 rounded-[42px] bg-[#0F5F56] px-7 py-14 text-[#FFFDEB] md:mx-6 md:px-12">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-4xl leading-[1.06] md:text-6xl" style={{ fontFamily: serif }}>
            Built for your clients, not just your spreadsheet
          </h2>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <span className="rounded-full border border-[#1A1A1A] bg-[#F0D7FF] px-4 py-2 text-sm text-[#1A1A1A]" style={{ fontFamily: sans }}>
              Agency Owners
            </span>
            <span className="rounded-full border border-[#FFFDEB]/70 px-4 py-2 text-sm text-[#FFFDEB]" style={{ fontFamily: sans }}>
              Team Leads
            </span>
            <span className="rounded-full border border-[#FFFDEB]/70 px-4 py-2 text-sm text-[#FFFDEB]" style={{ fontFamily: sans }}>
              Individual Agents
            </span>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-base text-[#FFFDEB]/80" style={{ fontFamily: sans }}>
            Manage the post-sale relationship loop with one consistent system from dashboard to client app.
          </p>
          <div className="mt-8">
            <StampButton href={tier.ctaHref}>Start your 30-day trial</StampButton>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-4 mt-10 rounded-[42px] bg-[#0F5F56] px-7 py-14 text-[#FFFDEB] md:mx-6 md:px-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-4xl leading-[1.06] md:text-6xl" style={{ fontFamily: serif }}>
            Pricing
          </h2>
          <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
            <article className="rounded-2xl border border-[rgba(245,240,232,0.2)] bg-[rgba(245,240,232,0.1)] p-6">
              <p className="text-sm uppercase tracking-[0.1em] text-[#FFFDEB]/75" style={{ fontFamily: sans }}>
                Founding
              </p>
              <p className="mt-3 text-5xl leading-none text-[#FFFDEB]" style={{ fontFamily: serif }}>
                $0
              </p>
              <p className="mt-2 text-sm text-[#FFFDEB]/78" style={{ fontFamily: sans }}>
                Free for life while spots remain.
              </p>
              <div className="mt-6">
                <StampButton href={tier.ctaHref}>Apply now</StampButton>
              </div>
            </article>
            <article className="rounded-2xl border border-[rgba(245,240,232,0.2)] bg-[rgba(245,240,232,0.1)] p-6">
              <p className="text-sm uppercase tracking-[0.1em] text-[#FFFDEB]/75" style={{ fontFamily: sans }}>
                Standard
              </p>
              <p className="mt-3 text-5xl leading-none text-[#FFFDEB]" style={{ fontFamily: serif }}>
                $49
              </p>
              <p className="mt-2 text-sm text-[#FFFDEB]/78" style={{ fontFamily: sans }}>
                Per month, cancel anytime.
              </p>
              <div className="mt-6">
                <StampButton href={tier.ctaHref}>Get started</StampButton>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 text-center">
        <h2 className="mx-auto max-w-3xl text-4xl leading-[1.06] text-[#1A1A1A] md:text-6xl" style={{ fontFamily: serif }}>
          Ready to coach from clean signal?
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
          Launch in minutes. Keep clients engaged for years.
        </p>
        <div className="mt-8">
          <StampButton href={tier.ctaHref}>Lock in my free spot</StampButton>
        </div>
      </section>

      <footer className="bg-[#1A1A1A] px-6 py-10 text-[#FFFDEB]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="AgentForLife" className="h-6 w-10 object-contain" />
            <span className="text-base" style={{ fontFamily: serif }}>
              AgentForLife
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#FFFDEB]/75" style={{ fontFamily: sans }}>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/login">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

