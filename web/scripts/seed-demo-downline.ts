#!/usr/bin/env npx tsx
/**
 * seed-demo-downline — TEMPORARY fake downline agents for a My Team demo.
 *
 * Creates a handful of clearly-marked fake agents (`isDemoSeed: true`,
 * doc ids prefixed `demo-seed-`) under an owner's downline
 * (`agencyOwnerId` = owner uid), each with enough seeded activity —
 * leads/dialLogs, appointments, clients + policies, referrals, saved
 * conservation alerts, coaching scores — that the My Team dashboard
 * renders a full leaderboard, coaching radar, trend arrows, and agency
 * rollup. Personas are tuned so the screen tells a story: a top
 * producer, a riser, a slipping agent (decline detection), a
 * high-activity/low-close agent (coaching focus), etc.
 *
 * THIS IS DEMO STAGING, NOT REAL PRODUCTION DATA. Purge right after the
 * demo. Fake agents have no auth account, no phone, a non-routable
 * example.com email, and `automatedOutreachHold: true` so no cron ever
 * contacts them.
 *
 * Default: DRY RUN — prints the plan, writes nothing.
 *   --apply   actually write
 *   --purge   delete every isDemoSeed agent under the owner (recursive)
 *   --owner=<email>   the agency owner (default daniel@crosswindsfg.com)
 *
 * Run (from web/):
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/seed-demo-downline.ts --owner=you@example.com --apply
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/seed-demo-downline.ts --owner=you@example.com --purge
 */
import * as fs from 'fs';
import * as path from 'path';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../lib/firebase-admin';

