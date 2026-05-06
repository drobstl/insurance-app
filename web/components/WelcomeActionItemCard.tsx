'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

import { ANALYTICS_EVENTS } from '../lib/analytics-events';
import { captureEvent } from '../lib/posthog';
import type { ActionItemDoc } from '../lib/action-item-types';

/**
 * Phase 1 Track B — welcome action item card.
 *
 * The "one-tap UI primitive" the CONTEXT.md > Channel Rules > Agent
 * action item surface section calls out as reusable across lanes.
 * Phase 1 only renders welcome items; Phase 2 lanes (anniversary,
 * retention, referral) will reuse this component with different
 * suggestedActions.
 *
 * Mobile + desktop variants:
 *
 * - On the mobile installed PWA (`canSendFromPhone === true`), the
 *   primary action is a real `sms:` URL anchor — tapping opens iMessage
 *   pre-filled with the agent's locked welcome body. Once the iMessage
 *   composer launches, the API marks the item completed
 *   (`completionAction: 'text_personally'`) so the queue surface
 *   updates without waiting for the agent to confirm sending.
 *
 * - On desktop OR a non-installed mobile browser, the card renders a
 *   read-only "Open AFL on your phone to send" affordance instead.
 *   This is the locked Phase 1 constraint: NO desktop send fallback,
 *   not via deep link, not via QR code, not via Continuity.
 *
 * Age affordances per the welcome_age_variant default chosen up-front:
 * subtle color shift (neutral → amber at 4d → red at 15d) plus
 * "Nd ago" badge on every row.
 */

interface WelcomeActionItemCardProps {
  item: ActionItemDoc;
  user: User | null;
  canSendFromPhone: boolean;
  onCompleted?: () => void;
}

function ageBucket(days: number): 'fresh' | 'aging' | 'urgent' {
  if (days < 4) return 'fresh';
  if (days < 15) return 'aging';
  return 'urgent';
}

function classesForAge(age: ReturnType<typeof ageBucket>): { container: string; pill: string; pillText: string } {
  if (age === 'urgent') {
    return {
      container: 'border-[#f3a8a8] bg-[#fff5f5]',
      pill: 'bg-[#fde6e6] text-[#b42318]',
      pillText: 'text-[#b42318]',
    };
  }
  if (age === 'aging') {
    return {
      container: 'border-[#f1c97a] bg-[#fff8e8]',
      pill: 'bg-[#fde9c4] text-[#7a4a00]',
      pillText: 'text-[#7a4a00]',
    };
  }
  return {
    container: 'border-[#d0d0d0] bg-white',
    pill: 'bg-[#f0f0f0] text-[#5f5f5f]',
    pillText: 'text-[#5f5f5f]',
  };
}

function ageLabel(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

export default function WelcomeActionItemCard({
  item,
  user,
  canSendFromPhone,
  onCompleted,
}: WelcomeActionItemCardProps) {
  const phone = item.displayContext.subjectPhoneE164 || '';
  const body = item.displayContext.welcomeMessageBody || '';
  const subjectFirst = item.displayContext.subjectFirstName
    || item.displayContext.subjectName
    || 'New client';

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

  // Mark viewed once on first render. Server-side view counter +
  // client-side telemetry both fire here.
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    if (!user) return;
    captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_VIEWED, {
      lane: 'welcome',
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
        console.error('[welcome-card] mark-viewed failed (non-blocking)', err);
      }
    })();
  }, [user, item.itemId, item.triggerReason, item.viewCount, ageDays]);

  const completePersonally = async () => {
    if (!user || completing) return;
    setCompleting(true);
    setErrorMsg(null);
    captureEvent(ANALYTICS_EVENTS.WELCOME_SEND_INITIATED, {
      surface: 'mobile_pwa_action_items',
      channel: 'agent_phone_sms',
    });
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent/action-items/${item.itemId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ completionAction: 'text_personally' }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `complete failed (${res.status})`);
      }
      captureEvent(ANALYTICS_EVENTS.WELCOME_SEND_COMPLETED, {
        surface: 'mobile_pwa_action_items',
        channel: 'agent_phone_sms',
        age_days_at_send: ageDays,
      });
      captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_COMPLETED, {
        lane: 'welcome',
        trigger_reason: item.triggerReason,
        completion_action: 'text_personally',
        age_days: ageDays,
        view_count_at_completion: item.viewCount + 1,
      });
      onCompleted?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not mark welcome sent.');
    } finally {
      setCompleting(false);
    }
  };

  const smsHref = phone && body
    ? `sms:${phone}${navigatorIsAppleLike() ? '&body=' : '?body='}${encodeURIComponent(body)}`
    : null;

  return (
    <article className={`rounded-xl border-2 px-4 py-3 transition-colors ${styles.container}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0D4D4D]">Welcome {subjectFirst}</p>
          <p className="text-[12px] text-[#4f4f4f] mt-0.5">
            {phone ? phone : 'No phone on file'}
            {item.displayContext.subjectClientCode ? ` · code ${item.displayContext.subjectClientCode}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles.pill}`}>
          {ageLabel(ageDays)}
        </span>
      </div>

      {body ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-[#0D4D4D]/70 hover:text-[#0D4D4D]">
            Preview text
          </summary>
          <p className="mt-1 whitespace-pre-wrap rounded-lg border border-[#e8e8e8] bg-white/70 px-3 py-2 text-[12px] leading-snug text-[#2d2d2d]">
            {body}
          </p>
        </details>
      ) : null}

      {errorMsg ? (
        <p className="mt-2 text-[11px] font-semibold text-[#b42318]">{errorMsg}</p>
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-2">
        {canSendFromPhone && smsHref ? (
          <a
            href={smsHref}
            onClick={() => { void completePersonally(); }}
            className="inline-flex items-center gap-1 rounded-lg bg-[#3DD6C3] px-3 py-1.5 text-xs font-bold text-[#0D4D4D] hover:bg-[#32c4b2] active:scale-[0.97] transition"
          >
            Send from my phone
          </a>
        ) : (
          <div className="inline-flex items-center gap-1 rounded-lg border border-[#d0d0d0] bg-[#f8f8f8] px-3 py-1.5 text-[11px] font-semibold text-[#5f5f5f]">
            Open AFL on your phone to send
          </div>
        )}
      </div>
    </article>
  );
}

function navigatorIsAppleLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent);
}
