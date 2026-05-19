'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useDashboard } from '../app/dashboard/DashboardContext';
import AppointmentPicker from './AppointmentPicker';
import { DEFAULT_DIAL_SCRIPT, renderDialScript } from '../lib/dial-script';
import SendConfirmationDrawer from './SendConfirmationDrawer';

interface LeadPhone {
  number: string;
  label?: 'cell' | 'home' | 'work' | 'other' | null;
}

interface Lead {
  id: string;
  name?: string;
  phone?: string;
  phones?: LeadPhone[];
  email?: string;
  leadCode?: string;
  formType?: string;
  notes?: string;
  notesUpdatedAt?: Timestamp | null;
  monthlyMortgageAmount?: number;
  monthlyMortgageAmountUpdatedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
  appDownloadedAt?: string | null;
  assessmentAnswers?: Record<string, string>;
  assessmentCompletedAt?: Timestamp | null;
  convertedToClientId?: string | null;
  // Extracted-from-PDF fields (Chunk 2). Also agent-editable on the
  // detail page when missing — e.g. for manual leads, or to correct
  // bad extraction.
  dateOfBirth?: string;          // YYYY-MM-DD. Underwriting field; not
                                 // load-bearing for the lead code (which
                                 // is derived from phone only).
  heightText?: string;           // Freeform: "5'10\"", "5 ft 10 in", "70 in"
  weightLbs?: number;
  address?: { street?: string; city?: string; state?: string; zip?: string };
  mortgageDetails?: { balance?: number; lender?: string };

  // Additional extracted fields (Chunk 2)
  ageYears?: number;
  gender?: 'M' | 'F';
  smokerStatus?: 'Y' | 'N';
  coborrowerStatus?: 'Y' | 'N';
  spouseName?: string;
  spouseAgeYears?: number;
  beneficiaryName?: string;
  sourceFileUrl?: string;
  sourceFileStoragePath?: string;
  sourceFileArchivedAt?: Timestamp | null;
  extractionConfidence?: number;
  extractionFlags?: string[];

  // Dial tracking (Chunk 4b)
  dialLog?: Array<{ at: Timestamp; outcome: DialOutcome; notes?: string; phoneDialed?: string }>;
  lastDialAt?: Timestamp | null;
  lastDialOutcome?: DialOutcome;

  // Attachment dedup (Chunk 4f). Tracks what's already been sent to
  // this lead so confirmation + reminder sends don't re-attach files
  // the lead already has on their phone.
  attachmentsSent?: {
    businessCardAt?: string;
    licensesByState?: Record<string, string>;
  };
}

type DialOutcome =
  | 'no_answer'
  | 'left_vm'
  | 'wrong_number'
  | 'not_interested'
  | 'callback_requested'
  | 'booked'
  | 'do_not_call';

const DIAL_OUTCOME_LABELS: Record<DialOutcome, string> = {
  no_answer: 'No answer',
  left_vm: 'Left voicemail',
  wrong_number: 'Wrong number',
  not_interested: 'Not interested',
  callback_requested: 'Wants callback',
  booked: 'Booked',
  do_not_call: 'Do not call',
};

const DIAL_OUTCOME_TONE: Record<DialOutcome, string> = {
  no_answer: 'bg-gray-100 text-gray-700 border-gray-300',
  left_vm: 'bg-blue-50 text-blue-800 border-blue-200',
  wrong_number: 'bg-red-50 text-red-800 border-red-200',
  not_interested: 'bg-red-50 text-red-800 border-red-200',
  callback_requested: 'bg-amber-50 text-amber-900 border-amber-300',
  booked: 'bg-[#daf3f0] text-[#005851] border-[#45bcaa]',
  do_not_call: 'bg-red-100 text-red-900 border-red-300',
};

