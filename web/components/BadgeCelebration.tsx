'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { User } from 'firebase/auth';
import confetti from 'canvas-confetti';
import { toPng } from 'html-to-image';
import QRCode from 'qrcode';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import type { EarnedBadge } from '../lib/badges';
import { BADGE_DEFINITIONS } from '../lib/badges';
import PremiumBadge from './PremiumBadge';

function formatValue(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

interface Props {
  badge: EarnedBadge;
  agentUid: string;
  agentName: string;
  totalValue: number;
  agentPhotoBase64?: string;
  user?: User | null;
  onDismiss: () => void;
}

export default function BadgeCelebration({
  badge,
  agentUid,
  agentName,
  totalValue,
  agentPhotoBase64,
  user,
  onDismiss,
}: Props) {
  const shareCardRef = useRef<HTMLDivElement>(null);
  const hasFired = useRef(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [inviteFailed, setInviteFailed] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/agent-invite', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Invite fetch failed');
        const data = await res.json();
        const url = data.inviteUrl as string | undefined;
        if (cancelled || !url) return;
        setInviteUrl(url);
        const dataUrl = await QRCode.toDataURL(url, { width: 340, margin: 1 });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setInviteFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

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
  const photoSrc = agentPhotoBase64
    ? `data:image/jpeg;base64,${agentPhotoBase64}`
    : null;

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

      {/* Off-screen share card for social media (1080x1080 square) — redesigned with QR + referral */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div
          ref={shareCardRef}
          style={{ width: 1080, height: 1080, fontFamily: 'system-ui, sans-serif' }}
          className="bg-gradient-to-br from-[#005851] to-[#002e2a] flex flex-col items-center justify-between relative overflow-hidden"
        >
          {/* Decorative background */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 600,
              height: 600,
              background: `radial-gradient(circle, ${badge.color}15 0%, transparent 70%)`,
            }}
          />

          {/* Top: branding + tagline */}
          <div className="w-full px-16 pt-14 text-center relative z-10">
            <p className="text-[#44bbaa] text-2xl font-bold tracking-widest uppercase">
              AgentForLife
            </p>
            <p className="text-white/80 text-xl mt-3 max-w-[800px] mx-auto">
              AI-powered client retention for insurance agents
            </p>
          </div>

          {/* Center: badge, value, QR + link */}
          <div className="flex-1 flex flex-col items-center justify-center px-12 relative z-10">
            <PremiumBadge icon={badge.icon} color={badge.color} size={160} />
            <p className="text-white text-4xl font-extrabold mt-6">{badge.name}</p>
            {totalValue > 0 && (
              <p className="text-[#44bbaa] text-3xl font-extrabold mt-4">
                {formatValue(totalValue)} in value created
              </p>
            )}
            {qrDataUrl && inviteUrl && (
              <div className="flex flex-col items-center mt-8">
                <img src={qrDataUrl} alt="" width={280} height={280} style={{ width: 280, height: 280 }} />
                <p className="text-white/90 text-lg mt-3 font-medium max-w-[520px] text-center break-all">
                  {inviteUrl}
                </p>
                <p className="text-[#44bbaa] text-xl font-bold mt-2">
                  Scan to join — we both get 1 month free
                </p>
              </div>
            )}
            {inviteFailed && (
              <p className="text-white/60 text-xl mt-6 text-center max-w-[520px]">
                Share your achievement from the dashboard to get your invite link.
              </p>
            )}
          </div>

          {/* Bottom: agent photo + name */}
          <div className="w-full flex items-center gap-5 px-16 pb-14 relative z-10">
            {photoSrc ? (
              <img
                src={photoSrc}
                alt=""
                width={72}
                height={72}
                className="rounded-full object-cover"
                style={{ width: 72, height: 72 }}
              />
            ) : (
              <div
                className="rounded-full bg-[#44bbaa]/30 flex items-center justify-center text-white text-2xl font-bold"
                style={{ width: 72, height: 72 }}
              >
                {agentName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-white text-2xl font-bold">{agentName}</p>
              <p className="text-white/40 text-lg">Insurance Professional</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
