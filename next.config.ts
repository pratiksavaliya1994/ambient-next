import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.50.12"],
  images: {
    // Tool photos live in Bubble's file manager and are served from its CDN.
    // The subdomain is a per-app hash (`<hash>.cdn.bubble.io`), so the pattern
    // is deliberately a wildcard rather than this app's own value — nothing
    // else in this repo hardcodes a Bubble-owned identifier. The S3 entry
    // covers older uploads Bubble stored before the CDN host existed.
    remotePatterns: [
      { protocol: "https", hostname: "**.cdn.bubble.io" },
      { protocol: "https", hostname: "s3.amazonaws.com", pathname: "/appforest_uf/**" },
    ],
  },
  experimental: {
    // Photo uploads are the only thing that comes close. `downscalePhoto` caps
    // each one at 1600px — typically 200–400KB — and the schema caps a batch at
    // 8MB, so this is headroom over that ceiling rather than a licence to post
    // raw camera files. Everything else this app sends is small JSON.
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        // Never let a service worker go stale: the browser must revalidate it
        // on every load, or an old copy keeps serving outdated chunks.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ]
  },
}

export default nextConfig
