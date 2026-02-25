import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* No rewrites needed - booking is served from public/booking/index.html */

  serverExternalPackages: ['unpdf', 'pdf-to-img'],
};

export default nextConfig;
