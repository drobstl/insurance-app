import { PDFDocument } from 'pdf-lib';
import { APPLICATION_PAGE_MAP } from './application-page-map';

export const BULK_UNKNOWN_MAX_PAGES = 6;

type RoutingConfidence = 'high' | 'low';

export interface BulkPdfRouteDecision {
  carrierFormType: string;
  confidence: RoutingConfidence;
  selectedPages: number[];
  broaderMappedPages: number[];
}

const FORM_TYPE_DETECTION_RULES: Array<{ formType: string; pattern: RegExp }> = [
  { formType: 'americo_icc18_5160', pattern: /(icc18[^a-z0-9]*5160|americo.*(term|cbo))/i },
  { formType: 'americo_icc18_5160_iul', pattern: /(icc18[^a-z0-9]*5160.*iul|americo.*iul)/i },
  { formType: 'americo_icc24_5426', pattern: /(icc24[^a-z0-9]*5426|americo.*whole[\s-]*life|eagle[\s-]*select)/i },
  { formType: 'amam_icc15_aa9466', pattern: /(icc15[^a-z0-9]*aa9466|american[-\s]?amicable.*mortgage|dignity\s+solutions)/i },
  { formType: 'amam_icc18_aa3487', pattern: /(icc18[^a-z0-9]*aa3487|icc17[^a-z0-9]*aa3413|american[-\s]?amicable.*term|home\s+certainty|express\s+term)/i },
  { formType: 'foresters_icc15_770825', pattern: /(icc15[^a-z0-9]*770825|foresters.*term)/i },
  { formType: 'uhl_icc22_200_878a', pattern: /(icc22[^a-z0-9]*200[^a-z0-9]*878a|united\s+home\s+life)/i },
  { formType: 'transamerica_icc22_t_ap_wl11ic_0822', pattern: /(icc22[^a-z0-9]*t[^a-z0-9]*ap[^a-z0-9]*wl11ic[^a-z0-9]*0822|transamerica.*whole)/i },
  { formType: 'corebridge_aig_icc15_108847', pattern: /(icc15[^a-z0-9]*108847|corebridge|aig)/i },
  { formType: 'sbli_policy_packet', pattern: /(sbli)/i },
  { formType: 'fg_iul', pattern: /(f&g|fidelity\s*&?\s*guaranty|fg.*iul|icc18[^a-z0-9]*1000|lapp1125)/i },
  { formType: 'moo_icc22_l683a', pattern: /(icc22[^a-z0-9]*l683a|mutual\s+of\s+omaha.*(term|iul)\s+express)/i },
  { formType: 'moo_icc23_l681a', pattern: /(icc23[^a-z0-9]*l681a|mutual\s+of\s+omaha.*living\s+promise)/i },
  { formType: 'moo_ma5981', pattern: /(ma5981|mutual\s+of\s+omaha.*accidental)/i },
  { formType: 'banner_lga_icc17_lia', pattern: /(icc17[^a-z0-9]*lia|banner|legal\s*&?\s*general|lga|beyondterm|quility\s+term)/i },
];

function toSequentialPages(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => index + 1);
}

function buildBroaderMappedSubset(selectedPages: number[]): number[] {
  if (!selectedPages.length) return [];
  // Sparse two-page mappings (for example SBLI [14, 36]) tend to be either
  // sufficient as-is or too far apart for a useful "broader" retry. Returning
  // an empty subset disables the expensive second pass in those cases.
  if (selectedPages.length < 3) return [];
  const min = Math.min(...selectedPages);
  const max = Math.max(...selectedPages);
  const span = Math.max(max - min + 1, selectedPages.length);
  const cappedSpan = Math.min(Math.max(span, selectedPages.length), 10);
  const start = Math.max(1, min);
  return toSequentialPages(cappedSpan).map((offset) => start + offset - 1);
}

export function detectBulkPdfRoute(fileName: string): BulkPdfRouteDecision {
  const normalizedName = (fileName || '').trim();
  const matched = FORM_TYPE_DETECTION_RULES.find((rule) => rule.pattern.test(normalizedName));
  if (!matched) {
    const selectedPages = toSequentialPages(BULK_UNKNOWN_MAX_PAGES);
    return {
      carrierFormType: 'unknown',
      confidence: 'low',
      selectedPages,
      broaderMappedPages: selectedPages,
    };
  }
  const selectedPages = APPLICATION_PAGE_MAP[matched.formType] || toSequentialPages(BULK_UNKNOWN_MAX_PAGES);
  return {
    carrierFormType: matched.formType,
    confidence: 'high',
    selectedPages,
    broaderMappedPages: buildBroaderMappedSubset(selectedPages),
  };
}

export async function buildRoutedPdfBuffer(
  inputPdfBytes: Uint8Array,
  pageNumbers: number[],
): Promise<{ pdfBytes: Uint8Array; pageCount: number; subsetSkippedReason: null | 'pdf_encrypted_unsupported' }> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(inputPdfBytes);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('is encrypted')) {
      return {
        pdfBytes: inputPdfBytes,
        pageCount: 0,
        subsetSkippedReason: 'pdf_encrypted_unsupported',
      };
    }
    throw error;
  }
  const availablePages = source.getPageCount();
  const normalized = Array.from(new Set(pageNumbers))
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= availablePages)
    .sort((a, b) => a - b);
  const fallbackPages = toSequentialPages(Math.min(BULK_UNKNOWN_MAX_PAGES, availablePages));
  const pagesToCopy = normalized.length > 0 ? normalized : fallbackPages;
  const target = await PDFDocument.create();
  const copied = await target.copyPages(source, pagesToCopy.map((pageNumber) => pageNumber - 1));
  for (const page of copied) {
    target.addPage(page);
  }
  const pdfBytes = await target.save();
  return { pdfBytes, pageCount: pagesToCopy.length, subsetSkippedReason: null };
}
