'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTierCTA } from '@/hooks/useTierCTA';

const IMESSAGE_DELAYS = [900, 1100, 900, 1300, 900, 500, 1100];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

const slideInLeft = {
  hidden: { opacity: 0, x: -60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

const slideInRight = {
  hidden: { opacity: 0, x: 60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export default function ReferralsDeepDiveDesktop() {
  const tier = useTierCTA();
  const spotsRemaining = tier.spotsRemaining;
  const spots = tier.isFoundingOpen ? (tier.spotsRemaining ?? 50) : 0;

  const [msgStep, setMsgStep] = useState(-1);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatTriggered = useRef(false);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && !chatTriggered.current) { chatTriggered.current = true; setMsgStep(0); } },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (msgStep < 0 || msgStep >= IMESSAGE_DELAYS.length) return;
    const t = setTimeout(() => setMsgStep(s => s + 1), IMESSAGE_DELAYS[msgStep]);
    return () => clearTimeout(t);
  }, [msgStep]);

  const msgFade = (step: number): React.CSSProperties => ({
    opacity: msgStep >= step ? 1 : 0,
    transform: msgStep >= step ? 'translateY(0)' : 'translateY(10px)',
    transition: 'all 450ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  });

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-[1440px] mx-auto px-10 h-16 grid grid-cols-3 items-center">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="flex items-center gap-2 text-[#0D4D4D] hover:text-[#3DD6C3] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-semibold">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife" className="w-[36px] h-[20px] object-contain" />
              <span className="text-[#4B5563] brand-title text-sm">AgentForLife™</span>
            </div>
          </div>

          <div className="flex justify-center">
            <span className="text-[#0D4D4D] font-bold text-sm tracking-wide">One-Tap Referrals</span>
          </div>

          <div className="flex justify-end">
            <Link
              href={tier.ctaHref}
              className="px-6 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full hover:bg-[#e6b800] hover:scale-[1.03] transition-all"
            >
              {tier.isFoundingOpen ? 'Get Started Free' : tier.ctaText}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-[#fdcc02] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #0D4D4D 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative max-w-[1440px] mx-auto px-10 lg:px-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center py-24 lg:py-32">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="max-w-xl"
            >
              <div className="flex flex-wrap items-center gap-3 mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D4D4D]/10 rounded-full">
                  <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">One-Tap Referrals</span>
                </div>
                <div className="inline-flex items-center gap-3 px-4 py-2 bg-[#0D4D4D]/10 rounded-full">
                  <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#007AFF]" /><span className="text-[#0D4D4D] font-bold text-xs">Blue Bubbles</span></span>
                  <span className="text-[#0D4D4D]/30">+</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#34C759]" /><span className="text-[#0D4D4D] font-bold text-xs">Green Bubbles</span></span>
                </div>
              </div>
              <h1 className="text-5xl lg:text-6xl xl:text-7xl font-extrabold text-[#0D4D4D] leading-[1.05] mb-8">
                Your clients refer.<br />
                AI closes.
              </h1>
              <p className="text-[#0D4D4D]/70 text-lg lg:text-xl leading-relaxed max-w-lg mb-10">
                One tap from your client. AI texts the referral via iMessage, qualifies them, and books the appointment on your calendar.
              </p>
              <Link
                href={tier.ctaHref}
                className="inline-flex items-center gap-3 px-8 py-4 bg-[#0D4D4D] text-[#fdcc02] text-base font-bold rounded-full hover:bg-[#0D4D4D]/90 hover:scale-[1.02] transition-all shadow-lg"
              >
                {tier.isFoundingOpen ? 'Claim Your Spot' : tier.ctaText}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="flex justify-center items-center"
            >
              <div className="relative flex items-start">
                <div className="w-[240px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform -rotate-3 z-10 hover:rotate-0 hover:scale-105 transition-transform duration-500">
                  <img src="/screenshot-referral-sent.png" alt="Referral sent confirmation" className="w-full h-auto block" />
                </div>
                <div className="w-[240px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform rotate-3 translate-y-10 -ml-8 hover:rotate-0 hover:scale-105 transition-transform duration-500">
                  <img src="/screenshot-referral-message.png" alt="Referral message with business card" className="w-full h-auto block" />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Real AI Conversation ── */}
      <section className="relative overflow-hidden bg-white">
        <div className="relative max-w-[1440px] mx-auto px-10 lg:px-20 py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              variants={slideInLeft}
              className="lg:pr-8"
            >
              <p className="text-[#3DD6C3] text-xs uppercase tracking-[0.2em] font-semibold mb-4">Real AI conversation</p>
              <h2 className="text-3xl lg:text-4xl xl:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-6">
                This is an actual referral being qualified by AI.
              </h2>
              <p className="text-[#4B5563] text-base lg:text-lg leading-relaxed max-w-md">
                Real iMessage conversation — AI qualifying a warm referral and booking the appointment.
              </p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              variants={slideInRight}
              className="flex justify-center lg:justify-end"
            >
              <div className="w-[340px] rounded-2xl border-2 border-gray-200 shadow-2xl overflow-hidden hover:scale-[1.02] transition-transform duration-500">
                <img src="/screenshot-ai-referral-imessage.png" alt="Real AI referral conversation via iMessage" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="bg-[#F8F9FA] relative overflow-hidden">
        <div className="max-w-[1440px] mx-auto px-10 lg:px-20 py-24 lg:py-32">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} custom={0} className="mb-16">
              <h2 className="text-3xl lg:text-4xl xl:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
                How it works.
              </h2>
              <p className="text-[#4B5563] text-lg lg:text-xl">Three steps. Zero phone tag.</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
              {[
                {
                  num: '1',
                  title: 'Client taps "Refer"',
                  body: 'In your branded app, your client taps the referral button and picks a contact from their phone. That\'s all they do.',
                  color: '#fdcc02',
                },
                {
                  num: '2',
                  title: 'Warm intro goes out',
                  body: 'A personal text goes from your client to the referral — a warm introduction about you, with your digital business card attached.',
                  color: '#3DD6C3',
                },
                {
                  num: '3',
                  title: 'AI books the appointment',
                  body: 'Your AI reaches out via iMessage in a separate thread. Warm, conversational, responding as you. It qualifies the lead and books them on your calendar.',
                  color: '#fdcc02',
                },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  variants={fadeUp}
                  custom={0.1 + i * 0.12}
                  className="bg-white rounded-2xl p-8 lg:p-10 border border-gray-200/80 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: `${step.color}20` }}
                  >
                    <span className="text-2xl font-black" style={{ color: step.color }}>{step.num}</span>
                  </div>
                  <h3 className="text-xl lg:text-2xl font-extrabold text-[#0D4D4D] mb-4">{step.title}</h3>
                  <p className="text-[#4B5563] text-base leading-relaxed">{step.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── iMessage Demo + Why It Works (combined) ── */}
      <section className="relative overflow-hidden bg-white">
        <div className="relative max-w-[1440px] mx-auto px-10 lg:px-20 py-24 lg:py-32">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="mb-14"
          >
            <p className="text-[#3DD6C3] font-bold text-xs uppercase tracking-[0.2em] mb-4">What the referral sees</p>
            <h2 className="text-3xl lg:text-4xl xl:text-5xl font-extrabold text-[#0D4D4D] leading-tight">
              The referral thinks they&apos;re texting <span className="text-[#3DD6C3]">you</span>.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 xl:gap-20 items-start">
            {/* Phone */}
            <div ref={chatRef} className="flex justify-center lg:justify-start lg:sticky lg:top-28">
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.7 }}
                className="bg-[#1a1a2e] rounded-[2.5rem] p-2.5 shadow-2xl border border-[#3DD6C3]/15 w-full max-w-[400px]"
              >
                <div className="bg-[#111] rounded-t-[2rem] px-6 pt-4 pb-3 flex items-center justify-between">
                  <span className="text-white/40 text-xs font-medium">9:44 AM</span>
                  <div className="flex gap-0.5">
                    <div className="w-1 h-2 bg-white/40 rounded-sm" />
                    <div className="w-1 h-2.5 bg-white/40 rounded-sm" />
                    <div className="w-1 h-3 bg-white/40 rounded-sm" />
                  </div>
                </div>
                <div className="bg-[#111] px-6 pb-4 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-[#005851] flex items-center justify-center">
                      <span className="text-[#3DD6C3] text-sm font-bold">D</span>
                    </div>
                    <div>
                      <p className="text-white text-base font-semibold">Daniel</p>
                      <p className="text-white/30 text-xs">AI Referral Assistant</p>
                    </div>
                  </div>
                </div>
                <div className="bg-[#111] px-5 py-6 space-y-3 rounded-b-[2rem] min-h-[360px]">
                  <div className="flex justify-end" style={msgFade(0)}>
                    <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]">
                      <p className="text-white text-[13px] leading-relaxed">Hey Mike, Sarah connected us &mdash; I helped her family get protected and she thought I might be able to help you too. Open to a couple quick questions?</p>
                    </div>
                  </div>
                  <div className="flex justify-start" style={msgFade(1)}>
                    <div className="bg-[#333] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[65%]">
                      <p className="text-white text-[13px]">yeah sure</p>
                    </div>
                  </div>
                  <div className="flex justify-end" style={msgFade(2)}>
                    <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]">
                      <p className="text-white text-[13px] leading-relaxed">What matters most to you when it comes to protecting your family?</p>
                    </div>
                  </div>
                  <div className="flex justify-start" style={msgFade(3)}>
                    <div className="bg-[#333] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                      <p className="text-white text-[13px]">making sure my wife and kids are covered if something happens</p>
                    </div>
                  </div>
                  <div className="flex justify-end" style={msgFade(4)}>
                    <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]">
                      <p className="text-white text-[13px] leading-relaxed">Really appreciate that. A quick 15-min call would be worth it. Here&apos;s my calendar:</p>
                      <p className="text-[#3DD6C3] text-[13px] mt-1 underline" style={msgFade(5)}>calendly.com/daniel</p>
                    </div>
                  </div>
                  <div className="flex justify-center pt-3" style={msgFade(6)}>
                    <div className="flex items-center gap-2 bg-[#3DD6C3]/15 border border-[#3DD6C3]/25 rounded-full px-5 py-2">
                      <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[#3DD6C3] text-xs font-bold">Appointment Booked</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Why it works cards */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              variants={stagger}
              className="space-y-5 lg:pt-4"
            >
              {[
                { icon: '💬', title: 'Blue bubbles + green bubbles', desc: 'iPhone users see blue iMessage bubbles. Android users see green. Both get ~99% read rates — not email, not a cold link.' },
                { icon: '🤝', title: 'Warm intro, not cold outreach', desc: 'The referral already got a personal text from your client. AI follows up with trust already built.' },
                { icon: '📅', title: 'AI books directly on your calendar', desc: 'No back-and-forth. AI shares your scheduling link and the referral picks a time.' },
                { icon: '🔄', title: 'AI never gives up', desc: 'If the referral goes quiet, AI follows up on Day 2, Day 5, and Day 8 with different angles.' },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  variants={fadeUp}
                  custom={0.05 + i * 0.1}
                  className="bg-[#F8F9FA] rounded-2xl p-6 lg:p-7 border border-gray-200 hover:border-[#3DD6C3]/40 hover:shadow-md transition-colors duration-300"
                >
                  <div className="flex items-start gap-5">
                    <span className="text-2xl flex-shrink-0 mt-0.5">{item.icon}</span>
                    <div>
                      <h3 className="text-base lg:text-lg font-bold text-[#0D4D4D] mb-2">{item.title}</h3>
                      <p className="text-[#4B5563] text-sm lg:text-base leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Follow-Up Cadence ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: '#0D4D4D radial-gradient(ellipse 400px 400px at 0% 100%, rgba(253,204,2,0.08), transparent 70%)' }}
      >
        <div className="relative max-w-[1440px] mx-auto px-10 lg:px-20 py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              variants={slideInLeft}
            >
              <h2 className="text-3xl lg:text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-4">
                And if they don&apos;t reply?
              </h2>
              <p className="text-white/90 text-lg lg:text-xl">Your AI doesn&apos;t give up.</p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              variants={stagger}
              className="flex flex-col gap-4"
            >
              {[
                { day: 'Day 2', label: 'Gentle nudge', desc: 'A friendly check-in that keeps the door open', active: false },
                { day: 'Day 5', label: 'New angle', desc: 'A different value prop to re-engage interest', active: false },
                { day: 'Day 8', label: 'Direct ask', desc: 'One final, clear call-to-action', active: true },
              ].map((d, i) => (
                <motion.div
                  key={d.day}
                  variants={fadeUp}
                  custom={0.1 + i * 0.12}
                  className={`py-5 px-7 rounded-2xl text-base font-medium flex items-center justify-between gap-6 transition-colors duration-300 ${
                    d.active
                      ? 'bg-[#fdcc02]/15 border-2 border-[#fdcc02]/30 hover:bg-[#fdcc02]/20'
                      : 'bg-white/[0.07] border border-white/10 hover:bg-white/[0.12]'
                  }`}
                >
                  <div className="flex items-center gap-5">
                    <span className={`text-lg font-extrabold ${d.active ? 'text-[#fdcc02]' : 'text-white/70'}`}>
                      {d.day}
                    </span>
                    <div className={`w-px h-8 ${d.active ? 'bg-[#fdcc02]/20' : 'bg-white/10'}`} />
                    <div>
                      <p className={`font-bold ${d.active ? 'text-[#fdcc02]' : 'text-white/70'}`}>{d.label}</p>
                      <p className={`text-sm mt-0.5 ${d.active ? 'text-[#fdcc02]/80' : 'text-white/80'}`}>{d.desc}</p>
                    </div>
                  </div>
                  {d.active && (
                    <span className="text-[#fdcc02] text-xl">→</span>
                  )}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── The Math ── */}
      <section className="bg-white relative overflow-hidden">
        <div className="max-w-[1440px] mx-auto px-10 lg:px-20 py-24 lg:py-32">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 xl:gap-24 items-center">
              <motion.div variants={slideInLeft}>
                <h2 className="text-3xl lg:text-4xl xl:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-6">
                  The math.
                </h2>
                <p className="text-[#4B5563] text-base lg:text-lg leading-relaxed max-w-md">
                  Most agents leave 80% of their referral potential on the table because the process is too manual. Agent For Life automates the entire flow.
                </p>
              </motion.div>

              <div className="grid grid-cols-2 gap-6">
                <motion.div
                  variants={fadeUp}
                  custom={0.1}
                  className="bg-[#F8F9FA] rounded-2xl p-8 lg:p-10 text-center border border-gray-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  <p className="text-6xl lg:text-7xl font-black text-[#0D4D4D]">5%</p>
                  <p className="text-sm lg:text-base text-[#4B5563] mt-3 font-medium">Avg agent referral rate</p>
                </motion.div>
                <motion.div
                  variants={fadeUp}
                  custom={0.2}
                  className="bg-[#fdcc02]/10 rounded-2xl p-8 lg:p-10 text-center border-2 border-[#fdcc02]/25 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  <p className="text-6xl lg:text-7xl font-black text-[#0D4D4D]">25%</p>
                  <p className="text-sm lg:text-base text-[#0D4D4D] mt-3 font-medium">What&apos;s actually possible</p>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden bg-[#0D4D4D]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="relative max-w-[1440px] mx-auto px-10 lg:px-20 py-28 lg:py-36"
        >
          <div className="max-w-3xl mx-auto text-center space-y-10">
            <h2 className="text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white leading-tight">
              Stop chasing referrals.<br />
              <span className="text-[#fdcc02]">Let them chase you.</span>
            </h2>
            <p className="text-white/90 text-lg lg:text-xl leading-relaxed max-w-xl mx-auto">
              Your clients already trust you. Now they can share that trust with one tap. AI handles everything else.
            </p>
            <div className="flex flex-col items-center gap-5">
              <Link
                href={tier.ctaHref}
                className="inline-flex items-center gap-3 px-12 py-5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 hover:shadow-[#fdcc02]/40 hover:scale-[1.03] transition-all duration-300"
              >
                {tier.isFoundingOpen ? 'Get Started Free' : tier.ctaText}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <p className="text-white/80 text-sm">
                {tier.ctaSubtext}
              </p>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
