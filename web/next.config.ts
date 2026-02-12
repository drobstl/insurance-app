import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* No rewrites needed - booking is served from public/booking/index.html */

  // Prevent Next.js from bundling unpdf (uses pdfjs WASM internally);
  // keeps it as a normal Node require so the binary loads correctly.
  serverExternalPackages: ['unpdf'],
};

export default nextConfig;
