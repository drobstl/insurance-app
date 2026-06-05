'use client';

// Top-level Calendar surface (IA v2). The calendar started life as a tab
// inside Leads; it's "time" — its own noun that grows past pre-sale sits
// into client reviews, retention touchpoints, and birthdays — so it earns
// its own home. The week view itself is the same self-contained
// LeadsCalendar the Leads page renders (Firestore sits + Google busy);
// here it just gets a route + page chrome.
//
// Gating: Calendar ships dark behind NEXT_PUBLIC_LEADS_CALENDAR (admins
// always, so we can verify on prod before GA). When the flag is off and
// the visitor isn't an admin, bounce to Leads rather than show an empty
// surface. The sidebar only links here when calendarEnabled && iaEnabled,
// but a direct visit still resolves correctly via this guard.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../DashboardContext';
import LeadsCalendar from '../../../components/LeadsCalendar';

export default function CalendarPage() {
  const router = useRouter();
  const { isAdmin } = useDashboard();
  const calendarEnabled = isAdmin || process.env.NEXT_PUBLIC_LEADS_CALENDAR === 'on';

  useEffect(() => {
    if (!calendarEnabled) router.replace('/dashboard/leads');
  }, [calendarEnabled, router]);

  if (!calendarEnabled) return null;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-extrabold text-[#005851]">Calendar</h1>
        <p className="text-sm text-[#707070] mt-0.5">
          Your week — booked sits up front, your Google busy-blocks behind them.
        </p>
      </div>
      {/* "Go to call queue" drops into the Leads Call mode via ?call=1. */}
      <LeadsCalendar onGoToQueue={() => router.push('/dashboard/leads?call=1')} />
    </div>
  );
}
