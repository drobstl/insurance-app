/**
 * Carrier-fit suggestion engine — Phase 1.
 *
 * Source of truth: Quility Underwriting Cheat Sheet (Google Sheet
 * `1fbx_Mb4mk7vAD9WpxRjcBzipQ_-ccBCOEbZZxNcrlXU`, "Matrix" tab).
 *
 * Phase-1 scope is intentionally narrow per `feedback_match_scope_to_data.md`:
 *  - All 26 cheat-sheet products + 2 brand-specific Quility products
 *    (Foresters Live Well Plus, F&G Quantum) — 28 entries.
 *  - Age + smoker gates for all.
 *  - High-signal medical rules transcribed for: cancer, heart, diabetes
 *    (incl. insulin), COPD, HIV, kidney, marijuana, felony, mental
 *    health (incl. suicide attempt). ~10 conditions.
 *  - Long-tail conditions (~80 more rows in the matrix) are out of
 *    scope for Phase 1. Daniel can fill them directly here.
 *
 * To refresh from the live sheet: open the Sheet, run via Chrome MCP
 *   fetch('/spreadsheets/d/<ID>/gviz/tq?tqx=out:json&gid=0', { credentials: 'include' })
 * — returns full matrix JSON.
 */

export type UnderwritingOutcome = 'ACCEPT' | 'DECLINE' | 'CONDITIONAL' | 'CALL_CARRIER';

export type ProductType =
  | 'term'
  | 'whole_life'
  | 'ul'
  | 'iul'
  | 'final_expense'
  | 'infinite_banking';

export interface LeadUnderwriting {
  age?: number;                  // derived from DOB or ageYears
  smoker?: 'Y' | 'N';            // mirror of lead.smokerStatus

  cancer?: 'none' | 'basal_or_squamous' | 'remission_5yr' | 'remission_2yr' | 'active';
  heartHistory?: 'none' | 'angina' | 'attack' | 'bypass' | 'stent' | 'afib';
  diabetes?: 'none' | 'gestational' | 'oral_meds' | 'insulin_after_45' | 'insulin_before_45';
  copd?: 'none' | 'mild' | 'severe';
  hiv?: 'none' | 'prep' | 'positive';
  kidneyDisease?: 'none' | 'chronic' | 'dialysis' | 'failure';
  felony?: 'none' | 'over_5yr' | 'within_5yr' | 'within_2yr';
  dui?: 'none' | 'over_5yr' | 'within_5yr' | 'within_2yr';
  marijuana?: 'none' | 'recreational' | 'medical' | 'daily';
  mentalHealth?: 'none' | 'mild' | 'moderate' | 'severe' | 'suicide_attempt';
}

export type UnderwritingConditionKey = keyof Omit<LeadUnderwriting, 'age' | 'smoker'>;

export type RuleResult = { outcome: UnderwritingOutcome; note?: string } | null;
export type RuleFn = (lead: LeadUnderwriting) => RuleResult;

export interface CarrierProduct {
  id: string;                    // 'sbli-easytrak'
  carrier: string;               // 'SBLI'
  product: string;               // 'EasyTrak Digital Term'
  productType: ProductType;
  ageMin: number;
  ageMax: number;
  smokerAgeMax?: number;         // Americo Eagle Select: 80 smoker / 85 non
  priority: number;              // 1 = top healthy-pick, 2 = fallback, 5 = default
  brandNotes?: string;           // e.g. "Quility Secure Future Preferred"
  dataIncomplete?: boolean;      // true when cheat-sheet cells are mostly empty for this column
  // Carrier-specific tobacco quirks. Rendered under the suggestion only
  // when the lead's smoker status is 'Y'. Out-of-band from the rules
  // engine because these affect rate class, not accept/decline.
  smokerNote?: string;
  rules: Partial<Record<UnderwritingConditionKey, RuleFn>>;
}

export interface RankedRecommendation {
  product: CarrierProduct;
  outcome: UnderwritingOutcome;
  notes: string[];
}

// ─── Common rule helpers ──────────────────────────────────────────────

const DECLINE = (note: string): RuleResult => ({ outcome: 'DECLINE', note });
const CONDITIONAL = (note: string): RuleResult => ({ outcome: 'CONDITIONAL', note });
const ACCEPT_NOTE = (note: string): RuleResult => ({ outcome: 'ACCEPT', note });
const CALL = (note: string): RuleResult => ({ outcome: 'CALL_CARRIER', note });

// HIV is a hard decline at nearly every carrier (AIG GRADED is the lone
// exception). Use this for products where col 26 isn't AIG.
const HIV_HARD_DECLINE: RuleFn = (l) =>
  l.hiv === 'positive' ? DECLINE('HIV positive') : null;

// Kidney failure / dialysis is a hard decline at every carrier except
// TransAm Immediate Solutions (graded after 12mo) + AIG (graded).
const KIDNEY_HARD_DECLINE: RuleFn = (l) =>
  l.kidneyDisease === 'dialysis' || l.kidneyDisease === 'failure'
    ? DECLINE(`kidney ${l.kidneyDisease}`)
    : null;

// Active cancer is a near-universal decline.
const ACTIVE_CANCER_DECLINE: RuleFn = (l) =>
  l.cancer === 'active' ? DECLINE('active cancer') : null;

// Felony within 2 years declines almost everywhere.
const RECENT_FELONY_DECLINE: RuleFn = (l) =>
  l.felony === 'within_2yr' ? DECLINE('felony within 2 years') : null;

// Suicide attempt declines on most fully-underwritten products.
const SUICIDE_ATTEMPT_DECLINE: RuleFn = (l) =>
  l.mentalHealth === 'suicide_attempt' ? DECLINE('suicide attempt history') : null;

// ─── Carrier products ─────────────────────────────────────────────────
// Priority tiers (Daniel's explicit preference, May 15):
//   1 = healthy-priority pick (Quility brand list)
//   2 = unhealthy fallback (Americo / MOO / AmAm non-priority-1)
//   5 = default (everything else)

