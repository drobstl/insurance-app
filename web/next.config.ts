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
};

export default nextConfig;
