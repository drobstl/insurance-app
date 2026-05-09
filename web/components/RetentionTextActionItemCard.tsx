'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';

import { ANALYTICS_EVENTS } from '../lib/analytics-events';
import { captureEvent } from '../lib/posthog';
import { readPrefilledSmsBody, type ActionItemDoc } from '../lib/action-item-types';
import {
  type AgentPlatform,
  detectAgentPlatform,
  buildSmsUrlForPlatform,
  buildSmsUrlForQr,
  platformSupportsInlineSend,
  platformIsMobile,
  getSendButtonLabel,
} from '../lib/sms-url';

/**
 * Retention text action item card.
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > Lapse / Retention.
 * Stage 4 in the push-eligible cadence (or Stage 3 in the not-eligible
 * cadence) — the agent's second personal-action prompt, after the
 * call action item has aged out.
 *
 * Same Send / Copy / QR pattern as the welcome card, sharing helpers
 * via `web/lib/sms-url.ts`. The pre-filled body comes from
 * {@link buildRetentionTextSmsBody} in the writer (static template,
 * not settings-customizable per Daniel's call). One small `Skip`
 * secondary action.
 */

interface RetentionTextActionItemCardProps {
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

export default function RetentionTextActionItemCard({
  item,
  user,
  onCompleted,
}: RetentionTextActionItemCardProps) {
  const phone = item.displayContext.subjectPhoneE164 || '';
  const body = readPrefilledSmsBody(item.displayContext) || '';
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
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agentPlatform, setAgentPlatform] = useState<AgentPlatform>('unknown');
  const viewedRef = useRef(false);

  useEffect(() => {
    setAgentPlatform(detectAgentPlatform());
  }, []);

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
        console.error('[retention-text-card] mark-viewed failed (non-blocking)', err);
      }
    })();
  }, [user, item.itemId, item.triggerReason, item.viewCount, ageDays]);

  const completeWith = async (
    completionAction: 'text_personally' | 'skip',
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

  const smsHref = phone && body
    ? buildSmsUrlForPlatform(phone, body, agentPlatform)
    : null;

  const qrValue = phone && body
    ? buildSmsUrlForQr(phone, body)
    : null;

  const handleSendViaSms = () => {
    void completeWith('text_personally', null);
  };

  const handleCopyText = async () => {
    if (!body) return;
    setErrorMsg(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(body);
      } else {
        throw new Error('clipboard_unavailable');
      }
      setCopied(true);
      void completeWith('text_personally', 'Sent via copy-paste fallback.');
    } catch {
      setErrorMsg('Could not copy automatically. Long-press the preview and copy manually.');
    }
  };

  const showQrSection = !platformIsMobile(agentPlatform) && qrValue;

  return (
    <article className={`rounded-xl border-2 px-4 py-3 transition-colors ${styles.container}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0D4D4D]">Text {subjectFirst}</p>
          <p className="text-[12px] text-[#4f4f4f] mt-0.5">
            {phone || 'No phone on file'} · retention · call unanswered
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

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => { void completeWith('skip'); }}
          disabled={completing}
          className="inline-flex items-center gap-1 rounded-lg border border-[#d0d0d0] bg-white px-3 py-1.5 text-xs font-bold text-[#5f5f5f] hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Skip
        </button>
        {platformSupportsInlineSend(agentPlatform) && smsHref ? (
          <a
            href={smsHref}
            onClick={handleSendViaSms}
            className="inline-flex items-center gap-1 rounded-lg bg-[#3DD6C3] px-3 py-1.5 text-xs font-bold text-[#0D4D4D] hover:bg-[#32c4b2] active:scale-[0.97] transition"
          >
            💬 {getSendButtonLabel(agentPlatform)}
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => { void handleCopyText(); }}
          disabled={!body || completing}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-60 disabled:cursor-not-allowed ${
            platformSupportsInlineSend(agentPlatform)
              ? 'border border-[#d0d0d0] bg-white text-[#0D4D4D] hover:bg-gray-50'
              : 'bg-[#3DD6C3] text-[#0D4D4D] hover:bg-[#32c4b2]'
          }`}
        >
          {copied ? 'Copied!' : 'Copy text'}
        </button>
      </div>

      {showQrSection ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-[#0D4D4D]/70 hover:text-[#0D4D4D]">
            Or scan with your phone camera
          </summary>
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-[#e3e3e3] bg-white px-3 py-3">
            <div className="shrink-0 rounded-md bg-white p-1.5 border border-[#ececec]">
              <QRCodeSVG value={qrValue} size={88} level="M" marginSize={0} />
            </div>
            <p className="text-[11px] text-[#4f4f4f] leading-snug">
              Point your phone&apos;s camera at this code, tap the notification, and Messages opens with everything pre-filled.
            </p>
          </div>
        </details>
      ) : null}
    </article>
  );
}
