'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, LayoutGrid, Check } from 'lucide-react';
import Link from 'next/link';
import { track } from '@/lib/journey';
import { STATUS_ORDER, STATUS_LABEL, type CoverageStatus } from '@/lib/coverage-review';

// The mandatory weekly coverage checkpoint.
//
// Every engine reads topic_coverage. A matrix filled once at onboarding and
// never revisited quietly makes all of them wrong — and worse, confidently
// wrong, because stale data looks identical to fresh data.
//
// Not dismissible by design (founder: mandatory for all). What keeps that
// tolerable is that it never asks about all 48 topics: it leads with what the
// student actually worked on since their last review, and "nothing moved" is
// one tap and a completely valid answer.
interface Row { topic: string; section: string; status: CoverageStatus }

export function WeeklyCoverageReview({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Map<string, CoverageStatus>>(new Map());
  const [neverReviewed, setNeverReviewed] = useState(false);
  const [daysSince, setDaysSince] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/coverage/weekly-review');
      const json = await res.json();
      if (!json.due) { onDone(); return; }
      setRows((json.topics as Row[]) ?? []);
      setNeverReviewed(!!json.neverReviewed);
      setDaysSince((json.daysSince as number | null) ?? null);
      track('coverage_review_shown', { topics: (json.topics ?? []).length, neverReviewed: !!json.neverReviewed });
    } catch {
      // A failed fetch must not trap the student behind a blank blocking sheet.
      onDone();
    }
  }, [onDone]);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const updates = [...picked.entries()].map(([topic, status]) => ({ topic, status }));
      const res = await fetch('/api/coverage/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not save. Please try again.');
        setSaving(false);
        return;
      }
      track('coverage_reviewed', { applied: json.applied ?? 0, offered: rows?.length ?? 0 });
      onDone();
    } catch {
      setError('Could not save. Please try again.');
      setSaving(false);
    }
  }

  if (rows === null) return null;

  return (
    <div className="fixed inset-0 z-[86] flex items-end justify-center bg-stone-900/60 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-900">
          <LayoutGrid className="h-6 w-6 text-white" />
        </span>

        <h2 className="mt-4 text-xl font-bold text-stone-900">
          {neverReviewed ? 'Where are you right now?' : 'What moved this week?'}
        </h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-stone-600">
          {rows.length === 0
            ? 'Nothing has changed on your plan since your last check. Confirm and carry on.'
            : 'Your plan, your pace and your mock advice all read from this. Tap anything that has moved on.'}
          {daysSince != null && daysSince >= 14 && (
            <> It&apos;s been <span className="font-semibold text-stone-800">{daysSince} days</span>.</>
          )}
        </p>

        <div className="mt-5 space-y-3">
          {rows.map((r) => {
            const current = picked.get(r.topic) ?? r.status;
            // Forward-only: the API rejects downgrades, so we don't offer them
            // and then silently drop the tap. 'exam_ready' is excluded for the
            // same reason — it is earned from evidence, not chosen from a chip
            // row, and offering it here was how ten topics acquired it.
            const options = STATUS_ORDER
              .slice(STATUS_ORDER.indexOf(r.status))
              .filter((s) => s !== 'exam_ready');
            return (
              <div key={r.topic}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">{r.topic}</p>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-stone-400">{r.section}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((s) => (
                    <button
                      key={s} type="button"
                      onClick={() => setPicked((prev) => {
                        const n = new Map(prev);
                        if (s === r.status) n.delete(r.topic); else n.set(r.topic, s);
                        return n;
                      })}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        current === s ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}

        <button
          type="button" onClick={submit} disabled={saving}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving
            ? (<><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>)
            : (<><Check className="h-4 w-4" /> {picked.size > 0 ? `Update ${picked.size} ${picked.size === 1 ? 'topic' : 'topics'}` : 'Nothing moved'}</>)}
        </button>

        <Link
          href="/student/plan/topics"
          onClick={onDone}
          className="mt-2 block w-full py-2.5 text-center text-sm font-medium text-stone-500"
        >
          Open the full matrix instead
        </Link>
      </div>
    </div>
  );
}
