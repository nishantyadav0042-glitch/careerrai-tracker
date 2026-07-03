import Image from 'next/image';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';

// Fallback pitch for the Home tab when there are zero showcase-eligible
// buddies yet (real mentors are shown via <RecommendedBuddies> directly on
// Home instead — see student/tracker/page.tsx). This generic card only
// appears in that empty-supply edge case.
export function LockedBuddyCard({ streak = 0, fullName }: { streak?: number; fullName?: string }) {
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
