'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

/* ═══════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════ */

const HOLIDAYS: Record<string, { gradient: string; emoji: string; label: string; greeting: string; body: string; floatingEmoji: string[]; accent: string }> = {
  christmas: { gradient: 'linear-gradient(135deg, #8B0000, #C41E3A, #A0153E)', emoji: '🎄', label: 'Christmas', greeting: 'Merry Christmas, Sarah!', body: 'Wishing you and your family a season full of warmth, joy, and time together.', floatingEmoji: ['❄️', '🎄', '⭐'], accent: '#D4A843' },
  newyear: { gradient: 'linear-gradient(135deg, #0B1A3E, #162D6E, #1A3A8A)', emoji: '🎆', label: "New Year\u2019s", greeting: 'Happy New Year, Sarah!', body: "Here\u2019s to a fresh start and a year full of good things.", floatingEmoji: ['🎆', '✨', '🎇'], accent: '#C0C0C0' },
  valentines: { gradient: 'linear-gradient(135deg, #9B1B30, #D63B5C, #E8839B)', emoji: '💝', label: "Valentine\u2019s", greeting: "Happy Valentine\u2019s Day, Sarah!", body: 'Today is all about the people who matter most.', floatingEmoji: ['❤️', '💕', '💖'], accent: '#FFB6C1' },
  july4th: { gradient: 'linear-gradient(135deg, #002868, #BF0A30, #002868)', emoji: '🇺🇸', label: '4th of July', greeting: 'Happy 4th of July, Sarah!', body: 'Wishing you a day full of good food, great company, and fireworks.', floatingEmoji: ['🇺🇸', '🎆', '⭐'], accent: '#FFFFFF' },
  thanksgiving: { gradient: 'linear-gradient(135deg, #8B4513, #BF6A20, #D4892A)', emoji: '🍂', label: 'Thanksgiving', greeting: 'Happy Thanksgiving, Sarah!', body: "I\u2019m grateful for the trust you place in me.", floatingEmoji: ['🍂', '🍁', '🍃'], accent: '#DAA520' },
};

const FAQ_ITEMS = [
  { question: 'How can insurance agents improve client retention?', answer: 'Agent For Life sends 7+ automated touchpoints per year per client \u2014 holiday cards for 5 major holidays, personalized birthday messages, and policy anniversary alerts \u2014 all as push notifications directly to their phone. When a policy does lapse or get canceled, Conservation Alerts kick in: forward the carrier notice and AI reaches out to your client within hours. Combine that with a branded app where they can view policies and contact you instantly, and you become irreplaceable instead of forgettable.' },
  { question: 'How do I get more referrals from existing clients?', answer: "Make it effortless. Your clients tap one button, pick a contact, and send a warm personal text \u2014 with your business card attached. Then your AI reaches out separately via iMessage, has a qualifying conversation, gathers their info, and books an appointment on your calendar. If the referral doesn\u2019t reply, AI automatically follows up on Day 2, 5, and 8. You just show up and close." },
  { question: 'What is the AI Referral Assistant?', answer: "When your client refers someone, the AI reaches out via iMessage (blue bubbles, ~99% read rate) in a separate 1-on-1 thread \u2014 responding as you, warm and conversational. It builds trust through a qualifying conversation, learns what coverage they need, and shares your scheduling link to book a call. The referral thinks they\u2019re texting you directly." },
  { question: 'How do insurance agents generate rewrites?', answer: "Agent For Life alerts you as each policy\u2019s one-year anniversary hits \u2014 the moment you\u2019re free to rewrite without owing back commission. Your client gets a push notification that you may have found them a lower price for the same coverage, with a link to book on your calendar. The goal is to book within 24\u201348 hours." },
  { question: 'How do I stop insurance chargebacks and policy cancellations?', answer: "Chargebacks happen when relationships go cold. Agent For Life attacks this on two fronts: 7+ automated touchpoints per year keep you top-of-mind so clients never feel forgotten. And when a policy does lapse, Conservation Alerts catch it \u2014 forward the carrier notice and AI sends personalized outreach within hours to save the policy before a chargeback hits." },
  { question: 'How hard is it to get started?', answer: "You can be up and running in 10 minutes. Import your existing clients via CSV spreadsheet or upload PDF insurance applications \u2014 our AI extracts client info, policy details, and beneficiaries automatically. Enable the AI referral assistant with one toggle and share your branded app code with clients \u2014 you\u2019re live." },
  { question: 'What exactly is Agent For Life?', answer: "It\u2019s a complete client relationship system built for insurance agents. You get: a branded mobile app for your clients, automated touchpoints (holidays, birthdays, anniversaries), one-tap referrals with an AI assistant that qualifies leads via iMessage and books appointments, conservation alerts that rescue at-risk policies, anniversary rewrite alerts that turn renewals into booked appointments, CSV import, PDF parsing, push notifications, and a web dashboard to manage it all \u2014 normally $49/month, but free for life for our first 50 founding members." },
  { question: 'What carriers does it work with?', answer: "All of them. Agent For Life is carrier-agnostic. You add policy details in the dashboard (or upload a PDF and AI does it). This works for independent agents regardless of which carriers you\u2019re appointed with." },
];

const IMESSAGE_DELAYS = [800, 1000, 800, 1200, 800, 400, 1000];

