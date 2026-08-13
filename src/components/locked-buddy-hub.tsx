import { SampleDebrief } from '@/components/sample-debrief';
import { BuddyBuyButtons } from '@/components/unlock-buddy-sheet';
import { RecommendedBuddies } from '@/components/recommended-buddies';
import { Testimonials } from '@/components/testimonials';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';
import type { SocialProof } from '@/lib/social-proof';
import { Check } from 'lucide-react';
import { catUrgencyLabel } from '@/lib/cat-countdown';

// The buddy paywall — a full-page SALES ASSET on /student/buddy and /student/chat
// for free users, rebuilt as a DIRECT conversion screen (founder, 24 Jul: the
// old version was a long generic scroll ending in a button that opened another
// sheet — too many taps, too boring for the app's most revenue-critical page).
//
// New shape: a tight, Apple-style hook that pairs a REAL fear (wasting your one
// shot) with a CREDIBLE promise (an IIM senior fixing your direction weekly),
// the honest 4-months urgency, and the PRICE CHOICE rendered right on the page
// — one tap straight to Razorpay, no intermediate sheet. Proof lives below for
// the skeptical; the already-decided can buy in the first screen.
//
// Positioning: the competitor isn't TIME/coaching — it's YouTube + overthinking.
// Students aren't short on effort; they're terrified of preparing the WRONG way
// on their one shot a year. We never say "direction" out loud — students buy
// results, not "course-correction".
export function LockedBuddyHub({
  variant, fullName, recommendedBuddies = [], proof,
}: {
  variant: 'buddy' | 'chat';
  fullName?: string;
  recommendedBuddies?: RecommendedBuddyResult[];
  proof?: SocialProof;
}) {
  const proofLine = proof && proof.mappedTotal >= 25
    ? `${proof.mappedTotal} aspirants have mapped their full CAT syllabus here`
    : proof && proof.startedTotal >= 25
      ? `${proof.startedTotal} aspirants are preparing with CareerRai`
      : null;

  // HERO — fear then cost, one credible promise. No solution named yet.
  const fear = variant === 'chat'
    ? 'Not sure what to do next?'
    : 'The hardest part now isn’t studying.';
  const cost = variant === 'chat'
    ? 'Guessing your next move costs you weeks you don’t have.'
    : 'It’s not knowing if you’re wasting your one shot.';

  return (
    <>
    <div className="mx-auto max-w-md space-y-6 px-1 pt-5 pb-28">
      {/* 1 — the hook: urgency → fear → cost → credible promise.
          Restyled 13 Aug into the same dark hero treatment as S1 (Blueprint
          Reveal) and S3 (Home Position), so this — the most-viewed screen for
          any free student — no longer looks like the one surface tonight
          skipped. COPY IS UNCHANGED: this is the app's most revenue-critical
          page and the fear/cost/promise wording is proven, tested marketing,
          not something to rewrite alongside a visual pass. */}
      <div className="overflow-hidden rounded-3xl bg-stone-900 px-5 py-6 text-center text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-400">{catUrgencyLabel()}</p>
        <h1 className="mt-2.5 text-[26px] font-bold leading-[1.15]" style={{ fontFamily: 'Georgia, serif' }}>
          {fear}
        </h1>
        <p className="mt-2 text-[17px] font-semibold leading-snug text-rose-400">{cost}</p>
        <p className="mx-auto mt-3 max-w-xs text-[15px] font-semibold leading-snug text-stone-200">
          Only <span className="text-orange-400">IIM buddies</span> to guide you.
        </p>
      </div>

      {/* 2 — THE BUY. On the page, above the fold. One tap → Razorpay. */}
      <BuddyBuyButtons fullName={fullName} />

      {/* Zero-commission trust strip (founder) — reframes the price as fair:
          it's going to a real mentor, not a platform cut. */}
      <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center">
        <span className="text-base">🤝</span>
        <p className="text-[12px] font-semibold leading-snug text-emerald-800">
          Zero commission — every rupee goes to your IIM mentor, not a middleman.
        </p>
      </div>

      {/* 3 — the value in three lines, not a feature list */}
      <div className="space-y-2">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Right now, on your own</p>
          <p className="mt-1 text-sm italic leading-relaxed text-stone-500">
            &ldquo;Should I give another mock? Should I revise Algebra? Am I even improving?&rdquo;
          </p>
        </div>
        <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600">With your buddy</p>
          <p className="mt-1 text-sm font-semibold text-purple-900">
            You know exactly what to do today. And tomorrow. All the way to CAT.
          </p>
        </div>
      </div>

      {/* 4 — the honest "enough time" reframe (the game-change belief, grounded) */}
      <p className="px-3 text-center text-[15px] font-semibold leading-snug text-stone-800">
        You don&apos;t need more time.<br />You need the right direction for the time you have.
      </p>

      {/* Real, live social proof — never fabricated */}
      {proofLine && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-center">
          <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-green-800">
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
            {proofLine}
          </p>
        </div>
      )}

      {/* The real mentor — one best match, others one tap away */}
      {recommendedBuddies.length > 0 && (
        <RecommendedBuddies buddies={recommendedBuddies} studentName={fullName} />
      )}

      {/* Product proof — an example mock review, clearly labelled as one */}
      <div>
        <p className="mb-2 text-center text-xs font-medium text-stone-400">See how a buddy decodes a mock (example) 👇</p>
        <SampleDebrief />
      </div>

      {/* Real testimonials — renders only when a genuine quote exists */}
      <Testimonials max={3} />

      {/* Coaching batch vs 1:1 — the wedge */}
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

      <p className="px-2 text-center text-xs leading-relaxed text-stone-400">
        CareerRai doesn&apos;t help you study more — it helps you avoid studying the wrong things.
      </p>
    </div>

    {/* Sticky buy — always one tap from purchase, just above the bottom nav */}
    <div className="fixed inset-x-0 bottom-16 z-20 mx-auto max-w-md px-3">
      <BuddyBuyButtons fullName={fullName} sticky />
    </div>
    </>
  );
}
