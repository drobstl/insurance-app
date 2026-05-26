'use client';

import Link from 'next/link';

/**
 * Renders an in-page upgrade prompt for agents whose current tier
 * doesn't unlock the surface they navigated to.
 *
 * Used by route guards in `/dashboard/leads`, `/dashboard/leads/[leadId]`,
 * and `/dashboard/activity` when `leadsAccessReason` /
 * `activityAccessReason` returns `'tier_locked'` (env-on but tier
 * insufficient).
 *
 * The CTA always points to /pricing so the agent lands on the live
 * tier table — we deliberately avoid one-click upgrade-to-Pro from
 * this surface because the founding-member discount + Stripe billing
 * portal flow has nuance better handled on /pricing + Stripe Checkout.
 *
 * Per CONTEXT.md §"Tier gating > Implementation status":
 * "Upgrade-prompt UI for non-Pro agents who hit a Pro+ surface.
 *  Don't 404 — that's hostile."
 */

interface UpgradeToProCardProps {
  /** What the agent tried to access — used in the headline. */
  featureName: string;
  /** Short pitch (1-2 sentences) for why this lives behind Pro. */
  description: string;
  /** Optional list of bullets describing what they unlock. */
  bullets?: string[];
}

export default function UpgradeToProCard({
  featureName,
  description,
  bullets,
}: UpgradeToProCardProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[5px] shadow-lg border border-[#d0d0d0] p-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#daf3f0] text-[#005851]">
            Pro
          </span>
          <span className="text-xs text-[#707070]">$99/mo</span>
        </div>

        <h1 className="text-2xl font-bold text-[#005851] mb-2">
          {featureName} is a Pro feature
        </h1>
        <p className="text-[#4B5563] mb-5">{description}</p>

        {bullets && bullets.length > 0 && (
          <ul className="space-y-2 mb-6">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2 text-sm text-[#374151]">
                <svg
                  className="w-4 h-4 text-[#44bbaa] mt-0.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/pricing"
          className="block w-full py-3 px-4 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] text-center transition-colors"
        >
          See pricing
        </Link>

        <Link
          href="/dashboard"
          className="block w-full mt-3 py-2 px-4 text-center text-sm text-[#707070] hover:text-[#005851] transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
