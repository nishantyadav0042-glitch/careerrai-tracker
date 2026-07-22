'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { ArrowLeft, Target, TrendingUp, Clock } from 'lucide-react';
import { resolveCatExamDate } from '@/lib/routine-engine';

export function GoalEditor({
  userId,
  currentCRS,
  initialTarget,
  initialStudyHours,
  attemptYear,
}: {
  userId: string;
  currentCRS: number | null;
  initialTarget: number;
  initialStudyHours: number;
  attemptYear: number | null;
}) {
  const supabase = createClient();
  const [targetPercentile, setTargetPercentile] = useState<number>(initialTarget);
  const [studyHours, setStudyHours] = useState<number>(initialStudyHours);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

   
   
  const examDate = resolveCatExamDate(new Date(), attemptYear);
  // eslint-disable-next-line react-hooks/purity -- same per-render "now" as the line above
  const daysToCat = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86_400_000));

  async function save() {
    setSaving(true);
    // Writes the user's own row (RLS-scoped). Not on the page-load path.
    await supabase
      .from('profiles')
      // Keep the two daily-hours columns in lock-step. study_target_hours is
      // canonical (readers use `study_target_hours ?? hours_available`), but the
      // buddy dossier / admin list / some crons still read hours_available
      // directly — writing only one column here made them show a stale, older
      // daily-hours number. Both move together now.
      .update({ target_percentile: targetPercentile, study_target_hours: studyHours, hours_available: Math.round(studyHours) })
      .eq('id', userId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const gap = currentCRS !== null ? Math.max(0, targetPercentile - currentCRS) : null;
  const progressPct = currentCRS !== null ? Math.min(100, Math.round((Number(currentCRS) / targetPercentile) * 100)) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-5 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Your Goal
            </h1>
            <p className="text-sm text-stone-500">What are you working toward?</p>
          </div>
        </div>

        {/* CAT Countdown */}
        <div className="bg-stone-900 text-white rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-stone-400 font-semibold">Days to CAT {examDate.getFullYear()}</p>
              <p className="text-5xl font-bold mt-1 font-mono">{daysToCat}</p>
              <p className="text-sm text-stone-400 mt-1">{examDate.toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <Target className="w-12 h-12 text-orange-400 opacity-80" />
          </div>
        </div>

        {/* Target Percentile */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-stone-500" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Target Percentile</h2>
          </div>
          <div className="text-center py-2">
            <span className="text-5xl font-bold text-orange-600">{targetPercentile}</span>
            <span className="text-xl text-stone-500 ml-1">%ile</span>
          </div>
          <input
            type="range"
            min={70}
            max={99}
            value={targetPercentile}
            onChange={(e) => setTargetPercentile(Number(e.target.value))}
            className="w-full accent-orange-600"
          />
          <div className="flex justify-between text-xs text-stone-400">
            <span>70%ile</span>
            <span>85%ile</span>
            <span>99%ile</span>
          </div>
        </div>

        {/* Current Progress */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Current Standing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center bg-stone-50 rounded-xl p-3">
              <div className="text-xs text-stone-500 mb-1">Current percentile</div>
              <div className="text-2xl font-bold text-stone-900">
                {currentCRS !== null ? (
                  <>{Math.round(Number(currentCRS))}<span className="text-sm text-stone-500 font-normal">%ile</span></>
                ) : '—'}
              </div>
            </div>
            <div className="text-center bg-orange-50 rounded-xl p-3">
              <div className="text-xs text-stone-500 mb-1">Gap to Goal</div>
              <div className="text-2xl font-bold text-orange-700">
                {gap !== null ? (
                  <>{gap > 0 ? '+' : ''}{gap}<span className="text-sm font-normal">%ile</span></>
                ) : '—'}
              </div>
            </div>
          </div>
          {currentCRS !== null && (
            <div>
              <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                <span>Progress to goal</span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2.5">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
          {currentCRS === null && (
            <p className="text-xs text-stone-400 text-center">
              Your latest recorded percentile will appear here.
            </p>
          )}
        </div>

        {/* Daily Commitment */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-stone-500" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Daily Commitment</h2>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-stone-900">{studyHours}</span>
              <span className="text-stone-500 text-sm">hours / day</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={studyHours}
              onChange={(e) => setStudyHours(Number(e.target.value))}
              className="w-full accent-stone-800"
            />
            <div className="flex justify-between text-xs text-stone-400 mt-1">
              <span>0.5h</span>
              <span>5h</span>
              <span>10h</span>
            </div>
          </div>
          <p className="text-xs text-stone-500">
            {daysToCat} days × {studyHours}h ={' '}
            <strong className="text-stone-800">{Math.round(daysToCat * studyHours)} total hours</strong> of prep left
          </p>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl bg-stone-900 text-white font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Goal'}
        </button>
      </div>
    </div>
  );
}
