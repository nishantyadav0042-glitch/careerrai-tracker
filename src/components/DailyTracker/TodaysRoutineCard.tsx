'use client';
 
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Check, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TopicInsights } from '@/components/topic-insights';
import { BusyDayButton } from '@/components/busy-day-button';
import { isMockSitting } from '@/lib/mock-in-plan';
import { FirstWeekAskCard } from '@/components/first-week-ask-card';
import type { CoverageStatus } from '@/lib/coverage-status';

// The ladder is imported, never re-spelled — a local copy is how exam_ready
// goes missing from one screen and nowhere else.

interface RoutineTask {
  id: string;
  section: string;
  topic: string | null;
  label: string;
  target?: string | null; // executable goal — older stored routines predate it
  estMinutes: number;
  reason: string | null;
  isImplementationIntention?: boolean;
  // Looked up fresh per request, not stored on the frozen routine row — see
  // /api/routine/today. Absent entirely on routines generated before this shipped.
  coverageStatus?: CoverageStatus | null;
  lastTouchedDaysAgo?: number | null;
  timesPracticed?: number;
}

// "Last done 6 days ago" / "First time" / "3rd revision" — three words, not
// a sentence. Memory made visible without making it emotional.
function memoryTag(task: RoutineTask): string | null {
  if (!task.topic) return null;
  if (task.lastTouchedDaysAgo == null) return 'First time';
  if (task.lastTouchedDaysAgo === 0) return 'Practiced today';
  const times = task.timesPracticed ?? 0;
  const ordinal = times === 1 ? '1st' : times === 2 ? '2nd' : times === 3 ? '3rd' : `${times}th`;
  return times > 1 ? `${ordinal} revision · ${task.lastTouchedDaysAgo}d ago` : `Last done ${task.lastTouchedDaysAgo}d ago`;
}

// The card sends only the two ADVANCING signals, derived from how far the
// student got: "Finished it" -> green, "Got halfway" -> blue (mapped
// server-side in complete-task). The 🟡/🔴 four-option picker that used to be
// declared here was never rendered by any version of this card — the founder's
// Half/Done simplification replaced it — so it was removed on 13 Aug rather
// than left looking like a live feature.
//
// Moving a topic BACKWARDS is a deliberate act and now has a deliberate home:
// the coverage map at /student/plan/topics, where the student taps one named
// topic on purpose. A daily flow is the wrong place for it — a mis-tap there
// would rewrite their history.
type ConfidenceSignal = 'green' | 'blue' | 'yellow' | 'red';

interface RoutineResponse {
  routine: { phase: string; tasks: RoutineTask[]; est_minutes: number; calibration?: string | null };
  completions: { task_id: string; is_emergency: boolean }[];
  currentStreak: number;
  isCatchUp: boolean;
  yesterday?: { total: number; done: number } | null;
  /** The specific, TRUE reason today looks the way it does. Null = no
   *  specific claim is true, fall back to the generic narration. */
  because?: { line: string; kind: string } | null;
  /** The hours today's plan was built to, and why it is that number. */
  todayBudget?: {
    hours: number;
    claimedHours: number | null;
    trimmed: boolean;
    reason: string | null;
  } | null;
  /** Today's recorded mock debrief, if one exists — turns the score door
   *  into visible proof the save happened. */
  todayMock?: { overallPercentile: number | null } | null;
  /** Set when a recent mock DECIDED today's focus — the proof that entering
   *  a score changes the plan. Null when the usual chain decided. */
  focusBasis?: string | null;
  /** Set only when the student's chosen finish date does not fit their own
   *  hours — see lib/date-feasibility. Null means the date is fine, or none
   *  is set; a card that speaks when it has nothing to say gets ignored. */
  finishDate?: {
    verdict: 'tight' | 'impossible';
    headline: string;
    detail: string;
    options: string[];
  } | null;
  /** The section the "which topic hurts most" first-week ask scopes to. */
  weakestSection?: string;
  /** What the first-week ask card needs to decide whether to show, and what. */
  firstWeekAsk?: {
    daysSinceSignup: number;
    daysLogged: number;
    answered: Partial<Record<string, string | null>>;
  } | null;
}

