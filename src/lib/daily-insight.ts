import { TOPIC_METADATA } from '@/lib/topics-constants';
import { computeTopicMemory } from '@/lib/prep-memory-data';

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

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DailyInsight {
  kind: 'recovery' | 'avoidance' | 'high_weightage' | 'revision' | 'consistency' | 'progress';
  title: string;
  text: string;
}

export async function computeDailyInsight(
  admin: any,
  studentId: string,
  archetype: { isRepeater: boolean; isWorkingProfessional: boolean },
  // Callers that already computed topic memory this request (the Home page)
  // pass it in — one expensive scan, two consumers.
  prefetched?: { topicMemory?: Awaited<ReturnType<typeof computeTopicMemory>> }
): Promise<DailyInsight | null> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().split('T')[0];
  const [{ data: reports }, { data: routines }, { data: completions }, topicMemory] = await Promise.all([
    admin.from('daily_reports').select('report_date').eq('student_id', studentId).gte('report_date', fourteenDaysAgo),
    admin.from('daily_routines').select('routine_date, tasks').eq('student_id', studentId).gte('routine_date', fourteenDaysAgo),
    admin.from('routine_task_completions').select('routine_date, task_id, confidence').eq('student_id', studentId).gte('routine_date', fourteenDaysAgo),
    prefetched?.topicMemory ? Promise.resolve(prefetched.topicMemory) : computeTopicMemory(admin, studentId, archetype),
  ]);

  const loggedDays = new Set((reports ?? []).map((r: any) => r.report_date as string)).size;
  if (loggedDays < 2) return null; // patterns need at least a little history

  // task_id → {topic, section} from the served routines.
  const taskMeta = new Map<string, { topic: string | null; section: string }>();
  const served: Record<string, number> = {};
  for (const r of routines ?? []) {
    for (const t of (Array.isArray(r.tasks) ? (r.tasks as any[]) : [])) {
      taskMeta.set(String(t.id), { topic: (t.topic as string | null) ?? null, section: (t.section as string) ?? 'General' });
      const sec = (t.section as string) ?? 'General';
      if (sec !== 'General') served[sec] = (served[sec] ?? 0) + 1;
    }
  }
  const doneBySec: Record<string, number> = {};
  for (const c of completions ?? []) {
    const sec = taskMeta.get(String(c.task_id))?.section;
    if (sec && sec !== 'General') doneBySec[sec] = (doneBySec[sec] ?? 0) + 1;
  }

  // 1 — RECOVERY: same topic, struggled (red) then solid (green) later.
  const byTopic = new Map<string, { date: string; confidence: string | null }[]>();
  for (const c of completions ?? []) {
    const topic = taskMeta.get(String(c.task_id))?.topic;
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
      return {
        kind: 'recovery',
        title: '🔥 You beat a hard topic',
        text: `You turned ${topic} from struggled to solid — proof you improve when you stay with difficult topics. ${stillRed ? `Same move works for ${stillRed} next.` : 'Remember this next time a topic fights back.'}`,
      };
    }
  }

  // 2 — AVOIDANCE: a section served ≥3 tasks with <1/3 done, while another gets finished.
  const avoided = Object.keys(served)
    .filter((s) => served[s] >= 3 && (doneBySec[s] ?? 0) / served[s] < 0.34)
    .sort((a, b) => (doneBySec[a] ?? 0) / served[a] - (doneBySec[b] ?? 0) / served[b])[0];
  if (avoided) {
    const strongest = Object.keys(served)
      .filter((s) => s !== avoided && served[s] >= 2)
      .sort((a, b) => (doneBySec[b] ?? 0) / served[b] - (doneBySec[a] ?? 0) / served[a])[0];
    return {
      kind: 'avoidance',
      title: `📊 A pattern in your week`,
      text: `This week you consistently chose ${strongest ?? 'other sections'} over ${avoided} — ${doneBySec[avoided] ?? 0} of ${served[avoided]} ${avoided} tasks done. One advice from CareerRai: don't add more ${strongest ?? 'strong-section'} tomorrow. Give ${avoided} 20 focused minutes first — one small win breaks the pattern.`,
    };
  }

  // 3 — HIGH-WEIGHTAGE untouched: name the marks at risk.
  const heavyUntouched = topicMemory
    .filter((t) => t.status === 'not_started' && (TOPIC_METADATA[t.topic]?.weightage ?? 0) >= 4)
    .sort((a, b) => (TOPIC_METADATA[b.topic]?.weightage ?? 0) - (TOPIC_METADATA[a.topic]?.weightage ?? 0));
  if (heavyUntouched.length > 0) {
    const names = heavyUntouched.slice(0, 2).map((t) => t.topic);
    const sec = TOPIC_METADATA[names[0]]?.section ?? '';
    return {
      kind: 'high_weightage',
      title: '🎯 Where the marks are',
      text: `${names.join(' and ')} carr${names.length === 1 ? 'ies' : 'y'} some of the highest marks in ${sec} — and ${names.length === 1 ? "it's" : "they're"} still untouched. Starting there this week moves your score more than anything else on your list.`,
    };
  }

  // 4 — REVISION overdue on a finished topic.
  const fading = topicMemory
    .filter((t) => t.revisionOverdue && (t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready'))
    .sort((a, b) => (b.lastTouchedDaysAgo ?? 0) - (a.lastTouchedDaysAgo ?? 0))[0];
  if (fading) {
    return {
      kind: 'revision',
      title: '🔁 One topic is fading',
      text: `${fading.topic} was last practised ${fading.lastTouchedDaysAgo ?? 'several'} days ago — memory fades fastest right after learning. 20 minutes of revision today locks in what you already earned.`,
    };
  }

  // 5 — CONSISTENCY worth naming.
  const last5 = new Set(
    (reports ?? [])
      .map((r: any) => r.report_date as string)
      .filter((d: string) => d >= new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0])
  ).size;
  if (last5 >= 4) {
    return {
      kind: 'consistency',
      title: '🔥 Your consistency is showing',
      text: `${last5} of the last 5 days logged — that rhythm is what separates finishers from starters. Tomorrow only needs to match today.`,
    };
  }

  // 6 — Progress fallback: coverage moving.
  const finished = topicMemory.filter((t) => t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready').length;
  const remaining = topicMemory.length - finished;
  return {
    kind: 'progress',
    title: '📈 Your map is filling in',
    text: `${finished} topics finished, ${remaining} to go. Every log makes tomorrow's plan sharper — keep feeding it.`,
  };
}
