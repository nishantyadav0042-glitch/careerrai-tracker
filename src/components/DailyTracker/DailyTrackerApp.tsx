'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { Video, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { LoggingData } from './LoggingModal';
import { useLogging, type InitialLogging } from '@/hooks/useLogging';
import { getLogDateString } from '@/lib/streak-utils';
import { track } from '@/lib/journey';
import { NOTIF_ASK_SETTLED_EVENT, TOUR_DONE_EVENT, INSIGHT_DONE_EVENT, insightVisible } from '@/lib/first-run-events';

import { joinState, canJoinNow, shouldShowLink, countdownLabel } from '@/lib/session-link';

const LoggingModal = dynamic(() => import('./LoggingModal').then((m) => m.LoggingModal), { ssr: false });
const PlanRebuildPayoff = dynamic(() => import('@/components/plan-rebuild-payoff').then((m) => m.PlanRebuildPayoff), { ssr: false });

function SessionStrip({ session }: { session: TodaySession }) {
  const startsAt = new Date(session.scheduled_at);
  // eslint-disable-next-line react-hooks/purity -- live countdown; a fresh now() each render is the point
  const nowMs = Date.now();
  const state = joinState({
    scheduledAtIso: session.scheduled_at,
    nowMs,
    hasLink: !!session.google_meet_link,
  });
  const joinable = canJoinNow(state);
  const showLink = shouldShowLink(state);

  return (
    <div className="flex items-center justify-between gap-3 bg-stone-100 border border-stone-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Video className="w-4 h-4 text-stone-900 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-stone-900 truncate">{session.title || 'Buddy session'}</p>
          <p className="text-[11px] text-stone-900">
            {startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>
      {joinable ? (
        <a href={session.google_meet_link!} target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 py-1.5 bg-stone-900 hover:bg-stone-900 text-white text-xs font-bold rounded-lg transition-colors">
          Join →
        </a>
      ) : showLink ? (
        // Booked but not yet open. The countdown AND the room, so they can put
        // it in their own calendar instead of having to come back here at 10pm.
        <div className="shrink-0 text-right">
          <span className="block text-[11px] font-medium text-stone-500">
            {countdownLabel({ scheduledAtIso: session.scheduled_at, nowMs })}
          </span>
          <a
            href={session.google_meet_link!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold text-stone-500 underline underline-offset-2 hover:text-stone-900"
          >
            meeting link
          </a>
        </div>
      ) : (
        <span className="shrink-0 text-[11px] font-medium text-stone-500">
          {countdownLabel({ scheduledAtIso: session.scheduled_at, nowMs })}
        </span>
      )}
    </div>
  );
}

interface TodaySession {
  id: string;
  title: string | null;
  scheduled_at: string;
  google_meet_link: string | null;
}

interface DailyTrackerAppProps {
  studentId?: string;
  todaySession?: TodaySession | null;
  hasBuddy?: boolean;
  initialPendingDebrief?: { report_date: string; updated_at: string } | null;
  initialLogging?: InitialLogging | null;
  hasLoggedYesterday?: boolean;
  yesterdayStr?: string;   // ISO date for the API
  yesterdayLabel?: string; // "Jun 16" for the UI
  firstLogNudge?: boolean; // student has NEVER logged — auto-open the log once after tour + notif ask
}

// Home's second hero, not a buried strip — Today's Log is one of the app's
// two core loops (the other is Today's Study Plan). Tomorrow's plan, revision
// scheduling, and Buddy feedback all read off what gets logged here, so it
// gets the same visual weight as the routine card, not a footnote under it.
export function DailyTrackerApp({
  studentId = '',
  todaySession = null,
  initialLogging = null,
  hasLoggedYesterday = true,
  yesterdayStr = '',
  yesterdayLabel = '',
  firstLogNudge = false,
}: DailyTrackerAppProps) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  /** Which door the sheet was opened from — the mock one pre-answers "did you
   *  give a mock today". */
  const [logWithMock, setLogWithMock] = useState(false);
  const [logDateOverride, setLogDateOverride] = useState<string | null>(null);
  const [lastNudge, setLastNudge] = useState<string | null>(null);
  const [debriefInsight, setDebriefInsight] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Mock details are captured INLINE in the daily log now (single sheet), so the
  // separate "pending debrief" card + forced modal are gone (founder, 24 Jul) —
  // that screen was redundant and duplicated data the log already collected.

  // ── The mock score is asked for by the plan, answered by this sheet ────────
  //
  // Founder, 13 Aug: "whenever there is a mock planned in the study plan add
  // submit today's mock score in the study plan only — there is no need of a
  // different button for mock."
  //
  // The button now lives on the mock task itself, in TodaysRoutineCard, which
  // is a SIBLING of this component rather than a child. The sheet stays here
  // (it owns submitLog and the debrief POST), so the tap crosses the gap the
  // same way a completed task already tells the plan card to refresh: a
  // window event. Opening it here — not there — keeps one log sheet on Home.
  useEffect(() => {
    const open = () => { setLogDateOverride(null); setLogWithMock(true); setIsLogOpen(true); };
    window.addEventListener('cr-open-mock-log', open);
    return () => window.removeEventListener('cr-open-mock-log', open);
  }, []);

  const {
    currentStreak,
    hasLoggedToday,
    isSubmitting,
    showFeedback,
    feedbackData,
    setShowFeedback,
    submitLog,
  } = useLogging(studentId, initialLogging);

  // ── Deep link straight into the log ────────────────────────────────────────
  //
  // Every notification, including the one whose entire job is "fill your log",
  // used to land on the home screen and leave the student to find the log
  // themselves. companion_log ran to 93 delivered pushes and ZERO taps. A
  // reminder that costs a tap to act on is a reminder about a chore.
  //
  // /student/tracker?log=1 now opens the sheet on arrival. Fires once per
  // arrival, and never fights the first-run sequence or a log already filled.
  useEffect(() => {
    if (hasLoggedToday) return;
    let params: URLSearchParams;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    if (params.get('log') !== '1') return;
    const timer = setTimeout(() => {
      if (insightVisible()) return;
      track('log_open', { via: 'deeplink' });
      setIsLogOpen(true);
      // Drop the param so a refresh or a back-navigation doesn't reopen it.
      try {
        params.delete('log');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      } catch { /* cosmetic only */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [hasLoggedToday]);

  // Deep link into YESTERDAY's log — the 8 AM "you forgot yesterday" reminder
  // lands here (/student/tracker?log=yesterday). It opens the sheet pre-set to
  // backdate yesterday, reusing the same override the "Add yesterday too" button
  // uses, so a morning log rejoins the streak run and keeps it alive. Guarded on
  // yesterday NOT already logged, so it never reopens a day that's done.
  useEffect(() => {
    if (hasLoggedYesterday || !yesterdayStr) return;
    let params: URLSearchParams;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    if (params.get('log') !== 'yesterday') return;
    const timer = setTimeout(() => {
      if (insightVisible()) return;
      track('log_open', { via: 'deeplink_yesterday' });
      setLogDateOverride(yesterdayStr);
      setIsLogOpen(true);
      try {
        params.delete('log');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      } catch { /* cosmetic only */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [hasLoggedYesterday, yesterdayStr]);

  // First-log moment (20 July zero-log fix): the journey funnels install →
  // tour → notifications and then just… ends — the first log was outsourced to
  // an evening push most new students can't receive. This auto-opens the real
  // log modal ONCE (per device) for a student who has never logged, after the
  // tour is done and the notification ask isn't covering the screen. In-app,
  // at the peak of the first session — not hours later on a dead channel.
  useEffect(() => {
    if (!firstLogNudge || hasLoggedToday) return;
    const KEY = 'cr_first_log_prompt_v1';
    try { if (localStorage.getItem(KEY)) return; } catch { return; }
    let fired = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tourDone = () => { try { return localStorage.getItem('cr_app_tour_v1') === '1'; } catch { return false; } };
    const askUp = () => { try { return (window as Window & { __crNotifAskVisible?: boolean }).__crNotifAskVisible === true; } catch { return false; } };
    const maybeOpen = () => {
      if (fired || !tourDone() || askUp() || insightVisible()) return;
      fired = true;
      try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
      track('first_log_prompt');
      setIsLogOpen(true);
    };
    // Small delay on each trigger so sibling listeners (the notif ask's own
    // evaluate) run first and set their visibility flag before we check it.
    const deferred = () => { if (timer) clearTimeout(timer); timer = setTimeout(maybeOpen, 700); };
    deferred(); // page load: tour may already be done from a previous session
    window.addEventListener(TOUR_DONE_EVENT, deferred);
    window.addEventListener(NOTIF_ASK_SETTLED_EVENT, deferred);
    window.addEventListener(INSIGHT_DONE_EVENT, deferred);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(TOUR_DONE_EVENT, deferred);
      window.removeEventListener(NOTIF_ASK_SETTLED_EVENT, deferred);
      window.removeEventListener(INSIGHT_DONE_EVENT, deferred);
    };
  }, [firstLogNudge, hasLoggedToday]);

  const handleLogSubmit = async (data: LoggingData): Promise<{ mockSelected: boolean }> => {
    const backdated = logDateOverride;
    const result = await submitLog({ ...data, ...(backdated ? { log_date: backdated } : {}) });
    setLogDateOverride(null);

    // Integrated flow: the ticked plan topics become plan completions + coverage
    // advances — one action, consistent everywhere. skip_day_close because the
    // log above already wrote today's daily_report (real hours/mood). Only for
    // today's log, never a backdate (the plan tasks are today's).
    if (!backdated && data.completedTasks && data.completedTasks.length > 0) {
      // G10B — RECORD the outcome of each call. Behaviour is unchanged: the
      // log is already saved, a failure still does not block it, and nothing
      // retries. What changes is that a failure stops being invisible.
      //
      // `fetch` RESOLVES on 400/404/500 and only REJECTS on a network fault,
      // so the two need separate labels — without that, "never arrived" and
      // "arrived and was refused" are the same event, which is the exact
      // question the A1 audit could not answer. `clientDate` is carried
      // because complete-task resolves the routine by its OWN
      // getLogDateString(), independently of the date this log used; a
      // mismatch is a named suspect for the silent 404/400.
      const clientDate = getLogDateString();
      await Promise.all(data.completedTasks.map(async (t) => {
        try {
          const res = await fetch('/api/routine/complete-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: t.id, ...(t.confidence ? { confidence: t.confidence } : {}), skip_day_close: true }),
          });
          track('completion_write', { taskId: t.id, ok: res.ok, status: res.status, kind: 'http', clientDate });
        } catch {
          track('completion_write', { taskId: t.id, ok: false, status: 0, kind: 'network', clientDate });
        }
      }));
      // Tell the plan card to re-pull so the marked topics show as done.
      try { window.dispatchEvent(new Event('cr-routine-updated')); } catch { /* noop */ }
    }
    if (result?.milestone) setLastNudge(result.milestone);
    else if (result?.daily_nudge) setLastNudge(result.daily_nudge);
    const mockSelected = data.sections.includes('Mock');
    // Single-sheet log (24 Jul): the mock percentiles are captured INLINE on the
    // log and arrive as data.mock — save the debrief right here, no second
    // screen. Use the SERVER's authoritative report_date (bug audit, 14 July) so
    // the debrief is filed under the same IST day as the log (a client-side
    // recompute could disagree and strand it "pending").
    if (mockSelected && data.mock) {
      const reportDate = result?.report_date ?? getLogDateString();
      try {
        const response = await fetch('/api/logging/mock-debrief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data.mock, log_date: reportDate }),
        });
        if (response.ok) {
          const json = (await response.json()) as { insight?: string | null };
          if (json.insight) setDebriefInsight(json.insight);
        }
      } catch { /* best-effort — the log itself already saved */ }
      queryClient.invalidateQueries({ queryKey: ['pending-debrief'] });
      // The plan card must show the save IMMEDIATELY — its "Add mock score"
      // button becomes "✓ 99%ile saved" off /api/routine/today, which sits
      // behind a 30s cache. A save the student cannot see within one breath
      // of tapping Submit reads as a save that failed (founder, 13 Aug).
      try { window.dispatchEvent(new Event('cr-routine-updated')); } catch { /* noop */ }
    }
    return { mockSelected };
  };

  return (
    <div className="space-y-4">
      {debriefInsight && (
        <div className="flex items-start gap-2 bg-stone-100 border border-stone-300 rounded-2xl px-4 py-3">
          <span className="text-xs font-bold text-stone-900 shrink-0 mt-0.5">📊</span>
          <p className="flex-1 min-w-0 text-sm text-stone-900">{debriefInsight}</p>
          <button onClick={() => setDebriefInsight(null)} className="text-stone-900 hover:text-stone-900 text-xs shrink-0" aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* The strip under the plan. Before 13 Aug this carried a full-width
          black primary action that opened the log sheet; now that a task can be
          marked on the plan itself, that button is gone and this space teaches
          the tick instead.
          STUDENT VOCABULARY: never the word "log" in visible copy — a CAT
          aspirant thinks "aaj kitna padha", not "I'll log my study". Code
          identifiers (submitLog, useLogging, log_date, companion_log) keep the
          old name on purpose: renaming those breaks data continuity. */}
      {/* The strip only renders when it has something to say. Once the day is
          recorded it had nothing: a tick-confirmation line restating the ticks
          the student had just tapped one card above, which the founder cut on
          sight (13 Aug) — a card that exists to confirm what the screen
          already shows is furniture. A live class is different; that still
          earns the space. */}
      {(todaySession || !hasLoggedToday) && (
        <Card className="p-2.5">
          {todaySession && <div className={hasLoggedToday ? undefined : 'mb-2'}><SessionStrip session={todaySession} /></div>}

          {!hasLoggedToday && (
            <>
              {/* Kept full-width rather than beside the text: a long label
                  crushed the focus line into four overlapping rows at 360px
                  when these sat side by side. That was verified in a render,
                  not assumed, and the constraint still holds for whatever
                  label lives here. */}
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-stone-400">How to log</p>
                  <p className="text-[13px] font-extrabold leading-tight text-stone-900">Tap a task above as you finish it.</p>
                </div>
              </div>

              {/* ONE door here, not two. The big black primary action went
                  first (13 Aug: two doors to one action is a fork, not a
                  convenience); the standalone mock button went with it,
                  because a mock happens about once a week and that button was
                  on screen every day — and on the day it mattered it sat two
                  cards away from the mock it was about. The score is now
                  asked for by the mock task itself, in the plan.
                  What is left is the escape hatch, not a call to action: the
                  day that happened OFF the plan, or a rest day. That path must
                  never close (Incident #2: requiring a plan-tick to submit
                  took a whole cohort's logging to 0/29). */}
              <div className="mt-2.5">
                <button
                  data-tour="log"
                  onClick={() => { setLogDateOverride(null); setLogWithMock(false); setIsLogOpen(true); }}
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-[12px] font-semibold text-stone-600 transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving…' : 'Studied off-plan'}
                </button>
                {!hasLoggedYesterday && yesterdayStr && (
                  <button
                    onClick={() => { setLogDateOverride(yesterdayStr); setIsLogOpen(true); }}
                    className="mt-1 block w-full text-center text-[10px] text-stone-400 hover:text-stone-600"
                  >
                    Add {yesterdayLabel} too
                  </button>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      <LoggingModal isOpen={isLogOpen} onClose={() => { setIsLogOpen(false); setLogWithMock(false); }} onSubmit={handleLogSubmit} isSubmitting={isSubmitting} openWithMock={logWithMock} />
      {/* The payoff replaces the old "Logged! 🎉 Your streak is now 1 day"
          modal, which celebrated the act of recording and said nothing about
          the plan the recording produced. Now the student watches the plan
          rebuild 0 → 100% and is handed today's study. The old confetti
          component it replaced is gone: this comment used to claim the
          component was "still used elsewhere", and the 14 Aug sweep found no
          such elsewhere — it had no import site anywhere in the repo. A
          comment asserting a file is live is exactly what keeps a dead file
          alive through the next three audits. */}
      {showFeedback && (
        <PlanRebuildPayoff
          source="today_sheet"
          streak={currentStreak}
          noticed={lastNudge ?? feedbackData?.bonus ?? null}
          onDone={() => { setShowFeedback(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
