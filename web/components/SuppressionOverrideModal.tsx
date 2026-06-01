'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';

/**
 * Confirm + typed-reason modal shown when an agent is about to
 * manually message a number that's currently on the suppression list.
 *
 * Per `docs/afl-compliance-layer-whatwhy.md` Feature 1 — Manual sends:
 *
 *   "Surface a blocking warning that the number opted out, and require
 *    a deliberate, recorded override to proceed. Don't hard-block it
 *    outright — but make it a conscious, logged act, not an accident."
 *
 * UX:
 *   - Required textarea for the agent's reason (>= 8 chars).
 *   - "Cancel" closes the modal without firing the override.
 *   - "Message them anyway" POSTs `/api/compliance/override` with the
 *     typed reason, awaits the consent_events write, then calls
 *     `onConfirmed` so the parent can proceed with the actual send
 *     (sms: URL, in-app composer, etc.).
 *
 * The override does NOT clear suppression. The next automated send to
 * this number still hits the gate; this is a one-shot human-judgment
 * exception that becomes evidence in the audit ledger.
 */
export interface SuppressionOverrideModalProps {
  open: boolean;
  phoneE164: string;
  subjectName?: string | null;
  /**
   * Lane label written to the consent event. Defaults to
   * 'manual_send' — pass a specific lane (e.g. 'welcome_activation')
   * when the modal is triggered from a lane-specific surface so
   * downstream audit queries can filter by it.
   */
  lane?: string;
  /** Free-form structured context written alongside the event. */
  context?: Record<string, unknown>;
  user: User | null;
  onCancel: () => void;
  /** Fired AFTER the override event is successfully written. */
  onConfirmed: () => void;
}

export default function SuppressionOverrideModal({
  open,
  phoneE164,
  subjectName,
  lane = 'manual_send',
  context,
  user,
  onCancel,
  onConfirmed,
}: SuppressionOverrideModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 8 && !submitting && !!user;

  const subjectLabel = subjectName?.trim() || phoneE164;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/compliance/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          phoneE164,
          lane,
          typedReason: trimmed,
          context: context ?? null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Override failed (${res.status})`);
      }
      setReason('');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record override.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (submitting) return;
    setReason('');
    setError(null);
    onCancel();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="suppression-override-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <span aria-hidden="true" className="text-2xl">⛔</span>
          <div>
            <h2 id="suppression-override-title" className="text-base font-bold text-[#0D4D4D]">
              {subjectLabel} opted out
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-[#4f4f4f]">
              This number is on the global opt-out list. Automated outreach
              is suppressed for them across every agent and lane. If you
              still need to reach them, tell us why — we&apos;ll log it.
            </p>
          </div>
        </div>

        <label className="mb-1 block text-[12px] font-semibold text-[#0D4D4D]">
          Reason for messaging anyway
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Returning their call from this morning; they asked me to text the quote."
          rows={3}
          disabled={submitting}
          className="w-full rounded-lg border border-[#d0d0d0] p-2 text-[13px] focus:border-[#0D4D4D] focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-[#7a7a7a]">
          Minimum 8 characters. Logged to the consent ledger with your name and timestamp.
        </p>

        {error ? (
          <p className="mt-2 text-[12px] font-semibold text-[#b42318]">{error}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="rounded-lg border border-[#d0d0d0] px-3 py-1.5 text-[13px] font-semibold text-[#0D4D4D] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-[#b42318] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Logging…' : 'Message them anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
