'use client';

import Link from 'next/link';
import { BOOKED_LEAD_APP_AVAILABLE } from '../lib/feature-flags';

/**
 * Renders an in-page upgrade prompt for agents whose current tier
 * doesn't unlock the surface they navigated to.
 *
 * Used by route guards in `/dashboard/leads`,
 * `/dashboard/leads/[leadId]`, and `/dashboard/activity` when
 * `leadsAccessReason` / `activityAccessReason` returns
 * `'tier_locked'` (env-on but tier insufficient).
 *
 * Design (May 27, 2026 refresh):
 *   - Lightly-blurred "faux dashboard" backdrop fills the main area
 *     so the agent reads "there's a real product locked behind this"
 *     rather than "permission error with a price chip." No real data
 *     and no fake data — just skeleton geometry (KPI tiles, funnel
 *     bars, lead rows) so we never claim a number we can't back up.
 *   - Frosted-glass paywall card centers on top with a teal-gradient
 *     cap, surface-specific copy, and a price-baked-in CTA.
 *   - Activity surface also gets a standout callout block for AI
 *     call coaching (Performance page — already a Pro feature today;
 *     surfaced here because "see your numbers" pairs naturally with
 *     "and here's how to fix what's broken").
 *
 * Per CONTEXT.md §"Tier gating > Implementation status":
 *   "Upgrade-prompt UI for non-Pro agents who hit a Pro+ surface.
 *    Don't 404 — that's hostile."
 *
 * The CTA points to /pricing (not a one-click upgrade) because the
 * founding-member discount + Stripe billing portal flow has nuance
 * better handled on /pricing + Stripe Checkout.
 */

type UpgradeSurface = 'leads' | 'activity';

interface SurfaceCopy {
  headline: string;
  sub: string;
  bullets: string[];
  callout?: { title: string; description: string };
}

const SURFACE_COPY: Record<UpgradeSurface, SurfaceCopy> = {
  leads: {
    headline: 'The pipeline runs itself.',
    sub: 'Drop in a lead form and AFL does the rest — extracts every field, queues the next call, drafts the booking text, turns the win into a monitored client. You stay on the phone, where the money is.',
    bullets: [
      'Drop in a lead form — AFL pulls every field automatically. No retyping.',
      'AFL tells you who to dial next, based on what happened on the last call.',
      'Book the sit-down — AFL drafts the confirmation text with your business card and the state-matched license. You just hit send.',
      'Win the sale — and the lead becomes an Agent for Life client: monitored for lapses and cancellations, kept warm for referrals and rewrites, for life.',
    ],
    callout: BOOKED_LEAD_APP_AVAILABLE
      ? {
          title: 'Plus: Your booked leads show up ready',
          description:
            'Every booked lead gets a branded prep page — your video, your testimonials, your intake assessment. They walk in warm, prepped, and halfway sold.',
        }
      : undefined,
  },
  activity: {
    headline: 'The numbers track themselves.',
    sub: 'Every dial, every appointment, every sale — counted automatically as you work. No spreadsheets, no estimating, no end-of-month panic. You make the calls. AFL does the math.',
    bullets: [
      'Daily funnel: dials → contacts → booked → showed → sold',
      'Book, show, and close rates pulled from your actual appointments',
      'APV trends across day, week, month, YTD',
      'Saved APV — every premium you kept from walking out the door',
    ],
    callout: {
      title: 'Plus: AI coaching on your real calls',
      description:
        "Paste an appointment recording. Get back exactly where you lost the deal — and what to say next time.",
    },
  },
};

interface UpgradeToProCardProps {
  surface: UpgradeSurface;
}

