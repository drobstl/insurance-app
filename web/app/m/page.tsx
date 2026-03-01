'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';

const IMESSAGE_DELAYS = [900, 1100, 900, 1300, 900, 500, 1100];

const FAQ_ITEMS = [
  { question: 'What exactly is Agent for Life?', answer: 'A complete client relationship system for insurance agents. You get a branded mobile app for your clients, automated touchpoints (holidays, birthdays, anniversaries), one-tap referrals with an AI assistant that qualifies leads via iMessage and books appointments, conservation alerts that rescue at-risk policies, and anniversary rewrite alerts — normally $49/month, but free for life for founding members.' },
  { question: 'How hard is it to get started?', answer: 'You can be live in 10 minutes. Import your clients via CSV or upload PDF applications — AI extracts everything. Enable the referral assistant with one toggle and share your app code with clients.' },
  { question: 'Is my data safe?', answer: "Yes. Your client data is encrypted with AES-256, stored on Google Cloud, and only accessible by you. We never contact your clients independently, and no other agent can see your book of business." },
  { question: 'What carriers does it work with?', answer: 'All of them. Agent for Life is carrier-agnostic. Works for independent agents regardless of which carriers you\'re appointed with.' },
  { question: 'What do Founding Members get?', answer: 'Free access for life ($49/mo value), your own branded client app, direct line to the founder, your feedback shapes the roadmap, early access to every new feature, and "Founding Member" status. Only 50 spots total — no credit card required.' },
];

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

