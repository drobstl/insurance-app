'use client';

import { useState } from 'react';

/**
 * In-app confirmation modal for the "magical upgrade" flow.
 *
 * Renders when /api/stripe/upgrade-tier returns `mode: 'in_app'`,
 * meaning the agent already has a card on file with Stripe and we can
 * skip Stripe Checkout entirely. The modal shows what they're about
 * to be charged, on which card, and gives them a single Confirm
 * button that fires the actual subscription update.
 *
 * Visual language matches the paywall card it sits in front of:
 * frosted-glass surface, teal-gradient cap, brand teal CTA, chunky
 * offset shadow consistent with the AFL pattern.
 */

export interface UpgradePreview {
  monthlyPriceCents: number;
  monthlyPriceDisplay: string;
  isFounding: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  nextBillingDateDisplay: string | null;
  hasActiveSubscription: boolean;
}

interface UpgradeConfirmModalProps {
  preview: UpgradePreview;
  /** Returns a promise; while pending, modal shows the Upgrading… state. */
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  /** Optional error to surface inline (set by parent if the confirm POST fails). */
  error?: string | null;
}

const CARD_BRAND_DISPLAY: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

export default function UpgradeConfirmModal({
  preview,
  onConfirm,
  onCancel,
  error,
}: UpgradeConfirmModalProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      // If the parent navigates (typical), we won't reach finally.
      // If the parent errors and stays on this surface, restore the
      // button so they can retry.
      setConfirming(false);
    }
  };

  const cardLabel =
    preview.cardBrand && preview.cardLast4
      ? `${CARD_BRAND_DISPLAY[preview.cardBrand] ?? preview.cardBrand.toUpperCase()} •••• ${preview.cardLast4}`
      : 'Card on file';

  const billingLine =
    preview.hasActiveSubscription && preview.nextBillingDateDisplay
      ? `Prorated charge today for the rest of this billing cycle, then ${preview.monthlyPriceDisplay} on ${preview.nextBillingDateDisplay} and every month after.`
      : `${preview.monthlyPriceDisplay}, charged today. Renews monthly.`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      {/* Backdrop — click to cancel (unless mid-confirm) */}
      <button
        type="button"
        aria-label="Cancel upgrade"
        onClick={onCancel}
        disabled={confirming}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default disabled:cursor-wait"
      />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-[440px] bg-white border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] rounded-[14px] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
        {/* Brand-gradient cap — same as paywall card */}
        <div className="h-1.5 bg-gradient-to-r from-[#005851] to-[#44bbaa]" />

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2
              id="upgrade-confirm-title"
              className="text-[20px] font-extrabold text-[#005851]"
            >
              Upgrade to Pro
            </h2>
            {preview.isFounding && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-[10px] font-extrabold uppercase tracking-[0.08em] px-2 py-1 rounded">
                Founding $50 off
              </span>
            )}
          </div>

          {/* Price block */}
          <div className="bg-[#F8F9FA] rounded-lg p-4 mb-4">
            <div className="text-[32px] font-extrabold text-[#005851] tabular-nums leading-none mb-1">
              {preview.monthlyPriceDisplay}
            </div>
            {preview.isFounding && (
              <div className="text-[11px] text-[#92400e] font-medium">
                Founding discount applied — locked in for life
              </div>
            )}
          </div>

          {/* Billing line */}
          <p className="text-[13px] text-[#374151] leading-relaxed mb-4">
            {billingLine}
          </p>

          {/* Card on file */}
          <div className="flex items-center gap-2 bg-[#F8F9FA] rounded-md px-3 py-2.5 mb-5 text-[13px] text-[#374151]">
            <svg
              className="w-4 h-4 text-[#707070] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <rect x="3" y="6" width="18" height="13" rx="2" />
              <path d="M3 10h18" strokeLinecap="round" />
            </svg>
            <span className="font-medium">{cardLabel}</span>
          </div>

          {/* Error (if any) */}
          {error && (
            <p role="alert" className="mb-3 text-[12px] text-red-700 leading-snug">
              {error}
            </p>
          )}

          {/* Confirm CTA */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="flex items-center justify-center w-full bg-[#005851] hover:bg-[#0d4d4d] disabled:opacity-70 disabled:cursor-wait text-white font-bold text-[15px] px-4 py-3.5 rounded-lg transition-colors mb-2"
          >
            {confirming ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Upgrading…
              </span>
            ) : (
              <>Confirm upgrade · {preview.monthlyPriceDisplay}</>
            )}
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="block w-full text-center py-2 text-[13px] text-[#707070] hover:text-[#005851] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
