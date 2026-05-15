'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { User } from 'firebase/auth';

interface DayEvent {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  allDay: boolean;
}

/**
 * Day strip — horizontal hour-grid covering DAY_START_HOUR..DAY_END_HOUR.
 * Existing events render as gray blocks; the proposed appointment renders
 * in AFL teal. Conflicts are flagged red. Pure presentation — all fetch +
 * state happens above.
 */
const DAY_START_HOUR = 7;   // 7am
const DAY_END_HOUR = 21;    // 9pm
const HOURS = DAY_END_HOUR - DAY_START_HOUR;

function minutesIntoDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function clampPct(minutes: number): number {
  const dayStartMin = DAY_START_HOUR * 60;
  const dayEndMin = DAY_END_HOUR * 60;
  const pct = ((minutes - dayStartMin) / (dayEndMin - dayStartMin)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * Appointment picker — modal-style overlay invoked when the agent
 * picks "Booked" as the dial outcome (Chunk 4c).
 *
 * Captures: scheduled date + time + duration + optional notes.
 * Submits via POST /api/leads/[leadId]/appointments which atomically
 * creates the appointment doc AND logs the dial outcome as 'booked'.
 *
 * Defaults the date+time to the next half-hour boundary in local TZ —
 * agents are usually scheduling for "tomorrow 2pm" / "this afternoon"
 * type slots, so a near-future default minimizes typing on the most
 * common case.
 */

interface Props {
  user: User | null;
  leadId: string;
  leadName: string;
  /**
   * When set, the picker operates in **reschedule** mode: prepopulates
   * fields from this appointment and PATCHes /api/appointments/[id]
   * instead of POSTing a new one. The header label flips to
   * "Reschedule appointment".
   */
  existingAppointment?: {
    id: string;
    scheduledAt: Date;
    durationMinutes: number;
    notes?: string;
    meetingUrl?: string;
  };
  /** Lead email (snapshot). When present, "Invite lead by email" is offered. */
  leadEmail?: string;
  /** Agent defaults from settings — controls the phone/video mode + meeting-link prefill. */
  agentAppointmentMode?: 'phone' | 'video';
  agentDefaultMeetingLink?: string;
  agentAutoCreateGoogleMeet?: boolean;
  /** True when Google Calendar is connected — required for auto-Meet + email invites. */
  googleCalendarConnected?: boolean;
  /**
   * Called after a successful save. The scheduledAt Date is included
   * so callers can pass it directly to the SendConfirmationDrawer
   * without round-tripping through Firestore.
   */
  onBooked: (appointmentId: string, scheduledAt: Date) => void;
  onCancel: () => void;
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hr' },
  { value: 90, label: '1.5 hr' },
];

/**
 * Build a near-future default — round UP to the next half-hour, then
 * add 1 hour so the agent isn't trying to schedule something for
 * "10 minutes from now."
 */
function nextHalfHour(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  const minutes = d.getMinutes();
  if (minutes < 30) d.setMinutes(30, 0, 0);
  else { d.setHours(d.getHours() + 1); d.setMinutes(0, 0, 0); }
  // Local-TZ ISO components for the date/time inputs.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

function toDateTimeInputs(d: Date): { date: string; time: string } {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export default function AppointmentPicker({
  user,
  leadId,
  leadName,
  existingAppointment,
  leadEmail,
  agentAppointmentMode,
  agentDefaultMeetingLink,
  agentAutoCreateGoogleMeet,
  googleCalendarConnected,
  onBooked,
  onCancel,
}: Props) {
  const isReschedule = !!existingAppointment;
  const defaults = useMemo(
    () => existingAppointment
      ? toDateTimeInputs(existingAppointment.scheduledAt)
      : nextHalfHour(),
    [existingAppointment],
  );
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [duration, setDuration] = useState(existingAppointment?.durationMinutes ?? 30);
  const [notes, setNotes] = useState(existingAppointment?.notes ?? '');

  // Phone vs Video. Reschedule keeps the existing mode (inferred from
  // whether a meetingUrl is set); new bookings default to the agent's
  // configured appointmentMode.
  const initialMode: 'phone' | 'video' = existingAppointment
    ? (existingAppointment.meetingUrl ? 'video' : 'phone')
    : (agentAppointmentMode === 'video' ? 'video' : 'phone');
  const [mode, setMode] = useState<'phone' | 'video'>(initialMode);

  // Meeting URL handling:
  //  - existing appointment → prefill from existingAppointment.meetingUrl
  //  - new + agentAutoCreateGoogleMeet + Calendar connected → "(auto-generate)"
  //    rendered as a non-editable placeholder, URL left empty so the server
  //    creates one and writes it back
  //  - new + defaultMeetingLink → prefill that
  const usingAutoMeet = !isReschedule && !!agentAutoCreateGoogleMeet && !!googleCalendarConnected;
  const [meetingUrl, setMeetingUrl] = useState<string>(
    existingAppointment?.meetingUrl
      ?? (usingAutoMeet ? '' : (agentDefaultMeetingLink || '')),
  );

  // Invite lead by email — only meaningful when we have an email + Calendar
  // is connected. Defaults on for video bookings with a valid email.
  const hasLeadEmail = !!leadEmail && /.+@.+\..+/.test(leadEmail);
  const [inviteLeadByEmail, setInviteLeadByEmail] = useState<boolean>(
    !isReschedule && mode === 'video' && hasLeadEmail && !!googleCalendarConnected,
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Day-strip data — fetched when the date changes (Option A).
  const [dayEvents, setDayEvents] = useState<DayEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !googleCalendarConnected || !date) return;
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const tz = getBrowserTimeZone() || 'UTC';
        const res = await fetch(
          `/api/integrations/google-calendar/events?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(tz)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setEventsError(`Couldn't load calendar (HTTP ${res.status})`);
          return;
        }
        const data = (await res.json()) as { connected: boolean; events: DayEvent[]; error?: string };
        if (cancelled) return;
        setDayEvents(Array.isArray(data.events) ? data.events : []);
        if (data.error) setEventsError(data.error);
      } catch (err) {
        if (!cancelled) {
          console.error('day-strip fetch error:', err);
          setEventsError('Network error');
        }
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, date, googleCalendarConnected]);

  // Proposed appointment range (in local minutes-of-day) — for the strip
  // overlay and conflict detection. Recomputed on time/duration change.
  const proposedRange = useMemo(() => {
    if (!date || !time) return null;
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + duration * 60_000);
    return { start, end };
  }, [date, time, duration]);

  // Conflict detection: any non-allday event that overlaps the proposed range.
  const conflicts = useMemo(() => {
    if (!proposedRange) return [] as DayEvent[];
    const ps = proposedRange.start.getTime();
    const pe = proposedRange.end.getTime();
    return dayEvents.filter((e) => {
      if (e.allDay) return false;
      const es = new Date(e.startIso).getTime();
      const ee = new Date(e.endIso).getTime();
      return es < pe && ee > ps;
    });
  }, [dayEvents, proposedRange]);

  // Esc to cancel — small but missing-it-feels-cheap.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel, submitting]);

  const handleSubmit = useCallback(async () => {
    if (!user) return;
    if (!date || !time) {
      setError('Pick a date and time');
      return;
    }
    // Compose ISO. The date/time come from the inputs in local TZ;
    // `new Date('YYYY-MM-DDTHH:MM')` parses as local. .toISOString()
    // converts to UTC for storage.
    const local = new Date(`${date}T${time}:00`);
    if (Number.isNaN(local.getTime())) {
      setError('Invalid date or time');
      return;
    }
    if (local.getTime() < Date.now() - 60_000) {
      setError('Appointment time is in the past');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const tz = getBrowserTimeZone();
      const url = isReschedule
        ? `/api/appointments/${existingAppointment!.id}`
        : `/api/leads/${leadId}/appointments`;
      const method = isReschedule ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduledAt: local.toISOString(),
          scheduledAtTimeZone: tz,
          durationMinutes: duration,
          notes: notes.trim(),
          meetingUrl: mode === 'video' ? meetingUrl.trim() : '',
          inviteLeadByEmail: mode === 'video' && inviteLeadByEmail && hasLeadEmail,
          addGoogleMeet: mode === 'video' && usingAutoMeet,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Failed to ${isReschedule ? 'reschedule' : 'book'} (${res.status})`);
        return;
      }
      onBooked(isReschedule ? existingAppointment!.id : data.appointmentId, local);
    } catch (err) {
      console.error('book appointment error:', err);
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }, [user, leadId, date, time, duration, notes, onBooked, isReschedule, existingAppointment, mode, meetingUrl, inviteLeadByEmail, hasLeadEmail, usingAutoMeet]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !submitting && onCancel()}
      />
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-[#ececec]">
          <div>
            <h3 className="text-xl font-bold text-[#000000]">
              {isReschedule ? 'Reschedule appointment' : 'Book appointment'}
            </h3>
            <p className="text-xs text-[#707070] mt-0.5">
              {leadName ? `with ${leadName}` : 'with this lead'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={submitting}
                autoFocus
                className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#000000] mb-1">Duration</label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuration(opt.value)}
                  disabled={submitting}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                    duration === opt.value
                      ? 'bg-[#005851] text-white border-[#005851]'
                      : 'bg-white text-[#0D4D4D] border-[#d0d0d0] hover:bg-[#f8f8f8]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Day strip — shows the agent's existing Google Calendar events
              for the chosen date so they can spot conflicts at a glance.
              Hidden when Calendar isn't connected. */}
          {googleCalendarConnected && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="block text-sm font-medium text-[#000000]">
                  Your day
                </label>
                <span className="text-[10px] text-[#707070]">
                  {eventsLoading ? 'Loading…' : `${DAY_START_HOUR > 12 ? DAY_START_HOUR - 12 : DAY_START_HOUR}${DAY_START_HOUR >= 12 ? 'pm' : 'am'} – ${DAY_END_HOUR > 12 ? DAY_END_HOUR - 12 : DAY_END_HOUR}${DAY_END_HOUR >= 12 ? 'pm' : 'am'}`}
                </span>
              </div>
              {conflicts.length > 0 && (
                <div className="mb-2 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-[5px]">
                  ⚠ Conflicts with: {conflicts.map((c) => c.title).join(', ')}
                </div>
              )}
              <div className="relative border border-[#d0d0d0] rounded-[5px] bg-[#fafafa]" style={{ height: '72px' }}>
                {/* Hour ticks */}
                <div className="absolute inset-0 flex">
                  {Array.from({ length: HOURS }, (_, i) => {
                    const h = DAY_START_HOUR + i;
                    const label = `${h > 12 ? h - 12 : h}${h >= 12 ? 'p' : 'a'}`;
                    return (
                      <div
                        key={i}
                        className="flex-1 border-l border-[#ececec] first:border-l-0 relative"
                      >
                        <span className="absolute top-0.5 left-0.5 text-[9px] text-[#9CA3AF] leading-none">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Existing events */}
                {dayEvents.filter((e) => !e.allDay).map((e) => {
                  const s = new Date(e.startIso);
                  const eEnd = new Date(e.endIso);
                  const left = clampPct(minutesIntoDay(s));
                  const right = clampPct(minutesIntoDay(eEnd));
                  const width = Math.max(1.2, right - left);
                  return (
                    <div
                      key={e.id}
                      title={`${e.title} · ${s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–${eEnd.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                      className="absolute top-[18px] bottom-[6px] bg-[#9CA3AF]/60 border border-[#6B7280]/40 rounded-[3px] overflow-hidden"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <span className="block px-1 pt-0.5 text-[9px] text-white font-semibold leading-tight truncate">
                        {e.title}
                      </span>
                    </div>
                  );
                })}
                {/* Proposed appointment overlay */}
                {proposedRange && (() => {
                  const left = clampPct(minutesIntoDay(proposedRange.start));
                  const right = clampPct(minutesIntoDay(proposedRange.end));
                  const width = Math.max(1.2, right - left);
                  const hasConflict = conflicts.length > 0;
                  return (
                    <div
                      className={`absolute top-[15px] bottom-[3px] rounded-[3px] border-2 ${
                        hasConflict
                          ? 'bg-red-500/40 border-red-600'
                          : 'bg-[#44bbaa]/70 border-[#005851]'
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  );
                })()}
              </div>
              {dayEvents.some((e) => e.allDay) && (
                <p className="mt-1 text-[10px] text-[#707070]">
                  All-day: {dayEvents.filter((e) => e.allDay).map((e) => e.title).join(', ')}
                </p>
              )}
              {eventsError && (
                <p className="mt-1 text-[10px] text-amber-700">
                  {eventsError} — book carefully; can&apos;t see your calendar right now.
                </p>
              )}
            </div>
          )}

          {/* Phone vs Video. Phone hides all the meeting-link / invite UI. */}
          <div>
            <label className="block text-sm font-medium text-[#000000] mb-1">Type</label>
            <div className="inline-flex rounded-[5px] border border-[#d0d0d0] overflow-hidden">
              <button
                type="button"
                onClick={() => setMode('phone')}
                disabled={submitting}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  mode === 'phone'
                    ? 'bg-[#005851] text-white'
                    : 'bg-white text-[#0D4D4D] hover:bg-[#f8f8f8]'
                }`}
              >
                Phone
              </button>
              <button
                type="button"
                onClick={() => setMode('video')}
                disabled={submitting}
                className={`px-4 py-2 text-sm font-semibold transition-colors border-l border-[#d0d0d0] ${
                  mode === 'video'
                    ? 'bg-[#005851] text-white'
                    : 'bg-white text-[#0D4D4D] hover:bg-[#f8f8f8]'
                }`}
              >
                Video
              </button>
            </div>
          </div>

          {mode === 'video' && (
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">
                Meeting link
              </label>
              {usingAutoMeet ? (
                <div className="px-3 py-2.5 bg-[#daf3f0]/40 border border-[#45bcaa]/30 rounded-[5px] text-sm text-[#005851]">
                  Google Meet link will be created automatically and added to the event.
                </div>
              ) : (
                <input
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  disabled={submitting}
                  placeholder="https://zoom.us/j/… or https://meet.google.com/abc-xyz"
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
                />
              )}
              {hasLeadEmail && googleCalendarConnected && (
                <label className="flex items-start gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inviteLeadByEmail}
                    onChange={(e) => setInviteLeadByEmail(e.target.checked)}
                    disabled={submitting}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-[#374151] leading-snug">
                    Send {leadName || 'the lead'} a calendar invite at <strong>{leadEmail}</strong>
                  </span>
                </label>
              )}
              {!hasLeadEmail && (
                <p className="text-[11px] text-amber-700 mt-1.5">
                  Add an email to the lead to send them a calendar invite.
                </p>
              )}
              {hasLeadEmail && !googleCalendarConnected && (
                <p className="text-[11px] text-amber-700 mt-1.5">
                  Connect Google Calendar in Settings to send calendar invites.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#000000] mb-1">
              Notes <span className="text-[#9CA3AF] font-normal">(optional — what to remember for the call)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Spouse name, mortgage size, expressed concerns…"
              className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm leading-relaxed focus:outline-none focus:border-[#45bcaa]"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-[#ececec] bg-[#fafafa] shrink-0">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 max-w-[180px] py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
          >
            {submitting
              ? (isReschedule ? 'Saving…' : 'Booking…')
              : (isReschedule ? 'Save changes' : 'Book it')}
          </button>
        </div>
      </div>
    </div>
  );
}
