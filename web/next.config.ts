import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  serverExternalPackages: [
    "google-auth-library",
  ],
};

export default nextConfig;
