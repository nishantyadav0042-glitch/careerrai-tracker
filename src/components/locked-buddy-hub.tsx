import { SampleDebrief } from '@/components/sample-debrief';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';

// Full-page locked state shown on /student/buddy and /student/chat for free
// users — instead of the real hub. Makes the gap felt and offers the unlock.
export function LockedBuddyHub({ variant }: { variant: 'buddy' | 'chat' }) {
  const heading = variant === 'chat' ? 'Chat aapke IIM buddy se 🔒' : 'Aapka IIM buddy 🔒';
  const sub =
    variant === 'chat'
      ? 'Jab atko, seedha apne senior se baat karo — text aur voice. Yeh premium me unlock hota hai.'
      : 'Daily tracking, weekly 1-on-1 session, aur har mock ka analysis — ek real IIM senior ke saath.';

  return (
    <div className="mx-auto max-w-md space-y-5 px-1 py-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-purple-100 text-3xl">
          🔒
        </div>
        <h1 className="text-lg font-bold text-stone-900">{heading}</h1>
        <p className="mx-auto mt-1 max-w-xs text-sm text-stone-600">{sub}</p>
      </div>

      <p className="text-center text-xs font-medium text-stone-400">
        Yeh hai woh jo aapko har mock pe milega 👇
      </p>
      <SampleDebrief />

      <div className="rounded-2xl bg-stone-50 px-4 py-3 text-center">
        <span className="text-2xl font-bold text-stone-900">₹999</span>
        <span className="text-sm text-stone-500">/month</span>
        <p className="mt-0.5 text-[11px] text-stone-400">21-din try karo, value na mile toh full refund.</p>
      </div>

      <UnlockBuddyButton variant="primary" size="lg" className="w-full">
        Unlock your buddy →
      </UnlockBuddyButton>
    </div>
  );
}
