'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';

/* ─── Shared: looping step hook ─── */

function useLoopingSequence(
  stepDurations: number[],
  isInView: boolean
): number {
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!isInView) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => {
      setStep((s) => (s + 1) % stepDurations.length);
    }, stepDurations[step]);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step, isInView, stepDurations]);

  useEffect(() => {
    if (isInView) setStep(0);
  }, [isInView]);

  return step;
}

/* ─── Shared: phone frame ─── */

function PhoneFrame({ children, height = 'h-[300px]' }: { children: React.ReactNode; height?: string }) {
  return (
    <div className={`bg-[#1a1a2e] rounded-2xl overflow-hidden shadow-2xl ${height} relative`}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
        <span className="text-white/40 text-[9px] font-medium">9:41</span>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-2 border border-white/40 rounded-sm relative">
            <div className="absolute inset-0.5 bg-white/40 rounded-[1px]" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
      <div className="px-3 pb-3 flex-1 overflow-hidden relative" style={{ height: 'calc(100% - 28px)' }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Notification component ─── */

function PushNotification({
  icon,
  iconBg,
  title,
  body,
  accent = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <div className={`bg-white/10 backdrop-blur-sm rounded-xl p-3 border ${accent ? 'border-red-400/40' : 'border-white/5'}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-bold ${accent ? 'text-red-300' : 'text-white/90'}`}>{title}</p>
          <p className="text-white/70 text-[10px] leading-snug mt-0.5">{body}</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   RETENTION ANIMATION
   ═══════════════════════════════════════════════════ */

const RETENTION_DURATIONS = [2000, 2000, 1500, 2500, 2000];

const retentionNotifications = [
  {
    icon: <span className="text-white text-[10px]">🎄</span>,
    iconBg: 'bg-red-500',
    title: 'Holiday Touchpoint',
    body: 'Merry Christmas, Sarah! Wishing you and your family a wonderful holiday. — Daniel',
  },
  {
    icon: <span className="text-white text-[10px]">🎂</span>,
    iconBg: 'bg-purple-500',
    title: 'Birthday Touchpoint',
    body: 'Happy birthday, Sarah! Hope you have an amazing day. — Daniel',
  },
];

export function RetentionAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: 0.4 });
  const step = useLoopingSequence(RETENTION_DURATIONS, isInView);

  return (
    <div className="flex flex-col" ref={ref}>
      <h3 className="text-2xl font-extrabold text-[#0D4D4D] mb-2">Zero clients lost to silence.</h3>
      <p className="text-[#6B7280] text-sm leading-relaxed mb-5">7+ automated touchpoints per year. When a policy slips, forward one email — AI handles the rest.</p>

      <PhoneFrame>
        <div className="flex flex-col gap-2.5 pt-1 h-full">
          <AnimatePresence mode="wait">
            {/* Step 0-1: holiday notifications */}
            {step <= 1 && (
              <motion.div
                key={`notif-${step}`}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
              >
                <PushNotification
                  icon={retentionNotifications[step].icon}
                  iconBg={retentionNotifications[step].iconBg}
                  title={retentionNotifications[step].title}
                  body={retentionNotifications[step].body}
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['Christmas', 'New Year\'s', 'Birthday', 'Anniversary'].map((t, i) => (
                    <span
                      key={t}
                      className={`px-2 py-0.5 rounded text-[8px] transition-colors duration-300 ${
                        (step === 0 && i === 0) || (step === 1 && i === 2)
                          ? 'bg-[#3DD6C3]/30 text-[#3DD6C3]'
                          : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Conservation alert arrives */}
            {step === 2 && (
              <motion.div
                key="conservation-alert"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <PushNotification
                  icon={<span className="text-white text-[10px]">⚠</span>}
                  iconBg="bg-red-500"
                  title="Conservation Alert"
                  body="Sarah's auto policy is at risk of lapsing."
                  accent
                />
              </motion.div>
            )}

            {/* Step 3: AI takes over — timeline */}
            {step === 3 && (
              <motion.div
                key="ai-timeline"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-0"
              >
                <PushNotification
                  icon={<span className="text-white text-[10px]">⚠</span>}
                  iconBg="bg-red-500"
                  title="Conservation Alert"
                  body="Sarah's auto policy is at risk of lapsing."
                  accent
                />
                <div className="mt-3 ml-1 space-y-0">
                  {[
                    { label: 'Client identified', delay: 0 },
                    { label: 'Personalized outreach sent', delay: 0.4 },
                    { label: 'Follow-up drip scheduled', delay: 0.8 },
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: item.delay, duration: 0.3 }}
                      className="flex items-center gap-2 py-1.5"
                    >
                      <div className="w-5 h-5 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center flex-shrink-0">
                        <motion.svg
                          className="w-3 h-3 text-[#3DD6C3]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ delay: item.delay + 0.15, duration: 0.25 }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </motion.svg>
                      </div>
                      <span className="text-white/80 text-[10px]">{item.label}</span>
                      {i < 2 && (
                        <div className="absolute left-[9px] mt-7 w-px h-2 bg-[#3DD6C3]/20" />
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 4: Resolution */}
            {step === 4 && (
              <motion.div
                key="resolution"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center h-full"
              >
                <div className="w-14 h-14 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-[#3DD6C3] text-sm font-bold">Policy Saved</p>
                <p className="text-white/50 text-[10px] mt-1">Sarah rebooked before the lapse date</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PhoneFrame>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   REFERRAL ANIMATION
   ═══════════════════════════════════════════════════ */

const REFERRAL_DURATIONS = [2000, 1200, 1500, 1200, 1500, 2000];

export function ReferralAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: 0.4 });
  const step = useLoopingSequence(REFERRAL_DURATIONS, isInView);

  return (
    <div className="flex flex-col" ref={ref}>
      <h3 className="text-2xl font-extrabold text-[#0D4D4D] mb-2">Referrals that book themselves.</h3>
      <p className="text-[#6B7280] text-sm leading-relaxed mb-5">Client taps one button. AI qualifies via iMessage and books on your calendar.</p>

      <PhoneFrame>
        <AnimatePresence mode="wait">
          {/* Step 0: Client app with Refer button */}
          {step === 0 && (
            <motion.div
              key="refer-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center h-full gap-4"
            >
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center mx-auto mb-2">
                  <span className="text-[#3DD6C3] text-lg font-bold">D</span>
                </div>
                <p className="text-white text-xs font-semibold">Daniel Roberts</p>
                <p className="text-white/50 text-[10px]">Your Insurance Agent</p>
              </div>
              <motion.div
                className="bg-[#3DD6C3] rounded-xl px-6 py-2.5 cursor-pointer"
                animate={{ scale: [1, 0.95, 1] }}
                transition={{ delay: 1.2, duration: 0.3 }}
              >
                <span className="text-[#0D4D4D] text-xs font-bold">Refer Your Agent</span>
              </motion.div>
              <motion.div
                className="absolute bottom-6 left-1/2 -translate-x-1/2"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ delay: 1, duration: 0.6 }}
              >
                <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-white/30" />
              </motion.div>
            </motion.div>
          )}

          {/* Step 1-4: iMessage conversation */}
          {step >= 1 && step <= 4 && (
            <motion.div
              key="imessage"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col h-full"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-3">
                <div className="w-6 h-6 rounded-full bg-[#0B93F6]/30 flex items-center justify-center">
                  <span className="text-[#0B93F6] text-[8px] font-bold">M</span>
                </div>
                <span className="text-white/70 text-[10px] font-medium">Mike Johnson</span>
                <span className="ml-auto px-1.5 py-0.5 bg-[#0B93F6]/20 rounded text-[#0B93F6] text-[7px]">iMessage</span>
              </div>

              <div className="space-y-2.5 flex-1">
                {/* AI message 1 */}
                {step >= 1 && (
                  <motion.div
                    className="flex justify-start"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="bg-white/10 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%]">
                      <p className="text-white/90 text-[10px] leading-snug">Hey Mike, Sarah connected us — would you be open to a couple quick questions?</p>
                    </div>
                  </motion.div>
                )}

                {/* Typing indicator or reply */}
                {step === 1 && (
                  <motion.div
                    className="flex justify-end"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="bg-[#0B93F6]/30 rounded-2xl px-3 py-2">
                      <div className="flex gap-1">
                        <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity }} />
                        <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }} />
                        <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }} />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Mike's reply */}
                {step >= 2 && (
                  <motion.div
                    className="flex justify-end"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="bg-[#0B93F6] rounded-2xl rounded-br-sm px-3 py-2 max-w-[60%]">
                      <p className="text-white text-[10px] leading-snug">yeah sure</p>
                    </div>
                  </motion.div>
                )}

                {/* AI sends calendar */}
                {step >= 3 && (
                  <motion.div
                    className="flex justify-start"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="bg-white/10 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%]">
                      <p className="text-white/90 text-[10px] leading-snug">Perfect! Here&apos;s my calendar to grab a time:</p>
                      <p className="text-[#3DD6C3] text-[10px] underline mt-0.5">calendly.com/daniel</p>
                    </div>
                  </motion.div>
                )}

                {/* Booked badge */}
                {step >= 4 && (
                  <motion.div
                    className="flex justify-center mt-3"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div className="flex items-center gap-2 bg-[#3DD6C3]/20 border border-[#3DD6C3]/30 rounded-full px-4 py-1.5">
                      <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[#3DD6C3] text-[10px] font-bold">Appointment Booked</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 5: hold final state briefly before loop */}
          {step === 5 && (
            <motion.div
              key="referral-done"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="flex flex-col items-center justify-center h-full"
            >
              <div className="w-14 h-14 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[#3DD6C3] text-sm font-bold">Referral Closed</p>
              <p className="text-white/50 text-[10px] mt-1">Zero effort from you</p>
            </motion.div>
          )}
        </AnimatePresence>
      </PhoneFrame>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   REWRITE / ANNIVERSARY ANIMATION
   ═══════════════════════════════════════════════════ */

const REWRITE_DURATIONS = [2500, 1500, 2000, 1500, 2500];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MiniCalendar({ highlightMonth, highlightDay, rushing }: { highlightMonth: number; highlightDay: number; rushing: boolean }) {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  return (
    <div className="bg-white/5 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/90 text-[11px] font-bold">{MONTHS[highlightMonth]} 2026</span>
        <div className="flex gap-1">
          <div className="w-4 h-4 rounded bg-white/5 flex items-center justify-center"><span className="text-white/30 text-[8px]">‹</span></div>
          <div className="w-4 h-4 rounded bg-white/5 flex items-center justify-center"><span className="text-white/30 text-[8px]">›</span></div>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px text-center mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={`h-${i}`} className="text-white/30 text-[7px]">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px text-center">
        {days.map((d) => {
          const isHighlight = !rushing && d === highlightDay;
          return (
            <div
              key={d}
              className={`py-0.5 rounded text-[7px] transition-all duration-200 ${
                isHighlight
                  ? 'bg-[#fdcc02] text-[#0D4D4D] font-bold'
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

export function RewriteAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: 0.4 });
  const step = useLoopingSequence(REWRITE_DURATIONS, isInView);

  const [calMonth, setCalMonth] = useState(0);

  useEffect(() => {
    if (step !== 0) return;
    setCalMonth(0);
    const iv = setInterval(() => {
      setCalMonth((m) => {
        if (m >= 7) { clearInterval(iv); return 7; }
        return m + 1;
      });
    }, 250);
    return () => clearInterval(iv);
  }, [step]);

  return (
    <div className="flex flex-col" ref={ref}>
      <h3 className="text-2xl font-extrabold text-[#0D4D4D] mb-2">Every anniversary is a booked appointment.</h3>
      <p className="text-[#6B7280] text-sm leading-relaxed mb-5">30 days out, your client hears from you — not the carrier. They book themselves.</p>

      <PhoneFrame>
        <div className="flex flex-col h-full pt-1">
          <AnimatePresence mode="wait">
            {/* Step 0: Calendar fast-forwarding */}
            {step === 0 && (
              <motion.div
                key="cal-rush"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <MiniCalendar highlightMonth={calMonth} highlightDay={15} rushing={calMonth < 7} />
                <motion.div
                  className="text-center mt-3"
                  animate={{ opacity: calMonth < 7 ? 0.5 : 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-white/40 text-[9px]">
                    {calMonth < 7 ? 'Monitoring policy dates...' : ''}
                  </p>
                  {calMonth >= 7 && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-center gap-1.5 mt-1"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#fdcc02] animate-pulse" />
                      <span className="text-[#fdcc02] text-[9px] font-bold">Anniversary detected — Aug 15</span>
                    </motion.div>
                  )}
                </motion.div>
              </motion.div>
            )}

            {/* Step 1: Calendar settled, notification incoming */}
            {step === 1 && (
              <motion.div
                key="cal-settled"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <MiniCalendar highlightMonth={7} highlightDay={15} rushing={false} />
                <motion.div
                  className="mt-3"
                  initial={{ opacity: 0, y: -15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.35 }}
                >
                  <PushNotification
                    icon={<span className="text-[10px]">📱</span>}
                    iconBg="bg-[#fdcc02]"
                    title="AgentForLife"
                    body="Your agent just found a better deal on your auto coverage. Book with them now."
                  />
                </motion.div>
              </motion.div>
            )}

            {/* Step 2: Notification tapped, transition to booking */}
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
                  transition={{ delay: 0.5, duration: 0.25 }}
                >
                  <PushNotification
                    icon={<span className="text-[10px]">📱</span>}
                    iconBg="bg-[#fdcc02]"
                    title="AgentForLife"
                    body="Your agent just found a better deal on your auto coverage. Book with them now."
                  />
                </motion.div>
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0, 1] }}
                  transition={{ delay: 0.8, duration: 0.4 }}
                >
                  <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-white/30" />
                </motion.div>
              </motion.div>
            )}

            {/* Step 3: Booking calendar */}
            {step === 3 && (
              <motion.div
                key="booking"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col h-full"
              >
                <div className="text-center mb-3">
                  <p className="text-white text-xs font-bold">Book with Daniel</p>
                  <p className="text-white/50 text-[9px]">30-min policy review</p>
                </div>
                <div className="space-y-1.5 flex-1">
                  {['10:00 AM', '11:30 AM', '2:00 PM', '3:30 PM'].map((time, i) => (
                    <motion.div
                      key={time}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.12, duration: 0.25 }}
                      className={`py-2 px-3 rounded-lg border text-center transition-all duration-300 ${
                        i === 1
                          ? 'bg-[#3DD6C3]/20 border-[#3DD6C3]/40'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <span className={`text-[10px] font-medium ${i === 1 ? 'text-[#3DD6C3]' : 'text-white/60'}`}>{time}</span>
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
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="flex flex-col items-center justify-center h-full"
              >
                <motion.div
                  className="w-14 h-14 rounded-full bg-[#3DD6C3]/20 flex items-center justify-center mb-3"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.15 }}
                >
                  <svg className="w-7 h-7 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <p className="text-[#3DD6C3] text-sm font-bold">Appointment Booked</p>
                <p className="text-white/50 text-[10px] mt-1">Tue Aug 12 · 11:30 AM</p>
                <p className="text-white/30 text-[9px] mt-0.5">Sarah booked herself — no calls needed</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PhoneFrame>
    </div>
  );
}
