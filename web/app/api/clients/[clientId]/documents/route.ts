import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore, getAdminStorage } from '../../../../../lib/firebase-admin';
import { normalizeName, type NormalizedName } from '../../../../../lib/client-dedup';

/**
 * Source application documents for a client.
 *
 * The bulk importer parsed application PDFs into client/policy rows but
 * never stored the document on the client. The original page-images are
 * still in storage on the ingestion jobs (`ingestionJobsV3`), so we match
 * a client to its application jobs by name (parsed insured name OR the
 * filename, which agents tend to name after the client) and hand back
 * short-lived signed image URLs the review screen can show.
 *
 *   GET → { clientName, documents: [{ jobId, fileName, pageCount, pages[] }] }
 *
 * Auth: Bearer ID token, scoped to the calling agent.
 */

const READ_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_PAGES_PER_DOC = 15;

async function authAgentId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    return (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}

function matchesClient(cn: NormalizedName, fileName: string, insuredName: string): boolean {
  const jn = normalizeName(insuredName);
  if (jn.ok && cn.ok && cn.full && jn.full === cn.full) return true;
  const f = (fileName || '').toLowerCase();
  if (cn.last && cn.last.length >= 3 && f.includes(cn.last)) {
    if (!cn.first) return true;
    if (f.includes(cn.first) || f.includes(cn.first.slice(0, 3))) return true;
  }
  return false;
}

export async function GET(req: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  const agentId = await authAgentId(req);
  if (!agentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { clientId } = await context.params;
  const db = getAdminFirestore();
  const clientSnap = await db.collection('agents').doc(agentId).collection('clients').doc(clientId).get();
  if (!clientSnap.exists) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const clientName = (clientSnap.data()?.name as string) || '';
  const cn = normalizeName(clientName);

  const jobsSnap = await db.collection('ingestionJobsV3').where('agentId', '==', agentId).get();
  const bucket = getAdminStorage().bucket();

  const documents: Array<{ jobId: string; fileName: string; pageCount: number; pages: string[] }> = [];
  for (const jobDoc of jobsSnap.docs) {
    const j = jobDoc.data() as Record<string, unknown>;
    if (j.mode !== 'application') continue;
    const imgs = Array.isArray(j.gcsImagePaths) ? (j.gcsImagePaths as string[]) : [];
    if (imgs.length === 0) continue;

    const fileName = typeof j.fileName === 'string' ? j.fileName : '';
    const result = j.result as { application?: { data?: { insuredName?: string } } } | undefined;
    const insuredName = result?.application?.data?.insuredName || '';
    if (!matchesClient(cn, fileName, insuredName)) continue;

    const pages: string[] = [];
    for (const p of imgs.slice(0, MAX_PAGES_PER_DOC)) {
      try {
        const [url] = await bucket.file(p).getSignedUrl({ action: 'read', expires: Date.now() + READ_TTL_MS });
        pages.push(url);
      } catch {
        // skip a page that can't be signed
      }
    }
    documents.push({ jobId: jobDoc.id, fileName: fileName || '(unnamed file)', pageCount: imgs.length, pages });
  }

  return NextResponse.json({ clientName, documents });
}
