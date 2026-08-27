import { TOPIC_METADATA, QA_GROUPS } from '@/lib/topics-constants';
import { computeTopicMemory } from '@/lib/prep-memory-data';
import { isCovered } from './coverage-status';

// ── Daily one-liner insight (founder, 21 July) ──────────────────────────────
// One specific, data-earned sentence per student per day — "this is the
// pattern / one advice from CareerRai" — never a generic stat dump. Priority
// order follows the confidence doctrine (momentum first, red flags always
// paired with a shrunken next step, never guilt):
//   1. RECOVERY praise — struggled→solid on the same topic (identity: "you
//      improve when you stay with hard things").
//   2. AVOIDANCE pattern — a section's plan tasks keep getting left; advice
//      is one small step, never "do more".
//   3. HIGH-WEIGHTAGE topics untouched — where the marks actually are.
//   4. REVISION overdue — a finished topic quietly fading.
//   5. CONSISTENCY praise — logged density worth naming.
//   6. Progress fallback — coverage moving, keep feeding the plan.
// Every number in every sentence comes from the student's own rows. Rules
// detect; no model in the loop.
//
// LANGUAGE CONTRACT (founder, 20 Aug — the "top marks" incident): an insight
// may claim no more than its evidence. Student facts (their own rows) may be
// stated plainly. Exam context may be QUALITATIVE only — "shows up every
// year", "a core part of QA" — never a marks claim, never a percentage,
// never a predicted question count. TOPIC_METADATA.weightage is an internal
// 1–5 emphasis rating for RANKING candidates; it must never be rendered as
// an exam-marks claim ("top marks" died here). Numbers about the exam itself
// belong to a governed historical-fact registry (not yet built) and to the
// drill-down, never to this card. daily-insight-honesty.guard.test.ts pins
// all of this.
//
// REPEAT SUPPRESSION (founder, 20 Aug, Q3=A): a shown insight (same kind +
// subject) stays quiet for 7 days — daily_insight_shown remembers, both the
// tracker card and the 5 PM push consult it, and 'progress' is the exempt
// fallback so a quiet week still gets a gentle line.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DailyInsight {
  kind: 'recovery' | 'avoidance' | 'high_weightage' | 'revision' | 'consistency' | 'progress';
  title: string;
  text: string;
  /** What the insight is about (topic or section) — the suppression key's
   *  second half. Empty for student-wide kinds (consistency, progress). */
  subject?: string;
}

/** The suppression identity: same kind + same subject = the same insight. */
export function insightKey(i: Pick<DailyInsight, 'kind' | 'subject'>): string {
  return `${i.kind}:${i.subject ?? ''}`;
}

export const INSIGHT_SUPPRESS_DAYS = 7;

/**
 * Keys shown in the last 7 days, EXCLUDING today — candidates carrying one
 * stay quiet.
 *
 * The upper bound is the whole fix (forensic audit, 27 Aug). Without it, the
 * row written by TODAY'S show satisfied `last_shown_on > cutoff`, so today's
 * own insight suppressed itself — and because the Home page records a show on
 * every server render, each visit re-ran the decision against a set that had
 * just grown by one:
 *
 *   load 1 → consistency        (recorded)
 *   load 2 → consistency now suppressed → high_weightage   (recorded)
 *   load 3 → …burns the next candidate
 *   load 4 → pool empty → the suppression-EXEMPT `progress` fallback
 *
 * A real candidate pool is one to three items, so four or five visits to Home
 * in a single day drained a week of insights — invisibly, because the client
 * only renders the first one it sees each day. What was left was `progress`,
 * whose numbers come from topic_coverage and therefore do not move for days.
 * That is why the same "23 done / 23 to go" card appeared morning after
 * morning: not frozen state, a rotation that had eaten itself.
 *
 * With today excluded, every render on the same day sees the identical
 * suppressed set, so the same rules fire in the same order and the student
 * gets the SAME insight all day. The pool advances once per day, which is
 * what "daily" was always supposed to mean.
 */
export async function loadSuppressedInsightKeys(admin: any, studentId: string): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - INSIGHT_SUPPRESS_DAYS * 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const { data } = await admin
    .from('daily_insight_shown')
    .select('insight_key, last_shown_on')
    .eq('student_id', studentId)
    .gt('last_shown_on', cutoff)
    .lt('last_shown_on', today);
  return new Set((data ?? []).map((r: any) => r.insight_key as string));
}

/** Record a show (card rendered or push sent). Idempotent per day. */
export async function recordInsightShown(admin: any, studentId: string, insight: DailyInsight): Promise<void> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  await admin.from('daily_insight_shown').upsert({
    student_id: studentId,
    insight_key: insightKey(insight),
    last_shown_on: today,
  });
}

