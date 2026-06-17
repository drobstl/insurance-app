'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';
import type { BadgeDefinition } from '../lib/badges';
import PremiumBadge from './PremiumBadge';

/** Progress numbers for an unearned badge (shape produced by BadgeProgressCard). */
export interface SpotlightProgress {
  pct: number;
  cur: number;
  tgt: number;
  remaining: number;
  unit: string;
  fmt: (n: number) => string;
}

interface Props {
  def: BadgeDefinition;
  earned: boolean;
  prog: SpotlightProgress;
  /** Provided only when the badge is earned and sharing is wired up. */
  onShare?: () => void;
  onClose: () => void;
}

/** Hero render size for the badge art (px). The PNGs are 1000-1650px, so this is crisp. */
const HERO_SIZE = 232;
/** Max holographic tilt in degrees. */
const MAX_TILT = 15;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Tracks the user's prefers-reduced-motion setting (SSR-safe, no effect setState). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/**
 * Full-screen badge "spotlight" — a celebratory reveal that makes an earned
 * badge feel special and lets the agent inspect the high-res art up close.
 *
 * - Entrance: backdrop blur, tier-tinted sunburst + bloom, a spring "pop" of the
 *   badge, a one-shot shine sweep, confetti (earned only), and staggered text.
 * - Up close: the badge tilts holographically toward the pointer/touch with a
 *   gloss highlight that tracks it; tapping the art opens a pannable zoom view of
 *   the full-resolution PNG.
 * - Honors prefers-reduced-motion (drops every animation; static badge + zoom
 *   still work).
 *
 * Rendered through a portal to document.body so no transformed ancestor can clip
 * the fixed overlay or its 3D transforms.
 */
