import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';
import { autoCompleteRecentAppointment } from '../../../../../lib/appointment-auto-complete';
import { queueOrRefreshWelcomeActionItem } from '../../../../../lib/welcome-action-item-writer';
import { findExistingClient } from '../../../../../lib/client-dedup';

/**
 * POST /api/leads/[leadId]/convert
 *
 * Convert a lead to a client. Creates a new client record under
 * `agents/{agentId}/clients/{newId}`, mirrors to the top-level
 * `clients/{newId}` + `clientCodes/{code}` indexes (same shape the
 * existing Add Client flow writes), and stamps the source lead with
 * `convertedToClientId` + `convertedAt` so it falls out of the call
 * queue but stays around as a historical record.
 *
 * Does NOT delete the lead. The agent can still navigate to it via
 * the lead URL — the lead page itself renders a "Converted to client"
 * banner once `convertedToClientId` is set.
 *
 * Queues the welcome action item the same way the Add Client flow does
 * (via `queueOrRefreshWelcomeActionItem`). This is what creates the
 * `welcome_pending_{clientId}` placeholder thread + byPhone resolver
 * entry — without it, the inbound activation SMS from the mobile app
 * has nothing to match against and lands in the generic inbox.
 *
 * Auth: Bearer ID token; agent owns the lead.
 *
 * Response: `{ clientId, clientCode }` on success.
 */

// Client code generator — kept inline (mirror of generateClientCode in
// web/app/dashboard/clients/page.tsx; 6 chars from the unambiguous
// alphabet). Don't import the client-side helper into a server route.
const CLIENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateClientCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CLIENT_CODE_ALPHABET.charAt(Math.floor(Math.random() * CLIENT_CODE_ALPHABET.length));
  }
  return code;
}

