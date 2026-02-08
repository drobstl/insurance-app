/**
 * Feedback & Survey configuration for the Founding Member Pilot Program.
 *
 * - To add a new survey: add an entry to ACTIVE_SURVEYS below.
 * - Surveys with frequency 'weekly' auto-reset each calendar week.
 * - Surveys with frequency 'once' can only be completed once per agent.
 * - To deactivate a survey: set active: false.
 */

/* ------------------------------------------------------------------ */
/*  Question & Survey types                                            */
/* ------------------------------------------------------------------ */

export interface SurveyQuestion {
  id: string;
  /** 'rating' = 1-5 stars, 'nps' = 0-10 scale, 'multiple_choice', 'text' */
  type: 'rating' | 'nps' | 'multiple_choice' | 'text';
  text: string;
  required: boolean;
  /** For 'rating': star count (default 5). Ignored for 'nps' (always 0-10). */
  scale?: number;
  /** For 'multiple_choice' only */
  options?: string[];
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  active: boolean;
  /** 'once' = one-time survey, 'weekly' = resets each calendar week */
  frequency: 'once' | 'weekly';
}

/* ------------------------------------------------------------------ */
/*  Product Areas (for bug reports)                                    */
/* ------------------------------------------------------------------ */

export const PRODUCT_AREAS = [
  { value: 'dashboard', label: 'Agent Dashboard (Web)' },
  { value: 'client_app', label: 'Client Mobile App' },
  { value: 'general', label: 'General / Both' },
] as const;

export type ProductArea = (typeof PRODUCT_AREAS)[number]['value'];

/* ------------------------------------------------------------------ */
/*  Issue Types (for bug reports)                                      */
/* ------------------------------------------------------------------ */

export const ISSUE_TYPES = [
  { value: 'broken', label: 'Something is broken' },
  { value: 'confusing', label: 'Something is confusing' },
  { value: 'crashed', label: 'App crashed' },
  { value: 'slow', label: 'Something is slow' },
  { value: 'other', label: 'Other' },
] as const;

export type IssueType = (typeof ISSUE_TYPES)[number]['value'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Returns a period identifier for the current calendar week (e.g. "2026-W06"). */
export function getCurrentPeriodId(frequency: 'once' | 'weekly'): string {
  if (frequency === 'once') return 'once';
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor(
    (now.getTime() - jan1.getTime()) / 86_400_000,
  );
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Builds the Firestore document ID for a survey response. */
export function surveyResponseDocId(
  surveyId: string,
  periodId: string,
  agentUid: string,
): string {
  return `${surveyId}_${periodId}_${agentUid}`;
}

/* ------------------------------------------------------------------ */
/*  Active Surveys                                                     */
/* ------------------------------------------------------------------ */

export const ACTIVE_SURVEYS: Survey[] = [
  {
    id: 'founding-member-weekly',
    title: 'Weekly Check-in',
    description:
      'Help us understand your experience this week. Takes about 2 minutes.',
    active: true,
    frequency: 'weekly',
    questions: [
      {
        id: 'overall-satisfaction',
        type: 'rating',
        text: 'How satisfied are you with AgentForLife overall this week?',
        required: true,
        scale: 5,
      },
      {
        id: 'nps',
        type: 'nps',
        text: 'How likely are you to recommend AgentForLife to a fellow agent?',
        required: true,
      },
      {
        id: 'most-used-feature',
        type: 'multiple_choice',
        text: 'Which feature did you use the most this week?',
        required: true,
        options: [
          'Client Management',
          'Policy Tracking',
          'Client Mobile App & Codes',
          'Referral System',
          "I didn't use it much this week",
        ],
      },
      {
        id: 'dashboard-experience',
        type: 'rating',
        text: 'How would you rate the dashboard experience?',
        required: true,
        scale: 5,
      },
      {
        id: 'client-app-experience',
        type: 'rating',
        text: 'How would you rate the client mobile app experience?',
        required: true,
        scale: 5,
      },
      {
        id: 'biggest-frustration',
        type: 'text',
        text: 'What was your biggest frustration this week?',
        required: false,
      },
      {
        id: 'one-wish',
        type: 'text',
        text: 'If you could change one thing about AgentForLife, what would it be?',
        required: false,
      },
    ],
  },
];
