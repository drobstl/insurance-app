'use client';

import { useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { toPng } from 'html-to-image';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import type { EarnedBadge } from '../lib/badges';
import { BADGE_DEFINITIONS } from '../lib/badges';
import PremiumBadge from './PremiumBadge';

interface Props {
  badge: EarnedBadge;
  agentUid: string;
  agentName: string;
  onDismiss: () => void;
}

export default function BadgeCelebration({ badge, agentUid, agentName, onDismiss }: Props) {
  const shareCardRef = useRef<HTMLDivElement>(null);
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    const burst = () => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6, x: 0.5 },
        colors: [badge.color, '#f5d976', '#e2b93b', '#ffffff'],
      });
    };
    burst();
    const t = setTimeout(burst, 400);
    return () => clearTimeout(t);
  }, [badge.color]);

  const handleDismiss = useCallback(async () => {
    try {
      await updateDoc(doc(db, 'agents', agentUid), {
        celebratedBadgeIds: arrayUnion(badge.id),
      });
    } catch { /* non-critical */ }
    onDismiss();
  }, [agentUid, badge.id, onDismiss]);

  const handleShare = useCallback(async () => {
    if (!shareCardRef.current) return;
    try {
      const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2 });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `badge-${badge.id}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          text: `I just earned the "${badge.name}" badge on AgentForLife!`,
          files: [file],
        });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `badge-${badge.id}.png`;
        link.click();
      }
    } catch { /* user cancelled or unsupported */ }
  }, [badge]);

  const definition = BADGE_DEFINITIONS.find((d) => d.id === badge.id);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Visible celebration card */}
      <div className="relative bg-white rounded-[12px] shadow-2xl max-w-sm w-full p-8 text-center animate-in zoom-in-95 duration-300">
        {/* Glow ring behind badge */}
        <div className="relative mx-auto w-32 h-32 mb-6">
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              background: `radial-gradient(circle, ${badge.color}30 0%, transparent 70%)`,
            }}
          />
          <div className="relative flex items-center justify-center w-full h-full">
            <PremiumBadge
              icon={badge.icon}
              color={badge.color}
              size={110}
              shimmer
              glow
            />
          </div>
        </div>

        <h2 className="text-2xl font-extrabold text-[#005851] mb-1">
          Badge Earned!
        </h2>
        <p className="text-lg font-bold text-[#000000] mb-1">{badge.name}</p>
        {definition && (
          <p className="text-sm text-[#707070] mb-6">{definition.description}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleShare}
            className="flex-1 py-3 px-4 text-sm font-semibold text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#f0faf8] transition-colors"
          >
            Share Achievement
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 py-3 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-[5px] transition-colors"
          >
            Continue
          </button>
        </div>
      </div>

      {/* Off-screen share card for image generation */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div
          ref={shareCardRef}
          className="w-[600px] h-[400px] bg-gradient-to-br from-[#005851] to-[#003d38] flex flex-col items-center justify-center p-10"
        >
          <PremiumBadge icon={badge.icon} color={badge.color} size={120} />
          <p className="text-white text-3xl font-extrabold mt-4">{badge.name}</p>
          {definition && (
            <p className="text-white/70 text-base mt-1">{definition.description}</p>
          )}
          <p className="text-white/50 text-sm mt-4">
            {agentName} &middot; {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="text-[#44bbaa] text-xs font-bold mt-6 tracking-widest uppercase">
            AgentForLife
          </p>
        </div>
      </div>
    </div>
  );
}
