import { clampSentence } from './daily-insight';

// ── The Weekly Insight (founder, 27 Aug) ────────────────────────────────────
//
// The daily card answers "what is one thing about today?". This answers a
// different question — "what actually happened to my week?" — over a window
// the student cannot see by scrolling. Same discipline, different window.
//
// NOT A SECOND INSIGHT ENGINE. Everything structural is shared or absent:
//   · the language contract is clampSentence() from daily-insight.ts, not a
//     second copy of the trimming rule
//   · the honesty contract is identical and pinned by the same kind of guard:
//     student facts may be stated plainly, exam context stays qualitative,
//     TOPIC_METADATA.weightage never reaches a rendered sentence
//   · there is NO scheduler. The window is a closed calendar week, so the
//     answer is deterministic for (student, week) and is computed on read.
//     A cron would be a second producer of the same fact.
//   · there is NO new state table and NO new notification type. Nothing here
//     writes. The founder ranked the notification P4; the engine is the
//     product capability.
//
// EVIDENCE GATING IS THE WHOLE DESIGN, and it is not a style preference — it
// is what the production numbers forced.
//
// Measured on the live cohort, 27 Aug, for the trailing 7 days (876 students):
//
//   sections a student could honestly fill │ students
//   ──────────────────────────────────────┼─────────
//   7 of 8 measurable dimensions          │    4
//   6                                     │    7
//   5                                     │    7
//   4                                     │    8
//   3                                     │    8
//   2                                     │   17
//   1                                     │  264
//   0                                     │  561
//
// NOBODY could fill eleven. Four students reached seven. A fixed eleven-
// section report would therefore have shipped nine fabricated sections to
// 96% of the cohort — which is the "top marks" failure (20 Aug) with more
// surface area: a sentence that claims more than its evidence.
//
// So every section below is a RULE THAT EITHER FIRES OR IS ABSENT. There are
// no placeholders and no filler. A week with three real observations renders
// three. A week with none renders the honest empty state, which makes no
// claims at all and names the single action that would produce data.
//
// ONE MEASUREMENT TRAP, PAID FOR ALREADY: topic movement is derived from
// routine_task_completions, NOT from topic_coverage.updated_at. 315 of 423
// active students looked like they had "moved topics" this week by the latter
// measure — until the timestamps showed ~50 rows per student inside a single
// minute. That is onboarding writing the whole syllabus in one sitting, not a
// week of study. Reading it as movement would have congratulated hundreds of
// students for work they did not do.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type WeeklySectionId =
  | 'consistency'
  | 'planned_vs_actual'
  | 'adherence'
  | 'strongest'
  | 'slipping'
  | 'behaviour'
  | 'topic_movement'
  | 'comparison'
  | 'buddy'
  | 'next_week';

export interface WeeklySection {
  id: WeeklySectionId;
  label: string;
  text: string;
  /**
   * Which of the student's own rows produced the numbers in `text`. This is
   * not decoration: the drill-down rule in SCALE-CONTRACT.md says every count
   * must reach the records behind it, and a weekly claim nobody can trace is
   * a weekly claim nobody should trust.
   */
  evidence: string;
}

export interface WeeklyWindow {
  /** IST calendar date, inclusive. Monday. */
  start: string;
  /** IST calendar date, inclusive. Sunday. */
  end: string;
}

export type WeeklyInsight =
  | ({ status: 'ready'; headline: string; sections: WeeklySection[] } & WeeklyWindow)
  | ({ status: 'not_enough_data'; sectionsFound: number; oneThingThatWouldHelp: string } & WeeklyWindow);

/**
 * Below this, there is no week to review. Three is not arbitrary: with two,
 * every ordering of the rules produces a "report" that is one observation and
 * one restatement of it, which reads as padding — and padding is how a review
 * starts making claims it cannot support.
 */
export const MIN_REAL_SECTIONS = 3;

/** A review may run longer than the glance card, but not into an essay. */
const MAX_SECTION_CHARS = 150;
const say = (t: string) => clampSentence(t, MAX_SECTION_CHARS);

const IST = 'Asia/Kolkata';
const istDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: IST });
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The LAST COMPLETE week, Monday to Sunday, in IST.
 *
 * Complete is the point. A review of a week still being lived is a review
 * that changes every time you open it, and the student learns to distrust it.
 * On Monday morning you get last week — finished, fixed, and the same number
 * whenever you look.
 */
