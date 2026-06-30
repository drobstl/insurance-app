'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore';
import { PDFDocument } from 'pdf-lib';
import { db } from '../../../firebase';
import { useDashboard } from '../DashboardContext';
import AppointmentPicker from '../../../components/AppointmentPicker';
import SendConfirmationDrawer from '../../../components/SendConfirmationDrawer';
import LeadsPairPhoneBanner from '../../../components/LeadsPairPhoneBanner';
import FirstBookingPairCelebration from '../../../components/FirstBookingPairCelebration';
import LeadDetailPanel from '../../../components/LeadDetailPanel';
import { CloseSaleRitual, type CloseSaleLead } from '../../../components/CloseSaleRitual';
import LeadsCalendar from '../../../components/LeadsCalendar';
import { leadsAccessReason } from '../../../lib/tier-gating';
import UpgradeToProCard from '../../../components/UpgradeToProCard';
import {
  type AppointmentOutcomeChipStatus,
  getAppointmentOutcomeChip,
  getFifResetChip,
  isAppointmentOutcomeChipStatus,
} from '../../../lib/appointment-outcome-chip';
import type { LeadScore } from '../../../lib/lead-assessment';
import { LeadTempChip } from '../../../components/LeadTempChip';
import { LeadTagChips } from '../../../components/LeadTagChips';
import { LeadFilterBar } from '../../../components/LeadFilterBar';
import SavedLeadsBar from '../../../components/SavedLeadsBar';
import { type LeadFilters, EMPTY_LEAD_FILTERS, hasActiveFilters, coerceLeadFilters } from '../../../lib/lead-filters';
import { type SavedLeadSegment } from '../../../lib/lead-segment';
import { resolveLeadTags } from '../../../lib/lead-tag';
import { isFollowUpDue, followUpMillis, followUpChip } from '../../../lib/lead-follow-up';
import { isUsStateCode, US_STATE_NAMES } from '../../../lib/us-states';
import { parseLeadFile } from '../../../lib/lead-csv-parse';
import { captureEvent } from '../../../lib/posthog';
import { ANALYTICS_EVENTS } from '../../../lib/analytics-events';

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
  // Lead's age in years, populated by the PDF extractor on import. Sortable.
  ageYears?: number;
  createdAt?: Timestamp | null;
  appDownloadedAt?: string | null;
  assessmentCompletedAt?: Timestamp | null;
  leadScore?: LeadScore | null;
  convertedToClientId?: string | null;
  monthlyMortgageAmount?: number;
  notes?: string;
  tagIds?: string[];
  notesEntries?: Array<{ text?: string }>;
  followUpAt?: Timestamp | null;
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

type LeadView = 'all' | 'queue' | 'calendar';
type LeadSortKey = 'name' | 'createdAt' | 'source' | 'priority' | 'state' | 'temperature' | 'lastContacted' | 'followUpAt' | 'ageYears' | 'appDownloadedAt' | 'assessmentCompletedAt';
type SortDir = 'asc' | 'desc';

// Multi-page lead-form bundles route to the off-Vercel batch engine
// (leads-batch-processor GCF) instead of the synchronous /api/leads/upload
// path that 504'd on a 49-page bundle. A single-page PDF still takes the
// instant sync path (the close-of-sale ritual). Cap mirrors the
// create-batch route + the GCF's authoritative re-check.
const MAX_BATCH_PAGES = 100;

type LeadBatchLiveStatus =
  | 'splitting'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

// Shape the batch doc's `pages` map collapses into for the shared
// bulk-upload summary banner. Each page entry the GCF writes is
// { page, status, leadId?, leadCode?, name?, error? }.
interface LeadBatchPageDoc {
  page?: number;
  status?: 'pending' | 'succeeded' | 'failed' | 'duplicate';
  leadId?: string;
  leadCode?: string;
  name?: string;
  error?: string;
}

// Collapse the batch doc's per-page map into the {leads, duplicates,
// failed} shape the existing bulk-upload banner renders. The GCF doesn't
// store codeKind per page, so a created lead defaults to 'derived' (the
// "(random code)" hint just doesn't show for bulk pages — a minor loss).
function collapseBatchPages(pages: Record<string, LeadBatchPageDoc>): {
  leads: Array<{ leadId: string; leadCode: string; name: string; codeKind: 'derived' | 'fallback'; page: number }>;
  duplicates: Array<{ page: number; phone: string; name: string; existingLeadId: string; existingLeadCode: string; existingLeadName?: string }>;
  failed: Array<{ page: number; reason: string }>;
} {
  const leads: Array<{ leadId: string; leadCode: string; name: string; codeKind: 'derived' | 'fallback'; page: number }> = [];
  const duplicates: Array<{ page: number; phone: string; name: string; existingLeadId: string; existingLeadCode: string; existingLeadName?: string }> = [];
  const failed: Array<{ page: number; reason: string }> = [];

  for (const [key, entry] of Object.entries(pages || {})) {
    const page = typeof entry.page === 'number' ? entry.page : Number(key) || 0;
    if (entry.status === 'succeeded') {
      leads.push({ leadId: entry.leadId || '', leadCode: entry.leadCode || '', name: entry.name || '(no name)', codeKind: 'derived', page });
    } else if (entry.status === 'duplicate') {
      duplicates.push({ page, phone: '', name: entry.name || '', existingLeadId: entry.leadId || '', existingLeadCode: entry.leadCode || '' });
    } else if (entry.status === 'failed') {
      failed.push({ page, reason: entry.error || 'could not be read' });
    }
  }

  leads.sort((a, b) => a.page - b.page);
  duplicates.sort((a, b) => a.page - b.page);
  failed.sort((a, b) => a.page - b.page);
  return { leads, duplicates, failed };
}

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
// Three-axis gate: global LEAD_MODE_ENABLED + LEAD_MODE_ADMIN_ONLY
// (see web/lib/feature-flags.ts) + tier-based gating (Pro+ only;
// see web/lib/tier-gating.ts). Waits for both `user` and the
// agent profile to resolve before deciding so admins / Pro agents
// mid-auth-load aren't bounced. The inner component never mounts
// when access is denied so the leads Firestore listener also stays
// off. Belt-and-suspenders with the sidebar / mobile-nav gates in
// dashboard/layout.tsx.
//
// Three outcomes:
//   `'accessible'` → render the surface
//   `'env_off'`    → redirect to /dashboard (legacy behavior; lead
//                    mode globally disabled, surface doesn't exist
//                    for anyone)
//   `'tier_locked'`→ render UpgradeToProCard (the surface exists but
//                    this agent's tier doesn't qualify; surface the
//                    upgrade path instead of bouncing them).
export default function LeadsPage() {
  const router = useRouter();
  const { user, agentProfile, profileLoading } = useDashboard();
  const reason = leadsAccessReason(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt);

  useEffect(() => {
    if (!user) return;
    // Wait for the profile to load before deciding — otherwise an admin
    // mid-load would see `reason === 'tier_locked'` for a beat and we'd
    // briefly flash the upgrade card.
    if (profileLoading) return;
    if (reason === 'env_off') router.replace('/dashboard');
  }, [user, profileLoading, reason, router]);

  if (!user || profileLoading) return null;
  if (reason === 'env_off') return null;
  if (reason === 'tier_locked') {
    return <UpgradeToProCard surface="leads" />;
  }

  return <LeadsPageInner />;
}

function LeadsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, agentProfile, isAdmin, saveLeadSegment, deleteLeadSegment } = useDashboard();

  // Right-pane selection (desktop call-queue view only). The URL param
  // is the source of truth so refresh + back/forward + shareable links
  // all work. `?leadId=ID` selects a lead into the right pane; when
  // missing on the queue view, the auto-select effect below fills it
  // with queueLeads[0] (top of the dial queue).
  const urlSelectedLeadId = searchParams?.get('leadId') ?? null;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<LeadView>('all');
  // IA v2 (dark-launch): admins always; everyone else when
  // NEXT_PUBLIC_IA_V2=on. Folds Call queue into a "Call mode" button here
  // and (in the dashboard sidebar) promotes Calendar + regroups nav.
  // Off → today's segmented control + flat sidebar render unchanged.
  const iaEnabled = isAdmin || process.env.NEXT_PUBLIC_IA_V2 === 'on';

  // Deep link: /dashboard/leads?call=1 drops straight into Call mode —
  // used by the Calendar route's "Go to call queue" action. Consume the
  // param after applying so it can't re-trigger on later URL changes
  // (e.g. the `?leadId=` updates the dialer makes while advancing).
  useEffect(() => {
    if (searchParams?.get('call') !== '1') return;
    setView('queue');
    // queue_count omitted — leads are usually still loading when the
    // deep link is consumed, so a count here would read as 0.
    captureEvent(ANALYTICS_EVENTS.CALL_MODE_STARTED, { entry: 'deep_link' });
    const params = new URLSearchParams(searchParams.toString());
    params.delete('call');
    const qs = params.toString();
    router.replace(qs ? `/dashboard/leads?${qs}` : '/dashboard/leads', { scroll: false });
  }, [searchParams, router]);

  // Deep link: /dashboard/leads?view=calendar reopens the Calendar tab —
  // used when returning from the Google Calendar OAuth round-trip that was
  // started on that tab. Consume `view` but leave any `google_calendar`
  // result param for LeadsCalendar to surface once it mounts.
  useEffect(() => {
    if (searchParams?.get('view') !== 'calendar') return;
    setView('calendar');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('view');
    const qs = params.toString();
    router.replace(qs ? `/dashboard/leads?${qs}` : '/dashboard/leads', { scroll: false });
  }, [searchParams, router]);

  // ── Search + sort (All view only) ──
  // Queue has its own priority sort that we don't override. Search +
  // explicit sort are All-leads concerns — agent scanning the full
  // book to find a specific lead or order by source/state/date.
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<LeadSortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_LEAD_FILTERS);

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
    // 'pdf' → each unit is a PDF page; 'csv' → each unit is a spreadsheet
    // row. Drives page/row wording in the summary banner. Defaults to
    // 'pdf' when absent so the existing PDF flows render unchanged.
    source?: 'pdf' | 'csv';
    pageCount: number;
    leads: Array<{ leadId: string; leadCode: string; name: string; codeKind: 'derived' | 'fallback'; page: number }>;
    duplicates: Array<{ page: number; phone: string; name: string; existingLeadId: string; existingLeadCode: string; existingLeadName?: string }>;
    updated?: Array<{ page: number; name: string; existingLeadId: string; existingLeadName?: string; changed: boolean }>;
    failed: Array<{ page: number; reason: string }>;
  } | null>(null);

  // Manual-create + single-page upload also surface duplicates via the
  // same bulkUpload banner — we just synthesize a 1-page bundle so the
  // single "Already imported as L-XYZ" row reuses the same UI.

  // PDF upload state (Chunk 2)
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  // Import consent gate: the agent must confirm they have the right to use the
  // data they're uploading before any bulk import runs. Reinforces the "your
  // book / your data" posture and the rights representation (see /trust).
  const [importConsent, setImportConsent] = useState(false);
  // Hold-the-file: if a file is dropped/picked before consent is given, we
  // stash it here instead of throwing it away. Ticking the consent box then
  // auto-starts this file, so the agent never has to re-select after
  // confirming (the old behavior forced a full restart).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // The consent box lives in the drop-zone card up top. The empty-state
  // upload button sits far below it, so when a file is stashed from there we
  // scroll this into view — otherwise the nudge appears off-screen and the
  // upload looks like it silently did nothing.
  const consentBoxRef = useRef<HTMLDivElement | null>(null);

  // Multi-page batch import (off-Vercel via the leads-batch-processor GCF).
  // `watchedBatchId` drives the live onSnapshot subscription below;
  // `batchProgress` holds the live counters for the in-flight banner. On a
  // terminal status the snapshot handler collapses the batch into the same
  // `bulkUpload` summary the synchronous + CSV paths use.
  const [watchedBatchId, setWatchedBatchId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    status: LeadBatchLiveStatus;
    fileName: string;
    totalPages: number;
    completedPages: number;
    failedPages: number;
    duplicatePages: number;
  } | null>(null);
  const [cancellingBatch, setCancellingBatch] = useState(false);

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

  // ── Live multi-page batch progress ──
  // While a multi-page bundle is processing in the GCF, watch its tracking
  // doc for live counters. On a terminal status, collapse the per-page
  // results into the shared bulk-upload summary banner (or surface an
  // error when the whole batch failed before any page committed), then
  // stop watching.
  useEffect(() => {
    if (!user || !watchedBatchId) return;
    const ref = doc(db, 'agents', user.uid, 'leadBatches', watchedBatchId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as {
        status?: LeadBatchLiveStatus;
        fileName?: string;
        totalPages?: number;
        completedPages?: number;
        failedPages?: number;
        duplicatePages?: number;
        error?: string;
        pages?: Record<string, LeadBatchPageDoc>;
      };
      const status = data.status || 'processing';

      setBatchProgress({
        status,
        fileName: data.fileName || 'lead-forms.pdf',
        totalPages: data.totalPages || 0,
        completedPages: data.completedPages || 0,
        failedPages: data.failedPages || 0,
        duplicatePages: data.duplicatePages || 0,
      });

      const terminal = status === 'completed' || status === 'partial' || status === 'failed' || status === 'cancelled';
      if (!terminal) return;

      const pages = data.pages || {};
      const hasPages = Object.keys(pages).length > 0;
      if (status === 'failed' && !hasPages) {
        // Whole-batch failure before any page committed (bad PDF, download
        // error, over the page cap) — show the reason, no summary.
        setUploadError(data.error || 'Import failed — please try again.');
      } else {
        const { leads, duplicates, failed } = collapseBatchPages(pages);
        setBulkUpload({
          source: 'pdf',
          pageCount: data.totalPages || leads.length + duplicates.length + failed.length,
          leads,
          duplicates,
          failed,
        });
        setJustCreated(null);
      }

      setBatchProgress(null);
      setCancellingBatch(false);
      setWatchedBatchId(null); // cleanup unsub fires via effect teardown
    }, (err) => {
      console.error('leadBatch onSnapshot error:', err);
    });
    return () => unsub();
  }, [user, watchedBatchId]);

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

  // ── Past-appointment outcome map (leadId → most recent terminal appt) ──
  // Powers the "Thinking · May 18" / "No-show · May 18" / etc. chip on
  // lead rows when there's no upcoming appointment. Same single-field
  // inequality pattern as the upcoming subscription so it reuses the
  // default scheduledAt index. Status filter in memory. Bounded to one
  // year back to cap the initial document read for high-volume agents.
  const [pastOutcomeByLead, setPastOutcomeByLead] = useState<
    Map<string, { scheduledAt: Date; tz?: string; status: AppointmentOutcomeChipStatus }>
  >(new Map());
  // FIF reset is orthogonal to the terminal-outcome chip above (it can
  // ride on a sold/`completed` appt too), so it gets its own per-lead map
  // derived from the same past-appointments snapshot.
  const [fifResetByLead, setFifResetByLead] = useState<Map<string, { smeName?: string }>>(new Map());
  useEffect(() => {
    if (!user) return;
    const nowTs = Timestamp.fromMillis(Date.now());
    const oneYearAgoTs = Timestamp.fromMillis(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'agents', user.uid, 'appointments'),
      where('scheduledAt', '>=', oneYearAgoTs),
      where('scheduledAt', '<', nowTs),
      orderBy('scheduledAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const map = new Map<string, { scheduledAt: Date; tz?: string; status: AppointmentOutcomeChipStatus }>();
      const fifMap = new Map<string, { smeName?: string }>();
      for (const d of snap.docs) {
        const data = d.data() as { leadId?: string; scheduledAt?: Timestamp; scheduledAtTimeZone?: string; status?: string; fifResetBooked?: boolean; fifResetSmeName?: string | null };
        if (!data.leadId || !data.scheduledAt) continue;
        // FIF reset — checked before the outcome-status filter because it's
        // orthogonal (can sit on a completed/sold appt). First hit wins
        // (query is desc) = the lead's most recent reset.
        if (data.fifResetBooked === true && !fifMap.has(data.leadId)) {
          fifMap.set(data.leadId, { smeName: data.fifResetSmeName ?? undefined });
        }
        if (!isAppointmentOutcomeChipStatus(data.status)) continue;
        // First hit wins because query is sorted descending — that's the
        // *most recent* past appointment for the lead.
        if (!map.has(data.leadId)) {
          map.set(data.leadId, {
            scheduledAt: data.scheduledAt.toDate(),
            tz: data.scheduledAtTimeZone,
            status: data.status,
          });
        }
      }
      setPastOutcomeByLead(map);
      setFifResetByLead(fifMap);
    }, (err) => {
      console.error('past-appointments onSnapshot error:', err);
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

  // ── Single-page PDF upload (close-of-sale ritual) ──
  // The instant synchronous path: one Mail-In / Call-In / Digital form →
  // extract + commit inline → derived-code banner. Unchanged from before;
  // only the multi-page case was split out to the batch engine below.
  const uploadSinglePdf = useCallback(async (file: File) => {
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
        // Defensive: a PDF we read as single-page locally but the server
        // split into several (e.g. our client parse undercounted). Show
        // the summary banner just like the batch path's final state.
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

  // ── Multi-page bundle → off-Vercel batch engine ──
  // Uploads the (potentially 40MB+) PDF straight to GCS via a signed URL —
  // keeping the bytes off the Vercel function — then creates the tracking
  // doc, which fires the leads-batch-processor GCF. We hand control to the
  // live progress banner (onSnapshot) and don't block on extraction.
  const uploadLeadBatch = useCallback(async (file: File, pageCount: number) => {
    if (!user) return;
    if (pageCount > MAX_BATCH_PAGES) {
      setUploadError(`This bundle has ${pageCount} pages. Please split it into uploads of ${MAX_BATCH_PAGES} pages or fewer.`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const token = await user.getIdToken();
      const contentType = file.type || 'application/pdf';

      const urlRes = await fetch('/api/leads/batch/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileName: file.name, contentType, fileSize: file.size }),
      });
      const urlData = await urlRes.json().catch(() => ({}));
      if (!urlRes.ok || !urlData.uploadUrl) {
        setUploadError(urlData?.error || `Upload failed (${urlRes.status})`);
        return;
      }

      const putRes = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!putRes.ok) {
        setUploadError(`Upload to storage failed (${putRes.status}) — please try again.`);
        return;
      }

      const createRes = await fetch('/api/leads/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gcsPath: urlData.gcsPath, fileName: file.name, pageCount }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createData.batchId) {
        setUploadError(createData?.error || `Import failed (${createRes.status})`);
        return;
      }

      // Hand off to the live progress banner. The heavy extraction runs in
      // the GCF; the agent can keep working while pages stream in.
      setBulkUpload(null);
      setJustCreated(null);
      setBatchProgress({
        status: 'splitting',
        fileName: file.name,
        totalPages: pageCount,
        completedPages: 0,
        failedPages: 0,
        duplicatePages: 0,
      });
      setWatchedBatchId(createData.batchId);
    } catch (err) {
      console.error('batch upload error:', err);
      setUploadError('Network error — please try again');
    } finally {
      setUploading(false);
    }
  }, [user]);

  // ── PDF upload router (Mail-In / Call-In / Digital) ──
  // Counts pages locally (pdf-lib, no render) to pick the path: a single
  // page stays on the instant synchronous route; 2+ pages route to the
  // batch engine so a big onboarding bundle never blocks (or 504s) a
  // request. An unreadable file falls through to the sync route, which
  // returns a clean validation error.
  const handleUpload = useCallback(async (file: File) => {
    if (!user) return;
    // Flip to the busy state immediately so the drop zone doesn't flash
    // idle during the local page-count parse of a large bundle.
    setUploading(true);
    setUploadError(null);
    let pageCount = 1;
    try {
      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      pageCount = pdf.getPageCount();
    } catch {
      pageCount = 1;
    }
    if (pageCount <= 1) {
      await uploadSinglePdf(file);
    } else {
      await uploadLeadBatch(file, pageCount);
    }
  }, [user, uploadSinglePdf, uploadLeadBatch]);

  // ── Cancel an in-flight batch ──
  // Pages already committed stay as leads; the GCF stops before the next
  // chunk once it sees the cancel. The onSnapshot handler collapses the
  // partial results into the summary banner when the doc goes terminal.
  const cancelBatch = useCallback(async () => {
    if (!user || !watchedBatchId) return;
    setCancellingBatch(true);
    try {
      const token = await user.getIdToken();
      await fetch(`/api/leads/batch/${watchedBatchId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Don't tear down the watcher here — let the snapshot deliver the
      // terminal 'cancelled' state so committed pages still surface.
    } catch (err) {
      console.error('cancel batch error:', err);
      setCancellingBatch(false);
    }
  }, [user, watchedBatchId]);

  // ── CSV / Excel lead-list import ──
  // Parses the file in the browser (lib/lead-csv-parse), then POSTs rows
  // to /api/leads/import-batch in chunks of 50, merging the per-chunk
  // results into the shared bulk-upload banner. Row numbers are offset
  // back to the file-global row for display.
  const handleCsvImport = useCallback(async (file: File) => {
    if (!user) return;
    setUploading(true);
    setUploadError(null);
    try {
      const parsed = await parseLeadFile(file);
      if (parsed.error) {
        setUploadError(parsed.error);
        return;
      }
      if (parsed.rows.length === 0) {
        setUploadError('No leads found — every row was missing a name. Make sure the file has a Name (or First/Last Name) column.');
        return;
      }

      const token = await user.getIdToken();
      const CHUNK = 50;
      const leads: Array<{ leadId: string; leadCode: string; name: string; codeKind: 'derived' | 'fallback'; page: number }> = [];
      const duplicates: Array<{ page: number; phone: string; name: string; existingLeadId: string; existingLeadCode: string; existingLeadName?: string }> = [];
      const updated: Array<{ page: number; name: string; existingLeadId: string; existingLeadName?: string; changed: boolean }> = [];
      const failed: Array<{ page: number; reason: string }> = [];

      for (let start = 0; start < parsed.rows.length; start += CHUNK) {
        const chunk = parsed.rows.slice(start, start + CHUNK);
        const res = await fetch('/api/leads/import-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          // A phone match on re-import refreshes the existing lead in place
          // (keeping its appointments + history) when the names confirm it's
          // the same person — handled server-side, no flag needed.
          body: JSON.stringify({ rows: chunk }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setUploadError(data?.error || `Import failed (${res.status})`);
          return;
        }
        for (const c of (data.created || [])) {
          leads.push({ leadId: c.leadId, leadCode: c.leadCode, name: c.name, codeKind: c.codeKind || 'fallback', page: start + c.row });
        }
        for (const d of (data.duplicates || [])) {
          duplicates.push({ page: start + d.row, phone: d.phone || '', name: d.name || '', existingLeadId: d.existingLeadId, existingLeadCode: d.existingLeadCode, existingLeadName: d.existingLeadName });
        }
        for (const u of (data.updated || [])) {
          updated.push({ page: start + u.row, name: u.name || '', existingLeadId: u.existingLeadId, existingLeadName: u.existingLeadName, changed: !!u.changed });
        }
        for (const f of (data.failed || [])) {
          failed.push({ page: start + f.row, reason: f.reason || 'could not import' });
        }
      }

      setBulkUpload({ source: 'csv', pageCount: parsed.rows.length, leads, duplicates, updated, failed });
      setJustCreated(null);
    } catch (err) {
      console.error('csv import error:', err);
      setUploadError('Network error — please try again');
    } finally {
      setUploading(false);
    }
  }, [user]);

  // Dispatch a dropped/selected file to the PDF extractor or the CSV/Excel
  // importer based on type.
  const handleLeadFileSelect = useCallback((file: File) => {
    const name = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
    if (isPdf) {
      void handleUpload(file);
    } else {
      void handleCsvImport(file);
    }
  }, [handleUpload, handleCsvImport]);

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
  // Filters: drop converted, booked, not-interested, wrong-number,
  // do-not-call leads.
  // Sort tiers (top → bottom):
  //   1. Persistence hold — a no-answer lead the agent dialed this
  //      session that hasn't hit the dial-persistence threshold yet,
  //      so the next dial stays on the same lead.
  //   2. Never dialed, newer first (fresh leads outrank stale ones).
  //   3. Dialed, oldest-last-call first. No per-outcome weighting —
  //      the agent cycles through and comes back around naturally.
  // Distinct USPS states present in the loaded leads — powers the State
  // filter dropdown. Recomputed only when the lead set changes.
  const availableStates = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const lead of leads) {
      const s = lead.address?.state?.trim().toUpperCase();
      if (s) set.add(s);
    }
    return [...set].sort();
  }, [leads]);

  // ── Filtered + sorted All-leads view ──
  // Filters (status / tag / state / date) → search → sort, all client-side
  // over the already-loaded leads (no Firestore index). Status no-show /
  // booked / thinking / no-sale read from the same nextApptByLead /
  // pastOutcomeByLead maps the row chips use. Search covers name / phone /
  // code / form / email / state / city / notes / tag labels.
  const filteredLeads = useMemo<Lead[]>(() => {
    let result = leads;
    const tempRank = (t?: string | null) => (t === 'hot' ? 3 : t === 'warm' ? 2 : t === 'cool' ? 1 : 0);

    if (filters.statuses.length) {
      result = result.filter((lead) => {
        const past = pastOutcomeByLead.get(lead.id)?.status;
        const booked = nextApptByLead.has(lead.id);
        return filters.statuses.some((s) => {
          switch (s) {
            case 'converted': return !!lead.convertedToClientId;
            case 'booked': return booked;
            case 'no_show': return past === 'no_show';
            case 'thinking': return past === 'sit_think_about_it';
            case 'no_sale': return past === 'sit_no_sale';
            case 'callback': return lead.lastDialOutcome === 'callback_requested';
            case 'not_interested': return lead.lastDialOutcome === 'not_interested';
            case 'new': return !lead.lastDialAt && !booked && !past && !lead.convertedToClientId;
            default: return false;
          }
        });
      });
    }
    if (filters.tagIds.length) {
      result = result.filter((lead) => filters.tagIds.every((id) => (lead.tagIds ?? []).includes(id)));
    }
    if (filters.state) {
      result = result.filter((lead) => (lead.address?.state ?? '').toUpperCase() === filters.state);
    }
    if (filters.dateFrom || filters.dateTo) {
      const fromMs = filters.dateFrom ? Date.parse(`${filters.dateFrom}T00:00:00`) : -Infinity;
      const toMs = filters.dateTo ? Date.parse(`${filters.dateTo}T23:59:59`) : Infinity;
      result = result.filter((lead) => {
        const t = lead.createdAt?.toDate().getTime();
        return t != null && t >= fromMs && t <= toMs;
      });
    }
    if (filters.followUpDue) {
      result = result.filter((lead) => isFollowUpDue(lead.followUpAt));
    }

    // Multi-word AND: every whitespace-separated term must match SOME field
    // (so "texas hot" = leads in TX that are also hot). The 2-letter state
    // code is expanded to its full name (TX → "Texas") so a typed-out state
    // matches, and temperature ('hot'/'warm'/'cool') is searchable.
    const terms = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      const tagDefs = agentProfile.leadTags ?? [];
      result = result.filter((lead) => {
        const stateCode = (lead.address?.state ?? '').toUpperCase();
        const stateName = isUsStateCode(stateCode) ? US_STATE_NAMES[stateCode] : '';
        const haystack = [
          lead.name,
          lead.phone,
          lead.leadCode,
          lead.formType,
          lead.email,
          lead.address?.state,
          stateName,
          lead.address?.city,
          lead.notes,
          lead.leadScore?.temperature,
          ...(lead.notesEntries ?? []).map((e) => e.text),
          ...resolveLeadTags(lead.tagIds, tagDefs).map((t) => t.label),
        ]
          .filter((f): f is string => typeof f === 'string')
          .map((f) => f.toLowerCase());
        return terms.every((term) => haystack.some((f) => f.includes(term)));
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
      } else if (sortKey === 'state') {
        cmp = (a.address?.state || '').localeCompare(b.address?.state || '');
      } else if (sortKey === 'temperature') {
        cmp = tempRank(a.leadScore?.temperature) - tempRank(b.leadScore?.temperature);
      } else if (sortKey === 'lastContacted') {
        const aT = a.lastDialAt?.toDate().getTime() ?? 0;
        const bT = b.lastDialAt?.toDate().getTime() ?? 0;
        cmp = aT - bT;
      } else if (sortKey === 'followUpAt') {
        const aT = followUpMillis(a.followUpAt) ?? Number.POSITIVE_INFINITY;
        const bT = followUpMillis(b.followUpAt) ?? Number.POSITIVE_INFINITY;
        cmp = aT - bT;
      } else if (sortKey === 'ageYears') {
        const aA = a.ageYears ?? Number.NEGATIVE_INFINITY;
        const bA = b.ageYears ?? Number.NEGATIVE_INFINITY;
        cmp = aA - bA;
      } else if (sortKey === 'appDownloadedAt') {
        const aT = a.appDownloadedAt ? Date.parse(a.appDownloadedAt) : 0;
        const bT = b.appDownloadedAt ? Date.parse(b.appDownloadedAt) : 0;
        cmp = aT - bT;
      } else if (sortKey === 'assessmentCompletedAt') {
        const aT = a.assessmentCompletedAt?.toDate().getTime() ?? 0;
        const bT = b.assessmentCompletedAt?.toDate().getTime() ?? 0;
        cmp = aT - bT;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [leads, filters, searchQuery, sortKey, sortDir, nextApptByLead, pastOutcomeByLead, agentProfile.leadTags]);

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

  // ── Saved lists ("segments") ──
  // Apply re-applies a saved snapshot to the All-leads view in one shot.
  // coerceLeadFilters defends against a stale/malformed stored filter.
  const applySegment = useCallback((seg: SavedLeadSegment) => {
    setFilters(coerceLeadFilters(seg.filters));
    setSearchQuery(seg.searchQuery);
    setSortKey(seg.sortKey as LeadSortKey);
    setSortDir(seg.sortDir);
  }, []);

  const handleSaveSegment = useCallback(
    (name: string) =>
      saveLeadSegment({ name, filters, searchQuery, sortKey, sortDir }),
    [saveLeadSegment, filters, searchQuery, sortKey, sortDir],
  );

  // Worth saving only when the view differs from the default (some search,
  // some active filter, or a non-default sort — but not the Call-next preview).
  const canSaveSegment =
    !!searchQuery.trim() ||
    hasActiveFilters(filters) ||
    (sortKey !== 'createdAt' && sortKey !== 'priority') ||
    (sortKey === 'createdAt' && sortDir !== 'desc');

  // Per-lead dial-session counter. Drives the dial-persistence setting
  // (1/2/3 attempts before auto-advance). Incremented every time the
  // desktop Call button fires on a lead. Cleared when the queue
  // advances off that lead OR when a terminal outcome (booked /
  // not_interested / wrong_number / do_not_call / callback_requested)
  // is chipped. In-memory only — session-scoped, no Firestore mirror.
  //
  // MUST be declared above `queueLeads` because the useMemo factory
  // reads `dialAttemptsForLeadRef.current` synchronously during render
  // (for the persistence-hold scoring branch). A `const` binding below
  // that read would put the ref in the temporal dead zone on first
  // render and throw `ReferenceError: Cannot access
  // 'dialAttemptsForLeadRef' before initialization`, which is what
  // happened in 16df33a and broke the entire leads page.
  const dialAttemptsForLeadRef = useRef<Map<string, number>>(new Map());

  const queueLeads = useMemo<Lead[]>(() => {
    const persistence = agentProfile.dialPersistence ?? 1;

    // Scope the dial queue to the agent's current filtered list (search +
    // filters + applied saved list). When nothing is filtered, filteredLeads
    // is the whole book, so this set contains every lead and the intersection
    // is a no-op — the queue only narrows when a list/filter is active. The
    // queue keeps its OWN call-order (never-dialed → oldest-call) over that
    // subset; the segment's sort only orders the All-leads view, not dialing.
    const inScope = new Set(filteredLeads.map((l) => l.id));

    type Scored = { lead: Lead; score: number };
    const scored: Scored[] = [];

    for (const lead of leads) {
      if (!inScope.has(lead.id)) continue;
      if (lead.convertedToClientId) continue;
      const out = lead.lastDialOutcome;
      // Keep worked-but-unresolved leads callable: if the lead's most recent
      // PAST appointment was a no-show / cancel / sat-no-sale / thinking (it's
      // in pastOutcomeByLead) and there's no upcoming appointment, surface it
      // for follow-up even though its last dial was 'booked' (which normally
      // drops it from the queue). Rebooked leads (in nextApptByLead) stay out.
      const needsFollowUp = pastOutcomeByLead.has(lead.id) && !nextApptByLead.has(lead.id);
      if (out === 'not_interested' || out === 'wrong_number' || out === 'do_not_call') continue;
      if (out === 'booked' && !needsFollowUp) continue;

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
  }, [leads, filteredLeads, agentProfile.dialPersistence, pastOutcomeByLead, nextApptByLead]);

  // True when an active search/filter/saved-list is scoping the dial queue to
  // a subset of the book (drives the "calling your filtered list" indicator).
  const queueScoped = hasActiveFilters(filters) || !!searchQuery.trim();

  // "Call next" sort for the All list reuses the exact queue priority
  // order, so the list previews who Start-calling will dial first.
  // Declared AFTER queueLeads to dodge the temporal-dead-zone trap the
  // dialAttemptsForLeadRef note above warns about. Leads not in the queue
  // (converted / booked / not-interested / wrong-number / DNC) sink last.
  const displayLeads = useMemo<Lead[]>(() => {
    if (sortKey !== 'priority') return filteredLeads;
    const order = new Map(queueLeads.map((l, i) => [l.id, i] as const));
    return [...filteredLeads].sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [filteredLeads, queueLeads, sortKey]);

  // ── Funnel: list viewed ──
  // Once per visit, after the first snapshot lands so the counts are
  // real. capture_pageview is off in lib/posthog.ts, so this is the
  // funnel's entry event, not a duplicate of an autocaptured pageview.
  // Declared below queueLeads — the deps array reads it during render
  // (same TDZ trap the dialAttemptsForLeadRef note above warns about).
  const trackedListViewRef = useRef(false);
  useEffect(() => {
    if (loading || trackedListViewRef.current) return;
    trackedListViewRef.current = true;
    captureEvent(ANALYTICS_EVENTS.LEAD_LIST_VIEWED, {
      lead_count: leads.length,
      queue_count: queueLeads.length,
    });
  }, [loading, leads.length, queueLeads.length]);

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
    captureEvent(ANALYTICS_EVENTS.LEAD_OPENED, { lead_id: leadId, source: 'call_mode_list' });
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

  const handleQueueCall = useCallback((lead: Lead, phoneOverride?: string) => {
    // Hard-stop on do-not-call leads. The queue filter already drops
    // them from the queue, but they can still appear in the All tab —
    // make sure a stray click doesn't dial them.
    if (lead.lastDialOutcome === 'do_not_call') return;
    const target = phoneOverride || pickQueueDialNumber(lead);
    const digits = target.replace(/\D/g, '');
    if (digits.length < 7) return;
    // Funnel: one event per dial fired from a queue row. Desktop hands
    // the actual tel: off to LeadDetailPanel (pendingDial) — that path
    // is counted HERE, not in the panel, to avoid double-counting.
    captureEvent(ANALYTICS_EVENTS.LEAD_CALL_INITIATED, {
      lead_id: lead.id,
      source: 'queue_row',
      dial_count_before: lead.dialLog?.length ?? 0,
    });
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
  // First-booking pairing celebration: a one-time joyful nudge shown after an
  // unpaired agent books a sit-down. We capture the lead's first name when the
  // booking lands (confirmingLead goes non-null) but only REVEAL it once the
  // confirmation drawer closes, so the celebration never stacks on the drawer.
  // Gated to unpaired + text-channel agents, once per agent (per-uid flag).
  const [pairCelebrationName, setPairCelebrationName] = useState<string | null>(null);
  const pendingPairCelebrationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!confirmingLead || !user) return;
    if (agentProfile.phonePaired || agentProfile.confirmationChannel === 'email') return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(`pair-celebration-shown-${user.uid}`) === 'true') return;
    pendingPairCelebrationRef.current =
      (confirmingLead.lead.name || '').trim().split(/\s+/)[0] || 'your lead';
  }, [confirmingLead, user, agentProfile.phonePaired, agentProfile.confirmationChannel]);

  // Reveal the celebration (if one is pending) after the drawer closes, and
  // stamp the per-agent flag so it only ever fires once.
  const revealPairCelebration = useCallback(() => {
    const name = pendingPairCelebrationRef.current;
    if (!name) return;
    pendingPairCelebrationRef.current = null;
    if (user && typeof window !== 'undefined') {
      window.localStorage.setItem(`pair-celebration-shown-${user.uid}`, 'true');
    }
    setPairCelebrationName(name);
  }, [user]);
  // Close Sale ritual state — modal hosted at the page level so it
  // survives the LeadDetailPanel re-mount that Card 1's convert
  // triggers (snapshot drops the converted lead from queueLeads →
  // effectiveSelectedLeadId shifts → panel key flips → panel
  // unmounts). `closeSaleLead` holds the lead the ritual was opened
  // for; `advanceAfterCloseSale` records whether Card 1 actually
  // converted so onClose can fire the queue advance only when the
  // agent finished a real conversion (vs. closed the modal having
  // done nothing).
  const [closeSaleLead, setCloseSaleLead] = useState<CloseSaleLead | null>(null);
  const advanceAfterCloseSale = useRef(false);

  // `outcome` is the literal union (not string) so the funnel event
  // below typechecks against call_outcome_recorded's outcome enum —
  // the early 'booked' return narrows it to the six POSTable values.
  const handleQueueLogOutcome = useCallback(async (leadId: string, outcome: NonNullable<Lead['lastDialOutcome']>) => {
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
      captureEvent(ANALYTICS_EVENTS.CALL_OUTCOME_RECORDED, {
        lead_id: leadId,
        outcome,
        source: 'queue_inline',
      });
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
          {/* Pair-phone banner — only on the main list view so Call mode /
              Calendar stay focused. Self-gates on unpaired + text channel,
              and vanishes for good once the phone is paired. */}
          {view === 'all' && <LeadsPairPhoneBanner />}
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
                  accept="application/pdf,.pdf,.csv,.tsv,.xlsx,.xls,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (!importConsent) {
                        // Hold it — don't make them re-pick. Auto-runs on consent.
                        setPendingFile(file);
                        setUploadError(null);
                        e.target.value = '';
                        return;
                      }
                      handleLeadFileSelect(file);
                      e.target.value = '';
                    }
                  }}
                />
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {uploading ? 'Reading…' : 'Upload Leads'}
              </label>
              {/* Pinned pairing door — always present (survives the banner's
                  dismissal) until the phone is paired; hidden for agents who
                  send confirmations by email and don't need a phone. The soft
                  pulse-dot draws the eye without shouting. */}
              {!agentProfile.phonePaired && agentProfile.confirmationChannel !== 'email' && (
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/pair-phone')}
                  title={agentProfile.pushRevoked
                    ? 'Your phone dropped off — reconnect to get booking alerts back'
                    : 'Set up your phone to send booking confirmations in two taps'}
                  className="relative px-4 py-2.5 bg-white text-[#0D4D4D] font-semibold rounded-lg border-2 border-[#0D4D4D] border-r-[3px] border-b-[3px] transition-colors hover:bg-[#f4f9f9] flex items-center gap-2 text-sm"
                >
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#3DD6C3] animate-pulse" />
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  {agentProfile.pushRevoked ? 'Reconnect phone' : 'Set up phone'}
                </button>
              )}
            </div>
          </div>

          {/* Tab switcher: All vs Call queue. The queue prioritizes
              never-dialed first, then by elapsed-time-since-last-attempt
              with outcome-specific cooldowns. Designed for sit-down
              dialing sessions: open queue, dial top of list, log
              outcome, queue auto-resorts. */}
          {iaEnabled ? (
            /* IA v2 — Leads is ONE list. "Call queue" becomes a Call mode
               you enter with the Start-calling button; Calendar lives in
               the sidebar (kept here only as a mobile button since phones
               have no sidebar). The two-pane dialer below is unchanged. */
            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
              {view === 'queue' ? (
                <>
                  <button
                    onClick={() => setView('all')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg bg-[#EFEFEF] text-[#005851] hover:bg-[#e3e3e3] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Done
                  </button>
                  <span className="text-sm font-semibold text-[#005851]">
                    Calling · <span className="text-[#44bbaa]">{queueLeads.length}</span> in queue
                  </span>
                  {queueScoped && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#daf3f0] text-[#005851] text-xs font-semibold border border-[#44bbaa]">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                      </svg>
                      your filtered list
                    </span>
                  )}
                </>
              ) : view === 'calendar' ? (
                <button
                  onClick={() => setView('all')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg bg-[#EFEFEF] text-[#005851] hover:bg-[#e3e3e3] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to leads
                </button>
              ) : (
                <>
                  {/* Search + Call-next sort */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative w-full max-w-xs">
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
                    {/* Call-next sort — reuses the exact priority order that
                        Start-calling dials. Desktop only; the table it
                        reorders is itself md-only. Toggles back to Created. */}
                    <button
                      type="button"
                      onClick={() => {
                        if (sortKey === 'priority') { setSortKey('createdAt'); setSortDir('desc'); }
                        else { setSortKey('priority'); setSortDir('asc'); }
                      }}
                      className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                        sortKey === 'priority'
                          ? 'bg-[#daf3f0] border-[#44bbaa] text-[#005851]'
                          : 'bg-white border-[#d0d0d0] text-[#707070] hover:text-[#005851]'
                      }`}
                      title="Sort by who to call next"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4-2l4 4-4 4" />
                      </svg>
                      Call next
                    </button>
                  </div>
                  {/* Calendar (mobile only — sidebar hosts it on desktop) +
                      Start calling (enter the prioritized dialer). */}
                  <div className="flex items-center gap-2">
                    {iaEnabled && (
                      <button
                        onClick={() => setView('calendar')}
                        className="md:hidden inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-[#EFEFEF] text-[#005851] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px]"
                        aria-label="Open calendar"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Calendar
                      </button>
                    )}
                    <button
                      onClick={() => {
                        captureEvent(ANALYTICS_EVENTS.CALL_MODE_STARTED, {
                          entry: 'start_calling',
                          queue_count: queueLeads.length,
                          scoped: queueScoped,
                        });
                        setView('queue');
                      }}
                      disabled={queueLeads.length === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg bg-[#44bbaa] text-white hover:bg-[#3aa996] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Start calling
                      <span className="text-xs font-semibold text-white/80">{queueLeads.length}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            {/* Segmented control — reads as "switch your view" far more
                clearly than underline tabs, and makes Calendar easy to spot. */}
            <div className="inline-flex items-center gap-1 p-1 bg-[#EFEFEF] rounded-xl border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px]">
              <button
                onClick={() => setView('all')}
                className={`px-3.5 py-1.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  view === 'all' ? 'bg-[#44bbaa] text-white' : 'text-[#707070] hover:text-[#005851]'
                }`}
              >
                All leads
                <span className={`text-xs font-normal ${view === 'all' ? 'text-white/80' : 'text-[#9CA3AF]'}`}>
                  {view === 'all' && (searchQuery.trim() || hasActiveFilters(filters)) ? `${filteredLeads.length} / ${leads.length}` : leads.length}
                </span>
              </button>
              <button
                onClick={() => {
                  // Guard: re-clicking the active segment isn't an entry.
                  if (view !== 'queue') {
                    captureEvent(ANALYTICS_EVENTS.CALL_MODE_STARTED, {
                      entry: 'call_queue_tab',
                      queue_count: queueLeads.length,
                      scoped: queueScoped,
                    });
                  }
                  setView('queue');
                }}
                className={`px-3.5 py-1.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  view === 'queue' ? 'bg-[#44bbaa] text-white' : 'text-[#707070] hover:text-[#005851]'
                }`}
              >
                Call queue
                <span className={`text-xs font-normal ${view === 'queue' ? 'text-white/80' : 'text-[#9CA3AF]'}`}>{queueLeads.length}</span>
              </button>
              {iaEnabled && (
                <button
                  onClick={() => setView('calendar')}
                  className={`px-3.5 py-1.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                    view === 'calendar' ? 'bg-[#44bbaa] text-white' : 'text-[#707070] hover:text-[#005851]'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Calendar
                </button>
              )}
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
            {view === 'all' && (
              <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                <LeadFilterBar
                  filters={filters}
                  onChange={setFilters}
                  tags={agentProfile.leadTags ?? []}
                  availableStates={availableStates}
                />
                <div className="flex items-center gap-1.5 text-xs mb-2">
                  <span className="font-semibold uppercase tracking-wider text-[#9CA3AF]">Sort</span>
                  <select
                    value={sortKey === 'priority' ? 'createdAt' : sortKey}
                    onChange={(e) => {
                      const k = e.target.value as LeadSortKey;
                      setSortKey(k);
                      setSortDir(k === 'name' || k === 'source' || k === 'state' || k === 'followUpAt' ? 'asc' : 'desc');
                    }}
                    className="px-2 py-1 border border-[#d0d0d0] rounded-[5px] bg-white"
                  >
                    <option value="createdAt">Date added</option>
                    <option value="name">Name</option>
                    <option value="source">Source</option>
                    <option value="state">State</option>
                    <option value="temperature">Temperature</option>
                    <option value="lastContacted">Last contacted</option>
                    <option value="followUpAt">Follow-up date</option>
                    <option value="ageYears">Lead age</option>
                    <option value="appDownloadedAt">App downloaded</option>
                    <option value="assessmentCompletedAt">Assessment completed</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    className="px-2 py-1 border border-[#d0d0d0] rounded-[5px] bg-white"
                    aria-label="Toggle sort direction"
                    title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
                <SavedLeadsBar
                  segments={agentProfile.savedLeadSegments ?? []}
                  current={{ filters, searchQuery, sortKey, sortDir }}
                  canSave={canSaveSegment}
                  onApply={applySegment}
                  onSave={handleSaveSegment}
                  onDelete={deleteLeadSegment}
                />
              </div>
            )}
          </div>
          )}

          {/* PDF drop-zone — hidden while dialing (queue) so the call list and
              disposition controls sit at the top; upload still lives in the
              action bar and the All view. */}
          {view === 'all' && (
          <div
            ref={consentBoxRef}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) {
                if (!importConsent) {
                  // Hold it — don't make them re-drop. Auto-runs on consent.
                  setPendingFile(file);
                  setUploadError(null);
                  return;
                }
                handleLeadFileSelect(file);
              }
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
                  {uploading ? 'Reading…' : 'Drop a lead form PDF, or a CSV / Excel lead list here'}
                </p>
                <p className="text-xs text-[#005851]/70 mt-0.5">
                  PDFs get read automatically. For a spreadsheet, each row becomes one
                  lead — we pull name, phone, email, date of birth, and address; other
                  columns are ignored.
                </p>
              </div>
            </div>
            <label className={`mt-3 flex items-start gap-2 text-xs cursor-pointer select-none rounded-[5px] transition-colors ${
              pendingFile
                ? 'border border-[#f0c060] bg-[#fff7e6] px-3 py-2 text-[#7a5a00] font-semibold'
                : 'text-[#005851]'
            }`}>
              <input
                type="checkbox"
                checked={importConsent}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setImportConsent(checked);
                  if (checked) {
                    setUploadError(null);
                    // A file was waiting on this box — start it now, no re-pick.
                    if (pendingFile) {
                      handleLeadFileSelect(pendingFile);
                      setPendingFile(null);
                    }
                  }
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#005851]"
              />
              <span>
                {pendingFile ? (
                  <>
                    One quick check and we&rsquo;ll start reading{' '}
                    <span className="font-bold break-all">{pendingFile.name}</span>
                    {' '}— confirm you have the right to upload and use this data.
                  </>
                ) : (
                  'I confirm I have the right to upload and use this data.'
                )}
              </span>
            </label>
            {uploadError && (
              <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-[5px] px-3 py-2">
                {uploadError}
              </div>
            )}
          </div>
          )}

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

          {/* Live multi-page batch progress — shown while the GCF splits
              + extracts. Collapses into the bulk-upload summary below the
              moment the batch doc goes terminal (onSnapshot handler). */}
          {batchProgress && (() => {
            const { totalPages, completedPages, failedPages, duplicatePages, status, fileName } = batchProgress;
            const processed = completedPages + failedPages + duplicatePages;
            const pct = totalPages > 0 ? Math.min(100, Math.round((processed / totalPages) * 100)) : 0;
            const heading = status === 'splitting' ? 'Preparing your bundle…' : 'Importing leads…';
            return (
              <div className="mb-6 bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="animate-spin w-4 h-4 text-[#45bcaa] shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-sm font-bold text-[#005851]">{heading}</span>
                    </div>
                    <p className="text-xs text-[#707070] truncate">
                      {fileName} · {totalPages > 0 ? `${processed} of ${totalPages} pages` : 'reading pages…'}
                      {completedPages > 0 && <> · {completedPages} created</>}
                      {duplicatePages > 0 && <> · {duplicatePages} already imported</>}
                      {failedPages > 0 && <> · {failedPages} couldn&apos;t be read</>}
                    </p>
                  </div>
                  <button
                    onClick={() => void cancelBatch()}
                    disabled={cancellingBatch}
                    className="px-3 py-1.5 text-xs font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50 shrink-0"
                  >
                    {cancellingBatch ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
                <div className="h-2 w-full rounded-full bg-[#eef2f2] overflow-hidden">
                  <div
                    className="h-full bg-[#44bbaa] transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#9CA3AF] mt-2">
                  You can keep working — leads appear in the list as each page finishes.
                </p>
              </div>
            );
          })()}

          {/* Bulk-upload summary — N leads created from a multi-page PDF
              or a CSV/Excel list. `source` drives page-vs-row wording. */}
          {bulkUpload && (
            <div className="mb-6 bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold tracking-wider text-[#005851] uppercase">
                      {bulkUpload.leads.length} {bulkUpload.leads.length === 1 ? 'lead' : 'leads'} created
                    </span>
                    <span className="text-[10px] text-[#707070] font-normal">
                      · {bulkUpload.pageCount}{' '}
                      {bulkUpload.source === 'csv'
                        ? (bulkUpload.pageCount === 1 ? 'row' : 'rows')
                        : (bulkUpload.pageCount === 1 ? 'page' : 'pages')}
                      {bulkUpload.duplicates.length > 0 && (
                        <> · {bulkUpload.duplicates.length} already imported</>
                      )}
                      {(bulkUpload.updated?.length ?? 0) > 0 && (
                        <> · {bulkUpload.updated!.length} refreshed</>
                      )}
                      {bulkUpload.failed.length > 0 && (
                        <> · {bulkUpload.failed.length} couldn&apos;t be {bulkUpload.source === 'csv' ? 'imported' : 'read'}</>
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-[#444] leading-relaxed">
                    {bulkUpload.leads.length === 0 && bulkUpload.duplicates.length > 0 && bulkUpload.failed.length === 0
                      ? 'No new leads created — the phone(s) already exist for you. Open below to pick up where you left off.'
                      : bulkUpload.source === 'csv'
                        ? 'Each row in the file became one lead. Open any to verify the imported info.'
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
                        <span className="text-[10px] text-[#9CA3AF] mr-2">{bulkUpload.source === 'csv' ? 'r' : 'p'}{l.page}</span>
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
                          <span className="text-[10px] text-[#92400E]/60 mr-2">{bulkUpload.source === 'csv' ? 'r' : 'p'}{d.page}</span>
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
                    {bulkUpload.source === 'csv'
                      ? <>Couldn&apos;t import these rows — use <em>+ Add Lead</em> to enter manually:</>
                      : <>Couldn&apos;t read these pages — use <em>+ Add Lead</em> to enter manually:</>}
                  </p>
                  <ul className="text-[11px] text-amber-900/90 space-y-0.5">
                    {bulkUpload.failed.map((f) => (
                      <li key={f.page}>{bulkUpload.source === 'csv' ? 'Row' : 'Page'} {f.page} — {f.reason}</li>
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
          {iaEnabled && view === 'calendar' ? (
            <LeadsCalendar
              onGoToQueue={() => {
                captureEvent(ANALYTICS_EVENTS.CALL_MODE_STARTED, {
                  entry: 'calendar',
                  queue_count: queueLeads.length,
                });
                setView('queue');
              }}
            />
          ) : (
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
                              {nextApptByLead.get(lead.id) ? (
                                <span className="inline-flex items-center shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#daf3f0] text-[#005851] rounded">
                                  📅 {formatApptChip(nextApptByLead.get(lead.id)!)}
                                </span>
                              ) : pastOutcomeByLead.get(lead.id) && (() => {
                                const past = pastOutcomeByLead.get(lead.id)!;
                                const chip = getAppointmentOutcomeChip(past.status, past.scheduledAt);
                                return (
                                  <span className={`inline-flex items-center shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${chip.classes}`}>
                                    {chip.label}
                                  </span>
                                );
                              })()}
                              {fifResetByLead.get(lead.id) && (() => {
                                const chip = getFifResetChip(fifResetByLead.get(lead.id)!.smeName);
                                return (
                                  <span className={`inline-flex items-center shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${chip.classes}`}>
                                    {chip.label}
                                  </span>
                                );
                              })()}
                              {lead.leadScore && (
                                <LeadTempChip temperature={lead.leadScore.temperature} />
                              )}
                            </div>
                            <div className="text-xs text-[#707070] mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>{lead.phone}</span>
                              {lead.lastDialOutcome ? (
                                <>
                                  <span>·</span>
                                  <span>
                                    {(lead.dialLog?.length ?? 0) > 0 && (
                                      <span className="font-semibold text-[#374151]">
                                        {lead.dialLog!.length} dial{lead.dialLog!.length === 1 ? '' : 's'} ·{' '}
                                      </span>
                                    )}
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
                    <p className="font-semibold text-[#000000] mb-1">Three ways to add a lead.</p>
                    <p className="text-[#444] text-sm leading-relaxed">
                      <strong>Drop a lead form PDF</strong> (Mail-In, Call-In, or Digital) into the box above —
                      AFL pulls out name, phone, address, DOB, mortgage details, and more.
                      <strong> Drop a CSV or Excel list</strong> in the same box to add a whole batch at once —
                      each row becomes a lead (name, phone, email, DOB, address).
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
                  <div>
                    <p className="font-semibold text-[#000000] mb-1">Book the sit-down, confirm it in one tap.</p>
                    <p className="text-[#444] text-sm leading-relaxed">
                      The moment a lead books, AFL drafts the confirmation text for you —
                      with your business card and the license that matches their state attached.
                      It lands on your paired phone; you just hit send, so it comes from your number.
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
                          if (!importConsent) {
                            // Same hold-the-file gate as the action-bar and
                            // drop-zone paths. The consent box is up top, so
                            // stash the file, clear any error, and scroll the
                            // box into view; ticking it auto-starts the upload.
                            setPendingFile(file);
                            setUploadError(null);
                            e.target.value = '';
                            consentBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                          }
                          handleLeadFileSelect(file);
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
                    {displayLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="border-b border-[#f1f1f1] hover:bg-[#f8f8f8] cursor-pointer transition-colors"
                        onClick={() => {
                          captureEvent(ANALYTICS_EVENTS.LEAD_OPENED, { lead_id: lead.id, source: 'all_list' });
                          router.push(`/dashboard/leads/${lead.id}`);
                        }}
                      >
                        <td className="px-5 py-3.5 text-sm font-semibold text-[#000000]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{lead.name}</span>
                            {lead.convertedToClientId && (
                              <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#daf3f0] text-[#005851] rounded">
                                Converted
                              </span>
                            )}
                            {nextApptByLead.get(lead.id) ? (
                              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#daf3f0] text-[#005851] rounded">
                                📅 {formatApptChip(nextApptByLead.get(lead.id)!)}
                              </span>
                            ) : pastOutcomeByLead.get(lead.id) && (() => {
                              const past = pastOutcomeByLead.get(lead.id)!;
                              const chip = getAppointmentOutcomeChip(past.status, past.scheduledAt);
                              return (
                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${chip.classes}`}>
                                  {chip.label}
                                </span>
                              );
                            })()}
                            {fifResetByLead.get(lead.id) && (() => {
                              const chip = getFifResetChip(fifResetByLead.get(lead.id)!.smeName);
                              return (
                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${chip.classes}`}>
                                  {chip.label}
                                </span>
                              );
                            })()}
                            {lead.leadScore && (
                              <LeadTempChip temperature={lead.leadScore.temperature} />
                            )}
                            <LeadTagChips tagIds={lead.tagIds} tags={agentProfile.leadTags ?? []} />
                            {(() => {
                              const fu = followUpChip(lead.followUpAt);
                              return fu ? (
                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wide rounded ${fu.classes}`}>{fu.label}</span>
                              ) : null;
                            })()}
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
          )}
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
            leadEmail={confirmingLead.lead.email}
            leadCode={confirmingLead.lead.leadCode}
            leadState={confirmingLead.lead.address?.state || null /* live lead state — mirrors LeadDetailPanel + the phone push path so the license auto-attaches */}
            scheduledAt={confirmingLead.scheduledAt}
            agentName={agentProfile.name || ''}
            agentBusinessCardBase64={agentProfile.businessCardBase64}
            licenses={agentProfile.licenses || {}}
            attachmentsSent={confirmingLead.lead.attachmentsSent}
            onSent={() => { setConfirmingLead(null); revealPairCelebration(); }}
            onCancel={() => { setConfirmingLead(null); revealPairCelebration(); }}
          />
        )}

        {/* First-booking pairing celebration — revealed once the confirmation
            drawer closes, for an unpaired agent who just booked a sit-down. */}
        {pairCelebrationName && (
          <FirstBookingPairCelebration
            firstName={pairCelebrationName}
            onClose={() => setPairCelebrationName(null)}
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
