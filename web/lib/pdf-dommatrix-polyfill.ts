import 'server-only';

/**
 * Install a no-op global `DOMMatrix` for Node/serverless before pdf-parse loads.
 *
 * pdf-parse bundles the pdfjs-dist *legacy* build, whose module top level
 * evaluates `const SCALE_MATRIX = new DOMMatrix();` (pdf.mjs). `DOMMatrix` is a
 * browser API; in a Node runtime pdfjs only defines it by polyfilling from the
 * optional native `@napi-rs/canvas` package. That package isn't present in the
 * traced Vercel function, so requiring pdf-parse throws
 * `ReferenceError: DOMMatrix is not defined` at module load — which 500'd
 * `/api/leads/batch` for every multi-page PDF import.
 *
 * We only ever call pdf-parse's `getText()`, which extracts text and never
 * touches the canvas/render path that would actually use a matrix. So a
 * `DOMMatrix` that merely *exists* (never functionally called) is enough.
 * This was verified by hiding @napi-rs/canvas and running getText() on a real
 * multi-page PDF: extraction output is byte-identical with this stub vs. with
 * the real native DOMMatrix. A pure-JS stub also avoids shipping a ~40 MB
 * platform-specific native binary and the file-tracing fragility that comes
 * with it.
 *
 * Import this module *before* pdf-parse (it has no other purpose). The
 * pdf-parse consumers additionally load pdf-parse via dynamic `import()` from
 * inside their async functions, so this top-level global is guaranteed to be in
 * place before pdfjs evaluates, regardless of bundler module ordering.
 */
const g = globalThis as { DOMMatrix?: unknown };
if (typeof g.DOMMatrix === 'undefined') {
  // Empty class: `new DOMMatrix()` and `new DOMMatrix(init)` both construct.
  g.DOMMatrix = class DOMMatrix {};
}

export {};
