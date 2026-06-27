import './dommatrix-polyfill';
import { PDFParse } from 'pdf-parse';
import { segmentLeadPackets } from './cie-segment';

/**
 * Compute per-lead page groupings for a Symmetry CIE packet directly in the
 * GCF, from the parent PDF bytes. Returns the page-index segments only when the
 * packet looks like a repeating multi-page CIE template; otherwise null so the
 * caller falls back to one-lead-per-page (byte-for-byte the prior behavior).
 *
 * This is the reliable counterpart to the web tier's
 * `web/lib/cie-lead-segment-server.ts`: the Vercel serverless function's
 * bundled pdf-parse has proven flaky (it silently extracted no usable text in
 * production, so no groupings were ever written). The GCF runs a normal Node
 * runtime with a full node_modules, where pdf-parse text extraction is
 * reliable — so computing the groupings here makes the import correct
 * regardless of what the web tier did.
 *
 * Best-effort: any read failure returns null (never throws to the caller).
 */
export async function computeLeadSegmentsFromPdf(pdfBuffer: Buffer): Promise<number[][] | null> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    if (!result?.pages?.length) return null;

    // pdf-parse numbers pages 1-based; build a 0-based array aligned to page
    // index (texts[0] = page 1) for the segmenter.
    const byNum = new Map<number, string>();
    let maxNum = 0;
    for (const p of result.pages) {
      byNum.set(p.num, p.text || '');
      if (p.num > maxNum) maxNum = p.num;
    }
    if (maxNum === 0) return null;
    const pageTexts: string[] = [];
    for (let n = 1; n <= maxNum; n += 1) pageTexts.push(byNum.get(n) ?? '');

    const seg = segmentLeadPackets(pageTexts);
    return seg.kind === 'symmetry-cie' ? seg.segments : null;
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
