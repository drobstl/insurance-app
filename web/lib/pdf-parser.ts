export interface PageImage {
  /** 1-indexed page number (for display). */
  pageNum: number;
  /** Base64-encoded PNG data. */
  base64: string;
}

/**
 * Render every page of a PDF to a PNG image at 1.5x scale (~108 DPI).
 * Sends all pages to Claude for maximum extraction accuracy — no pages
 * are skipped, so beneficiary addendums and supplemental forms are never missed.
 *
 * Uses pdf-to-img (serverless-friendly, no binary deps) which internally
 * loads pdfjs-dist/legacy via Node.js native resolution.
 */
export async function renderAllPdfPages(buffer: Buffer): Promise<PageImage[]> {
  const { pdf } = await import('pdf-to-img');
  const doc = await pdf(buffer, { scale: 1.5 });

  const images: PageImage[] = [];
  let idx = 0;

  for await (const pngBuffer of doc) {
    images.push({
      pageNum: idx + 1,
      base64: Buffer.from(pngBuffer).toString('base64'),
    });
    idx++;
  }

  return images;
}