export const CARRIER_PRODUCTS: CarrierProduct[] = [
  // ── 1. AMAM Express Term (18-75) — term ──
  {
    id: 'amam-express-term',
    carrier: 'American-Amicable',
    product: 'Express Term',
    productType: 'term',
    ageMin: 18, ageMax: 75,
    priority: 2,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'active' || l.cancer === 'remission_2yr')
          return DECLINE('cancer within 8 years (basal/squamous ok)');
        if (l.cancer === 'basal_or_squamous' || l.cancer === 'remission_5yr')
          return ACCEPT_NOTE('basal/squamous or 8+ yrs remission');
        return null;
      },
      diabetes: (l) => {
        if (l.diabetes === 'insulin_after_45' || l.diabetes === 'insulin_before_45')
          return DECLINE('insulin = decline');
        if (l.diabetes === 'oral_meds')
          return ACCEPT_NOTE('oral meds 35+ ok');
        return null;
      },
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('COPD = decline') : null,
      heartHistory: (l) =>
        l.heartHistory && l.heartHistory !== 'none'
          ? DECLINE(`heart history (${l.heartHistory})`)
          : null,
      marijuana: (l) => {
        if (l.marijuana === 'medical')
          return CONDITIONAL('medical marijuana: needs ID card + records');
        if (l.marijuana === 'recreational' || l.marijuana === 'daily')
          return DECLINE('recreational marijuana = decline');
        return null;
      },
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' || l.mentalHealth === 'suicide_attempt'
          ? DECLINE('major depression / suicide attempt')
          : null,
    },
  },

  // ── 2. AMAM Home Certainty Term & Express UL (20-75) — ul ──
  {
    id: 'amam-home-certainty',
    carrier: 'American-Amicable',
    product: 'Home Certainty Term & Express UL',
    productType: 'ul',
    ageMin: 20, ageMax: 75,
    priority: 2,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'active' || l.cancer === 'remission_2yr')
          return DECLINE('cancer within 7 years (basal/squamous ok)');
        if (l.cancer === 'basal_or_squamous' || l.cancer === 'remission_5yr')
          return ACCEPT_NOTE('basal/squamous or 7+ yrs remission');
        return null;
      },
      diabetes: (l) => {
        if (l.diabetes === 'insulin_after_45' || l.diabetes === 'insulin_before_45')
          return DECLINE('insulin = decline');
        if (l.diabetes === 'oral_meds')
          return ACCEPT_NOTE('oral meds 35+ ok');
        return null;
      },
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('COPD = decline') : null,
      heartHistory: (l) =>
        l.heartHistory && l.heartHistory !== 'none'
          ? DECLINE(`heart history (${l.heartHistory})`)
          : null,
      marijuana: (l) => {
        if (l.marijuana === 'medical')
          return CONDITIONAL('medical marijuana: needs ID card + records');
        if (l.marijuana === 'recreational' || l.marijuana === 'daily')
          return DECLINE('recreational marijuana = decline');
        return null;
      },
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' || l.mentalHealth === 'suicide_attempt'
          ? DECLINE('major depression / suicide attempt')
          : null,
    },
  },

  // ── 3. AMAM Dignity Solutions Whole Life (50-85) — final expense ──
  {
    id: 'amam-dignity-solutions',
    carrier: 'American-Amicable',
    product: 'Dignity Solutions Whole Life',
    productType: 'final_expense',
    ageMin: 50, ageMax: 85,
    priority: 2,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: (l) =>
        l.kidneyDisease === 'dialysis' ? DECLINE('kidney dialysis')
        : l.kidneyDisease === 'failure' ? CONDITIONAL('kidney failure: return of premium tier')
        : null,
      cancer: (l) => {
        if (l.cancer === 'active') return DECLINE('active cancer');
        if (l.cancer === 'remission_2yr') return CONDITIONAL('cancer 2-3 yrs: ROP or graded tier');
        if (l.cancer === 'remission_5yr' || l.cancer === 'basal_or_squamous')
          return ACCEPT_NOTE('3+ yrs remission or basal/squamous');
        return null;
      },
      diabetes: (l) => {
        if (l.diabetes === 'insulin_before_45')
          return CONDITIONAL('insulin <50 = ROP tier');
        if (l.diabetes === 'insulin_after_45' || l.diabetes === 'oral_meds')
          return ACCEPT_NOTE('insulin >50 or oral ok');
        return null;
      },
      heartHistory: (l) => {
        if (l.heartHistory === 'attack') return CONDITIONAL('heart attack <2y = ROP, <3y = graded');
        if (l.heartHistory === 'angina' || l.heartHistory === 'stent' || l.heartHistory === 'afib')
          return CONDITIONAL('heart history: ROP/graded tier');
        return null;
      },
      copd: (l) => {
        if (l.copd === 'severe') return CONDITIONAL('COPD 2yr+ = ROP tier');
        if (l.copd === 'mild') return ACCEPT_NOTE('COPD 2yr+ ok');
        return null;
      },
      mentalHealth: (l) =>
        l.mentalHealth === 'suicide_attempt'
          ? CONDITIONAL('suicide attempt 1yr+ ok, recent = decline')
          : null,
      marijuana: (l) =>
        l.marijuana === 'recreational' || l.marijuana === 'medical' || l.marijuana === 'daily'
          ? CONDITIONAL('return-of-premium tier')
          : null,
      felony: (l) =>
        l.felony === 'within_2yr' || l.felony === 'within_5yr'
          ? DECLINE('current incarceration/parole/probation')
          : null,
    },
  },

  // ── 4. AMAM QSFP Whole Life (50-85) — whole life ──
  //    Brand name: "Quility Secure Future Preferred" (= QSFP acronym).
  {
    id: 'amam-qsfp',
    carrier: 'American-Amicable',
    product: 'QSFP Whole Life',
    productType: 'whole_life',
    ageMin: 50, ageMax: 85,
    priority: 1,
    brandNotes: 'Quility Secure Future Preferred',
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'active') return DECLINE('cancer within 2y');
        if (l.cancer === 'remission_2yr' || l.cancer === 'remission_5yr' || l.cancer === 'basal_or_squamous')
          return ACCEPT_NOTE('2+ yrs since treatment');
        return null;
      },
      diabetes: (l) =>
        l.diabetes === 'insulin_before_45' ? DECLINE('insulin <50 = decline')
        : l.diabetes === 'insulin_after_45' ? ACCEPT_NOTE('insulin 50+ ok')
        : null,
      heartHistory: (l) =>
        l.heartHistory && l.heartHistory !== 'none'
          ? (l.heartHistory === 'attack' ? CONDITIONAL('heart attack: 2yr+ ok') : ACCEPT_NOTE('over 2 yrs ok'))
          : null,
      copd: (l) => l.copd === 'severe' ? DECLINE('severe COPD') : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'suicide_attempt' ? DECLINE('suicide attempt ever = decline')
        : l.mentalHealth === 'severe' ? CONDITIONAL('major mental health: 2yr+ ok')
        : null,
      felony: (l) =>
        l.felony === 'within_2yr' || l.felony === 'within_5yr'
          ? DECLINE('current incarceration/parole/probation')
          : null,
      marijuana: (l) =>
        l.marijuana === 'recreational' || l.marijuana === 'medical' || l.marijuana === 'daily'
          ? CONDITIONAL('return-of-premium tier')
          : null,
    },
  },

  // ── 5. AMAM Term Made Simple (20-75) — term ──
  {
    id: 'amam-term-made-simple',
    carrier: 'American-Amicable',
    product: 'Term Made Simple',
    productType: 'term',
    ageMin: 20, ageMax: 75,
    priority: 2,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'active' || l.cancer === 'remission_2yr')
          return DECLINE('cancer within 8 years (basal/squamous ok)');
        if (l.cancer === 'basal_or_squamous' || l.cancer === 'remission_5yr')
          return ACCEPT_NOTE('basal/squamous or 8+ yrs remission');
        return null;
      },
      diabetes: (l) =>
        l.diabetes === 'insulin_after_45' || l.diabetes === 'insulin_before_45'
          ? DECLINE('insulin = decline') : null,
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('COPD = decline') : null,
      heartHistory: (l) =>
        l.heartHistory && l.heartHistory !== 'none' ? DECLINE(`heart history (${l.heartHistory})`) : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' || l.mentalHealth === 'suicide_attempt'
          ? DECLINE('major mental health') : null,
    },
  },

  // ── 6. Americo HMS / CBO Term / IUL (20-75) — term/iul ──
  {
    id: 'americo-hms',
    carrier: 'Americo',
    product: 'HMS / CBO Term / IUL',
    productType: 'term',
    ageMin: 20, ageMax: 75,
    priority: 2,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) =>
        l.cancer && l.cancer !== 'none' && l.cancer !== 'basal_or_squamous'
          ? DECLINE('benign or malignant cancer = decline') : null,
      diabetes: (l) => {
        if (l.diabetes === 'insulin_before_45') return DECLINE('insulin under 45');
        if (l.diabetes === 'insulin_after_45') return ACCEPT_NOTE('diagnosed 35+ ok');
        if (l.diabetes === 'oral_meds') return ACCEPT_NOTE('oral meds 35+ ok');
        return null;
      },
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('COPD = decline') : null,
      heartHistory: (l) => l.heartHistory && l.heartHistory !== 'none' ? DECLINE(`heart history (${l.heartHistory})`) : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' ? DECLINE('mild/situational dx <6mo or hosp = decline')
        : l.mentalHealth === 'suicide_attempt' ? DECLINE('recent psych hospitalization')
        : null,
      felony: (l) =>
        l.felony === 'within_2yr' ? DECLINE('felony within 6 months of incarceration')
        : l.felony === 'within_5yr' ? CONDITIONAL('over 10y past ok; otherwise call carrier')
        : null,
      marijuana: (l) =>
        l.marijuana === 'recreational' || l.marijuana === 'medical' || l.marijuana === 'daily'
          ? CONDITIONAL('occasional use = smoker rates') : null,
    },
  },

  // ── 7. Americo Eagle Select Whole Life (40-85 NS / 40-80 SM) — whole life ──
  {
    id: 'americo-eagle-select',
    carrier: 'Americo',
    product: 'Eagle Select Whole Life',
    productType: 'whole_life',
    ageMin: 40, ageMax: 85,
    smokerAgeMax: 80,
    priority: 2,
    smokerNote: 'First 3 years at non-tobacco rate. Locks in permanently if they quit. (If they don\'t notify the carrier after 3y, face amount auto-reduces.)',
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      diabetes: (l) =>
        l.diabetes === 'insulin_after_45' || l.diabetes === 'insulin_before_45'
          ? ACCEPT_NOTE('insulin with no complications ok') : null,
      heartHistory: (l) =>
        l.heartHistory === 'attack' ? ACCEPT_NOTE('over 1y ok if no complications')
        : l.heartHistory && l.heartHistory !== 'none' ? CONDITIONAL(`heart history (${l.heartHistory})`)
        : null,
      copd: (l) => l.copd === 'severe' ? DECLINE('severe COPD') : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' || l.mentalHealth === 'suicide_attempt'
          ? CONDITIONAL('hospitalized 6mo+ = decline; otherwise accept with meds')
          : null,
    },
  },

  // ── 8. F&G Pathsetter IUL (0-80) — iul ──
  {
    id: 'fg-pathsetter',
    carrier: 'F&G',
    product: 'Pathsetter IUL',
    productType: 'iul',
    ageMin: 0, ageMax: 80,
    priority: 5,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: () => null,    // CALL CARRIER per matrix — surface as conditional below
      diabetes: () => CALL('mostly declines; call F&G'),
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('COPD = decline') : null,
      heartHistory: (l) => l.heartHistory && l.heartHistory !== 'none' ? CALL('call F&G for heart history') : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' ? CONDITIONAL('rated to decline for major depression')
        : null,
      marijuana: (l) =>
        l.marijuana === 'recreational' || l.marijuana === 'medical' || l.marijuana === 'daily'
          ? CALL('call F&G — frequency dependent') : null,
    },
  },

  // ── 9. Foresters Strong Foundation Term Smart UL (18-80) — term ──
  {
    id: 'foresters-strong-foundation',
    carrier: 'Foresters',
    product: 'Strong Foundation Term Smart UL',
    productType: 'term',
    ageMin: 18, ageMax: 80,
    priority: 5,
    smokerNote: 'Vaping, cigars, and chewing tobacco count as non-tobacco on Strong Foundation. (Smart UL is different — those count as tobacco there.)',
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'active' || l.cancer === 'remission_2yr')
          return DECLINE('basal/squamous only on this product');
        if (l.cancer === 'basal_or_squamous') return ACCEPT_NOTE('basal/squamous ok');
        return null;
      },
      diabetes: (l) =>
        l.diabetes === 'insulin_before_45' ? DECLINE('Type 1/2 diagnosed <30 = decline')
        : null,
      copd: (l) => l.copd === 'severe' ? DECLINE('severe COPD') : l.copd === 'mild' ? CONDITIONAL('mild only, no O2/steroids') : null,
      heartHistory: (l) => l.heartHistory && l.heartHistory !== 'none' ? DECLINE(`heart history (${l.heartHistory})`) : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' || l.mentalHealth === 'suicide_attempt'
          ? DECLINE('severe major depression') : null,
      marijuana: (l) =>
        l.marijuana === 'recreational' ? CONDITIONAL('rec 5x/wk = non-tobacco rates')
        : l.marijuana === 'medical' ? CONDITIONAL('depends on reason; may need exam')
        : l.marijuana === 'daily' ? CONDITIONAL('>5x/wk = medical exam') : null,
    },
  },

  // ── 10. Foresters Plan Right Whole Life (50-75 eApp, 76-85 wet sign) — whole life ──
  {
    id: 'foresters-plan-right',
    carrier: 'Foresters',
    product: 'Plan Right Whole Life',
    productType: 'whole_life',
    ageMin: 50, ageMax: 85,
    priority: 5,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) =>
        l.cancer === 'active' || l.cancer === 'remission_2yr'
          ? CONDITIONAL('within 3y = basic death benefit (graded)') : null,
      diabetes: () => ACCEPT_NOTE('preferred death benefit, no age min for diagnosis'),
      copd: () => CONDITIONAL('standard death benefit'),
      heartHistory: (l) =>
        l.heartHistory === 'attack' ? CONDITIONAL('within 1y = graded, within 2y = standard') : null,
      mentalHealth: () => ACCEPT_NOTE('preferred death benefit, check meds'),
    },
  },

  // ── 11. COREBRIDGE GIWL — final expense (data incomplete) ──
  {
    id: 'corebridge-giwl',
    carrier: 'Corebridge',
    product: 'GIWL',
    productType: 'final_expense',
    ageMin: 50, ageMax: 80,         // best-guess; verify
    priority: 5,
    dataIncomplete: true,
    rules: {},
  },

  // ── 12. COREBRIDGE SIWL — final expense (data incomplete) ──
  {
    id: 'corebridge-siwl',
    carrier: 'Corebridge',
    product: 'SIWL',
    productType: 'final_expense',
    ageMin: 50, ageMax: 80,         // best-guess; verify
    priority: 5,
    dataIncomplete: true,
    rules: {},
  },

  // ── 13. John Hancock Term Vitality (20-60) — term ──
  {
    id: 'jh-term-vitality',
    carrier: 'John Hancock',
    product: 'Term Vitality',
    productType: 'term',
    ageMin: 20, ageMax: 60,
    priority: 5,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'basal_or_squamous') return ACCEPT_NOTE('squamous/basal ok');
        if (l.cancer && l.cancer !== 'none') return DECLINE('cancer = decline (basal/squamous ok)');
        return null;
      },
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('COPD = decline') : null,
      heartHistory: (l) => l.heartHistory && l.heartHistory !== 'none' ? DECLINE(`heart history (${l.heartHistory})`) : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' || l.mentalHealth === 'suicide_attempt'
          ? CONDITIONAL('check meds; hospitalized <5y = decline') : null,
      marijuana: () => ACCEPT_NOTE('rec and medicinal accepted'),
      felony: (l) => l.felony && l.felony !== 'none' && l.felony !== 'over_5yr' ? DECLINE('within 5y = decline') : null,
    },
  },

  // ── 14. LGA/Banner Life QLT Term Plus (18-75) — term ──
  //    Brand name (likely): "Banner BeyondTerm"
  {
    id: 'banner-qlt-term-plus',
    carrier: 'Banner Life',
    product: 'QLT Term Plus',
    productType: 'term',
    ageMin: 18, ageMax: 75,
    priority: 1,
    brandNotes: 'Banner BeyondTerm (verify)',
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'basal_or_squamous') return ACCEPT_NOTE('basal/squamous only on this product');
        if (l.cancer && l.cancer !== 'none') return DECLINE('cancer non-basal = decline');
        return null;
      },
      diabetes: () => ACCEPT_NOTE('most favorable: oral meds + A1c<8 + no complications'),
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('COPD = decline') : null,
      heartHistory: (l) =>
        l.heartHistory === 'attack'
          ? DECLINE('heart attack <6mo = decline')
          : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'suicide_attempt' ? DECLINE('<1y from psych dx = decline')
        : l.mentalHealth === 'severe' ? CONDITIONAL('most favorable: no hosp / no anti-psychotics')
        : null,
      felony: (l) =>
        l.felony && l.felony !== 'none' && l.felony !== 'over_5yr'
          ? DECLINE('multiple/major felonies = decline') : null,
      marijuana: () => ACCEPT_NOTE('non-tobacco rates depending on frequency'),
    },
  },

  // ── 15. MOO Critical Advantage (18-89) — final expense / CI ──
  {
    id: 'moo-critical-advantage',
    carrier: 'Mutual of Omaha',
    product: 'Critical Advantage',
    productType: 'final_expense',
    ageMin: 18, ageMax: 89,
    priority: 2,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: (l) =>
        l.kidneyDisease === 'dialysis' || l.kidneyDisease === 'failure'
          ? CONDITIONAL('decline for CI; accept for heart attack/stroke/cancer policies')
          : null,
      cancer: (l) =>
        l.cancer === 'active' || l.cancer === 'remission_2yr'
          ? DECLINE('within last 10y = decline')
          : null,
      diabetes: (l) =>
        l.diabetes === 'insulin_before_45' ? DECLINE('Type 1/2 diagnosed <30 = decline')
        : null,
      copd: (l) =>
        l.copd === 'mild' || l.copd === 'severe'
          ? CONDITIONAL('decline for CI; accept for heart/stroke/cancer policies')
          : null,
      heartHistory: (l) =>
        l.heartHistory === 'attack'
          ? DECLINE('diagnosed/treated within 10y = decline')
          : null,
    },
  },

  // ── 16. MOO Term Life Express IULE (18-75) — iul ──
  {
    id: 'moo-term-life-express',
    carrier: 'Mutual of Omaha',
    product: 'Term Life Express IULE',
    productType: 'iul',
    ageMin: 18, ageMax: 75,
    priority: 2,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'basal_or_squamous') return ACCEPT_NOTE('squamous/basal ok');
        if (l.cancer && l.cancer !== 'none') return DECLINE('cancer non-basal = decline');
        return null;
      },
      diabetes: (l) =>
        l.diabetes === 'insulin_before_45' ? DECLINE('insulin before 45')
        : null,
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('COPD = decline') : null,
      heartHistory: (l) => l.heartHistory && l.heartHistory !== 'none' ? DECLINE(`heart history (${l.heartHistory})`) : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' || l.mentalHealth === 'suicide_attempt'
          ? DECLINE('hospitalized within 10y = decline') : null,
      marijuana: () => ACCEPT_NOTE('non-nicotine rates'),
    },
  },

  // ── 17. MOO Living Promise Whole Life (45-85) — final expense ──
  {
    id: 'moo-living-promise',
    carrier: 'Mutual of Omaha',
    product: 'Living Promise Whole Life',
    productType: 'final_expense',
    ageMin: 45, ageMax: 85,
    priority: 2,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'basal_or_squamous') return ACCEPT_NOTE('squamous/basal ok');
        if (l.cancer && l.cancer !== 'none') return DECLINE('cancer non-basal = decline');
        return null;
      },
      diabetes: (l) =>
        l.diabetes === 'insulin_before_45' ? CONDITIONAL('graded; complications also graded')
        : l.diabetes === 'insulin_after_45' || l.diabetes === 'oral_meds' ? ACCEPT_NOTE('45+ with meds ok')
        : null,
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? CONDITIONAL('graded tier') : null,
      heartHistory: (l) =>
        l.heartHistory === 'attack'
          ? CONDITIONAL('within 2y = graded, over 2y accept') : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' ? CONDITIONAL('over 4y = accept; within 4y = graded')
        : null,
      marijuana: () => ACCEPT_NOTE('non-nicotine rates'),
    },
  },

  // ── 18. National Life Group EIUL (18-85) — iul ──
  {
    id: 'nlg-eiul',
    carrier: 'National Life Group',
    product: 'EIUL',
    productType: 'iul',
    ageMin: 18, ageMax: 85,
    priority: 5,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) =>
        l.cancer === 'basal_or_squamous' ? ACCEPT_NOTE('basal cell usually standard')
        : null,
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? CONDITIONAL('Table 2 to decline') : null,
      heartHistory: (l) => l.heartHistory && l.heartHistory !== 'none' ? CALL('email NLG quick quotes') : null,
      mentalHealth: () => CALL('email NLG quick quotes'),
      marijuana: () => CALL('email NLG quick quotes'),
    },
  },

  // ── 19. SBLI EasyTrak (18-60) — term ──
  {
    id: 'sbli-easytrak',
    carrier: 'SBLI',
    product: 'EasyTrak Digital Term',
    productType: 'term',
    ageMin: 18, ageMax: 60,
    priority: 1,
    brandNotes: 'Quility healthy-priority pick #1',
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: KIDNEY_HARD_DECLINE,
      cancer: (l) => {
        if (l.cancer === 'active' || l.cancer === 'remission_2yr')
          return DECLINE('<10y (excluding basal/squamous) = decline');
        if (l.cancer === 'basal_or_squamous' || l.cancer === 'remission_5yr')
          return ACCEPT_NOTE('basal/squamous or 10+ yrs ok');
        return null;
      },
      diabetes: (l) =>
        l.diabetes === 'insulin_before_45' || l.diabetes === 'insulin_after_45'
          ? DECLINE('insulin OR age <40 OR A1c>7 at 40+ = decline')
          : null,
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('within 5y = decline') : null,
      heartHistory: (l) =>
        l.heartHistory === 'attack'
          ? DECLINE('diagnosed/treated within 5y = decline')
          : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' || l.mentalHealth === 'suicide_attempt'
          ? DECLINE('3+ meds or work loss <5y OR any suicide ideation = decline')
          : null,
      felony: (l) =>
        l.felony && l.felony !== 'none' && l.felony !== 'over_5yr'
          ? DECLINE('current felony charges/parole within 10y = decline')
          : null,
      marijuana: (l) =>
        l.marijuana === 'daily' ? DECLINE('>4x/wk or >16x/mo = decline')
        : null,
    },
  },

  // ── 20. TransAmerica Super / LB Term (18-80) — term (data sparse) ──
  {
    id: 'transam-super-lb-term',
    carrier: 'Transamerica',
    product: 'Super / LB Term',
    productType: 'term',
    ageMin: 18, ageMax: 80,
    priority: 5,
    dataIncomplete: true,
    rules: {},
  },

  // ── 21. TransAmerica Immediate Solutions (0-85) — final expense ──
  {
    id: 'transam-immediate-solutions',
    carrier: 'Transamerica',
    product: 'Immediate Solutions',
    productType: 'final_expense',
    ageMin: 0, ageMax: 85,
    priority: 5,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: (l) =>
        l.kidneyDisease === 'dialysis' || l.kidneyDisease === 'failure'
          ? DECLINE('kidney dialysis/failure') : null,
      cancer: (l) =>
        l.cancer === 'active' || l.cancer === 'remission_2yr' ? DECLINE('within 2y = decline')
        : l.cancer === 'basal_or_squamous' ? ACCEPT_NOTE('basal cell ok')
        : l.cancer === 'remission_5yr' ? ACCEPT_NOTE('over 2y = standard') : null,
      diabetes: () => ACCEPT_NOTE('standard; hospitalization within year = graded'),
      copd: () => ACCEPT_NOTE('standard; hospitalization within year = decline'),
      heartHistory: (l) =>
        l.heartHistory === 'attack' ? ACCEPT_NOTE('preferred; hosp within year = standard') : null,
      mentalHealth: () => ACCEPT_NOTE('preferred; hosp within year = standard'),
      felony: (l) => {
        if (l.felony === 'within_2yr') return CONDITIONAL('0-3y = decline, 3-5y = graded');
        if (l.felony === 'within_5yr') return CONDITIONAL('3-5y = graded; 5-10y = standard');
        if (l.felony === 'over_5yr') return ACCEPT_NOTE('over 10y = preferred');
        return null;
      },
      marijuana: () => ACCEPT_NOTE('non-nicotine rates'),
    },
  },

  // ── 22. TransAmerica FE Express Solution (18-85) — final expense ──
  {
    id: 'transam-fe-express',
    carrier: 'Transamerica',
    product: 'FE Express Solution',
    productType: 'final_expense',
    ageMin: 18, ageMax: 85,
    priority: 5,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: (l) =>
        l.kidneyDisease === 'dialysis' || l.kidneyDisease === 'failure'
          ? CONDITIONAL('within 12 months = graded, after = select') : null,
      cancer: (l) =>
        l.cancer === 'active' || l.cancer === 'remission_2yr'
          ? DECLINE('within 2y = decline; 2-4y = graded') : null,
      diabetes: (l) =>
        l.diabetes === 'insulin_before_45' || l.diabetes === 'insulin_after_45'
          ? CONDITIONAL('insulin + complications within 2y = select') : null,
      copd: () => CONDITIONAL('select tier'),
      heartHistory: (l) =>
        l.heartHistory === 'attack' ? CONDITIONAL('within 12 months = select') : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'suicide_attempt'
          ? CONDITIONAL('within 2y = decline; after = select')
          : null,
      felony: (l) =>
        l.felony === 'within_2yr' ? DECLINE('within 2y = decline')
        : l.felony === 'within_5yr' || l.felony === 'over_5yr' ? CONDITIONAL('after 2y = select')
        : null,
      marijuana: () => CONDITIONAL('select tier'),
    },
  },

  // ── 23. TransAmerica FFIUL II Express — iul (data incomplete) ──
  {
    id: 'transam-ffiul-ii',
    carrier: 'Transamerica',
    product: 'FFIUL II Express',
    productType: 'iul',
    ageMin: 18, ageMax: 85,         // best-guess; verify
    priority: 5,
    dataIncomplete: true,
    rules: {},
  },

  // ── 24. UHL Simple Term (20-60) — term ──
  {
    id: 'uhl-simple-term',
    carrier: 'United Home Life',
    product: 'Simple Term',
    productType: 'term',
    ageMin: 20, ageMax: 60,
    priority: 5,
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: (l) =>
        l.kidneyDisease === 'dialysis' ? DECLINE('dialysis')
        : l.kidneyDisease === 'failure' ? CONDITIONAL('GIWL')
        : null,
      cancer: (l) =>
        l.cancer === 'remission_5yr' || l.cancer === 'basal_or_squamous'
          ? ACCEPT_NOTE('over 5y ok; maintenance meds ok')
          : (l.cancer === 'active' || l.cancer === 'remission_2yr')
          ? DECLINE('within 5y or recurrence = decline') : null,
      diabetes: (l) =>
        l.diabetes === 'oral_meds' ? ACCEPT_NOTE('pills ok')
        : l.diabetes === 'insulin_after_45' || l.diabetes === 'insulin_before_45'
          ? CONDITIONAL('insulin = deluxe term tier') : null,
      copd: (l) => l.copd === 'mild' || l.copd === 'severe' ? DECLINE('COPD = decline') : null,
      heartHistory: (l) =>
        l.heartHistory === 'attack' ? ACCEPT_NOTE('over 5y ok with maintenance')
        : null,
      mentalHealth: (l) =>
        l.mentalHealth === 'severe' || l.mentalHealth === 'suicide_attempt'
          ? CONDITIONAL('deluxe term tier') : null,
      felony: (l) =>
        l.felony === 'over_5yr' ? ACCEPT_NOTE('over 10y = accept') : null,
      marijuana: (l) =>
        l.marijuana === 'medical' ? CONDITIONAL('medical card + smoker rates')
        : l.marijuana === 'recreational' ? CONDITIONAL('legal in state + smoker rates')
        : l.marijuana === 'daily' ? DECLINE('otherwise decline') : null,
    },
  },

  // ── 25. UHL Whole Life (20-80) — whole life ──
  //    Brand-name (likely): "Quility Secure Future Complete"
  {
    id: 'uhl-whole-life',
    carrier: 'United Home Life',
    product: 'Whole Life',
    productType: 'whole_life',
    ageMin: 20, ageMax: 80,
    priority: 1,
    brandNotes: 'Quility Secure Future Complete (verify)',
    rules: {
      hiv: HIV_HARD_DECLINE,
      kidneyDisease: (l) =>
        l.kidneyDisease === 'dialysis' ? DECLINE('dialysis')
        : l.kidneyDisease === 'failure' ? CONDITIONAL('GIWL — requires video/in-person')
        : null,
      cancer: (l) =>
        l.cancer === 'remission_5yr' || l.cancer === 'basal_or_squamous'
          ? ACCEPT_NOTE('over 2y = premier; maintenance ok')
          : l.cancer === 'active' || l.cancer === 'remission_2yr'
          ? DECLINE('multiple/recurrent internal cancer = decline')
          : null,
      diabetes: (l) =>
        l.diabetes === 'oral_meds' ? ACCEPT_NOTE('pills = premier')
        : l.diabetes === 'insulin_after_45' || l.diabetes === 'insulin_before_45'
          ? CONDITIONAL('insulin = deluxe tier') : null,
      copd: (l) => l.copd === 'severe' ? CONDITIONAL('EIWL as long as no oxygen') : null,
      heartHistory: (l) =>
        l.heartHistory === 'attack' ? ACCEPT_NOTE('over 2y treated = premier; over 1y = EIWL')
        : null,
      mentalHealth: () => ACCEPT_NOTE('premier'),
      felony: (l) =>
        l.felony === 'over_5yr' ? ACCEPT_NOTE('over 10y = premier') : null,
      marijuana: (l) =>
        l.marijuana === 'medical' || l.marijuana === 'recreational' ? CONDITIONAL('premier + smoker rates')
        : l.marijuana === 'daily' ? DECLINE('otherwise decline') : null,
    },
  },

  // ── 26. AIG (50-80) — final expense ──
  //    Notable: GRADED on HIV, kidney failure, kidney dialysis — only carrier
  //    that doesn't hard-decline these.
  {
    id: 'aig',
    carrier: 'AIG',
    product: 'GIWL',
    productType: 'final_expense',
    ageMin: 50, ageMax: 80,
    priority: 5,
    rules: {
      hiv: (l) => l.hiv === 'positive' ? CONDITIONAL('AIG GRADED — only carrier accepting HIV') : null,
      kidneyDisease: (l) =>
        l.kidneyDisease === 'dialysis' || l.kidneyDisease === 'failure'
          ? CONDITIONAL('AIG GRADED tier') : null,
      felony: () => ACCEPT_NOTE('accepted'),
    },
  },

  // ── 27. Foresters Live Well Plus — infinite banking (not in matrix) ──
  {
    id: 'foresters-live-well-plus',
    carrier: 'Foresters',
    product: 'Live Well Plus',
    productType: 'infinite_banking',
    ageMin: 18, ageMax: 80,
    priority: 1,
    brandNotes: 'Quility infinite-banking pick — fill rules per Foresters guide',
    dataIncomplete: true,
    rules: {
      hiv: HIV_HARD_DECLINE,
    },
  },

  // ── 28. F&G Quantum — iul (not in matrix) ──
  {
    id: 'fg-quantum',
    carrier: 'F&G',
    product: 'Quantum IUL',
    productType: 'iul',
    ageMin: 18, ageMax: 80,
    priority: 1,
    brandNotes: 'Quility IUL pick — fill rules per F&G Quantum guide',
    dataIncomplete: true,
    rules: {
      hiv: HIV_HARD_DECLINE,
    },
  },
];

