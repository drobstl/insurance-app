import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { getAdminFirestore, getAdminStorage } from '../../../../lib/firebase-admin';

/**
 * GET /api/cron/lead-pdf-archive
 *
 * Daily cron — for compliance posture. Lead PDFs hold PII (name, DOB,
 * address, mortgage details, sometimes SSN). Holding them indefinitely
 * for leads that have gone cold isn't great hygiene. After 21 days of
 * inactivity we delete the raw PDF from Storage and stamp the lead doc;
 * the extracted fields stay so the agent never loses what they need to
 * work the lead.
 *
 * "Inactivity" = none of the following in the trailing 21 days:
 *   - lead.lastDialAt
 *   - lead.notesUpdatedAt
 *   - lead.monthlyMortgageAmountUpdatedAt
 *   - any appointment (any status) created/touched on the lead
 *
 * Hard-skip cases:
 *   - lead.convertedToClientId set — converted leads keep their PDF
 *     indefinitely as a historical record.
 *   - lead has a future appointment scheduled — actively working.
 *   - lead.sourceFileStoragePath missing — legacy lead pre-2026-05-16;
 *     keep PDF until backfilled.
 *
 * Auth: CRON_SECRET bearer (matches the welcome-action-item-expiry
 * pattern). Pass `?dryRun=1` to log what would archive without
 * actually deleting — safe to run any time.
 *
 * Schedule (vercel.json): daily at 08:00 UTC.
 */