// The 30-minute "crisis day" budget that used to live here had no setter left
// after the trim buttons were removed, so `budget` was permanently 'planned'
// and `is_emergency` was permanently false — a whole branch the client could
// not reach. The crisis day is now the Busy Day button, which is explicit and
// honest about what it does to the finish date.
//
// The SERVER side stays exactly as it is: historical completions carry
// is_emergency = true and emergencyMinimumDone still reads them correctly.

// Fallback for routines generated before targets existed: the plain label,
// never an invented count — the old minutes/3 formula here claimed "15
// Reading Comprehension questions" for a topic the engine measures in
// passages. The server supplies task.target for every routine generated
// since targets shipped; only pre-target legacy rows hit the fallback.
function taskTitle(task: RoutineTask): string {
  return task.target ?? task.label;
}

// 30-second module-level cache for GET /api/routine/today — the single
// heaviest student API. A student bouncing Home → Log → Home re-renders
// this card within seconds and used to pay the full backend round-trip
// each time. Busted on every task completion so the card can never show
// pre-completion state after an action; anything past 30s refetches.
let routineTodayCache: { at: number; json: unknown } | null = null;
const ROUTINE_CACHE_MS = 30_000;

// The engagement timers read the clock, and the React compiler treats any
// Date.now() written inside a component body as render-time impurity even when
// it only ever runs from an event handler. One module-level reader keeps both
// timers honest and the rule satisfied — the alternative was silencing the
// rule, which would also silence a real render-time clock read later.
const clockMs = () => Date.now();


// ── How far did you get? ────────────────────────────────────────────────────
//
// Founder, 13 Aug: "3 short click option — 50% completed, task 100% done, or
// something like this." Two taps maximum, no modal, no typing.
//
// Three states, not two: not-marked / half / done. A single all-or-nothing
// tick loses the most common honest day — the student who sat down, got
// through some of it, and would rather record nothing than overclaim. Half
// credits half the block's hours (creditedHours, the same formula the log
// sheet uses), so the number stays true either way.
function ProgressChoice({
  onPick, busy,
}: { onPick: (portion: 'full' | 'half') => void; busy: boolean }) {
  return (
    <div className="flex gap-1.5 px-1 pb-2 pt-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => onPick('half')}
        className="flex-1 rounded-lg border border-amber-300 bg-amber-50 py-2 text-[12px] font-bold text-amber-800 transition-transform active:scale-95 disabled:opacity-50"
      >
        Got halfway
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onPick('full')}
        className="flex-1 rounded-lg bg-stone-900 py-2 text-[12px] font-bold text-white transition-transform active:scale-95 disabled:opacity-50"
      >
        Finished it
      </button>
    </div>
  );
}

// ── The mock's door, on the mock's own row ──────────────────────────────────
//
// Founder, 13 Aug: the score goes in the study plan, and the separate mock
// button goes away. It renders only on the tasks that actually produce a
// score (see isMockSitting) and stays put after the tick, because the score
// is entered AFTER the paper is sat, not before.
//
// The log sheet belongs to a sibling component, so the tap travels the way a
// finished task already talks to it: one window event.
//
// AND THE SAVE MUST BE SEEN. Founder, same night, having filled the sheet:
// "my mock score is getting recorded nowhere — for sure." It was recorded
// perfectly; the button just still said "Add mock score", which reads as
// "nothing happened". Once today's debrief exists, the button BECOMES the
// recorded score and opens the mock history — proof at the exact spot the
// score went in, and the road to every score before it.
function MockScoreButton({ className, recorded }: {
  className?: string;
  recorded?: { overallPercentile: number | null } | null;
}) {
  if (recorded) {
    return (
      <Link
        href="/student/analysis?tab=mocks"
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition-transform active:scale-95',
          className
        )}
      >
        ✓ {recorded.overallPercentile != null ? `${recorded.overallPercentile}%ile saved` : 'Mock saved'} →
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => { try { window.dispatchEvent(new Event('cr-open-mock-log')); } catch { /* noop */ } }}
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition-transform active:scale-95',
        className
      )}
    >
      Add mock score
    </button>
  );
}

