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
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/v5" className="flex items-center gap-2 text-[#0D4D4D] hover:text-[#3DD6C3] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span className="text-sm font-semibold">Back</span>
            </Link>
            <div className="hidden md:flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife" className="w-[36px] h-[20px] object-contain" />
              <span className="text-[#0D4D4D]/60 brand-title text-sm">AgentForLife</span>
            </div>
          </div>
          <Link
            href="/founding-member"
            className="px-5 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full hover:bg-[#fdcc02]/90 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#3DD6C3] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #0D4D4D 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-7xl mx-auto px-8 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-20 lg:py-24">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#0D4D4D]/15 rounded-full mb-6">
                <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">Automated Retention</span>
              </div>
              <h1 className="text-4xl lg:text-5xl xl:text-[3.5rem] font-extrabold text-[#0D4D4D] leading-[1.1] mb-6">
                Two layers of<br />
                protection.<br />
                Zero effort.
              </h1>
              <p className="text-[#0D4D4D]/70 text-lg lg:text-xl leading-relaxed max-w-lg">
                First, automated touchpoints prevent churn before it starts. Then, if a policy still slips &mdash; AI catches it and fights to save it.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex justify-center gap-5"
            >
              <div className="w-[200px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform -rotate-3">
                <img src="/screenshot-retention-message.png" alt="Conservation message" className="w-full h-auto block" />
              </div>
              <div className="w-[200px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform rotate-3 translate-y-8">
                <img src="/screenshot-retention-booking.png" alt="Booking calendar" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Layer 1: Prevention */}
      <section className="px-8 py-24">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <motion.div variants={fadeUp} custom={0}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-lg bg-[#3DD6C3]/15 flex items-center justify-center">
                      <span className="text-[#3DD6C3] text-sm font-black">1</span>
                    </div>
                    <p className="text-[#0D4D4D] font-bold text-xl">Layer 1 — Prevention</p>
                  </div>
                  <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-3">
                    Keep them warm without lifting a finger.
                  </h2>
                  <p className="text-[#6B7280] text-lg leading-relaxed">
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
                    <div key={item.title} className="bg-[#F8F9FA] rounded-xl p-5 border border-gray-100">
                      <div className="flex items-start gap-4">
                        <span className="text-xl flex-shrink-0">{item.emoji}</span>
                        <div>
                          <h3 className="text-[15px] font-bold text-[#0D4D4D] mb-1">{item.title}</h3>
                          <p className="text-[#6B7280] text-sm leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              </div>

              <motion.div variants={fadeUp} custom={0.1} className="flex flex-col items-center gap-8">
                <div className="w-[220px] h-[420px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a]">
                  <div key={activeHoliday} className="w-full h-full rounded-[2rem] overflow-hidden relative" style={{ background: holiday.gradient }}>
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
                    <div className="flex flex-col items-center justify-center h-full px-4 text-center relative z-10">
                      <div className="w-14 h-14 rounded-full border-2 border-white/40 bg-white/15 flex items-center justify-center mb-3">
                        <span className="text-2xl font-bold text-white">D</span>
                      </div>
                      <p className="text-white font-bold text-xs mb-0.5">Daniel Roberts</p>
                      <p className="text-white/50 text-[9px] mb-4">Roberts Insurance Agency</p>
                      <p className="text-white font-extrabold text-[15px] leading-tight mb-2">{holiday.greeting}</p>
                      <p className="text-white/70 text-[10px] leading-relaxed px-2">{holiday.body}</p>
                      <div className="px-5 py-2 rounded-lg text-[10px] font-bold shadow-md mt-4" style={{ backgroundColor: holiday.accent, color: ['#FFFFFF', '#C0C0C0', '#FFB6C1', '#DAA520'].includes(holiday.accent) ? '#1A1A2E' : '#FFFFFF' }}>
                        Book your appointment
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {Object.entries(HOLIDAYS).map(([key, h]) => (
                    <button
                      key={key}
                      onClick={() => setActiveHoliday(key)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                        activeHoliday === key
                          ? 'bg-[#0D4D4D] text-white shadow-md'
                          : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'
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

      {/* Layer 2: Rescue */}
      <section className="bg-[#0D4D4D] px-8 py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#fdcc02] rounded-full blur-[180px] opacity-[0.08]" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="space-y-12"
          >
            <motion.div variants={fadeUp} custom={0}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <span className="text-red-400 text-sm font-black">2</span>
                </div>
                <p className="text-white font-bold text-xl">Layer 2 — Rescue</p>
              </div>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight mb-3">
                When a policy slips, AI catches it.
              </h2>
              <p className="text-white/50 text-lg">
                Forward the carrier&apos;s conservation notice. AI handles the rest.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                  body: 'Personalized push notification + text within 2 hours. AI follows up on Day 2, 5, and 7 with different angles.',
                  color: '#fdcc02',
                },
              ].map((step, i) => (
                <motion.div key={step.num} variants={fadeUp} custom={0.1 + i * 0.1} className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-7">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-[#0D4D4D] text-base font-bold mb-5" style={{ backgroundColor: step.color }}>
                    {step.num}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{step.body}</p>
                </motion.div>
              ))}
            </div>

            <motion.div variants={fadeUp} custom={0.4} className="grid grid-cols-2 gap-5 max-w-xl">
              <div className="bg-white/[0.06] border border-white/10 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-[#fdcc02]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-white/70 text-sm font-semibold">Speed</span>
                </div>
                <p className="text-white/40 text-sm leading-relaxed">Auto-outreach in 2 hours for chargeback-risk policies</p>
              </div>
              <div className="bg-white/[0.06] border border-white/10 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-white/70 text-sm font-semibold">Track</span>
                </div>
                <p className="text-white/40 text-sm leading-relaxed">Mark policies as &quot;Saved&quot; or &quot;Lost&quot; from your dashboard</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Real product screenshots */}
      <section className="bg-[#070E1B] px-8 py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-red-500 rounded-full blur-[180px] opacity-[0.06]" />
        </div>
        <div className="relative max-w-6xl mx-auto space-y-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-red-400 text-xs uppercase tracking-[0.15em] font-medium mb-3">See it in action</p>
              <h3 className="text-2xl lg:text-3xl font-extrabold text-white leading-tight mb-4">
                This is a real conservation alert being processed.
              </h3>
              <p className="text-white/30 text-sm">
                Real alert — AI identified client, matched the policy, and scheduled outreach automatically.
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex justify-center"
            >
              <div className="w-[340px] rounded-2xl border-2 border-white/10 shadow-2xl overflow-hidden">
                <img src="/screenshot-conservation-email.png" alt="Real conservation alert email" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex justify-center lg:order-2"
            >
              <div className="w-full max-w-[480px] rounded-2xl border-2 border-white/10 shadow-2xl overflow-hidden">
                <img src="/screenshot-clients-dashboard.png" alt="Real clients dashboard" className="w-full h-auto block" />
              </div>
            </motion.div>
            <div className="lg:order-1">
              <p className="text-[#3DD6C3] text-xs uppercase tracking-[0.15em] font-medium mb-3">Your dashboard</p>
              <h3 className="text-2xl lg:text-3xl font-extrabold text-white leading-tight mb-4">
                Every client. Every status. One screen.
              </h3>
              <p className="text-white/30 text-sm">
                Real dashboard — client list with policy status, at-risk flags, and instant actions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why clients leave */}
      <section className="px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-10">
              Why clients leave.
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              {[
                { stat: '68%', label: 'of clients leave because they feel forgotten', color: '#FF5F57' },
                { stat: '5x', label: 'cheaper to retain a client than acquire a new one', color: '#3DD6C3' },
                { stat: '~$1,200', label: 'avg annual value of a single canceled policy', color: '#FF5F57' },
              ].map((item, i) => (
                <motion.div key={item.stat} variants={fadeUp} custom={0.1 + i * 0.08} className="flex items-center gap-5 bg-[#F8F9FA] rounded-2xl p-7 border border-gray-100">
                  <span className="text-3xl font-black flex-shrink-0" style={{ color: item.color }}>{item.stat}</span>
                  <p className="text-[#6B7280] text-sm leading-snug">{item.label}</p>
                </motion.div>
              ))}
            </div>

            <motion.div variants={fadeUp} custom={0.4} className="bg-[#0D4D4D] rounded-2xl p-8 text-center max-w-2xl mx-auto">
              <p className="text-white font-bold text-lg leading-snug mb-2">
                Agent For Life keeps you top-of-mind
              </p>
              <p className="text-white/50 text-base leading-relaxed">
                so when a competitor calls, your client says <span className="text-[#3DD6C3] font-semibold">&quot;I already have an agent.&quot;</span>
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Thanksgiving showcase */}
      <section className="bg-[#a158ff] px-8 py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <p className="text-white/70 text-xs uppercase tracking-[0.15em] font-medium mb-3">Relationships on autopilot</p>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight">
                Your clients feel remembered. You didn&apos;t lift a finger.
              </h2>
            </div>
            <div className="flex justify-center gap-5">
              <div className="w-[200px] rounded-2xl border-2 border-black/50 shadow-2xl overflow-hidden transform -rotate-3">
                <img src="/screenshot-thanksgiving-card.png" alt="Thanksgiving holiday card" className="w-full h-auto block" />
              </div>
              <div className="w-[200px] rounded-2xl border-2 border-black/50 shadow-2xl overflow-hidden transform rotate-3 translate-y-8">
                <img src="/screenshot-thanksgiving-notification.png" alt="Push notification on home screen" className="w-full h-auto block" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0D4D4D] px-8 py-28 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[150px] opacity-15" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative text-center max-w-3xl mx-auto space-y-8"
        >
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight">
            Stop losing clients<br />
            <span className="text-[#3DD6C3]">to silence</span>.
          </h2>
          <p className="text-white/40 text-lg leading-relaxed max-w-xl mx-auto">
            Other agents let chargebacks eat their income. You forward one email and your AI fights to save every policy.
          </p>
          <Link
            href="/founding-member"
            className="inline-flex items-center gap-3 px-10 py-5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 hover:shadow-[#fdcc02]/40 hover:scale-[1.02] transition-all"
          >
            Get Started Free
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/25 text-sm">
            {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} &middot; $0 forever
          </p>
        </motion.div>
      </section>
    </div>
  );
}
