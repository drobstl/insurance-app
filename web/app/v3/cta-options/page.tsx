"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export default function CTAOptionsPage() {
  const [comboAPeeked, setComboAPeeked] = useState(false);
  const [comboAExpanded, setComboAExpanded] = useState(false);

  const [comboBExpanded, setComboBExpanded] = useState(false);
  const [comboBMilestone, setComboBMilestone] = useState(false);
  const comboBScrollRef = useRef<HTMLDivElement>(null);

  const [comboCMagnet, setComboCMagnet] = useState(0);
  const [comboCPeeked, setComboCPeeked] = useState(false);
  const [comboCHovered, setComboCHovered] = useState(false);
  const comboCContainerRef = useRef<HTMLDivElement>(null);
  const comboCTabRef = useRef<HTMLDivElement>(null);
  const justLeftHoverRef = useRef(false);
  const justLeftTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const peekTimer = setTimeout(() => {
      setComboAPeeked(true);
      setTimeout(() => setComboAPeeked(false), 2500);
    }, 2500);
    const peekInterval = setInterval(() => {
      setComboAPeeked(true);
      setTimeout(() => setComboAPeeked(false), 2500);
    }, 20000);
    return () => { clearTimeout(peekTimer); clearInterval(peekInterval); };
  }, []);

  useEffect(() => {
    const container = comboBScrollRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (comboBMilestone) return;
      const scrollPercent = container.scrollTop / (container.scrollHeight - container.clientHeight);
      if (scrollPercent > 0.25) {
        setComboBMilestone(true);
        setComboBExpanded(true);
        setTimeout(() => setComboBExpanded(false), 3500);
      }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [comboBMilestone]);

  const handleCMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const tab = comboCTabRef.current;
    const container = comboCContainerRef.current;
    if (!tab || !container) return;
    const containerRect = container.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const tabCenterY = tabRect.top + tabRect.height / 2 - containerRect.top;
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    const distFromRight = containerRect.width - mouseX;
    const distY = Math.abs(mouseY - tabCenterY);
    const dist = Math.sqrt(distFromRight * distFromRight + distY * distY);
    const pull = dist < 140 ? Math.round((1 - dist / 140) * 28) : 0;
    setComboCMagnet(pull);
  }, []);

  useEffect(() => {
    const peekTimer = setTimeout(() => {
      setComboCPeeked(true);
      setTimeout(() => setComboCPeeked(false), 2500);
    }, 3500);
    return () => clearTimeout(peekTimer);
  }, []);

  const COMBO_C_EXPANDED_W = 276;
  const COMBO_C_PEEK_W = 220;
  const COMBO_C_TAB_W = 36;

  const comboCWidth = comboCHovered
    ? COMBO_C_EXPANDED_W
    : comboCPeeked
      ? COMBO_C_PEEK_W
      : COMBO_C_TAB_W + comboCMagnet;

  const useSlowTransition = comboCHovered || comboCPeeked || justLeftHoverRef.current;
  const comboCTransition = useSlowTransition
    ? 'width 600ms cubic-bezier(0.22, 1, 0.36, 1)'
    : comboCMagnet > 0
      ? 'width 120ms ease-out'
      : 'width 500ms cubic-bezier(0.22, 1, 0.36, 1)';

  const handleCEnter = () => {
    setComboCHovered(true);
    justLeftHoverRef.current = false;
    if (justLeftTimerRef.current) clearTimeout(justLeftTimerRef.current);
  };
  const handleCLeave = () => {
    setComboCHovered(false);
    justLeftHoverRef.current = true;
    justLeftTimerRef.current = setTimeout(() => { justLeftHoverRef.current = false; }, 700);
  };

  const MockNav = () => (
    <div className="relative w-full h-14 bg-[#0D4D4D] flex items-center justify-between px-4 sm:px-6 flex-shrink-0 z-10">
      <div className="flex items-center gap-2">
        <div className="w-10 h-6 bg-white/20 rounded" />
        <span className="text-white font-semibold text-sm">AgentForLife</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-white/60 text-xs">Login</span>
        <span className="px-3 py-1 bg-[#fdcc02] text-[#0D4D4D] text-xs font-semibold rounded-full">Get Started</span>
      </div>
    </div>
  );

  const ExpandedPanel = ({ onClose }: { onClose: () => void }) => (
    <div
      className="p-4 animate-[expandIn_0.4s_ease-out]"
      style={{
        background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
        boxShadow: '-4px 0 24px rgba(161, 88, 255, 0.5)',
        borderTopLeftRadius: '12px',
        borderBottomLeftRadius: '12px',
        width: '220px',
      }}
    >
      <div className="flex items-start justify-between mb-1">
        <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">Founding Member</p>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-white/40 hover:text-white transition-colors -mt-0.5 -mr-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <p className="text-white font-extrabold text-xl mb-0.5">FREE</p>
      <p className="text-white/70 text-xs mb-3">50 spots &middot; Lifetime access.<br />Once gone, price is $25/mo.</p>
      <span className="inline-block w-full text-center py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg border border-white/20 transition-colors cursor-pointer">
        Apply Now →
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] py-8 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0D4D4D] mb-2">Sidebar Bookmark — Pick a Combo</h1>
          <p className="text-[#6B7280] max-w-xl mx-auto">Three combinations of attention-drawing behaviors. Watch each one, then click to interact.</p>
        </div>

        <div className="space-y-12">

          {/* ========== COMBO A ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">A</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Peek &amp; Bounce + Ticker Text + Content Tease</h2>
            </div>
            <p className="text-sm text-[#6B7280] mb-3 ml-9">Tab slides out with a content preview on load (repeats every ~20s). Vertical text scrolls like a stock ticker. Click to fully expand.</p>
            <div className="relative w-full h-[400px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col">
              <MockNav />
              <div
                className="absolute right-0 top-[56px] z-20 cursor-pointer flex"
                onClick={() => setComboAExpanded(!comboAExpanded)}
              >
                <div className={`flex transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden ${
                  comboAExpanded ? 'w-[260px]' : comboAPeeked ? 'w-[200px]' : 'w-10'
                }`}>
                  {comboAExpanded && <ExpandedPanel onClose={() => setComboAExpanded(false)} />}
                  {comboAPeeked && !comboAExpanded && (
                    <div className="flex items-center px-3 py-3" style={{ background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)', borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px', width: '160px' }}>
                      <p className="text-white font-bold text-sm whitespace-nowrap">Lifetime free — 50 spots</p>
                    </div>
                  )}
                  <div className="w-10 flex-shrink-0 flex items-center justify-center animate-[purpleGlow_2.5s_ease-in-out_infinite] overflow-hidden relative" style={{ background: 'linear-gradient(180deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)', borderTopLeftRadius: comboAExpanded || comboAPeeked ? '0' : '8px', borderBottomLeftRadius: comboAExpanded || comboAPeeked ? '0' : '8px', minHeight: '160px' }}>
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                      <div className="animate-[tickerScroll_12s_linear_infinite]" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                        <span className="text-white font-bold text-[10px] tracking-[0.2em] uppercase whitespace-nowrap inline-block py-4">
                          50 FREE SPOTS &nbsp;&middot;&nbsp; APPLY NOW &nbsp;&middot;&nbsp; LIFETIME FREE &nbsp;&middot;&nbsp; 50 FREE SPOTS &nbsp;&middot;&nbsp; APPLY NOW &nbsp;&middot;&nbsp; LIFETIME FREE &nbsp;&middot;&nbsp;
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-4">
                  <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Hero Section Preview</p>
                  <p className="text-white font-bold text-lg sm:text-xl">Your Insurance Business,<br /><span className="text-[#3DD6C3]">On Autopilot.</span></p>
                </div>
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-white/40 text-xs">Peeks on load → ticker scrolls → click to expand</p>
            </div>
          </div>

          {/* ========== COMBO B ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">B</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Wiggle + Progress Bar + Scroll Milestone</h2>
            </div>
            <p className="text-sm text-[#6B7280] mb-3 ml-9">Tab gently jiggles every ~10s. Shows spots-claimed progress bar. Scroll ~25% to trigger auto-expand. Click to toggle.</p>
            <div className="relative w-full h-[400px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D]">
              <div className="absolute inset-0 flex flex-col">
                <MockNav />
                <div className={`absolute right-0 top-[56px] z-20 cursor-pointer flex transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden ${comboBExpanded ? 'w-[260px]' : 'w-10'}`} onClick={() => setComboBExpanded(!comboBExpanded)}>
                  {comboBExpanded && <ExpandedPanel onClose={() => setComboBExpanded(false)} />}
                  <div className="w-10 flex-shrink-0 flex flex-col items-center justify-center animate-[purpleGlow_2.5s_ease-in-out_infinite]" style={{ background: 'linear-gradient(180deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)', borderTopLeftRadius: comboBExpanded ? '0' : '8px', borderBottomLeftRadius: comboBExpanded ? '0' : '8px', minHeight: '160px' }}>
                    <span className="text-white font-bold text-[10px] tracking-widest uppercase whitespace-nowrap mb-2" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>50 FREE SPOTS</span>
                    <div className="w-[18px] h-[40px] bg-white/10 rounded-full overflow-hidden relative"><div className="absolute bottom-0 left-0 right-0 bg-[#fdcc02] rounded-full" style={{ height: '30%' }} /></div>
                    <span className="text-white/50 text-[7px] mt-1 font-medium">15/50</span>
                  </div>
                </div>
                <div ref={comboBScrollRef} className="flex-1 overflow-y-auto">
                  <div className="min-h-[700px] flex flex-col items-center pt-16 px-4">
                    <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Hero Section Preview</p>
                    <p className="text-white font-bold text-lg sm:text-xl text-center mb-6">Your Insurance Business,<br /><span className="text-[#3DD6C3]">On Autopilot.</span></p>
                    <p className="text-white/25 text-sm mt-12">↓ Scroll to trigger milestone expand ↓</p>
                    <div className="mt-[120px] text-white/15 text-xs text-center space-y-24"><p>Feature section content...</p><p>Retention details...</p><p>Referral pipeline...</p></div>
                  </div>
                </div>
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-white/40 text-xs z-10">Wiggles → progress bar → scroll to trigger expand</p>
            </div>
          </div>

          {/* ========== COMBO C: The polished one ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">C</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Cursor Magnet + Gold Shimmer + Ticker + Content Tease</h2>
            </div>
            <p className="text-sm text-[#6B7280] mb-3 ml-9">Tab pinned to right edge. Cursor magnet pulls it wider. Gold shimmer every ~5s. Seamless vertical ticker. Peeks at 3.5s. Hover to expand.</p>
            <div
              ref={comboCContainerRef}
              className="relative w-full h-[420px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col"
              onMouseMove={handleCMouseMove}
              onMouseLeave={() => setComboCMagnet(0)}
            >
              <MockNav />

              {/*
                Bookmark outer shell:
                - position: absolute; right: 0 → right edge locked
                - overflow: hidden → content clipped to current width
                - display: flex; justify-content: flex-end → inner content right-aligned,
                  so the tab strip is always visible and the panel reveals from the left
                - width transitions smoothly between states
              */}
              <div
                ref={comboCTabRef}
                className="absolute right-0 top-[56px] z-20 cursor-pointer overflow-hidden flex justify-end"
                style={{
                  width: `${comboCWidth}px`,
                  transition: comboCTransition,
                  height: '180px',
                }}
                onMouseEnter={handleCEnter}
                onMouseLeave={handleCLeave}
              >
                {/* Inner container — always full expanded width, right-aligned in parent */}
                <div className="flex flex-shrink-0" style={{ width: `${COMBO_C_EXPANDED_W}px`, height: '100%' }}>

                  {/* Panel area — always rendered, revealed by parent width */}
                  <div
                    className="flex-1 relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                      borderTopLeftRadius: '12px',
                      borderBottomLeftRadius: '12px',
                    }}
                  >
                    {/* Full expanded content — opacity-fades on hover */}
                    <div
                      className="absolute inset-0 p-4 flex flex-col justify-center"
                      style={{
                        opacity: comboCHovered ? 1 : 0,
                        transform: comboCHovered ? 'none' : 'translateX(10px)',
                        transition: comboCHovered
                          ? 'opacity 350ms ease 100ms, transform 350ms ease 100ms'
                          : 'opacity 200ms ease, transform 200ms ease',
                        pointerEvents: comboCHovered ? 'auto' : 'none',
                      }}
                    >
                      <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mb-1">🚀 Founding Member</p>
                      <p className="text-white font-extrabold text-2xl mb-0.5">FREE</p>
                      <p className="text-white/70 text-xs mb-3 leading-relaxed">50 spots &middot; Lifetime access.<br />Once gone, price is $25/mo.</p>
                      <span className="inline-block w-full text-center py-2.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg border border-white/20 transition-colors">
                        Apply Now →
                      </span>
                    </div>

                    {/* Peek content — opacity-fades during peek */}
                    <div
                      className="absolute inset-0 flex items-center px-4"
                      style={{
                        opacity: comboCPeeked && !comboCHovered ? 1 : 0,
                        transform: comboCPeeked && !comboCHovered ? 'none' : 'translateX(6px)',
                        transition: 'opacity 400ms ease, transform 400ms ease',
                        pointerEvents: 'none',
                      }}
                    >
                      <p className="text-white font-bold text-sm whitespace-nowrap">Lifetime free — 50 spots</p>
                    </div>
                  </div>

                  {/* Tab strip — 36px, always the rightmost element */}
                  <div
                    className="flex-shrink-0 relative overflow-hidden animate-[purpleGlow_2.5s_ease-in-out_infinite]"
                    style={{
                      width: `${COMBO_C_TAB_W}px`,
                      background: 'linear-gradient(180deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                      borderTopLeftRadius: comboCWidth <= COMBO_C_TAB_W ? '8px' : '0',
                      borderBottomLeftRadius: comboCWidth <= COMBO_C_TAB_W ? '8px' : '0',
                    }}
                  >
                    {/* Gold shimmer — sweeps bottom-to-top */}
                    <div
                      className="absolute inset-0 pointer-events-none animate-[goldShimmer_5s_ease-in-out_infinite]"
                      style={{
                        background: 'linear-gradient(180deg, transparent 0%, rgba(253,204,2,0.4) 50%, transparent 100%)',
                      }}
                    />

                    {/* Seamless vertical ticker — single text repeated 2x, scroll -50% */}
                    <div className="absolute inset-0 flex justify-center overflow-hidden">
                      <div
                        className="animate-[tickerUp_10s_linear_infinite] flex-shrink-0"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                      >
                        <span className="text-white/90 font-bold text-[9px] tracking-[0.15em] uppercase whitespace-nowrap">
                          {"🚀 50 FREE SPOTS \u2022 LIFETIME FREE \u2022 APPLY NOW \u2022 🚀 50 FREE SPOTS \u2022 LIFETIME FREE \u2022 APPLY NOW \u2022 "}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-4">
                  <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Hero Section Preview</p>
                  <p className="text-white font-bold text-lg sm:text-xl">Your Insurance Business,<br /><span className="text-[#3DD6C3]">On Autopilot.</span></p>
                </div>
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-white/40 text-xs">Move cursor near tab → shimmer every 5s → hover to expand</p>
            </div>
          </div>

        </div>

        <div className="text-center mt-10 pb-8">
          <p className="text-[#6B7280] text-sm">Pick A, B, or C — or mix and match behaviors.</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes expandIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes tickerScroll {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        @keyframes tickerUp {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        @keyframes goldShimmer {
          0%, 100% { transform: translateY(150%); opacity: 0; }
          5% { transform: translateY(80%); opacity: 1; }
          15% { transform: translateY(-80%); opacity: 1; }
          20% { transform: translateY(-150%); opacity: 0; }
          21% { transform: translateY(150%); opacity: 0; }
        }
        @keyframes wiggleSlow {
          0%, 90%, 100% { transform: translateX(0); }
          92% { transform: translateX(-3px); }
          94% { transform: translateX(3px); }
          96% { transform: translateX(-2px); }
          98% { transform: translateX(1px); }
        }
        @keyframes shimmerSweep {
          0%, 80%, 100% { background-position: 100% 200%; }
          40% { background-position: 100% -100%; }
        }
      `}</style>
    </div>
  );
}