export function lastCompleteWeek(now: Date = new Date()): WeeklyWindow {
  const today = istDate(now);
  // en-CA gives YYYY-MM-DD; derive the IST weekday from that date at UTC noon
  // so the local-timezone of the server can never shift it.
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = addDays(today, -daysSinceMonday);
  return { start: addDays(thisMonday, -7), end: addDays(thisMonday, -1) };
}

interface Ctx {
  reports: any[];
  prevReports: any[];
  routines: any[];
  completions: any[];
  sessions: any[];
  taskMeta: Map<string, { topic: string | null; section: string }>;
  served: number;
  plannedDays: number;
}

/**
 * 1 — CONSISTENCY. Needs at least two logged days to be a pattern.
 *
 * NOT the same fact as reads/daily-log.ts's loggedDaysLast7. That authority
 * anchors a TRAILING window on today; this counts a CLOSED calendar week. On
 * any day but Monday the two cover different dates, so they will differ, and
 * consuming the authority here would report the wrong week. The sentence says
 * "of the week's 7 days" and the card header carries the date range, so the
 * two numbers can never be mistaken for each other.
 * Declared in facts/logged-days-authority.guard.test.ts's NOT_THIS_FACT.
 */
function consistency(c: Ctx): WeeklySection | null {
  const days = new Set(c.reports.map((r) => r.report_date as string)).size;
  if (days < 2) return null;
  return {
    id: 'consistency',
    label: 'How often you showed up',
    text: say(
      days === 7
        ? "You logged all seven of the week's days. That is the rarest thing on this platform."
        : `You logged ${days} of the week's 7 days.`,
    ),
    evidence: `${days} distinct daily_reports rows`,
  };
}

/** 2 — PLANNED vs ACTUAL, in tasks. Volume, not judgement. */
function plannedVsActual(c: Ctx): WeeklySection | null {
  if (c.served < 3 || c.completions.length === 0) return null;
  const done = c.completions.length;
  return {
    id: 'planned_vs_actual',
    label: 'Planned vs actual',
    text: say(`Your plan asked for ${c.served} tasks. You finished ${done}.`),
    evidence: `${c.served} tasks across ${c.routines.length} daily_routines; ${done} routine_task_completions`,
  };
}

/**
 * 3 — PLAN ADHERENCE. Deliberately NOT a second volume number: it asks how
 * many of the days the plan was written for were touched at all. A student
 * who does everything on two days and nothing on five has good volume and bad
 * adherence, and those need different advice.
 */
function adherence(c: Ctx): WeeklySection | null {
  if (c.plannedDays < 3) return null;
  const touched = new Set(c.completions.map((x) => x.routine_date as string)).size;
  return {
    id: 'adherence',
    label: 'Did the plan get used',
    text: say(
      touched === 0
        ? `A plan was ready on ${c.plannedDays} days. None of them got opened.`
        : `A plan was ready on ${c.plannedDays} days; you worked from it on ${touched}.`,
    ),
    evidence: `${c.plannedDays} daily_routines; completions on ${touched} distinct routine_dates`,
  };
}

/** Confidence marks grouped by section — the input to strongest and slipping. */
function marksBySection(c: Ctx): Map<string, { green: number; red: number; total: number }> {
  const m = new Map<string, { green: number; red: number; total: number }>();
  for (const x of c.completions) {
    if (!x.confidence) continue;
    const sec = c.taskMeta.get(String(x.task_id))?.section;
    if (!sec || sec === 'General') continue;
    const cur = m.get(sec) ?? { green: 0, red: 0, total: 0 };
    cur.total += 1;
    if (x.confidence === 'green') cur.green += 1;
    if (x.confidence === 'red') cur.red += 1;
    m.set(sec, cur);
  }
  return m;
}

/** 4 — STRONGEST. Needs three marks before "strongest" means anything. */
function strongest(c: Ctx): WeeklySection | null {
  const m = marksBySection(c);
  const total = [...m.values()].reduce((a, b) => a + b.total, 0);
  if (total < 3) return null;
  const best = [...m.entries()]
    .filter(([, v]) => v.green > 0)
    .sort((a, b) => b[1].green / b[1].total - a[1].green / a[1].total)[0];
  if (!best) return null;
  return {
    id: 'strongest',
    label: 'Where you were steadiest',
    text: say(`${best[0]} — ${best[1].green} of ${best[1].total} tasks you marked felt solid.`),
    evidence: `routine_task_completions.confidence over ${total} marked tasks`,
  };
}

