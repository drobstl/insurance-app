import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminStorage } from '../../../../lib/firebase-admin';
import { createLeadBatch } from '../../../../lib/leads-batch-store';

export const maxDuration = 60;

// Hard ceiling on a single import. A 40-60 page onboarding book is the
// realistic peak; 100 leaves margin while keeping the processor inside
// its 9-minute function budget. Bigger books should be split into two
// uploads. The processor GCF enforces the same cap on the true split
// count (the client-reported count below is only a guard + a seed for
// the progress bar).
const MAX_BATCH_PAGES = 100;
const READ_URL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

interface CreateBatchBody {
  gcsPath?: string;
  fileName?: string;
  pageCount?: number;
}

/**
 * POST /api/leads/batch
 *
 * Creates the lead-batch tracking doc for an already-uploaded multi-page
 * PDF. Creating the doc is what fires the leads-batch-processor GCF, so
 * this route does only sub-second Firestore + signing work and returns
 * immediately with a batchId the client watches via onSnapshot.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }
    let agentId: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      agentId = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as CreateBatchBody;
    const gcsPath = (body.gcsPath || '').trim();
    const fileName = (body.fileName || 'lead-forms.pdf').trim();
    const pageCount = typeof body.pageCount === 'number' ? Math.floor(body.pageCount) : 0;

    if (!gcsPath) {
      return NextResponse.json({ error: 'gcsPath is required.' }, { status: 400 });
    }
    // Ownership: the path must be one this agent's upload-url route minted.
    const expectedPrefix = `agents/${agentId}/leads/_batch-uploads/`;
    if (!gcsPath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'gcsPath does not belong to this agent.' }, { status: 403 });
    }
    if (pageCount < 1) {
      return NextResponse.json({ error: 'pageCount must be at least 1.' }, { status: 400 });
    }
    if (pageCount > MAX_BATCH_PAGES) {
      return NextResponse.json(
        { error: `This bundle has ${pageCount} pages. Please split it into uploads of ${MAX_BATCH_PAGES} pages or fewer.` },
        { status: 400 },
      );
    }

    // Long-lived signed read URL for the parent PDF, stamped onto every
    // lead the processor creates (so the agent can re-open the source
    // form). Signing here keeps GCS-signing on the web tier; the GCF
    // copies this onto each lead and never signs.
    let sourceFileUrl = '';
    try {
      const [signed] = await getAdminStorage()
        .bucket()
        .file(gcsPath)
        .getSignedUrl({ action: 'read', expires: Date.now() + READ_URL_TTL_MS });
      sourceFileUrl = signed;
    } catch (signErr) {
      console.error('[leads/batch] read-URL signing failed:', signErr);
    }

    const batchId = await createLeadBatch(agentId, {
      fileName,
      gcsPath,
      sourceFileUrl,
      sourceFileStoragePath: gcsPath,
      pageCount,
    });

    return NextResponse.json({ batchId, status: 'splitting' });
  } catch (error) {
    console.error('[leads/batch] create error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
