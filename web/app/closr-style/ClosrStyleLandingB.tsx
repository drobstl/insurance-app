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

function DashboardProofCard() {
  return (
    <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#FFFDF3] p-5 shadow-[4px_4px_0_0_#1A1A1A]">
      <div className="rounded-xl border border-[#1A1A1A]/15 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#1A1A1A]/60" style={{ fontFamily: sans }}>
            Agent Dashboard
          </p>
          <span className="rounded-full bg-[rgba(240,215,255,0.45)] px-2 py-0.5 text-[10px] text-[#1A1A1A]" style={{ fontFamily: sans }}>
            Live
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-[#1A1A1A]/10 bg-[#F8F6EF] p-2">
            <p className="text-[10px] text-[#1A1A1A]/55" style={{ fontFamily: sans }}>
              Save rate
            </p>
            <p className="mt-1 text-xl leading-none text-[#1A1A1A]" style={{ fontFamily: serif }}>
              84%
            </p>
          </div>
          <div className="rounded-lg border border-[#1A1A1A]/10 bg-[#F8F6EF] p-2">
            <p className="text-[10px] text-[#1A1A1A]/55" style={{ fontFamily: sans }}>
              Referrals
            </p>
            <p className="mt-1 text-xl leading-none text-[#1A1A1A]" style={{ fontFamily: serif }}>
              12
            </p>
          </div>
          <div className="rounded-lg border border-[#1A1A1A]/10 bg-[#F8F6EF] p-2">
            <p className="text-[10px] text-[#1A1A1A]/55" style={{ fontFamily: sans }}>
              Rewrites
            </p>
            <p className="mt-1 text-xl leading-none text-[#1A1A1A]" style={{ fontFamily: serif }}>
              5
            </p>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-[#1A1A1A]/10 bg-[#FFFDF3] p-2">
          <p className="text-[11px] text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
            Conservation alert: Sarah J. flagged at day 2.
          </p>
        </div>
      </div>
    </div>
  );
}

function ClientAppProofCard() {
  return (
    <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#FFFDF3] p-5 shadow-[4px_4px_0_0_#1A1A1A]">
      <div className="rounded-xl border border-[#1A1A1A]/15 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#1A1A1A]/60" style={{ fontFamily: sans }}>
            Client App
          </p>
          <span className="rounded-full bg-[rgba(240,215,255,0.45)] px-2 py-0.5 text-[10px] text-[#1A1A1A]" style={{ fontFamily: sans }}>
            Active
          </span>
        </div>
        <div className="space-y-2">
          <div className="rounded-lg border border-[#1A1A1A]/10 bg-[#F8F6EF] px-3 py-2">
            <p className="text-[11px] text-[#1A1A1A]/80" style={{ fontFamily: sans }}>
              Merry Christmas card sent
            </p>
          </div>
          <div className="rounded-lg border border-[#1A1A1A]/10 bg-[#F8F6EF] px-3 py-2">
            <p className="text-[11px] text-[#1A1A1A]/80" style={{ fontFamily: sans }}>
              Policy anniversary reminder delivered
            </p>
          </div>
          <div className="rounded-full border border-[#1A1A1A] bg-[#F0D7FF] px-3 py-1.5 text-center text-[11px] text-[#1A1A1A]" style={{ fontFamily: sans }}>
            Refer a Friend
          </div>
        </div>
      </div>
    </div>
  );
}

function ReferralVisualCard() {
  return (
    <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#FFFDF3] p-5 shadow-[4px_4px_0_0_#1A1A1A]">
      <div className="rounded-xl border border-[#1A1A1A]/15 bg-white p-4">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#1A1A1A]/60" style={{ fontFamily: sans }}>
          Referral iMessage Flow
        </p>
        <div className="mt-3 space-y-2">
          <div className="max-w-[80%] rounded-2xl bg-[#E8E8EC] px-3 py-2 text-[12px] text-[#1A1A1A]/85" style={{ fontFamily: sans }}>
            Hey, I wanted to connect you with my insurance agent Daniel.
          </div>
          <div className="ml-auto max-w-[78%] rounded-2xl bg-[#3B9BFF] px-3 py-2 text-[12px] text-white" style={{ fontFamily: sans }}>
            We own and need protection.
          </div>
          <div className="max-w-[92%] rounded-2xl bg-[#E8E8EC] px-3 py-2 text-[12px] text-[#1A1A1A]/85" style={{ fontFamily: sans }}>
            Perfect. Grab a time here and I&apos;ll walk you through options.
          </div>
          <div className="inline-flex rounded-full border border-[#1A1A1A] bg-[#F0D7FF] px-3 py-1 text-[11px] text-[#1A1A1A]" style={{ fontFamily: sans }}>
            calendar link sent
          </div>
        </div>
      </div>
    </div>
  );
}

function RetentionVisualCard() {
  return (
    <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#FFFDF3] p-5 shadow-[4px_4px_0_0_#1A1A1A]">
      <div className="rounded-xl border border-[#1A1A1A]/15 bg-white p-4">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#1A1A1A]/60" style={{ fontFamily: sans }}>
          Conservation Alert
        </p>
        <div className="mt-3 rounded-lg border border-[#1A1A1A]/10 bg-[#F8F6EF] p-3">
          <p className="text-[12px] text-[#0F5F56] font-semibold" style={{ fontFamily: sans }}>
            HIGH PRIORITY -- chargeback risk
          </p>
          <p className="mt-1 text-[11px] text-[#1A1A1A]/75" style={{ fontFamily: sans }}>
            Matched client + policy. Outreach queued in 2 hours.
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {['Day 2', 'Day 5', 'Day 7'].map((day) => (
            <div key={day} className="rounded-md border border-[#1A1A1A]/10 bg-white px-2 py-1.5 text-center text-[10px] text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
              {day}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RewriteVisualCard() {
  return (
    <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#FFFDF3] p-5 shadow-[4px_4px_0_0_#1A1A1A]">
      <div className="rounded-xl border border-[#1A1A1A]/15 bg-white p-4">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#1A1A1A]/60" style={{ fontFamily: sans }}>
          Anniversary Rewrite
        </p>
        <div className="mt-3 space-y-2">
          <div className="ml-auto max-w-[85%] rounded-2xl bg-[#3B9BFF] px-3 py-2 text-[12px] text-white" style={{ fontFamily: sans }}>
            Your policy just hit the one-year mark -- want me to compare rates?
          </div>
          <div className="max-w-[78%] rounded-2xl bg-[#E8E8EC] px-3 py-2 text-[12px] text-[#1A1A1A]/85" style={{ fontFamily: sans }}>
            Yes, that would be great.
          </div>
          <div className="inline-flex rounded-full border border-[#1A1A1A] bg-[#F0D7FF] px-3 py-1 text-[11px] text-[#1A1A1A]" style={{ fontFamily: sans }}>
            appointment booked
          </div>
        </div>
      </div>
    </div>
  );
}

function RelationshipVisualCard() {
  return (
    <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#FFFDF3] p-5 shadow-[4px_4px_0_0_#1A1A1A]">
      <div className="rounded-xl border border-[#1A1A1A]/15 bg-white p-4">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#1A1A1A]/60" style={{ fontFamily: sans }}>
          Touchpoints on Autopilot
        </p>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-[#1A1A1A]/10 bg-[#F8F6EF] px-3 py-2 text-[11px] text-[#1A1A1A]/80" style={{ fontFamily: sans }}>
            Thanksgiving greeting delivered
          </div>
          <div className="rounded-lg border border-[#1A1A1A]/10 bg-[#F8F6EF] px-3 py-2 text-[11px] text-[#1A1A1A]/80" style={{ fontFamily: sans }}>
            Birthday message scheduled
          </div>
          <div className="rounded-lg border border-[#1A1A1A]/10 bg-[#F8F6EF] px-3 py-2 text-[11px] text-[#1A1A1A]/80" style={{ fontFamily: sans }}>
            Anniversary reminder queued
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClosrStyleLandingB() {
  const tier = useTierCTA();
  const features = [
    {
      id: 'referrals',
      title: 'One-Tap Referrals',
      subtitle: "Put a referral button in every client's pocket. AI takes it from there.",
      body: 'One tap from your client. AI texts the referral via iMessage, qualifies them, and books the appointment on your calendar. You just show up and close.',
      href: '/v5/referrals',
      visual: <ReferralVisualCard />,
    },
    {
      id: 'retention',
      title: 'Automated Retention',
      subtitle: "You move forward, AI's got your back.",
      body: 'When a policy slips, forward the carrier\'s conservation notice. AI extracts the client info, matches your records, and sends personalized outreach within hours. Then follows up on Day 2, 5, and 7.',
      href: '/v5/retention',
      visual: <RetentionVisualCard />,
    },
    {
      id: 'rewrites',
      title: 'Automated Rewrites',
      subtitle: 'Every anniversary is a booked appointment.',
      body: 'When a policy hits its one-year mark, your client hears from you -- not the carrier. AI sends a notification, they book on your calendar. The rewrite comes to you.',
      href: '/v5/rewrites',
      visual: <RewriteVisualCard />,
    },
    {
      id: 'relationships',
      title: 'Relationships on Autopilot',
      subtitle: "People don't refer agents, they refer relationships.",
      body: '7+ personalized touchpoints per year, per client -- completely automatic. Holiday cards for 5 major holidays, birthday messages, anniversary alerts, and custom push notifications.',
      href: '/v5/relationships',
      visual: <RelationshipVisualCard />,
    },
  ] as const;

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

      <section className="px-6 pb-24 pt-20 text-center">
        <div className="mx-auto max-w-5xl">
          <h1
            className="text-[3.35rem] leading-[0.93] tracking-[-0.02em] md:text-[6.2rem]"
            style={{ fontFamily: serif }}
          >
            <span className="text-[#1A1A1A]/45">Chargebacks happen</span>
            <br />
            <span className="text-[#1A1A1A]/45">when clients forget </span>
            <span className="font-bold text-[#1A1A1A]">you</span>
            <span className="text-[#1A1A1A]"> exist.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-[19px] leading-[1.55] text-[#1A1A1A]/72" style={{ fontFamily: sans }}>
            We built a system that makes sure they never do. A branded app on their phone. Automated
            touchpoints, one-tap referrals, and conservation outreach running in the background.
          </p>
          <div className="mt-9">
            <StampButton href={tier.ctaHref}>
              {tier.isFoundingOpen ? 'Lock In My Free Spot' : tier.ctaText}
            </StampButton>
          </div>
        </div>
      </section>

      <section className="border-y border-[#1A1A1A]/15 px-6 py-[58px]">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 text-center md:grid-cols-4">
          {[
            ['97%', 'Client Retention'],
            ['3x', 'Referral Volume'],
            ['$0', 'Founding Cost'],
            ['10 min', 'Setup Time'],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="text-[58px] leading-none text-[#1A1A1A]" style={{ fontFamily: serif }}>
                {value}
              </p>
              <p className="mt-2 text-[15px] text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-4 mt-12 rounded-[56px] bg-[#1A1A1A] px-7 py-16 text-[#FFFDEB] md:mx-6 md:px-[60px]">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-xs uppercase tracking-[0.14em] text-[#FFFDEB]/60" style={{ fontFamily: sans }}>
            Protect Your Book
          </p>
          <h2 className="mt-4 text-center text-4xl leading-[1.05] md:text-[64px]" style={{ fontFamily: serif }}>
            Three ways AgentForLife pays for itself
          </h2>
          <div className="mt-11 grid gap-8 md:grid-cols-3">
            {[
              ['Save at-risk policies', 'Conservation alerts trigger outreach before cancellations become chargebacks.'],
              ['Automate relationship touchpoints', 'Birthdays, holidays, anniversaries, and policy milestones go out on schedule.'],
              ['Generate warm referrals', 'Clients share in-app and AI qualifies referrals while you stay focused on selling.'],
            ].map(([title, body]) => (
              <article key={title}>
                <h3 className="text-[20px] text-[#FFFDEB]" style={{ fontFamily: sans }}>
                  {title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[#FFFDEB]/72" style={{ fontFamily: sans }}>
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto grid max-w-5xl gap-16">
          {features.map((feature, index) => (
            <div key={feature.id} className="grid items-center gap-10 md:grid-cols-2">
              <div className={index % 2 === 0 ? '' : 'md:order-2'}>
                <h3 className="text-4xl leading-[1.08] text-[#1A1A1A] md:text-[48px]" style={{ fontFamily: serif }}>
                  {feature.title}
                </h3>
                <p className="mt-3 text-[18px] leading-[1.45] text-[#1A1A1A]/78" style={{ fontFamily: sans }}>
                  {feature.subtitle}
                </p>
                <p className="mt-4 text-[16px] leading-relaxed text-[#1A1A1A]/72" style={{ fontFamily: sans }}>
                  {feature.body}
                </p>
                <Link
                  href={feature.href}
                  className="mt-5 inline-flex items-center text-[15px] font-semibold text-[#1A1A1A] underline decoration-[#1A1A1A]/35 underline-offset-4"
                  style={{ fontFamily: sans }}
                >
                  See how it works
                </Link>
              </div>
              <div className={index % 2 === 0 ? 'md:translate-y-3' : 'md:order-1 md:-translate-y-3'}>
                {feature.visual}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-4 rounded-[56px] bg-[#0F5F56] px-7 py-16 text-[#FFFDEB] md:mx-6 md:px-[60px]">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-4xl leading-[1.06] md:text-[64px]" style={{ fontFamily: serif }}>
            Built for agents who want clients for life
          </h2>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <span className="rounded-full border border-[#1A1A1A] bg-[#F0D7FF] px-4 py-2 text-sm text-[#1A1A1A]" style={{ fontFamily: sans }}>
              Retention
            </span>
            <span className="rounded-full border border-[#FFFDEB]/70 px-4 py-2 text-sm text-[#FFFDEB]" style={{ fontFamily: sans }}>
              Referrals
            </span>
            <span className="rounded-full border border-[#FFFDEB]/70 px-4 py-2 text-sm text-[#FFFDEB]" style={{ fontFamily: sans }}>
              Rewrites
            </span>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-base text-[#FFFDEB]/80" style={{ fontFamily: sans }}>
            Give clients a branded app experience and give yourself a post-sale system that keeps policies
            active and referrals flowing.
          </p>
          <div className="mt-8">
            <StampButton href={tier.ctaHref}>{tier.isFoundingOpen ? 'Start Free' : tier.ctaText}</StampButton>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-4 mt-10 rounded-[56px] bg-[#0F5F56] px-7 py-16 text-[#FFFDEB] md:mx-6 md:px-[60px]">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-4xl leading-[1.06] md:text-[64px]" style={{ fontFamily: serif }}>
            Pricing
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[16px] text-[#FFFDEB]/78" style={{ fontFamily: sans }}>
            Founding access is free for life while spots remain. Standard access begins at $49/month.
          </p>
          <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
            <article className="rounded-2xl border border-[rgba(245,240,232,0.2)] bg-[rgba(245,240,232,0.1)] p-6">
              <p className="text-sm uppercase tracking-[0.1em] text-[#FFFDEB]/75" style={{ fontFamily: sans }}>
                Founding Members
              </p>
              <p className="mt-3 text-5xl leading-none text-[#FFFDEB]" style={{ fontFamily: serif }}>
                $0
              </p>
              <p className="mt-2 text-sm text-[#FFFDEB]/78" style={{ fontFamily: sans }}>
                Free for life while 50 founding spots are open.
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
                $49/month. Cancel anytime.
              </p>
              <div className="mt-6">
                <StampButton href={tier.ctaHref}>Get started</StampButton>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 text-center">
        <h2 className="mx-auto max-w-3xl text-4xl leading-[1.06] text-[#1A1A1A] md:text-[64px]" style={{ fontFamily: serif }}>
          Keep clients close. Grow by referral.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
          Launch in minutes and run your entire post-sale system from one place.
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

