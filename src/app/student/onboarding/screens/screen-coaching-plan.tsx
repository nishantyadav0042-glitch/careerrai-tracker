'use client';

import { useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { TimetableUpload } from '@/components/timetable-upload';
import type { TimetableKind } from '@/lib/timetable';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// Coaching students ONLY (founder: "who says no, don't give them the option").
// The modal never mounts this screen unless coaching_enrolled is true, so a
// self-study student never sees a coaching question at all.
//
// Why here: a student who is already following a coaching syllabus has an order
// imposed on them. If we don't ask now, our plan spends their first week
// fighting their class. Asking at the point the plan is being built is the only
// moment this costs them nothing.
const OPTIONS: { kind: TimetableKind; label: string; sub: string }[] = [
  { kind: 'weekly',   label: 'A weekly timetable', sub: 'Class schedule for the week' },
  { kind: 'monthly',  label: 'A monthly plan',     sub: 'Topics planned month by month' },
  { kind: 'syllabus', label: 'A full syllabus schedule', sub: 'The whole course, start to finish' },
];

export default function ScreenCoachingPlan({ onNext, isLoading }: Props) {
  const [kind, setKind] = useState<TimetableKind | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Does your coaching give you a timetable?
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
          Add a photo of it and your daily plan will follow your class — same topics, same order.
        </p>
      </div>

      {saved ? (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-600">
              <Check className="h-4 w-4 text-white" strokeWidth={3} />
            </span>
            <p className="text-sm font-bold text-stone-900">Timetable saved</p>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
            Your daily plan will follow it from day one. You can update it any time from your home screen.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {OPTIONS.map((o) => (
              <button
                key={o.kind} type="button"
                onClick={() => { setKind(o.kind); setUploadOpen(true); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left transition-colors hover:border-stone-300"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500">
                  <CalendarClock className="h-5 w-5 text-white" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-stone-900">{o.label}</span>
                  <span className="block text-[12px] text-stone-500">{o.sub}</span>
                </span>
              </button>
            ))}
          </div>

          <button
            type="button" disabled={isLoading} onClick={() => onNext({ coaching_plan_answer: 'none' })}
            className="w-full py-3 text-center text-sm font-medium text-stone-500 disabled:opacity-60"
          >
            They don&apos;t give me one
          </button>
        </>
      )}

      {saved && (
        <button
          type="button" disabled={isLoading} onClick={() => onNext({ coaching_plan_answer: 'uploaded' })}
          className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          Continue →
        </button>
      )}

      {uploadOpen && kind && (
        <TimetableUpload
          kind={kind}
          onClose={(reason) => {
            setUploadOpen(false);
            // Only a real save advances the screen. A dismissal leaves them
            // exactly where they were, free to pick another option or skip —
            // closing a sheet must never silently consume the question.
            if (reason === 'saved') setSaved(true);
          }}
        />
      )}
    </div>
  );
}
