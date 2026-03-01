'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

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

export default function RetentionDeepDive() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); })
      .catch(() => {});
  }, []);

  const spots = spotsRemaining ?? 50;

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
            href="/founding-member/m"
            className="px-4 py-2 bg-[#fdcc02] text-[#0D4D4D] text-xs font-bold rounded-full"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#3DD6C3] px-6 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #0D4D4D 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#0D4D4D]/15 rounded-full mb-5">
              <svg className="w-3.5 h-3.5 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              <span className="text-[#0D4D4D] font-bold text-[11px] uppercase tracking-wide">Automated Retention</span>
            </div>
            <h1 className="text-[2rem] font-extrabold text-[#0D4D4D] leading-[1.1] mb-4">
              When a policy<br />
              slips, AI<br />
              catches it.
            </h1>
            <p className="text-[#0D4D4D]/70 text-[15px] leading-relaxed max-w-[320px]">
              Forward the carrier&apos;s conservation notice. AI identifies the client, sends personalized outreach, and follows up until the policy is saved.
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
            <img src="/screenshot-retention-message.png" alt="Conservation message" className="w-full h-auto block" />
          </div>
          <div className="w-[45%] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform rotate-2 translate-y-6">
            <img src="/screenshot-retention-booking.png" alt="Booking calendar" className="w-full h-auto block" />
          </div>
        </motion.div>
      </section>

      {/* Conservation Alerts — How it works */}
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
            <p className="text-[#6B7280] text-[14px]">One forwarded email. AI does the rest.</p>
          </motion.div>
        </motion.div>
      </section>

      {/* Rescue steps */}
      <section className="bg-[#0D4D4D] px-6 py-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-[#fdcc02] rounded-full blur-[120px] opacity-[0.08]" />
        </div>
        <div className="relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="space-y-8"
          >
            <motion.div variants={fadeUp} custom={0}>
              <h2 className="text-[1.4rem] font-extrabold text-white leading-tight mb-2">
                Three steps to save<br />an at-risk policy.
              </h2>
            </motion.div>

            {/* iMessage / RCS badges */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full">
                <svg className="w-3 h-3 text-white/50" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                <span className="text-white/50 text-[10px] font-medium">iMessage</span>
                <div className="w-1.5 h-1.5 rounded-full bg-[#007AFF]" />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full">
                <svg className="w-3 h-3 text-white/50" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.34c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm-11.046 0c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm11.405-6.02l1.9-3.46c.11-.2.04-.44-.15-.56-.2-.11-.44-.04-.56.15l-1.92 3.49C15.46 8.38 13.55 7.75 12 7.75s-3.46.63-5.14 1.72L4.94 5.98c-.12-.19-.36-.26-.56-.15-.19.12-.26.36-.15.56l1.9 3.46C2.64 11.96.34 15.55 0 19.8h24c-.34-4.25-2.64-7.84-6.12-9.48z"/></svg>
                <span className="text-white/50 text-[10px] font-medium">RCS</span>
                <div className="w-1.5 h-1.5 rounded-full bg-[#34C759]" />
              </div>
            </div>
            <p className="text-white/25 text-[10px]">Blue bubbles on iPhone. Green bubbles on Android. Native messaging &mdash; not SMS.</p>

            {[
              {
                num: '1',
                title: 'Forward the alert',
                body: 'Forward the carrier\'s conservation notice to your AI email address or paste it in your dashboard.',
                color: '#fdcc02',
              },
              {
                num: '2',
                title: 'AI extracts & matches',
                body: 'AI pulls client name, policy number, carrier, and reason — auto-matches to your records and flags chargeback risks.',
                color: '#3DD6C3',
              },
              {
                num: '3',
                title: 'Client gets reached',
                body: 'Personalized push notification + text within 2 hours. AI follows up on Day 2, 5, and 7 with different angles.',
                color: '#fdcc02',
              },
            ].map((step, i) => (
              <motion.div key={step.num} variants={fadeUp} custom={0.1 + i * 0.08} className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[#0D4D4D] text-sm font-bold" style={{ backgroundColor: step.color }}>
                  {step.num}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">{step.title}</h3>
                  <p className="text-white/50 text-[13px] leading-relaxed">{step.body}</p>
                </div>
              </motion.div>
            ))}

            <motion.div variants={fadeUp} custom={0.4} className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.06] border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-[#fdcc02]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-white/70 text-[11px] font-semibold">Speed</span>
                </div>
                <p className="text-white/40 text-[11px] leading-relaxed">Auto-outreach in 2 hours for chargeback-risk policies</p>
              </div>
              <div className="bg-white/[0.06] border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-white/70 text-[11px] font-semibold">Track</span>
                </div>
                <p className="text-white/40 text-[11px] leading-relaxed">Mark policies as &quot;Saved&quot; or &quot;Lost&quot; from your dashboard</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Real product screenshots */}
      <section className="bg-[#070E1B] px-5 py-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[200px] h-[200px] bg-red-500 rounded-full blur-[120px] opacity-[0.06]" />
        </div>
        <div className="relative space-y-10">
          <div className="text-center">
            <p className="text-red-400 text-[11px] uppercase tracking-[0.15em] font-medium mb-2">See it in action</p>
            <h3 className="text-[1.2rem] font-extrabold text-white leading-tight">
              This is a real conservation<br />alert being processed.
            </h3>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <div className="flex justify-center">
              <div className="w-[280px] rounded-2xl border-2 border-white/10 shadow-2xl overflow-hidden">
                <img src="/screenshot-conservation-email.png" alt="Real conservation alert email — HIGH PRIORITY chargeback risk" className="w-full h-auto block" />
              </div>
            </div>
            <p className="text-white/30 text-[11px] text-center">
              Real alert &mdash; AI identified client, matched the policy, and scheduled outreach automatically.
            </p>
          </motion.div>

          <div className="text-center pt-4">
            <p className="text-[#3DD6C3] text-[11px] uppercase tracking-[0.15em] font-medium mb-2">Your dashboard</p>
            <h3 className="text-[1.2rem] font-extrabold text-white leading-tight mb-5">
              Every client. Every status.<br />One screen.
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
              <img src="/screenshot-clients-dashboard.png" alt="Real clients dashboard with policy statuses" className="w-full h-auto block" />
            </div>
          </motion.div>
          <p className="text-white/30 text-[11px] text-center">
            Real dashboard &mdash; client list with policy status, at-risk flags, and instant actions.
          </p>
        </div>
      </section>

      {/* The real problem */}
      <section className="px-6 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="space-y-5"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-[1.4rem] font-extrabold text-[#0D4D4D] leading-tight">
            The real problem.
          </motion.h2>

          <motion.p variants={fadeUp} custom={0.08} className="text-[#6B7280] text-[14px] leading-relaxed">
            Your clients wanted the protection. They bought the policy because it mattered. But after the sale, the relationship stops. You&apos;re busy writing new business. They&apos;re just a name on a spreadsheet.
          </motion.p>

          <motion.div variants={fadeUp} custom={0.16} className="space-y-3">
            {[
              'A payment slips and they don\u2019t call you \u2014 they just stop paying.',
              'They get frustrated and call the carrier directly to cancel.',
              'A competitor reaches out and they switch because you were just a voice on the phone.',
            ].map((line, i) => (
              <div key={i} className="flex items-start gap-3 bg-[#F8F9FA] rounded-xl p-4 border border-gray-100">
                <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                </div>
                <p className="text-[#6B7280] text-[13px] leading-snug">{line}</p>
              </div>
            ))}
          </motion.div>

          <motion.p variants={fadeUp} custom={0.24} className="text-[#6B7280] text-[14px] leading-relaxed">
            It&apos;s not that they don&apos;t value the coverage. It&apos;s that you were never given a chance to fight for them. By the time you find out, it&apos;s already a chargeback.
          </motion.p>

          <motion.div variants={fadeUp} custom={0.32} className="bg-[#0D4D4D] rounded-2xl p-5">
            <p className="text-white font-bold text-[15px] leading-snug mb-2">
              Agent For Life gives you that chance.
            </p>
            <p className="text-white/50 text-[13px] leading-relaxed">
              When a policy is at risk, you find out immediately &mdash; not weeks later when the chargeback hits. And your AI fights to save it while you focus on growing your business. A real relationship means they feel like you&apos;ve got their back.
            </p>
          </motion.div>
        </motion.div>
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
            Be there for your clients<br />
            <span className="text-[#3DD6C3]">even when you can&apos;t be</span>.
          </h2>
          <p className="text-white/40 text-[14px] leading-relaxed max-w-[280px] mx-auto">
            You can&apos;t fight for a client you don&apos;t know is at risk. Agent For Life makes sure you always know &mdash; and always have a chance to help.
          </p>
          <Link
            href="/founding-member/m"
            className="inline-flex items-center gap-2.5 px-8 py-4 bg-[#fdcc02] text-[#0D4D4D] text-base font-bold rounded-full shadow-2xl shadow-[#fdcc02]/25 active:scale-[0.97] transition-transform"
          >
            Get Started Free
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <p className="text-white/25 text-xs">
            {spotsRemaining !== null ? `${spots} of 50 spots remaining` : 'Limited spots'} &middot; $0 forever
          </p>
        </motion.div>
      </section>
    </div>
  );
}
