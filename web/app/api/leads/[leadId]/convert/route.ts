import 'server-only';

import { randomUUID } from 'node:crypto';
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

/**
 * Household context for the primary lead → client convert. A "household"
 * exists when the lead has at least one Person flagged `insured` ("writing
 * an app") in `household.people`. The shared `householdId` is generated once
 * and persisted onto the lead, then reused for every member the lead spawns.
 */
function householdContext(
  leadData: FirebaseFirestore.DocumentData,
): { exists: boolean; id: string; newlyCreated: boolean } {
  const people = leadData.household?.people;
  const exists =
    Array.isArray(people) &&
    people.some((p) => p && typeof p === 'object' && (p as { insured?: boolean }).insured === true);
  const existingId =
    typeof leadData.householdId === 'string' && leadData.householdId ? leadData.householdId : '';
  const id = existingId || (exists ? randomUUID() : '');
  return { exists, id, newlyCreated: exists && !existingId };
}

/**
 * Phase 2 — convert ONE insured Person from the lead's `household.people`
 * into their own client, stamped with the household's shared id + their
 * relationship to the primary. The Person's captured underwriting fields are
 * the source of truth; any PDF-extracted contact only gap-fills what's blank.
 *
 * Idempotent per (lead, person) via `lead.convertedClientIds[personId]`.
 * Supports the same duplicate precheck + force + link-to-existing semantics as
 * the primary path. When this is the first conversion to establish the
 * household id, the already-converted primary client is backfilled so the
 * group is complete.
 */
