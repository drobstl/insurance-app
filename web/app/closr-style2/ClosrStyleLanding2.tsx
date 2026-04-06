'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTierCTA } from '@/hooks/useTierCTA';
import LeakyBucketCalculator from '@/components/LeakyBucketCalculator';
import { closrStyle2Content, type ClosrStyle2FeatureId } from './content';

const serif =
  "var(--font-serif), 'EB Garamond', Georgia, 'Times New Roman', serif";
const sans =
  "var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const stampCard = 'rounded-2xl border-2 border-[#1A1A1A] bg-[#FFFDF3] shadow-[4px_4px_0_0_#1A1A1A]';

const proofScreenshotCard =
  'w-[220px] md:w-[250px] rounded-2xl border-2 border-[#1A1A1A] border-r-[6px] border-b-[6px] bg-white overflow-hidden shadow-[4px_5px_0_0_rgba(26,26,26,0.18)] transition-transform duration-500';

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

function ProofScreenshotPair({
  leftSrc,
  leftAlt,
  rightSrc,
  rightAlt,
}: {
  leftSrc: string;
  leftAlt: string;
  rightSrc: string;
  rightAlt: string;
}) {
  return (
    <div className="flex justify-center py-2">
      <div className="flex justify-center gap-4">
        <div className={`${proofScreenshotCard} -rotate-3 hover:rotate-0`}>
          <img src={leftSrc} alt={leftAlt} className="block h-auto w-full" />
        </div>
        <div className={`${proofScreenshotCard} rotate-3 translate-y-8 hover:rotate-0 hover:translate-y-0`}>
          <img src={rightSrc} alt={rightAlt} className="block h-auto w-full" />
        </div>
      </div>
    </div>
  );
}

function ReferralVisualCard() {
  return (
    <ProofScreenshotPair
      leftSrc="/screenshot-referral-sent.png"
      leftAlt="Referral sent confirmation screen"
      rightSrc="/screenshot-referral-message.png"
      rightAlt="Referral message conversation"
    />
  );
}

function RetentionVisualCard() {
  return (
    <ProofScreenshotPair
      leftSrc="/screenshot-retention-message.png"
      leftAlt="Retention outreach message from agent"
      rightSrc="/screenshot-retention-conservation-email.png"
      rightAlt="Conservation alert email screenshot"
    />
  );
}

function RewriteVisualCard() {
  return (
    <ProofScreenshotPair
      leftSrc="/screenshot-rewrite-convo.png"
      leftAlt="AFL AI rewrite follow-up conversation screenshot"
      rightSrc="/screenshot-rewrite-app.png"
      rightAlt="Rewrite app screen"
    />
  );
}

function RelationshipVisualCard() {
  return (
    <ProofScreenshotPair
      leftSrc="/screenshot-thanksgiving-notification.png"
      leftAlt="Thanksgiving notification on client phone"
      rightSrc="/screenshot-thanksgiving-card.png"
      rightAlt="Thanksgiving holiday card experience"
    />
  );
}

function featureVisualById(id: ClosrStyle2FeatureId) {
  switch (id) {
    case 'retention':
      return <RetentionVisualCard />;
    case 'referrals':
      return <ReferralVisualCard />;
    case 'rewrites':
      return <RewriteVisualCard />;
    case 'relationships':
      return <RelationshipVisualCard />;
    default:
      return null;
  }
}

