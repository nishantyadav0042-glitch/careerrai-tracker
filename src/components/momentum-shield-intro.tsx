'use client';

import { useEffect, useState } from 'react';
import { Shield, Flame } from 'lucide-react';
import { track } from '@/lib/journey';
import { INSIGHT_DONE_EVENT, insightVisible } from '@/lib/first-run-events';

// One-time "what's new" briefing for the Momentum Shield update (founder,
// 20 July). Shown once per device to students who had already logged before
// the system shipped — their past streak has been RESTORED under the new
// rules, and this tells them so. New students never see it: shields are simply
// how the app works for them, visible on the home screen from day one.
const KEY = 'cr_shield_intro_v1';

export function MomentumShieldIntro({ streak, shields, enabled }: { streak: number; shields: number; enabled: boolean }) {
  const [show, setShow] = useState(false);

   
  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fired = false;
    const attempt = () => {
      if (fired) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (fired || insightVisible()) return;
        fired = true;
        setShow(true);
        track('shield_intro_shown', { streak, shields });
      }, 400);
    };
    attempt();
    window.addEventListener(INSIGHT_DONE_EVENT, attempt);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(INSIGHT_DONE_EVENT, attempt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
   

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900">
          <Shield className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-center text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Your streak just got safer
        </h2>
        <p className="mt-1 text-center text-sm text-stone-500">Streaks never reset to zero anymore.</p>

        <div className="mt-4 space-y-2.5 text-sm text-stone-700">
          <div className="flex items-start gap-2.5 rounded-xl bg-stone-50 p-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-stone-900" />
            <p>You hold <b>{shields}/3 Momentum Shields</b>. Miss a day — a shield covers it, and your streak stays untouched.</p>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-stone-50 p-3">
            <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <p>Out of shields? Your streak slips by just <b>1 per missed day</b> — it never breaks to zero.</p>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-stone-50 p-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p>Study <b>21 days in a row</b> to earn a shield back (max 3). Consistency builds your safety net.</p>
          </div>
          {streak >= 1 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-orange-200 bg-orange-50 p-3">
              <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
              <p>Your past effort is restored: <b>🔥 {streak}-day streak</b>, protected from today.</p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          Got it — protect my streak 🛡️
        </button>
      </div>
    </div>
  );
}
