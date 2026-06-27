import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  serverExternalPackages: [
    "google-auth-library",
    // pdf-parse pulls in the heavy pdfjs-dist build; keep it external so it's
    // required from node_modules at runtime only by the routes that parse PDFs
    // rather than bundled into unrelated serverless chunks. (The DOMMatrix
    // crash it used to cause is handled by lib/pdf-dommatrix-polyfill.)
    "pdf-parse",
  ],
};

export default nextConfig;
