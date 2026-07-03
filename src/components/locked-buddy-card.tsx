import Image from 'next/image';
import Link from 'next/link';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';

// The dashboard "buddy-taste" hook for free users — the very first thing a
// student sees, so it leads with a REAL matched mentor (photo/name/why-for-you)
// whenever one exists, instead of a generic locked silhouette. Falls back to
// the generic copy only when no buddy is showcase-eligible yet.
export function LockedBuddyCard({
  streak = 0, fullName, topBuddy,
}: {
  streak?: number;
  fullName?: string;
  topBuddy?: RecommendedBuddyResult | null;
}) {
  if (topBuddy) {
    const initials = (topBuddy.full_name || 'B').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    return (
      <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4">
        <div className="flex items-start gap-3">
          {topBuddy.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={topBuddy.avatar_url} alt={topBuddy.full_name} className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900">Recommended for you: {topBuddy.full_name}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
              {topBuddy.reason ?? (topBuddy.cat_percentile != null ? `CAT ${Number(topBuddy.cat_percentile)}%ile mentor` : 'A real IIM senior mentor')}
              {' — '}browse their full profile free, subscribe to connect.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Link
            href="/student/buddy"
            className="flex-1 flex items-center justify-center rounded-xl border border-purple-200 bg-white px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50"
          >
            See profile
          </Link>
          <UnlockBuddyButton variant="primary" size="md" className="flex-1" fullName={fullName}>
            Unlock →
          </UnlockBuddyButton>
        </div>
      </div>
    );
  }

  // Day-3+ : name the gap. Earlier: plant the idea.
  const headline =
    streak >= 3
      ? `${streak} days in 👏 — but stay sharp`
      : 'Your IIM buddy 🔒';
  const body =
    streak >= 3
      ? 'No one checked in on what you did today. That one thing — a senior who tracks you daily — is what makes the difference come November.'
      : 'A real IIM senior who reviews your logs daily, decodes every mock with you, and meets you every week. Locked for now.';

  return (
    <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Image
            src="/buddy-logo.jpg"
            alt="IIM buddy"
            width={48}
            height={48}
            className="rounded-full object-cover opacity-60 grayscale"
          />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs shadow">
            🔒
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-900">{headline}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-600">{body}</p>
        </div>
      </div>
      <UnlockBuddyButton variant="primary" size="md" className="mt-3 w-full" fullName={fullName}>
        Unlock your buddy →
      </UnlockBuddyButton>
    </div>
  );
}
