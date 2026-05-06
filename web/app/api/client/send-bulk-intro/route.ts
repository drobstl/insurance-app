import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { createChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

/**
 * ═══════════════════════════════════════════════════════════════════
 * @deprecated Phase 1 Track B cutover (May 5, 2026)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Bulk-intro pooled-Linq-line outbound was the original
 * "Send all imports an intro" path used by the Bulk Import modal.
 * The Bulk Import UI entry point has been disabled since the May 3,
 * 2026 update (CONTEXT.md > Recent fixes), pending the Phase 2
 * Onboarding Ceremony re-enablement under the new drip rules.
 *
 * Phase 1 Track B (welcome flow + action item queue) does NOT use this
 * route either — every welcome now flows through the action item
 * surface at /dashboard/welcomes.
 *
 * Per Daniel's locked Q9 cutover decision, this code is DEPRECATED but
 * NOT DELETED. The Phase 2 Onboarding Ceremony re-enablement is the
 * point at which the bulk-import path will be redesigned around the
 * new welcome surface (or this route will be deleted).
 *
 * DO NOT add new callers of this route.
 * ═══════════════════════════════════════════════════════════════════
 */

const DELAY_MS = 300;

function substituteTemplate(
  template: string,
  opts: { firstName: string; code: string; agentName: string }
): string {
  return template
    .replace(/\{\{firstName\}\}/g, opts.firstName)
    .replace(/\{\{code\}\}/g, opts.code)
    .replace(/\{\{agentName\}\}/g, opts.agentName);
}

/**
 * POST /api/client/send-bulk-intro
 * Sends a custom intro message to multiple recipients (e.g. just-imported clients).
 * Body: { messageTemplate: string, recipients: { phone, firstName, code }[] }
 * Substitutes {{firstName}}, {{code}}, {{agentName}} per recipient.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { messageTemplate, recipients } = await request.json();
    if (!messageTemplate || typeof messageTemplate !== 'string') {
      return NextResponse.json(
        { error: 'messageTemplate (string) is required' },
        { status: 400 }
      );
    }
    const recs = Array.isArray(recipients) ? recipients : [];
    if (recs.length === 0) {
      return NextResponse.json({ error: 'recipients array is required' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const agentDoc = await db.collection('agents').doc(uid).get();
    const agentName = agentDoc.exists ? (agentDoc.data()?.name as string) || 'Your agent' : 'Your agent';

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const r of recs) {
      const phone = (r.phone || '').trim();
      if (!phone) {
        failed++;
        errors.push(`Skipped: no phone for ${r.firstName || 'client'}`);
        continue;
      }
      const normalized = normalizePhone(phone);
      if (!isValidE164(normalized)) {
        failed++;
        errors.push(`Invalid phone: ${phone}`);
        continue;
      }
      const message = substituteTemplate(messageTemplate, {
        firstName: r.firstName || '',
        code: r.code || '',
        agentName,
      });
      try {
        await createChat({ to: normalized, text: message });
        sent++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${r.firstName || phone}: ${msg}`);
      }
      if (DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    return NextResponse.json({ sent, failed, errors: errors.length ? errors : undefined });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('send-bulk-intro error:', msg);
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
