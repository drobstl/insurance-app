'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';

/* ═══════════════════════════════════════════════════
   SHARED UTILITIES
   ═══════════════════════════════════════════════════ */

function useLoopingSequence(stepDurations: number[], active: boolean): number {
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => {
      setStep((s) => (s + 1) % stepDurations.length);
    }, stepDurations[step]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [step, active, stepDurations]);

  useEffect(() => {
    if (active) setStep(0);
  }, [active]);

  return step;
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a2e] rounded-[2rem] overflow-hidden shadow-2xl w-[280px] h-[500px] relative mx-auto border-[3px] border-[#2a2a3e]">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#1a1a2e] rounded-b-2xl z-10" />
      <div className="flex items-center justify-between px-6 pt-3 pb-1 relative z-20">
        <span className="text-white/40 text-[10px] font-medium">9:41</span>
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-white/40" fill="currentColor" viewBox="0 0 24 24"><path d="M12.01 21.49L23.64 7c-.45-.34-4.93-4-11.64-4C5.28 3 .81 6.66.36 7l11.63 14.49.01.01.01-.01z"/></svg>
          <div className="w-4 h-2.5 border border-white/40 rounded-sm relative">
            <div className="absolute inset-0.5 bg-white/40 rounded-[1px]" style={{ width: '70%' }} />
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 overflow-hidden relative" style={{ height: 'calc(100% - 36px)' }}>
        {children}
      </div>
    </div>
  );
}

