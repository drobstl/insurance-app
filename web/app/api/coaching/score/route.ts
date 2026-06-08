import 'server-only';

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  performanceAccess,
  type PerformanceAccess,
} from '../../../../lib/tier-gating';

// Match the model the dashboard assistant pins so the whole app moves in
// lockstep on model bumps (one constant to change, repo-wide).
const MODEL = 'claude-sonnet-4-20250514';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  if (_anthropic) return _anthropic;
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const SYSTEM_PROMPT = `You are the call coach inside Agent for Life (AFL), a platform for independent life-insurance agents who sell mortgage protection, final expense, and term life remotely (100% phone/Zoom, no walk-ins).

You score ONE sales-call transcript and return concise, specific, actionable coaching. The agent will read this in 30 seconds between calls — be sharp, not generic.

Score against the remote life-insurance sales motion:
- Opening & Rapport: pattern-interrupt, warm tone, reason for the call, permission to proceed.
- Discovery (NEPQ-style): asks problem-awareness + consequence questions, lets the prospect talk, uncovers the real "why" (family, mortgage, debt), confirms beneficiary intent. Penalize pitching before discovering.
- Closing & Booking: clear recommendation tied to what they uncovered, handles objections without pressure, asks for the sale or books the next concrete step.

Grade honestly. A mediocre call is a B-/C+, not a B+. Reserve 90+ for genuinely excellent calls. Improvements must quote or paraphrase a SPECIFIC moment from the transcript — never generic advice like "build more rapport." The suggested line must be one sentence the agent could literally say next time.

Return ONLY valid minified JSON (no markdown, no code fences, no preamble) with EXACTLY this shape:
{"overallScore":<int 0-100>,"grade":"<letter grade like A-, B+, C>","summary":"<1-2 sentence honest read of the call>","dimensions":[{"name":"Opening & Rapport","score":<int 0-100>},{"name":"Discovery","score":<int 0-100>},{"name":"Closing & Booking","score":<int 0-100>}],"strengths":["<2-3 specific things that worked>"],"improvements":[{"point":"<specific fix>","why":"<the moment in the call it addresses>"}],"suggestedLine":"<one sentence the agent could say next time>"}`;

interface ScoreResult {
  overallScore: number;
  grade: string;
  summary: string;
  dimensions: Array<{ name: string; score: number }>;
  strengths: string[];
  improvements: Array<{ point: string; why: string }>;
  suggestedLine: string;
}

function jsonError(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Calendar-month period key, server time (UTC). The meter resets when
// this rolls over. (MVP: calendar month; a billing-cycle-anchored reset
// is a documented follow-up — see BACKLOG "Performance feature metering".)
function currentPeriodKey(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function tsToMillis(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

// Reads the agent doc and resolves access + the current month's usage.
// Read-only: never writes (so GET can call it freely).
async function resolveMeter(uid: string, email: string | null) {
  const snap = await getAdminFirestore().collection('agents').doc(uid).get();
  const data = (snap.exists ? snap.data() : {}) ?? {};
  const access = performanceAccess(
    data.membershipTier as string | undefined,
    email,
    tsToMillis(data.trialEndsAt),
  );
  const period = currentPeriodKey();
  const perf = (data.performance as { usedThisMonth?: number; periodKey?: string } | undefined) ?? {};
  const used = perf.periodKey === period ? perf.usedThisMonth ?? 0 : 0;
  return { access, period, used };
}

function meterPayload(access: PerformanceAccess, used: number) {
  if (access.level === 'metered') {
    return {
      level: 'metered' as const,
      monthlyLimit: access.monthlyLimit,
      used,
      remaining: Math.max(0, access.monthlyLimit - used),
    };
  }
  return { level: access.level };
}

async function authedUid(req: NextRequest): Promise<{ uid: string; email: string | null } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split('Bearer ')[1];
  const decoded = await getAdminAuth().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email ?? null };
}

// GET → the page reads this on load to render the meter chip + lock state.
export async function GET(req: NextRequest) {
  try {
    const auth = await authedUid(req);
    if (!auth) return jsonError(401, { error: 'Unauthorized' });
    const { access, used } = await resolveMeter(auth.uid, auth.email);
    return jsonOk({ meter: meterPayload(access, used) });
  } catch (error) {
    console.error('Coaching meter error:', error);
    return jsonError(500, { error: 'Internal server error' });
  }
}

// POST { transcript } → score the call, then increment the meter.
export async function POST(req: NextRequest) {
  try {
    const auth = await authedUid(req);
    if (!auth) return jsonError(401, { error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    if (transcript.length < 40) {
      return jsonError(400, { error: 'transcript_too_short' });
    }
    // Guard against pasting a whole CRM export; keep the model focused +
    // costs bounded. ~30k chars is a very long call.
    const clipped = transcript.slice(0, 30000);

    const { access, period, used } = await resolveMeter(auth.uid, auth.email);
    if (access.level === 'locked') {
      return jsonError(403, { error: 'tier_locked', meter: meterPayload(access, used) });
    }
    if (access.level === 'metered' && used >= access.monthlyLimit) {
      return jsonError(402, { error: 'limit_reached', meter: meterPayload(access, used) });
    }

    const anthropic = getAnthropic();
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Score this sales call transcript:\n\n${clipped}` }],
    });

    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    let result: ScoreResult;
    try {
      // Be tolerant of a stray code fence even though we asked for none.
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      console.error('Coaching score: unparseable model output:', raw.slice(0, 500));
      return jsonError(502, { error: 'score_unavailable' });
    }

    // Increment the meter only after a successful score. Reset the counter
    // when the stored period is stale.
    const nextUsed = used + 1;
    await getAdminFirestore().collection('agents').doc(auth.uid).set(
      { performance: { usedThisMonth: nextUsed, periodKey: period } },
      { merge: true },
    );

    return jsonOk({ result, meter: meterPayload(access, nextUsed) });
  } catch (error) {
    console.error('Coaching score error:', error);
    return jsonError(500, { error: 'Internal server error' });
  }
}