export default function UpgradeToProCard({ surface }: UpgradeToProCardProps) {
  const copy = SURFACE_COPY[surface];

  return (
    // Negative margins break out of the dashboard `<main>` padding
    // (`p-4 md:p-6` in layout.tsx ~L952) so the blurred backdrop runs
    // flush to the sidebar/edge — the paywall takes over the whole
    // content area, not a card-on-a-card.
    <div className="relative min-h-[75vh] overflow-hidden -m-4 md:-m-6">
      {/* Blurred faux-dashboard backdrop. 1.5px blur + 0.9 opacity:
          legible structure (you can tell it's a dashboard) without
          being so sharp that anyone reads it as a real screenshot. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none select-none"
        style={{ filter: 'blur(1.5px) saturate(0.95)', opacity: 0.9 }}
      >
        {surface === 'leads' ? <FauxLeadsBackdrop /> : <FauxActivityBackdrop />}
      </div>

      {/* Soft radial fade — keeps the dashboard edges legible but
          calms the area directly under the paywall card so it reads
          as the primary subject. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(248,248,248,0.30) 0%, rgba(248,248,248,0.15) 70%, rgba(248,248,248,0.05) 100%)',
        }}
      />

      {/* Paywall card */}
      <div className="relative z-10 flex items-center justify-center min-h-[75vh] px-4 py-10">
        <div className="w-full max-w-[520px] bg-white/88 backdrop-blur-md border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] rounded-[14px] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
          {/* Brand-gradient cap */}
          <div className="h-1.5 bg-gradient-to-r from-[#005851] to-[#44bbaa]" />

          <div className="p-7">
            {/* Pro pill + price micro-line */}
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="inline-flex items-center gap-1.5 bg-[#daf3f0] text-[#005851] text-[11px] font-extrabold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2 9.2 8.6 2 9.3l5.5 4.8L5.8 21 12 17.3 18.2 21l-1.7-6.9L22 9.3l-7.2-.7L12 2z" />
                </svg>
                Pro
              </span>
              <span className="text-[11px] text-[#707070] font-semibold">
                Available on Pro · $99/mo
              </span>
            </div>

            <h1 className="text-[26px] font-extrabold text-[#005851] leading-[1.15] tracking-[-0.01em] mb-2">
              {copy.headline}
            </h1>
            <p className="text-sm text-[#4B5563] leading-relaxed mb-5">{copy.sub}</p>

            <ul className="space-y-2.5 mb-5">
              {copy.bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex items-start gap-2.5 text-[13.5px] text-[#1F2937] leading-[1.4]"
                >
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#daf3f0] flex-shrink-0 mt-0.5">
                    <svg
                      className="w-3 h-3 text-[#005851]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {copy.callout && (
              <div
                className="relative flex items-start gap-3 border-[1.5px] border-[#44bbaa] rounded-[10px] px-4 py-3.5 mb-5 overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #e8f7f3 0%, #d2eee6 100%)',
                }}
              >
                {/* Soft radial highlight in top-right corner */}
                <span
                  aria-hidden
                  className="absolute pointer-events-none"
                  style={{
                    top: -20,
                    right: -20,
                    width: 80,
                    height: 80,
                    borderRadius: 9999,
                    background:
                      'radial-gradient(circle, rgba(0,88,81,0.08) 0%, rgba(0,88,81,0) 70%)',
                  }}
                />
                <span className="relative inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#005851] text-white flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 1l2.4 6.6L21 10l-6.6 2.4L12 19l-2.4-6.6L3 10l6.6-2.4L12 1zm7 13l1.2 3.3L23.5 18.5l-3.3 1.2L19 23l-1.2-3.3L14.5 18.5l3.3-1.2L19 14z" />
                  </svg>
                </span>
                <div className="relative flex-1 min-w-0">
                  <div className="text-[11px] font-extrabold text-[#005851] uppercase tracking-[0.1em] mb-0.5">
                    {copy.callout.title}
                  </div>
                  <div className="text-[13.5px] text-[#1F2937] leading-[1.45]">
                    {copy.callout.description}
                  </div>
                </div>
              </div>
            )}

            {/* CTA — price baked into the button so the upgrade
                decision and the price land in the same eye-sweep. */}
            <Link
              href="/pricing"
              className="flex items-center justify-between w-full bg-[#005851] hover:bg-[#0d4d4d] text-white font-bold text-[15px] px-4 py-3.5 rounded-lg transition-colors"
            >
              <span>Upgrade to Pro</span>
              <span className="opacity-85 text-sm">$99/mo →</span>
            </Link>

            <div className="flex items-center justify-between mt-3 px-1 text-[11.5px] text-[#707070]">
              <Link href="/pricing" className="text-[#005851] font-semibold hover:underline">
                Compare all plans
              </Link>
              <span>Cancel anytime · No setup</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Faux backdrops ─────────────────────────────────────────────────
// Decorative skeletons rendered behind the paywall card. No real
// data and no fake numbers — just the geometry of the actual surface
// so the agent reads "there's a real product locked behind this"
// without us claiming any specific results. Heavy use of placeholder
// `····` / shape blocks where text would normally live.

const FAUX_LEAD_CHIP_TONES: Record<string, string> = {
  Booked: 'bg-[#daf3f0] text-[#005851]',
  Callback: 'bg-[#fef3c7] text-[#92400e]',
  'No answer': 'bg-[#f3f4f6] text-[#374151]',
  'Left VM': 'bg-[#e0e7ff] text-[#3730a3]',
};

function FauxLeadsBackdrop() {
  const rows: Array<'Booked' | 'Callback' | 'No answer' | 'Left VM'> = [
    'Booked',
    'Callback',
    'No answer',
    'Booked',
    'Left VM',
    'Callback',
    'No answer',
    'Booked',
  ];
  return (
    <div className="px-7 py-6">
      <div className="flex justify-between items-center mb-3.5">
        <h2 className="text-[22px] font-bold text-black">Lead pipeline</h2>
        <div className="flex gap-2">
          <div className="bg-white border border-[#d0d0d0] rounded-md px-3.5 py-2 text-xs">
            Sort: Queue priority
          </div>
          <div className="bg-[#005851] text-white rounded-md px-3.5 py-2 text-xs font-semibold">
            + Add lead
          </div>
        </div>
      </div>
      <div className="bg-white border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] rounded-xl">
        <div className="flex px-4 py-3 border-b border-[#f1f1f1] text-[10px] uppercase tracking-[0.08em] text-[#707070] font-bold">
          <div className="w-[246px]">Lead</div>
          <div className="w-[140px]">Phone</div>
          <div className="w-[100px]">Last dial</div>
          <div className="flex-1">Outcome</div>
          <div className="w-20 text-right">Status</div>
        </div>
        {rows.map((label, i) => (
          <FauxLeadRow key={i} label={label} isNext={i === 0} />
        ))}
      </div>
    </div>
  );
}

