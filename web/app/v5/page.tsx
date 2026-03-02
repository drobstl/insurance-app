'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
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
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

export default function DesktopLandingV5() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [openPain, setOpenPain] = useState<number | null>(null);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const spots = spotsRemaining ?? 50;

  return (
    <div className="min-h-screen bg-[#0D4D4D] overflow-x-hidden">

      {/* ═══ ALWAYS-VISIBLE NAV ═══ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0D4D4D]/95 backdrop-blur-md border-b border-white/10 shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 lg:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="AgentForLife" className="w-[44px] h-[25px] object-contain" />
            <span className="text-white/80 brand-title text-base">AgentForLife</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
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
      </nav>

      {/* ═══ HERO ═══ */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden pt-20" style={{ background: '#0D4D4D radial-gradient(ellipse 600px 600px at 0% 0%, rgba(61,214,195,0.18), transparent 70%), radial-gradient(ellipse 500px 500px at 100% 80%, rgba(253,204,2,0.07), transparent 70%)' }}>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
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
                className="text-white/50 text-lg lg:text-xl leading-relaxed mb-4 max-w-[520px]"
              >
                We built a system that makes sure they never do. A branded app on their phone. An AI that never sleeps.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.55 }}
                className="flex flex-wrap gap-x-6 gap-y-2 mb-10"
              >
                <p className="text-[15px]"><span className="text-[#3DD6C3] font-bold">Stopping</span><span className="text-white/35"> chargebacks before they happen.</span></p>
                <p className="text-[15px]"><span className="text-[#fdcc02] font-bold">Delivering</span><span className="text-white/35"> warm referrals on autopilot.</span></p>
                <p className="text-[15px]"><span className="text-[#3DD6C3] font-bold">Catching</span><span className="text-white/35"> every rewrite opportunity.</span></p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.65 }}
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

            {/* Phone mockup with floating badges */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="hidden lg:flex justify-center"
            >
              <div className="relative">
                {/* Floating feature badges — CSS animations, no framer-motion */}
                <div className="absolute -left-32 top-16 z-10 animate-float-a">
                  <div className="px-3.5 py-2 bg-[#3DD6C3]/15 border border-[#3DD6C3]/25 rounded-xl">
                    <span className="text-[#3DD6C3] text-xs font-bold">🛡️ Conservation Alerts</span>
                  </div>
                </div>
                <div className="absolute -right-28 top-32 z-10 animate-float-b">
                  <div className="px-3.5 py-2 bg-[#fdcc02]/15 border border-[#fdcc02]/25 rounded-xl">
                    <span className="text-[#fdcc02] text-xs font-bold">🤝 AI Referrals</span>
                  </div>
                </div>
                <div className="absolute -left-24 bottom-32 z-10 animate-float-c">
                  <div className="px-3.5 py-2 bg-white/[0.08] border border-white/15 rounded-xl">
                    <span className="text-white/80 text-xs font-bold">🎄 Holiday Cards</span>
                  </div>
                </div>
                <div className="absolute -right-20 bottom-48 z-10 animate-float-d">
                  <div className="px-3.5 py-2 bg-[#F4845F]/15 border border-[#F4845F]/25 rounded-xl">
                    <span className="text-[#F4845F] text-xs font-bold">📅 Rewrites</span>
                  </div>
                </div>

                <div className="w-[300px] h-[600px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl shadow-[#3DD6C3]/10 border-4 border-[#2a2a2a]">
                  <div className="w-full h-full bg-black rounded-[2.4rem] overflow-hidden">
                    <video
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

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" /></svg>
        </div>
      </section>

      {/* ═══ FEATURE 1: REFERRALS (light bg) ═══ */}
      <section id="features" className="bg-[#F8F9FA] px-6 lg:px-8 py-24 lg:py-32">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#fdcc02]/10 border border-[#fdcc02]/20 rounded-full mb-5">
                <svg className="w-3.5 h-3.5 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">One-Tap Referrals</span>
              </div>
              <h2 className="text-3xl lg:text-[2.75rem] font-extrabold text-[#0D4D4D] leading-tight mb-4">
                Put a referral button in every client&apos;s pocket. AI takes it from there.
              </h2>
              <p className="text-[#6B7280] text-lg leading-relaxed mb-8 max-w-lg">
                One tap from your client. AI texts the referral via iMessage, qualifies them, and books the appointment on your calendar. You just show up and close.
              </p>
              <Link href="/v5/referrals" className="inline-flex items-center gap-2 text-[#0D4D4D] font-bold text-base hover:text-[#3DD6C3] transition-colors group">
                See how it works
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex justify-center gap-4">
              <div className="w-[220px] rounded-2xl border-[3px] border-black shadow-2xl overflow-hidden transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <img src="/screenshot-referral-sent.png" alt="Referral sent confirmation" className="w-full h-auto block" />
              </div>
              <div className="w-[220px] rounded-2xl border-[3px] border-black shadow-2xl overflow-hidden transform rotate-3 translate-y-8 hover:rotate-0 hover:translate-y-0 transition-transform duration-500">
                <img src="/screenshot-referral-message.png" alt="Referral message with business card" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURE 2: REWRITES (dark bg) ═══ */}
      <section className="px-6 lg:px-8 py-24 lg:py-32 relative overflow-hidden" style={{ background: '#070E1B radial-gradient(ellipse 400px 400px at 100% 100%, rgba(244,132,95,0.06), transparent 70%)' }}>
        <div className="max-w-6xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex justify-center gap-4 lg:order-1">
              <div className="w-[220px] rounded-2xl border-[3px] border-white/20 shadow-2xl overflow-hidden transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <img src="/screenshot-rewrite-convo.png" alt="AI rewrite conversation" className="w-full h-auto block" />
              </div>
              <div className="w-[220px] rounded-2xl border-[3px] border-white/20 shadow-2xl overflow-hidden transform rotate-3 translate-y-8 hover:rotate-0 hover:translate-y-0 transition-transform duration-500 bg-white">
                <img src="/screenshot-rewrite-app.png" alt="Rewrite rate review in app" className="w-full h-auto block" />
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F4845F]/15 border border-[#F4845F]/25 rounded-full mb-5">
                <svg className="w-3.5 h-3.5 text-[#F4845F]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-white font-bold text-xs uppercase tracking-wide">Automated Rewrites</span>
              </div>
              <h2 className="text-3xl lg:text-[2.75rem] font-extrabold text-white leading-tight mb-4">
                Every anniversary is a booked appointment.
              </h2>
              <p className="text-white/50 text-lg leading-relaxed mb-8 max-w-lg">
                When a policy hits its one-year mark, your client hears from you — not the carrier. AI sends a notification, they book on your calendar. The rewrite comes to you.
              </p>
              <Link href="/v5/rewrites" className="inline-flex items-center gap-2 text-[#F4845F] font-bold text-base hover:text-[#fdcc02] transition-colors group">
                See how it works
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURE 3: RETENTION (light bg) ═══ */}
      <section className="bg-[#F8F9FA] px-6 lg:px-8 py-24 lg:py-32">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full mb-5">
                <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">Automated Retention</span>
              </div>
              <h2 className="text-3xl lg:text-[2.75rem] font-extrabold text-[#0D4D4D] leading-tight mb-4">
                You move forward, AI&apos;s got your back.
              </h2>
              <p className="text-[#6B7280] text-lg leading-relaxed mb-8 max-w-lg">
                When a policy slips, forward the carrier&apos;s conservation notice. AI extracts the client info, matches your records, and sends personalized outreach within hours. Then follows up on Day 2, 5, and 7.
              </p>
              <Link href="/v5/retention" className="inline-flex items-center gap-2 text-[#0D4D4D] font-bold text-base hover:text-[#3DD6C3] transition-colors group">
                See how it works
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex justify-center gap-4">
              <div className="w-[220px] rounded-2xl border-[3px] border-black shadow-2xl overflow-hidden transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <img src="/screenshot-retention-message.png" alt="Conservation message" className="w-full h-auto block" />
              </div>
              <div className="w-[220px] rounded-2xl border-[3px] border-black shadow-2xl overflow-hidden transform rotate-3 translate-y-8 hover:rotate-0 hover:translate-y-0 transition-transform duration-500">
                <img src="/screenshot-retention-booking.png" alt="Booking calendar" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURE 4: RELATIONSHIPS (purple bg) ═══ */}
      <section className="bg-[#a158ff] px-6 lg:px-8 py-24 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="max-w-6xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex justify-center gap-4 lg:order-1">
              <div className="w-[220px] rounded-2xl border-[3px] border-black/50 shadow-2xl overflow-hidden transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <img src="/screenshot-thanksgiving-card.png" alt="Thanksgiving holiday card" className="w-full h-auto block" />
              </div>
              <div className="w-[220px] rounded-2xl border-[3px] border-black/50 shadow-2xl overflow-hidden transform rotate-3 translate-y-8 hover:rotate-0 hover:translate-y-0 transition-transform duration-500">
                <img src="/screenshot-thanksgiving-notification.png" alt="Push notification" className="w-full h-auto block" />
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 rounded-full mb-5">
                <span className="text-white font-bold text-xs uppercase tracking-wide">Relationships on Autopilot</span>
              </div>
              <h2 className="text-3xl lg:text-[2.75rem] font-extrabold text-white leading-tight mb-4">
                People don&apos;t refer agents, they refer relationships.
              </h2>
              <p className="text-white/70 text-lg leading-relaxed mb-8 max-w-lg">
                7+ personalized touchpoints per year, per client — completely automatic. Holiday cards for 5 major holidays, birthday messages, anniversary alerts, and custom push notifications.
              </p>
              <Link href="/v5/relationships" className="inline-flex items-center gap-2 text-white font-bold text-base hover:text-[#fdcc02] transition-colors group">
                See how it works
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ ALWAYS IN SYNC — Two Surfaces, One System ═══ */}
      <section className="px-6 lg:px-8 py-24 lg:py-32 relative overflow-hidden" style={{ background: '#070E1B radial-gradient(ellipse 500px 500px at 25% 33%, rgba(61,214,195,0.05), transparent 70%), radial-gradient(ellipse 400px 400px at 75% 75%, rgba(253,204,2,0.03), transparent 70%)' }}>
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative max-w-6xl mx-auto">
          <motion.div className="text-center mb-16" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/10 rounded-full mb-6">
              <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              <span className="text-[#3DD6C3] font-bold text-sm uppercase tracking-wide">Always in Sync</span>
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-4">Two Surfaces. <span className="text-[#3DD6C3]">One System.</span></h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">Your dashboard and your client&apos;s app are the same system. Every action, every touchpoint, every alert — synced in real time.</p>
          </motion.div>

          <div className="grid md:grid-cols-[1fr_auto_1fr] gap-6 items-center mb-16">
            {/* Dashboard mockup */}
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <div className="bg-white/[0.04] rounded-2xl overflow-hidden border border-white/[0.08]">
                <div className="flex items-center gap-1.5 px-4 py-2.5 bg-white/[0.03] border-b border-white/5">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                  </div>
                  <div className="flex-1 mx-3"><div className="bg-white/[0.06] rounded-md px-3 py-1 text-white/25 text-[9px] font-mono text-center">agentforlife.app/dashboard</div></div>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-[#0D4D4D] rounded-lg flex items-center justify-center"><span className="text-[#3DD6C3] text-[10px] font-bold">D</span></div>
                      <span className="text-white/70 font-semibold text-[11px]">Agent Dashboard</span>
                    </div>
                    <span className="px-2 py-0.5 bg-[#3DD6C3]/10 text-[#3DD6C3] text-[8px] font-bold rounded-full uppercase">Live</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { dot: 'bg-[#3DD6C3]', text: 'Holiday card sent to 47 clients', tag: 'Auto' },
                      { dot: 'bg-[#fdcc02]', text: 'New referral: Mike J. — AI qualifying', tag: 'Live' },
                      { dot: 'bg-red-400', text: 'Conservation alert: Sarah J.', tag: 'Action' },
                      { dot: 'bg-[#3DD6C3]', text: 'Policy review: Lisa M. — booked', tag: 'Win' },
                    ].map((row) => (
                      <div key={row.text} className="flex items-center gap-2.5 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
                        <div className={`w-1.5 h-1.5 rounded-full ${row.dot} flex-shrink-0`} />
                        <span className="text-white/60 text-[10px] flex-1">{row.text}</span>
                        <span className="text-white/25 text-[9px]">{row.tag}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { val: '127', label: 'Clients', color: 'text-white' },
                      { val: '12', label: 'Referrals', color: 'text-[#3DD6C3]' },
                      { val: '5', label: 'Saved', color: 'text-[#fdcc02]' },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/[0.04] rounded-lg border border-white/[0.06] p-2.5 text-center">
                        <p className={`text-lg font-black ${s.color}`}>{s.val}</p>
                        <p className="text-[8px] text-white/30 uppercase tracking-wide">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-center text-white/25 text-xs mt-3 font-medium">You see everything. Control everything.</p>
            </motion.div>

            {/* Sync indicator */}
            {/* Sync indicator — CSS animation */}
            <div className="hidden md:flex flex-col items-center gap-3 px-2">
              <div className="animate-pulse-fade">
                <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-px h-8 bg-gradient-to-b from-transparent via-[#3DD6C3]/40 to-transparent" />
                <span className="text-[#3DD6C3] text-[9px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] py-2">Syncs Live</span>
                <div className="w-px h-8 bg-gradient-to-b from-transparent via-[#3DD6C3]/40 to-transparent" />
              </div>
              <div className="animate-pulse-fade-delay">
                <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              </div>
            </div>

            {/* Phone mockup */}
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex justify-center">
              <div>
                <div className="w-[220px] h-[420px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl shadow-[#3DD6C3]/10 border-4 border-[#2a2a2a] relative">
                  <div className="w-full h-full bg-[#111] rounded-[2rem] overflow-hidden px-3.5 py-5 relative">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-full bg-[#005851] flex items-center justify-center"><span className="text-[#3DD6C3] text-[10px] font-bold">D</span></div>
                      <div><p className="text-white text-[11px] font-semibold">Daniel Roberts</p><p className="text-white/35 text-[8px]">Your Agent</p></div>
                    </div>
                    <div className="space-y-2.5">
                      <div className="bg-white/[0.08] rounded-xl p-2.5 border border-white/5">
                        <div className="flex items-center gap-2"><span className="text-sm">🎄</span><div><p className="text-white/90 text-[9px] font-bold">Merry Christmas!</p><p className="text-white/40 text-[7px]">Tap to view your card</p></div></div>
                      </div>
                      <div className="bg-white/[0.08] rounded-xl p-2.5 border border-white/5">
                        <p className="text-white/30 text-[7px] uppercase tracking-wider mb-1.5">Your Policies</p>
                        <div className="flex items-center justify-between"><span className="text-white/70 text-[9px]">Auto — State Farm</span><span className="text-[#3DD6C3] text-[7px] font-semibold">Active</span></div>
                        <div className="flex items-center justify-between mt-1"><span className="text-white/70 text-[9px]">Life — Mutual of Omaha</span><span className="text-[#3DD6C3] text-[7px] font-semibold">Active</span></div>
                      </div>
                      <div className="bg-[#fdcc02] rounded-xl py-2.5 text-center"><p className="text-[#0D4D4D] text-[10px] font-bold">Refer a Friend</p></div>
                      <div className="bg-[#005851] rounded-xl py-2.5 text-center"><p className="text-white text-[10px] font-bold">Contact Daniel</p></div>
                    </div>
                  </div>
                </div>
                <p className="text-center text-white/25 text-xs mt-3 font-medium">Your clients see their branded app.</p>
              </div>
            </motion.div>
          </div>

          {/* Sync feed */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { dashboard: 'You upload Sarah\'s policy', client: 'Sarah sees it in her app instantly', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', accent: '#3DD6C3' },
              { dashboard: 'AI sends holiday card', client: 'Full-screen card on their phone', icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7', accent: '#fdcc02' },
              { dashboard: 'Referral comes in', client: 'AI texts referral via iMessage', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', accent: '#fdcc02' },
              { dashboard: 'Conservation alert fires', client: 'Client gets outreach in hours', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', accent: '#3DD6C3' },
            ].map((item, i) => (
              <div key={i} className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${item.accent}15` }}>
                    <svg className="w-3.5 h-3.5" style={{ color: item.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                  </div>
                  <svg className="w-3 h-3 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </div>
                <p className="text-white/70 text-[11px] font-medium mb-1">{item.dashboard}</p>
                <p className="text-[11px] font-semibold" style={{ color: item.accent }}>{item.client}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ PAIN POINTS + CALCULATOR ═══ */}
      <section className="relative bg-white px-6 lg:px-8 py-24">
        <div className="max-w-7xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
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
                    <button onClick={() => setOpenPain(openPain === i ? null : i)} className="flex gap-5 w-full text-left items-start group">
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

      {/* ═══ ROI ═══ */}
      <section className="relative px-6 lg:px-8 py-24 overflow-hidden" style={{ background: '#0D4D4D radial-gradient(ellipse 300px 300px at 0% 0%, rgba(239,68,68,0.08), transparent 70%), radial-gradient(ellipse 300px 300px at 100% 100%, rgba(61,214,195,0.08), transparent 70%)' }}>
        <div className="relative max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="space-y-10">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight mb-3">
                The math is <span className="text-[#3DD6C3]">undeniable</span>.
              </h2>
              <p className="text-white/40 text-lg">One saved policy. One referral. That&apos;s all it takes.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <motion.div variants={fadeUp} custom={0.1} className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center">
                <p className="text-red-400 font-semibold text-xs uppercase tracking-wide mb-3">1 Canceled Policy</p>
                <p className="text-5xl font-black text-red-400 mb-2">$1,200</p>
                <p className="text-red-400/50 text-sm">avg annual value lost</p>
              </motion.div>
              <motion.div variants={fadeUp} custom={0.15} className="bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-2xl p-8 text-center">
                <p className="text-[#3DD6C3] font-semibold text-xs uppercase tracking-wide mb-3">Agent for Life</p>
                <p className="text-5xl font-black text-[#fdcc02] mb-2">$0</p>
                <p className="text-[#3DD6C3]/50 text-sm">free as Founding Member</p>
              </motion.div>
              <motion.div variants={fadeUp} custom={0.2} className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 text-center flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#fdcc02]/15 rounded-full mb-3 mx-auto">
                  <svg className="w-4 h-4 text-[#fdcc02]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-[#fdcc02] font-bold text-xs uppercase">Instant ROI</span>
                </div>
                <p className="text-white font-extrabold text-lg leading-snug">Every save and every referral is <span className="text-[#fdcc02]">pure profit</span>.</p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS — Horizontal Timeline ═══ */}
      <section id="how-it-works" className="bg-white px-6 lg:px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-3">
              Up and running in <span className="text-[#3DD6C3]">10 minutes</span>.
            </h2>
            <p className="text-[#6B7280] text-lg">No complex setup. No IT department.</p>
          </motion.div>

          <div className="relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-7 left-[calc(12.5%+28px)] right-[calc(12.5%+28px)] h-px bg-[#3DD6C3]/20" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { num: '1', title: 'Sign Up & Brand', desc: 'Add your photo, logo, and scheduling link. Instantly branded to you.', color: '#3DD6C3' },
                { num: '2', title: 'Import Your Book', desc: 'Upload CSV or drop in a PDF — AI extracts clients, policies, and beneficiaries.', color: '#fdcc02' },
                { num: '3', title: 'Share with Clients', desc: 'They download your app with a unique code. Personalized welcome notification.', color: '#3DD6C3' },
                { num: '4', title: 'AI Takes Over', desc: 'Touchpoints, referral follow-ups, conservation alerts — all on autopilot.', color: '#fdcc02' },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.1 * i }}
                  className="text-center relative"
                >
                  <div className="w-14 h-14 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-5 relative z-10">
                    <span className="text-xl font-bold" style={{ color: step.color }}>{step.num}</span>
                  </div>
                  {i < 3 && (
                    <div className="hidden md:block absolute top-7 -right-4 w-8">
                      <div className="h-px bg-[#3DD6C3]/30 w-full relative">
                        <svg className="w-2 h-2 text-[#3DD6C3]/50 absolute -right-1 -top-[3px]" fill="currentColor" viewBox="0 0 6 6"><path d="M0 0l6 3-6 3z" /></svg>
                      </div>
                    </div>
                  )}
                  <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">{step.title}</h3>
                  <p className="text-[#6B7280] text-sm leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="flex justify-center pt-12">
            <Link
              href="/founding-member"
              className="inline-flex items-center gap-2.5 px-8 py-4 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-lg shadow-[#fdcc02]/20 hover:shadow-xl hover:shadow-[#fdcc02]/30 hover:scale-[1.02] transition-all"
            >
              Get Started Free
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ TRUST ═══ */}
      <section className="bg-[#F8F9FA] px-6 lg:px-8 py-16">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-center text-lg font-bold text-[#0D4D4D] mb-10">Built for <span className="text-[#3DD6C3]">trust</span></h3>
          <div className="grid grid-cols-3 gap-6">
            {[
              { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', label: 'Your Data, Your Book', sub: 'We never contact your clients independently' },
              { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'AES-256 Encryption', sub: 'At rest and in transit via TLS' },
              { icon: 'M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4', label: 'Biometric Security', sub: 'Coming soon', badge: true },
            ].map((t) => (
              <div key={t.label} className="flex flex-col items-center text-center gap-3 p-6 bg-white rounded-2xl border border-gray-100">
                <div className="w-12 h-12 bg-[#0D4D4D]/5 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} /></svg>
                </div>
                <p className="text-sm font-semibold text-[#0D4D4D]">{t.label}</p>
                <p className="text-xs text-[#6B7280]">
                  {t.sub}
                  {t.badge && <span className="ml-1.5 inline-block px-2 py-0.5 bg-[#3DD6C3]/10 text-[#3DD6C3] text-[9px] font-bold rounded-full align-middle">SOON</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="bg-white px-6 lg:px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="space-y-12">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-3">
                This will cost <span className="line-through text-[#6B7280]/50">$49/mo</span>.<br />
                <span className="text-[#3DD6C3]">But not for you.</span>
              </h2>
              <p className="text-[#6B7280] text-lg">150 early spots across 3 tiers, then gone forever.</p>
            </motion.div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              <motion.div variants={fadeUp} custom={0.1} className="relative bg-white rounded-2xl border-2 border-[#a158ff] p-6 text-center shadow-xl shadow-[#a158ff]/10 col-span-2 lg:col-span-1">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1.5 bg-[#a158ff] text-white text-xs font-bold rounded-full">NOW OPEN</span>
                </div>
                <p className="text-[#6B7280] font-medium text-sm mt-2 mb-1">Founding Members</p>
                <p className="text-4xl font-black text-[#0D4D4D] mb-1">FREE</p>
                <p className="text-[#a158ff] font-semibold text-sm mb-1">For Life</p>
                <p className="text-[#6B7280] text-xs line-through mb-0.5">$49/mo</p>
                <p className="text-[#6B7280] text-xs mb-4">50 spots — then gone forever</p>
                {spotsRemaining !== null && (
                  <div className="mb-4">
                    <div className="w-full bg-[#a158ff]/10 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-[#a158ff] rounded-full transition-all duration-1000" style={{ width: `${((50 - spots) / 50) * 100}%` }} />
                    </div>
                    <p className="text-xs text-[#a158ff] font-bold mt-2">{spots} spots remaining</p>
                  </div>
                )}
                <Link href="/founding-member" className="block w-full py-3.5 bg-[#a158ff] text-white text-sm font-bold rounded-xl hover:bg-[#a158ff]/90 transition-colors">Apply Now</Link>
              </motion.div>
              {[
                { tier: 'Charter', price: '$25', note: 'Next tier', border: 'border-[#3DD6C3]' },
                { tier: 'Inner Circle', price: '$35', note: 'After Charter', border: 'border-gray-200' },
                { tier: 'Standard', price: '$49', note: 'Full Price', border: 'border-gray-200' },
              ].map((t, i) => (
                <motion.div key={t.tier} variants={fadeUp} custom={0.15 + i * 0.05} className={`rounded-2xl border-2 ${t.border} p-6 text-center`}>
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
      <section id="faq" className="bg-[#F8F9FA] px-6 lg:px-8 py-24">
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="space-y-5">
            <h2 className="text-3xl font-extrabold text-[#0D4D4D] mb-8 text-center">Questions<span className="text-[#3DD6C3]">?</span></h2>
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full px-7 py-5 text-left flex items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors" aria-expanded={openFaq === i}>
                  <span className="text-base font-semibold text-[#0D4D4D] leading-snug">{item.question}</span>
                  <svg className={`w-5 h-5 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-[400px]' : 'max-h-0'}`}>
                  <div className="px-7 pb-5"><p className="text-[#6B7280] text-[15px] leading-relaxed">{item.answer}</p></div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="relative px-6 lg:px-8 py-28 overflow-hidden" style={{ background: '#0D4D4D radial-gradient(ellipse 400px 400px at 25% 0%, rgba(61,214,195,0.12), transparent 70%), radial-gradient(ellipse 300px 300px at 75% 100%, rgba(253,204,2,0.08), transparent 70%)' }}>
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="relative text-center max-w-3xl mx-auto space-y-8">
          <p className="text-white/30 text-xs uppercase tracking-[0.2em] font-medium">Stop leaving money on the table</p>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight">
            Your competitors aren&apos;t reading this. <span className="text-[#fdcc02]">They&apos;re losing clients.</span>
          </h2>
          <p className="text-white/40 text-lg leading-relaxed max-w-xl mx-auto">Lock in your free lifetime spot. No credit card. No risk. A system that pays for itself from day one.</p>
          <Link href="/founding-member" className="inline-flex items-center gap-3 px-10 py-5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 hover:shadow-[#fdcc02]/40 hover:scale-[1.02] transition-all">
            Lock In My Free Lifetime Spot
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/25 text-sm">{spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} · $0 forever</p>
        </motion.div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-[#0D4D4D] border-t border-white/5 px-6 lg:px-8 py-12">
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
