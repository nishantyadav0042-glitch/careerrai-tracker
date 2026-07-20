'use client';

import { useEffect, useState } from 'react';
import { Target, Bell } from 'lucide-react';
import { track } from '@/lib/journey';
import { setInsightVisible } from '@/lib/first-run-events';

// Day-1 insight — the FIRST thing a student sees in the installed app
// (founder, 21 July: "first thing they should get value from us — where they
// lack as on date, per the topic coverage matrix — then 'we will track your
// pattern now, switch on notifications'"). Runs BEFORE the notification ask,
// the tour, and the buddy pitch (all gated on this via first-run-events).
// Once per device; every number comes server-computed from the student's own
// coverage matrix — nothing invented.

const KEY = 'cr_first_insight_v1';

export interface SectionStanding {
  name: string;    // 'QA' | 'VARC' | 'DILR'
  studied: number; // practicing/revising/exam_ready
  total: number;
}

interface Props {
  weakest: string;            // section with the biggest gap
  untouched: number;          // not-started topics in that section
  sectionTotal: number;       // total topics in that section
  sections: SectionStanding[];
  focusTopics: string[];      // top high-weightage gaps in the weakest section
  fresh: boolean;             // true = nothing studied anywhere yet
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

export function FirstInsight({ weakest, untouched, sectionTotal, sections, focusTopics, fresh }: Props) {
  const [show, setShow] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- one-time first-run gate, client-only detection */
  useEffect(() => {
    if (!isStandalone()) return;
    try { if (localStorage.getItem(KEY)) return; } catch { return; }
    setInsightVisible(true);
    setShow(true);
    track('first_insight_shown', { weakest, fresh });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!show) return null;

  const done = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setShow(false);
    setInsightVisible(false); // dispatches INSIGHT_DONE — notif ask takes the stage
  };

  const maxTotal = Math.max(...sections.map((s) => s.total), 1);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-5 px-6 py-10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">Your first insight</p>
          <h1 className="mt-1 text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            Where you stand today
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            {fresh ? (
              <>You&apos;re starting fresh — every topic is open. That&apos;s not a gap, it&apos;s a clean slate.</>
            ) : (
              <>From your syllabus map, your biggest gap right now is <b>{weakest}</b> — {untouched} of {sectionTotal} topics untouched.</>
            )}
          </p>
        </div>

        {/* Section standing — their own declared coverage, drawn */}
        <div className="space-y-2.5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          {sections.map((s) => (
            <div key={s.name} className="flex items-center gap-2">
              <span className={`w-12 shrink-0 text-xs font-bold ${s.name === weakest && !fresh ? 'text-orange-600' : 'text-stone-600'}`}>{s.name}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200">
                <div
                  className={`h-full rounded-full ${s.name === weakest && !fresh ? 'bg-orange-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.max(3, Math.round((s.studied / Math.max(1, s.total)) * 100))}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-[11px] text-stone-500">{s.studied}/{s.total}</span>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-stone-400">Studied topics per section — from your own coverage map.</p>
        </div>

        {focusTopics.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
            <p className="text-sm leading-relaxed text-stone-700">
              <b>Start here:</b> {focusTopics.join(' & ')} — {fresh ? 'these carry the most marks in CAT.' : `the highest-mark ${weakest} areas you haven't covered yet.`}
            </p>
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-2xl border border-stone-200 p-4">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-stone-900" />
          <p className="text-sm leading-relaxed text-stone-600">
            Don&apos;t worry about remembering any of this. From today, <b>we track your pattern daily</b> and remind you what to study, when — that&apos;s the next step.
          </p>
        </div>

        <button
          type="button"
          onClick={done}
          className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          Got it — set up my reminders →
        </button>
      </div>
    </div>
  );
}