const PHONE_LABEL_OPTIONS: Array<{ value: 'cell' | 'home' | 'work' | 'other' | ''; label: string }> = [
  { value: '', label: '—' },
  { value: 'cell', label: 'Cell' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

function digitsOnly(s: string): string {
  return (s || '').replace(/\D/g, '');
}

/**
 * Per-phone Call row stack. Renders one row per phone with:
 *   - Call button (dials this specific number; stamps onto outcome)
 *   - Dial count badge (computed live from dialLog.phoneDialed match)
 *   - Last-outcome chip (most recent dial on this number)
 *   - Label dropdown (cell/home/work/other) — saves on change
 *   - Remove button (with confirm) for non-primary phones
 *   - "+ Add another phone" inline at the bottom
 *
 * Edits write to Firestore via updateDoc against the lead doc directly
 * (same pattern as the other autosave fields on this page).
 */
function PhoneList(props: {
  user: User | null;
  leadId: string;
  leadFirstName: string;
  phones: LeadPhone[];
  dialLog?: Array<{ at: Timestamp; outcome: DialOutcome; notes?: string; phoneDialed?: string }>;
  isDoNotCall: boolean;
  onCall: (number: string) => void;
  primaryPhone?: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newLabel, setNewLabel] = useState<'cell' | 'home' | 'work' | 'other' | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialCount = useCallback((num: string) => {
    const want = digitsOnly(num);
    if (!want) return 0;
    return (props.dialLog || []).filter((d) => digitsOnly(d.phoneDialed || '') === want).length;
  }, [props.dialLog]);

  const lastOutcomeOn = useCallback((num: string): DialOutcome | null => {
    const want = digitsOnly(num);
    if (!want) return null;
    const matches = (props.dialLog || []).filter((d) => digitsOnly(d.phoneDialed || '') === want);
    if (matches.length === 0) return null;
    const newest = matches.reduce((a, b) =>
      (b.at?.toDate?.().getTime?.() ?? 0) > (a.at?.toDate?.().getTime?.() ?? 0) ? b : a,
    );
    return newest.outcome;
  }, [props.dialLog]);

  const writePhones = useCallback(async (next: LeadPhone[]) => {
    if (!props.user) return;
    setSaving(true);
    setError(null);
    try {
      const update: Record<string, unknown> = { phones: next };
      // Keep the legacy `phone` field aligned to the primary so older
      // code paths (lead-code derive, queue priority, etc.) still work.
      if (next.length > 0) update.phone = next[0].number;
      await updateDoc(doc(db, 'agents', props.user.uid, 'leads', props.leadId), update);
    } catch (err) {
      console.error('phones save failed:', err);
      setError('Save failed — try again');
    } finally {
      setSaving(false);
    }
  }, [props.user, props.leadId]);

  const handleLabelChange = useCallback((idx: number, value: 'cell' | 'home' | 'work' | 'other' | '') => {
    const next = [...props.phones];
    next[idx] = { ...next[idx], label: value || null };
    void writePhones(next);
  }, [props.phones, writePhones]);

  const handleRemove = useCallback((idx: number) => {
    const removed = props.phones[idx];
    if (!removed) return;
    if (!window.confirm(`Remove ${removed.number}? Dial history for this number stays on the lead.`)) return;
    const next = props.phones.filter((_, i) => i !== idx);
    void writePhones(next);
  }, [props.phones, writePhones]);

  const handleAdd = useCallback(() => {
    const trimmed = newNumber.trim();
    if (!trimmed || digitsOnly(trimmed).length < 7) {
      setError('Enter a valid phone number (at least 7 digits)');
      return;
    }
    // Dedupe by digits
    if (props.phones.some((p) => digitsOnly(p.number) === digitsOnly(trimmed))) {
      setError('That number is already on this lead');
      return;
    }
    const next = [...props.phones, { number: trimmed, label: newLabel || null }];
    void writePhones(next);
    setNewNumber('');
    setNewLabel('');
    setShowAdd(false);
  }, [newNumber, newLabel, props.phones, writePhones]);

  return (
    <div className="mt-3 space-y-2">
      {props.isDoNotCall && (
        <div className="px-3 py-2 text-xs font-semibold text-red-800 bg-red-50 border border-red-300 rounded-[5px]">
          ⛔ This lead asked not to be contacted. Do not dial.
        </div>
      )}
      {props.phones.map((p, idx) => {
        const count = dialCount(p.number);
        const lastOutcome = lastOutcomeOn(p.number);
        const isPrimary = idx === 0;
        return (
          <div
            key={`${p.number}-${idx}`}
            className="flex items-center gap-2 flex-wrap"
          >
            {!props.isDoNotCall && (
              <button
                onClick={() => props.onCall(p.number)}
                className={`inline-flex items-center gap-2 px-3 py-2 font-semibold rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors text-sm ${
                  isPrimary
                    ? 'bg-[#44bbaa] hover:bg-[#005751] text-white'
                    : 'bg-white text-[#0D4D4D] hover:bg-[#f8f8f8]'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {isPrimary ? `Call ${props.leadFirstName}` : 'Call'} <span className="font-mono font-normal text-xs opacity-90">{p.number}</span>
              </button>
            )}
            {props.isDoNotCall && (
              <span className="text-sm font-mono text-[#374151]">{p.number}</span>
            )}
            <select
              value={p.label || ''}
              onChange={(e) => handleLabelChange(idx, e.target.value as 'cell' | 'home' | 'work' | 'other' | '')}
              disabled={saving}
              className="px-2 py-1.5 text-xs bg-white border border-[#d0d0d0] rounded-[5px] focus:outline-none focus:border-[#45bcaa]"
            >
              {PHONE_LABEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="text-xs text-[#707070]">
              {count === 0 ? 'never dialed' : count === 1 ? '1 dial' : `${count} dials`}
            </span>
            {lastOutcome && (
              <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded ${DIAL_OUTCOME_TONE[lastOutcome]}`}>
                {DIAL_OUTCOME_LABELS[lastOutcome]}
              </span>
            )}
            {!isPrimary && (
              <button
                onClick={() => handleRemove(idx)}
                disabled={saving}
                className="text-[11px] text-red-600 hover:text-red-800 font-semibold disabled:opacity-50"
                title="Remove this number"
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
      {showAdd ? (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="tel"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            placeholder="(555) 123-4567"
            disabled={saving}
            className="px-3 py-1.5 text-sm font-mono bg-white border border-[#d0d0d0] rounded-[5px] focus:outline-none focus:border-[#45bcaa]"
          />
          <select
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value as 'cell' | 'home' | 'work' | 'other' | '')}
            disabled={saving}
            className="px-2 py-1.5 text-xs bg-white border border-[#d0d0d0] rounded-[5px] focus:outline-none focus:border-[#45bcaa]"
          >
            {PHONE_LABEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label === '—' ? 'No label' : opt.label}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#005851] hover:bg-[#004440] rounded-[5px] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setShowAdd(false); setNewNumber(''); setNewLabel(''); setError(null); }}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold text-[#0D4D4D] bg-white border border-[#d0d0d0] rounded-[5px] hover:bg-[#f8f8f8] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setShowAdd(true); setError(null); }}
          className="text-xs font-semibold text-[#44bbaa] hover:text-[#005751]"
        >
          + Add another phone
        </button>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

interface LeadActivityEntry {
  id: string;
  leadId: string;
  kind: string;
  at?: Timestamp | null;
  summary?: string;
}

interface AppointmentEntry {
  id: string;
  leadId: string;
  scheduledAt?: Timestamp | null;
  scheduledAtTimeZone?: string | null;
  durationMinutes?: number;
  notes?: string;
  meetingUrl?: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  sentConfirmationAt?: Timestamp | null;
  sentReminderAt?: Timestamp | null;
}

// Default assessment question prompts so the dashboard can render the
// answers with their question text. Mirrors the manifest in
// `web/app/api/mobile/lead-content/route.ts`. If/when per-agent
// assessment overrides ship, swap this for a fetch.
const DEFAULT_ASSESSMENT_PROMPTS: Record<string, string> = {
  q1: 'Do you already have enough life insurance in place to fully protect your family?',
  q2: 'Would your family be financially secure without your income tomorrow?',
  q3: 'Have you already paid off all your major debts, including your mortgage?',
  q4: 'Would your loved ones have plenty of money set aside for final expenses?',
  q5: 'Do you already have coverage that would replace your income for several years?',
  q6: 'Have you already reviewed how much life insurance your family actually needs?',
  q7: 'Is protecting your family with additional coverage not a priority right now?',
  q8: 'Would leaving your family with no financial burden be unnecessary because everything is already covered?',
  q9: 'Do you already have a policy that fits your budget and gives you peace of mind?',
  q10: 'Is there nothing about your current situation that would make life insurance worth reviewing?',
};

const ANSWER_LABELS: Record<string, string> = {
  yes: 'Yes',
  no: 'No',
  not_sure: 'Not sure',
};

const AUTOSAVE_DEBOUNCE_MS = 600;

export interface LeadDetailPanelProps {
  leadId: string;
  // Auto-open the send-confirmation drawer for this appointment ID on
  // first render. Standalone route page passes the `?openConfirmation=`
  // search-param value (the QR-scan hand-off from macOS). Queue right-pane
  // never passes this.
  initialOpenConfirmationApptId?: string | null;
  // Bumping the nonce auto-fires `tel:` for the given phone and opens
  // the outcome prompt. Used by the call-queue right-pane so the row's
  // Call button performs "select + dial" in one motion. The parent picks
  // the phone via its own least-dialed heuristic.
  pendingDial?: { phone: string; nonce: number } | null;
  // Fired after the lead converts to a client. Route page navigates to
  // /dashboard/clients; queue parent clears selection.
  onConverted?: () => void;
  // Fired after the lead is deleted. Route page navigates back to
  // /dashboard/leads; queue parent clears selection.
  onDeleted?: () => void;
  // Fired immediately after a dial outcome chip is logged (or when an
  // appointment is booked via the picker, which counts as the 'booked'
  // outcome). Used by the call-queue parent to auto-advance the right
  // pane to the next queue lead.
  onOutcomeLogged?: (outcome: string) => void;
  // When true (route page), the lead-not-found state renders a "back to
  // all leads" button. When false (queue right-pane), the parent owns
  // the navigation/empty state.
  showNotFoundBackLink?: boolean;
}

export default function LeadDetailPanel({
  leadId,
  initialOpenConfirmationApptId,
  pendingDial,
  onConverted,
  onDeleted,
  onOutcomeLogged,
  showNotFoundBackLink,
}: LeadDetailPanelProps) {
  const { user, agentProfile } = useDashboard();
  // Snapshot the initial deep-link prop so a parent re-render that flips
  // it to null after consumption doesn't break the auto-open path.
  const openConfirmationParam = initialOpenConfirmationApptId;

  const [lead, setLead] = useState<Lead | null>(null);
  const [activity, setActivity] = useState<LeadActivityEntry[]>([]);
  const [appointments, setAppointments] = useState<AppointmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Autosave fields — local state shadows Firestore so the input is
  // responsive while the debounced write is pending.
  const [notes, setNotes] = useState('');
  const [notesSavedAt, setNotesSavedAt] = useState<Date | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesHydratedRef = useRef(false);

  const [mortgage, setMortgage] = useState<string>('');
  const [mortgageSavedAt, setMortgageSavedAt] = useState<Date | null>(null);
  const [mortgageSaving, setMortgageSaving] = useState(false);
  const mortgageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mortgageHydratedRef = useRef(false);

  // ── Additional autosave fields (DOB, height, weight) ──
  // Same debounced-onChange pattern as notes + monthly mortgage.
  const [dob, setDob] = useState('');
  const [dobSavedAt, setDobSavedAt] = useState<Date | null>(null);
  const [dobSaving, setDobSaving] = useState(false);
  const dobTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dobHydratedRef = useRef(false);

  const [height, setHeight] = useState('');
  const [heightSavedAt, setHeightSavedAt] = useState<Date | null>(null);
  const [heightSaving, setHeightSaving] = useState(false);
  const heightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heightHydratedRef = useRef(false);

  const [weight, setWeight] = useState('');
  const [weightSavedAt, setWeightSavedAt] = useState<Date | null>(null);
  const [weightSaving, setWeightSaving] = useState(false);
  const weightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weightHydratedRef = useRef(false);

  const [email, setEmail] = useState('');
  const [emailSavedAt, setEmailSavedAt] = useState<Date | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailHydratedRef = useRef(false);

  // Yes/No fields — saved immediately (no debounce needed for a button).
  // Tri-state via null = unknown.
  const [smoker, setSmoker] = useState<'Y' | 'N' | null>(null);
  const smokerHydratedRef = useRef(false);
  const [coborrower, setCoborrower] = useState<'Y' | 'N' | null>(null);
  const coborrowerHydratedRef = useRef(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Dial tracking (Chunk 4b). `outcomePrompt` shows the chip group
  // immediately after the agent taps Call — no auto-dismiss timer
  // because the call duration is unpredictable. Agent picks an
  // outcome when they're back at the keyboard.
  const [outcomePrompt, setOutcomePrompt] = useState(false);
  // Which phone the agent last tapped Call on — stamped onto the dial
  // log entry when they pick an outcome. Null means "primary / unknown"
  // (back-compat with old single-phone leads).
  const [activeDialPhone, setActiveDialPhone] = useState<string | null>(null);
  const [loggingOutcome, setLoggingOutcome] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  // Appointment picker (Chunk 4c). When the agent picks "Booked" as
  // the outcome, we open the picker INSTEAD of posting the dial
  // outcome — the picker's submit endpoint atomically creates the
  // appointment AND logs the 'booked' dial outcome in one round-trip.
  const [showAppointmentPicker, setShowAppointmentPicker] = useState(false);
  const [reschedulingAppointmentId, setReschedulingAppointmentId] = useState<string | null>(null);
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  // Whether Google Calendar is connected — gates the calendar-invite + Meet
  // affordances in the appointment picker. Fetched once on mount.
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);

  // Send-confirmation drawer (Chunk 4e). Opens automatically right
  // after a booking save, and on demand from a "Send confirmation"
  // button on appointment cards that haven't been sent yet. Tracked
  // by appointment ID so the drawer knows which appointment to stamp.
  const [confirmingAppointmentId, setConfirmingAppointmentId] = useState<string | null>(null);
  // Auto-open the send-confirmation drawer when the URL has
  // ?openConfirmation={apptId} (the QR/deep-link hand-off from
  // macOS). Wait until appointments are loaded so we can confirm the
  // ID is valid before opening, and clear the param from the URL so
  // a refresh doesn't re-open the drawer.
  const handoffOpenedRef = useRef(false);
  useEffect(() => {
    if (handoffOpenedRef.current) return;
    if (!openConfirmationParam || appointments.length === 0) return;
    const match = appointments.find((a) => a.id === openConfirmationParam);
    if (!match) return;
    setConfirmingAppointmentId(openConfirmationParam);
    handoffOpenedRef.current = true;
    // Strip the param so a page refresh doesn't re-open the drawer.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('openConfirmation');
      window.history.replaceState({}, '', url.toString());
    }
  }, [openConfirmationParam, appointments]);

  // ── Live lead doc ──
  useEffect(() => {
    if (!user || !leadId) return;
    const ref = doc(db, 'agents', user.uid, 'leads', leadId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data = { id: snap.id, ...(snap.data() as Omit<Lead, 'id'>) } as Lead;
      setLead(data);
      // First-load hydration of autosave fields. After hydration, local
      // state is the source of truth (the user is editing) — Firestore
      // updates from other tabs would clobber an in-progress edit, so we
      // intentionally don't re-sync.
      if (!notesHydratedRef.current) {
        setNotes(data.notes || '');
        notesHydratedRef.current = true;
      }
      if (!mortgageHydratedRef.current) {
        setMortgage(
          typeof data.monthlyMortgageAmount === 'number'
            ? String(data.monthlyMortgageAmount)
            : '',
        );
        mortgageHydratedRef.current = true;
      }
      if (!dobHydratedRef.current) {
        setDob(data.dateOfBirth || '');
        dobHydratedRef.current = true;
      }
      if (!heightHydratedRef.current) {
        setHeight(data.heightText || '');
        heightHydratedRef.current = true;
      }
      if (!weightHydratedRef.current) {
        setWeight(typeof data.weightLbs === 'number' ? String(data.weightLbs) : '');
        weightHydratedRef.current = true;
      }
      if (!emailHydratedRef.current) {
        setEmail(typeof data.email === 'string' ? data.email : '');
        emailHydratedRef.current = true;
      }
      if (!smokerHydratedRef.current) {
        setSmoker(data.smokerStatus === 'Y' || data.smokerStatus === 'N' ? data.smokerStatus : null);
        smokerHydratedRef.current = true;
      }
      if (!coborrowerHydratedRef.current) {
        setCoborrower(data.coborrowerStatus === 'Y' || data.coborrowerStatus === 'N' ? data.coborrowerStatus : null);
        coborrowerHydratedRef.current = true;
      }
      setLoading(false);
    }, (err) => {
      console.error('lead detail onSnapshot error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [user, leadId]);

  // ── Live lead-activity timeline ──
  useEffect(() => {
    if (!user || !leadId) return;
    const q = query(
      collection(db, 'agents', user.uid, 'leadActivity'),
      where('leadId', '==', leadId),
      orderBy('at', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setActivity(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeadActivityEntry, 'id'>) })));
    }, () => {
      // Index might be missing first time; fail silent rather than blocking the page.
    });
    return () => unsub();
  }, [user, leadId]);

  // ── Google Calendar connection status (gates the invite/Meet affordances) ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/integrations/google-calendar/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { connected?: boolean };
        if (!cancelled) setGoogleCalendarConnected(!!data.connected);
      } catch {
        // non-blocking: just leave the affordances off
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ── Live appointments for this lead ──
  // Pulls from the agent-level appointments subcollection filtered
  // by leadId. Sort newest-first; the section UI splits upcoming
  // vs past based on scheduledAt.
  useEffect(() => {
    if (!user || !leadId) return;
    const q = query(
      collection(db, 'agents', user.uid, 'appointments'),
      where('leadId', '==', leadId),
      orderBy('scheduledAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAppointments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppointmentEntry, 'id'>) })));
    }, (err) => {
      // First-time queries on a new compound (leadId + scheduledAt
      // sort) need an index; Firestore returns a console URL to
      // create it. Until that index is built, fail silent.
      console.warn('appointments snapshot error (likely missing index):', err);
    });
    return () => unsub();
  }, [user, leadId]);

  // ── Notes autosave ──
  const scheduleNotesSave = useCallback((value: string) => {
    if (!user || !leadId) return;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setNotesSaving(true);
      try {
        await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
          notes: value,
          notesUpdatedAt: serverTimestamp(),
        });
        setNotesSavedAt(new Date());
      } catch (err) {
        console.error('notes autosave failed:', err);
      } finally {
        setNotesSaving(false);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [user, leadId]);

  // ── Monthly mortgage autosave ──
  const scheduleMortgageSave = useCallback((value: string) => {
    if (!user || !leadId) return;
    if (mortgageTimer.current) clearTimeout(mortgageTimer.current);
    mortgageTimer.current = setTimeout(async () => {
      // Coerce to number; empty string clears the field.
      const numeric = value.trim() === '' ? null : Number(value.replace(/[^0-9.]/g, ''));
      if (numeric !== null && (Number.isNaN(numeric) || numeric < 0)) return;
      setMortgageSaving(true);
      try {
        await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
          monthlyMortgageAmount: numeric,
          monthlyMortgageAmountUpdatedAt: serverTimestamp(),
        });
        setMortgageSavedAt(new Date());
      } catch (err) {
        console.error('mortgage autosave failed:', err);
      } finally {
        setMortgageSaving(false);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [user, leadId]);

  const scheduleDobSave = useCallback((value: string) => {
    if (!user || !leadId) return;
    if (dobTimer.current) clearTimeout(dobTimer.current);
    dobTimer.current = setTimeout(async () => {
      // Accept empty (clears) or YYYY-MM-DD only.
      const v = value.trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      setDobSaving(true);
      try {
        await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
          dateOfBirth: v || null,
        });
        setDobSavedAt(new Date());
      } catch (err) {
        console.error('dob autosave failed:', err);
      } finally {
        setDobSaving(false);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [user, leadId]);

  const scheduleHeightSave = useCallback((value: string) => {
    if (!user || !leadId) return;
    if (heightTimer.current) clearTimeout(heightTimer.current);
    heightTimer.current = setTimeout(async () => {
      setHeightSaving(true);
      try {
        await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
          heightText: value.trim() || null,
        });
        setHeightSavedAt(new Date());
      } catch (err) {
        console.error('height autosave failed:', err);
      } finally {
        setHeightSaving(false);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [user, leadId]);

  const saveSmoker = useCallback(async (next: 'Y' | 'N' | null) => {
    if (!user || !leadId) return;
    setSmoker(next);
    try {
      await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
        smokerStatus: next,
      });
    } catch (err) {
      console.error('smoker save failed:', err);
    }
  }, [user, leadId]);

  const saveCoborrower = useCallback(async (next: 'Y' | 'N' | null) => {
    if (!user || !leadId) return;
    setCoborrower(next);
    try {
      await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
        coborrowerStatus: next,
      });
    } catch (err) {
      console.error('coborrower save failed:', err);
    }
  }, [user, leadId]);

  const scheduleEmailSave = useCallback((value: string) => {
    if (!user || !leadId) return;
    if (emailTimer.current) clearTimeout(emailTimer.current);
    emailTimer.current = setTimeout(async () => {
      const v = value.trim();
      // Accept empty (clears) or a minimally-valid-looking address.
      if (v && !/.+@.+\..+/.test(v)) return;
      setEmailSaving(true);
      try {
        await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
          email: v || null,
        });
        setEmailSavedAt(new Date());
      } catch (err) {
        console.error('email autosave failed:', err);
      } finally {
        setEmailSaving(false);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [user, leadId]);

  const scheduleWeightSave = useCallback((value: string) => {
    if (!user || !leadId) return;
    if (weightTimer.current) clearTimeout(weightTimer.current);
    weightTimer.current = setTimeout(async () => {
      const numeric = value.trim() === '' ? null : Number(value.replace(/[^0-9.]/g, ''));
      if (numeric !== null && (Number.isNaN(numeric) || numeric < 0)) return;
      setWeightSaving(true);
      try {
        await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
          weightLbs: numeric,
        });
        setWeightSavedAt(new Date());
      } catch (err) {
        console.error('weight autosave failed:', err);
      } finally {
        setWeightSaving(false);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [user, leadId]);

  // ── Dial tracking ──
  // Per-phone dial. Records which number was tapped so the outcome
  // chip flow can stamp it onto the dial log entry — that's how
  // per-number dial counts work. Falls back to the lead's primary
  // phone if no argument is passed (e.g. an old call-site).
  const handleStartCall = useCallback((phoneOverride?: string) => {
    const target = phoneOverride || lead?.phone || '';
    if (!target) return;
    const digits = target.replace(/\D/g, '');
    if (digits.length < 7) return;
    setOutcomeError(null);
    setActiveDialPhone(target);
    setOutcomePrompt(true);
    // US-only — `tel:` with raw digits lets the OS dialer handle
    // country-code interpretation per the device locale.
    window.location.href = `tel:${digits}`;
  }, [lead?.phone]);

  const handleLogOutcome = useCallback(async (outcome: DialOutcome) => {
    if (!user || !leadId) return;
    // Special case: 'booked' opens the appointment picker, which
    // logs the dial outcome itself when the booking is saved. Skip
    // the direct dial-log POST.
    if (outcome === 'booked') {
      setOutcomePrompt(false);
      setShowAppointmentPicker(true);
      return;
    }
    setLoggingOutcome(true);
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
          ...(activeDialPhone ? { phoneDialed: activeDialPhone } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOutcomeError(data?.error || `Failed to log outcome (${res.status})`);
        return;
      }
      setOutcomePrompt(false);
      setActiveDialPhone(null);
      onOutcomeLogged?.(outcome);
    } catch (err) {
      console.error('log outcome error:', err);
      setOutcomeError('Network error — please try again');
    } finally {
      setLoggingOutcome(false);
    }
  }, [user, leadId, activeDialPhone, onOutcomeLogged]);

  // Auto-dial bridge for the call-queue right-pane. When the queue
  // row's Call button is tapped, the parent bumps `pendingDial.nonce`
  // along with the picked phone — the panel fires `tel:` and opens
  // the outcome prompt without requiring a second click inside the
  // panel itself. The nonce is what we watch (rather than the phone
  // alone) so the same phone fired twice in a row still re-triggers.
  const lastConsumedDialNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pendingDial) return;
    if (lastConsumedDialNonceRef.current === pendingDial.nonce) return;
    lastConsumedDialNonceRef.current = pendingDial.nonce;
    const digits = pendingDial.phone.replace(/\D/g, '');
    if (digits.length < 7) return;
    setOutcomeError(null);
    setActiveDialPhone(pendingDial.phone);
    setOutcomePrompt(true);
    window.location.href = `tel:${digits}`;
  }, [pendingDial]);

  const handleDelete = useCallback(async () => {
    if (!user || !leadId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data?.error || `Delete failed (${res.status})`);
        setDeleting(false);
        return;
      }
      onDeleted?.();
    } catch (err) {
      console.error('delete lead error:', err);
      setDeleteError('Network error — please try again');
      setDeleting(false);
    }
  }, [user, leadId, onDeleted]);

  const formatRelativeTime = (date: Date | null): string => {
    if (!date) return '';
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-10 h-10 text-[#45bcaa]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-[#707070]">Loading lead…</p>
        </div>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <p className="text-[#000000] font-semibold mb-2">Lead not found.</p>
        {showNotFoundBackLink && (
          <button
            onClick={() => onDeleted?.()}
            className="text-[#44bbaa] font-semibold hover:underline"
          >
            ← Back to leads
          </button>
        )}
      </div>
    );
  }
  if (!lead) return null;

  // Compute the effective phone list — prefer the structured phones[]
  // array; fall back to a single-element list from lead.phone for
  // back-compat with leads created before multi-phone shipped.
  const effectivePhones: LeadPhone[] = lead.phones && lead.phones.length > 0
    ? lead.phones
    : (lead.phone ? [{ number: lead.phone, label: null }] : []);

  const ageFromDob = (dob?: string): number | null => {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#000000]">{lead.name || 'Unnamed lead'}</h1>
          <p className="text-sm text-[#707070] mt-1">
            {lead.phone}
            {lead.formType && lead.formType !== 'Manual' && (
              <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#daf3f0] text-[#005851] rounded">
                {lead.formType}
              </span>
            )}
            {lead.convertedToClientId && (
              <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#daf3f0] text-[#005851] rounded">
                Converted to client
              </span>
            )}
          </p>
          {/* Phones list — one row per number with its own Call button,
              dial-count badge, last-outcome chip, and a label dropdown.
              Falls back to the legacy single `phone` field when phones[]
              is absent (older leads or single-phone manual creates). */}
          {!lead.convertedToClientId && (
            <PhoneList
              user={user}
              leadId={lead.id}
              leadFirstName={lead.name?.split(' ')[0] || 'lead'}
              phones={effectivePhones}
              dialLog={lead.dialLog}
              isDoNotCall={lead.lastDialOutcome === 'do_not_call'}
              onCall={(num) => handleStartCall(num)}
              primaryPhone={lead.phone}
            />
          )}

          {/* Book appointment + Convert to client — common to all leads. */}
          {!lead.convertedToClientId && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowAppointmentPicker(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#0D4D4D] font-semibold rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Book appointment
              </button>
              <button
                onClick={() => setShowConvertConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#005851] hover:bg-[#004440] text-white font-semibold rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors text-sm"
                title="Convert this lead to a client — they closed!"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Convert to client
              </button>
            </div>
          )}
          {lead.convertedToClientId && (
            <div className="mt-3 px-3 py-2 text-sm text-[#005851] bg-[#daf3f0]/60 border border-[#45bcaa]/40 rounded-[5px]">
              ✓ Converted to client. <a href="/dashboard/clients" className="font-semibold underline">View clients</a>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-lg tracking-[0.25em] font-bold text-[#005851] bg-[#daf3f0]/50 px-3 py-1.5 rounded-[5px] border border-[#45bcaa]/40">
            {lead.leadCode}
          </div>
          <p className="text-[10px] uppercase tracking-wider text-[#707070] mt-1 font-semibold">Lead code</p>
        </div>
      </div>

      {/* Outcome prompt — appears when the agent has tapped Call.
          Stays open until the agent picks an outcome (no auto-dismiss
          since the call duration is unpredictable). The chip group
          updates Firestore in 1 tap; the live snapshot listener picks
          up the new dialLog entry and renders it in the history below. */}
      {outcomePrompt && (
        <div className="mb-6 bg-[#FEFCE8] border-2 border-[#FCD34D] rounded-xl border-r-[5px] border-b-[5px] border-r-[#FCD34D] border-b-[#FCD34D] p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-bold text-[#92400E]">How did the call go?</p>
              <p className="text-xs text-[#92400E]/80 mt-0.5">
                Tap an outcome — keeps your dial queue accurate.
              </p>
            </div>
            <button
              onClick={() => setOutcomePrompt(false)}
              disabled={loggingOutcome}
              className="text-[#92400E]/60 hover:text-[#92400E] text-xs font-semibold"
            >
              Skip
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DIAL_OUTCOME_LABELS) as DialOutcome[]).map((outcome) => (
              <button
                key={outcome}
                onClick={() => void handleLogOutcome(outcome)}
                disabled={loggingOutcome}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border-2 ${DIAL_OUTCOME_TONE[outcome]} hover:opacity-80 transition-opacity disabled:opacity-40`}
              >
                {DIAL_OUTCOME_LABELS[outcome]}
              </button>
            ))}
          </div>
          {outcomeError && (
            <p className="mt-2 text-xs text-red-600">{outcomeError}</p>
          )}
        </div>
      )}

      {/* Dial script overlay — floats bottom-right while the outcome prompt
          is showing. Goes away when the agent picks an outcome (or hits
          Skip). Per-agent template lives at agentProfile.dialScript;
          tokens like {agentfirstname} / {leadage} are substituted. */}
      {outcomePrompt && lead && (() => {
        const template = (agentProfile.dialScript && agentProfile.dialScript.trim())
          || DEFAULT_DIAL_SCRIPT;
        const computedAge = lead.ageYears ?? ageFromDob(lead.dateOfBirth);
        const rendered = renderDialScript(template, {
          agentFirstName: agentProfile.name || '',
          leadFirstName: lead.name || '',
          leadFullName: lead.name || '',
          leadAge: computedAge,
          leadCity: lead.address?.city || '',
          leadState: lead.address?.state || '',
          leadPhone: lead.phone || '',
          tobaccoUse: lead.smokerStatus,
          mortgageAmount: typeof lead.mortgageDetails?.balance === 'number'
            ? lead.mortgageDetails.balance
            : null,
          spouseName: lead.spouseName || '',
        });
        return (
          <div
            className="fixed z-[90] bg-white border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] rounded-xl shadow-2xl flex flex-col"
            style={{
              bottom: '1rem',
              right: '1rem',
              width: 'min(380px, calc(100vw - 2rem))',
              maxHeight: '70vh',
            }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#ececec] bg-[#daf3f0]/60 rounded-t-[9px]">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-xs font-bold uppercase tracking-wider text-[#005851]">Dial script</p>
              </div>
              <button
                onClick={() => setOutcomePrompt(false)}
                className="w-6 h-6 rounded-[5px] hover:bg-white/60 flex items-center justify-center text-[#005851]"
                title="Dismiss script"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3 text-sm leading-relaxed text-[#1A1A1A] whitespace-pre-wrap">
              {rendered}
            </div>
            <p className="px-4 pb-2 pt-1 text-[10px] text-[#707070] border-t border-[#ececec]">
              Pick an outcome above to close · Edit in Settings → Profile
            </p>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <StatusCard
          label="Downloaded app"
          ok={Boolean(lead.appDownloadedAt)}
          detail={lead.appDownloadedAt ? new Date(lead.appDownloadedAt).toLocaleDateString() : 'Not yet'}
        />
        <StatusCard
          label="Completed assessment"
          ok={Boolean(lead.assessmentCompletedAt)}
          detail={lead.assessmentCompletedAt ? lead.assessmentCompletedAt.toDate().toLocaleDateString() : 'Not yet'}
        />
        <StatusCard
          label="Created"
          ok
          detail={lead.createdAt ? lead.createdAt.toDate().toLocaleDateString() : '—'}
        />
      </div>

      {/* Extracted-from-PDF fields. Renders the union of everything any
          of the three lead-form templates can supply. Sections collapse
          when their fields are absent, so the panel is compact for
          manual leads and rich for fully-extracted Digital forms. */}
      {(lead.dateOfBirth || lead.email || lead.address || lead.mortgageDetails ||
        lead.gender || lead.smokerStatus || lead.spouseName || lead.beneficiaryName ||
        lead.sourceFileUrl || lead.sourceFileArchivedAt ||
        (lead.extractionFlags && lead.extractionFlags.length > 0)) && (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider">From the lead form</h3>
            <div className="flex items-center gap-3">
              {typeof lead.extractionConfidence === 'number' && (
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  lead.extractionConfidence >= 0.8
                    ? 'bg-[#daf3f0] text-[#005851]'
                    : lead.extractionConfidence >= 0.5
                    ? 'bg-[#FEF3C7] text-[#92400E]'
                    : 'bg-[#FEE2E2] text-[#991B1B]'
                }`}>
                  {Math.round(lead.extractionConfidence * 100)}% confident
                </span>
              )}
              {lead.sourceFileUrl && (
                <a
                  href={lead.sourceFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#44bbaa] hover:text-[#005751] font-semibold"
                >
                  Open original PDF →
                </a>
              )}
              {!lead.sourceFileUrl && lead.sourceFileArchivedAt && (
                <span
                  className="text-xs text-[#707070] italic"
                  title="Lead PDFs are auto-archived after 21 days of inactivity for compliance. Extracted fields remain available."
                >
                  Original PDF archived {lead.sourceFileArchivedAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          {lead.extractionFlags && lead.extractionFlags.length > 0 && (
            <div className="mb-3 bg-[#FEF3C7] border border-[#FCD34D] rounded-[5px] px-3 py-2 text-xs text-[#92400E]">
              <strong>Heads up — verify these:</strong> {lead.extractionFlags.join(', ').replace(/_/g, ' ')}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {lead.dateOfBirth && (
              <>
                <dt className="text-[#707070] font-semibold">Date of birth</dt>
                <dd className="text-[#374151]">
                  {lead.dateOfBirth}
                  {ageFromDob(lead.dateOfBirth) !== null && (
                    <span className="text-[#707070] ml-1">(age {ageFromDob(lead.dateOfBirth)})</span>
                  )}
                </dd>
              </>
            )}
            {!lead.dateOfBirth && lead.ageYears !== undefined && (
              <>
                <dt className="text-[#707070] font-semibold">Age</dt>
                <dd className="text-[#374151]">{lead.ageYears}</dd>
              </>
            )}
            {lead.email && (
              <>
                <dt className="text-[#707070] font-semibold">Email</dt>
                <dd className="text-[#374151]">{lead.email}</dd>
              </>
            )}
            {lead.gender && (
              <>
                <dt className="text-[#707070] font-semibold">Gender</dt>
                <dd className="text-[#374151]">{lead.gender === 'M' ? 'Male' : 'Female'}</dd>
              </>
            )}
            {lead.smokerStatus && (
              <>
                <dt className="text-[#707070] font-semibold">Tobacco use</dt>
                <dd className="text-[#374151]">{lead.smokerStatus === 'Y' ? 'Yes' : 'No'}</dd>
              </>
            )}
            {lead.address?.street && (
              <>
                <dt className="text-[#707070] font-semibold">Street</dt>
                <dd className="text-[#374151]">{lead.address.street}</dd>
              </>
            )}
            {lead.address?.city && (
              <>
                <dt className="text-[#707070] font-semibold">City</dt>
                <dd className="text-[#374151]">{lead.address.city}</dd>
              </>
            )}
            {lead.address?.state && (
              <>
                <dt className="text-[#707070] font-semibold">State</dt>
                <dd className="text-[#374151]">{lead.address.state}</dd>
              </>
            )}
            {lead.address?.zip && (
              <>
                <dt className="text-[#707070] font-semibold">ZIP</dt>
                <dd className="text-[#374151]">{lead.address.zip}</dd>
              </>
            )}
            {lead.mortgageDetails?.balance !== undefined && lead.mortgageDetails?.balance !== null && (
              <>
                <dt className="text-[#707070] font-semibold">Mortgage balance</dt>
                <dd className="text-[#374151]">${lead.mortgageDetails.balance.toLocaleString()}</dd>
              </>
            )}
            {lead.mortgageDetails?.lender && (
              <>
                <dt className="text-[#707070] font-semibold">Lender</dt>
                <dd className="text-[#374151]">{lead.mortgageDetails.lender}</dd>
              </>
            )}
            {lead.spouseName && (
              <>
                <dt className="text-[#707070] font-semibold">Spouse</dt>
                <dd className="text-[#374151]">
                  {lead.spouseName}
                  {lead.spouseAgeYears !== undefined && (
                    <span className="text-[#707070] ml-1">(age {lead.spouseAgeYears})</span>
                  )}
                </dd>
              </>
            )}
            {lead.beneficiaryName && (
              <>
                <dt className="text-[#707070] font-semibold">Beneficiary</dt>
                <dd className="text-[#374151]">{lead.beneficiaryName}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {/* Lead profile fields. Editable underwriting basics — none of
          these drive the lead code, so corrections here are harmless. */}
      <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
        <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider mb-3">Lead profile</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-[#374151] mb-1">
              Email
              <span className="ml-2 text-xs font-normal text-[#707070]">
                {emailSaving ? 'Saving…' : emailSavedAt ? `Saved · ${formatRelativeTime(emailSavedAt)}` : ''}
              </span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                const v = e.target.value;
                setEmail(v);
                scheduleEmailSave(v);
              }}
              placeholder="lead@example.com"
              className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
            />
            <p className="text-[11px] text-[#707070] mt-1">
              Used to send the lead a Google Calendar invite when you book a video appointment.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-[#374151] mb-1">
              Date of birth
              <span className="ml-2 text-xs font-normal text-[#707070]">
                {dobSaving ? 'Saving…' : dobSavedAt ? `Saved · ${formatRelativeTime(dobSavedAt)}` : ''}
              </span>
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => {
                const v = e.target.value;
                setDob(v);
                scheduleDobSave(v);
              }}
              className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#374151] mb-1">
              Height
              <span className="ml-2 text-xs font-normal text-[#707070]">
                {heightSaving ? 'Saving…' : heightSavedAt ? `Saved · ${formatRelativeTime(heightSavedAt)}` : ''}
              </span>
            </label>
            <input
              type="text"
              value={height}
              onChange={(e) => {
                const v = e.target.value;
                setHeight(v);
                scheduleHeightSave(v);
              }}
              placeholder={`5'10"`}
              className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#374151] mb-1">
              Weight (lbs)
              <span className="ml-2 text-xs font-normal text-[#707070]">
                {weightSaving ? 'Saving…' : weightSavedAt ? `Saved · ${formatRelativeTime(weightSavedAt)}` : ''}
              </span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={weight}
              onChange={(e) => {
                const v = e.target.value;
                setWeight(v);
                scheduleWeightSave(v);
              }}
              placeholder="180"
              className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
            />
          </div>
        </div>

        {/* Underwriting yes/no fields. Tri-state — Yes / No / Unknown.
            Unknown is the default for manually-entered leads; lead-form
            extraction populates Y or N when the form contained the field. */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-[#374151] mb-1">Tobacco use (last 12 months)</label>
            <div className="inline-flex rounded-[5px] border border-[#d0d0d0] overflow-hidden">
              {([
                { v: 'Y', label: 'Yes' },
                { v: 'N', label: 'No' },
                { v: null, label: 'Unknown' },
              ] as const).map((opt, idx) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => saveSmoker(opt.v)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${idx > 0 ? 'border-l border-[#d0d0d0]' : ''} ${
                    smoker === opt.v
                      ? 'bg-[#005851] text-white'
                      : 'bg-white text-[#0D4D4D] hover:bg-[#f8f8f8]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#374151] mb-1">Co-borrower on mortgage</label>
            <div className="inline-flex rounded-[5px] border border-[#d0d0d0] overflow-hidden">
              {([
                { v: 'Y', label: 'Yes' },
                { v: 'N', label: 'No' },
                { v: null, label: 'Unknown' },
              ] as const).map((opt, idx) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => saveCoborrower(opt.v)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${idx > 0 ? 'border-l border-[#d0d0d0]' : ''} ${
                    coborrower === opt.v
                      ? 'bg-[#005851] text-white'
                      : 'bg-white text-[#0D4D4D] hover:bg-[#f8f8f8]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Agent-entered: notes + monthly mortgage (autosave) */}
      <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
        <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider mb-3">Your notes</h3>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#374151] mb-1">
            Monthly mortgage amount (USD)
            <span className="ml-2 text-xs font-normal text-[#707070]">
              {mortgageSaving ? 'Saving…' : mortgageSavedAt ? `Saved · ${formatRelativeTime(mortgageSavedAt)}` : ''}
            </span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={mortgage}
            onChange={(e) => {
              const v = e.target.value;
              setMortgage(v);
              scheduleMortgageSave(v);
            }}
            placeholder="1850"
            className="w-full md:w-64 px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm font-mono focus:outline-none focus:border-[#45bcaa]"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#374151] mb-1">
            Notes
            <span className="ml-2 text-xs font-normal text-[#707070]">
              {notesSaving ? 'Saving…' : notesSavedAt ? `Saved · ${formatRelativeTime(notesSavedAt)}` : ''}
            </span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => {
              const v = e.target.value;
              setNotes(v);
              scheduleNotesSave(v);
            }}
            placeholder="Anything you want to remember before the call. Spouse's name, kids, pain points, prior coverage history…"
            rows={6}
            className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm leading-relaxed focus:outline-none focus:border-[#45bcaa]"
          />
        </div>
      </div>

      {/* Assessment answers */}
      {lead.assessmentAnswers && Object.keys(lead.assessmentAnswers).length > 0 && (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
          <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider mb-3">
            Assessment answers
            {lead.assessmentCompletedAt && (
              <span className="ml-2 text-xs font-normal text-[#707070]">
                Submitted {lead.assessmentCompletedAt.toDate().toLocaleString()}
              </span>
            )}
          </h3>
          <ol className="space-y-3 list-decimal list-inside">
            {Object.entries(lead.assessmentAnswers).map(([qid, ans]) => {
              const prompt = DEFAULT_ASSESSMENT_PROMPTS[qid] || qid;
              const label = ANSWER_LABELS[ans] || ans;
              const gap = ans === 'no' || ans === 'not_sure';
              return (
                <li key={qid} className="text-sm">
                  <span className="text-[#374151]">{prompt}</span>
                  <div className={`ml-4 mt-1 inline-block px-2 py-0.5 text-xs font-bold rounded ${
                    gap ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#daf3f0] text-[#005851]'
                  }`}>
                    {label}{gap && ' — gap'}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Appointments (Chunk 4c). Splits upcoming vs past based on
          scheduledAt. Most-recent first within each bucket. */}
      {appointments.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
          <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider mb-3">
            Appointments
            <span className="ml-2 text-xs font-normal text-[#707070]">
              {appointments.length}
            </span>
          </h3>
          <ul className="space-y-3">
            {appointments.map((appt) => {
              const when = appt.scheduledAt?.toDate();
              const isPast = when ? when.getTime() < Date.now() : false;
              const statusTone = (
                appt.status === 'cancelled' ? 'bg-gray-100 text-gray-600 border-gray-300' :
                appt.status === 'no_show'   ? 'bg-red-50 text-red-700 border-red-200' :
                appt.status === 'completed' ? 'bg-[#daf3f0] text-[#005851] border-[#45bcaa]' :
                                              'bg-amber-50 text-amber-900 border-amber-300'
              );
              return (
                <li key={appt.id} className={`p-3 rounded-[5px] border ${
                  appt.status === 'cancelled' ? 'border-gray-200 bg-gray-50 opacity-75' :
                  isPast ? 'border-[#d0d0d0] bg-[#fafafa]' :
                  'border-[#45bcaa]/40 bg-[#daf3f0]/20'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#000000]">
                        {when ? when.toLocaleString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          ...(appt.scheduledAtTimeZone ? { timeZone: appt.scheduledAtTimeZone, timeZoneName: 'short' as const } : {}),
                        }) : '(no time set)'}
                      </div>
                      <div className="text-xs text-[#707070] mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{appt.durationMinutes ?? 30} min</span>
                        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded ${statusTone}`}>
                          {appt.status.replace('_', ' ')}
                        </span>
                        {appt.sentConfirmationAt && (
                          <span className="text-[10px] text-[#005851]">✓ Confirmation sent</span>
                        )}
                        {appt.sentReminderAt && (
                          <span className="text-[10px] text-[#005851]">✓ Reminder sent</span>
                        )}
                      </div>
                      {appt.notes && (
                        <p className="text-xs text-[#444] mt-1.5 leading-relaxed">{appt.notes}</p>
                      )}
                    </div>
                    {/* Send confirmation if it hasn't been sent yet
                        and the appointment is still scheduled (not
                        cancelled / completed / no-show). Available
                        on past-but-still-scheduled rows too — agent
                        can re-send if the lead is unresponsive. */}
                    <div className="shrink-0 flex flex-col gap-1.5 items-end">
                      {!appt.sentConfirmationAt && appt.status === 'scheduled' && (
                        <button
                          onClick={() => setConfirmingAppointmentId(appt.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
                        >
                          Send confirmation
                        </button>
                      )}
                      {appt.status === 'scheduled' && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setReschedulingAppointmentId(appt.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-[#0D4D4D] bg-white hover:bg-[#f8f8f8] rounded-md border border-[#d0d0d0] transition-colors"
                          >
                            Reschedule
                          </button>
                          <button
                            onClick={() => setCancellingAppointmentId(appt.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-red-600 bg-white hover:bg-red-50 rounded-md border border-red-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Dial history (Chunk 4b). Most-recent first. Mirrors the
          activity-log shape so the two read alike — different
          datatypes (dialLog is on the lead doc, activity is its own
          subcollection) but agents don't need to care. */}
      {lead.dialLog && lead.dialLog.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
          <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider mb-3">
            Dial history
            <span className="ml-2 text-xs font-normal text-[#707070]">
              {lead.dialLog.length} {lead.dialLog.length === 1 ? 'attempt' : 'attempts'}
            </span>
          </h3>
          <ul className="space-y-2 text-sm">
            {[...lead.dialLog].reverse().map((dial, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-[#374151]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${DIAL_OUTCOME_TONE[dial.outcome]}`}>
                    {DIAL_OUTCOME_LABELS[dial.outcome]}
                  </span>
                  {dial.notes && <span className="text-xs text-[#707070] truncate">{dial.notes}</span>}
                </div>
                <span className="text-xs text-[#707070] shrink-0">
                  {dial.at ? dial.at.toDate().toLocaleString() : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Activity log */}
      {activity.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
          <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider mb-3">Activity</h3>
          <ul className="space-y-2 text-sm">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start justify-between text-[#374151]">
                <span>{a.summary || a.kind}</span>
                <span className="text-xs text-[#707070] ml-3 shrink-0">
                  {a.at ? a.at.toDate().toLocaleString() : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Danger zone — delete the lead. Removes the lead doc, the
          leadCodes index entry, and any leadActivity entries. If the lead
          has the app open, their next lookup 404s and the mobile session
          clears automatically. */}
      <div className="mt-12 pt-6 border-t border-[#FECACA]">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-sm text-red-600 hover:text-red-700 font-semibold"
        >
          Delete lead
        </button>
      </div>

      {/* Appointment picker (Chunk 4c). Opens via the standalone
          "Book appointment" header button OR via the 'booked' outcome
          chip in the dial-flow. The picker's submit endpoint
          atomically creates the appointment + logs the dial outcome.
          On successful save, immediately opens the confirmation
          drawer (Chunk 4e) so the agent can fire the SMS while the
          lead is still on the line. */}
      {showAppointmentPicker && lead && (
        <AppointmentPicker
          user={user}
          leadId={lead.id}
          leadName={lead.name || 'this lead'}
          leadEmail={lead.email || email || undefined}
          agentAppointmentMode={agentProfile.appointmentMode}
          agentDefaultMeetingLink={agentProfile.defaultMeetingLink}
          agentAutoCreateGoogleMeet={agentProfile.autoCreateGoogleMeet}
          googleCalendarConnected={googleCalendarConnected}
          onBooked={(apptId) => {
            setShowAppointmentPicker(false);
            // Booking endpoint already logs the dial outcome as 'booked'
            // atomically — so if the outcome prompt is showing from a
            // just-completed Call, dismiss it. (Without this, the agent
            // sees both the "How did the call go?" chips AND the new
            // appointment card, which is confusing.)
            setOutcomePrompt(false);
            setConfirmingAppointmentId(apptId);
            // Signal the queue parent to advance — booked drops the lead
            // off the queue (filter excludes lastDialOutcome === 'booked').
            onOutcomeLogged?.('booked');
          }}
          onCancel={() => setShowAppointmentPicker(false)}
        />
      )}

      {/* Reschedule — reuses AppointmentPicker in PATCH mode. */}
      {reschedulingAppointmentId && lead && (() => {
        const appt = appointments.find((a) => a.id === reschedulingAppointmentId);
        if (!appt || !appt.scheduledAt) return null;
        return (
          <AppointmentPicker
            user={user}
            leadId={lead.id}
            leadName={lead.name || 'this lead'}
            leadEmail={lead.email || email || undefined}
            agentAppointmentMode={agentProfile.appointmentMode}
            agentDefaultMeetingLink={agentProfile.defaultMeetingLink}
            agentAutoCreateGoogleMeet={agentProfile.autoCreateGoogleMeet}
            googleCalendarConnected={googleCalendarConnected}
            existingAppointment={{
              id: appt.id,
              scheduledAt: appt.scheduledAt.toDate(),
              durationMinutes: appt.durationMinutes ?? 30,
              notes: appt.notes,
              meetingUrl: appt.meetingUrl || undefined,
            }}
            onBooked={() => setReschedulingAppointmentId(null)}
            onCancel={() => setReschedulingAppointmentId(null)}
          />
        );
      })()}

      {/* Cancel confirmation — PATCH status='cancelled'. */}
      {cancellingAppointmentId && lead && (() => {
        const appt = appointments.find((a) => a.id === cancellingAppointmentId);
        if (!appt) return null;
        const when = appt.scheduledAt?.toDate();
        const whenStr = when
          ? when.toLocaleString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              ...(appt.scheduledAtTimeZone ? { timeZone: appt.scheduledAtTimeZone } : {}),
            })
          : '(no time set)';
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => !cancelBusy && setCancellingAppointmentId(null)}
            />
            <div className="relative bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-5 border-b border-[#ececec]">
                <h3 className="text-xl font-bold text-[#000000]">Cancel this appointment?</h3>
                <p className="text-sm text-[#707070] mt-1">{whenStr} with {lead.name || 'this lead'}</p>
              </div>
              <div className="p-5 text-sm text-[#374151] leading-relaxed">
                The appointment will be marked cancelled and the Google Calendar event
                will be removed (if Calendar is connected). The lead won&apos;t be
                notified — send them a separate message if you need to let them know.
              </div>
              <div className="flex gap-3 p-5 border-t border-[#ececec] bg-[#fafafa]">
                <button
                  onClick={() => !cancelBusy && setCancellingAppointmentId(null)}
                  disabled={cancelBusy}
                  className="flex-1 max-w-[180px] py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
                >
                  Keep it
                </button>
                <button
                  onClick={async () => {
                    if (!user) return;
                    setCancelBusy(true);
                    try {
                      const token = await user.getIdToken();
                      const res = await fetch(`/api/appointments/${appt.id}`, {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ status: 'cancelled' }),
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        alert(data?.error || `Failed to cancel (${res.status})`);
                        return;
                      }
                      setCancellingAppointmentId(null);
                    } catch (err) {
                      console.error('cancel appointment error:', err);
                      alert('Network error — please try again');
                    } finally {
                      setCancelBusy(false);
                    }
                  }}
                  disabled={cancelBusy}
                  className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
                >
                  {cancelBusy ? 'Cancelling…' : 'Cancel appointment'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Send-confirmation drawer (Chunk 4e). The appointment lookup
          here finds the row from our live snapshot — works for both
          just-booked appointments and ones the agent re-opens later. */}
      {confirmingAppointmentId && lead && (() => {
        const appt = appointments.find((a) => a.id === confirmingAppointmentId);
        if (!appt || !appt.scheduledAt) return null;
        return (
          <SendConfirmationDrawer
            user={user}
            appointmentId={appt.id}
            leadId={lead.id}
            leadName={lead.name || ''}
            leadPhone={lead.phone || ''}
            leadState={lead.address?.state || null}
            scheduledAt={appt.scheduledAt.toDate()}
            scheduledAtTimeZone={appt.scheduledAtTimeZone || null}
            meetingUrl={appt.meetingUrl || null}
            agentName={agentProfile.name || ''}
            agentBusinessCardBase64={agentProfile.businessCardBase64}
            licenses={agentProfile.licenses || {}}
            attachmentsSent={lead.attachmentsSent}
            onSent={() => setConfirmingAppointmentId(null)}
            onCancel={() => setConfirmingAppointmentId(null)}
          />
        );
      })()}

      {/* Convert-to-client confirmation. Calls POST /api/leads/[id]/convert
          which creates the client doc + mirrors + stamps the lead with
          convertedToClientId in one batch. */}
      {showConvertConfirm && lead && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !convertBusy && setShowConvertConfirm(false)}
          />
          <div className="relative bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-[#ececec]">
              <h3 className="text-xl font-bold text-[#000000]">Convert to client?</h3>
              <p className="text-sm text-[#707070] mt-1">{lead.name || 'this lead'} → new client record</p>
            </div>
            <div className="p-5 text-sm text-[#374151] leading-relaxed space-y-2">
              <p>
                Creates a new client record with this lead&apos;s name, phone, email, and date of birth.
                A welcome action item will appear in your queue automatically.
              </p>
              <p className="text-xs text-[#707070]">
                The lead stays here as a historical record but won&apos;t appear in your call queue anymore.
              </p>
              {convertError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-[5px] px-3 py-2">
                  {convertError}
                </p>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-[#ececec] bg-[#fafafa]">
              <button
                onClick={() => !convertBusy && setShowConvertConfirm(false)}
                disabled={convertBusy}
                className="flex-1 max-w-[180px] py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
              >
                Not yet
              </button>
              <button
                onClick={async () => {
                  if (!user) return;
                  setConvertBusy(true);
                  setConvertError(null);
                  try {
                    const token = await user.getIdToken();
                    const res = await fetch(`/api/leads/${lead.id}/convert`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      setConvertError(data?.error || `Failed (${res.status})`);
                      return;
                    }
                    setShowConvertConfirm(false);
                    // The live lead snapshot picks up convertedToClientId and
                    // flips the header banner. Parent decides what to do next:
                    // the standalone route page navigates to /dashboard/clients
                    // (the new record is sorted newest-first there); the call
                    // queue clears the right pane and advances to the next lead.
                    onConverted?.();
                  } catch (err) {
                    console.error('convert error:', err);
                    setConvertError('Network error — try again');
                  } finally {
                    setConvertBusy(false);
                  }
                }}
                disabled={convertBusy}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#005851] hover:bg-[#004440] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
              >
                {convertBusy ? 'Converting…' : 'Convert to client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-[#ececec]">
              <h3 className="text-xl font-bold text-[#000000]">Delete this lead?</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-[#444] leading-relaxed">
                This permanently removes <strong className="text-[#000000]">{lead.name || 'this lead'}</strong>, their code{' '}
                <span className="font-mono font-bold text-[#005851]">{lead.leadCode}</span>, and any answers they
                submitted from the app. If they&apos;re currently in the app, they&apos;ll be signed out on their next action.
              </p>
              {deleteError && <div className="mt-3 text-sm text-red-600">{deleteError}</div>}
            </div>
            <div className="flex gap-3 p-5 border-t border-[#ececec] bg-[#fafafa]">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className={`rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] px-4 py-3 ${ok ? 'bg-[#daf3f0]/40' : 'bg-white'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#707070]">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${ok ? 'text-[#005851]' : 'text-[#9CA3AF]'}`}>{detail}</p>
    </div>
  );
}
