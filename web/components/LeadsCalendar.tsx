'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import { useDashboard } from '../app/dashboard/DashboardContext';
import AppointmentPicker from './AppointmentPicker';
import SendConfirmationDrawer from './SendConfirmationDrawer';
import type { AppointmentStatus } from '../lib/appointments';

/**
 * Leads → Calendar tab (v1).
 *
 * A week-grid view of the agent's booked sits, laid over their real
 * Google Calendar busy-blocks. Reads appointments live from
 * `agents/{uid}/appointments` (the same flat subcollection the
 * UpcomingAppointmentsCard + leads list already query) for the visible
 * week, and pulls the agent's Google events per-day from the existing
 * `/api/integrations/google-calendar/events` route purely for context
 * (so the agent sees their whole day, not just AFL sits).
 *
 * Design notes:
 *  - Dependency-free date math (native Date) to match the app's current
 *    zero-date-lib status quo; the helpers are isolated below so they can
 *    be swapped for date-fns later without touching the render.
 *  - AFL sits are interactive blocks (call / join / remind / open lead);
 *    Google events render as muted, non-interactive "busy" backgrounds.
 *  - A mirrored sit comes back from BOTH Firestore and Google (it carries
 *    a `googleEventId`), so Google blocks whose id matches a sit are
 *    dropped — the sit renders once, as the interactive block.
 *  - Desktop shows the 7-column time grid; phones collapse to a per-day
 *    agenda (a 7-wide time grid doesn't fit a phone).
 */

// ── Tunables ──────────────────────────────────────────────────────────
const DAY_START_HOUR = 7;   // grid top (7 AM)
const DAY_END_HOUR = 21;    // grid bottom (9 PM)
const HOUR_PX = 44;         // vertical pixels per hour
const GRID_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX;

// ── Types ─────────────────────────────────────────────────────────────
interface CalAppt {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  leadEmail: string | null;
  leadState: string | null;
  scheduledAt: Date;
  scheduledAtTimeZone: string | null;
  durationMinutes: number;
  status: AppointmentStatus;
  meetingUrl: string | null;
  googleEventId: string | null;
}

interface BusyBlock {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

interface StatusMeta {
  label: string;
  block: string;   // block fill/border/text
  dot: string;     // legend + agenda dot
}

const STATUS_META: Record<AppointmentStatus, StatusMeta> = {
  scheduled: { label: 'Booked', block: 'bg-[#daf3f0] border-[#45bcaa] text-[#005851]', dot: 'bg-[#45bcaa]' },
  completed: { label: 'Sold', block: 'bg-[#DCFCE7] border-[#22C55E] text-[#15803D]', dot: 'bg-[#22C55E]' },
  sit_no_sale: { label: 'No sale', block: 'bg-[#E0F0FF] border-[#0099FF] text-[#0079CC]', dot: 'bg-[#0099FF]' },
  sit_think_about_it: { label: 'Thinking', block: 'bg-[#FFF4D6] border-[#F0B100] text-[#92500D]', dot: 'bg-[#F0B100]' },
  no_show: { label: 'No-show', block: 'bg-[#FFE4E1] border-[#FF6B5C] text-[#A0382A]', dot: 'bg-[#FF6B5C]' },
  cancelled: { label: 'Cancelled', block: 'bg-gray-100 border-gray-300 text-gray-500 line-through', dot: 'bg-gray-400' },
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Date helpers (native; swap for date-fns later) ────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay()); // back to Sunday
  return x;
}
function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function minutesIntoDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}
function fmtTime(d: Date, tz?: string | null): string {
  try {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz || undefined,
    });
  } catch {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
}
function tzAbbrev(d: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d);
    return parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}
function rangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const sameYear = weekStart.getFullYear() === end.getFullYear();
  const mS = weekStart.toLocaleDateString(undefined, { month: 'long' });
  const mE = end.toLocaleDateString(undefined, { month: 'short' });
  if (sameMonth) return `${mS} ${weekStart.getFullYear()}`;
  if (sameYear) return `${weekStart.toLocaleDateString(undefined, { month: 'short' })} – ${mE} ${end.getFullYear()}`;
  return `${weekStart.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

const SIT_HAPPENED: AppointmentStatus[] = ['completed', 'sit_no_sale', 'sit_think_about_it'];

// ══════════════════════════════════════════════════════════════════════
// Data hooks
// ══════════════════════════════════════════════════════════════════════

/** Live appointments for the visible week (single-field range query — no composite index). */
function useWeekAppointments(user: User | null, weekStart: Date): CalAppt[] {
  const [appts, setAppts] = useState<CalAppt[]>([]);
  const weekKey = weekStart.getTime();

  useEffect(() => {
    if (!user) {
      setAppts([]);
      return;
    }
    const weekEnd = addDays(weekStart, 7);
    const q = query(
      collection(db, 'agents', user.uid, 'appointments'),
      where('scheduledAt', '>=', Timestamp.fromDate(weekStart)),
      where('scheduledAt', '<', Timestamp.fromDate(weekEnd)),
      orderBy('scheduledAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: CalAppt[] = [];
        snap.forEach((d) => {
          const v = d.data() as Record<string, unknown>;
          const ts = v.scheduledAt as Timestamp | undefined;
          if (!ts) return;
          // Cancelled sits drop off the calendar: the slot is freed, so a
          // crossed-out block would make a free slot look busy — and it would
          // contradict the week tally, which already excludes cancelled.
          if (v.status === 'cancelled') return;
          rows.push({
            id: d.id,
            leadId: typeof v.leadId === 'string' ? v.leadId : '',
            leadName: typeof v.leadName === 'string' && v.leadName ? v.leadName : 'Lead',
            leadPhone: typeof v.leadPhone === 'string' ? v.leadPhone : '',
            leadEmail: typeof v.leadEmail === 'string' ? v.leadEmail : null,
            leadState: typeof v.leadState === 'string' ? v.leadState : null,
            scheduledAt: ts.toDate(),
            scheduledAtTimeZone: typeof v.scheduledAtTimeZone === 'string' ? v.scheduledAtTimeZone : null,
            durationMinutes: typeof v.durationMinutes === 'number' ? v.durationMinutes : 30,
            status: (typeof v.status === 'string' ? v.status : 'scheduled') as AppointmentStatus,
            meetingUrl: typeof v.meetingUrl === 'string' ? v.meetingUrl : null,
            googleEventId: typeof v.googleEventId === 'string' ? v.googleEventId : null,
          });
        });
        setAppts(rows);
      },
      (err) => console.warn('calendar appointments snapshot error:', err),
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, weekKey]);

  return appts;
}

/** Agent's Google Calendar busy-blocks for the visible week (context only). */
function useGoogleBusy(user: User | null, weekStart: Date): { busy: BusyBlock[]; connected: boolean | null } {
  const [busy, setBusy] = useState<BusyBlock[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const weekKey = weekStart.getTime();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const tz = browserTz();
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        const results = await Promise.all(
          days.map(async (day) => {
            try {
              const res = await fetch(
                `/api/integrations/google-calendar/events?date=${ymd(day)}&tz=${encodeURIComponent(tz)}`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
              if (!res.ok) return { connected: false, events: [] };
              return (await res.json()) as { connected?: boolean; events?: Array<Record<string, unknown>> };
            } catch {
              return { connected: false, events: [] };
            }
          }),
        );
        if (cancelled) return;
        let anyConnected = false;
        const blocks: BusyBlock[] = [];
        for (const r of results) {
          if (r?.connected) anyConnected = true;
          for (const e of r?.events || []) {
            const startIso = typeof e.startIso === 'string' ? e.startIso : '';
            const endIso = typeof e.endIso === 'string' ? e.endIso : '';
            if (!startIso || !endIso) continue;
            blocks.push({
              id: typeof e.id === 'string' ? e.id : `${startIso}`,
              title: typeof e.title === 'string' && e.title ? e.title : 'Busy',
              start: new Date(startIso),
              end: new Date(endIso),
              allDay: e.allDay === true,
            });
          }
        }
        setConnected(anyConnected);
        setBusy(blocks);
      } catch (err) {
        if (!cancelled) {
          console.warn('google busy fetch failed:', err);
          setConnected(false);
          setBusy([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, weekKey]);

  return { busy, connected };
}

// ══════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════
export default function LeadsCalendar({ onGoToQueue }: { onGoToQueue?: () => void }) {
  const router = useRouter();
  const { user, agentProfile } = useDashboard();

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const appts = useWeekAppointments(user, weekStart);
  const { busy, connected } = useGoogleBusy(user, weekStart);

  const [selected, setSelected] = useState<CalAppt | null>(null);
  const [reminderFor, setReminderFor] = useState<CalAppt | null>(null);
  const [reminderExtra, setReminderExtra] = useState<{
    attachmentsSent?: { businessCardAt?: string; licensesByState?: Record<string, string> };
    leadCode?: string;
    email?: string;
  }>({});
  const [isMobile, setIsMobile] = useState(false);
  // Optimistic reschedule: apptId → new start (epoch ms) while the PATCH
  // is in flight / until the Firestore snapshot catches up. Lets a dragged
  // block jump to its new slot instantly, and roll back on failure.
  const [optimistic, setOptimistic] = useState<Record<string, number>>({});
  const [dragError, setDragError] = useState<string | null>(null);
  // Click-empty-slot-to-book: the chosen slot, the lead picker, and the
  // chosen lead. With newApptAt + bookingLead set we render AppointmentPicker.
  const [newApptAt, setNewApptAt] = useState<Date | null>(null);
  const [bookingLead, setBookingLead] = useState<{ id: string; name: string; phone: string; email?: string } | null>(null);
  const [pickerLeads, setPickerLeads] = useState<Array<{ id: string; name: string; phone: string; email?: string }>>([]);
  const [leadsLoaded, setLeadsLoaded] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Drop Google blocks that are mirrors of an AFL sit (same googleEventId).
  const mirroredIds = useMemo(
    () => new Set(appts.map((a) => a.googleEventId).filter((x): x is string => !!x)),
    [appts],
  );
  const visibleBusy = useMemo(() => busy.filter((b) => !mirroredIds.has(b.id)), [busy, mirroredIds]);

  // Clear an optimistic reschedule once the live snapshot reflects it.
  useEffect(() => {
    setOptimistic((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const a of appts) {
        if (next[a.id] != null && Math.abs(a.scheduledAt.getTime() - next[a.id]) < 60_000) {
          delete next[a.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [appts]);

  // Appts with any in-flight optimistic reschedule applied, for rendering.
  const displayAppts = useMemo(
    () =>
      appts.map((a) =>
        optimistic[a.id] != null ? { ...a, scheduledAt: new Date(optimistic[a.id]) } : a,
      ),
    [appts, optimistic],
  );

  // Week tally → the "production view" header.
  const tally = useMemo(() => {
    let booked = 0;
    let sat = 0;
    let sold = 0;
    for (const a of appts) {
      if (a.status !== 'cancelled') booked++;
      if (SIT_HAPPENED.includes(a.status)) sat++;
      if (a.status === 'completed') sold++;
    }
    return { booked, sat, sold };
  }, [appts]);

  const apptDayKeys = useMemo(() => new Set(appts.map((a) => ymd(a.scheduledAt))), [appts]);

  const goToday = useCallback(() => setAnchor(new Date()), []);
  const goPrevWeek = useCallback(() => setAnchor((a) => addDays(startOfWeek(a), -7)), []);
  const goNextWeek = useCallback(() => setAnchor((a) => addDays(startOfWeek(a), 7)), []);

  // Drag-to-reschedule → PATCH /api/appointments/[id] (re-syncs the Google
  // event + notifies the lead, server-side). Optimistic move + rollback.
  const handleReschedule = useCallback(
    async (appt: CalAppt, newStart: Date) => {
      if (!user) return;
      if (Math.abs(newStart.getTime() - appt.scheduledAt.getTime()) < 60_000) return; // no real move
      setOptimistic((prev) => ({ ...prev, [appt.id]: newStart.getTime() }));
      setDragError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/appointments/${appt.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ scheduledAt: newStart.toISOString() }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.warn('reschedule failed:', err);
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[appt.id];
          return next;
        });
        setDragError('Couldn’t move that appointment — putting it back. Try again.');
      }
    },
    [user],
  );

  // Click-empty-slot-to-book: open the picker for the clicked time, and
  // lazily load the agent's leads once for the in-picker search.
  const openNewAppt = useCallback(
    async (at: Date) => {
      setBookingLead(null);
      setLeadSearch('');
      setNewApptAt(at);
      if (leadsLoaded || !user) return;
      try {
        const snap = await getDocs(collection(db, 'agents', user.uid, 'leads'));
        const rows = snap.docs
          .map((d) => {
            const v = d.data() as { name?: string; phone?: string; email?: string };
            return {
              id: d.id,
              name: v.name || 'Lead',
              phone: typeof v.phone === 'string' ? v.phone : '',
              email: typeof v.email === 'string' ? v.email : undefined,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        setPickerLeads(rows);
        setLeadsLoaded(true);
      } catch (err) {
        console.warn('lead fetch for booking failed:', err);
        setLeadsLoaded(true);
      }
    },
    [leadsLoaded, user],
  );
  const closeNewAppt = useCallback(() => {
    setNewApptAt(null);
    setBookingLead(null);
    setLeadSearch('');
  }, []);
  const filteredPickerLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return pickerLeads;
    const digits = q.replace(/\D/g, '');
    return pickerLeads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (digits.length >= 2 && l.phone.replace(/\D/g, '').includes(digits)),
    );
  }, [pickerLeads, leadSearch]);

  const openReminder = useCallback(
    async (appt: CalAppt) => {
      setSelected(null);
      setReminderFor(appt);
      setReminderExtra({});
      if (!user) return;
      // Best-effort lead read for attachment dedup + login code + email,
      // mirroring UpcomingAppointmentsCard. Drawer falls back gracefully.
      try {
        const snap = await getDoc(doc(db, 'agents', user.uid, 'leads', appt.leadId));
        if (snap.exists()) {
          const d = snap.data() as {
            attachmentsSent?: { businessCardAt?: string; licensesByState?: Record<string, string> };
            email?: string;
            leadCode?: string;
          };
          setReminderExtra({
            attachmentsSent: d.attachmentsSent || {},
            leadCode: typeof d.leadCode === 'string' ? d.leadCode : undefined,
            email: typeof d.email === 'string' ? d.email : undefined,
          });
        }
      } catch (err) {
        console.warn('lead read for reminder failed:', err);
      }
    },
    [user],
  );

  if (!user) return null;

  return (
    <div className="pb-24">
      {/* ── Header: nav + range + week tally ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-1.5">
          <button
            onClick={goPrevWeek}
            aria-label="Previous week"
            className="w-8 h-8 grid place-items-center bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={goToday}
            className="px-3 h-8 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors"
          >
            Today
          </button>
          <button
            onClick={goNextWeek}
            aria-label="Next week"
            className="w-8 h-8 grid place-items-center bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <h2 className="ml-2 text-base font-bold text-[#000000]">{rangeLabel(weekStart)}</h2>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="px-2 py-1 rounded bg-[#daf3f0] text-[#005851]">{tally.booked} booked</span>
          <span className="text-[#9CA3AF]">→</span>
          <span className="px-2 py-1 rounded bg-[#E0F0FF] text-[#0079CC]">{tally.sat} sat</span>
          <span className="text-[#9CA3AF]">→</span>
          <span className="px-2 py-1 rounded bg-[#DCFCE7] text-[#15803D]">{tally.sold} sold</span>
        </div>
      </div>

      {/* Google connect hint (only when we know it's not connected) */}
      {connected === false && (
        <button
          onClick={() => router.push('/dashboard/settings')}
          className="w-full mb-3 text-left text-xs text-[#005851] bg-[#daf3f0]/40 border border-[#45bcaa]/40 rounded-lg px-3 py-2 hover:bg-[#daf3f0]/70 transition-colors"
        >
          Connect Google Calendar in Settings to see your whole day behind your booked sits.
        </button>
      )}

      {appts.length === 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] px-4 py-3">
          <div className="text-sm text-[#444]">
            <span className="font-semibold text-[#000000]">No sits booked this week.</span>{' '}
            Fill it straight from your call queue.
          </div>
          {onGoToQueue && (
            <button
              onClick={onGoToQueue}
              className="shrink-0 px-3 py-2 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
            >
              Go to call queue →
            </button>
          )}
        </div>
      )}

      {dragError && (
        <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {dragError}
        </div>
      )}

      {isMobile ? (
        <AgendaWeek days={days} appts={displayAppts} onSelect={setSelected} />
      ) : (
        <div className="flex gap-4 items-start">
          <div className="shrink-0 hidden lg:block">
            <MiniMonth anchor={anchor} onPick={setAnchor} apptDayKeys={apptDayKeys} weekStart={weekStart} />
            <Legend />
          </div>
          <WeekGrid days={days} appts={displayAppts} busy={visibleBusy} onSelect={setSelected} onReschedule={handleReschedule} onNewAppt={openNewAppt} />
        </div>
      )}

      {/* ── Appointment quick-actions popover ── */}
      {selected && (
        <ApptPopover
          appt={selected}
          onClose={() => setSelected(null)}
          onOpenLead={() => router.push(`/dashboard/leads/${selected.leadId}`)}
          onRemind={() => openReminder(selected)}
        />
      )}

      {/* ── Reminder reuses the confirmation drawer in reminder mode ── */}
      {reminderFor && (
        <SendConfirmationDrawer
          user={user}
          appointmentId={reminderFor.id}
          leadId={reminderFor.leadId}
          leadName={reminderFor.leadName}
          leadPhone={reminderFor.leadPhone}
          leadEmail={reminderExtra.email ?? reminderFor.leadEmail ?? undefined}
          leadCode={reminderExtra.leadCode}
          leadState={reminderFor.leadState}
          scheduledAt={reminderFor.scheduledAt}
          scheduledAtTimeZone={reminderFor.scheduledAtTimeZone}
          meetingUrl={reminderFor.meetingUrl}
          agentName={agentProfile.name || ''}
          agentBusinessCardBase64={agentProfile.businessCardBase64}
          licenses={agentProfile.licenses || {}}
          attachmentsSent={reminderExtra.attachmentsSent}
          kind="reminder"
          onSent={() => {
            setReminderFor(null);
            setReminderExtra({});
          }}
          onCancel={() => {
            setReminderFor(null);
            setReminderExtra({});
          }}
        />
      )}

      {/* ── New appointment, step 1: pick a lead for the clicked slot ── */}
      {newApptAt && !bookingLead && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={closeNewAppt}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border-2 border-[#1A1A1A] sm:border-r-[5px] sm:border-b-[5px] p-5 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <div className="text-lg font-bold text-[#000000]">New appointment</div>
              <div className="text-sm text-[#005851]">
                {newApptAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(newApptAt)}
              </div>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Search your leads by name or phone…"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              className="w-full px-3 py-2 mb-2 bg-white rounded-lg border border-[#d0d0d0] text-sm text-[#000000] placeholder-[#707070] focus:outline-none focus:border-[#45bcaa]"
            />
            <div className="flex-1 overflow-y-auto">
              {!leadsLoaded ? (
                <div className="text-sm text-[#9CA3AF] px-1 py-3">Loading your leads…</div>
              ) : filteredPickerLeads.length === 0 ? (
                <div className="text-sm text-[#9CA3AF] px-1 py-3">No matching leads.</div>
              ) : (
                <ul className="space-y-1">
                  {filteredPickerLeads.slice(0, 50).map((l) => (
                    <li key={l.id}>
                      <button
                        onClick={() => setBookingLead(l)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-transparent hover:bg-[#daf3f0]/40 hover:border-[#45bcaa]/40 transition-colors"
                      >
                        <div className="text-sm font-semibold text-[#000000] truncate">{l.name}</div>
                        {l.phone && <div className="text-xs text-[#707070]">{l.phone}</div>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button onClick={closeNewAppt} className="mt-3 w-full text-center text-xs text-[#9CA3AF] hover:text-[#707070]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── New appointment, step 2: full booking form, prefilled to the slot ── */}
      {newApptAt && bookingLead && (
        <AppointmentPicker
          user={user}
          leadId={bookingLead.id}
          leadName={bookingLead.name}
          leadEmail={bookingLead.email}
          initialScheduledAt={newApptAt}
          agentAppointmentMode={agentProfile.appointmentMode}
          agentDefaultMeetingLink={agentProfile.defaultMeetingLink}
          agentAutoCreateGoogleMeet={agentProfile.autoCreateGoogleMeet}
          googleCalendarConnected={connected === true}
          onBooked={closeNewAppt}
          onCancel={closeNewAppt}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Week grid (desktop)
// ══════════════════════════════════════════════════════════════════════
function WeekGrid({
  days,
  appts,
  busy,
  onSelect,
  onReschedule,
  onNewAppt,
}: {
  days: Date[];
  appts: CalAppt[];
  busy: BusyBlock[];
  onSelect: (a: CalAppt) => void;
  onReschedule: (appt: CalAppt, newStart: Date) => void;
  onNewAppt: (at: Date) => void;
}) {
  const hours = useMemo(
    () => Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i),
    [],
  );
  const today = new Date();
  // Drag-to-reschedule state: the dragged block lives in a ref (set on
  // dragstart); a day column computes the drop time and calls onReschedule.
  const draggingRef = useRef<CalAppt | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  return (
    <div className="flex-1 min-w-0 overflow-x-auto bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px]">
      <div className="min-w-[680px]">
        {/* Day header row */}
        <div className="grid border-b border-[#e5e5e5]" style={{ gridTemplateColumns: `52px repeat(7, 1fr)` }}>
          <div />
          {days.map((d) => {
            const isToday = isSameDay(d, today);
            return (
              <div key={d.toISOString()} className="py-2 text-center border-l border-[#f0f0f0]">
                <div className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
                  {WEEKDAY_LABELS[d.getDay()]}
                </div>
                <div
                  className={`mt-0.5 mx-auto w-7 h-7 grid place-items-center rounded-full text-sm font-bold ${
                    isToday ? 'bg-[#44bbaa] text-white' : 'text-[#000000]'
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid body */}
        <div className="grid" style={{ gridTemplateColumns: `52px repeat(7, 1fr)` }}>
          {/* Hour gutter */}
          <div className="relative" style={{ height: GRID_HEIGHT }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] text-[#9CA3AF]"
                style={{ top: (h - DAY_START_HOUR) * HOUR_PX }}
              >
                {h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d, idx) => (
            <DayColumn
              key={d.toISOString()}
              day={d}
              hours={hours}
              appts={appts.filter((a) => isSameDay(a.scheduledAt, d))}
              busy={busy.filter((b) => isSameDay(b.start, d))}
              onSelect={onSelect}
              draggingId={draggingId}
              isDragOver={dragOverIdx === idx}
              onBlockDragStart={(a) => {
                draggingRef.current = a;
                setDraggingId(a.id);
              }}
              onBlockDragEnd={() => {
                draggingRef.current = null;
                setDraggingId(null);
                setDragOverIdx(null);
              }}
              onDragOverDay={() => setDragOverIdx((cur) => (cur === idx ? cur : idx))}
              onDropDay={(columnTop, clientY) => {
                const appt = draggingRef.current;
                draggingRef.current = null;
                setDraggingId(null);
                setDragOverIdx(null);
                if (!appt) return;
                onReschedule(appt, dateAtMinutes(d, dropMinutes(clientY, columnTop, appt.durationMinutes)));
              }}
              onNewAppt={(columnTop, clientY) =>
                onNewAppt(dateAtMinutes(d, dropMinutes(clientY, columnTop, 30)))
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function blockPosition(start: Date, durationMin: number): { top: number; height: number } {
  const rawTop = ((minutesIntoDay(start) - DAY_START_HOUR * 60) / 60) * HOUR_PX;
  const top = Math.max(0, Math.min(rawTop, GRID_HEIGHT - 16));
  const rawHeight = (durationMin / 60) * HOUR_PX;
  const height = Math.max(18, Math.min(rawHeight, GRID_HEIGHT - top));
  return { top, height };
}

function snapMinutes(min: number): number {
  return Math.round(min / 15) * 15;
}

/** Build a Date on `day` at the given minutes-into-day (local wall clock). */
function dateAtMinutes(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/** New start-minutes for a drop at clientY within a column whose top is columnTop. */
function dropMinutes(clientY: number, columnTop: number, durationMin: number): number {
  const y = clientY - columnTop;
  const minutes = snapMinutes(DAY_START_HOUR * 60 + (y / HOUR_PX) * 60);
  const maxStart = DAY_END_HOUR * 60 - Math.max(15, Math.round(durationMin));
  return Math.max(DAY_START_HOUR * 60, Math.min(minutes, maxStart));
}

function DayColumn({
  day,
  hours,
  appts,
  busy,
  onSelect,
  draggingId,
  isDragOver,
  onBlockDragStart,
  onBlockDragEnd,
  onDragOverDay,
  onDropDay,
  onNewAppt,
}: {
  day: Date;
  hours: number[];
  appts: CalAppt[];
  busy: BusyBlock[];
  onSelect: (a: CalAppt) => void;
  draggingId: string | null;
  isDragOver: boolean;
  onBlockDragStart: (a: CalAppt) => void;
  onBlockDragEnd: () => void;
  onDragOverDay: () => void;
  onDropDay: (columnTop: number, clientY: number) => void;
  onNewAppt: (columnTop: number, clientY: number) => void;
}) {
  const now = new Date();
  const isToday = isSameDay(day, now);
  const nowTop = ((minutesIntoDay(now) - DAY_START_HOUR * 60) / 60) * HOUR_PX;
  const nowInRange = nowTop >= 0 && nowTop <= GRID_HEIGHT;
  const localTz = browserTz();
  // Hover card anchor (viewport coords of the hovered block's top-center).
  // Replaces the per-block native `title`, which became unreliable once the
  // column gained its own "click to book" title (#160) — a parent + child
  // both carrying `title`, plus drag, is exactly when native tooltips flake.
  const [hover, setHover] = useState<{ appt: CalAppt; x: number; y: number } | null>(null);

  return (
    <div
      className={`relative border-l border-[#f0f0f0] cursor-pointer ${isDragOver ? 'bg-[#daf3f0]/40' : 'hover:bg-[#fbfdfc]'}`}
      style={{ height: GRID_HEIGHT }}
      title="Click an open spot to book"
      onClick={(e) => onNewAppt(e.currentTarget.getBoundingClientRect().top, e.clientY)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOverDay();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropDay(e.currentTarget.getBoundingClientRect().top, e.clientY);
      }}
    >
      {/* Hour lines */}
      {hours.map((h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-[#f4f4f4] pointer-events-none"
          style={{ top: (h - DAY_START_HOUR) * HOUR_PX }}
        />
      ))}

      {/* Google busy backgrounds (non-interactive) */}
      {busy.map((b) => {
        if (b.allDay) {
          return (
            <div
              key={b.id}
              className="absolute left-0.5 right-0.5 top-0 text-[9px] text-[#9CA3AF] bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_4px,#eceef1_4px,#eceef1_8px)] rounded px-1 py-0.5 truncate pointer-events-none"
              title={b.title}
            >
              {b.title}
            </div>
          );
        }
        const durationMin = Math.max(15, (b.end.getTime() - b.start.getTime()) / 60000);
        const { top, height } = blockPosition(b.start, durationMin);
        return (
          <div
            key={b.id}
            className="absolute left-0.5 right-0.5 rounded bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_5px,#e9ebee_5px,#e9ebee_10px)] border border-[#e5e7eb] pointer-events-none"
            style={{ top, height }}
            title={`${b.title} · ${fmtTime(b.start)}–${fmtTime(b.end)}`}
          />
        );
      })}

      {/* AFL sit blocks (interactive) */}
      {appts.map((a) => {
        const { top, height } = blockPosition(a.scheduledAt, a.durationMinutes);
        const meta = STATUS_META[a.status];
        const showTheir =
          a.scheduledAtTimeZone && localTz && a.scheduledAtTimeZone !== localTz;
        return (
          <button
            key={a.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              try { e.dataTransfer.setData('text/plain', a.id); } catch { /* Firefox-only guard */ }
              setHover(null);
              onBlockDragStart(a);
            }}
            onDragEnd={onBlockDragEnd}
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover({ appt: a, x: r.left + r.width / 2, y: r.top });
            }}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => { e.stopPropagation(); onSelect(a); }}
            className={`absolute left-0.5 right-0.5 rounded-md border-l-[3px] border px-1.5 py-1 text-left overflow-hidden hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${meta.block} ${draggingId === a.id ? 'opacity-40' : ''}`}
            style={{ top, height, zIndex: 5 }}
            // Empty (but present) title suppresses the parent column's native
            // "Click an open spot to book" tooltip from bleeding through onto a
            // block; the block's details come from the portal hover card below.
            title=""
          >
            <div className="text-[11px] font-bold leading-tight truncate">{a.leadName}</div>
            <div className="text-[10px] leading-tight truncate opacity-80">
              {fmtTime(a.scheduledAt)}
              {showTheir && a.scheduledAtTimeZone
                ? ` · ${fmtTime(a.scheduledAt, a.scheduledAtTimeZone)} ${tzAbbrev(a.scheduledAt, a.scheduledAtTimeZone)}`
                : ''}
            </div>
          </button>
        );
      })}

      {/* Now line */}
      {isToday && nowInRange && (
        <div className="absolute left-0 right-0 pointer-events-none" style={{ top: nowTop, zIndex: 10 }}>
          <div className="h-px bg-[#FF3B30]" />
          <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-[#FF3B30]" />
        </div>
      )}

      {/* Hover detail card — portalled to <body> so it escapes the week-grid's
          overflow clipping and any ancestor stacking context. */}
      {hover && typeof document !== 'undefined' &&
        createPortal(<ApptHoverCard appt={hover.appt} x={hover.x} y={hover.y} />, document.body)}
    </div>
  );
}

// Floating detail card for a hovered appointment block (fixed-positioned at
// the block's top-center). This is the reliable replacement for the native
// `title` tooltip — it always renders, looks consistent, and survives drags.
function ApptHoverCard({ appt, x, y }: { appt: CalAppt; x: number; y: number }) {
  const meta = STATUS_META[appt.status];
  const localTz = browserTz();
  const showTheir = appt.scheduledAtTimeZone && localTz && appt.scheduledAtTimeZone !== localTz;
  const end = new Date(appt.scheduledAt.getTime() + appt.durationMinutes * 60000);
  return (
    <div
      className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full"
      style={{ left: x, top: y - 8 }}
    >
      <div className="bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] shadow-md px-2.5 py-1.5 max-w-[240px]">
        <div className="text-xs font-bold text-[#000000] truncate">{appt.leadName}</div>
        <div className="text-[11px] text-[#707070] whitespace-nowrap">
          {fmtTime(appt.scheduledAt)}–{fmtTime(end)} · {meta.label}
        </div>
        {showTheir && appt.scheduledAtTimeZone && (
          <div className="text-[10px] text-[#005851] whitespace-nowrap">
            Their time: {fmtTime(appt.scheduledAt, appt.scheduledAtTimeZone)} {tzAbbrev(appt.scheduledAt, appt.scheduledAtTimeZone)}
          </div>
        )}
        <div className="text-[10px] text-[#9CA3AF] whitespace-nowrap mt-0.5">Drag to reschedule · click for options</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Agenda (mobile)
// ══════════════════════════════════════════════════════════════════════
function AgendaWeek({
  days,
  appts,
  onSelect,
}: {
  days: Date[];
  appts: CalAppt[];
  onSelect: (a: CalAppt) => void;
}) {
  const today = new Date();
  const localTz = browserTz();
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const dayAppts = appts
          .filter((a) => isSameDay(a.scheduledAt, d))
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
        const isToday = isSameDay(d, today);
        return (
          <div key={d.toISOString()}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-sm font-bold ${isToday ? 'text-[#005851]' : 'text-[#000000]'}`}>
                {d.toLocaleDateString(undefined, { weekday: 'long' })}
              </span>
              <span className="text-xs text-[#9CA3AF]">
                {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              {isToday && <span className="text-[10px] font-bold uppercase tracking-wider text-[#44bbaa]">Today</span>}
            </div>
            {dayAppts.length === 0 ? (
              <div className="text-xs text-[#C0C0C0] pl-1 pb-1">—</div>
            ) : (
              <ul className="space-y-1.5">
                {dayAppts.map((a) => {
                  const meta = STATUS_META[a.status];
                  const showTheir = a.scheduledAtTimeZone && localTz && a.scheduledAtTimeZone !== localTz;
                  return (
                    <li key={a.id}>
                      <button
                        onClick={() => onSelect(a)}
                        className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border border-[#e5e5e5] bg-white text-left hover:border-[#45bcaa]/50 transition-colors"
                      >
                        <span className={`w-1.5 self-stretch rounded-full ${meta.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[#000000] truncate">{a.leadName}</div>
                          <div className="text-xs text-[#707070] truncate">
                            {fmtTime(a.scheduledAt)}
                            {showTheir && a.scheduledAtTimeZone
                              ? ` · their ${fmtTime(a.scheduledAt, a.scheduledAtTimeZone)}`
                              : ''}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.block}`}>
                          {meta.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Mini-month nav
// ══════════════════════════════════════════════════════════════════════
function MiniMonth({
  anchor,
  onPick,
  apptDayKeys,
  weekStart,
}: {
  anchor: Date;
  onPick: (d: Date) => void;
  apptDayKeys: Set<string>;
  weekStart: Date;
}) {
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const today = new Date();
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="w-[208px] bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => onPick(addDays(startOfMonth(anchor), -1))}
          aria-label="Previous month"
          className="w-6 h-6 grid place-items-center rounded hover:bg-[#f0f0f0] text-[#707070]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-sm font-bold text-[#000000]">
          {anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={() => onPick(addDays(startOfMonth(anchor), 32))}
          aria-label="Next month"
          className="w-6 h-6 grid place-items-center rounded hover:bg-[#f0f0f0] text-[#707070]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[9px] font-semibold text-[#C0C0C0] pb-1">{d}</div>
        ))}
        {cells.map((c) => {
          const inMonth = c.getMonth() === anchor.getMonth();
          const isToday = isSameDay(c, today);
          const inWeek = c >= startOfDay(weekStart) && c <= startOfDay(weekEnd);
          const hasAppt = apptDayKeys.has(ymd(c));
          return (
            <button
              key={c.toISOString()}
              onClick={() => onPick(c)}
              className={`relative h-6 text-[11px] rounded grid place-items-center transition-colors ${
                inWeek ? 'bg-[#daf3f0]' : 'hover:bg-[#f4f4f4]'
              } ${isToday ? 'font-bold text-[#005851]' : inMonth ? 'text-[#1A1A1A]' : 'text-[#D0D0D0]'}`}
            >
              {c.getDate()}
              {hasAppt && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[#44bbaa]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  const items: Array<{ key: AppointmentStatus; label: string }> = [
    { key: 'scheduled', label: 'Booked' },
    { key: 'completed', label: 'Sold' },
    { key: 'sit_think_about_it', label: 'Thinking' },
    { key: 'sit_no_sale', label: 'No sale' },
    { key: 'no_show', label: 'No-show' },
  ];
  return (
    <div className="w-[208px] bg-white rounded-xl border border-[#e5e5e5] p-3 text-[11px] space-y-1.5">
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-sm ${STATUS_META[it.key].dot}`} />
          <span className="text-[#707070]">{it.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1 border-t border-[#f0f0f0]">
        <span className="w-2.5 h-2.5 rounded-sm bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_2px,#e9ebee_2px,#e9ebee_4px)]" />
        <span className="text-[#707070]">Google (busy)</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Quick-actions popover
// ══════════════════════════════════════════════════════════════════════
function ApptPopover({
  appt,
  onClose,
  onOpenLead,
  onRemind,
}: {
  appt: CalAppt;
  onClose: () => void;
  onOpenLead: () => void;
  onRemind: () => void;
}) {
  const meta = STATUS_META[appt.status];
  const localTz = browserTz();
  const showTheir = appt.scheduledAtTimeZone && localTz && appt.scheduledAtTimeZone !== localTz;
  const end = new Date(appt.scheduledAt.getTime() + appt.durationMinutes * 60000);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl border-2 border-[#1A1A1A] sm:border-r-[5px] sm:border-b-[5px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-lg font-bold text-[#000000] truncate">{appt.leadName}</div>
            <div className="text-sm text-[#707070]">
              {appt.scheduledAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}
              {fmtTime(appt.scheduledAt)}–{fmtTime(end)}
            </div>
            {showTheir && appt.scheduledAtTimeZone && (
              <div className="text-xs text-[#005851] mt-0.5">
                Their time: {fmtTime(appt.scheduledAt, appt.scheduledAtTimeZone)} {tzAbbrev(appt.scheduledAt, appt.scheduledAtTimeZone)}
              </div>
            )}
          </div>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${meta.block}`}>{meta.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {appt.leadPhone && (
            <a
              href={`tel:${appt.leadPhone}`}
              className="col-span-1 grid place-items-center py-2.5 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
            >
              Call
            </a>
          )}
          {appt.meetingUrl && (
            <a
              href={appt.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-1 grid place-items-center py-2.5 text-sm font-semibold text-[#0D4D4D] bg-white hover:bg-[#f8f8f8] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
            >
              Join
            </a>
          )}
          <button
            onClick={onRemind}
            className="col-span-1 grid place-items-center py-2.5 text-sm font-semibold text-[#0D4D4D] bg-white hover:bg-[#f8f8f8] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
          >
            Send reminder
          </button>
          <button
            onClick={onOpenLead}
            className="col-span-1 grid place-items-center py-2.5 text-sm font-semibold text-[#0D4D4D] bg-white hover:bg-[#f8f8f8] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
          >
            Open lead
          </button>
        </div>

        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-[#9CA3AF] hover:text-[#707070]">
          Close
        </button>
      </div>
    </div>
  );
}
