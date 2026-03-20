import pdfParse from 'pdf-parse';

export async function extractTextFromPdfBase64(pdfBase64: string): Promise<string | null> {
  if (!pdfBase64 || pdfBase64.trim().length === 0) return null;

  try {
    const buffer = Buffer.from(pdfBase64, 'base64');
    const parsed = await pdfParse(buffer);
    const text = parsed.text?.trim() ?? '';
    if (text.length === 0) return null;
    return text;
  } catch {
    return null;
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
