import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';
import { type MatchBuddy } from '@/lib/buddy-match';
import { Briefcase, ExternalLink, Sparkles, Lock } from 'lucide-react';

// The free-tier buddy showcase: real, verified IIM-alumni mentors the student
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
  if (buddies.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Recommended buddies for you</div>
      <p className="text-xs text-stone-400 mt-1 mb-4">
        Real IIM seniors, matched to your profile. Browse free — subscribe to connect with one.
      </p>

      <div className="space-y-3">
        {buddies.map((b, i) => {
          const initials = (b.full_name || 'B').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
          const journey = journeyLabel(b);
          const firstName = b.full_name.split(' ')[0];
          // "Who is this?" must be answered in the first two lines: name, then
          // college + percentile immediately below — not buried in a badge row.
          const subtitle = [b.iim_converted, journey ? `CAT ${journey}` : null].filter(Boolean).join(' · ');
          // "Recommended for what?" must ALWAYS have an answer — students with
          // no baseline data yet (fresh signups) produce a null match reason,
          // which previously just hid the line instead of falling back.
          const reasonText = b.reason ?? (b.cat_percentile != null
            ? `Verified ${Number(b.cat_percentile)}%ile IIM alumni mentor`
            : 'Handpicked IIM alumni mentor');

          return (
            <div key={b.id} className="rounded-2xl border border-stone-200 p-4">
              <div className="flex items-start gap-3">
                {b.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.avatar_url} alt={b.full_name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-stone-900">{b.full_name}</span>
                    {i === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                        <Sparkles className="w-3 h-3" />Best match
                      </span>
                    )}
                  </div>
                  {subtitle && <p className="text-xs font-semibold text-teal-700 mt-0.5">{subtitle}</p>}
                  {b.strongest_section && (
                    <div className="mt-1.5">
                      <Badge color="green">Strong: {b.strongest_section}</Badge>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2.5 rounded-lg bg-orange-50 px-3 py-1.5 text-[11px] font-semibold text-orange-700">
                Recommended for {studentName ? studentName.split(' ')[0] : 'you'}: {reasonText}
              </div>

              {b.current_company && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-stone-600">
                  <Briefcase className="w-3.5 h-3.5 text-stone-400" />{b.current_company}
                </div>
              )}
              {b.how_i_work && (
                <p className="mt-2 text-xs text-stone-600 italic leading-relaxed border-l-2 border-teal-200 pl-2.5">
                  &ldquo;{b.how_i_work}&rdquo;
                </p>
              )}

              <div className="mt-3 flex items-center justify-between gap-3">
                {b.linkedin_url ? (
                  <a
                    href={b.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0a66c2] hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />Verify on LinkedIn
                  </a>
                ) : <span />}
                <UnlockBuddyButton variant="teal" size="sm">
                  <Lock className="w-3.5 h-3.5" /> Connect with {firstName}
                </UnlockBuddyButton>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[11px] text-stone-400">
        Your buddy tracks you daily, decodes every mock, and meets you weekly — 21-day full refund.
      </p>
    </Card>
  );
}
