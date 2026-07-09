import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { BuddyBanner as BuddyBannerData } from '@/lib/buddy-banner';

// A photo, not just a quote — a text-only left-rule read as a stray line at
// the bottom of the page, not something with a person behind it. This isn't
// a specific matched buddy (that's what the Buddy tab is for), so it uses
// the same generic buddy photo the rest of the app already uses for "a
// buddy exists" contexts — enough to read as a profile, not an icon-in-a-box
// ad unit. Which banner shows is decided server-side by selectBuddyBanner()
// from the student's real signals; this component just renders that choice.
export function BuddyBanner({ banner, className = '' }: { banner: BuddyBannerData; className?: string }) {
  return (
    <Link
      href="/student/buddy"
      className={`group flex items-start gap-3 rounded-2xl bg-teal-50/70 p-4 transition-colors hover:bg-teal-50 ${className}`}
    >
      <Image
        src="/buddy-logo.jpg"
        alt="Your Buddy"
        width={44}
        height={44}
        className="rounded-full object-cover shrink-0"
      />
      <div className="min-w-0 flex-1">
        {banner.eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700 mb-0.5">{banner.eyebrow}</p>
        )}
        <p className="text-sm font-bold text-stone-900">{banner.headline}</p>
        <p className="text-sm text-stone-600 mt-0.5">{banner.sub}</p>
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-teal-700">
          {banner.cta.replace(/\s*→$/, '')}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
        </p>
      </div>
    </Link>
  );
}
