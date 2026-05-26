'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import AppointmentPicker from '../../../components/AppointmentPicker';
import SendConfirmationDrawer from '../../../components/SendConfirmationDrawer';
import LeadDetailPanel from '../../../components/LeadDetailPanel';
import { CloseSaleRitual } from '../../../components/CloseSaleRitual';
import { isLeadModeVisibleForEmail } from '../../../lib/feature-flags';

interface Lead {
  id: string;
  name: string;
  phone: string;
  phones?: Array<{ number: string; label?: 'cell' | 'home' | 'work' | 'other' | null }>;
  leadCode: string;
  formType?: string;
  // Subset of fields from the PDF extractor that the lead list filters
  // and sorts by. Other extracted fields aren't surfaced here — the lead
  // detail page handles those.
  address?: { street?: string; city?: string; state?: string; zip?: string };
  email?: string;
  createdAt?: Timestamp | null;
  appDownloadedAt?: string | null;
  assessmentCompletedAt?: Timestamp | null;
  convertedToClientId?: string | null;
  monthlyMortgageAmount?: number;
  notes?: string;
  // Dial-tracking fields (Chunk 4b). Denormalized at write time so
  // queue queries / sorting don't require reading dialLog[].
  lastDialAt?: Timestamp | null;
  lastDialOutcome?: 'no_answer' | 'left_vm' | 'wrong_number' | 'not_interested' | 'callback_requested' | 'booked' | 'do_not_call';
  dialLog?: Array<{ at?: Timestamp | null; outcome: string; notes?: string; phoneDialed?: string }>;
  // Attachment dedup (Chunk 4f). Tracks what the booking-confirmation
  // and reminder flows have already sent to this lead.
  attachmentsSent?: {
    businessCardAt?: string;
    licensesByState?: Record<string, string>;
  };
}

type LeadView = 'all' | 'queue';
type LeadSortKey = 'name' | 'createdAt' | 'source';
type SortDir = 'asc' | 'desc';

// ── Slide-flow geometry. Mirrors the Add Client flow on the Clients
// page (web/app/dashboard/clients/page.tsx ~L4231) so the "open the
// add form" interaction feels identical. The list surface slides LEFT
// (and fades to opacity 0.75 — NOT 0) when the form opens; the form
// surface slides in from the RIGHT. The slide is 72% + 15.25rem,
// NOT 100%, so a sliver of the list peeks from the left edge during
// and after the transit. Both surfaces stay at full opacity during
// the transition (via the 0.75 floor on the list) — gives the user
// a "shared moment" rather than a hard swap.
//
// Single-stage flow (vs Clients' multi-stage upload→review→welcome) so
// we don't need the belt / stage-index machinery — just two
// translateX states.
const SLIDE_TRANSITION = 'transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]';
const BELT_OFFSET = 'calc(72% + 15.25rem)';   // 72% of width + 14rem step + 1.25rem gap
const SURFACE_SHELL = 'relative w-full max-w-4xl mx-auto bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] overflow-hidden';
const SURFACE_HEADER = 'sticky top-0 z-10 flex items-center justify-between p-5 border-b border-[#ececec] bg-white';

// Feature flag gate at the wrapper level so the inner component's
// ~50 hooks (and the Firestore subscriptions they spin up) never run
// when the flag is off. Inlining the gate inside the inner component
// (where the original code lived) triggered 49 react-hooks/rules-of-
// hooks lint errors because every hook below the early return became
// conditional. The wrapper pattern is the canonical fix per React
// docs and keeps the lint signal-to-noise clean.
//
// Two-axis gate: global LEAD_MODE_ENABLED + LEAD_MODE_ADMIN_ONLY
// (see web/lib/feature-flags.ts). Waits for `user` to resolve before
// deciding to redirect so admins mid-auth-load aren't bounced. The
// inner component never mounts for non-admins so the leads
// Firestore listener also stays off. Belt-and-suspenders with the
// sidebar / mobile-nav gates in dashboard/layout.tsx.
export default function LeadsPage() {
  const router = useRouter();
  const { user } = useDashboard();
  const leadModeVisible = isLeadModeVisibleForEmail(user?.email);

  useEffect(() => {
    if (user && !leadModeVisible) router.replace('/dashboard');
  }, [user, leadModeVisible, router]);
  if (!leadModeVisible) return null;

  return <LeadsPageInner />;
}

function LeadsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, agentProfile } = useDashboard();

  // Right-pane selection (desktop call-queue view only). The URL param
  // is the source of truth so refresh + back/forward + shareable links
  // all work. `?leadId=ID` selects a lead into the right pane; when
  // missing on the queue view, the auto-select effect below fills it
  // with queueLeads[0] (top of the dial queue).
  const urlSelectedLeadId = searchParams?.get('leadId') ?? null;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<LeadView>('all');

  // ── Search + sort (All view only) ──
  // Queue has its own priority sort that we don't override. Search +
  // explicit sort are All-leads concerns — agent scanning the full
  // book to find a specific lead or order by source/state/date.
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<LeadSortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Add-Lead flow ── replaces the centered modal with a horizontal
  // slide. addFlowOpen=true → list slides out left, form slides in
  // from right; close → both slide back.
  const [addFlowOpen, setAddFlowOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [justCreated, setJustCreated] = useState<{
    leadCode: string;
    leadId: string;
    codeKind: 'derived' | 'fallback';
    formType?: string;
    extractionConfidence?: number;
  } | null>(null);

  // Bulk-upload summary for multi-page PDFs (each page = one lead form).
  // Shown as a separate banner so the single-lead derived-code messaging
  // stays clean.
  const [bulkUpload, setBulkUpload] = useState<{
    pageCount: number;
    leads: Array<{ leadId: string; leadCode: string; name: string; codeKind: 'derived' | 'fallback'; page: number }>;
    duplicates: Array<{ page: number; phone: string; name: string; existingLeadId: string; existingLeadCode: string; existingLeadName?: string }>;
    failed: Array<{ page: number; reason: string }>;
  } | null>(null);

  // Manual-create + single-page upload also surface duplicates via the
  // same bulkUpload banner — we just synthesize a 1-page bundle so the
  // single "Already imported as L-XYZ" row reuses the same UI.

  // PDF upload state (Chunk 2)
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // ── Live list of leads ──
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'agents', user.uid, 'leads'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setLeads(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, 'id'>) })),
      );
      setLoading(false);
    }, (err) => {
      console.error('leads onSnapshot error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // ── Upcoming-appointment map (leadId → next appointment) ──
  // Powers the "Booked Wed May 21 · 2pm" chip on each lead row so the
  // agent can see at a glance who's on the calendar without opening
  // each lead. Single inequality query (scheduledAt > now); status
  // filter applied in memory so we don't need a composite index.
  const [nextApptByLead, setNextApptByLead] = useState<Map<string, { scheduledAt: Date; tz?: string }>>(new Map());
  useEffect(() => {
    if (!user) return;
    const nowTs = Timestamp.fromMillis(Date.now());
    const q = query(
      collection(db, 'agents', user.uid, 'appointments'),
      where('scheduledAt', '>', nowTs),
      orderBy('scheduledAt', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const map = new Map<string, { scheduledAt: Date; tz?: string }>();
      for (const d of snap.docs) {
        const data = d.data() as { leadId?: string; scheduledAt?: Timestamp; scheduledAtTimeZone?: string; status?: string };
        if (!data.leadId || !data.scheduledAt) continue;
        if (data.status && data.status !== 'scheduled') continue;
        // First hit wins because query is sorted ascending — that's the
        // *next* appointment for the lead.
        if (!map.has(data.leadId)) {
          map.set(data.leadId, {
            scheduledAt: data.scheduledAt.toDate(),
            tz: data.scheduledAtTimeZone,
          });
        }
      }
      setNextApptByLead(map);
    }, (err) => {
      console.error('appointments onSnapshot error:', err);
    });
    return () => unsub();
  }, [user]);

  const openAddFlow = useCallback(() => {
    setJustCreated(null);
    setCreateError(null);
    setAddFlowOpen(true);
  }, []);

  const closeAddFlow = useCallback(() => {
    if (creating) return;
    setAddFlowOpen(false);
    setCreateError(null);
  }, [creating]);

  // ── Create lead ──
  const handleCreate = useCallback(async () => {
    if (!user) return;
    const name = createName.trim();
    const phone = createPhone.trim();
    if (!name || !phone) {
      setCreateError('Name and phone are both required');
      return;
    }
    // Phone is the lead's app code, so it must be at least 10 digits.
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setCreateError('Phone must have at least 10 digits — it doubles as the lead\'s app code');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/leads/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, phone, formType: 'Manual' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data?.error || `Failed to create lead (${res.status})`);
        return;
      }
      if (data.duplicate) {
        // Phone matches an existing lead for this agent. Surface via the
        // shared bulk-upload banner (synthetic 1-page bundle) so the
        // agent can open the existing lead from the same surface.
        setBulkUpload({
          pageCount: 1,
          leads: [],
          duplicates: [{
            page: 1,
            phone,
            name,
            existingLeadId: data.existingLeadId,
            existingLeadCode: data.existingLeadCode,
            existingLeadName: data.existingLeadName,
          }],
          failed: [],
        });
        setJustCreated(null);
        setCreateName('');
        setCreatePhone('');
        setAddFlowOpen(false);
        return;
      }
      setJustCreated({
        leadCode: data.leadCode,
        leadId: data.leadId,
        codeKind: data.codeKind || 'derived',
        formType: 'Manual',
      });
      setCreateName('');
      setCreatePhone('');
      // Slide back to the list — the just-created banner appears at
      // the top of the list surface so the agent immediately sees the
      // result of their action.
      setAddFlowOpen(false);
    } catch (err) {
      console.error('create lead error:', err);
      setCreateError('Network error — please try again');
    } finally {
      setCreating(false);
    }
  }, [user, createName, createPhone]);

  // ── PDF upload (Mail-In / Call-In / Digital) ──
  const handleUpload = useCallback(async (file: File) => {
    if (!user) return;
    setUploading(true);
    setUploadError(null);
    try {
      const token = await user.getIdToken();
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/leads/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data?.error || `Upload failed (${res.status})`);
        return;
      }
      if (data.multi) {
        // Multi-page PDF — one lead per page. Show the summary banner.
        setBulkUpload({
          pageCount: data.pageCount,
          leads: data.leads || [],
          duplicates: data.duplicates || [],
          failed: data.failed || [],
        });
        setJustCreated(null);
      } else if (data.duplicate) {
        // Single-page upload but the lead's phone already exists for
        // this agent. Reuse the bulk-upload banner as a 1-row "already
        // imported" surface so the agent sees it and can open the
        // existing lead without leaving the page.
        setBulkUpload({
          pageCount: 1,
          leads: [],
          duplicates: [{
            page: 1,
            phone: data.extracted?.phone || '',
            name: data.extracted?.name || '',
            existingLeadId: data.existingLeadId,
            existingLeadCode: data.existingLeadCode,
            existingLeadName: data.existingLeadName,
          }],
          failed: [],
        });
        setJustCreated(null);
      } else {
        setJustCreated({
          leadCode: data.leadCode,
          leadId: data.leadId,
          codeKind: data.codeKind || 'fallback',
          formType: data.formType,
          extractionConfidence: data.extractionConfidence,
        });
        setBulkUpload(null);
      }
    } catch (err) {
      console.error('upload lead error:', err);
      setUploadError('Network error — please try again');
    } finally {
      setUploading(false);
    }
  }, [user]);

  const copyToClipboard = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1800);
    } catch {
      // Fallback handled by browser
    }
  }, []);

  const formatTimestamp = (ts: Timestamp | null | undefined): string => {
    if (!ts) return '—';
    try {
      return ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  };

  /** Format the upcoming-appointment chip text — e.g. "Wed May 21 · 2pm".
   *  Uses the appointment's anchored TZ when present (so a booking made
   *  for a lead in another state renders in their local time, matching
   *  the SMS body convention). */
  const formatApptChip = (appt: { scheduledAt: Date; tz?: string }): string => {
    try {
      const opts: Intl.DateTimeFormatOptions = {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: appt.tz || undefined,
      };
      const s = appt.scheduledAt.toLocaleString(undefined, opts);
      // Reformat "Wed, May 21, 2:00 PM" → "Wed May 21 · 2pm". Drop the
      // :00 on whole-hour bookings; lowercase am/pm for compactness.
      return s
        .replace(/,/g, '')
        .replace(/:00\s*(AM|PM)/i, (_, ap) => (ap as string).toLowerCase())
        .replace(/\s*(AM|PM)/i, (_, ap) => (ap as string).toLowerCase())
        .replace(/(\d+)\s+([A-Za-z]+)\s+(\d+)\s+(\d)/, '$1 $2 $3 · $4');
    } catch {
      return 'Booked';
    }
  };

  // ── Call queue priority ──
  // Filters: drop converted, booked, not-interested, wrong-number leads.
  // Sort: never-dialed first (most urgent — agent should reach out),
  // then by elapsed-time-since-last-attempt with weighting based on
  // outcome (callback-requested ages fast, voicemail ages slowly).
  // ── Filtered + sorted All-leads view ──
  // Search matches against name / phone / leadCode / formType / state /
  // city (case-insensitive substring). Sort key cycles through
  // name / createdAt / state / source with asc/desc toggle per the
  // SortIcon helper below.
  const filteredLeads = useMemo<Lead[]>(() => {
    let result = leads;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((lead) => {
        const fields = [
          lead.name,
          lead.phone,
          lead.leadCode,
          lead.formType,
          lead.email,
          lead.address?.state,
          lead.address?.city,
        ];
        return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
      });
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (sortKey === 'createdAt') {
        const aT = a.createdAt?.toDate().getTime() ?? 0;
        const bT = b.createdAt?.toDate().getTime() ?? 0;
        cmp = aT - bT;
      } else if (sortKey === 'source') {
        cmp = (a.formType || '').localeCompare(b.formType || '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [leads, searchQuery, sortKey, sortDir]);

  const handleSort = useCallback((key: LeadSortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      // Default new-sort-key direction: asc for text, desc for date so
      // the agent sees "newest first" the moment they click Created.
      setSortDir(key === 'createdAt' ? 'desc' : 'asc');
      return key;
    });
  }, []);

  const queueLeads = useMemo<Lead[]>(() => {
    const persistence = agentProfile.dialPersistence ?? 1;

    type Scored = { lead: Lead; score: number };
    const scored: Scored[] = [];

    for (const lead of leads) {
      if (lead.convertedToClientId) continue;
      const out = lead.lastDialOutcome;
      if (out === 'booked' || out === 'not_interested' || out === 'wrong_number' || out === 'do_not_call') continue;

      const lastDialMs = lead.lastDialAt?.toDate().getTime() ?? null;
      let score: number;

      // Persistence hold: a lead the agent has dialed this session but
      // hasn't reached the dial-persistence threshold yet outranks even
      // never-dialed leads, so the agent stays on the lead for the next
      // dial. Only applies to no_answer — left_vm is terminal (once you
      // left a message, dialing again immediately is pointless). Reads
      // dialAttemptsForLeadRef at compute time, safe because queueLeads
      // recomputes when `leads` updates from the Firestore snapshot,
      // which is exactly when the outcome POST that matters here lands.
      const sessionAttempts = dialAttemptsForLeadRef.current.get(lead.id) || 0;
      const inPersistenceHold =
        sessionAttempts > 0
        && sessionAttempts < persistence
        && out === 'no_answer';

      if (inPersistenceHold) {
        score = Number.MAX_SAFE_INTEGER;
      } else if (lastDialMs === null) {
        // Never dialed — top of the rotation. Sub-sort by created-at so
        // newer leads rank slightly higher (they're more "fresh").
        const createdMs = lead.createdAt?.toDate().getTime() ?? 0;
        score = 1_000_000_000 + createdMs / 1000;
      } else {
        // Dialed leads: oldest-dialed first. No per-outcome cooldown —
        // the agent cycles through and comes back around naturally.
        score = -lastDialMs;
      }

      scored.push({ lead, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .map(({ lead }) => lead);
  }, [leads, agentProfile.dialPersistence]);

  // Tap-to-call — used on the queue rows. US-only — raw digits, the
  // OS dialer handles country-code interpretation. Sets the
  // pending-outcome target so the inline chip group appears under
  // this row when the agent returns from the dialer.
  const [pendingOutcomeLeadId, setPendingOutcomeLeadId] = useState<string | null>(null);
  // Which phone the agent dialed for the lead they tapped. Stamped onto
  // the dial-log when they pick an outcome chip below.
  const [pendingOutcomePhone, setPendingOutcomePhone] = useState<string | null>(null);
  const [loggingOutcomeId, setLoggingOutcomeId] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  /**
   * Pick the number to dial when the agent taps Call on a queue row.
   * Prefers the least-dialed phone (most likely to actually reach the
   * lead), with the primary as a tie-break. Falls back to lead.phone
   * for leads created before multi-phone shipped.
   */
  const pickQueueDialNumber = useCallback((lead: Lead): string => {
    const phones = lead.phones && lead.phones.length > 0
      ? lead.phones
      : (lead.phone ? [{ number: lead.phone }] : []);
    if (phones.length === 0) return lead.phone || '';
    if (phones.length === 1) return phones[0].number;
    const digitsOnly = (s: string) => s.replace(/\D/g, '');
    const log = lead.dialLog || [];
    const counts = phones.map((p) => {
      const want = digitsOnly(p.number);
      return log.filter((d) => digitsOnly(d.phoneDialed || '') === want).length;
    });
    // Argmin; first occurrence wins (so primary breaks ties).
    let minIdx = 0;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] < counts[minIdx]) minIdx = i;
    }
    return phones[minIdx].number;
  }, []);

  // Replace the `?leadId=` param without scrolling or touching history.
  // We use replace (not push) so each row click doesn't pile entries
  // on the back stack — the agent moves through many leads per dial
  // session and they shouldn't have to back-button through every one
  // to get out.
  const setSelectedLeadIdInUrl = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (id) params.set('leadId', id);
    else params.delete('leadId');
    const qs = params.toString();
    router.replace(qs ? `/dashboard/leads?${qs}` : '/dashboard/leads', { scroll: false });
  }, [router, searchParams]);

  // Viewport-aware row tap. On desktop (≥ md), the queue uses the
  // two-pane layout — tapping a row updates `?leadId=` so the right
  // pane loads the detail. On mobile, the right pane isn't rendered;
  // fall through to the standalone detail route the way the lead list
  // has worked all along.
  const handleRowSelect = useCallback((leadId: string) => {
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
    if (isDesktop) {
      setSelectedLeadIdInUrl(leadId);
    } else {
      router.push(`/dashboard/leads/${leadId}`);
    }
  }, [router, setSelectedLeadIdInUrl]);

  // Desktop-only "select + dial" handoff. The queue picks the phone
  // (least-dialed wins), bumps the nonce, and the LeadDetailPanel's
  // pendingDial effect fires `tel:` + opens the outcome prompt in one
  // motion. Mobile keeps the existing inline-outcome-chip flow inside
  // `handleQueueCall`.
  const [desktopPendingDial, setDesktopPendingDial] = useState<{ leadId: string; phone: string; nonce: number } | null>(null);
  const dialNonceRef = useRef(0);

  // Per-lead dial-session counter. Drives the dial-persistence setting
  // (1/2/3 attempts before auto-advance). Incremented every time the
  // desktop Call button fires on a lead. Cleared when the queue
  // advances off that lead OR when a terminal outcome (booked /
  // not_interested / wrong_number / do_not_call / callback_requested)
  // is chipped. In-memory only — session-scoped, no Firestore mirror.
  const dialAttemptsForLeadRef = useRef<Map<string, number>>(new Map());

  const handleQueueCall = useCallback((lead: Lead, phoneOverride?: string) => {
    // Hard-stop on do-not-call leads. The queue filter already drops
    // them from the queue, but they can still appear in the All tab —
    // make sure a stray click doesn't dial them.
    if (lead.lastDialOutcome === 'do_not_call') return;
    const target = phoneOverride || pickQueueDialNumber(lead);
    const digits = target.replace(/\D/g, '');
    if (digits.length < 7) return;
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
    if (isDesktop) {
      // Desktop two-pane: hand off the dial to LeadDetailPanel — it
      // fires `tel:` and renders the outcome prompt inside the right
      // pane. The nonce ensures the same phone fired twice in a row
      // still re-triggers the panel's effect.
      setSelectedLeadIdInUrl(lead.id);
      dialNonceRef.current += 1;
      setDesktopPendingDial({ leadId: lead.id, phone: target, nonce: dialNonceRef.current });
      // Bump the per-lead dial-attempt counter for the persistence
      // setting. Cleared when the queue advances or on terminal
      // outcome — see advanceToNextQueueLead below.
      dialAttemptsForLeadRef.current.set(
        lead.id,
        (dialAttemptsForLeadRef.current.get(lead.id) || 0) + 1,
      );
      return;
    }
    // Mobile: dial inline + open the outcome chip under this row.
    setOutcomeError(null);
    setPendingOutcomeLeadId(lead.id);
    setPendingOutcomePhone(target);
    window.location.href = `tel:${digits}`;
  }, [pickQueueDialNumber, setSelectedLeadIdInUrl]);

  // When the agent picks "Booked" as the outcome on a queue row,
  // open the appointment picker (which atomically logs the dial
  // outcome on save) instead of immediately POSTing the dial outcome.
  // After save → auto-open the confirmation drawer (Chunk 4e) so the
  // agent can fire the SMS while the lead is still on the line.
  const [bookingForLead, setBookingForLead] = useState<Lead | null>(null);
  const [confirmingLead, setConfirmingLead] = useState<{ lead: Lead; appointmentId: string; scheduledAt: Date } | null>(null);
  // Close Sale ritual state — modal hosted at the page level so it
  // survives the LeadDetailPanel re-mount that Card 1's convert
  // triggers (snapshot drops the converted lead from queueLeads →
  // effectiveSelectedLeadId shifts → panel key flips → panel
  // unmounts). `closeSaleLead` holds the lead the ritual was opened
  // for; `advanceAfterCloseSale` records whether Card 1 actually
  // converted so onClose can fire the queue advance only when the
  // agent finished a real conversion (vs. closed the modal having
  // done nothing).
  const [closeSaleLead, setCloseSaleLead] = useState<{
    id: string;
    name: string;
    firstName: string;
    phone: string;
  } | null>(null);
  const advanceAfterCloseSale = useRef(false);

  const handleQueueLogOutcome = useCallback(async (leadId: string, outcome: string) => {
    if (!user) return;
    if (outcome === 'booked') {
      const lead = leads.find((l) => l.id === leadId);
      if (lead) {
        setPendingOutcomeLeadId(null);
        setBookingForLead(lead);
      }
      return;
    }
    setLoggingOutcomeId(leadId);
    setOutcomeError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/leads/${leadId}/dials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          outcome,
          ...(pendingOutcomePhone ? { phoneDialed: pendingOutcomePhone } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOutcomeError(data?.error || `Failed to log (${res.status})`);
        return;
      }
      setPendingOutcomeLeadId(null);
      setPendingOutcomePhone(null);
      // Live snapshot picks up the new lastDialAt/lastDialOutcome
      // and the queue useMemo re-sorts on the next render. Booked /
      // not-interested / wrong-number leads drop off the queue
      // entirely; others move down based on cooldown.
    } catch (err) {
      console.error('queue outcome error:', err);
      setOutcomeError('Network error — try again');
    } finally {
      setLoggingOutcomeId(null);
    }
  }, [user, leads, pendingOutcomePhone]);

  const formatRelativeFromNow = (ts: Timestamp | null | undefined): string => {
    if (!ts) return '';
    try {
      const ms = Date.now() - ts.toDate().getTime();
      const minutes = Math.floor(ms / 60_000);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      return ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const DIAL_OUTCOME_LABELS: Record<string, string> = {
    no_answer: 'No answer',
    left_vm: 'Voicemail',
    wrong_number: 'Wrong #',
    not_interested: 'Not interested',
    callback_requested: 'Callback',
    booked: 'Booked',
    do_not_call: 'Do not call',
  };

  const DIAL_OUTCOME_TONE: Record<string, string> = {
    no_answer: 'bg-gray-100 text-gray-700 border-gray-300',
    left_vm: 'bg-blue-50 text-blue-800 border-blue-200',
    wrong_number: 'bg-red-50 text-red-800 border-red-200',
    not_interested: 'bg-red-50 text-red-800 border-red-200',
    callback_requested: 'bg-amber-50 text-amber-900 border-amber-300',
    booked: 'bg-[#daf3f0] text-[#005851] border-[#45bcaa]',
    do_not_call: 'bg-red-100 text-red-900 border-red-300',
  };

  // Slide-belt transforms. Outgoing list slides 72% + 15.25rem left
  // (sliver peeks from the right edge of viewport — well, the LEFT
  // edge of viewport since it's moving leftward) and stays at opacity
  // 0.75 — visible-but-dimmed, not gone. Incoming form slides in from
  // the same offset on the right and fades opacity 0 → 1.
  const listSurfaceStyle: CSSProperties = {
    transform: addFlowOpen ? `translateX(calc(-1 * ${BELT_OFFSET}))` : 'translateX(0)',
    opacity: addFlowOpen ? 0.75 : 1,
    pointerEvents: addFlowOpen ? 'none' : 'auto',
    userSelect: addFlowOpen ? 'none' : 'auto',
  };
  const addFlowSurfaceStyle: CSSProperties = {
    transform: addFlowOpen ? 'translateX(0)' : `translateX(${BELT_OFFSET})`,
    opacity: addFlowOpen ? 1 : 0,
    pointerEvents: addFlowOpen ? 'auto' : 'none',
  };

  // ── Right-pane selection (desktop call-queue view only) ──
  // URL is the source of truth; when missing, default to queueLeads[0]
  // so the agent lands on "who you should call next" without an extra
  // click. Falls back to null if the queue is empty.
  const effectiveSelectedLeadId =
    urlSelectedLeadId
    ?? (view === 'queue' && queueLeads.length > 0 ? queueLeads[0].id : null);

  // pendingDial is only forwarded to the panel when it matches the lead
  // currently in the right pane — protects against a stale handoff if
  // the user re-selected before the panel mounted.
  const pendingDialForPanel =
    desktopPendingDial && desktopPendingDial.leadId === effectiveSelectedLeadId
      ? { phone: desktopPendingDial.phone, nonce: desktopPendingDial.nonce }
      : null;

  // Auto-advance after the panel logs an outcome (chip, booking,
  // convert, delete). Gated by the agent's `dialPersistence` setting:
  //
  //   - Terminal outcomes (booked / not_interested / wrong_number /
  //     do_not_call / callback_requested / left_vm) ALWAYS advance —
  //     left_vm is terminal because once a message is left, immediately
  //     re-dialing the same number is pointless.
  //   - Transient outcome (no_answer) only advances when the per-lead
  //     session attempt count meets the threshold.
  //   - Convert / delete (no outcome string) always advance — the
  //     lead is leaving the queue entirely.
  //
  // Booked / not_interested / wrong_number / do_not_call also drop
  // the lead off the queue via the live snapshot's lastDialOutcome
  // filter; no_answer re-scores by lastDialAt and cycles to the
  // bottom of the dialed-leads bucket. queueLeads.find(l => l.id !== current)
  // reliably points at the next lead. We synchronously advance
  // without waiting for the snapshot to re-arrive — the panel's
  // POST has already gone out, and queueLeads will recompute as
  // soon as Firestore confirms.
  const TERMINAL_OUTCOMES = useMemo(
    () => new Set(['booked', 'not_interested', 'wrong_number', 'do_not_call', 'callback_requested', 'left_vm']),
    [],
  );
  const advanceToNextQueueLead = useCallback((outcome?: string) => {
    if (view !== 'queue') return;
    const persistence = agentProfile.dialPersistence ?? 1;
    const currentLeadId = effectiveSelectedLeadId;
    const attempts = (currentLeadId && dialAttemptsForLeadRef.current.get(currentLeadId)) || 0;
    const isTerminal = !outcome || TERMINAL_OUTCOMES.has(outcome);
    const reachedThreshold = attempts >= persistence;
    if (!isTerminal && !reachedThreshold) {
      // Persistence dictates staying on this lead for another attempt.
      // The right pane keeps showing the same lead; the agent hits
      // Call again from the panel (or the list rail) to re-dial.
      return;
    }
    // Clear the attempt counter for the lead we're leaving so that
    // future re-entries (e.g. callback_requested resurfacing later)
    // start fresh.
    if (currentLeadId) dialAttemptsForLeadRef.current.delete(currentLeadId);
    const currentIdx = queueLeads.findIndex((l) => l.id === effectiveSelectedLeadId);
    const next =
      (currentIdx >= 0 ? queueLeads[currentIdx + 1] : null)
      || queueLeads.find((l) => l.id !== effectiveSelectedLeadId)
      || null;
    setSelectedLeadIdInUrl(next ? next.id : null);
  }, [view, queueLeads, effectiveSelectedLeadId, agentProfile.dialPersistence, TERMINAL_OUTCOMES, setSelectedLeadIdInUrl]);

  return (
    <div className={`max-w-7xl mx-auto ${addFlowOpen ? 'overflow-x-visible' : 'overflow-x-clip'}`}>
      <div className="relative">
        {/* ── List surface ── */}
        <div className={SLIDE_TRANSITION} style={listSurfaceStyle}>
          {/* Action bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={openAddFlow}
                className="px-4 py-2.5 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Lead
              </button>
              <label className={`px-4 py-2.5 bg-white text-[#0D4D4D] font-semibold rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors hover:bg-[#f8f8f8] flex items-center gap-2 text-sm cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handleUpload(file);
                      e.target.value = '';
                    }
                  }}
                />
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {uploading ? 'Reading…' : 'Upload Lead Form'}
              </label>
            </div>
          </div>

          {/* Tab switcher: All vs Call queue. The queue prioritizes
              never-dialed first, then by elapsed-time-since-last-attempt
              with outcome-specific cooldowns. Designed for sit-down
              dialing sessions: open queue, dial top of list, log
              outcome, queue auto-resorts. */}
          <div className="mb-4 flex items-end justify-between gap-3 border-b border-[#d0d0d0]">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setView('all')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  view === 'all'
                    ? 'border-[#44bbaa] text-[#005851]'
                    : 'border-transparent text-[#707070] hover:text-[#005851]'
                }`}
              >
                All leads
                <span className="ml-1.5 text-xs text-[#9CA3AF] font-normal">
                  {view === 'all' && searchQuery.trim() ? `${filteredLeads.length} / ${leads.length}` : leads.length}
                </span>
              </button>
              <button
                onClick={() => setView('queue')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  view === 'queue'
                    ? 'border-[#44bbaa] text-[#005851]'
                    : 'border-transparent text-[#707070] hover:text-[#005851]'
                }`}
              >
                Call queue
                <span className="ml-1.5 text-xs text-[#9CA3AF] font-normal">{queueLeads.length}</span>
              </button>
            </div>

            {/* Search — only filters the All view. Hidden in Queue view
                because the queue's purpose is "who should I call next"
                — searching by name there would defeat the priority sort. */}
            {view === 'all' && (
              <div className="relative w-full max-w-xs mb-1.5">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#707070]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search leads…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-white rounded-[5px] border border-[#d0d0d0] text-sm text-[#000000] placeholder-[#707070] focus:outline-none focus:border-[#45bcaa]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-[#707070] hover:bg-gray-100 flex items-center justify-center"
                    aria-label="Clear search"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* PDF drop-zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleUpload(file);
            }}
            className={`mb-4 rounded-[5px] border-2 border-dashed px-5 py-4 transition-all ${
              dragActive
                ? 'border-[#45bcaa] bg-[#daf3f0]/60'
                : 'border-[#45bcaa]/40 bg-[#daf3f0]/30 hover:bg-[#daf3f0]/50'
            } ${uploading ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-[#005851] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#005851]">
                  {uploading ? 'Reading the form…' : 'Drop a Mail-In, Call-In, or Digital lead form PDF here'}
                </p>
                <p className="text-xs text-[#005851]/70 mt-0.5">
                  Name, phone, address, mortgage details, and more get pulled out automatically.
                </p>
              </div>
            </div>
            {uploadError && (
              <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-[5px] px-3 py-2">
                {uploadError}
              </div>
            )}
          </div>

          {/* Just-created banner */}
          {justCreated && (
            <div className="mb-6 bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold tracking-wider text-[#005851] uppercase">Lead created</span>
                    {justCreated.formType && justCreated.formType !== 'Manual' && (
                      <span className="text-[10px] text-[#707070] font-normal">
                        · {justCreated.formType} form
                        {typeof justCreated.extractionConfidence === 'number' && (
                          <> · {Math.round(justCreated.extractionConfidence * 100)}% confident</>
                        )}
                      </span>
                    )}
                  </div>
                  {justCreated.codeKind === 'derived' ? (
                    <p className="text-sm text-[#444] mb-3 leading-relaxed">
                      Tell your lead to download AFL and enter{' '}
                      <strong className="text-[#000000]">their phone number</strong>.
                      No code to remember. (The 10 digits below are what they&apos;ll type.)
                    </p>
                  ) : (
                    <div className="text-sm text-amber-900 mb-3 bg-amber-50 border border-amber-300/60 rounded-[5px] px-3 py-2 leading-relaxed">
                      <strong>Heads up:</strong> another lead in the system already has this
                      phone number, or the phone couldn&apos;t be read from the form.
                      Read this random code to your lead during the call.
                    </div>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="font-mono text-2xl tracking-[0.3em] font-bold text-[#005851] bg-[#daf3f0]/50 px-4 py-2 rounded-[5px] border border-[#45bcaa]/40">
                      {justCreated.leadCode}
                    </div>
                    <button
                      onClick={() => copyToClipboard(justCreated.leadCode)}
                      className="px-4 py-2 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors"
                    >
                      {copiedCode === justCreated.leadCode ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={() => router.push(`/dashboard/leads/${justCreated.leadId}`)}
                      className="px-4 py-2 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
                    >
                      Open lead →
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setJustCreated(null)}
                  className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 shrink-0"
                  aria-label="Dismiss"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Bulk-upload summary — N leads created from a multi-page PDF. */}
          {bulkUpload && (
            <div className="mb-6 bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold tracking-wider text-[#005851] uppercase">
                      {bulkUpload.leads.length} {bulkUpload.leads.length === 1 ? 'lead' : 'leads'} created
                    </span>
                    <span className="text-[10px] text-[#707070] font-normal">
                      · {bulkUpload.pageCount} {bulkUpload.pageCount === 1 ? 'page' : 'pages'}
                      {bulkUpload.duplicates.length > 0 && (
                        <> · {bulkUpload.duplicates.length} already imported</>
                      )}
                      {bulkUpload.failed.length > 0 && (
                        <> · {bulkUpload.failed.length} couldn&apos;t be read</>
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-[#444] leading-relaxed">
                    {bulkUpload.leads.length === 0 && bulkUpload.duplicates.length > 0 && bulkUpload.failed.length === 0
                      ? 'No new leads created — the phone(s) already exist for you. Open below to pick up where you left off.'
                      : 'Each page in the PDF was treated as one lead form. Open any to verify the extracted info.'}
                  </p>
                </div>
                <button
                  onClick={() => setBulkUpload(null)}
                  className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 shrink-0"
                  aria-label="Dismiss"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {bulkUpload.leads.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {bulkUpload.leads.map((l) => (
                    <li key={l.leadId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-[#374151]">
                        <span className="text-[10px] text-[#9CA3AF] mr-2">p{l.page}</span>
                        <strong className="text-[#000000]">{l.name}</strong>
                        <span className="ml-2 font-mono text-xs text-[#005851]">{l.leadCode}</span>
                        {l.codeKind === 'fallback' && (
                          <span className="ml-2 text-[10px] text-amber-700">(random code — phone collision)</span>
                        )}
                      </span>
                      <button
                        onClick={() => router.push(`/dashboard/leads/${l.leadId}`)}
                        className="text-xs font-semibold text-[#44bbaa] hover:text-[#005751]"
                      >
                        Open →
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {bulkUpload.duplicates.length > 0 && (
                <div className="rounded-[5px] bg-[#FEF3C7] border border-[#FCD34D] px-3 py-2 mb-3">
                  <p className="text-[11px] font-semibold text-[#92400E] mb-1.5">
                    Already imported {bulkUpload.duplicates.length === 1 ? '— same phone matched an existing lead' : `— ${bulkUpload.duplicates.length} phones matched existing leads`}:
                  </p>
                  <ul className="space-y-1">
                    {bulkUpload.duplicates.map((d) => (
                      <li key={`${d.page}-${d.existingLeadId}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-[#92400E]">
                          <span className="text-[10px] text-[#92400E]/60 mr-2">p{d.page}</span>
                          <strong className="text-[#92400E]">{d.name || '(no name)'}</strong>
                          <span className="ml-2 text-[11px] text-[#92400E]/80">→ {d.existingLeadName || 'existing lead'}</span>
                          <span className="ml-2 font-mono text-xs text-[#92400E]">{d.existingLeadCode}</span>
                        </span>
                        <button
                          onClick={() => router.push(`/dashboard/leads/${d.existingLeadId}`)}
                          className="text-xs font-semibold text-[#005851] hover:text-[#003832]"
                        >
                          Open →
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {bulkUpload.failed.length > 0 && (
                <div className="rounded-[5px] bg-amber-50 border border-amber-300/60 px-3 py-2">
                  <p className="text-[11px] font-semibold text-amber-900 mb-1">
                    Couldn&apos;t read these pages — use <em>+ Add Lead</em> to enter manually:
                  </p>
                  <ul className="text-[11px] text-amber-900/90 space-y-0.5">
                    {bulkUpload.failed.map((f) => (
                      <li key={f.page}>Page {f.page} — {f.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* List card — branches on view. In queue view with at least
              one lead, desktop (≥ md) splits into a narrow list rail on
              the left + LeadDetailPanel on the right so the agent sees
              the full lead profile while dialing. Mobile keeps the
              single-column layout with the inline outcome chip flow
              under each row. */}
          <div className={view === 'queue' && !loading && queueLeads.length > 0 ? 'md:flex md:gap-4 md:items-start' : ''}>
          {/* List rail. Desktop two-pane: sticky to the top of the
              scrollable main so the agent never loses the queue while
              scrolling the long right pane (form fields + appointments
              + dial history). max-h sized to leave room for the dashboard
              header (h-14) + ticker + main padding above the scrollport;
              internal overflow-y-auto kicks in when the queue is taller
              than viewport. x-axis stays clipped for the rounded corners. */}
          <div className={`bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] overflow-hidden ${
            view === 'queue' && !loading && queueLeads.length > 0
              ? 'md:w-[360px] md:shrink-0 md:sticky md:top-0 md:max-h-[calc(100vh-8rem)] md:overflow-y-auto'
              : ''
          }`}>
            {view === 'queue' && !loading && queueLeads.length > 0 ? (
              <div>
                <div className="px-5 py-3 bg-[#daf3f0]/30 border-b border-[#d0d0d0] text-xs text-[#005851] font-semibold">
                  Top of the queue is who you should call next.
                  Outcome-chip the call and the queue resorts automatically.
                </div>
                <ul className="divide-y divide-[#f1f1f1]">
                  {queueLeads.map((lead, idx) => {
                    const isPending = pendingOutcomeLeadId === lead.id;
                    const isLogging = loggingOutcomeId === lead.id;
                    const isSelected = effectiveSelectedLeadId === lead.id;
                    return (
                      <li key={lead.id} className={`px-5 py-3.5 ${
                        isPending ? 'bg-[#FEFCE8]' :
                        isSelected ? 'md:bg-[#daf3f0]/40 hover:bg-[#f8f8f8] md:hover:bg-[#daf3f0]/50' :
                        'hover:bg-[#f8f8f8]'
                      }`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-[#9CA3AF] w-6 shrink-0 text-right">{idx + 1}.</span>
                          <button
                            onClick={() => handleRowSelect(lead.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="text-sm font-semibold text-[#000000] truncate flex items-center gap-2">
                              <span className="truncate">{lead.name}</span>
                              {nextApptByLead.get(lead.id) && (
                                <span className="inline-flex items-center shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#daf3f0] text-[#005851] rounded">
                                  📅 {formatApptChip(nextApptByLead.get(lead.id)!)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#707070] mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>{lead.phone}</span>
                              {lead.lastDialOutcome ? (
                                <>
                                  <span>·</span>
                                  <span>
                                    Last: {DIAL_OUTCOME_LABELS[lead.lastDialOutcome] || lead.lastDialOutcome}
                                    {lead.lastDialAt && (
                                      <span className="text-[#9CA3AF] ml-1">{formatRelativeFromNow(lead.lastDialAt)}</span>
                                    )}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span>·</span>
                                  <span className="text-[#005851] font-semibold">Never dialed</span>
                                </>
                              )}
                            </div>
                          </button>
                          <button
                            onClick={() => handleQueueCall(lead)}
                            className="px-3 py-2 bg-[#44bbaa] hover:bg-[#005751] text-white text-xs font-semibold rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors flex items-center gap-1.5 shrink-0"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {isPending ? 'Re-dial' : 'Call'}
                          </button>
                        </div>

                        {/* Inline outcome prompt — mobile-only. On
                            desktop the LeadDetailPanel in the right
                            pane owns the outcome chip flow. Same
                            vocabulary as the detail-page prompt;
                            stays open until agent picks an outcome
                            or hits Skip. */}
                        {isPending && (
                          <div className="mt-3 ml-9 flex items-center gap-2 flex-wrap md:hidden">
                            <span className="text-xs font-semibold text-[#92400E]">How did it go?</span>
                            {(['no_answer', 'left_vm', 'callback_requested', 'booked', 'not_interested', 'wrong_number', 'do_not_call'] as const).map((outcome) => (
                              <button
                                key={outcome}
                                onClick={() => void handleQueueLogOutcome(lead.id, outcome)}
                                disabled={isLogging}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border ${DIAL_OUTCOME_TONE[outcome]} hover:opacity-80 transition-opacity disabled:opacity-40`}
                              >
                                {DIAL_OUTCOME_LABELS[outcome]}
                              </button>
                            ))}
                            <button
                              onClick={() => setPendingOutcomeLeadId(null)}
                              disabled={isLogging}
                              className="text-[11px] text-[#9CA3AF] hover:text-[#707070] font-semibold ml-1"
                            >
                              Skip
                            </button>
                            {isPending && outcomeError && pendingOutcomeLeadId === lead.id && (
                              <span className="text-xs text-red-600 ml-2">{outcomeError}</span>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : view === 'queue' && !loading ? (
              <div className="p-8 sm:p-12 text-center">
                <p className="text-[#000000] font-semibold mb-2">Nothing in the queue right now.</p>
                <p className="text-sm text-[#707070] max-w-md mx-auto">
                  Either you&apos;ve worked through every lead, or all current leads are still
                  in their post-call cooldown. Add more leads or wait — the queue
                  resurfaces leads automatically based on their last outcome.
                </p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <svg className="animate-spin w-10 h-10 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-[#707070]">Loading leads…</p>
                </div>
              </div>
            ) : leads.length === 0 ? (
              <div className="p-8 sm:p-12 max-w-3xl mx-auto">
                <h2 className="text-xl sm:text-2xl font-bold text-[#000000] mb-2">
                  Get a lead warmed up before your appointment.
                </h2>
                <p className="text-[#444] text-sm sm:text-base leading-relaxed mb-5">
                  When you set an appointment, get the lead into AFL during that same call.
                  They download the app, enter their phone number, and the app
                  walks them through a short intro video, an assessment, and a couple of FAQ + case-study
                  videos — so when you call back, you&apos;re not a stranger and the easy objections
                  are already softened.
                </p>
                <div className="space-y-4 mb-6">
                  <div>
                    <p className="font-semibold text-[#000000] mb-1">Two ways to add a lead.</p>
                    <p className="text-[#444] text-sm leading-relaxed">
                      <strong>Drop a lead form PDF</strong> (Mail-In, Call-In, or Digital) into the box above —
                      AFL pulls out name, phone, address, DOB, mortgage details, and more.
                      Or click <strong>Add Lead</strong> for a one-off manual entry on the call.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-[#000000] mb-1">Their app code is their phone number.</p>
                    <p className="text-[#444] text-sm leading-relaxed">
                      No random code to read out. You say
                      &ldquo;your code is your phone number&rdquo; on the call,
                      and they type the 10 digits into AFL on the spot.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex-1 px-6 py-3 bg-white hover:bg-[#daf3f0]/30 text-[#005851] font-semibold rounded-[5px] border-2 border-dashed border-[#45bcaa]/50 transition-colors text-center cursor-pointer">
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleUpload(file);
                          e.target.value = '';
                        }
                      }}
                    />
                    Upload a lead form PDF
                  </label>
                  <button
                    onClick={openAddFlow}
                    className="flex-1 px-6 py-3 bg-[#44bbaa] hover:bg-[#005751] text-white font-semibold rounded-[5px] transition-colors"
                  >
                    Add a lead manually
                  </button>
                </div>
              </div>
            ) : filteredLeads.length === 0 && searchQuery.trim() ? (
              <div className="p-10 text-center">
                <p className="text-sm text-[#707070] mb-3">
                  No leads match <span className="font-semibold text-[#000000]">&ldquo;{searchQuery}&rdquo;</span>.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-semibold text-[#44bbaa] hover:text-[#005751]"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#d0d0d0] bg-[#f8f8f8]">
                      <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">
                        <button
                          type="button"
                          onClick={() => handleSort('name')}
                          className={`inline-flex items-center gap-1 hover:text-[#005851] ${sortKey === 'name' ? 'text-[#005851]' : ''}`}
                        >
                          Name
                          <span className="text-[10px] w-2 inline-block">
                            {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                          </span>
                        </button>
                      </th>
                      <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">Phone</th>
                      <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">
                        <button
                          type="button"
                          onClick={() => handleSort('source')}
                          className={`inline-flex items-center gap-1 hover:text-[#005851] ${sortKey === 'source' ? 'text-[#005851]' : ''}`}
                        >
                          Source
                          <span className="text-[10px] w-2 inline-block">
                            {sortKey === 'source' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                          </span>
                        </button>
                      </th>
                      <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">Downloaded</th>
                      <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">Assessment</th>
                      <th className="text-left text-xs font-semibold text-[#707070] uppercase tracking-wider px-5 py-3">
                        <button
                          type="button"
                          onClick={() => handleSort('createdAt')}
                          className={`inline-flex items-center gap-1 hover:text-[#005851] ${sortKey === 'createdAt' ? 'text-[#005851]' : ''}`}
                        >
                          Created
                          <span className="text-[10px] w-2 inline-block">
                            {sortKey === 'createdAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                          </span>
                        </button>
                      </th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="border-b border-[#f1f1f1] hover:bg-[#f8f8f8] cursor-pointer transition-colors"
                        onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                      >
                        <td className="px-5 py-3.5 text-sm font-semibold text-[#000000]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{lead.name}</span>
                            {lead.convertedToClientId && (
                              <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#daf3f0] text-[#005851] rounded">
                                Converted
                              </span>
                            )}
                            {nextApptByLead.get(lead.id) && (
                              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#daf3f0] text-[#005851] rounded">
                                📅 {formatApptChip(nextApptByLead.get(lead.id)!)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-[#444] whitespace-nowrap">{lead.phone}</td>
                        <td className="px-5 py-3.5 text-sm text-[#707070]">{lead.formType || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-[#707070]">
                          {lead.appDownloadedAt ? <span className="text-[#005851] font-semibold">✓</span> : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-[#707070]">
                          {lead.assessmentCompletedAt ? <span className="text-[#005851] font-semibold">✓</span> : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-[#707070]">{formatTimestamp(lead.createdAt)}</td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <span className="text-[#44bbaa] text-sm font-semibold">Open →</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Right pane — desktop call-queue view only. The LeadDetailPanel
              shows the full lead profile + Call buttons + outcome chip +
              Book/Convert next to the narrow list rail. Selection is in
              `?leadId=`; auto-advances to the next queue lead after any
              outcome chip / booking / conversion / deletion. */}
          {view === 'queue' && !loading && queueLeads.length > 0 && (
            <div className="hidden md:block md:flex-1 md:min-w-0">
              {/* Slide-belt container — LeadDetailPanel and the
                  Close Sale surface live in here side by side. When
                  Close Sale opens, the lead panel slides left and
                  Close Sale slides in from the right (matches the
                  Add Client flow on /dashboard/clients). */}
              <div className="relative overflow-hidden" style={{ minHeight: closeSaleLead ? 900 : undefined }}>
                {/* Lead detail panel — slides left when Close Sale active. */}
                <div
                  className="transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    transform: closeSaleLead ? 'translateX(-110%)' : 'translateX(0)',
                    opacity: closeSaleLead ? 0 : 1,
                    pointerEvents: closeSaleLead ? 'none' : 'auto',
                  }}
                  aria-hidden={!!closeSaleLead}
                >
                  <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
                    {effectiveSelectedLeadId ? (
                      <LeadDetailPanel
                        key={effectiveSelectedLeadId}
                        leadId={effectiveSelectedLeadId}
                        pendingDial={pendingDialForPanel}
                        onConverted={advanceToNextQueueLead}
                        onDeleted={advanceToNextQueueLead}
                        onOutcomeLogged={advanceToNextQueueLead}
                        onCallFired={() => {
                          // Re-dials from the panel's multi-phone editor
                          // count toward the dial-persistence threshold.
                          // Queue-row initial dials are bumped by
                          // handleQueueCall before pendingDial fires, so
                          // this fires only for in-panel re-dials.
                          if (!effectiveSelectedLeadId) return;
                          dialAttemptsForLeadRef.current.set(
                            effectiveSelectedLeadId,
                            (dialAttemptsForLeadRef.current.get(effectiveSelectedLeadId) || 0) + 1,
                          );
                        }}
                        onBookingComplete={(appointmentId, scheduledAt) => {
                          // Host the confirmation drawer here at the queue
                          // page rather than inside the panel. The booking
                          // POST stamps `lastDialOutcome:'booked'` on the
                          // lead, queueLeads filters it out, and (when
                          // urlSelectedLeadId is null) effectiveSelectedLeadId
                          // flips to the next lead — unmounting the panel
                          // mid-render. Drawer at parent level survives
                          // that re-mount and stays visible until dismiss.
                          const lead = leads.find((l) => l.id === effectiveSelectedLeadId);
                          if (!lead) return;
                          setConfirmingLead({ lead, appointmentId, scheduledAt });
                        }}
                        onRequestCloseSale={(leadSnapshot) => {
                          // Panel hands us a captured snapshot — the surface
                          // renders against this even after the panel
                          // below unmounts mid-ritual.
                          advanceAfterCloseSale.current = false;
                          setCloseSaleLead(leadSnapshot);
                        }}
                      />
                    ) : (
                      <p className="text-sm text-[#707070]">Pick a lead from the queue to see their details.</p>
                    )}
                  </div>
                </div>

                {/* Close Sale surface — slides in from the right when active. */}
                <div
                  className="absolute inset-x-0 top-0 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    transform: closeSaleLead ? 'translateX(0)' : 'translateX(110%)',
                    opacity: closeSaleLead ? 1 : 0,
                    pointerEvents: closeSaleLead ? 'auto' : 'none',
                  }}
                  aria-hidden={!closeSaleLead}
                >
                  {closeSaleLead && user && (
                    <CloseSaleRitual
                      open={!!closeSaleLead}
                      user={user}
                      agentId={user.uid}
                      agentName={agentProfile.name || ''}
                      lead={closeSaleLead}
                      onConverted={() => {
                        // Card 1 success — defer queue advance until
                        // the surface closes so the agent finishes
                        // Cards 2 + 3.
                        advanceAfterCloseSale.current = true;
                      }}
                      onClose={() => {
                        setCloseSaleLead(null);
                        if (advanceAfterCloseSale.current) {
                          advanceAfterCloseSale.current = false;
                          advanceToNextQueueLead();
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Appointment picker for queue-side bookings (Chunk 4c).
            On save → auto-opens the confirmation drawer (Chunk 4e). */}
        {bookingForLead && (
          <AppointmentPicker
            user={user}
            leadId={bookingForLead.id}
            leadName={bookingForLead.name}
            onBooked={(appointmentId, scheduledAt) => {
              const lead = bookingForLead;
              setBookingForLead(null);
              setConfirmingLead({ lead, appointmentId, scheduledAt });
            }}
            onCancel={() => setBookingForLead(null)}
          />
        )}

        {/* Send-confirmation drawer for queue-side bookings (Chunk 4e). */}
        {confirmingLead && (
          <SendConfirmationDrawer
            user={user}
            appointmentId={confirmingLead.appointmentId}
            leadId={confirmingLead.lead.id}
            leadName={confirmingLead.lead.name}
            leadPhone={confirmingLead.lead.phone}
            leadState={null /* leads list doesn't denormalize state — agent picks in drawer */}
            scheduledAt={confirmingLead.scheduledAt}
            agentName={agentProfile.name || ''}
            agentBusinessCardBase64={agentProfile.businessCardBase64}
            licenses={agentProfile.licenses || {}}
            attachmentsSent={confirmingLead.lead.attachmentsSent}
            onSent={() => setConfirmingLead(null)}
            onCancel={() => setConfirmingLead(null)}
          />
        )}

        {/* Close Sale surface is rendered inside the right pane above
            so it can slide-belt with LeadDetailPanel (Add-Client-flow
            pattern), not floated over the page. */}

        {/* ── Add-Lead surface (slides in from the right) ── */}
        <div
          className={`absolute inset-x-0 top-0 ${SLIDE_TRANSITION}`}
          style={addFlowSurfaceStyle}
          aria-hidden={!addFlowOpen}
        >
          <div className={SURFACE_SHELL}>
            <div className={SURFACE_HEADER}>
              <div>
                <h3 className="text-xl font-bold text-[#000000]">Add Lead</h3>
                <p className="text-xs text-[#707070] mt-0.5">
                  Their app code is their phone number. Get name + phone on the call.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddFlow}
                disabled={creating}
                className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Lead name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
                  disabled={creating}
                  autoFocus={addFlowOpen}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#000000] mb-1">Phone</label>
                <input
                  type="tel"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
                  disabled={creating}
                />
                <p className="text-[11px] text-[#707070] mt-1">
                  Doubles as the lead&apos;s app code — &ldquo;your code is your phone number.&rdquo;
                </p>
              </div>
              {createError && (
                <p className="text-xs text-red-600">{createError}</p>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-[#ececec] bg-[#fafafa]">
              <button
                onClick={closeAddFlow}
                disabled={creating}
                className="flex-1 max-w-[180px] py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 max-w-[220px] py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
