import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { getAdminFirestore, getAdminStorage } from '../../../../lib/firebase-admin';

/**
 * GET /api/cron/lead-pdf-archive
 *
 * Frequent cron — sensitive-data hygiene. Uploaded application PDFs can
 * contain SSNs, bank-draft (routing/account) info, and health answers.
 * Agents keep their own copy of every application locally, so AFL has no
 * reason to hold the raw file beyond the moment extraction needs it. We
 * delete the raw PDF from Storage shortly after upload and stamp the lead
 * doc; the EXTRACTED fields stay so the agent never loses what they need
 * to work the lead.
 *
 * Deletion rule: delete the raw PDF once the lead is older than
 * MIN_AGE_MINUTES. That age is purely a safety margin so multi-page /
 * async (off-Vercel) extraction has fully finished using the file before
 * we touch it — extraction itself takes minutes, so 30 is generous. A
 * lead doc only exists once its OWN extraction produced it, so this never
 * races a single lead's extraction; the margin guards the shared PDF
 * object behind a multi-page batch whose pages become leads over a short
 * window.
 *
 * Skip cases:
 *   - lead.sourceFileUrl missing — already deleted or never had a PDF.
 *   - lead.sourceFileStoragePath missing — legacy lead; can't reach the object.
 *   - lead.createdAt missing or younger than MIN_AGE_MINUTES — too soon.
 *
 * This does NOT touch the extraction engine (extractors, page-map,
 * prompts, schema, or the off-Vercel processor). It only deletes the
 * stored file afterward.
 *
 * Auth: CRON_SECRET bearer. Pass `?dryRun=1` to log what WOULD delete
 * without deleting — run it first after deploy to confirm the targets.
 *
 * Schedule (vercel.json): every 30 min. With a 30-min age floor that's a
 * max raw-PDF exposure window of ~1 hour.
 */
const MIN_AGE_MINUTES = 30;
const MIN_AGE_MS = MIN_AGE_MINUTES * 60 * 1000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Defense in depth — when lead mode is disabled the dashboard isn't
  // creating new lead docs, so there's nothing to clean up.
  if (process.env.NEXT_PUBLIC_LEAD_MODE_ENABLED !== 'true') {
    return NextResponse.json({ skipped: true, reason: 'lead_mode_disabled' });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
  const startedAt = Date.now();
  const cutoffMs = Date.now() - MIN_AGE_MS;

  try {
    const db = getAdminFirestore();
    const bucket = getAdminStorage().bucket();
    const agentsSnap = await db.collection('agents').get();

    let agentsScanned = 0;
    let leadsScanned = 0;
    let pdfsDeleted = 0;
    let skippedTooYoung = 0;
    let skippedNoStoragePath = 0;
    let skippedNoCreatedAt = 0;
    let storageDeleteFailures = 0;

    for (const agentDoc of agentsSnap.docs) {
      const agentId = agentDoc.id;
      agentsScanned += 1;

      const leadsSnap = await db.collection('agents').doc(agentId).collection('leads').get();
      for (const leadDoc of leadsSnap.docs) {
        leadsScanned += 1;
        const lead = leadDoc.data() as {
          sourceFileUrl?: string;
          sourceFileStoragePath?: string;
          createdAt?: Timestamp;
        };

        // Already deleted or never had a PDF.
        if (!lead.sourceFileUrl) continue;
        // Legacy lead without a storage path; can't reach the object.
        if (!lead.sourceFileStoragePath) {
          skippedNoStoragePath += 1;
          continue;
        }
        // No createdAt — can't verify age; keep it (safer than deleting a
        // possibly-fresh file before extraction has finished).
        const createdMs = lead.createdAt?.toMillis() ?? 0;
        if (createdMs === 0) {
          skippedNoCreatedAt += 1;
          continue;
        }
        // Too soon — leave it until extraction has safely finished.
        if (createdMs > cutoffMs) {
          skippedTooYoung += 1;
          continue;
        }

        const ageMinutes = Math.floor((Date.now() - createdMs) / 60000);

        if (dryRun) {
          console.log('[lead-pdf-archive] would delete', {
            agentId,
            leadId: leadDoc.id,
            ageMinutes,
            storagePath: lead.sourceFileStoragePath,
          });
          pdfsDeleted += 1;
          continue;
        }

        // ── Delete the storage object (best-effort; idempotent on retry).
        try {
          await bucket.file(lead.sourceFileStoragePath).delete();
        } catch (delErr) {
          const msg = delErr instanceof Error ? delErr.message : String(delErr);
          // 404 is fine — object already gone. Anything else: log + retry next run.
          if (!/404|No such object/i.test(msg)) {
            storageDeleteFailures += 1;
            console.error('[lead-pdf-archive] storage delete failed', {
              agentId,
              leadId: leadDoc.id,
              storagePath: lead.sourceFileStoragePath,
              error: msg,
            });
            // Don't stamp the doc — retry next run rather than leave a
            // dangling archivedAt without the object actually gone.
            continue;
          }
        }

        // ── Stamp the lead doc (drop the URL, record the deletion time).
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
        pdfsDeleted += 1;
        console.log('[lead-pdf-archive] deleted', { agentId, leadId: leadDoc.id, ageMinutes });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      agentsScanned,
      leadsScanned,
      pdfsDeleted,
      skippedTooYoung,
      skippedNoStoragePath,
      skippedNoCreatedAt,
      storageDeleteFailures,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[lead-pdf-archive] cron failed', { error: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
