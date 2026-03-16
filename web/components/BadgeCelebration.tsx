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
  shareOnly?: boolean;
}

export default function BadgeCelebration({
  badge,
  agentUid,
  agentName,
  totalValue,
  agentPhotoBase64,
  user,
  onDismiss,
  shareOnly,
}: Props) {
  const shareCardRef = useRef<HTMLDivElement>(null);
  const hasFired = useRef(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [inviteFailed, setInviteFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (shareOnly || hasFired.current) return;
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
  }, [badge.color, shareOnly]);

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
    if (!shareOnly) {
      try {
        await updateDoc(doc(db, 'agents', agentUid), {
          celebratedBadgeIds: arrayUnion(badge.id),
        });
      } catch { /* non-critical */ }
    }
    onDismiss();
  }, [agentUid, badge.id, onDismiss, shareOnly]);

  const handleShare = useCallback(async () => {
    if (!shareCardRef.current) return;
    try {
      const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2 });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `badge-${badge.id}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        const shareText = inviteUrl
          ? `I just earned the "${badge.name}" badge on AgentForLife — ${formatValue(totalValue)} in value created. Join here: ${inviteUrl}`
          : `I just earned the "${badge.name}" badge on AgentForLife — ${formatValue(totalValue)} in value created!`;
        await navigator.share({
          text: shareText,
          files: [file],
        });
      } else {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = `badge-${badge.id}.png`;
          link.click();
        }
      }
    } catch { /* user cancelled or unsupported */ }
  }, [badge, inviteUrl, totalValue]);

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
        <div className="relative mx-auto w-[120px] h-[120px] mb-6">
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              background: `radial-gradient(circle, ${badge.color}30 0%, transparent 70%)`,
            }}
          />
          <div className="relative flex items-center justify-center w-full h-full">
            <PremiumBadge
              badgeId={badge.id}
              size={120}
              shimmer
              glow
            />
          </div>
        </div>

        <h2 className="text-2xl font-extrabold text-[#005851] mb-1">
          {shareOnly ? 'Share Badge' : 'Badge Earned!'}
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
            {copied ? 'Copied!' : 'Share Achievement'}
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 py-3 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-[5px] transition-colors"
          >
            {shareOnly ? 'Close' : 'Continue'}
          </button>
        </div>
      </div>

      {/* Off-screen share card for social media (1080x1080 square) — badge-hero layout */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div
          ref={shareCardRef}
          style={{
            width: 1080,
            height: 1080,
            fontFamily: 'system-ui, sans-serif',
            background: 'linear-gradient(135deg, #005851 0%, #002e2a 60%, #001a18 100%)',
          }}
          className="flex flex-col relative overflow-hidden"
        >
          {/* Diagonal texture overlay */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 40px)',
            }}
          />

          {/* Radial glow burst behind badge */}
          <div
            className="absolute"
            style={{
              width: 800,
              height: 800,
              top: '38%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(68,187,170,0.12) 30%, transparent 65%)',
            }}
          />

          {/* Top: logo + value + tagline */}
          <div className="relative z-10 w-full px-16 pt-14">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="" width={60} height={36} style={{ width: 60, height: 36 }} />
                <p className="text-[#44bbaa] font-bold tracking-widest uppercase" style={{ fontSize: 26 }}>
                  AgentForLife™
                </p>
              </div>
              <p
                className="text-white text-right"
                style={{
                  fontSize: 64,
                  fontWeight: 900,
                  lineHeight: 1,
                  textShadow: '0 0 30px rgba(68,187,170,0.5), 0 2px 10px rgba(0,0,0,0.5)',
                }}
              >
                {formatValue(totalValue)}
              </p>
            </div>
            <div className="flex items-center justify-between mt-2">
              {!shareOnly && (
                <div
                  style={{
                    border: '2px solid rgba(68,187,170,0.5)',
                    borderRadius: 999,
                    padding: '4px 20px',
                  }}
                >
                  <p className="text-[#44bbaa] font-bold uppercase" style={{ fontSize: 18, letterSpacing: 3 }}>
                    Just Earned
                  </p>
                </div>
              )}
              {shareOnly && <div />}
              <p className="text-[#44bbaa] font-bold" style={{ fontSize: 22 }}>
                generated on autopilot
              </p>
            </div>
            <div className="w-full mt-5" style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Center hero: THE BADGE */}
          <div className="flex-1 flex flex-col items-center justify-center relative z-10">
            <img
              src={`/badges/${badge.id}.png`}
              alt=""
              width={380}
              height={380}
              style={{
                width: 380,
                height: 380,
                objectFit: 'contain',
                filter: 'drop-shadow(0 8px 40px rgba(0,0,0,0.5))',
              }}
            />
            <p
              className="text-white font-extrabold mt-4 text-center"
              style={{ fontSize: 40, textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}
            >
              {badge.name}
            </p>
          </div>

          {/* Bottom: agent info + QR */}
          <div className="relative z-10 w-full px-16 pb-14">
            <div className="w-full mb-5" style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
            <div className="flex items-center justify-between">
              {/* Agent identity */}
              <div className="flex items-center gap-5">
                {photoSrc ? (
                  <img
                    src={photoSrc}
                    alt=""
                    width={100}
                    height={100}
                    className="rounded-full object-cover"
                    style={{
                      width: 100,
                      height: 100,
                      border: '3px solid #44bbaa',
                      boxShadow: '0 0 0 6px rgba(255,255,255,0.06)',
                    }}
                  />
                ) : (
                  <div
                    className="rounded-full bg-[#44bbaa]/30 flex items-center justify-center text-white font-bold"
                    style={{
                      width: 100,
                      height: 100,
                      fontSize: 36,
                      border: '3px solid #44bbaa',
                      boxShadow: '0 0 0 6px rgba(255,255,255,0.06)',
                    }}
                  >
                    {agentName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-white font-bold" style={{ fontSize: 30 }}>{agentName}</p>
                  <p className="text-white/40" style={{ fontSize: 20 }}>Insurance Professional</p>
                </div>
              </div>

              {/* QR + CTA */}
              {qrDataUrl && inviteUrl && (
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-[#44bbaa] font-bold uppercase" style={{ fontSize: 22, letterSpacing: 2 }}>
                      Scan to join
                    </p>
                    <p className="text-white/40 mt-1 break-all" style={{ fontSize: 14, maxWidth: 220 }}>
                      {inviteUrl}
                    </p>
                  </div>
                  <img src={qrDataUrl} alt="" width={100} height={100} style={{ width: 100, height: 100, borderRadius: 8 }} />
                </div>
              )}
            </div>
          </div>

          {inviteFailed && !qrDataUrl && (
            <p className="text-white/50 pb-14 text-center relative z-10 px-16" style={{ fontSize: 20 }}>
              Share your achievement from the dashboard to get your invite link.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
