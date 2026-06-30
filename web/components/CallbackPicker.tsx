'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import { captureEvent } from '../lib/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';

/**
 * Callback picker — the lightweight prompt shown when the agent taps the
 * "Wants callback" dial outcome. The lead asked to be called back; this asks
 * *when*.
 *
 *   • A committed date/time  → POST /api/leads/[leadId]/callbacks. That writes a
 *     `kind: 'callback'` entry to the calendar (rendered apart from
 *     appointments, never counted as a booking) AND sets the lead's followUpAt
 *     to that exact time, so the dial queue resurfaces it right when it's due.
 *   • "None given"            → POST /api/leads/[leadId]/dials with the plain
 *     callback_requested outcome; the server bumps the follow-up to the next
 *     day. No calendar entry — there's no committed time to put on it.
 *
 * Deliberately NOT AppointmentPicker — a callback has no duration, meeting
 * mode, video link, or calendar-invite, and must not look or behave like a
 * booked sit.
 */

interface Props {
  user: User | null;
  leadId: string;
  leadName: string;
  /** Phone the agent dialed, logged on the dial entry for multi-phone leads. */
  phoneDialed?: string | null;
  /** Called after either path succeeds (close the prompt). */
  onDone: () => void;
  onCancel: () => void;
}

function tomorrowMorning(): { date: string; time: string } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: '10:00' };
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export default function CallbackPicker({ user, leadId, leadName, phoneDialed, onDone, onCancel }: Props) {
  const initial = tomorrowMorning();
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [submitting, setSubmitting] = useState<'time' | 'none' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firstName = leadName.trim().split(/\s+/)[0] || 'them';

  // "None given" — no committed time. Plain dial outcome; server bumps the
  // follow-up to the next day.
  const handleNoneGiven = useCallback(async () => {
    if (!user) return;
    setSubmitting('none');
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/leads/${leadId}/dials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          outcome: 'callback_requested',
          ...(phoneDialed ? { phoneDialed } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || `Failed to log callback (${res.status})`);
        return;
      }
      captureEvent(ANALYTICS_EVENTS.CALL_OUTCOME_RECORDED, {
        lead_id: leadId,
        outcome: 'callback_requested',
        source: 'detail_panel',
      });
      onDone();
    } catch (err) {
      console.error('callback (none given) error:', err);
      setError('Network error — please try again');
    } finally {
      setSubmitting(null);
    }
  }, [user, leadId, phoneDialed, onDone]);

  // Committed time — write the callback calendar entry + exact-time follow-up.
  const handleSetCallback = useCallback(async () => {
    if (!user) return;
    if (!date || !time) {
      setError('Pick a date and time');
      return;
    }
    const local = new Date(`${date}T${time}:00`);
    if (Number.isNaN(local.getTime())) {
      setError('Invalid date or time');
      return;
    }
    if (local.getTime() < Date.now() - 60_000) {
      setError('That callback time is in the past');
      return;
    }
    setSubmitting('time');
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/leads/${leadId}/callbacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scheduledAt: local.toISOString(),
          scheduledAtTimeZone: browserTimeZone(),
          ...(phoneDialed ? { phoneDialed } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Failed to set callback (${res.status})`);
        return;
      }
      captureEvent(ANALYTICS_EVENTS.CALLBACK_SCHEDULED, {
        lead_id: leadId,
        callback_id: data?.callbackId,
        hours_until_callback: Math.max(0, Math.round((local.getTime() - Date.now()) / 3_600_000)),
        source: 'detail_panel',
      });
      onDone();
    } catch (err) {
      console.error('set callback error:', err);
      setError('Network error — please try again');
    } finally {
      setSubmitting(null);
    }
  }, [user, leadId, date, time, phoneDialed, onDone]);

  const busy = submitting !== null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={busy ? undefined : onCancel}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl border-2 border-[#1A1A1A] sm:border-r-[5px] sm:border-b-[5px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-bold text-[#000000]">When do they want the call?</div>
        <div className="text-sm text-[#707070] mt-0.5">
          Set the time {firstName} asked for — it lands on your calendar and pops {firstName} back to
          the top of your queue then.
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            disabled={busy}
            onChange={(e) => setDate(e.target.value)}
            className="px-2.5 py-2 text-sm border border-[#d0d0d0] rounded-lg focus:outline-none focus:border-[#45bcaa]"
          />
          <input
            type="time"
            value={time}
            disabled={busy}
            onChange={(e) => setTime(e.target.value)}
            className="px-2.5 py-2 text-sm border border-[#d0d0d0] rounded-lg focus:outline-none focus:border-[#45bcaa]"
          />
        </div>

        {error && <div className="mt-3 text-sm text-[#A0382A]">{error}</div>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => void handleSetCallback()}
            disabled={busy}
            className="col-span-2 grid place-items-center py-2.5 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
          >
            {submitting === 'time' ? 'Setting…' : 'Set callback'}
          </button>
          <button
            onClick={() => void handleNoneGiven()}
            disabled={busy}
            className="col-span-1 grid place-items-center py-2.5 text-sm font-semibold text-[#0D4D4D] bg-white hover:bg-[#f8f8f8] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
          >
            {submitting === 'none' ? 'Saving…' : 'None given'}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="col-span-1 grid place-items-center py-2.5 text-sm font-semibold text-[#707070] bg-white hover:bg-[#f8f8f8] rounded-lg border border-[#d0d0d0] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        <div className="mt-2 text-[11px] text-[#9CA3AF] text-center">
          No time? &ldquo;None given&rdquo; reminds you tomorrow — no calendar entry.
        </div>
      </div>
    </div>,
    document.body,
  );
}
