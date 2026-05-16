/**
 * Carrier build charts — height/weight ranges per rate class.
 *
 * Source: Daniel transcribed from the per-carrier tabs of the Quility
 * Underwriting Cheat Sheet (Google Sheet
 * `1fbx_Mb4mk7vAD9WpxRjcBzipQ_-ccBCOEbZZxNcrlXU`). Per-carrier tabs are
 * embedded image-screenshots of each carrier's official agent-guide
 * PDFs, so this transcription is the source of truth in-app.
 *
 * Phase 1 scope: two crystal-clear charts (SBLI EasyTrak Digital Term,
 * United Home Life Term + Final Expense). Other priority carriers (AMAM
 * QSFP / Dignity, Banner BeyondTerm, Foresters Live Well Plus, F&G
 * Quantum, Americo Eagle Select, MOO Living Promise, Trans Am
 * Immediate Solutions, AIG GIWL) added in subsequent passes — each is
 * one transcription + spot-check turn.
 *
 * Maintenance: when a carrier updates their build chart, edit the
 * matching `BUILD_CHARTS[productId]` entry. The schema is meant to be
 * agent-editable.
 *
 * Wire-up: see `getBuildOutcome()` for the lookup function. The
 * CarrierFitPanel calls it with the lead's heightInches + weightLbs +
 * the product's id; result is rendered inline under each carrier in the
 * Suggested-carriers card.
 */

export type RateClass =
  | 'elite'
  | 'preferred_plus'
  | 'preferred'
  | 'select'
  | 'standard_plus'
  | 'standard'
  | 'rated'
  | 'over_standard'
  | 'underweight';

export const RATE_CLASS_LABEL: Record<RateClass, string> = {
  elite: 'Elite',
  preferred_plus: 'Preferred Plus',
  preferred: 'Preferred',
  select: 'Select',
  standard_plus: 'Standard Plus',
  standard: 'Standard',
  rated: 'Rated up',
  over_standard: 'Above max weight',
  underweight: 'Underweight',
};

export interface BuildChartRow {
  heightInches: number;            // 4'8" = 56, 5'0" = 60, etc.
  /** Lower end of acceptable weight, in lbs. Below this = `underweight`. */
  minWeight?: number;
  /** Ordered max-weight per class, smallest class first.
   *  Indices align with the chart's `classes` array. A lead at weight W
   *  qualifies for the first class whose max >= W. */
  maxByClass: Array<number | null>;
}

export interface BuildChart {
  productId: string;               // matches CarrierProduct.id
  unit: 'lbs';
  source: string;                  // provenance string, e.g. "Quility cheat sheet 2026-05-16"
  /** Ordered rate classes, smallest to largest weight allowed. */
  classes: RateClass[];
  rows: BuildChartRow[];
  notes?: string;
}

