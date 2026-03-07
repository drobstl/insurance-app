'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const HOLIDAYS: Record<string, { gradient: string; emoji: string; label: string; greeting: string; body: string; floatingEmoji: string[]; accent: string }> = {
  christmas: { gradient: 'linear-gradient(135deg, #8B0000, #C41E3A, #A0153E)', emoji: '🎄', label: 'Christmas', greeting: 'Merry Christmas, Sarah!', body: 'Wishing you and your family a season full of warmth, joy, and time together.', floatingEmoji: ['❄️', '🎄', '⭐'], accent: '#D4A843' },
  newyear: { gradient: 'linear-gradient(135deg, #0B1A3E, #162D6E, #1A3A8A)', emoji: '🎆', label: "New Year\u2019s", greeting: 'Happy New Year, Sarah!', body: "Here\u2019s to a fresh start and a year full of good things.", floatingEmoji: ['🎆', '✨', '🎇'], accent: '#C0C0C0' },
  valentines: { gradient: 'linear-gradient(135deg, #9B1B30, #D63B5C, #E8839B)', emoji: '💝', label: "Valentine\u2019s", greeting: "Happy Valentine\u2019s Day, Sarah!", body: 'Today is all about the people who matter most.', floatingEmoji: ['❤️', '💕', '💖'], accent: '#FFB6C1' },
  july4th: { gradient: 'linear-gradient(135deg, #002868, #BF0A30, #002868)', emoji: '🇺🇸', label: '4th of July', greeting: 'Happy 4th of July, Sarah!', body: 'Wishing you a day full of good food, great company, and fireworks.', floatingEmoji: ['🇺🇸', '🎆', '⭐'], accent: '#FFFFFF' },
  thanksgiving: { gradient: 'linear-gradient(135deg, #8B4513, #BF6A20, #D4892A)', emoji: '🍂', label: 'Thanksgiving', greeting: 'Happy Thanksgiving, Sarah!', body: "I\u2019m grateful for the trust you place in me.", floatingEmoji: ['🍂', '🍁', '🍃'], accent: '#DAA520' },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function RetentionDeepDiveDesktop() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [activeHoliday, setActiveHoliday] = useState('christmas');

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); })
      .catch(() => {});
  }, []);

  const spots = spotsRemaining ?? 50;
  const holiday = HOLIDAYS[activeHoliday];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Desktop Nav — always visible */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="w-full px-8 lg:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="flex items-center gap-2 text-[#0D4D4D] hover:text-[#3DD6C3] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-semibold">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife" className="w-[36px] h-[20px] object-contain" />
              <span className="text-[#4B5563] brand-title text-sm">AgentForLife</span>
            </div>
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 text-[#0D4D4D] font-bold text-sm tracking-wide uppercase">
            Automated Retention
          </span>
          <Link
            href="/founding-member"
            className="px-6 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full hover:bg-[#fdcc02]/85 hover:scale-[1.03] transition-all"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero — full-width 2-column */}
      <section className="w-full bg-[#3DD6C3] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #0D4D4D 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative w-full px-8 lg:px-16 xl:px-24">
          <div className="grid grid-cols-2 gap-16 items-center py-24 lg:py-28">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-xl"
            >
              <div className="flex flex-wrap items-center gap-3 mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D4D4D]/15 rounded-full">
                  <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">Automated Retention</span>
                </div>
                <div className="inline-flex items-center gap-3 px-4 py-2 bg-[#0D4D4D]/10 rounded-full">
                  <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#007AFF]" /><span className="text-[#0D4D4D] font-bold text-xs">Blue Bubbles</span></span>
                  <span className="text-[#0D4D4D]/30">+</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#34C759]" /><span className="text-[#0D4D4D] font-bold text-xs">Green Bubbles</span></span>
                </div>
              </div>
              <h1 className="text-5xl xl:text-6xl font-extrabold text-[#0D4D4D] leading-[1.08] mb-7">
                Two layers of<br />
                protection.<br />
                Zero effort.
              </h1>
              <p className="text-[#0D4D4D]/70 text-xl leading-relaxed max-w-lg mb-10">
                First, automated touchpoints prevent churn before it starts. Then, if a policy still slips &mdash; AI catches it and fights to save it.
              </p>
              <Link
                href="/founding-member"
                className="inline-flex items-center gap-3 px-8 py-4 bg-[#0D4D4D] text-white text-base font-bold rounded-full hover:bg-[#070E1B] hover:scale-[1.02] transition-all shadow-xl"
              >
                Start Protecting Clients
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex justify-center items-start gap-6"
            >
              <div className="w-[240px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform -rotate-3 hover:rotate-0 transition-transform duration-300">
                <img src="/screenshot-retention-message.png" alt="Conservation message" className="w-full h-auto block" />
              </div>
              <div className="w-[240px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform rotate-3 translate-y-10 hover:rotate-0 transition-transform duration-300">
                <img src="/screenshot-retention-booking.png" alt="Booking calendar" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Layer 1: Prevention — full-width alternating */}
      <section className="w-full bg-white">
        <div className="w-full px-8 lg:px-16 xl:px-24 py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <div className="grid grid-cols-2 gap-20 items-center">
              {/* Text left */}
              <div className="max-w-xl space-y-8">
                <motion.div variants={fadeUp} custom={0}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-11 h-11 rounded-lg bg-[#3DD6C3]/15 flex items-center justify-center">
                      <span className="text-[#3DD6C3] text-sm font-black">1</span>
                    </div>
                    <p className="text-[#0D4D4D] font-bold text-xl">Layer 1 — Prevention</p>
                  </div>
                  <h2 className="text-4xl xl:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
                    Keep them warm without lifting a finger.
                  </h2>
                  <p className="text-[#4B5563] text-lg leading-relaxed">
                    7+ personalized touchpoints per year, per client — completely automatic. Holidays, birthdays, anniversaries, and custom push notifications.
                  </p>
                </motion.div>

                <motion.div variants={fadeUp} custom={0.2} className="space-y-4">
                  {[
                    { emoji: '🎄🎆❤️🎇🦃', title: 'Holiday Cards', desc: 'Beautiful full-screen cards for 5 major holidays with your photo, agency, and a booking link.' },
                    { emoji: '🎂', title: 'Birthday Messages', desc: 'Personalized birthday greetings with animations, sent automatically to every client.' },
                    { emoji: '📋', title: 'Anniversary Alerts', desc: 'Get alerted as each policy anniversary hits — the perfect time for a review or rewrite.' },
                    { emoji: '📱', title: 'Push Notifications', desc: 'Send messages directly to your clients\' phones — custom notifications, reminders, announcements.' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="bg-[#F8F9FA] rounded-xl p-5 border border-gray-100 hover:border-[#3DD6C3]/40 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-start gap-4">
                        <span className="text-xl flex-shrink-0">{item.emoji}</span>
                        <div>
                          <h3 className="text-[15px] font-bold text-[#0D4D4D] mb-1">{item.title}</h3>
                          <p className="text-[#4B5563] text-sm leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              </div>

              {/* Phone mockup right */}
              <motion.div variants={fadeUp} custom={0.1} className="flex flex-col items-center gap-10">
                <div className="w-[240px] h-[460px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a]">
                  <div
                    key={activeHoliday}
                    className="w-full h-full rounded-[2rem] overflow-hidden relative"
                    style={{ background: holiday.gradient }}
                  >
                    {holiday.floatingEmoji.map((em, i) => (
                      <motion.span
                        key={`${activeHoliday}-${i}`}
                        className="absolute text-lg pointer-events-none"
                        initial={{ opacity: 0, y: 80 }}
                        animate={{ opacity: [0, 0.5, 0], y: [-10, -150] }}
                        transition={{ duration: 3, delay: i * 0.4, repeat: Infinity, repeatDelay: 2 }}
                        style={{ left: `${15 + i * 25}%`, top: '65%' }}
                      >
                        {em}
                      </motion.span>
                    ))}
                    <div className="flex flex-col items-center justify-center h-full px-5 text-center relative z-10">
                      <div className="w-16 h-16 rounded-full border-2 border-white/40 bg-white/15 flex items-center justify-center mb-3">
                        <span className="text-2xl font-bold text-white">D</span>
                      </div>
                      <p className="text-white font-bold text-sm mb-0.5">Daniel Roberts</p>
                      <p className="text-white/50 text-[10px] mb-5">Roberts Insurance Agency</p>
                      <p className="text-white font-extrabold text-base leading-tight mb-2">{holiday.greeting}</p>
                      <p className="text-white/70 text-[11px] leading-relaxed px-2">{holiday.body}</p>
                      <div
                        className="px-6 py-2.5 rounded-lg text-[11px] font-bold shadow-md mt-5 hover:scale-105 transition-transform cursor-default"
                        style={{
                          backgroundColor: holiday.accent,
                          color: ['#FFFFFF', '#C0C0C0', '#FFB6C1', '#DAA520'].includes(holiday.accent) ? '#1A1A2E' : '#FFFFFF',
                        }}
                      >
                        Book your appointment
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-2.5">
                  {Object.entries(HOLIDAYS).map(([key, h]) => (
                    <button
                      key={key}
                      onClick={() => setActiveHoliday(key)}
                      className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                        activeHoliday === key
                          ? 'bg-[#0D4D4D] text-white shadow-lg scale-105'
                          : 'bg-gray-100 text-[#4B5563] hover:bg-gray-200 hover:scale-[1.03]'
                      }`}
                    >
                      {h.emoji} {h.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Layer 2: Rescue — full-width dark */}
      <section
        className="w-full relative overflow-hidden"
        style={{
          background: '#0D4D4D radial-gradient(ellipse 400px 400px at 0% 100%, rgba(253,204,2,0.07), transparent 70%), radial-gradient(ellipse 300px 300px at 100% 0%, rgba(61,214,195,0.05), transparent 70%)',
        }}
      >
        <div className="relative w-full px-8 lg:px-16 xl:px-24 py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="space-y-16"
          >
            <motion.div variants={fadeUp} custom={0} className="max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <span className="text-red-400 text-sm font-black">2</span>
                </div>
                <p className="text-white font-bold text-xl">Layer 2 — Rescue</p>
              </div>
              <h2 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-4">
                When a policy slips, AI catches it.
              </h2>
              <p className="text-white/90 text-lg leading-relaxed">
                Forward the carrier&apos;s conservation notice. AI handles the rest.
              </p>
            </motion.div>

            <div className="grid grid-cols-3 gap-8">
              {[
                {
                  num: '1',
                  title: 'Forward the alert',
                  body: 'Forward the carrier\'s conservation notice to your AI email address or paste it in your dashboard.',
                  color: '#fdcc02',
                },
                {
                  num: '2',
                  title: 'AI extracts & matches',
                  body: 'AI pulls client name, policy number, carrier, and reason — auto-matches to your records and flags chargeback risks.',
                  color: '#3DD6C3',
                },
                {
                  num: '3',
                  title: 'Client gets reached',
                  body: 'Push notification + iMessage (blue bubbles on iPhone, green on Android) within 2 hours. AI follows up on Day 2, 5, and 7 with different angles.',
                  color: '#fdcc02',
                },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  variants={fadeUp}
                  custom={0.1 + i * 0.1}
                  className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 hover:bg-white/[0.08] hover:border-white/20 transition-colors duration-200"
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-[#0D4D4D] text-lg font-bold mb-6"
                    style={{ backgroundColor: step.color }}
                  >
                    {step.num}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-white/90 text-sm leading-relaxed">{step.body}</p>
                </motion.div>
              ))}
            </div>

            <motion.div variants={fadeUp} custom={0.4} className="grid grid-cols-2 gap-6 max-w-2xl">
              <div className="bg-white/[0.06] border border-white/10 rounded-xl p-6 hover:bg-white/[0.1] transition-colors duration-200">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-[#fdcc02]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-white/70 text-sm font-semibold">Speed</span>
                </div>
                <p className="text-white/90 text-sm leading-relaxed">Auto-outreach in 2 hours for chargeback-risk policies</p>
              </div>
              <div className="bg-white/[0.06] border border-white/10 rounded-xl p-6 hover:bg-white/[0.1] transition-colors duration-200">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-white/70 text-sm font-semibold">Track</span>
                </div>
                <p className="text-white/90 text-sm leading-relaxed">Mark policies as &quot;Saved&quot; or &quot;Lost&quot; from your dashboard</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Real product screenshots — full-width alternating */}
      <section
        className="w-full relative overflow-hidden"
        style={{
          background: '#070E1B radial-gradient(ellipse 400px 400px at 0% 0%, rgba(239,68,68,0.05), transparent 70%), radial-gradient(ellipse 300px 300px at 100% 100%, rgba(61,214,195,0.04), transparent 70%)',
        }}
      >
        <div className="relative w-full px-8 lg:px-16 xl:px-24 py-28 space-y-28">
          {/* Conservation email — text left, screenshot right */}
          <div className="grid grid-cols-2 gap-20 items-center">
            <div className="max-w-lg">
              <p className="text-red-400 text-xs uppercase tracking-[0.15em] font-medium mb-4">See it in action</p>
              <h3 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-5">
                This is a real conservation alert being processed.
              </h3>
              <p className="text-white/90 text-base leading-relaxed">
                Real alert — AI identified client, matched the policy, and scheduled outreach automatically.
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6 }}
              className="flex justify-center"
            >
              <div className="w-[440px] rounded-2xl border-2 border-white/10 shadow-2xl overflow-hidden hover:border-white/20 transition-colors duration-200">
                <img src="/screenshot-conservation-email.png" alt="Real conservation alert email" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>

          {/* Dashboard — screenshot left, text right */}
          <div className="grid grid-cols-2 gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6 }}
              className="flex justify-center"
            >
              <div className="w-[500px] rounded-2xl border-2 border-white/10 shadow-2xl overflow-hidden hover:border-white/20 transition-colors duration-200">
                <img src="/screenshot-clients-dashboard.png" alt="Real clients dashboard" className="w-full h-auto block" />
              </div>
            </motion.div>
            <div className="max-w-lg">
              <p className="text-[#3DD6C3] text-xs uppercase tracking-[0.15em] font-medium mb-4">Your dashboard</p>
              <h3 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-5">
                Every client. Every status. One screen.
              </h3>
              <p className="text-white/90 text-base leading-relaxed">
                Real dashboard — client list with policy status, at-risk flags, and instant actions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why clients leave — full-width light */}
      <section className="w-full bg-[#F8F9FA]">
        <div className="w-full px-8 lg:px-16 xl:px-24 py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-4xl xl:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-14"
            >
              Why clients leave.
            </motion.h2>

            <div className="grid grid-cols-3 gap-8 mb-14">
              {[
                { stat: '68%', label: 'of clients leave because they feel forgotten', color: '#FF5F57' },
                { stat: '5x', label: 'cheaper to retain a client than acquire a new one', color: '#3DD6C3' },
                { stat: '~$1,200', label: 'avg annual value of a single canceled policy', color: '#FF5F57' },
              ].map((item, i) => (
                <motion.div
                  key={item.stat}
                  variants={fadeUp}
                  custom={0.1 + i * 0.08}
                  className="bg-white rounded-2xl p-8 border border-gray-200 hover:border-[#3DD6C3]/40 hover:shadow-lg transition-all duration-200"
                >
                  <span className="text-4xl font-black block mb-3" style={{ color: item.color }}>
                    {item.stat}
                  </span>
                  <p className="text-[#4B5563] text-base leading-snug">{item.label}</p>
                </motion.div>
              ))}
            </div>

            <motion.div
              variants={fadeUp}
              custom={0.4}
              className="bg-[#0D4D4D] rounded-2xl p-10 max-w-3xl mx-auto text-center"
            >
              <p className="text-white font-bold text-xl leading-snug mb-3">
                Agent For Life keeps you top-of-mind
              </p>
              <p className="text-white/90 text-lg leading-relaxed">
                so when a competitor calls, your client says{' '}
                <span className="text-[#3DD6C3] font-semibold">&quot;I already have an agent.&quot;</span>
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Thanksgiving showcase — full-width purple */}
      <section className="w-full bg-[#a158ff] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative w-full px-8 lg:px-16 xl:px-24 py-24">
          <div className="grid grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-white/70 text-xs uppercase tracking-[0.15em] font-medium mb-4">Relationships on autopilot</p>
              <h2 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-6">
                Your clients feel remembered. You didn&apos;t lift a finger.
              </h2>
              <p className="text-white/60 text-lg leading-relaxed max-w-md">
                Beautiful, branded holiday cards sent automatically to every client. They see your face, your agency, and a link to book — no work on your end.
              </p>
            </div>
            <div className="flex justify-center items-start gap-6">
              <div className="w-[250px] rounded-2xl border-2 border-black/50 shadow-2xl overflow-hidden transform -rotate-3 hover:rotate-0 transition-transform duration-300">
                <img src="/screenshot-thanksgiving-card.png" alt="Thanksgiving holiday card" className="w-full h-auto block" />
              </div>
              <div className="w-[250px] rounded-2xl border-2 border-black/50 shadow-2xl overflow-hidden transform rotate-3 translate-y-10 hover:rotate-0 transition-transform duration-300">
                <img src="/screenshot-thanksgiving-notification.png" alt="Push notification on home screen" className="w-full h-auto block" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA — full-width dark */}
      <section
        className="w-full relative overflow-hidden"
        style={{
          background: '#0D4D4D radial-gradient(ellipse 400px 400px at 25% 0%, rgba(61,214,195,0.12), transparent 70%), radial-gradient(ellipse 300px 300px at 75% 100%, rgba(253,204,2,0.08), transparent 70%)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="relative text-center py-32 px-8"
        >
          <div className="max-w-3xl mx-auto space-y-8">
            <h2 className="text-5xl xl:text-6xl font-extrabold text-white leading-tight">
              Stop losing clients<br />
              <span className="text-[#3DD6C3]">to silence</span>.
            </h2>
            <p className="text-white/90 text-xl leading-relaxed max-w-xl mx-auto">
              Other agents let chargebacks eat their income. You forward one email and your AI fights to save every policy.
            </p>
            <div className="pt-2">
              <Link
                href="/founding-member"
                className="inline-flex items-center gap-3 px-12 py-5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 hover:shadow-[#fdcc02]/40 hover:scale-[1.03] transition-all duration-200"
              >
                Get Started Free
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
            <p className="text-white/80 text-sm">
              {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} &middot; $0 forever
            </p>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
