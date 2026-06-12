'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { ArrowLeft, Target, TrendingUp, Clock } from 'lucide-react';

const CAT_EXAM_DATE = new Date(2026, 10, 29); // Nov 29, 2026

export default function GoalPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [currentCRS, setCurrentCRS] = useState<number | null>(null);
  const [targetPercentile, setTargetPercentile] = useState<number>(90);
  const [studyHours, setStudyHours] = useState<number>(2);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasTargetCol, setHasTargetCol] = useState(false);

  const daysToCat = Math.max(0, Math.ceil((CAT_EXAM_DATE.getTime() - Date.now()) / 86_400_000));

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Load basic profile fields (always present)
      const { data: profile } = await supabase
        .from('profiles')
        .select('cat_percentile, study_target_hours')
        .eq('id', user.id)
        .single();

      if (profile) {
        setCurrentCRS(profile.cat_percentile != null ? Number(profile.cat_percentile) : null);
        setStudyHours(Number(profile.study_target_hours ?? 2));
      }

      // Try to read target_percentile (column added by migration; safe to fail)
      const { data: ext, error: extErr } = await supabase
        .from('profiles')
        .select('target_percentile')
        .eq('id', user.id)
        .single();

      if (!extErr && ext && (ext as { target_percentile?: number | null }).target_percentile != null) {
        setTargetPercentile((ext as { target_percentile: number }).target_percentile);
        setHasTargetCol(true);
      } else if (!extErr) {
        setHasTargetCol(true); // column exists but is null → use default 90
      }

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!userId) return;
    setSaving(true);

    if (hasTargetCol) {
      await supabase
        .from('profiles')
        .update({ target_percentile: targetPercentile, study_target_hours: studyHours })
        .eq('id', userId);
    } else {
      // Migration not yet applied — save only study_target_hours
      await supabase
        .from('profiles')
        .update({ study_target_hours: studyHours })
        .eq('id', userId);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const gap = currentCRS !== null ? Math.max(0, targetPercentile - currentCRS) : null;
  const progressPct = currentCRS !== null ? Math.min(100, Math.round((Number(currentCRS) / targetPercentile) * 100)) : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-stone-500">Loading…</div>
      </div>
    );
  }

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
              <p className="text-xs uppercase tracking-widest text-stone-400 font-semibold">Days to CAT 2026</p>
              <p className="text-5xl font-bold mt-1 font-mono">{daysToCat}</p>
              <p className="text-sm text-stone-400 mt-1">Nov 29, 2026</p>
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
          {!hasTargetCol && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Run the <code>20260612_add_target_percentile.sql</code> migration to persist this goal.
            </p>
          )}
        </div>

        {/* Current Progress */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Current Standing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center bg-stone-50 rounded-xl p-3">
              <div className="text-xs text-stone-500 mb-1">Current CRS</div>
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
              Take the CAT Readiness Test to see your current score.
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