/** QA topics roll up to a family (Algebra, Arithmetic, …) whose yearly
 *  PRESENCE in the exam is a defensible qualitative claim. Other sections
 *  fall back to naming the section itself. */
function examContextLine(topic: string, section: string): string {
  const family = QA_GROUPS.find((g) => g.units.includes(topic))?.label;
  return family ? `${family} shows up in ${section} every year` : `a core part of ${section}`;
}

// ONE LINE MEANS ONE LINE (founder, 25 July: the card was eating half the home
// screen). Every insight below is written short; this is the backstop that
// keeps it that way if anyone edits one carelessly. Roughly two lines of wrap
// on a small phone — past that it stops being a glance and becomes reading.
const MAX_INSIGHT_CHARS = 105;

/**
 * The length contract, with the budget as an argument. The daily card gets
 * MAX_INSIGHT_CHARS; the Weekly Insight is a review rather than a glance and
 * gets its own, larger budget. Exported so weekly-insight.ts inherits this
 * behaviour instead of copying it — one implementation of "keep it short",
 * not two that drift.
 */
export function clampSentence(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  // Trim at the last sentence boundary that fits; fall back to a word cut.
  const clipped = flat.slice(0, max);
  const lastStop = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '));
  if (lastStop > 40) return clipped.slice(0, lastStop + 1);
  return clipped.slice(0, clipped.lastIndexOf(' ')).trimEnd() + '…';
}

function oneLine(text: string): string {
  return clampSentence(text, MAX_INSIGHT_CHARS);
}

