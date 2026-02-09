import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfParseResult {
  text: string;
  pageCount: number;
}

/**
 * Extract raw text from a PDF buffer.
 * Uses unpdf which works in serverless environments (Vercel, Cloudflare, etc).
 * Throws if the PDF cannot be parsed or contains no extractable text.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfParseResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });

  const trimmed = (typeof text === 'string' ? text : '').trim();
  if (!trimmed || trimmed.length < 20) {
    throw new Error(
      'This PDF appears to be a scanned image with no extractable text. ' +
      'Please upload a digitally-generated PDF (not a photo or scan).'
    );
  }

  return {
    text: typeof text === 'string' ? text : '',
    pageCount: totalPages,
  };
}
