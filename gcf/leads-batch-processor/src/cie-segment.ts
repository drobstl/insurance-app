/**
 * CIE lead-packet segmentation (pure). Mirror of the web tier's
 * `web/lib/cie-lead-segment.ts` so the GCF can group a Symmetry CIE packet's
 * pages itself when the web tier didn't supply (or couldn't compute) the
 * groupings. Pure functions over per-page text — no I/O, no deps.
 *
 * A Symmetry "Call-In Express" packet is one PDF holding many leads, each a
 * fixed multi-page template: page 1 = "You have a CUSTOMER that needs a call
 * ASAP!" header + the top of the table; page 2 = City/County/State/Zip,
 * Mortgage Amount, Lender. Grouping each lead's pages lets the existing
 * extractor see the whole lead. Non-CIE bundles fall back to one-page-per-lead.
 */

export type LeadPacketKind = 'symmetry-cie' | 'per-page';

export interface LeadSegmentation {
  kind: LeadPacketKind;
  segments: number[][];
  headerPages: number[];
  anomalousPages: number[];
}

/** Lowercase + drop everything but a-z0-9 (the PDF text layer injects spurious
 * spaces mid-word: "CUSTOM ER", "M ortgage"), so match the despaced stream. */
export function normalizeForMatch(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when a page is the FIRST page of a Symmetry CIE lead. */
export function isCieHeaderPage(pageText: string): boolean {
  const n = normalizeForMatch(pageText);
  if (!n) return false;
  const hasCustomer = n.includes('youhaveacustomer');
  const hasCallNow = n.includes('needsacall') || n.includes('callasap');
  return hasCustomer && hasCallNow;
}

/** Group a packet's pages into per-lead segments from page text. */
export function segmentLeadPackets(pageTexts: string[]): LeadSegmentation {
  const pageCount = pageTexts.length;
  const headerPages: number[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    if (isCieHeaderPage(pageTexts[i] || '')) headerPages.push(i);
  }

  if (headerPages.length < 2) {
    return {
      kind: 'per-page',
      segments: identitySegments(pageCount),
      headerPages,
      anomalousPages: [],
    };
  }

  const headerSet = new Set(headerPages);
  const segments: number[][] = [];
  const anomalousPages: number[] = [];

  const firstHeader = headerPages[0];
  const leadingOrphans: number[] = [];
  for (let i = 0; i < firstHeader; i += 1) {
    leadingOrphans.push(i);
    anomalousPages.push(i);
  }

  let current: number[] | null = null;
  for (let i = 0; i < pageCount; i += 1) {
    if (headerSet.has(i)) {
      if (current) segments.push(current);
      current = [i];
    } else if (current) {
      current.push(i);
      if (!looksLikeCieContinuation(pageTexts[i] || '')) anomalousPages.push(i);
    }
  }
  if (current) segments.push(current);

  if (leadingOrphans.length && segments.length) {
    segments[0] = [...leadingOrphans, ...segments[0]];
  }

  return { kind: 'symmetry-cie', segments, headerPages, anomalousPages };
}

function looksLikeCieContinuation(pageText: string): boolean {
  const n = normalizeForMatch(pageText);
  if (!n) return false;
  const signals = ['questionsasked', 'postalcode', 'mortgageamount', 'lendername', 'county'];
  return signals.filter((s) => n.includes(s)).length >= 2;
}

/** One page per lead — the identity grouping (current pipeline behavior). */
export function identitySegments(pageCount: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pageCount; i += 1) out.push([i]);
  return out;
}
