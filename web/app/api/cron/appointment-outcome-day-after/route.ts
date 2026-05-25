import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { queueAppointmentOutcomeActionItem } from '../../../../lib/appointment-outcome-action-item-writer';

/**
 * GET /api/cron/appointment-outcome-day-after
 *
 * Daily sweep — find booked appointments whose `scheduledAt` has
 * elapsed without an outcome marker (status still 'scheduled') and
 * queue an action item per appointment so the agent can mark the
 * outcome the next morning. Keeps book / show / close rate accurate
 * across the entire funnel without making the agent remember to go
 * back and mark sits manually.
 *
 * Source of truth: CONTEXT.md → Phase 2 follow-up → "Day-after
 * appointment outcome action item." The manual Mark-outcome buttons on
 * past-appointment rows in LeadDetailPanel are the same flow; this
 * cron + action item put the prompt in the agent's queue so they don't
 * have to remember.
 *
 * AUTO-COMPLETE INTERPLAY:
 *   - `web/lib/appointment-auto-complete.ts` flips status to
 *     `'completed'` when a sale or convert event fires within ±48h of
 *     scheduledAt. That covers the happy path.
 *   - This cron handles the unhappy path: scheduled time has passed,
 *     no sale fired, no manual outcome marked → prompt the agent.
 *
 * SCHEDULE: daily at 13:00 UTC (≈ 7am Central). The agent walks in,
 * checks Action Items, sees yesterday's unresolved meetings waiting.
 * vercel.json schedule is `0 13 * * *`.
 *
 * WINDOW:
 *   - Floor: `scheduledAt` ≤ (now - 18h). Gives the agent a same-day
 *     window to mark a sit naturally via the LeadDetailPanel without
 *     a duplicate prompt. 18h = "yesterday is fair game; today isn't."
 *   - Ceiling: `scheduledAt` ≥ (now - 30 days). Prevents the cron
 *     from chewing through ancient data on first deploy. Agent recall
 *     past two weeks is unreliable anyway (per the lane's 14-day
 *     expiration window).
 *
 * IDEMPOTENCY: the writer keys on `appointment_outcome:{apptId}`. A
 * second run on the same appointment is a no-op write; no duplicate
 * action items.
 *
 * COST: O(agents × appointments-in-window). Each agent's query is
 * indexed on (status, scheduledAt) — cheap. The writer's create is
 * a single doc-set per candidate. Acceptable for daily run; revisit
 * if agent count grows past several thousand.
 */

interface RunCounts {
  agentsScanned: number;
  candidates: number;
  queued: number;
  alreadyQueued: number;
  skippedNoLead: number;
  errors: number;
}

const FLOOR_HOURS_AGO = 18;
const CEILING_DAYS_AGO = 30;

