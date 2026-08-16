import type { NextConfig } from "next";
import { API_CSP, staticSecurityHeaders } from "./lib/security-headers";

/**
 * The Content-Security-Policy for pages is NOT here: it carries a per-request
 * nonce, so it is built in `proxy.ts`. Everything in this file is the same on
 * every response and therefore cheaper to declare statically.
 */
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [...staticSecurityHeaders],
      },
      // The proxy is not matched on `/api`, so those responses get their own
      // (much stricter) policy here instead of none at all.
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: API_CSP }],
      },
    ];
  },
};

export default nextConfig;
