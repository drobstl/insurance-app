import type { LeadTemperature } from '../lib/lead-assessment';
import { TEMPERATURE_UI } from '../lib/lead-temperature-ui';

/**
 * The single lead-temperature token, used everywhere a temperature shows —
 * the profile header, the leads list, and the call queue — so the look stays
 * consistent. A small colored pill: dot + Hot / Warm / Cool.
 */
export function LeadTempChip({
  temperature,
  className = '',
}: {
  temperature: LeadTemperature;
  className?: string;
}) {
  const t = TEMPERATURE_UI[temperature];
  return (
    <span
      className={`inline-flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide ${t.chipBg} ${t.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
      {t.label}
    </span>
  );
}
