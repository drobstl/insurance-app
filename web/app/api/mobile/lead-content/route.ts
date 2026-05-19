import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';

const MAX_ATTEMPTS = 30;
const WINDOW_MS = 60_000;

/**
 * Default 10-question assessment ("gap-revealing" — most natural answers
 * are "No"). Source-of-truth lives here so the mobile app doesn't need to
 * ship a copy; per-agent override happens by writing
 * `agents/{agentId}.leadContent.assessment` (Phase 2).
 */
const DEFAULT_ASSESSMENT = [
  { id: 'q1', prompt: 'Do you already have enough life insurance in place to fully protect your family?' },
  { id: 'q2', prompt: 'Would your family be financially secure without your income tomorrow?' },
  { id: 'q3', prompt: 'Have you already paid off all your major debts, including your mortgage?' },
  { id: 'q4', prompt: 'Would your loved ones have plenty of money set aside for final expenses?' },
  { id: 'q5', prompt: 'Do you already have coverage that would replace your income for several years?' },
  { id: 'q6', prompt: 'Have you already reviewed how much life insurance your family actually needs?' },
  { id: 'q7', prompt: 'Is protecting your family with additional coverage not a priority right now?' },
  { id: 'q8', prompt: 'Would leaving your family with no financial burden be unnecessary because everything is already covered?' },
  { id: 'q9', prompt: 'Do you already have a policy that fits your budget and gives you peace of mind?' },
  { id: 'q10', prompt: 'Is there nothing about your current situation that would make life insurance worth reviewing?' },
].map((q) => ({
  ...q,
  // Same three choices for every question. Yes / No / Not sure.
  choices: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
    { id: 'not_sure', label: 'Not sure' },
  ],
}));

/**
 * Platform-default video manifest. Empty URLs render an "agent hasn't
 * recorded this yet" placeholder in the mobile app — the lead-home screen
 * is never blank, even on day-1 agents who haven't uploaded anything.
 *
 * When the per-agent video upload + transcode pipeline lands (Chunk 3),
 * this falls through to merge with `agents/{agentId}.leadContent` so any
 * uploaded slot wins over the default.
 */
const PLATFORM_DEFAULTS = {
  intro: { url: '', durationSec: 0, title: 'Welcome — what to do next' },
  faqs: [
    { id: 'faq1', title: 'Is this going to be a sales pitch?', url: '', durationSec: 0 },
    { id: 'faq2', title: 'Why should I trust this?', url: '', durationSec: 0 },
  ],
  caseStudies: [
    { id: 'cs1', title: 'How a real client handled this', url: '', durationSec: 0 },
    { id: 'cs2', title: 'Another real-client conversation', url: '', durationSec: 0 },
  ],
};

/**
 * GET /api/mobile/lead-content?agentId=…
 *
 * Returns the merged content manifest for the lead-home screen: per-agent
 * uploads (when present) overlaid on platform defaults. Public — no auth
 * (the mobile app isn't authenticated for leads). Rate-limited per IP.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`lead-content:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }

    const url = new URL(req.url);
    const agentId = (url.searchParams.get('agentId') || '').trim();

    let agentOverrides: {
      intro?: { url?: string; durationSec?: number; title?: string };
      faqs?: Array<{ id: string; title?: string; url?: string; durationSec?: number }>;
      caseStudies?: Array<{ id: string; title?: string; url?: string; durationSec?: number }>;
      assessment?: typeof DEFAULT_ASSESSMENT;
    } = {};

    if (agentId) {
      const db = getAdminFirestore();
      const agentSnap = await db.collection('agents').doc(agentId).get();
      const data = agentSnap.data();
      if (data?.leadContent && typeof data.leadContent === 'object') {
        agentOverrides = data.leadContent as typeof agentOverrides;
      }
    }

    return NextResponse.json({
      mainVideo: { ...PLATFORM_DEFAULTS.intro, ...(agentOverrides.intro || {}) },
      faqs: (agentOverrides.faqs && agentOverrides.faqs.length > 0)
        ? agentOverrides.faqs
        : PLATFORM_DEFAULTS.faqs,
      caseStudies: (agentOverrides.caseStudies && agentOverrides.caseStudies.length > 0)
        ? agentOverrides.caseStudies
        : PLATFORM_DEFAULTS.caseStudies,
      assessment: agentOverrides.assessment || DEFAULT_ASSESSMENT,
    });
  } catch (error) {
    console.error('lead-content error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
