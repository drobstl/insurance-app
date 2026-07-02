import 'server-only';

import { Timestamp, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';

/**
 * Demo-downline staging — TEMPORARY fake agents for a My Team demo.
 *
 * Seeds a handful of clearly-marked fake agents (`isDemoSeed: true`, doc
 * ids prefixed `demo-seed-`) under an owner's downline (`agencyOwnerId` =
 * owner uid), each with enough activity — leads/dialLogs, appointments,
 * clients + policies, referrals, saved conservation alerts, coaching
 * scores — that the My Team dashboard renders a full leaderboard,
 * coaching radar, trend arrows, and agency rollup. Personas are tuned so
 * the screen tells a story: a top producer, a riser, a slipping agent
 * (decline detection), a high-activity/low-close agent (coaching focus).
 *
 * THIS IS DEMO STAGING, NOT REAL PRODUCTION DATA. Purge right after the
 * demo. Fake agents have no auth account, no phone, a non-routable
 * example.com email, and `automatedOutreachHold: true` so no cron ever
 * contacts them.
 *
 * Callers: web/scripts/seed-demo-downline.ts (CLI) and
 * /api/admin/demo-downline (admin console buttons).
 */

// ── date helpers (anchored to a per-run `now` so a long-lived server
//    process never serves stale offsets) ─────────────────────────────
function makeClock(now: Date) {
  const daysAgo = (n: number, hour = 13): Date => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    d.setHours(hour, (n * 17) % 60, 0, 0);
    return d;
  };
  const ts = (n: number, hour = 13): Timestamp => Timestamp.fromDate(daysAgo(n, hour));
  const ymd = (n: number): string => {
    const d = daysAgo(n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return { ts, ymd };
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

function buildPersonas(): Persona[] {
  let clientSeq = 0;
  const sale = (
    d: number, premium: number, source: SaleSpec['source'],
    extra?: Partial<Pick<SaleSpec, 'issuePaidDaysAgo' | 'chargebackDaysAgo'>>,
  ): SaleSpec => {
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
  };

  return [
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
      // Scores trend up and every dimension clears the "dialed in" bar —
      // a genuine hot streak, so the banner and her coaching read agree.
      coaching: [[1, 8.0, 7.9, 8.3, 7.6, 8.1], [6, 7.7, 7.5, 8.0, 7.3, 7.8], [13, 7.4, 7.4, 7.7, 7.2, 7.4], [22, 7.1, 7.2, 7.5, 7.0, 7.1]],
      coachingPriority: {
        priority: 'Keep the discovery script tight',
        why: 'Recent calls show improving control — protect the structure that is working.',
        action: 'Run the same five discovery questions in order on every sit this week.',
      },
    },
    {
      // Slipping quietly — produced through last month, nearly silent now.
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
    {
      // Veteran — fewer dials, bigger tickets, nothing to coach.
      slug: 'tony-marino',
      name: 'Tony Marino',
      dialDays: [[0, 12, 3], [1, 14, 3], [2, 12, 3], [3, 13, 3], [6, 14, 3], [9, 12, 3], [13, 14, 3], [17, 12, 3], [21, 14, 3], [25, 12, 3], [28, 12, 3], [36, 14, 3], [44, 12, 3], [53, 12, 3]],
      appts: [[0, 'completed'], [1, 'completed'], [2, 'completed'], [3, 'completed'], [6, 'completed'], [9, 'no_show'], [13, 'completed'], [17, 'completed'], [21, 'completed'], [25, 'sit_no_sale'], [0, 'scheduled']],
      sales: [
        sale(0, 165, 'manual_add', { issuePaidDaysAgo: 0 }),
        sale(1, 240, 'rewrite'),
        sale(2, 190, 'bought_lead', { issuePaidDaysAgo: 1 }),
        sale(3, 155, 'referral', { issuePaidDaysAgo: 1 }),
        sale(8, 210, 'rewrite', { issuePaidDaysAgo: 3 }),
        sale(15, 175, 'manual_add', { issuePaidDaysAgo: 9 }),
        sale(22, 195, 'bought_lead', { issuePaidDaysAgo: 15 }),
        sale(40, 160, 'rewrite', { issuePaidDaysAgo: 33 }),
        sale(50, 185, 'manual_add', { issuePaidDaysAgo: 42 }),
      ],
      referrals: [4, 16, 30, 47],
      saves: [[3, 140, fakeClientName(105)]],
      coaching: [[2, 8.3, 8.5, 8.1, 8.0, 8.4], [10, 8.1, 8.4, 7.9, 7.8, 8.2], [20, 8.2, 8.5, 8.0, 8.0, 8.3]],
      coachingPriority: {
        priority: 'Mentor the close on team calls',
        why: 'His lock-it-down is the best on the team — leverage it beyond his own book.',
        action: 'Have him walk one recorded close on the next team huddle.',
      },
    },
    {
      // Solid mid-pack #2 — emotion is the soft spot.
      slug: 'grace-okafor',
      name: 'Grace Okafor',
      dialDays: [[0, 18, 4], [1, 20, 4], [3, 22, 4], [5, 18, 4], [9, 22, 4], [13, 20, 4], [17, 18, 4], [22, 20, 4], [26, 18, 4], [30, 18, 4], [38, 20, 4], [47, 18, 4], [56, 18, 4]],
      appts: [[0, 'completed'], [1, 'no_show'], [3, 'completed'], [5, 'completed'], [9, 'cancelled'], [13, 'completed'], [17, 'sit_no_sale'], [22, 'completed'], [26, 'completed'], [1, 'scheduled']],
      sales: [
        sale(0, 105, 'bought_lead', { issuePaidDaysAgo: 0 }),
        sale(3, 95, 'manual_add'),
        sale(9, 112, 'bought_lead', { issuePaidDaysAgo: 4 }),
        sale(17, 88, 'referral', { issuePaidDaysAgo: 11 }),
        sale(26, 100, 'bought_lead', { issuePaidDaysAgo: 19 }),
        sale(44, 94, 'bought_lead', { issuePaidDaysAgo: 37 }),
      ],
      referrals: [6, 19, 35],
      saves: [],
      coaching: [[3, 6.9, 7.3, 6.4, 7.0, 7.1], [11, 7.1, 7.5, 6.6, 7.2, 7.2], [21, 6.8, 7.2, 6.3, 6.9, 7.0]],
      coachingPriority: {
        priority: 'Sit in the problem longer',
        why: 'Presentations start before the client has felt the stakes.',
        action: 'Ask "what happens to them if this never gets fixed?" before every quote.',
      },
    },
    {
      // Three weeks in — swinging hard, raw on rapport. Riser, not triage.
      slug: 'brandon-fisk',
      name: 'Brandon Fisk',
      dialDays: [[0, 35, 6], [1, 40, 6], [2, 38, 6], [3, 36, 6], [5, 40, 6], [7, 38, 6], [9, 36, 6], [12, 40, 6], [15, 35, 6], [18, 30, 6], [21, 28, 6]],
      appts: [[0, 'completed'], [2, 'no_show'], [5, 'sit_no_sale'], [7, 'no_show'], [9, 'completed'], [12, 'sit_no_sale'], [15, 'no_show'], [0, 'scheduled'], [1, 'scheduled']],
      sales: [
        sale(1, 85, 'bought_lead', { issuePaidDaysAgo: 0 }),
        sale(12, 70, 'bought_lead', { issuePaidDaysAgo: 6 }),
      ],
      referrals: [10],
      saves: [],
      coaching: [[2, 5.9, 5.4, 6.3, 6.0, 6.1], [7, 5.6, 5.2, 6.0, 5.7, 5.8], [14, 5.4, 5.1, 5.8, 5.5, 5.6]],
      coachingPriority: {
        priority: 'Slow down the first two minutes',
        why: 'New-agent energy is reading as pressure — clients guard up early.',
        action: 'Open with two personal questions before any insurance talk.',
      },
    },
    {
      // Steady book-builder — nothing dramatic, fills out the roster.
      slug: 'kayla-nguyen',
      name: 'Kayla Nguyen',
      dialDays: [[0, 16, 4], [1, 18, 4], [2, 16, 4], [4, 20, 4], [8, 18, 4], [11, 16, 4], [15, 18, 4], [19, 16, 4], [24, 18, 4], [27, 16, 4], [34, 18, 4], [43, 16, 4], [52, 16, 4]],
      appts: [[0, 'completed'], [2, 'completed'], [4, 'no_show'], [8, 'completed'], [11, 'completed'], [15, 'cancelled'], [19, 'completed'], [24, 'sit_no_sale'], [1, 'scheduled']],
      sales: [
        sale(1, 98, 'bought_lead', { issuePaidDaysAgo: 0 }),
        sale(2, 102, 'referral'),
        sale(7, 90, 'bought_lead', { issuePaidDaysAgo: 2 }),
        sale(14, 86, 'manual_add', { issuePaidDaysAgo: 8 }),
        sale(23, 108, 'bought_lead', { issuePaidDaysAgo: 16 }),
        sale(38, 92, 'bought_lead', { issuePaidDaysAgo: 31 }),
        sale(48, 96, 'referral', { issuePaidDaysAgo: 41 }),
      ],
      referrals: [3, 13, 29, 42],
      saves: [[9, 92, fakeClientName(106)]],
      coaching: [[4, 6.8, 7.1, 6.9, 6.4, 6.9], [12, 7.0, 7.3, 7.1, 6.6, 7.0], [23, 6.7, 7.0, 6.8, 6.3, 6.8]],
      coachingPriority: {
        priority: 'Assume the appointment',
        why: 'Contacts go well but too many end without a booked time.',
        action: 'Offer two time slots instead of asking "when works for you?"',
      },
    },
    {
      // Books plenty, half don't sit — the show-rate triage story.
      slug: 'derek-stone',
      name: 'Derek Stone',
      dialDays: [[0, 10, 3], [1, 12, 3], [2, 11, 3], [3, 11, 3], [5, 12, 3], [8, 14, 3], [12, 12, 3], [16, 14, 3], [20, 12, 3], [25, 14, 3], [33, 12, 3], [45, 14, 3], [55, 12, 3]],
      appts: [[0, 'no_show'], [0, 'no_show'], [0, 'no_show'], [0, 'completed'], [1, 'no_show'], [1, 'completed'], [2, 'no_show'], [2, 'completed'], [3, 'completed'], [5, 'completed'], [8, 'no_show'], [12, 'completed'], [16, 'no_show'], [20, 'completed']],
      sales: [
        // Prior-window sales sit on day 2 (not day 3): midnight-dated
        // day-3 sales fall outside the month view's prior window for
        // most of the day, which would erase his decline signal.
        sale(1, 94, 'bought_lead', { issuePaidDaysAgo: 0 }),
        sale(2, 88, 'bought_lead'),
        sale(2, 96, 'manual_add', { issuePaidDaysAgo: 1 }),
        sale(11, 90, 'bought_lead', { issuePaidDaysAgo: 5 }),
        sale(21, 84, 'referral', { issuePaidDaysAgo: 14 }),
        sale(41, 98, 'bought_lead', { issuePaidDaysAgo: 34 }),
      ],
      referrals: [8, 26],
      saves: [],
      coaching: [[3, 6.4, 6.9, 6.1, 6.6, 6.5], [13, 6.6, 7.1, 6.3, 6.8, 6.7], [24, 6.5, 7.0, 6.2, 6.7, 6.6]],
      coachingPriority: {
        priority: 'Confirm appointments the morning of',
        why: 'Half his booked sits ghost — the calendar looks fuller than the day is.',
        action: 'Text a confirm-with-a-question at 9am for every appointment that day.',
      },
    },
  ];
}

export interface DemoPersonaSummary {
  name: string;
  dials: number;
  sales: number;
  apv: number;
  referrals: number;
  saves: number;
  scoredCalls: number;
}

/** Dry-run view of what seedDemoDownline writes. */
export function describeDemoDownline(): DemoPersonaSummary[] {
  return buildPersonas().map((p) => ({
    name: p.name,
    dials: p.dialDays.reduce((a, [, n]) => a + n, 0),
    sales: p.sales.length,
    apv: p.sales.reduce((a, s) => a + s.premium * 12, 0),
    referrals: p.referrals.length,
    saves: p.saves.length,
    scoredCalls: p.coaching.length,
  }));
}

// ── seeding ──────────────────────────────────────────────────────────
const OUTCOME_FILLERS: Outcome[] = ['no_answer', 'left_vm', 'no_answer', 'no_answer'];
const OUTCOME_CONTACTS: Outcome[] = ['booked', 'not_interested', 'callback_requested', 'wrong_number'];

const BATCH_LIMIT = 450; // Firestore hard cap is 500 writes per batch

type PendingWrite = { ref: DocumentReference; data: Record<string, unknown> };

async function commitAll(db: Firestore, writes: PendingWrite[]): Promise<void> {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH_LIMIT)) batch.set(w.ref, w.data);
    await batch.commit();
  }
}

