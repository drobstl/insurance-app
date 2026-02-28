'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

const IMESSAGE_DELAYS = [900, 1100, 900, 1300, 900, 500, 1100];

const FAQ_ITEMS = [
  { question: 'What exactly is Agent for Life?', answer: 'A complete client relationship system for insurance agents. You get a branded mobile app for your clients, automated touchpoints (holidays, birthdays, anniversaries), one-tap referrals with an AI assistant that qualifies leads via iMessage and books appointments, conservation alerts that rescue at-risk policies, and anniversary rewrite alerts — normally $49/month, but free for life for founding members.' },
  { question: 'How hard is it to get started?', answer: 'You can be live in 10 minutes. Import your clients via CSV or upload PDF applications — AI extracts everything. Enable the referral assistant with one toggle and share your app code with clients.' },
  { question: 'What carriers does it work with?', answer: 'All of them. Agent for Life is carrier-agnostic. Works for independent agents regardless of which carriers you\'re appointed with.' },
  { question: 'What do Founding Members get?', answer: 'Free access for life ($49/mo value), your own branded client app, direct line to the founder, your feedback shapes the roadmap, early access to every new feature, and "Founding Member" status. Only 50 spots total — no credit card required.' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function MobileLandingV2() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showBottomCta, setShowBottomCta] = useState(false);
  const [msgStep, setMsgStep] = useState(-1);

  const heroRef = useRef<HTMLElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatTriggered = useRef(false);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setShowBottomCta(!e.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && !chatTriggered.current) { chatTriggered.current = true; setMsgStep(0); } },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (msgStep < 0 || msgStep >= IMESSAGE_DELAYS.length) return;
    const t = setTimeout(() => setMsgStep(s => s + 1), IMESSAGE_DELAYS[msgStep]);
    return () => clearTimeout(t);
  }, [msgStep]);

  const msgFade = (step: number): React.CSSProperties => ({
    opacity: msgStep >= step ? 1 : 0,
    transform: msgStep >= step ? 'translateY(0)' : 'translateY(10px)',
    transition: 'all 450ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  });

  const spots = spotsRemaining ?? 50;

  return (
    <div className="min-h-screen bg-[#0D4D4D] overflow-x-hidden">

      {/* ═══════════════════════════════════════════════════
         HERO — The Hook
         ═══════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative min-h-[100svh] flex flex-col justify-between px-6 pt-14 pb-8 overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[160px] opacity-20" />
          <div className="absolute bottom-20 -right-20 w-[250px] h-[250px] bg-[#fdcc02] rounded-full blur-[140px] opacity-[0.08]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.06]" />
        </div>
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="relative z-10 flex flex-col flex-1">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-2 mb-auto"
          >
            <img src="/logo.png" alt="AgentForLife" className="w-[44px] h-[25px] object-contain" />
            <span className="text-white/80 brand-title text-base">AgentForLife</span>
          </motion.div>

          {/* Main content */}
          <div className="flex-1 flex flex-col justify-center -mt-8">
            {/* Spots badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-6"
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#fdcc02]/15 border border-[#fdcc02]/25 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-[#fdcc02] opacity-75" />
                  <span className="relative rounded-full h-2 w-2 bg-[#fdcc02]" />
                </span>
                <span className="text-[#fdcc02] font-bold text-xs tracking-wide">
                  {spotsRemaining !== null ? `${spots} of 50 Free Spots Left` : 'Free Lifetime Spots Open'}
                </span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-[2rem] leading-[1.1] font-extrabold text-white mb-5 tracking-tight"
            >
              Chargebacks happen{' '}
              <br />
              when clients forget{' '}
              <br />
              <span className="text-[#3DD6C3]">you exist.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="text-white/50 text-[15px] leading-relaxed mb-8 max-w-[300px]"
            >
              We built a system that makes sure they never do. Automated retention. AI&#8209;powered referrals. Complete autopilot.
            </motion.p>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <Link
                href="/founding-member"
                className="inline-flex items-center gap-2.5 px-7 py-4 bg-[#fdcc02] text-[#0D4D4D] text-base font-bold rounded-full shadow-lg shadow-[#fdcc02]/25 active:scale-[0.97] transition-transform"
              >
                Lock In My Free Spot
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
              <p className="text-white/30 mt-4 text-xs">
                {spotsRemaining !== null ? `${spots} spots left` : 'Limited spots'} · $0 forever · No credit card
              </p>
            </motion.div>
          </div>
        </div>

        {/* Scroll hint */}
        <motion.div
          className="relative z-10 flex justify-center"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg className="w-5 h-5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" /></svg>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         THE PROBLEM — Three Pain Points
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-white px-6 py-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
          className="space-y-10"
        >
          <motion.div variants={fadeUp} custom={0}>
            <p className="text-red-400 font-bold text-[11px] uppercase tracking-[0.15em] mb-3">The uncomfortable truth</p>
            <h2 className="text-[1.65rem] font-extrabold text-[#0D4D4D] leading-tight">
              Here&apos;s what&apos;s costing you money right now.
            </h2>
          </motion.div>

          {[
            { num: '01', title: 'Silence.', body: 'After the close, you become a name they\'ll never call. Then a lapse notice hits — and a chargeback follows.', accent: '#FF5F57' },
            { num: '02', title: 'Dead referrals.', body: 'You ask clients to refer friends. They say "sure." They never do. The few who try? The lead goes cold.', accent: '#FEBC2E' },
            { num: '03', title: 'Missed rewrites.', body: 'Every policy anniversary is a lay-down sale. With no system to flag it, the carrier auto-renews and you miss out.', accent: '#fdcc02' },
          ].map((card, i) => (
            <motion.div
              key={card.num}
              variants={fadeUp}
              custom={0.1 + i * 0.08}
              className="flex gap-4"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${card.accent}15` }}>
                <span className="text-xs font-black" style={{ color: card.accent }}>{card.num}</span>
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#0D4D4D] mb-1">{card.title}</h3>
                <p className="text-[#6B7280] text-[14px] leading-relaxed">{card.body}</p>
              </div>
            </motion.div>
          ))}

          <motion.div variants={fadeUp} custom={0.4} className="pt-2">
            <p className="text-xl font-extrabold text-[#0D4D4D]">
              We built a system that{' '}
              <span className="text-[#3DD6C3]">fixes all three</span>.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         THE SYSTEM — Three Revenue Streams
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#070E1B] px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 -left-20 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[180px] opacity-[0.08]" />
          <div className="absolute bottom-0 -right-10 w-[200px] h-[200px] bg-[#fdcc02] rounded-full blur-[120px] opacity-[0.06]" />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
          className="relative space-y-6"
        >
          <motion.div variants={fadeUp} custom={0} className="mb-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-full mb-4">
              <span className="text-[#3DD6C3] font-bold text-[11px] uppercase tracking-wide">The System</span>
            </div>
            <h2 className="text-[1.65rem] font-extrabold text-white leading-tight mb-2">
              One System.<br />Three Revenue Streams.
            </h2>
            <p className="text-white/40 text-[14px]">A branded app on their phone. An AI that never sleeps.</p>
          </motion.div>

          {[
            {
              icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
              title: 'Retention',
              stat: '7+',
              statLabel: 'touchpoints/yr',
              desc: 'Automated holiday cards, birthdays, and push notifications. When a policy slips, AI reaches out within hours.',
              accent: '#3DD6C3',
            },
            {
              icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
              title: 'Referrals',
              stat: '~99%',
              statLabel: 'read rate',
              desc: 'One-tap referral from your app. AI texts via iMessage, qualifies the lead, and books them on your calendar.',
              accent: '#fdcc02',
            },
            {
              icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
              title: 'Rewrites',
              stat: '24-48h',
              statLabel: 'to booked',
              desc: 'At each policy anniversary, your client gets a notification with a rate review offer and books themselves.',
              accent: '#3DD6C3',
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              custom={0.1 + i * 0.1}
              className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-white/[0.08]"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${f.accent}15` }}>
                    <svg className="w-5 h-5" style={{ color: f.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.icon} /></svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-white">{f.title}</h3>
                    <div className="h-0.5 w-8 rounded-full mt-1" style={{ backgroundColor: f.accent }} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black" style={{ color: f.accent }}>{f.stat}</p>
                  <p className="text-[10px] text-white/30 uppercase tracking-wide">{f.statLabel}</p>
                </div>
              </div>
              <p className="text-white/50 text-[14px] leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         AI REFERRAL DEMO — The Wow Moment
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#0D4D4D] px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[250px] h-[250px] bg-[#3DD6C3] rounded-full blur-[150px] opacity-[0.1]" />
        </div>

        <div className="relative space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#fdcc02]/15 border border-[#fdcc02]/25 rounded-full mb-4">
              <svg className="w-3.5 h-3.5 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span className="text-white font-bold text-[11px] uppercase tracking-wide">AI Referrals</span>
            </div>
            <h2 className="text-[1.65rem] font-extrabold text-white leading-tight mb-2">
              From one tap to<br />booked appointment.
            </h2>
            <p className="text-white/40 text-[14px] leading-relaxed">
              Your client taps &ldquo;Refer.&rdquo; AI handles the conversation via iMessage. You show up and close.
            </p>
          </motion.div>

          {/* Steps */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="flex gap-3"
          >
            {[
              { num: '1', label: 'Client taps "Refer"', color: '#fdcc02' },
              { num: '2', label: 'AI qualifies via iMessage', color: '#3DD6C3' },
              { num: '3', label: 'Appointment booked', color: '#fdcc02' },
            ].map((s) => (
              <motion.div
                key={s.num}
                variants={fadeUp}
                custom={0}
                className="flex-1 text-center"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2 text-[#0D4D4D] text-xs font-bold" style={{ backgroundColor: s.color }}>
                  {s.num}
                </div>
                <p className="text-white/60 text-[11px] font-medium leading-snug">{s.label}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* iMessage mockup */}
          <div ref={chatRef}>
            <div className="bg-[#1a1a2e] rounded-[1.75rem] p-1 shadow-2xl border border-[#3DD6C3]/15">
              {/* Status bar */}
              <div className="bg-[#111] rounded-t-[1.5rem] px-4 pt-2.5 pb-2 flex items-center justify-between">
                <span className="text-white/40 text-[10px] font-medium">9:44 AM</span>
                <div className="flex gap-0.5">
                  <div className="w-1 h-2 bg-white/40 rounded-sm" />
                  <div className="w-1 h-2.5 bg-white/40 rounded-sm" />
                  <div className="w-1 h-3 bg-white/40 rounded-sm" />
                </div>
              </div>
              {/* Chat header */}
              <div className="bg-[#111] px-4 pb-2.5 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#005851] flex items-center justify-center">
                    <span className="text-[#3DD6C3] text-xs font-bold">D</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">Daniel</p>
                    <p className="text-white/30 text-[10px]">AI Referral Assistant</p>
                  </div>
                </div>
              </div>
              {/* Messages */}
              <div className="bg-[#111] px-3.5 py-4 space-y-2.5 rounded-b-[1.5rem] min-h-[280px]">
                <div className="flex justify-end" style={msgFade(0)}>
                  <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[85%]">
                    <p className="text-white text-[12.5px] leading-relaxed">Hey Mike, Sarah connected us — I helped her family get protected and she thought I might be able to help you too. Open to a couple quick questions?</p>
                  </div>
                </div>
                <div className="flex justify-start" style={msgFade(1)}>
                  <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[65%]">
                    <p className="text-white text-[12.5px]">yeah sure</p>
                  </div>
                </div>
                <div className="flex justify-end" style={msgFade(2)}>
                  <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[85%]">
                    <p className="text-white text-[12.5px] leading-relaxed">What matters most to you when it comes to protecting your family?</p>
                  </div>
                </div>
                <div className="flex justify-start" style={msgFade(3)}>
                  <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                    <p className="text-white text-[12.5px]">making sure my wife and kids are covered if something happens</p>
                  </div>
                </div>
                <div className="flex justify-end" style={msgFade(4)}>
                  <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[85%]">
                    <p className="text-white text-[12.5px] leading-relaxed">Really appreciate that. A quick 15-min call would be worth it. Here&apos;s my calendar:</p>
                    <p className="text-[#3DD6C3] text-[12.5px] mt-1 underline" style={msgFade(5)}>calendly.com/daniel</p>
                  </div>
                </div>
                <div className="flex justify-center pt-2" style={msgFade(6)}>
                  <div className="flex items-center gap-2 bg-[#3DD6C3]/15 border border-[#3DD6C3]/25 rounded-full px-4 py-1.5">
                    <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    <span className="text-[#3DD6C3] text-[10px] font-bold">Appointment Booked</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-center text-white/25 text-[11px] mt-3">The referral thinks they&apos;re texting you.</p>
          </div>

          {/* Follow-up badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            {['Day 2 · Gentle nudge', 'Day 5 · New angle', 'Day 8 · Direct ask'].map((d, i) => (
              <span key={d} className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${i === 2 ? 'bg-[#fdcc02]/20 border border-[#fdcc02]/30 text-[#fdcc02]' : 'bg-white/10 text-white/50'}`}>{d}</span>
            ))}
          </div>
          <p className="text-white/30 text-[11px] text-center">If they don&apos;t reply, AI follows up automatically.</p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         RETENTION — How It Keeps Clients
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#F8F9FA] px-6 py-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
          className="space-y-8"
        >
          <motion.div variants={fadeUp} custom={0}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full mb-4">
              <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              <span className="text-[#0D4D4D] font-bold text-[11px] uppercase tracking-wide">Retention</span>
            </div>
            <h2 className="text-[1.65rem] font-extrabold text-[#0D4D4D] leading-tight mb-2">
              Never lose a client to silence again.
            </h2>
            <p className="text-[#6B7280] text-[14px] leading-relaxed">Two layers of protection. Zero effort from you.</p>
          </motion.div>

          {/* Prevention layer */}
          <motion.div variants={fadeUp} custom={0.1} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-[#3DD6C3]/10 flex items-center justify-center">
                <span className="text-[#3DD6C3] text-[10px] font-black">1</span>
              </div>
              <p className="text-[#0D4D4D] font-bold text-sm">Prevention</p>
            </div>
            <p className="text-[#6B7280] text-[13px] leading-relaxed mb-4">7+ personalized touchpoints per year — holidays, birthdays, anniversaries — all as push notifications, completely automatic.</p>
            {/* Mini holiday preview */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {[
                { emoji: '🎄', label: 'Christmas', bg: '#C41E3A' },
                { emoji: '🎆', label: 'New Year', bg: '#162D6E' },
                { emoji: '💝', label: "Valentine's", bg: '#D63B5C' },
                { emoji: '🇺🇸', label: '4th of July', bg: '#002868' },
                { emoji: '🍂', label: 'Thanksgiving', bg: '#BF6A20' },
              ].map((h) => (
                <div key={h.label} className="flex-shrink-0 w-16 rounded-xl p-2 text-center" style={{ backgroundColor: h.bg }}>
                  <span className="text-lg">{h.emoji}</span>
                  <p className="text-white/80 text-[7px] font-medium mt-0.5">{h.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Rescue layer */}
          <motion.div variants={fadeUp} custom={0.2} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center">
                <span className="text-red-400 text-[10px] font-black">2</span>
              </div>
              <p className="text-[#0D4D4D] font-bold text-sm">Rescue</p>
            </div>
            <p className="text-[#6B7280] text-[13px] leading-relaxed">When a policy lapses, forward the carrier email. AI extracts the info, matches your records, and sends personalized outreach within hours. Follows up on Day 2, 5, and 7.</p>
          </motion.div>

          <motion.p variants={fadeUp} custom={0.3} className="text-[#6B7280]/60 text-[13px] italic text-center">
            Your AI doesn&apos;t sleep. Or take lunch. Or forget to follow up.
          </motion.p>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         CLIENT APP — Phone Mockup
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#070E1B] px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[180px] opacity-[0.06]" />
        </div>
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-full mb-4">
              <span className="text-[#3DD6C3] font-bold text-[11px] uppercase tracking-wide">Your Branded App</span>
            </div>
            <h2 className="text-[1.65rem] font-extrabold text-white leading-tight mb-2">
              On every client&apos;s phone.
            </h2>
            <p className="text-white/40 text-[14px]">Your name. Your brand. Their policies. One tap away.</p>
          </motion.div>

          {/* Phone mockup */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex justify-center mb-8"
          >
            <div className="relative">
              <div className="w-[220px] h-[440px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a]">
                <div className="absolute -inset-1.5 rounded-[2.8rem] bg-gradient-to-b from-[#3DD6C3]/15 via-transparent to-[#fdcc02]/10 pointer-events-none blur-sm" />
                <div className="w-full h-full bg-[#111] rounded-[2rem] overflow-hidden px-3.5 py-5 relative">
                  {/* Agent info */}
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-9 h-9 rounded-full bg-[#005851] flex items-center justify-center">
                      <span className="text-[#3DD6C3] text-[11px] font-bold">D</span>
                    </div>
                    <div>
                      <p className="text-white text-[11px] font-semibold">Daniel Roberts</p>
                      <p className="text-white/35 text-[8px]">Roberts Insurance Agency</p>
                    </div>
                  </div>
                  {/* App content */}
                  <div className="space-y-2.5">
                    <div className="bg-white/[0.08] rounded-xl p-2.5 border border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🎄</span>
                        <div>
                          <p className="text-white/90 text-[9px] font-bold">Merry Christmas!</p>
                          <p className="text-white/40 text-[7px]">Tap to view your card</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white/[0.08] rounded-xl p-2.5 border border-white/5">
                      <p className="text-white/30 text-[7px] uppercase tracking-wider mb-1.5">Your Policies</p>
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-[9px]">Auto — State Farm</span>
                        <span className="text-[#3DD6C3] text-[7px] font-semibold">Active</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-white/70 text-[9px]">Life — Mutual of Omaha</span>
                        <span className="text-[#3DD6C3] text-[7px] font-semibold">Active</span>
                      </div>
                    </div>
                    <div className="bg-[#fdcc02] rounded-xl py-2.5 text-center">
                      <p className="text-[#0D4D4D] text-[10px] font-bold">Refer a Friend</p>
                    </div>
                    <div className="bg-[#005851] rounded-xl py-2.5 text-center">
                      <p className="text-white text-[10px] font-bold">Contact Daniel</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Feature pills */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="flex flex-wrap justify-center gap-2"
          >
            {[
              { label: 'Push notifications', icon: '🔔' },
              { label: 'One-tap referrals', icon: '🤝' },
              { label: 'Policy views', icon: '📋' },
              { label: 'Holiday cards', icon: '🎄' },
              { label: 'Agent contact', icon: '📞' },
            ].map((pill) => (
              <motion.div
                key={pill.label}
                variants={fadeUp}
                custom={0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full"
              >
                <span className="text-[11px]">{pill.icon}</span>
                <span className="text-white/50 text-[11px] font-medium">{pill.label}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Platform badges */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <div className="flex items-center gap-1.5 text-white/30 text-[11px] font-medium">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              iPhone
            </div>
            <span className="text-white/15">+</span>
            <div className="flex items-center gap-1.5 text-white/30 text-[11px] font-medium">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.34c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm-11.046 0c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm11.405-6.02l1.9-3.46c.11-.2.04-.44-.15-.56-.2-.11-.44-.04-.56.15l-1.92 3.49C15.46 8.38 13.55 7.75 12 7.75s-3.46.63-5.14 1.72L4.94 5.98c-.12-.19-.36-.26-.56-.15-.19.12-.26.36-.15.56l1.9 3.46C2.64 11.96.34 15.55 0 19.8h24c-.34-4.25-2.64-7.84-6.12-9.48z"/></svg>
              Android
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         THE MATH — ROI
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#0D4D4D] px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[200px] h-[200px] bg-red-500 rounded-full blur-[120px] opacity-10" />
          <div className="absolute bottom-0 right-0 w-[200px] h-[200px] bg-[#3DD6C3] rounded-full blur-[120px] opacity-10" />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
          className="relative space-y-6"
        >
          <motion.div variants={fadeUp} custom={0} className="text-center">
            <h2 className="text-[1.65rem] font-extrabold text-white leading-tight mb-2">
              The math is <span className="text-[#3DD6C3]">undeniable</span>.
            </h2>
            <p className="text-white/40 text-[14px]">One saved policy. One referral. That&apos;s all it takes.</p>
          </motion.div>

          <div className="grid grid-cols-2 gap-3">
            <motion.div
              variants={fadeUp}
              custom={0.1}
              className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 text-center backdrop-blur-sm"
            >
              <p className="text-red-400 font-semibold text-[10px] uppercase tracking-wide mb-2">1 Canceled Policy</p>
              <p className="text-4xl font-black text-red-400 mb-1">$1,200</p>
              <p className="text-red-400/50 text-[11px]">avg annual value lost</p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              custom={0.15}
              className="bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-2xl p-5 text-center backdrop-blur-sm"
            >
              <p className="text-[#3DD6C3] font-semibold text-[10px] uppercase tracking-wide mb-2">Agent for Life</p>
              <p className="text-4xl font-black text-[#fdcc02] mb-1">$0</p>
              <p className="text-[#3DD6C3]/50 text-[11px]">free as Founding Member</p>
            </motion.div>
          </div>

          <motion.div
            variants={fadeUp}
            custom={0.2}
            className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#fdcc02]/15 rounded-full mb-3">
              <svg className="w-3.5 h-3.5 text-[#fdcc02]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span className="text-[#fdcc02] font-bold text-[11px] uppercase">Instant ROI</span>
            </div>
            <p className="text-white font-extrabold text-lg leading-snug">
              Every save and every referral is{' '}
              <span className="text-[#fdcc02]">pure profit</span>.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         HOW IT WORKS — Four Steps
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-white px-6 py-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
          className="space-y-8"
        >
          <motion.div variants={fadeUp} custom={0} className="text-center">
            <h2 className="text-[1.65rem] font-extrabold text-[#0D4D4D] leading-tight mb-2">
              Up and running in{' '}<span className="text-[#3DD6C3]">10 minutes</span>.
            </h2>
            <p className="text-[#6B7280] text-[14px]">No complex setup. No IT department.</p>
          </motion.div>

          <div className="space-y-4">
            {[
              { num: '1', title: 'Sign Up & Brand', desc: 'Add your photo, logo, and scheduling link. Instantly branded to you.', color: '#3DD6C3' },
              { num: '2', title: 'Import Your Book', desc: 'Upload CSV or drop in a PDF — AI extracts clients, policies, and beneficiaries.', color: '#fdcc02' },
              { num: '3', title: 'Share with Clients', desc: 'They download your app with a unique code. Personalized welcome notification.', color: '#3DD6C3' },
              { num: '4', title: 'AI Takes Over', desc: 'Touchpoints, referral follow-ups, conservation alerts — all on autopilot.', color: '#fdcc02' },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                variants={fadeUp}
                custom={0.05 + i * 0.06}
                className="flex items-start gap-4"
              >
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-10 h-10 bg-[#0D4D4D] rounded-xl flex items-center justify-center">
                    <span className="text-base font-bold" style={{ color: step.color }}>{step.num}</span>
                  </div>
                  {i < 3 && <div className="w-px h-6 bg-[#3DD6C3]/20 mt-1" />}
                </div>
                <div className="pt-1.5">
                  <h3 className="text-base font-bold text-[#0D4D4D] mb-0.5">{step.title}</h3>
                  <p className="text-[#6B7280] text-[13px] leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeUp} custom={0.3} className="flex justify-center pt-2">
            <Link
              href="/founding-member"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#fdcc02] text-[#0D4D4D] text-base font-bold rounded-full shadow-lg shadow-[#fdcc02]/20 active:scale-[0.97] transition-transform"
            >
              Get Started Free
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         TRUST STRIP
         ═══════════════════════════════════════════════════ */}
      <section className="bg-[#F8F9FA] px-6 py-12">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h3 className="text-center text-sm font-bold text-[#0D4D4D] mb-6">
            Built for <span className="text-[#3DD6C3]">trust</span>
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', label: 'Your Data' },
              { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Encrypted' },
              { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Opt-In Only' },
              { icon: 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z', label: 'No Lock-In' },
              { icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', label: 'All Carriers' },
              { icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Cancel Anytime' },
            ].map((t) => (
              <div key={t.label} className="text-center p-2">
                <div className="w-9 h-9 bg-[#0D4D4D]/5 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} /></svg>
                </div>
                <p className="text-[11px] font-semibold text-[#0D4D4D]">{t.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         PRICING — Founding Member Focus
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-white px-6 py-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
          className="space-y-6"
        >
          <motion.div variants={fadeUp} custom={0} className="text-center">
            <h2 className="text-[1.65rem] font-extrabold text-[#0D4D4D] leading-tight mb-2">
              This will cost <span className="line-through text-[#6B7280]/50">$49/mo</span>.<br />
              <span className="text-[#3DD6C3]">But not for you.</span>
            </h2>
            <p className="text-[#6B7280] text-[14px]">150 early spots across 3 tiers, then gone forever.</p>
          </motion.div>

          {/* Founding Member card — featured */}
          <motion.div
            variants={fadeUp}
            custom={0.1}
            className="relative bg-white rounded-2xl border-2 border-[#a158ff] p-6 text-center shadow-lg shadow-[#a158ff]/10"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-3 py-1 bg-[#a158ff] text-white text-[11px] font-bold rounded-full">NOW OPEN</span>
            </div>
            <p className="text-[#6B7280] font-medium text-sm mt-1 mb-1">Founding Members</p>
            <p className="text-4xl font-black text-[#0D4D4D] mb-0.5">FREE</p>
            <p className="text-[#a158ff] font-semibold text-sm mb-1">For Life</p>
            <p className="text-[#6B7280] text-xs line-through mb-0.5">$49/mo</p>
            <p className="text-[#6B7280] text-xs mb-3">50 spots — then gone forever</p>
            {spotsRemaining !== null && (
              <div className="mb-4">
                <div className="w-full bg-[#a158ff]/10 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-[#a158ff] rounded-full transition-all duration-1000" style={{ width: `${((50 - spots) / 50) * 100}%` }} />
                </div>
                <p className="text-[11px] text-[#a158ff] font-bold mt-1.5">{spots} spots remaining</p>
              </div>
            )}
            <Link href="/founding-member" className="block w-full py-3.5 bg-[#a158ff] text-white text-sm font-bold rounded-xl active:scale-[0.97] transition-transform">
              Apply Now
            </Link>
          </motion.div>

          {/* Other tiers — compact */}
          <motion.div variants={fadeUp} custom={0.2} className="grid grid-cols-3 gap-2">
            {[
              { tier: 'Charter', price: '$25', note: 'Next', border: 'border-[#3DD6C3]' },
              { tier: 'Inner Circle', price: '$35', note: 'After', border: 'border-gray-200' },
              { tier: 'Standard', price: '$49', note: 'Full Price', border: 'border-gray-200' },
            ].map((t) => (
              <div key={t.tier} className={`rounded-xl border ${t.border} p-3 text-center`}>
                <p className="text-[10px] text-[#6B7280] font-medium mb-0.5">{t.tier}</p>
                <p className="text-lg font-black text-[#0D4D4D]">{t.price}</p>
                <p className="text-[9px] text-[#6B7280]">/mo · {t.note}</p>
              </div>
            ))}
          </motion.div>

          <motion.p variants={fadeUp} custom={0.3} className="text-center text-[#6B7280] text-[12px]">
            No contracts · Lock in your price for life · Cancel anytime
          </motion.p>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         FAQ
         ═══════════════════════════════════════════════════ */}
      <section className="bg-[#F8F9FA] px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="space-y-3"
        >
          <h2 className="text-xl font-extrabold text-[#0D4D4D] mb-6">
            Questions<span className="text-[#3DD6C3]">?</span>
          </h2>

          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-5 py-4 text-left flex items-center justify-between gap-3"
                aria-expanded={openFaq === i}
              >
                <span className="text-[14px] font-semibold text-[#0D4D4D] leading-snug">{item.question}</span>
                <svg className={`w-4 h-4 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-[400px]' : 'max-h-0'}`}>
                <div className="px-5 pb-4">
                  <p className="text-[#6B7280] text-[13px] leading-relaxed">{item.answer}</p>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         FINAL CTA
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#0D4D4D] px-6 py-20 pb-32 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[250px] h-[250px] bg-[#3DD6C3] rounded-full blur-[120px] opacity-15" />
          <div className="absolute bottom-0 right-1/4 w-[200px] h-[200px] bg-[#fdcc02] rounded-full blur-[100px] opacity-10" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative text-center space-y-6"
        >
          <p className="text-white/30 text-[11px] uppercase tracking-[0.2em] font-medium">Stop leaving money on the table</p>
          <h2 className="text-[1.75rem] font-extrabold text-white leading-tight">
            Your competitors aren&apos;t reading this.{' '}
            <span className="text-[#fdcc02]">They&apos;re losing clients.</span>
          </h2>
          <p className="text-white/40 text-[14px] leading-relaxed max-w-[300px] mx-auto">
            Lock in your free lifetime spot. No credit card. No risk. A system that pays for itself from day one.
          </p>
          <Link
            href="/founding-member"
            className="inline-flex items-center gap-2.5 px-8 py-4 bg-[#fdcc02] text-[#0D4D4D] text-base font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 active:scale-[0.97] transition-transform"
          >
            Lock In My Free Lifetime Spot
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/25 text-xs">
            {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} · $0 forever
          </p>
        </motion.div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="bg-[#0D4D4D] border-t border-white/5 px-6 py-8 pb-24">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="AgentForLife" className="w-10 h-6 object-contain" />
            <span className="text-lg text-white brand-title">AgentForLife</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-5">
            <Link href="/login" className="text-white/40 text-[12px]">Login</Link>
            <a href="mailto:support@agentforlife.app" className="text-white/40 text-[12px]">Contact</a>
            <Link href="/privacy" className="text-white/40 text-[12px]">Privacy</Link>
            <Link href="/terms" className="text-white/40 text-[12px]">Terms</Link>
          </nav>
          <p className="text-white/25 text-[11px]">&copy; 2026 AgentForLife</p>
        </div>
      </footer>

      {/* ══════════ STICKY BOTTOM CTA ══════════ */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${showBottomCta ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-[#0D4D4D]/95 backdrop-blur-md border-t border-white/10 px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute h-full w-full rounded-full bg-[#3DD6C3] opacity-75" />
              <span className="relative rounded-full h-2 w-2 bg-[#3DD6C3]" />
            </span>
            <span className="text-white text-[13px] font-semibold truncate">
              {spotsRemaining !== null
                ? <><span className="text-[#fdcc02]">{spots}</span> free spots left</>
                : 'Free spots available'}
            </span>
          </div>
          <Link
            href="/founding-member"
            className="flex-shrink-0 px-5 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-[13px] font-bold rounded-full active:scale-[0.97] transition-transform"
          >
            Claim Free Spot
          </Link>
        </div>
      </div>
    </div>
  );
}
