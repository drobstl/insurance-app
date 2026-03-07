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
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

export default function RelationshipsDeepDive() {
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
            <Link href="/" className="flex items-center gap-2 text-[#0D4D4D] hover:text-[#a158ff] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span className="text-sm font-semibold">Back</span>
            </Link>
            <div className="hidden md:flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife" className="w-[36px] h-[20px] object-contain" />
              <span className="text-[#4B5563] brand-title text-sm">AgentForLife</span>
            </div>
          </div>
          <span className="hidden md:block text-[#a158ff] font-bold text-sm uppercase tracking-wide">Relationships</span>
          <Link href="/founding-member" className="px-5 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full hover:bg-[#fdcc02]/90 transition-colors">
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#a158ff] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-7xl mx-auto px-8 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-20 lg:py-28">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full mb-6">
                <span className="text-white font-bold text-xs uppercase tracking-wide">Relationships on Autopilot</span>
              </div>
              <h1 className="text-4xl lg:text-5xl xl:text-[3.5rem] font-extrabold text-white leading-[1.1] mb-6">
                Every client feels like your only client.
              </h1>
              <p className="text-white/80 text-lg lg:text-xl leading-relaxed max-w-lg mb-10">
                7+ personalized touchpoints per year, per client &mdash; completely automatic. Holiday cards, birthday messages, anniversary alerts, and custom push notifications.
              </p>
              <Link
                href="/founding-member"
                className="inline-flex items-center gap-3 px-8 py-4 bg-white text-[#a158ff] text-base font-bold rounded-full hover:bg-white/90 hover:scale-[1.02] transition-all shadow-lg"
              >
                Get Started Free
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex justify-center gap-5"
            >
              <div className="w-[220px] rounded-2xl border-[3px] border-black/50 shadow-2xl overflow-hidden transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <img src="/screenshot-thanksgiving-card.png" alt="Thanksgiving holiday card" className="w-full h-auto block" />
              </div>
              <div className="w-[220px] rounded-2xl border-[3px] border-black/50 shadow-2xl overflow-hidden transform rotate-3 translate-y-8 hover:rotate-0 hover:translate-y-0 transition-transform duration-500">
                <img src="/screenshot-thanksgiving-notification.png" alt="Push notification on home screen" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Interactive Holiday Cards */}
      <section className="px-8 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
                <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
                  5 holidays. Beautifully designed. Fully automatic.
                </h2>
                <p className="text-[#4B5563] text-lg leading-relaxed mb-8">
                  Full-screen animated cards for every major holiday &mdash; branded with your photo, your agency, and a link to book. Your clients feel remembered. You didn&apos;t lift a finger.
                </p>
              </motion.div>

              <div className="flex flex-wrap gap-2 mb-8">
                {Object.entries(HOLIDAYS).map(([key, h]) => (
                  <button
                    key={key}
                    onClick={() => setActiveHoliday(key)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                      activeHoliday === key
                        ? 'bg-[#0D4D4D] text-white shadow-md'
                        : 'bg-gray-100 text-[#4B5563] hover:bg-gray-200'
                    }`}
                  >
                    {h.emoji} {h.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-center">
              <div className="w-[240px] h-[460px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a]">
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
                    <div
                      className="px-5 py-2 rounded-lg text-[10px] font-bold shadow-md mt-4"
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
            </div>
          </div>
        </div>
      </section>

      {/* All Touchpoints */}
      <section className="bg-[#F8F9FA] px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
              Every touchpoint, automated.
            </motion.h2>
            <motion.p variants={fadeUp} custom={0.05} className="text-[#4B5563] text-lg mb-10 max-w-2xl">
              Your clients hear from you on every holiday, every birthday, and every policy anniversary &mdash; without you doing a thing.
            </motion.p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { emoji: '🎄🎆❤️🎇🦃', title: 'Holiday Cards', desc: 'Beautiful full-screen animated cards for 5 major holidays with your photo, your agency name, and a link to book an appointment.' },
                { emoji: '🎂', title: 'Birthday Messages', desc: 'Personalized birthday greetings with animations, sent automatically to every client on their special day.' },
                { emoji: '📋', title: 'Anniversary Alerts', desc: 'You get alerted as each policy anniversary hits — the perfect time for a review, a check-in, or a rewrite.' },
                { emoji: '📱', title: 'Push Notifications', desc: 'Send messages directly to your clients\' home screens — custom notifications, reminders, or announcements whenever you want.' },
                { emoji: '👤', title: 'Branded to You', desc: 'Every touchpoint carries your name, your photo, and your agency. Clients see you — not a generic insurance app.' },
                { emoji: '📊', title: 'Track Everything', desc: 'See exactly which clients received which touchpoints, who opened them, and who booked from your dashboard.' },
              ].map((item, i) => (
                <motion.div key={item.title} variants={fadeUp} custom={0.1 + i * 0.06} className="bg-white rounded-2xl p-7 border border-gray-100 hover:shadow-lg transition-shadow">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl flex-shrink-0">{item.emoji}</span>
                    <div>
                      <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">{item.title}</h3>
                      <p className="text-[#4B5563] text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why it matters — stats */}
      <section className="px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-10">
            Why staying top-of-mind matters.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {[
              { stat: '68%', label: 'of clients leave because they feel forgotten', color: '#FF5F57' },
              { stat: '5x', label: 'cheaper to retain a client than acquire a new one', color: '#3DD6C3' },
              { stat: '7+', label: 'automated touchpoints per year, per client', color: '#a158ff' },
            ].map((item) => (
              <div key={item.stat} className="flex items-center gap-5 bg-[#F8F9FA] rounded-2xl p-7 border border-gray-100">
                <span className="text-3xl font-black flex-shrink-0" style={{ color: item.color }}>{item.stat}</span>
                <p className="text-[#4B5563] text-sm leading-snug">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-[#0D4D4D] rounded-2xl p-8 text-center max-w-2xl mx-auto">
            <p className="text-white font-bold text-lg leading-snug mb-2">
              Agent For Life keeps you top-of-mind
            </p>
            <p className="text-white/90 text-base leading-relaxed">
              so when a competitor calls, your client says <span className="text-[#3DD6C3] font-semibold">&quot;I already have an agent.&quot;</span>
            </p>
          </div>
        </div>
      </section>

      {/* Thanksgiving showcase */}
      <section className="bg-[#a158ff] px-8 py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <p className="text-white/70 text-xs uppercase tracking-[0.15em] font-medium mb-3">See it in action</p>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight mb-4">
                Your clients feel remembered. You didn&apos;t lift a finger.
              </h2>
              <p className="text-white/60 text-lg leading-relaxed">
                Beautiful, branded holiday cards sent automatically to every client. They see your face, your agency, and a link to book.
              </p>
            </div>
            <div className="flex justify-center gap-5">
              <div className="w-[220px] rounded-2xl border-[3px] border-black/50 shadow-2xl overflow-hidden transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <img src="/screenshot-thanksgiving-card.png" alt="Thanksgiving holiday card" className="w-full h-auto block" />
              </div>
              <div className="w-[220px] rounded-2xl border-[3px] border-black/50 shadow-2xl overflow-hidden transform rotate-3 translate-y-8 hover:rotate-0 hover:translate-y-0 transition-transform duration-500">
                <img src="/screenshot-thanksgiving-notification.png" alt="Push notification on home screen" className="w-full h-auto block" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 py-28 relative overflow-hidden" style={{ background: '#0D4D4D radial-gradient(ellipse 300px 300px at 25% 0%, rgba(161,88,255,0.12), transparent 70%), radial-gradient(ellipse 300px 300px at 75% 100%, rgba(253,204,2,0.08), transparent 70%)' }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative text-center max-w-3xl mx-auto space-y-8"
        >
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight">
            Stop losing clients<br />
            <span className="text-[#a158ff]">to silence</span>.
          </h2>
          <p className="text-white/90 text-lg leading-relaxed max-w-xl mx-auto">
            68% of clients leave because they feel forgotten. With Agent For Life, every client hears from you — automatically, personally, and on time.
          </p>
          <Link
            href="/founding-member"
            className="inline-flex items-center gap-3 px-10 py-5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 hover:shadow-[#fdcc02]/40 hover:scale-[1.02] transition-all"
          >
            Get Started Free
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/80 text-sm">
            {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} &middot; $0 forever
          </p>
        </motion.div>
      </section>
    </div>
  );
}
