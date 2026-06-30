import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { DEFAULT_ASSESSMENT, type AssessmentQuestion } from '../../../../lib/lead-assessment';

const MAX_ATTEMPTS = 30;
const WINDOW_MS = 60_000;

// The 7-question default assessment + its scoring metadata live in
// `web/lib/lead-assessment.ts` (shared with the submit handler + dashboard).

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

// Age-aware platform-default FAQ videos. Real, hosted clips (Bunny Stream)
// that play automatically when the agent hasn't recorded their own FAQ.
//   - Under 40: the "do I need this now?" clip — explicitly written for
//     younger leads, so only confirmed under-40s get it.
//   - 40+ OR unknown age: the "cost & approval" clip — age-neutral (it never
//     mentions age), so it's the safe default for older leads AND for the many
//     leads with no date of birth on file.
// videoIds live in the AFL Bunny library (672807); URLs are public CDN paths.
const YOUNG_FAQ_MAX_AGE = 40;
const YOUNG_FAQ_DEFAULT = {
  id: 'faq-default-young',
  title: 'I’m young and healthy — do I really need this now?',
  url: 'https://vz-a54402da-888.b-cdn.net/7b3ebe94-fbd8-453e-ba92-6007fa8848dd/playlist.m3u8',
  iframeUrl: 'https://iframe.mediadelivery.net/embed/672807/7b3ebe94-fbd8-453e-ba92-6007fa8848dd',
  thumbnailUrl: 'https://vz-a54402da-888.b-cdn.net/7b3ebe94-fbd8-453e-ba92-6007fa8848dd/thumbnail.jpg',
  videoId: '7b3ebe94-fbd8-453e-ba92-6007fa8848dd',
  durationSec: 57,
};
const COST_FAQ_DEFAULT = {
  id: 'faq-default-cost',
  title: 'Won’t this cost too much — and would I even qualify?',
  url: 'https://vz-a54402da-888.b-cdn.net/eed95098-f294-488d-a8c9-04d1412d0794/playlist.m3u8',
  iframeUrl: 'https://iframe.mediadelivery.net/embed/672807/eed95098-f294-488d-a8c9-04d1412d0794',
  thumbnailUrl: 'https://vz-a54402da-888.b-cdn.net/eed95098-f294-488d-a8c9-04d1412d0794/thumbnail.jpg',
  videoId: 'eed95098-f294-488d-a8c9-04d1412d0794',
  durationSec: 53,
};
// Universal — shown to every lead (alongside their age-aware clip), since the
// "I already have coverage through work" myth isn't age-specific.
const WORK_FAQ_DEFAULT = {
  id: 'faq-default-work',
  title: 'Don’t I already have enough through work?',
  url: 'https://vz-a54402da-888.b-cdn.net/179478cb-9a68-4adc-951f-91088056e8f7/playlist.m3u8',
  iframeUrl: 'https://iframe.mediadelivery.net/embed/672807/179478cb-9a68-4adc-951f-91088056e8f7',
  thumbnailUrl: 'https://vz-a54402da-888.b-cdn.net/179478cb-9a68-4adc-951f-91088056e8f7/thumbnail.jpg',
  videoId: '179478cb-9a68-4adc-951f-91088056e8f7',
  durationSec: 55,
};

// Whole years from a YYYY-MM-DD date of birth; undefined if missing/invalid.
function ageFromDob(dob?: unknown): number | undefined {
  if (typeof dob !== 'string' || !dob.trim()) return undefined;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return undefined;
  const a = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return a > 0 && a < 120 ? a : undefined;
}

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
    // The lead's own id (mobile session `clientId`). Lets us read their age
    // server-side to pick the age-appropriate default FAQ. Optional — old app
    // builds that don't send it simply get no age-targeted default.
    const leadId = (url.searchParams.get('leadId') || '').trim();

    let agentOverrides: {
      intro?: { url?: string; durationSec?: number; title?: string };
      faqs?: Array<{ id: string; title?: string; url?: string; durationSec?: number }>;
      caseStudies?: Array<{ id: string; title?: string; url?: string; durationSec?: number }>;
      assessment?: AssessmentQuestion[];
    } = {};
    // Per-section visibility (top-level on the agent doc, not under
    // leadContent). undefined = "show only if real videos exist".
    let showFaqs: boolean | undefined;
    let showCaseStudies: boolean | undefined;
    let leadAge: number | undefined;

    if (agentId) {
      const db = getAdminFirestore();
      const agentSnap = await db.collection('agents').doc(agentId).get();
      const data = agentSnap.data();
      if (data?.leadContent && typeof data.leadContent === 'object') {
        agentOverrides = data.leadContent as typeof agentOverrides;
      }
      if (typeof data?.showLeadFaqs === 'boolean') showFaqs = data.showLeadFaqs;
      if (typeof data?.showLeadCaseStudies === 'boolean') showCaseStudies = data.showLeadCaseStudies;

      // Read the lead's age (from dateOfBirth) to age-target default FAQs.
      // Best-effort: a missing lead / missing DOB just leaves age undefined.
      if (leadId) {
        try {
          const leadSnap = await db.collection('agents').doc(agentId).collection('leads').doc(leadId).get();
          leadAge = ageFromDob(leadSnap.data()?.dateOfBirth);
        } catch {
          /* ignore — age stays undefined */
        }
      }
    }

    // Resolve a section to the array the lead-home should render. The mobile
    // app hides a section entirely when its array is empty, so returning []
    // suppresses it. Rule: explicit false → hidden; real uploads → show them;
    // explicit true (no uploads) → platform defaults; undefined (no uploads)
    // → hidden (no "Coming soon" placeholders for day-1 agents).
    const resolveSection = <T,>(
      show: boolean | undefined,
      uploads: T[] | undefined,
      defaults: T[],
    ): T[] => {
      if (show === false) return [];
      if (uploads && uploads.length > 0) return uploads;
      return show === true ? defaults : [];
    };

    // FAQ defaults. Unless the agent opted out (false) or uploaded their own,
    // every lead gets two real clips: an age-aware one (confirmed under-40s →
    // "do I need this now?"; everyone else, incl. unknown age → "cost &
    // approval"), plus the universal "coverage through work" clip. No
    // placeholders. Mobile shows up to two FAQ tiles, so this fills both.
    const resolveFaqs = (): Array<Record<string, unknown>> => {
      if (showFaqs === false) return [];
      if (agentOverrides.faqs && agentOverrides.faqs.length > 0) return agentOverrides.faqs;
      const ageAware = leadAge !== undefined && leadAge < YOUNG_FAQ_MAX_AGE ? YOUNG_FAQ_DEFAULT : COST_FAQ_DEFAULT;
      return [ageAware, WORK_FAQ_DEFAULT];
    };

    return NextResponse.json({
      mainVideo: { ...PLATFORM_DEFAULTS.intro, ...(agentOverrides.intro || {}) },
      faqs: resolveFaqs(),
      caseStudies: resolveSection(showCaseStudies, agentOverrides.caseStudies, PLATFORM_DEFAULTS.caseStudies),
      // Strip scoring metadata (dimension/points) — the lead's app only needs
      // prompts + choice labels; scoring stays server-side.
      assessment: (agentOverrides.assessment || DEFAULT_ASSESSMENT).map((q) => ({
        id: q.id,
        prompt: q.prompt,
        choices: (q.choices || []).map((c) => ({ id: c.id, label: c.label })),
      })),
    });
  } catch (error) {
    console.error('lead-content error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
