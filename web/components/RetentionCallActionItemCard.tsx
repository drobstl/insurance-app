'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

import { ANALYTICS_EVENTS } from '../lib/analytics-events';
import { captureEvent } from '../lib/posthog';
import type { ActionItemDoc } from '../lib/action-item-types';

/**
 * Retention call action item card.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > Lapse / Retention.
 * Stage 3 in the push-eligible cadence (or Stage 2 in the not-eligible
 * cadence) — the agent's first personal-action prompt after the
 * automated touches have gone unanswered.
 *
 * One big CTA: `📞 Call`. Opens `tel:{phoneE164}` on the agent's
 * device. Plus a small `Skip` secondary action that closes the item
 * without acting (cron timer still advances at 48h, so skipping just
 * dismisses the card sooner).
 *
 * Intentional simplicity: no `📞` icon dependency, no copy-text
 * fallback, no QR code. Calling is fundamentally a single-device
 * action — there is no desktop equivalent that helps. Desktop
 * agents see the same card and tap to dial via their phone (or
 * read the number off and dial manually).
 */

interface RetentionCallActionItemCardProps {
  item: ActionItemDoc;
  user: User | null;
  onCompleted?: () => void;
}

function ageBucket(days: number): 'fresh' | 'aging' | 'urgent' {
  if (days < 2) return 'fresh';
  if (days < 5) return 'aging';
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

export default function RetentionCallActionItemCard({
  item,
  user,
  onCompleted,
}: RetentionCallActionItemCardProps) {
  const phone = item.displayContext.subjectPhoneE164 || '';
  const subjectFirst =
    item.displayContext.subjectFirstName ||
    item.displayContext.subjectName ||
    'Client';

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
      lane: 'retention',
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
        console.error('[retention-call-card] mark-viewed failed (non-blocking)', err);
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
        lane: 'retention',
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

  return (
    <article className={`rounded-xl border-2 px-4 py-3 transition-colors ${styles.container}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0D4D4D]">Call {subjectFirst}</p>
          <p className="text-[12px] text-[#4f4f4f] mt-0.5">
            {phone || 'No phone on file'} · retention · 1st SMS unanswered
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles.pill}`}>
          {ageLabel(ageDays)}
        </span>
      </div>

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
          Skip
        </button>
        {telHref ? (
          <a
            href={telHref}
            onClick={() => { void completeWith('call'); }}
            className="inline-flex items-center gap-1 rounded-lg bg-[#3DD6C3] px-3 py-1.5 text-xs font-bold text-[#0D4D4D] hover:bg-[#32c4b2] active:scale-[0.97] transition"
          >
            📞 Call
          </a>
        ) : null}
      </div>
    </article>
  );
}
