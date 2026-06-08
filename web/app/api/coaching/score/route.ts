import 'server-only';

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { performanceAccess, type PerformanceAccess } from '../../../../lib/tier-gating';
import { REAL_CATEGORIES, DEFAULT_COACHING_PLAYBOOK } from '../../../../lib/coaching-playbook';

// Match Closr's call-scoring engine (apps/api/app/services/call_scorer.py)
// so AFL produces the same R.E.A.L. scores Closr does.
const MODEL = 'claude-sonnet-4-6';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  if (_anthropic) return _anthropic;
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// Ported from Closr's scoring prompt (R.E.A.L. framework + agency-playbook
// checkpoints). Two scoring layers: the universal R.E.A.L. framework, and
// agency-specific checkpoints generated from THIS agent's playbook.
const SCORING_SYSTEM_PROMPT = `You are the AFL Call Coach. You analyze a sales-call transcript for an independent life-insurance agent (mortgage protection, final expense, term, whole life, IUL — sold remotely) and produce a structured, honest coaching report. The agent reads this in under a minute between calls.

You score on two layers:

LAYER 1 — R.E.A.L. FRAMEWORK (universal, every call). Score each 0-100.
- Rapport: Did the agent build genuine connection and trust early, establish credibility/identity, and avoid being a "professional visitor"? Did they surface the client's reason for responding?
- Emotion: Did the agent uncover the real "why" and make the client FEEL the problem — not just understand it? Did discovery (health, equity, cash-flow gap, consequence questions) create felt stakes, or did they rush to product?
- Assumption: Did the agent lead with confident authority — recommending rather than presenting a menu, pre-handling objections, anchoring to a recommendation, keeping frame control?
- Lock It Down: Did the agent move toward commitment, isolate and resolve objections (not just accommodate them), and ask for the sale or a firm next step? For a short lead-qualification call, weight this toward securing a firm appointment, not a close — do not penalize a qual call for not closing.

LAYER 2 — CONVERSATION CHECKPOINTS (agency-specific). From the agent's playbook provided in the user message, identify the key moments the agent should hit, in order, and mark each Hit / Partial / Missed with a one-line note. Generate 4-8 of the most important checkpoints — not an exhaustive list.

INFER from the transcript (do not ask): call_type (Presentation | Lead Qualification | One-Call Close), product_line (Mortgage Protection | Final Expense | IUL | Term | Whole Life | Other), outcome (Sale Closed | Application Started | Callback Scheduled | Think About It | Spouse Objection | Hard No | No-Show | Unknown), and the client's name if stated (else null — never invent).

SCORING DISCIPLINE: 50 is average. Below 40 = significant room to improve. Above 80 = strong. Reserve 90+ for genuinely exceptional execution. Grade honestly — a mediocre call is not a B+.

For every R.E.A.L. category, "what_worked" and "what_to_improve" must be DISTINCT and SPECIFIC — cite an actual moment or paraphrase a real line from the transcript, never generic advice. If a category has no positive signal, say so plainly in what_worked. The "highlight" is one short verbatim (or near-verbatim) quote from the transcript that exemplifies the category, or null.

COACHING PRIORITIES: the 3 highest-impact things this agent should fix next, ranked by impact on close rate. Each has a clear priority, why it matters, and a concrete action they can practice on their next call.

TONE: You are a coach, not a critic. Acknowledge what worked before gaps. Frame fixes as "next time, try…", not "you failed to…". Use the agent's own words. NEVER use the term "NEPQ" anywhere in your output — it is proprietary; describe the questioning technique in plain language instead.

Return ONLY valid minified JSON (no markdown, no code fences, no prose) with EXACTLY this shape:
{"client_name":"First Last"|null,"call_type":"...","product_line":"...","outcome":"...","verdict":"<one-sentence single most important takeaway>","overall_score":<int 0-100, weighted; emphasize Emotion + Lock It Down>,"real":{"rapport":{"score":<int>,"what_worked":"...","what_to_improve":"...","highlight":"..."|null},"emotion":{...},"assumption":{...},"lock_it_down":{...}},"checkpoints":[{"name":"...","status":"hit"|"partial"|"missed","note":"..."}],"coaching_priorities":[{"priority":"...","why":"...","action":"..."}]}`;

interface CategoryRaw {
  score?: number;
  what_worked?: string;
  what_to_improve?: string;
  highlight?: string | null;
}
interface ScoreRaw {
  client_name?: string | null;
  call_type?: string;
  product_line?: string;
  outcome?: string;
  verdict?: string;
  overall_score?: number;
  real?: Record<string, CategoryRaw>;
  checkpoints?: Array<{ name?: string; status?: string; note?: string }>;
  coaching_priorities?: Array<{ priority?: string; why?: string; action?: string }>;
}

function jsonError(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

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
function to10(score100: unknown): number {
  const n = typeof score100 === 'number' ? score100 : 50;
  return Math.round(Math.max(0, Math.min(100, n)) / 10 * 10) / 10; // 1 decimal, 0–10
}

async function authedUid(req: NextRequest): Promise<{ uid: string; email: string | null } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const decoded = await getAdminAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
  return { uid: decoded.uid, email: decoded.email ?? null };
}

