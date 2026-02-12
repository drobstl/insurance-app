import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfParseResult {
  /** Full merged text (all pages concatenated). */
  text: string;
  /** Text for each individual page (0-indexed). */
  pages: string[];
  pageCount: number;
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
