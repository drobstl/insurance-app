/**
 * Lead pre-appointment assessment — questions, scoring, and the derived
 * "lead temperature." Shared by the mobile content manifest, the submit
 * handler, and the dashboard so all three agree on one definition.
 *
 * Design (agreed 2026-06):
 * - The headline `temperature` (hot/warm/cool) is an OPPORTUNITY read built
 *   purely from answer content — how strong/closeable the appointment is —
 *   NOT a show-rate predictor. Engagement/behavior (downloaded the app,
 *   completed the assessment) is a separate signal and stays separate.
 * - Scoring metadata rides on the question definitions: per-question polarity
 *   + weight live in one place, and future per-agent custom questions that
 *   carry the same metadata score automatically (ones that don't contribute 0).
 * - The result is stored as structured fields on the lead so the leads list
 *   can sort/filter and a future natural-language query layer can answer from
 *   real fields instead of re-parsing text.
 */

export type AssessmentDimension = 'urgency' | 'need' | 'intent';

export interface AssessmentChoice {
  id: string;
  label: string;
  /** Points this answer contributes to its question's dimension. */
  points: number;
}

export interface AssessmentQuestion {
  id: string;
  dimension: AssessmentDimension;
  prompt: string;
  choices: AssessmentChoice[];
}

export type LeadTemperature = 'hot' | 'warm' | 'cool';

export interface LeadScore {
  /** Bump when weights/thresholds change so stored scores can be re-derived. */
  version: number;
  temperature: LeadTemperature;
  total: number;
  dimensions: Record<AssessmentDimension, number>;
  /** One-line, agent-facing read of the answers. */
  summary: string;
}

export const SCORE_VERSION = 1;

export const TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cool: 'Cool',
};

const HOT_THRESHOLD = 7;
const WARM_THRESHOLD = 4;

/** Yes / No / Not sure with the agreed weights baked into each choice. */
function yesNoNotSure(yes: number, no: number, notSure: number): AssessmentChoice[] {
  return [
    { id: 'yes', label: 'Yes', points: yes },
    { id: 'no', label: 'No', points: no },
    { id: 'not_sure', label: 'Not sure', points: notSure },
  ];
}

export const DEFAULT_ASSESSMENT: AssessmentQuestion[] = [
  {
    id: 'q1',
    dimension: 'intent',
    prompt: "Would you say you're the kind of person who plans ahead for things most people don't want to think about?",
    choices: yesNoNotSure(1, 0, 0),
  },
  {
    id: 'q2',
    dimension: 'urgency',
    prompt: 'Has something recently changed that got you looking into this now?',
    choices: yesNoNotSure(2, 0, 0),
  },
  {
    id: 'q3',
    dimension: 'need',
    prompt: "If you weren't here tomorrow, would your family be able to keep the home without you?",
    choices: yesNoNotSure(0, 2, 1),
  },
  {
    id: 'q4',
    dimension: 'need',
    prompt: "Have you ever sat down and really thought through what your family's financial life looks like without you?",
    choices: yesNoNotSure(0, 1, 1),
  },
  {
    id: 'q5',
    dimension: 'need',
    prompt: 'If you had to write down today what your family would actually receive financially if something happened to you, could you do it without looking?',
    choices: yesNoNotSure(0, 1, 1),
  },
  {
    id: 'q6',
    dimension: 'need',
    prompt: 'Are you confident your current setup still fits where your family is today?',
    choices: yesNoNotSure(0, 2, 1),
  },
  {
    id: 'q7',
    dimension: 'intent',
    prompt: 'Are you willing to walk away from our conversation with a clear plan you commit to follow?',
    choices: yesNoNotSure(2, 0, 0),
  },
];

/** Max attainable points per dimension — derived so it can't drift from the weights. */
export const DIMENSION_MAX: Record<AssessmentDimension, number> = DEFAULT_ASSESSMENT.reduce(
  (acc, q) => {
    acc[q.dimension] += Math.max(0, ...q.choices.map((c) => c.points));
    return acc;
  },
  { urgency: 0, need: 0, intent: 0 } as Record<AssessmentDimension, number>,
);

function temperatureFor(total: number): LeadTemperature {
  if (total >= HOT_THRESHOLD) return 'hot';
  if (total >= WARM_THRESHOLD) return 'warm';
  return 'cool';
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Build the one-line agent-facing summary from the raw answers. Coupled to
 * the known default question ids (q2 = trigger, q3 = home, q7 = commitment);
 * custom questions fall back to generic gap phrasing.
 */
function buildSummary(
  answers: Record<string, string>,
  dimensions: Record<AssessmentDimension, number>,
  total: number,
): string {
  const positives: string[] = [];

  if (dimensions.urgency > 0) positives.push('recent trigger');

  const q3 = answers.q3;
  if (q3 === 'no' || q3 === 'not_sure') positives.push('home exposed');
  else if (dimensions.need >= 3) positives.push('big coverage gap');
  else if (dimensions.need >= 1) positives.push('some coverage gaps');

  if (answers.q7 === 'yes') positives.push('ready to commit');

  const caveats: string[] = [];
  if (total >= WARM_THRESHOLD) {
    if (dimensions.urgency === 0) caveats.push('no urgency');
    if (answers.q7 !== 'yes') caveats.push('noncommittal');
  }

  if (positives.length === 0 && caveats.length === 0) {
    return 'Well-covered, no trigger — likely a review at best.';
  }

  const head = positives.length ? positives.join(', ') : 'Coverage looks set';
  const tail = caveats.length ? `, but ${caveats.join(' and ')}` : '';
  return `${capitalize(`${head}${tail}`)}.`;
}

/**
 * Score a completed assessment. Pure + side-effect-free. Unknown answer ids
 * or questions missing scoring metadata simply contribute 0.
 */
export function scoreAssessment(
  questions: AssessmentQuestion[],
  answers: Record<string, string>,
): LeadScore {
  const dimensions: Record<AssessmentDimension, number> = { urgency: 0, need: 0, intent: 0 };

  for (const q of questions) {
    if (!q || !q.dimension || !(q.dimension in dimensions)) continue;
    const chosen = (q.choices || []).find((c) => c.id === answers[q.id]);
    const pts = typeof chosen?.points === 'number' ? chosen.points : 0;
    dimensions[q.dimension] += pts;
  }

  const total = dimensions.urgency + dimensions.need + dimensions.intent;

  return {
    version: SCORE_VERSION,
    temperature: temperatureFor(total),
    total,
    dimensions,
    summary: buildSummary(answers, dimensions, total),
  };
}
