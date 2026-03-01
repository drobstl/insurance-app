'use client';

import Link from 'next/link';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';

const IMESSAGE_DELAYS = [800, 1000, 800, 1200, 800, 400, 1000];

const FAQ_ITEMS = [
  { question: 'How can insurance agents improve client retention?', answer: 'Agent For Life sends 7+ automated touchpoints per year per client — holiday cards for 5 major holidays, personalized birthday messages, and policy anniversary alerts — all as push notifications directly to their phone. When a policy does lapse or get canceled, Conservation Alerts kick in: forward the carrier notice and AI reaches out to your client within hours. Combine that with a branded app where they can view policies and contact you instantly, and you become irreplaceable instead of forgettable.' },
  { question: 'How do I get more referrals from existing clients?', answer: "Make it effortless. Your clients tap one button, pick a contact, and send a warm personal text — with your business card attached. Then your AI reaches out separately via iMessage, has a qualifying conversation, gathers their info, and books an appointment on your calendar. If the referral doesn't reply, AI automatically follows up on Day 2, 5, and 8. You just show up and close." },
  { question: 'What is the AI Referral Assistant?', answer: "When your client refers someone, the AI reaches out via iMessage (blue bubbles, ~99% read rate) in a separate 1-on-1 thread — responding as you, warm and conversational. It builds trust through a qualifying conversation, learns what coverage they need, and shares your scheduling link to book a call. The referral thinks they're texting you directly." },
  { question: 'How do insurance agents generate rewrites?', answer: "Agent For Life alerts you as each policy's one-year anniversary hits — the moment you're free to rewrite without owing back commission. Your client gets a push notification that you may have found them a lower price for the same coverage, with a link to book on your calendar. The goal is to book within 24–48 hours." },
  { question: 'How do I stop insurance chargebacks and policy cancellations?', answer: "Chargebacks happen when relationships go cold. Agent For Life attacks this on two fronts: 7+ automated touchpoints per year keep you top-of-mind so clients never feel forgotten. And when a policy does lapse, Conservation Alerts catch it — forward the carrier notice and AI sends personalized outreach within hours to save the policy before a chargeback hits." },
  { question: 'How hard is it to get started?', answer: "You can be up and running in 10 minutes. Import your existing clients via CSV spreadsheet or upload PDF insurance applications — our AI extracts client info, policy details, and beneficiaries automatically. Enable the AI referral assistant with one toggle and share your branded app code with clients — you're live." },
  { question: 'What exactly is Agent For Life?', answer: "It's a complete client relationship system built for insurance agents. You get: a branded mobile app for your clients, automated touchpoints (holidays, birthdays, anniversaries), one-tap referrals with an AI assistant that qualifies leads via iMessage and books appointments, conservation alerts that rescue at-risk policies, anniversary rewrite alerts that turn renewals into booked appointments, CSV import, PDF parsing, push notifications, and a web dashboard to manage it all — normally $49/month, but free for life for our first 50 founding members." },
  { question: 'What carriers does it work with?', answer: "All of them. Agent For Life is carrier-agnostic. You add policy details in the dashboard (or upload a PDF and AI does it). This works for independent agents regardless of which carriers you're appointed with." },
];