/** 5 — SLIPPING. One section, and never without the next step. */
function slipping(c: Ctx): WeeklySection | null {
  const m = marksBySection(c);
  const total = [...m.values()].reduce((a, b) => a + b.total, 0);
  if (total < 3) return null;
  const worst = [...m.entries()].filter(([, v]) => v.red >= 2).sort((a, b) => b[1].red - a[1].red)[0];
  if (!worst) return null;
  return {
    id: 'slipping',
    label: 'What fought back',
    text: say(`${worst[0]} — ${worst[1].red} tasks marked hard. Start next week there, while you are fresh.`),
    evidence: `${worst[1].red} red confidence marks in ${worst[0]}`,
  };
}

/**
 * 6 — BEHAVIOUR. When the work actually happened, which is the thing a
 * student almost never sees about themselves. Needs four completions across
 * three days before a "pattern" is anything but noise.
 */
function behaviour(c: Ctx): WeeklySection | null {
  const stamped = c.completions.filter((x) => x.completed_at);
  const days = new Set(stamped.map((x) => x.routine_date as string)).size;
  if (stamped.length < 4 || days < 3) return null;
  const hours = stamped.map((x) =>
    Number(new Date(x.completed_at as string).toLocaleString('en-GB', { timeZone: IST, hour: '2-digit', hour12: false })),
  );
  const late = hours.filter((h) => h >= 21 || h < 5).length;
  const early = hours.filter((h) => h >= 5 && h < 12).length;
  const share = (n: number) => Math.round((n / stamped.length) * 100);
  if (late / stamped.length >= 0.5) {
    return {
      id: 'behaviour',
      label: 'When your work happens',
      text: say(`${share(late)}% of what you finished was after 9pm. Worth knowing before you plan next week.`),
      evidence: `${late} of ${stamped.length} completions timestamped 21:00–05:00 IST`,
    };
  }
  if (early / stamped.length >= 0.5) {
    return {
      id: 'behaviour',
      label: 'When your work happens',
      text: say(`${share(early)}% of what you finished was before noon. Your mornings are carrying this.`),
      evidence: `${early} of ${stamped.length} completions timestamped 05:00–12:00 IST`,
    };
  }
  return null;
}

/**
 * 7 — TOPIC MOVEMENT, from completed tasks only. See the header: reading
 * topic_coverage.updated_at here would have manufactured movement for
 * hundreds of students out of a single onboarding write.
 */
function topicMovement(c: Ctx): WeeklySection | null {
  const topics = new Set<string>();
  for (const x of c.completions) {
    const t = c.taskMeta.get(String(x.task_id))?.topic;
    if (t) topics.add(t);
  }
  if (topics.size < 2) return null;
  const named = [...topics].slice(0, 3).join(', ');
  const rest = topics.size - Math.min(3, topics.size);
  return {
    id: 'topic_movement',
    label: 'What you moved on',
    text: say(`${topics.size} topics saw real work: ${named}${rest > 0 ? ` and ${rest} more` : ''}.`),
    evidence: `distinct topics on ${c.completions.length} completed routine tasks`,
  };
}

/** 8 — COMPARISON. Only against a week that actually has a number. */
function comparison(c: Ctx): WeeklySection | null {
  const prevDays = new Set(c.prevReports.map((r) => r.report_date as string)).size;
  const days = new Set(c.reports.map((r) => r.report_date as string)).size;
  if (prevDays === 0 || days === 0) return null;
  if (days === prevDays) {
    return {
      id: 'comparison',
      label: 'Against the week before',
      text: say(`${days} logged days, same as the week before. You are holding a rhythm.`),
      evidence: `daily_reports: ${days} this week, ${prevDays} previous`,
    };
  }
  const up = days > prevDays;
  return {
    id: 'comparison',
    label: 'Against the week before',
    text: say(
      up
        ? `${days} logged days, up from ${prevDays}.`
        : `${days} logged days, down from ${prevDays}. Weeks dip; the next one is the answer.`,
    ),
    evidence: `daily_reports: ${days} this week, ${prevDays} previous`,
  };
}

/** 9 — BUDDY. Says nothing unless something actually happened. */
function buddy(c: Ctx): WeeklySection | null {
  const held = c.sessions.filter((s) => s.session_status === 'completed');
  if (held.length === 0) return null;
  return {
    id: 'buddy',
    label: 'Your mentor',
    text: say(`${held.length} session${held.length > 1 ? 's' : ''} with your mentor this week.`),
    evidence: `${held.length} completed video_sessions in the window`,
  };
}

/**
 * 10 — NEXT WEEK. Derived from what the other rules already found, never
 * generic. If nothing was found, there is nothing honest to recommend, and
 * this section is absent rather than inventing advice.
 */
