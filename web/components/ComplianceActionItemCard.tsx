'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

import { ANALYTICS_EVENTS } from '../lib/analytics-events';
import { captureEvent } from '../lib/posthog';
import type { ActionItemDoc } from '../lib/action-item-types';

/**
 * Compliance action item card.
 *
 * Renders two trigger reasons:
 *
 *  - `compliance_client_opted_out` — "{Client} replied STOP. AFL is
 *    suppressing all further outbound. You can still call them.
 *    Tap to view the message."
 *
 *  - `compliance_re_engagement_attempt` — "Suppressed number {X} sent:
 *    '{message}'. Decide whether to re-engage."
 *
 * Both surface `📞 Call` (tel: URL) + `Dismiss` (skip). Texting is
 * intentionally NOT surfaced — the body the agent would have texted
 * is exactly what the spec just suppressed; an override has to be
 * deliberate, started from the client/lead detail surface (where the
 * agent has full context) rather than the action item card.
 */

interface ComplianceActionItemCardProps {
  item: ActionItemDoc;
  user: User | null;
  onCompleted?: () => void;
}

function ageBucket(days: number): 'fresh' | 'aging' | 'urgent' {
  if (days < 7) return 'fresh';
  if (days < 30) return 'aging';
  return 'urgent';
}

function classesForAge(age: ReturnType<typeof ageBucket>): { container: string; pill: string } {
  if (age === 'urgent') {
    return {
      container: 'border-[#f3a8a8] bg-[#fff5f5]',
      pill: 'bg-[#fde6e6] text-[#b42318]',
    };
  }
  if (age === 'aging') {
    return {
      container: 'border-[#f1c97a] bg-[#fff8e8]',
      pill: 'bg-[#fde9c4] text-[#7a4a00]',
    };
  }
  return {
    container: 'border-[#d0d0d0] bg-white',
    pill: 'bg-[#f0f0f0] text-[#5f5f5f]',
  };
}

function ageLabel(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

export default function ComplianceActionItemCard({
  item,
  user,
  onCompleted,
}: ComplianceActionItemCardProps) {
  const phone = item.displayContext.subjectPhoneE164 || '';
  const subjectFirst =
    item.displayContext.subjectFirstName ||
    item.displayContext.subjectName ||
    'Client';
  const inboundExcerpt = item.displayContext.inboundExcerpt ?? null;

  const ageDays = useMemo(() => {
    const created = Date.parse(item.createdAt);
    if (!Number.isFinite(created)) return 0;
    return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
  }, [item.createdAt]);

  const age = ageBucket(ageDays);
  const styles = classesForAge(age);

  const [completing, setCompleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    if (!user) return;
    captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_VIEWED, {
      lane: 'compliance',
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
        console.error('[compliance-card] mark-viewed failed (non-blocking)', err);
      }
    })();
  }, [user, item.itemId, item.triggerReason, item.viewCount, ageDays]);

  const completeWith = async (
    completionAction: 'call' | 'skip',
    completionNote?: string | null,
  ) => {
    if (!user || completing) return;
    setCompleting(true);
    setErrorMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent/action-items/${item.itemId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ completionAction, completionNote: completionNote ?? null }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `complete failed (${res.status})`);
      }
      captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_COMPLETED, {
        lane: 'compliance',
        trigger_reason: item.triggerReason,
        completion_action: completionAction,
        age_days: ageDays,
        view_count_at_completion: item.viewCount + 1,
      });
      onCompleted?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not record action.');
    } finally {
      setCompleting(false);
    }
  };

  const telHref = phone ? `tel:${phone}` : null;

  const isOptOut = item.triggerReason === 'compliance_client_opted_out';
  const title = isOptOut ? `${subjectFirst} opted out` : `${subjectFirst} reached out`;
  const subtitle = isOptOut
    ? 'AFL is suppressing all further automated outbound. You can still call them.'
    : 'This number is opted out. They messaged anyway — your call whether to re-engage.';

  return (
    <article className={`rounded-xl border-2 px-4 py-3 transition-colors ${styles.container}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0D4D4D] flex items-center gap-1.5">
            <span aria-hidden="true">⛔</span>
            {title}
          </p>
          <p className="text-[12px] text-[#4f4f4f] mt-0.5">
            {phone || 'No phone on file'} · compliance
          </p>
          <p className="text-[12px] text-[#5f5f5f] mt-1 leading-snug">{subtitle}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles.pill}`}>
          {ageLabel(ageDays)}
        </span>
      </div>

      {inboundExcerpt ? (
        <blockquote className="mt-2 rounded-lg border border-[#e8e8e8] bg-white/70 px-3 py-2 text-[12px] italic leading-snug text-[#2d2d2d]">
          “{inboundExcerpt}”
        </blockquote>
      ) : null}

      {errorMsg ? (
        <p className="mt-2 text-[11px] font-semibold text-[#b42318]">{errorMsg}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => { void completeWith('skip'); }}
          disabled={completing}
          className="inline-flex items-center gap-1 rounded-lg border border-[#d0d0d0] bg-white px-3 py-1.5 text-xs font-bold text-[#5f5f5f] hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Dismiss
        </button>
        {telHref ? (
          <a
            href={telHref}
            onClick={() => { void completeWith('call'); }}
            className="inline-flex items-center gap-1 rounded-lg bg-[#0D4D4D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0a3d3d] active:scale-[0.97] transition"
          >
            📞 Call
          </a>
        ) : null}
      </div>
    </article>
  );
}
