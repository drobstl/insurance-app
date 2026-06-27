/**
 * Install a no-op global `DOMMatrix` before pdf-parse loads.
 *
 * pdf-parse bundles the pdfjs-dist legacy build, whose module top level
 * evaluates `const SCALE_MATRIX = new DOMMatrix();`. `DOMMatrix` is a browser
 * API; in Node, pdfjs only defines it by polyfilling from the optional native
 * `@napi-rs/canvas` (not installed here), so without this stub requiring
 * pdf-parse throws `ReferenceError: DOMMatrix is not defined` at load.
 *
 * We only ever call `getText()`, which never exercises the canvas/render path
 * that uses a matrix, so a DOMMatrix that merely exists is sufficient (verified
 * on the web side: text output is byte-identical with this stub vs. the real
 * native DOMMatrix). Import this module before pdf-parse.
 */
const g = globalThis as { DOMMatrix?: unknown };
if (typeof g.DOMMatrix === 'undefined') {
  g.DOMMatrix = class DOMMatrix {};
}

export {};
