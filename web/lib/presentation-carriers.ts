/**
 * Curated catalog of A- / A+ rated life carriers an agent can surface on
 * the "carriers I shop" strip of the lead presentation (Rapport slide).
 *
 * The point of the strip is positioning, not a comprehensive directory:
 * it shows the client there's real choice (and that the agent is an
 * independent field underwriter, not a captive of any one company). The
 * agent ticks the carriers they actually work with in Settings; if they
 * tick none, a sensible default set is shown so the slide is never empty.
 *
 * `logo` is optional — until brand assets are added under /public the UI
 * renders a clean wordmark, which reads fine on a logo wall.
 */
export interface PresentationCarrier {
  id: string;
  name: string;
  /** Optional path to a logo asset in /public (e.g. "/carriers/americo.svg"). */
  logo?: string;
}

export const PRESENTATION_CARRIERS: PresentationCarrier[] = [
  { id: 'mutual-of-omaha', name: 'Mutual of Omaha' },
  { id: 'americo', name: 'Americo' },
  { id: 'foresters', name: 'Foresters Financial' },
  { id: 'transamerica', name: 'Transamerica' },
  { id: 'mutual-trust', name: 'Mutual Trust Life' },
  { id: 'protective', name: 'Protective' },
  { id: 'banner', name: 'Banner Life' },
  { id: 'john-hancock', name: 'John Hancock' },
  { id: 'corebridge', name: 'Corebridge Financial' },
  { id: 'fg', name: 'F&G' },
  { id: 'american-amicable', name: 'American Amicable' },
  { id: 'royal-neighbors', name: 'Royal Neighbors' },
  { id: 'gerber', name: 'Gerber Life' },
  { id: 'sbli', name: 'SBLI' },
  { id: 'assurity', name: 'Assurity' },
  { id: 'national-life', name: 'National Life Group' },
  { id: 'gtl', name: 'GTL' },
  { id: 'ameritas', name: 'Ameritas' },
  { id: 'columbus-life', name: 'Columbus Life' },
  { id: 'lincoln', name: 'Lincoln Financial' },
  { id: 'prudential', name: 'Prudential' },
  { id: 'pacific-life', name: 'Pacific Life' },
  { id: 'north-american', name: 'North American' },
  { id: 'sagicor', name: 'Sagicor' },
  { id: 'united-home-life', name: 'United Home Life' },
  { id: 'liberty-bankers', name: 'Liberty Bankers Life' },
  { id: 'cincinnati-life', name: 'Cincinnati Life' },
  { id: 'aetna', name: 'Aetna' },
  { id: 'ethos', name: 'Ethos' },
  { id: 'occidental', name: 'Occidental Life' },
  { id: 'american-general', name: 'American General' },
  { id: 'kansas-city-life', name: 'Kansas City Life' },
];

/** Shown when the agent hasn't picked any carriers yet. */
export const DEFAULT_PRESENTATION_CARRIER_IDS: string[] = [
  'mutual-of-omaha',
  'americo',
  'foresters',
  'transamerica',
  'protective',
  'banner',
  'john-hancock',
  'corebridge',
];

const BY_ID: Record<string, PresentationCarrier> = Object.fromEntries(
  PRESENTATION_CARRIERS.map((c) => [c.id, c]),
);

/**
 * Resolve stored carrier ids to catalog entries, preserving order and
 * dropping anything unknown. Falls back to the default set when empty.
 */
export function carriersFromIds(ids?: string[]): PresentationCarrier[] {
  const source = ids && ids.length > 0 ? ids : DEFAULT_PRESENTATION_CARRIER_IDS;
  return source.map((id) => BY_ID[id]).filter((c): c is PresentationCarrier => Boolean(c));
}
