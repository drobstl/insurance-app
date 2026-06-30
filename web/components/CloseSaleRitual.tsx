'use client';

/**
 * Close Sale ritual — the single-motion on-call workflow for converting
 * a lead to a client, recording the just-sold policy from the
 * application PDF, sending the welcome SMS, and walking the client
 * through app activation. All live, while the agent is still on the
 * phone.
 *
 * Tier reach: Growth+ only (requires the Leads section). Starter agents
 * use Add Client → Add Policy → activation listener on the client
 * detail page instead — same activation listener, different entry
 * point. See CONTEXT.md → Tier gating matrix.
 *
 * Three-card conveyor belt, one card centered at a time, completed
 * cards slide left out of frame:
 *
 *   Card 1 — Capture application
 *     File picker + carrier dropdown (no default — Upload disabled
 *     until the agent picks one). Click Upload → render selected
 *     pages → upload JPEGs → ingestion-v3 job → extract data →
 *     convert lead to client → create policy with extracted fields.
 *     If extraction yields too little data for /api/policies'
 *     quality gate, convert still succeeds; we surface a notice on
 *     Card 1 that the agent will fill the policy in afterwards.
 *
 *   Card 2 — Send welcome text (a WRITTEN BACKUP, not the load-
 *     bearing step). The client is live on the phone, so the surest
 *     delivery is the agent reading the link + code aloud while
 *     Card 3's activation listener confirms in real time — the card
 *     leads with that. The editable textarea (pre-filled with the
 *     locked welcome copy) then offers, per the agent's detected
 *     platform (web/lib/sms-url.ts): a platform-aware Send (opens the
 *     OS Messages handler via sms:), Copy, a QR code (scan with the
 *     phone you text from — the reliable path for Windows+Edge+Android
 *     where the OS app-chooser dead-ends on Chrome), and a Skip link.
 *     Every path advances to Card 3 — none can block the close. The
 *     welcome action item queued by the convert endpoint stays in the
 *     queue as a safety net if the agent never gets here.
 *
 *   Card 3 — Activation status
 *     Embeds <ClientActivationStatusRow variant="card" />. State
 *     machine + coaching text are owned by that component; this
 *     ritual is purely presentational past handing it the clientId.
 *     "Done — close" returns the agent to the lead row (now
 *     visually transitioned to ✓ Converted to client). No
 *     auto-navigation to the new client profile per Daniel's
 *     decision — the conversion banner is the path if they want
 *     to inspect.
 *
 * Resume policy: there is NO resume. Once Card 1 succeeds, the lead
 * is converted; closing the modal mid-ritual leaves the welcome
 * action item in the queue as the safety net. The Close Sale button
 * should disappear from the lead row after conversion.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { User } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import {
  APPLICATION_TYPE_OPTIONS,
  type ApplicationFormType,
} from '../lib/application-type-options';
import { mapExtractedApplicationToPolicyFormData } from '../lib/extracted-to-policy-form-data';
import { runApplicationExtractionV3 } from '../lib/run-application-extraction-v3';
import { buildCloseSaleWelcomeBody } from '../lib/welcome-sms-body';
import {
  type AgentPlatform,
  detectAgentPlatform,
  buildSmsUrlForPlatform,
  buildSmsUrlForQr,
  platformSupportsInlineSend,
  platformIsMobile,
  getSendButtonLabel,
  getSendCaption,
} from '../lib/sms-url';
import { ClientActivationStatusRow } from './ClientActivationStatusRow';
import { captureEvent } from '../lib/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';
import { relationshipLabel, type Relationship } from '../lib/household-shared';

const MAX_PDF_BYTES = 25 * 1024 * 1024;

type Stage = 'capture' | 'household' | 'welcome' | 'activation';

const STAGE_LABEL: Record<Stage, string> = {
  capture: 'Capture application',
  household: 'Add the household',
  welcome: 'Send welcome text',
  activation: 'Activation status',
};

/** An insured person on the lead who should become their own linked client. */
export interface CloseSalePerson {
  id: string;
  name: string;
  relationship: Relationship;
  phone?: string;
}

export interface CloseSaleLead {
  id: string;
  name: string;
  firstName: string;
  phone: string;
  /** Insured people (besides the primary) to convert in the same pass. */
  people?: CloseSalePerson[];
}

type MemberStatus = 'idle' | 'working' | 'done' | 'error';

interface MemberMatch {
  existingClientId: string;
  existingClientName: string;
  existingClientCode: string | null;
}

interface MemberState {
  status: MemberStatus;
  file: File | null;
  carrier: ApplicationFormType | '';
  progress: { pct: number; label: string };
  error: string | null;
  clientId?: string;
  clientCode?: string;
  qualityWarning?: string | null;
  /** A duplicate-client match the agent must resolve (link vs create new). */
  match?: MemberMatch | null;
}

