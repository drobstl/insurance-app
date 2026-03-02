'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { fireConfetti } from '@/lib/confetti';


const FAQ_ITEMS = [
  { question: 'Is this a finished product?', answer: "Not yet — that's where you come in. AgentForLife is in beta, which means the foundation is built but I'm actively improving and refining it based on feedback from agents like you. As a founding member, you get lifetime free access in exchange for helping me shape the product. The end goal is a tool that makes your job easier and helps you make more money — and your feedback is how we get there." },
  { question: 'What happens after 60 days?', answer: "If you've been active and giving feedback, you keep lifetime free access. Period. No bait-and-switch." },
  { question: 'Do I need a credit card?', answer: "No. Just create your account and you're in — no credit card, no checkout page. You'll be automatically activated as a founding member." },
  { question: 'What if I want to cancel?', answer: 'Cancel anytime. No questions asked. But you\'d lose your founding member status permanently.' },
  { question: 'Can I join later?', answer: "No. Once I fill all 50 spots, this program closes permanently. There won't be another round." },
  { question: 'What kind of feedback do you want?', answer: "Real feedback. What's broken, what's confusing, what's missing, what would make you open this app every morning. I need the truth, not compliments." },
];

const BENEFITS = [
  { icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Lifetime free access to AgentForLife', desc: '$49/month value — yours at $0 forever', accent: '#3DD6C3' },
  { icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z', title: 'Your own branded client app', desc: 'iOS & Android — your name, your logo', accent: '#3DD6C3' },
  { icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', title: 'Direct line to the founder (me)', desc: 'Me. Daniel. For anything you need.', accent: '#3DD6C3' },
  { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', title: 'Your feedback shapes the roadmap', desc: 'Tell me what to build — I actually listen', accent: '#fdcc02' },
  { icon: 'M13 10V3L4 14h7v7l9-11h-7z', title: 'Early access to every new feature', desc: 'Before anyone else, always', accent: '#fdcc02' },
  { icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z', title: '"Founding Member" status', desc: 'Permanent badge + first access to every premium feature', accent: '#a158ff' },
];

const DIFFERENCE_OPTIONS = [
  'Stop losing clients I already closed',
  'Get more referrals from my existing clients',
  'Stay top-of-mind so clients call me first',
  'All of the above',
] as const;

const CLIENT_COUNT_OPTIONS = ['1-10', '11-25', '26-50', '51-100', '100+'] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.07 } },
};

const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.02, y: -4, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

export default function FoundingMemberDesktop() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [clientCount, setClientCount] = useState('');
  const [biggestDifference, setBiggestDifference] = useState('');

  const formRef = useRef<HTMLElement>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/founding-member/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, clientCount, biggestDifference }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit application');
      }

      setSubmitted(true);

      fireConfetti();
    } catch (err) {
      console.error('Error submitting application:', err);
      setError('Something went wrong. Please try again or email support@agentforlife.app directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070E1B] text-white overflow-x-hidden">

      {/* ═══════════════════════════════════════════════════
         FIXED NAVIGATION
         ═══════════════════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#070E1B]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-5xl mx-auto px-8 h-[72px] flex items-center justify-between">
          <Link href="/d" className="flex items-center gap-2.5 group">
            <img src="/logo.png" alt="AgentForLife" className="w-[44px] h-[25px] object-contain" />
            <span className="text-white/90 brand-title text-lg group-hover:text-white transition-colors">AgentForLife</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/d" className="text-white/50 text-sm font-medium hover:text-white/80 transition-colors">
              Back to AgentForLife.app
            </Link>
            {submitted ? (
              <div className="flex items-center gap-2 px-6 py-2.5 bg-[#3DD6C3]/20 border border-[#3DD6C3]/30 text-[#3DD6C3] text-sm font-bold rounded-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Applied
              </div>
            ) : (
              <button
                onClick={scrollToForm}
                className="px-6 py-2.5 bg-[#a158ff] text-white text-sm font-bold rounded-full animate-[buttonGlowPurple_2s_ease-in-out_infinite] hover:bg-[#9248ed] active:bg-[#8a3ee8] transition-colors"
              >
                Apply Now
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════
         HERO
         ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center justify-center pt-[72px] overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 left-1/4 w-[500px] h-[500px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.12]" />
          <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-[#a158ff] rounded-full blur-[180px] opacity-[0.1]" />
        </div>
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3DD6C3 1px, transparent 1px), linear-gradient(90deg, #3DD6C3 1px, transparent 1px)', backgroundSize: '64px 64px' }} />

        <div className="relative z-10 max-w-4xl mx-auto px-8 text-center py-20 md:py-28">
          {/* Badges row */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex items-center justify-center gap-3 mb-8"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-[#3DD6C3]/10 border border-[#3DD6C3]/25 rounded-full">
              <span className="text-[#3DD6C3] text-xs font-bold uppercase tracking-wider">Beta</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-[#a158ff]/10 border border-[#a158ff]/25 rounded-full">
              <svg className="w-3.5 h-3.5 text-[#a158ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <span className="text-[#a158ff] text-xs font-bold uppercase tracking-wider">By Invitation Only</span>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.08] mb-6"
          >
            Become a{' '}
            <span className="text-[#a158ff]">Founding Member</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="text-white/50 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10"
          >
            I&apos;m hand-picking 50 agents to help me shape Agent for Life.
            You get lifetime free access. I get the honest feedback I need.
          </motion.p>

          {/* Spots remaining */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="inline-flex flex-col items-center gap-3 bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl px-8 py-5 mb-10"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute h-full w-full rounded-full bg-[#a158ff] opacity-75" />
                <span className="relative rounded-full h-3 w-3 bg-[#a158ff]" />
              </span>
              <span className="text-white font-bold text-lg">
                <span className="text-[#a158ff]">{spots}</span> of 50 spots remaining
              </span>
            </div>
            <div className="w-64 bg-white/10 rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#a158ff] to-[#c084fc] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(filled / 50) * 100}%` }}
                transition={{ duration: 1.2, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const }}
              />
            </div>
            <p className="text-white/30 text-sm">{filled} agent{filled !== 1 ? 's' : ''} already locked in</p>
          </motion.div>

          {/* Value snapshot badges */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="flex flex-wrap items-center justify-center gap-4 mb-12"
          >
            {[
              { icon: 'M5 13l4 4L19 7', label: 'FREE forever', color: '#3DD6C3' },
              { icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z', label: 'Branded app', color: '#fdcc02' },
              { icon: 'M13 10V3L4 14h7v7l9-11h-7z', label: 'AI referral assistant', color: '#a158ff' },
            ].map((badge) => (
              <div key={badge.label} className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.04] border border-white/10 rounded-full">
                <svg className="w-4 h-4" style={{ color: badge.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={badge.icon} /></svg>
                <span className="text-white/70 text-sm font-semibold">{badge.label}</span>
              </div>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65 }}
          >
            {submitted ? (
              <div className="inline-flex items-center gap-3 px-10 py-4 bg-[#3DD6C3]/20 border border-[#3DD6C3]/30 text-[#3DD6C3] text-lg font-bold rounded-2xl">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Application Submitted
              </div>
            ) : (
              <button
                onClick={scrollToForm}
                className="inline-flex items-center gap-3 px-10 py-4 bg-[#a158ff] text-white text-lg font-bold rounded-2xl shadow-lg shadow-[#a158ff]/25 hover:bg-[#9248ed] active:bg-[#8a3ee8] hover:scale-[1.02] active:scale-[0.98] transition-all animate-[buttonGlowPurple_2s_ease-in-out_infinite]"
              >
                Apply Now
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              </button>
            )}
          </motion.div>

          {/* Scroll hint */}
          <motion.div
            className="mt-16"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg className="w-6 h-6 text-white/15 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" /></svg>
          </motion.div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 40C240 80 480 0 720 40C960 80 1200 0 1440 40V80H0V40Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         BETA CALLOUT
         ═══════════════════════════════════════════════════ */}
      <section className="bg-white py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="border-l-4 border-[#3DD6C3] bg-[#F8F9FA] rounded-r-2xl px-8 py-8"
          >
            <h3 className="text-xl font-extrabold text-[#0D4D4D] mb-3">
              This is a beta — your voice actually matters.
            </h3>
            <p className="text-[#2D3748] text-base leading-relaxed max-w-3xl">
              The core is here. But I&apos;m still refining every part based on real agent feedback. As a founding member, you tell me what&apos;s working and what&apos;s not — and I build it. The mission: make your job easier and your bank account bigger.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         WHAT YOU GET
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#F8F9FA] py-20 md:py-28 overflow-hidden">
        <div className="max-w-4xl mx-auto px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            {/* Header */}
            <motion.div variants={fadeUp} custom={0} className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                What you get.
              </h2>
              <p className="text-[#6B7280] text-lg mb-6">Everything included. No upsells. No tiers.</p>
              <div className="inline-flex items-baseline gap-3 bg-white border border-gray-200 rounded-2xl px-8 py-4 shadow-sm">
                <span className="text-[#6B7280] text-lg line-through">$49/mo</span>
                <span className="text-4xl font-black text-[#0D4D4D]">FREE</span>
                <span className="text-[#a158ff] text-lg font-bold">Forever.</span>
              </div>
            </motion.div>

            {/* Benefit cards - 2 col grid */}
            <div className="grid sm:grid-cols-2 gap-5">
              {BENEFITS.map((item, i) => (
                <motion.div
                  key={item.title}
                  variants={fadeUp}
                  custom={0.05 + i * 0.06}
                  whileHover="hover"
                  initial="rest"
                >
                  <motion.div
                    variants={cardHover}
                    className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition-shadow h-full flex items-start gap-4"
                  >
                    <div className="w-12 h-12 bg-[#0D4D4D] rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6" style={{ color: item.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                    </div>
                    <div className="pt-0.5">
                      <p className="text-[#0D4D4D] font-bold text-base mb-1">{item.title}</p>
                      <p className="text-[#6B7280] text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         WHAT I NEED FROM YOU
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-white py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-3">
                What I need from you.
              </h2>
              <p className="text-[#6B7280] text-lg">The deal is simple. Free access for real feedback.</p>
            </motion.div>

            <div className="max-w-2xl mx-auto space-y-4">
              {[
                { emoji: '🏢', text: 'Use it with real clients (not just a test account)' },
                { emoji: '📝', text: 'Give feedback once a week — in-app, takes 2 minutes' },
                { emoji: '🔥', text: "Be brutally honest about what sucks and what's missing" },
                { emoji: '📅', text: 'Commit for 60 days' },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  custom={0.05 + i * 0.06}
                  className="flex items-start gap-5 bg-[#F8F9FA] rounded-2xl p-6 border border-gray-100 hover:border-[#3DD6C3]/30 hover:shadow-md transition-all"
                >
                  <span className="text-2xl flex-shrink-0 mt-0.5">{item.emoji}</span>
                  <p className="text-[#2D3748] text-base leading-relaxed font-medium">{item.text}</p>
                </motion.div>
              ))}
            </div>

            <motion.p variants={fadeUp} custom={0.35} className="text-[#6B7280]/60 text-sm italic text-center pt-8">
              &ldquo;Help me build something made by agents, for agents. Your voice shapes what this becomes.&rdquo;
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         APPLICATION FORM
         ═══════════════════════════════════════════════════ */}
      <section ref={formRef} className="relative bg-[#0D4D4D] py-20 md:py-28 overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-[#a158ff] rounded-full blur-[200px] opacity-[0.08]" />
          <div className="absolute bottom-0 left-1/4 w-[350px] h-[350px] bg-[#3DD6C3] rounded-full blur-[180px] opacity-[0.06]" />
        </div>

        <div className="relative max-w-2xl mx-auto px-8">
          {!submitted ? (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} custom={0} className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
                  Apply now.
                </h2>
                <p className="text-white/40 text-base">Takes 30 seconds. I personally review every one.</p>
              </motion.div>

              <motion.form variants={fadeUp} custom={0.1} onSubmit={handleSubmit} className="space-y-6">
                {/* Name + Email row */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="d-name" className="block text-white font-semibold mb-2 text-sm">
                      Full Name <span className="text-[#3DD6C3]">*</span>
                    </label>
                    <input
                      type="text"
                      id="d-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:border-[#3DD6C3] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/30 transition-all text-[15px]"
                      placeholder="Your full name"
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <label htmlFor="d-email" className="block text-white font-semibold mb-2 text-sm">
                      Email <span className="text-[#3DD6C3]">*</span>
                    </label>
                    <input
                      type="email"
                      id="d-email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:border-[#3DD6C3] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/30 transition-all text-[15px]"
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Client Count - Select dropdown */}
                <div>
                  <label htmlFor="d-clients" className="block text-white font-semibold mb-2 text-sm">
                    How many active clients do you have? <span className="text-[#3DD6C3]">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="d-clients"
                      required
                      value={clientCount}
                      onChange={(e) => setClientCount(e.target.value)}
                      className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white focus:border-[#3DD6C3] focus:outline-none focus:ring-2 focus:ring-[#3DD6C3]/30 transition-all text-[15px] appearance-none cursor-pointer"
                    >
                      <option value="" disabled className="bg-[#0D4D4D] text-white/50">Select a range</option>
                      {CLIENT_COUNT_OPTIONS.map((val) => (
                        <option key={val} value={val} className="bg-[#0D4D4D] text-white">{val} clients</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>

                {/* Biggest Difference - 2-col radio cards */}
                <div>
                  <p className="text-white font-semibold mb-3 text-sm">
                    What would make the biggest difference? <span className="text-[#3DD6C3]">*</span>
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {DIFFERENCE_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setBiggestDifference(option)}
                        className={`px-5 py-4 rounded-xl text-left text-sm font-medium transition-all border cursor-pointer group ${
                          biggestDifference === option
                            ? 'bg-[#a158ff]/15 border-[#a158ff] text-white shadow-lg shadow-[#a158ff]/10'
                            : 'bg-white/[0.04] border-white/15 text-white/60 hover:bg-white/[0.08] hover:border-white/25'
                        }`}
                      >
                        <span className="flex items-start gap-3">
                          <span className={`w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            biggestDifference === option ? 'border-[#a158ff] bg-[#a158ff]' : 'border-white/30 group-hover:border-white/50'
                          }`}>
                            {biggestDifference === option && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
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
                  <div className="bg-red-500/15 border border-red-500/25 rounded-xl px-5 py-4 text-red-300 text-sm">
                    {error}
                  </div>
                )}

                {/* Submit */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 bg-[#a158ff] text-white text-lg font-bold rounded-2xl shadow-lg shadow-[#a158ff]/25 hover:bg-[#9248ed] active:bg-[#8a3ee8] hover:scale-[1.01] active:scale-[0.99] transition-all animate-[buttonGlowPurple_2s_ease-in-out_infinite] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Submitting...
                      </span>
                    ) : 'Apply Now'}
                  </button>
                </div>

                <p className="text-white/30 text-xs text-center leading-relaxed">
                  I personally review every application. You&apos;ll hear from me within 24 hours.
                </p>
              </motion.form>
            </motion.div>
          ) : (
            /* ═══ Confirmation ═══ */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center py-12"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                className="w-20 h-20 bg-[#3DD6C3] rounded-full flex items-center justify-center mx-auto mb-8"
              >
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              </motion.div>
              <h2 className="text-3xl font-extrabold text-white mb-5">
                You&apos;re in the running.
              </h2>
              <p className="text-white/60 text-lg mb-8 leading-relaxed max-w-md mx-auto">
                I&apos;ll personally review your application and get back to you within 24 hours. Keep an eye on your inbox.
              </p>
              <p className="text-[#3DD6C3] font-semibold text-lg">— Daniel Roberts</p>
            </motion.div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         FAQ
         ═══════════════════════════════════════════════════ */}
      <section className="bg-[#F8F9FA] py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-10 text-center">
              Questions<span className="text-[#3DD6C3]">?</span>
            </h2>

            <div className="max-w-2xl mx-auto space-y-3">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 cursor-pointer"
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
         CONTACT / FINAL CTA
         ═══════════════════════════════════════════════════ */}
      <section className="relative bg-[#070E1B] py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#a158ff] rounded-full blur-[250px] opacity-[0.07]" />
        </div>
        <div className="relative max-w-4xl mx-auto px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {submitted ? (
              <>
                <div className="w-16 h-16 bg-[#3DD6C3]/20 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
                  You&apos;re all set.
                </h2>
                <p className="text-white/40 text-lg leading-relaxed max-w-lg mx-auto">
                  Your application is in. I&apos;ll review it personally and get back to you within 24 hours.
                </p>
                <div className="inline-flex items-center gap-3 px-10 py-4 bg-[#3DD6C3]/20 border border-[#3DD6C3]/30 text-[#3DD6C3] text-lg font-bold rounded-2xl">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  Application Submitted
                </div>
              </>
            ) : (
              <>
                <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
                  50 spots. Then this{' '}
                  <span className="text-[#a158ff]">closes permanently</span>.
                </h2>
                <p className="text-white/40 text-lg leading-relaxed max-w-lg mx-auto">
                  No second round. No waitlist. Lock in your free lifetime spot now.
                </p>
                <div className="pt-2">
                  <button
                    onClick={scrollToForm}
                    className="inline-flex items-center gap-3 px-10 py-4 bg-[#a158ff] text-white text-lg font-bold rounded-2xl shadow-lg shadow-[#a158ff]/25 hover:bg-[#9248ed] active:bg-[#8a3ee8] hover:scale-[1.02] active:scale-[0.98] transition-all animate-[buttonGlowPurple_2s_ease-in-out_infinite]"
                  >
                    Apply Now
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                  </button>
                </div>
                <p className="text-white/25 text-sm">
                  {spots} of 50 remaining · $0 forever · No credit card
                </p>
              </>
            )}
            <div className="pt-6">
              <p className="text-white/40 text-sm">
                Questions? <a href="mailto:support@agentforlife.app" className="text-[#3DD6C3] underline hover:text-[#3DD6C3]/80 transition-colors">support@agentforlife.app</a>
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
         FOOTER
         ═══════════════════════════════════════════════════ */}
      <footer className="bg-[#070E1B] border-t border-white/5 py-10">
        <div className="max-w-4xl mx-auto px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="AgentForLife" className="w-10 h-6 object-contain" />
              <span className="text-lg text-white brand-title">AgentForLife</span>
            </div>
            <nav className="flex items-center gap-8">
              <Link href="/d" className="text-white/30 text-sm hover:text-white/60 transition-colors">Home</Link>
              <Link href="/privacy" className="text-white/30 text-sm hover:text-white/60 transition-colors">Privacy</Link>
              <Link href="/terms" className="text-white/30 text-sm hover:text-white/60 transition-colors">Terms</Link>
            </nav>
            <p className="text-white/20 text-sm">&copy; 2026 AgentForLife</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