// ─── SBLI EasyTrak Digital Term ──────────────────────────────────────
// Source row format: height-in / min-weight / elite / preferred / select / standard / underweight-range
const SBLI_EASYTRAK: BuildChart = {
  productId: 'sbli-easytrak',
  unit: 'lbs',
  source: 'Quility cheat sheet SBLI tab, 2026-05-16',
  classes: ['elite', 'preferred', 'select', 'standard'],
  rows: [
    { heightInches: 56, minWeight: 76,  maxByClass: [111, 138, 160, 187] },  // 4'8"
    { heightInches: 57, minWeight: 79,  maxByClass: [115, 143, 166, 194] },  // 4'9"
    { heightInches: 58, minWeight: 82,  maxByClass: [119, 148, 172, 200] },  // 4'10"
    { heightInches: 59, minWeight: 85,  maxByClass: [123, 153, 178, 207] },  // 4'11"
    { heightInches: 60, minWeight: 88,  maxByClass: [128, 158, 184, 215] },  // 5'0"
    { heightInches: 61, minWeight: 90,  maxByClass: [132, 164, 190, 222] },  // 5'1"
    { heightInches: 62, minWeight: 93,  maxByClass: [136, 169, 196, 229] },  // 5'2"
    { heightInches: 63, minWeight: 96,  maxByClass: [141, 175, 203, 237] },  // 5'3"
    { heightInches: 64, minWeight: 100, maxByClass: [145, 180, 209, 244] },  // 5'4"
    { heightInches: 65, minWeight: 103, maxByClass: [150, 186, 216, 252] },  // 5'5"
    { heightInches: 66, minWeight: 106, maxByClass: [154, 192, 223, 260] },  // 5'6"
    { heightInches: 67, minWeight: 109, maxByClass: [159, 197, 229, 268] },  // 5'7"
    { heightInches: 68, minWeight: 112, maxByClass: [164, 203, 236, 276] },  // 5'8"
    { heightInches: 69, minWeight: 116, maxByClass: [169, 209, 243, 284] },  // 5'9"
    { heightInches: 70, minWeight: 119, maxByClass: [174, 216, 250, 292] },  // 5'10"
    { heightInches: 71, minWeight: 122, maxByClass: [179, 222, 258, 301] },  // 5'11"
    { heightInches: 72, minWeight: 126, maxByClass: [184, 228, 265, 309] },  // 6'0"
    { heightInches: 73, minWeight: 129, maxByClass: [189, 234, 272, 318] },  // 6'1"
    { heightInches: 74, minWeight: 133, maxByClass: [194, 241, 280, 327] },  // 6'2"
    { heightInches: 75, minWeight: 137, maxByClass: [200, 248, 288, 336] },  // 6'3"
    { heightInches: 76, minWeight: 140, maxByClass: [205, 254, 295, 345] },  // 6'4"
    { heightInches: 77, minWeight: 144, maxByClass: [210, 261, 303, 354] },  // 6'5"
    { heightInches: 78, minWeight: 148, maxByClass: [216, 268, 311, 363] },  // 6'6"
    { heightInches: 79, minWeight: 151, maxByClass: [221, 275, 319, 372] },  // 6'7"
    { heightInches: 80, minWeight: 155, maxByClass: [227, 282, 327, 382] },  // 6'8"
  ],
};

// ─── United Home Life — Simple Term (20/30/ROP) + Simple Term 20 Deluxe ──
// Source has 2 max-weight columns: Simple Term 20/30/ROP, Simple Term 20 Deluxe.
// Mapping the two columns onto our class taxonomy as standard / standard_plus.
const UHL_SIMPLE_TERM: BuildChart = {
  productId: 'uhl-simple-term',
  unit: 'lbs',
  source: 'Quility cheat sheet UHL tab, 2026-05-16',
  classes: ['standard', 'standard_plus'],
  rows: [
    { heightInches: 60, maxByClass: [210,    240]    },  // 5'0"
    { heightInches: 61, maxByClass: [217.5,  247.5]  },  // 5'1"
    { heightInches: 62, maxByClass: [225,    255]    },  // 5'2"
    { heightInches: 63, maxByClass: [232.5,  262.5]  },  // 5'3"
    { heightInches: 64, maxByClass: [240,    270]    },  // 5'4"
    { heightInches: 65, maxByClass: [247.5,  278.75] },  // 5'5"
    { heightInches: 66, maxByClass: [255,    287.5]  },  // 5'6"
    { heightInches: 67, maxByClass: [262.5,  296.25] },  // 5'7"
    { heightInches: 68, maxByClass: [270,    305]    },  // 5'8"
    { heightInches: 69, maxByClass: [278.75, 313.75] },  // 5'9"
    { heightInches: 70, maxByClass: [287.5,  322.5]  },  // 5'10"
    { heightInches: 71, maxByClass: [296.25, 331.25] },  // 5'11"
    { heightInches: 72, maxByClass: [305,    340]    },  // 6'0"
    { heightInches: 73, maxByClass: [313.75, 351.25] },  // 6'1"
    { heightInches: 74, maxByClass: [322.5,  362.5]  },  // 6'2"
    { heightInches: 75, maxByClass: [331.25, 374]    },  // 6'3"
    { heightInches: 76, maxByClass: [340,    385]    },  // 6'4"
  ],
  notes: 'Standard = Simple Term 20/30/ROP max; Standard Plus = Simple Term 20 Deluxe max.',
};