function ianaToShortTzLabel(iana: string | undefined): string | null {
  // Map common IANA zones to the short labels agents and their clients
  // actually use in conversation ("CT" / "PT" / "ET"). Fallback to null
  // if we don't recognize the zone — the card renders a UTC-formatted
  // time in that case, which is honest if ugly.
  if (!iana) return null;
  if (iana.startsWith('America/Chicago')) return 'CT';
  if (iana.startsWith('America/Denver') || iana.startsWith('America/Phoenix')) return 'MT';
  if (iana.startsWith('America/Los_Angeles')) return 'PT';
  if (iana.startsWith('America/New_York') || iana.startsWith('America/Detroit')) return 'ET';
  if (iana.startsWith('America/Anchorage')) return 'AKT';
  if (iana.startsWith('Pacific/Honolulu')) return 'HT';
  return null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const counts: RunCounts = {
    agentsScanned: 0,
    candidates: 0,
    queued: 0,
    alreadyQueued: 0,
    skippedNoLead: 0,
    errors: 0,
  };

  try {
    const db = getAdminFirestore();
    const nowMs = Date.now();
    const floorTs = Timestamp.fromMillis(nowMs - FLOOR_HOURS_AGO * 60 * 60 * 1000);
    const ceilingTs = Timestamp.fromMillis(nowMs - CEILING_DAYS_AGO * 24 * 60 * 60 * 1000);

    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      counts.agentsScanned++;
      const agentId = agentDoc.id;
      const agentData = agentDoc.data();
      const agentTimezoneIana = typeof agentData.appointmentTimezone === 'string'
        ? agentData.appointmentTimezone
        : undefined;

      let apptSnap;
      try {
        apptSnap = await db
          .collection('agents').doc(agentId).collection('appointments')
          .where('status', '==', 'scheduled')
          .where('scheduledAt', '>=', ceilingTs)
          .where('scheduledAt', '<=', floorTs)
          .get();
      } catch (err) {
        counts.errors++;
        console.error('[appointment-outcome-day-after] agent appt query failed', { agentId, err });
        continue;
      }

      for (const apptDoc of apptSnap.docs) {
        counts.candidates++;
        const appt = apptDoc.data() as {
          scheduledAt?: Timestamp;
          leadId?: string;
          clientId?: string;
          agentTimezone?: string;
        };

        const scheduledAt = appt.scheduledAt;
        if (!scheduledAt || typeof scheduledAt.toDate !== 'function') {
          counts.errors++;
          console.warn('[appointment-outcome-day-after] missing scheduledAt', { agentId, apptId: apptDoc.id });
          continue;
        }

        // Resolve the subject (lead or client) for display copy. Prefer
        // the lead doc since most appointments are pre-conversion; fall
        // back to the client doc when the appointment was logged on a
        // post-conversion record.
        let subjectName = '';
        let subjectFirstName = '';
        let subjectPhoneE164: string | null = null;
        let clientId: string | null = null;

        const leadId = typeof appt.leadId === 'string' ? appt.leadId : '';
        const apptClientId = typeof appt.clientId === 'string' ? appt.clientId : '';

        if (leadId) {
          try {
            const leadSnap = await db.collection('agents').doc(agentId)
              .collection('leads').doc(leadId).get();
            if (leadSnap.exists) {
              const leadData = leadSnap.data() ?? {};
              subjectName = typeof leadData.name === 'string' ? leadData.name : '';
              subjectFirstName = subjectName.split(/\s+/)[0] || '';
              subjectPhoneE164 = typeof leadData.phone === 'string' ? leadData.phone : null;
              if (typeof leadData.convertedToClientId === 'string') {
                clientId = leadData.convertedToClientId;
              }
            }
          } catch (err) {
            console.warn('[appointment-outcome-day-after] lead read failed', { agentId, leadId, err });
          }
        }

        if (!subjectName && apptClientId) {
          try {
            const clientSnap = await db.collection('agents').doc(agentId)
              .collection('clients').doc(apptClientId).get();
            if (clientSnap.exists) {
              const clientData = clientSnap.data() ?? {};
              subjectName = typeof clientData.name === 'string' ? clientData.name : '';
              subjectFirstName = subjectName.split(/\s+/)[0] || '';
              subjectPhoneE164 = typeof clientData.phone === 'string' ? clientData.phone : null;
              clientId = apptClientId;
            }
          } catch (err) {
            console.warn('[appointment-outcome-day-after] client read failed', { agentId, apptClientId, err });
          }
        }

        if (!subjectName) {
          counts.skippedNoLead++;
          continue;
        }

        const tzShort = ianaToShortTzLabel(appt.agentTimezone || agentTimezoneIana);

        try {
          const result = await queueAppointmentOutcomeActionItem({
            db,
            agentId,
            appointmentId: apptDoc.id,
            subjectName,
            subjectFirstName,
            subjectPhoneE164,
            clientId,
            scheduledAt,
            scheduledTzShort: tzShort,
          });
          if (result.created) counts.queued++;
          else counts.alreadyQueued++;
        } catch (err) {
          counts.errors++;
          console.error('[appointment-outcome-day-after] queue failed', {
            agentId,
            apptId: apptDoc.id,
            err,
          });
        }
      }
    }
  } catch (err) {
    counts.errors++;
    console.error('[appointment-outcome-day-after] outer failure', err);
  }

  const elapsedMs = Date.now() - startedAt;
  console.log('[appointment-outcome-day-after] run complete', { ...counts, elapsedMs });

  return NextResponse.json({ ok: counts.errors === 0, ...counts, elapsedMs });
}
