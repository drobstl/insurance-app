import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth } from '../../../../../lib/firebase-admin';
import { getIngestionJobsCollection, toJobResponse, type IngestionMode } from '../../../../../lib/ingestion-v2';

export const maxDuration = 60;

interface CreateJobResponse {
  success: boolean;
  job?: ReturnType<typeof toJobResponse>;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<CreateJobResponse>> {
  try {
    const contentType = req.headers.get('content-type') || '';
    let mode: IngestionMode = 'application';
    let source: { url?: string; base64?: string; textContent?: string; fileName?: string; fileSize?: number } = {};
    let idempotencyKey: string | undefined;

    if (contentType.includes('application/json')) {
      const body = (await req.json()) as {
        mode?: IngestionMode;
        url?: string;
        base64?: string;
        textContent?: string;
        fileName?: string;
        fileSize?: number;
        idempotencyKey?: string;
      };
      if (body.mode === 'bob') mode = 'bob';
      source = {
        url: body.url,
        base64: body.base64,
        textContent: body.textContent,
        fileName: body.fileName,
        fileSize: body.fileSize,
      };
      idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined;
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported content type. Use application/json.' },
        { status: 400 },
      );
    }

    if (!source.url && !source.base64 && !source.textContent) {
      return NextResponse.json({ success: false, error: 'No file source provided.' }, { status: 400 });
    }

    const agentId = await getOptionalAgentId(req);
    const jobs = getIngestionJobsCollection();

    if (idempotencyKey && agentId) {
      const existing = await jobs
        .where('agentId', '==', agentId)
        .where('idempotencyKey', '==', idempotencyKey)
        .limit(1)
        .get();
      if (!existing.empty) {
        const doc = existing.docs[0];
        return NextResponse.json({ success: true, job: toJobResponse(doc.id, doc.data()) });
      }
    }

    const ref = jobs.doc();
    await ref.set({
      mode,
      status: 'queued',
      source: compactObject(source),
      attempts: 0,
      maxAttempts: 2,
      agentId: agentId ?? null,
      idempotencyKey: idempotencyKey ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const created = await ref.get();
    return NextResponse.json({ success: true, job: toJobResponse(ref.id, created.data() || {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create ingestion job.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function compactObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k as keyof T] = v as T[keyof T];
    }
  }
  return out;
}

async function getOptionalAgentId(req: NextRequest): Promise<string | undefined> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return undefined;
  }
}