// ─── Recommendation engine ────────────────────────────────────────────

/** Conservative check: lead is "healthy" only when every recorded medical
 *  field is 'none' / 'N' / undefined. Conservative because under-60 +
 *  unknown health should NOT auto-suggest term — better to under-promise. */
export function hasAnyHealthIssue(lead: LeadUnderwriting): boolean {
  const flags: (UnderwritingConditionKey)[] = [
    'cancer', 'heartHistory', 'diabetes', 'copd', 'hiv',
    'kidneyDisease', 'felony', 'dui', 'marijuana', 'mentalHealth',
  ];
  return flags.some((k) => {
    const v = lead[k];
    return v !== undefined && v !== 'none';
  });
}

/** Returns the upper age limit for a carrier given the lead's smoker
 *  status. Some carriers (e.g. Americo Eagle Select) cap smokers earlier. */
function effectiveAgeMax(p: CarrierProduct, smoker: 'Y' | 'N' | undefined): number {
  if (smoker === 'Y' && p.smokerAgeMax !== undefined) return p.smokerAgeMax;
  return p.ageMax;
}

/** Resolve which productTypes the lead is eligible for, given age + health. */
function eligibleProductTypes(lead: LeadUnderwriting): Set<ProductType> {
  const types = new Set<ProductType>(['whole_life', 'final_expense']);
  const age = lead.age;
  const healthy = !hasAnyHealthIssue(lead);
  if (age !== undefined && age >= 60) {
    // Over 60 — permanent products only.
    return types;
  }
  if (age !== undefined && age < 60 && healthy) {
    // Healthy + under 60 — full menu.
    types.add('term');
    types.add('iul');
    types.add('ul');
    types.add('infinite_banking');
  } else if (age === undefined) {
    // No age yet — show everything so the agent isn't gated on a field
    // they haven't asked about yet. Final recommendation still filters
    // by carrier age range.
    types.add('term');
    types.add('iul');
    types.add('ul');
    types.add('infinite_banking');
  }
  // Under 60 but unhealthy stays in the conservative bucket.
  return types;
}

