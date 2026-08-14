import { createAdminClient } from '@/lib/supabase/admin';
import { liveStreak } from '@/lib/streak-utils';
import { callGemini, GOVERNING_RULE, stripNames, geminiEnabled } from '@/lib/gemini';
import { computeTopicMemory } from '@/lib/prep-memory-data';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { isCovered } from './coverage-status';

// Shared generator behind the buddy's AI facts-briefing — used by the manual
// "Refresh" button AND by ambient auto-triggers (mock submitted, emotional flag
// raised, daily roster freshness pass). The Tutor CoPilot RCT's gain came from
// the assist being ALREADY THERE at the moment of use, not behind an extra tap —
// a busy part-time mentor won't remember to click a button, so this fires itself.

interface MockDebrief {
  taken_on: string;
  overall_percentile: number | null;
  varc: { percentile?: number | null } | null;
  dilr: { percentile?: number | null } | null;
  qa: { percentile?: number | null } | null;
  error_buckets: { conceptual: number; silly: number; time: number; panic: number; selection: number } | null;
}

export interface BuddyBriefing { summary_text: string; source: 'ai' | 'fallback'; generated_at: string }

export async function generateBuddyBriefing(studentId: string, buddyId: string): Promise<BuddyBriefing | null> {
  const admin = createAdminClient();

  const { data: student } = await admin
    .from('profiles')
    .select('buddy_id, full_name, current_streak, last_log_date, is_repeater, is_working_professional')
    .eq('id', studentId)
    .single();
  if (!student || student.buddy_id !== buddyId) return null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().split('T')[0];

  const [{ data: logs }, { data: debriefs }, { count: totalMocks }, topicMemory, { data: routines }, { data: completions }] = await Promise.all([
    admin
      .from('daily_reports')
      .select('report_date, study_duration, topics_covered, confidence, stress')
      .eq('student_id', studentId)
      .gte('report_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('report_date', { ascending: false }),
    admin
      .from('mock_debriefs')
      .select('taken_on, overall_percentile, varc, dilr, qa, error_buckets')
      .eq('student_id', studentId)
      .order('taken_on', { ascending: false })
      .limit(3),
    admin.from('mock_debriefs').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
    computeTopicMemory(admin, studentId, {
      isRepeater: student.is_repeater === true,
      isWorkingProfessional: student.is_working_professional === true,
    }),
    admin.from('daily_routines').select('routine_date, tasks').eq('student_id', studentId).gte('routine_date', fourteenDaysAgo),
    admin.from('routine_task_completions').select('routine_date, task_id, confidence').eq('student_id', studentId).gte('routine_date', fourteenDaysAgo),
  ]);

  // ── Syllabus picture (founder, 21 July: buddy must see covered / remaining /
  // revision / mock count — plus detected patterns) ─────────────────────────
  const covered = topicMemory.filter((t) => isCovered(t.status));
  const inProgress = topicMemory.filter((t) => t.status === 'learning');
  const untouched = topicMemory.filter((t) => t.status === 'not_started');
  const perSection = (['QA', 'VARC', 'DILR'] as const).map((sec) => {
    const all = topicMemory.filter((t) => TOPIC_METADATA[t.topic]?.section === sec);
    const done = all.filter((t) => isCovered(t.status)).length;
    return `${sec} ${done}/${all.length}`;
  }).join(', ');
  // The pattern that matters most: HIGH-WEIGHTAGE topics still untouched.
  const highWeightUntouched = untouched
    .filter((t) => (TOPIC_METADATA[t.topic]?.weightage ?? 0) >= 4)
    .sort((a, b) => (TOPIC_METADATA[b.topic]?.weightage ?? 0) - (TOPIC_METADATA[a.topic]?.weightage ?? 0))
    .slice(0, 4)
    .map((t) => t.topic);
  const revisionDue = covered.filter((t) => t.revisionOverdue).slice(0, 5).map((t) => t.topic);

  // Plan avoidance pattern (last 14 days): served vs completed per section.
  const doneIds = new Set((completions ?? []).map((c) => `${c.routine_date}:${c.task_id}`));
  const served: Record<string, number> = {};
  const doneCount: Record<string, number> = {};
  for (const r of routines ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (Array.isArray(r.tasks) ? (r.tasks as any[]) : [])) {
      const sec = (t.section as string) ?? 'General';
      if (sec === 'General') continue;
      served[sec] = (served[sec] ?? 0) + 1;
      if (doneIds.has(`${r.routine_date}:${t.id}`)) doneCount[sec] = (doneCount[sec] ?? 0) + 1;
    }
  }
  const avoidance = Object.keys(served)
    .filter((s) => served[s] >= 3 && (doneCount[s] ?? 0) / served[s] < 0.34)
    .map((s) => `${s} tasks completed ${doneCount[s] ?? 0}/${served[s]} (last 14 days)`);
  const struggledMarks = (completions ?? []).filter((c) => c.confidence === 'red').length;

  const daysLogged = logs?.length ?? 0;
  const avgHours = daysLogged > 0
    ? ((logs ?? []).reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
    : '0';
  const avgStress = daysLogged > 0
    ? ((logs ?? []).reduce((s, r) => s + (r.stress ?? 3), 0) / daysLogged).toFixed(1)
    : 'n/a';
  const avgConfidence = daysLogged > 0
    ? ((logs ?? []).reduce((s, r) => s + (r.confidence ?? 3), 0) / daysLogged).toFixed(1)
    : 'n/a';

  const topicsFlat = (logs ?? []).flatMap((r) => (r.topics_covered ?? []) as string[]);
  const topicCounts: Record<string, number> = {};
  for (const t of topicsFlat) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ');

  const mocksText = ((debriefs ?? []) as MockDebrief[]).map((d, i) => {
    const sec = [
      d.varc?.percentile != null ? `VARC ${d.varc.percentile}%ile` : null,
      d.dilr?.percentile != null ? `DILR ${d.dilr.percentile}%ile` : null,
      d.qa?.percentile != null ? `QA ${d.qa.percentile}%ile` : null,
    ].filter(Boolean).join(', ');
    const eb = d.error_buckets;
    const ebText = eb ? `errors: knowledge-gap=${eb.conceptual}, execution=${eb.silly}, time-misallocation=${eb.time}` : '';
    return `Mock ${i + 1} (${d.taken_on}): ${d.overall_percentile ?? '?'}%ile. ${sec}. ${ebText}`.trim();
  }).join('\n');

  const syllabusFacts = [
    `Syllabus: ${covered.length} topics studied, ${inProgress.length} in progress, ${untouched.length} untouched (${perSection})`,
    highWeightUntouched.length ? `HIGH-WEIGHTAGE topics still untouched: ${highWeightUntouched.join(', ')}` : 'No high-weightage topic untouched',
    revisionDue.length ? `Revision overdue: ${revisionDue.join(', ')}` : 'No revision overdue',
    `Total mocks debriefed: ${totalMocks ?? 0}`,
    ...avoidance.map((a) => `Plan-avoidance pattern: ${a}`),
    struggledMarks > 0 ? `Marked "struggled" on ${struggledMarks} plan task${struggledMarks === 1 ? '' : 's'} (last 14 days)` : '',
  ].filter(Boolean);

  const factsContext = [
    `Streak: ${liveStreak(student.current_streak, student.last_log_date)} days`,
    `Last 7 days: ${daysLogged}/7 days logged, avg ${avgHours} hrs/day`,
    `Avg confidence: ${avgConfidence}/5, avg stress: ${avgStress}/5`,
    topTopics ? `Topics covered: ${topTopics}` : 'No topics logged',
    ...syllabusFacts,
    debriefs?.length ? `Recent mocks:\n${mocksText}` : 'No mocks logged recently',
  ].join('\n');

  let summaryText: string;
  let source: 'ai' | 'fallback' = 'fallback';

  if (await geminiEnabled()) {
    const safeContext = stripNames(factsContext, [student.full_name]);
    const aiResult = await callGemini({
      parts: [{
        text: `Here is the student's data for the last 7 days:\n${safeContext}\n\nWrite a briefing for the mentor in 4-7 bullet points, always covering: syllabus coverage (studied/remaining), high-weightage untouched topics, revision overdue, mock count, and any avoidance pattern. State only verifiable facts and numbers — no diagnoses, no recommendations, no interpretations. Each bullet: one factual sentence. If a pattern seems notable, phrase it as an open question (e.g. "DILR accuracy flat across 3 mocks — worth exploring why") rather than a conclusion. No student name.`,
      }],
      system: GOVERNING_RULE,
      maxTokens: 320,
      temperature: 0.2,
    });

    if (aiResult) {
      summaryText = stripNames(aiResult, [student.full_name]);
      source = 'ai';
    } else {
      summaryText = fallbackBriefing(daysLogged, avgHours, avgStress, liveStreak(student.current_streak, student.last_log_date), (debriefs ?? []) as MockDebrief[], syllabusFacts);
    }
  } else {
    summaryText = fallbackBriefing(daysLogged, avgHours, avgStress, liveStreak(student.current_streak, student.last_log_date), (debriefs ?? []) as MockDebrief[], syllabusFacts);
  }

  const generated_at = new Date().toISOString();
  await admin
    .from('buddy_briefings')
    .upsert(
      { student_id: studentId, buddy_id: buddyId, summary_text: summaryText, source, generated_at },
      { onConflict: 'student_id,buddy_id' }
    );

  return { summary_text: summaryText, source, generated_at };
}

// `refreshBriefingIfStale` used to live here — a staleness check the buddy-brief
// cron called each morning for every student who logged the day before.
//
// It is gone, not disabled. Founder, 9 Aug: "don't automatically produce AI
// response — someone has to tap to get the response, don't make it auto ready."
// A staleness helper only exists to serve a caller that generates without being
// asked, so leaving it here would be leaving the road back. There is now exactly
// one producer of a briefing — `api/buddy/briefing/[studentId]` POST, behind the
// Refresh button — and `generateBuddyBriefing` above is the only export it needs.

function fallbackBriefing(
  daysLogged: number,
  avgHours: string,
  avgStress: string,
  streak: number,
  debriefs: MockDebrief[],
  syllabusFacts: string[] = []
): string {
  const lines = [
    `• Logged ${daysLogged}/7 days, averaging ${avgHours} hrs/day. Streak: ${streak} days. Avg stress: ${avgStress}/5.`,
    ...syllabusFacts.map((f) => `• ${f}`),
  ];
  if (debriefs.length > 0 && debriefs[0].overall_percentile != null) {
    lines.push(`• Latest mock (${debriefs[0].taken_on}): ${debriefs[0].overall_percentile}%ile overall.`);
    if (debriefs.length >= 2 && debriefs[1].overall_percentile != null) {
      const delta = debriefs[0].overall_percentile - debriefs[1].overall_percentile;
      lines.push(`• Percentile ${delta >= 0 ? 'rose' : 'fell'} ${Math.abs(delta).toFixed(0)} points across last 2 mocks.`);
    }
    const eb = debriefs[0].error_buckets;
    if (eb) {
      const total = eb.conceptual + eb.silly + eb.time + eb.panic + eb.selection;
      if (total > 0) {
        lines.push(`• Error breakdown (latest mock): knowledge-gap=${eb.conceptual}, execution=${eb.silly}, time-misallocation=${eb.time}, misread/framing=${eb.panic}, selection=${eb.selection}.`);
      }
    }
  } else {
    lines.push('• No mocks debriefed in the last 7 days.');
  }
  return lines.join('\n');
}