// ─── United Home Life — Final Expense (EI Premier + EI Deluxe) ──
// Same max-weight numbers as the UHL Term chart per Daniel's transcription.
// Note: EIWL + GIWL have no weight limit (do a risk assessment ~400 lbs+).
const UHL_FINAL_EXPENSE: BuildChart = {
  productId: 'uhl-whole-life',
  unit: 'lbs',
  source: 'Quility cheat sheet UHL tab, 2026-05-16',
  classes: ['standard', 'standard_plus'],
  rows: [
    { heightInches: 60, maxByClass: [210,    240]    },
    { heightInches: 61, maxByClass: [217.5,  247.5]  },
    { heightInches: 62, maxByClass: [225,    255]    },
    { heightInches: 63, maxByClass: [232.5,  262.5]  },
    { heightInches: 64, maxByClass: [240,    270]    },
    { heightInches: 65, maxByClass: [247.5,  278.75] },
    { heightInches: 66, maxByClass: [255,    287.5]  },
    { heightInches: 67, maxByClass: [262.5,  296.25] },
    { heightInches: 68, maxByClass: [270,    305]    },
    { heightInches: 69, maxByClass: [278.75, 313.75] },
    { heightInches: 70, maxByClass: [287.5,  322.5]  },
    { heightInches: 71, maxByClass: [296.25, 331.25] },
    { heightInches: 72, maxByClass: [305,    340]    },
    { heightInches: 73, maxByClass: [313.75, 351.25] },
    { heightInches: 74, maxByClass: [322.5,  362.5]  },
    { heightInches: 75, maxByClass: [331.25, 374]    },
    { heightInches: 76, maxByClass: [340,    385]    },
  ],
  notes: 'Standard = EI Premier max; Standard Plus = EI Deluxe max. EIWL + GIWL skip weight limits (do a risk assessment around 400 lbs).',
};

// ─── LGA/Banner Life QLT Term Plus ───────────────────────────────────
// Source cells show weight RANGES per class (e.g. "Preferred Plus 89-134");
// the upper bound is the class's max — that's what we store.
const BANNER_QLT_TERM_PLUS: BuildChart = {
  productId: 'banner-qlt-term-plus',
  unit: 'lbs',
  source: 'Quility cheat sheet LGA/Banner tab, 2026-05-16',
  classes: ['preferred_plus', 'preferred', 'standard_plus', 'standard'],
  rows: [
    { heightInches: 58, minWeight: 89,  maxByClass: [134, 155, 196, 205] },  // 4'10"
    { heightInches: 59, minWeight: 92,  maxByClass: [139, 160, 203, 212] },  // 4'11"
    { heightInches: 60, minWeight: 95,  maxByClass: [144, 166, 209, 220] },  // 5'0"
    { heightInches: 61, minWeight: 98,  maxByClass: [149, 171, 216, 227] },  // 5'1"
    { heightInches: 62, minWeight: 101, maxByClass: [153, 177, 224, 235] },  // 5'2"
    { heightInches: 63, minWeight: 104, maxByClass: [158, 183, 231, 242] },  // 5'3"
    { heightInches: 64, minWeight: 108, maxByClass: [164, 188, 238, 250] },  // 5'4"
    { heightInches: 65, minWeight: 111, maxByClass: [169, 194, 246, 258] },  // 5'5"
    { heightInches: 66, minWeight: 115, maxByClass: [174, 200, 253, 266] },  // 5'6"
    { heightInches: 67, minWeight: 118, maxByClass: [179, 207, 261, 274] },  // 5'7"
    { heightInches: 68, minWeight: 122, maxByClass: [185, 213, 269, 282] },  // 5'8"
    { heightInches: 69, minWeight: 125, maxByClass: [190, 219, 277, 294] },  // 5'9"
    { heightInches: 70, minWeight: 129, maxByClass: [196, 225, 285, 299] },  // 5'10"
    { heightInches: 71, minWeight: 133, maxByClass: [201, 232, 293, 308] },  // 5'11"
    { heightInches: 72, minWeight: 136, maxByClass: [207, 239, 302, 317] },  // 6'0"
    { heightInches: 73, minWeight: 140, maxByClass: [213, 246, 310, 325] },  // 6'1"
    { heightInches: 74, minWeight: 144, maxByClass: [219, 252, 319, 334] },  // 6'2"
    { heightInches: 75, minWeight: 148, maxByClass: [225, 259, 327, 344] },  // 6'3"
    { heightInches: 76, minWeight: 152, maxByClass: [231, 266, 336, 353] },  // 6'4"
    { heightInches: 77, minWeight: 156, maxByClass: [237, 273, 345, 362] },  // 6'5"
    { heightInches: 78, minWeight: 160, maxByClass: [243, 280, 354, 372] },  // 6'6"
    { heightInches: 79, minWeight: 164, maxByClass: [249, 287, 363, 381] },  // 6'7"
    { heightInches: 80, minWeight: 168, maxByClass: [256, 295, 372, 391] },  // 6'8"
    { heightInches: 81, minWeight: 173, maxByClass: [262, 302, 382, 401] },  // 6'9"
    { heightInches: 82, minWeight: 177, maxByClass: [268, 309, 391, 411] },  // 6'10"
    { heightInches: 83, minWeight: 181, maxByClass: [275, 317, 401, 421] },  // 6'11"
  ],
};

