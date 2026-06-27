import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  serverExternalPackages: [
    "google-auth-library",
    // pdf-parse bundles the pdfjs-dist legacy build, which references the
    // browser-only DOMMatrix API and dynamically require()s @napi-rs/canvas
    // to polyfill it. Keep both external so (a) they're loaded from
    // node_modules at runtime only by the routes that actually parse PDFs,
    // and (b) pdf-parse isn't bundled into unrelated serverless chunks
    // (e.g. /api/leads/batch), where evaluating it throws
    // "ReferenceError: DOMMatrix is not defined" and 500s the route.
    "pdf-parse",
    "@napi-rs/canvas",
  ],
  // pdfjs (inside pdf-parse) require()s @napi-rs/canvas *dynamically* to get a
  // real DOMMatrix/ImageData/Path2D; without it the legacy build throws
  // "ReferenceError: DOMMatrix is not defined" at module load and 500s the
  // route. Vercel's function tracer only ships statically-referenced files, so
  // a dynamic require gets skipped even though @napi-rs/canvas is a declared
  // dependency. Force the package + its Linux native binary (the Vercel build
  // arch) into the one route that parses PDFs. Globs that match nothing on a
  // given build arch (e.g. the linux binaries when building on macOS) are
  // simply ignored.
  outputFileTracingIncludes: {
    "/api/leads/batch": [
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
      "./node_modules/@napi-rs/canvas-linux-x64-musl/**",
    ],
  },
};

export default nextConfig;