export default function MobileLandingV2() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showBottomCta, setShowBottomCta] = useState(false);
  const [msgStep, setMsgStep] = useState(-1);
  const [activeStep, setActiveStep] = useState(0);
  const touchStartX = useRef(0);

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

  const STEPS = [
    { num: '1', title: 'Sign Up & Brand', desc: 'Add your photo, logo, and scheduling link. Instantly branded to you.', color: '#3DD6C3' },
    { num: '2', title: 'Import Your Book', desc: 'Upload CSV or drop in a PDF \u2014 AI extracts clients, policies, and beneficiaries.', color: '#fdcc02' },
    { num: '3', title: 'Share with Clients', desc: 'They download your app with a unique code. Personalized welcome notification.', color: '#3DD6C3' },
    { num: '4', title: 'AI Takes Over', desc: 'Touchpoints, referral follow-ups, conservation alerts \u2014 all on autopilot.', color: '#fdcc02' },
  ];

  useEffect(() => {
    const t = setInterval(() => setActiveStep(s => (s + 1) % 4), 3500);
    return () => clearInterval(t);
  }, []);

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
        <div className="absolute inset-0 pointer-events-none will-change-transform">
          <div className="absolute -top-20 -left-20 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[160px] opacity-20" />
          <div className="absolute bottom-20 -right-20 w-[250px] h-[250px] bg-[#fdcc02] rounded-full blur-[140px] opacity-[0.08]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.06]" />
        </div>
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none will-change-transform" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

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
                href="/founding-member/m"
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
         WHAT IT IS — Branded App + AI
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#070E1B] px-6 py-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none will-change-transform">
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[180px] opacity-[0.06]" />
        </div>
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none will-change-transform" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative space-y-10">
          {/* Two pill badges */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const }}
            style={{ willChange: 'transform, opacity' }}
            className="space-y-5"
          >
            <div className="flex justify-center">
              <div className="px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-full">
                <span className="text-[#3DD6C3] font-bold text-[10px] uppercase tracking-wide">Your Branded App</span>
              </div>
            </div>
            <h2 className="text-[1.65rem] font-extrabold text-white leading-tight text-center">
              On every client&apos;s phone.
            </h2>
            <p className="text-white/40 text-[14px] text-center">Your name. Your brand. Their policies. One tap away.</p>
          </motion.div>

          {/* Phone mockup */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const }}
            style={{ willChange: 'transform, opacity' }}
            className="flex justify-center"
          >
            <div className="relative">
              <div className="w-[220px] h-[440px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a] transform-gpu">
                <div className="absolute -inset-1.5 rounded-[2.8rem] bg-gradient-to-b from-[#3DD6C3]/15 via-transparent to-[#fdcc02]/10 pointer-events-none blur-sm" />
                <div className="w-full h-full bg-[#111] rounded-[2rem] overflow-hidden px-3.5 py-5 relative">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-9 h-9 rounded-full bg-[#005851] flex items-center justify-center">
                      <span className="text-[#3DD6C3] text-[11px] font-bold">D</span>
                    </div>
                    <div>
                      <p className="text-white text-[11px] font-semibold">Daniel Roberts</p>
                      <p className="text-white/35 text-[8px]">Roberts Insurance Agency</p>
                    </div>
                  </div>
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
                        <span className="text-white/70 text-[9px]">Auto &mdash; State Farm</span>
                        <span className="text-[#3DD6C3] text-[7px] font-semibold">Active</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-white/70 text-[9px]">Life &mdash; Mutual of Omaha</span>
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

          {/* Divider */}
          <div className="flex justify-center py-2">
            <div className="w-16 h-px bg-gradient-to-r from-transparent via-[#3DD6C3]/30 to-transparent" />
          </div>

          {/* AI reveal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const }}
            style={{ willChange: 'transform, opacity' }}
            className="text-center space-y-8"
          >
            <p className="text-[#3DD6C3] text-[1.5rem] font-extrabold leading-tight">
              Powered by an AI<br />that never sleeps.
            </p>

            <div className="space-y-4">
              <p className="text-[15px] leading-relaxed">
                <span className="text-[#3DD6C3] font-bold">Stopping</span>
                <span className="text-white/40"> chargebacks before they happen.</span>
              </p>
              <p className="text-[15px] leading-relaxed">
                <span className="text-[#fdcc02] font-bold">Delivering</span>
                <span className="text-white/40"> warm referrals on autopilot.</span>
              </p>
              <p className="text-[15px] leading-relaxed">
                <span className="text-[#3DD6C3] font-bold">Catching</span>
                <span className="text-white/40"> every rewrite opportunity.</span>
              </p>
            </div>
          </motion.div>
        </div>
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
          style={{ willChange: 'transform, opacity' }}
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

          <motion.div variants={fadeUp} custom={0.4} className="pt-4">
            <div className="bg-[#0D4D4D] rounded-2xl p-6 text-center border border-[#3DD6C3]/15">
              <p className="text-[1.2rem] font-extrabold text-white leading-snug mb-1">
                Get off their contacts list.
              </p>
              <p className="text-[1.2rem] font-extrabold text-[#3DD6C3] leading-snug mb-2">
                Get on their home screen.
              </p>
              <p className="text-white/40 text-[13px]">
                We built a system that fixes all three.
              </p>
              <svg className="w-4 h-4 text-[#3DD6C3]/40 mx-auto mt-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" /></svg>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         SECTION 1 — Earn More
         ═══════════════════════════════════════════════════ */}
      <section className="bg-[#F8F9FA] px-5 py-14">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const }}
          style={{ willChange: 'transform, opacity' }}
          className="space-y-5"
        >
          <h2 className="text-[1.75rem] font-extrabold text-[#0D4D4D] leading-tight">
            Earn more from<br />leads you&apos;ve won.
          </h2>

          {/* Card 1: Referrals */}
          <Link href="/m/referrals" className="block">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 pb-4">
                <p className="text-[13px] text-[#6B7280] mb-1.5">One tap referrals</p>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[1.3rem] font-extrabold text-[#0D4D4D] leading-[1.2]">
                    Clients pick a contact, your AI handles the rest.
                  </h3>
                  <div className="w-9 h-9 rounded-full bg-[#0D4D4D] flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </div>
                </div>
              </div>
              <div className="bg-[#fdcc02] px-4 pt-8 relative overflow-hidden" style={{ minHeight: '240px' }}>
                <div className="flex justify-center -mb-6">
                  <div className="w-[145px] bg-white rounded-[1rem] p-[3px] shadow-2xl transform -rotate-3 translate-y-1 relative z-10">
                    <div className="w-full bg-[#111] rounded-[0.85rem] overflow-hidden px-2.5 py-3">
                      <div className="flex items-center gap-1.5 mb-3">
                        <div className="w-5 h-5 rounded-full bg-[#005851] flex items-center justify-center">
                          <span className="text-[#3DD6C3] text-[6px] font-bold">D</span>
                        </div>
                        <span className="text-white text-[7px] font-semibold">Daniel Roberts</span>
                      </div>
                      <div className="bg-[#fdcc02] rounded-lg py-2 text-center mb-2">
                        <p className="text-[#0D4D4D] text-[7px] font-bold">Refer a Friend</p>
                      </div>
                      <div className="space-y-1.5">
                        {['Mike Johnson', 'Sarah Thompson'].map((n, i) => (
                          <div key={n} className="flex items-center gap-1.5">
                            <div className={`w-3 h-3 rounded-full border ${i === 0 ? 'border-[#3DD6C3] bg-[#3DD6C3]' : 'border-white/20'}`} />
                            <span className="text-white/60 text-[6px]">{n}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="w-[145px] bg-white rounded-[1rem] p-[3px] shadow-2xl transform rotate-3 translate-y-8 -ml-6 relative z-20">
                    <div className="w-full bg-[#111] rounded-[0.85rem] overflow-hidden px-2.5 py-3">
                      <div className="flex items-center gap-1.5 mb-3">
                        <div className="w-5 h-5 rounded-full bg-[#005851] flex items-center justify-center">
                          <span className="text-[#3DD6C3] text-[6px] font-bold">D</span>
                        </div>
                        <span className="text-white text-[7px] font-semibold">Daniel</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-end">
                          <div className="bg-[#007AFF] rounded-xl rounded-tr-sm px-2 py-1.5 max-w-[90%]">
                            <p className="text-white text-[6px] leading-snug">Hey Mike, Sarah connected us...</p>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="bg-[#333] rounded-xl rounded-tl-sm px-2 py-1.5">
                            <p className="text-white text-[6px]">yeah sure</p>
                          </div>
                        </div>
                        <div className="flex justify-center mt-1">
                          <div className="bg-[#3DD6C3]/20 rounded-full px-2 py-0.5">
                            <span className="text-[#3DD6C3] text-[5px] font-bold">Booked</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          {/* Card 2: Rewrites */}
          <Link href="/m/rewrites" className="block">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 pb-4">
                <p className="text-[13px] text-[#6B7280] mb-1.5">Automated rewrites</p>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[1.3rem] font-extrabold text-[#0D4D4D] leading-[1.2]">
                    AI so nice, get the commission twice.
                  </h3>
                  <div className="w-9 h-9 rounded-full bg-[#0D4D4D] flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </div>
                </div>
              </div>
              <div className="bg-[#F4845F] px-4 pt-8 relative overflow-hidden" style={{ minHeight: '240px' }}>
                <div className="flex justify-center -mb-6">
                  <div className="w-[145px] bg-white rounded-[1rem] p-[3px] shadow-2xl transform -rotate-3 translate-y-1 relative z-10">
                    <div className="w-full bg-[#111] rounded-[0.85rem] overflow-hidden px-2.5 py-3">
                      <div className="flex items-center gap-1.5 mb-3">
                        <div className="w-5 h-5 rounded-full bg-[#005851] flex items-center justify-center">
                          <span className="text-[#3DD6C3] text-[6px] font-bold">D</span>
                        </div>
                        <span className="text-white text-[7px] font-semibold">Daniel Roberts</span>
                      </div>
                      <div className="bg-white/[0.08] rounded-lg p-2 border border-white/5 mb-2">
                        <p className="text-[#3DD6C3] text-[6px] font-bold mb-0.5">Anniversary Alert</p>
                        <p className="text-white/50 text-[5px] leading-snug">I may have found you a lower rate for the same coverage...</p>
                      </div>
                      <div className="bg-[#3DD6C3] rounded-lg py-1.5 text-center">
                        <p className="text-[#0D4D4D] text-[6px] font-bold">Book with Daniel</p>
                      </div>
                    </div>
                  </div>
                  <div className="w-[145px] bg-white rounded-[1rem] p-[3px] shadow-2xl transform rotate-3 translate-y-8 -ml-6 relative z-20">
                    <div className="w-full bg-[#111] rounded-[0.85rem] overflow-hidden px-2.5 py-3">
                      <p className="text-white/30 text-[6px] font-bold mb-2">Aug 2026</p>
                      <div className="grid grid-cols-7 gap-px mb-3">
                        {Array.from({ length: 21 }, (_, i) => i + 1).map(d => (
                          <div key={d} className={`py-0.5 rounded text-center text-[5px] ${d === 15 ? 'bg-[#fdcc02] text-[#0D4D4D] font-bold' : 'text-white/25'}`}>{d}</div>
                        ))}
                      </div>
                      <div className="flex justify-center">
                        <div className="bg-[#3DD6C3]/20 rounded-full px-2 py-0.5">
                          <span className="text-[#3DD6C3] text-[5px] font-bold">Appointment Set</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         SECTION 2 — Keep What You've Earned
         ═══════════════════════════════════════════════════ */}
      <section className="bg-[#F8F9FA] px-5 pb-14">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const }}
          style={{ willChange: 'transform, opacity' }}
          className="space-y-5"
        >
          <h2 className="text-[1.75rem] font-extrabold text-[#0D4D4D] leading-tight">
            Keep what<br />you&apos;ve earned.
          </h2>

          {/* Card 1: Automated Retention (rescue) */}
          <Link href="/m/retention" className="block">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 pb-4">
                <p className="text-[13px] text-[#6B7280] mb-1.5">Automated retention</p>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[1.3rem] font-extrabold text-[#0D4D4D] leading-[1.2]">
                    You move forward, AI&apos;s got your back.
                  </h3>
                  <div className="w-9 h-9 rounded-full bg-[#0D4D4D] flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </div>
                </div>
              </div>
              <div className="bg-[#3DD6C3] px-4 pt-8 relative overflow-hidden" style={{ minHeight: '240px' }}>
                <div className="flex justify-center -mb-6">
                  <div className="w-[145px] bg-white rounded-[1rem] p-[3px] shadow-2xl transform -rotate-3 translate-y-1 relative z-10">
                    <div className="w-full bg-[#111] rounded-[0.85rem] overflow-hidden px-2.5 py-3">
                      <div className="flex items-center gap-1 mb-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        <p className="text-white text-[7px] font-bold">Policy at risk</p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-end">
                          <div className="bg-[#007AFF] rounded-xl rounded-tr-sm px-2 py-1.5 max-w-[90%]">
                            <p className="text-white text-[5px] leading-snug">Hey Sarah, I noticed your policy may need attention...</p>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="bg-[#333] rounded-xl rounded-tl-sm px-2 py-1.5">
                            <p className="text-white text-[5px]">oh thanks for reaching out!</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-center mt-2">
                        <div className="bg-[#3DD6C3]/20 rounded-full px-2 py-0.5">
                          <span className="text-[#3DD6C3] text-[5px] font-bold">Policy Saved</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="w-[145px] bg-white rounded-[1rem] p-[3px] shadow-2xl transform rotate-3 translate-y-8 -ml-6 relative z-20">
                    <div className="w-full bg-[#111] rounded-[0.85rem] overflow-hidden px-2.5 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-5 h-5 rounded-full bg-[#005851] flex items-center justify-center">
                          <span className="text-[#3DD6C3] text-[6px] font-bold">D</span>
                        </div>
                        <span className="text-white text-[7px] font-semibold">Dashboard</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 bg-white/[0.06] rounded-lg px-2 py-1.5">
                          <div className="w-1 h-1 rounded-full bg-[#3DD6C3]" />
                          <span className="text-white/50 text-[5px]">Holiday card sent to 47 clients</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-white/[0.06] rounded-lg px-2 py-1.5">
                          <div className="w-1 h-1 rounded-full bg-red-400" />
                          <span className="text-white/50 text-[5px]">Conservation: Sarah J.</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-white/[0.06] rounded-lg px-2 py-1.5">
                          <div className="w-1 h-1 rounded-full bg-[#3DD6C3]" />
                          <span className="text-white/50 text-[5px]">Policy saved: Lisa M.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          {/* Card 2: Relationships (touchpoints) */}
          <Link href="/m/retention" className="block">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 pb-4">
                <p className="text-[13px] text-[#6B7280] mb-1.5">Relationships</p>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[1.3rem] font-extrabold text-[#0D4D4D] leading-[1.2]">
                    Keep them warm without lifting a finger.
                  </h3>
                  <div className="w-9 h-9 rounded-full bg-[#0D4D4D] flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </div>
                </div>
              </div>
              <div className="bg-[#a158ff] px-4 pt-8 relative overflow-hidden" style={{ minHeight: '280px' }}>
                <div className="flex justify-center -mb-10">
                  <div className="w-[155px] rounded-[1.25rem] border-[3px] border-black/80 shadow-2xl overflow-hidden transform -rotate-3 translate-y-1 relative z-10">
                    <img src="/screenshot-thanksgiving-card.png" alt="Thanksgiving holiday card" className="w-full h-auto block" />
                  </div>
                  <div className="w-[155px] rounded-[1.25rem] border-[3px] border-black/80 shadow-2xl overflow-hidden transform rotate-3 translate-y-10 -ml-8 relative z-20">
                    <img src="/screenshot-thanksgiving-notification.png" alt="Push notification on home screen" className="w-full h-auto block" />
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         THE MATH — ROI
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#0D4D4D] px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none will-change-transform">
          <div className="absolute top-0 left-0 w-[200px] h-[200px] bg-red-500 rounded-full blur-[120px] opacity-10" />
          <div className="absolute bottom-0 right-0 w-[200px] h-[200px] bg-[#3DD6C3] rounded-full blur-[120px] opacity-10" />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
          style={{ willChange: 'transform, opacity' }}
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
         HOW IT WORKS — Four Steps (Swipeable)
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-white px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={{ willChange: 'transform, opacity' }}
          className="space-y-8"
        >
          <div className="text-center">
            <h2 className="text-[1.65rem] font-extrabold text-[#0D4D4D] leading-tight mb-2">
              Up and running in{' '}<span className="text-[#3DD6C3]">10 minutes</span>.
            </h2>
            <p className="text-[#6B7280] text-[14px]">No complex setup. No IT department.</p>
          </div>

          {/* Swipeable card */}
          <div
            className="relative overflow-hidden"
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              const diff = touchStartX.current - e.changedTouches[0].clientX;
              if (Math.abs(diff) > 50) {
                setActiveStep(s => diff > 0 ? Math.min(s + 1, 3) : Math.max(s - 1, 0));
              }
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const }}
                className="bg-[#F8F9FA] rounded-2xl p-6 border border-gray-100"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-[#0D4D4D] rounded-xl flex items-center justify-center">
                    <span className="text-base font-bold" style={{ color: STEPS[activeStep].color }}>{STEPS[activeStep].num}</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">{STEPS[activeStep].title}</h3>
                </div>
                <p className="text-[#6B7280] text-[14px] leading-relaxed">{STEPS[activeStep].desc}</p>
              </motion.div>
            </AnimatePresence>

            {/* Dot indicators */}
            <div className="flex items-center justify-center gap-2 mt-5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveStep(i)}
                  className={`rounded-full transition-all duration-300 ${i === activeStep ? 'w-6 h-2 bg-[#3DD6C3]' : 'w-2 h-2 bg-[#0D4D4D]/15'}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-center pt-2">
            <Link
              href="/founding-member/m"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#fdcc02] text-[#0D4D4D] text-base font-bold rounded-full shadow-lg shadow-[#fdcc02]/20 active:scale-[0.97] transition-transform"
            >
              Get Started Free
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
          </div>
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
          style={{ willChange: 'opacity' }}
        >
          <h3 className="text-center text-sm font-bold text-[#0D4D4D] mb-6">
            Built for <span className="text-[#3DD6C3]">trust</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', label: 'Your Data, Your Book', sub: 'We never contact your clients independently' },
              { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'AES-256 Encryption', sub: 'At rest and in transit via TLS' },
              { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Client Opt-In', sub: 'Clients join with your unique code' },
              { icon: 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z', label: 'No Lock-In', sub: 'Month-to-month, cancel anytime' },
              { icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', label: 'Carrier Agnostic', sub: 'Works with every insurance carrier' },
              { icon: 'M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4', label: 'Biometric Security', sub: 'Coming soon', badge: true },
            ].map((t) => (
              <div key={t.label} className="flex items-start gap-2.5 p-2.5">
                <div className="w-8 h-8 bg-[#0D4D4D]/5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} /></svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#0D4D4D] leading-snug">{t.label}</p>
                  <p className="text-[9px] text-[#6B7280] leading-snug mt-0.5">
                    {t.sub}
                    {t.badge && <span className="ml-1 inline-block px-1.5 py-0.5 bg-[#3DD6C3]/10 text-[#3DD6C3] text-[7px] font-bold rounded-full align-middle">SOON</span>}
                  </p>
                </div>
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
          style={{ willChange: 'transform, opacity' }}
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
            <Link href="/founding-member/m" className="block w-full py-3.5 bg-[#a158ff] text-white text-sm font-bold rounded-xl active:scale-[0.97] transition-transform">
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
          style={{ willChange: 'transform, opacity' }}
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
        <div className="absolute inset-0 pointer-events-none will-change-transform">
          <div className="absolute top-0 left-1/4 w-[250px] h-[250px] bg-[#3DD6C3] rounded-full blur-[120px] opacity-15" />
          <div className="absolute bottom-0 right-1/4 w-[200px] h-[200px] bg-[#fdcc02] rounded-full blur-[100px] opacity-10" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ willChange: 'transform, opacity' }}
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
            href="/founding-member/m"
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
      <div className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 will-change-transform ${showBottomCta ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-[#0D4D4D]/95 backdrop-blur-md border-t border-white/10 px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] will-change-transform">
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
            href="/founding-member/m"
            className="flex-shrink-0 px-5 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-[13px] font-bold rounded-full active:scale-[0.97] transition-transform"
          >
            Claim Free Spot
          </Link>
        </div>
      </div>
    </div>
  );
}
