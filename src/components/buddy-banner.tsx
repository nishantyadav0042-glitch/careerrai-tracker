import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { BuddyBanner as BuddyBannerData } from '@/lib/buddy-banner';

// Presentational only — no timer, no rotation, no icon-in-a-gradient-box
// styling that reads as an ad unit. A left rule + a short eyebrow ("Based on
// your progress") is what makes this feel like a noticing, not a pitch. Which
// banner shows is decided server-side by selectBuddyBanner() from the
// student's real signals; this component just renders that one choice.
export function BuddyBanner({ banner, className = '' }: { banner: BuddyBannerData; className?: string }) {
  return (
    <Link
      href="/student/buddy"
      className={`group block border-l-2 border-teal-300 pl-3 py-1 transition-colors hover:border-teal-500 ${className}`}
    >
      {banner.eyebrow && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700 mb-0.5">{banner.eyebrow}</p>
      )}
      <p className="text-sm font-bold text-stone-900">{banner.headline}</p>
      <p className="text-sm text-stone-600 mt-0.5">{banner.sub}</p>
      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-teal-700">
        {banner.cta.replace(/\s*→$/, '')}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
      </p>
    </Link>
  );
}
