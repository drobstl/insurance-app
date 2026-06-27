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
  'United Home Life': { name: 'United Home Life', servicePhone: '1-800-428-3001' }, // UHL Life Contact Center (verified 2026-06)
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
 * Display-name aliases for carriers whose legal name is long or differs
 * from how agents refer to them. Maps a normalized (lowercased, trimmed)
 * legal/extracted name to the short label shown in the UI. Extend as new
 * full names surface from carrier applications / BOB imports.
 */
const CARRIER_DISPLAY_ALIASES: Record<string, string> = {
  'american general life insurance company': 'Corebridge/AIG',
  'american general': 'Corebridge/AIG',
  'american-amicable life insurance company of texas': 'American Amicable',
  'american amicable life insurance company of texas': 'American Amicable',
};

/**
 * Normalize a stored carrier name to its preferred short display label.
 * Returns the original (trimmed) name when no alias is known, and passes
 * null/empty through unchanged.
 */
export function carrierDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return raw ?? null;
  const trimmed = raw.trim();
  return CARRIER_DISPLAY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Carriers are sometimes stored under a short or legal-name variant. Map the
 * common ones to a canonical CARRIER_CONFIG key so phone lookup still resolves.
 * Extend as new variants surface from applications / BOB imports.
 */
const CARRIER_PHONE_ALIASES: Record<string, string> = {
  'uhl': 'United Home Life',
  'united home life insurance company': 'United Home Life',
  'mutual of omaha insurance company': 'Mutual of Omaha',
  'transamerica life insurance company': 'Transamerica',
};

/**
 * Look up a carrier's service phone number. Resolution order: exact key,
 * explicit alias, exact name, then an UNAMBIGUOUS partial match. When a name
 * matches more than one carrier we return null and log — better to send no
 * number than the wrong one (the old code returned the first partial hit,
 * which could silently map "American ..." to the wrong carrier).
 */
export function getCarrierServicePhone(carrier: string): string | null {
  if (!carrier) return null;
  const raw = carrier.trim();
  if (!raw) return null;

  // 1) Exact key.
  if (CARRIER_CONFIG[raw]) return CARRIER_CONFIG[raw].servicePhone;
  const lower = raw.toLowerCase();

  // 2) Explicit alias → canonical key.
  const aliasKey = CARRIER_PHONE_ALIASES[lower];
  if (aliasKey && CARRIER_CONFIG[aliasKey]) return CARRIER_CONFIG[aliasKey].servicePhone;

  // 3) Exact match on key or display name, case-insensitive.
  for (const [key, info] of Object.entries(CARRIER_CONFIG)) {
    if (key.toLowerCase() === lower || info.name.toLowerCase() === lower) {
      return info.servicePhone;
    }
  }

  // 4) Bidirectional substring — only when EXACTLY one carrier matches.
  const partial = Object.entries(CARRIER_CONFIG).filter(
    ([key]) => lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower),
  );
  if (partial.length === 1) return partial[0][1].servicePhone;
  if (partial.length > 1) {
    console.warn(
      `getCarrierServicePhone: "${carrier}" ambiguously matched ${partial.length} carriers ` +
        `(${partial.map(([k]) => k).join(', ')}); returning null to avoid a wrong number.`,
    );
  }
  return null;
}

/**
 * Phone-number-ish pattern (US): optional +1/1, then 3-3-4 with the usual
 * separators. Deliberately conservative — it won't match coverage amounts
 * ($500,000), premiums ($45), years, or ZIP+4 — so a match can be safely
 * rewritten to the verified carrier number.
 */
const US_PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

/** Last 10 digits of a phone string (drops a leading US country code). */
function phoneDigits10(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/**
 * Guarantees the EXACT carrier service number in an outbound conservation
 * message — never one the language model typed from memory. LLMs transpose
 * digits, which already sent a wrong United Home Life number to a real client.
 * This deterministic pass is the source of truth:
 *   • every phone-like token (except `preservePhones`, e.g. the agent's own
 *     number in an email sign-off) is rewritten to the canonical number;
 *   • if no number is present, a warm contact line is appended;
 *   • if we have NO verified number for the carrier, any model-invented number
 *     is stripped so a fabricated number never goes out.
 */
export function enforceCarrierContactPhone(params: {
  message: string;
  carrier?: string | null;
  carrierServicePhone?: string | null;
  preservePhones?: Array<string | null | undefined>;
}): string {
  const message = (params.message || '').trim();
  if (!message) return message;

  const preserve = new Set(
    (params.preservePhones ?? [])
      .filter((p): p is string => Boolean(p && p.trim()))
      .map(phoneDigits10),
  );
  const carrierPhone = params.carrierServicePhone?.trim() || '';

  if (!carrierPhone) {
    // No verified number — never let a model-invented number through.
    const stripped = message.replace(US_PHONE_RE, (m) =>
      preserve.has(phoneDigits10(m)) ? m : '',
    );
    return stripped.replace(/\s+([.,!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
  }

  // Rewrite any non-preserved phone-like token to the canonical number.
  let out = message.replace(US_PHONE_RE, (m) =>
    preserve.has(phoneDigits10(m)) ? m : carrierPhone,
  );

  // Ensure the number is present at least once.
  if (!out.includes(carrierPhone)) {
    const name = params.carrier?.trim();
    const who = name
      ? `You can reach ${name} at ${carrierPhone}`
      : `You can reach your carrier at ${carrierPhone}`;
    out = `${out} ${who} to get this back on track.`;
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}
