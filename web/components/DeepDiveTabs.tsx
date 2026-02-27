'use client';

import { useState } from 'react';

const holidayThemes: Record<string, { gradient: string; emoji: string; label: string; greeting: string; body: string; floatingEmoji: string[]; accent: string }> = {
  christmas: {
    gradient: 'linear-gradient(135deg, #8B0000, #C41E3A, #A0153E)',
    emoji: '🎄',
    label: 'Christmas',
    greeting: 'Merry Christmas, Sarah!',
    body: 'Wishing you and your family a season full of warmth, joy, and time together. It\u2019s a privilege to be your agent \u2014 I hope this holiday brings you everything you deserve.',
    floatingEmoji: ['\u2744\uFE0F', '\uD83C\uDF84', '\u2B50'],
    accent: '#D4A843',
  },
  newyear: {
    gradient: 'linear-gradient(135deg, #0B1A3E, #162D6E, #1A3A8A)',
    emoji: '🎆',
    label: "New Year\u2019s",
    greeting: 'Happy New Year, Sarah!',
    body: 'Here\u2019s to a fresh start and a year full of good things. I\u2019m honored to be the one looking out for you and your family \u2014 let\u2019s make this year a great one.',
    floatingEmoji: ['\uD83C\uDF86', '\u2728', '\uD83C\uDF87'],
    accent: '#C0C0C0',
  },
  valentines: {
    gradient: 'linear-gradient(135deg, #9B1B30, #D63B5C, #E8839B)',
    emoji: '💝',
    label: "Valentine\u2019s",
    greeting: "Happy Valentine\u2019s Day, Sarah!",
    body: 'Today is all about the people who matter most \u2014 and protecting the ones you love is something I never take lightly. Enjoy every moment with your loved ones today.',
    floatingEmoji: ['\u2764\uFE0F', '\uD83D\uDC95', '\uD83D\uDC96', '\uD83D\uDC97'],
    accent: '#FFB6C1',
  },
  july4th: {
    gradient: 'linear-gradient(135deg, #002868, #BF0A30, #002868)',
    emoji: '🇺🇸',
    label: '4th of July',
    greeting: 'Happy 4th of July, Sarah!',
    body: 'Wishing you a day full of good food, great company, and maybe a few fireworks. Enjoy the celebration \u2014 you and your family deserve it.',
    floatingEmoji: ['\uD83C\uDDFA\uD83C\uDDF8', '\uD83C\uDF86', '\u2B50'],
    accent: '#FFFFFF',
  },
  thanksgiving: {
    gradient: 'linear-gradient(135deg, #8B4513, #BF6A20, #D4892A)',
    emoji: '🍂',
    label: 'Thanksgiving',
    greeting: 'Happy Thanksgiving, Sarah!',
    body: 'I\u2019m grateful for the trust you place in me to protect what matters most to your family. I hope your table is full and your heart is fuller. Enjoy every bite.',
    floatingEmoji: ['\uD83C\uDF42', '\uD83C\uDF41', '\uD83C\uDF43'],
    accent: '#DAA520',
  },
};

