'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { fireConfetti } from '@/lib/confetti';


const FAQ_ITEMS = [
  { question: 'Is this a finished product?', answer: "Not yet — that's where you come in. AgentForLife is in beta, which means the foundation is built but I'm actively improving it based on feedback from agents like you. Lifetime free access in exchange for helping me shape the product." },
  { question: 'What happens after 60 days?', answer: "If you've been active and giving feedback, you keep lifetime free access. Period. No bait-and-switch." },
  { question: 'Do I need a credit card?', answer: "No. Just create your account and you're in — no credit card, no checkout page." },
  { question: 'What if I want to cancel?', answer: 'Cancel anytime. No questions asked. But you\'d lose your founding member status permanently.' },
  { question: 'Can I join later?', answer: "No. Once I fill all 50 spots, this program closes permanently. There won't be another round." },
  { question: 'What kind of feedback?', answer: "Real feedback. What's broken, what's confusing, what's missing, what would make you open this app every morning. I need the truth, not compliments." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

export default function FoundingMemberMobile() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeCard, setActiveCard] = useState(0);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [clientCount, setClientCount] = useState('');
  const [policiesLast12Months, setPoliciesLast12Months] = useState('');
  const [isCurrentlyBuilding, setIsCurrentlyBuilding] = useState('');
  const [downlineAgentCount, setDownlineAgentCount] = useState('');
  const [biggestDifference, setBiggestDifference] = useState('');

  const formRef = useRef<HTMLElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); })
      .catch(() => {});
  }, []);

  const spots = spotsRemaining ?? 50;
  const filled = 50 - spots;

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCarouselScroll = () => {
    if (!carouselRef.current) return;
    const el = carouselRef.current;
    const firstChild = el.firstElementChild as HTMLElement | null;
    if (!firstChild) return;
    const cardWidth = firstChild.offsetWidth + 16;
    const index = Math.round(el.scrollLeft / cardWidth);
    setActiveCard(Math.max(0, Math.min(index, 3)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/founding-member/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          clientCount,
          policiesLast12Months,
          isCurrentlyBuilding,
          downlineAgentCount: isCurrentlyBuilding === 'yes' ? downlineAgentCount : '',
          biggestDifference,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit application');
      }

      setSubmitted(true);
      fireConfetti();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      });
    } catch (err) {
      console.error('Error submitting application:', err);
      setError('Something went wrong. Please try again or email support@agentforlife.app directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D4D4D] overflow-x-hidden">

      {/* ═══════════════════════════════════════════════════
         HERO — The Offer
         ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-[100svh] flex flex-col px-6 pt-14 pb-8 overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none will-change-transform">
          <div className="absolute -top-20 -left-20 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[160px] opacity-20" />
          <div className="absolute bottom-20 -right-20 w-[250px] h-[250px] bg-[#a158ff] rounded-full blur-[140px] opacity-[0.12]" />
        </div>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none will-change-transform" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="relative z-10 flex flex-col flex-1">
          {/* Logo + Back */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between mb-auto"
          >
            <Link href="/m" className="flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife" className="w-[44px] h-[25px] object-contain" />
              <span className="text-white/80 brand-title text-base">AgentForLife</span>
            </Link>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#3DD6C3]/15 border border-[#3DD6C3]/25 rounded-full">
              <span className="text-[#3DD6C3] text-[11px] font-bold uppercase tracking-wide">Beta</span>
            </div>
          </motion.div>

          {/* Main hero content */}
          <div className="flex-1 flex flex-col justify-center -mt-6">
            {/* Spots badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="mb-5"
            >
              <div className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-[#a158ff] opacity-75" />
                  <span className="relative rounded-full h-2.5 w-2.5 bg-[#a158ff]" />
                </span>
                <span className="text-white font-bold text-sm">
                  <span className="text-[#a158ff]">{spots}</span> of 50 spots remaining
                </span>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="text-[2rem] leading-[1.1] font-extrabold text-white mb-4 tracking-tight"
            >
              Become a{' '}
              <span className="text-[#a158ff]">Founding Member</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-white/50 text-[15px] leading-relaxed mb-6 max-w-[320px]"
            >
              I&apos;m hand-picking 50 agents to help me shape Agent for Life. You get lifetime free access. I get the honest feedback I need.
            </motion.p>

            {/* Price callout */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-2xl p-5 mb-6"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-white/40 text-[11px] uppercase tracking-wide mb-0.5">Founding Member Price</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white">FREE</span>
                    <span className="text-white/30 text-sm line-through">$49/mo</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[#a158ff] font-bold text-sm">For Life</p>
                  <p className="text-white/30 text-[11px]">No credit card</p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden mb-1.5">
                <div className="h-full bg-[#a158ff] rounded-full transition-all duration-1000" style={{ width: `${(filled / 50) * 100}%` }} />
              </div>
              <p className="text-white/30 text-[11px]">{filled} agent{filled !== 1 ? 's' : ''} already locked in</p>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              {submitted ? (
                <div className="w-full flex items-center justify-center gap-2.5 py-4 bg-[#3DD6C3]/20 border border-[#3DD6C3]/30 text-[#3DD6C3] text-base font-bold rounded-2xl">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  Application Submitted
                </div>
              ) : (
                <button
                  onClick={scrollToForm}
                  className="w-full flex items-center justify-center gap-2.5 py-4 bg-[#a158ff] text-white text-base font-bold rounded-2xl shadow-lg shadow-[#a158ff]/25 active:scale-[0.97] transition-transform"
                >
                  Apply Now
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                </button>
              )}
            </motion.div>
          </div>

          {/* Scroll hint */}
          <motion.div
            className="relative z-10 flex justify-center mt-4"
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg className="w-5 h-5 text-white/15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" /></svg>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         WHAT YOU GET — Swipe Cards
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-white py-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
          style={{ willChange: 'transform, opacity' }}
        >
          <motion.div variants={fadeUp} custom={0} className="px-6 mb-6">
            <h2 className="text-[1.65rem] font-extrabold text-[#0D4D4D] leading-tight mb-1">
              What you get.
            </h2>
            <p className="text-[#6B7280] text-[14px]">Everything included. No upsells. No tiers.</p>
          </motion.div>

          <motion.div variants={fadeUp} custom={0.05}>
            <div
              ref={carouselRef}
              onScroll={handleCarouselScroll}
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-pl-6 pl-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
              {[
                { icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z', title: 'Branded client app', desc: 'iOS & Android, your name and logo — a fully branded app your clients download and use.', accent: '#3DD6C3' },
                { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', title: 'AI referral assistant', desc: 'Qualifies leads via iMessage, books appointments — referrals on autopilot.', accent: '#fdcc02' },
                { icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', title: 'Direct line to the founder', desc: 'Me. Daniel. For anything you need — feature requests, bugs, ideas.', accent: '#3DD6C3' },
                { icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z', title: 'Founding Member status', desc: 'Permanent badge + first access to every premium feature we ship.', accent: '#a158ff' },
              ].map((item, i) => (
                <div
                  key={item.title}
                  className={`w-[75vw] flex-shrink-0 snap-start bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100${i === 3 ? ' mr-6' : ''}`}
                >
                  <div className="w-12 h-12 bg-[#0D4D4D] rounded-xl flex items-center justify-center mb-3">
                    <svg className="w-6 h-6" style={{ color: item.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                  </div>
                  <p className="text-[#0D4D4D] font-bold text-[16px] mb-1">{item.title}</p>
                  <p className="text-[#6B7280] text-[14px] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-center gap-2 mt-5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    activeCard === i ? 'w-6 bg-[#0D4D4D]' : 'w-2 bg-[#0D4D4D]/20'
                  }`}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* "What I'm Asking From You" section removed from here — now shown post-application */}

      {/* ═══════════════════════════════════════════════════
         THE BETA CONTEXT
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-white px-6 py-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={{ willChange: 'transform, opacity' }}
          className="border-l-[3px] border-[#3DD6C3] bg-[#F8F9FA] rounded-r-xl px-5 py-5"
        >
          <h3 className="text-lg font-extrabold text-[#0D4D4D] mb-2">
            This is a beta — your voice actually matters.
          </h3>
          <p className="text-[#2D3748] text-[14px] leading-relaxed">
            The core is here. But I&apos;m still refining every part based on real agent feedback. As a founding member, you tell me what&apos;s working and what&apos;s not — and I build it. The mission: make your job easier and your bank account bigger.
          </p>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════
         APPLICATION FORM
         ═══════════════════════════════════════════════════ */}
      <section ref={formRef} className="relative bg-[#0D4D4D] px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none will-change-transform">
          <div className="absolute top-0 right-0 w-[250px] h-[250px] bg-[#a158ff] rounded-full blur-[150px] opacity-[0.1]" />
          <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-[#3DD6C3] rounded-full blur-[120px] opacity-[0.08]" />
        </div>

        <div className="relative">
          {!submitted ? (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              style={{ willChange: 'transform, opacity' }}
            >
              <motion.div variants={fadeUp} custom={0} className="mb-8">
                <h2 className="text-[1.65rem] font-extrabold text-white leading-tight mb-2">
                  Apply now.
                </h2>
                <p className="text-white/40 text-[14px]">Takes 30 seconds. I personally review every one.</p>
              </motion.div>

              <motion.form variants={fadeUp} custom={0.1} onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label htmlFor="m-name" className="block text-white font-semibold mb-2 text-[14px]">
                    Full Name <span className="text-[#3DD6C3]">*</span>
                  </label>
                  <input
                    type="text"
                    id="m-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:border-[#3DD6C3] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/30 transition-all text-[15px]"
                    placeholder="Your full name"
                    autoComplete="name"
                  />
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="m-email" className="block text-white font-semibold mb-2 text-[14px]">
                    Email <span className="text-[#3DD6C3]">*</span>
                  </label>
                  <input
                    type="email"
                    id="m-email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:border-[#3DD6C3] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/30 transition-all text-[15px]"
                    placeholder="you@example.com"
                    autoComplete="email"
                    inputMode="email"
                  />
                </div>

                {/* Client Count */}
                <div>
                  <label htmlFor="m-clients" className="block text-white font-semibold mb-2 text-[14px]">
                    Active clients right now? <span className="text-[#3DD6C3]">*</span>
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {['1-10', '11-25', '26-50', '51-100', '100+'].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setClientCount(val)}
                        className={`py-3 rounded-xl text-[13px] font-semibold transition-all border ${
                          clientCount === val
                            ? 'bg-[#3DD6C3]/20 border-[#3DD6C3] text-white'
                            : 'bg-white/5 border-white/15 text-white/50 active:bg-white/10'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <input type="text" required value={clientCount} onChange={() => {}} className="sr-only" tabIndex={-1} aria-hidden="true" />
                </div>

                {/* Policies Last 12 Months */}
                <div>
                  <label htmlFor="m-policies" className="block text-white font-semibold mb-2 text-[14px]">
                    Policies written (last 12 months)? <span className="text-[#3DD6C3]">*</span>
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {['0', '1-5', '6-15', '16-30', '31-50', '51-100', '100+'].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPoliciesLast12Months(val)}
                        className={`py-3 rounded-xl text-[12px] sm:text-[13px] font-semibold transition-all border ${
                          policiesLast12Months === val
                            ? 'bg-[#3DD6C3]/20 border-[#3DD6C3] text-white'
                            : 'bg-white/5 border-white/15 text-white/50 active:bg-white/10'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <input type="text" required value={policiesLast12Months} onChange={() => {}} className="sr-only" tabIndex={-1} aria-hidden="true" />
                </div>

                {/* Are you currently building? */}
                <div>
                  <p className="block text-white font-semibold mb-2.5 text-[14px]">
                    Currently building? <span className="text-[#3DD6C3]">*</span>
                  </p>
                  <div className="flex gap-2">
                    {(['yes', 'no'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setIsCurrentlyBuilding(option);
                          if (option === 'no') setDownlineAgentCount('');
                        }}
                        className={`flex-1 py-3.5 rounded-xl text-center text-[14px] font-medium transition-all border ${
                          isCurrentlyBuilding === option
                            ? 'bg-[#3DD6C3]/15 border-[#3DD6C3] text-white'
                            : 'bg-white/5 border-white/15 text-white/60 active:bg-white/10'
                        }`}
                      >
                        {option === 'yes' ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                  <input type="text" required value={isCurrentlyBuilding} onChange={() => {}} className="sr-only" tabIndex={-1} aria-hidden="true" />
                </div>

                {/* Downline - shown when building */}
                {isCurrentlyBuilding === 'yes' && (
                  <div>
                    <label htmlFor="m-downline" className="block text-white font-semibold mb-2 text-[14px]">
                      Agents in your downline? <span className="text-[#3DD6C3]">*</span>
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {['1-5', '6-15', '16-30', '31-50', '51-100', '100+'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setDownlineAgentCount(val)}
                          className={`py-3 rounded-xl text-[12px] sm:text-[13px] font-semibold transition-all border ${
                            downlineAgentCount === val
                              ? 'bg-[#3DD6C3]/20 border-[#3DD6C3] text-white'
                              : 'bg-white/5 border-white/15 text-white/50 active:bg-white/10'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                    <input type="text" required value={downlineAgentCount} onChange={() => {}} className="sr-only" tabIndex={-1} aria-hidden="true" />
                  </div>
                )}

                {/* Biggest Difference */}
                <div>
                  <p className="block text-white font-semibold mb-2.5 text-[14px]">
                    Biggest need right now? <span className="text-[#3DD6C3]">*</span>
                  </p>
                  <div className="space-y-2">
                    {[
                      'Stop losing clients I already closed',
                      'Get more referrals from existing clients',
                      'Stay top-of-mind so clients call me first',
                      'All of the above',
                    ].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setBiggestDifference(option)}
                        className={`w-full px-4 py-3.5 rounded-xl text-left text-[14px] font-medium transition-all border ${
                          biggestDifference === option
                            ? 'bg-[#3DD6C3]/15 border-[#3DD6C3] text-white'
                            : 'bg-white/5 border-white/15 text-white/60 active:bg-white/10'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            biggestDifference === option ? 'border-[#3DD6C3] bg-[#3DD6C3]' : 'border-white/30'
                          }`}>
                            {biggestDifference === option && (
                              <svg className="w-3 h-3 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            )}
                          </span>
                          {option}
                        </span>
                      </button>
                    ))}
                  </div>
                  <input type="text" required value={biggestDifference} onChange={() => {}} className="sr-only" tabIndex={-1} aria-hidden="true" />
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-500/15 border border-red-500/25 rounded-xl px-4 py-3 text-red-300 text-[14px]">
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-[#a158ff] text-white text-base font-bold rounded-2xl shadow-lg shadow-[#a158ff]/25 active:scale-[0.97] transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' : 'Apply Now'}
                </button>

                <p className="text-white/30 text-[12px] text-center">
                  I personally review every application. You&apos;ll hear from me within 24 hours.
                </p>
              </motion.form>
            </motion.div>
          ) : (
            /* ═══ Confirmation only — What I'm Asking From You stays in email ═══ */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="py-8"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-[#3DD6C3] rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-2xl font-extrabold text-white mb-4">
                  You&apos;re in the running.
                </h2>
                <p className="text-white/60 text-[15px] mb-6 leading-relaxed max-w-[280px] mx-auto">
                  I&apos;ll personally review your application and get back to you within 24 hours. Keep an eye on your inbox.
                </p>
                <p className="text-[#3DD6C3] font-semibold">— Daniel Roberts</p>
              </div>
            </motion.div>
          )}
        </div>
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
          <h2 className="text-xl font-extrabold text-[#0D4D4D] mb-5">
            Questions<span className="text-[#3DD6C3]">?</span>
          </h2>

          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3"
                aria-expanded={openFaq === i}
              >
                <span className="text-[14px] font-semibold text-[#0D4D4D] leading-snug">{item.question}</span>
                <svg className={`w-4 h-4 text-[#3DD6C3] flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-[400px]' : 'max-h-0'}`}>
                <div className="px-4 pb-3.5">
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
      <section className="relative bg-[#0D4D4D] px-6 py-16 pb-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none will-change-transform">
          <div className="absolute top-0 left-1/4 w-[200px] h-[200px] bg-[#a158ff] rounded-full blur-[100px] opacity-15" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={{ willChange: 'transform, opacity' }}
          className="relative text-center space-y-5"
        >
          {submitted ? (
            <>
              <div className="w-14 h-14 bg-[#3DD6C3]/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-[1.5rem] font-extrabold text-white leading-tight">
                You&apos;re all set.
              </h2>
              <p className="text-white/40 text-[14px] leading-relaxed max-w-[280px] mx-auto">
                Your application is in. I&apos;ll review it personally and get back to you within 24 hours.
              </p>
              <div className="w-full flex items-center justify-center gap-2.5 py-4 bg-[#3DD6C3]/20 border border-[#3DD6C3]/30 text-[#3DD6C3] text-base font-bold rounded-2xl">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Application Submitted
              </div>
            </>
          ) : (
            <>
              <h2 className="text-[1.5rem] font-extrabold text-white leading-tight">
                50 spots. Then this{' '}
                <span className="text-[#a158ff]">closes permanently</span>.
              </h2>
              <p className="text-white/40 text-[14px] leading-relaxed max-w-[280px] mx-auto">
                No second round. No waitlist. Lock in your free lifetime spot now.
              </p>
              <button
                onClick={scrollToForm}
                className="w-full flex items-center justify-center gap-2.5 py-4 bg-[#a158ff] text-white text-base font-bold rounded-2xl shadow-lg shadow-[#a158ff]/25 active:scale-[0.97] transition-transform"
              >
                Apply Now
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              </button>
              <p className="text-white/25 text-[11px]">
                {spots} of 50 remaining · $0 forever · No credit card
              </p>
            </>
          )}
        </motion.div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="bg-[#0D4D4D] border-t border-white/5 px-6 py-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="AgentForLife" className="w-10 h-6 object-contain" />
            <span className="text-lg text-white brand-title">AgentForLife</span>
          </div>
          <p className="text-white/40 text-[12px]">
            Questions? <a href="mailto:support@agentforlife.app" className="text-[#3DD6C3] underline">support@agentforlife.app</a>
          </p>
          <nav className="flex flex-wrap justify-center gap-5">
            <Link href="/m" className="text-white/30 text-[12px]">Home</Link>
            <Link href="/privacy" className="text-white/30 text-[12px]">Privacy</Link>
            <Link href="/terms" className="text-white/30 text-[12px]">Terms</Link>
          </nav>
          <p className="text-white/20 text-[11px]">&copy; 2026 AgentForLife</p>
        </div>
      </footer>

      {/* ══════════ STICKY BOTTOM CTA ══════════ */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 will-change-transform transition-transform duration-300 ${submitted ? 'translate-y-full' : ''}`}>
        <div className="bg-[#0D4D4D]/95 backdrop-blur-md border-t border-white/10 px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] will-change-transform">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute h-full w-full rounded-full bg-[#a158ff] opacity-75" />
              <span className="relative rounded-full h-2 w-2 bg-[#a158ff]" />
            </span>
            <span className="text-white text-[13px] font-semibold truncate">
              <span className="text-[#a158ff]">{spots}</span> free spots left
            </span>
          </div>
          <button
            onClick={scrollToForm}
            className="flex-shrink-0 px-5 py-2.5 bg-[#a158ff] text-white text-[13px] font-bold rounded-full active:scale-[0.97] transition-transform"
          >
            Apply Now
          </button>
        </div>
      </div>
    </div>
  );
}
