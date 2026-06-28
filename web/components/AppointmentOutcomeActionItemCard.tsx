'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

import { ANALYTICS_EVENTS } from '../lib/analytics-events';
import { captureEvent } from '../lib/posthog';
import { ActionItemSubjectLink } from './ActionItemSubjectLink';
import type {
  ActionItemDoc,
  ActionItemSuggestedAction,
} from '../lib/action-item-types';
import { useDashboard } from '../app/dashboard/DashboardContext';
import FifResetCapture, {
  EMPTY_FIF_RESET,
  isHttpUrl,
  type FifResetValue,
} from './FifResetCapture';

/**
 * Appointment-outcome action item card.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > Phase 2 follow-up > Close-the-sale
 * ritual & funnel polish > Day-after appointment outcome.
 *
 * Renders one card per booked appointment that didn't get an outcome
 * marker within 18 hours of `scheduledAt`. Surfaces the four outcome
 * choices (sit-no-sale, sit-think-about-it, no-show, cancelled) plus
 * skip. Each outcome button does two things in sequence:
 *
 *   1. PATCH /api/appointments/{apptId} with the corresponding `status`
 *      value — this is the canonical funnel-data update; the appointment
 *      doc is the source of truth that activity-stats.ts reads for
 *      book/show/close rate math.
 *   2. POST /api/agent/action-items/{itemId}/complete with the
 *      corresponding `mark_outcome_*` completionAction — closes the
 *      card and records WHICH outcome was picked for telemetry.
 *
 * If the PATCH fails the card surfaces the error and does NOT mark
 * the action item completed — agent can retry. If the PATCH succeeds
 * but the complete fails (rare), the action item stays open but the
 * appointment status is updated; the cron's idempotency key prevents
 * the same item from being re-queued on the next run, and the daily
 * expiry cron will eventually close it as unhandled.
 */

interface AppointmentOutcomeActionItemCardProps {
  item: ActionItemDoc;
  user: User | null;
  onCompleted?: () => void;
}

type OutcomeChoice = {
  /** The new appointment status to PATCH onto the appointment doc. */
  status: 'sit_no_sale' | 'sit_think_about_it' | 'no_show' | 'cancelled';
  /** The action item lane vocabulary value for completion telemetry. */
  completionAction: Extract<
    ActionItemSuggestedAction,
    'mark_outcome_no_sale' | 'mark_outcome_think_about_it' | 'mark_outcome_no_show' | 'mark_outcome_cancelled'
  >;
  /** Button label. */
  label: string;
  /** Optional sub-label / coaching for the agent. */
  hint: string;
  /** Tailwind class chunk for button color. */
  tone: string;
};

// Order matches the suggested-actions order in ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE
// for the appointment_outcome lane. Most-likely outcomes first.
const OUTCOMES: readonly OutcomeChoice[] = [
  {
    status: 'sit_no_sale',
    completionAction: 'mark_outcome_no_sale',
    label: 'Showed — no sale',
    hint: 'They showed up; you didn\'t close. Counts as a show.',
    tone: 'bg-[#0099FF] hover:bg-[#0079CC] text-white',
  },
  {
    status: 'sit_think_about_it',
    completionAction: 'mark_outcome_think_about_it',
    label: 'Showed — thinking about it',
    hint: 'They showed up; they\'re deliberating. Counts as a show.',
    tone: 'bg-[#0099FF] hover:bg-[#0079CC] text-white',
  },
  {
    status: 'no_show',
    completionAction: 'mark_outcome_no_show',
    label: 'No-show',
    hint: 'They didn\'t show up.',
    tone: 'bg-white hover:bg-gray-50 text-[#0D4D4D] border-[#d0d0d0]',
  },
  {
    status: 'cancelled',
    completionAction: 'mark_outcome_cancelled',
    label: 'Cancelled',
    hint: 'The meeting was cancelled.',
    tone: 'bg-white hover:bg-gray-50 text-[#0D4D4D] border-[#d0d0d0]',
  },
];

function formatScheduledAt(iso: string | null | undefined, tzShort: string | null | undefined): string {
  if (!iso) return 'the meeting';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'the meeting';
  const dayLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  // Local-time formatting via toLocaleTimeString — the tzShort is for
  // labeling, not for re-zoning, since browsers will render in the
  // agent's local zone which is what they actually want to see.
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
  return tzShort ? `${dayLabel} at ${time} ${tzShort}` : `${dayLabel} at ${time}`;
}

