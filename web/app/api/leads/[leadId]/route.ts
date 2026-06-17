import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { deriveLeadCode } from '../../../../lib/lead-code-derive';

/**
 * DELETE /api/leads/[leadId]
 *
 * Delete a lead doc + its `leadCodes` index entries (cleared under both the
 * stored code and the code derived from the current phone, so the number
 * frees up for re-import) + any `leadActivity` entries pointing at it. Auth:
 * Bearer ID token, agent must own the lead
 * (the leadId is namespaced under their uid in Firestore so attempts to
 * delete someone else's lead naturally 404 here).
 *
 * If a mobile session is active for the deleted lead's code, the next
 * lookup will 404 and the existing mobile InvalidCodeError handling
 * clears the session and routes the user back to /activate. No additional
 * cleanup needed mobile-side.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    if (!leadId) {
      return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const agentId = decoded.uid;

    const db = getAdminFirestore();
    const leadRef = db.collection('agents').doc(agentId).collection('leads').doc(leadId);
    const snap = await leadRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const data = snap.data() ?? {};

    // Guard against silently orphaning appointments. Appointments reference
    // their lead by doc id; deleting the lead strands them with a dangling
    // leadId (and a delete-then-reimport "refresh" also wipes the lead's
    // dial history) — exactly the data loss that produced orphaned bookings
    // on Jun 15, 2026. Refuse the delete when appointments exist UNLESS the
    // caller passes ?force=true, which cascade-deletes the appointment docs
    // so nothing is left dangling. (Cascaded appts' Google Calendar events
    // are not cleaned here — use DELETE /api/appointments/[id] for that.)
    const force = new URL(req.url).searchParams.get('force') === 'true';
    const apptsSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('appointments')
      .where('leadId', '==', leadId)
      .get();
    if (!apptsSnap.empty && !force) {
      return NextResponse.json(
        {
          error: `This lead has ${apptsSnap.size} appointment(s). Deleting it would orphan them — delete the appointment(s) first, or retry with force to remove both.`,
          code: 'lead_has_appointments',
          appointmentCount: apptsSnap.size,
        },
        { status: 409 },
      );
    }

    // Every leadCodes index key that could point at THIS lead. Two can
    // diverge and orphan the live entry: the stored `leadCode` (frozen at
    // creation) and the code derived from the *current* phone (what the
    // import dedup actually looks up). If the phone was edited after creation
    // — or `leadCode` was never written — clearing only the stored code
    // leaves the number stuck. Clear both.
    const codesToClear = new Set<string>();
    if (typeof data.leadCode === 'string' && data.leadCode) {
      codesToClear.add(data.leadCode);
    }
    const derivedFromPhone =
      typeof data.phone === 'string' ? deriveLeadCode(data.phone) : null;
    if (derivedFromPhone) codesToClear.add(derivedFromPhone);

    // Activity entries for this lead (query the agent's own small
    // subcollection — no composite index needed).
    const activitySnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('leadActivity')
      .where('leadId', '==', leadId)
      .get();

    const ops: Promise<unknown>[] = [leadRef.delete()];
    // force === true here (the guard above 409s otherwise): cascade-delete
    // the appointments so none are left pointing at the deleted lead.
    apptsSnap.docs.forEach((d) => ops.push(d.ref.delete().catch(() => {})));
    for (const code of codesToClear) {
      // Only delete an index doc that actually points at THIS lead, so we
      // never free a code that resolved to a different agent/lead.
      ops.push(
        (async () => {
          const ref = db.collection('leadCodes').doc(code);
          const idx = await ref.get();
          const d = idx.data() as { agentId?: string; leadId?: string } | undefined;
          if (idx.exists && d?.agentId === agentId && d?.leadId === leadId) {
            await ref.delete();
          }
        })().catch(() => {}),
      );
    }
    activitySnap.docs.forEach((d) => {
      ops.push(d.ref.delete().catch(() => {}));
    });
    await Promise.all(ops);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('leads/delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
