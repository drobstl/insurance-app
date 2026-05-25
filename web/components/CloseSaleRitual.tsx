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
 *   Card 2 — Send welcome text
 *     Editable textarea pre-filled with the locked May 24 welcome
 *     copy. Send button is environment-aware: "Send via iMessage"
 *     on Mac, "Send via text" elsewhere. Opens the OS Messages
 *     handler via sms:; the welcome action item queued by the
 *     convert endpoint stays in the queue as a safety net if the
 *     agent never gets here.
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
import {
  APPLICATION_TYPE_OPTIONS,
  type ApplicationFormType,
} from '../lib/application-type-options';
import { mapExtractedApplicationToPolicyFormData } from '../lib/extracted-to-policy-form-data';
import { runApplicationExtractionV3 } from '../lib/run-application-extraction-v3';
import { buildCloseSaleWelcomeBody } from '../lib/welcome-sms-body';
import { ClientActivationStatusRow } from './ClientActivationStatusRow';

const MAX_PDF_BYTES = 25 * 1024 * 1024;

type Stage = 'capture' | 'welcome' | 'activation';

interface CloseSaleLead {
  id: string;
  name: string;
  firstName: string;
  phone: string;
}

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

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '')
    || /Mac OS X/i.test(navigator.userAgent || '');
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

  // ── Card 2 state ──
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientCode, setClientCode] = useState<string | null>(null);
  const [welcomeBody, setWelcomeBody] = useState('');
  const isMac = useMemo(() => detectMac(), []);

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
    setClientId(null);
    setClientCode(null);
    setWelcomeBody('');
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

  const handleUpload = useCallback(async () => {
    if (!stagedFile || !carrierType || extracting) return;
    setExtracting(true);
    setExtractError(null);
    setExtractProgress({ pct: 0, label: 'Starting...' });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 1. Extract policy data from PDF via carrier-aware v3 pipeline.
      const extracted = await runApplicationExtractionV3({
        user,
        file: stagedFile,
        carrierFormType: carrierType,
        signal: controller.signal,
        onProgress: (pct, label) => setExtractProgress({ pct, label }),
      });

      // 2. Convert lead → client. The convert endpoint also queues
      //    the welcome action item via the other session's PR #19
      //    work, so the queue safety net is in place from this
      //    moment forward regardless of whether the agent finishes
      //    the ritual.
      setExtractProgress({ pct: 96, label: 'Converting lead to client...' });
      const token = await user.getIdToken();
      const convertRes = await fetch(`/api/leads/${lead.id}/convert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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

      // 3. Create the policy on the new client. We send the
      //    ingestionQualityGate flag so the backend rejects policies
      //    with <2 extracted signals — that's the "extraction was
      //    too thin to be useful" case. When that happens, we don't
      //    error out the ritual; convert already succeeded. We just
      //    flag the warning so the agent knows to fill in fields
      //    later from the new client profile.
      setExtractProgress({ pct: 98, label: 'Creating policy...' });
      const policyPayload = mapExtractedApplicationToPolicyFormData(extracted.data);
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

      // 4. Stash client info for Cards 2 + 3, build the welcome
      //    SMS body, advance.
      setClientId(newClientId);
      setClientCode(newClientCode);
      setWelcomeBody(buildCloseSaleWelcomeBody({
        clientFirstName: lead.firstName,
        agentName,
        clientCode: newClientCode,
      }));
      onConverted(newClientId);
      setStage('welcome');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setExtractError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setExtracting(false);
      abortRef.current = null;
    }
  }, [stagedFile, carrierType, extracting, user, agentName, lead.id, lead.firstName, onConverted]);

  // ── Card 2 send ──
  const handleSendWelcome = useCallback(() => {
    if (!welcomeBody) return;
    const url = `sms:${lead.phone}${isMac ? '&' : '?'}body=${encodeURIComponent(welcomeBody)}`;
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
    // Advance immediately — we have no signal-back from the OS handler,
    // and the agent has the activation listener on Card 3 to confirm
    // delivery via the client opening the app.
    setStage('activation');
  }, [welcomeBody, isMac, lead.phone]);

  if (!open) return null;

  const stageIndex = stage === 'capture' ? 0 : stage === 'welcome' ? 1 : 2;
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
              Step {stageIndex + 1} of 3 · {stage === 'capture' ? 'Capture application' : stage === 'welcome' ? 'Send welcome text' : 'Activation status'}
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

              <button
                type="button"
                onClick={handleUpload}
                disabled={!uploadEnabled}
                className="w-full px-4 py-3 bg-[#0099FF] hover:bg-[#0079CC] text-white text-sm font-semibold rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {extracting ? 'Working...' : 'Upload'}
              </button>
            </div>

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

              <div>
                <label className="block text-sm font-semibold text-[#0D4D4D] mb-1">Welcome message</label>
                <textarea
                  value={welcomeBody}
                  onChange={(e) => setWelcomeBody(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm leading-relaxed focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]/30 transition-colors font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleSendWelcome}
                disabled={!welcomeBody.trim()}
                className="w-full px-4 py-3 bg-[#0099FF] hover:bg-[#0079CC] text-white text-sm font-semibold rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                {isMac ? 'Send via iMessage' : 'Send via text'}
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
                  Their login code is <strong className="font-mono text-[#0D4D4D]">{clientCode}</strong> — also at the bottom of the welcome text you sent.
                </p>
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