export default function AppointmentOutcomeActionItemCard({
  item,
  user,
  onCompleted,
}: AppointmentOutcomeActionItemCardProps) {
  const { agentProfile, rememberFifResetSme } = useDashboard();
  const ctx = item.displayContext;
  const subjectName = ctx.subjectName || ctx.subjectFirstName || 'this client';
  const subjectFirstName = ctx.subjectFirstName || ctx.subjectName?.split(/\s+/)[0] || 'this client';
  const apptId = item.linkedEntityId;
  const scheduledLabel = useMemo(
    () => formatScheduledAt(ctx.appointmentScheduledAt, ctx.appointmentScheduledTzShort),
    [ctx.appointmentScheduledAt, ctx.appointmentScheduledTzShort],
  );

  const ageDays = useMemo(() => {
    const created = Date.parse(item.createdAt);
    if (!Number.isFinite(created)) return 0;
    return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
  }, [item.createdAt]);

  const [busyChoice, setBusyChoice] = useState<OutcomeChoice['status'] | 'skip' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Orthogonal FIF reset add-on — whatever the agent set here rides along
  // with the outcome PATCH below, so a reset can stack on any outcome.
  const [fifReset, setFifReset] = useState<FifResetValue>(EMPTY_FIF_RESET);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    if (!user) return;
    captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_VIEWED, {
      lane: 'appointment_outcome',
      trigger_reason: item.triggerReason,
      view_count_after: item.viewCount + 1,
      age_days: ageDays,
    });
    (async () => {
      try {
        const token = await user.getIdToken();
        await fetch(`/api/agent/action-items/${item.itemId}/view`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error('[appointment-outcome-card] mark-viewed failed (non-blocking)', err);
      }
    })();
  }, [user, item.itemId, item.triggerReason, item.viewCount, ageDays]);

  const completeWithOutcome = async (choice: OutcomeChoice) => {
    if (!user || busyChoice) return;
    setBusyChoice(choice.status);
    setErrorMsg(null);
    try {
      const token = await user.getIdToken();
      // 1. PATCH the appointment doc with the chosen status. This is
      //    the source-of-truth update; activity-stats reads from here.
      const patchBody: Record<string, unknown> = { status: choice.status };
      if (fifReset.booked) {
        patchBody.fifResetBooked = true;
        patchBody.fifResetSmeName = fifReset.smeName.trim() || null;
        patchBody.fifResetSmeCalendarUrl = fifReset.calendarUrl.trim() || null;
      }
      const patchRes = await fetch(`/api/appointments/${apptId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patchBody),
      });
      if (!patchRes.ok) {
        const j = (await patchRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Couldn't update appointment status (${patchRes.status})`);
      }
      // 2. Mark the action item completed. If this fails, the data was
      //    still written; the item will close via the daily expiry cron
      //    or on the next page load when the cron re-runs (idempotent).
      const completeRes = await fetch(`/api/agent/action-items/${item.itemId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ completionAction: choice.completionAction, completionNote: null }),
      });
      if (!completeRes.ok) {
        const j = (await completeRes.json().catch(() => null)) as { error?: string } | null;
        // Soft-fail: data was already written. Surface a quiet warning
        // and still call onCompleted so the card disappears from the
        // queue UI.
        console.warn('[appointment-outcome-card] complete failed after PATCH ok', j?.error);
      }
      captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_COMPLETED, {
        lane: 'appointment_outcome',
        trigger_reason: item.triggerReason,
        completion_action: choice.completionAction,
        age_days: ageDays,
        view_count_at_completion: item.viewCount + 1,
      });
      if (fifReset.booked) {
        const smeName = fifReset.smeName.trim();
        const calendarUrl = fifReset.calendarUrl.trim();
        captureEvent(ANALYTICS_EVENTS.FIF_RESET_BOOKED, {
          appointment_id: apptId,
          primary_status: choice.status,
          has_calendar_url: isHttpUrl(calendarUrl),
          sme_is_repeat:
            !!smeName &&
            (agentProfile.fifResetSmes ?? []).some(
              (s) => s.name.trim().toLowerCase() === smeName.toLowerCase(),
            ),
          surface: 'appointment_outcome_card',
        });
        // Remember the SME (name + link) for next time's prefill.
        if (smeName) {
          void rememberFifResetSme({ name: smeName, calendarUrl: calendarUrl || undefined });
        }
      }
      onCompleted?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not record outcome.');
    } finally {
      setBusyChoice(null);
    }
  };

  const completeWithSkip = async () => {
    if (!user || busyChoice) return;
    setBusyChoice('skip');
    setErrorMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent/action-items/${item.itemId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ completionAction: 'skip', completionNote: null }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Couldn't skip (${res.status})`);
      }
      captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_COMPLETED, {
        lane: 'appointment_outcome',
        trigger_reason: item.triggerReason,
        completion_action: 'skip',
        age_days: ageDays,
        view_count_at_completion: item.viewCount + 1,
      });
      onCompleted?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not skip.');
    } finally {
      setBusyChoice(null);
    }
  };

  return (
    <div className="rounded-xl border border-[#d0d0d0] bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0D4D4D]">
            How did your meeting with {subjectFirstName} go?
          </p>
          <p className="mt-0.5 text-xs text-[#5f5f5f]">
            <ActionItemSubjectLink clientId={item.clientId} prospectId={item.prospectId}>{subjectName}</ActionItemSubjectLink> · {scheduledLabel}
          </p>
        </div>
        <span className="inline-block shrink-0 rounded bg-[#f0f0f0] px-2 py-0.5 text-[10px] font-bold text-[#5f5f5f]">
          {ageDays <= 0 ? 'Today' : ageDays === 1 ? '1d ago' : `${ageDays}d ago`}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
        {OUTCOMES.map((choice) => (
          <button
            key={choice.status}
            type="button"
            onClick={() => void completeWithOutcome(choice)}
            disabled={busyChoice !== null}
            className={`text-left px-3 py-2.5 text-xs font-semibold rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50 ${choice.tone}`}
          >
            <span className="block">{busyChoice === choice.status ? 'Saving…' : choice.label}</span>
            <span className="block mt-0.5 text-[10px] font-normal opacity-80">{choice.hint}</span>
          </button>
        ))}
      </div>

      <div className="mb-2 rounded-[5px] border border-[#ececec] bg-[#FAFAF7] px-3 py-2">
        <FifResetCapture
          value={fifReset}
          onChange={setFifReset}
          rememberedSmes={agentProfile.fifResetSmes ?? []}
          disabled={busyChoice !== null}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void completeWithSkip()}
          disabled={busyChoice !== null}
          className="text-xs font-semibold text-[#5f5f5f] hover:text-[#0D4D4D] hover:underline disabled:opacity-50"
        >
          {busyChoice === 'skip' ? 'Skipping…' : 'Don\'t remember · skip'}
        </button>
        {errorMsg && (
          <p className="text-[11px] text-[#b42318]">{errorMsg}</p>
        )}
      </div>
    </div>
  );
}