function evaluateCarrier(p: CarrierProduct, lead: LeadUnderwriting): RankedRecommendation {
  const notes: string[] = [];
  let worstOutcome: UnderwritingOutcome = 'ACCEPT';
  const escalate = (next: UnderwritingOutcome) => {
    const order: Record<UnderwritingOutcome, number> = { ACCEPT: 0, CALL_CARRIER: 1, CONDITIONAL: 2, DECLINE: 3 };
    if (order[next] > order[worstOutcome]) worstOutcome = next;
  };
  for (const key of Object.keys(p.rules) as UnderwritingConditionKey[]) {
    const fn = p.rules[key];
    if (!fn) continue;
    const res = fn(lead);
    if (!res) continue;
    escalate(res.outcome);
    if (res.note) notes.push(res.note);
  }

  // ── Safety-net rules ──
  // For conditions that hard-decline at every fully-underwritten carrier
  // (active cancer, suicide attempt within 2y), don't fall through to
  // ACCEPT just because the matrix cell wasn't transcribed for this
  // product. Surface as CONDITIONAL so the agent verifies.
  if (lead.cancer === 'active' && !p.rules.cancer) {
    escalate('CONDITIONAL');
    notes.push('active cancer — verify with carrier');
  }
  if (lead.mentalHealth === 'suicide_attempt' && !p.rules.mentalHealth) {
    escalate('CONDITIONAL');
    notes.push('suicide attempt — verify with carrier');
  }
  if (lead.hiv === 'positive' && !p.rules.hiv) {
    escalate('CONDITIONAL');
    notes.push('HIV+ — verify with carrier');
  }
  if ((lead.kidneyDisease === 'dialysis' || lead.kidneyDisease === 'failure') && !p.rules.kidneyDisease) {
    escalate('CONDITIONAL');
    notes.push(`kidney ${lead.kidneyDisease} — verify with carrier`);
  }

  if (p.dataIncomplete && worstOutcome === 'ACCEPT') {
    // Don't claim ACCEPT for products we haven't transcribed yet.
    worstOutcome = 'CALL_CARRIER';
    notes.push('cheat-sheet incomplete — verify with carrier');
  }
  return { product: p, outcome: worstOutcome, notes };
}

