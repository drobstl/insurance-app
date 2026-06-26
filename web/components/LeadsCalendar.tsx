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
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import { useDashboard } from '../app/dashboard/DashboardContext';
import AppointmentPicker from './AppointmentPicker';
import SendConfirmationDrawer from './SendConfirmationDrawer';
import type { AppointmentStatus } from '../lib/appointments';
import { getFifResetChip } from '../lib/appointment-outcome-chip';
import { normalizePhone } from '../lib/phone-format';

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

function fmtMonthDay(d: Date): string {
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const SIT_HAPPENED: AppointmentStatus[] = ['completed', 'sit_no_sale', 'sit_think_about_it'];

// ── First-sit vs follow-up (derived, never stored) ────────────────────
interface PriorSit {
  at: Date;
  status: AppointmentStatus;
}
type ApptKind =
  | { kind: 'first' }
  | { kind: 'follow_up'; priorStatus: AppointmentStatus; priorAt: Date };

/**
 * Classify an appointment as a first sit vs a follow-up. A follow-up = the
 * lead has a prior SIT_HAPPENED appointment dated **strictly earlier** than
 * this one. `priorSits` is in descending date order (the query is desc), so
 * the first qualifying entry is the most-recent prior sit — what we surface
 * as "last sit: …". The strict `<` handles a same-day earlier sit and
 * auto-excludes the appointment itself (its own scheduledAt is never `<`
 * itself), so an in-week sit that already happened doesn't self-mark.
 */
function classifyAppt(appt: CalAppt, priorSitsByLead: Map<string, PriorSit[]>): ApptKind {
  const priors = priorSitsByLead.get(appt.leadId);
  if (priors) {
    const apptMs = appt.scheduledAt.getTime();
    for (const p of priors) {
      if (p.at.getTime() < apptMs) {
        return { kind: 'follow_up', priorStatus: p.status, priorAt: p.at };
      }
    }
  }
  return { kind: 'first' };
}

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

/** Agent's Google Calendar busy-blocks for the visible week (context only).
 *  `refreshKey` re-runs the fetch after a connect/disconnect from the header. */
function useGoogleBusy(user: User | null, weekStart: Date, refreshKey: number): { busy: BusyBlock[]; connected: boolean | null } {
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
  }, [user, weekKey, refreshKey]);

  return { busy, connected };
}

/**
 * Authoritative Google Calendar connection state for the header control:
 * the connected flag + the connected Google account email. Separate from
 * `useGoogleBusy` (which only infers connected from the events fetch) so
 * the header can show the email and react to connect/disconnect via
 * `refreshKey`. Mirrors the Settings → Account status call.
 */
interface GCalStatus {
  connected: boolean;
  googleEmail?: string;
}
function useGoogleCalendarStatus(
  user: User | null,
  refreshKey: number,
): { status: GCalStatus | null; loading: boolean } {
  const [status, setStatus] = useState<GCalStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStatus(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/integrations/google-calendar/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          success?: boolean;
          connected?: boolean;
          data?: { googleEmail?: string };
        };
        if (cancelled) return;
        setStatus(
          res.ok && data.success && data.connected
            ? { connected: true, googleEmail: data.data?.googleEmail }
            : { connected: false },
        );
      } catch (err) {
        if (!cancelled) {
          console.warn('google calendar status fetch failed:', err);
          setStatus({ connected: false });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshKey]);

  return { status, loading };
}

/**
 * Prior SIT_HAPPENED appointments per lead — the raw material for tagging
 * each block as a first sit vs a follow-up. Mirrors the leads page's
 * past-appointment subscription (`web/app/dashboard/leads/page.tsx:442-481`):
 * same single-field `scheduledAt` range so it reuses the default index, with
 * the status filter done in memory. Two deliberate differences:
 *   - Filtered to SIT_HAPPENED (which **includes** `completed`/Sold) rather
 *     than the leads page's outcome-chip set, which excludes the sale path.
 *   - Upper bound is **weekEnd, not now** — so a Tuesday follow-up still sees
 *     its Monday-same-week prior sit (the strict `<` in classifyAppt keeps an
 *     appointment from marking itself).
 * Bounded a year back to cap the read for high-volume agents; a prior sit
 * older than a year reads as a first sit (matches the leads-page bound).
 * `fifResetByLead` rides along from the same snapshot, exactly like the leads
 * page (orthogonal to the sit outcome — a reset can sit on a sold appt).
 */
