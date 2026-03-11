'use client';

import { useMemo } from 'react';
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

interface DashboardTickerProps {
  stats: AgentAggregates | null;
  clientCount: number;
}

export default function DashboardTicker({ stats, clientCount }: DashboardTickerProps) {
  const quote = useMemo(
    () => TICKER_QUOTES[Math.floor(Math.random() * TICKER_QUOTES.length)],
    [],
  );

  const items = useMemo(() => {
    const parts: string[] = [];
    parts.push(`Total Clients: ${formatNum(clientCount)}`);

    if (stats) {
      parts.push(`Policies Saved: ${formatNum(stats.savedPolicies.count)}`);
      parts.push(`Total APV: ${formatCurrency(stats.totalApv)}`);
      parts.push(`Save Rate: ${formatPct(stats.rates.conservationSaveRate)}`);
      parts.push(`Referral Rate: ${formatPct(stats.rates.referralAppointmentRate)}`);
      parts.push(`Referrals: ${formatNum(stats.referrals.total)}`);
      parts.push(`Touchpoints Sent: ${formatNum(stats.touchpoints.total)}`);
    }

    parts.push(`"${quote}"`);
    return parts;
  }, [stats, clientCount, quote]);

  const separator = (
    <span className="mx-4 text-white/40">•</span>
  );

  const content = items.map((item, i) => (
    <span key={i} className="inline-flex items-center whitespace-nowrap">
      {i > 0 && separator}
      <span className="text-xs font-medium">{item}</span>
    </span>
  ));

  return (
    <div className="bg-[#005851] overflow-hidden h-8 flex items-center group">
      <div className="ticker-scroll inline-flex group-hover:[animation-play-state:paused]">
        <div className="inline-flex items-center text-white px-4">
          {content}
        </div>
        <div className="inline-flex items-center text-white px-4" aria-hidden>
          {content}
        </div>
      </div>
    </div>
  );
}
