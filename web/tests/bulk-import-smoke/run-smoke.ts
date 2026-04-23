import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { APPLICATION_PAGE_MAP } from '../../lib/pdf/application-page-map';
import {
  BULK_UNKNOWN_MAX_PAGES,
  buildRoutedPdfBuffer,
  detectBulkPdfRoute,
} from '../../lib/pdf/bulk-pdf-routing';

const DETECTION_CASES: Array<{ fileName: string; expectedFormType: string }> = [
  { fileName: 'americo-icc18-5160-term.pdf', expectedFormType: 'americo_icc18_5160' },
  { fileName: 'americo-iul-application.pdf', expectedFormType: 'americo_icc18_5160_iul' },
  { fileName: 'americo icc24 5426 whole life.pdf', expectedFormType: 'americo_icc24_5426' },
  { fileName: 'american amicable icc15 aa9466 mortgage.pdf', expectedFormType: 'amam_icc15_aa9466' },
  { fileName: 'american amicable icc18 aa3487 term.pdf', expectedFormType: 'amam_icc18_aa3487' },
  { fileName: 'foresters icc15 770825 term.pdf', expectedFormType: 'foresters_icc15_770825' },
  { fileName: 'united home life icc22 200 878a.pdf', expectedFormType: 'uhl_icc22_200_878a' },
  { fileName: 'transamerica icc22 t ap wl11ic 0822.pdf', expectedFormType: 'transamerica_icc22_t_ap_wl11ic_0822' },
  { fileName: 'corebridge aig icc15 108847.pdf', expectedFormType: 'corebridge_aig_icc15_108847' },
  { fileName: 'sbli-policy-packet.pdf', expectedFormType: 'sbli_policy_packet' },
  { fileName: 'f&g icc18 1000 iul.pdf', expectedFormType: 'fg_iul' },
  { fileName: 'mutual of omaha icc22 l683a term express.pdf', expectedFormType: 'moo_icc22_l683a' },
  { fileName: 'mutual of omaha icc23 l681a living promise.pdf', expectedFormType: 'moo_icc23_l681a' },
  { fileName: 'mutual of omaha ma5981 accidental.pdf', expectedFormType: 'moo_ma5981' },
  { fileName: 'banner legal & general icc17 lia.pdf', expectedFormType: 'banner_lga_icc17_lia' },
];

async function buildPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([612, 792]);
  }
  return doc.save();
}

async function testUnknownRoutingCapsPages() {
  const route = detectBulkPdfRoute('completely-unknown-form.pdf');
  assert.equal(route.carrierFormType, 'unknown');
  assert.equal(route.confidence, 'low');
  assert.equal(route.selectedPages.length, BULK_UNKNOWN_MAX_PAGES);
  assert.deepEqual(route.selectedPages, [1, 2, 3, 4, 5, 6]);
}

async function testSbliRouteIncludesPage36() {
  assert.deepEqual(APPLICATION_PAGE_MAP.sbli_policy_packet, [14, 36]);

  const route = detectBulkPdfRoute('SBLI_client_packet.pdf');
  assert.equal(route.carrierFormType, 'sbli_policy_packet');
  assert.equal(route.confidence, 'high');
  assert.deepEqual(route.selectedPages, [14, 36]);
}

async function testDetectionCoverageAcrossCarriers() {
  for (const testCase of DETECTION_CASES) {
    const route = detectBulkPdfRoute(testCase.fileName);
    assert.equal(route.carrierFormType, testCase.expectedFormType);
    assert.equal(route.confidence, 'high');
    assert.deepEqual(route.selectedPages, APPLICATION_PAGE_MAP[testCase.expectedFormType]);
  }
}

async function testPageMapEntriesAreWellFormed() {
  for (const [formType, pages] of Object.entries(APPLICATION_PAGE_MAP)) {
    assert.ok(Array.isArray(pages), `${formType} should map to an array`);
    assert.ok(pages.length > 0, `${formType} should include at least one page`);
    assert.ok(
      pages.every((page) => Number.isInteger(page) && page >= 1),
      `${formType} includes invalid page numbers`,
    );
    assert.equal(new Set(pages).size, pages.length, `${formType} should not include duplicate pages`);
  }

  // Keep aliased F&G variants in lockstep with the canonical route target.
  assert.deepEqual(APPLICATION_PAGE_MAP.fg_icc18_1000, APPLICATION_PAGE_MAP.fg_iul);
  assert.deepEqual(APPLICATION_PAGE_MAP.fg_lapp1125, APPLICATION_PAGE_MAP.fg_iul);
}

async function testRoutedPdfSubsetUsesRequestedPages() {
  const input = await buildPdf(50);
  const routed = await buildRoutedPdfBuffer(input, [14, 36]);
  assert.equal(routed.subsetSkippedReason, null);
  assert.equal(routed.pageCount, 2);

  const subset = await PDFDocument.load(routed.pdfBytes);
  assert.equal(subset.getPageCount(), 2);
}

async function testOutOfRangeSelectionFallsBackSafely() {
  const input = await buildPdf(4);
  const routed = await buildRoutedPdfBuffer(input, [40, 41]);
  assert.equal(routed.subsetSkippedReason, null);
  assert.equal(routed.pageCount, 4);
}

async function testEncryptedPdfIsReportedAsUnsupported() {
  const originalLoad = PDFDocument.load;
  try {
    (PDFDocument as unknown as { load: typeof PDFDocument.load }).load = async () => {
      throw new Error("Input document to `PDFDocument.load` is encrypted.");
    };

    const bytes = await buildPdf(2);
    const routed = await buildRoutedPdfBuffer(bytes, [1, 2]);
    assert.equal(routed.subsetSkippedReason, 'pdf_encrypted_unsupported');
    assert.equal(routed.pageCount, 0);
  } finally {
    (PDFDocument as unknown as { load: typeof PDFDocument.load }).load = originalLoad;
  }
}

async function main() {
  console.log('[bulk-import-smoke] Running bulk import smoke checks...');
  await testUnknownRoutingCapsPages();
  await testSbliRouteIncludesPage36();
  await testDetectionCoverageAcrossCarriers();
  await testPageMapEntriesAreWellFormed();
  await testRoutedPdfSubsetUsesRequestedPages();
  await testOutOfRangeSelectionFallsBackSafely();
  await testEncryptedPdfIsReportedAsUnsupported();
  console.log('[bulk-import-smoke] PASS');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[bulk-import-smoke] FAIL:', message);
  process.exit(1);
});
