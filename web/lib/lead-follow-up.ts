/**
 * Manual follow-up reminder (smart-follow-up Step 1).
 *
 * A lead carries `followUpAt` (when to circle back) + optional `followUpNote`
 * (why / what to say). It's the single source of truth surfaced in BOTH the
 * Leads list and the Action items page, so acting in either place writes the
 * lead doc and the other view updates from the same record.
 *
 * Pure helpers (no firebase import) so this is usable client- and server-side.
 * Timestamp args are duck-typed (`toMillis`/`toDate`/`seconds`) to accept both
 * the firebase-admin and the client Timestamp.
 */

/** A callback request is a promise to circle back — default the auto-set
 *  follow-up to 2 days out; the agent can adjust it on the lead. */
export const CALLBACK_FOLLOWUP_MS = 2 * 24 * 60 * 60 * 1000;

interface TimestampLike {
  toMillis?: () => number;
  toDate?: () => Date;
  seconds?: number;
}

export function followUpMillis(ts: TimestampLike | null | undefined): number | null {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
}

export function isFollowUpDue(
  followUpAt: TimestampLike | null | undefined,
  now: number = Date.now(),
): boolean {
  const ms = followUpMillis(followUpAt);
  return ms != null && ms <= now;
}

/**
 * Row/panel chip for a lead's follow-up: amber "due" once the time has passed,
 * slate-blue "Follow up · Aug 12" while it's still scheduled. Null when unset.
 */
export function followUpChip(
  followUpAt: TimestampLike | null | undefined,
  now: number = Date.now(),
): { label: string; classes: string } | null {
  const ms = followUpMillis(followUpAt);
  if (ms == null) return null;
  if (ms <= now) {
    return {
      label: 'Follow up due',
      classes: 'bg-[#FFF4D6] text-[#92500D] border border-[#F0B100]/60',
    };
  }
  let date = '';
  try {
    date = new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    date = '';
  }
  return {
    label: date ? `Follow up · ${date}` : 'Follow up',
    classes: 'bg-[#EFF4FF] text-[#1D4ED8] border border-[#84ADFF]/60',
  };
}
