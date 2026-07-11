import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    preloadEntriesOnStart: true,
    // Tree-shake these icon/component libraries — only bundle what's imported.
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-slot'],
  },
  compress: true,
  images: {
    unoptimized: false,
    formats: ['image/webp', 'image/avif'],
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
