import { teamYesterday } from '@/lib/sales-yesterday';
import { SnapshotChips } from '@/components/sales/yesterday-flash';

// ── THE FOUNDER'S COMPILED VIEW OF YESTERDAY (founder order, 3 Sep) ─────────
//
// One row per active seat, plus the combined line — computed by SUMMING the
// per-rep snapshots each rep herself sees, never by a second query, so the
// tower and the rep workspace cannot disagree about the same day.
//
// SELF-REPORTED, and labelled so, per this page's own evidence-class rule:
// every number is a disposition a rep recorded; the system has no telephony
// record and does not pretend to.

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function TeamYesterday({ admin }: { admin: any }) {
  const t = await teamYesterday(admin);

  return (
    <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Yesterday · the whole team
        </h2>
        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
          Self-reported · {t.label}
        </span>
      </div>

      <div className="mt-2.5 space-y-2.5">
        {t.reps.length === 0 && (
          <p className="text-[13px] text-stone-500">No active sales seats.</p>
        )}
        {t.reps.map((r) => (
          <div key={r.repId} className="rounded-lg border border-stone-100 bg-stone-50/60 p-2.5">
            <p className="text-[13px] text-stone-800">
              <strong>{r.repName}</strong>
              {' — '}
              {r.attempts === 0
                ? <span className="font-semibold text-rose-700">recorded nothing yesterday</span>
                : <>
                    <strong>{r.attempts}</strong> dispositions · <strong>{r.studentsTouched}</strong> students
                    {' · '}<strong>{r.callbacksSet}</strong> callbacks · <strong>{r.remarksTyped}</strong> typed remarks
                  </>}
            </p>
            <SnapshotChips s={r} />
          </div>
        ))}
        {t.reps.length > 1 && (
          <p className="border-t border-stone-100 pt-2 text-[13px] font-semibold text-stone-900">
            Together: {t.combined.attempts} dispositions · {t.combined.studentsTouched} students
            {' · '}{t.combined.callbacksSet} callbacks · {t.combined.remarksTyped} typed remarks
          </p>
        )}
      </div>
    </div>
  );
}
