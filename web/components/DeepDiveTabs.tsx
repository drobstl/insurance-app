'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

const TAB_CARDS = [
  {
    label: 'Retention',
    teaser: '7+ automated touchpoints + AI rescue',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    accent: '#3DD6C3',
  },
  {
    label: 'Referrals',
    teaser: 'One tap to booked appointment',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    accent: '#fdcc02',
  },
  {
    label: 'Rewrites',
    teaser: '30-day anniversary alerts',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    accent: '#3DD6C3',
  },
] as const;

const SMS_DELAYS = [
  600, 750, 300, 750, 750, 750,
  350, 350, 350, 350, 300, 300, 300, 300,
  1000,
];

const holidayThemes: Record<string, { gradient: string; emoji: string; label: string; greeting: string; body: string; floatingEmoji: string[]; accent: string }> = {
  christmas: {
    gradient: 'linear-gradient(135deg, #8B0000, #C41E3A, #A0153E)',
    emoji: '🎄',
    label: 'Christmas',
    greeting: 'Merry Christmas, Sarah!',
    body: 'Wishing you and your family a season full of warmth, joy, and time together. It\u2019s a privilege to be your agent \u2014 I hope this holiday brings you everything you deserve.',
    floatingEmoji: ['\u2744\uFE0F', '\uD83C\uDF84', '\u2B50'],
    accent: '#D4A843',
  },
  newyear: {
    gradient: 'linear-gradient(135deg, #0B1A3E, #162D6E, #1A3A8A)',
    emoji: '🎆',
    label: "New Year\u2019s",
    greeting: 'Happy New Year, Sarah!',
    body: 'Here\u2019s to a fresh start and a year full of good things. I\u2019m honored to be the one looking out for you and your family \u2014 let\u2019s make this year a great one.',
    floatingEmoji: ['\uD83C\uDF86', '\u2728', '\uD83C\uDF87'],
    accent: '#C0C0C0',
  },
  valentines: {
    gradient: 'linear-gradient(135deg, #9B1B30, #D63B5C, #E8839B)',
    emoji: '💝',
    label: "Valentine\u2019s",
    greeting: "Happy Valentine\u2019s Day, Sarah!",
    body: 'Today is all about the people who matter most \u2014 and protecting the ones you love is something I never take lightly. Enjoy every moment with your loved ones today.',
    floatingEmoji: ['\u2764\uFE0F', '\uD83D\uDC95', '\uD83D\uDC96', '\uD83D\uDC97'],
    accent: '#FFB6C1',
  },
  july4th: {
    gradient: 'linear-gradient(135deg, #002868, #BF0A30, #002868)',
    emoji: '🇺🇸',
    label: '4th of July',
    greeting: 'Happy 4th of July, Sarah!',
    body: 'Wishing you a day full of good food, great company, and maybe a few fireworks. Enjoy the celebration \u2014 you and your family deserve it.',
    floatingEmoji: ['\uD83C\uDDFA\uD83C\uDDF8', '\uD83C\uDF86', '\u2B50'],
    accent: '#FFFFFF',
  },
  thanksgiving: {
    gradient: 'linear-gradient(135deg, #8B4513, #BF6A20, #D4892A)',
    emoji: '🍂',
    label: 'Thanksgiving',
    greeting: 'Happy Thanksgiving, Sarah!',
    body: 'I\u2019m grateful for the trust you place in me to protect what matters most to your family. I hope your table is full and your heart is fuller. Enjoy every bite.',
    floatingEmoji: ['\uD83C\uDF42', '\uD83C\uDF41', '\uD83C\uDF43'],
    accent: '#DAA520',
  },
};