// ─── AMAM Express Term + Home Certainty Term ─────────────────────────
// Source has TWO charts that both apply to these two products:
//  - Main chart: Max Weight Within Table 2 + Max Weight Within Table 4
//    (rated tier). Heights 4'10"–6'9".
//  - Preferred Rates (Unisex) chart: tighter thresholds for preferred
//    class. Heights 4'8"–6'7" only.
// Build the unified table with `preferred | standard | rated` classes.
// Where a class doesn't apply at a given height, null is used.
const AMAM_EXPRESS_TERM_ROWS: BuildChartRow[] = [
  { heightInches: 56, minWeight: 88,  maxByClass: [144, null, null] },  // 4'8"  (preferred only)
  { heightInches: 57, minWeight: 90,  maxByClass: [149, null, null] },  // 4'9"  (preferred only)
  { heightInches: 58, minWeight: 86,  maxByClass: [154, 182, 199] },    // 4'10"
  { heightInches: 59, minWeight: 88,  maxByClass: [160, 188, 205] },    // 4'11"
  { heightInches: 60, minWeight: 90,  maxByClass: [165, 195, 212] },    // 5'0"
  { heightInches: 61, minWeight: 93,  maxByClass: [171, 201, 220] },    // 5'1"
  { heightInches: 62, minWeight: 95,  maxByClass: [177, 208, 227] },    // 5'2"
  { heightInches: 63, minWeight: 99,  maxByClass: [182, 215, 234] },    // 5'3"
  { heightInches: 64, minWeight: 101, maxByClass: [188, 221, 242] },    // 5'4"
  { heightInches: 65, minWeight: 104, maxByClass: [194, 228, 249] },    // 5'5"
  { heightInches: 66, minWeight: 106, maxByClass: [200, 235, 257] },    // 5'6"
  { heightInches: 67, minWeight: 110, maxByClass: [206, 243, 265] },    // 5'7"
  { heightInches: 68, minWeight: 113, maxByClass: [212, 250, 273] },    // 5'8"
  { heightInches: 69, minWeight: 117, maxByClass: [219, 257, 281] },    // 5'9"
  { heightInches: 70, minWeight: 120, maxByClass: [225, 265, 289] },    // 5'10"
  { heightInches: 71, minWeight: 125, maxByClass: [231, 272, 298] },    // 5'11"
  { heightInches: 72, minWeight: 129, maxByClass: [238, 280, 306] },    // 6'0"
  { heightInches: 73, minWeight: 133, maxByClass: [245, 288, 315] },    // 6'1"
  { heightInches: 74, minWeight: 136, maxByClass: [251, 296, 323] },    // 6'2"
  { heightInches: 75, minWeight: 140, maxByClass: [258, 304, 332] },    // 6'3"
  { heightInches: 76, minWeight: 143, maxByClass: [265, 312, 341] },    // 6'4"
  { heightInches: 77, minWeight: 146, maxByClass: [272, 320, 350] },    // 6'5"
  { heightInches: 78, minWeight: 149, maxByClass: [279, 329, 359] },    // 6'6"
  { heightInches: 79, minWeight: 153, maxByClass: [287, 337, 368] },    // 6'7"
  { heightInches: 80, minWeight: 157, maxByClass: [null, 346, 378] },   // 6'8"  (no preferred row)
  { heightInches: 81, minWeight: 160, maxByClass: [null, 355, 387] },   // 6'9"  (no preferred row)
];

