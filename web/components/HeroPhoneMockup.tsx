'use client';

import { motion } from 'framer-motion';

function MiniNotification({ icon, title, body, accent }: { icon: string; title: string; body: string; accent: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 border border-white/5">
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
          <span className="text-xs">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white/90 text-[10px] font-bold leading-tight">{title}</p>
          <p className="text-white/50 text-[9px] leading-snug mt-0.5">{body}</p>
        </div>
      </div>
    </div>
  );
}

export default function HeroPhoneMockup() {
  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
    >
      {/* Glow behind phone */}
      <div className="absolute -inset-8 bg-[#3DD6C3] rounded-full blur-[80px] opacity-15 pointer-events-none" />

      {/* Phone frame */}
      <div className="relative w-[240px] h-[480px] md:w-[270px] md:h-[540px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a]">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#1a1a1a] rounded-b-2xl z-10" />

        {/* Screen */}
        <div className="w-full h-full bg-[#0a0a1a] rounded-[2rem] overflow-hidden relative">
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pt-3 pb-1">
            <span className="text-white/40 text-[8px] font-medium">9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-3 h-1.5 rounded-sm border border-white/30 relative">
                <div className="absolute inset-[1px] right-[2px] bg-[#3DD6C3] rounded-[1px]" />
              </div>
            </div>
          </div>

          {/* App header */}
          <div className="px-4 pt-2 pb-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#0D4D4D] flex items-center justify-center">
              <span className="text-[#3DD6C3] text-[10px] font-black">A</span>
            </div>
            <div>
              <p className="text-white text-[11px] font-bold leading-tight">AgentForLife</p>
              <p className="text-white/40 text-[8px]">Your Agent &middot; Daniel R.</p>
            </div>
          </div>

          {/* Notification stack */}
          <div className="px-3 space-y-2">
            <motion.div
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              <MiniNotification
                icon="🎄"
                title="Holiday Touchpoint"
                body="Merry Christmas, Sarah! Wishing you a wonderful holiday."
                accent="bg-red-500"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.1, duration: 0.5 }}
            >
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 border border-[#0B93F6]/20">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#0B93F6]/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#0B93F6] text-[9px] font-bold">M</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-white/90 text-[10px] font-bold leading-tight">AI Referral Chat</p>
                      <span className="px-1.5 py-px bg-[#0B93F6]/20 rounded text-[#0B93F6] text-[7px] font-medium">iMessage</span>
                    </div>
                    <p className="text-white/50 text-[9px] leading-snug mt-0.5">Mike: &quot;yeah sure, what do you need?&quot;</p>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-1 h-1 rounded-full bg-[#3DD6C3]" />
                      <span className="text-[#3DD6C3] text-[7px] font-medium">Appointment booked</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.4, duration: 0.5 }}
            >
              <MiniNotification
                icon="📅"
                title="Anniversary Rewrite"
                body="Your policy just hit 1 year. Tap to book a rate review."
                accent="bg-[#fdcc02]"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.7, duration: 0.5 }}
            >
              <div className="bg-white/5 rounded-xl p-2.5 border border-red-400/20">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs">⚠</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-red-300 text-[10px] font-bold leading-tight">Conservation Alert</p>
                    <p className="text-white/50 text-[9px] leading-snug mt-0.5">Lapsed payment detected — AI outreach sent</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Bottom nav hint */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-6 bg-gradient-to-t from-[#0a0a1a] via-[#0a0a1a]/80 to-transparent">
            <div className="flex justify-around">
              {['Home', 'Policies', 'Refer', 'Contact'].map((label, i) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <div className={`w-5 h-5 rounded-md ${i === 0 ? 'bg-[#3DD6C3]/20' : 'bg-white/5'} flex items-center justify-center`}>
                    <div className={`w-2 h-2 rounded-sm ${i === 0 ? 'bg-[#3DD6C3]' : 'bg-white/20'}`} />
                  </div>
                  <span className={`text-[7px] font-medium ${i === 0 ? 'text-[#3DD6C3]' : 'text-white/30'}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
