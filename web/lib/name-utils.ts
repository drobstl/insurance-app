/**
 * Name parsing utilities.
 *
 * The PDF application extraction pipeline frequently returns an
 * insured name in `Last, First Middle` format because that's how the
 * carrier prints it on the application. The dashboard stores the name
 * verbatim. Personalized greeting code (welcome SMS, queue card title,
 * holiday/birthday/anniversary copy) needs the FIRST NAME, not the
 * raw first whitespace token — otherwise `Hey Millington,!` happens.
 */

/**
 * Extract a first name suitable for personalized greetings.
 * Handles:
 *   - "First [Middle] Last [Suffix]" → "First"
 *   - "Last, First [Middle] [Suffix]" → "First"
 *   - "Last, First, Jr." → "First"
 *   - "" / whitespace-only → ""
 *
 * Pathological inputs (lone commas, comma-separated suffix-only) fall
 * back to the first space token of the original, with trailing
 * punctuation stripped.
 */
export function extractFirstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return '';
  let candidate: string;
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx >= 0) {
    const afterComma = trimmed.slice(commaIdx + 1).trim();
    candidate = afterComma.split(/\s+/)[0] ?? '';
    if (!candidate) {
      // Comma but nothing usable after — fall back to the part before.
      candidate = trimmed.slice(0, commaIdx).split(/\s+/)[0] ?? '';
    }
  } else {
    candidate = trimmed.split(/\s+/)[0] ?? '';
  }
  return candidate.replace(/[,.;:!?\s]+$/, '').trim();
}

/**
 * Format a stored client name for human-readable display. Insurance
 * application PDFs commonly persist names as `Last, First [Middle] [Suffix]`
 * (carrier convention). The dashboard stores the extracted name verbatim;
 * UI render sites (client list, profile header) call this helper to flip
 * comma-separated names back to natural `First [Middle] [Suffix] Last`
 * order. Names without a comma pass through unchanged.
 *
 *   - "Last, First [Middle]" → "First [Middle] Last"
 *   - "Last, First, Jr."     → "First Jr. Last"  (multi-comma collapse)
 *   - "First Last"           → "First Last"
 *   - "" / whitespace-only   → ""
 */
export function formatClientDisplayName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return '';
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx < 0) return trimmed;
  const last = trimmed.slice(0, commaIdx).trim();
  const rest = trimmed.slice(commaIdx + 1).trim();
  if (!last || !rest) return trimmed;
  // Collapse any further commas inside `rest` (e.g. ", Jr.") to spaces,
  // then squash double-whitespace and append the surname.
  const restFlattened = rest.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return `${restFlattened} ${last}`.trim();
}
