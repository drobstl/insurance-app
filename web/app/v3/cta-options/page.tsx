"use client";
import { useState } from "react";

export default function CTAOptionsPage() {
  const [orbExpanded, setOrbExpanded] = useState(false);
  const [bookmarkExpanded, setBookmarkExpanded] = useState(false);
  const [toastDismissed, setToastDismissed] = useState(false);

  const MockNav = ({ children, splitTone }: { children?: React.ReactNode; splitTone?: boolean }) => (
    <div className="relative w-full h-14 sm:h-16 bg-[#0D4D4D] flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <div className="w-10 h-6 bg-white/20 rounded" />
        <span className="text-white font-semibold text-sm">AgentForLife</span>
      </div>
      {children}
      {splitTone ? (
        <div className="absolute right-0 top-0 bottom-0 bg-[#a158ff] flex items-center justify-center px-6 cursor-pointer hover:bg-[#8a3ee8] transition-colors" style={{ width: '22%', minWidth: '160px' }}>
          <div className="text-center">
            <p className="text-white font-bold text-xs sm:text-sm leading-tight">50 Free Spots</p>
            <p className="text-white/80 text-[10px] sm:text-xs">Apply Now →</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-xs">Login</span>
          <span className="px-3 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-semibold rounded-full">Get Started</span>
        </div>
      )}
    </div>
  );

  const HeroArea = () => (
    <div className="w-full flex-1 bg-[#0D4D4D] flex items-center justify-center">
      <div className="text-center px-4">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Hero Section Preview</p>
        <p className="text-white font-bold text-lg sm:text-xl">Your Insurance Business,<br /><span className="text-[#3DD6C3]">On Autopilot.</span></p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] py-8 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0D4D4D] mb-2">CTA Style Options</h1>
          <p className="text-[#6B7280] max-w-xl mx-auto">Pick the founding member announcement style you like best. Each preview shows how it would appear on the live page.</p>
        </div>

        <div className="space-y-10">

          {/* ========== 1. CORNER RIBBON ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">1</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Corner Ribbon</h2>
              <span className="text-sm text-[#6B7280]">Diagonal sash across top-right corner</span>
            </div>
            <div className="relative w-full h-[350px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col">
              <MockNav />
              <div className="absolute top-0 right-0 w-[180px] h-[180px] overflow-hidden z-10 pointer-events-none">
                <div
                  className="absolute top-[38px] right-[-52px] w-[220px] text-center py-2.5 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                    transform: 'rotate(45deg)',
                    boxShadow: '0 4px 20px rgba(161, 88, 255, 0.5)',
                  }}
                >
                  <p className="text-white font-bold text-[11px] leading-tight">50 FREE SPOTS</p>
                  <p className="text-white/80 text-[9px]">Apply Now →</p>
                </div>
              </div>
              <HeroArea />
            </div>
          </div>

          {/* ========== 2. PERSISTENT TOAST ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">2</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Persistent Toast</h2>
              <span className="text-sm text-[#6B7280]">Notification-style card, top-right</span>
            </div>
            <div className="relative w-full h-[350px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col">
              <MockNav />
              {!toastDismissed && (
                <div
                  className="absolute top-[68px] right-4 z-10 w-[260px] bg-white rounded-xl shadow-2xl overflow-hidden animate-[slideIn_0.4s_ease-out]"
                  style={{ boxShadow: '0 8px 32px rgba(161, 88, 255, 0.3), 0 2px 8px rgba(0,0,0,0.1)' }}
                >
                  <div className="flex">
                    <div className="w-1.5 bg-[#a158ff] flex-shrink-0" />
                    <div className="p-4 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[#0D4D4D] font-bold text-sm mb-1">Founding Member Program</p>
                          <p className="text-[#6B7280] text-xs mb-3">50 spots — lifetime free access. Once they&apos;re gone, price goes to $25/mo.</p>
                          <span className="inline-block px-4 py-1.5 bg-[#a158ff] hover:bg-[#8a3ee8] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer">
                            Apply Now →
                          </span>
                        </div>
                        <button
                          onClick={() => setToastDismissed(true)}
                          className="text-[#6B7280] hover:text-[#0D4D4D] transition-colors flex-shrink-0 mt-0.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {toastDismissed && (
                <button
                  onClick={() => setToastDismissed(false)}
                  className="absolute top-[68px] right-4 z-10 px-3 py-1.5 bg-white/10 text-white/60 text-xs rounded-lg hover:bg-white/20 transition-colors"
                >
                  Show again
                </button>
              )}
              <HeroArea />
            </div>
          </div>

          {/* ========== 3. GLASSMORPHISM CARD ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">3</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Glassmorphism Card</h2>
              <span className="text-sm text-[#6B7280]">Frosted glass, floating below header</span>
            </div>
            <div className="relative w-full h-[350px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col">
              <MockNav />
              <div className="absolute top-[68px] right-4 z-10 w-[240px]">
                <div
                  className="rounded-xl p-4 text-center animate-[purpleGlow_2.5s_ease-in-out_infinite]"
                  style={{
                    background: 'rgba(161, 88, 255, 0.25)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wider mb-1">Founding Member</p>
                  <p className="text-white font-extrabold text-2xl mb-0.5">FREE</p>
                  <p className="text-white/70 text-xs mb-3">50 spots · Lifetime access</p>
                  <span className="inline-block w-full py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer border border-white/20">
                    Apply Now →
                  </span>
                </div>
              </div>
              <HeroArea />
            </div>
          </div>

          {/* ========== 4. EXPANDING ORB ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">4</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Expanding Orb</h2>
              <span className="text-sm text-[#6B7280]">Pulsing dot that expands on hover to reveal CTA</span>
            </div>
            <div className="relative w-full h-[350px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col">
              <MockNav />
              <div
                className="absolute top-[76px] right-5 z-10"
                onMouseEnter={() => setOrbExpanded(true)}
                onMouseLeave={() => setOrbExpanded(false)}
              >
                <div
                  className={`transition-all duration-500 ease-in-out overflow-hidden cursor-pointer ${
                    orbExpanded
                      ? 'w-[220px] h-auto rounded-xl'
                      : 'w-10 h-10 rounded-full'
                  }`}
                  style={{
                    background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                    boxShadow: '0 0 20px 8px rgba(161, 88, 255, 0.4)',
                  }}
                >
                  {!orbExpanded && (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg">★</span>
                    </div>
                  )}
                  {orbExpanded && (
                    <div className="p-4 text-center">
                      <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mb-1">Founding Member</p>
                      <p className="text-white font-extrabold text-xl mb-0.5">FREE</p>
                      <p className="text-white/70 text-xs mb-3">50 spots · Lifetime access</p>
                      <span className="inline-block w-full py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg border border-white/20 transition-colors">
                        Apply Now →
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <HeroArea />
              <p className="absolute bottom-3 left-0 right-0 text-center text-white/40 text-xs">Hover the orb in the top-right to see it expand</p>
            </div>
          </div>

          {/* ========== 5. SPLIT-TONE HEADER ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">5</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Split-Tone Header</h2>
              <span className="text-sm text-[#6B7280]">Right portion of nav becomes the CTA</span>
            </div>
            <div className="relative w-full h-[350px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col">
              <MockNav splitTone />
              <HeroArea />
            </div>
          </div>

          {/* ========== 6. SIDEBAR BOOKMARK ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">6</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Sidebar Bookmark</h2>
              <span className="text-sm text-[#6B7280]">Vertical tab on right edge, click to expand</span>
            </div>
            <div className="relative w-full h-[350px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col">
              <MockNav />
              <div
                className="absolute right-0 top-[56px] z-10 cursor-pointer"
                onClick={() => setBookmarkExpanded(!bookmarkExpanded)}
              >
                <div className={`transition-all duration-500 ease-in-out overflow-hidden flex ${bookmarkExpanded ? 'w-[240px]' : 'w-9'}`}>
                  {bookmarkExpanded && (
                    <div
                      className="flex-1 p-4"
                      style={{
                        background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                        boxShadow: '-4px 0 20px rgba(161, 88, 255, 0.4)',
                        borderTopLeftRadius: '12px',
                        borderBottomLeftRadius: '12px',
                      }}
                    >
                      <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mb-1">Founding Member</p>
                      <p className="text-white font-extrabold text-xl mb-0.5">FREE · 50 Spots</p>
                      <p className="text-white/70 text-xs mb-3">Lifetime access. Once gone, price is $25/mo.</p>
                      <span className="inline-block px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg border border-white/20 transition-colors">
                        Apply Now →
                      </span>
                    </div>
                  )}
                  <div
                    className="w-9 flex-shrink-0 flex items-center justify-center animate-[purpleGlow_2.5s_ease-in-out_infinite]"
                    style={{
                      background: 'linear-gradient(180deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                      borderTopLeftRadius: bookmarkExpanded ? '0' : '8px',
                      borderBottomLeftRadius: bookmarkExpanded ? '0' : '8px',
                      minHeight: '160px',
                    }}
                  >
                    <span
                      className="text-white font-bold text-xs tracking-widest uppercase whitespace-nowrap"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                      50 FREE SPOTS
                    </span>
                  </div>
                </div>
              </div>
              <HeroArea />
              <p className="absolute bottom-3 left-0 right-0 text-center text-white/40 text-xs">Click the purple tab on the right edge to expand</p>
            </div>
          </div>

        </div>

        <div className="text-center mt-10 pb-8">
          <p className="text-[#6B7280] text-sm">Pick a number and let me know which one you want on the live v3 page.</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
