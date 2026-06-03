import type { LeadTemperature } from './lead-assessment';

/**
 * Shared visual language for lead temperature. Used by both the profile
 * meter (LeadDetailPanel) and the leads-queue dot (dashboard/leads) so the
 * colors + labels are defined once and never drift apart.
 *
 *   dot     — background for the small queue dot / fill
 *   text    — text color in the temperature's hue
 *   segment — active meter-segment background + text (profile meter)
 */
export const TEMPERATURE_UI: Record<
  LeadTemperature,
  { label: string; dot: string; text: string; segment: string }
> = {
  hot: { label: 'Hot', dot: 'bg-[#EF4444]', text: 'text-[#B91C1C]', segment: 'bg-[#EF4444] text-white' },
  warm: { label: 'Warm', dot: 'bg-[#F59E0B]', text: 'text-[#92400E]', segment: 'bg-[#F59E0B] text-white' },
  cool: { label: 'Cool', dot: 'bg-[#0EA5E9]', text: 'text-[#075985]', segment: 'bg-[#0EA5E9] text-white' },
};

/** Left-to-right order for the meter (coolest → hottest). */
export const TEMPERATURE_ORDER: LeadTemperature[] = ['cool', 'warm', 'hot'];