export default function BadgeSpotlight({ def, earned, prog, onShare, onClose }: Props) {
  const reduced = useReducedMotion();
  const [zoomed, setZoomed] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 32 });
  const stageRef = useRef<HTMLDivElement>(null);

  // Esc closes the zoom first, then the spotlight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (zoomed) setZoomed(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Confetti burst for earned badges, timed to land as the badge pops in.
  useEffect(() => {
    if (!earned || reduced) return;
    let cancelled = false;
    const colors = [def.color, '#f5d976', '#e2b93b', '#ffffff'];
    const t = setTimeout(() => {
      if (cancelled) return;
      confetti({
        particleCount: 70,
        spread: 80,
        startVelocity: 42,
        scalar: 0.95,
        origin: { x: 0.5, y: 0.42 },
        colors,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 26,
        spread: 120,
        startVelocity: 26,
        scalar: 0.7,
        decay: 0.92,
        origin: { x: 0.5, y: 0.42 },
        colors,
        disableForReducedMotion: true,
      });
    }, 170);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [earned, reduced, def.color]);

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (reduced || zoomed) return;
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = clamp((clientX - r.left) / r.width, 0, 1);
      const py = clamp((clientY - r.top) / r.height, 0, 1);
      setTilt({
        ry: (px - 0.5) * 2 * MAX_TILT,
        rx: -(py - 0.5) * 2 * MAX_TILT,
        gx: px * 100,
        gy: py * 100,
      });
    },
    [reduced, zoomed],
  );

  const resetTilt = useCallback(() => setTilt({ rx: 0, ry: 0, gx: 50, gy: 32 }), []);

  if (typeof document === 'undefined') return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${def.name} badge`}
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        style={{ animation: reduced ? undefined : 'spot-fade 220ms ease-out' }}
        onClick={onClose}
      />

      {/* card */}
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border-2 border-[#1A1A1A] border-r-[6px] border-b-[6px] bg-white px-6 pb-6 pt-7 text-center"
        style={{ animation: reduced ? undefined : 'spot-card-in 280ms cubic-bezier(0.22,1,0.36,1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-20 text-[#9ca3af] transition-colors hover:text-[#000000]"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* badge stage */}
        <div
          ref={stageRef}
          className="relative mx-auto mb-4 flex cursor-zoom-in select-none items-center justify-center"
          style={{ width: HERO_SIZE, height: HERO_SIZE, perspective: 760 }}
          onPointerMove={(e) => handlePointerMove(e.clientX, e.clientY)}
          onPointerLeave={resetTilt}
          onClick={() => setZoomed(true)}
        >
          {/* sunburst rays */}
          {!reduced && (
            <div
              className="pointer-events-none absolute inset-[-32%]"
              style={{
                background: `repeating-conic-gradient(from 0deg, ${def.color}22 0deg 7deg, transparent 7deg 15deg)`,
                WebkitMaskImage: 'radial-gradient(circle, #000 16%, transparent 60%)',
                maskImage: 'radial-gradient(circle, #000 16%, transparent 60%)',
                animation: 'spot-rays-in 560ms ease-out both, spot-spin 24s linear infinite',
              }}
            />
          )}

          {/* soft tier-colored bloom */}
          <div
            className="pointer-events-none absolute inset-[-8%] rounded-full"
            style={{
              background: `radial-gradient(circle, ${def.color}${earned ? '55' : '24'} 0%, transparent 62%)`,
              animation: reduced ? undefined : 'spot-bloom 2.8s ease-in-out infinite',
            }}
          />

          {/* entrance pop wrapper (separate from interactive tilt) */}
          <div
            className="relative"
            style={{ animation: reduced ? undefined : 'spot-pop 560ms cubic-bezier(0.34,1.56,0.64,1) both' }}
          >
            {/* interactive holographic tilt */}
            <div
              className="relative"
              style={{
                transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
                transformStyle: 'preserve-3d',
                transition: 'transform 140ms ease-out',
              }}
            >
              <PremiumBadge badgeId={def.id} size={HERO_SIZE} shimmer={earned} glow grayscale={!earned} />

              {/* gloss highlight that tracks the pointer */}
              {!reduced && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{
                    background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 24%, transparent 48%)`,
                    mixBlendMode: 'soft-light',
                  }}
                />
              )}

              {/* one-shot diagonal shine sweep */}
              {!reduced && (
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{ WebkitMaskImage: 'radial-gradient(circle, #000 54%, transparent 72%)', maskImage: 'radial-gradient(circle, #000 54%, transparent 72%)' }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.6) 50%, transparent 62%)',
                      animation: 'spot-sweep 950ms ease-out 380ms both',
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* zoom affordance */}
          <span className="pointer-events-none absolute bottom-0 right-0 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/90">
            ⤢ tap to enlarge
          </span>
        </div>

        {/* name + tier (staggered in) */}
        <div style={{ animation: reduced ? undefined : 'spot-text-in 420ms ease-out 240ms both' }}>
          <h3 className="text-xl font-bold text-[#005851]">{def.name}</h3>
          <p className="mb-3 text-xs capitalize text-[#9ca3af]">{def.tier} badge</p>
        </div>

        {/* status block (staggered in) */}
        <div style={{ animation: reduced ? undefined : 'spot-text-in 420ms ease-out 340ms both' }}>
          {earned ? (
            <>
              <div className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-[#16a34a]">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Earned
              </div>
              <p className="text-sm text-[#4b5563]">{def.description}.</p>
              {onShare && (
                <button
                  onClick={() => {
                    onShare();
                    onClose();
                  }}
                  className="mt-5 w-full rounded-lg bg-[#44bbaa] py-2.5 font-semibold text-white transition-colors hover:bg-[#005751]"
                >
                  Share this badge
                </button>
              )}
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-[#4b5563]">{def.howToEarn}.</p>
              <div className="h-2 overflow-hidden rounded-full bg-[#eef0f0]">
                <div
                  className="h-full rounded-full bg-[#005851]"
                  style={{ width: `${prog.pct}%`, transition: 'width 700ms cubic-bezier(0.22,1,0.36,1)' }}
                />
              </div>
              <div className="mt-1.5 text-xs text-[#707070]">
                {prog.fmt(prog.cur)} / {prog.fmt(prog.tgt)}
                {prog.unit}
                <span className="font-semibold text-[#0f766e]"> · {prog.fmt(prog.remaining)} to go</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* pannable up-close zoom of the full-resolution art */}
      {zoomed && <ZoomInspector id={def.id} name={def.name} onClose={() => setZoomed(false)} />}

      <style>{`
        @keyframes spot-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes spot-card-in { from { opacity: 0; transform: translateY(10px) scale(0.96) } to { opacity: 1; transform: none } }
        @keyframes spot-pop {
          0% { opacity: 0; transform: scale(0.3) rotate(-12deg) }
          55% { opacity: 1 }
          100% { opacity: 1; transform: scale(1) rotate(0) }
        }
        @keyframes spot-rays-in { from { opacity: 0; transform: scale(0.55) } to { opacity: 1; transform: scale(1) } }
        @keyframes spot-spin { to { transform: rotate(360deg) } }
        @keyframes spot-bloom { 0%, 100% { opacity: 0.7; transform: scale(0.9) } 50% { opacity: 1; transform: scale(1.06) } }
        @keyframes spot-sweep { 0% { transform: translateX(-120%) } 100% { transform: translateX(120%) } }
        @keyframes spot-text-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}

/**
 * Full-bleed zoom layer: the badge art rendered large and over-scaled so the
 * agent can drag (mouse or touch) to explore fine detail. A tap without a drag,
 * the close button, or Esc dismisses it.
 */
function ZoomInspector({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const bound = () =>
    typeof window === 'undefined' ? 240 : Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.3);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not supported — fine */
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    const b = bound();
    setPan({ x: clamp(drag.current.px + dx, -b, b), y: clamp(drag.current.py + dy, -b, b) });
  };

  const onUp = () => {
    const moved = drag.current?.moved;
    drag.current = null;
    setDragging(false);
    if (!moved) onClose(); // a tap (not a drag) closes
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/90"
      style={{ touchAction: 'none', animation: 'spot-fade 180ms ease-out' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/badges/${id}.png`}
        alt={name}
        draggable={false}
        className="max-h-[80vh] max-w-[90vw] object-contain"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(1.6)`,
          transition: dragging ? 'none' : 'transform 160ms ease-out',
          cursor: dragging ? 'grabbing' : 'grab',
          filter: 'drop-shadow(0 18px 50px rgba(0,0,0,0.55))',
        }}
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close zoom"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/15 p-2 text-white/90 transition-colors hover:bg-white/25"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <span className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/12 px-3 py-1 text-xs text-white/80">
        Drag to explore · tap to close
      </span>
    </div>
  );
}
