'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';

/* ═══════════════════════════════════════════════════
   VISUAL CARDS
   ═══════════════════════════════════════════════════ */

function RetentionCard() {
  return (
    <div className="bg-[#1a1a2e] rounded-2xl p-4 md:p-5 shadow-2xl space-y-3 w-full max-w-sm">
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/5">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0">
            <span className="text-sm">🎄</span>
          </div>
          <div className="min-w-0">
            <p className="text-white/90 text-[11px] font-bold">Holiday Touchpoint</p>
            <p className="text-white/60 text-[10px] leading-snug mt-0.5">Merry Christmas, Sarah! Wishing you and your family a wonderful holiday. — Daniel</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-1">
        {['Christmas', "New Year's", 'Birthday', 'Anniversary', '+ more'].map((t, i) => (
          <span key={t} className={`px-2 py-0.5 rounded-md text-[8px] font-medium ${i === 0 ? 'bg-[#3DD6C3]/20 text-[#3DD6C3] border border-[#3DD6C3]/20' : 'bg-white/5 text-white/30 border border-white/5'}`}>{t}</span>
        ))}
      </div>
      <div className="bg-white/5 rounded-xl p-3 border border-red-400/20">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-sm">⚠</span>
          </div>
          <div className="min-w-0">
            <p className="text-red-300 text-[11px] font-bold">Conservation Alert</p>
            <p className="text-white/60 text-[10px] leading-snug mt-0.5">AI identified Sarah — auto policy, lapsed payment</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3DD6C3]" />
              <span className="text-[#3DD6C3] text-[9px] font-medium">Outreach sent via push + iMessage</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReferralCard() {
  return (
    <div className="bg-[#1a1a2e] rounded-2xl p-4 md:p-5 shadow-2xl w-full max-w-sm">
      <div className="flex items-center gap-2.5 pb-3 border-b border-white/10 mb-4">
        <div className="w-7 h-7 rounded-full bg-[#0B93F6]/30 flex items-center justify-center">
          <span className="text-[#0B93F6] text-[9px] font-bold">M</span>
        </div>
        <span className="text-white/70 text-[11px] font-medium">Mike Johnson</span>
        <span className="ml-auto px-2 py-0.5 bg-[#0B93F6]/20 rounded text-[#0B93F6] text-[8px] font-medium">iMessage</span>
      </div>
      <div className="space-y-2.5">
        <div className="flex justify-start">
          <div className="bg-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[85%]">
            <p className="text-white/90 text-[11px] leading-snug">Hey Mike, Sarah connected us — would you be open to a couple quick questions?</p>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-[#0B93F6] rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-[60%]">
            <p className="text-white text-[11px] leading-snug">yeah sure</p>
          </div>
        </div>
        <div className="flex justify-start">
          <div className="bg-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[85%]">
            <p className="text-white/90 text-[11px] leading-snug">Perfect! Here&apos;s my calendar:</p>
            <p className="text-[#3DD6C3] text-[11px] underline mt-1">calendly.com/daniel</p>
          </div>
        </div>
      </div>
      <div className="flex justify-center mt-4">
        <div className="flex items-center gap-2 bg-[#3DD6C3]/15 border border-[#3DD6C3]/25 rounded-full px-4 py-1.5">
          <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[#3DD6C3] text-[10px] font-bold">Appointment Booked</span>
        </div>
      </div>
    </div>
  );
}

function RewriteCard() {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  return (
    <div className="bg-[#1a1a2e] rounded-2xl p-4 md:p-5 shadow-2xl space-y-3 w-full max-w-sm">
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-[#fdcc02]/20">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#fdcc02] flex items-center justify-center flex-shrink-0">
            <span className="text-sm">📱</span>
          </div>
          <div className="min-w-0">
            <p className="text-white/90 text-[11px] font-bold">AgentForLife</p>
            <p className="text-white/60 text-[10px] leading-snug mt-0.5">Your agent just found a better deal on your auto coverage. Book with them now.</p>
          </div>
        </div>
      </div>
      <div className="bg-white/5 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/80 text-[11px] font-bold">Aug 2026</span>
          <span className="text-white/30 text-[9px]">Policy anniversary</span>
        </div>
        <div className="grid grid-cols-7 gap-px text-center mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={`h-${i}`} className="text-white/25 text-[7px] font-medium">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px text-center">
          {days.map((d) => (
            <div key={d} className={`py-0.5 rounded text-[7px] ${d === 15 ? 'bg-[#fdcc02] text-[#0D4D4D] font-bold' : 'text-white/30'}`}>{d}</div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {['10:00 AM', '11:30 AM', '2:00 PM'].map((time, i) => (
          <div key={time} className={`py-2 px-3 rounded-lg border text-center ${i === 1 ? 'bg-[#3DD6C3]/15 border-[#3DD6C3]/30' : 'bg-white/5 border-white/5'}`}>
            <span className={`text-[10px] font-medium ${i === 1 ? 'text-[#3DD6C3]' : 'text-white/40'}`}>{time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   FEATURE DATA
   ═══════════════════════════════════════════════════ */

const FEATURES = [
  {
    headline: 'Zero clients lost to silence.',
    description: '7+ automated touchpoints per year — holidays, birthdays, anniversaries. When a policy slips, you forward one email. Your AI system identifies the client, sends personalized outreach with the carrier\'s number, and follows up until the policy is saved.',
    card: RetentionCard,
  },
  {
    headline: 'Referrals that book themselves.',
    description: 'Your client taps one button in their app. AI reaches out to the referral via iMessage, qualifies them with a few questions, and books directly on your calendar. You just show up.',
    card: ReferralCard,
  },
  {
    headline: 'Every anniversary is a booked appointment.',
    description: '30 days before every policy anniversary, your client gets a push notification offering a rate review. They tap, pick a time, and book themselves. Revenue you\'ve already earned the right to.',
    card: RewriteCard,
  },
];

const SETUP_STEPS = [
  { num: '1', title: 'Sign Up & Brand', desc: 'Add your photo, logo, and contact info. 5 minutes.' },
  { num: '2', title: 'Import Your Book', desc: 'CSV upload or paste a PDF — AI extracts everything.' },
  { num: '3', title: 'Share with Clients', desc: 'They download YOUR app with a unique code and get a personalized welcome text from you via iMessage.' },
  { num: '4', title: 'AI Takes Over', desc: 'Touchpoints, referrals, and conservation run on autopilot.' },
];

/* ═══════════════════════════════════════════════════
   SYSTEM SHOWCASE — merged branded app + solution path
   ═══════════════════════════════════════════════════ */

export function SystemShowcase() {
  const featuresRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { scrollYProgress } = useScroll({
    target: featuresRef,
    offset: ['start 60%', 'end 30%'],
  });

  /* Card crossfade opacities (desktop phone screen) */
  const videoOp = useTransform(scrollYProgress, [0, 0.12], [1, 0]);
  const card1Op = useTransform(scrollYProgress, [0, 0.12, 0.30, 0.38], [0, 1, 1, 0]);
  const card2Op = useTransform(scrollYProgress, [0.30, 0.38, 0.63, 0.71], [0, 1, 1, 0]);
  const card3Op = useTransform(scrollYProgress, [0.63, 0.71, 1, 1], [0, 1, 1, 1]);

  /* Connecting line */
  const lineOpacity = useTransform(scrollYProgress, [0, 0.05], [0, 1]);

  return (
    <section className="bg-[#0D4D4D] relative">
      {/* Background effects (overflow-hidden on this container, NOT the section, so sticky works) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#3DD6C3] rounded-full blur-[150px] opacity-15" />
        <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-[#fdcc02] rounded-full blur-[150px] opacity-10" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── Intro ─── */}
        <div className="text-center pt-20 md:pt-28 pb-12 md:pb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6">
              <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">The Difference Maker</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-5">
              Your Branded App. Your AI.{' '}<br className="hidden md:block" />
              <span className="text-[#3DD6C3]">Their Phone.</span>
            </h2>
            <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto">
              You&apos;re just a name in their contacts. <span className="text-white font-semibold">One app changes everything.</span>
            </p>
          </motion.div>

          {/* Mobile-only phone (video, scrolls away) */}
          <div className="lg:hidden flex justify-center mt-14 mb-4">
            <div className="relative">
              <div className="w-56 h-[450px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a]">
                <div className="w-full h-full bg-black rounded-[2rem] overflow-hidden">
                  <video
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    poster="/app-preview-poster.jpeg"
                  >
                    <source src="/app-preview.webm" type="video/webm" />
                    <source src="/app-preview.mp4" type="video/mp4" />
                  </video>
                </div>
              </div>
              <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-white/50 text-xs whitespace-nowrap">What your clients see</p>
            </div>
          </div>
        </div>

        {/* ─── Features area ─── */}
        <div className="lg:grid lg:grid-cols-[auto_1fr] lg:gap-16 pb-20 md:pb-28 relative">

          {/* Desktop: Sticky phone column */}
          <div className="hidden lg:block w-72">
            <div className="sticky top-32">
              <div className="w-72 h-[580px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
                <div className="w-full h-full bg-black rounded-[2.5rem] overflow-hidden relative">
                  {/* Video (visible before features scroll in) */}
                  <motion.div className="absolute inset-0" style={{ opacity: videoOp }}>
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                      poster="/app-preview-poster.jpeg"
                    >
                      <source src="/app-preview.webm" type="video/webm" />
                      <source src="/app-preview.mp4" type="video/mp4" />
                    </video>
                  </motion.div>
                  {/* Crossfading feature cards */}
                  <motion.div className="absolute inset-0 flex items-center justify-center p-2" style={{ opacity: card1Op }}>
                    <RetentionCard />
                  </motion.div>
                  <motion.div className="absolute inset-0 flex items-center justify-center p-2" style={{ opacity: card2Op }}>
                    <ReferralCard />
                  </motion.div>
                  <motion.div className="absolute inset-0 flex items-center justify-center p-2" style={{ opacity: card3Op }}>
                    <RewriteCard />
                  </motion.div>
                </div>
              </div>
              <p className="text-center text-white/50 text-sm mt-4">What your clients see</p>
            </div>
          </div>

          {/* Mobile: scroll line + waypoints */}
          <div className="absolute left-6 top-0 bottom-0 w-px lg:hidden pointer-events-none" aria-hidden="true">
            <motion.div
              className="w-full bg-gradient-to-b from-[#3DD6C3]/40 via-[#3DD6C3]/20 to-[#3DD6C3]/40 origin-top"
              style={{ height: '100%', scaleY: scrollYProgress }}
            />
          </div>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`mwp-${i}`}
              className="absolute left-6 -translate-x-1/2 z-10 lg:hidden"
              style={{ top: `${20 + i * 30}%` }}
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className="w-3 h-3 rounded-full bg-[#3DD6C3] shadow-[0_0_8px_rgba(61,214,195,0.4)]" />
            </motion.div>
          ))}

          {/* Desktop: connecting line between phone and features */}
          <div className="hidden lg:block absolute left-[304px] top-0 bottom-0 pointer-events-none" aria-hidden="true">
            <motion.div
              className="w-px h-full bg-gradient-to-b from-[#3DD6C3]/40 via-[#3DD6C3]/20 to-[#3DD6C3]/40 origin-top mx-auto"
              style={{ scaleY: scrollYProgress, opacity: lineOpacity }}
            />
          </div>

          {/* Feature nodes */}
          <div ref={featuresRef} className="space-y-16 md:space-y-24 pl-10 lg:pl-0">
            {/* Section header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-[#3DD6C3] font-bold text-sm tracking-widest uppercase mb-3">One System</p>
              <h3 className="text-2xl md:text-3xl font-extrabold text-white">
                Three ways to grow your income —<br className="hidden md:block" /> all on autopilot.
              </h3>
            </motion.div>

            {/* Individual features */}
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.headline}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-[#3DD6C3]/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#3DD6C3] text-sm font-bold">{i + 1}</span>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-[#3DD6C3]/20 to-transparent" />
                </div>
                <h4 className="text-2xl md:text-3xl font-extrabold text-white mb-4">{feature.headline}</h4>
                <p className="text-white/60 text-base md:text-lg leading-relaxed">{feature.description}</p>
                {/* Card — mobile only */}
                <div className="lg:hidden mt-8 flex justify-center">
                  <feature.card />
                </div>
              </motion.div>
            ))}

            {/* Footer tagline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-xl md:text-2xl font-extrabold text-white">
                Retention + Referrals + Rewrites.
              </p>
              <p className="text-white/60 text-lg mt-2">
                That&apos;s how you <span className="text-[#3DD6C3] font-bold">3x</span>.
              </p>
            </motion.div>
          </div>
        </div>

        {/* ─── Setup steps ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto pb-16">
          {SETUP_STEPS.map((step) => (
            <div key={step.num} className="text-center">
              <div className="w-10 h-10 bg-[#3DD6C3] rounded-full flex items-center justify-center text-lg font-bold text-white mx-auto mb-3">{step.num}</div>
              <h4 className="text-white font-bold text-sm mb-1">{step.title}</h4>
              <p className="text-white/50 text-xs leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* ─── CTA ─── */}
        <div className="text-center pb-20 md:pb-28">
          <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg font-bold rounded-full transition-all shadow-lg shadow-[#fdcc02]/30">
            Put Your App on Their Phone
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

