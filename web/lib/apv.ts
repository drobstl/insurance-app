/**
 * Annual Premium Value (APV) computation.
 *
 * Converts a premium amount + payment frequency into a yearly figure.
 * When frequency is unknown, defaults to monthly (the most common
 * storage convention in conservation alerts and policy reviews).
 */

const MULTIPLIERS: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  'semi-annual': 2,
  annual: 1,
};

export function computeAPV(
  premiumAmount: number | null | undefined,
  premiumFrequency?: string | null,
): number {
  if (!premiumAmount || premiumAmount <= 0) return 0;
  const multiplier = MULTIPLIERS[premiumFrequency || 'monthly'] ?? 12;
  return premiumAmount * multiplier;
}
