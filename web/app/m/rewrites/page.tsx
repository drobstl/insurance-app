'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTierCTA } from '@/hooks/useTierCTA';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function RewritesDeepDive() {
  const tier = useTierCTA();
  const spotsRemaining = tier.spotsRemaining;
  const spots = tier.isFoundingOpen ? (tier.spotsRemaining ?? 50) : 0;

  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Back nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="px-5 h-14 flex items-center justify-between">
          <Link href="/m" className="flex items-center gap-2 text-[#0D4D4D]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            <span className="text-sm font-semibold">Back</span>
          </Link>
          <Link
            href={tier.ctaMobileHref}
            className="px-4 py-2 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full"
          >
            {tier.isFoundingOpen ? 'Get Started Free' : tier.ctaText}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#F4845F] px-6 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #0D4D4D 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 rounded-full mb-5">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span className="text-white font-bold text-[11px] uppercase tracking-wide">Automated Rewrites</span>
            </div>
            <h1 className="text-[2rem] font-extrabold text-white leading-[1.1] mb-4">
              Better coverage.<br />
              Better price.<br />
              Booked automatically.
            </h1>
            <p className="text-white/80 text-[15px] leading-relaxed max-w-[320px]">
              When a policy anniversary hits, it&apos;s the perfect time to check if your client can get better coverage or a lower rate. Agent For Life makes sure that conversation happens.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Screenshots showcase */}
      <section className="px-5 -mt-8 relative z-10 mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex justify-center gap-3"
        >
          <div className="w-[45%] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform -rotate-2">
            <img src="/screenshot-rewrite-convo.png" alt="AI rewrite conversation" className="w-full h-auto block" />
          </div>
          <div className="w-[45%] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform rotate-2 translate-y-6">
            <img src="/screenshot-rewrite-dashboard.png" alt="Rewrites dashboard" className="w-full h-auto block" />
          </div>
        </motion.div>
      </section>

      {/* Real product screenshot */}
      <section className="bg-[#070E1B] px-5 py-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 right-0 w-[200px] h-[200px] bg-[#F4845F] rounded-full blur-[120px] opacity-[0.08]" />
        </div>
        <div className="relative space-y-5">
          <div className="text-center">
            <p className="text-[#F4845F] text-[11px] uppercase tracking-[0.15em] font-medium mb-2">Your rewrite dashboard</p>
            <h3 className="text-[1.2rem] font-extrabold text-white leading-tight">
              See every conversation.<br />Track every booking.
            </h3>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex justify-center"
          >
            <div className="w-full max-w-[340px] rounded-2xl border-2 border-white/10 shadow-2xl overflow-hidden">
              <img src="/screenshot-rewrites-dashboard.png" alt="Real rewrites dashboard with AI conversations" className="w-full h-auto block" />
            </div>
          </motion.div>
          <p className="text-white/30 text-[11px] text-center">
            Real dashboard &mdash; AI-powered rewrite campaigns with live conversations, booking status, and performance tracking.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="space-y-10"
        >
          <motion.div variants={fadeUp} custom={0}>
            <h2 className="text-[1.5rem] font-extrabold text-[#0D4D4D] leading-tight mb-2">
              How it works.
            </h2>
            <p className="text-[#6B7280] text-[14px]">Automatic. No spreadsheets. No manual tracking.</p>
          </motion.div>

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
              body: 'A personalized push notification goes to their phone — letting them know their policy anniversary is coming up and you\'d like to review their coverage to make sure they\'re still getting the best fit and the best rate.',
              color: '#3DD6C3',
            },
            {
              num: '3',
              title: 'They book themselves',
              body: 'The client taps through to your scheduling link and picks a time. The rewrite conversation starts with them reaching out to you — not the other way around.',
              color: '#F4845F',
            },
          ].map((step, i) => (
            <motion.div key={step.num} variants={fadeUp} custom={0.1 + i * 0.08} className="flex gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${step.color}20` }}>
                <span className="text-sm font-black" style={{ color: step.color }}>{step.num}</span>
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#0D4D4D] mb-1.5">{step.title}</h3>
                <p className="text-[#6B7280] text-[14px] leading-relaxed">{step.body}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Push notification mockup */}
      <section className="bg-[#F8F9FA] px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="space-y-5"
        >
          <p className="text-[#6B7280] text-[11px] uppercase tracking-[0.15em] font-medium text-center">What your client sees</p>

          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-lg max-w-[320px] mx-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-[#3DD6C3] text-xs font-bold">D</span>
              </div>
              <div>
                <p className="text-[#0D4D4D] font-semibold text-sm">Daniel Roberts</p>
                <p className="text-[#6B7280] text-xs">Your Agent</p>
              </div>
            </div>
            <div className="bg-[#F8F9FA] rounded-xl p-4 border border-gray-100">
              <p className="text-[#0D4D4D] text-sm leading-relaxed">
                &quot;Hey Sarah! Your policy anniversary is coming up and I&apos;ve been seeing some <span className="font-bold text-[#3DD6C3]">lower rates for the same coverage</span>. Want me to run the numbers? Tap below to grab a time.&quot;
              </p>
            </div>
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3DD6C3] text-[#0D4D4D] text-sm font-bold rounded-xl">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Book with Daniel
              </div>
            </div>
          </div>

          {/* Mini calendar */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm max-w-[280px] mx-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#0D4D4D] text-xs font-bold">Aug 2026</span>
              <span className="px-2 py-0.5 bg-[#F4845F]/15 text-[#F4845F] text-[9px] font-bold rounded-full">ANNIVERSARY</span>
            </div>
            <div className="grid grid-cols-7 gap-px text-center">
              {['S','M','T','W','T','F','S'].map((d,i) => <span key={`h${i}`} className="text-[#6B7280]/50 text-[8px] font-medium pb-1">{d}</span>)}
              {days.map(d => (
                <div key={d} className={`py-0.5 rounded text-[9px] ${d === 15 ? 'bg-[#F4845F] text-white font-bold' : 'text-[#6B7280]/40'}`}>{d}</div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Why it matters */}
      <section className="px-6 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="space-y-5"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-[1.4rem] font-extrabold text-[#0D4D4D] leading-tight">
            Why it matters.
          </motion.h2>

          {[
            { icon: '🛡️', title: 'Life changes. Coverage should too.', desc: 'Clients buy homes, have kids, change jobs. A policy anniversary is the natural moment to make sure their coverage still fits their life.' },
            { icon: '💵', title: 'Save your client money', desc: 'Rates change. A year later, the same coverage might cost less with a different carrier. Your client deserves to know — and you\'re the one who can show them.' },
            { icon: '📱', title: 'They come to you', desc: 'Instead of cold-calling your book, your client gets a notification and books on your calendar. The conversation starts with them reaching out.' },
            { icon: '📊', title: 'Track every opportunity', desc: 'Your dashboard shows upcoming anniversaries, notifications sent, and appointments booked. Nothing slips through.' },
          ].map((item, i) => (
            <motion.div key={item.title} variants={fadeUp} custom={0.1 + i * 0.08} className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                <div>
                  <h3 className="text-[15px] font-bold text-[#0D4D4D] mb-1">{item.title}</h3>
                  <p className="text-[#6B7280] text-[13px] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* The math */}
      <section className="bg-[#070E1B] px-6 py-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 right-0 w-[200px] h-[200px] bg-[#F4845F] rounded-full blur-[120px] opacity-[0.1]" />
        </div>
        <div className="relative text-center space-y-6">
          <h2 className="text-[1.3rem] font-extrabold text-white leading-tight">
            Good for your client.<br />
            <span className="text-[#F4845F]">Good for your business.</span>
          </h2>
          <div className="space-y-3">
            <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5">
              <p className="text-white font-bold text-[14px] mb-1">For your client</p>
              <p className="text-white/40 text-[13px] leading-relaxed">They get a coverage review at the one moment it matters most. If there&apos;s a better rate or a better fit, you find it for them.</p>
            </div>
            <div className="bg-[#F4845F]/15 border border-[#F4845F]/25 rounded-2xl p-5">
              <p className="text-[#F4845F] font-bold text-[14px] mb-1">For your business</p>
              <p className="text-white/40 text-[13px] leading-relaxed">When you rewrite a policy, you earn new first-year commission &mdash; on a client you&apos;ve already built trust with. No prospecting, no cold calls.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0D4D4D] px-6 py-16 pb-28 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[200px] h-[200px] bg-[#3DD6C3] rounded-full blur-[100px] opacity-15" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative text-center space-y-5"
        >
          <h2 className="text-[1.5rem] font-extrabold text-white leading-tight">
            Your clients deserve<br />
            <span className="text-[#F4845F]">an annual checkup</span>.
          </h2>
          <p className="text-white/40 text-[14px] leading-relaxed max-w-[280px] mx-auto">
            Life changes. Rates change. Agent For Life makes sure every client gets a coverage review at the right time &mdash; and you get to be the one who delivers it.
          </p>
          <Link
            href={tier.ctaMobileHref}
            className="inline-flex items-center gap-2.5 px-8 py-4 bg-[#fdcc02] text-[#0D4D4D] text-base font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 active:scale-[0.97] transition-transform"
          >
            {tier.isFoundingOpen ? 'Get Started Free' : tier.ctaText}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/25 text-xs">
            {tier.ctaSubtext}
          </p>
        </motion.div>
      </section>
    </div>
  );
}
