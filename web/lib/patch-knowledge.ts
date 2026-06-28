// Patch's knowledge — the single source of truth for what the product can do.
//
// This file feeds three surfaces from one place:
//   1. Patch's system prompt (web/app/api/dashboard-assistant/route.ts) renders
//      the feature catalog + "what's new" from here at request time, so when we
//      ship a feature Patch knows about it after ONE edit — no prompt surgery.
//   2. The "what's new" spotlight on the dashboard reads PATCH_WHATS_NEW.
//   3. Context-aware suggested questions can filter PATCH_FEATURES by tier/page.
//
// When you ship a feature: add/update its PATCH_FEATURES entry and prepend a
// PATCH_WHATS_NEW line. That's the whole maintenance burden.

export type PatchTier = 'all' | 'growth' | 'pro' | 'agency';

export interface PatchFeature {
  /** stable id, also usable as a suggestion/route key */
  key: string;
  /** display name as it appears in the sidebar */
  title: string;
  /** dashboard route */
  route: string;
  /** the lowest tier where this is a headline feature */
  tier: PatchTier;
  /** one or two sentences: what it does */
  what: string;
  /** the business outcome — why an agent should care */
  why?: string;
  /** concrete capabilities / how-tos, rendered as bullets */
  details?: string[];
}

export interface WhatsNewEntry {
  /** ISO date 'YYYY-MM-DD' (when it shipped) */
  date: string;
  title: string;
  summary: string;
  route?: string;
  tier?: PatchTier;
}

const TIER_LABEL: Record<PatchTier, string> = {
  all: '',
  growth: 'Growth+',
  pro: 'Pro+',
  agency: 'Agency',
};

