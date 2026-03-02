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
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

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
      {/* Back nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="px-5 h-14 flex items-center justify-between">
          <Link href="/m" className="flex items-center gap-2 text-[#0D4D4D]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            <span className="text-sm font-semibold">Back</span>
          </Link>
          <Link
            href="/founding-member/m"
            className="px-4 py-2 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#a158ff] px-6 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 rounded-full mb-5">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              <span className="text-white font-bold text-[11px] uppercase tracking-wide">Relationships</span>
            </div>
            <h1 className="text-[2rem] font-extrabold text-white leading-[1.1] mb-4">
              Every client feels like your only client.
            </h1>
            <p className="text-white/80 text-[15px] leading-relaxed max-w-[320px]">
              7+ personalized touchpoints per year, per client. Holidays, birthdays, anniversaries &mdash; all completely automatic.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Screenshots showcase */}
      <section className="px-5 -mt-8 relative z-10 mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex justify-center gap-3"
        >
          <div className="w-[45%] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform -rotate-2">
            <img src="/screenshot-thanksgiving-card.png" alt="Thanksgiving holiday card" className="w-full h-auto block" />
          </div>
          <div className="w-[45%] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform rotate-2 translate-y-6">
            <img src="/screenshot-thanksgiving-notification.png" alt="Push notification on home screen" className="w-full h-auto block" />
          </div>
        </motion.div>
      </section>

      {/* Interactive holiday phone mockup */}
      <section className="px-6 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="space-y-8"
        >
          <motion.div variants={fadeUp} custom={0}>
            <h2 className="text-[1.4rem] font-extrabold text-[#0D4D4D] leading-tight mb-2">
              Your clients feel remembered.
            </h2>
            <p className="text-[#6B7280] text-[14px] leading-relaxed">
              Beautiful, personalized cards delivered straight to their phone for every major holiday. With your name, your photo, and your agency.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} custom={0.1} className="flex justify-center">
            <div className="w-[200px] h-[380px] bg-[#1a1a1a] rounded-[2.25rem] p-2 shadow-2xl border-4 border-[#2a2a2a]">
              <div key={activeHoliday} className="w-full h-full rounded-[1.75rem] overflow-hidden relative" style={{ background: holiday.gradient }}>
                {holiday.floatingEmoji.map((em, i) => (
                  <motion.span
                    key={`${activeHoliday}-${i}`}
                    className="absolute text-base pointer-events-none"
                    initial={{ opacity: 0, y: 80 }}
                    animate={{ opacity: [0, 0.5, 0], y: [-10, -150] }}
                    transition={{ duration: 3, delay: i * 0.4, repeat: Infinity, repeatDelay: 2 }}
                    style={{ left: `${15 + i * 25}%`, top: '65%' }}
                  >
                    {em}
                  </motion.span>
                ))}
                <div className="flex flex-col items-center justify-center h-full px-3 text-center relative z-10">
                  <div className="w-12 h-12 rounded-full border-2 border-white/40 bg-white/15 flex items-center justify-center mb-3">
                    <span className="text-xl font-bold text-white">D</span>
                  </div>
                  <p className="text-white font-bold text-[10px] mb-0.5">Daniel Roberts</p>
                  <p className="text-white/50 text-[8px] mb-3">Roberts Insurance Agency</p>
                  <p className="text-white font-extrabold text-[13px] leading-tight mb-1.5">{holiday.greeting}</p>
                  <p className="text-white/70 text-[9px] leading-relaxed px-1">{holiday.body}</p>
                  <div className="px-4 py-1.5 rounded-lg text-[9px] font-bold shadow-md mt-3" style={{ backgroundColor: holiday.accent, color: ['#FFFFFF', '#C0C0C0', '#FFB6C1', '#DAA520'].includes(holiday.accent) ? '#1A1A2E' : '#FFFFFF' }}>
                    Book your appointment
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Holiday picker */}
          <motion.div variants={fadeUp} custom={0.2} className="flex flex-wrap justify-center gap-2">
            {Object.entries(HOLIDAYS).map(([key, h]) => (
              <button
                key={key}
                onClick={() => setActiveHoliday(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeHoliday === key
                    ? 'bg-[#0D4D4D] text-white shadow-md'
                    : 'bg-gray-100 text-[#6B7280]'
                }`}
              >
                {h.emoji} {h.label}
              </button>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Every touchpoint */}
      <section className="bg-[#F8F9FA] px-6 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="space-y-5"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-[1.4rem] font-extrabold text-[#0D4D4D] leading-tight">
            Every touchpoint.<br />Automatic.
          </motion.h2>

          {[
            { emoji: '🎄', title: '5 Holiday Cards', desc: 'Christmas, New Year\'s, Valentine\'s Day, 4th of July, and Thanksgiving. Full-screen cards with your branding, delivered as push notifications.' },
            { emoji: '🎂', title: 'Birthday Messages', desc: 'Personalized birthday greetings sent automatically to every client on their birthday. Never forget a date again.' },
            { emoji: '📋', title: 'Policy Anniversary Alerts', desc: 'As each policy anniversary approaches, you get a heads-up and your client gets a notification. The perfect moment for a check-in.' },
            { emoji: '📱', title: 'Custom Push Notifications', desc: 'Send your own messages directly to clients\' phones anytime — announcements, reminders, seasonal check-ins, whatever you need.' },
          ].map((item, i) => (
            <motion.div key={item.title} variants={fadeUp} custom={0.1 + i * 0.08} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{item.emoji}</span>
                <div>
                  <h3 className="text-[15px] font-bold text-[#0D4D4D] mb-1">{item.title}</h3>
                  <p className="text-[#6B7280] text-[13px] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Why it matters */}
      <section className="px-6 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="space-y-5"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-[1.4rem] font-extrabold text-[#0D4D4D] leading-tight">
            Why it matters.
          </motion.h2>

          {[
            { icon: '🤝', title: 'Relationships prevent churn', desc: 'The number one reason clients leave their agent is feeling forgotten. Consistent touchpoints make sure that never happens.' },
            { icon: '📞', title: 'You become the obvious call', desc: 'When something changes in their life — new car, new baby, new home — who do they call? The agent who remembered their birthday, or the one they haven\'t heard from in a year?' },
            { icon: '⏰', title: 'Zero time from you', desc: 'Every touchpoint is automated. You don\'t write the cards, you don\'t track the dates, you don\'t hit send. The system handles everything.' },
            { icon: '🏠', title: 'Your brand, their phone', desc: 'Every card and notification comes from your branded app. Your name. Your photo. Your agency. It\'s your relationship — we just automate it.' },
          ].map((item, i) => (
            <motion.div key={item.title} variants={fadeUp} custom={0.1 + i * 0.08} className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                <div>
                  <h3 className="text-[15px] font-bold text-[#0D4D4D] mb-1">{item.title}</h3>
                  <p className="text-[#6B7280] text-[13px] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* The difference */}
      <section className="bg-[#0D4D4D] px-6 py-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-[#a158ff] rounded-full blur-[120px] opacity-[0.1]" />
        </div>
        <div className="relative space-y-5">
          <h2 className="text-[1.3rem] font-extrabold text-white leading-tight text-center">
            Without Agent For Life
          </h2>
          <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5">
            <p className="text-white/50 text-[13px] leading-relaxed text-center">
              You close the deal. Months pass. The client forgets your name. A competitor calls. They switch. You eat the chargeback.
            </p>
          </div>
          <h2 className="text-[1.3rem] font-extrabold text-[#a158ff] leading-tight text-center pt-2">
            With Agent For Life
          </h2>
          <div className="bg-[#a158ff]/15 border border-[#a158ff]/25 rounded-2xl p-5">
            <p className="text-white/70 text-[13px] leading-relaxed text-center">
              You close the deal. Holiday cards arrive. Birthday messages land. When a competitor calls, your client says <span className="text-[#a158ff] font-semibold">&quot;I already have an agent.&quot;</span>
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0D4D4D] px-6 py-16 pb-28 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[200px] h-[200px] bg-[#3DD6C3] rounded-full blur-[100px] opacity-15" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative text-center space-y-5"
        >
          <h2 className="text-[1.5rem] font-extrabold text-white leading-tight">
            Be the agent they<br />
            <span className="text-[#a158ff]">never forget</span>.
          </h2>
          <p className="text-white/40 text-[14px] leading-relaxed max-w-[280px] mx-auto">
            7+ touchpoints per year. Every client. Zero effort from you. Relationships that last.
          </p>
          <Link
            href="/founding-member/m"
            className="inline-flex items-center gap-2.5 px-8 py-4 bg-[#fdcc02] text-[#0D4D4D] text-base font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 active:scale-[0.97] transition-transform"
          >
            Get Started Free
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/25 text-xs">
            {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} &middot; $0 forever
          </p>
        </motion.div>
      </section>
    </div>
  );
}
