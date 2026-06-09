import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize preloading to reduce warnings
  experimental: {
    preloadEntriesOnStart: true,
  },
  // Compress CSS/JS for faster load
  compress: true,
  // Optimize images
  images: {
    unoptimized: false,
    formats: ['image/webp', 'image/avif'],
  },
};

export default nextConfig;
