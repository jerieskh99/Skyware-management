import path from "node:path";
import type { NextConfig } from "next";

// Security headers applied to all routes.
// CSP with nonces is deferred — Next.js App Router requires per-request nonce injection
// which is complex to implement safely. See docs/production-readiness.md.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // SAMEORIGIN (not DENY) so the receipts detail page can embed its own
  // /api/receipts/[id]/pdf response in an iframe preview. Cross-origin
  // embedding is still blocked, which is the real clickjacking threat.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // HSTS: only active when served over HTTPS. Safe to include; browsers ignore it on HTTP.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
    // Tree-shake Radix barrel imports so each route ships only the entry
    // points it uses. lucide-react and date-fns are deliberately omitted:
    // Next 15 already includes them in its built-in optimize list, so listing
    // them here would be a no-op.
    optimizePackageImports: [
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tooltip",
    ],
  },
  // Puppeteer ships Node-only deps (fs, child_process, ws). If Next.js tries
  // to bundle it into the server bundle, webpack fails to resolve. Mark it
  // as external so it loads from node_modules at runtime in the API route.
  serverExternalPackages: ["puppeteer", "puppeteer-core", "@puppeteer/browsers"],
  // Pin Turbopack workspace root to this project. Without this, Next infers
  // it from the nearest lockfile and picks up `/Users/jeries/package-lock.json`
  // (a stray lockfile in $HOME) instead of our `pnpm-lock.yaml`.
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
