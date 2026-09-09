import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    preloadEntriesOnStart: true,
    // Tree-shake this icon library — only bundle what's imported.
    optimizePackageImports: ['lucide-react'],
  },
  compress: true,
  images: {
    unoptimized: false,
    // AVIF REMOVED 9 Sep 2026 — GHSA-2xp9-vwfh-vxw4, "Unauthenticated Remote
    // Code Execution in the Image Optimization API when AVIF files are used".
    // Critical, and we were the exact configuration it names: next 16.2.11 is
    // inside the advisory's range (15.6.0-canary.0 – 16.3.2), optimization on,
    // AVIF explicitly enabled, live on careerrai.in.
    //
    // This closes the named vector; it is NOT the full fix. That is next
    // >= 16.3.3, which also clears the sharp/libheif advisory beneath it, and
    // it is a framework bump this repo cannot take blind — the whole point of
    // AGENTS.md's first line is that this Next.js differs from the published
    // one. So: mitigate tonight, upgrade deliberately, with the founder's word.
    //
    // Cost of dropping AVIF: WebP still serves every optimized image, a little
    // larger. No student loses anything they can see.
    formats: ['image/webp'],
  },
  // Never bundle server-only packages into client JS.
  serverExternalPackages: ['web-push'],
  // Security headers — applied to every response. Deliberately conservative:
  // no enforced CSP or Permissions-Policy here (those can silently break the
  // Razorpay checkout iframe, microphone-based voice notes, or inline styles),
  // so we ship the four headers that are 100% safe and invisible to users:
  //  - HSTS: force HTTPS for a year incl. subdomains (Vercel is HTTPS-only).
  //  - X-Frame-Options SAMEORIGIN: block third-party framing (clickjacking).
  //  - X-Content-Type-Options nosniff: stop MIME-sniffing attacks.
  //  - Referrer-Policy: don't leak full URLs to third parties.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
