/**
 * CIE lead-packet segmentation.
 *
 * Symmetry "Call-In Express" (CIE) packets are a single PDF holding many
 * leads, each rendered as a fixed multi-page template:
 *
 *   page 1  →  "You have a CUSTOMER that needs a call ASAP!" header, the
 *              B.E.S.T. phone-script boilerplate, and the TOP of the
 *              First/Last/Address/Mortgage-ID/Phone table
 *   page 2  →  the REST of the table (City/County/State/Zip, Age,
 *              Mortgage Amount, Lender) + an (often empty) "Questions Asked"
 *
 * The existing lead pipeline (web `/api/leads/upload` and the
 * `leads-batch-processor` GCF) assumes **one lead per page**. Fed a CIE
 * packet as-is, it would make a lead from each header page — missing the
 * page-2 City/STATE/Zip/Mortgage-Amount/Lender — and mark every page-2
 * "no name/phone → failed". State especially matters: it drives the
 * lead→license match.
 *
 * This module is the fix: detect the per-lead page boundaries from page
 * text (cheap, no vision call) so each lead's full page span can be handed
 * to the EXISTING extractor as one document. The locked
 * `lead-form-extractor` already classifies + extracts Symmetry "Call-In"
 * forms — we change *grouping*, never extraction.
 *
 * Design: pure functions over an array of per-page text. The caller owns
 * text extraction (the web side has `pdf-parse` / `pdfjs-dist`); the GCF
 * just consumes the resulting page-index groups. When a packet doesn't
 * look like a repeating multi-page template, segmentation falls back to
 * one-page-per-lead — byte-for-byte today's behavior — so this is safe to
 * run on every bundle, not just CIE.
 */

export type LeadPacketKind = 'symmetry-cie' | 'per-page';

export interface LeadSegmentation {
  kind: LeadPacketKind;
  /**
   * One entry per lead; each is the list of 0-based page indices that make
   * up that lead, in order. For a CIE packet a typical entry is `[0, 1]`
   * (header page + its continuation). For a non-CIE bundle every entry is a
   * single page (`[0]`, `[1]`, …) — identical to the current pipeline.
   */
  segments: number[][];
  /** 0-based indices of pages detected as a lead-start (Symmetry header). */
  headerPages: number[];
  /**
   * 0-based indices of pages that appeared BEFORE the first lead-start
   * (e.g. a cover sheet) or that couldn't be classified and were attached
   * to the preceding lead. Surfaced so the caller can log/flag rather than
   * silently swallow an off-template page.
   */
  anomalousPages: number[];
}

/**
 * Collapse a page's text to a match-friendly token stream: lowercase,
 * drop everything but a-z0-9. This is deliberately aggressive because the
 * Symmetry PDF's text layer injects spurious spaces mid-word
 * ("CUSTOM ER", "M ortgage", "First N am e"), so word-boundary matching is
 * unreliable; matching against the despaced stream is not.
 */
export function normalizeForMatch(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * True when a page is the FIRST page of a Symmetry CIE lead. The header
 * "You have a CUSTOMER that needs a call ASAP!" is the distinctive marker
 * and is stable across the packet (note: the live file reads "CUSTOMER",
 * the extractor prompt's example reads "CUSTOMER REQUEST" — we match the
 * common, invariant part). We require two independent tokens so an
 * incidental phrase on a continuation page can't trip it.
 */
export function isCieHeaderPage(pageText: string): boolean {
  const n = normalizeForMatch(pageText);
  if (!n) return false;
  const hasCustomer = n.includes('youhaveacustomer');
  const hasCallNow = n.includes('needsacall') || n.includes('callasap');
  return hasCustomer && hasCallNow;
}

/**
 * Group a packet's pages into per-lead segments from page text.
 *
 * Rule: a header page opens a new lead; every following non-header page
 * attaches to that lead until the next header. Pages before the first
 * header are recorded as anomalous and attached to the first lead (so no
 * page is dropped). If fewer than two header pages are found the packet
 * isn't a repeating CIE template — we return one-page-per-lead, which is
 * exactly the existing pipeline's behavior.
 */
export function segmentLeadPackets(pageTexts: string[]): LeadSegmentation {
  const pageCount = pageTexts.length;
  const headerPages: number[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    if (isCieHeaderPage(pageTexts[i] || '')) headerPages.push(i);
  }

  // Not a repeating multi-page template → preserve today's behavior.
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

  // Pages before the first header have no lead to belong to (a cover sheet,
  // a stray insert). Record them; they'll ride along with the first lead.
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
      // Continuation page of the current lead. A continuation that is
      // neither a recognizable page-2 nor anything we expect is still
      // attached (so its data isn't lost) but flagged for the caller.
      current.push(i);
      if (!looksLikeCieContinuation(pageTexts[i] || '')) anomalousPages.push(i);
    }
  }
  if (current) segments.push(current);

  // Fold any leading-orphan pages into the first lead's span so nothing is
  // dropped from extraction.
  if (leadingOrphans.length && segments.length) {
    segments[0] = [...leadingOrphans, ...segments[0]];
  }

  return { kind: 'symmetry-cie', segments, headerPages, anomalousPages };
}

/**
 * A weak positive check that a non-header page is a normal CIE page-2
 * (the bottom of the table). Used only to decide whether to FLAG a
 * continuation page as anomalous — never to drop it.
 */
function looksLikeCieContinuation(pageText: string): boolean {
  const n = normalizeForMatch(pageText);
  if (!n) return false;
  // The page-2 table reliably carries these labels.
  const signals = ['questionsasked', 'postalcode', 'mortgageamount', 'lendername', 'county'];
  return signals.filter((s) => n.includes(s)).length >= 2;
}

/** One page per lead — the identity grouping (current pipeline behavior). */
export function identitySegments(pageCount: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pageCount; i += 1) out.push([i]);
  return out;
}