export const PATCH_FEATURES: PatchFeature[] = [
  {
    key: 'home',
    title: 'Home',
    route: '/dashboard',
    tier: 'all',
    what: "The agent's daily pulse — a snapshot of the book and what to do first.",
    why: 'One glance tells you where the day should go.',
    details: [
      'Live ticker: clients on book, at-risk APV, appointments today, uncalled leads.',
      'Badge progress and the next training session.',
    ],
  },
  {
    key: 'leads',
    title: 'Leads',
    route: '/dashboard/leads',
    tier: 'pro',
    what: 'The pre-sale pipeline — where prospects live before they close.',
    why: 'Speed-to-lead and disciplined dialing turn raw leads into booked sits.',
    details: [
      'Drop a lead-form PDF (Mail-In, Symmetry Call-In, or Digital Lighthouse) — AFL extracts name, phone, age, address, mortgage, smoker + co-borrower status, and assessment fields. The login code defaults to the phone number.',
      'Add a lead manually when there is no PDF.',
      'Tap Call {lead} to dial, then pick an outcome on return. Outcomes drive the Call queue (never-dialed → overdue → filtered out for booked / not-interested / wrong-number / do-not-call).',
      'Book a phone or video appointment — paste a meeting link or auto-create a Google Meet; the day strip shows your existing Google Calendar events so you do not double-book.',
      'Send confirmation + reminder drawers with a locked SMS template, the state-matched license PDF, and your business card.',
      'Convert to client in one tap when the lead closes; auto push reminders fire before the appointment if the lead installed the app.',
    ],
  },
  {
    key: 'calendar',
    title: 'Calendar',
    route: '/dashboard/calendar',
    tier: 'pro',
    what: 'A week view of your booked sits alongside your Google Calendar availability.',
    why: 'Time-block your day and dial the Call queue in the gaps between sits.',
    details: [
      'Drag to reschedule; bookings, reschedules, and cancellations mirror one-way to Google Calendar.',
    ],
  },
  {
    key: 'clients',
    title: 'Clients',
    route: '/dashboard/clients',
    tier: 'all',
    what: 'The full book of business.',
    why: 'Every policy, beneficiary, and touchpoint for a client in one place.',
    details: [
      'Add a client manually, bulk-import a CSV, or upload a PDF application — AFL extracts client info, policies, and beneficiaries.',
      'Open any client for their policies, beneficiaries, referrals, and contact history.',
    ],
  },
  {
    key: 'action-items',
    title: 'Action Items',
    route: '/dashboard/action-items',
    tier: 'all',
    what: 'The daily workflow inbox — only the conversations that need your personal touch.',
    why: 'AFL handles what it can automatically; this is the curated "what needs you right now."',
    details: [
      'Four lanes in one place: Welcome, Retention, Anniversary, Referral.',
      'An Upcoming appointments card with one-tap Send reminder for the next 24 hours.',
      'The single dashboard surface to check every day.',
    ],
  },
  {
    key: 'activity',
    title: 'Activity',
    route: '/dashboard/activity',
    tier: 'pro',
    what: 'Your performance dashboard — the numbers behind the pipeline.',
    why: 'See which lever to pull: more dials, better booking, or tighter closing — and protect commission by watching chargebacks.',
    details: [
      'Dials + contact rate; appointments booked / showed / no-showed with show + book rates; sales + APV by source; retention saves; chargebacks; and a dials → contacts → booked → showed → close funnel.',
      'Time ranges (today / week / month / YTD) with deltas vs. the prior period.',
      'APV lifecycle: Submitted → Gross Issued → minus Chargebacks = Net Placed.',
      'A recent-wins feed plus a full, sortable, exportable APV ledger; back-book policies keep their real signed date.',
    ],
  },
  {
    key: 'retention',
    title: 'Retention',
    route: '/dashboard/conservation',
    tier: 'growth',
    what: 'Conservation alerts for at-risk policies, with multi-touch outreach.',
    why: 'Save the policy — and the commission — before a lapse or chargeback hits.',
    details: [
      'AFL detects lapsed payments, chargeback notices, and cancellation events and creates priority alerts (high / medium / low).',
      'It auto-sends outreach and surfaces the ones that need you personally in Action Items.',
      'Send manual messages; mark saved or lost. Chargeback alerts are most urgent — act within 24-48 hours.',
    ],
  },
  {
    key: 'rewrites',
    title: 'Rewrites',
    route: '/dashboard/policy-reviews',
    tier: 'growth',
    what: 'Policy-anniversary and rewrite alerts.',
    why: 'Turn the 1-year mark into a better-rate conversation and a retained client.',
    details: [
      'When a policy nears its 1-year anniversary AFL flags a possible rewrite and drafts the check-in or savings pitch.',
      'Pick a message style — relationship-first or savings-first — in Settings → Messages.',
    ],
  },
  {
    key: 'referrals',
    title: 'Referrals',
    route: '/dashboard/referrals',
    tier: 'growth',
    what: 'The referral pipeline, qualified for you by the AFL referral assistant.',
    why: 'Warm leads from existing clients, qualified and booked without you lifting a finger.',
    details: [
      'The referral assistant texts the referral, qualifies them with NEPQ-style questions, and books on your scheduling link.',
      'Watch each referral’s status and take over manually anytime; stalled ones surface in Action Items.',
      'Enable in Settings → Messages (toggle the AI assistant and add a scheduling link).',
    ],
  },
  {
    key: 'coaching',
    title: 'Coaching',
    route: '/dashboard/coaching',
    tier: 'growth',
    what: 'AI call coaching — paste a transcript, get scored, get better.',
    why: 'Turn every call into a rep: see exactly where the sale slips and the one behavior to change next time.',
    details: [
      'Scores on the R.E.A.L. framework (Relationship, Engagement, Ask, Listen) with checkpoint hits, what worked, what to improve, and your top coaching priorities.',
      'Growth includes 4 scored calls a month; Pro is unlimited, with a customizable playbook and full history.',
    ],
  },
  {
    key: 'resources',
    title: 'Resources',
    route: '/dashboard/resources',
    tier: 'all',
    what: 'Help, walkthroughs, and downloads.',
    why: 'The getting-started hub — the place to learn a feature you have not tried.',
    details: [
      'A how-do-I FAQ, walkthrough videos (the 90-second end-of-sale ritual, bulk import), and downloads (intro script, app preview).',
      'Pinned at the bottom of the sidebar.',
    ],
  },
  {
    key: 'settings',
    title: 'Settings',
    route: '/dashboard/settings',
    tier: 'all',
    what: 'Your identity, branding, messaging, and account — across five tabs.',
    why: 'A complete, branded profile is what makes the client-facing app feel like yours.',
    details: [
      'Profile: name, phone, email, headshot, scheduling link, NPN, and per-state license PDFs (auto-attached to confirmations).',
      'Branding: agency name, logo, and business card that brand the client mobile app.',
      'Messages: the AFL referral assistant toggle, lead intro text, dial script, referral intro, client welcome text, anniversary style, holiday cards, and rewrite campaigns.',
      'Appointments & Leads: phone-vs-video default, meeting link, auto-create Google Meet, push-reminder timing, dial persistence, and lead-home videos.',
      'Account: subscription tier + Stripe billing portal, Google Drive + Google Calendar connections, recruit invites, email, and password.',
    ],
  },
  {
    key: 'feedback',
    title: 'Feedback',
    route: '/dashboard/feedback',
    tier: 'all',
    what: 'Surveys, feature requests, and bug reports straight to the AFL team.',
    details: ['Upvote feature ideas and report problems with the product area attached.'],
  },
];

// Recently shipped — newest first. Prepend a line when you ship something an
// agent would want to discover. Patch mentions these when relevant, and the
// dashboard "what's new" spotlight renders the same list.
export const PATCH_WHATS_NEW: WhatsNewEntry[] = [
  {
    date: '2026-06-26',
    title: 'Lead tags',
    summary: 'Tag and color-code your leads (e.g. FIF reset) to keep the pipeline organized.',
    route: '/dashboard/leads',
    tier: 'pro',
  },
  {
    date: '2026-06-26',
    title: 'Lead filters',
    summary: 'Filter your lead list by tag, status, and more.',
    route: '/dashboard/leads',
    tier: 'pro',
  },
  {
    date: '2026-06-26',
    title: 'Business card sharing on Android',
    summary: 'Sharing your card now sends the text first with short tap-to-save links — no more false "attached."',
  },
  {
    date: '2026-06-25',
    title: 'Lead state drives license matching',
    summary: 'The right state license attaches automatically based on where the lead lives.',
    route: '/dashboard/leads',
    tier: 'pro',
  },
];

