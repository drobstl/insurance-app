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
  /** Lower end of acceptable weight, in lbs (unisex). Below this = `underweight`. */
  minWeight?: number;
  /** Sex-differentiated mins (used when carrier separates them). */
  minWeightMale?: number;
  minWeightFemale?: number;
  /** Unisex max-weight per class. Omit when the chart is sex-differentiated. */
  maxByClass?: Array<number | null>;
  /** Sex-differentiated max-weight per class. Either both `*Male` + `*Female`
   *  are set, or neither — when both are set, `maxByClass` is ignored. */
  maxByClassMale?: Array<number | null>;
  maxByClassFemale?: Array<number | null>;
}

export interface BuildChart {
  productId: string;               // matches CarrierProduct.id
  unit: 'lbs';
  source: string;                  // provenance string, e.g. "Quility cheat sheet 2026-05-16"
  /** Ordered rate classes, smallest to largest weight allowed. */
  classes: RateClass[];
  rows: BuildChartRow[];
  /** Age-band weight bumps. The base chart covers some default age band
   *  (e.g. 16-50); some carriers add a few pounds of leniency for older
   *  applicants. We pick the highest-`minAge` entry where the lead's
   *  age >= minAge and add `addLbs` to each maxByClass value. */
  ageAdjustments?: Array<{ minAge: number; addLbs: number }>;
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

// ─── Foresters Strong Foundation Term / Smart UL (Non-Medical) ───────
// Single accept range. 5'5" minimum in the source shows as "11" — most
// likely a truncated rendering of "110" (interpolated from neighbors
// 107 at 5'4" and 114 at 5'6"). Flagged for verification.
const FORESTERS_STRONG_FOUNDATION: BuildChart = {
  productId: 'foresters-strong-foundation',
  unit: 'lbs',
  source: 'Quility cheat sheet Foresters tab, 2026-05-16',
  classes: ['standard'],
  rows: [
    { heightInches: 56, minWeight: 82,  maxByClass: [185] },  // 4'8"
    { heightInches: 57, minWeight: 85,  maxByClass: [193] },  // 4'9"
    { heightInches: 58, minWeight: 88,  maxByClass: [198] },  // 4'10"
    { heightInches: 59, minWeight: 91,  maxByClass: [207] },  // 4'11"
    { heightInches: 60, minWeight: 94,  maxByClass: [212] },  // 5'0"
    { heightInches: 61, minWeight: 97,  maxByClass: [221] },  // 5'1"
    { heightInches: 62, minWeight: 101, maxByClass: [225] },  // 5'2"
    { heightInches: 63, minWeight: 104, maxByClass: [234] },  // 5'3"
    { heightInches: 64, minWeight: 107, maxByClass: [243] },  // 5'4"
    { heightInches: 65, minWeight: 110, maxByClass: [250] },  // 5'5"  ← min interpolated, verify
    { heightInches: 66, minWeight: 114, maxByClass: [259] },  // 5'6"
    { heightInches: 67, minWeight: 118, maxByClass: [265] },  // 5'7"
    { heightInches: 68, minWeight: 121, maxByClass: [274] },  // 5'8"
    { heightInches: 69, minWeight: 125, maxByClass: [281] },  // 5'9"
    { heightInches: 70, minWeight: 128, maxByClass: [292] },  // 5'10"
    { heightInches: 71, minWeight: 132, maxByClass: [298] },  // 5'11"
    { heightInches: 72, minWeight: 136, maxByClass: [307] },  // 6'0"
    { heightInches: 73, minWeight: 140, maxByClass: [314] },  // 6'1"
    { heightInches: 74, minWeight: 144, maxByClass: [325] },  // 6'2"
    { heightInches: 75, minWeight: 147, maxByClass: [336] },  // 6'3"
    { heightInches: 76, minWeight: 151, maxByClass: [342] },  // 6'4"
    { heightInches: 77, minWeight: 155, maxByClass: [353] },  // 6'5"
    { heightInches: 78, minWeight: 160, maxByClass: [360] },  // 6'6"
  ],
  notes: 'ADULT Build Chart (16+) Non-Medical. Single accept range — over max = decline. 5\'5" min interpolated as 110 (source rendering ambiguous).',
};

// ─── Foresters Plan Right Whole Life ─────────────────────────────────
// 3-class chart: PlanRight Preferred / Standard / Basic. Heights 4'8"-6'9".
// Above PlanRight Basic max = decline.
const FORESTERS_PLAN_RIGHT: BuildChart = {
  productId: 'foresters-plan-right',
  unit: 'lbs',
  source: 'Quility cheat sheet Foresters tab, 2026-05-16',
  classes: ['preferred', 'standard', 'rated'],
  rows: [
    { heightInches: 56, minWeight: 74,  maxByClass: [201, 216, 232] },  // 4'8"
    { heightInches: 57, minWeight: 77,  maxByClass: [208, 223, 239] },  // 4'9"
    { heightInches: 58, minWeight: 80,  maxByClass: [215, 230, 246] },  // 4'10"
    { heightInches: 59, minWeight: 83,  maxByClass: [222, 237, 253] },  // 4'11"
    { heightInches: 60, minWeight: 86,  maxByClass: [229, 245, 262] },  // 5'0"
    { heightInches: 61, minWeight: 89,  maxByClass: [237, 253, 271] },  // 5'1"
    { heightInches: 62, minWeight: 92,  maxByClass: [246, 262, 280] },  // 5'2"
    { heightInches: 63, minWeight: 95,  maxByClass: [253, 269, 288] },  // 5'3"
    { heightInches: 64, minWeight: 98,  maxByClass: [260, 278, 297] },  // 5'4"
    { heightInches: 65, minWeight: 101, maxByClass: [268, 286, 306] },  // 5'5"
    { heightInches: 66, minWeight: 104, maxByClass: [275, 294, 315] },  // 5'6"
    { heightInches: 67, minWeight: 107, maxByClass: [284, 304, 325] },  // 5'7"
    { heightInches: 68, minWeight: 110, maxByClass: [292, 313, 334] },  // 5'8"
    { heightInches: 69, minWeight: 113, maxByClass: [299, 321, 343] },  // 5'9"
    { heightInches: 70, minWeight: 117, maxByClass: [308, 330, 353] },  // 5'10"
    { heightInches: 71, minWeight: 121, maxByClass: [316, 339, 362] },  // 5'11"
    { heightInches: 72, minWeight: 125, maxByClass: [325, 348, 372] },  // 6'0"
    { heightInches: 73, minWeight: 129, maxByClass: [333, 356, 381] },  // 6'1"
    { heightInches: 74, minWeight: 133, maxByClass: [341, 366, 391] },  // 6'2"
    { heightInches: 75, minWeight: 137, maxByClass: [349, 373, 399] },  // 6'3"
    { heightInches: 76, minWeight: 142, maxByClass: [357, 382, 409] },  // 6'4"
    { heightInches: 77, minWeight: 147, maxByClass: [365, 392, 419] },  // 6'5"
    { heightInches: 78, minWeight: 152, maxByClass: [373, 406, 434] },  // 6'6"
    { heightInches: 79, minWeight: 159, maxByClass: [381, 413, 442] },  // 6'7"
    { heightInches: 80, minWeight: 162, maxByClass: [389, 421, 450] },  // 6'8"
    { heightInches: 81, minWeight: 167, maxByClass: [397, 430, 460] },  // 6'9"
  ],
  notes: 'PlanRight Preferred / Standard / Basic death-benefit tiers. Above Basic = decline.',
};

// ─── F&G Pathsetter IUL ──────────────────────────────────────────────
// Sex-differentiated chart with two classes (Preferred, Standard) per
// sex. Base chart is age 16-50; +5 lbs for 51-60, +10 lbs for 60+.
const FG_PATHSETTER: BuildChart = {
  productId: 'fg-pathsetter',
  unit: 'lbs',
  source: 'Quility cheat sheet F&G tab, 2026-05-16',
  classes: ['preferred', 'standard'],
  ageAdjustments: [
    { minAge: 51, addLbs: 5 },
    { minAge: 61, addLbs: 10 },
  ],
  rows: [
    { heightInches: 56, maxByClassMale: [166, 183], maxByClassFemale: [152, 167] },  // 4'8"
    { heightInches: 57, maxByClassMale: [170, 187], maxByClassFemale: [155, 171] },  // 4'9"
    { heightInches: 58, maxByClassMale: [174, 191], maxByClassFemale: [157, 173] },  // 4'10"
    { heightInches: 59, maxByClassMale: [178, 196], maxByClassFemale: [160, 176] },  // 4'11"
    { heightInches: 60, maxByClassMale: [182, 200], maxByClassFemale: [163, 179] },  // 5'0"
    { heightInches: 61, maxByClassMale: [186, 205], maxByClassFemale: [166, 183] },  // 5'1"
    { heightInches: 62, maxByClassMale: [190, 209], maxByClassFemale: [169, 186] },  // 5'2"
    { heightInches: 63, maxByClassMale: [196, 216], maxByClassFemale: [174, 191] },  // 5'3"
    { heightInches: 64, maxByClassMale: [202, 222], maxByClassFemale: [179, 197] },  // 5'4"
    { heightInches: 65, maxByClassMale: [207, 228], maxByClassFemale: [183, 201] },  // 5'5"
    { heightInches: 66, maxByClassMale: [213, 234], maxByClassFemale: [189, 208] },  // 5'6"
    { heightInches: 67, maxByClassMale: [217, 239], maxByClassFemale: [193, 212] },  // 5'7"
    { heightInches: 68, maxByClassMale: [223, 245], maxByClassFemale: [198, 218] },  // 5'8"
    { heightInches: 69, maxByClassMale: [228, 251], maxByClassFemale: [202, 222] },  // 5'9"
    { heightInches: 70, maxByClassMale: [235, 259], maxByClassFemale: [208, 229] },  // 5'10"
    { heightInches: 71, maxByClassMale: [241, 265], maxByClassFemale: [214, 235] },  // 5'11"
    { heightInches: 72, maxByClassMale: [248, 273], maxByClassFemale: [220, 243] },  // 6'0"
    { heightInches: 73, maxByClassMale: [253, 278], maxByClassFemale: [225, 248] },  // 6'1"
    { heightInches: 74, maxByClassMale: [260, 286], maxByClassFemale: [232, 255] },  // 6'2"
    { heightInches: 75, maxByClassMale: [267, 294], maxByClassFemale: [237, 261] },  // 6'3"
    { heightInches: 76, maxByClassMale: [276, 304], maxByClassFemale: [246, 271] },  // 6'4"
    { heightInches: 77, maxByClassMale: [284, 312], maxByClassFemale: [253, 278] },  // 6'5"
    { heightInches: 78, maxByClassMale: [293, 322], maxByClassFemale: [261, 287] },  // 6'6"
    { heightInches: 79, maxByClassMale: [301, 331], maxByClassFemale: [268, 295] },  // 6'7"
    { heightInches: 80, maxByClassMale: [308, 341], maxByClassFemale: [274, 308] },  // 6'8"
    { heightInches: 81, maxByClassMale: [315, 349], maxByClassFemale: [282, 316] },  // 6'9"
    { heightInches: 82, maxByClassMale: [325, 359], maxByClassFemale: [288, 326] },  // 6'10"
    { heightInches: 83, maxByClassMale: [336, 369], maxByClassFemale: [293, 336] },  // 6'11"
    { heightInches: 84, maxByClassMale: [345, 378], maxByClassFemale: [298, 345] },  // 7'0"
  ],
  notes: 'Sex-differentiated Preferred / Standard max weights. Base = age 16-50; +5 lbs for 51-60, +10 lbs for 61+.',
};

// ─── MOO Express Life (TLE / IULE) — shared height/weight chart ──────
// The "Express Life Products Reference Guide" maps 1 chart to 3
// products: Term Life Express (TLE), Indexed UL Express (IULE), and
// Living Promise WL. Each product uses different columns. Heights
// 4'8"-6'10".
//
// TLE + IULE → single accept range using TLE/IULE max column. The
// source's Table Maximum column (multiple impairments) is LOWER than
// the standard max — it's a "with-impairments" floor, not a more-
// permissive rated tier, so we don't model it as a class. The
// underwriting flags on the lead handle impairment-driven downgrade
// separately from the build chart.
const MOO_TERM_LIFE_EXPRESS: BuildChart = {
  productId: 'moo-term-life-express',
  unit: 'lbs',
  source: 'Quility cheat sheet MOO tab, 2026-05-16',
  classes: ['standard'],
  rows: [
    { heightInches: 56, minWeight: 74,  maxByClass: [197] },  // 4'8"
    { heightInches: 57, minWeight: 77,  maxByClass: [202] },  // 4'9"
    { heightInches: 58, minWeight: 79,  maxByClass: [208] },  // 4'10"
    { heightInches: 59, minWeight: 82,  maxByClass: [214] },  // 4'11"
    { heightInches: 60, minWeight: 85,  maxByClass: [220] },  // 5'0"
    { heightInches: 61, minWeight: 88,  maxByClass: [226] },  // 5'1"
    { heightInches: 62, minWeight: 91,  maxByClass: [232] },  // 5'2"
    { heightInches: 63, minWeight: 94,  maxByClass: [238] },  // 5'3"
    { heightInches: 64, minWeight: 97,  maxByClass: [245] },  // 5'4"
    { heightInches: 65, minWeight: 100, maxByClass: [251] },  // 5'5"
    { heightInches: 66, minWeight: 103, maxByClass: [258] },  // 5'6"
    { heightInches: 67, minWeight: 106, maxByClass: [265] },  // 5'7"
    { heightInches: 68, minWeight: 109, maxByClass: [274] },  // 5'8"
    { heightInches: 69, minWeight: 112, maxByClass: [282] },  // 5'9"
    { heightInches: 70, minWeight: 115, maxByClass: [289] },  // 5'10"
    { heightInches: 71, minWeight: 119, maxByClass: [298] },  // 5'11"
    { heightInches: 72, minWeight: 122, maxByClass: [305] },  // 6'0"
    { heightInches: 73, minWeight: 126, maxByClass: [313] },  // 6'1"
    { heightInches: 74, minWeight: 129, maxByClass: [321] },  // 6'2"
    { heightInches: 75, minWeight: 133, maxByClass: [329] },  // 6'3"
    { heightInches: 76, minWeight: 136, maxByClass: [338] },  // 6'4"
    { heightInches: 77, minWeight: 140, maxByClass: [347] },  // 6'5"
    { heightInches: 78, minWeight: 143, maxByClass: [358] },  // 6'6"
    { heightInches: 79, minWeight: 147, maxByClass: [367] },  // 6'7"
    { heightInches: 80, minWeight: 151, maxByClass: [376] },  // 6'8"
    { heightInches: 81, minWeight: 154, maxByClass: [385] },  // 6'9"
    { heightInches: 82, minWeight: 158, maxByClass: [395] },  // 6'10"
  ],
  notes: 'TLE / IULE Maximum Weight column. Above max = decline.',
};

// MOO Living Promise WL — uses the same min weight, different max
// columns: Level Benefit (standard) + Graded Benefit (rated).
const MOO_LIVING_PROMISE: BuildChart = {
  productId: 'moo-living-promise',
  unit: 'lbs',
  source: 'Quility cheat sheet MOO tab, 2026-05-16',
  classes: ['standard', 'rated'],
  rows: [
    { heightInches: 56, minWeight: 74,  maxByClass: [204, 221] },  // 4'8"
    { heightInches: 57, minWeight: 77,  maxByClass: [209, 225] },  // 4'9"
    { heightInches: 58, minWeight: 79,  maxByClass: [214, 231] },  // 4'10"
    { heightInches: 59, minWeight: 82,  maxByClass: [220, 237] },  // 4'11"
    { heightInches: 60, minWeight: 85,  maxByClass: [226, 244] },  // 5'0"
    { heightInches: 61, minWeight: 88,  maxByClass: [233, 250] },  // 5'1"
    { heightInches: 62, minWeight: 91,  maxByClass: [239, 257] },  // 5'2"
    { heightInches: 63, minWeight: 94,  maxByClass: [246, 264] },  // 5'3"
    { heightInches: 64, minWeight: 97,  maxByClass: [252, 270] },  // 5'4"
    { heightInches: 65, minWeight: 100, maxByClass: [259, 277] },  // 5'5"
    { heightInches: 66, minWeight: 103, maxByClass: [268, 285] },  // 5'6"
    { heightInches: 67, minWeight: 106, maxByClass: [275, 293] },  // 5'7"
    { heightInches: 68, minWeight: 109, maxByClass: [283, 300] },  // 5'8"
    { heightInches: 69, minWeight: 112, maxByClass: [291, 309] },  // 5'9"
    { heightInches: 70, minWeight: 115, maxByClass: [300, 316] },  // 5'10"
    { heightInches: 71, minWeight: 119, maxByClass: [307, 325] },  // 5'11"
    { heightInches: 72, minWeight: 122, maxByClass: [315, 333] },  // 6'0"
    { heightInches: 73, minWeight: 126, maxByClass: [322, 340] },  // 6'1"
    { heightInches: 74, minWeight: 129, maxByClass: [331, 349] },  // 6'2"
    { heightInches: 75, minWeight: 133, maxByClass: [339, 358] },  // 6'3"
    { heightInches: 76, minWeight: 136, maxByClass: [348, 367] },  // 6'4"
    { heightInches: 77, minWeight: 140, maxByClass: [357, 376] },  // 6'5"
    { heightInches: 78, minWeight: 143, maxByClass: [366, 385] },  // 6'6"
    { heightInches: 79, minWeight: 147, maxByClass: [375, 394] },  // 6'7"
    { heightInches: 80, minWeight: 151, maxByClass: [385, 405] },  // 6'8"
    { heightInches: 81, minWeight: 154, maxByClass: [395, 415] },  // 6'9"
    { heightInches: 82, minWeight: 158, maxByClass: [407, 427] },  // 6'10"
  ],
  notes: 'Standard = Level Benefit Plan max; Rated = Graded Benefit Plan max. Above Graded = decline.',
};

// MOO Critical Advantage — Decline Below / Decline Over (single accept
// range per height). Above max OR below min = decline.
const MOO_CRITICAL_ADVANTAGE: BuildChart = {
  productId: 'moo-critical-advantage',
  unit: 'lbs',
  source: 'Quility cheat sheet MOO tab, 2026-05-16',
  classes: ['standard'],
  rows: [
    { heightInches: 56, minWeight: 80,  maxByClass: [174] },  // 4'8"
    { heightInches: 57, minWeight: 83,  maxByClass: [181] },  // 4'9"
    { heightInches: 58, minWeight: 86,  maxByClass: [187] },  // 4'10"
    { heightInches: 59, minWeight: 89,  maxByClass: [194] },  // 4'11"
    { heightInches: 60, minWeight: 92,  maxByClass: [200] },  // 5'0"
    { heightInches: 61, minWeight: 95,  maxByClass: [207] },  // 5'1"
    { heightInches: 62, minWeight: 98,  maxByClass: [214] },  // 5'2"
    { heightInches: 63, minWeight: 102, maxByClass: [221] },  // 5'3"
    { heightInches: 64, minWeight: 105, maxByClass: [228] },  // 5'4"
    { heightInches: 65, minWeight: 108, maxByClass: [235] },  // 5'5"
    { heightInches: 66, minWeight: 112, maxByClass: [242] },  // 5'6"
    { heightInches: 67, minWeight: 115, maxByClass: [250] },  // 5'7"
    { heightInches: 68, minWeight: 118, maxByClass: [257] },  // 5'8"
    { heightInches: 69, minWeight: 122, maxByClass: [266] },  // 5'9"
    { heightInches: 70, minWeight: 125, maxByClass: [272] },  // 5'10"
    { heightInches: 71, minWeight: 129, maxByClass: [280] },  // 5'11"
    { heightInches: 72, minWeight: 133, maxByClass: [288] },  // 6'0"
    { heightInches: 73, minWeight: 136, maxByClass: [296] },  // 6'1"
    { heightInches: 74, minWeight: 140, maxByClass: [304] },  // 6'2"
    { heightInches: 75, minWeight: 144, maxByClass: [313] },  // 6'3"
    { heightInches: 76, minWeight: 148, maxByClass: [321] },  // 6'4"
    { heightInches: 77, minWeight: 152, maxByClass: [329] },  // 6'5"
    { heightInches: 78, minWeight: 156, maxByClass: [338] },  // 6'6"
    { heightInches: 79, minWeight: 160, maxByClass: [347] },  // 6'7"
    { heightInches: 80, minWeight: 164, maxByClass: [356] },  // 6'8"
    { heightInches: 81, minWeight: 168, maxByClass: [364] },  // 6'9"
    { heightInches: 82, minWeight: 172, maxByClass: [374] },  // 6'10"
    { heightInches: 83, minWeight: 176, maxByClass: [383] },  // 6'11"
  ],
  notes: 'Single accept range. Source labels Decline Below + Decline Over; outside the range = decline. Heart attack/stroke + CI + ICU rider use this chart.',
};

export const BUILD_CHARTS: Record<string, BuildChart> = {
  [SBLI_EASYTRAK.productId]: SBLI_EASYTRAK,
  [UHL_SIMPLE_TERM.productId]: UHL_SIMPLE_TERM,
  [UHL_FINAL_EXPENSE.productId]: UHL_FINAL_EXPENSE,
  [BANNER_QLT_TERM_PLUS.productId]: BANNER_QLT_TERM_PLUS,
  [AMAM_EXPRESS_TERM.productId]: AMAM_EXPRESS_TERM,
  [AMAM_HOME_CERTAINTY.productId]: AMAM_HOME_CERTAINTY,
  [AMERICO_HMS.productId]: AMERICO_HMS,
  [FORESTERS_STRONG_FOUNDATION.productId]: FORESTERS_STRONG_FOUNDATION,
  [FORESTERS_PLAN_RIGHT.productId]: FORESTERS_PLAN_RIGHT,
  [FG_PATHSETTER.productId]: FG_PATHSETTER,
  [MOO_TERM_LIFE_EXPRESS.productId]: MOO_TERM_LIFE_EXPRESS,
  [MOO_LIVING_PROMISE.productId]: MOO_LIVING_PROMISE,
  [MOO_CRITICAL_ADVANTAGE.productId]: MOO_CRITICAL_ADVANTAGE,
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
  /** Hint when the chart is sex-differentiated but we don't have the
   *  lead's gender — we use the more permissive (male) column and flag
   *  that the answer would tighten if female. */
  sexUnknownWarning?: boolean;
}

export interface BuildLookupContext {
  sex?: 'M' | 'F';
  age?: number;
}

/** Pick the right max-weight + min-weight arrays for a row based on sex.
 *  When sex is unknown on a sex-differentiated chart, we use the male
 *  column (more permissive) and the caller surfaces a warning. */
function resolveRowForSex(
  row: BuildChartRow,
  sex: 'M' | 'F' | undefined,
): { maxByClass: Array<number | null>; minWeight?: number; sexUnknownOnDifferentiated: boolean } {
  const hasDifferentiated = row.maxByClassMale && row.maxByClassFemale;
  if (hasDifferentiated) {
    if (sex === 'F') {
      return {
        maxByClass: row.maxByClassFemale!,
        minWeight: row.minWeightFemale ?? row.minWeight,
        sexUnknownOnDifferentiated: false,
      };
    }
    return {
      maxByClass: row.maxByClassMale!,
      minWeight: row.minWeightMale ?? row.minWeight,
      sexUnknownOnDifferentiated: sex !== 'M',
    };
  }
  return {
    maxByClass: row.maxByClass ?? [],
    minWeight: row.minWeight,
    sexUnknownOnDifferentiated: false,
  };
}

/** Apply age-band adjustment (additive lbs) to a max-weight array.
 *  Picks the highest-minAge band the lead qualifies for. Mutates a copy. */
function applyAgeAdjustment(
  maxByClass: Array<number | null>,
  ageAdjustments: BuildChart['ageAdjustments'],
  age: number | undefined,
): Array<number | null> {
  if (!ageAdjustments || ageAdjustments.length === 0 || age == null) return maxByClass;
  let bump = 0;
  for (const adj of ageAdjustments) {
    if (age >= adj.minAge && adj.addLbs > bump) bump = adj.addLbs;
  }
  if (bump === 0) return maxByClass;
  return maxByClass.map((m) => (m == null ? null : m + bump));
}

/** Look up the rate class a lead qualifies for given a product. Returns
 *  { hasChart: false } when we haven't transcribed that product's
 *  chart yet — UI should hide the build-check line in that case. */
export function getBuildOutcome(
  productId: string,
  heightInches: number | null,
  weightLbs: number | null,
  context?: BuildLookupContext,
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

  const { maxByClass: baseMax, minWeight, sexUnknownOnDifferentiated } = resolveRowForSex(row, context?.sex);
  const adjustedMax = applyAgeAdjustment(baseMax, chart.ageAdjustments, context?.age);

  if (minWeight !== undefined && weightLbs < minWeight) {
    return {
      hasChart: true,
      rateClass: 'underweight',
      line: `Below min weight (${minWeight} lbs)`,
      sexUnknownWarning: sexUnknownOnDifferentiated,
    };
  }
  for (let i = 0; i < chart.classes.length; i++) {
    const max = adjustedMax[i];
    if (max != null && weightLbs <= max) {
      const rc = chart.classes[i];
      return {
        hasChart: true,
        rateClass: rc,
        line: `${RATE_CLASS_LABEL[rc]} build`,
        sexUnknownWarning: sexUnknownOnDifferentiated,
      };
    }
  }
  return {
    hasChart: true,
    rateClass: 'over_standard',
    line: 'Over chart max — likely decline or table-rate',
    sexUnknownWarning: sexUnknownOnDifferentiated,
  };
}
