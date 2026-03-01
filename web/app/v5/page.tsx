'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LeakyBucketCalculator from '@/components/LeakyBucketCalculator';

const FAQ_ITEMS = [
  { question: 'What exactly is Agent for Life?', answer: 'A complete client relationship system for insurance agents. You get a branded mobile app for your clients, automated touchpoints (holidays, birthdays, anniversaries), one-tap referrals with an AI assistant that qualifies leads via iMessage and books appointments, conservation alerts that rescue at-risk policies, and anniversary rewrite alerts — normally $49/month, but free for life for founding members.' },
  { question: 'How hard is it to get started?', answer: 'You can be live in 10 minutes. Import your clients via CSV or upload PDF applications — AI extracts everything. Enable the referral assistant with one toggle and share your app code with clients.' },
  { question: 'Is my data safe?', answer: "Yes. Your client data is encrypted with AES-256, stored on Google Cloud, and only accessible by you. We never contact your clients independently, and no other agent can see your book of business." },
  { question: 'What carriers does it work with?', answer: 'All of them. Agent for Life is carrier-agnostic. Works for independent agents regardless of which carriers you\'re appointed with.' },
  { question: 'What do Founding Members get?', answer: 'Free access for life ($49/mo value), your own branded client app, direct line to the founder, your feedback shapes the roadmap, early access to every new feature, and "Founding Member" status. Only 50 spots total — no credit card required.' },
];

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