function nextWeek(found: WeeklySection[]): WeeklySection | null {
  const slip = found.find((s) => s.id === 'slipping');
  const adh = found.find((s) => s.id === 'adherence');
  const cons = found.find((s) => s.id === 'consistency');
  if (slip) {
    const section = slip.text.split(' —')[0];
    return {
      id: 'next_week',
      label: 'One thing for next week',
      text: say(`Give ${section} the first twenty minutes of three days. Earlier, not longer.`),
      evidence: `derived from the slipping section (${section})`,
    };
  }
  if (adh && /none of them got opened/i.test(adh.text)) {
    return {
      id: 'next_week',
      label: 'One thing for next week',
      text: say('Open the plan on one day and finish a single task. One is the whole target.'),
      evidence: 'derived from the adherence section (zero days touched)',
    };
  }
  if (cons) {
    return {
      id: 'next_week',
      label: 'One thing for next week',
      text: say('Match this week. Repeating a week you already did is the cheapest progress there is.'),
      evidence: 'derived from the consistency section',
    };
  }
  return null;
}

/** The headline restates the strongest thing found — it never adds a claim. */
function headlineFor(sections: WeeklySection[]): string {
  const by = (id: WeeklySectionId) => sections.find((s) => s.id === id);
  const cmp = by('comparison');
  const cons = by('consistency');
  const pva = by('planned_vs_actual');
  if (cmp && /up from/.test(cmp.text)) return 'Your week moved up.';
  if (cons && /all seven days/.test(cons.text)) return 'A complete week.';
  if (by('slipping')) return 'A working week, with one thing pushing back.';
  if (pva) return 'Here is what your week actually held.';
  return 'Your week, from your own rows.';
}

export async function computeWeeklyInsight(
  admin: any,
  studentId: string,
  now: Date = new Date(),
): Promise<WeeklyInsight> {
  const win = lastCompleteWeek(now);
  const endExclusive = addDays(win.end, 1);
  const prevStart = addDays(win.start, -7);

  const [reports, prevReports, routines, completions, sessions] = await Promise.all([
    admin.from('daily_reports').select('report_date').eq('student_id', studentId)
      .gte('report_date', win.start).lt('report_date', endExclusive),
    admin.from('daily_reports').select('report_date').eq('student_id', studentId)
      .gte('report_date', prevStart).lt('report_date', win.start),
    admin.from('daily_routines').select('routine_date, tasks').eq('student_id', studentId)
      .gte('routine_date', win.start).lt('routine_date', endExclusive),
    admin.from('routine_task_completions').select('routine_date, task_id, confidence, completed_at')
      .eq('student_id', studentId).gte('routine_date', win.start).lt('routine_date', endExclusive),
    admin.from('video_sessions').select('session_status, scheduled_at').eq('student_id', studentId)
      .gte('scheduled_at', win.start).lt('scheduled_at', endExclusive),
  ]);

  const rows = (r: any) => (r?.data ?? []) as any[];
  const taskMeta = new Map<string, { topic: string | null; section: string }>();
  let served = 0;
  for (const r of rows(routines)) {
    for (const t of Array.isArray(r.tasks) ? (r.tasks as any[]) : []) {
      taskMeta.set(String(t.id), { topic: (t.topic as string | null) ?? null, section: (t.section as string) ?? 'General' });
      served += 1;
    }
  }

  const ctx: Ctx = {
    reports: rows(reports),
    prevReports: rows(prevReports),
    routines: rows(routines),
    completions: rows(completions),
    sessions: rows(sessions),
    taskMeta,
    served,
    plannedDays: new Set(rows(routines).map((r) => r.routine_date as string)).size,
  };

  // Order is the reading order of the finished review.
  const found = [
    consistency(ctx),
    plannedVsActual(ctx),
    adherence(ctx),
    strongest(ctx),
    slipping(ctx),
    behaviour(ctx),
    topicMovement(ctx),
    comparison(ctx),
    buddy(ctx),
  ].filter((s): s is WeeklySection => s !== null);

  if (found.length < MIN_REAL_SECTIONS) {
    return {
      ...win,
      status: 'not_enough_data',
      sectionsFound: found.length,
      // No claim is made about the student here — only about our records.
      oneThingThatWouldHelp:
        'Log one day this week. A single logged day is enough for next Monday to have something real to say.',
    };
  }

  const rec = nextWeek(found);
  const sections = rec ? [...found, rec] : found;
  return { ...win, status: 'ready', headline: headlineFor(sections), sections };
}
