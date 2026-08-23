import { archetypeRevisionMultiplier } from './routine-engine';
import { isRevisionDue, isRevisableStatus } from './revision-due';
// The Weekly Diagnosis — the paid product's engine. Computes a student's week
// from data that already exists (logs, routines, coverage, mocks, pace) and
// returns plain-language lines a BUDDY delivers to their paid student, and the
// founder reads on the lead card. Deliberately not student-facing: the free
// tier gets the daily engine; the weekly verdict is what the buddy sells.
// Deterministic — every line traces to a formula in docs/plan-engine-formulas.md.

import { dailyHours } from './daily-hours';
import { remainingSyllabusHours, remainingMockHours, studentEffortMultiplier } from './study-pace';
import { getLogDateString } from './streak-utils';
import { trailingWindow } from './facts/window';
import { readDailyLogWindow, loggedDaysOrUnknown } from './reads/daily-log';

export interface WeeklyDiagnosis {
  // 0C.3 Wave 1: `null` when the log read was UNAVAILABLE. It is NEVER 0 for
  // that reason — a failed read used to be indistinguishable from a week the
  // student skipped, and that confusion is what cost 56 students 282 days.
  daysStudied: number | null;   // of last 7
  hoursLogged: number | null;  // null when the log read was UNAVAILABLE
  topicsTouched: string[];      // topics completed in routines this week
  skippedSections: string[];    // planned ≥2 times, completed 0 times
  revisionOverdue: number;
  lastMockDaysAgo: number | null;
  volatility: 'low' | 'medium' | 'high' | null; // null = too little data
  projectedFinish: string | null;  // ISO date at committed pace
  targetDate: string | null;
  lines: string[];              // the report, ready to read out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeWeeklyDiagnosis(admin: any, studentId: string): Promise<WeeklyDiagnosis> {
  const now = new Date();
  // 0C.3 Wave 1. `today` is the CareerRai day (05:30 IST rollover), and the
  // window is [today−6 … today] — SEVEN days.
  //
  // This function used to compute `weekAgo = now − 7d` and filter `.gte()`,
  // which is EIGHT inclusive days, and then render the count as "N of 7 days".
  // `daysStudied` was bounded by 8, so this line could read "Studied 8 of 7
  // days" — a fact exceeding its own denominator, on the surface a paid mentor
  // reads out to their student. The window now comes from facts/window.ts and
  // the count from the registered producer; neither is computed here.
  //
  // The routine and completion legs move to the same seven days deliberately:
  // they back the SAME weekly report, and leaving them on eight would trade a
  // wrong number for an internally inconsistent one. `skippedSections`
  // ("planned ≥2 times, completed 0") therefore now covers seven days too.
  const today = getLogDateString(now);
  const week = trailingWindow(today);

  const logs = await readDailyLogWindow(admin, studentId, today);

  const [{ data: routines }, { data: completions }, { data: coverage }, { data: profile }, { data: mocksRecent }] = await Promise.all([
    admin.from('daily_routines').select('routine_date, tasks').eq('student_id', studentId).gte('routine_date', week.start).lte('routine_date', week.end),
    admin.from('routine_task_completions').select('routine_date, task_id').eq('student_id', studentId).gte('routine_date', week.start).lte('routine_date', week.end),
    admin.from('topic_coverage').select('topic, status, updated_at').eq('student_id', studentId),
    admin.from('profiles').select('syllabus_target_date, study_target_hours, hours_available, is_repeater, is_working_professional, last_year_percentile').eq('id', studentId).maybeSingle(),
    admin.from('daily_reports').select('report_date').eq('student_id', studentId).eq('mock_taken', true).order('report_date', { ascending: false }).limit(1),
  ]);