const HOLIDAYS: Record<string, { gradient: string; emoji: string; label: string; greeting: string; body: string; floatingEmoji: string[]; accent: string }> = {
  christmas: { gradient: 'linear-gradient(135deg, #8B0000, #C41E3A, #A0153E)', emoji: '🎄', label: 'Christmas', greeting: 'Merry Christmas, Sarah!', body: 'Wishing you and your family a season full of warmth, joy, and time together.', floatingEmoji: ['❄️', '🎄', '⭐'], accent: '#D4A843' },
  newyear: { gradient: 'linear-gradient(135deg, #0B1A3E, #162D6E, #1A3A8A)', emoji: '🎆', label: "New Year's", greeting: 'Happy New Year, Sarah!', body: "Here's to a fresh start and a year full of good things.", floatingEmoji: ['🎆', '✨', '🎇'], accent: '#C0C0C0' },
  valentines: { gradient: 'linear-gradient(135deg, #9B1B30, #D63B5C, #E8839B)', emoji: '💝', label: "Valentine's", greeting: "Happy Valentine's Day, Sarah!", body: 'Today is all about the people who matter most.', floatingEmoji: ['❤️', '💕', '💖'], accent: '#FFB6C1' },
  july4th: { gradient: 'linear-gradient(135deg, #002868, #BF0A30, #002868)', emoji: '🇺🇸', label: '4th of July', greeting: 'Happy 4th of July, Sarah!', body: 'Wishing you a day full of good food, great company, and fireworks.', floatingEmoji: ['🇺🇸', '🎆', '⭐'], accent: '#FFFFFF' },
  thanksgiving: { gradient: 'linear-gradient(135deg, #8B4513, #BF6A20, #D4892A)', emoji: '🍂', label: 'Thanksgiving', greeting: 'Happy Thanksgiving, Sarah!', body: "I'm grateful for the trust you place in me.", floatingEmoji: ['🍂', '🍁', '🍃'], accent: '#DAA520' },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.02, y: -4, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

function WaveDivider({ from, to }: { from: string; to: string }) {
  return (
    <div className="relative w-full overflow-hidden" style={{ marginTop: -1 }}>
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="w-full h-[80px] md:h-[120px] block" style={{ display: 'block' }}>
        <path d="M0,0 L0,60 Q360,120 720,60 Q1080,0 1440,60 L1440,0 Z" fill={from} />
        <path d="M0,60 Q360,120 720,60 Q1080,0 1440,60 L1440,120 L0,120 Z" fill={to} />
      </svg>
    </div>
  );
}

export default function DesktopLanding() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [msgStep, setMsgStep] = useState(-1);
  const [activeHoliday, setActiveHoliday] = useState('christmas');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const chatTriggered = useRef(false);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
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

  const msgFade = useCallback((step: number): React.CSSProperties => ({
    opacity: msgStep >= step ? 1 : 0,
    transform: msgStep >= step ? 'translateY(0)' : 'translateY(10px)',
    transition: 'all 450ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  }), [msgStep]);

  const spots = spotsRemaining ?? 50;
  const holiday = HOLIDAYS[activeHoliday];

  return (
    <div className="min-h-screen bg-[#0D4D4D] overflow-x-hidden font-sans">

      {/* ═══════════════════════════════════════════════════
         FIXED TOP NAVIGATION
         ═══════════════════════════════════════════════════ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${navScrolled ? 'bg-[#0D4D4D]/95 backdrop-blur-md shadow-lg shadow-black/10 border-b border-white/5' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-8 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="AgentForLife" className="w-[48px] h-[28px] object-contain" />
            <span className="text-white/90 brand-title text-lg tracking-wide">AgentForLife</span>
          </div>
          <div className="hidden lg:flex items-center gap-8">
            <a href="#how-it-works" className="text-white/50 text-sm font-medium hover:text-white/80 transition-colors">How It Works</a>
            <a href="#pricing" className="text-white/50 text-sm font-medium hover:text-white/80 transition-colors">Pricing</a>
            <a href="#faq" className="text-white/50 text-sm font-medium hover:text-white/80 transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-white/60 text-sm font-medium hover:text-white transition-colors">Login</Link>
            <Link
              href="/founding-member/d"
              className="px-6 py-2.5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-sm font-bold rounded-full transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:shadow-[#fdcc02]/25"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════
         HERO — Two-Column Layout
         ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center pt-[72px] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.15]" />
          <div className="absolute bottom-20 -right-40 w-[500px] h-[500px] bg-[#fdcc02] rounded-full blur-[200px] opacity-[0.06]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#3DD6C3] rounded-full blur-[300px] opacity-[0.04]" />
        </div>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '64px 64px' }} />

        <div className="relative z-10 max-w-7xl mx-auto px-8 w-full grid lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16 lg:py-0">
          {/* Left — Copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-8"
            >
              <div className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-[#fdcc02]/15 border border-[#fdcc02]/25 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-[#fdcc02] opacity-75" />
                  <span className="relative rounded-full h-2 w-2 bg-[#fdcc02]" />
                </span>
                <span className="text-[#fdcc02] font-bold text-xs tracking-wide">
                  {spotsRemaining !== null ? `${spots} of 50 Free Spots Left` : 'Free Lifetime Spots Open'}
                </span>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
              className="text-5xl lg:text-6xl font-extrabold text-white leading-[1.08] tracking-tight mb-6"
            >
              Chargebacks happen when clients forget{' '}
              <span className="text-[#3DD6C3]">you exist.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="text-white/50 text-lg leading-relaxed mb-10 max-w-[500px]"
            >
              We built a system that makes sure they never do. Automated retention. AI&#8209;powered referrals. Complete autopilot.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.65 }}
              className="flex flex-wrap items-center gap-4"
            >
              <Link
                href="/founding-member/d"
                className="inline-flex items-center gap-3 px-8 py-4 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg font-bold rounded-full shadow-xl shadow-[#fdcc02]/25 transition-all duration-200 hover:scale-[1.03]"
              >
                Lock In My Free Spot
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
              <p className="text-white/30 text-sm">
                {spotsRemaining !== null ? `${spots} spots left` : 'Limited spots'} · $0 forever · No credit card
              </p>
            </motion.div>
          </div>

          {/* Right — Phone Mockup with Video */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const }}
            className="flex justify-center lg:justify-end"
          >
            <div className="relative">
              <div className="absolute -inset-4 rounded-[3.5rem] bg-gradient-to-b from-[#3DD6C3]/20 via-[#3DD6C3]/5 to-[#fdcc02]/10 blur-xl pointer-events-none" />
              <div className="w-[260px] h-[530px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a] relative">
                <div className="absolute -inset-2 rounded-[3.3rem] bg-gradient-to-b from-[#3DD6C3]/15 via-transparent to-[#fdcc02]/10 pointer-events-none blur-sm" />
                <div className="w-full h-full bg-[#111] rounded-[2.5rem] overflow-hidden relative">
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    poster="/app-preview-poster.jpeg"
                    className="w-full h-full object-cover"
                  >
                    <source src="/app-preview.webm" type="video/webm" />
                    <source src="/app-preview.mp4" type="video/mp4" />
                  </video>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" /></svg>
        </motion.div>
      </section>

      {/* Wave Divider */}
      <WaveDivider from="#0D4D4D" to="#ffffff" />

      {/* ═══════════════════════════════════════════════════
         THE PROBLEM — Three Cards in a Row
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-white px-8 py-24 md:py-32">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} custom={0} className="text-center mb-16">
              <p className="text-red-400 font-bold text-xs uppercase tracking-[0.2em] mb-4">The uncomfortable truth</p>
              <h2 className="text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] leading-tight">
                Here&apos;s what&apos;s costing you money <span className="text-red-400">right now</span>.
              </h2>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mb-12">
              {[
                { num: '01', title: 'Silence.', body: 'After the close, you become a name they\'ll never call. Then a lapse notice hits — and a chargeback follows.', accent: '#FF5F57' },
                { num: '02', title: 'Dead referrals.', body: 'You ask clients to refer friends. They say "sure." They never do. The few who try? The lead goes cold.', accent: '#FEBC2E' },
                { num: '03', title: 'Missed rewrites.', body: 'Every policy anniversary is a lay-down sale. With no system to flag it, the carrier auto-renews and you miss out.', accent: '#fdcc02' },
              ].map((card, i) => (
                <motion.div
                  key={card.num}
                  variants={fadeUp}
                  custom={0.1 + i * 0.1}
                  whileHover="hover"
                  initial="rest"
                  animate="rest"
                >
                  <motion.div variants={cardHover} className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-lg transition-shadow duration-300 h-full">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6" style={{ backgroundColor: `${card.accent}15` }}>
                      <span className="text-sm font-black" style={{ color: card.accent }}>{card.num}</span>
                    </div>
                    <h3 className="text-xl font-extrabold text-[#0D4D4D] mb-3">{card.title}</h3>
                    <p className="text-[#6B7280] text-base leading-relaxed">{card.body}</p>
                  </motion.div>
                </motion.div>
              ))}
            </div>

            <motion.div variants={fadeUp} custom={0.4} className="text-center">
              <p className="text-2xl font-extrabold text-[#0D4D4D]">
                We built a system that{' '}
                <span className="text-[#3DD6C3]">fixes all three</span>.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         THE SYSTEM — Three Feature Cards in a Row
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#070E1B] px-8 py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 -left-40 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[250px] opacity-[0.08]" />
          <div className="absolute bottom-0 -right-20 w-[400px] h-[400px] bg-[#fdcc02] rounded-full blur-[200px] opacity-[0.05]" />
        </div>

        <div className="max-w-6xl mx-auto relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} custom={0} className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/10 rounded-full mb-6">
                <span className="text-[#3DD6C3] font-bold text-xs uppercase tracking-wide">The System</span>
              </div>
              <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
                One System. Three Revenue Streams.
              </h2>
              <p className="text-white/40 text-lg max-w-xl mx-auto">A branded app on their phone. An AI that never sleeps.</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
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
                  whileHover="hover"
                  initial="rest"
                  animate="rest"
                >
                  <motion.div variants={cardHover} className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-8 border border-white/[0.08] hover:bg-white/[0.07] transition-colors duration-300 h-full">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${f.accent}15` }}>
                        <svg className="w-6 h-6" style={{ color: f.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.icon} /></svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-extrabold text-white">{f.title}</h3>
                        <div className="h-0.5 w-10 rounded-full mt-1" style={{ backgroundColor: f.accent }} />
                      </div>
                    </div>
                    <div className="mb-5">
                      <span className="text-3xl font-black" style={{ color: f.accent }}>{f.stat}</span>
                      <span className="text-xs text-white/30 uppercase tracking-wide ml-2">{f.statLabel}</span>
                    </div>
                    <p className="text-white/50 text-base leading-relaxed">{f.desc}</p>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         AI REFERRAL DEMO — Two-Column
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#0D4D4D] px-8 py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.08]" />
          <div className="absolute bottom-20 left-0 w-[300px] h-[300px] bg-[#fdcc02] rounded-full blur-[160px] opacity-[0.05]" />
        </div>

        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left — Steps & Text */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02]/15 border border-[#fdcc02]/25 rounded-full mb-6">
                  <svg className="w-4 h-4 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <span className="text-white font-bold text-xs uppercase tracking-wide">AI Referrals</span>
                </div>
                <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
                  From one tap to<br />booked appointment.
                </h2>
                <p className="text-white/40 text-lg leading-relaxed mb-10 max-w-md">
                  Your client taps &ldquo;Refer.&rdquo; AI handles the conversation via iMessage. You show up and close.
                </p>
              </motion.div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={stagger}
                className="space-y-4 mb-10"
              >
                {[
                  { num: '1', label: 'Client taps "Refer" in your branded app', color: '#fdcc02' },
                  { num: '2', label: 'AI qualifies the lead via iMessage (~99% read rate)', color: '#3DD6C3' },
                  { num: '3', label: 'Appointment booked on your calendar automatically', color: '#fdcc02' },
                ].map((s) => (
                  <motion.div
                    key={s.num}
                    variants={fadeUp}
                    custom={0}
                    className="flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[#0D4D4D] text-sm font-bold" style={{ backgroundColor: s.color }}>
                      {s.num}
                    </div>
                    <p className="text-white/70 text-base font-medium">{s.label}</p>
                  </motion.div>
                ))}
              </motion.div>

              <div className="flex flex-wrap gap-2">
                {['Day 2 · Gentle nudge', 'Day 5 · New angle', 'Day 8 · Direct ask'].map((d, i) => (
                  <span key={d} className={`px-4 py-2 rounded-full text-xs font-medium ${i === 2 ? 'bg-[#fdcc02]/20 border border-[#fdcc02]/30 text-[#fdcc02]' : 'bg-white/10 text-white/50'}`}>{d}</span>
                ))}
              </div>
              <p className="text-white/30 text-xs mt-3">If they don&apos;t reply, AI follows up automatically.</p>
            </div>

            {/* Right — iMessage Chat Mockup */}
            <div ref={chatRef}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const }}
              >
                <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-[#3DD6C3]/15 max-w-md mx-auto lg:mx-0 lg:ml-auto">
                  <div className="bg-[#111] rounded-t-[1.75rem] px-5 pt-3 pb-2.5 flex items-center justify-between">
                    <span className="text-white/40 text-xs font-medium">9:44 AM</span>
                    <div className="flex gap-0.5">
                      <div className="w-1 h-2 bg-white/40 rounded-sm" />
                      <div className="w-1 h-2.5 bg-white/40 rounded-sm" />
                      <div className="w-1 h-3 bg-white/40 rounded-sm" />
                    </div>
                  </div>
                  <div className="bg-[#111] px-5 pb-3 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#005851] flex items-center justify-center">
                        <span className="text-[#3DD6C3] text-sm font-bold">D</span>
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold">Daniel</p>
                        <p className="text-white/30 text-xs">AI Referral Assistant</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#111] px-4 py-5 space-y-3 rounded-b-[1.75rem] min-h-[340px]">
                    <div className="flex justify-end" style={msgFade(0)}>
                      <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]">
                        <p className="text-white text-sm leading-relaxed">Hey Mike, Sarah connected us — I helped her family get protected and she thought I might be able to help you too. Open to a couple quick questions?</p>
                      </div>
                    </div>
                    <div className="flex justify-start" style={msgFade(1)}>
                      <div className="bg-[#333] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[65%]">
                        <p className="text-white text-sm">yeah sure</p>
                      </div>
                    </div>
                    <div className="flex justify-end" style={msgFade(2)}>
                      <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]">
                        <p className="text-white text-sm leading-relaxed">What matters most to you when it comes to protecting your family?</p>
                      </div>
                    </div>
                    <div className="flex justify-start" style={msgFade(3)}>
                      <div className="bg-[#333] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                        <p className="text-white text-sm">making sure my wife and kids are covered if something happens</p>
                      </div>
                    </div>
                    <div className="flex justify-end" style={msgFade(4)}>
                      <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]">
                        <p className="text-white text-sm leading-relaxed">Really appreciate that. A quick 15-min call would be worth it. Here&apos;s my calendar:</p>
                        <p className="text-[#3DD6C3] text-sm mt-1 underline" style={msgFade(5)}>calendly.com/daniel</p>
                      </div>
                    </div>
                    <div className="flex justify-center pt-3" style={msgFade(6)}>
                      <div className="flex items-center gap-2 bg-[#3DD6C3]/15 border border-[#3DD6C3]/25 rounded-full px-5 py-2">
                        <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        <span className="text-[#3DD6C3] text-xs font-bold">Appointment Booked</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-center text-white/25 text-xs mt-4">The referral thinks they&apos;re texting you.</p>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         RETENTION — Two-Column with Interactive Holiday Picker
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#F8F9FA] px-8 py-24 md:py-32">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left — Interactive Phone Mockup */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const }}
              className="flex justify-center"
            >
              <div className="relative">
                <div className="absolute -inset-4 rounded-[3.5rem] blur-xl pointer-events-none" style={{ background: holiday.gradient, opacity: 0.15 }} />
                <div className="w-[260px] h-[530px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a] relative overflow-hidden">
                  <div className="absolute -inset-2 rounded-[3.3rem] pointer-events-none blur-sm" style={{ background: `linear-gradient(to bottom, ${holiday.accent}20, transparent, ${holiday.accent}10)` }} />
                  <div className="w-full h-full rounded-[2.5rem] overflow-hidden relative" style={{ background: holiday.gradient }}>
                    {/* Floating emoji */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      {holiday.floatingEmoji.map((e, i) => (
                        <motion.span
                          key={`${activeHoliday}-${i}`}
                          className="absolute text-2xl"
                          initial={{ opacity: 0, y: 100 }}
                          animate={{ opacity: [0, 0.6, 0], y: [-20, -200], x: [0, (i - 1) * 30] }}
                          transition={{ duration: 3, delay: i * 0.5, repeat: Infinity, repeatDelay: 2, ease: [0.25, 0.46, 0.45, 0.94] as const }}
                          style={{ left: `${25 + i * 25}%`, top: '70%' }}
                        >
                          {e}
                        </motion.span>
                      ))}
                    </div>
                    <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">
                      <motion.span
                        key={`emoji-${activeHoliday}`}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const }}
                        className="text-5xl mb-4"
                      >
                        {holiday.emoji}
                      </motion.span>
                      <motion.h3
                        key={`greet-${activeHoliday}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="text-xl font-extrabold text-white mb-2"
                      >
                        {holiday.greeting}
                      </motion.h3>
                      <motion.p
                        key={`body-${activeHoliday}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="text-white/70 text-sm leading-relaxed"
                      >
                        {holiday.body}
                      </motion.p>
                      <div className="mt-6 text-xs font-medium" style={{ color: holiday.accent }}>
                        From Daniel Roberts
                      </div>
                    </div>
                  </div>
                </div>
                {/* Holiday picker */}
                <div className="flex justify-center gap-2 mt-6">
                  {Object.entries(HOLIDAYS).map(([key, h]) => (
                    <button
                      key={key}
                      onClick={() => setActiveHoliday(key)}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg transition-all duration-200 ${activeHoliday === key ? 'ring-2 ring-[#3DD6C3] scale-110 shadow-lg' : 'opacity-60 hover:opacity-100 hover:scale-105'}`}
                      style={{ background: activeHoliday === key ? h.gradient : '#e5e7eb' }}
                    >
                      {h.emoji}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Right — Text & Layers */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-60px' }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} custom={0}>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full mb-6">
                  <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">Retention</span>
                </div>
                <h2 className="text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
                  Never lose a client to silence again.
                </h2>
                <p className="text-[#6B7280] text-lg leading-relaxed mb-10">Two layers of protection. Zero effort from you.</p>
              </motion.div>

              <motion.div variants={fadeUp} custom={0.1} className="bg-white rounded-2xl p-6 lg:p-8 border border-gray-100 shadow-sm mb-6 hover:shadow-lg transition-shadow duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#3DD6C3]/10 flex items-center justify-center">
                    <span className="text-[#3DD6C3] text-xs font-black">1</span>
                  </div>
                  <p className="text-[#0D4D4D] font-bold text-lg">Prevention</p>
                </div>
                <p className="text-[#6B7280] text-base leading-relaxed">7+ personalized touchpoints per year — holidays, birthdays, anniversaries — all as push notifications, completely automatic. Try clicking the holidays on the left.</p>
              </motion.div>

              <motion.div variants={fadeUp} custom={0.2} className="bg-white rounded-2xl p-6 lg:p-8 border border-gray-100 shadow-sm hover:shadow-lg transition-shadow duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                    <span className="text-red-400 text-xs font-black">2</span>
                  </div>
                  <p className="text-[#0D4D4D] font-bold text-lg">Rescue</p>
                </div>
                <p className="text-[#6B7280] text-base leading-relaxed">When a policy lapses, forward the carrier email. AI extracts the info, matches your records, and sends personalized outreach within hours. Follows up on Day 2, 5, and 7.</p>
              </motion.div>

              <motion.p variants={fadeUp} custom={0.3} className="text-[#6B7280]/60 text-sm italic mt-6">
                Your AI doesn&apos;t sleep. Or take lunch. Or forget to follow up.
              </motion.p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         CLIENT APP — Two Surfaces Layout
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#070E1B] px-8 py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[250px] opacity-[0.06]" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-[#fdcc02] rounded-full blur-[200px] opacity-[0.04]" />
        </div>
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="max-w-7xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/10 rounded-full mb-6">
              <span className="text-[#3DD6C3] font-bold text-xs uppercase tracking-wide">Your Branded App</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
              Two Surfaces. <span className="text-[#3DD6C3]">One System.</span>
            </h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">A web dashboard for you. A mobile app for your clients. Always in sync.</p>
          </motion.div>

          <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-8 items-center">
            {/* Dashboard mockup */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const }}
            >
              <div className="bg-[#1a1a1a] rounded-xl border-2 border-white shadow-2xl overflow-hidden">
                {/* Browser chrome */}
                <div className="bg-[#2a2a2a] px-4 py-3 flex items-center gap-6">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                    <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                    <div className="w-3 h-3 rounded-full bg-[#28C840]" />
                  </div>
                  <div className="flex-1 bg-[#1a1a1a] rounded-md px-3 py-1.5">
                    <span className="text-white/30 text-xs">agentforlife.app/dashboard</span>
                  </div>
                </div>
                {/* Dashboard content */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-white text-sm font-bold">Dashboard</p>
                      <p className="text-white/30 text-xs">Roberts Insurance Agency</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="px-3 py-1 bg-[#3DD6C3]/15 rounded-md text-[#3DD6C3] text-xs font-medium">247 Clients</div>
                      <div className="px-3 py-1 bg-[#fdcc02]/15 rounded-md text-[#fdcc02] text-xs font-medium">12 Referrals</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/[0.05] rounded-lg p-3 border border-white/5">
                      <p className="text-white/30 text-[10px] uppercase tracking-wider">Active Policies</p>
                      <p className="text-white text-xl font-bold mt-1">389</p>
                    </div>
                    <div className="bg-white/[0.05] rounded-lg p-3 border border-white/5">
                      <p className="text-white/30 text-[10px] uppercase tracking-wider">Retention Rate</p>
                      <p className="text-[#3DD6C3] text-xl font-bold mt-1">96.2%</p>
                    </div>
                    <div className="bg-white/[0.05] rounded-lg p-3 border border-white/5">
                      <p className="text-white/30 text-[10px] uppercase tracking-wider">This Month</p>
                      <p className="text-[#fdcc02] text-xl font-bold mt-1">+8</p>
                    </div>
                  </div>
                  <div className="bg-white/[0.05] rounded-lg p-3 border border-white/5">
                    <p className="text-white/30 text-[10px] uppercase tracking-wider mb-2">Recent Activity</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#3DD6C3]" />
                        <p className="text-white/60 text-xs">Sarah M. referred Mike T. — AI qualifying</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#fdcc02]" />
                        <p className="text-white/60 text-xs">Policy anniversary: Johnson family — alert sent</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#3DD6C3]" />
                        <p className="text-white/60 text-xs">Christmas cards sent to 247 clients</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Sync indicator */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="hidden lg:flex flex-col items-center gap-3"
            >
              <div className="w-px h-16 bg-gradient-to-b from-transparent via-[#3DD6C3]/30 to-transparent" />
              <div className="w-12 h-12 rounded-full bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              </div>
              <p className="text-[#3DD6C3]/50 text-[10px] font-bold uppercase tracking-wider">Synced</p>
              <div className="w-px h-16 bg-gradient-to-b from-transparent via-[#3DD6C3]/30 to-transparent" />
            </motion.div>

            {/* Phone mockup */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const }}
              className="flex justify-center"
            >
              <div className="relative">
                <div className="absolute -inset-3 rounded-[3.5rem] bg-gradient-to-b from-[#3DD6C3]/15 via-transparent to-[#fdcc02]/10 blur-lg pointer-events-none" />
                <div className="w-[260px] h-[530px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-white relative">
                  <div className="w-full h-full bg-[#111] rounded-[2.5rem] overflow-hidden px-4 py-6 relative">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-full bg-[#005851] flex items-center justify-center">
                        <span className="text-[#3DD6C3] text-xs font-bold">D</span>
                      </div>
                      <div>
                        <p className="text-white text-xs font-semibold">Daniel Roberts</p>
                        <p className="text-white/35 text-[9px]">Roberts Insurance Agency</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-white/[0.08] rounded-xl p-3 border border-white/5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">🎄</span>
                          <div>
                            <p className="text-white/90 text-[10px] font-bold">Merry Christmas!</p>
                            <p className="text-white/40 text-[8px]">Tap to view your card</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white/[0.08] rounded-xl p-3 border border-white/5">
                        <p className="text-white/30 text-[8px] uppercase tracking-wider mb-2">Your Policies</p>
                        <div className="flex items-center justify-between">
                          <span className="text-white/70 text-[10px]">Auto — State Farm</span>
                          <span className="text-[#3DD6C3] text-[8px] font-semibold">Active</span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-white/70 text-[10px]">Life — Mutual of Omaha</span>
                          <span className="text-[#3DD6C3] text-[8px] font-semibold">Active</span>
                        </div>
                      </div>
                      <div className="bg-[#fdcc02] rounded-xl py-3 text-center">
                        <p className="text-[#0D4D4D] text-xs font-bold">Refer a Friend</p>
                      </div>
                      <div className="bg-[#005851] rounded-xl py-3 text-center">
                        <p className="text-white text-xs font-bold">Contact Daniel</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Feature pills */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="flex flex-wrap justify-center gap-3 mt-16"
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
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/[0.08] rounded-full hover:bg-white/[0.1] transition-colors"
              >
                <span className="text-sm">{pill.icon}</span>
                <span className="text-white/50 text-sm font-medium">{pill.label}</span>
              </motion.div>
            ))}
          </motion.div>

          <div className="flex items-center justify-center gap-6 mt-8">
            <div className="flex items-center gap-2 text-white/30 text-sm font-medium">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
              iPhone
            </div>
            <span className="text-white/15">+</span>
            <div className="flex items-center gap-2 text-white/30 text-sm font-medium">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.34c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm-11.046 0c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm11.405-6.02l1.9-3.46c.11-.2.04-.44-.15-.56-.2-.11-.44-.04-.56.15l-1.92 3.49C15.46 8.38 13.55 7.75 12 7.75s-3.46.63-5.14 1.72L4.94 5.98c-.12-.19-.36-.26-.56-.15-.19.12-.26.36-.15.56l1.9 3.46C2.64 11.96.34 15.55 0 19.8h24c-.34-4.25-2.64-7.84-6.12-9.48z" /></svg>
              Android
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         THE MATH — Three-Column with "vs"
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#0D4D4D] px-8 py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-red-500 rounded-full blur-[180px] opacity-[0.08]" />
          <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[180px] opacity-[0.08]" />
        </div>

        <div className="max-w-6xl mx-auto relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} custom={0} className="text-center mb-16">
              <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
                The math is <span className="text-[#3DD6C3]">undeniable</span>.
              </h2>
              <p className="text-white/40 text-lg">One saved policy. One referral. That&apos;s all it takes.</p>
            </motion.div>

            <div className="grid md:grid-cols-[1fr_auto_1fr] gap-6 items-center mb-10">
              <motion.div
                variants={fadeUp}
                custom={0.1}
                className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 lg:p-10 text-center backdrop-blur-sm"
              >
                <p className="text-red-400 font-semibold text-xs uppercase tracking-wide mb-3">1 Canceled Policy</p>
                <p className="text-5xl lg:text-6xl font-black text-red-400 mb-2">$1,200</p>
                <p className="text-red-400/50 text-sm">avg annual value lost</p>
              </motion.div>

              <motion.div
                variants={fadeUp}
                custom={0.15}
                className="hidden md:flex items-center justify-center"
              >
                <span className="text-white/20 text-3xl font-black">vs</span>
              </motion.div>

              <motion.div
                variants={fadeUp}
                custom={0.2}
                className="bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-2xl p-8 lg:p-10 text-center backdrop-blur-sm"
              >
                <p className="text-[#3DD6C3] font-semibold text-xs uppercase tracking-wide mb-3">Agent for Life</p>
                <p className="text-5xl lg:text-6xl font-black text-[#fdcc02] mb-2">$0</p>
                <p className="text-[#3DD6C3]/50 text-sm">free as Founding Member</p>
              </motion.div>
            </div>

            <motion.div
              variants={fadeUp}
              custom={0.3}
              className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center max-w-2xl mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02]/15 rounded-full mb-4">
                <svg className="w-4 h-4 text-[#fdcc02]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <span className="text-[#fdcc02] font-bold text-xs uppercase">Instant ROI</span>
              </div>
              <p className="text-white font-extrabold text-xl leading-snug">
                Every save and every referral is{' '}
                <span className="text-[#fdcc02]">pure profit</span>.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         HOW IT WORKS — Four Columns with Arrows
         ═══════════════════════════════════════════════════ */}
      <section id="how-it-works" className="relative bg-white px-8 py-24 md:py-32">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} custom={0} className="text-center mb-16">
              <h2 className="text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
                Up and running in{' '}<span className="text-[#3DD6C3]">10 minutes</span>.
              </h2>
              <p className="text-[#6B7280] text-lg">No complex setup. No IT department.</p>
            </motion.div>

            <div className="grid md:grid-cols-4 gap-0 items-start">
              {[
                { num: '1', title: 'Sign Up & Brand', desc: 'Add your photo, logo, and scheduling link. Instantly branded to you.', color: '#3DD6C3' },
                { num: '2', title: 'Import Your Book', desc: 'Upload CSV or drop in a PDF — AI extracts clients, policies, and beneficiaries.', color: '#fdcc02' },
                { num: '3', title: 'Share with Clients', desc: 'They download your app with a unique code. Personalized welcome notification.', color: '#3DD6C3' },
                { num: '4', title: 'AI Takes Over', desc: 'Touchpoints, referral follow-ups, conservation alerts — all on autopilot.', color: '#fdcc02' },
              ].map((step, i) => (
                <motion.div key={step.num} variants={fadeUp} custom={0.05 + i * 0.08} className="relative px-4 lg:px-6 text-center">
                  {i < 3 && (
                    <div className="hidden md:block absolute top-6 right-0 translate-x-1/2 z-10">
                      <svg className="w-6 h-6 text-[#3DD6C3]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  )}
                  <div className="w-12 h-12 bg-[#0D4D4D] rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-lg font-bold" style={{ color: step.color }}>{step.num}</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">{step.title}</h3>
                  <p className="text-[#6B7280] text-sm leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>

            <motion.div variants={fadeUp} custom={0.4} className="flex justify-center mt-14">
              <Link
                href="/founding-member/d"
                className="inline-flex items-center gap-3 px-8 py-4 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg font-bold rounded-full shadow-lg shadow-[#fdcc02]/20 transition-all duration-200 hover:scale-[1.03]"
              >
                Get Started Free
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         TRUST — Five Columns
         ═══════════════════════════════════════════════════ */}
      <section className="bg-[#F8F9FA] px-8 py-20 md:py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h3 className="text-center text-lg font-bold text-[#0D4D4D] mb-10">
              Built for <span className="text-[#3DD6C3]">trust</span>
            </h3>
            <div className="grid grid-cols-5 gap-6">
              {[
                { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', label: 'Your Data' },
                { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Encrypted' },
                { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Client Opt-In' },
                { icon: 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z', label: 'No Lock-In' },
                { icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', label: 'All Carriers' },
              ].map((t) => (
                <div key={t.label} className="text-center p-4 rounded-xl hover:bg-white hover:shadow-md transition-all duration-200">
                  <div className="w-12 h-12 bg-[#0D4D4D]/5 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} /></svg>
                  </div>
                  <p className="text-sm font-semibold text-[#0D4D4D]">{t.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         PRICING — Four Tiers in a Row
         ═══════════════════════════════════════════════════ */}
      <section id="pricing" className="relative bg-white px-8 py-24 md:py-32">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} custom={0} className="text-center mb-16">
              <h2 className="text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
                This will cost <span className="line-through text-[#6B7280]/50">$49/mo</span>.<br />
                <span className="text-[#3DD6C3]">But not for you.</span>
              </h2>
              <p className="text-[#6B7280] text-lg">150 early spots across 3 tiers, then gone forever.</p>
            </motion.div>

            <div className="grid md:grid-cols-4 gap-6">
              {/* Founding Member — featured */}
              <motion.div
                variants={fadeUp}
                custom={0.1}
                className="relative bg-white rounded-2xl border-2 border-[#a158ff] p-8 text-center shadow-xl shadow-[#a158ff]/10 md:scale-[1.04] z-10"
              >
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1.5 bg-[#a158ff] text-white text-xs font-bold rounded-full shadow-lg shadow-[#a158ff]/25">NOW OPEN</span>
                </div>
                <p className="text-[#6B7280] font-medium text-sm mt-2 mb-2">Founding Members</p>
                <p className="text-5xl font-black text-[#0D4D4D] mb-1">FREE</p>
                <p className="text-[#a158ff] font-semibold text-base mb-1">For Life</p>
                <p className="text-[#6B7280] text-sm line-through mb-1">$49/mo</p>
                <p className="text-[#6B7280] text-sm mb-4">50 spots — then gone forever</p>
                {spotsRemaining !== null && (
                  <div className="mb-5">
                    <div className="w-full bg-[#a158ff]/10 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-[#a158ff] rounded-full transition-all duration-1000" style={{ width: `${((50 - spots) / 50) * 100}%` }} />
                    </div>
                    <p className="text-sm text-[#a158ff] font-bold mt-2">{spots} spots remaining</p>
                  </div>
                )}
                <Link href="/founding-member/d" className="block w-full py-3.5 bg-[#a158ff] hover:bg-[#8f42e8] text-white text-sm font-bold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-[#a158ff]/25">
                  Apply Now
                </Link>
              </motion.div>

              {/* Other tiers */}
              {[
                { tier: 'Charter Members', price: '$25', period: '/mo', note: '50 spots', desc: 'Early supporter pricing locked for life.', border: 'border-[#3DD6C3]', badge: 'NEXT' },
                { tier: 'Inner Circle', price: '$35', period: '/mo', note: '50 spots', desc: 'Premium access at a founder-era rate.', border: 'border-gray-200', badge: null },
                { tier: 'Standard', price: '$49', period: '/mo', note: 'Full price', desc: 'Full system access. Still worth every penny.', border: 'border-gray-200', badge: null },
              ].map((t, i) => (
                <motion.div
                  key={t.tier}
                  variants={fadeUp}
                  custom={0.15 + i * 0.05}
                  className={`relative bg-white rounded-2xl border ${t.border} p-8 text-center hover:shadow-lg transition-shadow duration-300`}
                >
                  {t.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 bg-[#3DD6C3] text-[#0D4D4D] text-[10px] font-bold rounded-full">{t.badge}</span>
                    </div>
                  )}
                  <p className="text-[#6B7280] font-medium text-sm mt-2 mb-3">{t.tier}</p>
                  <p className="text-4xl font-black text-[#0D4D4D]">{t.price}</p>
                  <p className="text-[#6B7280] text-sm mb-2">{t.period}</p>
                  <p className="text-[#6B7280] text-xs mb-4">{t.note}</p>
                  <p className="text-[#6B7280] text-sm leading-relaxed">{t.desc}</p>
                </motion.div>
              ))}
            </div>

            <motion.p variants={fadeUp} custom={0.4} className="text-center text-[#6B7280] text-sm mt-10">
              No contracts · Lock in your price for life · Cancel anytime
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         FAQ — Centered Accordion
         ═══════════════════════════════════════════════════ */}
      <section id="faq" className="bg-[#F8F9FA] px-8 py-24 md:py-32">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl font-extrabold text-[#0D4D4D] text-center mb-12">
              Frequently Asked Questions
            </h2>

            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-shadow duration-200">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full px-6 py-5 text-left flex items-center justify-between gap-4"
                    aria-expanded={openFaq === i}
                  >
                    <span className="text-base font-semibold text-[#0D4D4D] leading-snug">{item.question}</span>
                    <svg className={`w-5 h-5 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-[500px]' : 'max-h-0'}`}>
                    <div className="px-6 pb-5">
                      <p className="text-[#6B7280] text-sm leading-relaxed">{item.answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         FINAL CTA
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#0D4D4D] px-8 py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.12]" />
          <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-[#fdcc02] rounded-full blur-[150px] opacity-[0.08]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative max-w-3xl mx-auto text-center"
        >
          <p className="text-white/30 text-xs uppercase tracking-[0.2em] font-medium mb-6">Stop leaving money on the table</p>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6">
            Your competitors aren&apos;t reading this.{' '}
            <span className="text-[#fdcc02]">They&apos;re losing clients.</span>
          </h2>
          <p className="text-white/40 text-lg leading-relaxed mb-10 max-w-xl mx-auto">
            Lock in your free lifetime spot. No credit card. No risk. A system that pays for itself from day one.
          </p>
          <Link
            href="/founding-member/d"
            className="inline-flex items-center gap-3 px-10 py-5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 transition-all duration-200 hover:scale-[1.03]"
          >
            Lock In My Free Lifetime Spot
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/25 text-sm mt-6">
            {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} · $0 forever
          </p>
        </motion.div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="bg-[#070E1B] border-t border-white/5 px-8 py-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="AgentForLife" className="w-10 h-6 object-contain" />
            <span className="text-lg text-white brand-title">AgentForLife</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-8">
            <Link href="/login" className="text-white/40 text-sm hover:text-white/70 transition-colors">Login</Link>
            <a href="mailto:support@agentforlife.app" className="text-white/40 text-sm hover:text-white/70 transition-colors">Contact</a>
            <Link href="/privacy" className="text-white/40 text-sm hover:text-white/70 transition-colors">Privacy</Link>
            <Link href="/terms" className="text-white/40 text-sm hover:text-white/70 transition-colors">Terms</Link>
          </nav>
          <p className="text-white/25 text-sm">&copy; 2026 AgentForLife</p>
        </div>
      </footer>

      {/* ═══════════════════════════════════════════════════
         SIDEBAR BOOKMARK CTA — Fixed Right Edge
         ═══════════════════════════════════════════════════ */}
      <div
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 hidden lg:block"
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div className={`flex items-center transition-all duration-300 ${sidebarExpanded ? 'translate-x-0' : 'translate-x-[calc(100%-48px)]'}`}>
          {/* Tab */}
          <div className="w-12 h-40 bg-[#a158ff] rounded-l-xl flex items-center justify-center cursor-pointer shadow-lg shadow-[#a158ff]/20">
            <div className="transform -rotate-90 whitespace-nowrap">
              <span className="text-white text-xs font-bold tracking-wider uppercase">Free Spot</span>
            </div>
          </div>
          {/* Expanded panel */}
          <div className="bg-[#a158ff] py-6 px-6 w-[260px] rounded-l-xl shadow-2xl shadow-[#a158ff]/30">
            <p className="text-white font-extrabold text-lg mb-2">Founding Member</p>
            <p className="text-white/70 text-sm mb-1">$49/mo → <span className="text-white font-bold">FREE for life</span></p>
            <p className="text-white/50 text-xs mb-4">Only {spots} of 50 spots left</p>
            <Link
              href="/founding-member/d"
              className="block w-full py-3 bg-white text-[#a158ff] text-sm font-bold rounded-lg text-center hover:bg-white/90 transition-colors"
            >
              Claim Your Spot
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
