'use client';

import { useEffect, useState } from 'react';

const ONBOARDING_URL = process.env.NEXT_PUBLIC_ONBOARDING_WALKTHROUGH_LOOM_URL;
const BULK_IMPORT_URL = process.env.NEXT_PUBLIC_BULK_IMPORT_WALKTHROUGH_LOOM_URL;
// Feature explainer walkthroughs surfaced in each feature's empty state (and
// listed in Resources → Video Tutorials). Each is gated on its own env var: an
// unset URL shows a tasteful "coming soon" until the Loom is recorded and the
// var is set in Vercel (NEXT_PUBLIC_* bakes at build, so it needs a redeploy).
const REFERRALS_URL = process.env.NEXT_PUBLIC_REFERRALS_WALKTHROUGH_LOOM_URL;
const REWRITES_URL = process.env.NEXT_PUBLIC_REWRITES_WALKTHROUGH_LOOM_URL;
const RETENTION_URL = process.env.NEXT_PUBLIC_RETENTION_WALKTHROUGH_LOOM_URL;

export const WALKTHROUGH_URLS = {
  onboarding: ONBOARDING_URL,
  bulkImport: BULK_IMPORT_URL,
  referrals: REFERRALS_URL,
  rewrites: REWRITES_URL,
  retention: RETENTION_URL,
} as const;

export type WalkthroughKey = keyof typeof WALKTHROUGH_URLS;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  videoUrl?: string;
  title: string;
  subtitle?: string;
}

export function OnboardingWalkthroughModal({ open, onClose, videoUrl, title, subtitle }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-bold text-[#0D4D4D]">{title}</h3>
            {subtitle && <p className="text-sm text-[#707070]">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#707070] hover:text-[#0D4D4D] hover:bg-gray-100 rounded-[5px] transition-colors"
            aria-label="Close walkthrough"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative bg-black" style={{ paddingBottom: '56.25%' }}>
          {videoUrl ? (
            <iframe
              src={videoUrl}
              className="absolute inset-0 w-full h-full"
              frameBorder={0}
              allowFullScreen
              title={title}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0D4D4D] text-white px-6 text-center">
              <svg className="w-12 h-12 text-[#3DD6C3] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="font-semibold mb-1">Walkthrough recording in progress.</p>
              <p className="text-sm text-white/75 max-w-md">
                This video is being recorded — it&apos;ll show up here automatically once it&apos;s live.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface PosterProps {
  onClick: () => void;
  videoUrl?: string;
  label: string;
  placeholderLabel?: string;
  aspectPercent?: number;
}

export function OnboardingWalkthroughPoster({ onClick, videoUrl, label, placeholderLabel, aspectPercent = 40 }: PosterProps) {
  const [thumbError, setThumbError] = useState(false);
  const loomId = videoUrl ? extractLoomId(videoUrl) : null;
  const thumbnailUrl = loomId && !thumbError ? `https://cdn.loom.com/sessions/thumbnails/${loomId}-with-play.gif` : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full mb-6 rounded-[5px] overflow-hidden border border-[#d0d0d0] bg-[#0D4D4D] hover:border-[#45bcaa] transition-colors"
      style={{ paddingBottom: `${aspectPercent}%` }}
      aria-label={label}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            onError={() => setThumbError(true)}
          />
        )}
        <div className="relative z-10 flex flex-col items-center text-white">
          <div className="w-14 h-14 rounded-full bg-white/95 text-[#0D4D4D] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="text-sm font-semibold">
            {videoUrl ? label : (placeholderLabel ?? 'Walkthrough coming soon')}
          </span>
        </div>
      </div>
    </button>
  );
}

function extractLoomId(url: string): string | null {
  const match = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  return match?.[1] ?? null;
}
