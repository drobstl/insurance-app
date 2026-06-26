/**
 * Smoke test for CIE packet segmentation — NO API calls, NO writes.
 *
 * Proves we can split a real Symmetry CIE packet into per-lead page groups
 * before wiring any of it into the upload pipeline. Reads page text with
 * pdf-parse (the same lib `web/lib/pdf-text-extractor.ts` uses), runs the
 * pure segmenter, and reports the grouping + any off-template pages.
 *
 * Usage:
 *   npx tsx web/scripts/smoke-cie-segment.ts [path-to.pdf]
 * Defaults to ~/Downloads/5-14-26.pdf (Ashley's sample).
 *
 * Real customer PII stays LOCAL — nothing leaves the machine.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import { segmentLeadPackets, normalizeForMatch } from '../lib/cie-lead-segment';

async function pageText(parent: PDFDocument, index: number): Promise<string> {
  const single = await PDFDocument.create();
  const [copied] = await single.copyPages(parent, [index]);
  single.addPage(copied);
  const bytes = await single.save();
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  try {
    const parsed = await parser.getText();
    return parsed.text?.trim() ?? '';
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

/** Pull a labeled value out of a page's normalized stream, for eyeballing. */
function peek(pageTexts: string[], pages: number[], label: string): string {
  const joined = normalizeForMatch(pages.map((p) => pageTexts[p] || '').join(' '));
  const idx = joined.indexOf(normalizeForMatch(label));
  if (idx === -1) return '∅';
  return joined.slice(idx + normalizeForMatch(label).length, idx + normalizeForMatch(label).length + 28);
}

async function main() {
  const path = resolve(process.argv[2] || `${homedir()}/Downloads/5-14-26.pdf`);
  console.log(`\nReading: ${path}`);
  const bytes = readFileSync(path);
  const parent = await PDFDocument.load(bytes);
  const pageCount = parent.getPageCount();
  console.log(`Pages: ${pageCount}\n`);

  const pageTexts: string[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    pageTexts.push(await pageText(parent, i));
    process.stdout.write(`\r  reading page text ${i + 1}/${pageCount}`);
  }
  process.stdout.write('\n\n');

  const seg = segmentLeadPackets(pageTexts);
  console.log(`kind:            ${seg.kind}`);
  console.log(`header pages:    ${seg.headerPages.length}  (1-based: ${seg.headerPages.map((p) => p + 1).join(', ')})`);
  console.log(`leads (segments):${seg.segments.length}`);
  console.log(`anomalous pages: ${seg.anomalousPages.length ? seg.anomalousPages.map((p) => p + 1).join(', ') : 'none'}`);

  // Page-span histogram — how many leads are 1 page, 2 pages, 3+?
  const spanHist = new Map<number, number>();
  for (const s of seg.segments) spanHist.set(s.length, (spanHist.get(s.length) || 0) + 1);
  console.log(`page-span counts:`, Object.fromEntries([...spanHist.entries()].sort()));

  // Eyeball the first few + last lead: do we capture name + phone (pg1) AND
  // state + mortgage amount (pg2) in the SAME segment?
  const show = [...seg.segments.slice(0, 3), seg.segments[seg.segments.length - 1]];
  console.log(`\nspot-check (label → next chars in the despaced stream):`);
  for (const s of show) {
    const human = s.map((p) => p + 1).join('+');
    console.log(
      `  lead pages ${human}: ` +
        `first=${peek(pageTexts, s, 'First Name')} | ` +
        `phone=${peek(pageTexts, s, 'Primary Phone')} | ` +
        `state=${peek(pageTexts, s, 'State')} | ` +
        `mtg=${peek(pageTexts, s, 'Mortgage Amount')}`,
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
