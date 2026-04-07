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
      <div className="relative bg-white rounded-[12px] shadow-2xl max-w-lg w-full p-8 text-center animate-in zoom-in-95 duration-300">
        {/* Glow ring behind badge */}
        <div className="relative mx-auto w-[300px] h-[300px] mb-6">
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              background: `radial-gradient(circle, ${badge.color}30 0%, transparent 70%)`,
            }}
          />
          <div className="relative flex items-center justify-center w-full h-full">
            <PremiumBadge
              badgeId={badge.id}
              size={300}
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

      {/* Off-screen share card for social media (1080x1080 square) */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div
          ref={shareCardRef}
          style={{
            width: 1080,
            height: 1080,
            fontFamily: 'system-ui, sans-serif',
            background: 'linear-gradient(160deg, #005545 0%, #003a32 18%, #002420 48%, #000f0e 100%)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
          }}
        >
          {/* Diagonal texture overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 40px)',
            }}
          />

          {/* Radial glow — primary (center-left, behind badge) */}
          <div
            style={{
              position: 'absolute',
              width: 1000,
              height: 1000,
              top: '38%',
              left: '32%',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(68,187,170,0.22) 0%, rgba(68,187,170,0.08) 35%, transparent 65%)',
            }}
          />

          {/* Radial glow — secondary (upper area warmth) */}
          <div
            style={{
              position: 'absolute',
              width: 700,
              height: 700,
              top: '8%',
              left: '50%',
              transform: 'translate(-50%, 0)',
              background: 'radial-gradient(circle, rgba(68,187,170,0.10) 0%, transparent 60%)',
            }}
          />

          {/* Ornamental swirl flourishes */}
          <svg
            width="1080"
            height="1080"
            viewBox="0 0 1080 1080"
            fill="none"
            style={{ position: 'absolute', inset: 0, zIndex: 1 }}
          >
            {/* Upper-left scrollwork — bold, visible */}
            <path d="M-30 200 C80 190, 120 80, 220 50 S380 -10, 480 70 S560 200, 640 140 S740 40, 820 100" stroke="rgba(255,255,255,0.09)" strokeWidth="1.5" />
            <path d="M-50 320 C100 290, 170 150, 290 100 S480 40, 600 140 S720 300, 840 230" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
            <path d="M-20 100 C50 70, 100 10, 180 30 S280 110, 360 60 S460 -30, 540 40 S620 130, 700 80" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <path d="M-40 420 C60 400, 140 320, 240 300 S400 280, 500 340" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            {/* Right-side flowing curves */}
            <path d="M1110 280 C1020 330, 950 430, 970 540 S1050 680, 1000 770 S910 890, 960 980" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
            <path d="M1090 180 C1000 250, 930 370, 960 480 S1030 610, 990 700 S920 800, 960 880" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            {/* Bottom-left accent */}
            <path d="M60 1100 C110 1000, 220 960, 340 990 S500 1060, 600 1010 S720 940, 800 980" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <path d="M-20 980 C40 920, 120 900, 200 930 S320 990, 400 950" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          </svg>

          {/* === TOP BAR: logo (left) + agent (right) === */}
          <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '48px 60px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src="/logo.png" alt="" width={56} height={34} style={{ width: 56, height: 34 }} />
              <span style={{ color: '#b2dfdb', fontWeight: 700, fontSize: 24, letterSpacing: 4, textTransform: 'uppercase' as const }}>
                AgentForLife™
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' as const }}>
                <p style={{ color: '#ffffff', fontWeight: 800, fontSize: 28, lineHeight: 1.2, margin: 0 }}>{agentName}</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, margin: 0 }}>{badge.name} Achiever</p>
              </div>
              {photoSrc ? (
                <img
                  src={photoSrc}
                  alt=""
                  width={80}
                  height={80}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    objectFit: 'cover' as const,
                    border: '3px solid rgba(68,187,170,0.6)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: 'rgba(68,187,170,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: 32,
                    border: '3px solid rgba(68,187,170,0.6)',
                  }}
                >
                  {agentName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* === HERO TITLE: "{BADGE_NAME} MILESTONE UNLOCKED" === */}
          <div style={{ position: 'relative', zIndex: 10, padding: '28px 60px 0', textAlign: 'center' as const, flexShrink: 0 }}>
            <p
              style={{
                fontSize: 72,
                fontWeight: 900,
                lineHeight: 1.05,
                textTransform: 'uppercase' as const,
                color: '#5be0d0',
                margin: 0,
                WebkitTextStroke: '2px rgba(0,40,35,0.8)',
                textShadow: '0 2px 4px rgba(0,0,0,0.7), 0 0 80px rgba(68,187,170,0.35), 0 0 30px rgba(91,224,208,0.2)',
              }}
            >
              {badge.name} Milestone<br />Unlocked
            </p>
          </div>

          {/* === MIDDLE: Badge image (left) + Dollar value (right) === */}
          <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', padding: '16px 60px 0', gap: 20, flexShrink: 0 }}>
            <img
              src={`/badges/${badge.id}.png`}
              alt=""
              width={400}
              height={400}
              style={{
                width: 400,
                height: 400,
                objectFit: 'contain' as const,
                transform: 'rotate(-6deg)',
                filter: 'drop-shadow(0 12px 40px rgba(0,0,0,0.55))',
                flexShrink: 0,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start', justifyContent: 'center' }}>
              <p
                style={{
                  fontSize: 110,
                  fontWeight: 900,
                  lineHeight: 1,
                  color: '#ffffff',
                  margin: 0,
                  textShadow: '0 0 60px rgba(68,187,170,0.6), 0 0 120px rgba(68,187,170,0.3), 0 4px 16px rgba(0,0,0,0.5)',
                }}
              >
                {formatValue(totalValue)}
              </p>
              <p style={{ fontSize: 30, color: 'rgba(255,255,255,0.6)', fontWeight: 500, fontStyle: 'italic' as const, margin: '8px 0 0' }}>
                Annual Premium
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 6, marginLeft: 80 }}>
                <svg width="28" height="32" viewBox="0 0 28 32" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M4 2 C4 18, 10 26, 24 28" stroke="rgba(68,187,170,0.6)" strokeWidth="1.5" fill="none" />
                  <path d="M18 24 L24 28 L17 30" stroke="rgba(68,187,170,0.6)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div
                  style={{
                    padding: '4px 16px 5px',
                    borderRadius: 999,
                    border: '2px solid rgba(95,240,220,0.72)',
                    background: 'rgba(12,84,76,0.35)',
                    boxShadow: '0 0 18px rgba(95,240,220,0.22), inset 0 0 0 1px rgba(95,240,220,0.15)',
                  }}
                >
                  <p style={{ fontSize: 18, color: 'rgba(95,240,220,0.92)', fontWeight: 700, fontStyle: 'italic' as const, margin: 0 }}>
                    generated on autopilot
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* === TESTIMONIAL (flex-1, fills remaining space) === */}
          <div style={{ position: 'relative', zIndex: 10, padding: '24px 60px 0', maxWidth: 960, flex: 1, overflow: 'hidden' }}>
            <p
              style={{
                fontSize: 27,
                lineHeight: 1.5,
                color: 'rgba(255,255,255,0.85)',
                fontWeight: 400,
                margin: 0,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {definition?.shareText}
            </p>
          </div>

          {/* === BOTTOM BAR: QR + CTA (left) + sparkle (right) === */}
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              padding: '20px 60px 44px',
              flexShrink: 0,
              marginTop: 'auto',
            }}
          >
            {qrDataUrl && inviteUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <img
                  src={qrDataUrl}
                  alt=""
                  width={100}
                  height={100}
                  style={{ width: 100, height: 100, borderRadius: 8 }}
                />
                <div>
                  <p style={{ color: '#44bbaa', fontWeight: 800, fontSize: 24, letterSpacing: 3, textTransform: 'uppercase' as const, margin: 0 }}>
                    Scan to Join
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 15, margin: '4px 0 0', maxWidth: 500, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inviteUrl}
                  </p>
                </div>
              </div>
            ) : (
              <div />
            )}

            <div />
          </div>
        </div>
      </div>
    </div>
  );
}