export default function DeepDiveTabs() {
  const [activeTab, setActiveTab] = useState(0);
  const [activeHoliday, setActiveHoliday] = useState('christmas');

  const smsRef = useRef<HTMLDivElement>(null);
  const smsTriggered = useRef(false);
  const [smsStep, setSmsStep] = useState(-1);

  useEffect(() => {
    const el = smsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !smsTriggered.current) {
          smsTriggered.current = true;
          setSmsStep(0);
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activeTab]);

  useEffect(() => {
    if (smsStep < 0 || smsStep >= SMS_DELAYS.length) return;
    const timer = setTimeout(() => setSmsStep(s => s + 1), SMS_DELAYS[smsStep]);
    return () => clearTimeout(timer);
  }, [smsStep]);

  const fade = (step: number, fast?: boolean) => ({
    opacity: smsStep >= step ? 1 : 0,
    transform: smsStep >= step ? 'translateY(0)' : 'translateY(6px)',
    transition: `all ${fast ? '150ms' : '400ms'} ease-out`,
  } as React.CSSProperties);

  const activeTheme = holidayThemes[activeHoliday];

  return (
    <section className="py-20 md:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 md:mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-3">
            Explore the <span className="text-[#3DD6C3]">System</span>
          </h2>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════╗
            ║  MOBILE: Product-led, one idea per screen (md:hidden)       ║
            ╚══════════════════════════════════════════════════════════════╝ */}
        <div className="md:hidden space-y-12">
          {/* Throughline */}
          <div className="flex items-center justify-center gap-2 text-[#6B7280] text-xs font-semibold">
            <span className="text-[#3DD6C3]">1 Retention</span>
            <span className="text-[#6B7280]/50">·</span>
            <span className="text-[#fdcc02]">2 Referrals</span>
            <span className="text-[#6B7280]/50">·</span>
            <span className="text-[#3DD6C3]">3 Rewrites</span>
          </div>

          {/* 1 — Retention: visual first, one headline, one sentence */}
          <motion.div
            className="rounded-3xl overflow-hidden border border-[#0D4D4D]/10 bg-[#0D4D4D]/[0.02]"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="flex flex-col items-center pt-6 pb-6 px-4">
              <div className="w-[200px] h-[400px] bg-[#1a1a1a] rounded-[2.25rem] p-2 shadow-2xl border-4 border-[#2a2a2a] mb-5">
                <div key={activeHoliday} className="w-full h-full rounded-[1.75rem] overflow-hidden relative" style={{ background: activeTheme.gradient }}>
                  {activeTheme.floatingEmoji.map((em: string, i: number) => (
                    <span key={i} className="absolute text-base pointer-events-none" style={{ left: `${10 + i * 25}%`, animation: `floatDrift ${6 + i * 2}s ease-in-out infinite`, animationDelay: `${i * 1.8}s`, opacity: 0 }}>{em}</span>
                  ))}
                  <div className="flex flex-col items-center justify-center h-full px-3 text-center relative z-10">
                    <div className="w-[56px] h-[56px] rounded-full border-2 border-white/40 bg-white/15 flex items-center justify-center mb-3" style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.2)' }}>
                      <span className="text-[24px] font-bold text-white">D</span>
                    </div>
                    <p className="text-white font-bold text-[11px] mb-0.5">Daniel Roberts</p>
                    <p className="text-white/60 text-[9px] mb-3">Roberts Insurance Agency</p>
                    <p className="text-white font-extrabold text-[14px] leading-tight mb-1">{activeTheme.greeting}</p>
                    <p className="text-white/80 text-[10px] leading-relaxed line-clamp-2 px-0.5">{activeTheme.body}</p>
                    <div className="px-4 py-1.5 rounded-lg text-[10px] font-bold shadow-md mt-2" style={{ backgroundColor: activeTheme.accent, color: ['#FFFFFF', '#FFD700', '#C0C0C0', '#FFB6C1', '#DAA520'].includes(activeTheme.accent) ? '#1A1A2E' : '#FFFFFF' }}>
                      Book your appointment
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                {Object.entries(holidayThemes).map(([key, theme]) => (
                  <button key={key} onClick={() => setActiveHoliday(key)} className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${activeHoliday === key ? 'bg-[#0D4D4D] text-white' : 'bg-[#E5E7EB] text-[#6B7280]'}`}>
                    {theme.emoji} {theme.label}
                  </button>
                ))}
              </div>
              <h3 className="text-xl font-extrabold text-[#0D4D4D] text-center mb-2">
                Two Layers of Protection. <span className="text-[#3DD6C3]">Zero Effort.</span>
              </h3>
              <p className="text-[#6B7280] text-sm text-center leading-snug max-w-[280px]">
                7+ touchpoints keep clients warm; when a policy slips, AI rescues it.
              </p>
            </div>
          </motion.div>

          {/* 2 — Referrals: visual first, one headline, one sentence */}
          <motion.div
            className="rounded-3xl overflow-hidden border border-[#0D4D4D]/10 bg-[#0D4D4D]/[0.02]"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
          >
            <div className="flex flex-col items-center pt-6 pb-6 px-4">
              <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-[#3DD6C3]/20 w-full max-w-[280px] mb-5">
                <div className="bg-[#111] rounded-t-[1.5rem] px-3 pt-2 pb-1.5 flex items-center justify-between">
                  <span className="text-white/40 text-[9px] font-medium">9:44 AM</span>
                  <div className="flex gap-0.5"><div className="w-1 h-1.5 bg-white/40 rounded-sm"></div><div className="w-1 h-2 bg-white/40 rounded-sm"></div><div className="w-1 h-2.5 bg-white/40 rounded-sm"></div></div>
                </div>
                <div className="bg-[#111] px-3 pb-2 border-b border-white/5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-[#005851] flex items-center justify-center"><span className="text-[#3DD6C3] text-[9px] font-bold">D</span></div>
                    <div><p className="text-white text-[11px] font-semibold">Daniel</p><p className="text-white/30 text-[8px]">AI Referral Assistant</p></div>
                  </div>
                </div>
                <div className="bg-[#111] px-2.5 py-2 space-y-1.5 rounded-b-[1.5rem]">
                  <div className="flex justify-end"><div className="bg-[#005851] rounded-xl rounded-tr-sm px-2.5 py-1.5 max-w-[90%]"><p className="text-white text-[10px] leading-snug">Hey Mike, Sarah connected us — open to a couple quick questions?</p></div></div>
                  <div className="flex justify-start"><div className="bg-[#333] rounded-xl rounded-tl-sm px-2.5 py-1.5 max-w-[70%]"><p className="text-white text-[10px]">yeah sure</p></div></div>
                  <div className="flex justify-end"><div className="bg-[#005851] rounded-xl rounded-tr-sm px-2.5 py-1.5 max-w-[90%]"><p className="text-white text-[10px] leading-snug">15-min call would be worth it. Here&apos;s my calendar:</p><p className="text-[#3DD6C3] text-[10px] mt-0.5 underline">calendly.com/daniel</p></div></div>
                </div>
              </div>
              <p className="text-[#3DD6C3] text-[10px] font-bold uppercase tracking-wide mb-4">The referral thinks they&apos;re texting you</p>
              <h3 className="text-xl font-extrabold text-[#0D4D4D] text-center mb-2">
                From <span className="text-[#3DD6C3]">One Tap</span> to <span className="text-[#fdcc02]">Booked</span>.
              </h3>
              <p className="text-[#6B7280] text-sm text-center leading-snug max-w-[280px] mb-1">
                Client refers, your AI texts and books the call. You show up and close.
              </p>
              <p className="text-[#6B7280] text-[10px]">AI follows up Day 2, 5, 8 if they don&apos;t reply.</p>
            </div>
          </motion.div>

          {/* 3 — Rewrites: visual first, one headline, one sentence */}
          <motion.div
            className="rounded-3xl overflow-hidden border border-[#0D4D4D]/10 bg-[#0D4D4D]/[0.02]"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
          >
            <div className="flex flex-col items-center pt-6 pb-6 px-4">
              <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-lg w-full max-w-[280px] mb-5">
                <div className="flex items-start gap-2.5 mb-3">
                  <div className="w-9 h-9 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0"><span className="text-[#3DD6C3] text-[10px] font-bold">D</span></div>
                  <div><p className="text-[#0D4D4D] font-semibold text-xs">Daniel Roberts</p><p className="text-[#6B7280] text-[10px]">Your Agent</p></div>
                </div>
                <div className="bg-[#F8F9FA] rounded-xl p-3 border border-gray-100">
                  <p className="text-[#0D4D4D] text-xs leading-relaxed">&quot;Anniversary coming up — <span className="font-bold text-[#3DD6C3]">lower rates</span> for same coverage. Tap below to grab a time.&quot;</p>
                </div>
                <div className="mt-3 text-center">
                  <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3DD6C3] text-[#0D4D4D] text-xs font-bold rounded-xl">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Book with Daniel
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-extrabold text-[#0D4D4D] text-center mb-2">
                Every Anniversary Is a <span className="text-[#3DD6C3]">Booked Appointment</span>.
              </h3>
              <p className="text-[#6B7280] text-sm text-center leading-snug max-w-[280px]">
                30-day alert, one tap to book. The rewrite comes to you.
              </p>
            </div>
          </motion.div>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════╗
            ║  DESKTOP: V2 Tabbed interface (hidden md:block)             ║
            ╚══════════════════════════════════════════════════════════════╝ */}
        <div className="hidden md:block">
          {/* Tab selectors */}
          <div className="grid grid-cols-3 gap-3 md:gap-4 mb-12">
            {TAB_CARDS.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`group relative text-left rounded-2xl p-5 md:p-6 transition-all duration-200 ${
                  activeTab === i
                    ? 'bg-[#0D4D4D] shadow-lg shadow-[#0D4D4D]/20 scale-[1.02]'
                    : 'bg-[#F8F9FA] hover:bg-gray-100 hover:shadow-md hover:scale-[1.01]'
                }`}
              >
                {activeTab === i && (
                  <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full" style={{ backgroundColor: tab.accent }} />
                )}
                <div className="flex items-start gap-3.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    activeTab === i ? 'bg-white/15' : 'bg-[#0D4D4D]/8'
                  }`}>
                    <svg className={`w-5 h-5 ${activeTab === i ? 'text-white' : 'text-[#0D4D4D]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className={`text-base md:text-lg font-extrabold mb-1 ${
                      activeTab === i ? 'text-white' : 'text-[#0D4D4D]'
                    }`}>
                      {tab.label}
                    </h3>
                    <p className={`text-sm leading-snug ${
                      activeTab === i ? 'text-white/70' : 'text-[#6B7280]'
                    }`}>
                      {tab.teaser}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Retention tab */}
          {activeTab === 0 && (
            <div>
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full mb-6">
                  <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Retention</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                  Two Layers of Protection. <span className="text-[#3DD6C3]">Zero Effort.</span>
                </h2>
                <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
                  First, automated touchpoints prevent churn before it starts. Then, if a policy still slips — AI catches it and fights to save it.
                </p>
              </div>
              <div className="mb-16">
                <div className="flex items-center gap-3 mb-6"><div className="h-px flex-1 bg-gray-200"></div><span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide px-3">Layer 1 · Prevention</span><div className="h-px flex-1 bg-gray-200"></div></div>
                <p className="text-center text-[#6B7280] mb-10 text-lg"><span className="text-[#0D4D4D] font-bold">7+ personalized touchpoints per year</span>, per client — completely automatic.</p>
                <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
                  <div className="flex flex-col items-center">
                    <p className="text-[#6B7280] text-xs text-center mb-4 uppercase tracking-[0.2em] font-medium">What your clients receive</p>
                    <div className="w-[272px] h-[540px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
                      <div key={activeHoliday} className="w-full h-full rounded-[2.5rem] overflow-hidden relative" style={{ background: activeTheme.gradient }}>
                        {activeTheme.floatingEmoji.map((em: string, i: number) => (
                          <span key={i} className="absolute text-xl pointer-events-none" style={{ left: `${10 + i * 25}%`, animation: `floatDrift ${6 + i * 2}s ease-in-out infinite`, animationDelay: `${i * 1.8}s`, opacity: 0 }}>{em}</span>
                        ))}
                        <div className="flex flex-col items-center justify-center h-full px-5 text-center relative z-10">
                          <div className="w-[88px] h-[88px] rounded-full border-[3px] border-white/40 bg-white/15 flex items-center justify-center mb-5" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
                            <span className="text-[36px] font-bold text-white">D</span>
                          </div>
                          <p className="text-white font-bold text-[15px] mb-0.5">Daniel Roberts</p>
                          <p className="text-white/60 text-[11px] mb-5">Roberts Insurance Agency</p>
                          <p className="text-white font-extrabold text-[21px] leading-tight mb-3">{activeTheme.greeting}</p>
                          <p className="text-white/80 text-[12px] leading-relaxed mb-6 px-1">{activeTheme.body}</p>
                          <div className="px-6 py-2.5 rounded-xl text-[13px] font-bold shadow-md" style={{ backgroundColor: activeTheme.accent, color: ['#FFFFFF', '#FFD700', '#C0C0C0', '#FFB6C1', '#DAA520'].includes(activeTheme.accent) ? '#1A1A2E' : '#FFFFFF' }}>
                            Book your appointment
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 mt-6">
                      {Object.entries(holidayThemes).map(([key, theme]) => (
                        <button key={key} onClick={() => setActiveHoliday(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${activeHoliday === key ? 'bg-[#0D4D4D] text-white shadow-md scale-105' : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'}`}>
                          {theme.emoji} {theme.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4 lg:pt-8">
                    <div className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-shadow flex items-start gap-4"><div className="text-2xl flex-shrink-0 mt-0.5">🎄🎆❤️🎇🦃</div><div><h3 className="text-base font-bold text-[#0D4D4D] mb-1">Holiday Cards</h3><p className="text-[#6B7280] text-sm leading-relaxed">Beautiful full-screen cards for 5 major holidays — with your photo, your agency, and a booking link. Sent automatically.</p></div></div>
                    <div className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-shadow flex items-start gap-4"><div className="text-2xl flex-shrink-0 mt-0.5">🎂</div><div><h3 className="text-base font-bold text-[#0D4D4D] mb-1">Birthday Messages</h3><p className="text-[#6B7280] text-sm leading-relaxed">Personalized birthday greetings with balloon animations, sent automatically to every client. Never forget again.</p></div></div>
                    <div className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-shadow flex items-start gap-4"><div className="text-2xl flex-shrink-0 mt-0.5">📋</div><div><h3 className="text-base font-bold text-[#0D4D4D] mb-1">Anniversary Alerts</h3><p className="text-[#6B7280] text-sm leading-relaxed">Get alerted 30 days before every policy anniversary — the perfect time to review and offer a rewrite.</p></div></div>
                    <div className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-shadow flex items-start gap-4"><div className="text-2xl flex-shrink-0 mt-0.5">📱</div><div><h3 className="text-base font-bold text-[#0D4D4D] mb-1">Push Notifications</h3><p className="text-[#6B7280] text-sm leading-relaxed">Send messages directly to your clients&apos; phones. Custom notifications, reminders, and announcements — anytime.</p></div></div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-6"><div className="h-px flex-1 bg-gray-200"></div><span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide px-3">Layer 2 · Rescue</span><div className="h-px flex-1 bg-gray-200"></div></div>
                <p className="text-center text-[#6B7280] mb-8 text-lg">When a policy <em>does</em> lapse — <span className="text-[#0D4D4D] font-bold">forward the carrier email. AI handles the rest.</span></p>
                <div className="bg-[#0D4D4D] rounded-3xl p-8 md:p-10 relative overflow-hidden">
                  <div className="absolute inset-0"><div className="absolute bottom-0 left-10 w-64 h-64 bg-[#fdcc02] rounded-full blur-[120px] opacity-10"></div></div>
                  <div className="relative grid md:grid-cols-3 gap-5">
                    <div className="text-center md:text-left"><div className="w-10 h-10 bg-[#fdcc02] rounded-full flex items-center justify-center text-lg font-bold text-[#0D4D4D] mb-3 mx-auto md:mx-0">1</div><h4 className="text-white font-bold mb-2">Forward the Alert</h4><p className="text-white/60 text-sm leading-relaxed">Forward the carrier&apos;s conservation notice to <span className="text-[#fdcc02] font-semibold">ai@savepolicy.agentforlife.app</span> or paste it in your dashboard.</p></div>
                    <div className="text-center md:text-left"><div className="w-10 h-10 bg-[#3DD6C3] rounded-full flex items-center justify-center text-lg font-bold text-[#0D4D4D] mb-3 mx-auto md:mx-0">2</div><h4 className="text-white font-bold mb-2">AI Extracts &amp; Matches</h4><p className="text-white/60 text-sm leading-relaxed">AI pulls client name, policy number, carrier, and reason — auto-matches to your records and flags chargeback risks.</p></div>
                    <div className="text-center md:text-left"><div className="w-10 h-10 bg-[#fdcc02] rounded-full flex items-center justify-center text-lg font-bold text-[#0D4D4D] mb-3 mx-auto md:mx-0">3</div><h4 className="text-white font-bold mb-2">Client Gets Reached</h4><p className="text-white/60 text-sm leading-relaxed">Personalized push + text within 2 hours. AI follows up on Day 2, 5, and 7 with different angles.</p></div>
                  </div>
                  <div className="relative grid sm:grid-cols-2 gap-3 mt-8 pt-8 border-t border-white/10">
                    <div className="flex items-center gap-3"><svg className="w-5 h-5 text-[#fdcc02] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg><span className="text-white/70 text-sm">Chargeback-risk policies get auto-outreach in 2 hours</span></div>
                    <div className="flex items-center gap-3"><svg className="w-5 h-5 text-[#3DD6C3] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-white/70 text-sm">Mark policies as &quot;Saved&quot; or &quot;Lost&quot; from your dashboard</span></div>
                  </div>
                </div>
              </div>
              <div className="text-center mt-10"><p className="text-[#6B7280] text-lg">Other agents let chargebacks eat into their income or spend time chasing instead of moving forward. <span className="text-[#0D4D4D] font-bold">You forward one email and your AI system identifies the client, sends personalized outreach, and follows up until the policy is saved.</span></p></div>
            </div>
          )}

          {/* Referrals tab */}
          {activeTab === 1 && (
            <div>
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6"><span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Referrals</span></div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">From <span className="text-[#3DD6C3]">One Tap</span> to <span className="text-[#fdcc02]">Booked Appointment</span></h2>
                <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">Your clients already trust you. Now they can share that trust — and your AI handles the rest. Hot lead, zero phone tag.</p>
              </div>
              <div className="grid md:grid-cols-3 gap-6 md:gap-4 mb-16">
                <div className="bg-[#0D4D4D] rounded-3xl p-8"><div className="w-12 h-12 bg-[#fdcc02] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">1</div><h3 className="text-xl font-bold text-white mb-3">One Tap, One Contact</h3><p className="text-white/70 leading-relaxed">Your client taps the referral button in their app and picks a friend or family member from their contacts. That&apos;s all they do.</p></div>
                <div className="bg-[#0D4D4D] rounded-3xl p-8"><div className="w-12 h-12 bg-[#3DD6C3] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">2</div><h3 className="text-xl font-bold text-white mb-3">Warm Intro + Your Card</h3><p className="text-white/70 leading-relaxed">A personal text goes out from your client — a warm introduction about you, with <span className="text-white font-semibold">your business card attached</span>. Not a cold link. A trusted recommendation.</p></div>
                <div className="bg-[#0D4D4D] rounded-3xl p-8 border border-[#fdcc02]/30 relative"><div className="absolute top-4 right-4"><span className="px-2 py-1 bg-[#fdcc02] text-[#0D4D4D] text-[10px] font-bold rounded-full uppercase">AI Powered</span></div><div className="w-12 h-12 bg-[#fdcc02] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">3</div><h3 className="text-xl font-bold text-white mb-3">AI Books the Appointment</h3><p className="text-white/70 leading-relaxed">Your <span className="text-white font-semibold">AI assistant</span> reaches out via iMessage — texting as you. It builds trust through conversation, gathers their info, and books them on your calendar. <span className="text-[#fdcc02] font-semibold">You just show up and close.</span></p></div>
              </div>
              <div ref={smsRef}>
                <p className="text-[#6B7280] text-xs text-center mb-8 uppercase tracking-[0.2em] font-medium">What the referral sees</p>
                <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto items-start">
                  <div>
                    <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-gray-200/20">
                      <div className="bg-[#111] rounded-t-[1.6rem] px-5 pt-3 pb-2 flex items-center justify-between"><span className="text-white/40 text-[10px] font-medium">9:41 AM</span><div className="flex gap-0.5"><div className="w-1 h-2 bg-white/40 rounded-sm"></div><div className="w-1 h-2.5 bg-white/40 rounded-sm"></div><div className="w-1 h-3 bg-white/40 rounded-sm"></div><div className="w-1 h-3.5 bg-white/30 rounded-sm"></div></div></div>
                      <div className="bg-[#111] px-5 pb-3 border-b border-white/5"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center"><svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div><div><p className="text-white text-sm font-semibold">Sarah, Daniel, Mike</p><p className="text-white/30 text-[10px]">Group Message</p></div></div></div>
                      <div className="bg-[#111] px-4 py-4 space-y-3 rounded-b-[1.6rem] min-h-[180px]"><div className="flex justify-end" style={fade(0)}><div className="bg-[#007AFF] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white/60 text-[10px] mb-0.5 font-medium">Sarah</p><p className="text-white text-[13px] leading-relaxed">Hey Mike, I wanted to connect you with my insurance agent Daniel. He helped me get my family&apos;s finances protected and I thought he might be able to help you too. He&apos;ll probably reach out!</p></div></div></div>
                    </div>
                    <p className="text-center text-[#6B7280]/60 text-xs mt-3 font-medium">Personal text — warm intro from your client</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-3" style={fade(2)}><div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#3DD6C3]/30"></div><div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full"><svg className="w-3 h-3 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg><span className="text-[#3DD6C3] text-[10px] font-bold uppercase tracking-wider">AI takes over in minutes</span></div><div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#3DD6C3]/30"></div></div>
                    <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-[#3DD6C3]/20">
                      <div className="bg-[#111] rounded-t-[1.6rem] px-5 pt-3 pb-2 flex items-center justify-between"><span className="text-white/40 text-[10px] font-medium">9:44 AM</span><div className="flex gap-0.5"><div className="w-1 h-2 bg-white/40 rounded-sm"></div><div className="w-1 h-2.5 bg-white/40 rounded-sm"></div><div className="w-1 h-3 bg-white/40 rounded-sm"></div><div className="w-1 h-3.5 bg-white/30 rounded-sm"></div></div></div>
                      <div className="bg-[#111] px-5 pb-3 border-b border-white/5"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full bg-[#005851] flex items-center justify-center"><span className="text-[#3DD6C3] text-xs font-bold">D</span></div><div><p className="text-white text-sm font-semibold">Daniel</p><p className="text-white/30 text-[10px]">AI Referral Assistant</p></div></div></div>
                      <div className="bg-[#111] px-4 py-4 space-y-2.5 rounded-b-[1.6rem]">
                        <div className="flex justify-end" style={fade(2)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white text-[13px] leading-relaxed">Hey Mike, this is Daniel. Sarah mentioned she connected us — I helped her family get some protection in place and she thought I might be able to help you too. Would you be open to a couple quick questions to see if it makes sense for us to chat?</p></div></div>
                        <div className="flex justify-start" style={fade(3)}><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white text-[13px]">yeah sure</p></div></div>
                        <div className="flex justify-end" style={fade(4)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white text-[13px] leading-relaxed">Appreciate that. What would be most important to you when it comes to protecting your family financially?</p></div></div>
                        <div className="flex justify-start" style={fade(5)}><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white text-[13px] leading-relaxed">mostly making sure my wife and kids are taken care of if something happens to me</p></div></div>
                        <div className="flex justify-end" style={fade(6, true)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[12px] leading-relaxed">Do you have any coverage in place right now?</p></div></div>
                        <div className="flex justify-start" style={fade(7, true)}><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[12px]">just what I get through work</p></div></div>
                        <div className="flex justify-end" style={fade(8, true)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[12px] leading-relaxed">Got it. Do you own or rent your home?</p></div></div>
                        <div className="flex justify-start" style={fade(9, true)}><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[12px]">own — mortgage is around $280k</p></div></div>
                        <div className="flex justify-end" style={fade(10, true)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[12px] leading-relaxed">How old are your kids?</p></div></div>
                        <div className="flex justify-start" style={fade(11, true)}><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[12px]">4 and 7</p></div></div>
                        <div className="flex justify-end" style={fade(12, true)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[12px] leading-relaxed">And would you say you&apos;re in pretty good health overall?</p></div></div>
                        <div className="flex justify-start" style={fade(13, true)}><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[12px]">yeah no major issues</p></div></div>
                        <div className="flex justify-end" style={fade(14)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white text-[13px] leading-relaxed">Really appreciate you sharing all that, Mike. Based on what you&apos;ve told me, I think a quick 15-min call would be worth it so I can show you a couple options. Here&apos;s my calendar — pick whatever time works best:</p><p className="text-[#3DD6C3] text-[13px] mt-1.5 underline">calendly.com/daniel</p></div></div>
                      </div>
                    </div>
                    <p className="text-center text-[#6B7280]/60 text-xs mt-3 font-medium">1-on-1 — AI qualifies &amp; books the appointment</p>
                  </div>
                </div>
                <div className="max-w-2xl mx-auto mt-10" style={fade(14)}><div className="bg-[#0D4D4D]/5 border border-[#0D4D4D]/10 rounded-2xl p-5 flex items-start gap-4"><div className="w-10 h-10 bg-[#3DD6C3]/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"><svg className="w-5 h-5 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div><div><p className="text-[#0D4D4D] font-semibold text-sm mb-1">The referral thinks they&apos;re texting you</p><p className="text-[#6B7280] text-sm leading-relaxed">Your AI assistant reaches out via iMessage — warm, personal, and natural. It qualifies the lead through conversation, gathers their info, and books the appointment on your calendar. You just show up and close.</p></div></div></div>
              </div>
              <div className="mt-12 bg-[#0D4D4D] rounded-2xl p-8 md:p-10 text-center max-w-3xl mx-auto">
                <p className="text-white/40 text-sm uppercase tracking-[0.15em] font-medium mb-3">And if they don&apos;t reply?</p>
                <h3 className="text-2xl md:text-3xl font-extrabold text-white mb-3">Your AI <span className="text-[#3DD6C3]">doesn&apos;t give up.</span></h3>
                <p className="text-white/70 max-w-xl mx-auto mb-6">If the referral goes quiet, your AI automatically follows up — each message more direct than the last. You don&apos;t lift a finger.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <span className="px-4 py-2 bg-white/10 rounded-full text-white/80 text-sm font-medium">Day 2 · Gentle nudge</span>
                  <span className="px-4 py-2 bg-white/10 rounded-full text-white/80 text-sm font-medium">Day 5 · New angle</span>
                  <span className="px-4 py-2 bg-[#fdcc02]/20 border border-[#fdcc02]/30 rounded-full text-[#fdcc02] text-sm font-medium">Day 8 · Direct ask</span>
                </div>
              </div>
            </div>
          )}

          {/* Rewrites tab */}
          {activeTab === 2 && (
            <div>
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D4D4D] rounded-full mb-6"><span className="text-[#3DD6C3] font-bold text-sm uppercase tracking-wide">Rewrites</span></div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">Every Anniversary Is a <span className="text-[#3DD6C3]">Booked Appointment</span>.</h2>
                <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">30 days before the one-year mark, your client hears from you — not the carrier. The rewrite comes to you, not the other way around.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div className="flex gap-4"><div className="flex-shrink-0"><div className="w-12 h-12 bg-[#0D4D4D] rounded-2xl flex items-center justify-center"><svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg></div></div><div><h3 className="text-lg font-bold text-[#0D4D4D] mb-1">You Get the Heads-Up</h3><p className="text-[#6B7280] leading-relaxed">30 days before a policy anniversary, you get an email digest with every upcoming renewal. No spreadsheets. No manual tracking.</p></div></div>
                  <div className="flex gap-4"><div className="flex-shrink-0"><div className="w-12 h-12 bg-[#0D4D4D] rounded-2xl flex items-center justify-center"><svg className="w-6 h-6 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg></div></div><div><h3 className="text-lg font-bold text-[#0D4D4D] mb-1">Your Client Gets a Notification</h3><p className="text-[#6B7280] leading-relaxed">A personalized push notification goes to their phone — letting them know you may have found a lower price for the same coverage, with a link to book on your calendar.</p></div></div>
                  <div className="flex gap-4"><div className="flex-shrink-0"><div className="w-12 h-12 bg-[#0D4D4D] rounded-2xl flex items-center justify-center"><svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div></div><div><h3 className="text-lg font-bold text-[#0D4D4D] mb-1">They Book Themselves</h3><p className="text-[#6B7280] leading-relaxed">The client taps through to your scheduling link and picks a time. The rewrite conversation starts with <em>them</em> reaching out to <em>you</em>.</p></div></div>
                </div>
                <div className="bg-[#F8F9FA] rounded-3xl p-8 border border-gray-200 shadow-lg">
                  <div className="text-center mb-6"><p className="text-sm text-[#6B7280] font-medium uppercase tracking-wide mb-2">You choose the tone</p><div className="inline-flex rounded-xl overflow-hidden border border-gray-200"><div className="px-5 py-3 bg-[#0D4D4D] text-white text-sm font-semibold">Lower Price Alert</div><div className="px-5 py-3 bg-white text-[#6B7280] text-sm font-medium">Warm Check-In</div></div></div>
                  <div className="bg-white rounded-2xl p-5">
                    <div className="flex items-start gap-3 mb-4"><div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0"><span className="text-[#3DD6C3] text-xs font-bold">D</span></div><div><p className="text-[#0D4D4D] font-semibold text-sm">Daniel Roberts</p><p className="text-[#6B7280] text-xs">Your Agent</p></div></div>
                    <div className="bg-[#F8F9FA] rounded-xl p-4 border border-gray-100"><p className="text-[#0D4D4D] text-sm leading-relaxed">&quot;Hey Sarah! Your policy anniversary is coming up and I&apos;ve been seeing some <span className="font-bold text-[#3DD6C3]">lower rates for the same coverage</span>. Want me to run the numbers? It&apos;ll take 10 minutes — tap below to grab a time on my calendar.&quot;</p></div>
                    <div className="mt-4 text-center"><div className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3DD6C3] text-[#0D4D4D] text-sm font-bold rounded-xl"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>Book with Daniel</div></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            YOUR COMMAND CENTER (shared, both viewports)
            ═══════════════════════════════════════════════════════════ */}
        <div className="mt-16 bg-[#0D4D4D] rounded-3xl p-6 md:p-10 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 right-10 w-64 h-64 bg-[#3DD6C3] rounded-full blur-[120px] opacity-10" />
          </div>
          <div className="relative grid md:grid-cols-[1fr_1.2fr] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full mb-4">
                <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span className="text-white/70 text-xs font-bold uppercase tracking-wide">Your Dashboard</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-extrabold text-white mb-3">Your Command Center. <span className="text-[#3DD6C3]">One Screen.</span></h3>
              <p className="text-white/60 text-sm leading-relaxed mb-5">Conservation alerts, referral pipeline, client management, policy tracking — everything in one clean dashboard.</p>
              <div className="flex flex-wrap gap-2">
                {[{ label: 'Clients', color: '#3DD6C3' }, { label: 'Policies', color: '#fdcc02' }, { label: 'Alerts', color: '#EF4444' }, { label: 'Import', color: '#3DD6C3' }].map((b) => (
                  <span key={b.label} className="px-3 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-white/80">{b.label}</span>
                ))}
              </div>
            </div>
            <div className="hidden md:block">
              <div className="bg-[#1a1a2e] rounded-xl overflow-hidden border border-white/10 shadow-xl">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-[#111] border-b border-white/5"><div className="w-2 h-2 rounded-full bg-[#FF5F57]"></div><div className="w-2 h-2 rounded-full bg-[#FEBC2E]"></div><div className="w-2 h-2 rounded-full bg-[#28C840]"></div><div className="flex-1 mx-2"><div className="bg-white/10 rounded px-2 py-0.5 text-white/30 text-[9px] font-mono">agentforlife.app/dashboard</div></div></div>
                <div className="bg-[#F8F9FA] p-3">
                  <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-1.5"><span className="text-[#0D4D4D] font-bold text-[11px]">Conservation Alerts</span><span className="px-1.5 py-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full">3</span></div></div>
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {[{ init: 'S', name: 'Sarah J.', issue: 'Payment lapsed', status: 'Outreach sent', sc: '#3DD6C3' }, { init: 'M', name: 'Mike D.', issue: 'Carrier notice', status: 'AI reviewing', sc: '#F59E0B' }, { init: 'R', name: 'Robert C.', issue: 'Resolved', status: 'Saved \u2713', sc: '#22C55E' }].map((c, i) => (
                      <div key={i} className={`flex items-center justify-between px-2.5 py-2 text-[10px] ${i < 2 ? 'border-b border-gray-50' : ''}`}><div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded-full bg-[#0D4D4D] flex items-center justify-center"><span className="text-white text-[7px] font-bold">{c.init}</span></div><span className="text-[#0D4D4D] font-semibold">{c.name}</span></div><span className="text-[#6B7280] text-[9px]">{c.issue}</span><span className="px-1.5 py-0.5 rounded-full text-[8px] font-semibold" style={{ backgroundColor: `${c.sc}18`, color: c.sc }}>{c.status}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
