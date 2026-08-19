'use client';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';
import { type MatchBuddy } from '@/lib/buddy-match';
import { mentorCredential } from '@/lib/iim-claim';
import { Briefcase, ExternalLink, Sparkles, ChevronDown } from 'lucide-react';

// The free-tier buddy showcase: real mentors the student
// can browse for free — messaging/booking is what the subscription unlocks.
// Profiles are fully visible (photo, journey, LinkedIn) because a person you
// can verify is the strongest trust lever a tiny brand has. The CTA opens the
// existing unlock sheet, which fires buddy_cta_click → sales-ready.

export interface RecommendedBuddy extends MatchBuddy {
  reason: string | null;
}

function journeyLabel(b: MatchBuddy): string | null {
  if (b.cat_percentile == null) return null;
  const final = `${Number(b.cat_percentile)}%ile`;
  return b.first_attempt_percentile != null
    ? `${Number(b.first_attempt_percentile)} → ${final} on the retake`
    : `${final}, first attempt`;
}

export function RecommendedBuddies({ buddies, studentName }: { buddies: RecommendedBuddy[]; studentName?: string }) {
  const [showAll, setShowAll] = useState(false);
  if (buddies.length === 0) return null;

  // Lead with the recommendation; the alternatives are one tap away.
  //
  // Founder, 19 Aug: keep our recommendation, but give the student the choice.
  // CareerRai still does the matching and still says who it picked and why --
  // what changes is that the student can see the others and decide. Choosing
  // the person you will admit being stuck to is not a thing to be assigned.
  //
  // It stays ONE face until asked, deliberately. Opening with five profiles
  // turns this into a directory to shop in, which is the mentor-marketplace
  // category the founder explicitly does not want. One recommendation, with
  // the door to the rest clearly visible, is a different product.
  const shown = showAll ? buddies : buddies.slice(0, 1);
  const others = buddies.length - 1;

  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Our recommendation</div>
      <p className="text-xs text-stone-400 mt-1 mb-4">
        Matched to your profile from your own preparation. Browse free — start 1:1 mentorship to connect.
      </p>

      <div className="space-y-3">
        {shown.map((b, i) => {
          // When the list is open, the recommendation must stay identifiable —
          // otherwise five equal cards make CareerRai's match invisible and the
          // student is back to picking a stranger from a directory.
          const isPick = i === 0;
          const initials = (b.full_name || 'B').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
          const journey = journeyLabel(b);
          const firstName = b.full_name.split(' ')[0];
          // "Recommended for what?" must ALWAYS have an answer — students with
          // no baseline data yet (fresh signups) produce a null match reason,
          // which previously just hid the line instead of falling back.
          //
          // The fallback said "Verified N%ile IIM alumni mentor" until 19 Aug.
          // Nothing is verified -- iim_verified_at is null for every buddy --
          // and it named an institute on a self-report. The percentile IS a
          // real stored number, so it stands alone; iim-claim.ts decides when
          // the institute may be added, per mentor.
          const credential = mentorCredential(b);
          const reasonText = b.reason ?? (credential
            ? `Cleared CAT at ${credential}`
            : 'Handpicked by CareerRai');

          // 13 Aug: restyled TWICE. The first pass only changed colour and
          // kept the old avatar-left/text-right row — which is exactly why it
          // still read as "the old screen" after that pass. This is the
          // actual structural fix: centered avatar, name, journey pill, real
          // bio as the quote line, tags, then the stats grid — the same
          // layout MentorPool (onboarding S2) now uses, so the two richest
          // mentor cards in the app finally agree with each other and with
          // the mock. Every field is still real; only the arrangement moved.
          return (
            <div key={b.id} className="rounded-2xl border border-white/5 bg-stone-900 p-5">
              <div className="flex flex-col items-center text-center">
                {b.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.avatar_url} alt={b.full_name} className="h-20 w-20 rounded-full object-cover" />
                ) : (
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-2xl font-bold text-white" style={{ fontFamily: 'Georgia, serif' }}>
                    {initials}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Georgia, serif' }}>{b.full_name}</h3>
                  {isPick && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-400">
                      <Sparkles className="w-3 h-3" />Recommended for you
                    </span>
                  )}
                </div>
                {/* The institute renders only when iim-claim.ts allows it. */}
                {mentorCredential(b) && <p className="text-xs text-stone-400">{mentorCredential(b)}</p>}
                {journey && (
                  <span className="mt-2.5 rounded-full bg-white/10 px-3.5 py-1 text-[12px] font-extrabold text-white">CAT {journey}</span>
                )}
              </div>

              {b.how_i_work && (
                <p className="mt-3 border-t border-white/10 pt-3 text-center text-[13px] italic leading-relaxed text-stone-300">
                  &ldquo;{b.how_i_work}&rdquo;
                </p>
              )}

              {b.strongest_section && (
                <div className="mt-2.5 flex justify-center">
                  <Badge color="green">Strong: {b.strongest_section}</Badge>
                </div>
              )}

              <div className="mt-3 rounded-lg bg-orange-400/10 px-3 py-1.5 text-center text-[11px] font-semibold text-orange-400">
                Recommended for {studentName ? studentName.split(' ')[0] : 'you'}: {reasonText}
              </div>

              {b.current_company && (
                <div className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-stone-400">
                  <Briefcase className="w-3.5 h-3.5" />{b.current_company}
                </div>
              )}

              <div className="mt-3 grid grid-cols-3 gap-2">
                {([['1-on-1', 'only yours'], ['Weekly', 'live call'], ['Daily', 'chat replies']] as const).map(([big, small]) => (
                  <div key={big} className="rounded-lg bg-white/5 py-1.5 text-center">
                    <p className="text-[12.5px] font-extrabold text-white">{big}</p>
                    <p className="text-[8.5px] font-semibold uppercase tracking-wide text-stone-400">{small}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3.5 flex items-center justify-between gap-3">
                {b.linkedin_url ? (
                  <a
                    href={b.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4da3ff] hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />Verify on LinkedIn
                  </a>
                ) : <span />}
                <UnlockBuddyButton variant="teal" size="sm">
                  Start with {firstName} &rarr;
                </UnlockBuddyButton>
              </div>
            </div>
          );
        })}
      </div>

      {/* The choice, stated as a question rather than a control. "See 4 other
          buddies" reads as a list to browse; asking whether they want to
          explore keeps our recommendation as the answer and the alternatives
          as an option -- which is the relationship the founder asked for. */}
      {!showAll && others > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-stone-200 bg-white py-2.5 text-xs font-semibold text-stone-600 hover:border-stone-300"
        >
          Want to explore other buddies? See top {buddies.length} <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      <p className="mt-3 text-center text-[11px] text-stone-400">
        One buddy the whole journey — switch anytime. Full refund in your first month if you&apos;ve logged 20+ study days.
      </p>
    </div>
  );
}
