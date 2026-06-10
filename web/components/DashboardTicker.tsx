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
type SegmentTone = 'default' | 'urgent' | 'gold';

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
}

export default function DashboardTicker({
  stats,
  clientCount,
  atRiskCount = 0,
  appointmentsToday = 0,
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

  const segments = useMemo<TickerSegment[]>(() => {
    const out: TickerSegment[] = [];

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
  }, [stats, clientCount, atRiskCount, appointmentsToday, quoteIndex]);

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
