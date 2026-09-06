import Link from 'next/link';
import type { RepRemark } from '@/lib/sales-remarks';

// ── MY REMARKS ──────────────────────────────────────────────────────────────
//
// Founder order, 4 Sep 2026: "for each remark they have filled". A
// counsellor's remarks used to be write-only from their own side — they typed
// them all day, and the only person who could read them back was the founder
// on an admin page. That is backwards for the person who collected them.
//
// Two jobs. Before a call it is the memory (the calling card carries the
// per-student history for that). Across a week it is the pattern: four
// students in a row saying "I'm in coaching until 9" is a product
// requirement, and a rep noticing it is worth more than any dashboard,
// because they are the one who can ask the fifth student about it.
//
// SELF-REPORTED, and labelled so (SALES-OS §0). Every line here is a sentence
// a human typed; the system has no telephony record to corroborate any of it.
// Auto-notes are excluded upstream — a log padded with sixty identical 'Did
// not pick up' lines would bury the remarks it exists to show.
export function RepRemarkLog({ items, failed }: { items: RepRemark[]; failed: boolean }) {
  return (
    <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
          My remarks {items.length > 0 && <span className="text-stone-600">{items.length}</span>}
        </p>
        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-400">SELF-REPORTED</span>
      </div>

      {failed ? (
        // A failed read says so. It must never render as "you have written
        // nothing" — that is a confident wrong answer about a rep's own work.
        <p className="text-[12.5px] text-stone-500">Could not load your remarks just now. Refresh to try again.</p>
      ) : items.length === 0 ? (
        <p className="text-[12.5px] text-stone-500">
          Nothing yet. Every connected call asks for one line about what the student said — those lines land here.
        </p>
      ) : (
        <div className="space-y-2.5">
          {items.map((r, i) => (
            <div key={`${r.atIso}-${i}`} className="border-l-2 border-stone-200 pl-3">
              <p className="text-[11px] font-bold text-stone-500">
                <Link href={`/sales/student/${r.studentId}`} className="text-stone-800 hover:underline">
                  {r.studentName || 'Student'}
                </Link>
                <span className="font-normal text-stone-400">
                  {' · '}{new Date(r.atIso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                  {r.outcome ? ` · ${r.outcome.replace(/_/g, ' ')}` : ''}
                </span>
              </p>
              <p className="mt-0.5 text-[12.5px] italic leading-snug text-stone-700">&ldquo;{r.note}&rdquo;</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
