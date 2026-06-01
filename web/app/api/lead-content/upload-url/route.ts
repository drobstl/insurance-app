import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminStorage } from '../../../../lib/firebase-admin';

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB ceiling for sanity
const ALLOWED_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];
const ALLOWED_EXTS = ['mp4', 'mov', 'webm'] as const;
type Slot = 'intro' | 'faq' | 'caseStudy';

/**
 * POST /api/lead-content/upload-url
 *
 * Mint a short-lived signed URL the browser can PUT a video file
 * directly to in Firebase Storage. Used in place of streaming the
 * file through the serverless function, which hits Vercel's 4.5 MB
 * request-body cap and 413s on anything realistic for a lead-home
 * video.
 *
 * Flow:
 *   1. Settings UI calls this endpoint with metadata (slot, slotId,
 *      title, contentType, fileName, size).
 *   2. We validate auth + format + size cap, derive the storage path,
 *      and sign a v4 write URL good for 30 minutes.
 *   3. Browser does PUT <uploadUrl> with the raw file bytes and the
 *      same Content-Type header it advertised here.
 *   4. Browser then calls POST /api/lead-content/upload to finalize:
 *      we sign a year-long read URL, persist the entry on
 *      agents/{agentId}.leadContent.{slot}.
 *
 * Auth: Bearer ID token. Agent uploads only their own content.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const agentId = decoded.uid;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });

    const slot = String(body.slot || '').trim() as Slot;
    const slotId = String(body.slotId || '').trim();
    const fileName = String(body.fileName || '').trim();
    const contentTypeRaw = String(body.contentType || '').trim();
    const size = Number(body.size);

    if (slot !== 'intro' && slot !== 'faq' && slot !== 'caseStudy') {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }
    if ((slot === 'faq' || slot === 'caseStudy') && !slotId) {
      return NextResponse.json({ error: 'slotId is required for faq + caseStudy' }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: 'size must be a positive number' }, { status: 400 });
    }
    if (size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: `File too large (${size} bytes; max ${MAX_VIDEO_BYTES})` },
        { status: 413 },
      );
    }

    // Pick the extension. Prefer the contentType, fall back to the
    // filename extension, default to mp4. We use this for the storage
    // path so signed-URL fetches return the right Content-Disposition.
    const extFromName = /\.(mp4|mov|webm)$/i.exec(fileName)?.[1]?.toLowerCase() as
      | (typeof ALLOWED_EXTS)[number]
      | undefined;
    const ext: (typeof ALLOWED_EXTS)[number] =
      contentTypeRaw === 'video/mp4' ? 'mp4' :
      contentTypeRaw === 'video/quicktime' ? 'mov' :
      contentTypeRaw === 'video/webm' ? 'webm' :
      extFromName ?? 'mp4';
    const contentType =
      ALLOWED_MIME.includes(contentTypeRaw)
        ? contentTypeRaw
        : ext === 'mov' ? 'video/quicktime'
        : ext === 'webm' ? 'video/webm'
        : 'video/mp4';

    const filenameSlotPart = slot === 'intro' ? 'intro' : `${slot}-${slotId}`;
    const storagePath = `agents/${agentId}/lead-content/${filenameSlotPart}.${ext}`;

    const storage = getAdminStorage().bucket();
    const [uploadUrl] = await storage.file(storagePath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 30 * 60 * 1000, // 30 min to start + complete the upload
      contentType,
    });

    return NextResponse.json({
      uploadUrl,
      storagePath,
      contentType, // browser must echo this exact value as the Content-Type header on the PUT
    });
  } catch (error) {
    console.error('lead-content/upload-url error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 30;