export function recommendCarriers(lead: LeadUnderwriting): RankedRecommendation[] {
  const types = eligibleProductTypes(lead);
  const evaluated: RankedRecommendation[] = [];
  for (const p of CARRIER_PRODUCTS) {
    if (!types.has(p.productType)) continue;
    if (lead.age !== undefined) {
      const max = effectiveAgeMax(p, lead.smoker);
      if (lead.age < p.ageMin || lead.age > max) continue;
    }
    const r = evaluateCarrier(p, lead);
    if (r.outcome === 'DECLINE') continue;
    evaluated.push(r);
  }
  // Sort: ACCEPT first, then CONDITIONAL, then CALL_CARRIER; ties broken
  // by priority asc (1 = top).
  const order: Record<UnderwritingOutcome, number> = { ACCEPT: 0, CONDITIONAL: 1, CALL_CARRIER: 2, DECLINE: 99 };
  evaluated.sort((a, b) => {
    if (order[a.outcome] !== order[b.outcome]) return order[a.outcome] - order[b.outcome];
    return a.product.priority - b.product.priority;
  });
  return evaluated;
}

// ─── UI helper labels ────────────────────────────────────────────────

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  term: 'TERM',
  whole_life: 'WHOLE LIFE',
  ul: 'UL',
  iul: 'IUL',
  final_expense: 'FINAL EXPENSE',
  infinite_banking: 'INFINITE BANKING',
};

