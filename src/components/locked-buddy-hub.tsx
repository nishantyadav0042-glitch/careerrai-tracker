import { SampleDebrief } from '@/components/sample-debrief';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';
import { RecommendedBuddies } from '@/components/recommended-buddies';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';
import { ListChecks, LineChart, Wrench, RefreshCw, ShieldCheck, Check } from 'lucide-react';

// The buddy paywall — a full-page SALES ASSET on /student/buddy and /student/chat
// for free users.
//
// Positioning: the competitor isn't TIME/Rodha — it's YouTube + Telegram +
// overthinking. Students aren't short on effort; they're terrified of preparing
// the WRONG way on their one shot a year. INTERNALLY the engine is "direction /
// course-correction"; EXTERNALLY we never say that — students buy results, not
// "direction" (Apple sells "it just works", not "beautiful HCI").
//
// The ladder, top to bottom: FEAR → COST → PROMISE → MECHANISM. Problem FIRST,
// buddy SECOND — the student must feel "I might be preparing wrong" before the
// mentor is introduced, so the buddy reads as the obvious answer, not another
// mentorship upsell.
export function LockedBuddyHub({
  variant, fullName, recommendedBuddies = [],
}: {
  variant: 'buddy' | 'chat';
  fullName?: string;
  recommendedBuddies?: RecommendedBuddyResult[];
}) {
  // FEAR + COST — the hook. No mention of the solution yet.
  const fear = variant === 'chat'
    ? 'Not sure what to do next?'
    : 'Are you sure you’re preparing the right way?';
  const cost = variant === 'chat'
    ? 'Guessing your next move can cost you weeks before your one shot.'
    : 'One wrong strategy can cost you an entire CAT attempt.';

  // PROMISE — emotionally stronger than "get the right strategy". Cards are
  // outcomes the student feels, never features.
  const outcomes = [
    { icon: ListChecks, title: 'Know exactly what to study next' },
    { icon: LineChart, title: 'Understand why your mock score changed' },
    { icon: Wrench, title: 'Fix mistakes before they become habits' },
    { icon: RefreshCw, title: 'A preparation plan that evolves every week' },
    { icon: ShieldCheck, title: 'Stop second-guessing every decision' },
  ];

  return (
    <>
    <div className="mx-auto max-w-md space-y-5 px-1 pt-4 pb-28">
      {/* 1 — FEAR + COST. Problem only. */}
      <div className="text-center">
        <h1 className="text-[23px] font-bold leading-snug text-stone-900">{fear}</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-relaxed text-red-600">{cost}</p>
      </div>

      {/* 2 — PROMISE. The relief, as outcomes. */}
      <div>
        <p className="mb-2 text-center text-[13px] font-semibold text-stone-900">
          Never spend another week wondering what to do next.
        </p>
        <div className="space-y-1.5">
          {outcomes.map((p) => (
            <div key={p.title} className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-50">
                <p.icon className="h-3.5 w-3.5 text-purple-600" />
              </div>
              <p className="text-[13px] font-semibold text-stone-900">{p.title}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3 — MECHANISM. Only now introduce the buddy — as the how, not the pitch. */}
      <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4 text-center">
        <p className="text-sm leading-relaxed text-stone-700">
          Here’s how: your <span className="font-semibold text-stone-900">IIM Buddy</span> reviews your
          preparation, analyses every mock, and tells you <span className="font-semibold text-stone-900">exactly what to do next</span>.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 font-semibold text-teal-700">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Verified IIM alumni mentors
          </span>
          <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 font-medium text-stone-600">
            Every buddy cleared CAT · 95%ile+
          </span>
        </div>
      </div>

      {/* The mentor — one best match, others one tap away */}
      {recommendedBuddies.length > 0 && (
        <RecommendedBuddies buddies={recommendedBuddies} studentName={fullName} />
      )}

      {/* Proof of the product — a real mock review */}
      <div>
        <p className="mb-2 text-center text-xs font-medium text-stone-400">
          See a real mock review 👇
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
            <li>No one reviews your prep</li>
          </ul>
        </div>
        <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-3">
          <p className="font-semibold text-purple-700">Your IIM buddy</p>
          <ul className="mt-1.5 space-y-1 text-purple-900">
            <li className="flex gap-1"><Check className="h-3.5 w-3.5 shrink-0" /> Just you, 1-on-1</li>
            <li className="flex gap-1"><Check className="h-3.5 w-3.5 shrink-0" /> Plan built for you</li>
            <li className="flex gap-1"><Check className="h-3.5 w-3.5 shrink-0" /> Prep reviewed weekly</li>
          </ul>
        </div>
      </div>

      {/* Price + guarantee */}
      <div className="rounded-2xl bg-stone-900 px-4 py-4 text-center">
        <p className="text-sm text-stone-300">Your IIM Buddy, from</p>
        <p className="mt-0.5">
          <span className="text-3xl font-bold text-white">₹999</span>
          <span className="text-sm text-stone-400">/month</span>
        </p>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
          <ShieldCheck className="h-3.5 w-3.5 text-orange-400" />
          No auto-debit — you&apos;re in control of every renewal.
        </p>
      </div>

      {/* The positioning sentence, stated plainly */}
      <p className="px-2 text-center text-xs leading-relaxed text-stone-400">
        CareerRai doesn’t help you study more — it helps you avoid studying the wrong things.
      </p>

    </div>

    {/* Constant CTA — always visible, just above the bottom nav */}
    <div className="fixed inset-x-0 bottom-16 z-20 mx-auto max-w-md px-3">
      <UnlockBuddyButton variant="primary" size="lg" className="w-full shadow-xl shadow-stone-900/20" fullName={fullName}>
        Get my preparation reviewed →
      </UnlockBuddyButton>
    </div>
    </>
  );
}