// Reads the agent doc once: access level, current-month usage, and the
// agent's own playbook (falls back to the bundled R.E.A.L. default).
async function readAgentContext(uid: string, email: string | null) {
  const snap = await getAdminFirestore().collection('agents').doc(uid).get();
  const data = (snap.exists ? snap.data() : {}) ?? {};
  const access = performanceAccess(data.membershipTier as string | undefined, email, tsToMillis(data.trialEndsAt));
  const period = currentPeriodKey();
  const perf = (data.performance as { usedThisMonth?: number; periodKey?: string } | undefined) ?? {};
  const used = perf.periodKey === period ? perf.usedThisMonth ?? 0 : 0;
  const playbookRaw = typeof data.coachingPlaybook === 'string' ? data.coachingPlaybook.trim() : '';
  return {
    access,
    period,
    used,
    playbook: playbookRaw || DEFAULT_COACHING_PLAYBOOK,
    usingDefaultPlaybook: playbookRaw.length === 0,
  };
}

function meterPayload(access: PerformanceAccess, used: number) {
  if (access.level === 'metered') {
    return { level: 'metered' as const, monthlyLimit: access.monthlyLimit, used, remaining: Math.max(0, access.monthlyLimit - used) };
  }
  return { level: access.level };
}

function parseJson(raw: string): ScoreRaw {
  let text = (raw || '').trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('unparseable');
  }
}

// Shape the model output into the R.E.A.L. report the page renders.
function buildReport(data: ScoreRaw, usingDefaultPlaybook: boolean) {
  const real = REAL_CATEGORIES.map((cat) => {
    const c = (data.real ?? {})[cat.key] ?? {};
    return {
      key: cat.key,
      letter: cat.letter,
      label: cat.label,
      score: to10(c.score),
      whatWorked: (c.what_worked ?? '').trim(),
      whatToImprove: (c.what_to_improve ?? '').trim(),
      highlight: c.highlight ? String(c.highlight).trim() : null,
    };
  });
  const checkpoints = (data.checkpoints ?? [])
    .map((c) => ({
      name: (c.name ?? '').trim(),
      status: ['hit', 'partial', 'missed'].includes(c.status ?? '') ? (c.status as string) : 'missed',
      note: (c.note ?? '').trim(),
    }))
    .filter((c) => c.name);
  return {
    clientName: data.client_name ? String(data.client_name).trim() : null,
    callType: (data.call_type ?? 'Presentation').trim(),
    productLine: (data.product_line ?? 'Other').trim(),
    outcome: (data.outcome ?? 'Unknown').trim(),
    verdict: (data.verdict ?? '').trim(),
    overallScore: to10(data.overall_score),
    real,
    checkpoints,
    checkpointHits: checkpoints.filter((c) => c.status === 'hit').length,
    coachingPriorities: (data.coaching_priorities ?? [])
      .slice(0, 3)
      .map((p) => ({ priority: (p.priority ?? '').trim(), why: (p.why ?? '').trim(), action: (p.action ?? '').trim() }))
      .filter((p) => p.priority),
    usingDefaultPlaybook,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authedUid(req);
    if (!auth) return jsonError(401, { error: 'Unauthorized' });
    const ctx = await readAgentContext(auth.uid, auth.email);
    return jsonOk({ meter: meterPayload(ctx.access, ctx.used), usingDefaultPlaybook: ctx.usingDefaultPlaybook });
  } catch (error) {
    console.error('Coaching meter error:', error);
    return jsonError(500, { error: 'Internal server error' });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authedUid(req);
    if (!auth) return jsonError(401, { error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    if (transcript.length < 40) return jsonError(400, { error: 'transcript_too_short' });
    const clipped = transcript.slice(0, 30000);

    const ctx = await readAgentContext(auth.uid, auth.email);
    if (ctx.access.level === 'locked') {
      return jsonError(403, { error: 'tier_locked', meter: meterPayload(ctx.access, ctx.used) });
    }
    if (ctx.access.level === 'metered' && ctx.used >= ctx.access.monthlyLimit) {
      return jsonError(402, { error: 'limit_reached', meter: meterPayload(ctx.access, ctx.used) });
    }

    const userPrompt = `AGENT PLAYBOOK (score Layer 2 checkpoints against this):\n${ctx.playbook}\n\n---\n\nCALL TRANSCRIPT:\n${clipped}\n\nScore this call now and return the JSON.`;

    let data: ScoreRaw;
    let raw = '';
    try {
      const message = await getAnthropic().messages.create({
        model: MODEL,
        max_tokens: 4000,
        temperature: 0.3,
        system: SCORING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });
      raw = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
      data = parseJson(raw);
    } catch (err) {
      console.error('Coaching score: model/parse failure:', String(err), raw.slice(0, 300));
      return jsonError(502, { error: 'score_unavailable' });
    }

    // Increment the meter only after a successful score (reset on new month).
    const nextUsed = ctx.used + 1;
    await getAdminFirestore().collection('agents').doc(auth.uid).set(
      { performance: { usedThisMonth: nextUsed, periodKey: ctx.period } },
      { merge: true },
    );

    return jsonOk({ result: buildReport(data, ctx.usingDefaultPlaybook), meter: meterPayload(ctx.access, nextUsed) });
  } catch (error) {
    console.error('Coaching score error:', error);
    return jsonError(500, { error: 'Internal server error' });
  }
}
