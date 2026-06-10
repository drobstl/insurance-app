'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentAggregates } from '../lib/stats-aggregation';
import TICKER_QUOTES from '../lib/ticker-quotes';
import { getMostRecentBadge, getNextBadgeToChase } from '../lib/badges';

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

// How long each motivational quote stays up before the next rotates in. The
// prior ticker picked one quote per session and froze on it — this brings the
// marquee's whole library back into rotation.
const QUOTE_ROTATE_MS = 14000;

// Visual emphasis per segment kind. The bar is teal (#005851); urgent prompts
// read amber, pride/progress reads gold (matches the Refer & Earn accent),
// everything else stays white.
type SegmentTone = 'default' | 'urgent' | 'gold' | 'context';

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
  /** Appointments scheduled for today. */
  appointmentsToday?: number;
  /** Agent's first name, for the time-of-day greeting. */
  agentFirstName?: string;
}

// One time-aware "moment" that opens the strip — a greeting plus a clause that
// shifts by hour, weekday, and where we are in the month. Most-specific wins;
// the month-end line folds in real badge-gap progress when there's an APV badge
// in reach. Recomputed on a minute tick so it stays current while the tab's open.
function buildContextSegment(
  now: Date,
  stats: AgentAggregates | null,
  agentFirstName?: string,
): TickerSegment {
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

  const nextBadge = stats ? getNextBadgeToChase(stats) : null;
  const apvGap =
    stats && nextBadge && nextBadge.progressLabel === 'APV'
      ? Math.max(0, nextBadge.target - nextBadge.current(stats))
      : 0;

  let tail: string;
  if (daysLeft <= 3 && apvGap > 0 && nextBadge) {
    const when = daysLeft === 0 ? 'last day' : `${daysLeft}d left`;
    tail = `${when} — ${formatCurrency(apvGap)} from ${nextBadge.name}`;
  } else if (daysLeft <= 3) {
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
  appointmentsToday = 0,
  agentFirstName,
}: DashboardTickerProps) {
  const router = useRouter();

  // Rotate the quote on an interval. Start at a random offset so two agents
  // (or two tabs) don't march in lockstep.
  const [quoteIndex, setQuoteIndex] = useState(() =>
    Math.floor(Math.random() * TICKER_QUOTES.length),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % TICKER_QUOTES.length);
    }, QUOTE_ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  // Re-read the clock each minute so the time-of-day greeting refreshes while
  // the tab stays open (e.g. morning → afternoon, or rolling into the month's
  // final days).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const segments = useMemo<TickerSegment[]>(() => {
    const out: TickerSegment[] = [];

    // ── Moment — a time-of-day greeting opens the strip. ──
    out.push(buildContextSegment(now, stats, agentFirstName));

    // ── Prompts — time-sensitive, money-on-the-line, clickable. Lead the
    //    stream so the first thing scrolling by is something to act on. ──
    if (atRiskCount > 0) {
      out.push({
        id: 'at-risk',
        emoji: '⚠️',
        label: `${formatNum(atRiskCount)} ${atRiskCount === 1 ? 'policy' : 'policies'} at risk`,
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

    // ── Pride — progress toward the next badge + the most recent win. ──
    if (stats) {
      const next = getNextBadgeToChase(stats);
      if (next) {
        const remaining = Math.max(0, next.target - next.current(stats));
        const toGo =
          next.progressLabel === 'APV'
            ? `${formatCurrency(remaining)} to go`
            : `${formatNum(remaining)} to go`;
        out.push({
          id: 'next-badge',
          emoji: '🎯',
          label: `Next badge: ${next.name} · ${toGo}`,
          tone: 'gold',
        });
      }
      const recent = getMostRecentBadge(stats);
      if (recent) {
        out.push({
          id: 'recent-badge',
          emoji: '🏅',
          label: `Latest badge: ${recent.name}`,
          tone: 'gold',
        });
      }
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

    // ── Philosophy — always present, rotating. ──
    const q = TICKER_QUOTES[quoteIndex % TICKER_QUOTES.length];
    out.push({
      id: 'quote',
      label: q.author ? `"${q.text}" — ${q.author}` : `"${q.text}"`,
    });

    return out;
  }, [stats, clientCount, atRiskCount, appointmentsToday, agentFirstName, quoteIndex, now]);

  // Fixed-duration CSS scroll means a longer stream scrolls faster. Scale the
  // duration with segment count so the reading speed stays roughly constant
  // however much is on the bar.
  const durationSec = Math.max(40, segments.length * 4.5);

  const renderStream = (interactive: boolean) =>
    segments.map((seg, i) => {
      const toneClass =
        seg.tone === 'urgent'
          ? 'text-[#FFD37E]'
          : seg.tone === 'gold'
            ? 'text-[#F5C542]'
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
      >
        <div className="inline-flex items-center px-4">{renderStream(true)}</div>
        <div className="inline-flex items-center px-4" aria-hidden>
          {renderStream(false)}
        </div>
      </div>
    </div>
  );
}
