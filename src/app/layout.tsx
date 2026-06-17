import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

// Supabase is in ap-southeast-1 (Singapore). Running server functions in the
// same region eliminates ~250ms round-trip latency per DB query.
export const preferredRegion = 'sin1';

export const metadata: Metadata = {
  title: 'CareerRai',
  description: 'Daily prep tracking with your IIM buddy.',
  icons: {
    icon: '/careerrai-monogram.png',
    apple: '/careerrai-monogram.png',
  },
  manifest: '/manifest.json',
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
        </Providers>
      </body>
    </html>
  );
}
