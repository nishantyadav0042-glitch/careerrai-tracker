'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Pencil } from 'lucide-react';
import { TimetableUpload } from '@/components/timetable-upload';
import { CoachingMirror } from '@/components/coaching-mirror';
import { whenLabel, timeLabel, type TimetableBlock } from '@/lib/timetable';

// The PERMANENT way to reach the coaching-timetable scanner.
//
// The first-2-days popup is discovery, not access. It competes for the shared
// once-per-day modal slot, so on any day the install journey or buddy nudge
// gets there first the popup never appears at all — and before this card
// existed, that left the feature genuinely unreachable. It also matters for
// students who join a coaching batch in month three, long after the popup
// window has closed.
export function TimetableCard() {
  const [blocks, setBlocks] = useState<TimetableBlock[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  // Self-study students never see this card at all — there is no coaching
  // timetable for them to upload.
  const [hidden, setHidden] = useState(false);
  const [planSource, setPlanSource] = useState<string>('careerrai');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/timetable');
      const json = await res.json();
      setBlocks(json.timetable?.blocks ?? null);
      setPlanSource(json.planSource ?? 'careerrai');
      if (json.coachingEnrolled === false && !json.timetable) setHidden(true);
    } catch { /* leave as null — the upload path still works */ }
    setLoading(false);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of
     the saved timetable; there is no server-rendered value to seed this from */
  useEffect(() => { void load(); }, [load]);

  if (hidden) return null;

  return (
    <div>
      {/* Progress against the coaching's own quota, above the upload card —
          it's the reason to come back, the upload is just how it got here. */}
      <div className="mb-4"><CoachingMirror /></div>

      <h2 className="mb-2 text-lg font-semibold text-stone-900">Coaching timetable</h2>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        {loading ? (
          <p className="text-sm text-stone-400">Loading…</p>
        ) : blocks && blocks.length > 0 ? (
          <>
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-sm text-stone-700">
                {planSource === 'coaching'
                  ? <>Your plan is following <span className="font-semibold">{blocks.length}</span>{' '}
                      {blocks.length === 1 ? 'class' : 'classes'} a week.</>
                  : <>Saved — <span className="font-semibold">{blocks.length}</span>{' '}
                      {blocks.length === 1 ? 'class' : 'classes'} a week. You chose your own topic order.</>}
              </p>
              <button
                type="button" onClick={() => setOpen(true)}
                className="flex shrink-0 items-center gap-1 text-xs font-semibold text-orange-600 hover:underline"
              >
                <Pencil className="h-3 w-3" /> Replace
              </button>
            </div>
            <div className="space-y-1">
              {blocks.slice(0, 6).map((b, i) => (
                <div key={`${b.date ?? b.dayIndex ?? b.day}-${b.start ?? "all"}-${i}`} className="flex items-center gap-2 text-xs text-stone-600">
                  <span className="w-12 shrink-0 font-bold text-stone-500">{whenLabel(b)}</span>
                  <span className="w-24 shrink-0 tabular-nums">{timeLabel(b)}</span>
                  <span className="min-w-0 truncate font-medium text-stone-800">{b.topic ?? b.label}</span>
                </div>
              ))}
              {blocks.length > 6 && (
                <p className="pt-1 text-[11px] text-stone-400">+{blocks.length - 6} more</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500">
                <CalendarClock className="h-5 w-5 text-white" />
              </span>
              <p className="text-sm leading-relaxed text-stone-700">
                Going to a coaching class? Upload your timetable and your plan will push the same topics your class is
                teaching, instead of pulling you somewhere else.
              </p>
            </div>
            <button
              type="button" onClick={() => setOpen(true)}
              className="mt-4 w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white"
            >
              Upload my timetable
            </button>
          </>
        )}
      </div>

      {open && (
        <TimetableUpload
          onClose={(reason) => {
            setOpen(false);
            // Re-read after a save so the card immediately shows what's live.
            if (reason === 'saved') void load();
          }}
        />
      )}
    </div>
  );
}