for (const f of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

// ── args ─────────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply');
const PURGE = process.argv.includes('--purge');
const OWNER_EMAIL =
  process.argv.find((a) => a.startsWith('--owner='))?.slice('--owner='.length) ||
  'daniel@crosswindsfg.com';

// ── date helpers ─────────────────────────────────────────────────────
const now = new Date();
/** A Date n days before now, pinned to a given hour (local server tz). */
function daysAgo(n: number, hour = 13): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(hour, (n * 17) % 60, 0, 0);
  return d;
}
function ts(n: number, hour = 13): Timestamp {
  return Timestamp.fromDate(daysAgo(n, hour));
}
/** YYYY-MM-DD for a date n days ago (policy date fields are ymd strings). */
function ymd(n: number): string {
  const d = daysAgo(n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── persona definitions ──────────────────────────────────────────────
// Dial outcomes must come from the locked vocabulary in lib/challenges.ts.
// "Contact" = anything except no_answer / left_vm.
type Outcome =
  | 'booked' | 'callback_requested' | 'left_vm' | 'no_answer'
  | 'wrong_number' | 'not_interested' | 'do_not_call';

interface SaleSpec {
  daysAgo: number;        // applicationSignedDate
  premium: number;        // monthly
  source: 'bought_lead' | 'referral' | 'rewrite' | 'manual_add';
  clientName: string;
  carrier: string;
  product: string;
  issuePaidDaysAgo?: number;   // sets issuePaidDate (net-placed credit)
  chargebackDaysAgo?: number;  // sets chargebackDate (chargeback in window)
}

interface Persona {
  slug: string;
  name: string;
  /** [daysAgo, dials, contactEvery] — one lead doc per entry, dialLog spread that day. */
  dialDays: Array<[number, number, number]>;
  /** [daysAgo, status] appointment docs (kind: appointment). */
  appts: Array<[number, string]>;
  sales: SaleSpec[];
  /** referrals received, as daysAgo offsets */
  referrals: number[];
  /** saved conservation alerts: [daysAgo, monthlyPremium, clientName] */
  saves: Array<[number, number, string]>;
  /** coaching scores: [daysAgo, overall, rapport, emotion, assumption, lockItDown] on 0–10 */
  coaching: Array<[number, number, number, number, number, number]>;
  coachingPriority: { priority: string; why: string; action: string };
}

const FIRST_NAMES = ['Alex', 'Jordan', 'Maria', 'Denise', 'Carl', 'Tonya', 'Ray', 'Peggy', 'Marcus', 'Linda', 'Hank', 'Rosa', 'Walt', 'June', 'Otis', 'Faye'];
const LAST_NAMES = ['Hutchins', 'Delgado', 'Pruitt', 'Kessler', 'Amos', 'Whitaker', 'Ferris', 'Boland', 'Nakamura', 'Ledoux', 'Granger', 'Ortiz', 'Mabry', 'Stanton', 'Pickett', 'Doyle'];
function fakeClientName(i: number): string {
  return `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`;
}

const CARRIERS = ['Mutual of Omaha', 'Americo', 'Foresters', 'American Amicable', 'Transamerica'];
const PRODUCTS = ['Mortgage Protection', 'Final Expense', 'Term Life', 'Whole Life', 'IUL'];

let clientSeq = 0;
function sale(
  d: number, premium: number, source: SaleSpec['source'],
  extra?: Partial<Pick<SaleSpec, 'issuePaidDaysAgo' | 'chargebackDaysAgo'>>,
): SaleSpec {
  clientSeq += 1;
  return {
    daysAgo: d,
    premium,
    source,
    clientName: fakeClientName(clientSeq),
    carrier: CARRIERS[clientSeq % CARRIERS.length],
    product: PRODUCTS[clientSeq % PRODUCTS.length],
    ...extra,
  };
}

const PERSONAS: Persona[] = [
  {
    // Top producer — the leaderboard anchor. Zero chargebacks, two saves.
    slug: 'marcus-bell',
    name: 'Marcus Bell',
    dialDays: [[0, 22, 3], [1, 38, 3], [2, 30, 3], [4, 35, 3], [6, 40, 3], [9, 32, 3], [12, 36, 3], [16, 30, 3], [20, 34, 3], [24, 30, 3], [27, 28, 3], [34, 30, 3], [41, 32, 3], [48, 30, 3], [55, 28, 3]],
    appts: [[0, 'completed'], [1, 'completed'], [2, 'completed'], [4, 'completed'], [6, 'no_show'], [9, 'completed'], [12, 'sit_no_sale'], [16, 'completed'], [20, 'completed'], [24, 'no_show'], [27, 'completed'], [1, 'scheduled']],
    sales: [
      sale(0, 148, 'bought_lead', { issuePaidDaysAgo: 0 }),
      sale(1, 210, 'referral'),
      sale(2, 95, 'bought_lead', { issuePaidDaysAgo: 1 }),
      sale(3, 132, 'bought_lead', { issuePaidDaysAgo: 2 }),
      sale(6, 175, 'referral', { issuePaidDaysAgo: 2 }),
      sale(10, 88, 'manual_add', { issuePaidDaysAgo: 5 }),
      sale(14, 120, 'rewrite', { issuePaidDaysAgo: 8 }),
      sale(19, 160, 'bought_lead', { issuePaidDaysAgo: 12 }),
      sale(25, 105, 'referral', { issuePaidDaysAgo: 18 }),
      sale(38, 140, 'bought_lead', { issuePaidDaysAgo: 30 }),
      sale(46, 118, 'bought_lead', { issuePaidDaysAgo: 39 }),
      sale(53, 92, 'manual_add', { issuePaidDaysAgo: 45 }),
    ],
    referrals: [0, 1, 3, 6, 11, 17, 24, 40, 51],
    saves: [[1, 95, fakeClientName(101)], [8, 120, fakeClientName(102)]],
    coaching: [[1, 8.6, 8.8, 8.4, 8.2, 8.9], [5, 8.2, 8.5, 8.0, 7.9, 8.4], [11, 8.4, 8.6, 8.1, 8.3, 8.6], [18, 7.9, 8.2, 7.6, 7.8, 8.1], [25, 8.1, 8.4, 7.9, 8.0, 8.2]],
    coachingPriority: {
      priority: 'Slow down the close on referral calls',
      why: 'Referral clients already trust you — rushing the close leaves coverage on the table.',
      action: 'Add one more needs question before presenting on every referral sit.',
    },
  },
  {
    // Steady mid-pack.
    slug: 'sarah-whitfield',
    name: 'Sarah Whitfield',
    dialDays: [[0, 15, 4], [1, 25, 4], [3, 28, 4], [5, 22, 4], [8, 26, 4], [12, 24, 4], [15, 25, 4], [19, 22, 4], [23, 26, 4], [26, 20, 4], [36, 24, 4], [44, 25, 4], [52, 22, 4]],
    appts: [[0, 'completed'], [2, 'completed'], [5, 'no_show'], [8, 'completed'], [12, 'cancelled'], [15, 'completed'], [19, 'sit_no_sale'], [23, 'completed'], [26, 'no_show'], [0, 'scheduled']],
    sales: [
      sale(1, 110, 'bought_lead', { issuePaidDaysAgo: 0 }),
      sale(2, 85, 'manual_add'),
      sale(8, 125, 'bought_lead', { issuePaidDaysAgo: 3 }),
      sale(15, 98, 'referral', { issuePaidDaysAgo: 9 }),
      sale(23, 115, 'bought_lead', { issuePaidDaysAgo: 16 }),
      sale(42, 105, 'bought_lead', { issuePaidDaysAgo: 35 }),
      sale(50, 90, 'manual_add', { issuePaidDaysAgo: 43 }),
    ],
    referrals: [2, 12, 28, 45],
    saves: [[5, 88, fakeClientName(103)]],
    coaching: [[2, 7.4, 7.8, 7.0, 7.2, 7.5], [9, 7.1, 7.6, 6.8, 7.0, 7.2], [16, 7.3, 7.7, 7.1, 7.0, 7.4], [24, 6.9, 7.4, 6.6, 6.8, 7.0]],
    coachingPriority: {
      priority: 'Build urgency before quoting',
      why: 'Quotes land flat when the emotional stakes have not been named yet.',
      action: 'Restate the family consequence in the client’s own words before any number.',
    },
  },
  {
    // High activity, weak close — the coaching-radar story (lock_it_down low).
    slug: 'jake-torres',
    name: 'Jake Torres',
    dialDays: [[0, 30, 5], [1, 45, 5], [2, 40, 5], [3, 42, 5], [5, 44, 5], [7, 40, 5], [10, 45, 5], [13, 38, 5], [17, 42, 5], [21, 40, 5], [25, 38, 5], [28, 36, 5], [37, 40, 5], [45, 42, 5], [54, 38, 5]],
    appts: [[0, 'completed'], [1, 'sit_no_sale'], [2, 'sit_no_sale'], [3, 'completed'], [5, 'sit_think_about_it'], [7, 'no_show'], [10, 'sit_no_sale'], [13, 'completed'], [17, 'sit_no_sale'], [21, 'no_show'], [25, 'sit_think_about_it'], [28, 'sit_no_sale'], [1, 'scheduled'], [0, 'scheduled']],
    sales: [
      sale(2, 78, 'bought_lead', { chargebackDaysAgo: 0 }),
      sale(13, 92, 'bought_lead', { issuePaidDaysAgo: 6 }),
      sale(27, 70, 'manual_add', { issuePaidDaysAgo: 20 }),
      sale(44, 85, 'bought_lead', { issuePaidDaysAgo: 37 }),
    ],
    referrals: [15],
    saves: [],
    coaching: [[1, 5.4, 7.9, 6.1, 5.5, 3.2], [4, 5.8, 8.1, 6.4, 5.8, 3.6], [8, 5.2, 7.7, 5.9, 5.4, 3.0], [13, 5.6, 8.0, 6.2, 5.6, 3.4], [19, 5.9, 8.2, 6.5, 5.9, 3.8], [26, 5.5, 7.8, 6.0, 5.7, 3.3]],
    coachingPriority: {
      priority: 'Ask for the sale directly',
      why: 'Six sits this month ended in "think about it" with no close attempt on the recording.',
      action: 'End every presentation with the two-option close — no open-ended wrap-ups.',
    },
  },
  {
    // Riser — strong recent trend (sales concentrated in the last few days).
    slug: 'emily-chen',
    name: 'Emily Chen',
    dialDays: [[0, 28, 3], [1, 32, 3], [2, 26, 3], [3, 24, 4], [6, 20, 4], [10, 18, 5], [14, 16, 5], [18, 15, 5], [22, 14, 5], [26, 12, 5], [40, 12, 5], [50, 10, 5]],
    appts: [[0, 'completed'], [1, 'completed'], [2, 'completed'], [3, 'completed'], [6, 'no_show'], [10, 'completed'], [14, 'sit_no_sale'], [18, 'completed'], [0, 'scheduled'], [1, 'scheduled']],
    sales: [
      sale(0, 135, 'bought_lead', { issuePaidDaysAgo: 0 }),
      sale(0, 88, 'referral'),
      sale(1, 152, 'bought_lead'),
      sale(2, 96, 'manual_add', { issuePaidDaysAgo: 0 }),
      sale(10, 80, 'bought_lead', { issuePaidDaysAgo: 4 }),
      sale(18, 74, 'bought_lead', { issuePaidDaysAgo: 12 }),
      sale(47, 68, 'manual_add', { issuePaidDaysAgo: 40 }),
    ],
    referrals: [0, 2, 8],
    saves: [],
    coaching: [[1, 7.8, 7.5, 8.2, 7.4, 7.9], [6, 7.2, 7.0, 7.8, 6.9, 7.1], [13, 6.8, 6.7, 7.4, 6.5, 6.6], [22, 6.4, 6.5, 7.0, 6.1, 6.2]],
    coachingPriority: {
      priority: 'Keep the discovery script tight',
      why: 'Recent calls show improving control — protect the structure that is working.',
      action: 'Run the same five discovery questions in order on every sit this week.',
    },
  },
  {
    // Slipping quietly — produced through June, nearly silent now.
    // Fires the decline-detection triage on the month/last30 views.
    slug: 'dave-kowalski',
    name: 'Dave Kowalski',
    dialDays: [[0, 4, 4], [1, 6, 4], [3, 8, 4], [6, 10, 4], [9, 14, 4], [13, 24, 4], [16, 28, 4], [19, 30, 4], [22, 32, 4], [25, 30, 4], [28, 28, 4], [35, 30, 4], [42, 32, 4], [50, 30, 4], [57, 28, 4]],
    appts: [[3, 'no_show'], [9, 'cancelled'], [13, 'completed'], [16, 'completed'], [19, 'completed'], [22, 'completed'], [25, 'sit_no_sale'], [28, 'completed']],
    sales: [
      sale(2, 72, 'bought_lead'),
      sale(13, 96, 'bought_lead', { issuePaidDaysAgo: 7 }),
      sale(16, 84, 'manual_add', { issuePaidDaysAgo: 10 }),
      sale(19, 118, 'bought_lead', { chargebackDaysAgo: 1 }),
      sale(22, 90, 'bought_lead', { issuePaidDaysAgo: 15 }),
      sale(26, 102, 'referral', { issuePaidDaysAgo: 19 }),
      sale(37, 88, 'bought_lead', { issuePaidDaysAgo: 30 }),
      sale(43, 95, 'bought_lead', { issuePaidDaysAgo: 36 }),
      sale(51, 110, 'bought_lead', { issuePaidDaysAgo: 44 }),
    ],
    referrals: [20, 33],
    saves: [],
    coaching: [[4, 6.1, 6.8, 5.8, 6.2, 5.9], [15, 6.9, 7.2, 6.6, 7.0, 6.8], [23, 7.0, 7.3, 6.8, 7.1, 6.9]],
    coachingPriority: {
      priority: 'Rebuild the morning dial block',
      why: 'Dial volume fell off a cliff two weeks ago — the pipeline is drying up ahead of sales.',
      action: 'Block 9–11am for dials daily and log every outcome.',
    },
  },
  {
    // Newer agent, referral-heavy — the AFL-engine story.
    slug: 'rachel-adams',
    name: 'Rachel Adams',
    dialDays: [[0, 12, 3], [1, 14, 3], [4, 12, 3], [7, 15, 3], [11, 12, 3], [15, 14, 3], [20, 10, 3], [24, 12, 3], [30, 10, 3]],
    appts: [[0, 'completed'], [4, 'completed'], [7, 'completed'], [11, 'no_show'], [15, 'completed'], [20, 'completed'], [0, 'scheduled']],
    sales: [
      sale(1, 92, 'referral', { issuePaidDaysAgo: 0 }),
      sale(4, 78, 'referral'),
      sale(11, 105, 'referral', { issuePaidDaysAgo: 5 }),
      sale(15, 66, 'bought_lead', { issuePaidDaysAgo: 8 }),
      sale(24, 84, 'referral', { issuePaidDaysAgo: 17 }),
    ],
    referrals: [0, 1, 2, 5, 9, 13, 18, 25],
    saves: [[12, 66, fakeClientName(104)]],
    coaching: [[3, 7.0, 7.8, 7.2, 6.4, 6.6], [10, 6.6, 7.5, 6.9, 6.0, 6.1], [19, 6.2, 7.2, 6.5, 5.7, 5.8]],
    coachingPriority: {
      priority: 'Ask for the referral on every close',
      why: 'Her referral engine is the best on the team — make it a habit, not a hope.',
      action: 'Trigger the one-tap referral ask before ending every welcome call.',
    },
  },
];

// ── seeding ──────────────────────────────────────────────────────────
const OUTCOME_FILLERS: Outcome[] = ['no_answer', 'left_vm', 'no_answer', 'no_answer'];
const OUTCOME_CONTACTS: Outcome[] = ['booked', 'not_interested', 'callback_requested', 'wrong_number'];

function buildDialLog(dayOffset: number, dials: number, contactEvery: number) {
  const log: Array<{ at: Timestamp; outcome: Outcome }> = [];
  for (let i = 0; i < dials; i++) {
    const hour = 9 + (i % 8);
    const isContact = i % contactEvery === 0;
    const outcome = isContact
      ? OUTCOME_CONTACTS[i % OUTCOME_CONTACTS.length]
      : OUTCOME_FILLERS[i % OUTCOME_FILLERS.length];
    log.push({ at: ts(dayOffset, hour), outcome });
  }
  return log;
}

async function seed() {
  const db = getAdminFirestore();

  // Resolve the owner.
  let ownerUid: string;
  try {
    ownerUid = (await getAdminAuth().getUserByEmail(OWNER_EMAIL)).uid;
  } catch {
    const snap = await db.collection('agents').where('email', '==', OWNER_EMAIL).limit(1).get();
    if (snap.empty) {
      console.error(`ERROR: no auth user or agent doc found for ${OWNER_EMAIL}`);
      process.exit(1);
    }
    ownerUid = snap.docs[0].id;
  }
  const ownerDoc = await db.collection('agents').doc(ownerUid).get();
  if (!ownerDoc.exists) {
    console.error(`ERROR: agents/${ownerUid} does not exist for ${OWNER_EMAIL}`);
    process.exit(1);
  }
  if (ownerDoc.data()?.isAgencyOwner !== true) {
    console.warn(
      `⚠ agents/${ownerUid} is not flagged isAgencyOwner — the My Team page will 403.\n` +
      `  Fix separately if needed; this script does not modify the owner doc.`,
    );
  }
  console.log(`Owner: ${OWNER_EMAIL} (uid=${ownerUid})`);

  // ── purge mode ──
  if (PURGE) {
    const snap = await db
      .collection('agents')
      .where('isDemoSeed', '==', true)
      .where('agencyOwnerId', '==', ownerUid)
      .get();
    if (snap.empty) {
      console.log('No demo-seed agents found under this owner. Nothing to purge.');
      return;
    }
    console.log(`Purging ${snap.size} demo-seed agent(s) and all their subcollections…`);
    for (const doc of snap.docs) {
      console.log(`  ✗ ${doc.data()?.name || doc.id} (${doc.id})`);
      await db.recursiveDelete(doc.ref);
    }
    console.log('Purge complete.');
    return;
  }

  // ── plan summary ──
  console.log(`\nPlan: ${PERSONAS.length} fake downline agents under this owner:\n`);
  for (const p of PERSONAS) {
    const apv = p.sales.reduce((a, s) => a + s.premium * 12, 0);
    const dials = p.dialDays.reduce((a, [, n]) => a + n, 0);
    console.log(
      `  • ${p.name.padEnd(16)} ~${dials} dials, ${p.sales.length} sales (~$${apv.toLocaleString()} APV), ` +
      `${p.referrals.length} referrals, ${p.saves.length} saves, ${p.coaching.length} scored calls`,
    );
  }
  console.log(
    '\nAll docs carry isDemoSeed: true; agent ids are prefixed demo-seed-.' +
    '\nFake agents have automatedOutreachHold: true, no phone, example.com emails.',
  );
  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to seed.\n');
    return;
  }

  console.log('\nApplying…');
  for (const p of PERSONAS) {
    const agentRef = db.collection('agents').doc(`demo-seed-${p.slug}`);

    await agentRef.set({
      name: p.name,
      email: `demo-seed-${p.slug}@example.com`,
      membershipTier: 'growth',
      agencyOwnerId: ownerUid,
      isAgencyOwner: false,
      isDemoSeed: true,
      automatedOutreachHold: true,
      automatedOutreachHoldReason: 'demo_seed',
      createdAt: ts(70 + PERSONAS.indexOf(p) * 9),
    });

    // Leads with dialLog arrays (drives dials / contacts / contact rate).
    for (let i = 0; i < p.dialDays.length; i++) {
      const [dayOffset, dials, contactEvery] = p.dialDays[i];
      await agentRef.collection('leads').doc(`demo-seed-lead-${i}`).set({
        name: fakeClientName(200 + i),
        status: 'contacted',
        isDemoSeed: true,
        createdAt: ts(dayOffset + 1),
        dialLog: buildDialLog(dayOffset, dials, contactEvery),
      });
    }

    // Appointments (booked / show / no-show / cancelled buckets).
    for (let i = 0; i < p.appts.length; i++) {
      const [dayOffset, status] = p.appts[i];
      await agentRef.collection('appointments').doc(`demo-seed-appt-${i}`).set({
        leadId: `demo-seed-appt-entity-${i}`,
        status,
        kind: 'appointment',
        isDemoSeed: true,
        createdAt: ts(dayOffset + 1, 10),
        scheduledAt: ts(dayOffset, 15),
      });
    }

    // Clients + policies (sales, APV, sources, issue-paid, chargebacks).
    for (let i = 0; i < p.sales.length; i++) {
      const s = p.sales[i];
      const clientRef = agentRef.collection('clients').doc(`demo-seed-client-${i}`);
      await clientRef.set({
        name: s.clientName,
        isDemoSeed: true,
        createdAt: ts(s.source === 'rewrite' ? s.daysAgo + 120 : s.daysAgo),
        ...(s.source === 'bought_lead' ? { convertedFromLeadId: `demo-seed-converted-${i}` } : {}),
        ...(s.source === 'referral' ? { sourceReferralId: `demo-seed-ref-${i}` } : {}),
      });
      await clientRef.collection('policies').doc('demo-seed-policy-0').set({
        insuranceCompany: s.carrier,
        policyType: s.product,
        policyNumber: `DS-${p.slug.slice(0, 3).toUpperCase()}-${1000 + i}`,
        premiumAmount: s.premium,
        premiumFrequency: 'monthly',
        coverageAmount: 15000 + (i % 5) * 35000,
        applicationSignedDate: ymd(s.daysAgo),
        source: s.source,
        isDemoSeed: true,
        createdAt: ts(s.daysAgo),
        ...(s.issuePaidDaysAgo !== undefined ? { issuePaidDate: ymd(s.issuePaidDaysAgo) } : {}),
        ...(s.chargebackDaysAgo !== undefined ? { chargebackDate: ymd(s.chargebackDaysAgo) } : {}),
      });
    }

    // Referrals received (referral engine + per-close rate).
    for (let i = 0; i < p.referrals.length; i++) {
      await agentRef.collection('referrals').doc(`demo-seed-referral-${i}`).set({
        referredName: fakeClientName(300 + i),
        status: 'received',
        isDemoSeed: true,
        createdAt: ts(p.referrals[i], 11),
      });
    }

    // Saved conservation alerts (saved APV + recent wins).
    for (let i = 0; i < p.saves.length; i++) {
      const [dayOffset, premium, clientName] = p.saves[i];
      await agentRef.collection('conservationAlerts').doc(`demo-seed-save-${i}`).set({
        status: 'saved',
        premiumAmount: premium,
        clientName,
        carrier: CARRIERS[i % CARRIERS.length],
        policyType: PRODUCTS[i % PRODUCTS.length],
        isChargebackRisk: true,
        isDemoSeed: true,
        savedAt: ts(dayOffset, 16),
        createdAt: ts(dayOffset + 2),
        updatedAt: ts(dayOffset, 16),
      });
    }

    // Coaching scores (radar + focus + priorities).
    for (let i = 0; i < p.coaching.length; i++) {
      const [dayOffset, overall, rapport, emotion, assumption, lock] = p.coaching[i];
      await agentRef.collection('coachingScores').doc(`demo-seed-score-${i}`).set({
        isDemoSeed: true,
        createdAt: ts(dayOffset, 17),
        report: {
          overallScore: overall,
          real: [
            { key: 'rapport', score: rapport },
            { key: 'emotion', score: emotion },
            { key: 'assumption', score: assumption },
            { key: 'lock_it_down', score: lock },
          ],
          coachingPriorities: [p.coachingPriority],
        },
      });
    }

    console.log(`  ✓ ${p.name}`);
  }

  console.log(
    `\nDone. ${PERSONAS.length} demo agents seeded under ${OWNER_EMAIL}.` +
    `\nAFTER THE DEMO, purge with:\n` +
    `  node --require ./scripts/server-only-shim.cjs --import tsx \\\n` +
    `    ./scripts/seed-demo-downline.ts --owner=${OWNER_EMAIL} --purge\n`,
  );
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
