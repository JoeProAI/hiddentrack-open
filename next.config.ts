import type { NextConfig } from "next";

const frameHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self' https://twitter.com https://x.com https://*.twitter.com https://*.x.com",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/embed", headers: frameHeaders },
      { source: "/listen/x", headers: frameHeaders },
    ];
  },
};

export default nextConfig;