  // Days studied: the registered fact, not a local Set. Hours: still the raw
  // sum, because `study_duration` is Wave 5 and its semantics are open
  // (docs/0C-3G-G4-STUDY-DURATION-AUDIT.md, blockers B1–B7). Nothing here
  // canonises it — it is only re-windowed to the seven days it always claimed.
  const daysStudied = loggedDaysOrUnknown(logs);
  const reports = logs.state === 'value' ? logs.value.rows : null;
  const hoursLogged = reports === null
    ? null
    : Math.round(reports.reduce((s: number, r: { study_duration: number | null }) => s + (r.study_duration ?? 0), 0) * 10) / 10;

  // What the plan asked vs what got done, per section + topics touched.
  const doneByDate = new Map<string, Set<string>>();
  for (const c of completions ?? []) {
    if (!doneByDate.has(c.routine_date)) doneByDate.set(c.routine_date, new Set());
    doneByDate.get(c.routine_date)!.add(c.task_id);
  }
  const planned: Record<string, number> = {};
  const completed: Record<string, number> = {};
  const topicsTouched = new Set<string>();
  for (const r of routines ?? []) {
    const done = doneByDate.get(r.routine_date) ?? new Set();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (r.tasks as any[]) ?? []) {
      const sec = t.section as string;
      if (!['VARC', 'DILR', 'QA'].includes(sec)) continue;
      planned[sec] = (planned[sec] ?? 0) + 1;
      if (done.has(t.id)) {
        completed[sec] = (completed[sec] ?? 0) + 1;
        if (t.topic) topicsTouched.add(t.topic as string);
      }
    }
  }
  const skippedSections = Object.keys(planned).filter((s) => (planned[s] ?? 0) >= 2 && (completed[s] ?? 0) === 0);

  // The archetype cadence this student's own screens use. Dropping it here is
  // what made the digest disagree with the Preparation Map.
  const revisionMultiplier = archetypeRevisionMultiplier({
    isRepeater: !!profile?.is_repeater,
    isWorkingProfessional: !!profile?.is_working_professional,
  });

  // Revision overdue — the SAME rule as the Preparation Map's red flag, now
  // literally (lib/revision-due) rather than by comment. This copy had dropped
  // the archetype multiplier, so the weekly digest counted a repeater's topics
  // as overdue later than the screen did.
  let revisionOverdue = 0;
  for (const row of coverage ?? []) {
    if (!isRevisableStatus(row.status)) continue;
    const daysSince = Math.round((now.getTime() - Date.parse(row.updated_at)) / 86_400_000);
    if (isRevisionDue({ topic: row.topic, daysSince, multiplier: revisionMultiplier })) revisionOverdue++;
  }

  const lastMock = mocksRecent?.[0]?.report_date as string | undefined;
  const lastMockDaysAgo = lastMock ? Math.round((Date.parse(today) - Date.parse(lastMock)) / 86_400_000) : null;

  // Volatility: coefficient of variation of daily hours across the 7 days
  // (zeros included). 2-2-2-2-2 and 10-0-0-0-0 have the same mean — very
  // different risk. Consistency predicts success more than weekly totals.
  let volatility: WeeklyDiagnosis['volatility'] = null;
  if (daysStudied !== null && daysStudied >= 1 && reports !== null) {
    const byDay = new Map<string, number>();
    for (const r of reports) byDay.set(r.report_date, (byDay.get(r.report_date) ?? 0) + (r.study_duration ?? 0));
    // The seven day keys come from the window authority. This loop used to
    // rebuild them with its own `now − i` arithmetic, so a change to the day
    // boundary would have had to be made here too, and silently was not.
    const vals: number[] = week.keys.map((d) => byDay.get(d) ?? 0);
    const mean = vals.reduce((a, b) => a + b, 0) / 7;
    if (mean > 0) {
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / 7);
      const cv = sd / mean;
      volatility = cv < 0.9 ? 'low' : cv < 1.6 ? 'medium' : 'high';
    }
  }

  // Pace verdict — the exact core formula (syllabus + mock budget ÷ pace).
  const targetDate = (profile?.syllabus_target_date as string | null) ?? null;
  const committed = dailyHours(profile).weekday;
  let projectedFinish: string | null = null;
  if (committed && committed > 0) {
    const rem = remainingSyllabusHours(coverage ?? [], studentEffortMultiplier({
      isRepeater: profile?.is_repeater as boolean | null,
      lastYearPercentile: profile?.last_year_percentile as number | null,
    }));
    if (rem > 0) {
      const days = Math.ceil((rem + remainingMockHours(rem)) / committed);
      projectedFinish = new Date(now.getTime() + days * 86_400_000).toISOString().split('T')[0];
    }
  }

  // The report — plain language, ready for the buddy to deliver.
  const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const lines: string[] = [];
  // ONE sentence shape for every value of the fact, including zero.
  //
  // Founder ruling, 23 Aug: the zero case used to read "Studied 0 of the last
  // 7 days — THE WEEK SLIPPED ENTIRELY." That trailing clause is an
  // INTERPRETATION ("slipped" asserts a cause and a verdict), and it was
  // welded onto the fact so tightly that no consumer could take the fact
  // without it. Same principle the architecture enforces: a fact does not
  // smuggle a conclusion into its renderers. What the diagnostic layer makes
  // of a zero is the diagnostic layer's business, and it is a separate
  // product-copy decision — not part of this migration.
  //
  // The special-cased zero branch is gone rather than reworded, because a
  // branch is where the two shapes drift apart again.
  //
  // UNKNOWN still says so, and does NOT borrow the shape of a bad week: a
  // mentor reading "0 of 7" out loud to a student who logged all seven is the
  // exact harm this wave exists to make impossible.
  lines.push(daysStudied === null
    ? '❓ Could not read this week\'s logs — no day count. (Not zero: unknown.)'
    : `${daysStudied >= 5 ? '✅' : '⚠️'} Studied ${daysStudied} of 7 days${hoursLogged === null ? '' : ` (${hoursLogged}h logged)`}.`);
  if (topicsTouched.size > 0) lines.push(`✅ Worked on ${topicsTouched.size} topic${topicsTouched.size === 1 ? '' : 's'}: ${[...topicsTouched].slice(0, 4).join(', ')}${topicsTouched.size > 4 ? '…' : ''}.`);
  for (const s of skippedSections) lines.push(`⚠️ ${s} was planned but skipped all week.`);
  if (revisionOverdue > 0) lines.push(`⚠️ ${revisionOverdue} topic${revisionOverdue === 1 ? '' : 's'} overdue for revision.`);
  lines.push(lastMockDaysAgo == null ? '⚠️ No mock taken yet.' : lastMockDaysAgo > 14 ? `⚠️ Last mock ${lastMockDaysAgo} days ago.` : `✅ Last mock ${lastMockDaysAgo} day${lastMockDaysAgo === 1 ? '' : 's'} ago.`);
  if (volatility) lines.push(volatility === 'low' ? '✅ Consistent pattern — steady daily work.' : volatility === 'medium' ? '⚠️ Uneven week — some heavy days, some empty.' : '⚠️ High volatility — bursts then silence. Consistency predicts success more than totals.');
  if (projectedFinish && targetDate) {
    lines.push(projectedFinish <= targetDate
      ? `📅 At the committed pace, syllabus finishes ~${fmt(projectedFinish)} — on track for ${fmt(targetDate)}.`
      : `📅 At the current pace, finish slips to ~${fmt(projectedFinish)} vs target ${fmt(targetDate)}.`);
  } else if (projectedFinish) {
    lines.push(`📅 At the committed pace, syllabus finishes ~${fmt(projectedFinish)}.`);
  }

  return { daysStudied, hoursLogged, topicsTouched: [...topicsTouched], skippedSections, revisionOverdue, lastMockDaysAgo, volatility, projectedFinish, targetDate, lines };
}