async function convertHouseholdPerson(args: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  leadRef: FirebaseFirestore.DocumentReference;
  leadData: FirebaseFirestore.DocumentData;
  personId: string;
  primaryName: string;
  force: boolean;
  linkToExistingClientId: string | null;
  extractedEmail: string | null;
  extractedDob: string | null;
  extractedPhone: string | null;
  preferExtractedPhone: boolean;
}): Promise<NextResponse> {
  const {
    db, agentId, leadRef, leadData, personId, primaryName, force,
    linkToExistingClientId, extractedEmail, extractedDob, extractedPhone, preferExtractedPhone,
  } = args;
  const leadId = leadRef.id;

  const people = Array.isArray(leadData.household?.people) ? leadData.household.people : [];
  const person = people.find((p: { id?: string }) => p && p.id === personId) as
    | {
        id: string; relationship?: string; name?: string; dateOfBirth?: string;
        gender?: string; smokerStatus?: string; heightText?: string; weightLbs?: number;
        phone?: string; email?: string;
      }
    | undefined;
  if (!person) {
    return NextResponse.json({ error: 'That person is no longer on the lead.' }, { status: 404 });
  }

  const convertedMap: Record<string, string> =
    leadData.convertedClientIds && typeof leadData.convertedClientIds === 'object'
      ? (leadData.convertedClientIds as Record<string, string>)
      : {};

  // Idempotent per (lead, person) — return the existing client, don't dup.
  if (typeof convertedMap[personId] === 'string' && convertedMap[personId]) {
    const existingId = convertedMap[personId];
    const snap = await db.collection('agents').doc(agentId).collection('clients').doc(existingId).get();
    return NextResponse.json({
      clientId: existingId,
      clientCode: snap.exists ? (snap.data()?.clientCode ?? null) : null,
      householdId: typeof leadData.householdId === 'string' ? leadData.householdId : null,
      relationship: person.relationship ?? null,
      alreadyConverted: true,
    });
  }

  const personName = typeof person.name === 'string' ? person.name.trim() : '';
  if (!personName) {
    return NextResponse.json(
      { error: 'This person needs a name before you can convert them.' },
      { status: 400 },
    );
  }

  // The Person's own fields are primary; extracted contact gap-fills blanks.
  // A resolved phone conflict (preferExtractedPhone) lets the app number win.
  const personPhone = typeof person.phone === 'string' ? person.phone.trim() : '';
  const personEmail = typeof person.email === 'string' ? person.email.trim() : '';
  const personDob = typeof person.dateOfBirth === 'string' && person.dateOfBirth ? person.dateOfBirth : null;
  const finalEmail = personEmail || extractedEmail || '';
  const finalDob = personDob || extractedDob || null;
  const finalPhone = preferExtractedPhone && extractedPhone
    ? extractedPhone
    : (personPhone || extractedPhone || '');

  // Shared household id — a person conversion always implies a household,
  // even if the `insured` flags happen to be unset. Persist to the lead the
  // first time so every member resolves the same id.
  const householdId = (typeof leadData.householdId === 'string' && leadData.householdId)
    ? leadData.householdId
    : randomUUID();
  const householdIsNew = !(typeof leadData.householdId === 'string' && leadData.householdId);
  const relationship = person.relationship || 'other';

  // Backfill the primary client with household fields when this conversion is
  // what first establishes the household id.
  const backfillPrimary = (batch: FirebaseFirestore.WriteBatch) => {
    if (householdIsNew && typeof leadData.convertedToClientId === 'string' && leadData.convertedToClientId) {
      batch.set(
        db.collection('agents').doc(agentId).collection('clients').doc(leadData.convertedToClientId),
        { householdId, householdRole: 'primary', householdRelationship: 'self', householdPrimaryName: primaryName || null },
        { merge: true },
      );
    }
  };

  // ── Link this person to an EXISTING client (join the household) ──
  if (linkToExistingClientId) {
    const existingRef = db.collection('agents').doc(agentId).collection('clients').doc(linkToExistingClientId);
    const existingSnap = await existingRef.get();
    if (!existingSnap.exists) {
      return NextResponse.json({ error: `Target client ${linkToExistingClientId} not found.` }, { status: 404 });
    }
    const existingCode = existingSnap.data()?.clientCode ?? null;
    const batch = db.batch();
    batch.set(
      existingRef,
      {
        householdId, householdRole: 'member', householdRelationship: relationship,
        householdPrimaryName: primaryName || null, convertedFromLeadId: leadId,
      },
      { merge: true },
    );
    backfillPrimary(batch);
    const leadUpdate: Record<string, unknown> = { [`convertedClientIds.${personId}`]: linkToExistingClientId };
    if (householdIsNew) leadUpdate.householdId = householdId;
    batch.update(leadRef, leadUpdate);
    await batch.commit();
    try {
      await queueOrRefreshWelcomeActionItem({ db, agentId, clientId: linkToExistingClientId });
    } catch (welcomeErr) {
      console.error('[leads/convert] member link welcome refresh failed (non-blocking):', welcomeErr);
    }
    return NextResponse.json({
      clientId: linkToExistingClientId, clientCode: existingCode, householdId, relationship,
      linkedToExistingClient: true,
    });
  }

  // ── Duplicate precheck (unless force) ──
  if (!force) {
    const match = await findExistingClient(db, agentId, {
      name: personName, dateOfBirth: finalDob, phone: finalPhone, email: finalEmail,
    });
    if (match) {
      const matchedSnap = await db.collection('agents').doc(agentId).collection('clients').doc(match.clientId).get();
      const matchedData = matchedSnap.exists ? matchedSnap.data() : null;
      return NextResponse.json(
        {
          matched: true,
          personId,
          existingClientId: match.clientId,
          existingClientName: matchedData?.name ?? '',
          existingClientCode: matchedData?.clientCode ?? null,
          existingDateOfBirth: matchedData?.dateOfBirth ?? null,
          existingPhone: matchedData?.phone ?? null,
          existingEmail: matchedData?.email ?? null,
          match: { bucket: match.match.bucket, confidence: match.match.confidence, reason: match.match.reason },
        },
        { status: 409 },
      );
    }
  }

  const clientCode = await generateUniqueClientCode(db);
  const now = Timestamp.now();
  const clientRef = db.collection('agents').doc(agentId).collection('clients').doc();
  const clientPayload: Record<string, unknown> = {
    name: personName,
    phone: finalPhone,
    email: finalEmail,
    clientCode,
    agentId,
    createdAt: now,
    preferredLanguage: 'en',
    convertedFromLeadId: leadId,
    convertedFromLeadAt: now,
    householdId,
    householdRole: 'member',
    householdRelationship: relationship,
    householdPrimaryName: primaryName || null,
  };
  if (finalDob) clientPayload.dateOfBirth = finalDob;
  if (person.gender) clientPayload.gender = person.gender;
  if (person.smokerStatus) clientPayload.smokerStatus = person.smokerStatus;
  if (person.heightText) clientPayload.heightText = person.heightText;
  if (typeof person.weightLbs === 'number') clientPayload.weightLbs = person.weightLbs;

  const topLevelClientPayload: Record<string, unknown> = {
    name: personName,
    phone: finalPhone,
    email: finalEmail,
    clientCode,
    agentId,
    createdAt: now,
    preferredLanguage: 'en',
  };
  if (finalDob) topLevelClientPayload.dateOfBirth = finalDob;

  const batch = db.batch();
  batch.set(clientRef, clientPayload);
  batch.set(db.collection('clients').doc(clientRef.id), topLevelClientPayload);
  batch.set(db.collection('clientCodes').doc(clientCode), { agentId, clientId: clientRef.id });
  backfillPrimary(batch);
  const leadUpdate: Record<string, unknown> = { [`convertedClientIds.${personId}`]: clientRef.id };
  if (householdIsNew) leadUpdate.householdId = householdId;
  batch.update(leadRef, leadUpdate);
  await batch.commit();

  // Queue the member's own welcome action item (their app-login safety net).
  // We intentionally do NOT auto-complete an appointment here — the lead's
  // appointment is completed by the primary conversion; a member share the
  // same sit and shouldn't re-trigger it.
  try {
    await queueOrRefreshWelcomeActionItem({ db, agentId, clientId: clientRef.id });
  } catch (welcomeErr) {
    console.error('[leads/convert] member welcome queue failed (non-blocking):', welcomeErr);
  }

  return NextResponse.json({
    clientId: clientRef.id, clientCode, householdId, relationship, alreadyConverted: false,
  });
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

    // ── Optional body flags — parsed up front so `personId` can route ──
    // The leads page UI / Close Sale ritual may pass:
    //   { personId: '...' } — convert ONE insured Person from the lead's
    //     household.people into their own client (Phase 2 household
    //     linking). Absent = the legacy primary lead → client convert.
    //   { force: true } — bypass the duplicate precheck; create a new
    //     client anyway ("Create as new" in the match prompt).
    //   { linkToExistingClientId: '...' } — point at an existing client
    //     instead of creating one ("Link to existing" in the prompt).
    //   { extractedContact: {...} } — PDF-extracted email/DOB/phone so the
    //     new client inherits the application's contact; gap-fills blanks.
    //   { preferExtractedPhone: true } — extracted phone wins a conflict.
    // All optional + sanitized; absent body = legacy behavior.
    let force = false;
    let linkToExistingClientId: string | null = null;
    let personId: string | null = null;
    let extractedEmail: string | null = null;
    let extractedDob: string | null = null;
    let extractedPhone: string | null = null;
    let preferExtractedPhone = false;
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body === 'object') {
        if (body.force === true) force = true;
        if (typeof body.personId === 'string' && body.personId.trim()) {
          personId = body.personId.trim();
        }
        if (typeof body.linkToExistingClientId === 'string' && body.linkToExistingClientId.trim()) {
          linkToExistingClientId = body.linkToExistingClientId.trim();
        }
        const ec = body.extractedContact;
        if (ec && typeof ec === 'object') {
          if (typeof ec.email === 'string' && ec.email.trim() && ec.email.includes('@')) {
            extractedEmail = ec.email.trim();
          }
          if (typeof ec.dateOfBirth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ec.dateOfBirth.trim())) {
            extractedDob = ec.dateOfBirth.trim();
          }
          if (typeof ec.phone === 'string' && ec.phone.trim()) {
            extractedPhone = ec.phone.trim();
          }
        }
        if (body.preferExtractedPhone === true) preferExtractedPhone = true;
      }
    } catch {
      // No body / parse error — treat as defaults (no force, no link).
    }

    const primaryName = typeof leadData.name === 'string' ? leadData.name.trim() : '';

    // ── Per-person household conversion (Phase 2) ────────────────
    // Routed before the primary idempotency check so a spouse can be
    // converted AFTER the primary already became a client.
    if (personId) {
      return await convertHouseholdPerson({
        db, agentId, leadRef, leadData, personId, primaryName, force,
        linkToExistingClientId, extractedEmail, extractedDob, extractedPhone, preferExtractedPhone,
      });
    }

    // ── Primary lead → client ────────────────────────────────────
    if (typeof leadData.convertedToClientId === 'string' && leadData.convertedToClientId) {
      // Idempotent — return the existing client id rather than creating a duplicate.
      return NextResponse.json({
        clientId: leadData.convertedToClientId,
        clientCode: typeof leadData.convertedToClientCode === 'string' ? leadData.convertedToClientCode : null,
        householdId: typeof leadData.householdId === 'string' ? leadData.householdId : null,
        alreadyConverted: true,
      });
    }

    const name = primaryName;
    if (!name) {
      return NextResponse.json({ error: 'Lead is missing a name — fill it in before converting.' }, { status: 400 });
    }
    const phone = typeof leadData.phone === 'string' ? leadData.phone.trim() : '';
    const email = typeof leadData.email === 'string' ? leadData.email.trim() : '';
    const dateOfBirth = typeof leadData.dateOfBirth === 'string' ? leadData.dateOfBirth : null;

    // Household context — does this lead have insured people to link the
    // primary to? When yes, the primary client is stamped as the household's
    // primary and the shared id is persisted to the lead.
    const household = householdContext(leadData);

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
      const leadUpdate: Record<string, unknown> = {
        convertedToClientId: linkToExistingClientId,
        convertedToClientCode: existingCode,
        convertedAt: now,
        linkedToExistingClient: true,
        lastDialOutcome: FieldValue.delete(),
      };
      if (household.exists) {
        leadUpdate.householdId = household.id;
        // Join the linked client to the household as its primary.
        await existingRef.set(
          { householdId: household.id, householdRole: 'primary', householdRelationship: 'self', householdPrimaryName: name },
          { merge: true },
        );
      }
      await leadRef.update(leadUpdate);
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
        householdId: household.exists ? household.id : null,
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

    // ── Carry PDF-extracted contact into the new client ──
    // Gap-fill ONLY where the lead itself is blank, so we never clobber a
    // value the agent curated on the lead. Email + DOB fill silently. Phone
    // gap-fills the same way UNLESS the ritual flagged a lead/PDF phone
    // conflict and the agent chose the application's number
    // (preferExtractedPhone), in which case the extracted phone wins. Name
    // is intentionally left as the lead's. The dedup precheck above ran on
    // the original lead values and is unaffected.
    const finalEmail = email || extractedEmail || '';
    const finalDateOfBirth = dateOfBirth || extractedDob || null;
    const finalPhone = (preferExtractedPhone && extractedPhone)
      ? extractedPhone
      : (phone || extractedPhone || '');

    // Create the per-agent client doc.
    const clientRef = db.collection('agents').doc(agentId).collection('clients').doc();
    const clientPayload: Record<string, unknown> = {
      name,
      phone: finalPhone,
      email: finalEmail,
      clientCode,
      agentId,
      createdAt: now,
      preferredLanguage: 'en',
      convertedFromLeadId: leadId,
      convertedFromLeadAt: now,
    };
    if (finalDateOfBirth) clientPayload.dateOfBirth = finalDateOfBirth;
    if (notes) {
      clientPayload.notes = notes;
      clientPayload.notesUpdatedAt = now;
    }
    // Carry the primary's underwriting basics + the captured household snapshot
    // (people + financials) onto the per-agent client doc so they aren't lost on
    // conversion. Kept off the top-level mirror (it's the lighter public index).
    if (leadData.gender) clientPayload.gender = leadData.gender;
    if (leadData.smokerStatus) clientPayload.smokerStatus = leadData.smokerStatus;
    if (leadData.heightText) clientPayload.heightText = leadData.heightText;
    if (typeof leadData.weightLbs === 'number') clientPayload.weightLbs = leadData.weightLbs;
    if (leadData.household && typeof leadData.household === 'object') clientPayload.household = leadData.household;
    // Household linking (Phase 2): when the lead has insured people, this
    // client is the household's primary. Members link back via householdId.
    if (household.exists) {
      clientPayload.householdId = household.id;
      clientPayload.householdRole = 'primary';
      clientPayload.householdRelationship = 'self';
      clientPayload.householdPrimaryName = name;
    }

    // Top-level mirrors (matches the existing Add Client flow). Keep the
    // gap-filled contact values in sync with the per-agent doc above.
    const topLevelClientPayload: Record<string, unknown> = {
      name,
      phone: finalPhone,
      email: finalEmail,
      clientCode,
      agentId,
      createdAt: now,
      preferredLanguage: 'en',
    };
    if (finalDateOfBirth) topLevelClientPayload.dateOfBirth = finalDateOfBirth;

    const batch = db.batch();
    batch.set(clientRef, clientPayload);
    batch.set(db.collection('clients').doc(clientRef.id), topLevelClientPayload);
    batch.set(db.collection('clientCodes').doc(clientCode), { agentId, clientId: clientRef.id });
    batch.update(leadRef, {
      convertedToClientId: clientRef.id,
      convertedToClientCode: clientCode,
      convertedAt: now,
      lastDialOutcome: FieldValue.delete(),  // falls out of queue regardless
      ...(household.exists ? { householdId: household.id } : {}),
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
      householdId: household.exists ? household.id : null,
      alreadyConverted: false,
    });
  } catch (error) {
    console.error('leads/convert POST error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
