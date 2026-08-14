import { REPEATER_HEADLINE, type CaseFinding } from '@/lib/buddy-case';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';
import { BookSessionCard } from '@/components/buddy/book-session-card';

// ── The Buddy screen: five blocks, pointer-first, zero paragraphs ───────────
//
// Founder + review, 14 Aug. The mental model of this page is not "here is why
// you need a mentor" — it is "we just showed you something about your own
// preparation you weren't seeing clearly", followed by "₹299 → let's fix it".
//
//   1. WEAK SPOTS — up to three, and ONLY real weaknesses. The first build
//      padded this to three with status facts (SYLLABUS 41/46 · MOCKS 1 day
//      ago · TARGET 42 days) whenever a student had fewer findings, which
//      turned a weakness card into a status card — the founder's word for it
//      was "blunder", and he was right. Padding is deleted: one weakness
//      shows one line. The engine now also reads the signals that were
//      sitting unused — weakest section from their own mock, topics parked at
//      Learning, topics never opened.
//   2. RED STRIP — one line, nothing after it. 1 in 3, the sourced figure.
//   3. THE PERSON — one mentor, why them, and the 5-student cap (enforced by
//      a DB trigger, so it is a promise and not a poster).
//   4. ₹299 — an audit of the weak spots above.
//   5. TILL CAT — one line.
//
// The rule for every line here: minimum words, maximum directness.

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
          {firstName}, your weak spots
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

      {/* ── 2. RED STRIP — one line. Nothing else. ───────────────────────── */}
      <div className="rounded-2xl bg-red-600 px-4 py-3 text-center text-white">
        <p className="text-[14px] font-extrabold leading-snug">{REPEATER_HEADLINE}</p>
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
          {/* Scarcity that is also the quality promise, and it is TRUE — the
              cap is enforced in the assignment queue. */}
          <p className="mt-2.5 border-t border-stone-100 pt-2 text-[12px] font-bold text-stone-800">
            Max 5 students per mentor. Ever.
          </p>
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
        <p className="text-[15px] font-extrabold leading-tight">{buddyFirst} till CAT — ₹2,999 →</p>
      </a>
    </div>
  );
}