export default function DeepDiveTabs() {
  const [activeHoliday, setActiveHoliday] = useState('christmas');
  const activeTheme = holidayThemes[activeHoliday];

  return (
    <section className="py-20 md:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#0D4D4D] mb-3">
            Explore the <span className="text-[#3DD6C3]">System</span>
          </h2>
        </div>

        <div className="space-y-10 md:space-y-16">
          {/* ═══════════════════════════════════════════
              RETENTION CARD
              ═══════════════════════════════════════════ */}
          <div className="bg-[#F8F9FA] rounded-3xl p-6 md:p-10 border border-gray-200 overflow-hidden">
            <div className="grid md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-start">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full mb-5">
                  <svg className="w-4 h-4 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Retention</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-[#0D4D4D] mb-4">
                  Two Layers of Protection. <span className="text-[#3DD6C3]">Zero Effort.</span>
                </h3>
                <p className="text-[#6B7280] text-base md:text-lg leading-relaxed mb-5">
                  <span className="text-[#0D4D4D] font-bold">7+ automated touchpoints per year</span> — holiday cards, birthday messages, and anniversary alerts — all as push notifications to their phone. When a policy <em>does</em> lapse, forward the carrier notice and AI sends personalized outreach within hours to save it.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['5 Holidays', 'Birthdays', 'Anniversaries', 'Conservation Alerts'].map((tag) => (
                    <span key={tag} className="px-3 py-1 bg-[#0D4D4D]/5 text-[#0D4D4D] text-xs font-semibold rounded-full border border-[#0D4D4D]/10">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div className="w-[220px] h-[430px] bg-[#1a1a1a] rounded-[2.5rem] p-2.5 shadow-2xl border-4 border-[#2a2a2a] flex-shrink-0">
                  <div key={activeHoliday} className="w-full h-full rounded-[2rem] overflow-hidden relative" style={{ background: activeTheme.gradient }}>
                    {activeTheme.floatingEmoji.map((em: string, i: number) => (
                      <span key={i} className="absolute text-lg pointer-events-none" style={{ left: `${10 + i * 25}%`, animation: `floatDrift ${6 + i * 2}s ease-in-out infinite`, animationDelay: `${i * 1.8}s`, opacity: 0 }}>{em}</span>
                    ))}
                    <div className="flex flex-col items-center justify-center h-full px-4 text-center relative z-10">
                      <div className="w-[72px] h-[72px] rounded-full border-[3px] border-white/40 bg-white/15 flex items-center justify-center mb-4" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
                        <span className="text-[30px] font-bold text-white">D</span>
                      </div>
                      <p className="text-white font-bold text-[13px] mb-0.5">Daniel Roberts</p>
                      <p className="text-white/60 text-[10px] mb-4">Roberts Insurance Agency</p>
                      <p className="text-white font-extrabold text-[18px] leading-tight mb-2">{activeTheme.greeting}</p>
                      <p className="text-white/80 text-[11px] leading-relaxed mb-5 px-1 line-clamp-3">{activeTheme.body}</p>
                      <div className="px-5 py-2 rounded-xl text-[12px] font-bold shadow-md" style={{ backgroundColor: activeTheme.accent, color: ['#FFFFFF', '#FFD700', '#C0C0C0', '#FFB6C1', '#DAA520'].includes(activeTheme.accent) ? '#1A1A2E' : '#FFFFFF' }}>
                        Book your appointment
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                  {Object.entries(holidayThemes).map(([key, theme]) => (
                    <button key={key} onClick={() => setActiveHoliday(key)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${activeHoliday === key ? 'bg-[#0D4D4D] text-white shadow-md scale-105' : 'bg-gray-200 text-[#6B7280] hover:bg-gray-300'}`}>
                      {theme.emoji} {theme.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════
              REFERRALS CARD
              ═══════════════════════════════════════════ */}
          <div className="bg-[#F8F9FA] rounded-3xl p-6 md:p-10 border border-gray-200 overflow-hidden">
            <div className="grid md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-start">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fdcc02] rounded-full mb-5">
                  <span className="text-[#0D4D4D] font-bold text-sm uppercase tracking-wide">Referrals</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-[#0D4D4D] mb-4">
                  From <span className="text-[#3DD6C3]">One Tap</span> to <span className="text-[#fdcc02]">Booked Appointment</span>.
                </h3>
                <p className="text-[#6B7280] text-base md:text-lg leading-relaxed mb-5">
                  Your client taps one button, picks a contact, and sends a warm intro text with your business card attached. Then your <span className="text-[#0D4D4D] font-bold">AI reaches out via iMessage</span> — texting as you, qualifying the lead, and booking them on your calendar. You just show up and close.
                </p>
                <div className="bg-[#0D4D4D] rounded-xl p-4 md:p-5">
                  <p className="text-white/40 text-xs uppercase tracking-[0.15em] font-medium mb-2">If they don&apos;t reply, AI follows up</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1.5 bg-white/10 rounded-full text-white/80 text-xs font-medium">Day 2 · Gentle nudge</span>
                    <span className="px-3 py-1.5 bg-white/10 rounded-full text-white/80 text-xs font-medium">Day 5 · New angle</span>
                    <span className="px-3 py-1.5 bg-[#fdcc02]/20 border border-[#fdcc02]/30 rounded-full text-[#fdcc02] text-xs font-medium">Day 8 · Direct ask</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center w-full md:w-[280px] flex-shrink-0">
                <p className="text-[#6B7280] text-xs text-center mb-3 uppercase tracking-[0.2em] font-medium">What the referral sees</p>
                <div className="bg-[#1a1a2e] rounded-[2rem] p-1.5 shadow-2xl border border-[#3DD6C3]/20 w-full max-w-[300px]">
                  <div className="bg-[#111] rounded-t-[1.6rem] px-4 pt-2.5 pb-1.5 flex items-center justify-between">
                    <span className="text-white/40 text-[10px] font-medium">9:44 AM</span>
                    <div className="flex gap-0.5"><div className="w-1 h-2 bg-white/40 rounded-sm"></div><div className="w-1 h-2.5 bg-white/40 rounded-sm"></div><div className="w-1 h-3 bg-white/40 rounded-sm"></div><div className="w-1 h-3.5 bg-white/30 rounded-sm"></div></div>
                  </div>
                  <div className="bg-[#111] px-4 pb-2.5 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#005851] flex items-center justify-center"><span className="text-[#3DD6C3] text-[10px] font-bold">D</span></div>
                      <div><p className="text-white text-xs font-semibold">Daniel</p><p className="text-white/30 text-[9px]">AI Referral Assistant</p></div>
                    </div>
                  </div>
                  <div className="bg-[#111] px-3 py-3 space-y-2 rounded-b-[1.6rem]">
                    <div className="flex justify-end"><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[11px] leading-snug">Hey Mike, this is Daniel. Sarah connected us — would you be open to a couple quick questions?</p></div></div>
                    <div className="flex justify-start"><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[11px]">yeah sure</p></div></div>
                    <div className="flex justify-end"><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[11px] leading-snug">What&apos;s most important to you when it comes to protecting your family?</p></div></div>
                    <div className="flex justify-start"><div className="bg-[#333] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[11px]">making sure my wife and kids are taken care of</p></div></div>
                    <div className="flex justify-end"><div className="bg-[#005851] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[88%]"><p className="text-white text-[11px] leading-snug">I think a quick 15-min call would be worth it. Here&apos;s my calendar:</p><p className="text-[#3DD6C3] text-[11px] mt-1 underline">calendly.com/daniel</p></div></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 px-3 py-1.5 bg-[#3DD6C3]/10 border border-[#3DD6C3]/20 rounded-full">
                  <svg className="w-3 h-3 text-[#3DD6C3]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-[#3DD6C3] text-[10px] font-bold uppercase tracking-wide">The referral thinks they&apos;re texting you</span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════
              REWRITES CARD
              ═══════════════════════════════════════════ */}
          <div className="bg-[#F8F9FA] rounded-3xl p-6 md:p-10 border border-gray-200 overflow-hidden">
            <div className="grid md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-start">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D4D4D] rounded-full mb-5">
                  <span className="text-[#3DD6C3] font-bold text-sm uppercase tracking-wide">Rewrites</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-[#0D4D4D] mb-4">
                  Every Anniversary Is a <span className="text-[#3DD6C3]">Booked Appointment</span>.
                </h3>
                <p className="text-[#6B7280] text-base md:text-lg leading-relaxed mb-5">
                  30 days before every policy anniversary, your client gets a push notification that you may have found them a <span className="text-[#0D4D4D] font-bold">lower price for the same coverage</span> — with a link to book on your calendar. The rewrite conversation starts with <em>them</em> reaching out to <em>you</em>.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['30-Day Alerts', 'Push Notifications', 'Auto-Booking', 'Email Digest'].map((tag) => (
                    <span key={tag} className="px-3 py-1 bg-[#0D4D4D]/5 text-[#0D4D4D] text-xs font-semibold rounded-full border border-[#0D4D4D]/10">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="w-full md:w-[280px] flex-shrink-0">
                <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-lg">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 bg-[#0D4D4D] rounded-full flex items-center justify-center flex-shrink-0"><span className="text-[#3DD6C3] text-xs font-bold">D</span></div>
                    <div><p className="text-[#0D4D4D] font-semibold text-sm">Daniel Roberts</p><p className="text-[#6B7280] text-xs">Your Agent</p></div>
                  </div>
                  <div className="bg-[#F8F9FA] rounded-xl p-3.5 border border-gray-100">
                    <p className="text-[#0D4D4D] text-sm leading-relaxed">&quot;Hey Sarah! Your policy anniversary is coming up and I&apos;ve been seeing some <span className="font-bold text-[#3DD6C3]">lower rates for the same coverage</span>. Want me to run the numbers? Tap below to grab a time.&quot;</p>
                  </div>
                  <div className="mt-4 text-center">
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3DD6C3] text-[#0D4D4D] text-sm font-bold rounded-xl">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Book with Daniel
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            YOUR COMMAND CENTER (unchanged)
            ═══════════════════════════════════════════ */}
        <div className="mt-16 bg-[#0D4D4D] rounded-3xl p-6 md:p-10 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 right-10 w-64 h-64 bg-[#3DD6C3] rounded-full blur-[120px] opacity-10" />
          </div>
          <div className="relative grid md:grid-cols-[1fr_1.2fr] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full mb-4">
                <svg className="w-3.5 h-3.5 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span className="text-white/70 text-xs font-bold uppercase tracking-wide">Your Dashboard</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-extrabold text-white mb-3">
                Your Command Center. <span className="text-[#3DD6C3]">One Screen.</span>
              </h3>
              <p className="text-white/60 text-sm leading-relaxed mb-5">
                Conservation alerts, referral pipeline, client management, policy tracking — everything in one clean dashboard.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Clients', color: '#3DD6C3' },
                  { label: 'Policies', color: '#fdcc02' },
                  { label: 'Alerts', color: '#EF4444' },
                  { label: 'Import', color: '#3DD6C3' },
                ].map((b) => (
                  <span key={b.label} className="px-3 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-white/80">{b.label}</span>
                ))}
              </div>
            </div>

            <div className="hidden md:block">
              <div className="bg-[#1a1a2e] rounded-xl overflow-hidden border border-white/10 shadow-xl">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-[#111] border-b border-white/5">
                  <div className="w-2 h-2 rounded-full bg-[#FF5F57]"></div>
                  <div className="w-2 h-2 rounded-full bg-[#FEBC2E]"></div>
                  <div className="w-2 h-2 rounded-full bg-[#28C840]"></div>
                  <div className="flex-1 mx-2"><div className="bg-white/10 rounded px-2 py-0.5 text-white/30 text-[9px] font-mono">agentforlife.app/dashboard</div></div>
                </div>
                <div className="bg-[#F8F9FA] p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#0D4D4D] font-bold text-[11px]">Conservation Alerts</span>
                      <span className="px-1.5 py-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full">3</span>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {[
                      { init: 'S', name: 'Sarah J.', issue: 'Payment lapsed', status: 'Outreach sent', sc: '#3DD6C3' },
                      { init: 'M', name: 'Mike D.', issue: 'Carrier notice', status: 'AI reviewing', sc: '#F59E0B' },
                      { init: 'R', name: 'Robert C.', issue: 'Resolved', status: 'Saved \u2713', sc: '#22C55E' },
                    ].map((c, i) => (
                      <div key={i} className={`flex items-center justify-between px-2.5 py-2 text-[10px] ${i < 2 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-[#0D4D4D] flex items-center justify-center"><span className="text-white text-[7px] font-bold">{c.init}</span></div>
                          <span className="text-[#0D4D4D] font-semibold">{c.name}</span>
                        </div>
                        <span className="text-[#6B7280] text-[9px]">{c.issue}</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[8px] font-semibold" style={{ backgroundColor: `${c.sc}18`, color: c.sc }}>{c.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
