import 'server-only';
import './pdf-dommatrix-polyfill';
import type { PDFParse as PDFParseType } from 'pdf-parse';
import { segmentLeadPackets, type LeadSegmentation } from './cie-lead-segment';

/**
 * Server-side bridge: read a PDF's per-page text (pdf-parse, the same lib
 * `pdf-text-extractor` uses) and run the pure CIE segmenter on it.
 *
 * Kept separate from `cie-lead-segment.ts` so that module stays pure /
 * isomorphic (unit-testable, importable anywhere); only this wrapper pulls
 * in the server-only PDF text dependency.
 *
 * Best-effort by contract: returns null on any read failure so callers can
 * treat "couldn't detect" as "not a CIE packet" and fall back to the
 * existing one-lead-per-page pipeline.
 */
export async function computeLeadSegmentsFromPdf(
  pdfBuffer: Buffer,
): Promise<LeadSegmentation | null> {
  let parser: PDFParseType | null = null;
  try {
    const { PDFParse } = await import('pdf-parse');
    parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    if (!result?.pages?.length) return null;

    // pdf-parse numbers pages 1-based; build a 0-based array aligned to
    // page index (texts[0] = page 1) for the segmenter.
    const byNum = new Map<number, string>();
    let maxNum = 0;
    for (const p of result.pages) {
      byNum.set(p.num, p.text || '');
      if (p.num > maxNum) maxNum = p.num;
    }
    if (maxNum === 0) return null;
    const pageTexts: string[] = [];
    for (let n = 1; n <= maxNum; n += 1) pageTexts.push(byNum.get(n) ?? '');

    return segmentLeadPackets(pageTexts);
  } catch {
    return null;
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        /* no-op */
      }
    }
  }
}
