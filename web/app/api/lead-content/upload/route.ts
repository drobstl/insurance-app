import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore, getAdminStorage } from '../../../../lib/firebase-admin';

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;  // 200 MB
const SIGNED_URL_TTL_DAYS = 365;
const ALLOWED_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];

type Slot = 'intro' | 'faq' | 'caseStudy';

/**
 * POST /api/lead-content/upload
 *
 * Multipart upload of one video for the lead-home screen (Chunk 3).
 *
 * Fields:
 *   - file:      video file (mp4/mov/webm), <= 200 MB
 *   - slot:      'intro' | 'faq' | 'caseStudy'
 *   - slotId:    required for faq + caseStudy (stable string like 'faq1');
 *                ignored for intro (which is a single slot per agent)
 *   - title:     display title (optional but recommended)
 *
 * Writes the file to Firebase Storage at:
 *   agents/{agentId}/lead-content/{slot}-{slotId|'intro'}.{ext}
 *
 * Then signs a 1-year URL and persists the entry on
 * agents/{agentId}.leadContent.{slot} (object for intro, append/merge
 * by id for faq + caseStudy arrays). Mobile app's /api/mobile/lead-content
 * endpoint reads this same field.
 *
 * Auth: Bearer ID token; agent uploads their own content.
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

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });

    const file = form.get('file');
    const slot = String(form.get('slot') || '').trim() as Slot;
    const slotId = String(form.get('slotId') || '').trim();
    const title = String(form.get('title') || '').trim().slice(0, 200);

    if (slot !== 'intro' && slot !== 'faq' && slot !== 'caseStudy') {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }
    if ((slot === 'faq' || slot === 'caseStudy') && !slotId) {
      return NextResponse.json({ error: 'slotId is required for faq + caseStudy' }, { status: 400 });
    }
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
    }
    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: `File too large (${file.size} bytes; max ${MAX_VIDEO_BYTES})` },
        { status: 413 },
      );
    }
    if (!ALLOWED_MIME.includes(file.type) && !/\.(mp4|mov|webm)$/i.test(file.name)) {
      return NextResponse.json({ error: 'Video must be mp4, mov, or webm' }, { status: 400 });
    }

    const ext = /\.(mp4|mov|webm)$/i.exec(file.name)?.[1]?.toLowerCase() || 'mp4';
    const filenameSlotPart = slot === 'intro' ? 'intro' : `${slot}-${slotId}`;
    const storagePath = `agents/${agentId}/lead-content/${filenameSlotPart}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    const storage = getAdminStorage().bucket();
    await storage.file(storagePath).save(buf, {
      metadata: { contentType: file.type || `video/${ext}` },
      resumable: false,
    });

    const [signedUrl] = await storage.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_DAYS * 24 * 60 * 60 * 1000,
    });

    // Persist on the agent doc. For intro: overwrite the single object.
    // For faq + caseStudy: upsert into the array by id.
    const db = getAdminFirestore();
    const agentRef = db.collection('agents').doc(agentId);
    if (slot === 'intro') {
      const entry = {
        url: signedUrl,
        path: storagePath,
        title: title || 'Welcome — what to do next',
        updatedAt: new Date().toISOString(),
      };
      await agentRef.set({ leadContent: { intro: entry } }, { merge: true });
      return NextResponse.json({ slot, entry });
    }

    // faq / caseStudy: array upsert.
    const snap = await agentRef.get();
    const existing = (snap.data()?.leadContent || {}) as Record<string, unknown>;
    const arrKey: 'faqs' | 'caseStudies' = slot === 'faq' ? 'faqs' : 'caseStudies';
    const arr = Array.isArray(existing[arrKey]) ? [...(existing[arrKey] as Array<Record<string, unknown>>)] : [];
    const idx = arr.findIndex((e) => e?.id === slotId);
    const entry = {
      id: slotId,
      title: title || 'Untitled video',
      url: signedUrl,
      path: storagePath,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) arr[idx] = entry; else arr.push(entry);

    await agentRef.set({ leadContent: { [arrKey]: arr } }, { merge: true });
    return NextResponse.json({ slot, slotId, entry });
  } catch (error) {
    console.error('lead-content/upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60;
