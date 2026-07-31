import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Admins can set arbitrary product image URLs from any host. Serving images
    // as-is (bypassing the optimizer) lets any URL render without exposing the
    // optimizer to arbitrary remote hosts — safer than a wildcard remotePattern.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
