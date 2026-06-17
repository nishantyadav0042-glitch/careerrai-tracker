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
  serverExternalPackages: ['googleapis', 'web-push'],
};

export default nextConfig;
