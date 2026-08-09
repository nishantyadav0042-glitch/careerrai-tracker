'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { Video, Star, ArrowRight } from 'lucide-react';
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
  const [logDateOverride, setLogDateOverride] = useState<string | null>(null);
  const [lastNudge, setLastNudge] = useState<string | null>(null);
  const [debriefInsight, setDebriefInsight] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Mock details are captured INLINE in the daily log now (single sheet), so the
  // separate "pending debrief" card + forced modal are gone (founder, 24 Jul) —
  // that screen was redundant and duplicated data the log already collected.

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
      await Promise.all(data.completedTasks.map((t) =>
        fetch('/api/routine/complete-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: t.id, ...(t.confidence ? { confidence: t.confidence } : {}), skip_day_close: true }),
        }).catch(() => {})
      ));
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

      {/* Today's Focus — star + TODAY'S FOCUS label + one-line focus on the
          left, the black "Update topics studied today" action on the right. Always
          side-by-side (compact) to keep Home to one screen.
          STUDENT VOCABULARY: never the word "log" in visible copy — a CAT
          aspirant thinks "aaj kitna padha", not "I'll log my study". Code
          identifiers (submitLog, useLogging, log_date, companion_log) keep the
          old name on purpose: renaming those breaks data continuity. */}
      <Card className="p-2.5">
        {todaySession && <div className="mb-2"><SessionStrip session={todaySession} /></div>}

        {/* The action is a FULL-WIDTH row under the focus line, not beside it.
            It used to sit side-by-side to keep Home to one screen, and that
            worked while the label was short. "Update topics studied today"
            measures 233px at 12px bold, which at 360px crushed "Be consistent,
            not perfect." into four lines and overlapped it — verified in a
            render, not assumed. A ~40px taller card is a cheap price for the
            founder's exact wording plus a full-width tap target. If Home ever
            has to shrink again, shorten the LABEL rather than re-cramming this
            button next to the text. */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-stone-400">Today&apos;s Focus</p>
            <p className="text-[13px] font-extrabold leading-tight text-stone-900">
              {hasLoggedToday ? 'Topics updated ✓' : 'Be consistent, not perfect.'}
            </p>
          </div>
          {hasLoggedToday && (
            <p className="shrink-0 text-right text-[10px] text-stone-400">Tomorrow&apos;s plan<br />builds on it.</p>
          )}
        </div>

        {!hasLoggedToday && (
          <div className="mt-2.5">
            <button
              data-tour="log"
              onClick={() => { setLogDateOverride(null); setIsLogOpen(true); }}
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-3 py-3 text-[13px] font-bold text-white transition-all active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting ? 'Saving…' : <>Update topics studied today <ArrowRight className="h-4 w-4" /></>}
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
        )}
      </Card>

      <LoggingModal isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} onSubmit={handleLogSubmit} isSubmitting={isSubmitting} />
      {/* The payoff replaces the old "Logged! 🎉 Your streak is now 1 day"
          modal, which celebrated the act of recording and said nothing about
          the plan the recording produced. Now the student watches the plan
          rebuild 0 → 100% and is handed today's study. FeedbackAnimation is
          still used for its confetti-only role elsewhere; this surface no
          longer needs it. */}
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
