import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { dispatch, BUDGET_ACTIVE, BUDGET_SETUP, BUDGET_RECOVERY, dreamCollegeLabel } from '@/lib/notification-os';
import { catExamDate } from '@/lib/routine-engine';
import {
  COMPANION_SLOTS, companionType, companionTip, weakestFromCoverage,
  morningCopy, factCopy, openCopy, progressCopy, logCopy, closeCopy,
  kickoffCopy, sparkCopy, windCopy, activationSlotCopy, reactivationSlotCopy,
  missedCheckInKickoffCopy,
  planMorningCopy, planOpenCopy, planProgressCopy, planLogCopy, classMorningCopy,
  type CompanionSlot, type SlotCopy,
} from '@/lib/companion';
import { computeTodaysPlan, type TodaysPlan } from '@/lib/routine-plan';

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// The Study Companion cadence (see lib/companion.ts for the philosophy).
// One route, six Pro cron slots — vercel.json calls it with ?slot=…:
//   morning  04:00 UTC (09:30 IST)  today's plan preview
//   fact     07:30 UTC (13:00 IST)  micro-tip for their weakest section
//   open     11:30 UTC (17:00 IST)  study window opens, first target
//   [20:00 IST is decision-engine — the smart-insight slot, already live]
//   progress 15:00 UTC (20:30 IST)  their own consistency, as encouragement
//   log      16:00 UTC (21:30 IST)  the day's ONE demand, only if not logged
//   close    16:30 UTC (22:00 IST)  celebration — only if they logged
//
// Eligibility is the state machine's job: only students who can study today
// (active loggers + Day 1-7 arc). Recovery states never receive the
// cadence — the ladder owns them. Every send goes through dispatch(), so
// the BUDGET_ACTIVE cap, per-student cooldown, and measurement columns all
// apply; every slot is a distinct type on /admin/notification-health, so
// the founder sees per-slot clicked/acted rates and the data — not a
// debate — decides which slots earn their place.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slot = request.nextUrl.searchParams.get('slot') as CompanionSlot | null;
  if (!slot || !COMPANION_SLOTS.includes(slot)) {
    return NextResponse.json({ error: 'Unknown slot' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();
  const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000);
  const istDay = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay();
  const isWeekend = istDay === 0 || istDay === 6;

  // Real urgency for the activation/reactivation copy — the CAT countdown.
  const examYr = now.getFullYear();
  let examDate = catExamDate(examYr);
  if (now > examDate) examDate = catExamDate(examYr + 1);
  const daysToExam = Math.max(0, Math.ceil((examDate.getTime() - now.getTime()) / 86_400_000));

  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, notif_prefs, created_at, is_working_professional, self_reported_weakest_section, self_reported_weak_topic, study_target_hours, hours_available, weekend_hours_available, dream_colleges')
    .eq('role', 'student')
    .eq('onboarding_completed', true);
  if (!students?.length) return NextResponse.json({ slot, sent: 0 });

  const ids = students.map((s) => s.id);
  // IST calendar dates, same derivation as `today`, so day comparisons never
  // drift across the UTC boundary.
  const istDateMinus = (n: number) =>
    new Date(now.getTime() - n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const yesterday = istDateMinus(1);
  const yesterdayLabel = new Date(yesterday + 'T12:00:00+05:30')
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const reportsWindowStart = new Date(now.getTime() - 21 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const needsCoverage = slot === 'morning' || slot === 'open' || slot === 'fact' || slot === 'close' || slot === 'kickoff' || slot === 'wind';

  const [
    { data: streaks },
    { data: recentReports },
    { data: sentToday },
    { data: coverageRows },
  ] = await Promise.all([
    admin.from('streak_data').select('student_id, current_streak, last_log_date').in('student_id', ids),
    admin.from('daily_reports').select('student_id, report_date').in('student_id', ids).gte('report_date', reportsWindowStart),
    admin.from('notifications').select('user_id').in('user_id', ids).eq('type', companionType(slot)).gte('created_at', todayStart),
    needsCoverage
      ? admin.from('topic_coverage').select('student_id, section, status').in('student_id', ids)
      : Promise.resolve({ data: [] as { student_id: string; section: string; status: string }[] }),
  ]);

  const streakById = new Map((streaks ?? []).map((r) => [r.student_id, r]));
  const alreadySent = new Set((sentToday ?? []).map((n) => n.user_id));
  const reportDays = new Map<string, Set<string>>();
  for (const r of recentReports ?? []) {
    if (!reportDays.has(r.student_id)) reportDays.set(r.student_id, new Set());
    reportDays.get(r.student_id)!.add(r.report_date);
  }
  const coverageById = new Map<string, { section: string; status: string }[]>();
  for (const c of coverageRows ?? []) {
    if (!coverageById.has(c.student_id)) coverageById.set(c.student_id, []);
    coverageById.get(c.student_id)!.push(c);
  }

  let sent = 0;
  let skipped = 0;

  for (const s of students) {
    if (alreadySent.has(s.id)) continue;
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const streak = streakById.get(s.id);
    const lastLog = (streak?.last_log_date as string | null) ?? null;
    const daysSinceLastLog = lastLog == null ? null : Math.round((Date.parse(today) - Date.parse(lastLog)) / 86_400_000);

    const days = reportDays.get(s.id) ?? new Set<string>();
    const loggedToday = days.has(today);
    const daysSinceJoin = Math.floor((now.getTime() - new Date(s.created_at as string).getTime()) / 86_400_000);
    const isArc = daysSinceJoin <= 14 && days.size < 7;
    const firstName = (s.full_name as string | null)?.split(' ')[0] ?? 'there';

    // Growth-first routing: students NOT using the app get the heavy emotional
    // cadence (activation if never logged, reactivation if dormant); engaged
    // loggers get the light one.
    const stateKind: 'active' | 'activation' | 'reactivation' =
      lastLog == null ? 'activation' : (daysSinceLastLog! >= 2 ? 'reactivation' : 'active');

    const weakest = (s.self_reported_weakest_section as 'VARC' | 'DILR' | 'QA' | null)
      ?? weakestFromCoverage(coverageById.get(s.id) ?? [])
      ?? 'DILR';
    const dreamCollege = dreamCollegeLabel(s.dream_colleges);
    const hoursRaw = isWeekend
      ? (s.weekend_hours_available as number | null)
      : ((s.study_target_hours ?? s.hours_available) as number | null);
    const hoursToday = hoursRaw
      ?? (isWeekend ? (s.is_working_professional ? 4 : 3) : (s.is_working_professional ? 1.5 : 2.5));

    // Topic-level plan — computed only for engaged loggers on the slots that
    // name a topic (morning preview, study-window, progress, log). This is
    // what turns "DILR is your weakest" into "Geometry today → RC next": the
    // exact plan the student sees when they open the app (read-or-generate,
    // same engine). Never computed for activation/reactivation states — those
    // students aren't studying today, so a topic name is noise, not help.
    const PLAN_SLOTS: CompanionSlot[] = ['morning', 'open', 'progress', 'log'];
    let plan: TodaysPlan | null = null;
    if (stateKind === 'active' && PLAN_SLOTS.includes(slot)) {
      plan = await computeTodaysPlan(admin, s.id, now);
    }
    const planEstHours = plan ? Math.round((plan.tasks.reduce((a, t) => a + t.estMinutes, 0) / 60) * 2) / 2 : 0;

    let copy: SlotCopy | null = null;
    let reason = '';
    let budget: number = BUDGET_ACTIVE;

    // ── The morning check-in, state-triggered ────────────────────────────────
    // Fires only because yesterday has NO entry — the clock just picks 08:00.
    // Scoped deliberately to a FRESH slip: someone who logged within the last
    // three days and missed exactly yesterday. A student quiet for a week is a
    // different product (the reactivation ladder owns them), and asking them
    // "how did yesterday go?" would be tone-deaf.
    //
    // daily_reports presence is the signal, NOT streak_data.last_log_date: a
    // "didn't study" check-in writes a report but deliberately does not extend
    // the streak (Incident #6), and this must count as answered.
    const checkedInYesterday = days.has(yesterday);
    const loggedInPriorDays = days.has(istDateMinus(2)) || days.has(istDateMinus(3));
    const wantsMorningCheckIn =
      slot === 'kickoff' &&
      !checkedInYesterday &&
      !loggedToday &&                  // already engaged today — no nudge needed
      stateKind !== 'activation' &&    // never logged: no yesterday worth asking about
      loggedInPriorDays;

    if (wantsMorningCheckIn) {
      budget = stateKind === 'reactivation' ? BUDGET_RECOVERY : BUDGET_ACTIVE;
      copy = missedCheckInKickoffCopy(yesterdayLabel, weakest);
      reason = `Companion 08:00 — ${yesterday} has no check-in · state-triggered`;
    } else if (stateKind === 'activation') {
      budget = BUDGET_SETUP;
      copy = activationSlotCopy(slot, { firstName, daysToExam, rotate: daysSinceJoin, weakest, dreamCollege });
      reason = `Activation cadence · ${slot} · never logged · ${daysToExam}d to CAT`;
    } else if (stateKind === 'reactivation') {
      budget = BUDGET_RECOVERY;
      copy = reactivationSlotCopy(slot, { firstName, daysToExam, daysSinceLastLog: daysSinceLastLog!, weakest, dreamCollege });
      reason = `Reactivation cadence · ${slot} · ${daysSinceLastLog}d quiet`;
    } else switch (slot) {
      case 'kickoff':
        // Morning greeting for graduated loggers — arc students get their own
        // Day-N morning elsewhere, so don't double their morning.
        if (isArc) break;
        copy = kickoffCopy((streak?.current_streak as number | null) ?? 0, weakest, dreamCollege);
        reason = `Companion 08:00 — morning kickoff (${weakest} weakest)`;
        break;
      case 'spark':
        copy = sparkCopy(dayOfYear);
        reason = `Companion 11:00 — strategy tip, day ${dayOfYear} rotation`;
        break;
      case 'wind':
        if (loggedToday) break; // already logged — no evening push
        copy = windCopy(weakest);
        reason = 'Companion 18:30 — evening block, not yet logged';
        break;
      case 'morning':
        // Arc students get their own Day-N morning copy at 10:00 — no double.
        if (isArc || loggedToday) break;
        if (plan && plan.topicTasks.length > 0) {
          const firstTopic = plan.topicTasks[0].topic!;
          const secondTopic = plan.topicTasks[1]?.topic ?? null;
          // If today's lead topic is one their coaching actually teaches today,
          // say so. It is the same plan either way — this only changes whether
          // the student is told the reason, and the reason is checkable.
          if (plan.classTopics.includes(firstTopic)) {
            copy = classMorningCopy(firstName, firstTopic, planEstHours);
            reason = `Companion 09:30 — coaching class today (${firstTopic})`;
          } else {
            copy = planMorningCopy(firstName, firstTopic, secondTopic, plan.totalCount, planEstHours);
            reason = `Companion 09:30 — plan preview (topic: ${firstTopic}${secondTopic ? ` → ${secondTopic}` : ''})`;
          }
        } else {
          copy = morningCopy(weakest, hoursToday);
          reason = `Companion 09:30 — plan preview (${weakest} weakest, ${hoursToday}h committed)`;
        }
        break;
      case 'fact':
        copy = factCopy(companionTip(weakest, dayOfYear));
        reason = `Companion 13:00 — ${weakest} micro-tip, day ${dayOfYear} rotation`;
        break;
      case 'open':
        if (loggedToday) break;
        if (plan && plan.nextTask?.topic) {
          copy = planOpenCopy(plan.nextTask.topic, plan.nextTask.target, hoursToday);
          reason = `Companion 17:00 — study window (next: ${plan.nextTask.topic})`;
        } else {
          copy = openCopy((s.self_reported_weak_topic as string | null) ?? null, weakest, hoursToday);
          reason = 'Companion 17:00 — study window opens';
        }
        break;
      case 'progress': {
        if (loggedToday) break;
        // Topic progress wins when they've actually started today's plan —
        // "2 of 3 done ✓ — RC is next" is the founder's exact ask. Only when
        // some blocks are ticked and one remains, so it's always true praise.
        if (plan && plan.doneCount >= 1 && !plan.allDone && plan.nextTask?.topic) {
          copy = planProgressCopy(plan.doneCount, plan.totalCount, plan.nextTask.topic);
          reason = `Companion 20:30 — topic progress (${plan.doneCount}/${plan.totalCount}, next: ${plan.nextTask.topic})`;
          break;
        }
        const studied = days.size >= 1 ? [...days].filter((d) => d >= new Date(now.getTime() - 20 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })).length : 0;
        // Under 5 days the number reads as guilt, not encouragement — silence.
        if (studied < 5) break;
        copy = progressCopy(studied, 20);
        reason = `Companion 20:30 — ${studied}/20 days studied`;
        break;
      }
      case 'log':
        // The day's one demand. Arc students already got theirs at 20:00.
        if (loggedToday || isArc) break;
        if (plan && plan.topicTasks.length > 0) {
          copy = planLogCopy(plan.nextTask?.topic ?? null, dreamCollege);
          reason = `Companion 21:30 — log (${plan.nextTask?.topic ? `left: ${plan.nextTask.topic}` : 'plan cleared'})`;
        } else {
          copy = logCopy(dreamCollege);
          reason = 'Companion 21:30 — log still open';
        }
        break;
      case 'close':
        if (!loggedToday) break; // no log, no celebration — and no guilt either
        copy = closeCopy((streak?.current_streak as number | null) ?? 0, weakest);
        reason = 'Companion 22:00 — day closed, logged';
        break;
    }
    if (!copy) { skipped++; continue; }

    const outcome = await dispatch({
      userId: s.id,
      type: companionType(slot),
      title: copy.title,
      body: copy.body,
      // A nudge whose job is "fill your log" must OPEN the log, not the home
      // screen. companion_log delivered 93 pushes and was tapped zero times
      // while it landed on Home and asked the student to go find it.
      // Everything whose expected action is a log now deep-links into the sheet.
      url: copy.expectedAction === 'log_today' || slot === 'log' || slot === 'close'
        ? '/student/tracker?log=1'
        : '/student/tracker',
      reason,
      expectedAction: copy.expectedAction,
      prefs,
      dailyBudget: budget,
    });
    if (outcome === 'sent') sent++;
  }

  return NextResponse.json({ slot, sent, skipped, candidates: students.length });
}

export { POST as GET };
