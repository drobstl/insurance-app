'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BADGE_DEFINITIONS, computeBadges, type BadgeDefinition, type EarnedBadge } from '../lib/badges';
import type { AgentAggregates } from '../lib/stats-aggregation';
import PremiumBadge from './PremiumBadge';

interface Props {
  stats: AgentAggregates;
  open: boolean;
  onClose: () => void;
  onShareBadge?: (badge: EarnedBadge) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="w-full h-1.5 bg-[#e5e7eb] rounded-full overflow-hidden mt-1">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          backgroundColor: pct >= 100 ? '#16a34a' : '#005851',
        }}
      />
    </div>
  );
}

function formatProgress(current: number, target: number, label: string): string {
  if (label === 'APV') {
    const fmtCur = current >= 1000 ? `$${(current / 1000).toFixed(current % 1000 === 0 ? 0 : 1)}k` : `$${current}`;
    const fmtTar = target >= 1000 ? `$${(target / 1000).toFixed(target % 1000 === 0 ? 0 : 1)}k` : `$${target}`;
    return `${fmtCur} / ${fmtTar}`;
  }
  return `${current} / ${target} ${label}`;
}

const spring = { type: 'spring' as const, stiffness: 400, damping: 28 };

export default function BadgeShelf({ stats, open, onClose, onShareBadge, containerRef }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const earned = useMemo(() => computeBadges(stats), [stats]);
  const earnedIds = useMemo(() => new Set(earned.map((b) => b.id)), [earned]);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const spotlightDef = spotlightId ? BADGE_DEFINITIONS.find((d) => d.id === spotlightId) : null;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef?.current?.contains(target)) return;
      if (ref.current?.contains(target)) return;
      onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (spotlightId) setSpotlightId(null);
        else onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  const firstUnearnedIdx = BADGE_DEFINITIONS.findIndex((d) => !earnedIds.has(d.id));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={spring}
          className="absolute top-full right-0 mt-2 bg-white rounded-[8px] shadow-xl border border-[#d0d0d0] z-50 w-[340px] max-h-[480px] overflow-y-auto origin-top-right"
        >
          <div className="sticky top-0 bg-white px-4 pt-4 pb-2 border-b border-[#e5e7eb] z-10">
            <p className="text-sm font-bold text-[#005851]">
              Badges{' '}
              <span className="text-[#707070] font-normal">
                {earned.length} / {BADGE_DEFINITIONS.length}
              </span>
            </p>
          </div>

          <div className="p-2">
            {BADGE_DEFINITIONS.map((def: BadgeDefinition, i: number) => {
              const isEarned = earnedIds.has(def.id);
              const isNext = i === firstUnearnedIdx;
              const current = def.current(stats);

              return (
                <div
                  key={def.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-[5px] ${
                    isNext ? 'bg-[#f0faf8]' : ''
                  } ${isEarned ? 'cursor-pointer hover:bg-[#f5f5f5] transition-colors' : ''}`}
                  onClick={isEarned ? () => setSpotlightId(def.id) : undefined}
                >
                  <PremiumBadge
                    badgeId={def.id}
                    size={64}
                    shimmer={isEarned}
                    grayscale={!isEarned && !isNext}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold ${
                          isEarned ? 'text-[#000000]' : isNext ? 'text-[#005851]' : 'text-[#9ca3af]'
                        }`}
                      >
                        {def.name}
                      </span>
                      {isEarned && (
                        <svg className="w-3.5 h-3.5 text-[#16a34a]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {isNext && (
                        <span className="text-[9px] font-bold text-[#005851] bg-[#daf3f0] px-1.5 py-0.5 rounded">
                          NEXT
                        </span>
                      )}
                      {isEarned && onShareBadge && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const earnedBadge = earned.find((b) => b.id === def.id);
                            if (earnedBadge) onShareBadge(earnedBadge);
                          }}
                          className="ml-auto p-0.5 text-[#707070] hover:text-[#005851] transition-colors"
                          title="Share badge"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className={`text-[10px] ${isEarned ? 'text-[#707070]' : 'text-[#9ca3af]'}`}>
                      {def.description}
                    </p>
                    {!isEarned && (
                      <>
                        <ProgressBar current={current} target={def.target} />
                        <p className="text-[9px] text-[#9ca3af] mt-0.5">
                          {formatProgress(current, def.target, def.progressLabel)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Badge spotlight lightbox */}
      {spotlightId && spotlightDef && (
        <motion.div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSpotlightId(null)}
          />
          <motion.div
            className="relative flex flex-col items-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <PremiumBadge badgeId={spotlightId} size={300} glow />
            <p className="text-white font-extrabold mt-6 text-2xl">{spotlightDef.name}</p>
            <p className="text-white/60 mt-1 text-sm text-center max-w-xs">{spotlightDef.description}</p>
            {onShareBadge && earnedIds.has(spotlightId) && (
              <button
                onClick={() => {
                  const earnedBadge = earned.find((b) => b.id === spotlightId);
                  if (earnedBadge) {
                    setSpotlightId(null);
                    onShareBadge(earnedBadge);
                  }
                }}
                className="mt-5 px-6 py-2.5 text-sm font-semibold text-white border border-white/30 rounded-[5px] hover:bg-white/10 transition-colors"
              >
                Share Badge
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
