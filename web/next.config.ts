import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/booking',
        destination: 'https://roberts-booking.vercel.app/',
      },
      {
        source: '/booking/:path*',
        destination: 'https://roberts-booking.vercel.app/:path*',
      },
    ];
  },
};

export default nextConfig;
