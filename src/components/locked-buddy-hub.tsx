import { SampleDebrief } from '@/components/sample-debrief';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';
import { RecommendedBuddies } from '@/components/recommended-buddies';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';
import { Users, CalendarDays, LineChart, MessageCircle, Repeat2, ShieldCheck, Check } from 'lucide-react';

// The buddy upsell — a full-page SALES ASSET shown on /student/buddy and
// /student/chat for free users instead of the real hub. Sells the one thing
// that's paywalled: a 1:1 IIM-alumni mentor. Every line is a conversion lever.
// Real mentor profiles (when any exist) lead the page — a face beats a bullet
// list — with the generic value props as backup underneath.
export function LockedBuddyHub({
  variant, fullName, recommendedBuddies = [],
}: {
  variant: 'buddy' | 'chat';
  fullName?: string;
  recommendedBuddies?: RecommendedBuddyResult[];
}) {
  const heading = variant === 'chat' ? 'Chat is part of your IIM buddy' : 'Unlock your IIM buddy';

  // The USP — title-only, compact. The mentor profile is the hero; these are
  // one-line reasons, not paragraphs, so the buddy shows without scrolling.
  const props = [
    { icon: Users, title: 'Only 1:1 — batches don’t exist' },
    { icon: MessageCircle, title: 'An elder sibling, a message away' },
    { icon: CalendarDays, title: 'Ask for a session any day you want' },
    { icon: LineChart, title: 'Analyse every mock together' },
    { icon: Repeat2, title: 'One buddy the whole journey — switch anytime' },
  ];

  return (
    <>
    <div className="mx-auto max-w-md space-y-4 px-1 pt-3 pb-28">
      {/* Hero — compact: heading + proof chips, no lock, no paragraph */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-stone-900">{heading}</h1>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 font-semibold text-teal-700">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Verified IIM alumni mentors
          </span>
          <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 font-medium text-stone-600">
            Every buddy cleared CAT · 95%ile+
          </span>
        </div>
      </div>

      {/* USP — compact one-line rows, title only */}
      <div className="space-y-1.5">
        {props.map((p) => (
          <div key={p.title} className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-50">
              <p.icon className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <p className="text-[13px] font-semibold text-stone-900">{p.title}</p>
          </div>
        ))}
      </div>

      {/* Then the mentor — one best match, others one tap away */}
      {recommendedBuddies.length > 0 && (
        <RecommendedBuddies buddies={recommendedBuddies} studentName={fullName} />
      )}

      {/* Proof of the product — the sample debrief */}
      <div>
        <p className="mb-2 text-center text-xs font-medium text-stone-400">
          Here&apos;s what you get on every mock 👇
        </p>
        <SampleDebrief />
      </div>

      {/* Group vs 1:1 contrast — the wedge */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
          <p className="font-semibold text-stone-500">Coaching batch</p>
          <ul className="mt-1.5 space-y-1 text-stone-500">
            <li>200 students, 1 teacher</li>
            <li>Same plan for everyone</li>
            <li>No one tracks you</li>
          </ul>
        </div>
        <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-3">
          <p className="font-semibold text-purple-700">Your IIM buddy</p>
          <ul className="mt-1.5 space-y-1 text-purple-900">
            <li className="flex gap-1"><Check className="h-3.5 w-3.5 shrink-0" /> Just you, 1-on-1</li>
            <li className="flex gap-1"><Check className="h-3.5 w-3.5 shrink-0" /> Plan built for you</li>
            <li className="flex gap-1"><Check className="h-3.5 w-3.5 shrink-0" /> Tracked daily</li>
          </ul>
        </div>
      </div>

      {/* Price + guarantee */}
      <div className="rounded-2xl bg-stone-900 px-4 py-4 text-center">
        <p className="text-sm text-stone-300">Your IIM buddy, start at</p>
        <p className="mt-0.5">
          <span className="text-3xl font-bold text-white">₹999</span>
          <span className="text-sm text-stone-400">/month</span>
        </p>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
          <ShieldCheck className="h-3.5 w-3.5 text-orange-400" />
          No auto-debit — you&apos;re in control of every renewal.
        </p>
      </div>

    </div>

    {/* Constant unlock button — always visible, just above the bottom nav */}
    <div className="fixed inset-x-0 bottom-16 z-20 mx-auto max-w-md px-3">
      <UnlockBuddyButton variant="primary" size="lg" className="w-full shadow-xl shadow-stone-900/20" fullName={fullName}>
        Unlock your IIM buddy →
      </UnlockBuddyButton>
    </div>
    </>
  );
}