/** Seed the fake downline under `ownerUid`. Idempotent — doc ids are
 *  deterministic, so re-running overwrites the same demo docs. */
export async function seedDemoDownline(ownerUid: string): Promise<{ agents: number; docs: number }> {
  const db = getAdminFirestore();
  const { ts, ymd } = makeClock(new Date());
  const personas = buildPersonas();
  const writes: PendingWrite[] = [];

  for (let pi = 0; pi < personas.length; pi++) {
    const p = personas[pi];
    const agentRef = db.collection('agents').doc(`demo-seed-${p.slug}`);

    writes.push({
      ref: agentRef,
      data: {
        name: p.name,
        email: `demo-seed-${p.slug}@example.com`,
        membershipTier: 'growth',
        agencyOwnerId: ownerUid,
        isAgencyOwner: false,
        isDemoSeed: true,
        automatedOutreachHold: true,
        automatedOutreachHoldReason: 'demo_seed',
        createdAt: ts(70 + pi * 9),
      },
    });

    // Leads with dialLog arrays (drives dials / contacts / contact rate).
    p.dialDays.forEach(([dayOffset, dials, contactEvery], i) => {
      const dialLog: Array<{ at: Timestamp; outcome: Outcome }> = [];
      for (let d = 0; d < dials; d++) {
        const isContact = d % contactEvery === 0;
        dialLog.push({
          at: ts(dayOffset, 9 + (d % 8)),
          outcome: isContact
            ? OUTCOME_CONTACTS[d % OUTCOME_CONTACTS.length]
            : OUTCOME_FILLERS[d % OUTCOME_FILLERS.length],
        });
      }
      writes.push({
        ref: agentRef.collection('leads').doc(`demo-seed-lead-${i}`),
        data: {
          name: fakeClientName(200 + i),
          status: 'contacted',
          isDemoSeed: true,
          createdAt: ts(dayOffset + 1),
          dialLog,
        },
      });
    });

    // Appointments (booked / show / no-show / cancelled buckets).
    p.appts.forEach(([dayOffset, status], i) => {
      writes.push({
        ref: agentRef.collection('appointments').doc(`demo-seed-appt-${i}`),
        data: {
          leadId: `demo-seed-appt-entity-${i}`,
          status,
          kind: 'appointment',
          isDemoSeed: true,
          createdAt: ts(dayOffset + 1, 10),
          scheduledAt: ts(dayOffset, 15),
        },
      });
    });

    // Clients + policies (sales, APV, sources, issue-paid, chargebacks).
    p.sales.forEach((s, i) => {
      const clientRef = agentRef.collection('clients').doc(`demo-seed-client-${i}`);
      writes.push({
        ref: clientRef,
        data: {
          name: s.clientName,
          isDemoSeed: true,
          createdAt: ts(s.source === 'rewrite' ? s.daysAgo + 120 : s.daysAgo),
          ...(s.source === 'bought_lead' ? { convertedFromLeadId: `demo-seed-converted-${i}` } : {}),
          ...(s.source === 'referral' ? { sourceReferralId: `demo-seed-ref-${i}` } : {}),
        },
      });
      writes.push({
        ref: clientRef.collection('policies').doc('demo-seed-policy-0'),
        data: {
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
        },
      });
    });

    // Referrals received (referral engine + per-close rate).
    p.referrals.forEach((dayOffset, i) => {
      writes.push({
        ref: agentRef.collection('referrals').doc(`demo-seed-referral-${i}`),
        data: {
          referredName: fakeClientName(300 + i),
          status: 'received',
          isDemoSeed: true,
          createdAt: ts(dayOffset, 11),
        },
      });
    });

    // Saved conservation alerts (saved APV + recent wins).
    p.saves.forEach(([dayOffset, premium, clientName], i) => {
      writes.push({
        ref: agentRef.collection('conservationAlerts').doc(`demo-seed-save-${i}`),
        data: {
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
        },
      });
    });

    // Coaching scores (radar + focus + priorities).
    p.coaching.forEach(([dayOffset, overall, rapport, emotion, assumption, lock], i) => {
      writes.push({
        ref: agentRef.collection('coachingScores').doc(`demo-seed-score-${i}`),
        data: {
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
        },
      });
    });
  }

  await commitAll(db, writes);
  return { agents: personas.length, docs: writes.length };
}

/** Recursively delete every demo-seed agent under `ownerUid`. */
export async function purgeDemoDownline(ownerUid: string): Promise<{ agents: number; names: string[] }> {
  const db = getAdminFirestore();
  const snap = await db
    .collection('agents')
    .where('isDemoSeed', '==', true)
    .where('agencyOwnerId', '==', ownerUid)
    .get();
  const names: string[] = [];
  for (const doc of snap.docs) {
    names.push((doc.data()?.name as string) || doc.id);
    await db.recursiveDelete(doc.ref);
  }
  return { agents: snap.size, names };
}
