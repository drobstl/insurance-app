import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';

/**
 * Auto-complete a recent appointment when a sale-shaped event fires.
 *
 * Triggered from:
 *   - POST /api/policies (a policy was just added to a client)
 *   - POST /api/leads/[leadId]/convert (a lead was just converted to
 *     a client — the sale that prompted the conversion is the show)
 *
 * Behavior: find the appointment doc for the given entity (lead or
 * client) whose `scheduledAt` is within a generous window around
 * "now" (default −48h to +4h — agents do paperwork up to ~2 days
 * after a meeting, and sometimes log a sale literally during the
 * meeting). If multiple match, pick the one closest to now by
 * absolute time delta. PATCH status='completed' + audit fields.
 *
 * Idempotent — if the target appointment is already completed /
 * cancelled / no_show, no-op. Only fires on `status: 'scheduled'`.
 *
 * Fire-and-forget from the caller: any failure here MUST NOT bubble
 * up and fail the original sale write. We log and swallow.
 */

const LOOKBACK_HOURS = 48;
const LOOKAHEAD_HOURS = 4;

export type AutoCompleteReason = 'sale' | 'convert';

export interface AutoCompleteOptions {
  agentId: string;
  /** Lead doc id, if the entity originated as a lead. */
  leadId?: string;
  /** Client doc id, if the entity is now (or always was) a client. */
  clientId?: string;
  reason: AutoCompleteReason;
  /** Override the lookback window in ms; defaults to LOOKBACK_HOURS. */
  lookbackMs?: number;
}

export async function autoCompleteRecentAppointment(
  opts: AutoCompleteOptions,
): Promise<{ updated: boolean; appointmentId?: string; reason?: string }> {
  try {
    if (!opts.agentId || (!opts.leadId && !opts.clientId)) {
      return { updated: false, reason: 'missing_ids' };
    }
    const db = getAdminFirestore();
    const apptsRef = db
      .collection('agents')
      .doc(opts.agentId)
      .collection('appointments');

    // Firestore can't OR-query natively across two fields. Run two
    // scoped queries (each constrained to status='scheduled' to keep
    // them cheap) and union the results.
    const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
    if (opts.leadId) {
      queries.push(apptsRef.where('leadId', '==', opts.leadId).where('status', '==', 'scheduled').get());
    }
    if (opts.clientId) {
      queries.push(apptsRef.where('clientId', '==', opts.clientId).where('status', '==', 'scheduled').get());
    }
    const snapshots = await Promise.all(queries);
    const seenIds = new Set<string>();
    const candidates: Array<{ id: string; scheduledAtMs: number }> = [];
    const nowMs = Date.now();
    const lookbackMs = opts.lookbackMs ?? LOOKBACK_HOURS * 60 * 60 * 1000;
    const windowStartMs = nowMs - lookbackMs;
    const windowEndMs = nowMs + LOOKAHEAD_HOURS * 60 * 60 * 1000;
    for (const snap of snapshots) {
      for (const doc of snap.docs) {
        if (seenIds.has(doc.id)) continue;
        seenIds.add(doc.id);
        const data = doc.data() as { scheduledAt?: Timestamp; kind?: string };
        // A callback is not a sit — never auto-complete it as a Sold meeting.
        if (data.kind === 'callback') continue;
        const scheduledAtMs = data.scheduledAt?.toMillis?.();
        if (typeof scheduledAtMs !== 'number') continue;
        if (scheduledAtMs < windowStartMs || scheduledAtMs > windowEndMs) continue;
        candidates.push({ id: doc.id, scheduledAtMs });
      }
    }
    if (candidates.length === 0) return { updated: false, reason: 'no_candidate' };
    // Pick the appointment closest to now in absolute time delta.
    // Ties (rare) break toward the more recent appt by index order.
    candidates.sort((a, b) =>
      Math.abs(a.scheduledAtMs - nowMs) - Math.abs(b.scheduledAtMs - nowMs),
    );
    const winner = candidates[0];

    await apptsRef.doc(winner.id).update({
      status: 'completed',
      autoCompletedAt: FieldValue.serverTimestamp(),
      autoCompletedReason: opts.reason,
    });
    console.log('[appointment-auto-complete] completed', {
      agentId: opts.agentId,
      appointmentId: winner.id,
      reason: opts.reason,
      leadId: opts.leadId,
      clientId: opts.clientId,
    });
    return { updated: true, appointmentId: winner.id };
  } catch (err) {
    // Never bubble — the originating sale write must succeed even if
    // we can't auto-complete the matching appointment.
    console.warn('[appointment-auto-complete] failed (non-fatal):', err);
    return { updated: false, reason: 'error' };
  }
}
