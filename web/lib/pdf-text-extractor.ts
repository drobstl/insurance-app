import 'server-only';
import { PDFParse } from 'pdf-parse';

export async function extractTextFromPdfBase64(pdfBase64: string): Promise<string | null> {
  if (!pdfBase64 || pdfBase64.trim().length === 0) return null;

  let parser: PDFParse | null = null;
  try {
    const buffer = Buffer.from(pdfBase64, 'base64');
    parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    const text = parsed.text?.trim() ?? '';
    if (text.length === 0) return null;
    return text;
  } catch {
    return null;
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // no-op
      }
    }
  }
}

export function isTextExtractionHighConfidence(text: string | null): boolean {
  if (!text) return false;
  if (text.length < 600) return false;

  const lc = text.toLowerCase();
  const requiredSignals = [
    'insured',
    'policy',
    'beneficiary',
  ];

  const matchedSignals = requiredSignals.filter((signal) => lc.includes(signal)).length;
  return matchedSignals >= 2;
}