function usePriorSits(
  user: User | null,
  weekStart: Date,
): { priorSitsByLead: Map<string, PriorSit[]>; fifResetByLead: Map<string, { smeName?: string }> } {
  const [state, setState] = useState<{
    priorSitsByLead: Map<string, PriorSit[]>;
    fifResetByLead: Map<string, { smeName?: string }>;
  }>(() => ({ priorSitsByLead: new Map(), fifResetByLead: new Map() }));
  const weekKey = weekStart.getTime();

  useEffect(() => {
    if (!user) {
      setState({ priorSitsByLead: new Map(), fifResetByLead: new Map() });
      return;
    }
    const weekEnd = addDays(weekStart, 7);
    const oneYearAgo = addDays(weekStart, -365);
    const q = query(
      collection(db, 'agents', user.uid, 'appointments'),
      where('scheduledAt', '>=', Timestamp.fromDate(oneYearAgo)),
      where('scheduledAt', '<', Timestamp.fromDate(weekEnd)),
      orderBy('scheduledAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const priorSitsByLead = new Map<string, PriorSit[]>();
        const fifResetByLead = new Map<string, { smeName?: string }>();
        snap.forEach((d) => {
          const v = d.data() as {
            leadId?: string;
            scheduledAt?: Timestamp;
            status?: string;
            fifResetBooked?: boolean;
            fifResetSmeName?: string | null;
          };
          if (!v.leadId || !v.scheduledAt) return;
          // FIF reset is orthogonal to the sit outcome (can ride on a sold
          // appt), so capture it before the SIT_HAPPENED filter. First hit
          // wins (query is desc) = the lead's most recent reset.
          if (v.fifResetBooked === true && !fifResetByLead.has(v.leadId)) {
            fifResetByLead.set(v.leadId, { smeName: v.fifResetSmeName ?? undefined });
          }
          const status = typeof v.status === 'string' ? (v.status as AppointmentStatus) : null;
          if (!status || !SIT_HAPPENED.includes(status)) return;
          // Built in descending order because the query is desc — classifyAppt
          // relies on that to pick the most-recent prior sit.
          const sit: PriorSit = { at: v.scheduledAt.toDate(), status };
          const arr = priorSitsByLead.get(v.leadId);
          if (arr) arr.push(sit);
          else priorSitsByLead.set(v.leadId, [sit]);
        });
        setState({ priorSitsByLead, fifResetByLead });
      },
      (err) => console.warn('calendar prior-sits snapshot error:', err),
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, weekKey]);

  return state;
}

// ══════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════
export default function LeadsCalendar({ onGoToQueue }: { onGoToQueue?: () => void }) {
  const router = useRouter();
  const { user, agentProfile, setAgentProfile } = useDashboard();

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Bumped after a connect/disconnect so the busy blocks + connection status
  // both re-fetch without a full reload.
  const [calRefreshKey, setCalRefreshKey] = useState(0);

  const appts = useWeekAppointments(user, weekStart);
  const { busy, connected } = useGoogleBusy(user, weekStart, calRefreshKey);
  const { status: gcalStatus, loading: gcalLoading } = useGoogleCalendarStatus(user, calRefreshKey);
  const { priorSitsByLead, fifResetByLead } = usePriorSits(user, weekStart);

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

  // First sit vs follow-up per block. Keyed off displayAppts so an optimistic
  // reschedule re-classifies against the dragged time (and rolls back with it).
  const kindById = useMemo(
    () => new Map<string, ApptKind>(displayAppts.map((a) => [a.id, classifyAppt(a, priorSitsByLead)])),
    [displayAppts, priorSitsByLead],
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

  // ── Google Calendar: connect / disconnect + view mode (Stream 5a/5b) ──
  // viewMode persists on the agent profile so it follows the agent across
  // devices; default 'focus' preserves the original muted busy-block look.
  const viewMode: 'focus' | 'normal' =
    agentProfile.calendarViewMode === 'normal' ? 'normal' : 'focus';
  const [gcalBusy, setGcalBusy] = useState<'connect' | 'disconnect' | null>(null);
  const [gcalMessage, setGcalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const setViewMode = useCallback(
    async (mode: 'focus' | 'normal') => {
      if (!user) return;
      if ((agentProfile.calendarViewMode === 'normal' ? 'normal' : 'focus') === mode) return;
      // The profile is loaded once (getDoc), so update context optimistically
      // AND write through to Firestore so the choice sticks across reloads.
      setAgentProfile((prev) => ({ ...prev, calendarViewMode: mode }));
      try {
        await setDoc(doc(db, 'agents', user.uid), { calendarViewMode: mode }, { merge: true });
      } catch (err) {
        console.warn('save calendar view mode failed:', err);
      }
    },
    [user, agentProfile.calendarViewMode, setAgentProfile],
  );

  const handleConnectGoogle = useCallback(async () => {
    if (!user) return;
    setGcalBusy('connect');
    setGcalMessage(null);
    try {
      const token = await user.getIdToken();
      // Come back to whatever calendar surface we're on (the /dashboard/calendar
      // route, or the Leads page's Calendar tab). On Leads the tab is internal
      // state, so ask the page to reopen it via ?view=calendar.
      let returnTo = '/dashboard/calendar';
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (window.location.pathname === '/dashboard/leads') params.set('view', 'calendar');
        const qs = params.toString();
        returnTo = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      }
      const res = await fetch('/api/integrations/google-calendar/auth', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo }),
      });
      const data = (await res.json()) as { success: boolean; authUrl?: string; error?: string };
      if (!res.ok || !data.success || !data.authUrl) {
        throw new Error(data.error || 'Failed to start Google Calendar connection.');
      }
      window.location.assign(data.authUrl);
    } catch (err) {
      setGcalMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Couldn’t connect Google Calendar.',
      });
      setGcalBusy(null);
    }
  }, [user]);

  const handleDisconnectGoogle = useCallback(async () => {
    if (!user) return;
    setGcalBusy('disconnect');
    setGcalMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/integrations/google-calendar/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to disconnect Google Calendar.');
      }
      setGcalMessage({ type: 'success', text: 'Google Calendar disconnected.' });
      setCalRefreshKey((k) => k + 1);
    } catch (err) {
      setGcalMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Couldn’t disconnect Google Calendar.',
      });
    } finally {
      setGcalBusy(null);
    }
  }, [user]);

  // Consume the OAuth round-trip result (?google_calendar=success|error the
  // callback appends to returnTo): surface a message, refresh status, then
  // strip the params so a reload can't re-fire the toast.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google_calendar');
    if (!result) return;
    if (result === 'success') {
      setGcalMessage({ type: 'success', text: 'Google Calendar connected.' });
      setCalRefreshKey((k) => k + 1);
    } else if (result === 'error') {
      const reason = params.get('reason');
      setGcalMessage({
        type: 'error',
        text: reason ? `Couldn’t connect Google Calendar: ${reason}` : 'Couldn’t connect Google Calendar.',
      });
    }
    params.delete('google_calendar');
    params.delete('reason');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, []);

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

      {/* ── Google Calendar: connect / disconnect + view toggle (5a / 5b) ── */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {gcalStatus === null && gcalLoading ? (
            <span className="text-xs text-[#9CA3AF]">Checking Google Calendar…</span>
          ) : gcalStatus?.connected ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#005851] bg-[#daf3f0]/60 border border-[#45bcaa]/40 rounded-full pl-2 pr-2.5 py-1 min-w-0">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="truncate max-w-[180px] sm:max-w-[240px]">{gcalStatus.googleEmail || 'Google Calendar connected'}</span>
              </span>
              <button
                onClick={handleDisconnectGoogle}
                disabled={gcalBusy === 'disconnect'}
                className="text-xs font-medium text-[#9CA3AF] hover:text-red-600 underline-offset-2 hover:underline disabled:opacity-50 transition-colors"
              >
                {gcalBusy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          ) : (
            <button
              onClick={handleConnectGoogle}
              disabled={gcalBusy === 'connect'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              {gcalBusy === 'connect' ? 'Redirecting…' : 'Connect Google Calendar'}
            </button>
          )}
        </div>

        {/* View toggle — only meaningful when events exist (connected) and on
            desktop (the mobile agenda doesn't render Google busy blocks). */}
        {gcalStatus?.connected && !isMobile && (
          <div className="inline-flex items-center rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] bg-white overflow-hidden text-xs font-semibold shrink-0">
            <button
              onClick={() => setViewMode('focus')}
              className={`px-2.5 py-1.5 transition-colors ${viewMode === 'focus' ? 'bg-[#44bbaa] text-white' : 'text-[#0D4D4D] hover:bg-[#f8f8f8]'}`}
              title="Dim your other Google events to gray so your booked sits stand out"
            >
              Focus
            </button>
            <button
              onClick={() => setViewMode('normal')}
              className={`px-2.5 py-1.5 border-l-2 border-[#1A1A1A] transition-colors ${viewMode === 'normal' ? 'bg-[#44bbaa] text-white' : 'text-[#0D4D4D] hover:bg-[#f8f8f8]'}`}
              title="Show your Google events with their titles"
            >
              Normal
            </button>
          </div>
        )}
      </div>

      {gcalMessage && (
        <div
          className={`mb-3 text-sm rounded-lg px-3 py-2 border ${
            gcalMessage.type === 'success'
              ? 'text-[#005851] bg-[#daf3f0]/60 border-[#45bcaa]/40'
              : 'text-red-700 bg-red-50 border-red-200'
          }`}
        >
          {gcalMessage.text}
        </div>
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
        <AgendaWeek days={days} appts={displayAppts} kindById={kindById} onSelect={setSelected} />
      ) : (
        <div className="flex gap-4 items-start">
          <div className="shrink-0 hidden lg:block">
            <MiniMonth anchor={anchor} onPick={setAnchor} apptDayKeys={apptDayKeys} weekStart={weekStart} />
            <Legend viewMode={viewMode} />
          </div>
          <WeekGrid days={days} appts={displayAppts} busy={visibleBusy} kindById={kindById} viewMode={viewMode} onSelect={setSelected} onReschedule={handleReschedule} onNewAppt={openNewAppt} />
        </div>
      )}

      {/* ── Appointment quick-actions popover ── */}
      {selected && (
        <ApptPopover
          appt={selected}
          kind={kindById.get(selected.id)}
          fifReset={fifResetByLead.get(selected.leadId)}
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
  kindById,
  viewMode,
  onSelect,
  onReschedule,
  onNewAppt,
}: {
  days: Date[];
  appts: CalAppt[];
  busy: BusyBlock[];
  kindById: Map<string, ApptKind>;
  viewMode: 'focus' | 'normal';
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
              kindById={kindById}
              viewMode={viewMode}
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
  kindById,
  viewMode,
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
  kindById: Map<string, ApptKind>;
  viewMode: 'focus' | 'normal';
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
  // Hover card content + anchor (viewport coords of the hovered block's
  // top-center). Replaces the per-block native `title` for BOTH AFL sits and
  // Google busy blocks: once the column gained its own "click to book" title
  // and the busy blocks went `pointer-events-none` (#160), native tooltips
  // stopped showing each block's own details. One card serves both kinds.
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle: string;
    tzLine?: string;
    kind?: ApptKind;
    hint?: string;
  } | null>(null);

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

      {/* Google events (context). Focus = muted gray busy blocks (no title);
          Normal = each event shown with its own title in a distinct indigo so
          it reads as "external", still clearly apart from the outcome-colored
          AFL sits. Either way they carry no onClick, so a click bubbles to the
          column to book that slot (#160); the hover card shows the details. */}
      {busy.map((b) => {
        const isNormal = viewMode === 'normal';
        if (b.allDay) {
          return (
            <div
              key={b.id}
              className={`absolute left-0.5 right-0.5 top-0 rounded px-1 py-0.5 truncate text-[9px] ${
                isNormal
                  ? 'bg-[#EEF2FF] border border-[#c7d2fe] text-[#4338CA] font-medium'
                  : 'text-[#9CA3AF] bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_4px,#eceef1_4px,#eceef1_8px)]'
              }`}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setHover({ x: r.left + r.width / 2, y: r.top, title: b.title, subtitle: 'All day · Google Calendar' });
              }}
              onMouseLeave={() => setHover(null)}
              title=""
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
            className={`absolute left-0.5 right-0.5 rounded overflow-hidden ${
              isNormal
                ? 'bg-[#EEF2FF] border border-[#c7d2fe] px-1 py-0.5'
                : 'bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_5px,#e9ebee_5px,#e9ebee_10px)] border border-[#e5e7eb]'
            }`}
            style={{ top, height }}
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover({
                x: r.left + r.width / 2,
                y: r.top,
                title: b.title,
                subtitle: `${fmtTime(b.start)}–${fmtTime(b.end)} · Google Calendar`,
              });
            }}
            onMouseLeave={() => setHover(null)}
            title=""
          >
            {isNormal && (
              <>
                <div className="text-[10px] font-semibold leading-tight truncate text-[#4338CA]">{b.title}</div>
                {height > 26 && (
                  <div className="text-[9px] leading-tight truncate text-[#6366F1]">
                    {fmtTime(b.start)}–{fmtTime(b.end)}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* AFL sit blocks (interactive) */}
      {appts.map((a) => {
        const { top, height } = blockPosition(a.scheduledAt, a.durationMinutes);
        const meta = STATUS_META[a.status];
        const showTheir =
          a.scheduledAtTimeZone && localTz && a.scheduledAtTimeZone !== localTz;
        const kind = kindById.get(a.id);
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
              const end = new Date(a.scheduledAt.getTime() + a.durationMinutes * 60000);
              setHover({
                x: r.left + r.width / 2,
                y: r.top,
                title: a.leadName,
                subtitle: `${fmtTime(a.scheduledAt)}–${fmtTime(end)} · ${meta.label}`,
                tzLine:
                  showTheir && a.scheduledAtTimeZone
                    ? `Their time: ${fmtTime(a.scheduledAt, a.scheduledAtTimeZone)} ${tzAbbrev(a.scheduledAt, a.scheduledAtTimeZone)}`
                    : undefined,
                kind,
                hint: 'Drag to reschedule · click for options',
              });
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
            <div className="text-[11px] font-bold leading-tight truncate pr-5">{a.leadName}</div>
            <div className="text-[10px] leading-tight truncate opacity-80">
              {fmtTime(a.scheduledAt)}
              {showTheir && a.scheduledAtTimeZone
                ? ` · ${fmtTime(a.scheduledAt, a.scheduledAtTimeZone)} ${tzAbbrev(a.scheduledAt, a.scheduledAtTimeZone)}`
                : ''}
            </div>
            {/* First-sit vs follow-up marker (top-right corner). Follow-up =
                ↻ tinted by the prior outcome (gold Thinking / blue No-sale /
                green Sold); first sit = a faint "1st". */}
            {kind &&
              (kind.kind === 'follow_up' ? (
                <span
                  className={`absolute top-0.5 right-0.5 inline-flex items-center justify-center h-3.5 px-1 rounded-[3px] text-[9px] font-bold leading-none border ${STATUS_META[kind.priorStatus].block}`}
                  aria-hidden
                >
                  ↻
                </span>
              ) : (
                <span
                  className="absolute top-0.5 right-0.5 inline-flex items-center justify-center h-3.5 px-1 rounded-[3px] text-[8px] font-bold leading-none text-[#9CA3AF] bg-white/70 border border-[#ececec]"
                  aria-hidden
                >
                  1st
                </span>
              ))}
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
        createPortal(<HoverCard {...hover} />, document.body)}
    </div>
  );
}

// Floating detail card for a hovered calendar block (fixed-positioned at the
// block's top-center, portalled to <body>). The reliable replacement for the
// native `title` tooltip — it always renders, looks consistent, survives
// drags, and serves both AFL sits and Google busy blocks.
function HoverCard({
  x,
  y,
  title,
  subtitle,
  tzLine,
  kind,
  hint,
}: {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  tzLine?: string;
  kind?: ApptKind;
  hint?: string;
}) {
  return (
    <div
      className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full"
      style={{ left: x, top: y - 8 }}
    >
      <div className="bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] shadow-md px-2.5 py-1.5 max-w-[240px]">
        <div className="text-xs font-bold text-[#000000] truncate">{title}</div>
        <div className="text-[11px] text-[#707070] whitespace-nowrap">{subtitle}</div>
        {tzLine && <div className="text-[10px] text-[#005851] whitespace-nowrap">{tzLine}</div>}
        {kind &&
          (kind.kind === 'follow_up' ? (
            <div className="text-[10px] text-[#444] whitespace-nowrap mt-0.5 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[kind.priorStatus].dot}`} />
              Follow-up · last sit: {STATUS_META[kind.priorStatus].label} · {fmtMonthDay(kind.priorAt)}
            </div>
          ) : (
            <div className="text-[10px] text-[#9CA3AF] whitespace-nowrap mt-0.5">First sit</div>
          ))}
        {hint && <div className="text-[10px] text-[#9CA3AF] whitespace-nowrap mt-0.5">{hint}</div>}
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
  kindById,
  onSelect,
}: {
  days: Date[];
  appts: CalAppt[];
  kindById: Map<string, ApptKind>;
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
                  const kind = kindById.get(a.id);
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
                          {kind &&
                            (kind.kind === 'follow_up' ? (
                              <span
                                className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_META[kind.priorStatus].block}`}
                              >
                                ↻ {STATUS_META[kind.priorStatus].label} · {fmtMonthDay(kind.priorAt)}
                              </span>
                            ) : (
                              <span className="mt-1 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded text-[#9CA3AF] bg-gray-50 border border-[#ececec]">
                                1st
                              </span>
                            ))}
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

function Legend({ viewMode }: { viewMode: 'focus' | 'normal' }) {
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
        {viewMode === 'normal' ? (
          <span className="w-2.5 h-2.5 rounded-sm bg-[#EEF2FF] border border-[#c7d2fe]" />
        ) : (
          <span className="w-2.5 h-2.5 rounded-sm bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_2px,#e9ebee_2px,#e9ebee_4px)]" />
        )}
        <span className="text-[#707070]">{viewMode === 'normal' ? 'Google event' : 'Google (busy)'}</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Quick-actions popover
// ══════════════════════════════════════════════════════════════════════
function ApptPopover({
  appt,
  kind,
  fifReset,
  onClose,
  onOpenLead,
  onRemind,
}: {
  appt: CalAppt;
  kind?: ApptKind;
  fifReset?: { smeName?: string };
  onClose: () => void;
  onOpenLead: () => void;
  onRemind: () => void;
}) {
  const meta = STATUS_META[appt.status];
  const fifChip = fifReset ? getFifResetChip(fifReset.smeName) : null;
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

        {/* First sit vs follow-up — and, orthogonally, a booked FIF reset
            (which lives on the SME's external calendar, never its own block). */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {kind &&
            (kind.kind === 'follow_up' ? (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_META[kind.priorStatus].block}`}>
                ↻ Follow-up · last sit: {STATUS_META[kind.priorStatus].label} · {fmtMonthDay(kind.priorAt)}
              </span>
            ) : (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border text-[#005851] bg-[#daf3f0] border-[#45bcaa]/40">
                First presentation
              </span>
            ))}
          {fifChip && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${fifChip.classes}`}>
              {fifChip.label}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {appt.leadPhone && (
            <a
              href={`tel:${normalizePhone(appt.leadPhone)}`}
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