const EMPTY_MEMBER: MemberState = {
  status: 'idle',
  file: null,
  carrier: '',
  progress: { pct: 0, label: '' },
  error: null,
  match: null,
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Authenticated user — needed for Bearer tokens on backend calls. */
  user: User;
  /** Agent display name — substituted into the welcome SMS body. */
  agentName: string;
  /** Owning agent id — for the activation status listener subscription. */
  agentId: string;
  /** The lead we're closing the sale for. */
  lead: CloseSaleLead;
  /**
   * Fired AFTER Card 1's atomic convert + policy create completes
   * successfully. The lead row should visually transition to
   * "✓ Converted to client" and disappear from the call queue. Modal
   * stays open on Card 2 — onClose fires only when agent clicks Done
   * on Card 3 or the X.
   */
  onConverted: (newClientId: string) => void;
}

// mapExtractedApplicationToPolicyFormData now lives in
// web/lib/extracted-to-policy-form-data.ts (shared with the Add
// Policy modal). The local duplicate that used to live here was
// removed in the same PR that created the shared lib.

// Reduce a phone string to comparable digits (strip formatting + a leading
// US country code) so "(256)903-6757" and "1-256-903-6757" compare equal.
// Used only to decide whether the lead's phone and the PDF's phone truly
// disagree before prompting the agent to pick one.
function phoneKey(s: string): string {
  const digits = (s || '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}
function phonesConflict(a: string, b: string): boolean {
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  return ka.length > 0 && kb.length > 0 && ka !== kb;
}

export function CloseSaleRitual({
  open,
  onClose,
  user,
  agentName,
  agentId,
  lead,
  onConverted,
}: Props) {
  const [stage, setStage] = useState<Stage>('capture');

  // ── Card 1 state ──
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [carrierType, setCarrierType] = useState<ApplicationFormType | ''>('');
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState({ pct: 0, label: '' });
  const [extractError, setExtractError] = useState<string | null>(null);
  const [policyQualityWarning, setPolicyQualityWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Phone reconcile: set when the PDF's insured phone disagrees with the
  // lead's existing phone. While set, Card 1 shows a "which number?" panel
  // and holds the conversion until the agent picks. The extracted result is
  // stashed in a ref so finalize can run once they choose.
  const [phoneConflict, setPhoneConflict] = useState<{ leadPhone: string; pdfPhone: string } | null>(null);
  const pendingExtractedRef = useRef<Awaited<ReturnType<typeof runApplicationExtractionV3>> | null>(null);

  // ── Card 2 state ──
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientCode, setClientCode] = useState<string | null>(null);
  const [welcomeBody, setWelcomeBody] = useState('');
  const [copied, setCopied] = useState(false);
  // Full platform detection (Mac / Windows / iOS / Android / …) so Card 2
  // can show the right Send affordance, an honest caption, and a QR / Copy
  // escape hatch for setups where the browser `sms:` handoff dead-ends —
  // e.g. Windows + Edge + a paired Android phone, where the OS app-chooser
  // offers Chrome (which can't text) instead of Phone Link. Detection runs
  // in an effect so SSR and first paint agree before we read navigator.
  const [agentPlatform, setAgentPlatform] = useState<AgentPlatform>('unknown');
  useEffect(() => {
    setAgentPlatform(detectAgentPlatform());
  }, []);

  // ── Household card state (Phase 2) ──
  // Insured people on the lead (besides the primary) each become their own
  // linked client. Only those with a name are convertible. Keyed by person id.
  const insuredPeople = useMemo(
    () => (lead.people || []).filter((p) => (p.name || '').trim()),
    [lead.people],
  );
  const hasHousehold = insuredPeople.length > 0;
  const [members, setMembers] = useState<Record<string, MemberState>>({});
  const membersRef = useRef<Record<string, MemberState>>({});
  useEffect(() => { membersRef.current = members; }, [members]);
  const patchMember = useCallback((id: string, patch: Partial<MemberState>) => {
    setMembers((m) => ({ ...m, [id]: { ...(m[id] || EMPTY_MEMBER), ...patch } }));
  }, []);

  // Funnel: the terminal stretch of the pre-sale funnel starts here —
  // one event per ritual open (the state reset below covers close).
  useEffect(() => {
    if (!open) return;
    captureEvent(ANALYTICS_EVENTS.CLOSE_SALE_STARTED, { lead_id: lead.id });
  }, [open, lead.id]);

  // Reset all transient state when the modal closes so a fresh open
  // doesn't show a stale staged file / error / progress.
  useEffect(() => {
    if (open) return;
    setStage('capture');
    setStagedFile(null);
    setCarrierType('');
    setExtracting(false);
    setExtractProgress({ pct: 0, label: '' });
    setExtractError(null);
    setPolicyQualityWarning(null);
    setPhoneConflict(null);
    pendingExtractedRef.current = null;
    setClientId(null);
    setClientCode(null);
    setWelcomeBody('');
    setMembers({});
    membersRef.current = {};
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open]);

  const handlePickFile = useCallback(() => {
    if (extracting) return;
    fileInputRef.current?.click();
  }, [extracting]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setExtractError('Please pick a PDF file.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setExtractError('This PDF is too large. Max 25MB.');
      return;
    }
    setStagedFile(file);
    setExtractError(null);
  }, []);

  // Steps 2–4 of the ritual: convert the lead → client (carrying the
  // PDF-extracted contact fields so the new client inherits the
  // application's email / DOB / phone), create the policy, then advance
  // to the welcome card. Split out of handleUpload so a phone-conflict
  // pause can sit between extraction and this. `preferExtractedPhone` is
  // the agent's choice when the lead's and the PDF's phones disagree.
  const finalizeConversion = useCallback(async (
    extracted: Awaited<ReturnType<typeof runApplicationExtractionV3>>,
    preferExtractedPhone: boolean,
  ) => {
    setExtracting(true);
    setExtractError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const data = extracted.data;

    try {
      // Convert lead → client. The convert endpoint also queues the
      // welcome action item, so the queue safety net is in place from
      // this moment forward regardless of whether the agent finishes
      // the ritual. We pass the extracted contact fields; the endpoint
      // gap-fills any the lead is missing (email/DOB/phone) and honors
      // preferExtractedPhone when the agent resolved a phone conflict.
      setExtractProgress({ pct: 96, label: 'Converting lead to client...' });
      const token = await user.getIdToken();
      const convertRes = await fetch(`/api/leads/${lead.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          extractedContact: {
            email: data.insuredEmail ?? null,
            dateOfBirth: data.insuredDateOfBirth ?? null,
            phone: data.insuredPhone ?? null,
          },
          preferExtractedPhone,
        }),
        signal: controller.signal,
      });
      const convertBody = (await convertRes.json()) as {
        clientId?: string;
        clientCode?: string;
        error?: string;
      };
      if (!convertRes.ok || !convertBody.clientId || !convertBody.clientCode) {
        throw new Error(convertBody.error || `Conversion failed (${convertRes.status}).`);
      }
      const newClientId = convertBody.clientId;
      const newClientCode = convertBody.clientCode;

      // Create the policy on the new client. We send the
      // ingestionQualityGate flag so the backend rejects policies
      // with <2 extracted signals — that's the "extraction was
      // too thin to be useful" case. When that happens, we don't
      // error out the ritual; convert already succeeded. We just
      // flag the warning so the agent knows to fill in fields
      // later from the new client profile.
      setExtractProgress({ pct: 98, label: 'Creating policy...' });
      const policyPayload = mapExtractedApplicationToPolicyFormData(data);
      const policyRes = await fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clientId: newClientId,
          ...policyPayload,
          ingestionQualityGate: true,
        }),
        signal: controller.signal,
      });
      if (!policyRes.ok) {
        const policyBody = (await policyRes.json().catch(() => ({}))) as { error?: string };
        // Convert already succeeded — don't error the whole ritual.
        // Surface a soft warning the agent can act on after Card 3.
        setPolicyQualityWarning(
          policyBody.error
            || 'Extraction was thin — open the new client and add policy details after.',
        );
      }

      // Stash client info for Cards 2 + 3, build the welcome SMS body, advance.
      setClientId(newClientId);
      setClientCode(newClientCode);
      setWelcomeBody(buildCloseSaleWelcomeBody({
        clientFirstName: lead.firstName,
        agentName,
        clientCode: newClientCode,
      }));
      // Funnel: THE revenue moment — the lead became a client.
      captureEvent(ANALYTICS_EVENTS.LEAD_CONVERTED, {
        lead_id: lead.id,
        client_id: newClientId,
        method: 'close_sale_ritual',
        policy_created: policyRes.ok,
      });
      onConverted(newClientId);
      // If the lead has insured people, walk the household next; otherwise
      // go straight to the welcome text for the primary.
      setStage(hasHousehold ? 'household' : 'welcome');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setExtractError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setExtracting(false);
      abortRef.current = null;
    }
  }, [user, lead.id, lead.firstName, agentName, onConverted, hasHousehold]);

  const handleUpload = useCallback(async () => {
    if (!stagedFile || !carrierType || extracting) return;
    setExtracting(true);
    setExtractError(null);
    setPhoneConflict(null);
    pendingExtractedRef.current = null;
    setExtractProgress({ pct: 0, label: 'Starting...' });
    const controller = new AbortController();
    abortRef.current = controller;

    // Step 1: extract policy data from the PDF via the carrier-aware v3
    // pipeline. Kept in its own try so we can branch on the result
    // (phone conflict vs. straight-through) before converting.
    let extracted: Awaited<ReturnType<typeof runApplicationExtractionV3>>;
    try {
      extracted = await runApplicationExtractionV3({
        user,
        file: stagedFile,
        carrierFormType: carrierType,
        signal: controller.signal,
        onProgress: (pct, label) => setExtractProgress({ pct, label }),
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setExtractError(err instanceof Error ? err.message : 'Something went wrong.');
      }
      setExtracting(false);
      abortRef.current = null;
      return;
    }

    // If the application's phone disagrees with the lead's existing
    // phone, pause and let the agent choose before converting. A blank
    // lead phone (or matching numbers) → no pause; the server silently
    // gap-fills email / DOB / phone from the extraction.
    const pdfPhone = (extracted.data.insuredPhone || '').trim();
    const leadPhone = (lead.phone || '').trim();
    if (phonesConflict(pdfPhone, leadPhone)) {
      pendingExtractedRef.current = extracted;
      setPhoneConflict({ leadPhone, pdfPhone });
      setExtracting(false);
      abortRef.current = null;
      return;
    }

    await finalizeConversion(extracted, false);
  }, [stagedFile, carrierType, extracting, user, lead.phone, finalizeConversion]);

  // Agent picked which phone to keep — finalize with their choice.
  const resolvePhoneConflict = useCallback((preferExtractedPhone: boolean) => {
    const extracted = pendingExtractedRef.current;
    if (!extracted) return;
    pendingExtractedRef.current = null;
    setPhoneConflict(null);
    void finalizeConversion(extracted, preferExtractedPhone);
  }, [finalizeConversion]);

  // ── Household card: convert one insured person → their own client ──
  // Optionally reads their application PDF (→ their policy). The convert
  // endpoint builds the client from the Person's captured fields and stamps
  // the shared householdId + relationship, so two apps on one sit become two
  // linked clients. `withoutApp` skips the PDF (client only, policy later).
  const convertMember = useCallback(async (
    person: CloseSalePerson,
    opts: { withoutApp?: boolean; force?: boolean; linkToExistingClientId?: string } = {},
  ) => {
    const ms = membersRef.current[person.id] || EMPTY_MEMBER;
    const useApp = !opts.withoutApp && !!ms.file && !!ms.carrier;
    patchMember(person.id, {
      status: 'working', error: null, match: null,
      progress: { pct: 0, label: useApp ? 'Reading application…' : 'Creating client…' },
    });
    const controller = new AbortController();

    // 1) Extract policy data from the application (only when one is staged).
    let extracted: Awaited<ReturnType<typeof runApplicationExtractionV3>> | null = null;
    if (useApp && ms.file && ms.carrier) {
      try {
        extracted = await runApplicationExtractionV3({
          user, file: ms.file, carrierFormType: ms.carrier, signal: controller.signal,
          onProgress: (pct, label) => patchMember(person.id, { progress: { pct, label } }),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') { patchMember(person.id, { status: 'idle' }); return; }
        patchMember(person.id, { status: 'error', error: err instanceof Error ? err.message : 'Could not read the application.' });
        return;
      }
    }

    // 2) Convert the person → their own client (+ create their policy).
    try {
      const token = await user.getIdToken();
      const data = extracted?.data;
      patchMember(person.id, { progress: { pct: 95, label: 'Creating client…' } });
      const convertRes = await fetch(`/api/leads/${lead.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          personId: person.id,
          ...(opts.force ? { force: true } : {}),
          ...(opts.linkToExistingClientId ? { linkToExistingClientId: opts.linkToExistingClientId } : {}),
          ...(data ? { extractedContact: { email: data.insuredEmail ?? null, dateOfBirth: data.insuredDateOfBirth ?? null, phone: data.insuredPhone ?? null } } : {}),
        }),
        signal: controller.signal,
      });
      const body = (await convertRes.json()) as {
        clientId?: string; clientCode?: string; error?: string;
        matched?: boolean; existingClientId?: string; existingClientName?: string; existingClientCode?: string | null;
      };
      if (convertRes.status === 409 && body.matched && body.existingClientId) {
        patchMember(person.id, {
          status: 'idle', progress: { pct: 0, label: '' },
          match: { existingClientId: body.existingClientId, existingClientName: body.existingClientName || '', existingClientCode: body.existingClientCode ?? null },
        });
        return;
      }
      if (!convertRes.ok || !body.clientId) {
        throw new Error(body.error || `Could not convert ${person.name} (${convertRes.status}).`);
      }
      const memberClientId = body.clientId;
      const memberCode = body.clientCode ?? undefined;

      let qualityWarning: string | null = null;
      if (data) {
        patchMember(person.id, { progress: { pct: 98, label: 'Creating policy…' } });
        const policyPayload = mapExtractedApplicationToPolicyFormData(data);
        const policyRes = await fetch('/api/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ clientId: memberClientId, ...policyPayload, ingestionQualityGate: true }),
          signal: controller.signal,
        });
        if (!policyRes.ok) {
          const pb = (await policyRes.json().catch(() => ({}))) as { error?: string };
          qualityWarning = pb.error || 'Extraction was thin — add policy details on their profile later.';
        }
      }

      patchMember(person.id, {
        status: 'done', clientId: memberClientId, clientCode: memberCode,
        qualityWarning, error: null, match: null, progress: { pct: 100, label: '' },
      });
      captureEvent(ANALYTICS_EVENTS.LEAD_CONVERTED, {
        lead_id: lead.id, client_id: memberClientId, method: 'close_sale_household',
        person_id: person.id, relationship: person.relationship, policy_created: !!data,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') { patchMember(person.id, { status: 'idle' }); return; }
      patchMember(person.id, { status: 'error', error: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }, [user, lead.id, patchMember]);

  const handleMemberFile = useCallback((personId: string, file: File | null) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      patchMember(personId, { error: 'Please pick a PDF file.' });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      patchMember(personId, { error: 'This PDF is too large. Max 25MB.' });
      return;
    }
    patchMember(personId, { file, error: null });
  }, [patchMember]);

  const membersWorking = insuredPeople.some((p) => members[p.id]?.status === 'working');
  const convertedMembers = insuredPeople
    .map((p) => ({ person: p, state: members[p.id] }))
    .filter((m): m is { person: CloseSalePerson; state: MemberState } => m.state?.status === 'done');

  // ── Card 2 send ──
  // The welcome text is a WRITTEN BACKUP, not the load-bearing step: the
  // client is live on the phone, so the surest delivery is the agent
  // reading the link + code aloud while Card 3's activation listener
  // confirms in real time. So every path here (Send / Copy / QR / Skip)
  // advances to activation — none of them can block the close.
  const smsHref = welcomeBody.trim()
    ? buildSmsUrlForPlatform(lead.phone, welcomeBody, agentPlatform)
    : null;
  const qrValue = welcomeBody.trim()
    ? buildSmsUrlForQr(lead.phone, welcomeBody)
    : null;
  const canInlineSend = platformSupportsInlineSend(agentPlatform);
  const showQr = !platformIsMobile(agentPlatform) && !!qrValue;

  const advanceToActivation = useCallback((channel: 'agent_phone_sms' | 'continue') => {
    // Same event the action-item welcome surfaces fire — this surface
    // value marks the on-call ritual send (no _completed counterpart
    // here; activation on Card 3 is the delivery confirmation).
    captureEvent(ANALYTICS_EVENTS.WELCOME_SEND_INITIATED, {
      surface: 'close_sale_ritual',
      channel,
    });
    // Advance — we have no signal-back from the OS handler, and the
    // activation listener on Card 3 confirms delivery via the client
    // opening the app.
    setStage('activation');
  }, []);

  const handleSendWelcome = useCallback(() => {
    if (!smsHref) return;
    if (typeof window !== 'undefined') {
      window.location.href = smsHref;
    }
    advanceToActivation('agent_phone_sms');
  }, [smsHref, advanceToActivation]);

  const handleCopyWelcome = useCallback(async () => {
    if (!welcomeBody.trim()) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(welcomeBody);
        setCopied(true);
      }
    } catch {
      // Clipboard can be blocked; the textarea is right there to select
      // by hand, so we fail quietly rather than throw a scary error.
    }
  }, [welcomeBody]);

  if (!open) return null;

  // The household stage only exists when there are insured people to convert,
  // so the card list (and the step count) flex to 3 or 4.
  const stages: Stage[] = hasHousehold
    ? ['capture', 'household', 'welcome', 'activation']
    : ['capture', 'welcome', 'activation'];
  const stageIndex = Math.max(0, stages.indexOf(stage));
  const uploadEnabled = !!stagedFile && !!carrierType && !extracting;

  // Conveyor belt: each card is in a 100%-wide slot; the track
  // translates left by 100% per completed stage. Single transition,
  // matches the Add Client flow's animation feel.
  const trackStyle: CSSProperties = {
    transform: `translateX(-${stageIndex * 100}%)`,
    transition: 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)',
  };

  // In-page surface — NOT a modal. Matches the Add Client flow shell
  // on /dashboard/clients (max-w-4xl, brand border, sticky header) so
  // Close Sale feels like a continuation of the page, not a popup
  // floating over a blurred background. The slide-in animation
  // between LeadDetailPanel and this surface is owned by the parent
  // (queue right pane / standalone lead route).
  return (
    <div className="relative w-full max-w-4xl mx-auto bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] overflow-hidden flex flex-col">
      {/* Sticky header — matches incomingSurfaceHeaderClass on the
          Add Client flow. */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-gray-200 bg-white shrink-0">{/* keep this structure parallel to Add Client */}
          <div>
            <h2 className="text-lg font-bold text-[#0D4D4D]">Close Sale — {lead.name}</h2>
            <p className="text-xs text-[#707070] mt-0.5">
              Step {stageIndex + 1} of {stages.length} · {STAGE_LABEL[stage]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#000000] transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Conveyor track */}
        <div className="overflow-hidden flex-1">
          <div className="flex" style={trackStyle}>
            {/* ── CARD 1: Capture application ── */}
            <div className="w-full shrink-0 p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#0D4D4D] mb-1">
                  Application PDF
                </label>
                {!stagedFile ? (
                  <button
                    type="button"
                    onClick={handlePickFile}
                    className="w-full px-4 py-4 border-2 border-dashed border-[#0099FF]/30 hover:border-[#0099FF] bg-[#0099FF]/5 hover:bg-[#0099FF]/10 rounded-[5px] text-sm font-medium text-[#0099FF] transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Choose application PDF
                  </button>
                ) : (
                  <div className="rounded-[5px] border border-gray-300 bg-gray-50 px-3 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[#0D4D4D] truncate" title={stagedFile.name}>
                      {stagedFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={handlePickFile}
                      disabled={extracting}
                      className="text-xs font-semibold text-[#0099FF] hover:underline shrink-0 disabled:opacity-50"
                    >
                      Change file
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0D4D4D] mb-1">
                  Application Type <span className="text-red-600">*</span>
                </label>
                <select
                  value={carrierType}
                  onChange={(e) => setCarrierType(e.target.value as ApplicationFormType)}
                  disabled={extracting}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors disabled:opacity-60"
                >
                  <option value="">— Select carrier and form type —</option>
                  {APPLICATION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[#707070]">
                  Required. Picking the right carrier helps us read the form more accurately.
                </p>
              </div>

              {extracting && (
                <div className="rounded-[5px] border border-[#0099FF]/25 bg-[#0099FF]/5 p-3">
                  <div className="flex items-center justify-between text-xs text-[#0A5CA8] mb-1">
                    <span className="font-medium truncate pr-2">{extractProgress.label}</span>
                    <span>{extractProgress.pct}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0099FF] transition-all duration-300 ease-out"
                      style={{ width: `${extractProgress.pct}%` }}
                    />
                  </div>
                </div>
              )}

              {extractError && !extracting && (
                <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[5px] text-xs text-red-700">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="leading-relaxed">{extractError}</span>
                </div>
              )}

              {phoneConflict && !extracting && (
                <div className="rounded-[5px] border border-yellow-300 bg-yellow-50 p-3 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 shrink-0 mt-0.5 text-yellow-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                    </svg>
                    <div>
                      <p className="text-xs font-semibold text-yellow-900">Phone numbers don&apos;t match</p>
                      <p className="text-xs text-yellow-800 leading-relaxed mt-0.5">
                        The application shows a different number than this lead. Which is {lead.firstName}&apos;s number?
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => resolvePhoneConflict(false)}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] hover:border-[#45bcaa] rounded-[5px] text-left transition-colors"
                    >
                      <span className="block text-[10px] uppercase tracking-wide text-[#707070]">Keep lead&apos;s number</span>
                      <span className="text-sm font-medium text-[#0D4D4D]">{phoneConflict.leadPhone}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => resolvePhoneConflict(true)}
                      className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] hover:border-[#45bcaa] rounded-[5px] text-left transition-colors"
                    >
                      <span className="block text-[10px] uppercase tracking-wide text-[#707070]">Use application&apos;s number</span>
                      <span className="text-sm font-medium text-[#0D4D4D]">{phoneConflict.pdfPhone}</span>
                    </button>
                  </div>
                </div>
              )}

              {!phoneConflict && (
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!uploadEnabled}
                  className="w-full px-4 py-3 bg-[#0099FF] hover:bg-[#0079CC] text-white text-sm font-semibold rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {extracting ? 'Working...' : 'Upload'}
                </button>
              )}
            </div>

            {/* ── CARD 1.5: Add the household (only when insured people exist) ── */}
            {hasHousehold && (
              <div className="w-full shrink-0 p-6 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-[#0D4D4D]">
                    {insuredPeople.length === 1
                      ? `You're also writing ${insuredPeople[0].name.split(/\s+/)[0]}`
                      : `You're also writing ${insuredPeople.length} more people on this household`}
                  </p>
                  <p className="text-xs text-[#707070] mt-0.5 leading-relaxed">
                    Each becomes their own client, linked to {lead.firstName}. Add their application to record their policy too — or add them now and fill the policy in later. Each policy still counts as its own sale.
                  </p>
                </div>

                <div className="space-y-3">
                  {insuredPeople.map((person) => (
                    <HouseholdMemberRow
                      key={person.id}
                      person={person}
                      state={members[person.id] || EMPTY_MEMBER}
                      onFile={(file) => handleMemberFile(person.id, file)}
                      onCarrier={(c) => patchMember(person.id, { carrier: c })}
                      onUpload={() => void convertMember(person)}
                      onAddWithoutApp={() => void convertMember(person, { withoutApp: true })}
                      onLinkExisting={(existingId) => void convertMember(person, { linkToExistingClientId: existingId })}
                      onCreateAnyway={() => void convertMember(person, { force: true })}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setStage('welcome')}
                  disabled={membersWorking}
                  className="w-full px-4 py-3 bg-[#0D4D4D] hover:bg-[#005751] text-white text-sm font-semibold rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {convertedMembers.length === insuredPeople.length ? 'Continue' : 'Continue — send welcome text'}
                </button>
                {convertedMembers.length < insuredPeople.length && !membersWorking && (
                  <p className="text-center text-xs text-[#707070]">
                    Skip anyone whose application you don&apos;t have yet — they stay on the lead.
                  </p>
                )}
              </div>
            )}

            {/* ── CARD 2: Send welcome text ── */}
            <div className="w-full shrink-0 p-6 space-y-4">
              <div>
                <p className="text-xs text-[#707070] mb-1">To</p>
                <p className="text-sm font-medium text-[#0D4D4D]">
                  {lead.name} · {lead.phone}
                </p>
              </div>

              {policyQualityWarning && (
                <div className="flex items-start gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-[5px] text-xs text-yellow-800">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                  </svg>
                  <span className="leading-relaxed">{policyQualityWarning}</span>
                </div>
              )}

              {/* Voice-first path — the load-bearing one. The client is on
                  the phone right now, so reading the link + code aloud is the
                  surest delivery; the text below is a written backup that must
                  never block the close. */}
              <div className="rounded-[5px] border-2 border-[#0D4D4D]/15 bg-[#f0fbf9] px-4 py-3">
                <p className="text-sm font-semibold text-[#0D4D4D] flex items-center gap-1.5">
                  <span aria-hidden>📞</span> They&apos;re on the phone — just read this to them
                </p>
                <p className="mt-1.5 text-sm text-[#2d2d2d] leading-relaxed">
                  &ldquo;Go to <strong className="text-[#0D4D4D]">agentforlife.app/app</strong>
                  {clientCode ? (
                    <> and enter your code <strong className="font-mono text-[#0D4D4D]">{clientCode}</strong></>
                  ) : null}
                  .&rdquo;
                </p>
                <p className="mt-1.5 text-xs text-[#5f7a78]">
                  Card 3 lights up the moment they open the app. The text below is their written copy — send it however&apos;s easiest.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0D4D4D] mb-1">Welcome text (written backup)</label>
                <textarea
                  value={welcomeBody}
                  onChange={(e) => { setWelcomeBody(e.target.value); setCopied(false); }}
                  rows={10}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm leading-relaxed focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors font-mono"
                />
              </div>

              {/* Send + Copy. Send only appears on platforms whose browser can
                  hand an sms: URL to a messaging app; everywhere else Copy is
                  the primary action so there's no dead button. */}
              <div className="flex flex-wrap gap-2">
                {canInlineSend && smsHref ? (
                  <button
                    type="button"
                    onClick={handleSendWelcome}
                    disabled={!welcomeBody.trim()}
                    className="flex-1 min-w-[160px] px-4 py-3 bg-[#0099FF] hover:bg-[#0079CC] text-white text-sm font-semibold rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    {getSendButtonLabel(agentPlatform)}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => { void handleCopyWelcome(); }}
                  disabled={!welcomeBody.trim()}
                  className={`min-w-[120px] px-4 py-3 text-sm font-semibold rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                    canInlineSend
                      ? 'flex-none bg-white hover:bg-gray-50 text-[#0D4D4D]'
                      : 'flex-1 bg-[#0099FF] hover:bg-[#0079CC] text-white'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy text'}
                </button>
              </div>

              <p className="text-xs text-[#707070] leading-relaxed">{getSendCaption(agentPlatform)}</p>

              {/* QR escape hatch for desktop agents (incl. Windows + Edge +
                  Android, where the OS app-chooser dead-ends on Chrome). Scan
                  it with the phone you text from and Messages opens pre-filled
                  — no Phone Link setup required. Hidden on mobile, where
                  scanning the screen you're holding makes no sense. */}
              {showQr && qrValue ? (
                <details className="rounded-[5px] border border-[#e3e3e3] bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#0D4D4D]/70 hover:text-[#0D4D4D]">
                    Or scan with the phone you text from
                  </summary>
                  <div className="flex items-center gap-3 px-3 pb-3">
                    <div className="shrink-0 rounded-md bg-white p-1.5 border border-[#ececec]">
                      <QRCodeSVG value={qrValue} size={132} level="L" marginSize={0} />
                    </div>
                    <p className="text-[11px] text-[#4f4f4f] leading-snug">
                      Point your phone&apos;s camera at this code, tap the notification, and your texting app opens with everything pre-filled — works on any phone, no setup.
                    </p>
                  </div>
                </details>
              ) : null}

              <button
                type="button"
                onClick={() => advanceToActivation('continue')}
                className="w-full text-xs font-medium text-[#707070] hover:text-[#0D4D4D] underline underline-offset-2 transition-colors"
              >
                Texted it another way or read it aloud → walk them through the app now
              </button>
            </div>

            {/* ── CARD 3: Activation status ── */}
            <div className="w-full shrink-0 p-6 space-y-4">
              <p className="text-sm text-[#707070] leading-relaxed">
                Walk {lead.firstName} through the app. Stay on the line — this updates live as they install, allow notifications, and activate.
              </p>

              {clientId && (
                <ClientActivationStatusRow
                  agentId={agentId}
                  clientId={clientId}
                  variant="card"
                />
              )}

              {clientCode && (
                <p className="text-xs text-[#707070]">
                  {convertedMembers.length > 0 ? `${lead.firstName}'s` : 'Their'} login code is <strong className="font-mono text-[#0D4D4D]">{clientCode}</strong> — also at the bottom of the welcome text you sent.
                </p>
              )}

              {convertedMembers.length > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-3">
                  <p className="text-xs font-semibold text-[#0D4D4D] uppercase tracking-wider">
                    Household — {convertedMembers.length} more {convertedMembers.length === 1 ? 'person' : 'people'}
                  </p>
                  {convertedMembers.map(({ person, state }) => (
                    <div key={person.id} className="space-y-1.5">
                      <p className="text-xs font-medium text-[#0D4D4D]">
                        {person.name}
                        <span className="text-[#707070] font-normal"> · {relationshipLabel(person.relationship)}</span>
                      </p>
                      <ClientActivationStatusRow
                        agentId={agentId}
                        clientId={state.clientId!}
                        variant="card"
                      />
                      {state.clientCode && (
                        <p className="text-xs text-[#707070]">
                          Login code <strong className="font-mono text-[#0D4D4D]">{state.clientCode}</strong>
                          {state.qualityWarning ? ' · add their policy details from their profile later.' : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full px-4 py-3 bg-[#0D4D4D] hover:bg-[#005751] text-white text-sm font-semibold rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors flex items-center justify-center gap-2"
              >
                Done — close
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}

/**
 * One insured person in the household card: pick their application (→ extract
 * → their policy) and convert them into their own linked client, or add them
 * without an application (client now, policy later). Surfaces a per-person
 * progress bar, error, and a duplicate-client resolve prompt.
 */
function HouseholdMemberRow({
  person,
  state,
  onFile,
  onCarrier,
  onUpload,
  onAddWithoutApp,
  onLinkExisting,
  onCreateAnyway,
}: {
  person: CloseSalePerson;
  state: MemberState;
  onFile: (file: File | null) => void;
  onCarrier: (c: ApplicationFormType | '') => void;
  onUpload: () => void;
  onAddWithoutApp: () => void;
  onLinkExisting: (clientId: string) => void;
  onCreateAnyway: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const working = state.status === 'working';
  const done = state.status === 'done';
  const canUpload = !!state.file && !!state.carrier && !working;
  const rel = relationshipLabel(person.relationship);
  const first = person.name.split(/\s+/)[0] || person.name;

  return (
    <div className={`rounded-[5px] border p-3 ${done ? 'border-[#45bcaa] bg-[#f0fbf9]' : 'border-gray-300 bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#0D4D4D] truncate">
          {person.name}
          {rel && <span className="text-[#707070] font-normal"> · {rel}</span>}
        </p>
        {done && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#daf3f0] text-[#005851] text-[10px] font-semibold rounded-full shrink-0">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Converted
          </span>
        )}
      </div>

      {done ? (
        <p className="mt-1 text-xs text-[#707070]">
          Now their own client
          {state.clientCode ? <> · code <strong className="font-mono text-[#0D4D4D]">{state.clientCode}</strong></> : null}
          {state.qualityWarning ? ' · add policy details on their profile later.' : ''}
        </p>
      ) : working ? (
        <div className="mt-2 rounded-[5px] border border-[#0099FF]/25 bg-[#0099FF]/5 p-2">
          <div className="flex items-center justify-between text-[11px] text-[#0A5CA8] mb-1">
            <span className="font-medium truncate pr-2">{state.progress.label || 'Working…'}</span>
            <span>{state.progress.pct}%</span>
          </div>
          <div className="h-1 w-full bg-white rounded-full overflow-hidden">
            <div className="h-full bg-[#0099FF] transition-all duration-300 ease-out" style={{ width: `${state.progress.pct}%` }} />
          </div>
        </div>
      ) : state.match ? (
        <div className="mt-2 rounded-[5px] border border-yellow-300 bg-yellow-50 p-2.5 space-y-2">
          <p className="text-xs text-yellow-900 leading-relaxed">
            <strong>{state.match.existingClientName || 'An existing client'}</strong> looks like the same person. Link {first} to them, or create a new client?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onLinkExisting(state.match!.existingClientId)}
              className="flex-1 px-3 py-1.5 bg-white border border-[#d0d0d0] hover:border-[#45bcaa] rounded-[5px] text-xs font-semibold text-[#0D4D4D] transition-colors"
            >
              Link to them
            </button>
            <button
              type="button"
              onClick={onCreateAnyway}
              className="flex-1 px-3 py-1.5 bg-white border border-[#d0d0d0] hover:border-[#45bcaa] rounded-[5px] text-xs font-semibold text-[#0D4D4D] transition-colors"
            >
              Create new
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {!state.file ? (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full px-3 py-2 border-2 border-dashed border-[#0099FF]/30 hover:border-[#0099FF] bg-[#0099FF]/5 rounded-[5px] text-xs font-medium text-[#0099FF] transition-all"
              >
                Upload {first}&apos;s application
              </button>
              <button
                type="button"
                onClick={onAddWithoutApp}
                className="w-full px-3 py-2 text-xs font-medium text-[#707070] hover:text-[#0D4D4D] border border-gray-300 rounded-[5px] hover:bg-gray-50 transition-colors"
              >
                Add {first} without an application
              </button>
            </>
          ) : (
            <>
              <div className="rounded-[5px] border border-gray-300 bg-gray-50 px-2.5 py-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#0D4D4D] truncate" title={state.file.name}>{state.file.name}</span>
                <button type="button" onClick={() => inputRef.current?.click()} className="text-[11px] font-semibold text-[#0099FF] hover:underline shrink-0">Change</button>
              </div>
              <select
                value={state.carrier}
                onChange={(e) => onCarrier(e.target.value as ApplicationFormType)}
                className="w-full px-2.5 py-2 bg-white border border-[#d0d0d0] rounded-[5px] text-xs text-[#000000] focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30"
              >
                <option value="">— Select carrier and form type —</option>
                {APPLICATION_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={onUpload}
                disabled={!canUpload}
                className="w-full px-3 py-2 bg-[#0099FF] hover:bg-[#0079CC] text-white text-xs font-semibold rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add {first} + their policy
              </button>
            </>
          )}
          {state.error && <p className="text-xs text-red-700">{state.error}</p>}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; onFile(f); }}
          />
        </div>
      )}
    </div>
  );
}
