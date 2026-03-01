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
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function RewritesDeepDiveDesktop() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); })
      .catch(() => {});
  }, []);

  const spots = spotsRemaining ?? 50;
  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/v5" className="flex items-center gap-2 text-[#0D4D4D] hover:text-[#3DD6C3] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span className="text-sm font-semibold">Back</span>
            </Link>
            <div className="hidden md:flex items-center gap-2">
              <img src="/logo.png" alt="AgentForLife" className="w-[36px] h-[20px] object-contain" />
              <span className="text-[#0D4D4D]/60 brand-title text-sm">AgentForLife</span>
            </div>
          </div>
          <Link
            href="/founding-member"
            className="px-5 py-2.5 bg-[#fdcc02] text-[#0D4D4D] text-sm font-bold rounded-full hover:bg-[#fdcc02]/90 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#F4845F] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #0D4D4D 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-7xl mx-auto px-8 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-20 lg:py-24">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-white/20 rounded-full mb-6">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-white font-bold text-xs uppercase tracking-wide">Automated Rewrites</span>
              </div>
              <h1 className="text-4xl lg:text-5xl xl:text-[3.5rem] font-extrabold text-white leading-[1.1] mb-6">
                Every anniversary<br />
                is a booked<br />
                appointment.
              </h1>
              <p className="text-white/80 text-lg lg:text-xl leading-relaxed max-w-lg">
                When a policy hits its one-year mark, your client hears from you — not the carrier. The rewrite comes to you.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex justify-center gap-5"
            >
              <div className="w-[200px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform -rotate-3">
                <img src="/screenshot-rewrite-convo.png" alt="AI rewrite conversation" className="w-full h-auto block" />
              </div>
              <div className="w-[200px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform rotate-3 translate-y-8">
                <img src="/screenshot-rewrite-dashboard.png" alt="Rewrites dashboard" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Real product screenshot */}
      <section className="bg-[#070E1B] px-8 py-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-[#F4845F] rounded-full blur-[180px] opacity-[0.08]" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-[#F4845F] text-xs uppercase tracking-[0.15em] font-medium mb-3">Your rewrite dashboard</p>
              <h3 className="text-2xl lg:text-3xl font-extrabold text-white leading-tight mb-4">
                See every conversation. Track every booking.
              </h3>
              <p className="text-white/30 text-sm">
                Real dashboard — AI-powered rewrite campaigns with live conversations, booking status, and performance tracking.
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex justify-center"
            >
              <div className="w-full max-w-[480px] rounded-2xl border-2 border-white/10 shadow-2xl overflow-hidden">
                <img src="/screenshot-rewrites-dashboard.png" alt="Real rewrites dashboard" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="space-y-16"
          >
            <motion.div variants={fadeUp} custom={0}>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-3">
                How it works.
              </h2>
              <p className="text-[#6B7280] text-lg">Automatic. No spreadsheets. No manual tracking.</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {[
                {
                  num: '1',
                  title: 'You get the heads-up',
                  body: 'As each policy\'s 1-year anniversary approaches, you get an email digest with every upcoming renewal. No spreadsheets. No manual tracking.',
                  color: '#F4845F',
                },
                {
                  num: '2',
                  title: 'Client gets a notification',
                  body: 'A personalized push notification goes to their phone — letting them know you may have found a lower price for the same coverage, with a link to book.',
                  color: '#3DD6C3',
                },
                {
                  num: '3',
                  title: 'They book themselves',
                  body: 'The client taps through to your scheduling link and picks a time. The rewrite conversation starts with them reaching out to you.',
                  color: '#F4845F',
                },
              ].map((step, i) => (
                <motion.div key={step.num} variants={fadeUp} custom={0.1 + i * 0.1} className="flex flex-col">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: `${step.color}20` }}>
                    <span className="text-lg font-black" style={{ color: step.color }}>{step.num}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-[#0D4D4D] mb-3">{step.title}</h3>
                  <p className="text-[#6B7280] text-[15px] leading-relaxed">{step.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Push notification mockup */}
      <section className="bg-[#F8F9FA] px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-[#6B7280] text-xs uppercase tracking-[0.15em] font-medium mb-3">What your client sees</p>
                <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-4">
                  A friendly heads-up, not a hard sell.
                </h2>
                <p className="text-[#6B7280] text-lg leading-relaxed">
                  Your client gets a personalized notification from their trusted agent — you. They tap, they book, they save money. Everyone wins.
                </p>
              </div>

              <div className="space-y-6">
                <div className="bg-white rounded-2xl p-7 border border-gray-200 shadow-lg max-w-[400px] mx-auto">
                  <div className="flex items-start gap-4 mb-5">
                    <div className="w-12 h-12 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-[#3DD6C3] text-sm font-bold">D</span>
                    </div>
                    <div>
                      <p className="text-[#0D4D4D] font-semibold text-base">Daniel Roberts</p>
                      <p className="text-[#6B7280] text-sm">Your Agent</p>
                    </div>
                  </div>
                  <div className="bg-[#F8F9FA] rounded-xl p-5 border border-gray-100">
                    <p className="text-[#0D4D4D] text-[15px] leading-relaxed">
                      &quot;Hey Sarah! Your policy anniversary is coming up and I&apos;ve been seeing some <span className="font-bold text-[#3DD6C3]">lower rates for the same coverage</span>. Want me to run the numbers? Tap below to grab a time.&quot;
                    </p>
                  </div>
                  <div className="mt-5 text-center">
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-[#3DD6C3] text-[#0D4D4D] text-base font-bold rounded-xl">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Book with Daniel
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm max-w-[320px] mx-auto">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[#0D4D4D] text-sm font-bold">Aug 2026</span>
                    <span className="px-2.5 py-1 bg-[#F4845F]/15 text-[#F4845F] text-[10px] font-bold rounded-full">ANNIVERSARY</span>
                  </div>
                  <div className="grid grid-cols-7 gap-px text-center">
                    {['S','M','T','W','T','F','S'].map((d,i) => <span key={`h${i}`} className="text-[#6B7280]/50 text-[9px] font-medium pb-1">{d}</span>)}
                    {days.map(d => (
                      <div key={d} className={`py-1 rounded text-xs ${d === 15 ? 'bg-[#F4845F] text-white font-bold' : 'text-[#6B7280]/40'}`}>{d}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight mb-10">
              Why it matters.
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { icon: '💰', title: 'You already earned it', desc: 'After the first year, there\'s no commission clawback risk. A rewrite is pure upside — you earn commission again on the same client.' },
                { icon: '⏰', title: 'Timing is everything', desc: 'The anniversary is the one moment a client is most open to reviewing coverage. Miss the window and the carrier auto-renews.' },
                { icon: '📱', title: 'They come to you', desc: 'Instead of cold-calling your book, your client gets a notification and books on your calendar. The rewrite starts with them reaching out.' },
                { icon: '📊', title: 'Track every opportunity', desc: 'Your dashboard shows upcoming anniversaries, notifications sent, and appointments booked. Nothing slips through.' },
              ].map((item, i) => (
                <motion.div key={item.title} variants={fadeUp} custom={0.1 + i * 0.08} className="bg-[#F8F9FA] rounded-2xl p-7 border border-gray-100">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl flex-shrink-0 mt-0.5">{item.icon}</span>
                    <div>
                      <h3 className="text-lg font-bold text-[#0D4D4D] mb-2">{item.title}</h3>
                      <p className="text-[#6B7280] text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* The math */}
      <section className="bg-[#070E1B] px-8 py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-[#F4845F] rounded-full blur-[180px] opacity-[0.1]" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center space-y-10">
          <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight">
            Revenue you&apos;re already <span className="text-[#F4845F]">entitled to</span>.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-8 text-center">
              <p className="text-5xl font-black text-white">$1,200</p>
              <p className="text-sm text-white/40 mt-2">Avg annual policy value</p>
            </div>
            <div className="bg-[#F4845F]/15 border border-[#F4845F]/25 rounded-2xl p-8 text-center">
              <p className="text-5xl font-black text-[#F4845F]">2x</p>
              <p className="text-sm text-white/40 mt-2">Commission on rewrite</p>
            </div>
          </div>
          <p className="text-white/40 text-base leading-relaxed max-w-xl mx-auto">
            Every policy anniversary is a lay-down sale. Your client wants better rates. You earn commission again. Everyone wins.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0D4D4D] px-8 py-28 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[150px] opacity-15" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative text-center max-w-3xl mx-auto space-y-8"
        >
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight">
            Stop missing money<br />
            <span className="text-[#F4845F]">you&apos;ve already earned</span>.
          </h2>
          <p className="text-white/40 text-lg leading-relaxed max-w-xl mx-auto">
            Every policy anniversary is an opportunity. Agent For Life makes sure you never miss one.
          </p>
          <Link
            href="/founding-member"
            className="inline-flex items-center gap-3 px-10 py-5 bg-[#fdcc02] text-[#0D4D4D] text-lg font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 hover:shadow-[#fdcc02]/40 hover:scale-[1.02] transition-all"
          >
            Get Started Free
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/25 text-sm">
            {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} &middot; $0 forever
          </p>
        </motion.div>
      </section>
    </div>
  );
}
