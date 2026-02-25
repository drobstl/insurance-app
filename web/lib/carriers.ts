export interface CarrierInfo {
  name: string;
  servicePhone: string;
}

/**
 * Carrier customer service phone numbers for policyholder inquiries.
 * Used in conservation outreach so clients know who to call to reinstate.
 */
export const CARRIER_CONFIG: Record<string, CarrierInfo> = {
  'Americo': { name: 'Americo', servicePhone: '1-800-231-0801' },
  'Mutual of Omaha': { name: 'Mutual of Omaha', servicePhone: '1-800-775-6000' },
  'American-Amicable': { name: 'American-Amicable', servicePhone: '1-800-736-7311' },
  'Banner': { name: 'Banner Life', servicePhone: '1-800-638-8428' },
  'United Home Life': { name: 'United Home Life', servicePhone: '1-800-736-6177' },
  'SBLI': { name: 'SBLI', servicePhone: '1-888-724-5725' },
  'Corebridge': { name: 'Corebridge Financial', servicePhone: '1-800-448-2542' },
  'AIG': { name: 'AIG', servicePhone: '1-800-888-2452' },
  'Transamerica': { name: 'Transamerica', servicePhone: '1-800-797-2643' },
  'F&G': { name: 'F&G Annuities & Life', servicePhone: '1-888-513-8797' },
  'Foresters': { name: 'Foresters Financial', servicePhone: '1-800-828-1540' },
  'National Life Group': { name: 'National Life Group', servicePhone: '1-800-732-8939' },
  'Lincoln Financial': { name: 'Lincoln Financial', servicePhone: '1-800-454-6265' },
  'Nationwide': { name: 'Nationwide', servicePhone: '1-877-669-6877' },
  'Prudential': { name: 'Prudential', servicePhone: '1-800-778-2255' },
  'Protective': { name: 'Protective Life', servicePhone: '1-800-866-3555' },
  'North American': { name: 'North American', servicePhone: '1-800-800-3656' },
  'Athene': { name: 'Athene', servicePhone: '1-800-435-3520' },
};

export const KNOWN_CARRIER_NAMES = Object.keys(CARRIER_CONFIG);

/**
 * Look up a carrier's service phone number. Tries exact match first,
 * then partial/case-insensitive match.
 */
export function getCarrierServicePhone(carrier: string): string | null {
  if (!carrier) return null;

  const direct = CARRIER_CONFIG[carrier];
  if (direct) return direct.servicePhone;

  const lower = carrier.toLowerCase();
  for (const [key, info] of Object.entries(CARRIER_CONFIG)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return info.servicePhone;
    }
  }
  return null;
}
