'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import LeakyBucketCalculator from '@/components/LeakyBucketCalculator';
import { SystemShowcase } from '@/components/SolutionAnimations';
import DeepDiveTabs from '@/components/DeepDiveTabs';

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);

  const [ctaPeeked, setCtaPeeked] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [ctaScrollTriggered, setCtaScrollTriggered] = useState(false);
  const ctaLoadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ctaIsPeekingRef = useRef(false);

  const [showBottomCta, setShowBottomCta] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  const CTA_EXPANDED_W = 276;
  const CTA_TAB_W = 36;

  const ctaWidth = (ctaHovered || ctaPeeked)
    ? CTA_EXPANDED_W
    : CTA_TAB_W;

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.spotsRemaining === 'number') {
          setSpotsRemaining(data.spotsRemaining);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    ctaLoadTimerRef.current = setTimeout(() => {
      ctaIsPeekingRef.current = true;
      setCtaPeeked(true);
      setTimeout(() => {
        setCtaPeeked(false);
        ctaIsPeekingRef.current = false;
      }, 2500);
    }, 3500);
    return () => clearTimeout(ctaLoadTimerRef.current);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (ctaScrollTriggered) return;
      const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrollPercent > 0.20) {
        setCtaScrollTriggered(true);
        clearTimeout(ctaLoadTimerRef.current);
        if (ctaIsPeekingRef.current) return;
        ctaIsPeekingRef.current = true;
        setCtaPeeked(true);
        setTimeout(() => {
          setCtaPeeked(false);
          ctaIsPeekingRef.current = false;
        }, 2500);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [ctaScrollTriggered]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowBottomCta(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(hero);
    return () => obs.disconnect();
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqItems = [
    {
      question: "How can insurance agents improve client retention?",
      answer: "Agent For Life sends 7+ automated touchpoints per year per client — holiday cards for 5 major holidays, personalized birthday messages, and policy anniversary alerts — all as push notifications directly to their phone. When a policy does lapse or get canceled, Conservation Alerts kick in: forward the carrier notice and AI reaches out to your client within hours. Combine that with a branded app where they can view policies and contact you instantly, and you become irreplaceable instead of forgettable."
    },
    {
      question: "How do I get more referrals from existing clients?",
      answer: "Make it effortless. Your clients tap one button, pick a contact, and send a warm personal text — with your business card attached. Then your AI reaches out separately via iMessage, has a qualifying conversation, gathers their info, and books an appointment on your calendar. If the referral doesn't reply, AI automatically follows up on Day 2, 5, and 8. You just show up and close."
    },
    {
      question: "What is the AI Referral Assistant?",
      answer: "When your client refers someone, the AI reaches out via iMessage (blue bubbles, ~99% read rate) in a separate 1-on-1 thread — responding as you, warm and conversational. It builds trust through a qualifying conversation, learns what coverage they need, and shares your scheduling link to book a call. The referral thinks they're texting you directly."
    },
    {
      question: "How do insurance agents generate rewrites?",
      answer: "Agent For Life alerts you as each policy's one-year anniversary hits — the moment you're free to rewrite without owing back commission. Your client gets a push notification that you may have found them a lower price for the same coverage, with a link to book on your calendar. The goal is to book within 24–48 hours."
    },
    {
      question: "How do I stop insurance chargebacks and policy cancellations?",
      answer: "Chargebacks happen when relationships go cold. Agent For Life attacks this on two fronts: 7+ automated touchpoints per year keep you top-of-mind so clients never feel forgotten. And when a policy does lapse, Conservation Alerts catch it — forward the carrier notice and AI sends personalized outreach within hours to save the policy before a chargeback hits."
    },
    {
      question: "How hard is it to get started?",
      answer: "You can be up and running in 10 minutes. Import your existing clients via CSV spreadsheet or upload PDF insurance applications — our AI extracts client info, policy details, and beneficiaries automatically. Enable the AI referral assistant with one toggle and share your branded app code with clients — you're live."
    },
    {
      question: "What exactly is Agent For Life?",
      answer: "It's a complete client relationship system built for insurance agents. You get: a branded mobile app for your clients, automated touchpoints (holidays, birthdays, anniversaries), one-tap referrals with an AI assistant that qualifies leads via iMessage and books appointments, conservation alerts that rescue at-risk policies, anniversary rewrite alerts that turn renewals into booked appointments, CSV import, PDF parsing, push notifications, and a web dashboard to manage it all — normally $49/month, but free for life for our first 50 founding members."
    },
    {
      question: "What carriers does it work with?",
      answer: "All of them. Agent For Life is carrier-agnostic. You add policy details in the dashboard (or upload a PDF and AI does it). This works for independent agents regardless of which carriers you're appointed with."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Urgency Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#a158ff] text-white text-center py-1 sm:py-1.5 px-4 text-[11px] sm:text-sm font-semibold tracking-wide">
        <Link href="/founding-member" className="hover:underline">
          {spotsRemaining !== null
            ? <>Only <span className="font-black">{spotsRemaining} of 50</span> free lifetime spots remaining — Normally <span className="line-through">$49/mo</span><span className="hidden sm:inline"> — Claim yours now</span></>
            : <>Limited free lifetime spots remaining — Normally <span className="line-through">$49/mo</span></>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="fixed top-[34px] left-0 right-0 z-50 bg-[#0D4D4D] shadow-lg">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 md:h-20">
            <Link href="/" className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-shrink">
              <img src="/logo.png" alt="AgentForLife Logo" className="w-[50px] h-[28px] sm:w-[70px] sm:h-[40px] md:w-[80px] md:h-[45px] object-contain flex-shrink-0" />
              <span className="text-base sm:text-lg md:text-xl text-white brand-title truncate">AgentForLife</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <Link href="/login" className="px-3 py-1.5 sm:px-4 sm:py-2 text-white border border-white/50 hover:border-white hover:bg-white/10 rounded-full text-sm sm:text-base font-medium transition-colors">Agent Login</Link>
              <Link href="/signup" className="px-3 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-sm sm:text-base font-semibold rounded-full transition-colors whitespace-nowrap">Get Started</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar Bookmark CTA */}
      <div
        className="fixed right-0 z-40 cursor-pointer hidden lg:block"
        style={{
          top: '114px',
          width: `${CTA_EXPANDED_W}px`,
          height: '180px',
          clipPath: `inset(0 0 0 ${CTA_EXPANDED_W - ctaWidth}px round ${ctaWidth <= CTA_TAB_W ? 8 : 12}px 0 0 ${ctaWidth <= CTA_TAB_W ? 8 : 12}px)`,
          transition: 'clip-path 500ms cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'clip-path',
        }}
        onMouseEnter={() => setCtaHovered(true)}
        onMouseLeave={() => setCtaHovered(false)}
      >
        <div className="flex" style={{ width: `${CTA_EXPANDED_W}px`, height: '100%' }}>
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
              borderTopLeftRadius: '12px',
              borderBottomLeftRadius: '12px',
            }}
          >
            <div
              className="absolute inset-0 p-4 flex flex-col justify-center"
              style={{
                opacity: (ctaHovered || ctaPeeked) ? 1 : 0,
                transform: (ctaHovered || ctaPeeked) ? 'none' : 'translateX(10px)',
                transition: (ctaHovered || ctaPeeked)
                  ? 'opacity 350ms ease 180ms, transform 350ms ease 180ms'
                  : 'opacity 150ms ease, transform 150ms ease',
                pointerEvents: (ctaHovered || ctaPeeked) ? 'auto' : 'none',
              }}
            >
              <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mb-1">🚀 Founding Member</p>
              <p className="text-white font-extrabold text-2xl mb-0.5">FREE</p>
              <p className="text-white/70 text-xs mb-3 leading-relaxed">
                {spotsRemaining !== null ? spotsRemaining : 50} spots left &middot; Lifetime access.<br />
                Usually <span className="line-through opacity-70">$49/mo</span> — free for the first 50.
              </p>
              <Link href="/founding-member" className="inline-block w-full text-center py-2.5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-xs font-bold rounded-lg transition-colors">
                Claim Free Spot →
              </Link>
            </div>
          </div>
          <div
            className="flex-shrink-0 relative overflow-hidden animate-[purpleGlow_2.5s_ease-in-out_infinite]"
            style={{
              width: `${CTA_TAB_W}px`,
              background: 'linear-gradient(180deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none animate-[goldShimmer_5s_ease-in-out_infinite]"
              style={{
                background: 'linear-gradient(180deg, transparent 0%, rgba(253,204,2,0.4) 50%, transparent 100%)',
              }}
            />
            <div className="absolute inset-0 flex justify-center overflow-hidden">
              <div
                className="animate-[tickerUp_10s_linear_infinite] flex-shrink-0"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                <span className="text-white/90 font-bold text-[9px] tracking-[0.15em] uppercase whitespace-nowrap">
                  {`🚀 ${spotsRemaining !== null ? spotsRemaining : 50} FREE SPOTS \u2022 LIFETIME FREE \u2022 APPLY NOW \u2022 🚀 ${spotsRemaining !== null ? spotsRemaining : 50} FREE SPOTS \u2022 LIFETIME FREE \u2022 APPLY NOW \u2022 `}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes tickerUp {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        @keyframes goldShimmer {
          0%, 100% { transform: translateY(150%); opacity: 0; }
          5% { transform: translateY(80%); opacity: 1; }
          15% { transform: translateY(-80%); opacity: 1; }
          20% { transform: translateY(-150%); opacity: 0; }
          21% { transform: translateY(150%); opacity: 0; }
        }
        @keyframes floatDrift {
          0% { transform: translateY(280px) rotate(0deg); opacity: 0; }
          12% { opacity: 0.25; }
          88% { opacity: 0.25; }
          100% { transform: translateY(-280px) rotate(180deg); opacity: 0; }
        }
      `}</style>

      <main>
        {/* ============================================ */}
        {/* HERO                                         */}
        {/* ============================================ */}
        <section ref={heroRef} className="relative bg-[#0D4D4D] pb-20 md:pb-32 overflow-hidden pt-28 md:pt-48">
          <div className="absolute inset-0">
            <div className="absolute top-20 left-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-[150px] opacity-20"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-15"></div>
          </div>
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: `linear-gradient(to right, #3DD6C3 1px, transparent 1px), linear-gradient(to bottom, #3DD6C3 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-5 md:mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0D4D4D] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0D4D4D]"></span>
              </span>
              <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">{spotsRemaining !== null ? `Only ${spotsRemaining} of 50 Free Lifetime Spots Left` : 'Limited Free Lifetime Spots Available'}</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-6 md:mb-8">
              <span className="text-[#fdcc02]">Kill Chargebacks</span>.<br />
              <span className="text-[#3DD6C3]">Explode Your Referrals</span>.<br />
              3x Your Income from Leads You Already Won.
            </h1>

            {/* Phone mockup with video preview */}
            <div className="flex justify-center mb-6 md:mb-8">
              <div className="w-[180px] h-[390px] md:w-[200px] md:h-[434px] bg-[#1a1a1a] rounded-[2.25rem] md:rounded-[2.5rem] p-2 shadow-2xl border-4 border-[#2a2a2a]">
                <div className="w-full h-full bg-black rounded-[1.75rem] md:rounded-[2rem] overflow-hidden">
                  <video
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    webkit-playsinline=""
                    poster="/app-preview-poster.jpeg"
                    style={{ WebkitTransform: 'translateZ(0)' }}
                  >
                    <source src="/app-preview.webm" type="video/webm" />
                    <source src="/app-preview.mp4" type="video/mp4" />
                  </video>
                </div>
              </div>
            </div>

            <p className="text-sm md:text-base text-[#3DD6C3] font-semibold tracking-[0.15em] uppercase mb-4 md:mb-6">The first AI-powered client retention and warm referral system.</p>

            <p className="text-base md:text-xl lg:text-2xl text-white/80 mb-8 md:mb-10 max-w-3xl mx-auto leading-relaxed">
              You close the deal. We make sure they <span className="text-white font-semibold">never leave</span>, keep sending you <span className="text-white font-semibold">referrals</span>, and rebook every <span className="text-white font-semibold">anniversary</span> — all on autopilot. It will cost <span className="line-through opacity-70">$49/month</span> — but the first 50 agents get it <span className="text-[#fdcc02] font-bold">free. For life.</span>
            </p>

            <Link href="/founding-member" className="inline-flex items-center gap-2 md:gap-3 px-8 py-4 md:px-12 md:py-5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg md:text-xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/40 hover:shadow-[#fdcc02]/60 hover:scale-105 border-2 border-[#fdcc02] hover:border-white/20">
              Lock In My Free Lifetime Spot
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <p className="text-white/40 mt-4 text-sm">{spotsRemaining !== null ? `Only ${spotsRemaining} spots left` : 'Limited spots'} • $0 forever • No credit card required</p>

            {spotsRemaining !== null && (
              <div className="mt-6 max-w-xs mx-auto">
                <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full bg-[#fdcc02] rounded-full transition-all duration-1000"
                    style={{ width: `${((50 - spotsRemaining) / 50) * 100}%` }}
                  />
                </div>
                <p className="text-white/50 text-xs mt-2">{50 - spotsRemaining} agent{50 - spotsRemaining !== 1 ? 's' : ''} already locked in {50 - spotsRemaining !== 1 ? 'their' : 'a'} free spot</p>
              </div>
            )}
          </div>

          <div className="absolute -bottom-1 left-0 right-0">
            <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="w-full h-[60px] md:h-[120px]">
              <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 40C840 50 960 70 1080 75C1200 80 1320 70 1380 65L1440 60V120H0Z" fill="white"/>
            </svg>
          </div>
        </section>

        {/* ============================================ */}
        {/* 3 WAYS YOU'RE BLEEDING MONEY                 */}
        {/* ============================================ */}
        {/* ============================================ */}
        {/* 3 WAYS YOU'RE BLEEDING MONEY                 */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white -mt-1">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-4xl md:text-5xl font-extrabold text-[#0D4D4D]">
                You&apos;re Losing Money in <span className="text-red-500">Three Places</span>.
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <motion.div
                className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">1</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Retention Is a Leaky Bucket</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">Your clients forget about you within weeks. When a policy lapses, the conservation notice sits in your inbox until you eat the chargeback.</p>
              </motion.div>

              <motion.div
                className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">2</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Referrals Are Stuck in the 1990s</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">You tell clients to &quot;call your friend.&quot; By the time you follow up, it&apos;s a cold lead. Most agents get 5% when 25% is possible.</p>
              </motion.div>

              <motion.div
                className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, ease: 'easeOut', delay: 0.2 }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">3</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Rewrites Are Sitting on the Table</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">Every policy anniversary is a lay-down sale. But there&apos;s no system to flag it, pitch the client, and get them on your calendar.</p>
              </motion.div>
            </div>

            <motion.div
              className="text-center mt-14 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-2xl md:text-3xl font-extrabold text-[#0D4D4D]">
                Get a personalized app for your client&apos;s phone — backed by an AI-powered system that <span className="text-[#3DD6C3]">fixes all three</span>.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ============================================ */}
        {/* THE SYSTEM — branded app + solution path      */}
        {/* ============================================ */}
        <SystemShowcase />

        {/* ============================================ */}
        {/* CHURN CALCULATOR                             */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-red-500 rounded-full blur-[150px]"></div>
          </div>

          <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-full mb-6">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="text-red-400 font-semibold text-sm uppercase tracking-wide">The Leaky Bucket</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">How Much Are You <span className="text-red-400">Bleeding</span> Every Year?</h2>
              <p className="text-lg text-white/70">Plug in your numbers. See what&apos;s slipping through the cracks.</p>
            </div>

            <LeakyBucketCalculator />
          </div>
        </section>

        {/* ============================================ */}
        {/* DEEP DIVE — Retention / Referrals / Rewrites  */}
        {/* ============================================ */}
        <DeepDiveTabs />


        {/* ============================================ */}
        {/* ROI                                          */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">The Math is <span className="text-[#3DD6C3]">Undeniable</span></h2>
              <p className="text-xl text-[#6B7280]">One saved policy. One referral. That&apos;s all it takes.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 items-center">
              <div className="bg-red-50 rounded-3xl p-8 border-2 border-red-200 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                <p className="text-red-600 font-semibold text-sm uppercase tracking-wide mb-2">1 Canceled Policy</p>
                <p className="text-4xl md:text-5xl font-black text-red-500 mb-2">$1,200</p>
                <p className="text-red-400 text-sm">Average annual policy value lost</p>
              </div>
              <div className="flex flex-col items-center justify-center py-2 md:py-8"><div className="text-2xl md:text-4xl font-black text-[#6B7280]">vs</div></div>
              <div className="bg-[#D1FAE5] rounded-3xl p-8 border-2 border-[#3DD6C3] text-center">
                <div className="w-16 h-16 bg-[#3DD6C3] rounded-2xl flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></div>
                <p className="text-[#0D4D4D] font-semibold text-sm uppercase tracking-wide mb-2">Agent For Life</p>
                <p className="text-4xl md:text-5xl font-black text-[#0D4D4D] mb-2"><span className="line-through text-[#6B7280]/60">$588</span> <span className="text-[#3DD6C3]">$0</span></p>
                <p className="text-[#3DD6C3] text-sm font-medium">$49/mo standard — free as a Founding Member</p>
              </div>
            </div>
            <div className="mt-12 bg-[#0D4D4D] rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-20"><div className="absolute top-0 left-1/4 w-64 h-64 bg-[#3DD6C3] rounded-full blur-[100px]"></div><div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[#fdcc02] rounded-full blur-[100px]"></div></div>
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6"><svg className="w-5 h-5 text-[#0D4D4D]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg><span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Instant ROI</span></div>
                <h3 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-4">As a Founding Member, <span className="text-[#fdcc02]">Every Dollar is Pure Profit</span></h3>
                <p className="text-xl text-white/80 max-w-2xl mx-auto mb-6">At $49/mo, one saved client or one referral already pays for an <span className="text-white font-semibold">entire year</span>. At <span className="text-[#fdcc02] font-semibold">$0/mo?</span> It&apos;s all upside — forever.</p>
                <div className="flex flex-wrap justify-center gap-6 text-white/70">
                  <div className="flex items-center gap-2"><svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="flex items-center gap-1">1 saved policy = <span className="line-through opacity-60">4x</span> <svg className="w-6 h-6 text-[#fdcc02]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" /></svg> ROI</span></div>
                  <div className="flex items-center gap-2"><svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="flex items-center gap-1">1 referral = <span className="line-through opacity-60">4x</span> <svg className="w-6 h-6 text-[#fdcc02]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" /></svg> ROI</span></div>
                  <div className="flex items-center gap-2"><svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="flex items-center gap-1">1 rewrite = <span className="line-through opacity-60">4x</span> <svg className="w-6 h-6 text-[#fdcc02]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" /></svg> ROI</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* ONBOARD YOUR BOOK                            */}
        {/* ============================================ */}
        <section className="py-16 md:py-20 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1">
                <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">Already Have Clients?<br /><span className="text-[#3DD6C3]">Import in Minutes.</span></h2>
                <p className="text-lg text-[#6B7280] mb-6">Don&apos;t worry about entering 200 clients one by one. We&apos;ve got you.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#3DD6C3] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg></div>
                    <div><p className="text-[#0D4D4D] font-semibold">CSV Import</p><p className="text-[#6B7280] text-sm">Upload a spreadsheet, preview the data, click import. Your entire book is loaded in minutes.</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#3DD6C3] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg></div>
                    <div><p className="text-[#0D4D4D] font-semibold">AI Application Parsing</p><p className="text-[#6B7280] text-sm">Upload an insurance application PDF and AI extracts the client info, policy details, and beneficiaries automatically.</p></div>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-48 h-48 md:w-56 md:h-56 bg-[#0D4D4D] rounded-3xl flex items-center justify-center"><svg className="w-20 h-20 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg></div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* PRICING                                      */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] mb-6">This Will Cost <span className="line-through text-[#6B7280]/60">$49/mo</span>.<br /><span className="text-[#3DD6C3]">But Not for You.</span></h2>
              <p className="text-base md:text-xl text-[#6B7280] max-w-2xl mx-auto">Standard price is <span className="font-semibold">$49/mo</span> (or $490/yr). We&apos;re launching in tiers — <span className="font-semibold">150 early spots</span>, then they&apos;re gone forever. The earlier you join, the less you&apos;ll ever pay.</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-10">
              <div className="relative bg-white rounded-2xl border-2 border-[#a158ff] p-4 md:p-6 text-center shadow-lg shadow-[#a158ff]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-3 py-1 bg-[#a158ff] text-white text-xs font-bold rounded-full whitespace-nowrap">NOW OPEN</span></div>
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Founding Members</p>
                <p className="text-3xl md:text-4xl font-black text-[#0D4D4D] mb-1">FREE</p>
                <p className="text-sm text-[#a158ff] font-semibold mb-1">For Life</p>
                <p className="text-xs text-[#6B7280] line-through mb-1">$49/mo</p>
                <p className="text-xs text-[#6B7280] mb-2">50 spots — then gone forever</p>
                {spotsRemaining !== null && <p className="text-xs text-[#a158ff] font-bold mb-3">{spotsRemaining > 0 ? `${spotsRemaining} spots left` : 'FULL'}</p>}
                {spotsRemaining === null || spotsRemaining > 0 ? (
                  <Link href="/founding-member" className="block w-full py-3 bg-[#a158ff] hover:bg-[#8a3ee8] text-white text-sm font-bold rounded-xl transition-colors">Apply Now</Link>
                ) : (
                  <div className="w-full py-3 bg-gray-200 text-[#6B7280] text-sm font-bold rounded-xl">Filled</div>
                )}
              </div>
              <div className="relative bg-white rounded-2xl border-2 border-[#3DD6C3] p-4 md:p-6 text-center shadow-lg shadow-[#3DD6C3]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-3 py-1 bg-[#3DD6C3] text-[#0D4D4D] text-xs font-bold rounded-full whitespace-nowrap">UP NEXT</span></div>
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Charter Members</p>
                <div className="flex items-baseline justify-center gap-1 mb-1"><span className="text-3xl md:text-4xl font-black text-[#0D4D4D]">$25</span><span className="text-sm text-[#6B7280]">/mo</span></div>
                <p className="text-sm text-[#3DD6C3] font-semibold mb-1">Locked in for life</p>
                <p className="text-xs text-[#6B7280] line-through mb-1">$49/mo</p>
                <p className="text-xs text-[#6B7280] mb-4"><span className="hidden md:inline">50 spots • or $250/yr — then gone forever</span><span className="md:hidden">50 spots • $250/yr</span></p>
                <div className="w-full py-2.5 md:py-3 bg-[#0D4D4D]/10 text-[#0D4D4D] text-xs md:text-sm font-bold rounded-xl">Opens After Free Tier</div>
              </div>
              <div className="relative bg-white rounded-2xl border border-gray-200 p-4 md:p-6 text-center">
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Inner Circle</p>
                <div className="flex items-baseline justify-center gap-1 mb-1"><span className="text-3xl md:text-4xl font-black text-[#0D4D4D]">$35</span><span className="text-sm text-[#6B7280]">/mo</span></div>
                <p className="text-sm text-[#6B7280] font-semibold mb-1">Locked in for life</p>
                <p className="text-xs text-[#6B7280] line-through mb-1">$49/mo</p>
                <p className="text-xs text-[#6B7280] mb-4"><span className="hidden md:inline">50 spots • or $350/yr — then gone forever</span><span className="md:hidden">50 spots • $350/yr</span></p>
                <div className="w-full py-2.5 md:py-3 bg-gray-100 text-[#6B7280] text-xs md:text-sm font-medium rounded-xl">Opens After $25 Tier</div>
              </div>
              <div className="relative bg-white rounded-2xl border border-gray-200 p-4 md:p-6 text-center bg-[#F8F9FA]">
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Standard Price</p>
                <div className="flex items-baseline justify-center gap-1 mb-1"><span className="text-3xl md:text-4xl font-black text-[#0D4D4D]">$49</span><span className="text-sm text-[#6B7280]">/mo</span></div>
                <p className="text-sm text-[#6B7280] font-semibold mb-1">Regular pricing</p>
                <p className="text-xs text-[#6B7280] mb-1">&nbsp;</p>
                <p className="text-xs text-[#6B7280] mb-4"><span className="hidden md:inline">Unlimited seats • or $490/yr</span><span className="md:hidden">$490/yr</span></p>
                <div className="w-full py-2.5 md:py-3 bg-gray-100 text-[#6B7280] text-xs md:text-sm font-medium rounded-xl">After All Tiers Fill</div>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[#6B7280] mb-6"><span className="text-[#0D4D4D] font-bold">Right now:</span> We&apos;re filling the first 50 Founding Member spots — <span className="text-[#a158ff] font-bold">free for life</span>. Once they&apos;re gone, the price goes to $25, then $35, then $49. <span className="font-semibold text-[#0D4D4D]">Your tier is locked in forever.</span></p>
              <Link href="/founding-member" className="inline-flex items-center gap-2 md:gap-3 px-8 py-4 md:px-12 md:py-6 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg md:text-2xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/40 hover:shadow-[#fdcc02]/60 hover:scale-105">
                Apply for Founding Member
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
              <p className="text-[#6B7280] text-sm mt-4">No contracts • Lock in your price for life • Cancel anytime</p>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* FAQ                                          */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12"><h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">Frequently Asked <span className="text-[#3DD6C3]">Questions</span></h2></div>
            <div className="space-y-4">
              {faqItems.map((item, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <button onClick={() => toggleFaq(index)} className="w-full px-6 py-5 text-left flex items-center justify-between gap-4" aria-expanded={openFaq === index}>
                    <span className="text-lg font-semibold text-[#0D4D4D]">{item.question}</span>
                    <svg className={`w-5 h-5 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${openFaq === index ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${openFaq === index ? 'max-h-96' : 'max-h-0'}`}><div className="px-6 pb-5"><p className="text-[#6B7280] leading-relaxed">{item.answer}</p></div></div>
                </div>
              ))}
            </div>
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faqItems.map(item => ({ "@type": "Question", "name": item.question, "acceptedAnswer": { "@type": "Answer", "text": item.answer } })) }) }} />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#0D4D4D] py-12 pb-24 lg:pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2"><img src="/logo.png" alt="AgentForLife Logo" className="w-12 h-7 object-contain" /><span className="text-xl text-white brand-title">AgentForLife</span></div>
            <nav className="flex flex-wrap justify-center gap-6">
              <Link href="/login" className="text-white/70 hover:text-white transition-colors">Agent Login</Link>
              <a href="mailto:support@agentforlife.app" className="text-white/70 hover:text-white transition-colors">Contact</a>
              <Link href="/privacy" className="text-white/70 hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="text-white/70 hover:text-white transition-colors">Terms</Link>
            </nav>
            <p className="text-white/50 text-sm">© 2026 AgentForLife</p>
          </div>
        </div>
      </footer>

      {/* Mobile Sticky Bottom CTA */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden transition-all duration-300 ${
          showBottomCta ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-[#0D4D4D]/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DD6C3] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3DD6C3]"></span>
            </span>
            <span className="text-white text-sm font-semibold truncate">
              {spotsRemaining !== null ? <><span className="text-[#fdcc02]">{spotsRemaining}</span> free spots left</> : 'Free spots available'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/login" className="px-4 py-2 text-white/90 hover:text-white text-sm font-medium">
              Login
            </Link>
            <Link
              href="/founding-member"
              className="px-5 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full whitespace-nowrap"
            >
              Claim Free Spot
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
