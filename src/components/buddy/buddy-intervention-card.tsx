import { ArrowRight } from 'lucide-react';
import { SESSION_PRICING } from '@/lib/plans';
import Link from 'next/link';
import type { CaseFinding } from '@/lib/buddy-case';

// ── "Solve this yourself, or talk to Shreya" ────────────────────────────────
//
// Founder, 13 Aug: design the card so it reads solve-this-yourself OR talk to
// Shreya now — you need her intervention. Then WHY you need her (the
// student's own weakness), then who she is.
//
// The order is the whole product. A mentor card that opens with a person is a
// marketplace listing and the student has to work out whether they need it.
// A card that opens with "your last four mocks went 62 → 64 → 61 → 63" has
// already told them something true about themselves — and the person below it
// is the answer to a question they now have.
//
// TWO DOORS, ALWAYS. Founder: "solve this yourself OR talk to Shreya." The
// free door is not a decoy — it goes to the real screen where the student can
// act on the finding alone. CareerRai's promise is that a student becomes
// independent; a card that only sells would contradict the free product we
// spend every other screen building.
//
// ── WHAT WE MAY SAY ABOUT A MENTOR ──────────────────────────────────────────
//
// Checked against the live table before this was written, and it is thinner
// than it looks: all eight mentors have a name, the IIMs they converted and a
// CAT percentile. ONE has a bio. NONE has a photo. There is no specialities
// column at all, and every mentor row has is_repeater = false.
//
// So this card renders identity and nothing more. It does NOT claim
// "specialises in mock analysis", it does NOT say "she was a repeater too",
// and it does NOT list services — the founder's own instruction, for the same
// reason: we never collected them. An invented speciality is the mentor
// version of the ~50% statistic, and it would break the first time a student
// asked her about it in the session they paid for.
//
// What we CAN say is true and enough: she has done the thing the student is
// trying to do, and she will look at their actual preparation.

export interface MentorIdentity {
  fullName: string;
  /** The IIMs they converted, as they gave it. May be a list. */
  iimConverted: string | null;
  catPercentile: number | null;
  /** Only one mentor has written one so far; the card works without it. */
  bio: string | null;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

/** The first IIM only. The full list reads as a brag; one reads as a fact. */
function primaryIim(raw: string | null): string | null {
  const first = raw?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export function BuddyInterventionCard({
  finding, mentor, selfFixHref, onBookHref, priceLabel = SESSION_PRICING.display,
}: {
  /** The strongest TRUE thing we know is going wrong. */
  finding: CaseFinding;
  mentor: MentorIdentity;
  /** Where "solve it myself" actually goes — a real screen, never a dead end. */
  selfFixHref: string;
  onBookHref: string;
  priceLabel?: string;
}) {
  const first = mentor.fullName.split(' ')[0];
  const iim = primaryIim(mentor.iimConverted);

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {/* ── The finding leads. Evidence first, in their own numbers. ────── */}
      <div className="bg-stone-900 px-4 py-3 text-white">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400">
          We noticed something
        </p>
        <p className="mt-1 text-[15px] font-extrabold leading-tight">{finding.title}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-stone-300">{finding.evidence}</p>
      </div>

      <div className="p-4">
        {/* ── WHY YOU NEED HER — the finding, turned into a consequence ──── */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          Why you need {first}
        </p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-stone-800">{finding.soWhat}</p>

        {/* ── WHO SHE IS — identity only. Everything here is a stored field.
               No specialities, no services, no invented story. ───────────── */}
        <div className="mt-3 flex items-start gap-3 rounded-xl bg-stone-50 p-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-stone-900 text-[13px] font-extrabold text-white">
            {initials(mentor.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-extrabold leading-tight text-stone-900">{mentor.fullName}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-stone-600">
              {iim ?? 'IIM alumna'}
              {mentor.catPercentile != null && (
                <span className="text-stone-500"> · CAT {mentor.catPercentile}%ile</span>
              )}
            </p>
            {/* Rendered only when she actually wrote one. */}
            {mentor.bio && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-stone-600">&ldquo;{mentor.bio}&rdquo;</p>
            )}
            <p className="mt-1.5 text-[11.5px] leading-snug text-stone-500">
              She has cleared what you&apos;re preparing for — and she&apos;ll look at your actual
              preparation, not give general advice.
            </p>
          </div>
        </div>

        {/* ── TWO DOORS ──────────────────────────────────────────────────── */}
        <div className="mt-4 space-y-2">
          <Link
            href={onBookHref}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-3 text-[14px] font-extrabold text-white transition-transform active:scale-[0.99]"
          >
            Talk to {first} — {priceLabel} <ArrowRight className="h-4 w-4" />
          </Link>
          {/* Never a decoy. This goes to the screen where they can act on the
              finding alone — the free product is the promise, not the bait. */}
          <Link
            href={selfFixHref}
            className="flex w-full items-center justify-center rounded-xl border border-stone-300 bg-white py-2.5 text-[13px] font-bold text-stone-600 transition-transform active:scale-[0.99]"
          >
            I&apos;ll fix this myself
          </Link>
        </div>

        <p className="mt-2 text-center text-[10.5px] leading-snug text-stone-400">
          One 1:1 call on Google Meet. You leave with a written next step.
        </p>
      </div>
    </div>
  );
}
