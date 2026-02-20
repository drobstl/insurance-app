"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export default function CTAOptionsPage() {
  // Combo A: peek-and-bounce + rotating text + content tease
  const [comboAPeeked, setComboAPeeked] = useState(false);
  const [comboATextIndex, setComboATextIndex] = useState(0);
  const comboATexts = ["50 FREE SPOTS", "APPLY NOW →", "LIFETIME FREE"];
  const [comboAExpanded, setComboAExpanded] = useState(false);

  // Combo B: wiggle + progress bar + scroll-milestone expand
  const [comboBExpanded, setComboBExpanded] = useState(false);
  const [comboBMilestone, setComboBMilestone] = useState(false);
  const comboBRef = useRef<HTMLDivElement>(null);

  // Combo C: cursor magnet + shimmer + content tease peek
  const [comboCOffset, setComboCOffset] = useState(0);
  const [comboCPeeked, setComboCPeeked] = useState(false);
  const [comboCExpanded, setComboCExpanded] = useState(false);
  const comboCRef = useRef<HTMLDivElement>(null);
  const comboCBookmarkRef = useRef<HTMLDivElement>(null);

  // Combo A: peek-and-bounce on load, rotating text
  useEffect(() => {
    const peekTimer = setTimeout(() => {
      setComboAPeeked(true);
      setTimeout(() => setComboAPeeked(false), 2000);
    }, 2000);

    const peekInterval = setInterval(() => {
      setComboAPeeked(true);
      setTimeout(() => setComboAPeeked(false), 2000);
    }, 18000);

    const textInterval = setInterval(() => {
      setComboATextIndex(prev => (prev + 1) % 3);
    }, 4000);

    return () => { clearTimeout(peekTimer); clearInterval(peekInterval); clearInterval(textInterval); };
  }, []);

  // Combo B: scroll-milestone trigger
  useEffect(() => {
    const container = comboBRef.current;
    if (!container) return;
    const handleScroll = () => {
      const scrollPercent = container.scrollTop / (container.scrollHeight - container.clientHeight);
      if (scrollPercent > 0.3 && !comboBMilestone) {
        setComboBMilestone(true);
        setComboBExpanded(true);
        setTimeout(() => {
          setComboBExpanded(false);
          setComboBMilestone(false);
        }, 3000);
      }
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [comboBMilestone]);

  // Combo C: cursor magnet effect
  const handleCMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bookmark = comboCBookmarkRef.current;
    const container = comboCRef.current;
    if (!bookmark || !container) return;
    const containerRect = container.getBoundingClientRect();
    const bookmarkRect = bookmark.getBoundingClientRect();
    const bookmarkCenterY = bookmarkRect.top + bookmarkRect.height / 2 - containerRect.top;
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    const distFromRight = containerRect.width - mouseX;
    const distY = Math.abs(mouseY - bookmarkCenterY);
    const dist = Math.sqrt(distFromRight * distFromRight + distY * distY);
    if (dist < 150) {
      const pull = Math.round(Math.max(0, (1 - dist / 150) * 30));
      setComboCOffset(pull);
    } else {
      setComboCOffset(0);
    }
  }, []);

  // Combo C: content tease peek
  useEffect(() => {
    const peekTimer = setTimeout(() => {
      setComboCPeeked(true);
      setTimeout(() => setComboCPeeked(false), 2000);
    }, 3000);
    return () => clearTimeout(peekTimer);
  }, []);

  const MockNav = () => (
    <div className="relative w-full h-14 sm:h-16 bg-[#0D4D4D] flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
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

  const HeroArea = () => (
    <div className="w-full flex-1 bg-[#0D4D4D] flex items-center justify-center">
      <div className="text-center px-4">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Hero Section Preview</p>
        <p className="text-white font-bold text-lg sm:text-xl">Your Insurance Business,<br /><span className="text-[#3DD6C3]">On Autopilot.</span></p>
      </div>
    </div>
  );

  const ExpandedPanel = () => (
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
      <p className="text-white font-extrabold text-xl mb-0.5">FREE &middot; 50 Spots</p>
      <p className="text-white/70 text-xs mb-3">Lifetime access. Once gone, price is $25/mo.</p>
      <span className="inline-block px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg border border-white/20 transition-colors cursor-pointer">
        Apply Now →
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] py-8 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0D4D4D] mb-2">Sidebar Bookmark — Pick a Combo</h1>
          <p className="text-[#6B7280] max-w-xl mx-auto">Three combinations of attention-drawing behaviors for the sidebar bookmark. Watch each one, hover and click to interact.</p>
        </div>

        <div className="space-y-12">

          {/* ========== COMBO A: Peek-and-bounce + Rotating text + Content tease ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">A</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Peek &amp; Bounce + Rotating Text + Content Tease</h2>
            </div>
            <p className="text-sm text-[#6B7280] mb-3 ml-9">Tab slides out with content preview on load (and every ~18s). Vertical text rotates between three messages every 4s. Click to fully expand.</p>
            <div className="relative w-full h-[400px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col">
              <MockNav />
              <div
                className="absolute right-0 top-[56px] z-10 cursor-pointer"
                onClick={() => setComboAExpanded(!comboAExpanded)}
              >
                <div className={`transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden flex ${
                  comboAExpanded ? 'w-[240px]' : comboAPeeked ? 'w-[180px]' : 'w-10'
                }`}>
                  {comboAExpanded && <ExpandedPanel />}
                  {comboAPeeked && !comboAExpanded && (
                    <div
                      className="flex-1 py-3 px-3 flex items-center animate-[peekFadeContent_2s_ease-in-out]"
                      style={{
                        background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                        borderTopLeftRadius: '12px',
                        borderBottomLeftRadius: '12px',
                      }}
                    >
                      <p className="text-white font-bold text-sm whitespace-nowrap">Lifetime free — 50 spots</p>
                    </div>
                  )}
                  <div
                    className="w-10 flex-shrink-0 flex items-center justify-center animate-[purpleGlow_2.5s_ease-in-out_infinite]"
                    style={{
                      background: 'linear-gradient(180deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                      borderTopLeftRadius: comboAExpanded || comboAPeeked ? '0' : '8px',
                      borderBottomLeftRadius: comboAExpanded || comboAPeeked ? '0' : '8px',
                      minHeight: '160px',
                    }}
                  >
                    <span
                      className="text-white font-bold text-[11px] tracking-widest uppercase whitespace-nowrap transition-opacity duration-500"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                      key={comboATextIndex}
                    >
                      {comboATexts[comboATextIndex]}
                    </span>
                  </div>
                </div>
              </div>
              <HeroArea />
              <p className="absolute bottom-3 left-0 right-0 text-center text-white/40 text-xs">Watch: peeks with content tease on load → text rotates → click to expand</p>
            </div>
          </div>

          {/* ========== COMBO B: Wiggle + Progress bar + Scroll-milestone ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">B</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Wiggle + Progress Bar + Scroll Milestone</h2>
            </div>
            <p className="text-sm text-[#6B7280] mb-3 ml-9">Tab jiggles every 10s. Shows spots-claimed progress bar. Scroll down ~30% inside the preview to trigger auto-expand. Click to toggle.</p>
            <div
              ref={comboBRef}
              className="relative w-full h-[400px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col overflow-y-auto"
            >
              <div className="flex-shrink-0"><MockNav /></div>
              <div
                className="absolute right-0 top-[56px] z-10 cursor-pointer"
                style={{ position: 'sticky', top: '56px', alignSelf: 'flex-end' }}
                onClick={() => setComboBExpanded(!comboBExpanded)}
              >
                <div className={`transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden flex ${comboBExpanded ? 'w-[240px]' : 'w-10'}`}>
                  {comboBExpanded && <ExpandedPanel />}
                  <div
                    className={`w-10 flex-shrink-0 flex flex-col items-center justify-center animate-[purpleGlow_2.5s_ease-in-out_infinite] ${!comboBExpanded ? 'animate-[wiggle_0.4s_ease-in-out_10s_infinite]' : ''}`}
                    style={{
                      background: 'linear-gradient(180deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                      borderTopLeftRadius: comboBExpanded ? '0' : '8px',
                      borderBottomLeftRadius: comboBExpanded ? '0' : '8px',
                      minHeight: '160px',
                    }}
                  >
                    <span
                      className="text-white font-bold text-[11px] tracking-widest uppercase whitespace-nowrap mb-3"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                      50 FREE SPOTS
                    </span>
                    {/* Progress bar showing spots claimed */}
                    <div className="w-5 h-[50px] bg-white/10 rounded-full overflow-hidden relative">
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-[#fdcc02] rounded-full transition-all duration-1000"
                        style={{ height: '30%' }}
                      />
                    </div>
                    <span className="text-white/60 text-[8px] mt-1 font-medium">15/50</span>
                  </div>
                </div>
              </div>
              {/* Scrollable content area to trigger milestone */}
              <div className="relative flex-1 min-h-[800px]">
                <div className="absolute inset-0 flex items-start justify-center pt-16">
                  <div className="text-center px-4">
                    <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Hero Section Preview</p>
                    <p className="text-white font-bold text-lg sm:text-xl mb-8">Your Insurance Business,<br /><span className="text-[#3DD6C3]">On Autopilot.</span></p>
                    <p className="text-white/30 text-sm mt-8">↓ Scroll down to trigger milestone expand ↓</p>
                    <div className="mt-[200px] text-white/20 text-xs">
                      <p>Feature section content...</p>
                      <div className="mt-[200px]"><p>More content below...</p></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========== COMBO C: Cursor magnet + Shimmer + Content tease ========== */}
          <div>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-xs font-bold text-white bg-[#a158ff] rounded-full px-3 py-1">C</span>
              <h2 className="text-lg font-bold text-[#0D4D4D]">Cursor Magnet + Gold Shimmer + Content Tease</h2>
            </div>
            <p className="text-sm text-[#6B7280] mb-3 ml-9">Tab pulls toward your cursor when nearby. Gold shimmer sweeps across every 5s. Peeks with content tease after 3s. Click to expand.</p>
            <div
              ref={comboCRef}
              className="relative w-full h-[400px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-[#0D4D4D] flex flex-col"
              onMouseMove={handleCMouseMove}
              onMouseLeave={() => setComboCOffset(0)}
            >
              <MockNav />
              <div
                ref={comboCBookmarkRef}
                className="absolute right-0 top-[56px] z-10 cursor-pointer transition-transform duration-150 ease-out"
                style={{ transform: `translateX(-${comboCOffset}px)` }}
                onClick={() => setComboCExpanded(!comboCExpanded)}
              >
                <div className={`transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden flex ${
                  comboCExpanded ? 'w-[240px]' : comboCPeeked ? 'w-[180px]' : 'w-10'
                }`}>
                  {comboCExpanded && <ExpandedPanel />}
                  {comboCPeeked && !comboCExpanded && (
                    <div
                      className="flex-1 py-3 px-3 flex items-center animate-[peekFadeContent_2s_ease-in-out]"
                      style={{
                        background: 'linear-gradient(135deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                        borderTopLeftRadius: '12px',
                        borderBottomLeftRadius: '12px',
                      }}
                    >
                      <p className="text-white font-bold text-sm whitespace-nowrap">Lifetime free — 50 spots</p>
                    </div>
                  )}
                  <div
                    className="w-10 flex-shrink-0 flex items-center justify-center animate-[purpleGlow_2.5s_ease-in-out_infinite] relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg, #b06aff 0%, #a158ff 40%, #8a3ee8 100%)',
                      borderTopLeftRadius: comboCExpanded || comboCPeeked ? '0' : '8px',
                      borderBottomLeftRadius: comboCExpanded || comboCPeeked ? '0' : '8px',
                      minHeight: '160px',
                    }}
                  >
                    {/* Gold shimmer sweep */}
                    <div
                      className="absolute inset-0 animate-[shimmerSweep_5s_ease-in-out_infinite]"
                      style={{
                        background: 'linear-gradient(180deg, transparent 0%, rgba(253,204,2,0) 30%, rgba(253,204,2,0.4) 50%, rgba(253,204,2,0) 70%, transparent 100%)',
                        backgroundSize: '100% 300%',
                      }}
                    />
                    <span
                      className="relative text-white font-bold text-[11px] tracking-widest uppercase whitespace-nowrap"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                      50 FREE SPOTS
                    </span>
                  </div>
                </div>
              </div>
              <HeroArea />
              <p className="absolute bottom-3 left-0 right-0 text-center text-white/40 text-xs">Move cursor near the tab to see the magnet effect → shimmer every 5s → click to expand</p>
            </div>
          </div>

        </div>

        <div className="text-center mt-10 pb-8">
          <p className="text-[#6B7280] text-sm">Pick A, B, or C — or mix and match behaviors.</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes peekFadeContent {
          0% { opacity: 0; transform: translateX(20px); }
          20% { opacity: 1; transform: translateX(0); }
          80% { opacity: 1; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(20px); }
        }
        @keyframes wiggle {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
        @keyframes shimmerSweep {
          0%, 100% { background-position: 100% 200%; }
          40%, 60% { background-position: 100% -100%; }
        }
      `}</style>
    </div>
  );
}