const INACTIVITY_DAYS = 21;
const INACTIVITY_MS = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
  const startedAt = Date.now();
  const now = Date.now();
  const cutoffMs = now - INACTIVITY_MS;

  try {
    const db = getAdminFirestore();
    const bucket = getAdminStorage().bucket();
    const agentsSnap = await db.collection('agents').get();

    let agentsScanned = 0;
    let leadsScanned = 0;
    let pdfsArchived = 0;
    let skippedConverted = 0;
    let skippedFutureAppt = 0;
    let skippedActive = 0;
    let skippedNoStoragePath = 0;
    let storageDeleteFailures = 0;

    for (const agentDoc of agentsSnap.docs) {
      const agentId = agentDoc.id;
      agentsScanned += 1;

      // ── Pull future appointments once per agent so we don't query
      //    Firestore per lead. status filter intentionally omitted —
      //    a "scheduled in the future" check is conservative enough; a
      //    cancelled future appt also implies recent agent activity.
      let futureApptLeadIds: Set<string> = new Set();
      try {
        const apptSnap = await db
          .collection('agents').doc(agentId)
          .collection('appointments')
          .where('scheduledAt', '>', Timestamp.fromMillis(now))
          .get();
        futureApptLeadIds = new Set(
          apptSnap.docs
            .map((d) => (d.data() as { leadId?: string }).leadId)
            .filter((x): x is string => typeof x === 'string'),
        );
      } catch (apptErr) {
        console.error('[lead-pdf-archive] future-appt query failed', {
          agentId,
          error: apptErr instanceof Error ? apptErr.message : String(apptErr),
        });
        // Fail-safe: if we can't tell whether the lead has a future
        // appointment, don't archive any of this agent's leads on this
        // run. Cron will retry tomorrow.
        continue;
      }

      // ── Build map of latest appointment touch per lead (any status,
      //    any time) so we treat reschedule/cancel as recent activity.
      const latestApptTouchByLead = new Map<string, number>();
      try {
        const allApptSnap = await db
          .collection('agents').doc(agentId)
          .collection('appointments')
          .get();
        for (const d of allApptSnap.docs) {
          const data = d.data() as {
            leadId?: string;
            createdAt?: Timestamp;
            scheduledAt?: Timestamp;
          };
          if (!data.leadId) continue;
          const t = Math.max(
            data.createdAt?.toMillis() ?? 0,
            data.scheduledAt?.toMillis() ?? 0,
          );
          const prev = latestApptTouchByLead.get(data.leadId) ?? 0;
          if (t > prev) latestApptTouchByLead.set(data.leadId, t);
        }
      } catch (allApptErr) {
        console.error('[lead-pdf-archive] all-appt query failed', {
          agentId,
          error: allApptErr instanceof Error ? allApptErr.message : String(allApptErr),
        });
        continue;
      }

      // ── Walk leads.
      const leadsSnap = await db.collection('agents').doc(agentId).collection('leads').get();
      for (const leadDoc of leadsSnap.docs) {
        leadsScanned += 1;
        const lead = leadDoc.data() as {
          sourceFileUrl?: string;
          sourceFileStoragePath?: string;
          convertedToClientId?: string | null;
          lastDialAt?: Timestamp;
          notesUpdatedAt?: Timestamp;
          monthlyMortgageAmountUpdatedAt?: Timestamp;
          createdAt?: Timestamp;
        };

        // Already archived or never had a PDF.
        if (!lead.sourceFileUrl) continue;
        // Converted leads keep their PDF.
        if (lead.convertedToClientId) {
          skippedConverted += 1;
          continue;
        }
        // Active — future appointment.
        if (futureApptLeadIds.has(leadDoc.id)) {
          skippedFutureAppt += 1;
          continue;
        }
        // Legacy lead without storage path; can't reach the object.
        if (!lead.sourceFileStoragePath) {
          skippedNoStoragePath += 1;
          continue;
        }

        const activityMs = Math.max(
          lead.lastDialAt?.toMillis() ?? 0,
          lead.notesUpdatedAt?.toMillis() ?? 0,
          lead.monthlyMortgageAmountUpdatedAt?.toMillis() ?? 0,
          lead.createdAt?.toMillis() ?? 0,
          latestApptTouchByLead.get(leadDoc.id) ?? 0,
        );
        if (activityMs === 0) {
          // No timestamps at all — can't safely compute inactivity.
          // Treat as active out of caution.
          skippedActive += 1;
          continue;
        }
        if (activityMs > cutoffMs) {
          skippedActive += 1;
          continue;
        }

        const daysInactive = Math.floor((now - activityMs) / (24 * 60 * 60 * 1000));

        if (dryRun) {
          console.log('[lead-pdf-archive] would archive', {
            agentId,
            leadId: leadDoc.id,
            daysInactive,
            storagePath: lead.sourceFileStoragePath,
          });
          pdfsArchived += 1;
          continue;
        }

        // ── Delete storage object (best-effort; cron is idempotent on retry).
        try {
          await bucket.file(lead.sourceFileStoragePath).delete();
        } catch (delErr) {
          const msg = delErr instanceof Error ? delErr.message : String(delErr);
          // 404 is fine — object already gone. Anything else logged.
          if (!/404|No such object/i.test(msg)) {
            storageDeleteFailures += 1;
            console.error('[lead-pdf-archive] storage delete failed', {
              agentId,
              leadId: leadDoc.id,
              storagePath: lead.sourceFileStoragePath,
              error: msg,
            });
            // Skip the doc update so we retry next run — don't want a
            // dangling archivedAt without the object actually gone.
            continue;
          }
        }

        // ── Stamp the lead doc.
        try {
          await leadDoc.ref.update({
            sourceFileUrl: FieldValue.delete(),
            sourceFileArchivedAt: FieldValue.serverTimestamp(),
          });
        } catch (updErr) {
          console.error('[lead-pdf-archive] lead update failed', {
            agentId,
            leadId: leadDoc.id,
            error: updErr instanceof Error ? updErr.message : String(updErr),
          });
          continue;
        }
        pdfsArchived += 1;
        console.log('[lead-pdf-archive] archived', {
          agentId,
          leadId: leadDoc.id,
          daysInactive,
        });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      agentsScanned,
      leadsScanned,
      pdfsArchived,
      skippedConverted,
      skippedFutureAppt,
      skippedActive,
      skippedNoStoragePath,
      storageDeleteFailures,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[lead-pdf-archive] cron failed', { error: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
