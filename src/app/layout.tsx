import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { PerfBeacon } from '@/components/perf-beacon';
import { MetaPixel } from '@/components/meta-pixel';

// Supabase is in ap-southeast-1 (Singapore). Running server functions in the
// same region eliminates ~250ms round-trip latency per DB query.
export const preferredRegion = 'sin1';

export const metadata: Metadata = {
  title: 'CareerRai',
  description: 'Daily prep tracking with your IIM buddy.',
  icons: {
    // Favicons bypass next/image optimization entirely — this used to point at
    // the 223KB monogram, shipping it raw on every page's first paint. 5KB now.
    icon: '/favicon-96.png',
    // Square, opaque 180×180 — used as the iOS Home-Screen icon when a student
    // adds the app via Share → Add to Home Screen (iOS ignores the manifest icons).
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CareerRai',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1c1917',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-stone-50 antialiased min-h-screen">
        <Providers>
          {children}
          <PerfBeacon />
        </Providers>
        <MetaPixel />
      </body>
    </html>
  );
}