export default function DesktopLandingV5() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showNav, setShowNav] = useState(false);
  const [openPain, setOpenPain] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setShowNav(!e.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setActiveStep(s => (s + 1) % 4), 3500);
    return () => clearInterval(t);
  }, []);

  const spots = spotsRemaining ?? 50;

  const STEPS = [
    { num: '1', title: 'Sign Up & Brand', desc: 'Add your photo, logo, and scheduling link. Instantly branded to you.', color: '#3DD6C3' },
    { num: '2', title: 'Import Your Book', desc: 'Upload CSV or drop in a PDF — AI extracts clients, policies, and beneficiaries.', color: '#fdcc02' },
    { num: '3', title: 'Share with Clients', desc: 'They download your app with a unique code. Personalized welcome notification.', color: '#3DD6C3' },
    { num: '4', title: 'AI Takes Over', desc: 'Touchpoints, referral follow-ups, conservation alerts — all on autopilot.', color: '#fdcc02' },
  ];

  return (
    <div className="min-h-screen bg-[#0D4D4D] overflow-x-hidden">

      {/* ═══ STICKY NAV ═══ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${showNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="bg-[#0D4D4D]/95 backdrop-blur-md border-b border-white/10">
          <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="AgentForLife" className="w-[44px] h-[25px] object-contain" />
              <span className="text-white/80 brand-title text-base">AgentForLife</span>
            </div>
            <div className="flex items-center gap-8">
              <div className="hidden md:flex items-center gap-6">
                <a href="#features" className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors">Features</a>
                <a href="#how-it-works" className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors">How It Works</a>
                <a href="#pricing" className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors">Pricing</a>
                <a href="#faq" className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors">FAQ</a>
              </div>
              <Link
                href="/founding-member"
                className="px-5 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full hover:bg-[#fdcc02]/90 transition-colors"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-[#3DD6C3] rounded-full blur-[250px] opacity-20" />
          <div className="absolute bottom-20 -right-40 w-[500px] h-[500px] bg-[#fdcc02] rounded-full blur-[200px] opacity-[0.08]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#3DD6C3] rounded-full blur-[300px] opacity-[0.05]" />
        </div>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative z-10 max-w-7xl mx-auto px-8 lg:px-16 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="flex items-center gap-2.5 mb-10"
              >
                <img src="/logo.png" alt="AgentForLife" className="w-[52px] h-[30px] object-contain" />
                <span className="text-white/80 brand-title text-lg">AgentForLife</span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mb-8"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#fdcc02]/15 border border-[#fdcc02]/25 rounded-full">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute h-full w-full rounded-full bg-[#fdcc02] opacity-75" />
                    <span className="relative rounded-full h-2.5 w-2.5 bg-[#fdcc02]" />
                  </span>
                  <span className="text-[#fdcc02] font-bold text-sm tracking-wide">
                    {spotsRemaining !== null ? `${spots} of 50 Free Spots Left` : 'Free Lifetime Spots Open'}
                  </span>
                </div>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="text-5xl lg:text-6xl xl:text-[4.25rem] font-extrabold text-white leading-[1.08] mb-7 tracking-tight"
              >
                Chargebacks happen<br />
                when clients forget{' '}
                <span className="text-[#3DD6C3]">you exist.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45 }}
                className="text-white/50 text-lg lg:text-xl leading-relaxed mb-10 max-w-[520px]"
              >
                We built a system that makes sure they never do. Automated retention. AI&#8209;powered referrals. Complete autopilot.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="flex items-center gap-5"
              >
                <Link
                  href="/founding-member"
                  className="inline-flex items-center gap-3 px-8 py-4.5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-lg shadow-[#fdcc02]/25 hover:shadow-xl hover:shadow-[#fdcc02]/30 hover:scale-[1.02] transition-all"
                >
                  Lock In My Free Spot
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </Link>
                <p className="text-white/30 text-sm">
                  {spotsRemaining !== null ? `${spots} spots left` : 'Limited spots'} · $0 forever
                </p>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="hidden lg:flex justify-center"
            >
              <div className="relative">
                <div className="w-[280px] h-[560px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
                  <div className="absolute -inset-2 rounded-[3.3rem] bg-gradient-to-b from-[#3DD6C3]/15 via-transparent to-[#fdcc02]/10 pointer-events-none blur-sm" />
                  <div className="w-full h-full bg-black rounded-[2.4rem] overflow-hidden">
                    <video
                      ref={(el) => {
                        if (!el) return;
                        const observer = new IntersectionObserver(
                          ([entry]) => { if (entry.isIntersecting) el.play().catch(() => {}); else el.pause(); },
                          { threshold: 0.3 }
                        );
                        observer.observe(el);
                      }}
                      className="w-full h-full object-contain"
                      autoPlay muted loop playsInline preload="auto"
                      poster="/app-preview-poster.jpeg"
                    >
                      <source src="/app-preview.webm" type="video/webm" />
                      <source src="/app-preview.mp4" type="video/mp4" />
                    </video>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" /></svg>
        </motion.div>
      </section>

      {/* ═══ WHAT IT IS — Branded App + AI ═══ */}
      <section className="relative bg-[#070E1B] px-8 py-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[250px] opacity-[0.06]" />
        </div>
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

        <div className="relative max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="flex justify-center lg:order-2"
            >
              <div className="relative">
                <div className="w-[240px] h-[480px] bg-[#1a1a1a] rounded-[2.75rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a] lg:hidden">
                  <div className="w-full h-full bg-black rounded-[2.2rem] overflow-hidden">
                    <video className="w-full h-full object-contain" autoPlay muted loop playsInline preload="auto" poster="/app-preview-poster.jpeg">
                      <source src="/app-preview.webm" type="video/webm" />
                      <source src="/app-preview.mp4" type="video/mp4" />
                    </video>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-8 lg:order-1"
            >
              <div className="inline-flex px-3.5 py-1.5 bg-white/[0.06] border border-white/10 rounded-full">
                <span className="text-[#3DD6C3] font-bold text-xs uppercase tracking-wide">Your Branded App</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight">
                On every client&apos;s phone.
              </h2>
              <p className="text-white/40 text-lg">Your name. Your brand. Their policies. One tap away.</p>

              <div className="h-px bg-gradient-to-r from-[#3DD6C3]/30 via-[#3DD6C3]/10 to-transparent w-32" />

              <p className="text-[#3DD6C3] text-2xl font-extrabold leading-tight">
                Powered by an AI that never sleeps.
              </p>
              <div className="space-y-4">
                <p className="text-lg leading-relaxed">
                  <span className="text-[#3DD6C3] font-bold">Stopping</span>
                  <span className="text-white/40"> chargebacks before they happen.</span>
                </p>
                <p className="text-lg leading-relaxed">
                  <span className="text-[#fdcc02] font-bold">Delivering</span>
                  <span className="text-white/40"> warm referrals on autopilot.</span>
                </p>
                <p className="text-lg leading-relaxed">
                  <span className="text-[#3DD6C3] font-bold">Catching</span>
                  <span className="text-white/40"> every rewrite opportunity.</span>
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES — Earn More ═══ */}
      <section id="features" className="bg-[#F8F9FA] px-8 py-24">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl lg:text-[2.75rem] font-extrabold text-[#0D4D4D] leading-tight mb-4">
              Earn more from leads you&apos;ve won.
            </h2>
            <p className="text-[#6B7280] text-lg mb-12 max-w-xl">Turn every client into a revenue engine with AI-powered referrals and automated rewrites.</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Link href="/v5/referrals" className="group block">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow duration-300"
              >
                <div className="p-8 pb-6">
                  <p className="text-sm text-[#6B7280] mb-2">One-Tap Referrals</p>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-extrabold text-[#0D4D4D] leading-[1.2]">
                      Clients pick a contact, your AI handles the rest.
                    </h3>
                    <div className="w-11 h-11 rounded-full bg-[#0D4D4D] flex items-center justify-center flex-shrink-0 mt-1 group-hover:bg-[#3DD6C3] transition-colors">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </div>
                  </div>
                </div>
                <div className="bg-[#fdcc02] px-6 pt-8 relative overflow-hidden" style={{ minHeight: '320px' }}>
                  <div className="flex justify-center -mb-16">
                    <div className="w-[40%] rounded-xl border-[3px] border-black shadow-2xl overflow-hidden translate-y-6 relative z-10">
                      <img src="/screenshot-referral-sent.png" alt="Referral sent confirmation" className="w-full h-auto block" />
                    </div>
                    <div className="w-[45%] rounded-xl border-[3px] border-black shadow-2xl overflow-hidden -ml-6 relative z-20">
                      <img src="/screenshot-referral-message.png" alt="Referral message with business card" className="w-full h-auto block" />
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>

            <Link href="/v5/rewrites" className="group block">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow duration-300"
              >
                <div className="p-8 pb-6">
                  <p className="text-sm text-[#6B7280] mb-2">Automated Rewrites</p>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-extrabold text-[#0D4D4D] leading-[1.2]">
                      AI so nice, get the commission twice.
                    </h3>
                    <div className="w-11 h-11 rounded-full bg-[#0D4D4D] flex items-center justify-center flex-shrink-0 mt-1 group-hover:bg-[#F4845F] transition-colors">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </div>
                  </div>
                </div>
                <div className="bg-[#F4845F] px-6 pt-8 relative overflow-hidden" style={{ minHeight: '320px' }}>
                  <div className="flex justify-center -mb-16">
                    <div className="w-[40%] rounded-xl border-[3px] border-black shadow-2xl overflow-hidden translate-y-6 relative z-10">
                      <img src="/screenshot-rewrite-convo.png" alt="AI rewrite conversation" className="w-full h-auto block" />
                    </div>
                    <div className="w-[45%] rounded-xl border-[3px] border-black shadow-2xl overflow-hidden -ml-6 relative z-20 bg-white">
                      <img src="/screenshot-rewrite-app.png" alt="Rewrite rate review in app" className="w-full h-auto block" />
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES — Keep What You've Earned ═══ */}
      <section className="bg-[#F8F9FA] px-8 pb-24">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl lg:text-[2.75rem] font-extrabold text-[#0D4D4D] leading-tight mb-4">
              Keep what you&apos;ve earned.
            </h2>
            <p className="text-[#6B7280] text-lg mb-12 max-w-xl">Automated retention that prevents churn and rescues at-risk policies before you lose commission.</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Link href="/v5/retention" className="group block">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow duration-300"
              >
                <div className="p-8 pb-6">
                  <p className="text-sm text-[#6B7280] mb-2">Automated Retention</p>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-extrabold text-[#0D4D4D] leading-[1.2]">
                      You move forward, AI&apos;s got your back.
                    </h3>
                    <div className="w-11 h-11 rounded-full bg-[#0D4D4D] flex items-center justify-center flex-shrink-0 mt-1 group-hover:bg-[#3DD6C3] transition-colors">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </div>
                  </div>
                </div>
                <div className="bg-[#3DD6C3] px-6 pt-8 relative overflow-hidden" style={{ minHeight: '320px' }}>
                  <div className="flex justify-center -mb-16">
                    <div className="w-[40%] rounded-xl border-[3px] border-black shadow-2xl overflow-hidden translate-y-6 relative z-10">
                      <img src="/screenshot-retention-message.png" alt="Conservation message" className="w-full h-auto block" />
                    </div>
                    <div className="w-[45%] rounded-xl border-[3px] border-black shadow-2xl overflow-hidden -ml-6 relative z-20">
                      <img src="/screenshot-retention-booking.png" alt="Booking calendar" className="w-full h-auto block" />
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>

            <Link href="/v5/retention" className="group block">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow duration-300"
              >
                <div className="p-8 pb-6">
                  <p className="text-sm text-[#6B7280] mb-2">Relationships</p>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-extrabold text-[#0D4D4D] leading-[1.2]">
                      Keep them warm without lifting a finger.
                    </h3>
                    <div className="w-11 h-11 rounded-full bg-[#0D4D4D] flex items-center justify-center flex-shrink-0 mt-1 group-hover:bg-[#a158ff] transition-colors">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </div>
                  </div>
                </div>
                <div className="bg-[#a158ff] px-6 pt-8 relative overflow-hidden" style={{ minHeight: '320px' }}>
                  <div className="flex justify-center -mb-16">
                    <div className="w-[40%] rounded-xl border-[3px] border-black shadow-2xl overflow-hidden translate-y-6 relative z-10">
                      <img src="/screenshot-thanksgiving-card.png" alt="Thanksgiving holiday card" className="w-full h-auto block" />
                    </div>
                    <div className="w-[45%] rounded-xl border-[3px] border-black shadow-2xl overflow-hidden -ml-6 relative z-20">
                      <img src="/screenshot-thanksgiving-notification.png" alt="Push notification" className="w-full h-auto block" />
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ THE PROBLEM — Pain Points + Calculator ═══ */}
      <section className="relative bg-white px-8 py-24">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
              <div className="space-y-8">
                <motion.div variants={fadeUp} custom={0}>
                  <p className="text-red-400 font-bold text-xs uppercase tracking-[0.15em] mb-4">The uncomfortable truth</p>
                  <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight">
                    Here&apos;s what&apos;s costing you money right now.
                  </h2>
                </motion.div>

                {[
                  { num: '01', title: 'Silence.', body: 'After the close, you become a name they\'ll never call. Then a lapse notice hits — and a chargeback follows.', accent: '#FF5F57' },
                  { num: '02', title: 'Dead referrals.', body: 'You ask clients to refer friends. They say "sure." They never do. The few who try? The lead goes cold.', accent: '#FEBC2E' },
                  { num: '03', title: 'Missed rewrites.', body: 'Every policy anniversary is a lay-down sale. With no system to flag it, the carrier auto-renews and you miss out.', accent: '#fdcc02' },
                ].map((card, i) => (
                  <motion.div key={card.num} variants={fadeUp} custom={0.1 + i * 0.08}>
                    <button
                      onClick={() => setOpenPain(openPain === i ? null : i)}
                      className="flex gap-5 w-full text-left items-start group"
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${card.accent}15` }}>
                        <span className="text-sm font-black" style={{ color: card.accent }}>{card.num}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-xl font-extrabold text-[#0D4D4D] group-hover:text-[#3DD6C3] transition-colors">{card.title}</h3>
                          <svg className={`w-5 h-5 text-[#6B7280] flex-shrink-0 transition-transform duration-200 ${openPain === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </div>
                    </button>
                    <div className={`overflow-hidden transition-all duration-300 ${openPain === i ? 'max-h-[200px]' : 'max-h-0'}`}>
                      <p className="text-[#6B7280] text-[15px] leading-relaxed pl-[4.25rem] pt-3">{card.body}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div variants={fadeUp} custom={0.3}>
                <LeakyBucketCalculator
                  initialBookSize={250000}
                  initialRetentionRate={70}
                  initialReferralRate={5}
                  initialRewriteRate={10}
                  ctaHref="/founding-member"
                  ctaText="Stop the Bleeding →"
                />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ THE MATH — ROI ═══ */}
      <section className="relative bg-[#0D4D4D] px-8 py-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-red-500 rounded-full blur-[180px] opacity-10" />
          <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[180px] opacity-10" />
        </div>

        <div className="relative max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
            className="space-y-10"
          >
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight mb-3">
                The math is <span className="text-[#3DD6C3]">undeniable</span>.
              </h2>
              <p className="text-white/40 text-lg">One saved policy. One referral. That&apos;s all it takes.</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <motion.div
                variants={fadeUp}
                custom={0.1}
                className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center backdrop-blur-sm"
              >
                <p className="text-red-400 font-semibold text-xs uppercase tracking-wide mb-3">1 Canceled Policy</p>
                <p className="text-5xl font-black text-red-400 mb-2">$1,200</p>
                <p className="text-red-400/50 text-sm">avg annual value lost</p>
              </motion.div>

              <motion.div
                variants={fadeUp}
                custom={0.15}
                className="bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-2xl p-8 text-center backdrop-blur-sm"
              >
                <p className="text-[#3DD6C3] font-semibold text-xs uppercase tracking-wide mb-3">Agent for Life</p>
                <p className="text-5xl font-black text-[#fdcc02] mb-2">$0</p>
                <p className="text-[#3DD6C3]/50 text-sm">free as Founding Member</p>
              </motion.div>

              <motion.div
                variants={fadeUp}
                custom={0.2}
                className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center flex flex-col justify-center"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#fdcc02]/15 rounded-full mb-3 mx-auto">
                  <svg className="w-4 h-4 text-[#fdcc02]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-[#fdcc02] font-bold text-xs uppercase">Instant ROI</span>
                </div>
                <p className="text-white font-extrabold text-lg leading-snug">
                  Every save and every referral is{' '}
                  <span className="text-[#fdcc02]">pure profit</span>.
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS — Four Steps ═══ */}
      <section id="how-it-works" className="relative bg-white px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-12"
          >
            <div className="text-center">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-3">
                Up and running in{' '}<span className="text-[#3DD6C3]">10 minutes</span>.
              </h2>
              <p className="text-[#6B7280] text-lg">No complex setup. No IT department.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {STEPS.map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.1 * i }}
                  className={`bg-[#F8F9FA] rounded-2xl p-7 border-2 transition-all duration-300 cursor-pointer ${activeStep === i ? 'border-[#3DD6C3] shadow-lg shadow-[#3DD6C3]/10' : 'border-gray-100 hover:border-gray-200'}`}
                  onClick={() => setActiveStep(i)}
                >
                  <div className="w-12 h-12 bg-[#0D4D4D] rounded-xl flex items-center justify-center mb-4">
                    <span className="text-lg font-bold" style={{ color: step.color }}>{step.num}</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">{step.title}</h3>
                  <p className="text-[#6B7280] text-sm leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>

            <div className="flex justify-center pt-4">
              <Link
                href="/founding-member"
                className="inline-flex items-center gap-2.5 px-8 py-4 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-lg shadow-[#fdcc02]/20 hover:shadow-xl hover:shadow-[#fdcc02]/30 hover:scale-[1.02] transition-all"
              >
                Get Started Free
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ TRUST STRIP ═══ */}
      <section className="bg-[#F8F9FA] px-8 py-16">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h3 className="text-center text-lg font-bold text-[#0D4D4D] mb-10">
              Built for <span className="text-[#3DD6C3]">trust</span>
            </h3>
            <div className="grid grid-cols-3 gap-8">
              {[
                { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', label: 'Your Data, Your Book', sub: 'We never contact your clients independently' },
                { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'AES-256 Encryption', sub: 'At rest and in transit via TLS' },
                { icon: 'M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4', label: 'Biometric Security', sub: 'Coming soon', badge: true },
              ].map((t) => (
                <div key={t.label} className="flex flex-col items-center text-center gap-3 p-6 bg-white rounded-2xl border border-gray-100">
                  <div className="w-12 h-12 bg-[#0D4D4D]/5 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0D4D4D] leading-snug">{t.label}</p>
                    <p className="text-xs text-[#6B7280] leading-snug mt-1">
                      {t.sub}
                      {t.badge && <span className="ml-1.5 inline-block px-2 py-0.5 bg-[#3DD6C3]/10 text-[#3DD6C3] text-[9px] font-bold rounded-full align-middle">SOON</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="relative bg-white px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
            className="space-y-12"
          >
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-3">
                This will cost <span className="line-through text-[#6B7280]/50">$49/mo</span>.<br />
                <span className="text-[#3DD6C3]">But not for you.</span>
              </h2>
              <p className="text-[#6B7280] text-lg">150 early spots across 3 tiers, then gone forever.</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
              <motion.div
                variants={fadeUp}
                custom={0.1}
                className="relative bg-white rounded-2xl border-2 border-[#a158ff] p-8 text-center shadow-xl shadow-[#a158ff]/10 md:col-span-2 md:row-span-1 md:col-start-1"
              >
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1.5 bg-[#a158ff] text-white text-xs font-bold rounded-full">NOW OPEN</span>
                </div>
                <p className="text-[#6B7280] font-medium text-base mt-2 mb-2">Founding Members</p>
                <p className="text-5xl font-black text-[#0D4D4D] mb-1">FREE</p>
                <p className="text-[#a158ff] font-semibold text-base mb-1">For Life</p>
                <p className="text-[#6B7280] text-sm line-through mb-1">$49/mo</p>
                <p className="text-[#6B7280] text-sm mb-5">50 spots — then gone forever</p>
                {spotsRemaining !== null && (
                  <div className="mb-6">
                    <div className="w-full bg-[#a158ff]/10 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-[#a158ff] rounded-full transition-all duration-1000" style={{ width: `${((50 - spots) / 50) * 100}%` }} />
                    </div>
                    <p className="text-sm text-[#a158ff] font-bold mt-2">{spots} spots remaining</p>
                  </div>
                )}
                <Link href="/founding-member" className="block w-full py-4 bg-[#a158ff] text-white text-base font-bold rounded-xl hover:bg-[#a158ff]/90 transition-colors">
                  Apply Now
                </Link>
              </motion.div>

              {[
                { tier: 'Charter', price: '$25', note: 'Next tier', border: 'border-[#3DD6C3]' },
                { tier: 'Inner Circle', price: '$35', note: 'After Charter', border: 'border-gray-200' },
              ].map((t, i) => (
                <motion.div
                  key={t.tier}
                  variants={fadeUp}
                  custom={0.2 + i * 0.05}
                  className={`rounded-2xl border-2 ${t.border} p-6 text-center`}
                >
                  <p className="text-xs text-[#6B7280] font-medium mb-1">{t.tier}</p>
                  <p className="text-3xl font-black text-[#0D4D4D] mb-0.5">{t.price}</p>
                  <p className="text-xs text-[#6B7280]">/mo · {t.note}</p>
                </motion.div>
              ))}
            </div>

            <motion.p variants={fadeUp} custom={0.3} className="text-center text-[#6B7280] text-sm">
              No contracts · Lock in your price for life · Cancel anytime
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="bg-[#F8F9FA] px-8 py-24">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="space-y-5"
          >
            <h2 className="text-3xl font-extrabold text-[#0D4D4D] mb-8 text-center">
              Questions<span className="text-[#3DD6C3]">?</span>
            </h2>

            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-7 py-5 text-left flex items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors"
                  aria-expanded={openFaq === i}
                >
                  <span className="text-base font-semibold text-[#0D4D4D] leading-snug">{item.question}</span>
                  <svg className={`w-5 h-5 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-[400px]' : 'max-h-0'}`}>
                  <div className="px-7 pb-5">
                    <p className="text-[#6B7280] text-[15px] leading-relaxed">{item.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="relative bg-[#0D4D4D] px-8 py-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-15" />
          <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-[#fdcc02] rounded-full blur-[150px] opacity-10" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative text-center max-w-3xl mx-auto space-y-8"
        >
          <p className="text-white/30 text-xs uppercase tracking-[0.2em] font-medium">Stop leaving money on the table</p>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight">
            Your competitors aren&apos;t reading this.{' '}
            <span className="text-[#fdcc02]">They&apos;re losing clients.</span>
          </h2>
          <p className="text-white/40 text-lg leading-relaxed max-w-xl mx-auto">
            Lock in your free lifetime spot. No credit card. No risk. A system that pays for itself from day one.
          </p>
          <Link
            href="/founding-member"
            className="inline-flex items-center gap-3 px-10 py-5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 hover:shadow-[#fdcc02]/40 hover:scale-[1.02] transition-all"
          >
            Lock In My Free Lifetime Spot
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/25 text-sm">
            {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} · $0 forever
          </p>
        </motion.div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-[#0D4D4D] border-t border-white/5 px-8 py-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="AgentForLife" className="w-10 h-6 object-contain" />
            <span className="text-lg text-white brand-title">AgentForLife</span>
          </div>
          <nav className="flex items-center gap-8">
            <Link href="/login" className="text-white/40 text-sm hover:text-white/60 transition-colors">Login</Link>
            <a href="mailto:support@agentforlife.app" className="text-white/40 text-sm hover:text-white/60 transition-colors">Contact</a>
            <Link href="/privacy" className="text-white/40 text-sm hover:text-white/60 transition-colors">Privacy</Link>
            <Link href="/terms" className="text-white/40 text-sm hover:text-white/60 transition-colors">Terms</Link>
          </nav>
          <p className="text-white/25 text-sm">&copy; 2026 AgentForLife</p>
        </div>
      </footer>
    </div>
  );
}