/* ═══════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function LandingPageV4() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [activeHoliday, setActiveHoliday] = useState('christmas');
  const [showBottomCta, setShowBottomCta] = useState(false);
  const [msgStep, setMsgStep] = useState(-1);

  const [ctaPeeked, setCtaPeeked] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [ctaScrollTriggered, setCtaScrollTriggered] = useState(false);
  const ctaLoadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ctaIsPeekingRef = useRef(false);

  const heroRef = useRef<HTMLElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatTriggered = useRef(false);

  const CTA_EXPANDED_W = 276;
  const CTA_TAB_W = 36;
  const ctaWidth = (ctaHovered || ctaPeeked) ? CTA_EXPANDED_W : CTA_TAB_W;

  useEffect(() => {
    fetch('/api/spots-remaining').then(r => r.json()).then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); }).catch(() => {});
  }, []);

  useEffect(() => {
    ctaLoadTimerRef.current = setTimeout(() => { ctaIsPeekingRef.current = true; setCtaPeeked(true); setTimeout(() => { setCtaPeeked(false); ctaIsPeekingRef.current = false; }, 2500); }, 3500);
    return () => clearTimeout(ctaLoadTimerRef.current);
  }, []);

  useEffect(() => {
    const h = () => {
      if (ctaScrollTriggered) return;
      if (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) > 0.2) {
        setCtaScrollTriggered(true); clearTimeout(ctaLoadTimerRef.current);
        if (ctaIsPeekingRef.current) return;
        ctaIsPeekingRef.current = true; setCtaPeeked(true);
        setTimeout(() => { setCtaPeeked(false); ctaIsPeekingRef.current = false; }, 2500);
      }
    };
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, [ctaScrollTriggered]);

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
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting && !chatTriggered.current) { chatTriggered.current = true; setMsgStep(0); } }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (msgStep < 0 || msgStep >= IMESSAGE_DELAYS.length) return;
    const t = setTimeout(() => setMsgStep(s => s + 1), IMESSAGE_DELAYS[msgStep]);
    return () => clearTimeout(t);
  }, [msgStep]);

  const msgFade = (step: number) => ({ opacity: msgStep >= step ? 1 : 0, transform: msgStep >= step ? 'translateY(0)' : 'translateY(8px)', transition: 'all 400ms ease-out' } as React.CSSProperties);

  const activeTheme = HOLIDAYS[activeHoliday];

  return (
    <div className="min-h-screen bg-white">
      {/* ══════════ URGENCY BANNER ══════════ */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#a158ff] text-white text-center py-1 sm:py-1.5 px-4 text-[11px] sm:text-sm font-semibold tracking-wide">
        <Link href="/founding-member" className="hover:underline">
          {spotsRemaining !== null
            ? <>Only <span className="font-black">{spotsRemaining} of 50</span> free lifetime spots remaining &mdash; Normally <span className="line-through">$49/mo</span><span className="hidden sm:inline"> &mdash; Claim yours now</span></>
            : <>Limited free lifetime spots remaining &mdash; Normally <span className="line-through">$49/mo</span></>}
        </Link>
      </div>

      {/* ══════════ NAVIGATION ══════════ */}
      <nav className="fixed top-[28px] sm:top-[34px] left-0 right-0 z-50 bg-[#0D4D4D]/95 backdrop-blur-md shadow-lg border-b border-white/5">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 md:h-20">
            <Link href="/" className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-shrink">
              <img src="/logo.png" alt="AgentForLife Logo" className="w-[50px] h-[28px] sm:w-[70px] sm:h-[40px] md:w-[80px] md:h-[45px] object-contain flex-shrink-0" />
              <span className="text-base sm:text-lg md:text-xl text-white brand-title truncate">AgentForLife</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <Link href="/login" className="text-white/70 hover:text-white transition-colors text-sm sm:text-base">Login</Link>
              <Link href="/signup" className="px-3 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-sm sm:text-base font-semibold rounded-full transition-colors whitespace-nowrap">Get Started</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ══════════ SIDEBAR BOOKMARK CTA (desktop) ══════════ */}
      <div className="fixed right-0 z-40 cursor-pointer hidden lg:block" style={{ top: '114px', width: `${CTA_EXPANDED_W}px`, height: '180px', clipPath: `inset(0 0 0 ${CTA_EXPANDED_W - ctaWidth}px round ${ctaWidth <= CTA_TAB_W ? 8 : 12}px 0 0 ${ctaWidth <= CTA_TAB_W ? 8 : 12}px)`, transition: 'clip-path 500ms cubic-bezier(0.4,0,0.2,1)', willChange: 'clip-path' }} onMouseEnter={() => setCtaHovered(true)} onMouseLeave={() => setCtaHovered(false)}>
        <div className="flex" style={{ width: `${CTA_EXPANDED_W}px`, height: '100%' }}>
          <div className="flex-1 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)', borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}>
            <div className="absolute inset-0 p-4 flex flex-col justify-center" style={{ opacity: (ctaHovered || ctaPeeked) ? 1 : 0, transform: (ctaHovered || ctaPeeked) ? 'none' : 'translateX(10px)', transition: (ctaHovered || ctaPeeked) ? 'opacity 350ms ease 180ms, transform 350ms ease 180ms' : 'opacity 150ms ease, transform 150ms ease', pointerEvents: (ctaHovered || ctaPeeked) ? 'auto' : 'none' }}>
              <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mb-1">Founding Member</p>
              <p className="text-white font-extrabold text-2xl mb-0.5">FREE</p>
              <p className="text-white/70 text-xs mb-3 leading-relaxed">{spotsRemaining ?? 50} spots left &middot; Lifetime access.<br />Usually <span className="line-through opacity-70">$49/mo</span></p>
              <Link href="/founding-member" className="inline-block w-full text-center py-2.5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-xs font-bold rounded-lg transition-colors">Claim Free Spot &rarr;</Link>
            </div>
          </div>
          <div className="flex-shrink-0 relative overflow-hidden animate-[purpleGlow_2.5s_ease-in-out_infinite]" style={{ width: `${CTA_TAB_W}px`, background: 'linear-gradient(180deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)' }}>
            <div className="absolute inset-0 pointer-events-none animate-[goldShimmer_5s_ease-in-out_infinite]" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(253,204,2,0.4) 50%, transparent 100%)' }} />
            <div className="absolute inset-0 flex justify-center overflow-hidden">
              <div className="animate-[tickerUp_10s_linear_infinite] flex-shrink-0" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                <span className="text-white/90 font-bold text-[9px] tracking-[0.15em] uppercase whitespace-nowrap">{`🚀 ${spotsRemaining ?? 50} FREE SPOTS \u2022 LIFETIME FREE \u2022 APPLY NOW \u2022 🚀 ${spotsRemaining ?? 50} FREE SPOTS \u2022 LIFETIME FREE \u2022 APPLY NOW \u2022 `}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes tickerUp { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes goldShimmer { 0%,100% { transform: translateY(150%); opacity: 0; } 5% { transform: translateY(80%); opacity: 1; } 15% { transform: translateY(-80%); opacity: 1; } 20% { transform: translateY(-150%); opacity: 0; } 21% { transform: translateY(150%); opacity: 0; } }
        @keyframes floatDrift { 0% { transform: translateY(200px) rotate(0deg); opacity: 0; } 12% { opacity: 0.25; } 88% { opacity: 0.25; } 100% { transform: translateY(-200px) rotate(180deg); opacity: 0; } }
      `}</style>

      <main>
        {/* ═══════════════════════════════════════════════════
           HERO
           ═══════════════════════════════════════════════════ */}
        <section ref={heroRef} className="relative bg-[#0D4D4D] overflow-hidden pt-28 md:pt-44 pb-28 md:pb-44">
          <div className="absolute inset-0">
            <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-15" />
            <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#3DD6C3] rounded-full blur-[250px] opacity-10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#fdcc02] rounded-full blur-[300px] opacity-[0.04]" />
          </div>
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
              <div className="text-center lg:text-left mb-12 lg:mb-0">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-6">
                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-[#0D4D4D] opacity-75" /><span className="relative rounded-full h-2 w-2 bg-[#0D4D4D]" /></span>
                    <span className="text-[#0D4D4D] font-bold text-xs sm:text-sm uppercase tracking-wide">{spotsRemaining !== null ? `${spotsRemaining} of 50 Free Spots Left` : 'Free Lifetime Spots Available'}</span>
                  </div>
                </motion.div>

                <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="text-4xl md:text-5xl lg:text-[3.5rem] font-extrabold text-white leading-[1.08] mb-6">
                  You close the deal.<br /><span className="text-[#3DD6C3]">Your AI handles everything after.</span>
                </motion.h1>

                <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="text-base md:text-lg text-white/60 mb-8 max-w-lg mx-auto lg:mx-0 leading-relaxed">
                  A branded app on your client&apos;s phone. Automated retention. AI&#8209;powered referrals. Anniversary rewrites. Complete autopilot.
                </motion.p>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
                  <Link href="/founding-member" className="inline-flex items-center gap-3 px-8 py-4 md:px-10 md:py-5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg md:text-xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/30 hover:shadow-[#fdcc02]/50 hover:scale-[1.03]">
                    Lock In My Free Lifetime Spot
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </Link>
                  <p className="text-white/35 mt-4 text-sm">{spotsRemaining !== null ? `${spotsRemaining} spots left` : 'Limited spots'} &middot; $0 forever &middot; No credit card</p>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.5 }} className="flex items-center justify-center lg:justify-start gap-4 mt-6">
                  <div className="flex items-center gap-1.5 text-white/40 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                    iPhone
                  </div>
                  <span className="text-white/20">+</span>
                  <div className="flex items-center gap-1.5 text-white/40 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.34c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm-11.046 0c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm11.405-6.02l1.9-3.46c.11-.2.04-.44-.15-.56-.2-.11-.44-.04-.56.15l-1.92 3.49C15.46 8.38 13.55 7.75 12 7.75s-3.46.63-5.14 1.72L4.94 5.98c-.12-.19-.36-.26-.56-.15-.19.12-.26.36-.15.56l1.9 3.46C2.64 11.96.34 15.55 0 19.8h24c-.34-4.25-2.64-7.84-6.12-9.48z"/></svg>
                    Android
                  </div>
                </motion.div>

                {spotsRemaining !== null && (
                  <div className="mt-8 max-w-xs mx-auto lg:mx-0">
                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-[#fdcc02] rounded-full transition-all duration-1000" style={{ width: `${((50 - spotsRemaining) / 50) * 100}%` }} />
                    </div>
                    <p className="text-white/35 text-xs mt-2">{50 - spotsRemaining} agent{50 - spotsRemaining !== 1 ? 's' : ''} already locked in</p>
                  </div>
                )}
              </div>

              <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.3 }} className="hidden md:flex justify-center lg:justify-end">
                <div className="relative">
                  <div className="w-[260px] h-[520px] bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl border-4 border-[#2a2a2a]">
                    <div className="w-full h-full bg-black rounded-[2.5rem] overflow-hidden">
                      <video className="w-full h-full object-cover" autoPlay muted loop playsInline poster="/app-preview-poster.jpeg">
                        <source src="/app-preview.webm" type="video/webm" />
                        <source src="/app-preview.mp4" type="video/mp4" />
                      </video>
                    </div>
                  </div>
                  <div className="absolute -inset-2 rounded-[3.4rem] bg-gradient-to-b from-[#3DD6C3]/20 via-transparent to-[#fdcc02]/10 pointer-events-none blur-sm" />
                </div>
              </motion.div>
            </div>
          </div>

          <motion.div className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:block" animate={{ y: [0, 8, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
            <svg className="w-5 h-5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" /></svg>
          </motion.div>

          <div className="absolute -bottom-1 left-0 right-0">
            <svg viewBox="0 0 1440 100" fill="none" preserveAspectRatio="none" className="w-full h-[50px] md:h-[100px]">
              <path d="M0 100L60 88C120 76 240 52 360 40C480 28 600 28 720 36C840 44 960 60 1080 64C1200 68 1320 60 1380 56L1440 52V100H0Z" fill="white" />
            </svg>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           THE PROBLEM
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-white -mt-1">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div className="text-center mb-14" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <p className="text-red-400 font-bold text-sm uppercase tracking-widest mb-4">The uncomfortable truth</p>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] leading-tight">
                Here&apos;s what happens<br className="hidden md:block" /> after you close a policy.
              </h2>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-5 md:gap-6">
              {[
                { num: '1', title: 'Silence.', body: "After the close, you become a name in their phone they\u2019ll never call. A few months later, a competitor reaches out. Then a lapse notice hits your inbox \u2014 and a chargeback follows.", delay: 0 },
                { num: '2', title: 'Dead referrals.', body: "You ask clients to refer friends. They say \u201csure.\u201d They never do. The few who try? The lead goes cold before you follow up. Most agents get 5% when 25% is possible.", delay: 0.1 },
                { num: '3', title: 'Missed money.', body: "Every policy anniversary is a chance to review, rewrite, and earn. But with no system to flag it or reach the client, the carrier auto-renews and you miss out.", delay: 0.2 },
              ].map((card) => (
                <motion.div key={card.num} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: card.delay }} className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-lg transition-shadow">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center text-red-400 font-black text-sm border border-red-100">{card.num}</span>
                    <h3 className="text-xl font-extrabold text-[#0D4D4D]">{card.title}</h3>
                  </div>
                  <p className="text-[#6B7280] leading-relaxed">{card.body}</p>
                </motion.div>
              ))}
            </div>

            <motion.div className="text-center mt-16 max-w-2xl mx-auto" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.8 }} transition={{ duration: 0.6 }}>
              <p className="text-2xl md:text-3xl font-extrabold text-[#0D4D4D]">
                We built a system that <span className="text-[#3DD6C3]">fixes all three</span>.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           THE SYSTEM — One System. Three Revenue Streams.
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-[#070E1B] relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-0 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[250px] opacity-[0.07]" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#fdcc02] rounded-full blur-[200px] opacity-[0.05]" />
          </div>
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div className="text-center mb-14" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/10 rounded-full mb-6">
                <span className="text-[#3DD6C3] font-bold text-sm uppercase tracking-wide">The System</span>
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4">One System. Three Revenue Streams.</h2>
              <p className="text-lg text-white/50 max-w-2xl mx-auto">A branded app on their phone. An AI that never sleeps. Three ways to grow.</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-5">
              {[
                { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', title: 'Retention', accent: '#3DD6C3', desc: '7+ automated touchpoints per year. Holiday cards, birthdays, push notifications. When a policy slips, forward one email \u2014', punchline: 'AI handles the rest.', delay: 0 },
                { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', title: 'Referrals', accent: '#fdcc02', desc: 'Your client taps one button. AI texts the referral via iMessage, qualifies them, and books them on your calendar.', punchline: 'You just show up and close.', delay: 0.1 },
                { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', title: 'Rewrites', accent: '#3DD6C3', desc: 'As each policy anniversary hits, your client gets a notification with a rate review offer.', punchline: 'They book themselves on your calendar.', delay: 0.2 },
              ].map((f) => (
                <motion.div key={f.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: f.delay }} className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-8 border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.15] transition-all duration-300 group">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ backgroundColor: `${f.accent}15` }}>
                    <svg className="w-6 h-6" style={{ color: f.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.icon} /></svg>
                  </div>
                  <h3 className="text-xl font-extrabold text-white mb-1">{f.title}</h3>
                  <div className="h-0.5 w-10 rounded-full mb-4 transition-all duration-300 group-hover:w-14" style={{ backgroundColor: f.accent }} />
                  <p className="text-white/50 leading-relaxed text-[15px]">{f.desc} <span className="font-bold" style={{ color: f.accent }}>{(f as typeof f & { punchline?: string }).punchline}</span></p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           FEATURE: RETENTION
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
              <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex justify-center mb-12 lg:mb-0">
                <div className="w-[220px] md:w-[240px] h-[420px] md:h-[460px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a]">
                  <div key={activeHoliday} className="w-full h-full rounded-[2rem] overflow-hidden relative" style={{ background: activeTheme.gradient }}>
                    {activeTheme.floatingEmoji.map((em, i) => (
                      <span key={i} className="absolute text-base pointer-events-none" style={{ left: `${10 + i * 25}%`, animation: `floatDrift ${6 + i * 2}s ease-in-out infinite`, animationDelay: `${i * 1.8}s`, opacity: 0 }}>{em}</span>
                    ))}
                    <div className="flex flex-col items-center justify-center h-full px-4 text-center relative z-10">
                      <div className="w-14 h-14 rounded-full border-2 border-white/40 bg-white/15 flex items-center justify-center mb-3" style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.2)' }}>
                        <span className="text-2xl font-bold text-white">D</span>
                      </div>
                      <p className="text-white font-bold text-xs mb-0.5">Daniel Roberts</p>
                      <p className="text-white/50 text-[9px] mb-4">Roberts Insurance Agency</p>
                      <p className="text-white font-extrabold text-base leading-tight mb-2">{activeTheme.greeting}</p>
                      <p className="text-white/70 text-[11px] leading-relaxed mb-4 px-1">{activeTheme.body}</p>
                      <div className="px-5 py-2 rounded-xl text-[11px] font-bold shadow-md" style={{ backgroundColor: activeTheme.accent, color: ['#FFFFFF', '#C0C0C0', '#FFB6C1', '#DAA520'].includes(activeTheme.accent) ? '#1A1A2E' : '#FFFFFF' }}>
                        Book your appointment
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full mb-4">
                  <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">Retention</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">Never lose a client to silence again.</h2>
                <p className="text-[#6B7280] text-lg mb-6 leading-relaxed">Two layers of protection. Zero effort from you.</p>

                <div className="flex flex-wrap gap-1.5 mb-8">
                  {Object.entries(HOLIDAYS).map(([key, theme]) => (
                    <button key={key} onClick={() => setActiveHoliday(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${activeHoliday === key ? 'bg-[#0D4D4D] text-white shadow-md' : 'bg-white text-[#6B7280] hover:bg-gray-100 border border-gray-200'}`}>
                      {theme.emoji} {theme.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                    <p className="text-[#0D4D4D] font-bold text-sm mb-2">Layer 1 &mdash; Prevention</p>
                    <p className="text-[#6B7280] text-sm leading-relaxed">7+ personalized touchpoints per year: holiday cards for 5 major holidays, birthday messages, anniversary alerts, and push notifications &mdash; all completely automatic.</p>
                  </div>
                  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                    <p className="text-[#0D4D4D] font-bold text-sm mb-2">Layer 2 &mdash; Rescue</p>
                    <p className="text-[#6B7280] text-sm leading-relaxed">When a policy lapses, forward the carrier email. AI extracts the client info, auto-matches your records, and sends personalized outreach within hours. Then follows up on Day 2, 5, and 7.</p>
                  </div>
                </div>
                <p className="text-[#6B7280]/70 text-sm mt-6 italic">Your AI doesn&apos;t sleep. Or take lunch. Or forget to follow up.</p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           FEATURE: REFERRALS
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-10" />
          </div>
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
              <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="mb-12 lg:mb-0">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#fdcc02]/15 border border-[#fdcc02]/25 rounded-full mb-4">
                  <svg className="w-3.5 h-3.5 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <span className="text-white font-bold text-xs uppercase tracking-wide">Referrals</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">From one tap to booked appointment.</h2>
                <p className="text-white/60 text-lg mb-8 leading-relaxed">Your clients already trust you. Now they can share that trust &mdash; and your AI handles the rest.</p>

                <div className="space-y-5">
                  {[
                    { num: '1', title: 'Client taps "Refer"', body: 'They pick a contact \u2014 that\u2019s it. The system auto-sends a warm intro with your business card attached. No thinking, no typing, completely on rails.', color: '#fdcc02' },
                    { num: '2', title: 'AI takes over', body: 'Your AI reaches out via iMessage in a separate 1-on-1 thread. Warm, conversational, responding as you.', color: '#3DD6C3' },
                    { num: '3', title: 'Appointment booked', body: 'AI qualifies the lead, gathers their info, and books them directly on your calendar. You show up and close.', color: '#fdcc02' },
                  ].map((step) => (
                    <div key={step.num} className="flex gap-4 items-start">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-[#0D4D4D]" style={{ backgroundColor: step.color }}>{step.num}</div>
                      <div><p className="text-white font-bold text-sm">{step.title}</p><p className="text-white/50 text-sm leading-relaxed">{step.body}</p></div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 mt-8">
                  {['Day 2 \u00b7 Gentle nudge', 'Day 5 \u00b7 New angle', 'Day 8 \u00b7 Direct ask'].map((d, i) => (
                    <span key={d} className={`px-3 py-1.5 rounded-full text-xs font-medium ${i === 2 ? 'bg-[#fdcc02]/20 border border-[#fdcc02]/30 text-[#fdcc02]' : 'bg-white/10 text-white/60'}`}>{d}</span>
                  ))}
                </div>
                <p className="text-white/40 text-xs mt-3">If the referral doesn&apos;t reply, AI follows up automatically.</p>
              </motion.div>

              <motion.div ref={chatRef} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex justify-center">
                <div className="w-full max-w-[320px]">
                  <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-[#3DD6C3]/20">
                    <div className="bg-[#111] rounded-t-[1.6rem] px-5 pt-3 pb-2 flex items-center justify-between">
                      <span className="text-white/40 text-[10px] font-medium">9:44 AM</span>
                      <div className="flex gap-0.5"><div className="w-1 h-2 bg-white/40 rounded-sm" /><div className="w-1 h-2.5 bg-white/40 rounded-sm" /><div className="w-1 h-3 bg-white/40 rounded-sm" /></div>
                    </div>
                    <div className="bg-[#111] px-5 pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#005851] flex items-center justify-center"><span className="text-[#3DD6C3] text-xs font-bold">D</span></div>
                        <div><p className="text-white text-sm font-semibold">Daniel</p><p className="text-white/30 text-[10px]">AI Referral Assistant</p></div>
                      </div>
                    </div>
                    <div className="bg-[#111] px-4 py-4 space-y-2.5 rounded-b-[1.6rem] min-h-[300px]">
                      <div className="flex justify-end" style={msgFade(0)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white text-[12px] leading-relaxed">Hey Mike, Sarah connected us &mdash; I helped her family get protected and she thought I might be able to help you too. Open to a couple quick questions?</p></div></div>
                      <div className="flex justify-start" style={msgFade(1)}><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[70%]"><p className="text-white text-[12px]">yeah sure</p></div></div>
                      <div className="flex justify-end" style={msgFade(2)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white text-[12px] leading-relaxed">What matters most to you when it comes to protecting your family?</p></div></div>
                      <div className="flex justify-start" style={msgFade(3)}><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white text-[12px]">making sure my wife and kids are covered if something happens</p></div></div>
                      <div className="flex justify-end" style={msgFade(4)}><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]"><p className="text-white text-[12px] leading-relaxed">Really appreciate that. A quick 15-min call would be worth it. Here&apos;s my calendar:</p><p className="text-[#3DD6C3] text-[12px] mt-1 underline" style={msgFade(5)}>calendly.com/daniel</p></div></div>
                      <div className="flex justify-center pt-2" style={msgFade(6)}>
                        <div className="flex items-center gap-2 bg-[#3DD6C3]/15 border border-[#3DD6C3]/25 rounded-full px-4 py-1.5">
                          <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          <span className="text-[#3DD6C3] text-[10px] font-bold">Appointment Booked</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-white/30 text-xs mt-3">The referral thinks they&apos;re texting you.</p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           FEATURE: REWRITES
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-[#F8F9FA]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
              <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex justify-center mb-12 lg:mb-0 order-2 lg:order-1">
                <div className="w-full max-w-sm space-y-4">
                  <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-lg">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0"><span className="text-[#3DD6C3] text-xs font-bold">D</span></div>
                      <div><p className="text-[#0D4D4D] font-semibold text-sm">Daniel Roberts</p><p className="text-[#6B7280] text-xs">Your Agent</p></div>
                    </div>
                    <div className="bg-[#F8F9FA] rounded-xl p-4 border border-gray-100">
                      <p className="text-[#0D4D4D] text-sm leading-relaxed">&quot;Hey Sarah! Your policy anniversary is coming up and I&apos;ve been seeing some <span className="font-bold text-[#3DD6C3]">lower rates for the same coverage</span>. Want me to run the numbers? Tap below to grab a time.&quot;</p>
                    </div>
                    <div className="mt-4 text-center">
                      <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3DD6C3] text-[#0D4D4D] text-sm font-bold rounded-xl">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Book with Daniel
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[#0D4D4D] text-xs font-bold">Aug 2026</span>
                      <span className="px-2 py-0.5 bg-[#fdcc02]/15 text-[#0D4D4D] text-[9px] font-bold rounded-full">ANNIVERSARY</span>
                    </div>
                    <div className="grid grid-cols-7 gap-px text-center">
                      {['S','M','T','W','T','F','S'].map((d,i) => <span key={`h${i}`} className="text-[#6B7280]/50 text-[8px] font-medium pb-1">{d}</span>)}
                      {Array.from({length:28},(_, i) => i + 1).map(d => (
                        <div key={d} className={`py-0.5 rounded text-[9px] ${d === 15 ? 'bg-[#fdcc02] text-[#0D4D4D] font-bold' : 'text-[#6B7280]/40'}`}>{d}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="order-1 lg:order-2 mb-12 lg:mb-0">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#0D4D4D]/5 border border-[#0D4D4D]/10 rounded-full mb-4">
                  <svg className="w-3.5 h-3.5 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">Rewrites</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">Every anniversary is a booked appointment.</h2>
                <p className="text-[#6B7280] text-lg mb-8 leading-relaxed">When the one-year mark hits, your client hears from you &mdash; not the carrier. Book within 24&ndash;48 hours.</p>

                <div className="space-y-5">
                  {[
                    { icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', title: 'You get the heads-up', body: 'As the 1-year anniversary approaches, you get an email digest with every upcoming renewal.' },
                    { icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z', title: 'Client gets a notification', body: 'A push notification letting them know you may have found a lower rate. With a link to book.' },
                    { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', title: 'They book themselves', body: 'They tap, pick a time, and the rewrite conversation starts with them reaching out to you.' },
                  ].map((step) => (
                    <div key={step.title} className="flex gap-4 items-start">
                      <div className="w-10 h-10 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={step.icon} /></svg>
                      </div>
                      <div><p className="text-[#0D4D4D] font-bold text-sm">{step.title}</p><p className="text-[#6B7280] text-sm leading-relaxed">{step.body}</p></div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           HOW IT WORKS
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div className="text-center mb-14" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">Up and Running in <span className="text-[#3DD6C3]">10 Minutes</span></h2>
              <p className="text-lg text-[#6B7280]">No complex setup. No IT department. Just four steps.</p>
            </motion.div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {[
                { num: '1', title: 'Sign Up & Brand', desc: 'Add your photo, agency logo, and scheduling link. Your app is instantly branded to you.', color: '#3DD6C3' },
                { num: '2', title: 'Import Your Book', desc: 'Upload a CSV or drop in a PDF application \u2014 AI extracts clients, policies, and beneficiaries.', color: '#fdcc02' },
                { num: '3', title: 'Share with Clients', desc: 'Clients download your app with a unique code and get a personalized welcome notification.', color: '#3DD6C3' },
                { num: '4', title: 'AI Takes Over', desc: 'Touchpoints, referral follow-ups, and conservation alerts \u2014 all run on autopilot.', color: '#fdcc02' },
              ].map((step, i) => (
                <motion.div key={step.num} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }} className="relative text-center">
                  <div className="w-14 h-14 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-xl font-bold" style={{ color: step.color }}>{step.num}</span>
                  </div>
                  <h3 className="text-base md:text-lg font-bold text-[#0D4D4D] mb-2">{step.title}</h3>
                  <p className="text-[#6B7280] text-sm leading-relaxed">{step.desc}</p>
                  {i < 3 && <div className="hidden md:block absolute top-7 -right-4 w-8"><div className="h-px bg-[#3DD6C3]/30 w-full relative"><svg className="w-2 h-2 text-[#3DD6C3]/50 absolute -right-1 -top-[3px]" fill="currentColor" viewBox="0 0 6 6"><path d="M0 0l6 3-6 3z"/></svg></div></div>}
                </motion.div>
              ))}
            </div>

            <div className="flex items-center justify-center mt-12">
              <div className="inline-flex items-center gap-4 px-6 py-3 bg-[#F8F9FA] border border-gray-200 rounded-full">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#0D4D4D]" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  <span className="text-[#0D4D4D] text-sm font-semibold">iPhone</span>
                </div>
                <div className="w-px h-5 bg-gray-200" />
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#3DD6C3]" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.34c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm-11.046 0c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm11.405-6.02l1.9-3.46c.11-.2.04-.44-.15-.56-.2-.11-.44-.04-.56.15l-1.92 3.49C15.46 8.38 13.55 7.75 12 7.75s-3.46.63-5.14 1.72L4.94 5.98c-.12-.19-.36-.26-.56-.15-.19.12-.26.36-.15.56l1.9 3.46C2.64 11.96.34 15.55 0 19.8h24c-.34-4.25-2.64-7.84-6.12-9.48z"/></svg>
                  <span className="text-[#0D4D4D] text-sm font-semibold">Android</span>
                </div>
              </div>
            </div>

            <motion.div className="text-center mt-10" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
              <Link href="/founding-member" className="inline-flex items-center gap-2 px-8 py-4 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg font-bold rounded-full transition-all shadow-lg shadow-[#fdcc02]/20 hover:shadow-[#fdcc02]/40 hover:scale-[1.03]">
                Get Started Free
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           THE MATH
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-red-500 rounded-full blur-[150px] opacity-10" />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[#3DD6C3] rounded-full blur-[150px] opacity-10" />
          </div>
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div className="text-center mb-14" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">The Math Is <span className="text-[#3DD6C3]">Undeniable</span></h2>
              <p className="text-lg text-white/60">One saved policy. One referral. That&apos;s all it takes.</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 items-center mb-12">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="bg-red-500/10 border border-red-500/20 rounded-3xl p-8 text-center backdrop-blur-sm">
                <p className="text-red-400 font-semibold text-sm uppercase tracking-wide mb-3">1 Canceled Policy</p>
                <p className="text-5xl md:text-6xl font-black text-red-400 mb-2">$1,200</p>
                <p className="text-red-400/60 text-sm">Average annual value lost</p>
              </motion.div>
              <div className="flex items-center justify-center"><div className="text-3xl font-black text-white/30">vs</div></div>
              <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }} className="bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-3xl p-8 text-center backdrop-blur-sm">
                <p className="text-[#3DD6C3] font-semibold text-sm uppercase tracking-wide mb-3">Agent For Life</p>
                <p className="text-5xl md:text-6xl font-black text-white mb-2"><span className="line-through text-white/20 text-4xl">$588</span> <span className="text-[#fdcc02]">$0</span></p>
                <p className="text-[#3DD6C3]/60 text-sm">Free as a Founding Member</p>
              </motion.div>
            </div>

            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-8 md:p-10 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-5">
                <svg className="w-4 h-4 text-[#0D4D4D]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Instant ROI</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-extrabold text-white mb-3">As a Founding Member, every dollar is <span className="text-[#fdcc02]">pure profit</span>.</h3>
              <p className="text-white/60 max-w-xl mx-auto">At $49/mo, one save pays for the entire year. At $0/mo? It&apos;s all upside &mdash; forever.</p>
            </motion.div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           PRICING
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div className="text-center mb-12" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] mb-5">This Will Cost <span className="line-through text-[#6B7280]/50">$49/mo</span>.<br /><span className="text-[#3DD6C3]">But Not for You.</span></h2>
              <p className="text-base md:text-lg text-[#6B7280] max-w-2xl mx-auto">We&apos;re launching in tiers &mdash; <span className="font-semibold">150 early spots</span>, then they&apos;re gone forever. The earlier you join, the less you&apos;ll ever pay.</p>
            </motion.div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-10">
              <div className="relative bg-white rounded-2xl border-2 border-[#a158ff] p-4 md:p-6 text-center shadow-lg shadow-[#a158ff]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-3 py-1 bg-[#a158ff] text-white text-xs font-bold rounded-full whitespace-nowrap">NOW OPEN</span></div>
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Founding Members</p>
                <p className="text-3xl md:text-4xl font-black text-[#0D4D4D] mb-1">FREE</p>
                <p className="text-sm text-[#a158ff] font-semibold mb-1">For Life</p>
                <p className="text-xs text-[#6B7280] line-through mb-1">$49/mo</p>
                <p className="text-xs text-[#6B7280] mb-2">50 spots &mdash; then gone forever</p>
                {spotsRemaining !== null && <p className="text-xs text-[#a158ff] font-bold mb-3">{spotsRemaining > 0 ? `${spotsRemaining} spots left` : 'FULL'}</p>}
                {spotsRemaining === null || spotsRemaining > 0
                  ? <Link href="/founding-member" className="block w-full py-3 bg-[#a158ff] hover:bg-[#8a3ee8] text-white text-sm font-bold rounded-xl transition-colors">Apply Now</Link>
                  : <div className="w-full py-3 bg-gray-200 text-[#6B7280] text-sm font-bold rounded-xl">Filled</div>}
              </div>
              <div className="relative bg-white rounded-2xl border-2 border-[#3DD6C3] p-4 md:p-6 text-center shadow-lg shadow-[#3DD6C3]/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-3 py-1 bg-[#3DD6C3] text-[#0D4D4D] text-xs font-bold rounded-full whitespace-nowrap">UP NEXT</span></div>
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Charter Members</p>
                <div className="flex items-baseline justify-center gap-1 mb-1"><span className="text-3xl md:text-4xl font-black text-[#0D4D4D]">$25</span><span className="text-sm text-[#6B7280]">/mo</span></div>
                <p className="text-sm text-[#3DD6C3] font-semibold mb-1">Locked for life</p>
                <p className="text-xs text-[#6B7280] line-through mb-1">$49/mo</p>
                <p className="text-xs text-[#6B7280] mb-4"><span className="hidden md:inline">50 spots &middot; $250/yr</span><span className="md:hidden">50 spots</span></p>
                <div className="w-full py-2.5 md:py-3 bg-[#0D4D4D]/10 text-[#0D4D4D] text-xs md:text-sm font-bold rounded-xl">Opens After Free Tier</div>
              </div>
              <div className="relative bg-white rounded-2xl border border-gray-200 p-4 md:p-6 text-center">
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Inner Circle</p>
                <div className="flex items-baseline justify-center gap-1 mb-1"><span className="text-3xl md:text-4xl font-black text-[#0D4D4D]">$35</span><span className="text-sm text-[#6B7280]">/mo</span></div>
                <p className="text-sm text-[#6B7280] font-semibold mb-1">Locked for life</p>
                <p className="text-xs text-[#6B7280] line-through mb-1">$49/mo</p>
                <p className="text-xs text-[#6B7280] mb-4"><span className="hidden md:inline">50 spots &middot; $350/yr</span><span className="md:hidden">50 spots</span></p>
                <div className="w-full py-2.5 md:py-3 bg-gray-100 text-[#6B7280] text-xs md:text-sm font-medium rounded-xl">Opens After $25 Tier</div>
              </div>
              <div className="relative bg-[#F8F9FA] rounded-2xl border border-gray-200 p-4 md:p-6 text-center">
                <p className="text-sm text-[#6B7280] font-medium mt-2 mb-1">Standard Price</p>
                <div className="flex items-baseline justify-center gap-1 mb-1"><span className="text-3xl md:text-4xl font-black text-[#0D4D4D]">$49</span><span className="text-sm text-[#6B7280]">/mo</span></div>
                <p className="text-sm text-[#6B7280] font-semibold mb-1">Regular pricing</p>
                <p className="text-xs text-[#6B7280] mb-1">&nbsp;</p>
                <p className="text-xs text-[#6B7280] mb-4"><span className="hidden md:inline">Unlimited &middot; $490/yr</span><span className="md:hidden">$490/yr</span></p>
                <div className="w-full py-2.5 md:py-3 bg-gray-100 text-[#6B7280] text-xs md:text-sm font-medium rounded-xl">After All Tiers Fill</div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[#6B7280] mb-6 max-w-2xl mx-auto"><span className="text-[#0D4D4D] font-bold">Right now:</span> We&apos;re filling the first 50 Founding Member spots &mdash; <span className="text-[#a158ff] font-bold">free for life</span>. Once they&apos;re gone, the price goes to $25, then $35, then $49.</p>
              <Link href="/founding-member" className="inline-flex items-center gap-3 px-8 py-4 md:px-12 md:py-5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-lg md:text-xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/30 hover:shadow-[#fdcc02]/50 hover:scale-[1.03]">
                Apply for Founding Member
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
              <p className="text-[#6B7280] text-sm mt-4">No contracts &middot; Lock in your price for life &middot; Cancel anytime</p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           TRUST
           ═══════════════════════════════════════════════════ */}
        <section className="py-14 md:py-20 bg-[#F8F9FA]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div className="text-center mb-10" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
              <h2 className="text-2xl md:text-3xl font-extrabold text-[#0D4D4D] mb-2">Built for <span className="text-[#3DD6C3]">Trust</span></h2>
              <p className="text-[#6B7280]">Your book of business is your livelihood. We treat it that way.</p>
            </motion.div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">
              {[
                { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', title: 'Your Data, Your Book', desc: 'We never contact your clients independently. You own your relationships.' },
                { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', title: 'Encrypted at Rest & In Transit', desc: 'Google Cloud infrastructure with AES-256 encryption and TLS for all connections.' },
                { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Client Opt-In', desc: 'Clients join by entering your code. All outreach goes through your branded app.' },
                { icon: 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z', title: 'No Lock-In', desc: 'Month-to-month. Cancel anytime through your account.' },
                { icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', title: 'Carrier Agnostic', desc: 'Works with every insurance carrier. Built for independent agents.' },
              ].map((t) => (
                <div key={t.title} className={`text-center p-3 md:p-4 ${t.title === 'Carrier Agnostic' ? 'col-span-2 md:col-span-1' : ''}`}>
                  <div className="w-11 h-11 bg-[#0D4D4D]/5 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} /></svg>
                  </div>
                  <p className="text-sm font-bold text-[#0D4D4D] mb-1">{t.title}</p>
                  <p className="text-xs text-[#6B7280] leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
           FAQ
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div className="text-center mb-12" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D]">Frequently Asked <span className="text-[#3DD6C3]">Questions</span></h2>
            </motion.div>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="bg-[#F8F9FA] border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full px-6 py-5 text-left flex items-center justify-between gap-4" aria-expanded={openFaq === i}>
                    <span className="text-base md:text-lg font-semibold text-[#0D4D4D]">{item.question}</span>
                    <svg className={`w-5 h-5 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-[500px]' : 'max-h-0'}`}><div className="px-6 pb-5"><p className="text-[#6B7280] leading-relaxed">{item.answer}</p></div></div>
                </div>
              ))}
            </div>
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ_ITEMS.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) }) }} />
        </section>

        {/* ═══════════════════════════════════════════════════
           FINAL CTA
           ═══════════════════════════════════════════════════ */}
        <section className="py-20 md:py-28 bg-[#0D4D4D] relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-80 h-80 bg-[#3DD6C3] rounded-full blur-[150px] opacity-15" />
            <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-[#fdcc02] rounded-full blur-[150px] opacity-10" />
          </div>
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <p className="text-white/40 text-sm uppercase tracking-widest font-medium mb-6">Stop leaving money on the table</p>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6">Your competitors aren&apos;t reading this page.<br /><span className="text-[#fdcc02]">They&apos;re losing clients.</span></h2>
              <p className="text-lg text-white/60 mb-10 max-w-xl mx-auto">Lock in your free lifetime spot before they&apos;re gone. No credit card. No risk. Just a system that pays for itself from day one.</p>
              <Link href="/founding-member" className="inline-flex items-center gap-3 px-10 py-5 bg-[#fdcc02] hover:bg-[#e5b802] text-[#0D4D4D] text-xl font-bold rounded-full transition-all shadow-2xl shadow-[#fdcc02]/30 hover:shadow-[#fdcc02]/50 hover:scale-[1.03]">
                Lock In My Free Lifetime Spot
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
              <p className="text-white/30 mt-5 text-sm">{spotsRemaining !== null ? `${spotsRemaining} of 50 spots remaining` : 'Limited spots available'} &middot; $0 forever</p>
            </motion.div>
          </div>
        </section>
      </main>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="bg-[#0D4D4D] border-t border-white/5 py-10 pb-24 lg:pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2"><img src="/logo.png" alt="AgentForLife Logo" className="w-12 h-7 object-contain" /><span className="text-xl text-white brand-title">AgentForLife</span></div>
            <nav className="flex flex-wrap justify-center gap-6">
              <Link href="/login" className="text-white/60 hover:text-white transition-colors text-sm">Login</Link>
              <a href="mailto:support@agentforlife.app" className="text-white/60 hover:text-white transition-colors text-sm">Contact</a>
              <Link href="/privacy" className="text-white/60 hover:text-white transition-colors text-sm">Privacy</Link>
              <Link href="/terms" className="text-white/60 hover:text-white transition-colors text-sm">Terms</Link>
            </nav>
            <p className="text-white/40 text-sm">&copy; 2026 AgentForLife</p>
          </div>
        </div>
      </footer>

      {/* ══════════ MOBILE STICKY CTA ══════════ */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden transition-all duration-300 ${showBottomCta ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-[#0D4D4D]/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 flex-shrink-0"><span className="animate-ping absolute h-full w-full rounded-full bg-[#3DD6C3] opacity-75" /><span className="relative rounded-full h-2 w-2 bg-[#3DD6C3]" /></span>
            <span className="text-white text-sm font-semibold truncate">{spotsRemaining !== null ? <><span className="text-[#fdcc02]">{spotsRemaining}</span> free spots left</> : 'Free spots available'}</span>
          </div>
          <Link href="/founding-member" className="flex-shrink-0 px-5 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full whitespace-nowrap">Claim Free Spot</Link>
        </div>
      </div>
    </div>
  );
}