export async function computeDailyInsight(
  admin: any,
  studentId: string,
  archetype: { isRepeater: boolean; isWorkingProfessional: boolean },
  // Callers that already computed topic memory this request (the Home page)
  // pass it in — one expensive scan, two consumers.
  prefetched?: { topicMemory?: Awaited<ReturnType<typeof computeTopicMemory>> },
  opts?: { suppressedKeys?: Set<string> }
): Promise<DailyInsight | null> {
  // A candidate the student saw in the last 7 days steps aside for the next
  // rule. 'progress' is exempt: it is the fallback, not an observation.
  const suppressed = opts?.suppressedKeys ?? new Set<string>();
  const unlessSuppressed = (i: DailyInsight): DailyInsight | null =>
    i.kind !== 'progress' && suppressed.has(insightKey(i)) ? null : i;
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().split('T')[0];
  const [{ data: reports }, { data: routines }, { data: completions }, topicMemory] = await Promise.all([
    admin.from('daily_reports').select('report_date').eq('student_id', studentId).gte('report_date', fourteenDaysAgo),
    admin.from('daily_routines').select('routine_date, tasks').eq('student_id', studentId).gte('routine_date', fourteenDaysAgo),
    admin.from('routine_task_completions').select('routine_date, task_id, confidence').eq('student_id', studentId).gte('routine_date', fourteenDaysAgo),
    prefetched?.topicMemory ? Promise.resolve(prefetched.topicMemory) : computeTopicMemory(admin, studentId, archetype),
  ]);

  const loggedDays = new Set((reports ?? []).map((r: any) => r.report_date as string)).size;
  if (loggedDays < 2) return null; // patterns need at least a little history

  // (routine_date, task_id) → {topic, section} from the served routines.
  //
  // THE KEY MUST INCLUDE THE DATE (27 Aug). Task ids are not unique across the
  // window — the planner reuses the same id on different days, and in one
  // production week 362 ids repeated, 314 of them carrying a DIFFERENT TOPIC
  // on different days. Keyed by id alone this Map was last-write-wins, so
  // 135 of 190 completions (71%) resolved to a topic the student had not
  // worked on. That fed the RECOVERY rule ("Algebra: struggled → solid" for a
  // topic they never touched) and, worse, the suppression key is
  // `kind:subject` — so a wrong subject silenced the wrong insight for seven
  // days. Sections were unaffected (0 ids conflicted on section), but the fix
  // is the same key for both.
  const taskMeta = new Map<string, { topic: string | null; section: string }>();
  const metaKey = (date: unknown, id: unknown) => `${String(date)}|${String(id)}`;
  const served: Record<string, number> = {};
  for (const r of routines ?? []) {
    for (const t of (Array.isArray(r.tasks) ? (r.tasks as any[]) : [])) {
      taskMeta.set(metaKey(r.routine_date, t.id), { topic: (t.topic as string | null) ?? null, section: (t.section as string) ?? 'General' });
      const sec = (t.section as string) ?? 'General';
      if (sec !== 'General') served[sec] = (served[sec] ?? 0) + 1;
    }
  }
  const doneBySec: Record<string, number> = {};
  for (const c of completions ?? []) {
    const sec = taskMeta.get(metaKey(c.routine_date, c.task_id))?.section;
    if (sec && sec !== 'General') doneBySec[sec] = (doneBySec[sec] ?? 0) + 1;
  }

  // 1 — RECOVERY: same topic, struggled (red) then solid (green) later.
  const byTopic = new Map<string, { date: string; confidence: string | null }[]>();
  for (const c of completions ?? []) {
    const topic = taskMeta.get(metaKey(c.routine_date, c.task_id))?.topic;
    if (!topic) continue;
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic)!.push({ date: c.routine_date as string, confidence: (c.confidence as string | null) ?? null });
  }
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().split('T')[0];
  for (const [topic, marks] of byTopic) {
    const sorted = marks.sort((a, b) => a.date.localeCompare(b.date));
    const redIdx = sorted.findIndex((m) => m.confidence === 'red');
    if (redIdx === -1) continue;
    const green = sorted.slice(redIdx + 1).find((m) => m.confidence === 'green');
    if (green && green.date >= threeDaysAgo) {
      const stillRed = [...byTopic.entries()].find(([t, ms]) => t !== topic && ms[ms.length - 1]?.confidence === 'red')?.[0];
      const r = unlessSuppressed({
        kind: 'recovery',
        title: '🔥 You beat a hard topic',
        text: oneLine(`${topic}: struggled → solid.${stillRed ? ` ${stillRed} next.` : ''}`),
        subject: topic,
      });
      if (r) return r;
    }
  }

  // 2 — AVOIDANCE: a section served ≥3 tasks with <1/3 done, while another gets finished.
  const avoided = Object.keys(served)
    .filter((s) => served[s] >= 3 && (doneBySec[s] ?? 0) / served[s] < 0.34)
    .sort((a, b) => (doneBySec[a] ?? 0) / served[a] - (doneBySec[b] ?? 0) / served[b])[0];
  if (avoided) {
    // The old copy also named the section they favoured instead. Naming the
    // avoided one and the next step is the whole message; the comparison was
    // just words.
    const r = unlessSuppressed({
      kind: 'avoidance',
      title: `📊 A pattern in your week`,
      text: oneLine(`Only ${doneBySec[avoided] ?? 0} of ${served[avoided]} ${avoided} tasks done. Give ${avoided} 20 minutes first tomorrow.`),
      subject: avoided,
    });
    if (r) return r;
  }

  // 3 — CORE topic untouched. weightage ranks the CANDIDATES only — the
  // sentence itself makes no marks claim ("top marks" died 20 Aug: it
  // rendered our internal 1–5 emphasis rating as an exam-marks fact). The
  // exam context is qualitative and family-level — the strongest claim the
  // evidence supports. One topic per day, not two: sharper, and honest about
  // being one observation. Suppressed topics rotate to the next candidate.
  const heavyUntouched = topicMemory
    .filter((t) => t.status === 'not_started' && (TOPIC_METADATA[t.topic]?.weightage ?? 0) >= 4)
    .sort((a, b) => (TOPIC_METADATA[b.topic]?.weightage ?? 0) - (TOPIC_METADATA[a.topic]?.weightage ?? 0));
  for (const cand of heavyUntouched) {
    const sec = TOPIC_METADATA[cand.topic]?.section ?? '';
    const r = unlessSuppressed({
      kind: 'high_weightage',
      title: '🎯 RAI noticed a gap',
      text: oneLine(`${cand.topic} — still untouched, and ${examContextLine(cand.topic, sec)}.`),
      subject: cand.topic,
    });
    if (r) return r;
  }

  // 4 — REVISION overdue on a finished topic.
  const fading = topicMemory
    .filter((t) => t.revisionOverdue && isCovered(t.status))
    .sort((a, b) => (b.lastTouchedDaysAgo ?? 0) - (a.lastTouchedDaysAgo ?? 0))[0];
  if (fading) {
    const r = unlessSuppressed({
      kind: 'revision',
      title: '🔁 One topic is fading',
      text: oneLine(`${fading.topic} untouched for ${fading.lastTouchedDaysAgo ?? 'several'} days. 20 minutes today locks it in.`),
      subject: fading.topic,
    });
    if (r) return r;
  }

  // 5 — CONSISTENCY worth naming.
  const last5 = new Set(
    (reports ?? [])
      .map((r: any) => r.report_date as string)
      .filter((d: string) => d >= new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0])
  ).size;
  if (last5 >= 4) {
    const r = unlessSuppressed({
      kind: 'consistency',
      title: '🔥 Your consistency is showing',
      text: oneLine(`${last5} of the last 5 days studied. Tomorrow just needs to match today.`),
    });
    if (r) return r;
  }

  // 6 — Progress fallback: coverage moving.
  const finished = topicMemory.filter((t) => isCovered(t.status)).length;
  const remaining = topicMemory.length - finished;
  return {
    kind: 'progress',
    title: '📈 Your map is filling in',
    text: oneLine(`${finished} topics done, ${remaining} to go. Keep feeding the plan.`),
  };
}