export function TodaysRoutineCard({ planSource = null }: { planSource?: string | null }) {
  const [data, setData] = useState<RoutineResponse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [fullyDone, setFullyDone] = useState(false);
  const [addingBlock, setAddingBlock] = useState(false);
  const [addBlockError, setAddBlockError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  // Which task is showing its Half / Done choice. Founder, 13 Aug: the tap
  // should offer a short set of options, not a single all-or-nothing tick —
  // most real days end somewhere in between, and a student forced to choose
  // between "done" and nothing will pick nothing.
  const [markingTaskId, setMarkingTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [calibrated, setCalibrated] = useState(false);
  const [calibrationBusy, setCalibrationBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // A failed tick must be visible. See toggleTask: the card used to return
  // silently on !res.ok, leaving the student sure their day was recorded.
  const [tickError, setTickError] = useState<string | null>(null);

  // One-tap daily calibration — the highest-ROI signal we collect. Fire and
  // thank; the engine collects first and tunes later.
  async function calibrate(verdict: 'too_easy' | 'just_right' | 'too_much') {
    if (calibrationBusy) return;
    setCalibrationBusy(true);
    try {
      const res = await fetch('/api/routine/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict }),
      });
      if (res.ok) { setCalibrated(true); routineTodayCache = null; }
    } finally {
      setCalibrationBusy(false);
    }
  }
  const [confidenceTaps, setConfidenceTaps] = useState<{ topic: string; confidence: ConfidenceSignal }[]>([]);
  // Reading the routine isn't the same as committing to it — viewedAt marks
  // when a real (non-empty, non-setup) routine first appeared on screen,
  // and the first task tap reports elapsed time against it. hasReportedStart
  // guards against double-firing if the student taps more than one task.
  const viewedAt = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const hasReportedStart = useRef(false);
  const hasReportedComplete = useRef(false);

  const load = useCallback(async () => {
    try {
      let json: RoutineResponse;
      if (routineTodayCache && Date.now() - routineTodayCache.at < ROUTINE_CACHE_MS) {
        json = routineTodayCache.json as RoutineResponse;
      } else {
        const res = await fetch('/api/routine/today');
        if (!res.ok) {
          // Expired session token: the page refreshed its session on load but
          // this background fetch carried the stale token -> silent 401 that
          // Retry could never fix (Vedprakash's blank card). One full reload
          // runs the middleware token refresh; guarded so it can't loop.
          const body = await res.json().catch(() => ({}));
          setLoadError(typeof body?.error === 'string' ? `${body.error} (${res.status})` : `Server responded ${res.status}`);
          if (res.status === 401 && !sessionStorage.getItem('cr_rt_reloaded')) {
            sessionStorage.setItem('cr_rt_reloaded', '1');
            window.location.reload();
          }
          return;
        }
        sessionStorage.removeItem('cr_rt_reloaded');
        json = (await res.json()) as RoutineResponse;
        routineTodayCache = { at: Date.now(), json };
      }
      setData(json);
      setCompletedIds(new Set(json.completions.map((c) => c.task_id)));
      if (viewedAt.current == null) {
        viewedAt.current = Date.now();
        fetch('/api/routine/engagement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'viewed' }),
        }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function reportStart() {
    if (hasReportedStart.current || viewedAt.current == null) return;
    hasReportedStart.current = true;
    startedAt.current = clockMs();
    const seconds = Math.round((startedAt.current - viewedAt.current) / 1000);
    fetch('/api/routine/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'started', seconds_to_start: seconds }),
    }).catch(() => {});
  }

  function reportComplete() {
    if (hasReportedComplete.current) return;
    hasReportedComplete.current = true;
    const seconds = startedAt.current != null ? Math.round((clockMs() - startedAt.current) / 1000) : null;
    fetch('/api/routine/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'completed', seconds_since_started: seconds }),
    }).catch(() => {});
  }

  useEffect(() => { load(); }, [load]);

  // When the daily log completes topics, re-pull so this card shows them done.
  useEffect(() => {
    const onUpdated = () => { routineTodayCache = null; load(); };
    window.addEventListener('cr-routine-updated', onUpdated);
    return () => window.removeEventListener('cr-routine-updated', onUpdated);
  }, [load]);

  async function toggleTask(task: RoutineTask, confidence?: ConfidenceSignal, portion?: 'full' | 'half') {
    if (busyTaskId) return;
    setBusyTaskId(task.id);
    try {
      const res = await fetch('/api/routine/complete-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // close_day: finishing a real block IS studying today, and the manual
        // log already accepts a single marked topic as a valid day. Without it
        // a student who ticks one task still reads as "never logged", which is
        // the exact 319 -> 59 leak this change exists to close. The route
        // merges rather than overwrites, so an earlier manual log is safe.
        body: JSON.stringify({ task_id: task.id, close_day: true, ...(confidence ? { confidence } : {}), ...(portion ? { portion } : {}) }),
      });
      if (!res.ok) {
        // A tick that silently does nothing is worse than one that fails
        // loudly: the circle filled in, the student moved on, and the day was
        // never recorded. Say so and leave the circle empty.
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setTickError(body.error ?? 'Could not save that — check your connection and tap again.');
        return;
      }
      setTickError(null);
      // Server state changed — the 30s GET cache must never serve
      // pre-completion data.
      routineTodayCache = null;
      const json = (await res.json()) as { completedTaskIds: string[]; fullyDone: boolean };
      setCompletedIds(new Set(json.completedTaskIds));
      setExpandedTaskId(null);
      if (confidence && task.topic) setConfidenceTaps((prev) => [...prev, { topic: task.topic!, confidence }]);
      if (json.fullyDone) { setFullyDone(true); reportComplete(); }
    } finally {
      setBusyTaskId(null);
    }
  }

  // "One more? +30 min." — the plan is built at the bad-day floor, so
  // finishing it must open a door rather than close the day.
  async function addBlock() {
    if (addingBlock) return;
    setAddingBlock(true);
    setAddBlockError(null);
    try {
      const res = await fetch('/api/routine/add-block', { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setAddBlockError(json.error ?? 'Could not add — try again.'); return; }
      routineTodayCache = null;
      setFullyDone(false);
      await load();
    } catch {
      setAddBlockError('Could not add — check your connection.');
    } finally {
      setAddingBlock(false);
    }
  }

  function handleTaskTap(task: RoutineTask, done: boolean) {
    if (!done) reportStart();
    if (done) { toggleTask(task); return; }
    if (task.topic) { setExpandedTaskId((cur) => (cur === task.id ? null : task.id)); return; }
    toggleTask(task);
  }

  if (loading) {
    return (
      <Card className="p-5 animate-pulse">
        <div className="h-4 w-32 bg-stone-200 rounded mb-3" />
        <div className="h-16 bg-stone-100 rounded" />
      </Card>
    );
  }
  if (!data) {
    // NEVER vanish silently (real student report: "unable to view today's
    // task" with a blank space) — show the failure + a retry.
    return (
      <Card className="p-5 text-center">
        <p className="text-sm font-semibold text-stone-800">Today&apos;s plan couldn&apos;t load</p>
        <p className="mt-1 text-xs text-stone-500">{loadError ?? 'Check your connection — your plan is safe.'}</p>
        <button
          type="button"
          onClick={() => { routineTodayCache = null; setLoading(true); load(); }}
          className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white active:scale-95"
        >
          Retry
        </button>
      </Card>
    );
  }

  const { routine } = data;
  const tasks = routine.tasks;
  const doneCount = routine.tasks.filter((t) => completedIds.has(t.id)).length;
  const completedWithTopic = routine.tasks.filter((t) => completedIds.has(t.id) && t.topic);

  return (
    <Card className="p-3" data-tour="plan">
      {/* Two chips removed here 13 Aug (founder: "remove these 2 extra buttons
          which make no sense").
            "8h today" repeated the hours the position card states two
            centimetres above, on the same screen, every day.
            "🟢 Planned" was a status that only ever read "Planned" — a chip
          that never changes carries no information; the tick circles below
          already say what is done and what is not. */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] uppercase tracking-widest text-red-600 font-semibold">Today&apos;s Study Plan</p>
        {/* The whole plan, where a student actually looks for it — at the top
            of the plan, not buried under the day's tasks. */}
        <Link
          href="/student/plan"
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-stone-500 hover:text-stone-800"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Whole plan
        </Link>
      </div>

      {/* The mock's fingerprint on the plan — rendered only when a mock
          actually DECIDED today's focus. This is the loop that makes a
          student enter their next score: three hours of mock → visible
          change in tomorrow's plan. Founder, 13 Aug: "mock score
          performance is significantly important." */}
      {!fullyDone && data.focusBasis && (
        <p className="mb-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-medium text-indigo-800">
          <span className="mr-1 font-bold uppercase tracking-wide text-indigo-500 text-[9px]">Built from your mock</span>
          <br />{data.focusBasis}
        </p>
      )}

      {/* "Your date doesn't work" — founder, 14 Aug, option (a): reaching
          every topic is only honest when there is time; when there is not,
          the student is TOLD rather than quietly served a shorter syllabus.
          This moves nothing — the date stays exactly where the student put
          it — it is a sentence, and both ways to close the gap are theirs. */}
      {!fullyDone && data.finishDate && (
        <div
          className={cn(
            'mb-1.5 rounded-lg border px-2.5 py-2 text-[11px]',
            data.finishDate.verdict === 'impossible'
              ? 'border-rose-200 bg-rose-50 text-rose-900'
              : 'border-amber-200 bg-amber-50 text-amber-900',
          )}
        >
          <p className="font-bold leading-snug">{data.finishDate.headline}</p>
          <p className="mt-0.5 leading-snug opacity-90">{data.finishDate.detail}</p>
          <ul className="mt-1 space-y-0.5">
            {data.finishDate.options.map((o) => (
              <li key={o} className="leading-snug">· {o}</li>
            ))}
          </ul>
        </div>
      )}

      {/* First-week ask — founder, 14 Aug: "weakest section in onboarding,
          rest in first week." Rations itself to one question a day and goes
          silent once answered or once the week is up; see
          lib/first-week-asks for the full rule. */}
      {!fullyDone && data.firstWeekAsk && (
        <FirstWeekAskCard
          weakestSection={data.weakestSection ?? 'DILR'}
          daysSinceSignup={data.firstWeekAsk.daysSinceSignup}
          daysLogged={data.firstWeekAsk.daysLogged}
          answered={data.firstWeekAsk.answered}
        />
      )}

      {/* Why it is that size, but only when it differs from what they asked
          for — otherwise it is noise on every single day. */}
      {!fullyDone && data.todayBudget?.trimmed && data.todayBudget.reason && (
        <p className="mb-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-medium text-stone-600">
          {data.todayBudget.reason}
        </p>
      )}

      {/* The engine's daily auto-adjustment, said OUT LOUD — students should
          know the plan recalculates from what they actually did, every day. */}
      {/* The because-line: proof, not a claim. "Geometry first — it didn't
          get finished yesterday" is what makes a student feel their check-in
          changed their plan. Only ever rendered when the statement is TRUE
          (plan-reason.ts enforces it); otherwise the generic line below. */}
      {!fullyDone && data.because ? (
        <p className="mb-1.5 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1.5 text-[11px] font-medium text-orange-800">
          <span className="mr-1 font-bold uppercase tracking-wide text-orange-500 text-[9px]">Built from your check-in</span>
          <br />{data.because.line}
        </p>
      ) : null}
      {!fullyDone && !data.because && (data.isCatchUp ? (
        <p className="mb-1.5 rounded-lg bg-teal-50 border border-teal-100 px-2.5 py-1.5 text-[11px] font-medium text-teal-800">
          ⚡ Welcome back — your plan has already adjusted around the missed days. Only today matters.
        </p>
      ) : data.yesterday && data.yesterday.total > 0 ? (
        <p className="mb-1.5 rounded-lg bg-stone-50 border border-stone-100 px-2.5 py-1.5 text-[11px] font-medium text-stone-600">
          {data.yesterday.done >= data.yesterday.total
            ? `⚡ Yesterday: all ${data.yesterday.total} done — today's plan builds on it.`
            : `⚡ Yesterday: ${data.yesterday.done} of ${data.yesterday.total} done — today's plan has already adjusted. Nothing lost.`}
        </p>
      ) : null)}

      {/* Today's Goal — the one number that matters, read at a glance. */}
      {!fullyDone && (
        <div className="flex items-center gap-1.5 mb-1.5">
          {routine.tasks.map((t) => (
            <span
              key={t.id}
              className={cn('h-1.5 w-1.5 rounded-full', completedIds.has(t.id) ? 'bg-stone-900' : 'bg-stone-200')}
            />
          ))}
          <span className="text-[11px] text-stone-400 ml-1">{doneCount} of {routine.tasks.length} done</span>
        </div>
      )}

      {fullyDone ? (
        <div className="py-3">
          {/* Forward-pull, not a finish line — the app's job is to make
              tomorrow morning feel easier than today did, not to mark today
              closed. "Done" reads as an ending; "Ready for tomorrow" reads
              as momentum. */}
          <p className="text-lg font-bold text-stone-900 text-center mb-3">Ready for tomorrow ✅</p>
          <div className="space-y-1 text-center">
            {completedWithTopic.length > 0 && (
              <p className="text-sm text-stone-600">Plan updated · {completedWithTopic.length} topic{completedWithTopic.length === 1 ? '' : 's'}</p>
            )}
            {confidenceTaps.filter((t) => t.confidence === 'green').length > 0 && (
              <p className="text-sm text-stone-600">{confidenceTaps.filter((t) => t.confidence === 'green').map((t) => t.topic).join(', ')} ↑</p>
            )}
            <p className="text-sm text-stone-600">Your next step is already being built — open tomorrow and go</p>
          </div>

          {/* Finishing the day hides the task list — and with it the mock's
              door, at the exact moment the paper has actually been sat and
              the score exists. So it survives the fold. */}
          {routine.tasks.some(isMockSitting) && (
            <div className="mt-3 flex justify-center"><MockScoreButton recorded={data.todayMock} /></div>
          )}

          {/* Stage A: the door a finished floor-day opens. The plan is small
              on purpose; a good day grows one block at a time — each finished
              before the next appears, never a wall of tasks up front. */}
          <button
            type="button"
            disabled={addingBlock}
            onClick={() => void addBlock()}
            className="mx-auto mt-3 block rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:border-stone-900 disabled:opacity-60"
          >
            {addingBlock ? 'Adding…' : 'One more? +30 min'}
          </button>
          {addBlockError && <p className="mt-2 text-center text-xs text-stone-500">{addBlockError}</p>}
          {(calibrated || data.routine.calibration) ? (
            /* Was "✓ Noted — this tunes tomorrow's plan." It does not. The
               tap is stored on daily_routines.calibration and nothing in the
               engine reads it, so the line promised a change that never
               happened — a plan explanation must correspond to a real
               decision (backbone audit, 13 Aug).
               And it cannot honestly be wired the obvious way: acting on
               "too much" means shrinking the day, which is exactly the
               auto-resizing the hours-are-sacred rule forbids. So the
               collection stays (it is real signal for us) and the promise
               goes. */
            <p className="mt-4 text-center text-xs font-medium text-teal-700">✓ Noted.</p>
          ) : (
            <div className="mt-4">
              <p className="text-center text-xs font-semibold text-stone-500 mb-2">Today&apos;s plan was…</p>
              <div className="flex justify-center gap-2">
                {([['too_easy', 'Too easy'], ['just_right', 'Just right'], ['too_much', 'Too much']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => calibrate(v)}
                    disabled={calibrationBusy}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* First-timer guidance. Founder, 13 Aug: "just guide the new
              students the way they can log — they can log directly from home
              screen only." Shown until they have marked anything at all today,
              then it disappears; a hint that outstays its welcome becomes
              furniture. */}
          {doneCount === 0 && (
            <p className="mb-1.5 rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-semibold text-white">
              Finished a task? Tap the circle — that&apos;s it, your day is marked.
            </p>
          )}

          <div className="space-y-1">
            {tasks.map((task, idx) => {
              const done = completedIds.has(task.id);
              const isStart = idx === 0 && !done;
              const expanded = expandedTaskId === task.id && !done;

              // Task 1 gets the hero treatment — full detail, big and hard to
              // miss. Everything after it is a compact single line: still
              // real, still tappable (never gated — a student choosing to
              // skip ahead is making a real choice, not cheating), just not
              // shouting for the same attention as the one thing to do now.
              if (isStart || expanded) {
                return (
                  <div key={task.id}>
                    <div
                      className={cn(
                        'w-full flex items-start gap-2.5 rounded-2xl bg-stone-100/70 p-2.5 transition-all',
                        expanded && 'rounded-b-none'
                      )}
                    >
                      {/* One tap = "I did this." Founder, 12 Aug: the tick IS
                          the log, so a student never opens a separate sheet to
                          record a block they just finished. Deliberately a
                          SINGLE state — no half, no percentage, no partial —
                          because the tick must mean exactly one truthful thing.
                          The log sheet stays fully usable for off-plan study
                          and rest days: this is additive, never the only path
                          (Incident #2, where requiring a plan-tick made an
                          honest day impossible and cost a whole cohort). */}
                      <button
                        type="button"
                        aria-label={`Mark progress: ${taskTitle(task)}`}
                        disabled={busyTaskId === task.id}
                        onClick={() => { reportStart(); setMarkingTaskId((cur) => (cur === task.id ? null : task.id)); }}
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-stone-300 transition-colors hover:border-stone-900 active:scale-90 disabled:opacity-50"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-stone-900 text-white">
                            {isStart ? 'Start Here' : 'Next'}
                          </span>
                          <span className="text-xs text-stone-400 ml-auto shrink-0">{task.estMinutes}m</span>
                        </div>
                        <p className="text-base font-bold mt-1.5 text-stone-900">{taskTitle(task)}</p>
                        {!done && task.reason && (
                          <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{task.reason}</p>
                        )}
                        {/* Verified student contributions for THIS topic —
                            curriculum injection, shown exactly where the work
                            is about to happen and nowhere else. */}
                        {!done && task.topic && (
                          <div className="mt-2"><TopicInsights topic={task.topic} /></div>
                        )}
                      </div>
                      {isMockSitting(task) && <MockScoreButton className="mt-0.5" recorded={data.todayMock} />}
                    </div>
                    {markingTaskId === task.id && !done && (
                      <div className="rounded-b-2xl bg-stone-100/70">
                        <ProgressChoice
                          busy={busyTaskId === task.id}
                          onPick={(portion) => { setMarkingTaskId(null); void toggleTask(task, undefined, portion); }}
                        />
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={task.id}>
                  <div className={cn('w-full flex items-center gap-2.5 rounded-xl bg-stone-50 px-3.5 py-3', markingTaskId === task.id && !done && 'rounded-b-none')}>
                    {/* Same single-state tick as the hero task. Tapping a done
                        task un-does it — a mis-tap must never be permanent. */}
                    <button
                      type="button"
                      aria-label={done ? `Undo: ${taskTitle(task)}` : `Mark progress: ${taskTitle(task)}`}
                      disabled={busyTaskId === task.id}
                      onClick={() => {
                        if (done) { void toggleTask(task); return; }
                        reportStart();
                        setMarkingTaskId((cur) => (cur === task.id ? null : task.id));
                      }}
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors active:scale-90 disabled:opacity-50',
                        done ? 'border-stone-900 bg-stone-900' : 'border-stone-300 hover:border-stone-900'
                      )}
                    >
                      {done && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <span className={cn('text-sm font-semibold', done ? 'text-stone-400 line-through' : 'text-stone-800')}>
                        {taskTitle(task)}
                      </span>
                      {!done && task.reason && (
                        <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{task.reason}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-stone-400">{task.estMinutes}m</span>
                    {isMockSitting(task) && <MockScoreButton recorded={data.todayMock} />}
                  </div>
                  {markingTaskId === task.id && !done && (
                    <div className="rounded-b-xl bg-stone-100/70">
                      <ProgressChoice
                        busy={busyTaskId === task.id}
                        onPick={(portion) => { setMarkingTaskId(null); void toggleTask(task, undefined, portion); }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {tickError && (
            <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
              {tickError}
            </p>
          )}


          {/* Footer: where the day goes next. Left, the map of what is
              covered; right, the honest exit for a day that did not happen.
              Both belong to the day, so both live in the day's card rather
              than as loose buttons beneath it. */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-2.5">
            {/* "My CAT Plan" said nothing about what is behind it — the page
                is the topic-coverage map. Founder, 13 Aug: name it after what
                it shows. */}
            <Link href="/student/blueprint" className="text-xs font-semibold text-stone-900">Topics covered →</Link>
            <BusyDayButton planSource={planSource} />
          </div>
        </>
      )}
    </Card>
  );
}
