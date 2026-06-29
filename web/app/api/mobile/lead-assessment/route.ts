import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { findLeadByCode } from '../../../../lib/lead-code-lookup';
import { isLeadCode } from '../../../../lib/lead-code-derive';
import {
  DEFAULT_ASSESSMENT,
  scoreAssessment,
  TEMPERATURE_LABELS,
  type AssessmentQuestion,
} from '../../../../lib/lead-assessment';

const MAX_ATTEMPTS = 20;
const WINDOW_MS = 60_000;

/**
 * POST /api/mobile/lead-assessment
 *
 * Public endpoint for the mobile app's lead-home assessment screen. Auth is
 * by lead code (which the lead has already entered to get past /login), not
 * by Firebase ID token — leads are not authenticated Firebase users.
 *
 * Body: { leadCode: string, answers: Record<questionId, choiceId> }
 *
 * Side effects:
 *   1. Writes `assessmentAnswers` + `assessmentCompletedAt` + the derived
 *      `leadScore` (temperature / dimension breakdown / summary) to the lead doc.
 *   2. Pushes a `lead_assessment_completed` event into the agent's
 *      activity feed so the agent sees it before the appointment. (Phase 1
 *      doesn't write to the action-feed action-items system because that's
 *      computed for clients/policies; lead engagement surfaces on the
 *      `/dashboard/leads/[leadId]` detail page directly.)
 *
 * Rate-limited to 20 requests/minute per IP (assessment is one POST per
 * lead per session — 20 leaves headroom for typo-retry cases).
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`lead-assessment:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawCode = typeof body?.leadCode === 'string' ? body.leadCode : '';
    const answers = body?.answers && typeof body.answers === 'object' ? body.answers as Record<string, unknown> : {};

    if (!rawCode.trim()) {
      return NextResponse.json({ error: 'Missing leadCode' }, { status: 400 });
    }
    if (Object.keys(answers).length === 0) {
      return NextResponse.json({ error: 'Missing answers' }, { status: 400 });
    }

    const normalizedCode = rawCode.trim().toUpperCase();
    if (!isLeadCode(normalizedCode)) {
      return NextResponse.json({ error: 'Not a lead code' }, { status: 400 });
    }

    const match = await findLeadByCode(normalizedCode);
    if (!match) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Coerce answers to a plain string-keyed string-valued map so we never
    // accidentally store untyped client input (objects, functions, prototypes).
    const cleanAnswers: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      if (typeof k !== 'string' || typeof v !== 'string') continue;
      const truncatedKey = k.slice(0, 64);
      const truncatedVal = v.slice(0, 64);
      cleanAnswers[truncatedKey] = truncatedVal;
    }
    if (Object.keys(cleanAnswers).length === 0) {
      return NextResponse.json({ error: 'Answers payload was empty after sanitization' }, { status: 400 });
    }

    const db = getAdminFirestore();

    // Resolve the questions actually shown to this lead — per-agent override
    // (Phase 2) falls back to the platform default — so scoring matches the
    // assessment they saw. Computed once here and stored structured on the
    // lead (temperature + per-dimension breakdown + summary) so the dashboard
    // and a future leads-query layer read fields, not raw answers.
    let questions: AssessmentQuestion[] = DEFAULT_ASSESSMENT;
    try {
      const agentSnap = await db.collection('agents').doc(match.agentId).get();
      const override = agentSnap.data()?.leadContent?.assessment;
      if (Array.isArray(override) && override.length > 0) {
        questions = override as AssessmentQuestion[];
      }
    } catch {
      // Fall back to the default question set on any read error.
    }

    const leadScore = scoreAssessment(questions, cleanAnswers);

    await match.leadRef.update({
      assessmentAnswers: cleanAnswers,
      assessmentCompletedAt: FieldValue.serverTimestamp(),
      leadScore,
      // Smart follow-up (Step 2): finishing the in-app assessment is a strong
      // "warm right now" signal — auto-surface the lead in the agent's
      // Follow-ups-due (followUpAt <= now) so they reach out while it's hot.
      // Overwrites any prior date because this is the freshest reason to call.
      followUpAt: FieldValue.serverTimestamp(),
      followUpNote: 'Just finished the in-app assessment — reach out while warm',
      // System-suggested (not agent-set) → the Action items surface groups it
      // under "Suggested", separate from the agent's own follow-ups.
      autoFollowUpReason: 'assessment_completed',
    });

    // Activity-feed entry on the agent's `leadActivity` subcollection. The
    // dashboard lead-detail page reads this to render an "answered the
    // assessment" timeline. Separate from the action-feed (which is for
    // clients only).
    await db
      .collection('agents')
      .doc(match.agentId)
      .collection('leadActivity')
      .add({
        leadId: match.leadId,
        kind: 'lead_assessment_completed',
        at: FieldValue.serverTimestamp(),
        summary: `Lead completed the assessment — ${TEMPERATURE_LABELS[leadScore.temperature]} lead`,
        temperature: leadScore.temperature,
      })
      .catch(() => {
        // Activity-log failure shouldn't fail the user-visible save.
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('lead-assessment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
