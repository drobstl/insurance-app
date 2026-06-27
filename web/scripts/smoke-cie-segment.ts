/**
 * Smoke test for CIE packet segmentation — NO API calls, NO writes.
 *
 * Validates the LOCAL half of CIE ingestion against a real Symmetry packet:
 *   1. read per-page text the way the web create route does (pdf-parse
 *      getText, one call), run the pure segmenter → expect ~49 leads;
 *   2. rebuild each lead's mini-PDF the way the processor's splitToSegments
 *      does (pdf-lib copyPages), reload it, and confirm it carries the
 *      lead's name + state + mortgage amount — i.e. grouping captured BOTH
 *      pages, not just the header page.
 *
 * Usage: npx tsx scripts/smoke-cie-segment.ts [path-to.pdf]
 * Defaults to ~/Downloads/5-14-26.pdf (Ashley's sample). PII stays local.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import { segmentLeadPackets, normalizeForMatch } from '../lib/cie-lead-segment';

/** Per-page text in one call — mirrors `computeLeadSegmentsFromPdf`. */
async function pageTextsViaGetText(buffer: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const byNum = new Map<number, string>();
    let max = 0;
    for (const p of result.pages) {
      byNum.set(p.num, p.text || '');
      if (p.num > max) max = p.num;
    }
    const texts: string[] = [];
    for (let n = 1; n <= max; n += 1) texts.push(byNum.get(n) ?? '');
    return texts;
  } finally {
    try {
      await parser.destroy();
    } catch {
      /* no-op */
    }
  }
}

/** Mirrors the processor's splitToSegments: copy a group's pages into one PDF. */
async function buildSegmentPdf(parent: PDFDocument, pages: number[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(parent, pages);
  for (const pg of copied) doc.addPage(pg);
  return Buffer.from(await doc.save());
}

async function textOf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text ?? '';
  } catch {
    return '';
  } finally {
    try {
      await parser.destroy();
    } catch {
      /* no-op */
    }
  }
}

async function main() {
  const path = resolve(process.argv[2] || `${homedir()}/Downloads/5-14-26.pdf`);
  console.log(`\nReading: ${path}`);
  const bytes = readFileSync(path);
  const parent = await PDFDocument.load(bytes);
  const pageCount = parent.getPageCount();

  const pageTexts = await pageTextsViaGetText(Buffer.from(bytes));
  console.log(`Pages: ${pageCount}  (page texts via getText: ${pageTexts.length})\n`);

  const seg = segmentLeadPackets(pageTexts);
  console.log(`kind:            ${seg.kind}`);
  console.log(`header pages:    ${seg.headerPages.length}`);
  console.log(`leads (segments):${seg.segments.length}`);
  console.log(`anomalous pages: ${seg.anomalousPages.length ? seg.anomalousPages.map((p) => p + 1).join(', ') : 'none'}`);
  const spanHist = new Map<number, number>();
  for (const s of seg.segments) spanHist.set(s.length, (spanHist.get(s.length) || 0) + 1);
  console.log(`page-span counts:`, Object.fromEntries([...spanHist.entries()].sort()));

  // Validate grouping: rebuild each lead's mini-PDF and confirm it carries
  // name + state + mortgage amount (i.e. both pages came along, not just pg1).
  let complete = 0;
  const incomplete: string[] = [];
  for (let i = 0; i < seg.segments.length; i += 1) {
    const pages = seg.segments[i];
    const buf = await buildSegmentPdf(parent, pages);
    const reloaded = await PDFDocument.load(buf);
    const n = normalizeForMatch(await textOf(buf));
    const ok =
      reloaded.getPageCount() === pages.length &&
      n.includes('firstname') &&
      n.includes('state') &&
      n.includes('mortgageamount');
    if (ok) complete += 1;
    else incomplete.push(`lead ${i + 1} (pages ${pages.map((p) => p + 1).join('+')})`);
  }
  console.log(`\ngrouping check: ${complete}/${seg.segments.length} leads carry name+state+mortgage across their pages`);
  if (incomplete.length) console.log(`  incomplete:`, incomplete.join('; '));
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