export const UNDERWRITING_FIELDS: Array<{
  key: UnderwritingConditionKey;
  label: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    key: 'cancer',
    label: 'Cancer history',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'basal_or_squamous', label: 'Basal/squamous only' },
      { value: 'remission_5yr', label: 'Remission 5+ yrs' },
      { value: 'remission_2yr', label: 'Remission 2–5 yrs' },
      { value: 'active', label: 'Active / recent' },
    ],
  },
  {
    key: 'heartHistory',
    label: 'Heart history',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'angina', label: 'Angina' },
      { value: 'attack', label: 'Past heart attack' },
      { value: 'bypass', label: 'Bypass' },
      { value: 'stent', label: 'Stent' },
      { value: 'afib', label: 'A-Fib' },
    ],
  },
  {
    key: 'diabetes',
    label: 'Diabetes',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'gestational', label: 'Gestational only' },
      { value: 'oral_meds', label: 'Oral meds' },
      { value: 'insulin_after_45', label: 'Insulin (started 45+)' },
      { value: 'insulin_before_45', label: 'Insulin (started under 45)' },
    ],
  },
  {
    key: 'copd',
    label: 'COPD / lung',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'mild', label: 'Mild' },
      { value: 'severe', label: 'Severe' },
    ],
  },
  {
    key: 'hiv',
    label: 'HIV',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'prep', label: 'On PrEP (negative)' },
      { value: 'positive', label: 'Positive' },
    ],
  },
  {
    key: 'kidneyDisease',
    label: 'Kidney disease',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'chronic', label: 'Chronic / stage 3-4' },
      { value: 'dialysis', label: 'Dialysis' },
      { value: 'failure', label: 'Renal failure' },
    ],
  },
  {
    key: 'felony',
    label: 'Felony history',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'over_5yr', label: 'Over 5 years ago' },
      { value: 'within_5yr', label: 'Within 5 years' },
      { value: 'within_2yr', label: 'Within 2 years' },
    ],
  },
  {
    key: 'dui',
    label: 'DUI history',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'over_5yr', label: 'Over 5 years ago' },
      { value: 'within_5yr', label: 'Within 5 years' },
      { value: 'within_2yr', label: 'Within 2 years' },
    ],
  },
  {
    key: 'marijuana',
    label: 'Marijuana use',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'recreational', label: 'Recreational' },
      { value: 'medical', label: 'Medical (with card)' },
      { value: 'daily', label: 'Daily / heavy' },
    ],
  },
  {
    key: 'mentalHealth',
    label: 'Mental health',
    options: [
      { value: '', label: 'No info' },
      { value: 'none', label: 'None' },
      { value: 'mild', label: 'Mild (1-2 meds)' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'severe', label: 'Severe (3+ meds)' },
      { value: 'suicide_attempt', label: 'Suicide attempt history' },
    ],
  },
];

/** Derive a LeadUnderwriting object from the raw lead doc fields. Used
 *  by the panel; agents edit the structured `underwriting` subdoc but we
 *  also pull age + smoker from the top-level lead fields so suggestions
 *  account for them automatically. */
export function deriveUnderwriting(args: {
  underwriting?: Partial<LeadUnderwriting>;
  dateOfBirth?: string;
  ageYears?: number;
  smokerStatus?: 'Y' | 'N';
}): LeadUnderwriting {
  const base: LeadUnderwriting = { ...(args.underwriting || {}) };
  if (args.dateOfBirth) {
    const dob = new Date(args.dateOfBirth);
    if (!Number.isNaN(dob.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      const mo = now.getMonth() - dob.getMonth();
      if (mo < 0 || (mo === 0 && now.getDate() < dob.getDate())) age -= 1;
      if (age >= 0 && age < 130) base.age = age;
    }
  }
  if (base.age === undefined && typeof args.ageYears === 'number') {
    base.age = args.ageYears;
  }
  if (args.smokerStatus) base.smoker = args.smokerStatus;
  return base;
}
