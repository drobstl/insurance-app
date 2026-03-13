'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BookHealthBreakdown } from '../lib/book-health';

interface Props {
  breakdown: BookHealthBreakdown;
  open: boolean;
  onClose: () => void;
  /** Ref to the element that wraps both the trigger button and this popover. Clicks inside it are not treated as outside. */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

const RING_COLORS = ['#16a34a', '#2563eb', '#ec4899', '#d97706'];
const RING_RADII = [44, 35, 26, 17];
const STROKE = 6;

function Ring({
  radius,
  color,
  percent,
  delay,
}: {
  radius: number;
  color: string;
  percent: number;
  delay: number;
}) {
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(percent, 100) / 100) * circumference;

  return (
    <>
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={STROKE}
      />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference * 0.25}
        style={{
          transition: `stroke-dasharray 0.8s ease ${delay}s`,
        }}
      />
    </>
  );
}

const spring = { type: 'spring' as const, stiffness: 400, damping: 28 };

export default function BookHealthPopover({ breakdown, open, onClose, containerRef }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef?.current?.contains(target)) return;
      if (ref.current?.contains(target)) return;
      onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  const components = [
    breakdown.retention,
    breakdown.referrals,
    breakdown.engagement,
    breakdown.rewrites,
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={spring}
          className="absolute top-full right-0 mt-2 bg-white rounded-[8px] shadow-xl border border-[#d0d0d0] p-5 z-50 w-[320px] origin-top-right"
        >
          <div className="flex gap-5">
            {/* Ring chart */}
            <div className="relative w-[120px] h-[120px] shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                {components.map((comp, i) => (
                  <Ring
                    key={comp.label}
                    radius={RING_RADII[i]}
                    color={RING_COLORS[i]}
                    percent={comp.score}
                    delay={i * 0.1}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold text-[#005851]">
                  {breakdown.overall}
                </span>
                <span className="text-[9px] text-[#707070] -mt-0.5">overall</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-col justify-center gap-2.5 flex-1 min-w-0">
              {components.map((comp, i) => (
                <div key={comp.label} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: RING_COLORS[i] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold text-[#000000]">
                        {comp.label}
                      </span>
                      <span className="text-xs font-bold text-[#005851]">
                        {comp.score}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#707070]">
                      {Math.round(comp.weight * 100)}% weight
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
