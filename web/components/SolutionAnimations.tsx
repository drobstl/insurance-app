'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

/* ═══════════════════════════════════════════════════
   STATIC VISUAL CARDS
   ═══════════════════════════════════════════════════ */

function RetentionCard() {
  return (
    <div className="bg-[#1a1a2e] rounded-2xl p-5 shadow-2xl space-y-3 w-full max-w-sm">
      {/* Holiday notification */}
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3.5 border border-white/5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0">
            <span className="text-sm">🎄</span>
          </div>
          <div className="min-w-0">
            <p className="text-white/90 text-[11px] font-bold">Holiday Touchpoint</p>
            <p className="text-white/60 text-[11px] leading-snug mt-0.5">Merry Christmas, Sarah! Wishing you and your family a wonderful holiday. — Daniel</p>
          </div>
        </div>
      </div>
      {/* Touchpoint tags */}
      <div className="flex flex-wrap gap-1.5 px-1">
        {['Christmas', "New Year's", 'Birthday', 'Anniversary', '+ more'].map((t, i) => (
          <span key={t} className={`px-2 py-0.5 rounded-md text-[8px] font-medium ${i === 0 ? 'bg-[#3DD6C3]/20 text-[#3DD6C3] border border-[#3DD6C3]/20' : 'bg-white/5 text-white/30 border border-white/5'}`}>{t}</span>
        ))}
      </div>
      {/* Conservation alert */}
      <div className="bg-white/5 rounded-xl p-3.5 border border-red-400/20">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-sm">⚠</span>
          </div>
          <div className="min-w-0">
            <p className="text-red-300 text-[11px] font-bold">Conservation Alert</p>
            <p className="text-white/60 text-[10px] leading-snug mt-0.5">AI identified Sarah — auto policy, lapsed payment</p>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3DD6C3]" />
              <span className="text-[#3DD6C3] text-[9px] font-medium">Outreach sent via push + iMessage</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReferralCard() {
  return (
    <div className="bg-[#1a1a2e] rounded-2xl p-5 shadow-2xl w-full max-w-sm">
      {/* Chat header */}
      <div className="flex items-center gap-2.5 pb-3 border-b border-white/10 mb-4">
        <div className="w-7 h-7 rounded-full bg-[#0B93F6]/30 flex items-center justify-center">
          <span className="text-[#0B93F6] text-[9px] font-bold">M</span>
        </div>
        <span className="text-white/70 text-[11px] font-medium">Mike Johnson</span>
        <span className="ml-auto px-2 py-0.5 bg-[#0B93F6]/20 rounded text-[#0B93F6] text-[8px] font-medium">iMessage</span>
      </div>
      {/* Conversation */}
      <div className="space-y-2.5">
        <div className="flex justify-start">
          <div className="bg-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[85%]">
            <p className="text-white/90 text-[11px] leading-snug">Hey Mike, Sarah connected us — would you be open to a couple quick questions?</p>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-[#0B93F6] rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-[60%]">
            <p className="text-white text-[11px] leading-snug">yeah sure</p>
          </div>
        </div>
        <div className="flex justify-start">
          <div className="bg-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[85%]">
            <p className="text-white/90 text-[11px] leading-snug">Perfect! Here&apos;s my calendar:</p>
            <p className="text-[#3DD6C3] text-[11px] underline mt-1">calendly.com/daniel</p>
          </div>
        </div>
      </div>
      {/* Booked badge */}
      <div className="flex justify-center mt-4">
        <div className="flex items-center gap-2 bg-[#3DD6C3]/15 border border-[#3DD6C3]/25 rounded-full px-4 py-1.5">
          <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[#3DD6C3] text-[10px] font-bold">Appointment Booked</span>
        </div>
      </div>
    </div>
  );
}

function RewriteCard() {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  return (
    <div className="bg-[#1a1a2e] rounded-2xl p-5 shadow-2xl space-y-3 w-full max-w-sm">
      {/* Push notification */}
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3.5 border border-[#fdcc02]/20">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#fdcc02] flex items-center justify-center flex-shrink-0">
            <span className="text-sm">📱</span>
          </div>
          <div className="min-w-0">
            <p className="text-white/90 text-[11px] font-bold">AgentForLife</p>
            <p className="text-white/60 text-[11px] leading-snug mt-0.5">Your agent just found a better deal on your auto coverage. Book with them now.</p>
          </div>
        </div>
      </div>
      {/* Mini calendar */}
      <div className="bg-white/5 rounded-xl p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/80 text-[11px] font-bold">Aug 2026</span>
          <span className="text-white/30 text-[9px]">Policy anniversary</span>
        </div>
        <div className="grid grid-cols-7 gap-px text-center mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={`h-${i}`} className="text-white/25 text-[7px] font-medium">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px text-center">
          {days.map((d) => (
            <div key={d} className={`py-0.5 rounded text-[7px] ${d === 15 ? 'bg-[#fdcc02] text-[#0D4D4D] font-bold' : 'text-white/30'}`}>{d}</div>
          ))}
        </div>
      </div>
      {/* Booking slots */}
      <div className="space-y-1.5">
        {['10:00 AM', '11:30 AM', '2:00 PM'].map((time, i) => (
          <div key={time} className={`py-2 px-3 rounded-lg border text-center ${i === 1 ? 'bg-[#3DD6C3]/15 border-[#3DD6C3]/30' : 'bg-white/5 border-white/5'}`}>
            <span className={`text-[10px] font-medium ${i === 1 ? 'text-[#3DD6C3]' : 'text-white/40'}`}>{time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   WAYPOINT
   ═══════════════════════════════════════════════════ */

function Waypoint({ index }: { index: number }) {
  return (
    <motion.div
      className="absolute left-1/2 -translate-x-1/2 z-10 hidden md:flex items-center justify-center"
      style={{ top: `${15 + index * 35}%` }}
      initial={{ scale: 0, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
    >
      <div className="w-4 h-4 rounded-full bg-[#3DD6C3] shadow-[0_0_12px_rgba(61,214,195,0.5)]" />
      <div className="absolute w-8 h-8 rounded-full bg-[#3DD6C3]/10 animate-ping" />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   FEATURE NODE
   ═══════════════════════════════════════════════════ */

const FEATURES = [
  {
    headline: 'Zero clients lost to silence.',
    description: '7+ automated touchpoints per year — holidays, birthdays, anniversaries. When a policy slips, you forward one email. Your AI system identifies the client, sends personalized outreach with the carrier\'s number, and follows up until the policy is saved.',
    card: RetentionCard,
    reversed: false,
  },
  {
    headline: 'Referrals that book themselves.',
    description: 'Your client taps one button in their app. AI reaches out to the referral via iMessage, qualifies them with a few questions, and books directly on your calendar. You just show up.',
    card: ReferralCard,
    reversed: true,
  },
  {
    headline: 'Every anniversary is a booked appointment.',
    description: '30 days before every policy anniversary, your client gets a push notification offering a rate review. They tap, pick a time, and book themselves. Revenue you\'ve already earned the right to.',
    card: RewriteCard,
    reversed: false,
  },
];

function FeatureNode({ headline, description, card: Card, reversed, index }: {
  headline: string;
  description: string;
  card: React.ComponentType;
  reversed: boolean;
  index: number;
}) {
  return (
    <motion.div
      className={`grid md:grid-cols-2 gap-8 md:gap-14 items-center ${index > 0 ? 'mt-20 md:mt-28' : ''}`}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className={`${reversed ? 'md:order-2' : ''}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#3DD6C3]/15 flex items-center justify-center flex-shrink-0">
            <span className="text-[#3DD6C3] text-sm font-bold">{index + 1}</span>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-[#3DD6C3]/20 to-transparent" />
        </div>
        <h3 className="text-2xl md:text-3xl font-extrabold text-[#0D4D4D] mb-4">{headline}</h3>
        <p className="text-[#6B7280] text-base md:text-lg leading-relaxed">{description}</p>
      </div>
      <div className={`flex ${reversed ? 'md:order-1 justify-start' : 'justify-end'} justify-center`}>
        <Card />
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════ */

export function SolutionSections() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 80%', 'end 20%'],
  });

  const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const pathOpacity = useTransform(scrollYProgress, [0, 0.05], [0, 1]);

  return (
    <section ref={sectionRef} className="py-20 md:py-28 bg-white relative overflow-hidden">
      {/* SVG winding path — desktop only */}
      <div className="absolute inset-0 hidden md:block pointer-events-none" aria-hidden="true">
        <svg
          className="absolute top-0 left-0 w-full h-full"
          viewBox="0 0 1200 1000"
          fill="none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="pathGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3DD6C3" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#3DD6C3" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3DD6C3" stopOpacity="0.6" />
            </linearGradient>
            <filter id="pathGlow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Background track */}
          <motion.path
            d="M 600 0 C 600 80, 300 120, 300 200 C 300 280, 600 320, 600 400 C 600 480, 900 520, 900 600 C 900 680, 600 720, 600 800 C 600 880, 300 920, 300 1000"
            stroke="#3DD6C3"
            strokeOpacity="0.06"
            strokeWidth="3"
            fill="none"
            style={{ opacity: pathOpacity }}
          />
          {/* Animated drawing path */}
          <motion.path
            d="M 600 0 C 600 80, 300 120, 300 200 C 300 280, 600 320, 600 400 C 600 480, 900 520, 900 600 C 900 680, 600 720, 600 800 C 600 880, 300 920, 300 1000"
            stroke="url(#pathGradient)"
            strokeWidth="2.5"
            fill="none"
            filter="url(#pathGlow)"
            style={{
              pathLength,
              opacity: pathOpacity,
            }}
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Mobile vertical line */}
      <div className="absolute left-6 top-0 bottom-0 w-px md:hidden pointer-events-none" aria-hidden="true">
        <motion.div
          className="w-full bg-gradient-to-b from-[#3DD6C3]/40 via-[#3DD6C3]/20 to-[#3DD6C3]/40 origin-top"
          style={{ height: '100%', scaleY: scrollYProgress }}
        />
      </div>

      {/* Mobile waypoints */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`mobile-wp-${i}`}
          className="absolute left-6 -translate-x-1/2 z-10 md:hidden"
          style={{ top: `${22 + i * 30}%` }}
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <div className="w-3 h-3 rounded-full bg-[#3DD6C3] shadow-[0_0_8px_rgba(61,214,195,0.4)]" />
        </motion.div>
      ))}

      {/* Desktop waypoints */}
      <Waypoint index={0} />
      <Waypoint index={1} />
      <Waypoint index={2} />

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          className="text-center mb-16 md:mb-24"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[#3DD6C3] font-bold text-sm tracking-widest uppercase mb-3">One System</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D]">
            Three ways to grow your income —<br className="hidden md:block" /> all on autopilot.
          </h2>
        </motion.div>

        {/* Feature nodes */}
        {FEATURES.map((feature, i) => (
          <FeatureNode key={feature.headline} {...feature} index={i} />
        ))}

        {/* Footer */}
        <motion.div
          className="text-center mt-20 md:mt-28"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xl md:text-2xl font-extrabold text-[#0D4D4D]">
            Retention + Referrals + Rewrites.
          </p>
          <p className="text-[#6B7280] text-lg mt-2">
            That&apos;s how you <span className="text-[#3DD6C3] font-bold">3x</span>.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
