import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import type { BuddyBanner as BuddyBannerData } from '@/lib/buddy-banner';

// Presentational only — no timer, no rotation. Which banner shows is decided
// server-side by selectBuddyBanner() from the student's real signals; this
// component just renders that one choice until the caller's data changes it.
export function BuddyBanner({ banner, className = '' }: { banner: BuddyBannerData; className?: string }) {
  return (
    <Link
      href="/student/buddy"
      className={`group block rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-teal-50 p-4 transition-all hover:shadow-md hover:border-teal-300 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-900">{banner.headline}</p>
          <p className="text-sm text-stone-600 leading-relaxed mt-0.5">{banner.sub}</p>
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-teal-700">
            {banner.cta.replace(/\s*→$/, '')}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
          </p>
        </div>
      </div>
    </Link>
  );
}
