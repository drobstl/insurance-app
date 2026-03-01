'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

const IMESSAGE_DELAYS = [900, 1100, 900, 1300, 900, 500, 1100];

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

export default function ReferralsDeepDive() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [msgStep, setMsgStep] = useState(-1);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatTriggered = useRef(false);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then(r => r.json())
      .then(d => { if (typeof d.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining); })
      .catch(() => {});
  }, []);

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
      <section className="bg-[#fdcc02] px-6 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #0D4D4D 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#0D4D4D]/10 rounded-full mb-5">
              <svg className="w-3.5 h-3.5 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span className="text-[#0D4D4D] font-bold text-[11px] uppercase tracking-wide">One-Tap Referrals</span>
            </div>
            <h1 className="text-[2rem] font-extrabold text-[#0D4D4D] leading-[1.1] mb-4">
              Your clients refer.<br />
              AI closes.
            </h1>
            <p className="text-[#0D4D4D]/70 text-[15px] leading-relaxed max-w-[320px]">
              One tap from your client. AI texts the referral via iMessage, qualifies them, and books the appointment on your calendar.
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
            <img src="/screenshot-referral-sent.png" alt="Referral sent confirmation" className="w-full h-auto block" />
          </div>
          <div className="w-[45%] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform rotate-2 translate-y-6">
            <img src="/screenshot-referral-message.png" alt="Referral message with business card" className="w-full h-auto block" />
          </div>
        </motion.div>
      </section>

      {/* Real product screenshot */}
      <section className="bg-[#070E1B] px-5 py-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[200px] h-[200px] bg-[#3DD6C3] rounded-full blur-[120px] opacity-[0.06]" />
        </div>
        <div className="relative space-y-5">
          <div className="text-center">
            <p className="text-[#3DD6C3] text-[11px] uppercase tracking-[0.15em] font-medium mb-2">Real AI conversation</p>
            <h3 className="text-[1.2rem] font-extrabold text-white leading-tight">
              This is an actual referral<br />being qualified by AI.
            </h3>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex justify-center"
          >
            <div className="w-[280px] rounded-2xl border-2 border-white/10 shadow-2xl overflow-hidden">
              <img src="/screenshot-ai-referral-imessage.png" alt="Real AI referral conversation via iMessage" className="w-full h-auto block" />
            </div>
          </motion.div>
          <p className="text-white/30 text-[11px] text-center">
            Real iMessage conversation &mdash; AI qualifying a warm referral and booking the appointment.
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
            <p className="text-[#6B7280] text-[14px]">Three steps. Zero phone tag.</p>
          </motion.div>

          {[
            {
              num: '1',
              title: 'Client taps "Refer"',
              body: 'In your branded app, your client taps the referral button and picks a contact from their phone. That\'s all they do.',
              color: '#fdcc02',
              icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
            },
            {
              num: '2',
              title: 'Warm intro goes out',
              body: 'A personal text goes from your client to the referral — a warm introduction about you, with your digital business card attached. Not a cold link. A trusted recommendation.',
              color: '#3DD6C3',
              icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
            },
            {
              num: '3',
              title: 'AI books the appointment',
              body: 'Your AI reaches out via iMessage in a separate 1-on-1 thread. Warm, conversational, responding as you. It qualifies the lead, gathers their info, and books them on your calendar.',
              color: '#fdcc02',
              icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
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

      {/* iMessage demo */}
      <section className="bg-[#070E1B] px-5 py-14 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[250px] h-[250px] bg-[#3DD6C3] rounded-full blur-[150px] opacity-[0.08]" />
        </div>

        <div className="relative space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="text-[#3DD6C3] font-bold text-[11px] uppercase tracking-[0.15em] mb-2">What the referral sees</p>
            <h2 className="text-[1.4rem] font-extrabold text-white leading-tight">
              The referral thinks<br />they&apos;re texting <span className="text-[#3DD6C3]">you</span>.
            </h2>
          </motion.div>

          <div ref={chatRef}>
            <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-[#3DD6C3]/15 max-w-[320px] mx-auto">
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
              <div className="bg-[#111] px-4 py-4 space-y-2.5 rounded-b-[1.6rem] min-h-[280px]">
                <div className="flex justify-end" style={msgFade(0)}>
                  <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]">
                    <p className="text-white text-[12px] leading-relaxed">Hey Mike, Sarah connected us &mdash; I helped her family get protected and she thought I might be able to help you too. Open to a couple quick questions?</p>
                  </div>
                </div>
                <div className="flex justify-start" style={msgFade(1)}>
                  <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[70%]">
                    <p className="text-white text-[12px]">yeah sure</p>
                  </div>
                </div>
                <div className="flex justify-end" style={msgFade(2)}>
                  <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]">
                    <p className="text-white text-[12px] leading-relaxed">What matters most to you when it comes to protecting your family?</p>
                  </div>
                </div>
                <div className="flex justify-start" style={msgFade(3)}>
                  <div className="bg-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[88%]">
                    <p className="text-white text-[12px]">making sure my wife and kids are covered if something happens</p>
                  </div>
                </div>
                <div className="flex justify-end" style={msgFade(4)}>
                  <div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%]">
                    <p className="text-white text-[12px] leading-relaxed">Really appreciate that. A quick 15-min call would be worth it. Here&apos;s my calendar:</p>
                    <p className="text-[#3DD6C3] text-[12px] mt-1 underline" style={msgFade(5)}>calendly.com/daniel</p>
                  </div>
                </div>
                <div className="flex justify-center pt-2" style={msgFade(6)}>
                  <div className="flex items-center gap-2 bg-[#3DD6C3]/15 border border-[#3DD6C3]/25 rounded-full px-4 py-1.5">
                    <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    <span className="text-[#3DD6C3] text-[10px] font-bold">Appointment Booked</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key details */}
      <section className="px-6 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="space-y-5"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-[1.4rem] font-extrabold text-[#0D4D4D] leading-tight">
            Why it works.
          </motion.h2>

          {[
            { icon: '💬', title: 'Text messages get read', desc: 'Not email. Not a link. A real text message in their inbox — where open rates dwarf every other channel.' },
            { icon: '🤝', title: 'Warm intro, not cold outreach', desc: 'The referral already got a personal text from your client. AI follows up with trust already built.' },
            { icon: '📅', title: 'AI books directly on your calendar', desc: 'No back-and-forth. AI shares your scheduling link and the referral picks a time.' },
            { icon: '🔄', title: 'AI never gives up', desc: 'If the referral goes quiet, AI follows up on Day 2, Day 5, and Day 8 with different angles.' },
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

      {/* Follow-up cadence */}
      <section className="bg-[#0D4D4D] px-6 py-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-[#fdcc02] rounded-full blur-[120px] opacity-[0.08]" />
        </div>
        <div className="relative text-center space-y-6">
          <h2 className="text-[1.3rem] font-extrabold text-white leading-tight">
            And if they don&apos;t reply?
          </h2>
          <p className="text-white/50 text-[14px]">Your AI doesn&apos;t give up.</p>
          <div className="space-y-3">
            {[
              { day: 'Day 2', label: 'Gentle nudge', active: false },
              { day: 'Day 5', label: 'New angle', active: false },
              { day: 'Day 8', label: 'Direct ask', active: true },
            ].map((d) => (
              <div
                key={d.day}
                className={`py-3 px-5 rounded-xl text-sm font-medium ${
                  d.active
                    ? 'bg-[#fdcc02]/20 border border-[#fdcc02]/30 text-[#fdcc02]'
                    : 'bg-white/10 text-white/60'
                }`}
              >
                {d.day} &middot; {d.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The numbers */}
      <section className="px-6 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="space-y-6"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-[1.4rem] font-extrabold text-[#0D4D4D] leading-tight text-center">
            The math.
          </motion.h2>
          <motion.div variants={fadeUp} custom={0.1} className="bg-[#F8F9FA] rounded-2xl p-5 border border-gray-100 text-center">
            <p className="text-[#0D4D4D] font-extrabold text-lg mb-2">Most referrals die from friction.</p>
            <p className="text-[#6B7280] text-[13px] leading-relaxed">
              Your clients want to refer you. The problem is the process &mdash; it&apos;s too many steps, too awkward, and leads go cold before you follow up. Agent For Life removes every point of friction so referrals actually happen.
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
            Stop chasing referrals.<br />
            <span className="text-[#fdcc02]">Let them chase you.</span>
          </h2>
          <p className="text-white/40 text-[14px] leading-relaxed max-w-[280px] mx-auto">
            Your clients already trust you. Now they can share that trust with one tap. AI handles everything else.
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
