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
