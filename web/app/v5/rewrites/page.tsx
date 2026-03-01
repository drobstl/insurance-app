'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

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

export default function RewritesDeepDiveDesktop() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => {
        if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining);
      })
      .catch(() => {});
  }, []);

  const spots = spotsRemaining ?? 50;
  const calendarDays = Array.from({ length: 31 }, (_, i) => i + 1);
  const blanksBefore = 6; // Aug 1, 2026 is a Saturday → 6 blanks (Sun-start grid)

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* ─── Sticky Desktop Nav ─── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-[1400px] mx-auto px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link
              href="/v5"
              className="flex items-center gap-2 text-[#0D4D4D] hover:text-[#3DD6C3] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-semibold">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife" className="w-[36px] h-[20px] object-contain" />
              <span className="text-[#0D4D4D]/60 brand-title text-sm">AgentForLife</span>
            </div>
          </div>

          <span className="absolute left-1/2 -translate-x-1/2 text-sm font-bold text-[#0D4D4D] tracking-wide uppercase">
            Automated Rewrites
          </span>

          <Link
            href="/founding-member"
            className="px-6 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full hover:bg-[#fdcc02]/85 hover:scale-[1.03] transition-all shadow-sm"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* ─── Hero: Full-width, 2-column ─── */}
      <section className="bg-[#F4845F] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #0D4D4D 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative max-w-[1400px] mx-auto px-10 lg:px-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center py-24 lg:py-32">
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="max-w-xl"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full mb-8">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-white font-bold text-xs uppercase tracking-wider">Automated Rewrites</span>
              </div>
              <h1 className="text-5xl lg:text-6xl xl:text-[4rem] font-extrabold text-white leading-[1.08] mb-8">
                Every anniversary<br />
                is a booked<br />
                appointment.
              </h1>
              <p className="text-white/80 text-xl leading-relaxed max-w-lg mb-10">
                When a policy hits its one-year mark, your client hears from you — not the carrier.
                The rewrite comes to you.
              </p>
              <div className="flex items-center gap-4">
                <Link
                  href="/founding-member"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-[#fdcc02] text-[#0D4D4D] text-base font-bold rounded-full hover:bg-[#fdcc02]/90 hover:scale-[1.02] transition-all shadow-xl shadow-black/10"
                >
                  Claim Your Spot
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <span className="text-white/50 text-sm font-medium">
                  {spotsRemaining !== null ? `${spots} spots left` : 'Limited spots'}
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="flex justify-center items-center lg:justify-end"
            >
              <div className="relative flex items-start">
                <div className="w-[240px] rounded-2xl border-2 border-black/50 shadow-2xl overflow-hidden transform -rotate-3 relative z-10">
                  <img
                    src="/screenshot-rewrite-convo.png"
                    alt="AI rewrite conversation"
                    className="w-full h-auto block"
                  />
                </div>
                <div className="w-[240px] rounded-2xl border-2 border-black/50 shadow-2xl overflow-hidden transform rotate-3 translate-y-10 -ml-8 relative z-20">
                  <img
                    src="/screenshot-rewrite-dashboard.png"
                    alt="Rewrites dashboard"
                    className="w-full h-auto block"
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Real Product Screenshot: Full-width alternating ─── */}
      <section className="bg-[#070E1B] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#F4845F] rounded-full blur-[250px] opacity-[0.07]" />
          <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.04]" />
        </div>
        <div className="relative max-w-[1400px] mx-auto px-10 lg:px-20 py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={slideInLeft}
              className="flex justify-center lg:justify-start"
            >
              <div className="w-full max-w-[500px] rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">
                <img
                  src="/screenshot-rewrites-dashboard.png"
                  alt="Real rewrites dashboard"
                  className="w-full h-auto block"
                />
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={slideInRight}
            >
              <p className="text-[#F4845F] text-xs uppercase tracking-[0.2em] font-semibold mb-4">
                Your rewrite dashboard
              </p>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight mb-6">
                See every conversation.<br />
                Track every booking.
              </h2>
              <p className="text-white/40 text-lg leading-relaxed max-w-md">
                Real dashboard — AI-powered rewrite campaigns with live conversations, booking status,
                and performance tracking across your entire book of business.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── How It Works: 3 Steps ─── */}
      <section className="bg-white py-28 lg:py-36">
        <div className="max-w-[1400px] mx-auto px-10 lg:px-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="space-y-20"
          >
            <motion.div variants={fadeUp} custom={0} className="max-w-2xl">
              <h2 className="text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
                How it works.
              </h2>
              <p className="text-[#6B7280] text-xl">
                Automatic. No spreadsheets. No manual tracking.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              {[
                {
                  num: '1',
                  title: 'You get the heads-up',
                  body: "As each policy's 1-year anniversary approaches, you get an email digest with every upcoming renewal. No spreadsheets. No manual tracking.",
                  color: '#F4845F',
                  icon: (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  ),
                },
                {
                  num: '2',
                  title: 'Client gets a notification',
                  body: 'A personalized push notification goes to their phone — letting them know you may have found a lower price for the same coverage, with a link to book.',
                  color: '#3DD6C3',
                  icon: (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  ),
                },
                {
                  num: '3',
                  title: 'They book themselves',
                  body: 'The client taps through to your scheduling link and picks a time. The rewrite conversation starts with them reaching out to you.',
                  color: '#F4845F',
                  icon: (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ),
                },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  variants={fadeUp}
                  custom={0.1 + i * 0.12}
                  className="group relative bg-[#F8F9FA] rounded-3xl p-10 border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-300"
                >
                  <div className="flex items-center gap-4 mb-6">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: `${step.color}18` }}
                    >
                      <span className="text-lg font-black" style={{ color: step.color }}>
                        {step.num}
                      </span>
                    </div>
                    <div style={{ color: step.color }}>{step.icon}</div>
                  </div>
                  <h3 className="text-xl font-extrabold text-[#0D4D4D] mb-4 group-hover:text-[#F4845F] transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-[#6B7280] text-[15px] leading-relaxed">{step.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Push Notification Mockup + Calendar: Full-width alternating ─── */}
      <section className="bg-[#F8F9FA] py-28 lg:py-36">
        <div className="max-w-[1400px] mx-auto px-10 lg:px-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
              <motion.div variants={slideInLeft}>
                <p className="text-[#6B7280] text-xs uppercase tracking-[0.2em] font-semibold mb-4">
                  What your client sees
                </p>
                <h2 className="text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-6">
                  A friendly heads-up,<br />
                  not a hard sell.
                </h2>
                <p className="text-[#6B7280] text-xl leading-relaxed max-w-lg mb-10">
                  Your client gets a personalized notification from their trusted agent — you.
                  They tap, they book, they save money. Everyone wins.
                </p>
                <div className="flex items-center gap-3 text-[#3DD6C3]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold text-[#0D4D4D]">Personalized to each client</span>
                </div>
                <div className="flex items-center gap-3 text-[#3DD6C3] mt-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold text-[#0D4D4D]">One tap to book</span>
                </div>
                <div className="flex items-center gap-3 text-[#3DD6C3] mt-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold text-[#0D4D4D]">Timed to the anniversary window</span>
                </div>
              </motion.div>

              <motion.div variants={slideInRight} className="flex flex-col items-center gap-8">
                {/* Agent card / push notification mockup */}
                <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-xl w-full max-w-[460px]">
                  <div className="flex items-start gap-5 mb-6">
                    <div className="w-14 h-14 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-[#3DD6C3] text-lg font-bold">D</span>
                    </div>
                    <div>
                      <p className="text-[#0D4D4D] font-bold text-lg">Daniel Roberts</p>
                      <p className="text-[#6B7280] text-sm">Your Insurance Agent</p>
                    </div>
                  </div>
                  <div className="bg-[#F8F9FA] rounded-2xl p-6 border border-gray-100 mb-6">
                    <p className="text-[#0D4D4D] text-base leading-relaxed">
                      &quot;Hey Sarah! Your policy anniversary is coming up and I&apos;ve been seeing
                      some{' '}
                      <span className="font-bold text-[#3DD6C3]">
                        lower rates for the same coverage
                      </span>
                      . Want me to run the numbers? Tap below to grab a time.&quot;
                    </p>
                  </div>
                  <button className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#3DD6C3] text-[#0D4D4D] text-lg font-bold rounded-2xl hover:bg-[#3DD6C3]/90 hover:scale-[1.01] transition-all cursor-default">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Book with Daniel
                  </button>
                </div>

                {/* Calendar mockup */}
                <div className="bg-white rounded-2xl p-7 border border-gray-200 shadow-lg w-full max-w-[400px]">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[#0D4D4D] text-base font-bold">August 2026</span>
                    </div>
                    <span className="px-3 py-1.5 bg-[#F4845F]/15 text-[#F4845F] text-xs font-bold rounded-full uppercase tracking-wide">
                      Anniversary
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <span
                        key={d}
                        className="text-[#6B7280]/60 text-[11px] font-semibold pb-2 uppercase"
                      >
                        {d}
                      </span>
                    ))}
                    {Array.from({ length: blanksBefore }).map((_, i) => (
                      <div key={`blank-${i}`} />
                    ))}
                    {calendarDays.map((d) => (
                      <div
                        key={d}
                        className={`py-2 rounded-lg text-sm font-medium ${
                          d === 15
                            ? 'bg-[#F4845F] text-white font-bold shadow-md shadow-[#F4845F]/30'
                            : 'text-[#6B7280]/50 hover:bg-gray-50'
                        }`}
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Why It Matters: 4 Cards ─── */}
      <section className="bg-white py-28 lg:py-36">
        <div className="max-w-[1400px] mx-auto px-10 lg:px-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} custom={0} className="max-w-2xl mb-16">
              <h2 className="text-4xl lg:text-5xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
                Why it matters.
              </h2>
              <p className="text-[#6B7280] text-xl">
                Every anniversary is money on the table. Here&apos;s why rewrites are your best move.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[
                {
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                  title: 'You already earned it',
                  desc: "After the first year, there's no commission clawback risk. A rewrite is pure upside — you earn commission again on the same client.",
                  color: '#F4845F',
                },
                {
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                  title: 'Timing is everything',
                  desc: 'The anniversary is the one moment a client is most open to reviewing coverage. Miss the window and the carrier auto-renews.',
                  color: '#3DD6C3',
                },
                {
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  ),
                  title: 'They come to you',
                  desc: "Instead of cold-calling your book, your client gets a notification and books on your calendar. The rewrite starts with them reaching out.",
                  color: '#F4845F',
                },
                {
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  ),
                  title: 'Track every opportunity',
                  desc: 'Your dashboard shows upcoming anniversaries, notifications sent, and appointments booked. Nothing slips through.',
                  color: '#3DD6C3',
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  variants={fadeUp}
                  custom={0.1 + i * 0.08}
                  className="group bg-[#F8F9FA] rounded-3xl p-10 border border-gray-100 hover:border-gray-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: `${item.color}15`, color: item.color }}
                  >
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-extrabold text-[#0D4D4D] mb-3 group-hover:text-[#F4845F] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[#6B7280] text-[15px] leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── The Math ─── */}
      <section className="bg-[#070E1B] relative overflow-hidden py-28 lg:py-36">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#F4845F] rounded-full blur-[250px] opacity-[0.08]" />
          <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.04]" />
        </div>
        <div className="relative max-w-[1400px] mx-auto px-10 lg:px-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={slideInLeft}
            >
              <p className="text-[#F4845F] text-xs uppercase tracking-[0.2em] font-semibold mb-4">
                The math
              </p>
              <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6">
                Revenue you&apos;re<br />
                already{' '}
                <span className="text-[#F4845F]">entitled to</span>.
              </h2>
              <p className="text-white/40 text-lg leading-relaxed max-w-md">
                Every policy anniversary is a lay-down sale. Your client wants better rates. You earn
                commission again. Everyone wins.
              </p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={slideInRight}
              className="grid grid-cols-2 gap-6"
            >
              <div className="bg-white/[0.06] border border-white/10 rounded-3xl p-10 text-center hover:bg-white/[0.09] transition-colors">
                <p className="text-6xl font-black text-white mb-3">$1,200</p>
                <p className="text-sm text-white/40 font-medium">Avg annual policy value</p>
              </div>
              <div className="bg-[#F4845F]/15 border border-[#F4845F]/25 rounded-3xl p-10 text-center hover:bg-[#F4845F]/20 transition-colors">
                <p className="text-6xl font-black text-[#F4845F] mb-3">2x</p>
                <p className="text-sm text-white/40 font-medium">Commission on rewrite</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="bg-[#0D4D4D] relative overflow-hidden py-32 lg:py-40">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.12]" />
          <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-[#fdcc02] rounded-full blur-[180px] opacity-[0.06]" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative text-center max-w-3xl mx-auto px-10"
        >
          <h2 className="text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Stop missing money<br />
            <span className="text-[#F4845F]">you&apos;ve already earned</span>.
          </h2>
          <p className="text-white/40 text-xl leading-relaxed max-w-xl mx-auto mb-12">
            Every policy anniversary is an opportunity. Agent For Life makes sure you never miss one.
          </p>
          <Link
            href="/founding-member"
            className="inline-flex items-center gap-3 px-12 py-5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 hover:shadow-[#fdcc02]/40 hover:scale-[1.03] transition-all"
          >
            Get Started Free
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <p className="text-white/25 text-sm mt-6">
            {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} &middot;
            $0 forever
          </p>
        </motion.div>
      </section>
    </div>
  );
}