function FauxLeadRow({ label, isNext = false }: { label: string; isNext?: boolean }) {
  const tone = FAUX_LEAD_CHIP_TONES[label] ?? 'bg-[#f3f4f6] text-[#374151]';
  // First row gets a 3px teal left-border + soft teal-tint background to
  // read as "next to dial" — subtle queue-priority cue without faking
  // numbers. Other rows stay neutral.
  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-3 border-b border-[#f1f1f1] last:border-b-0 ${
        isNext ? 'border-l-[3px] border-l-[#44bbaa] bg-[#daf3f0]/30' : ''
      }`}
    >
      <span className="w-8 h-8 rounded-full bg-[#daf3f0] flex-shrink-0" />
      <span className="h-2.5 rounded-sm bg-[#e9ecef] w-[200px]" />
      <span className="h-2.5 rounded-sm bg-[#e9ecef] w-[130px]" />
      <span className="h-2.5 rounded-sm bg-[#e9ecef] w-[90px]" />
      <span className={`ml-auto text-[10px] font-bold px-2 py-1 rounded ${tone} flex-shrink-0`}>
        {label}
      </span>
    </div>
  );
}

function FauxKpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-[0.1em] text-[#707070] font-bold">{label}</p>
      <p className="text-[28px] font-bold text-[#005851] tabular-nums leading-none mt-1.5">
        {value}
      </p>
    </div>
  );
}

function FauxActivityBackdrop() {
  return (
    <div className="px-7 py-6">
      <div className="flex justify-between items-center mb-3.5">
        <div>
          <h2 className="text-[22px] font-bold text-black">Activity</h2>
          <p className="text-[11px] text-[#707070] mt-1">This month</p>
        </div>
        <div className="inline-flex border border-[#d0d0d0] rounded-md overflow-hidden bg-white text-[11px]">
          {['Today', 'Week', 'Month', '30 days', 'YTD'].map((label, i) => (
            <div
              key={label}
              className={`px-3 py-1.5 ${i > 0 ? 'border-l border-[#d0d0d0]' : ''} ${
                label === 'Month' ? 'bg-[#005851] text-white' : ''
              }`}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-3">
        {['Dials', 'Contacts', 'Booked', 'Sales', 'New APV'].map((label) => (
          <FauxKpiTile key={label} label={label} value={label === 'New APV' ? '$····' : '···'} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {['Book rate', 'Show rate', 'Close rate'].map((label) => (
          <FauxKpiTile key={label} label={label} value="··%" />
        ))}
      </div>

      <div className="bg-white border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] rounded-xl p-4 mb-5">
        <div className="flex justify-between mb-2.5">
          <h3 className="text-xs text-[#005851] uppercase tracking-[0.08em] font-bold">Funnel</h3>
          <span className="text-[11px] text-[#707070]">% conversion from previous step</span>
        </div>
        {[
          { stage: 'Dials', width: '100%', color: '#005851' },
          { stage: 'Contacts', width: '62%', color: '#0d4d4d' },
          { stage: 'Booked', width: '38%', color: '#44bbaa' },
          { stage: 'Showed', width: '28%', color: '#7fd1c4' },
          { stage: 'Sold', width: '18%', color: '#a8e1d6' },
        ].map((row) => (
          <div key={row.stage} className="flex items-center gap-3 py-1.5">
            <span className="w-20 text-xs font-semibold text-[#374151]">{row.stage}</span>
            <div className="flex-1 h-6 bg-[#f1f1f1] rounded overflow-hidden">
              <div className="h-full" style={{ width: row.width, background: row.color }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 bg-white border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] rounded-xl p-4">
          <div className="flex justify-between mb-3">
            <h3 className="text-xs text-[#005851] uppercase tracking-[0.08em] font-bold">
              New APV by source
            </h3>
            <span className="text-xl font-bold text-[#005851]">$·····</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-[#f1f1f1] mb-3.5">
            <div className="flex-[3] bg-[#005851]" />
            <div className="flex-[2] bg-[#44bbaa]" />
            <div className="flex-[1] bg-[#7fd1c4]" />
            <div className="flex-[1.5] bg-[#cfd2d5]" />
          </div>
          <ul className="space-y-2">
            {['Bought lead', 'Referral', 'Rewrite', 'Earned lead'].map((label) => (
              <li key={label} className="flex justify-between text-xs">
                <span>● {label}</span>
                <span>$····</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-[#FEFCE8] border-2 border-[#FCD34D] border-r-[5px] border-b-[5px] rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-[0.1em] text-[#92400E] font-bold">
            Saved APV
          </p>
          <p className="text-3xl font-bold text-[#92400E] tabular-nums leading-none mt-1.5">$····</p>
          <p className="text-[11px] text-[#92400E]/80 mt-1.5">·· saves this period</p>
        </div>
      </div>
    </div>
  );
}
