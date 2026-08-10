import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { PerfBeacon } from '@/components/perf-beacon';
import { MetaPixel } from '@/components/meta-pixel';
import { JourneyTracker } from '@/components/journey-tracker';
import { InAppBrowserEscape } from '@/components/install/in-app-escape';

// Supabase is in ap-southeast-1 (Singapore). Running server functions in the
// same region eliminates ~250ms round-trip latency per DB query.
export const preferredRegion = 'sin1';

export const metadata: Metadata = {
  // Descriptor-led for STRANGERS (the Google result, the share card): say what
  // it is and tease the buddy in the same breath. The emotional "for the
  // students, by the students" line lives IN-APP (the logo), where affinity is
  // built — not here, where clarity wins.
  title: 'CareerRai — CAT prep, tracked. With a real IIM buddy.',
  description: 'Your CAT prep, on track — a daily plan, a live syllabus tracker, and a real IIM buddy who reads your mocks. Log in or start free.',
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
          <JourneyTracker />
        </Providers>
        {/* Paid traffic lands in Meta's in-app browser (install + push dead end).
            Self-gates: renders only inside FB/IG/Messenger webviews. */}
        <InAppBrowserEscape />
        <MetaPixel />
      </body>
    </html>
  );
}
