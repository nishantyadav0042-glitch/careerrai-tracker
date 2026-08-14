import { REPEATER_FACT, REPEATER_SO_WHAT, type CaseFinding } from '@/lib/buddy-case';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';
import { BookSessionCard } from '@/components/buddy/book-session-card';

// ── The Buddy screen: five blocks, pointer-first, zero paragraphs ───────────
//
// Founder + review, 14 Aug. The mental model of this page is not "here is why
// you need a mentor" — it is "we just showed you something about your own
// preparation you weren't seeing clearly", followed by "₹299 → let's fix it".
//
//   1. PERSONAL DIAGNOSIS — always exactly three bullets, every one of them
//      this student's own number ("QA — 9/28 topics started"). Real gaps show
//      red; a data-thin student gets neutral personal status facts instead of
//      an invented problem. The generic "nobody is reviewing your prep" line
//      is gone from this card for good — a line any student could receive is
//      a line no student feels.
//   2. RED STRIP — the one sourced external fact. 1 in 3, never ~50: the
//      founder's own research (Careers360) puts repeaters at an estimated
//      30–40%, and both reviews landed on printing the sourced number.
//   3. THE PERSON — one matched mentor and why them.
//   4. ₹299 — framed as a preparation AUDIT of the gaps above, not "45
//      minutes with an IIM guy".
//   5. TILL CAT — the ₹2,999 as an active choice, not a footnote.

function firstIim(raw: string | null): string {
  const first = raw?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : 'IIM alum';
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function BuddyConversionScreen({ firstName, findings, bullets, gapCount, buddy, topKind }: {
  firstName: string;
  findings: CaseFinding[];
  bullets: { chip: string; stat: string; gap: boolean }[];
  gapCount: number;
  buddy: RecommendedBuddyResult | null;
  topKind: string | null;
}) {
  const buddyFirst = buddy?.full_name?.split(' ')[0] ?? 'your Buddy';

  return (
    <div className="mx-auto max-w-md space-y-3 px-1 pt-5 pb-28">

      {/* ── 1. PERSONAL DIAGNOSIS — three pointers, all their own numbers ── */}
      <div className="overflow-hidden rounded-3xl bg-stone-900 px-5 py-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-400">
          {gapCount > 0
            ? `We found ${gapCount === 1 ? '1 gap' : `${gapCount} gaps`} in your prep, ${firstName}`
            : `Your prep right now, ${firstName}`}
        </p>
        <div className="mt-3 space-y-2.5">
          {bullets.map((b) => (
            <div key={b.chip} className="flex items-center gap-2.5">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${b.gap ? 'bg-red-500' : 'bg-stone-500'}`} />
              <p className="min-w-0 text-[14px] leading-tight">
                <span className="font-extrabold">{b.chip}</span>
                <span className="text-stone-300"> — {b.stat}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. RED STRIP — sourced, two lines, no paragraph ──────────────── */}
      <div className="rounded-2xl bg-red-600 px-4 py-3 text-white">
        <p className="text-[13.5px] font-extrabold leading-snug">{REPEATER_FACT}</p>
        <p className="mt-1 text-[12px] font-semibold leading-snug text-red-100">{REPEATER_SO_WHAT}</p>
      </div>

      {/* ── 3. THE PERSON ────────────────────────────────────────────────── */}
      {buddy && (
        <div className="rounded-3xl border border-stone-200 bg-white px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Your IIM Buddy</p>
          <div className="mt-3 flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-stone-900 text-[14px] font-extrabold text-white">
              {initials(buddy.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-extrabold leading-tight text-stone-900">{buddy.full_name}</p>
              <p className="mt-0.5 text-[12.5px] font-semibold text-stone-600">
                {firstIim(buddy.iim_converted)}
                {buddy.cat_percentile != null && <span className="text-stone-500"> · CAT {buddy.cat_percentile}%ile</span>}
              </p>
            </div>
          </div>
          {buddy.reason && (
            <p className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-[12.5px] leading-snug text-orange-900">
              <span className="font-bold">Why {buddyFirst} for you:</span> {buddy.reason}
            </p>
          )}
          {buddy.how_i_work && (
            <p className="mt-2 text-[12px] italic leading-snug text-stone-600">&ldquo;{buddy.how_i_work}&rdquo;</p>
          )}
        </div>
      )}

      {/* ── 4. ₹299 — a prep audit of the gaps above, not "a session" ────── */}
      <BookSessionCard
        findingKind={topKind}
        findingEvidence={findings[0]?.evidence ?? null}
        mentorFirst={buddy ? buddyFirst : null}
        hasGaps={gapCount > 0}
      />

      {/* ── 5. TILL CAT — an active choice, not a footnote ───────────────── */}
      <a href="/offer" className="block rounded-2xl bg-stone-900 px-4 py-3.5 text-white active:scale-[0.99]">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400">Want {buddyFirst} till CAT?</p>
        <p className="mt-1 text-[15px] font-extrabold leading-tight">₹2,999 · your Buddy until exam day</p>
        <p className="mt-0.5 text-[11.5px] font-medium text-stone-300">Weekly review + guidance, all the way. →</p>
      </a>
    </div>
  );
}