const AMAM_EXPRESS_TERM: BuildChart = {
  productId: 'amam-express-term',
  unit: 'lbs',
  source: 'Quility cheat sheet AMAM tab, 2026-05-16',
  classes: ['preferred', 'standard', 'rated'],
  rows: AMAM_EXPRESS_TERM_ROWS,
  notes: 'Standard = within Table 2; Rated = within Table 4 (still accepts but higher tier). Above Table 4 = decline.',
};

// Identical chart per AMAM tab. Same rows reused.
const AMAM_HOME_CERTAINTY: BuildChart = {
  productId: 'amam-home-certainty',
  unit: 'lbs',
  source: 'Quility cheat sheet AMAM tab, 2026-05-16',
  classes: ['preferred', 'standard', 'rated'],
  rows: AMAM_EXPRESS_TERM_ROWS,
  notes: 'Identical chart to AMAM Express Term per the AMAM tab.',
};

// ─── Americo HMS / CBO Term / IUL ────────────────────────────────────
// Source: Americo tab, the "HMS Plus 125, 125 CBO, HMS Plus 100, 100 CBO,
// HMS Plus Payment Protector" column. Single accept range per height —
// no class tiers, just min/max. Above max = decline.
const AMERICO_HMS: BuildChart = {
  productId: 'americo-hms',
  unit: 'lbs',
  source: 'Quility cheat sheet Americo tab, 2026-05-16',
  classes: ['standard'],
  rows: [
    { heightInches: 56, minWeight: 78,  maxByClass: [189] },  // 4'8"
    { heightInches: 57, minWeight: 80,  maxByClass: [196] },  // 4'9"
    { heightInches: 58, minWeight: 83,  maxByClass: [203] },  // 4'10"
    { heightInches: 59, minWeight: 86,  maxByClass: [210] },  // 4'11"
    { heightInches: 60, minWeight: 89,  maxByClass: [217] },  // 5'0"
    { heightInches: 61, minWeight: 92,  maxByClass: [224] },  // 5'1"
    { heightInches: 62, minWeight: 95,  maxByClass: [232] },  // 5'2"
    { heightInches: 63, minWeight: 98,  maxByClass: [239] },  // 5'3"
    { heightInches: 64, minWeight: 101, maxByClass: [247] },  // 5'4"
    { heightInches: 65, minWeight: 105, maxByClass: [255] },  // 5'5"
    { heightInches: 66, minWeight: 108, maxByClass: [263] },  // 5'6"
    { heightInches: 67, minWeight: 111, maxByClass: [271] },  // 5'7"
    { heightInches: 68, minWeight: 115, maxByClass: [279] },  // 5'8"
    { heightInches: 69, minWeight: 118, maxByClass: [287] },  // 5'9"
    { heightInches: 70, minWeight: 121, maxByClass: [296] },  // 5'10"
    { heightInches: 71, minWeight: 125, maxByClass: [304] },  // 5'11"
    { heightInches: 72, minWeight: 132, maxByClass: [313] },  // 6'0"
    { heightInches: 73, minWeight: 133, maxByClass: [322] },  // 6'1"
    { heightInches: 74, minWeight: 136, maxByClass: [331] },  // 6'2"
    { heightInches: 75, minWeight: 140, maxByClass: [340] },  // 6'3"
    { heightInches: 76, minWeight: 143, maxByClass: [349] },  // 6'4"
    { heightInches: 77, minWeight: 147, maxByClass: [358] },  // 6'5"
    { heightInches: 78, minWeight: 151, maxByClass: [367] },  // 6'6"
    { heightInches: 79, minWeight: 155, maxByClass: [377] },  // 6'7"
  ],
  notes: 'Single accept range — no rate-class tiers in this chart. Above max = decline.',
};