async function generateUniqueClientCode(db: FirebaseFirestore.Firestore): Promise<string> {
  // 6 chars × 32 alphabet = ~1 billion combos. Collision is rare;
  // 5 retries is plenty.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateClientCode();
    const existing = await db.collection('clientCodes').doc(code).get();
    if (!existing.exists) return code;
  }
  throw new Error('Could not generate a unique client code after 5 attempts.');
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

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

    const db = getAdminFirestore();
    const leadRef = db.collection('agents').doc(agentId).collection('leads').doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const leadData = leadSnap.data() ?? {};

    if (typeof leadData.convertedToClientId === 'string' && leadData.convertedToClientId) {
      // Idempotent — return the existing client id rather than creating a duplicate.
      return NextResponse.json({
        clientId: leadData.convertedToClientId,
        clientCode: typeof leadData.convertedToClientCode === 'string' ? leadData.convertedToClientCode : null,
        alreadyConverted: true,
      });
    }

    const name = typeof leadData.name === 'string' ? leadData.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Lead is missing a name — fill it in before converting.' }, { status: 400 });
    }
    const phone = typeof leadData.phone === 'string' ? leadData.phone.trim() : '';
    const email = typeof leadData.email === 'string' ? leadData.email.trim() : '';
    const dateOfBirth = typeof leadData.dateOfBirth === 'string' ? leadData.dateOfBirth : null;

    // ── Phase 4c: optional body flags + duplicate precheck ──────
    // The leads page UI may pass:
    //   { force: true } — bypass the precheck; create a new client
    //     anyway. Used when the agent confirms "Create as new" in the
    //     "matches existing client" prompt.
    //   { linkToExistingClientId: '...' } — skip client creation
    //     entirely; just stamp the lead with that existing client's id
    //     so the lead "converts" by pointing at the existing record.
    //     Used when the agent confirms "Link to existing" in the prompt.
    let force = false;
    let linkToExistingClientId: string | null = null;
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body === 'object') {
        if (body.force === true) force = true;
        if (typeof body.linkToExistingClientId === 'string' && body.linkToExistingClientId.trim()) {
          linkToExistingClientId = body.linkToExistingClientId.trim();
        }
      }
    } catch {
      // No body / parse error — treat as defaults (no force, no link).
    }

    // ── Link-to-existing path ──
    if (linkToExistingClientId) {
      const existingRef = db.collection('agents').doc(agentId).collection('clients').doc(linkToExistingClientId);
      const existingSnap = await existingRef.get();
      if (!existingSnap.exists) {
        return NextResponse.json(
          { error: `Target client ${linkToExistingClientId} not found.` },
          { status: 404 },
        );
      }
      const existingData = existingSnap.data() ?? {};
      const existingCode = typeof existingData.clientCode === 'string' ? existingData.clientCode : null;
      const now = Timestamp.now();
      await leadRef.update({
        convertedToClientId: linkToExistingClientId,
        convertedToClientCode: existingCode,
        convertedAt: now,
        linkedToExistingClient: true,
        lastDialOutcome: FieldValue.delete(),
      });
      // Auto-complete a recent appointment and refresh the welcome
      // action item just like the full-create path, since this is
      // still a "lead → client" transition from the funnel's view.
      void autoCompleteRecentAppointment({
        agentId, leadId, clientId: linkToExistingClientId, reason: 'convert',
      });
      try {
        await queueOrRefreshWelcomeActionItem({ db, agentId, clientId: linkToExistingClientId });
      } catch (welcomeErr) {
        console.error('[leads/convert] welcome refresh failed (non-blocking):', welcomeErr);
      }
      return NextResponse.json({
        clientId: linkToExistingClientId,
        clientCode: existingCode,
        linkedToExistingClient: true,
      });
    }

    // ── Precheck for duplicates (skipped when force=true) ──
    if (!force) {
      const match = await findExistingClient(db, agentId, {
        name, dateOfBirth, phone, email,
      });
      if (match) {
        const matchedRef = db.collection('agents').doc(agentId).collection('clients').doc(match.clientId);
        const matchedSnap = await matchedRef.get();
        const matchedData = matchedSnap.exists ? matchedSnap.data() : null;
        return NextResponse.json(
          {
            matched: true,
            existingClientId: match.clientId,
            existingClientName: matchedData?.name ?? '',
            existingClientCode: matchedData?.clientCode ?? null,
            existingDateOfBirth: matchedData?.dateOfBirth ?? null,
            existingPhone: matchedData?.phone ?? null,
            existingEmail: matchedData?.email ?? null,
            match: {
              bucket: match.match.bucket,
              confidence: match.match.confidence,
              reason: match.match.reason,
            },
          },
          { status: 409 },
        );
      }
    }
    // Agent-private editorial notes carry over from lead → client so
    // the context the agent built up during prospecting + booking
    // doesn't get stranded the moment the sale closes. Top-level mirror
    // intentionally omits this — notes are per-agent and shouldn't
    // leak across the cross-agent client-code lookup surface.
    const notes = typeof leadData.notes === 'string' && leadData.notes.trim()
      ? leadData.notes
      : null;

    const clientCode = await generateUniqueClientCode(db);
    const now = Timestamp.now();

    // Create the per-agent client doc.
    const clientRef = db.collection('agents').doc(agentId).collection('clients').doc();
    const clientPayload: Record<string, unknown> = {
      name,
      phone,
      email,
      clientCode,
      agentId,
      createdAt: now,
      preferredLanguage: 'en',
      convertedFromLeadId: leadId,
      convertedFromLeadAt: now,
    };
    if (dateOfBirth) clientPayload.dateOfBirth = dateOfBirth;
    if (notes) {
      clientPayload.notes = notes;
      clientPayload.notesUpdatedAt = now;
    }

    // Top-level mirrors (matches the existing Add Client flow).
    const topLevelClientPayload: Record<string, unknown> = {
      name,
      phone,
      email,
      clientCode,
      agentId,
      createdAt: now,
      preferredLanguage: 'en',
    };
    if (dateOfBirth) topLevelClientPayload.dateOfBirth = dateOfBirth;

    const batch = db.batch();
    batch.set(clientRef, clientPayload);
    batch.set(db.collection('clients').doc(clientRef.id), topLevelClientPayload);
    batch.set(db.collection('clientCodes').doc(clientCode), { agentId, clientId: clientRef.id });
    batch.update(leadRef, {
      convertedToClientId: clientRef.id,
      convertedToClientCode: clientCode,
      convertedAt: now,
      lastDialOutcome: FieldValue.delete(),  // falls out of queue regardless
    });
    await batch.commit();

    // Auto-complete a recent appointment for this lead. Conversion
    // implies the sale happened, which implies the lead showed.
    // Matches an appointment within −48h to +4h of now. The
    // appointment doc still references the original leadId (it was
    // booked while the entity was a lead), so we look it up by that.
    // Fire-and-forget — never blocks the convert response.
    void autoCompleteRecentAppointment({
      agentId,
      leadId,
      clientId: clientRef.id,
      reason: 'convert',
    });

    try {
      const welcomeResult = await queueOrRefreshWelcomeActionItem({
        db,
        agentId,
        clientId: clientRef.id,
      });
      console.log('[leads/convert] welcome action item', {
        agentId,
        clientId: clientRef.id,
        itemId: welcomeResult.itemId,
        outcome: welcomeResult.outcome,
      });
    } catch (welcomeErr) {
      console.error('[leads/convert] welcome action item queue failed (non-blocking)', {
        agentId,
        clientId: clientRef.id,
        error: welcomeErr instanceof Error ? welcomeErr.message : String(welcomeErr),
      });
    }

    return NextResponse.json({
      clientId: clientRef.id,
      clientCode,
      alreadyConverted: false,
    });
  } catch (error) {
    console.error('leads/convert POST error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