function PushNotification({
  icon, iconBg, title, body, accent = false,
}: {
  icon: React.ReactNode; iconBg: string; title: string; body: string; accent?: boolean;
}) {
  return (
    <div className={`bg-white/10 backdrop-blur-sm rounded-2xl p-3.5 border ${accent ? 'border-red-400/40' : 'border-white/5'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold ${accent ? 'text-red-300' : 'text-white/90'}`}>{title}</p>
          <p className="text-white/70 text-[11px] leading-snug mt-0.5">{body}</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TAB DATA
   ═══════════════════════════════════════════════════ */

const TABS = [
  {
    id: 'retention' as const,
    label: 'Retention',
    headline: 'Zero clients lost to silence.',
    description: '7+ automated touchpoints per year. When a policy slips, you forward one email — your AI system identifies the client, sends personalized outreach, and follows up until the policy is saved.',
  },
  {
    id: 'referrals' as const,
    label: 'Referrals',
    headline: 'Referrals that book themselves.',
    description: 'Your client taps one button in their app. AI reaches out to the referral via iMessage, qualifies them, and books directly on your calendar. You just show up.',
  },
  {
    id: 'rewrites' as const,
    label: 'Rewrites',
    headline: 'Every anniversary is a booked appointment.',
    description: '30 days before every policy anniversary, your client gets a push notification offering a better deal. They tap, pick a time, and book themselves.',
  },
];

type TabId = typeof TABS[number]['id'];

/* ═══════════════════════════════════════════════════
   RETENTION ANIMATION (corrected flow)
   ═══════════════════════════════════════════════════ */

const RETENTION_DURATIONS = [3500, 3500, 3000, 3500, 3000, 3500];

function RetentionContent({ active }: { active: boolean }) {
  const step = useLoopingSequence(RETENTION_DURATIONS, active);

  const notifications = [
    {
      icon: <span className="text-sm">🎄</span>,
      iconBg: 'bg-red-500',
      title: 'Holiday Touchpoint',
      body: 'Merry Christmas, Sarah! Wishing you and your family a wonderful holiday. — Daniel',
    },
    {
      icon: <span className="text-sm">🎂</span>,
      iconBg: 'bg-purple-500',
      title: 'Birthday Touchpoint',
      body: 'Happy birthday, Sarah! Hope you have an amazing day. — Daniel',
    },
  ];

  return (
    <div className="flex flex-col h-full pt-2">
      <AnimatePresence mode="wait">
        {/* Steps 0-1: Holiday touchpoints */}
        {step <= 1 && (
          <motion.div
            key={`holiday-${step}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            <PushNotification
              icon={notifications[step].icon}
              iconBg={notifications[step].iconBg}
              title={notifications[step].title}
              body={notifications[step].body}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {['Christmas', "New Year's", 'Birthday', 'Anniversary'].map((t, i) => (
                <span
                  key={t}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-medium transition-colors duration-500 ${
                    (step === 0 && i === 0) || (step === 1 && i === 2)
                      ? 'bg-[#3DD6C3]/25 text-[#3DD6C3] border border-[#3DD6C3]/30'
                      : 'bg-white/5 text-white/30 border border-white/5'
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Step 2: Agent forwards conservation email */}
        {step === 2 && (
          <motion.div
            key="forward-email"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center h-full gap-4"
          >
            <motion.div
              className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <svg className="w-7 h-7 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </motion.div>
            <div className="text-center">
              <p className="text-white/60 text-[10px] mb-2">You forwarded a conservation email</p>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.4 }}
                className="bg-white/5 rounded-xl px-4 py-3 border border-white/10"
              >
                <p className="text-[#3DD6C3] text-[10px] font-bold">AI identified Sarah</p>
                <p className="text-white/50 text-[9px] mt-1">Auto policy &middot; Lapsed payment</p>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Push notification to client */}
        {step === 3 && (
          <motion.div
            key="conservation-push"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <PushNotification
              icon={<span className="text-sm">🛡</span>}
              iconBg="bg-[#0D4D4D]"
              title="Message from Daniel"
              body="Hi Sarah, there may be an issue with your auto policy payment. Call State Farm at (800) 732-5246 to get it sorted — only takes a few minutes. — Daniel"
            />
            <motion.div
              className="mt-4 flex items-center gap-2 justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.4 }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#3DD6C3] animate-pulse" />
              <span className="text-white/40 text-[9px]">Sent via push notification + iMessage</span>
            </motion.div>
          </motion.div>
        )}

        {/* Step 4: Follow-up drip */}
        {step === 4 && (
          <motion.div
            key="drip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col gap-3"
          >
            <PushNotification
              icon={<span className="text-sm">🛡</span>}
              iconBg="bg-[#0D4D4D]"
              title="Message from Daniel"
              body="Hi Sarah, there may be an issue with your auto policy payment. Call State Farm at (800) 732-5246 to get it sorted — only takes a few minutes. — Daniel"
            />
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="bg-white/5 rounded-xl p-3 border border-white/10"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#fdcc02]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-[#fdcc02] text-[10px] font-bold">Follow-up sent — Day 2</span>
              </div>
              <p className="text-white/40 text-[9px] mt-1 ml-6">AI-generated follow-up via iMessage</p>
            </motion.div>
          </motion.div>
        )}

        {/* Step 5: Payment resolved celebration */}
        {step === 5 && (
          <motion.div
            key="resolved"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="flex flex-col items-center justify-center h-full"
          >
            <motion.div
              className="w-16 h-16 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center mb-4"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.15 }}
            >
              <svg className="w-8 h-8 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </motion.div>
            <p className="text-[#3DD6C3] text-base font-bold">Payment Resolved</p>
            <p className="text-white/50 text-[10px] mt-1">Sarah called and reinstated her policy</p>
            <motion.div
              className="mt-3 flex gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {['🎉', '✨', '🎉'].map((e, i) => (
                <motion.span
                  key={i}
                  className="text-sm"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 + i * 0.15 }}
                >
                  {e}
                </motion.span>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   REFERRAL ANIMATION (slower pacing)
   ═══════════════════════════════════════════════════ */

const REFERRAL_DURATIONS = [3000, 2000, 2200, 2000, 2500, 2500];

function ReferralContent({ active }: { active: boolean }) {
  const step = useLoopingSequence(REFERRAL_DURATIONS, active);

  return (
    <div className="flex flex-col h-full pt-2">
      <AnimatePresence mode="wait">
        {/* Step 0: Client app with Refer button */}
        {step === 0 && (
          <motion.div
            key="refer-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center justify-center h-full gap-5"
          >
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-[#3DD6C3] text-xl font-bold">D</span>
              </div>
              <p className="text-white text-sm font-semibold">Daniel Roberts</p>
              <p className="text-white/50 text-[11px]">Your Insurance Agent</p>
            </div>
            <motion.div
              className="bg-[#3DD6C3] rounded-xl px-8 py-3 cursor-pointer shadow-lg shadow-[#3DD6C3]/20"
              animate={{ scale: [1, 0.95, 1] }}
              transition={{ delay: 1.8, duration: 0.3 }}
            >
              <span className="text-[#0D4D4D] text-sm font-bold">Refer Your Agent</span>
            </motion.div>
            <motion.div
              className="absolute bottom-16 left-1/2 -translate-x-1/2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: [0, 0.8, 0.8, 0], scale: [0.8, 1, 1, 1.2] }}
              transition={{ delay: 1.6, duration: 0.8 }}
            >
              <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/30" />
            </motion.div>
          </motion.div>
        )}

        {/* Steps 1-4: iMessage conversation */}
        {step >= 1 && step <= 4 && (
          <motion.div
            key="imessage"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col h-full"
          >
            <div className="flex items-center gap-2.5 pb-3 border-b border-white/10 mb-4">
              <div className="w-7 h-7 rounded-full bg-[#0B93F6]/30 flex items-center justify-center">
                <span className="text-[#0B93F6] text-[9px] font-bold">M</span>
              </div>
              <span className="text-white/70 text-[11px] font-medium">Mike Johnson</span>
              <span className="ml-auto px-2 py-0.5 bg-[#0B93F6]/20 rounded text-[#0B93F6] text-[8px] font-medium">iMessage</span>
            </div>

            <div className="space-y-3 flex-1">
              {step >= 1 && (
                <motion.div
                  className="flex justify-start"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="bg-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[85%]">
                    <p className="text-white/90 text-[11px] leading-snug">Hey Mike, Sarah connected us — would you be open to a couple quick questions?</p>
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  className="flex justify-end"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <div className="bg-[#0B93F6]/30 rounded-2xl px-3.5 py-2.5">
                    <div className="flex gap-1.5">
                      <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} />
                      <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0.25 }} />
                      <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0.5 }} />
                    </div>
                  </div>
                </motion.div>
              )}

              {step >= 2 && (
                <motion.div
                  className="flex justify-end"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="bg-[#0B93F6] rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-[60%]">
                    <p className="text-white text-[11px] leading-snug">yeah sure</p>
                  </div>
                </motion.div>
              )}

              {step >= 3 && (
                <motion.div
                  className="flex justify-start"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="bg-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[85%]">
                    <p className="text-white/90 text-[11px] leading-snug">Perfect! Here&apos;s my calendar:</p>
                    <p className="text-[#3DD6C3] text-[11px] underline mt-1">calendly.com/daniel</p>
                  </div>
                </motion.div>
              )}

              {step >= 4 && (
                <motion.div
                  className="flex justify-center mt-4"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div className="flex items-center gap-2 bg-[#3DD6C3]/20 border border-[#3DD6C3]/30 rounded-full px-5 py-2">
                    <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-[#3DD6C3] text-[11px] font-bold">Appointment Booked</span>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Step 5: Fade-out before loop */}
        {step === 5 && (
          <motion.div
            key="referral-done"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1, delay: 1 }}
            className="flex flex-col items-center justify-center h-full"
          >
            <div className="w-16 h-16 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[#3DD6C3] text-base font-bold">Referral Closed</p>
            <p className="text-white/50 text-[10px] mt-1">Zero effort from you</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   REWRITE / ANNIVERSARY ANIMATION (slower pacing)
   ═══════════════════════════════════════════════════ */

const REWRITE_DURATIONS = [4000, 2500, 3000, 2500, 3500];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MiniCalendar({ highlightMonth, highlightDay, rushing }: { highlightMonth: number; highlightDay: number; rushing: boolean }) {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  return (
    <div className="bg-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/90 text-xs font-bold">{MONTHS[highlightMonth]} 2026</span>
        <div className="flex gap-1.5">
          <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center"><span className="text-white/30 text-[9px]">‹</span></div>
          <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center"><span className="text-white/30 text-[9px]">›</span></div>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={`h-${i}`} className="text-white/30 text-[8px] font-medium">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((d) => {
          const isHighlight = !rushing && d === highlightDay;
          return (
            <div
              key={d}
              className={`py-1 rounded-md text-[8px] transition-all duration-300 ${
                isHighlight
                  ? 'bg-[#fdcc02] text-[#0D4D4D] font-bold shadow-sm shadow-[#fdcc02]/30'
                  : 'text-white/40'
              }`}
            >
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RewriteContent({ active }: { active: boolean }) {
  const step = useLoopingSequence(REWRITE_DURATIONS, active);
  const [calMonth, setCalMonth] = useState(0);

  useEffect(() => {
    if (step !== 0) return;
    setCalMonth(0);
    const iv = setInterval(() => {
      setCalMonth((m) => {
        if (m >= 7) { clearInterval(iv); return 7; }
        return m + 1;
      });
    }, 400);
    return () => clearInterval(iv);
  }, [step]);

  return (
    <div className="flex flex-col h-full pt-2">
      <AnimatePresence mode="wait">
        {/* Step 0: Calendar fast-forwarding */}
        {step === 0 && (
          <motion.div
            key="cal-rush"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <MiniCalendar highlightMonth={calMonth} highlightDay={15} rushing={calMonth < 7} />
            <motion.div
              className="text-center mt-4"
              animate={{ opacity: calMonth < 7 ? 0.5 : 1 }}
              transition={{ duration: 0.3 }}
            >
              {calMonth < 7 && (
                <p className="text-white/30 text-[9px]">Monitoring policy dates...</p>
              )}
              {calMonth >= 7 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-2 mt-1"
                >
                  <div className="w-2 h-2 rounded-full bg-[#fdcc02] animate-pulse" />
                  <span className="text-[#fdcc02] text-[10px] font-bold">Anniversary detected — Aug 15</span>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Step 1: Push notification drops in */}
        {step === 1 && (
          <motion.div
            key="cal-notif"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <MiniCalendar highlightMonth={7} highlightDay={15} rushing={false} />
            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              <PushNotification
                icon={<span className="text-sm">📱</span>}
                iconBg="bg-[#fdcc02]"
                title="AgentForLife"
                body="Your agent just found a better deal on your auto coverage. Book with them now."
              />
            </motion.div>
          </motion.div>
        )}

        {/* Step 2: Tap notification */}
        {step === 2 && (
          <motion.div
            key="notif-tap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            <motion.div
              animate={{ scale: [1, 0.97, 1] }}
              transition={{ delay: 0.8, duration: 0.3 }}
            >
              <PushNotification
                icon={<span className="text-sm">📱</span>}
                iconBg="bg-[#fdcc02]"
                title="AgentForLife"
                body="Your agent just found a better deal on your auto coverage. Book with them now."
              />
            </motion.div>
            <motion.div
              className="flex items-center justify-center mt-10"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: [0, 0, 0.8, 0], scale: [0.8, 0.8, 1, 1.2] }}
              transition={{ delay: 0.6, duration: 1 }}
            >
              <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/30" />
            </motion.div>
          </motion.div>
        )}

        {/* Step 3: Booking calendar */}
        {step === 3 && (
          <motion.div
            key="booking"
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col h-full"
          >
            <div className="text-center mb-4">
              <p className="text-white text-sm font-bold">Book with Daniel</p>
              <p className="text-white/50 text-[10px]">30-min policy review</p>
            </div>
            <div className="space-y-2 flex-1">
              {['10:00 AM', '11:30 AM', '2:00 PM', '3:30 PM'].map((time, i) => (
                <motion.div
                  key={time}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.15, duration: 0.3 }}
                  className={`py-2.5 px-4 rounded-xl border text-center transition-all duration-500 ${
                    i === 1
                      ? 'bg-[#3DD6C3]/20 border-[#3DD6C3]/40'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <span className={`text-[11px] font-medium ${i === 1 ? 'text-[#3DD6C3]' : 'text-white/60'}`}>{time}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Step 4: Booked confirmation */}
        {step === 4 && (
          <motion.div
            key="booked"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="flex flex-col items-center justify-center h-full"
          >
            <motion.div
              className="w-16 h-16 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center mb-4"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.15 }}
            >
              <svg className="w-8 h-8 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <p className="text-[#3DD6C3] text-base font-bold">Appointment Booked</p>
            <p className="text-white/50 text-[10px] mt-1">Tue Aug 12 &middot; 11:30 AM</p>
            <p className="text-white/30 text-[9px] mt-0.5">Sarah booked herself — no calls needed</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TABBED SHOWCASE (main export)
   ═══════════════════════════════════════════════════ */

const TAB_DURATION = 20000;

export function SolutionShowcase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { amount: 0.3 });
  const [activeTab, setActiveTab] = useState<TabId>('retention');
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const TICK = 50;

  const switchTab = (id: TabId) => {
    setActiveTab(id);
    setProgress(0);
  };

  useEffect(() => {
    if (!isInView || paused) {
      if (progressRef.current) clearInterval(progressRef.current);
      return;
    }
    progressRef.current = setInterval(() => {
      setProgress((p) => {
        const next = p + (TICK / TAB_DURATION) * 100;
        if (next >= 100) {
          setActiveTab((curr) => {
            const idx = TABS.findIndex((t) => t.id === curr);
            return TABS[(idx + 1) % TABS.length].id;
          });
          return 0;
        }
        return next;
      });
    }, TICK);
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [isInView, paused, activeTab]);

  const activeData = TABS.find((t) => t.id === activeTab)!;

  return (
    <section
      ref={sectionRef}
      className="py-20 md:py-28 bg-[#F8F9FA]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Tabs */}
        <div className="flex justify-center gap-2 mb-12">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`relative px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer ${
                  isActive
                    ? 'bg-[#0D4D4D] text-white shadow-lg'
                    : 'bg-white text-[#6B7280] hover:bg-white/80 hover:text-[#0D4D4D]'
                }`}
              >
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 h-0.5 bg-[#3DD6C3] rounded-full transition-none" style={{ width: `${progress}%` }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Two-column layout: text + phone */}
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
          {/* Left: text */}
          <div className="flex-1 text-center md:text-left">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <h3 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-4">
                  {activeData.headline}
                </h3>
                <p className="text-[#6B7280] text-lg leading-relaxed">
                  {activeData.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right: phone */}
          <div className="flex-shrink-0">
            <PhoneFrame>
              <AnimatePresence mode="wait">
                {activeTab === 'retention' && (
                  <motion.div key="ret" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                    <RetentionContent active={activeTab === 'retention' && isInView} />
                  </motion.div>
                )}
                {activeTab === 'referrals' && (
                  <motion.div key="ref" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                    <ReferralContent active={activeTab === 'referrals' && isInView} />
                  </motion.div>
                )}
                {activeTab === 'rewrites' && (
                  <motion.div key="rew" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                    <RewriteContent active={activeTab === 'rewrites' && isInView} />
                  </motion.div>
                )}
              </AnimatePresence>
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
