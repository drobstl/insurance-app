/**
 * Post-appointment outcome chip — shared label + Tailwind class vocabulary.
 *
 * Used by:
 *   - `web/app/dashboard/leads/page.tsx` (chip on each lead row when there's
 *     no upcoming appointment but the most recent past appointment has a
 *     terminal outcome)
 *   - `web/components/LeadDetailPanel.tsx` (chip in the lead header next to
 *     "Converted to client" / form-type chips)
 *
 * Excludes `scheduled` (covered by the live "Booked" chip) and `completed`
 * (covered by the "Converted to client" chip, since completed = sale path).
 */

import type { AppointmentStatus } from './appointments';

export type AppointmentOutcomeChipStatus =
  | 'sit_no_sale'
  | 'sit_think_about_it'
  | 'no_show'
  | 'cancelled';

export const APPOINTMENT_OUTCOME_CHIP_STATUSES: readonly AppointmentOutcomeChipStatus[] = [
  'sit_no_sale',
  'sit_think_about_it',
  'no_show',
  'cancelled',
] as const;

export function isAppointmentOutcomeChipStatus(
  s: AppointmentStatus | string | null | undefined,
): s is AppointmentOutcomeChipStatus {
  return (
    s === 'sit_no_sale' ||
    s === 'sit_think_about_it' ||
    s === 'no_show' ||
    s === 'cancelled'
  );
}

/**
 * Returns label + Tailwind classes for the chip. Colors are deliberately
 * softer than the action-button palette in AppointmentOutcomeActionItemCard
 * — chips are informational, not interactive, and shouldn't compete with
 * the soft-teal "Booked" chip rendered alongside them.
 *
 * The gold treatment on `sit_think_about_it` is intentional: a "thinking
 * about it" lead is the highest-value warm follow-up, so it gets the most
 * visually prominent of the four soft palettes.
 */
export function getAppointmentOutcomeChip(
  status: AppointmentOutcomeChipStatus,
  scheduledAt: Date,
): { label: string; classes: string } {
  const date = formatShortDate(scheduledAt);
  switch (status) {
    case 'sit_think_about_it':
      return {
        label: `Thinking · ${date}`,
        classes: 'bg-[#FFF4D6] text-[#92500D] border border-[#F0B100]/50',
      };
    case 'sit_no_sale':
      return {
        label: `No sale · ${date}`,
        classes: 'bg-[#E0F0FF] text-[#0079CC] border border-[#0099FF]/30',
      };
    case 'no_show':
      return {
        label: `No-show · ${date}`,
        classes: 'bg-[#FFE4E1] text-[#A0382A] border border-[#FF6B5C]/30',
      };
    case 'cancelled':
      return {
        label: `Cancelled · ${date}`,
        classes: 'bg-gray-100 text-gray-700 border border-gray-300',
      };
  }
}

function formatShortDate(d: Date): string {
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * FIF reset chip — rendered ALONGSIDE the primary outcome chip, since a
 * booked reset is orthogonal to the sale result (a lead can be both
 * "thinking about it" AND booked for a reset). Deliberately emerald
 * rather than the gold `sit_think_about_it` treatment so two high-value
 * chips never blur together when they co-occur; emerald also reads as a
 * forward-looking "booked" win. Shows the SME name when we captured one
 * ("FIF reset · Jane"), otherwise bare ("FIF reset").
 */
export function getFifResetChip(
  smeName?: string | null,
): { label: string; classes: string } {
  const who = (smeName ?? '').trim();
  return {
    label: who ? `FIF reset · ${who}` : 'FIF reset',
    classes: 'bg-[#E7F7EF] text-[#0B7A4B] border border-[#12B76A]/40',
  };
}
