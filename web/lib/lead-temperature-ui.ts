import type { LeadTemperature } from './lead-assessment';

/**
 * Shared visual language for lead temperature. Drives the single LeadTempChip
 * token used across the profile header, the leads list, and the call queue,
 * so the colors + labels are defined once and never drift apart.
 *
 *   dot     — colored dot inside the chip
 *   text    — text color in the temperature's hue
 *   chipBg  — light pill background for the chip
 *   bar     — border color for the accent bar on the profile summary line
 *   segment — active segment bg (reserved; legacy meter)
 */
export const TEMPERATURE_UI: Record<
  LeadTemperature,
  { label: string; dot: string; text: string; chipBg: string; bar: string; segment: string }
> = {
  hot: { label: 'Hot', dot: 'bg-[#EF4444]', text: 'text-[#B91C1C]', chipBg: 'bg-[#FEE2E2]', bar: 'border-[#EF4444]', segment: 'bg-[#EF4444] text-white' },
  warm: { label: 'Warm', dot: 'bg-[#F59E0B]', text: 'text-[#92400E]', chipBg: 'bg-[#FEF3C7]', bar: 'border-[#F59E0B]', segment: 'bg-[#F59E0B] text-white' },
  cool: { label: 'Cool', dot: 'bg-[#0EA5E9]', text: 'text-[#075985]', chipBg: 'bg-[#E0F2FE]', bar: 'border-[#0EA5E9]', segment: 'bg-[#0EA5E9] text-white' },
};

/** Left-to-right order for the meter (coolest → hottest). */
export const TEMPERATURE_ORDER: LeadTemperature[] = ['cool', 'warm', 'hot'];
