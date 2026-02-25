import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfParseResult {
  /** Full merged text (all pages concatenated). */
  text: string;
  /** Text for each individual page (0-indexed). */
  pages: string[];
  pageCount: number;
}

export interface PageImage {
  /** 1-indexed page number (for display). */
  pageNum: number;
  /** Base64-encoded PNG data. */
  base64: string;
}

/**
 * Extract raw text from a PDF buffer.
 * Uses unpdf which works in serverless environments (Vercel, Cloudflare, etc).
 * Returns both the full merged text and per-page text for smart page selection.
 * Throws if the PDF cannot be parsed or contains no extractable text.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfParseResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  // Extract per-page text (mergePages: false returns string[])
  const { text: perPageText, totalPages } = await extractText(pdf, { mergePages: false });

  const pages: string[] = Array.isArray(perPageText)
    ? perPageText.map((p) => (typeof p === 'string' ? p : ''))
    : [typeof perPageText === 'string' ? perPageText : ''];

  const merged = pages.join('\n');
  const trimmed = merged.trim();

  if (!trimmed || trimmed.length < 20) {
    throw new Error(
      'This PDF appears to be a scanned image with no extractable text. ' +
      'Please upload a digitally-generated PDF (not a photo or scan).'
    );
  }

  return {
    text: merged,
    pages,
    pageCount: totalPages,
  };
}

/**
 * Render specific PDF pages to PNG images (base64-encoded).
 * Uses pdf-to-img which is serverless-friendly (no native binary deps).
 * Only renders the requested pages to minimize cost and latency.
 */
export async function renderPdfPages(
  buffer: Buffer,
  pageIndices: number[],
  scale: number = 2.0,
): Promise<PageImage[]> {
  const { pdf } = await import('pdf-to-img');
  const doc = await pdf(buffer, { scale });

  const selectedSet = new Set(pageIndices);
  const images: PageImage[] = [];
  let idx = 0;

  for await (const pngBuffer of doc) {
    if (selectedSet.has(idx)) {
      images.push({
        pageNum: idx + 1,
        base64: Buffer.from(pngBuffer).toString('base64'),
      });
    }
    idx++;
    if (images.length === selectedSet.size) break;
  }

  return images;
}