export default function ClosrStyleLanding2() {
  const tier = useTierCTA();
  const [openPain, setOpenPain] = useState<number | null>(0);
  const features = closrStyle2Content.proof.features;

  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#1A1A1A]">
      <nav className="sticky top-0 z-40 border-b border-[#1A1A1A]/15 bg-[#F5F0E8]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="AgentForLife" className="h-6 w-10 object-contain" />
            <span className="text-base text-[#1A1A1A]" style={{ fontFamily: serif }}>
              {closrStyle2Content.brandName}
            </span>
          </div>
          <div className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm text-[#1A1A1A]/85" style={{ fontFamily: sans }}>
              {closrStyle2Content.nav.features}
            </a>
            <a href="#pricing" className="text-sm text-[#1A1A1A]/85" style={{ fontFamily: sans }}>
              {closrStyle2Content.nav.pricing}
            </a>
            <Link href="/login" className="text-sm text-[#1A1A1A]/85" style={{ fontFamily: sans }}>
              {closrStyle2Content.nav.login}
            </Link>
            <StampButton href={tier.ctaHref}>
              {tier.isFoundingOpen ? closrStyle2Content.nav.primaryCtaWhenFoundingOpen : tier.ctaText}
            </StampButton>
          </div>
        </div>
      </nav>

      <section className="px-6 pb-24 pt-20 text-center md:pb-28 md:pt-24">
        <div className="mx-auto max-w-5xl">
          <h1
            className="text-[3.35rem] leading-[0.93] tracking-[-0.02em] md:text-[6.2rem]"
            style={{ fontFamily: serif }}
          >
            <span className="text-[#1A1A1A]/45">{closrStyle2Content.hero.headlineTop}</span>
            <br />
            <span className="text-[#1A1A1A]/45">{closrStyle2Content.hero.headlineLeadIn}</span>
            <span className="font-bold text-[#1A1A1A]">{closrStyle2Content.hero.headlineEmphasis}</span>
            <span className="text-[#1A1A1A]">{closrStyle2Content.hero.headlineTail}</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-[18px] leading-[1.6] text-[#1A1A1A]/72 md:text-[19px]" style={{ fontFamily: sans }}>
            {closrStyle2Content.hero.body}
          </p>
          <div className="mt-9">
            <StampButton href={tier.ctaHref}>
              {tier.isFoundingOpen ? closrStyle2Content.hero.primaryCtaWhenFoundingOpen : tier.ctaText}
            </StampButton>
          </div>
        </div>
      </section>

      <section className="border-y border-[#1A1A1A]/15 px-6 py-[58px]">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 text-center md:grid-cols-4">
          {closrStyle2Content.stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-[58px] leading-none text-[#1A1A1A]" style={{ fontFamily: serif }}>
                {stat.value}
              </p>
              <p className="mt-2 text-[15px] text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-4 mt-12 rounded-[56px] bg-[#1A1A1A] px-7 py-16 text-[#FFFDEB] md:mx-6 md:px-[60px]">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-xs uppercase tracking-[0.14em] text-[#FFFDEB]/60" style={{ fontFamily: sans }}>
            {closrStyle2Content.payoff.eyebrow}
          </p>
          <h2 className="mt-4 text-center text-4xl leading-[1.05] md:text-[64px]" style={{ fontFamily: serif }}>
            {closrStyle2Content.payoff.title}
          </h2>
          <div className="mt-11 grid gap-8 md:grid-cols-3">
            {closrStyle2Content.payoff.cards.map((card) => (
              <article key={card.title}>
                <h3 className="text-[20px] text-[#FFFDEB]" style={{ fontFamily: sans }}>
                  {card.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[#FFFDEB]/72" style={{ fontFamily: sans }}>
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <p className="text-xs uppercase tracking-[0.14em] text-[#1A1A1A]/58" style={{ fontFamily: sans }}>
              {closrStyle2Content.proof.eyebrow}
            </p>
            <h2 className="mt-3 text-4xl leading-[1.06] text-[#1A1A1A] md:text-[56px]" style={{ fontFamily: serif }}>
              {closrStyle2Content.proof.title}
            </h2>
          </div>
        </div>
        <div className="mx-auto grid max-w-5xl gap-20 md:gap-24">
          {features.map((feature, index) => (
            <div
              key={feature.id}
              className={`grid items-center gap-10 md:grid-cols-[0.84fr_1.16fr] md:gap-14 ${
                index > 0 ? 'border-t border-[#1A1A1A]/12 pt-12 md:pt-16' : ''
              }`}
            >
              <div className={index % 2 === 0 ? 'md:pr-4' : 'md:order-2 md:pl-4'}>
                <h3 className="text-[2.15rem] leading-[1.08] text-[#1A1A1A] md:text-[48px]" style={{ fontFamily: serif }}>
                  {feature.title}
                </h3>
                <p className="mt-3 text-[17px] leading-[1.5] text-[#1A1A1A]/78 md:text-[18px]" style={{ fontFamily: sans }}>
                  {feature.subtitle}
                </p>
                <p className="mt-4 text-[16px] leading-relaxed text-[#1A1A1A]/72" style={{ fontFamily: sans }}>
                  {feature.body}
                </p>
                <Link
                  href={feature.href}
                  className="mt-5 inline-flex items-center justify-center rounded-full border border-[#1A1A1A] bg-[#F0D7FF] px-4 py-2 text-[13px] font-semibold text-[#1A1A1A] shadow-[2px_2px_0_0_#1A1A1A] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#1A1A1A]"
                  style={{ fontFamily: sans }}
                >
                  {closrStyle2Content.proof.featureCtaLabel}
                </Link>
              </div>
              <div className={index % 2 === 0 ? 'md:translate-y-3' : 'md:order-1 md:-translate-y-3'}>
                {featureVisualById(feature.id)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <p className="text-xs uppercase tracking-[0.14em] text-[#1A1A1A]/58" style={{ fontFamily: sans }}>
              {closrStyle2Content.pain.eyebrow}
            </p>
            <h2 className="mt-3 text-4xl leading-[1.06] text-[#1A1A1A] md:text-[56px]" style={{ fontFamily: serif }}>
              {closrStyle2Content.pain.title}
            </h2>
          </div>

          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
            <div className={`${stampCard} p-6 md:p-7`}>
              <div className="space-y-4">
                {closrStyle2Content.pain.cards.map((card, i) => (
                  <div key={card.title} className={i > 0 ? 'border-t border-[#1A1A1A]/12 pt-4' : ''}>
                    <button
                      onClick={() => setOpenPain(openPain === i ? null : i)}
                      className="flex w-full items-start justify-between gap-3 text-left"
                    >
                      <h3 className="text-[22px] leading-tight text-[#1A1A1A]" style={{ fontFamily: serif }}>
                        {card.title}
                      </h3>
                      <span
                        className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#1A1A1A]/20 text-sm"
                        style={{ color: card.accent }}
                      >
                        {openPain === i ? '−' : '+'}
                      </span>
                    </button>
                    {openPain === i && (
                      <p className="mt-3 text-[15px] leading-relaxed text-[#1A1A1A]/74" style={{ fontFamily: sans }}>
                        {card.body}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <LeakyBucketCalculator
                initialBookSize={250000}
                initialRetentionRate={70}
                initialReferralRate={5}
                initialRewriteRate={10}
                ctaHref={tier.ctaHref}
                ctaText={tier.isFoundingOpen ? closrStyle2Content.pain.calculatorCtaWhenFoundingOpen : tier.ctaText}
                theme="closr"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-4 rounded-[56px] bg-[#0F5F56] px-7 py-16 text-[#FFFDEB] md:mx-6 md:px-[60px]">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-4xl leading-[1.06] md:text-[64px]" style={{ fontFamily: serif }}>
            {closrStyle2Content.greenCallout.title}
          </h2>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {closrStyle2Content.greenCallout.chips.map((chip, index) => (
              <span
                key={chip}
                className={
                  index === 0
                    ? 'rounded-full border border-[#1A1A1A] bg-[#F0D7FF] px-4 py-2 text-sm text-[#1A1A1A]'
                    : 'rounded-full border border-[#FFFDEB]/70 px-4 py-2 text-sm text-[#FFFDEB]'
                }
                style={{ fontFamily: sans }}
              >
                {chip}
              </span>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-base text-[#FFFDEB]/80" style={{ fontFamily: sans }}>
            {closrStyle2Content.greenCallout.body}
          </p>
          <div className="mt-8">
            <StampButton href={tier.ctaHref}>
              {tier.isFoundingOpen ? closrStyle2Content.greenCallout.ctaWhenFoundingOpen : tier.ctaText}
            </StampButton>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-4 mt-10 rounded-[56px] bg-[#0F5F56] px-7 py-16 text-[#FFFDEB] md:mx-6 md:px-[60px]">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-4xl leading-[1.06] md:text-[64px]" style={{ fontFamily: serif }}>
            {closrStyle2Content.pricing.title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[16px] text-[#FFFDEB]/78" style={{ fontFamily: sans }}>
            {closrStyle2Content.pricing.subtitle}
          </p>
          <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
            {closrStyle2Content.pricing.cards.map((card) => (
              <article key={card.title} className={`${stampCard} p-6 text-[#1A1A1A]`}>
                <p className="text-sm uppercase tracking-[0.1em] text-[#1A1A1A]/75" style={{ fontFamily: sans }}>
                  {card.title}
                </p>
                <p className="mt-3 text-5xl leading-none text-[#1A1A1A]" style={{ fontFamily: serif }}>
                  {card.price}
                </p>
                <p className="mt-2 text-sm text-[#1A1A1A]/72" style={{ fontFamily: sans }}>
                  {card.body}
                </p>
                <div className="mt-6">
                  <StampButton href={tier.ctaHref}>
                    {tier.isFoundingOpen ? card.ctaWhenFoundingOpen : tier.ctaText}
                  </StampButton>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 text-center">
        <h2 className="mx-auto max-w-3xl text-4xl leading-[1.06] text-[#1A1A1A] md:text-[64px]" style={{ fontFamily: serif }}>
          {closrStyle2Content.finalCta.title}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] text-[#1A1A1A]/70" style={{ fontFamily: sans }}>
          {closrStyle2Content.finalCta.body}
        </p>
        <div className="mt-8">
          <StampButton href={tier.ctaHref}>{closrStyle2Content.finalCta.ctaLabel}</StampButton>
        </div>
      </section>

      <footer className="bg-[#1A1A1A] px-6 py-10 text-[#FFFDEB]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="AgentForLife" className="h-6 w-10 object-contain" />
            <span className="text-base" style={{ fontFamily: serif }}>
              {closrStyle2Content.brandName}
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#FFFDEB]/75" style={{ fontFamily: sans }}>
            <Link href="/privacy">{closrStyle2Content.footer.links.privacy}</Link>
            <Link href="/terms">{closrStyle2Content.footer.links.terms}</Link>
            <Link href="/login">{closrStyle2Content.footer.links.login}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
