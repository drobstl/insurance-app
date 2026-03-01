'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

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
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function ReferralsDeepDiveDesktop() {
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
      <section className="bg-[#fdcc02] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #0D4D4D 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-7xl mx-auto px-8 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-20 lg:py-24">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#0D4D4D]/10 rounded-full mb-6">
                <svg className="w-4 h-4 text-[#0D4D4D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-[#0D4D4D] font-bold text-xs uppercase tracking-wide">One-Tap Referrals</span>
              </div>
              <h1 className="text-4xl lg:text-5xl xl:text-[3.5rem] font-extrabold text-[#0D4D4D] leading-[1.1] mb-6">
                Your clients refer.<br />
                AI closes.
              </h1>
              <p className="text-[#0D4D4D]/70 text-lg lg:text-xl leading-relaxed max-w-lg">
                One tap from your client. AI texts the referral via iMessage, qualifies them, and books the appointment on your calendar.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex justify-center gap-5"
            >
              <div className="w-[200px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform -rotate-3">
                <img src="/screenshot-referral-sent.png" alt="Referral sent confirmation" className="w-full h-auto block" />
              </div>
              <div className="w-[200px] rounded-2xl border-2 border-black/60 shadow-2xl overflow-hidden transform rotate-3 translate-y-8">
                <img src="/screenshot-referral-message.png" alt="Referral message with business card" className="w-full h-auto block" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Real AI conversation screenshot */}
      <section className="bg-[#070E1B] px-8 py-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-[#3DD6C3] rounded-full blur-[180px] opacity-[0.06]" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="text-center lg:text-left">
              <p className="text-[#3DD6C3] text-xs uppercase tracking-[0.15em] font-medium mb-3">Real AI conversation</p>
              <h3 className="text-2xl lg:text-3xl font-extrabold text-white leading-tight mb-4">
                This is an actual referral being qualified by AI.
              </h3>
              <p className="text-white/30 text-sm">
                Real iMessage conversation — AI qualifying a warm referral and booking the appointment.
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex justify-center"
            >
              <div className="w-[320px] rounded-2xl border-2 border-white/10 shadow-2xl overflow-hidden">
                <img src="/screenshot-ai-referral-imessage.png" alt="Real AI referral conversation via iMessage" className="w-full h-auto block" />
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
              <p className="text-[#6B7280] text-lg">Three steps. Zero phone tag.</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
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

      {/* iMessage demo */}
      <section className="bg-[#070E1B] px-8 py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[350px] h-[350px] bg-[#3DD6C3] rounded-full blur-[200px] opacity-[0.08]" />
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <p className="text-[#3DD6C3] font-bold text-xs uppercase tracking-[0.15em] mb-3">What the referral sees</p>
                <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight">
                  The referral thinks they&apos;re texting <span className="text-[#3DD6C3]">you</span>.
                </h2>
              </motion.div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={stagger}
                className="space-y-4"
              >
                {[
                  { icon: '💬', title: 'iMessage = ~99% read rate', desc: 'Not email. Not a link. Blue-bubble iMessage that gets read every time.' },
                  { icon: '🤝', title: 'Warm intro, not cold outreach', desc: 'The referral already got a personal text from your client. AI follows up with trust already built.' },
                  { icon: '📅', title: 'AI books directly on your calendar', desc: 'No back-and-forth. AI shares your scheduling link and the referral picks a time.' },
                  { icon: '🔄', title: 'AI never gives up', desc: 'If the referral goes quiet, AI follows up on Day 2, Day 5, and Day 8 with different angles.' },
                ].map((item, i) => (
                  <motion.div key={item.title} variants={fadeUp} custom={0.1 + i * 0.08} className="bg-white/[0.04] backdrop-blur-sm rounded-xl p-5 border border-white/10">
                    <div className="flex items-start gap-4">
                      <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                      <div>
                        <h3 className="text-[15px] font-bold text-white mb-1">{item.title}</h3>
                        <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            <div ref={chatRef} className="flex justify-center">
              <div className="bg-[#1a1a2e] rounded-[2.5rem] p-2 shadow-2xl border border-[#3DD6C3]/15 w-full max-w-[380px]">
                <div className="bg-[#111] rounded-t-[2rem] px-6 pt-4 pb-3 flex items-center justify-between">
                  <span className="text-white/40 text-xs font-medium">9:44 AM</span>
                  <div className="flex gap-0.5"><div className="w-1 h-2 bg-white/40 rounded-sm" /><div className="w-1 h-2.5 bg-white/40 rounded-sm" /><div className="w-1 h-3 bg-white/40 rounded-sm" /></div>
                </div>
                <div className="bg-[#111] px-6 pb-4 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#005851] flex items-center justify-center"><span className="text-[#3DD6C3] text-sm font-bold">D</span></div>
                    <div><p className="text-white text-base font-semibold">Daniel</p><p className="text-white/30 text-xs">AI Referral Assistant</p></div>
                  </div>
                </div>
                <div className="bg-[#111] px-5 py-5 space-y-3 rounded-b-[2rem] min-h-[320px]">
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
                      <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      <span className="text-[#3DD6C3] text-xs font-bold">Appointment Booked</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Follow-up cadence */}
      <section className="bg-[#0D4D4D] px-8 py-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#fdcc02] rounded-full blur-[180px] opacity-[0.08]" />
        </div>
        <div className="relative max-w-3xl mx-auto text-center space-y-10">
          <div>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight mb-3">
              And if they don&apos;t reply?
            </h2>
            <p className="text-white/50 text-lg">Your AI doesn&apos;t give up.</p>
          </div>
          <div className="flex flex-col md:flex-row gap-4 justify-center">
            {[
              { day: 'Day 2', label: 'Gentle nudge', active: false },
              { day: 'Day 5', label: 'New angle', active: false },
              { day: 'Day 8', label: 'Direct ask', active: true },
            ].map((d) => (
              <div
                key={d.day}
                className={`py-4 px-8 rounded-xl text-base font-medium flex-1 max-w-[240px] mx-auto md:mx-0 ${
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

      {/* The math */}
      <section className="px-8 py-24">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="space-y-10"
          >
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl lg:text-4xl font-extrabold text-[#0D4D4D] leading-tight text-center">
              The math.
            </motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              <motion.div variants={fadeUp} custom={0.1} className="bg-[#F8F9FA] rounded-2xl p-8 text-center border border-gray-100">
                <p className="text-5xl font-black text-[#0D4D4D]">5%</p>
                <p className="text-sm text-[#6B7280] mt-2">Avg agent referral rate</p>
              </motion.div>
              <motion.div variants={fadeUp} custom={0.15} className="bg-[#fdcc02]/10 rounded-2xl p-8 text-center border border-[#fdcc02]/20">
                <p className="text-5xl font-black text-[#0D4D4D]">25%</p>
                <p className="text-sm text-[#0D4D4D]/60 mt-2">What&apos;s actually possible</p>
              </motion.div>
            </div>
            <motion.p variants={fadeUp} custom={0.2} className="text-[#6B7280] text-base text-center leading-relaxed max-w-xl mx-auto">
              Most agents leave 80% of their referral potential on the table because the process is too manual. Agent For Life automates the entire flow.
            </motion.p>
          </motion.div>
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
            Stop chasing referrals.<br />
            <span className="text-[#fdcc02]">Let them chase you.</span>
          </h2>
          <p className="text-white/40 text-lg leading-relaxed max-w-xl mx-auto">
            Your clients already trust you. Now they can share that trust with one tap. AI handles everything else.
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
