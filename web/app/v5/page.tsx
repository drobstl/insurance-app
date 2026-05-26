'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import LeakyBucketCalculator from '@/components/LeakyBucketCalculator';
import { useTierCTA } from '@/hooks/useTierCTA';

const FAQ_ITEMS = [
  { question: 'What exactly is Agent for Life?', answer: 'A complete client relationship system for insurance agents. You get a branded mobile app for your clients, automated touchpoints (holidays, birthdays, anniversaries), one-tap referrals where AFL qualifies the lead via iMessage and books the appointment, retention alerts that rescue at-risk policies, and anniversary rewrite alerts.' },
  { question: 'How does AFL 3x my book?', answer: 'Every closed sale has three payouts available — the premium you wrote, the referrals that client could send, and the rewrite at the policy\'s anniversary. Most agents only collect the first. AFL automates the other two: one-tap referral buttons in every client\'s hand (AFL qualifies and books on your calendar), and anniversary outreach that turns every renewal into a booked review. Your book stops decaying and starts compounding.' },
  { question: 'How hard is it to get started?', answer: 'You can be live in 10 minutes. Import your clients via CSV or upload PDF applications — AFL extracts everything. Enable the referral assistant with one toggle and your clients get welcomed onto the app one by one.' },
  { question: 'Is my data safe?', answer: "Yes. Your client data is encrypted with AES-256, stored on Google Cloud, and only accessible by you. We never contact your clients independently, and no other agent can see your book of business." },
  { question: 'What carriers does it work with?', answer: 'All of them. Agent for Life is carrier-agnostic. Works for independent agents regardless of which carriers you\'re appointed with.' },
  { question: 'How does pricing work?', answer: 'Growth at $49/mo (75 conversations) runs your post-sale book — retention, anniversaries, referrals, bulk import. Pro at $99/mo (200 conversations) adds the pre-sale tools on top: Leads, Activity, the close-the-sale conveyor, and the Performance page that scores your call transcripts. Agency starts at $349/mo with band pricing for teams. Push notifications, agent-phone one-tap texts, and email are unlimited on every tier; the conversation budget is for the AFL-driven conversation line. 14-day free trial on Growth.' },
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
  const tier = useTierCTA();

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [openPain, setOpenPain] = useState<number | null>(null);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <div className="min-h-screen bg-[#0D4D4D] overflow-x-hidden">

      {/* ═══ ALWAYS-VISIBLE NAV ═══ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0D4D4D]/95 backdrop-blur-md border-b border-white/10 shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 lg:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="AgentForLife" className="w-[44px] h-[25px] object-contain" />
            <span className="text-white/80 brand-title text-base">AgentForLife™</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors">Features</a>
            <a href="#how-it-works" className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors">How It Works</a>
            <a href="#pricing" className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors">Pricing</a>
            <a href="#faq" className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-white/90 hover:text-white text-sm font-medium transition-colors"
            >
              Agent Login
            </Link>
            <Link
              href={tier.ctaHref}
              className="px-5 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full hover:bg-[#fdcc02]/90 transition-colors"
            >
              {tier.isFoundingOpen ? 'Get Started Free' : tier.ctaText}
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden pt-20 pb-20 lg:pb-28" style={{ background: 'radial-gradient(ellipse 600px 600px at 0% 0%, rgba(61,214,195,0.18), transparent 70%), radial-gradient(ellipse 500px 500px at 100% 80%, rgba(253,204,2,0.07), transparent 70%), #0D4D4D' }}>
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
                    {tier.loaded ? tier.bannerText : 'Built to 3x your book'}
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
                <span className="text-[#3DD6C3]">you</span> exist.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45 }}
                className="text-white/50 text-lg lg:text-xl leading-relaxed mb-4 max-w-[520px]"
              >
                We built a system that makes sure they never do. A branded app on their phone. AFL working in the background, around the clock.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.55 }}
                className="flex flex-wrap gap-x-6 gap-y-2 mb-10"
              >
                <p className="text-[15px]"><span className="text-[#3DD6C3] font-bold">Stopping</span><span className="text-white/70"> chargebacks before they happen.</span></p>
                <p className="text-[15px]"><span className="text-[#fdcc02] font-bold">Delivering</span><span className="text-white/70"> warm referrals on autopilot.</span></p>
                <p className="text-[15px]"><span className="text-[#3DD6C3] font-bold">Catching</span><span className="text-white/70"> every rewrite opportunity.</span></p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.65 }}
                className="flex items-center gap-5"
              >
                <Link
                  href={tier.ctaHref}
                  className="inline-flex items-center gap-3 px-8 py-4.5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-lg shadow-[#fdcc02]/25 hover:shadow-xl hover:shadow-[#fdcc02]/30 hover:scale-[1.02] transition-all"
                >
                  {tier.isFoundingOpen ? 'Lock In My Free Spot' : tier.ctaText}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </Link>
                <p className="text-white/60 text-sm">
                  {tier.loaded ? tier.ctaSubtext : '14-day free trial · Cancel anytime'}
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
                    <span className="text-[#fdcc02] text-xs font-bold">🤝 Referrals</span>
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
          <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" /></svg>
        </div>
      </section>

      {/* ═══ FEATURE 1: REFERRALS (light bg) ═══ */}
      <section id="features" className="bg-[#F8F9FA] px-6 lg:px-8 pt-48 lg:pt-56 pb-24 lg:pb-32">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#fdcc02]/10 border border-[#fdcc02]/20 rounded-full mb-5">
                <svg className="w-3.5 h-3.5 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">One-Tap Referrals</span>
              </div>
              <h2 className="text-3xl lg:text-[2.75rem] font-extrabold text-[#0D4D4D] leading-tight mb-4">
                Put a referral button in every client&apos;s pocket. AFL takes it from there.
              </h2>
              <p className="text-[#4B5563] text-lg leading-relaxed mb-8 max-w-lg">
                One tap from your client. AFL texts the referral via iMessage, qualifies them, and books the appointment on your calendar. You just show up and close.
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
                <img src="/screenshot-rewrite-convo.png" alt="AFL rewrite conversation" className="w-full h-auto block" />
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
                When a policy hits its one-year mark, your client hears from you — not the carrier. AFL sends the notification, they book on your calendar. The rewrite comes to you.
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
                When a policy slips or cancels, AFL reaches out automatically — and flags the ones that need your personal touch. Saves happen instead of slipping past.
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

      {/* ═══ WELCOME FLOW — Stop being the agent they forgot ═══ */}
      <section className="relative px-6 lg:px-8 py-28 lg:py-32 overflow-hidden" style={{ background: 'radial-gradient(ellipse 700px 500px at 50% 0%, rgba(61,214,195,0.12), transparent 70%), radial-gradient(ellipse 500px 400px at 50% 100%, rgba(253,204,2,0.06), transparent 70%), #0D4D4D' }}>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <p className="text-[#3DD6C3] font-bold text-xs uppercase tracking-[0.25em] mb-5">Do they remember you?</p>
            <h2 className="text-4xl lg:text-5xl xl:text-[3.5rem] font-extrabold text-white leading-[1.1] mb-7">
              Stop being the agent <span className="text-[#fdcc02]">they forgot</span>.
            </h2>
            <p className="text-white/70 text-lg lg:text-xl leading-relaxed mb-10 max-w-2xl mx-auto">
              Half your book can&apos;t name you. To them, you&apos;re &quot;the Mortgage Protection person from 2022.&quot;
            </p>
            <p className="text-white text-xl lg:text-2xl font-semibold leading-snug mb-8 max-w-2xl mx-auto">
              AFL puts your branded app on every client&apos;s phone.<br className="hidden lg:block" /> Your name. Your photo. Your number.
            </p>
            <p className="text-white/80 text-base lg:text-lg leading-relaxed mb-12 max-w-2xl mx-auto">
              You stop being a stranger and become the agent they remember, refer, and trust.
            </p>
            <div className="inline-block px-7 lg:px-9 py-5 lg:py-6 bg-white/[0.06] border-2 border-[#3DD6C3]/30 rounded-2xl max-w-3xl">
              <p className="text-white text-lg lg:text-2xl font-bold leading-snug">
                Most agents have a book of business.<br />
                <span className="text-[#3DD6C3]">AFL agents have a book that compounds.</span>
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ ALWAYS IN SYNC — Two Surfaces, One System ═══ */}
      <section className="px-6 lg:px-8 py-24 lg:py-32 relative overflow-hidden" style={{ background: 'radial-gradient(ellipse 500px 500px at 25% 33%, rgba(26,122,106,0.05), transparent 70%), radial-gradient(ellipse 400px 400px at 75% 75%, rgba(253,204,2,0.03), transparent 70%), #070E1B' }}>
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#1A7A6A 1px, transparent 1px), linear-gradient(90deg, #1A7A6A 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative max-w-6xl mx-auto">
          <motion.div className="text-center mb-16" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/10 rounded-full mb-6">
              <svg className="w-3.5 h-3.5 text-[#1A7A6A]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              <span className="text-[#1A7A6A] font-bold text-sm uppercase tracking-wide">Always in Sync</span>
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-4">Two Surfaces. <span className="text-[#1A7A6A]">One System.</span></h2>
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
                  <div className="flex-1 mx-3"><div className="bg-white/[0.06] rounded-md px-3 py-1 text-white/60 text-[9px] font-mono text-center">agentforlife.app/dashboard</div></div>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-[#0D4D4D] rounded-lg flex items-center justify-center"><span className="text-[#1A7A6A] text-[10px] font-bold">D</span></div>
                      <span className="text-white/70 font-semibold text-[11px]">Agent Dashboard</span>
                    </div>
                    <span className="px-2 py-0.5 bg-[#1A7A6A]/10 text-[#1A7A6A] text-[8px] font-bold rounded-full uppercase">Live</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { dot: 'bg-[#1A7A6A]', text: 'Holiday card sent to 47 clients', tag: 'Auto' },
                      { dot: 'bg-[#fdcc02]', text: 'New referral: Mike J. — AFL qualifying', tag: 'Live' },
                      { dot: 'bg-red-400', text: 'Conservation alert: Sarah J.', tag: 'Action' },
                      { dot: 'bg-[#1A7A6A]', text: 'Policy review: Lisa M. — booked', tag: 'Win' },
                    ].map((row) => (
                      <div key={row.text} className="flex items-center gap-2.5 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
                        <div className={`w-1.5 h-1.5 rounded-full ${row.dot} flex-shrink-0`} />
                        <span className="text-white/60 text-[10px] flex-1">{row.text}</span>
                        <span className="text-white/60 text-[9px]">{row.tag}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { val: '127', label: 'Clients', color: 'text-white' },
                      { val: '12', label: 'Referrals', color: 'text-[#1A7A6A]' },
                      { val: '5', label: 'Saved', color: 'text-[#fdcc02]' },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/[0.04] rounded-lg border border-white/[0.06] p-2.5 text-center">
                        <p className={`text-lg font-black ${s.color}`}>{s.val}</p>
                        <p className="text-[8px] text-white/60 uppercase tracking-wide">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-center text-white/60 text-xs mt-3 font-medium">You see everything. Control everything.</p>
            </motion.div>

            {/* Sync indicator */}
            {/* Sync indicator — CSS animation */}
            <div className="hidden md:flex flex-col items-center gap-3 px-2">
              <div className="animate-pulse-fade">
                <svg className="w-5 h-5 text-[#1A7A6A]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-px h-8 bg-gradient-to-b from-transparent via-[#1A7A6A]/40 to-transparent" />
                <span className="text-[#1A7A6A] text-[9px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] py-2">Syncs Live</span>
                <div className="w-px h-8 bg-gradient-to-b from-transparent via-[#1A7A6A]/40 to-transparent" />
              </div>
              <div className="animate-pulse-fade-delay">
                <svg className="w-5 h-5 text-[#1A7A6A]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              </div>
            </div>

            {/* Phone mockup */}
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex justify-center">
              <div>
                <div className="w-[220px] h-[420px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl shadow-[#1A7A6A]/10 border-4 border-[#2a2a2a] relative">
                  <div className="w-full h-full bg-[#111] rounded-[2rem] overflow-hidden px-3.5 py-5 relative">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-full bg-[#005851] flex items-center justify-center"><span className="text-[#1A7A6A] text-[10px] font-bold">D</span></div>
                      <div><p className="text-white text-[11px] font-semibold">Daniel Roberts</p><p className="text-white/70 text-[8px]">Your Agent</p></div>
                    </div>
                    <div className="space-y-2.5">
                      <div className="bg-white/[0.08] rounded-xl p-2.5 border border-white/5">
                        <div className="flex items-center gap-2"><span className="text-sm">🎄</span><div><p className="text-white/90 text-[9px] font-bold">Merry Christmas!</p><p className="text-white/70 text-[7px]">Tap to view your card</p></div></div>
                      </div>
                      <div className="bg-white/[0.08] rounded-xl p-2.5 border border-white/5">
                        <p className="text-white/70 text-[7px] uppercase tracking-wider mb-1.5">Your Policies</p>
                        <div className="flex items-center justify-between"><span className="text-white/70 text-[9px]">Auto — State Farm</span><span className="text-[#1A7A6A] text-[7px] font-semibold">Active</span></div>
                        <div className="flex items-center justify-between mt-1"><span className="text-white/70 text-[9px]">Life — Mutual of Omaha</span><span className="text-[#1A7A6A] text-[7px] font-semibold">Active</span></div>
                      </div>
                      <div className="bg-[#fdcc02] rounded-xl py-2.5 text-center"><p className="text-[#0D4D4D] text-[10px] font-bold">Refer a Friend</p></div>
                      <div className="bg-[#005851] rounded-xl py-2.5 text-center"><p className="text-white text-[10px] font-bold">Contact Daniel</p></div>
                    </div>
                  </div>
                </div>
                <p className="text-center text-white/60 text-xs mt-3 font-medium">Your clients see their branded app.</p>
              </div>
            </motion.div>
          </div>

          {/* Sync feed */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { dashboard: 'You upload Sarah\'s policy', client: 'Sarah sees it in her app instantly', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', accent: '#1A7A6A' },
              { dashboard: 'AFL sends holiday card', client: 'Full-screen card on their phone', icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7', accent: '#fdcc02' },
              { dashboard: 'Referral comes in', client: 'AFL texts referral via iMessage', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', accent: '#fdcc02' },
              { dashboard: 'Conservation alert fires', client: 'Client gets outreach in hours', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', accent: '#1A7A6A' },
            ].map((item, i) => (
              <div key={i} className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${item.accent}15` }}>
                    <svg className="w-3.5 h-3.5" style={{ color: item.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                  </div>
                  <svg className="w-3 h-3 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </div>
                <p className="text-white/70 text-[11px] font-medium mb-1">{item.dashboard}</p>
                <p className="text-[11px] font-semibold" style={{ color: item.accent }}>{item.client}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ ACTION ITEMS CALLOUT — Your dashboard filters for you ═══ */}
      <section className="relative bg-[#F8F9FA] px-6 lg:px-8 py-20 lg:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <p className="text-[#005851] font-bold text-xs uppercase tracking-[0.2em] mb-5">Your agent surface</p>
            <h2 className="text-3xl lg:text-4xl xl:text-[2.75rem] font-extrabold text-[#0D4D4D] leading-[1.15] mb-6">
              Most dashboards drown you. <span className="text-[#3DD6C3]">This one filters for you.</span>
            </h2>
            <p className="text-[#4B5563] text-lg leading-relaxed max-w-2xl mx-auto mb-6">
              AFL handles every conversation it can. It only puts something in front of you when it actually needs you — a referral that went quiet, a save that needs your personal touch, a rewrite booked. You stop scanning lists. You start closing what matters.
            </p>
            <p className="text-[#6B7280] text-sm italic">A clean inbox is the rarest thing in insurance.</p>
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
                  ctaHref={tier.ctaHref}
                  ctaText={tier.isFoundingOpen ? 'Stop the Bleeding →' : tier.ctaText}
                />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ 3X MATH CALLOUT ═══ */}
      <section className="relative bg-[#070E1B] px-6 lg:px-8 py-24 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-14">
            <p className="text-[#fdcc02] font-bold text-xs uppercase tracking-[0.2em] mb-4">The 3x rule</p>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
              Every closed sale should pay <span className="text-[#3DD6C3]">three times</span>.
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">You&apos;re getting one. AFL is built to capture all three.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { num: '1', label: 'At close', desc: 'The premium you wrote. The commission you already collected.', accent: '#3DD6C3', earned: true },
              { num: '2', label: 'At the referral', desc: 'Every closed client knows 3+ people who need coverage. Each one a warm intro waiting to happen.', accent: '#fdcc02', earned: false },
              { num: '3', label: 'At the rewrite', desc: 'Twelve months later, the policy hits its anniversary. The carrier auto-renews — unless you get there first.', accent: '#fdcc02', earned: false },
            ].map((row, i) => (
              <motion.div
                key={row.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 * i }}
                className={`rounded-2xl p-7 border ${row.earned ? 'bg-[#3DD6C3]/10 border-[#3DD6C3]/25' : 'bg-white/[0.03] border-white/10'}`}
              >
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black" style={{ backgroundColor: `${row.accent}20`, color: row.accent }}>{row.num}</div>
                  <p className="text-white font-bold text-base">{row.label}</p>
                  {row.earned ? (
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-[#3DD6C3]">You get this</span>
                  ) : (
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-[#fdcc02]/90">Slipping past</span>
                  )}
                </div>
                <p className="text-white/60 text-sm leading-relaxed">{row.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.4 }} className="text-center text-white/50 text-base mt-12 max-w-2xl mx-auto">
            AFL turns sales 2 and 3 from &quot;if you remember&quot; into &quot;automatically.&quot; Every closed client becomes a referral out and a rewrite booked.
          </motion.p>
        </div>
      </section>

      {/* ═══ ROI ═══ */}
      <section className="relative px-6 lg:px-8 py-24 overflow-hidden" style={{ background: 'radial-gradient(ellipse 300px 300px at 0% 0%, rgba(239,68,68,0.08), transparent 70%), radial-gradient(ellipse 300px 300px at 100% 100%, rgba(61,214,195,0.08), transparent 70%), #0D4D4D' }}>
        <div className="relative max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="space-y-10">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight mb-3">
                The math is <span className="text-[#3DD6C3]">undeniable</span>.
              </h2>
              <p className="text-white/60 text-lg">One saved policy. One referral. That&apos;s all it takes.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <motion.div variants={fadeUp} custom={0.1} className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center">
                <p className="text-red-400 font-semibold text-xs uppercase tracking-wide mb-3">1 Canceled Policy</p>
                <p className="text-5xl font-black text-red-400 mb-2">$1,200</p>
                <p className="text-red-400/50 text-sm">avg annual value lost</p>
              </motion.div>
              <motion.div variants={fadeUp} custom={0.15} className="bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-2xl p-8 text-center">
                <p className="text-[#3DD6C3] font-semibold text-xs uppercase tracking-wide mb-3">AFL Starter</p>
                <p className="text-5xl font-black text-[#fdcc02] mb-2">$348</p>
                <p className="text-[#3DD6C3]/50 text-sm">per year · everything included</p>
              </motion.div>
              <motion.div variants={fadeUp} custom={0.2} className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 text-center flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#fdcc02]/15 rounded-full mb-3 mx-auto">
                  <svg className="w-4 h-4 text-[#fdcc02]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-[#fdcc02] font-bold text-xs uppercase">Instant ROI</span>
                </div>
                <p className="text-white font-extrabold text-lg leading-snug">One save pays for 3+ years. Every referral and rewrite is <span className="text-[#fdcc02]">profit on top</span>.</p>
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
                { num: '2', title: 'Import Your Book', desc: 'Upload CSV or drop in a PDF — AFL extracts clients, policies, and beneficiaries.', color: '#fdcc02' },
                { num: '3', title: 'Share with Clients', desc: 'They download your app with a unique code. Personalized welcome notification.', color: '#3DD6C3' },
                { num: '4', title: 'AFL Takes Over', desc: 'Touchpoints, referral follow-ups, conservation alerts — all on autopilot.', color: '#fdcc02' },
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
              href={tier.ctaHref}
              className="inline-flex items-center gap-2.5 px-8 py-4 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-lg shadow-[#fdcc02]/20 hover:shadow-xl hover:shadow-[#fdcc02]/30 hover:scale-[1.02] transition-all"
            >
              {tier.isFoundingOpen ? 'Get Started Free' : tier.ctaText}
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

      {/* ═══ PRICING ═══
          Track C (May 10, 2026): the prior tier-ladder UI was tied to
          the legacy founding/charter/inner_circle SKUs that were
          deleted with v3 pricing. This section now points at the
          /pricing page which carries the full Starter/Growth/Pro/
          Agency tier cards. Full marketing rebuild is its own
          next-up project. */}
      <section id="pricing" className="bg-white px-6 lg:px-8 py-24">
        <div className="max-w-3xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="space-y-8 text-center">
            <motion.div variants={fadeUp} custom={0}>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-3">
                Pricing that fits <span className="text-[#3DD6C3]">your book</span>.
              </h2>
              <p className="text-[#6B7280] text-lg">
                Growth at $49/mo. Pro at $99/mo. Agency from $349/mo.
              </p>
              <p className="text-[#6B7280] text-sm mt-2">
                14-day free trial. No contracts. Cancel anytime.
              </p>
            </motion.div>

            <motion.div variants={fadeUp} custom={0.1}>
              <Link
                href="/pricing"
                className="inline-block px-8 py-4 bg-[#3DD6C3] hover:bg-[#32c4b2] text-[#0D4D4D] text-base font-bold rounded-xl transition-colors shadow-lg shadow-[#3DD6C3]/20"
              >
                See full pricing →
              </Link>
            </motion.div>

            <motion.p variants={fadeUp} custom={0.2} className="text-[#6B7280] text-sm">
              No contracts · Cancel anytime
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
      <section className="relative px-6 lg:px-8 py-28 overflow-hidden" style={{ background: 'radial-gradient(ellipse 400px 400px at 25% 0%, rgba(61,214,195,0.12), transparent 70%), radial-gradient(ellipse 300px 300px at 75% 100%, rgba(253,204,2,0.08), transparent 70%), #0D4D4D' }}>
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="relative text-center max-w-3xl mx-auto space-y-8">
          <p className="text-white/60 text-xs uppercase tracking-[0.2em] font-medium">Stop leaving money on the table</p>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight">
            Your competitors aren&apos;t reading this. <span className="text-[#fdcc02]">They&apos;re losing clients.</span>
          </h2>
          <p className="text-white/60 text-lg leading-relaxed max-w-xl mx-auto">Start a 14-day free trial. No credit card. The first save you make pays for the year.</p>
          <Link href={tier.ctaHref} className="inline-flex items-center gap-3 px-10 py-5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 hover:shadow-[#fdcc02]/40 hover:scale-[1.02] transition-all">
            {tier.isFoundingOpen ? 'Lock In My Free Lifetime Spot' : tier.ctaText}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/60 text-sm">{tier.loaded ? tier.ctaSubtext : '14-day free trial · Cancel anytime'}</p>
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
            <Link href="/login" className="text-white/70 text-sm hover:text-white transition-colors">Agent Login</Link>
            <a href="mailto:support@agentforlife.app" className="text-white/60 text-sm hover:text-white transition-colors">Contact</a>
            <Link href="/privacy" className="text-white/60 text-sm hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="text-white/60 text-sm hover:text-white transition-colors">Terms</Link>
          </nav>
          <p className="text-white/60 text-sm">© 2026 AgentForLife. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
