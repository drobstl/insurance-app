'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  buildGoogleCalendarAddUrl,
  buildIcsDataUrl,
  describeRelativeToNow,
  getNextTrainingSession,
  isSessionLive,
  TRAINING_PITCH_LINE,
} from '../lib/training-sessions';

/**
 * Dashboard-home card surfacing the next AFL training session.
 *
 * Source of truth: `CONTEXT.md` > Backlog > Weekly training session
 * infrastructure (#4 from Rob's May 24 call). Two recurring weekly
 * sessions (Tue 11am CT, Thu 7pm CT) hosted by Daniel. This card is the
 * persistent prompt — the agent sees it every time they land on /dashboard,
 * with a one-click Join when the session is live and an Add-to-calendar
 * option so they get reminded by their own calendar even when they're
 * not in AFL.
 *
 * Visibility: hides itself entirely when `NEXT_PUBLIC_TRAINING_SESSION_URL`
 * is unset (preview/local-dev). A broken Join button is worse than no
 * card at all.
 *
 * Re-render cadence: a 60-second tick driven by setInterval refreshes
 * the relative-time copy ("in 3 hours" → "in 2 hours") and flips the
 * "live now" state when the session start crosses. Tick is cheap because
 * we recompute pure values; no Firestore subscription, no remote calls.
 */
export default function NextTrainingSessionCard() {
  const meetingUrl = process.env.NEXT_PUBLIC_TRAINING_SESSION_URL || '';

  // Driven tick so the relative-time copy stays fresh and the live
  // state flips at the right moment. 60s is plenty — the smallest
  // visible label step is "in X minutes."
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const session = useMemo(() => getNextTrainingSession(now), [now]);
  const live = isSessionLive(session, now);
  const relative = describeRelativeToNow(session, now);

  const googleUrl = useMemo(
    () => (meetingUrl ? buildGoogleCalendarAddUrl(session, meetingUrl) : ''),
    [session, meetingUrl],
  );
  const icsUrl = useMemo(
    () => (meetingUrl ? buildIcsDataUrl(session, meetingUrl) : ''),
    [session, meetingUrl],
  );

  const [addOpen, setAddOpen] = useState(false);

  if (!meetingUrl) return null;

  const dayLabel = session.slot.dayLabel;
  const timeLabel = session.slot.timeLabel;
  const tzShort = session.slot.timeZoneShort;

  return (
    <div className="mb-8 rounded-xl border-2 border-[#44bbaa] bg-gradient-to-br from-white to-[#f0fbf9] p-5 shadow-[0_2px_12px_rgba(68,187,170,0.18)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#44bbaa] text-white">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </span>
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#005851]">
              Next training session {live ? '· LIVE NOW' : ''}
            </p>
          </div>
          <p className="text-xl font-bold text-[#0D4D4D]">
            {dayLabel} at {timeLabel} {tzShort}
            <span className="ml-2 text-sm font-medium text-[#5f5f5f]">· {relative}</span>
          </p>
          <p className="mt-1 text-sm text-[#4f4f4f] italic">
            {TRAINING_PITCH_LINE}
          </p>
        </div>

        <div className="flex flex-col gap-2 shrink-0 md:items-end">
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] text-sm font-bold transition-colors ${
              live
                ? 'bg-[#005851] text-white hover:bg-[#003e3a]'
                : 'bg-[#44bbaa] text-white hover:bg-[#3aa092]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {live ? 'Join now' : 'Join when live'}
          </a>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[5px] border border-[#d0d0d0] bg-white hover:bg-[#f8f8f8] text-xs font-semibold text-[#0D4D4D] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Add to calendar
              <svg className={`w-3 h-3 transition-transform ${addOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {addOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 w-56 rounded-lg border border-[#d0d0d0] bg-white shadow-lg overflow-hidden">
                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setAddOpen(false)}
                  className="block px-3 py-2 text-xs font-semibold text-[#0D4D4D] hover:bg-[#f0fbf9] transition-colors"
                >
                  Google Calendar
                </a>
                <a
                  href={icsUrl}
                  download="afl-training-session.ics"
                  onClick={() => setAddOpen(false)}
                  className="block px-3 py-2 text-xs font-semibold text-[#0D4D4D] hover:bg-[#f0fbf9] transition-colors border-t border-[#ececec]"
                >
                  Apple Calendar (.ics)
                </a>
                <a
                  href={icsUrl}
                  download="afl-training-session.ics"
                  onClick={() => setAddOpen(false)}
                  className="block px-3 py-2 text-xs font-semibold text-[#0D4D4D] hover:bg-[#f0fbf9] transition-colors border-t border-[#ececec]"
                >
                  Outlook (.ics)
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
