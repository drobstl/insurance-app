/**
 * Feedback configuration for the Founding Member Pilot Program.
 * Update WEEKLY_QUESTION each week to rotate the pulse question.
 */

export const WEEKLY_QUESTION =
  "What's the ONE thing that would make you open AgentForLife every morning?";

export const ISSUE_TYPES = [
  { value: 'broken', label: 'Something is broken' },
  { value: 'confusing', label: 'Something is confusing' },
  { value: 'crashed', label: 'App crashed' },
  { value: 'other', label: 'Other' },
] as const;

export type IssueType = (typeof ISSUE_TYPES)[number]['value'];
