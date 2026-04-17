'use client';

const FIXED_RENDER_SCALE = 1.62;
const FIXED_JPEG_QUALITY = 0.8;

type RenderedJpegPage = {
  pageNumber: number;
  blob: Blob;
};

let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist').then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      }
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

export async function renderSelectedPdfPagesToJpegs(file: File, pageNumbers: number[]): Promise<RenderedJpegPage[]> {
  if (typeof window === 'undefined') {
    throw new Error('PDF rendering is only available in the browser.');
  }

  const uniqueSortedPages = Array.from(new Set(pageNumbers)).sort((a, b) => a - b);
  if (!uniqueSortedPages.length) {
    throw new Error('At least one page number is required.');
  }
  if (uniqueSortedPages.some((pageNumber) => !Number.isInteger(pageNumber) || pageNumber < 1)) {
    throw new Error('Invalid page selection for this application type.');
  }

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const documentProxy = await loadingTask.promise;

  const invalidPage = uniqueSortedPages.find((pageNumber) => pageNumber > documentProxy.numPages);
  if (invalidPage) {
    throw new Error(`Page ${invalidPage} is missing from the uploaded PDF.`);
  }

  const renderedPages: RenderedJpegPage[] = [];
  for (const pageNumber of uniqueSortedPages) {
    const page = await documentProxy.getPage(pageNumber);
    const blob = await renderPageAsJpeg(page);
    renderedPages.push({ pageNumber, blob });
  }
  return renderedPages;
}

export type TolerantRenderResult = {
  rendered: RenderedJpegPage[];
  requested: number[];
  skipped: number[];
};

export async function renderSelectedPdfPagesToJpegsTolerant(
  file: File,
  pageNumbers: number[],
): Promise<TolerantRenderResult> {
  if (typeof window === 'undefined') {
    throw new Error('PDF rendering is only available in the browser.');
  }

  const uniqueSortedPages = Array.from(new Set(pageNumbers)).sort((a, b) => a - b);
  if (!uniqueSortedPages.length) {
    throw new Error('At least one page number is required.');
  }
  if (uniqueSortedPages.some((pageNumber) => !Number.isInteger(pageNumber) || pageNumber < 1)) {
    throw new Error('Invalid page selection for this application type.');
  }

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const documentProxy = await loadingTask.promise;

  const renderablePages = uniqueSortedPages.filter((pageNumber) => pageNumber <= documentProxy.numPages);
  const skipped = uniqueSortedPages.filter((pageNumber) => pageNumber > documentProxy.numPages);

  if (!renderablePages.length) {
    throw new Error('None of the requested pages exist in the uploaded PDF.');
  }

  const renderedPages: RenderedJpegPage[] = [];
  for (const pageNumber of renderablePages) {
    const page = await documentProxy.getPage(pageNumber);
    const blob = await renderPageAsJpeg(page);
    renderedPages.push({ pageNumber, blob });
  }
  return { rendered: renderedPages, requested: uniqueSortedPages, skipped };
}

export async function renderFirstPdfPagesToJpegs(file: File, maxPages = 6): Promise<RenderedJpegPage[]> {
  if (!Number.isFinite(maxPages) || maxPages < 1) {
    throw new Error('Invalid page limit for rendering.');
  }

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const documentProxy = await loadingTask.promise;
  const pageLimit = Math.min(Math.max(1, Math.floor(maxPages)), documentProxy.numPages);
  const pageNumbers = Array.from({ length: pageLimit }, (_, index) => index + 1);

  const renderedPages: RenderedJpegPage[] = [];
  for (const pageNumber of pageNumbers) {
    const page = await documentProxy.getPage(pageNumber);
    const blob = await renderPageAsJpeg(page);
    renderedPages.push({ pageNumber, blob });
  }
  return renderedPages;
}

async function renderPageAsJpeg(page: import('pdfjs-dist/types/src/display/api').PDFPageProxy): Promise<Blob> {
  const viewport = page.getViewport({ scale: FIXED_RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Failed to initialize PDF rendering context.');
  }

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    background: 'rgb(255,255,255)',
  }).promise;

  const blob = await canvasToBlob(canvas, FIXED_JPEG_QUALITY);
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode rendered page.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}
