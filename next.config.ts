import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["mysql2", "mathjax-full", "@resvg/resvg-wasm", "mammoth"],
  outputFileTracingIncludes: {
    "/api/telegram/webhook": ["./node_modules/@resvg/resvg-wasm/index_bg.wasm"],
    "/api/marathon/notifications/process": ["./node_modules/@resvg/resvg-wasm/index_bg.wasm"],
  },
  images: {
    // Every local public file. A list of only /api/marathon-media made
    // /_next/image answer 400 for /landing and the rest. No `search`:
    // query strings stay allowed.
    localPatterns: [{ pathname: "/**" }],
  },
  experimental: {
    optimizePackageImports: ["clsx", "motion"],
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
