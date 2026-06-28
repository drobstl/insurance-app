'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

// The payoff when a new agent finishes the get-set-up checklist: a full-screen
// celebration (confetti + a "great start, you're on your way" beat) that then
// conveyors off to the left, revealing the real dashboard beneath. Mounted by
// app/dashboard/page.tsx only on the in-session moment onboarding completes.
//
// Copy is deliberately a starting line, not a finish line — there's more to set
// up, and Patch tees it up just-in-time. So this never says "all set."

const CONFETTI_COLORS = ['#1D9E75', '#005851', '#F5C26B', '#3DD6C3', '#E89B5B', '#D85A30'];

function burstConfetti(container: HTMLDivElement | null) {
  if (!container) return;
  for (let i = 0; i < 40; i += 1) {
    const piece = document.createElement('div');
    const size = 6 + Math.random() * 7;
    piece.style.cssText = `position:absolute;left:50%;top:42%;width:${size.toFixed(1)}px;height:${(
      size * 0.55
    ).toFixed(1)}px;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};border-radius:1px;will-change:transform`;
    container.appendChild(piece);
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 200;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 60;
    piece.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${dx.toFixed(0)}px,${dy.toFixed(0)}px) rotate(${(Math.random() * 540 - 270).toFixed(
            0,
          )}deg)`,
          opacity: 1,
          offset: 0.55,
        },
        {
          transform: `translate(${(dx * 1.1).toFixed(0)}px,${(dy + 280).toFixed(0)}px) rotate(${(
            Math.random() * 760 -
            380
          ).toFixed(0)}deg)`,
          opacity: 0,
        },
      ],
      { duration: 1600 + Math.random() * 800, easing: 'cubic-bezier(0.2,0.6,0.3,1)', fill: 'forwards' },
    );
    window.setTimeout(() => piece.remove(), 2600);
  }
}

export default function GraduationCelebration({ firstName, onDone }: { firstName?: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  const curtainRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const curtain = curtainRef.current;
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    };
    if (!curtain) {
      finish();
      return;
    }
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

    (async () => {
      if (badgeRef.current && !reduce) {
        badgeRef.current.animate(
          [
            { transform: 'scale(0.4)', opacity: 0 },
            { transform: 'scale(1.06)', opacity: 1, offset: 0.7 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 560, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'forwards' },
        );
      }
      if (!reduce) burstConfetti(confettiRef.current);
      await wait(reduce ? 700 : 1750);
      if (cancelled) return;
      try {
        if (reduce) {
          await curtain.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' }).finished;
        } else {
          await curtain.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], {
            duration: 950,
            easing: 'cubic-bezier(0.5,0,0.2,1)',
            fill: 'forwards',
          }).finished;
        }
      } catch {
        // animation interrupted — fall through to finish
      }
      if (!cancelled) finish();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = firstName ? `Great start, ${firstName} — you're on your way!` : "Great start — you're on your way!";

  return (
    <div
      ref={curtainRef}
      className="fixed inset-0 z-[70] flex items-center justify-center px-6"
      style={{ background: '#eef6f4', willChange: 'transform' }}
      role="status"
      aria-live="polite"
    >
      <div ref={confettiRef} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true" />
      <div ref={badgeRef} className="relative text-center" style={{ opacity: reduce ? 1 : 0 }}>
        <div className="w-[72px] h-[72px] rounded-full bg-[#1D9E75] flex items-center justify-center mx-auto">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-[#005851] text-xl font-bold mt-4">{greeting}</p>
        <p className="text-[#5a5a5a] text-sm mt-1">I&apos;ll tee up the rest as you go, no rush.</p>
      </div>
    </div>
  );
}
