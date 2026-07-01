/**
 * Lead-credit chip — flags a lead the agent can claim a lead credit for.
 *
 * Symmetry issues a lead credit for leads aged 80 or older, so we surface an
 * automatic, data-driven chip the moment a lead's extracted age clears the
 * threshold. The agent doesn't have to remember the rule or eyeball ages — the
 * flag tells them this lead is worth a credit request.
 *
 * Used by:
 *   - `web/app/dashboard/leads/page.tsx` (chip on each lead row, alongside the
 *     temperature / tag / outcome chips)
 *   - `web/components/LeadDetailPanel.tsx` (chip in the lead header + an
 *     actionable note telling the agent to request the credit)
 *
 * Mirrors the computed-chip pattern in `appointment-outcome-chip.ts`.
 */

import { ageFromDob } from './household';

/** Symmetry issues a lead credit at this age and above. */
export const LEAD_CREDIT_MIN_AGE = 80;

/**
 * True when the lead's age clears the credit threshold. Prefers the extracted
 * `ageYears` (call-in / digital forms list AGE) and falls back to deriving age
 * from `dateOfBirth` (mail-in forms list a DOB) so a DOB-only lead still flags.
 * Returns false when we have neither — we never guess; the chip only appears
 * when there's an age we can stand behind.
 */
export function isLeadCreditEligible(
  ageYears: number | null | undefined,
  dateOfBirth?: string | null,
): boolean {
  const age =
    typeof ageYears === 'number' ? ageYears : ageFromDob(dateOfBirth ?? undefined);
  return typeof age === 'number' && age >= LEAD_CREDIT_MIN_AGE;
}

/**
 * Label + Tailwind classes for the chip. Warm amber reads as an opportunity
 * (money back), and the explicit "80+" in the label keeps it distinct from the
 * gold "Thinking" outcome chip even where the two co-occur.
 */
export function getLeadCreditChip(): { label: string; classes: string } {
  return {
    label: `Lead credit · ${LEAD_CREDIT_MIN_AGE}+`,
    classes: 'bg-[#FDEBD0] text-[#9A5B00] border border-[#E08A00]/45',
  };
}

/** Tooltip / note copy — tells the agent exactly what to do with the flag. */
export const LEAD_CREDIT_NOTE =
  'This lead is 80 or older — request a lead credit through Symmetry.';