export const BUILD_CHARTS: Record<string, BuildChart> = {
  [SBLI_EASYTRAK.productId]: SBLI_EASYTRAK,
  [UHL_SIMPLE_TERM.productId]: UHL_SIMPLE_TERM,
  [UHL_FINAL_EXPENSE.productId]: UHL_FINAL_EXPENSE,
  [BANNER_QLT_TERM_PLUS.productId]: BANNER_QLT_TERM_PLUS,
  [AMAM_EXPRESS_TERM.productId]: AMAM_EXPRESS_TERM,
  [AMAM_HOME_CERTAINTY.productId]: AMAM_HOME_CERTAINTY,
  [AMERICO_HMS.productId]: AMERICO_HMS,
};

// ─── Height parsing ───────────────────────────────────────────────────

/** Convert a freeform height string like `5'10"`, `5 ft 10 in`, `70 in`,
 *  `5'10`, `70"`, `5'` into inches. Returns null on unparseable input. */
export function parseHeightToInches(text: string | undefined | null): number | null {
  if (!text) return null;
  const s = text.toString().trim().toLowerCase();
  if (!s) return null;
  // Pattern A: 5'10", 5'10", 5'10 — feet+apostrophe, optional inches
  const a = s.match(/^(\d+)\s*['′]\s*(\d{1,2})?\s*["″in]*$/);
  if (a) {
    const feet = parseInt(a[1], 10);
    const inches = a[2] ? parseInt(a[2], 10) : 0;
    if (feet < 8 && inches < 12) return feet * 12 + inches;
  }
  // Pattern B: 5 ft 10 in / 5 feet 10 inches
  const b = s.match(/^(\d+)\s*(?:ft|feet)\s*(\d{1,2})?\s*(?:in|inches?|")?$/);
  if (b) {
    const feet = parseInt(b[1], 10);
    const inches = b[2] ? parseInt(b[2], 10) : 0;
    if (feet < 8 && inches < 12) return feet * 12 + inches;
  }
  // Pattern C: pure inches — 70 in, 70" or just 70
  const c = s.match(/^(\d{2,3})\s*(?:in|inches?|")?$/);
  if (c) {
    const v = parseInt(c[1], 10);
    if (v >= 36 && v <= 90) return v;
  }
  return null;
}

// ─── Lookup ───────────────────────────────────────────────────────────

export interface BuildOutcome {
  hasChart: boolean;            // false if no chart exists for this productId
  rateClass?: RateClass;
  /** Plain-language line for the UI, e.g. "5'10" 220lbs · Preferred". */
  line?: string;
}

/** Look up the rate class a lead qualifies for given a product. Returns
 *  { hasChart: false } when we haven't transcribed that product's
 *  chart yet — UI should hide the build-check line in that case. */
export function getBuildOutcome(
  productId: string,
  heightInches: number | null,
  weightLbs: number | null,
): BuildOutcome {
  const chart = BUILD_CHARTS[productId];
  if (!chart) return { hasChart: false };
  if (heightInches == null || weightLbs == null) return { hasChart: true };

  // Snap to nearest height row (UHL rows start at 60"; SBLI starts at 56").
  let row: BuildChartRow | undefined = chart.rows.find(r => r.heightInches === heightInches);
  if (!row) {
    // No exact match — clamp to first/last row.
    const sorted = [...chart.rows].sort((a, b) => a.heightInches - b.heightInches);
    if (heightInches < sorted[0].heightInches) row = sorted[0];
    else if (heightInches > sorted[sorted.length - 1].heightInches) row = sorted[sorted.length - 1];
  }
  if (!row) return { hasChart: true };

  if (row.minWeight !== undefined && weightLbs < row.minWeight) {
    return {
      hasChart: true,
      rateClass: 'underweight',
      line: `Below ${chart.productId} min weight (${row.minWeight} lbs)`,
    };
  }
  for (let i = 0; i < chart.classes.length; i++) {
    const max = row.maxByClass[i];
    if (max != null && weightLbs <= max) {
      const rc = chart.classes[i];
      return { hasChart: true, rateClass: rc, line: `${RATE_CLASS_LABEL[rc]} build` };
    }
  }
  return { hasChart: true, rateClass: 'over_standard', line: 'Over chart max — likely decline or table-rate' };
}
