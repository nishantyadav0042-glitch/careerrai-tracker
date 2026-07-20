import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';
import { computeTopicMemory } from '@/lib/prep-memory-data';
import { projectSyllabusFinish } from '@/lib/study-plan';
import { catExamDate } from '@/lib/routine-engine';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { callGemini } from '@/lib/gemini';
import { getLogDateString, liveStreak } from '@/lib/streak-utils';

// The daily "coach line": ONE warm sentence reflecting the student's real prep
// status. The MOAT RULE holds — every number is computed deterministically
// here; the model only re-words the facts we hand it. It may never diagnose,
// recommend, or invent. Cached once per student per day (stable + cheap), with
// a deterministic fallback so a missing/slow model is invisible to the student.

const SYSTEM = `You write ONE short, warm, plain-English sentence for a CAT-prep student, reflecting the status facts you're given.
STRICT RULES:
- Use ONLY the facts provided. Never invent a number, topic, date, or claim.
- Never diagnose a weakness, never tell them what to study, never give advice — only reflect where they stand, encouragingly.
- No exclamation-mark spam, no hype, no emojis. Grounded and calm.
- One sentence, at most 24 words.
Return only the sentence.`;

interface Facts {
  studiedThrough: number;
  inProgress: number;
  notStarted: number;
  totalTopics: number;
  finishStatus: string;
  finishWindow: string | null;
  targetDate: string | null;
  currentStreak: number;
}

function fallbackLine(f: Facts): string {
  if (f.notStarted === 0 && f.inProgress === 0 && f.studiedThrough > 0) {
    return `All ${f.totalTopics} topics studied through — you're into revision and mocks now.`;
  }
  const base = `${f.studiedThrough} of ${f.totalTopics} topics studied through, ${f.inProgress} in progress.`;
  if (f.finishWindow) return `${base} On pace to finish ${f.finishWindow}.`;
  return base;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ line: null });

  const admin = createAdminClient();
  const today = getLogDateString();

  // Cache hit → return today's line untouched (stable across refreshes).
  const { data: cached } = await admin
    .from('daily_coach_line')
    .select('text')
    .eq('student_id', user.id)
    .eq('line_date', today)
    .maybeSingle();
  if (cached?.text) return NextResponse.json({ line: cached.text });

  const { data: profile } = await admin
    .from('profiles')
    .select('attempt_year, is_repeater, is_working_professional, syllabus_target_date')
    .eq('id', user.id)
    .single();

  const archetype = { isRepeater: !!profile?.is_repeater, isWorkingProfessional: !!profile?.is_working_professional };
  const topicMemory = await computeTopicMemory(admin, user.id, archetype);
  const totalTopics = Object.keys(TOPIC_METADATA).length;
  const studiedThrough = topicMemory.filter((t) => t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready').length;
  const inProgress = topicMemory.filter((t) => t.status === 'learning').length;
  const notStarted = topicMemory.filter((t) => t.status === 'not_started').length;

  // Nothing declared yet — no honest status to narrate. Stay silent.
  if (studiedThrough + inProgress + notStarted === 0 || (studiedThrough === 0 && inProgress === 0)) {
    return NextResponse.json({ line: null });
  }

  const now = new Date();
  let examYear = (profile?.attempt_year as number | null) ?? now.getFullYear();
  if (now > catExamDate(examYear)) examYear += 1;
  const startedLast21 = topicMemory.filter(
    (t) => t.status !== 'not_started' && t.firstTouchedDaysAgo != null && t.firstTouchedDaysAgo <= 21
  ).length;
  const finish = projectSyllabusFinish({
    today: now,
    examDate: catExamDate(examYear),
    topicsRemaining: notStarted + inProgress,
    topicsStartedLast21Days: startedLast21,
  });

  const { data: streak } = await admin
    .from('streak_data')
    .select('current_streak, last_log_date')
    .eq('student_id', user.id)
    .maybeSingle();

  const facts: Facts = {
    studiedThrough,
    inProgress,
    notStarted,
    totalTopics,
    finishStatus: finish.status,
    finishWindow: finish.windowLabel,
    targetDate: (profile?.syllabus_target_date as string | null) ?? null,
    currentStreak: liveStreak(streak?.current_streak, streak?.last_log_date),
  };

  const raw = await callGemini({
    system: SYSTEM,
    parts: [{ text: `Facts (JSON):\n${JSON.stringify(facts)}\n\nWrite the one-sentence status line.` }],
    maxTokens: 60,
    temperature: 0.5,
  });

  const line = (raw ?? '').replace(/^["']|["']$/g, '').trim() || fallbackLine(facts);

  // Best-effort cache — a write failure just means we recompute next time.
  await admin.from('daily_coach_line').upsert(
    { student_id: user.id, line_date: today, text: line },
    { onConflict: 'student_id,line_date' }
  );

  return NextResponse.json({ line });
}
