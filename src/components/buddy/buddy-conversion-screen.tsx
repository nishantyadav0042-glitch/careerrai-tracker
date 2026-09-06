import { REPEATER_HEADLINE, type CaseFinding } from '@/lib/buddy-case';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';
import { BookSessionCard } from '@/components/buddy/book-session-card';
import { BuddyPlanLadder } from '@/components/unlock-buddy-sheet';

// ── The Buddy screen: five blocks, pointer-first, zero paragraphs ───────────
//
// Founder + review, 14 Aug. The mental model of this page is not "here is why
// you need a mentor" — it is "we just showed you something about your own
// preparation you weren't seeing clearly", followed by "one session → let's fix it".
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
//   4. One paid session — an audit of the weak spots above.
//   5. THE TWO SUBSCRIPTIONS — monthly, then till CAT. Founder, 2 Sep: all
//      three prices on this screen, ascending (session → monthly → till CAT;
//      the figures live in lib/plans and nowhere else, comments included).
//      The 14 Aug version kept one till-CAT line and hid the monthly plan in
//      a sheet; to a student, a price behind a tap is a price that isn't there.
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

      {/* ── 3. THE PERSON — the hero of this screen, and it must look it ───
          Founder, 14 Aug: "buddy profile ko bahut bogus tareeke se chhupa
          diya hai, ye koi hatke nahi dikh rahi — buddy profile to attractive
          dikhni chahiye." Dead right, and it was a ranking error, not a taste
          one: the two blocks above are a black card and a red strip, so a
          white card with a hairline border read as background. The single
          thing a student is actually buying was the quietest object on screen.

          It is now the loudest, and deliberately in a THIRD register rather
          than more of the same: black states the problem, red states the
          stakes, indigo→violet is the answer. Alarm colours cannot sell
          relief — stacking a third warning-toned card would just read as more
          bad news. The credential is set in gold because that is what a
          credential is: a medal, not caption text. */}
      {buddy && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-violet-800 px-5 py-5 text-white shadow-lg shadow-violet-300/50">
          {/* A soft light source behind the face — depth, so the card reads as
              an object rather than a coloured rectangle. */}
          <div aria-hidden className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

          <p className="relative text-[10px] font-bold uppercase tracking-widest text-violet-200">Your IIM Buddy</p>

          <div className="relative mt-3 flex items-center gap-3.5">
            {buddy.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- storage URL, dimensions unknown
              <img
                src={buddy.avatar_url}
                alt={buddy.full_name}
                className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-amber-300 ring-offset-2 ring-offset-violet-700"
              />
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/15 text-[19px] font-extrabold text-white ring-2 ring-amber-300 ring-offset-2 ring-offset-violet-700">
                {initials(buddy.full_name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[19px] font-extrabold leading-tight">{buddy.full_name}</p>
              {/* The credential as a badge. Grey text under a name is a
                  caption; this is the reason to listen to them. */}
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-2.5 py-1 text-[11px] font-extrabold text-violet-900">
                🎓 {firstIim(buddy.iim_converted)}
                {buddy.cat_percentile != null && <span>· CAT {buddy.cat_percentile}%ile</span>}
              </span>
            </div>
          </div>

          {buddy.reason && (
            <p className="relative mt-4 rounded-xl bg-white/15 px-3 py-2.5 text-[12.5px] leading-snug text-white">
              <span className="font-extrabold text-amber-300">Why {buddyFirst} for you: </span>
              {buddy.reason}
            </p>
          )}
          {buddy.how_i_work && (
            <p className="relative mt-2.5 text-[12.5px] italic leading-snug text-violet-100">
              &ldquo;{buddy.how_i_work}&rdquo;
            </p>
          )}

          {/* Scarcity that is also the quality promise, and it is TRUE — the
              cap is enforced by a DB trigger, not by this sentence. */}
          <p className="relative mt-3.5 flex items-center gap-1.5 border-t border-white/20 pt-3 text-[12.5px] font-extrabold">
            <span aria-hidden>🔒</span> Max 5 students per mentor. Ever.
          </p>
        </div>
      )}

      {/* ── 4. One session — a prep audit of the gaps above, not "a session" ────── */}
      <BookSessionCard
        findingKind={topKind}
        findingEvidence={findings[0]?.evidence ?? null}
        mentorFirst={buddy ? buddyFirst : null}
        hasGaps={gapCount > 0}
      />

      {/* ── 5. THE TWO SUBSCRIPTIONS — visible, not one tap away ────────────
          Until 2 Sep this was a single "till CAT" line that opened the paywall
          sheet, with the monthly plan discoverable only inside it. (Before 25
          Aug it pointed at /offer, the Independence Day page that closes
          itself — the main upsell led to "This offer has closed".) The ladder
          pays through the same shared checkout as the sheet, so there is still
          ONE purchase path; it just no longer hides a rung behind a tap. */}
      <BuddyPlanLadder />
    </div>
  );
}
