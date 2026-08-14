import { REPEATER_FACT, REPEATER_SO_WHAT, type CaseFinding } from '@/lib/buddy-case';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';
import { BookSessionCard } from '@/components/buddy/book-session-card';

// ── The Buddy screen for a free student: three blocks, nothing else ─────────
//
// Founder, 14 Aug: "buddy screen is too much. Keep only: each student's
// weakness (3 small pointers), buddy profile + why this buddy, session starts
// at ₹299 book now. Remove everything else."
//
// He is right about why it converts. A student does not buy a mentor because
// the poster was dramatic — they buy at the moment the screen shows THEIR
// problem, one credible human who has solved it, and one small price. So the
// screen is exactly that sentence, top to bottom:
//
//   1. "This is what's going wrong in YOUR prep"  — their own numbers
//   2. "This person has done what you're trying"  — one mentor, one reason
//   3. "₹299. Book now."                          — one button
//
// What was removed: the fear hero, the social-proof line, the sample debrief,
// the USP sections, the zero-commission strip, and the two big subscription
// price cards. The Till-CAT plan survives as one quiet line under the book
// button — the session is the way in, and the upgrade pitch belongs AFTER the
// session, when a real person has just helped them.
//
// Every claim on this screen is either the student's own data (the findings),
// a stored mentor field (name, IIM, percentile), or the one sourced external
// fact (the repeater estimate, hedged exactly as its source hedges it).

const FINDING_ICON: Record<string, string> = {
  mock_drop: '📉', mock_plateau: '📊', consistency: '⏱️',
  no_strategy: '🧭', behind_timeline: '📅', repeating_pattern: '🔁', unreviewed: '👀',
};

function firstIim(raw: string | null): string {
  const first = raw?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : 'IIM alum';
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function BuddyConversionScreen({ firstName, findings, buddy, topKind }: {
  firstName: string;
  findings: CaseFinding[];
  buddy: RecommendedBuddyResult | null;
  topKind: string | null;
}) {
  const buddyFirst = buddy?.full_name?.split(' ')[0] ?? 'your Buddy';

  return (
    <div className="mx-auto max-w-md space-y-3 px-1 pt-5 pb-28">

      {/* ── 1. THE WEAKNESS — their numbers, not our poster ─────────────── */}
      <div className="overflow-hidden rounded-3xl bg-stone-900 px-5 py-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-400">
          We looked at your prep, {firstName}
        </p>
        <div className="mt-3 space-y-3">
          {findings.map((f) => (
            <div key={f.kind} className="flex gap-2.5">
              <span aria-hidden className="text-[15px] leading-tight">{FINDING_ICON[f.kind] ?? '•'}</span>
              <div className="min-w-0">
                <p className="text-[14.5px] font-extrabold leading-tight">{f.title}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-stone-300">{f.evidence}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-white/10 pt-3 text-[12.5px] font-semibold text-stone-200">
          These don&apos;t fix themselves. One conversation usually shows why.
        </p>
      </div>

      {/* ── 2. THE PERSON — one mentor, and why them ────────────────────── */}
      {buddy && (
        <div className="rounded-3xl border border-stone-200 bg-white px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
            Fix it with someone who cracked it
          </p>
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
            <p className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-[12.5px] leading-relaxed text-orange-900">
              <span className="font-bold">Why {buddyFirst}:</span> {buddy.reason}
            </p>
          )}
          {buddy.how_i_work && (
            <p className="mt-2 text-[12.5px] italic leading-relaxed text-stone-600">&ldquo;{buddy.how_i_work}&rdquo;</p>
          )}
          {/* The one external fact this screen is allowed — sourced, hedged as
              the source hedges it, and pointed at the product truth. */}
          <p className="mt-3 border-t border-stone-100 pt-2.5 text-[12px] leading-relaxed text-stone-600">
            <span className="font-bold text-stone-900">{REPEATER_FACT}</span>{' '}
            {REPEATER_SO_WHAT}
          </p>
        </div>
      )}

      {/* ── 3. THE PRICE — one button ───────────────────────────────────── */}
      <BookSessionCard findingKind={topKind} findingEvidence={findings[0]?.evidence ?? null} />

      {/* The Till-CAT plan, demoted to one quiet line. The session is the way
          in; the upgrade pitch lands after a real person has just helped. */}
      <p className="pt-1 text-center text-[12px] text-stone-500">
        Want {buddyFirst} with you till exam day?{' '}
        <a href="/offer" className="font-bold text-stone-800 underline">Buddy till CAT — ₹2,999</a>
      </p>
    </div>
  );
}
