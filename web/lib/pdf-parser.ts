import type { TextItem } from 'pdfjs-dist/types/src/display/api';

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
 * Extract raw text from a PDF buffer using pdfjs-dist's legacy (Node-compatible) build.
 * Returns both the full merged text and per-page text for smart page selection.
 * Throws if the PDF cannot be parsed or contains no extractable text.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfParseResult> {
  // Use the legacy build — same one pdf-to-img uses — which handles
  // missing browser globals (DOMMatrix, etc.) gracefully in Node.js.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ');
    pages.push(pageText);
  }

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
    pageCount: pdf.numPages,
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