/** Render the feature catalog as markdown for Patch's system prompt. */
export function renderFeatureCatalog(features: PatchFeature[] = PATCH_FEATURES): string {
  return features
    .map((f) => {
      const tier = TIER_LABEL[f.tier];
      const tierTag = tier ? ` [${tier}]` : '';
      const lines = [`**[${f.title}](${f.route})**${tierTag} — ${f.what}`];
      if (f.why) lines.push(`  Why it matters: ${f.why}`);
      (f.details ?? []).forEach((d) => lines.push(`  - ${d}`));
      return lines.join('\n');
    })
    .join('\n\n');
}

/** Render the recent-ships list as markdown for Patch's system prompt. */
export function renderWhatsNew(entries: WhatsNewEntry[] = PATCH_WHATS_NEW, limit = 8): string {
  const recent = entries.slice(0, limit);
  if (recent.length === 0) return 'Nothing brand-new to flag right now.';
  return recent
    .map((e) => {
      const link = e.route ? ` [open](${e.route})` : '';
      return `- **${e.title}** (${e.date}) — ${e.summary}${link}`;
    })
    .join('\n');
}

export interface PatchWalkthrough {
  id: string;
  title: string;
  about: string;
}

// Short walkthrough videos Patch can launch directly. The ids match the
// WalkthroughId union on the Resources page; linking
// /dashboard/resources?watch=<id> opens that video. Add an entry here when a
// new walkthrough is added there.
export const PATCH_WALKTHROUGHS: PatchWalkthrough[] = [
  {
    id: 'onboarding',
    title: 'The 90-second end-of-sale ritual',
    about:
      'onboarding a client live on the call — drop the PDF, send the welcome, walk them through download → notifications → Activate, then ask for the referral',
  },
  {
    id: 'bulkImport',
    title: 'Bulk import — migrate your existing book',
    about: 'bringing an existing book into AFL via CSV or a folder of PDFs, with daily drip pacing',
  },
];

/** Render the launchable walkthroughs as markdown for Patch's system prompt. */
export function renderWalkthroughs(items: PatchWalkthrough[] = PATCH_WALKTHROUGHS): string {
  return items
    .map(
      (w) =>
        `- **${w.title}** (${w.about}) — link it as [watch the walkthrough](/dashboard/resources?watch=${w.id}); clicking opens the video.`,
    )
    .join('\n');
}

// Suggested questions shown when Patch opens with an empty thread. Page-aware:
// the agent's current route picks the most relevant set, with a general fallback.
const DEFAULT_SUGGESTED_QUESTIONS = [
  'How do I add clients?',
  'How do referrals work?',
  'What are conservation alerts?',
  'Where do I change my branding?',
];

const SUGGESTIONS_BY_ROUTE: Record<string, string[]> = {
  '/dashboard/leads': [
    'How do I add a lead?',
    'How do I book an appointment?',
    'How does the call queue work?',
    "What's the 'do not call' outcome?",
  ],
  '/dashboard/calendar': ['How do I see my calendar in AFL?', 'How do I reschedule an appointment?'],
  '/dashboard/clients': [
    'How do I add clients?',
    'How does bulk import work?',
    "What's the 90-second onboarding ritual?",
  ],
  '/dashboard/action-items': ['What are Action Items?', 'How do completion actions work on action items?'],
  '/dashboard/activity': [
    'How do I read my numbers?',
    "What's APV net placed?",
    'What does my book rate tell me?',
  ],
  '/dashboard/conservation': ['What are conservation alerts?', 'What is a chargeback alert?'],
  '/dashboard/policy-reviews': ["What's a rewrite alert?", 'How do anniversary messages work?'],
  '/dashboard/referrals': ['How do referrals work?', 'How do I turn on the referral assistant?'],
  '/dashboard/coaching': [
    'How does call coaching work?',
    "What's the R.E.A.L. framework?",
    'How many calls can I score?',
  ],
  '/dashboard/settings': [
    'Where do I change my branding?',
    'How do I switch plans?',
    'How do I connect Google Calendar?',
  ],
};

/** Page-aware suggested questions for the Patch launcher. */
export function getSuggestedQuestions(pathname?: string | null): string[] {
  if (pathname) {
    const match = Object.keys(SUGGESTIONS_BY_ROUTE)
      .filter((route) => pathname.startsWith(route))
      .sort((a, b) => b.length - a.length)[0];
    if (match) return SUGGESTIONS_BY_ROUTE[match];
  }
  return DEFAULT_SUGGESTED_QUESTIONS;
}
