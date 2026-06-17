'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentAggregates } from '../lib/stats-aggregation';
import TICKER_QUOTES from '../lib/ticker-quotes';

function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n.toLocaleString('en-US')}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Visual emphasis per segment kind. The bar is teal (#005851); urgent prompts
// read amber, the greeting a soft mint, everything else white.
type SegmentTone = 'default' | 'urgent' | 'context';

interface TickerSegment {
  id: string;
  label: string;
  emoji?: string;
  /** When set, the segment is clickable and routes here. */
  href?: string;
  tone?: SegmentTone;
}

interface DashboardTickerProps {
  stats: AgentAggregates | null;
  clientCount: number;
  /** Open at-risk policies (active retention campaigns + fresh flags). */
  atRiskCount?: number;
  /** Annualized premium (APV) of those at-risk policies. */
  atRiskApv?: number;
  /** Appointments scheduled for today. */
  appointmentsToday?: number;
  /** Fresh leads (last 7 days) that have never been dialed. */
  uncalledLeads?: number;
  /** Agent's first name, for the time-of-day greeting. */
  agentFirstName?: string;
}

// One time-aware "moment" that opens the strip — a greeting plus a clause that
// shifts by hour, weekday, and where we are in the month. Most-specific wins.
function buildContextSegment(now: Date, agentFirstName?: string): TickerSegment {
  const hour = now.getHours();
  const weekday = now.getDay(); // 0 Sun … 6 Sat
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate(); // 0 on the last day of the month

  let greeting: string;
  let emoji: string;
  if (hour >= 5 && hour < 12) {
    greeting = 'Good morning';
    emoji = '☀️';
  } else if (hour >= 12 && hour < 17) {
    greeting = 'Good afternoon';
    emoji = '☀️';
  } else if (hour >= 17 && hour < 22) {
    greeting = 'Good evening';
    emoji = '🌙';
  } else {
    greeting = 'Working late';
    emoji = '🌙';
  }
  const who = agentFirstName ? `${greeting}, ${agentFirstName}` : greeting;

  let tail: string;
  if (daysLeft <= 3) {
    tail = `${daysLeft === 0 ? 'last day' : `${daysLeft} days left`} — finish the month strong`;
  } else if (weekday === 5 && hour >= 12) {
    tail = 'strong week — lock in one referral before you log off';
  } else if (weekday === 1 && hour < 12) {
    tail = 'new week — set the pace early';
  } else if (weekday === 0 || weekday === 6) {
    tail = 'a quick weekend check-in keeps clients close';
  } else if (hour >= 5 && hour < 11) {
    tail = "your next $10K month starts with today's first call";
  } else if (hour >= 11 && hour < 14) {
    tail = 'midday — who still needs a callback?';
  } else if (hour >= 14 && hour < 17) {
    tail = 'afternoon push — one more dial';
  } else if (hour >= 17 && hour < 22) {
    tail = "wrap up — confirm tomorrow's appointments";
  } else {
    tail = 'the warm list is ready when you are';
  }

  return { id: 'context', emoji, label: `${who} · ${tail}`, tone: 'context' };
}

export default function DashboardTicker({
  stats,
  clientCount,
  atRiskCount = 0,
  atRiskApv = 0,
  appointmentsToday = 0,
  uncalledLeads = 0,
  agentFirstName,
}: DashboardTickerProps) {
  const router = useRouter();

  // The quote advances ONLY when the marquee completes a loop (the
  // onAnimationIteration handler below), never on a wall-clock timer. So it
  // can't change while it's on screen mid-read, and the content width only
  // ever changes at the off-screen wrap point — no mid-scroll stutter. Start
  // at a random offset so two agents (or tabs) don't march in lockstep.
  const [quoteIndex, setQuoteIndex] = useState(() =>
    Math.floor(Math.random() * TICKER_QUOTES.length),
  );

  const segments = useMemo<TickerSegment[]>(() => {
    const out: TickerSegment[] = [];

    // ── Moment — a time-of-day greeting opens the strip. Rebuilt each loop
    //    (when quoteIndex advances), so the clock stays current off-screen. ──
    out.push(buildContextSegment(new Date(), agentFirstName));

    // ── Prompts — time-sensitive, money-on-the-line, clickable. ──
    if (atRiskCount > 0) {
      const noun = atRiskCount === 1 ? 'policy' : 'policies';
      const apvSuffix = atRiskApv > 0 ? ` · ${formatCurrency(atRiskApv)} APV` : '';
      out.push({
        id: 'at-risk',
        emoji: '⚠️',
        label: `${formatNum(atRiskCount)} ${noun} at risk${apvSuffix}`,
        href: '/dashboard/conservation',
        tone: 'urgent',
      });
    }
    if (appointmentsToday > 0) {
      out.push({
        id: 'appts-today',
        emoji: '📅',
        label: `${formatNum(appointmentsToday)} ${appointmentsToday === 1 ? 'appointment' : 'appointments'} today`,
        href: '/dashboard/calendar',
        tone: 'urgent',
      });
    }
    if (uncalledLeads > 0) {
      out.push({
        id: 'uncalled-leads',
        emoji: '📞',
        label: `${formatNum(uncalledLeads)} ${uncalledLeads === 1 ? 'lead' : 'leads'} to call`,
        href: '/dashboard/leads?call=1',
        tone: 'urgent',
      });
    }

    // ── Pulse — the book at a glance. ──
    out.push({ id: 'clients', label: `Total Clients: ${formatNum(clientCount)}` });
    if (stats) {
      out.push({ id: 'apv', label: `Total APV: ${formatCurrency(stats.totalApv)}` });
      out.push({ id: 'saved', label: `Policies Saved: ${formatNum(stats.savedPolicies.count)}` });
      if (stats.successfulRewrites.count > 0) {
        out.push({ id: 'rewrites', label: `Rewrites: ${formatNum(stats.successfulRewrites.count)}` });
      }
      out.push({ id: 'save-rate', label: `Save Rate: ${formatPct(stats.rates.conservationSaveRate)}` });
      out.push({ id: 'referral-rate', label: `Referral Rate: ${formatPct(stats.rates.referralAppointmentRate)}` });
      out.push({ id: 'referrals', label: `Referrals: ${formatNum(stats.referrals.total)}` });
      out.push({ id: 'touchpoints', label: `Touchpoints Sent: ${formatNum(stats.touchpoints.total)}` });
    }

    // ── Philosophy — always present; rotates one quote per loop. ──
    const q = TICKER_QUOTES[quoteIndex % TICKER_QUOTES.length];
    out.push({
      id: 'quote',
      label: q.author ? `"${q.text}" — ${q.author}` : `"${q.text}"`,
    });

    return out;
  }, [stats, clientCount, atRiskCount, atRiskApv, appointmentsToday, uncalledLeads, agentFirstName, quoteIndex]);

  // Duration scales with segment count so the px/sec reading speed stays steady
  // when a prompt appears or drops off the bar.
  const durationSec = Math.max(40, segments.length * 4.5);

  const renderStream = (interactive: boolean) =>
    segments.map((seg, i) => {
      const toneClass =
        seg.tone === 'urgent'
          ? 'text-[#FFD37E]'
          : seg.tone === 'context'
            ? 'text-[#E1F5EE]'
            : 'text-white';
      const inner = (
        <span className={`text-xs ${seg.tone ? 'font-semibold' : 'font-medium'} ${toneClass}`}>
          {seg.emoji && <span className="mr-1">{seg.emoji}</span>}
          {seg.label}
        </span>
      );
      return (
        <span
          key={`${interactive ? 'a' : 'b'}-${seg.id}-${i}`}
          className="inline-flex items-center whitespace-nowrap"
        >
          {i > 0 && <span className="mx-4 text-white/40">•</span>}
          {seg.href && interactive ? (
            <button
              type="button"
              onClick={() => router.push(seg.href as string)}
              className="inline-flex items-center hover:underline focus:underline focus:outline-none"
            >
              {inner}
            </button>
          ) : (
            inner
          )}
        </span>
      );
    });

  return (
    <div className="bg-[#005851] overflow-hidden h-8 flex items-center group">
      <div
        className="ticker-scroll inline-flex group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${durationSec}s` }}
        onAnimationIteration={() => setQuoteIndex((i) => (i + 1) % TICKER_QUOTES.length)}
      >
        <div className="inline-flex items-center px-4">{renderStream(true)}</div>
        <div className="inline-flex items-center px-4" aria-hidden>
          {renderStream(false)}
        </div>
      </div>
    </div>
  );
}
