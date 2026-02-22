'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import LeakyBucketCalculator from '@/components/LeakyBucketCalculator';

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeHoliday, setActiveHoliday] = useState('christmas');
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const smsRef = useRef<HTMLDivElement>(null);
  const smsTriggered = useRef(false);
  const [smsStep, setSmsStep] = useState(-1);

  const [ctaPeeked, setCtaPeeked] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [ctaScrollTriggered, setCtaScrollTriggered] = useState(false);
  const ctaLoadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ctaIsPeekingRef = useRef(false);

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

  const SMS_DELAYS = [
    600, 750, 300, 750, 750, 750,
    350, 350, 350, 350, 300, 300, 300, 300,
    1000,
  ];

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
  }, []);

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

  const activeTheme = holidayThemes[activeHoliday];

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
      answer: "Make it effortless. Your clients tap one button, pick a contact, and a warm personal introduction goes out via text — with your business card attached. Your AI-powered business line then picks up the conversation, gathers the referral's info, and books an appointment on your calendar. If the referral doesn't reply, AI automatically follows up on Day 2, 5, and 8. You just show up and close."
    },
    {
      question: "What is the AI business line?",
      answer: "Every agent gets a dedicated phone number powered by AI. When a referral replies to the group text, the AI responds as you — warm, conversational, and natural. It learns what coverage they need, answers basic questions, and shares your scheduling link to book a call. Calls to your business line forward straight to your personal phone. The referral thinks they're texting you directly."
    },
    {
      question: "How do insurance agents generate rewrites?",
      answer: "Agent For Life alerts you 30 days before every policy anniversary — the perfect time to review coverage and offer a rewrite. Your client gets a push notification that you may have found them a lower price for the same coverage, with a link to book on your calendar. The rewrite conversation starts with them reaching out to you."
    },
    {
      question: "How do I stop insurance chargebacks and policy cancellations?",
      answer: "Chargebacks happen when relationships go cold. Agent For Life attacks this on two fronts: 7+ automated touchpoints per year keep you top-of-mind so clients never feel forgotten. And when a policy does lapse, Conservation Alerts catch it — forward the carrier notice and AI sends personalized outreach within hours to save the policy before a chargeback hits."
    },
    {
      question: "How hard is it to get started?",
      answer: "You can be up and running in 10 minutes. Import your existing clients via CSV spreadsheet or upload PDF insurance applications — our AI extracts client info, policy details, and beneficiaries automatically. Your AI business line is provisioned instantly when you sign up. Share your branded app code with clients and you're live."
    },
    {
      question: "What exactly is Agent For Life?",
      answer: "It's a complete client relationship system built for insurance agents. You get: a branded mobile app for your clients, automated touchpoints (holidays, birthdays, anniversaries), one-tap referrals with an AI business line that books appointments, conservation alerts that rescue at-risk policies, anniversary rewrite alerts that turn renewals into booked appointments, CSV import, PDF parsing, push notifications, and a web dashboard to manage it all — normally $49/month, but free for life for our first 50 founding members."
    },
    {
      question: "What carriers does it work with?",
      answer: "All of them. Agent For Life is carrier-agnostic. You add policy details in the dashboard (or upload a PDF and AI does it). This works for independent agents regardless of which carriers you're appointed with."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Urgency Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#a158ff] text-white text-center py-1.5 px-4 text-xs sm:text-sm font-semibold tracking-wide">
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
              <Link href="/login" className="text-white/80 hover:text-white transition-colors text-sm sm:text-base">Login</Link>
              <Link href="/signup" className="px-3 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-sm sm:text-base font-semibold rounded-full transition-colors whitespace-nowrap">Get Started</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar Bookmark CTA */}
      <div
        className="fixed right-0 z-40 cursor-pointer"
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
        <section className="relative bg-[#0D4D4D] pb-24 md:pb-32 overflow-hidden pt-40 md:pt-48">
          <div className="absolute inset-0">
            <div className="absolute top-20 left-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-[150px] opacity-20"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-15"></div>
          </div>
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: `linear-gradient(to right, #3DD6C3 1px, transparent 1px), linear-gradient(to bottom, #3DD6C3 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0D4D4D] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0D4D4D]"></span>
              </span>
              <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">{spotsRemaining !== null ? `Only ${spotsRemaining} of 50 Free Lifetime Spots Left` : 'Limited Free Lifetime Spots Available'}</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-8">
              <span className="text-[#fdcc02]">Kill Chargebacks</span>.<br />
              <span className="text-[#3DD6C3]">Explode Your Referrals</span>.<br />
              Triple Your Income from the Leads You Already Won.
            </h1>

            <p className="text-xl md:text-2xl text-white/80 mb-10 max-w-3xl mx-auto leading-relaxed">
              Stop the &quot;one-and-done&quot; cycle. Agent For Life <span className="text-white font-semibold">fortifies your client relationships</span> with automated touchpoints, one-tap referrals, and your own AI-powered business line. It will cost <span className="line-through opacity-70">$49/month</span> — but the first 50 agents get it <span className="text-[#fdcc02] font-bold">free. For life.</span>
            </p>

            <Link href="/founding-member" className="inline-flex items-center gap-3 px-12 py-5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/40 hover:shadow-[#fdcc02]/60 hover:scale-105 border-2 border-[#fdcc02] hover:border-white/20">
              Lock In My Free Lifetime Spot
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
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
        <section className="py-20 md:py-28 bg-white -mt-1">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-4xl md:text-5xl font-extrabold text-[#0D4D4D] mb-4">
                You&apos;re Losing Money in <span className="text-red-500">Three Places</span>.
              </h2>
              <p className="text-xl text-[#6B7280]">
                Nobody&apos;s built anything to fix it — <span className="text-[#0D4D4D] font-bold">until now</span>.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">1</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Retention Is a Leaky Bucket</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">Your clients forget about you within weeks. When doubts come, they call the carrier&apos;s 800 number — not you. And when a policy lapses, the conservation notice sits in your inbox until it&apos;s too late. You eat the chargeback.</p>
              </div>

              <div className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">2</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Referrals Are Stuck in the 1990s</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">You still ask clients to &quot;call your friend and let them know I&apos;ll be reaching out.&quot; By the time you call, it&apos;s a semi-warm lead at best. Most agents get a 5% referral rate when 25% is possible.</p>
              </div>

              <div className="bg-[#F8F9FA] rounded-2xl p-7 border-l-4 border-red-400">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 font-black text-sm">3</span>
                  <h3 className="text-lg font-bold text-[#0D4D4D]">Rewrites Are Sitting on the Table</h3>
                </div>
                <p className="text-[#6B7280] leading-relaxed">Every policy anniversary is a lay-down sale, but there&apos;s zero systems to flag it, get the client interested, and get them on your calendar. That&apos;s revenue you&apos;ve already earned the right to.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* THE SYSTEM — what AgentForLife IS             */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#3DD6C3] rounded-full blur-[150px] opacity-15"></div>
            <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-[#fdcc02] rounded-full blur-[150px] opacity-10"></div>
          </div>

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6">
                <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">The System</span>
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-5">
                Your Branded App. Your AI.{' '}<br className="hidden md:block" />
                <span className="text-[#3DD6C3]">Their Phone.</span>
              </h2>
              <p className="text-xl text-white/70 max-w-3xl mx-auto leading-relaxed">
                AgentForLife puts <span className="text-white font-semibold">YOUR branded app</span> on every client&apos;s phone — with your photo, your contact info, and their policies at their fingertips. Behind it, AI and automation do the heavy lifting across three revenue streams.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-16">
              {/* Phone Mockup */}
              <div className="relative flex justify-center">
                <div className="relative">
                  <div className="w-72 h-[580px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
                    <div className="w-full h-full bg-black rounded-[2.5rem] overflow-hidden relative">
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        autoPlay={true}
                        muted={true}
                        loop={true}
                        playsInline={true}
                        poster="/app-preview-poster.jpeg"
                      >
                        <source src="/app-preview.webm" type="video/webm" />
                        <source src="/app-preview.mp4" type="video/mp4" />
                      </video>
                    </div>
                  </div>
                  <p className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-white/60 text-sm whitespace-nowrap">What your clients see</p>
                </div>
              </div>

              {/* Three Pillars */}
              <div className="space-y-6">
                <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10 hover:border-[#3DD6C3]/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#3DD6C3] rounded-2xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Retention — Keep Every Client</h3>
                      <p className="text-white/60 leading-relaxed">7+ automated touchpoints per year keep you top-of-mind. When a policy does lapse, AI reads the carrier notice, matches it to your client, and sends personalized outreach within hours — before the chargeback hits.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10 hover:border-[#fdcc02]/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#fdcc02] rounded-2xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Referrals — One Tap to Booked Appointment</h3>
                      <p className="text-white/60 leading-relaxed">Your client picks a contact, a warm intro goes out with your business card, and your AI business line takes the conversation from there — qualifying, gathering info, and booking on your calendar. You just show up.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10 hover:border-[#3DD6C3]/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#3DD6C3] rounded-2xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Rewrites — Turn Anniversaries into Revenue</h3>
                      <p className="text-white/60 leading-relaxed">30 days before every policy anniversary, your client gets a notification that you may have found them a better deal — with a link to book on your calendar. The rewrite comes to you.</p>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg font-bold rounded-full transition-all shadow-lg shadow-[#fdcc02]/30">
                    Get the System
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick setup steps */}
            <div className="grid sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                { num: '1', title: 'Sign Up & Brand', desc: 'Add your photo, logo, and contact info. 5 minutes.' },
                { num: '2', title: 'Import Your Book', desc: 'CSV upload or paste a PDF — AI extracts everything.' },
                { num: '3', title: 'Share with Clients', desc: 'They download YOUR app with a unique code.' },
                { num: '4', title: 'AI Takes Over', desc: 'Touchpoints, referrals, and conservation run on autopilot.' },
              ].map((step) => (
                <div key={step.num} className="text-center">
                  <div className="w-10 h-10 bg-[#3DD6C3] rounded-full flex items-center justify-center text-lg font-bold text-white mx-auto mb-3">{step.num}</div>
                  <h4 className="text-white font-bold text-sm mb-1">{step.title}</h4>
                  <p className="text-white/50 text-xs leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* DASHBOARD PREVIEW                            */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D4D4D]/10 border border-[#0D4D4D]/20 rounded-full mb-6">
                <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Your Dashboard</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                Your Command Center. <span className="text-[#3DD6C3]">One Screen.</span>
              </h2>
              <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
                Manage clients, track policies, monitor conservation alerts, and run your referral pipeline — all from one clean dashboard.
              </p>
            </div>

            <div className="relative max-w-5xl mx-auto">
              <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:overflow-visible sm:mx-0 sm:px-0">
                <div className="min-w-[640px] bg-[#1a1a2e] rounded-xl shadow-2xl overflow-hidden border border-gray-200/20">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111] border-b border-white/5">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]"></div>
                    </div>
                    <div className="flex-1 mx-3">
                      <div className="bg-white/10 rounded-md px-3 py-1 text-white/40 text-[11px] font-mono">app.agentforlife.com/dashboard</div>
                    </div>
                  </div>

                  <div className="flex" style={{ minHeight: '380px' }}>
                    <div className="w-12 bg-[#005851] flex flex-col items-center py-3 gap-3 flex-shrink-0">
                      <div className="w-7 h-7 rounded-lg bg-[#3DD6C3] flex items-center justify-center"><span className="text-[#005851] text-[10px] font-bold">A</span></div>
                      <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                      <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></div>
                      <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg></div>
                      <div className="mt-auto w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                    </div>

                    <div className="flex-1 bg-[#F8F9FA] p-5">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <h3 className="text-[#0D4D4D] font-bold text-base">Clients</h3>
                          <p className="text-[#6B7280] text-[11px]">47 clients &middot; 63 active policies</p>
                        </div>
                        <div className="flex gap-2">
                          <div className="px-2.5 py-1 bg-white rounded-lg text-[11px] text-[#6B7280] border border-gray-200 hidden sm:block">Search clients...</div>
                          <div className="px-2.5 py-1 bg-[#3DD6C3] rounded-lg text-[11px] text-white font-semibold">+ Add Client</div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="grid grid-cols-[1.2fr_1fr_70px_70px] gap-2 px-3 py-2 bg-gray-50 text-[9px] font-semibold text-[#6B7280] uppercase tracking-wider border-b border-gray-100">
                          <span>Client</span><span>Policy</span><span>Status</span><span></span>
                        </div>
                        {[
                          { name: 'Sarah Johnson', init: 'S', policy: 'Term Life · $500k', status: 'Active', sc: '#3DD6C3' },
                          { name: 'Mike Davis', init: 'M', policy: 'Whole Life · $250k', status: 'Active', sc: '#3DD6C3' },
                          { name: 'Jessica Park', init: 'J', policy: 'IUL · $1M', status: 'Pending', sc: '#fdcc02' },
                          { name: 'Robert Chen', init: 'R', policy: 'Term Life · $750k', status: 'Active', sc: '#3DD6C3' },
                          { name: 'Amanda Wilson', init: 'A', policy: 'Term Life · $500k', status: 'Lapsed', sc: '#EF4444' },
                        ].map((c, i) => (
                          <div key={i} className={`grid grid-cols-[1.2fr_1fr_70px_70px] gap-2 px-3 py-2.5 items-center text-[11px] ${i < 4 ? 'border-b border-gray-50' : ''}`}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-[#0D4D4D] flex items-center justify-center flex-shrink-0"><span className="text-white text-[9px] font-bold">{c.init}</span></div>
                              <span className="text-[#0D4D4D] font-semibold truncate">{c.name}</span>
                            </div>
                            <span className="text-[#6B7280] truncate">{c.policy}</span>
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-center" style={{ backgroundColor: `${c.sc}18`, color: c.sc }}>{c.status}</span>
                            <div className="flex gap-1 justify-end">
                              <div className="w-5 h-5 rounded bg-gray-50 flex items-center justify-center"><svg className="w-3 h-3 text-[#6B7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></div>
                              <div className="w-5 h-5 rounded bg-gray-50 flex items-center justify-center"><svg className="w-3 h-3 text-[#6B7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3 mt-8">
                {[
                  { label: 'Client Management', color: '#3DD6C3', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
                  { label: 'Policy Tracking', color: '#fdcc02', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
                  { label: 'Conservation Alerts', color: '#EF4444', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
                  { label: 'CSV & PDF Import', color: '#3DD6C3', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' },
                ].map((badge) => (
                  <div key={badge.label} className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-200 shadow-sm">
                    <svg className="w-4 h-4 flex-shrink-0" style={{ color: badge.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={badge.icon} /></svg>
                    <span className="text-[#0D4D4D] text-sm font-semibold">{badge.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

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
        {/* RETENTION — Prevention + Rescue               */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
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

            {/* Layer 1: Prevention */}
            <div className="mb-16">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px flex-1 bg-gray-200"></div>
                <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide px-3">Layer 1 · Prevention</span>
                <div className="h-px flex-1 bg-gray-200"></div>
              </div>
              <p className="text-center text-[#6B7280] mb-10 text-lg"><span className="text-[#0D4D4D] font-bold">7+ personalized touchpoints per year</span>, per client — completely automatic.</p>

              <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
                {/* Phone mockup */}
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

                {/* Feature cards */}
                <div className="space-y-4 lg:pt-8">
                  <div className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-shadow flex items-start gap-4">
                    <div className="text-2xl flex-shrink-0 mt-0.5">🎄🎆❤️🎇🦃</div>
                    <div>
                      <h3 className="text-base font-bold text-[#0D4D4D] mb-1">Holiday Cards</h3>
                      <p className="text-[#6B7280] text-sm leading-relaxed">Beautiful full-screen cards for 5 major holidays — with your photo, your agency, and a booking link. Sent automatically.</p>
                    </div>
                  </div>
                  <div className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-shadow flex items-start gap-4">
                    <div className="text-2xl flex-shrink-0 mt-0.5">🎂</div>
                    <div>
                      <h3 className="text-base font-bold text-[#0D4D4D] mb-1">Birthday Messages</h3>
                      <p className="text-[#6B7280] text-sm leading-relaxed">Personalized birthday greetings with balloon animations, sent automatically to every client. Never forget again.</p>
                    </div>
                  </div>
                  <div className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-shadow flex items-start gap-4">
                    <div className="text-2xl flex-shrink-0 mt-0.5">📋</div>
                    <div>
                      <h3 className="text-base font-bold text-[#0D4D4D] mb-1">Anniversary Alerts</h3>
                      <p className="text-[#6B7280] text-sm leading-relaxed">Get alerted 30 days before every policy anniversary — the perfect time to review and offer a rewrite.</p>
                    </div>
                  </div>
                  <div className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-shadow flex items-start gap-4">
                    <div className="text-2xl flex-shrink-0 mt-0.5">📱</div>
                    <div>
                      <h3 className="text-base font-bold text-[#0D4D4D] mb-1">Push Notifications</h3>
                      <p className="text-[#6B7280] text-sm leading-relaxed">Send messages directly to your clients&apos; phones. Custom notifications, reminders, and announcements — anytime.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 2: Rescue */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px flex-1 bg-gray-200"></div>
                <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide px-3">Layer 2 · Rescue</span>
                <div className="h-px flex-1 bg-gray-200"></div>
              </div>
              <p className="text-center text-[#6B7280] mb-8 text-lg">When a policy <em>does</em> lapse — <span className="text-[#0D4D4D] font-bold">forward the carrier email. AI handles the rest.</span></p>

              <div className="bg-[#0D4D4D] rounded-3xl p-8 md:p-10 relative overflow-hidden">
                <div className="absolute inset-0">
                  <div className="absolute bottom-0 left-10 w-64 h-64 bg-[#fdcc02] rounded-full blur-[120px] opacity-10"></div>
                </div>
                <div className="relative grid md:grid-cols-3 gap-5">
                  <div className="text-center md:text-left">
                    <div className="w-10 h-10 bg-[#fdcc02] rounded-full flex items-center justify-center text-lg font-bold text-[#0D4D4D] mb-3 mx-auto md:mx-0">1</div>
                    <h4 className="text-white font-bold mb-2">Forward the Alert</h4>
                    <p className="text-white/60 text-sm leading-relaxed">Forward the carrier&apos;s conservation notice to <span className="text-[#fdcc02] font-semibold">AI@conserve.agentforlife.app</span> or paste it in your dashboard.</p>
                  </div>
                  <div className="text-center md:text-left">
                    <div className="w-10 h-10 bg-[#3DD6C3] rounded-full flex items-center justify-center text-lg font-bold text-[#0D4D4D] mb-3 mx-auto md:mx-0">2</div>
                    <h4 className="text-white font-bold mb-2">AI Extracts & Matches</h4>
                    <p className="text-white/60 text-sm leading-relaxed">AI pulls client name, policy number, carrier, and reason — auto-matches to your records and flags chargeback risks.</p>
                  </div>
                  <div className="text-center md:text-left">
                    <div className="w-10 h-10 bg-[#fdcc02] rounded-full flex items-center justify-center text-lg font-bold text-[#0D4D4D] mb-3 mx-auto md:mx-0">3</div>
                    <h4 className="text-white font-bold mb-2">Client Gets Reached</h4>
                    <p className="text-white/60 text-sm leading-relaxed">Personalized push + text within 2 hours. AI follows up on Day 2, 5, and 7 with different angles.</p>
                  </div>
                </div>

                <div className="relative grid sm:grid-cols-2 gap-3 mt-8 pt-8 border-t border-white/10">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-[#fdcc02] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <span className="text-white/70 text-sm">Chargeback-risk policies get auto-outreach in 2 hours</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-[#3DD6C3] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="text-white/70 text-sm">Mark policies as &quot;Saved&quot; or &quot;Lost&quot; from your dashboard</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center mt-10">
              <p className="text-[#6B7280] text-lg">Other agents lose clients they never knew were leaving. <span className="text-[#0D4D4D] font-bold">You&apos;ll know within hours.</span></p>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* REFERRAL PIPELINE                            */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-20 right-10 w-96 h-96 bg-[#3DD6C3] rounded-full blur-[150px] opacity-15"></div>
          </div>
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6">
                <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Referrals</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                From <span className="text-[#3DD6C3]">One Tap</span> to <span className="text-[#fdcc02]">Booked Appointment</span>
              </h2>
              <p className="text-xl text-white/70 max-w-2xl mx-auto">Your clients already trust you. Now they can share that trust — and your AI handles the rest. Hot lead, zero phone tag.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 md:gap-4">
              <div className="bg-white/10 backdrop-blur rounded-3xl p-8 border border-white/10">
                <div className="w-12 h-12 bg-[#fdcc02] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">1</div>
                <h3 className="text-xl font-bold text-white mb-3">One Tap, One Contact</h3>
                <p className="text-white/70 leading-relaxed">Your client taps the referral button in their app and picks a friend or family member from their contacts. That&apos;s all they do.</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-3xl p-8 border border-white/10">
                <div className="w-12 h-12 bg-[#3DD6C3] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">2</div>
                <h3 className="text-xl font-bold text-white mb-3">Warm Intro + Your Card</h3>
                <p className="text-white/70 leading-relaxed">A personal text goes out from your client — a warm introduction about you, with <span className="text-white font-semibold">your business card attached</span>. Not a cold link. A trusted recommendation.</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-3xl p-8 border border-[#fdcc02]/30 relative">
                <div className="absolute top-4 right-4"><span className="px-2 py-1 bg-[#fdcc02] text-[#0D4D4D] text-[10px] font-bold rounded-full uppercase">AI Powered</span></div>
                <div className="w-12 h-12 bg-[#fdcc02] rounded-full flex items-center justify-center text-xl font-bold text-[#0D4D4D] mb-5">3</div>
                <h3 className="text-xl font-bold text-white mb-3">AI Books the Appointment</h3>
                <p className="text-white/70 leading-relaxed">When the referral replies, your <span className="text-white font-semibold">AI business line</span> picks up the conversation — texting as you. It gathers their info and books them on your calendar. <span className="text-[#fdcc02] font-semibold">You just show up and close.</span></p>
              </div>
            </div>

            {/* SMS Preview */}
            <div className="mt-16" ref={smsRef}>
              <p className="text-white/40 text-xs text-center mb-8 uppercase tracking-[0.2em] font-medium">What the referral sees</p>
              <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto items-start">
                {/* Phone 1: Group Chat */}
                <div>
                  <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-white/10">
                    <div className="bg-[#111] rounded-t-[1.6rem] px-5 pt-3 pb-2 flex items-center justify-between">
                      <span className="text-white/40 text-[10px] font-medium">9:41 AM</span>
                      <div className="flex gap-0.5"><div className="w-1 h-2 bg-white/40 rounded-sm"></div><div className="w-1 h-2.5 bg-white/40 rounded-sm"></div><div className="w-1 h-3 bg-white/40 rounded-sm"></div><div className="w-1 h-3.5 bg-white/30 rounded-sm"></div></div>
                    </div>
                    <div className="bg-[#111] px-5 pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center"><svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                        <div><p className="text-white text-sm font-semibold">Sarah, Daniel, Mike</p><p className="text-white/30 text-[10px]">Group Message</p></div>
                      </div>
                    </div>
                    <div className="bg-[#111] px-4 py-4 space-y-3 rounded-b-[1.6rem] min-h-[180px]">
                      <div className="flex justify-start" style={fade(0)}><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white/40 text-[10px] mb-0.5 font-medium">Sarah</p><p className="text-white text-[13px] leading-relaxed">Hey Mike, I just got helped by Daniel getting protection for my family. He was great and I thought he might be able to help you too!</p></div></div>
                      <div className="flex justify-end" style={fade(1)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-[#3DD6C3] text-[10px] mb-0.5 font-medium">Daniel</p><p className="text-white text-[13px] leading-relaxed">Hey Mike! Sarah, thank you for connecting us. Mike, great to meet you — I&apos;ll shoot you a text.</p></div></div>
                    </div>
                  </div>
                  <p className="text-center text-white/30 text-xs mt-3 font-medium">Group text — warm intro from your client</p>
                </div>

                {/* AI Handoff (mobile) */}
                <div className="md:hidden flex flex-col items-center py-2" style={fade(2)}>
                  <div className="w-px h-4 bg-gradient-to-b from-white/10 to-[#3DD6C3]/40"></div>
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full"><svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg><span className="text-[#3DD6C3] text-xs font-bold uppercase tracking-wide">AI takes over in minutes</span></div>
                  <div className="w-px h-4 bg-gradient-to-b from-[#3DD6C3]/40 to-white/10"></div>
                </div>

                {/* Phone 2: 1-on-1 */}
                <div>
                  <div className="hidden md:flex items-center justify-center gap-2 mb-3" style={fade(2)}>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#3DD6C3]/30"></div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full"><svg className="w-3 h-3 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg><span className="text-[#3DD6C3] text-[10px] font-bold uppercase tracking-wider">AI takes over in minutes</span></div>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#3DD6C3]/30"></div>
                  </div>
                  <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-[#3DD6C3]/20">
                    <div className="bg-[#111] rounded-t-[1.6rem] px-5 pt-3 pb-2 flex items-center justify-between">
                      <span className="text-white/40 text-[10px] font-medium">9:44 AM</span>
                      <div className="flex gap-0.5"><div className="w-1 h-2 bg-white/40 rounded-sm"></div><div className="w-1 h-2.5 bg-white/40 rounded-sm"></div><div className="w-1 h-3 bg-white/40 rounded-sm"></div><div className="w-1 h-3.5 bg-white/30 rounded-sm"></div></div>
                    </div>
                    <div className="bg-[#111] px-5 pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#005851] flex items-center justify-center"><span className="text-[#3DD6C3] text-xs font-bold">D</span></div>
                        <div><p className="text-white text-sm font-semibold">Daniel</p><p className="text-white/30 text-[10px]">Your AI Business Line</p></div>
                      </div>
                    </div>
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
                  <p className="text-center text-white/30 text-xs mt-3 font-medium">1-on-1 — AI qualifies &amp; books the appointment</p>
                </div>
              </div>

              <div className="max-w-2xl mx-auto mt-10" style={fade(14)}>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-start gap-4">
                  <div className="w-10 h-10 bg-[#3DD6C3]/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"><svg className="w-5 h-5 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                  <div>
                    <p className="text-white font-semibold text-sm mb-1">The referral thinks they&apos;re texting you</p>
                    <p className="text-white/50 text-sm leading-relaxed">Your AI business line responds in your voice — warm, personal, and natural. It qualifies the lead, gathers their info, and books the appointment on your calendar. You just show up and close.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Referral Drip */}
            <div className="mt-12 bg-white/5 rounded-2xl p-8 md:p-10 border border-white/10 text-center max-w-3xl mx-auto">
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
        </section>

        {/* ============================================ */}
        {/* ANNIVERSARY REWRITES                         */}
        {/* ============================================ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D4D4D] rounded-full mb-6">
                <span className="text-[#3DD6C3] font-bold text-sm uppercase tracking-wide">Rewrites</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                Every Anniversary Is a <span className="text-[#3DD6C3]">Booked Appointment</span>.
              </h2>
              <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">30 days before the one-year mark, your client hears from you — not the carrier. The rewrite comes to you, not the other way around.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0"><div className="w-12 h-12 bg-[#0D4D4D] rounded-2xl flex items-center justify-center"><svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg></div></div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0D4D4D] mb-1">You Get the Heads-Up</h3>
                    <p className="text-[#6B7280] leading-relaxed">30 days before a policy anniversary, you get an email digest with every upcoming renewal. No spreadsheets. No manual tracking.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0"><div className="w-12 h-12 bg-[#0D4D4D] rounded-2xl flex items-center justify-center"><svg className="w-6 h-6 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg></div></div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0D4D4D] mb-1">Your Client Gets a Notification</h3>
                    <p className="text-[#6B7280] leading-relaxed">A personalized push notification goes to their phone — letting them know you may have found a lower price for the same coverage, with a link to book on your calendar.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0"><div className="w-12 h-12 bg-[#0D4D4D] rounded-2xl flex items-center justify-center"><svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div></div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0D4D4D] mb-1">They Book Themselves</h3>
                    <p className="text-[#6B7280] leading-relaxed">The client taps through to your scheduling link and picks a time. The rewrite conversation starts with <em>them</em> reaching out to <em>you</em>.</p>
                  </div>
                </div>
              </div>

              {/* Notification preview */}
              <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-lg">
                <div className="text-center mb-6">
                  <p className="text-sm text-[#6B7280] font-medium uppercase tracking-wide mb-2">You choose the tone</p>
                  <div className="inline-flex rounded-xl overflow-hidden border border-gray-200">
                    <div className="px-5 py-3 bg-[#0D4D4D] text-white text-sm font-semibold">Lower Price Alert</div>
                    <div className="px-5 py-3 bg-white text-[#6B7280] text-sm font-medium">Warm Check-In</div>
                  </div>
                </div>
                <div className="bg-[#F8F9FA] rounded-2xl p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0"><span className="text-[#3DD6C3] text-xs font-bold">D</span></div>
                    <div><p className="text-[#0D4D4D] font-semibold text-sm">Daniel Roberts</p><p className="text-[#6B7280] text-xs">Your Agent</p></div>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-gray-100">
                    <p className="text-[#0D4D4D] text-sm leading-relaxed">&quot;Hey Sarah! Your policy anniversary is coming up and I&apos;ve been seeing some <span className="font-bold text-[#3DD6C3]">lower rates for the same coverage</span>. Want me to run the numbers? It&apos;ll take 10 minutes — tap below to grab a time on my calendar.&quot;</p>
                  </div>
                  <div className="mt-4 text-center">
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3DD6C3] text-[#0D4D4D] text-sm font-bold rounded-xl">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Book with Daniel
                    </div>
                  </div>
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
              <div className="flex flex-col items-center justify-center py-8"><div className="text-4xl font-black text-[#6B7280]">vs</div></div>
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
                  <div className="flex items-center gap-2"><svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span>1 saved policy = 4x ROI</span></div>
                  <div className="flex items-center gap-2"><svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span>1 referral = 4x ROI</span></div>
                  <div className="flex items-center gap-2"><svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span>1 rewrite = 4x ROI</span></div>
                </div>
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
              <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">Standard price is <span className="font-semibold">$49/mo</span> (or $490/yr). We&apos;re launching in tiers — <span className="font-semibold">150 early spots</span>, then they&apos;re gone forever. The earlier you join, the less you&apos;ll ever pay.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <div className="relative bg-white rounded-2xl border-2 border-[#a158ff] p-6 text-center shadow-lg shadow-[#a158ff]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-3 py-1 bg-[#a158ff] text-white text-xs font-bold rounded-full whitespace-nowrap">NOW OPEN</span></div>
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Founding Members</p>
                <p className="text-4xl font-black text-[#0D4D4D] mb-1">FREE</p>
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
              <div className="relative bg-white rounded-2xl border-2 border-[#3DD6C3] p-6 text-center shadow-lg shadow-[#3DD6C3]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-3 py-1 bg-[#3DD6C3] text-[#0D4D4D] text-xs font-bold rounded-full whitespace-nowrap">UP NEXT</span></div>
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Charter Members</p>
                <div className="flex items-baseline justify-center gap-1 mb-1"><span className="text-4xl font-black text-[#0D4D4D]">$25</span><span className="text-sm text-[#6B7280]">/mo</span></div>
                <p className="text-sm text-[#3DD6C3] font-semibold mb-1">Locked in for life</p>
                <p className="text-xs text-[#6B7280] line-through mb-1">$49/mo</p>
                <p className="text-xs text-[#6B7280] mb-4">50 spots • or $250/yr — then gone forever</p>
                <div className="w-full py-3 bg-[#0D4D4D]/10 text-[#0D4D4D] text-sm font-bold rounded-xl">Opens After Free Tier Fills</div>
              </div>
              <div className="relative bg-white rounded-2xl border border-gray-200 p-6 text-center">
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Inner Circle</p>
                <div className="flex items-baseline justify-center gap-1 mb-1"><span className="text-4xl font-black text-[#0D4D4D]">$35</span><span className="text-sm text-[#6B7280]">/mo</span></div>
                <p className="text-sm text-[#6B7280] font-semibold mb-1">Locked in for life</p>
                <p className="text-xs text-[#6B7280] line-through mb-1">$49/mo</p>
                <p className="text-xs text-[#6B7280] mb-4">50 spots • or $350/yr — then gone forever</p>
                <div className="w-full py-3 bg-gray-100 text-[#6B7280] text-sm font-medium rounded-xl">Opens After $25 Tier Fills</div>
              </div>
              <div className="relative bg-white rounded-2xl border border-gray-200 p-6 text-center bg-[#F8F9FA]">
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Standard Price</p>
                <div className="flex items-baseline justify-center gap-1 mb-1"><span className="text-4xl font-black text-[#0D4D4D]">$49</span><span className="text-sm text-[#6B7280]">/mo</span></div>
                <p className="text-sm text-[#6B7280] font-semibold mb-1">Regular pricing</p>
                <p className="text-xs text-[#6B7280] mb-1">&nbsp;</p>
                <p className="text-xs text-[#6B7280] mb-4">Unlimited seats • or $490/yr</p>
                <div className="w-full py-3 bg-gray-100 text-[#6B7280] text-sm font-medium rounded-xl">After All Tiers Fill</div>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[#6B7280] mb-6"><span className="text-[#0D4D4D] font-bold">Right now:</span> We&apos;re filling the first 50 Founding Member spots — <span className="text-[#a158ff] font-bold">free for life</span>. Once they&apos;re gone, the price goes to $25, then $35, then $49. <span className="font-semibold text-[#0D4D4D]">Your tier is locked in forever.</span></p>
              <Link href="/founding-member" className="inline-flex items-center gap-3 px-12 py-6 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-2xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/40 hover:shadow-[#fdcc02]/60 hover:scale-105">
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
      <footer className="bg-[#0D4D4D] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2"><img src="/logo.png" alt="AgentForLife Logo" className="w-12 h-7 object-contain" /><span className="text-xl text-white brand-title">AgentForLife</span></div>
            <nav className="flex flex-wrap justify-center gap-6">
              <Link href="/login" className="text-white/70 hover:text-white transition-colors">Login</Link>
              <a href="mailto:support@agentforlife.app" className="text-white/70 hover:text-white transition-colors">Contact</a>
              <Link href="/privacy" className="text-white/70 hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="text-white/70 hover:text-white transition-colors">Terms</Link>
            </nav>
            <p className="text-white/50 text-sm">© 2026 AgentForLife</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
