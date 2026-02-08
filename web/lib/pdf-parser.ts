import { PDFParse } from 'pdf-parse';

export interface PdfParseResult {
  text: string;
  pageCount: number;
}

/**
 * Extract raw text from a PDF buffer.
 * Returns the full text content and page count.
 * Throws if the PDF cannot be parsed or contains no extractable text.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfParseResult> {
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
  });

  const result = await parser.getText();

  const text = result.text?.trim();
  if (!text || text.length < 20) {
    throw new Error(
      'This PDF appears to be a scanned image with no extractable text. ' +
      'Please upload a digitally-generated PDF (not a photo or scan).'
    );
  }

  return {
    text: result.text,
    pageCount: result.total,
  };
}
