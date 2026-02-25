/**
 * Convert a PDF buffer to a base64 string for sending directly to Claude's
 * document content block. No image rendering or text extraction needed —
 * Claude processes the raw PDF with full visual fidelity.
 */
export function pdfToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}
