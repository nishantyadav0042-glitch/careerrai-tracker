import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, geminiEnabled } from '@/lib/gemini';

// ── Mentor Doors (founder, 21 July) ──────────────────────────────────────────
// Two ways a free student earns 3 messages with ONE matched IIM buddy:
//   Door 1 'history': preparation history rich enough for real advice —
//                     5 logged days, OR 3 logged days + a mock debrief.
//                     (Proof of seriousness, not an arbitrary streak: a
//                     6-day deep-work student with a mock qualifies; a
//                     7-day all-rest-days student does not.)
//   Door 2 'intent':  reached for the locked buddy TWICE, ≥1 hour apart —
//                     a student who came back to the same locked door is
//                     raising their hand, not browsing.
//
// DORMANT BY DESIGN: doors are detected and recorded the moment they cross
// (so the founder can watch who's waiting), but students get access only when
// MENTOR_DOORS_ENABLED=true AND the grant is activated. Hard rules either
// way: one grant per student ever, one buddy only, 3 student messages total,
// then the upgrade ask. Positioning is never "free reward" — it's "your
// preparation history is now rich enough for real advice."

export const MENTOR_FREE_MESSAGES = 3;

export function mentorDoorsEnabled(): boolean {
  return process.env.MENTOR_DOORS_ENABLED === 'true';
}

type Admin = ReturnType<typeof createAdminClient>;

export interface MentorGrant {
  id: string;
  student_id: string;
  door: 'history' | 'intent';
  eligible_at: string;
  activated_at: string | null;
  buddy_id: string | null;
  messages_used: number;
  opener_draft: string | null;
}

export async function getGrant(admin: Admin, studentId: string): Promise<MentorGrant | null> {
  const { data } = await admin
    .from('mentor_grants')
    .select('id, student_id, door, eligible_at, activated_at, buddy_id, messages_used, opener_draft')
    .eq('student_id', studentId)
    .maybeSingle();
  return (data as MentorGrant | null) ?? null;
}

// A grant gives chat access only when the feature is ON and it's activated
// with a matched buddy.
export function grantIsActive(grant: MentorGrant | null): grant is MentorGrant & { buddy_id: string } {
  return mentorDoorsEnabled() && grant != null && grant.activated_at != null && grant.buddy_id != null;
}

// Door 1: enough preparation history for a buddy to say something real.
export async function historyDoorOpen(admin: Admin, studentId: string): Promise<boolean> {
  const [{ data: days }, { count: mocks }] = await Promise.all([
    admin.from('daily_reports').select('report_date').eq('student_id', studentId),
    admin.from('mock_debriefs').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
  ]);
  const distinct = new Set((days ?? []).map((d: { report_date: string }) => d.report_date)).size;
  return distinct >= 5 || (distinct >= 3 && (mocks ?? 0) >= 1);
}

// Record a door crossing. First door wins; never downgraded, never duplicated.
// Excludes students who already have a real (paid) buddy — the doors are for
// free students only.
export async function recordDoorCrossed(admin: Admin, studentId: string, door: 'history' | 'intent'): Promise<void> {
  const { data: p } = await admin
    .from('profiles')
    .select('buddy_id, is_premium, is_test_account, is_demo')
    .eq('id', studentId)
    .maybeSingle();
  if (!p || p.buddy_id != null || p.is_premium === true || p.is_test_account === true || p.is_demo === true) return;
  await admin
    .from('mentor_grants')
    .upsert(
      { student_id: studentId, door, updated_at: new Date().toISOString() },
      { onConflict: 'student_id', ignoreDuplicates: true }
    );
}

// Called after every daily log — cheap check, idempotent record.
export async function checkHistoryDoorAfterLog(admin: Admin, studentId: string): Promise<void> {
  try {
    const existing = await getGrant(admin, studentId);
    if (existing) return;
    if (await historyDoorOpen(admin, studentId)) {
      await recordDoorCrossed(admin, studentId, 'history');
    }
  } catch {
    /* never let door bookkeeping break a log */
  }
}

// ── Activation (runs only when the founder opens the doors) ─────────────────
// Matches the ONE buddy (least-loaded real buddy — deterministic), generates
// the buddy's data-driven opener draft via Gemini, and stamps activated_at.
// The buddy opens the conversation, not the student — the first message must
// prove the buddy has SEEN the student's week.
export async function activateGrant(admin: Admin, studentId: string): Promise<MentorGrant | null> {
  const grant = await getGrant(admin, studentId);
  if (!grant || grant.activated_at) return grant;

  // Least-loaded active buddy = deterministic match that protects paid capacity.
  const { data: buddies } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'buddy')
    .not('is_test_account', 'is', true)
    .eq('buddy_onboarding_completed', true);
  if (!buddies?.length) return grant;
  const { data: loads } = await admin
    .from('profiles')
    .select('buddy_id')
    .eq('role', 'student')
    .not('buddy_id', 'is', null);
  const loadBy = new Map<string, number>();
  for (const r of loads ?? []) loadBy.set(r.buddy_id as string, (loadBy.get(r.buddy_id as string) ?? 0) + 1);
  const buddy = [...buddies].sort((a, b) => (loadBy.get(a.id) ?? 0) - (loadBy.get(b.id) ?? 0))[0];

  const opener = await generateOpenerDraft(admin, studentId).catch(() => null);

  const { data: updated } = await admin
    .from('mentor_grants')
    .update({
      buddy_id: buddy.id,
      activated_at: new Date().toISOString(),
      opener_draft: opener,
      opener_generated_at: opener ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('student_id', studentId)
    .is('activated_at', null)
    .select('id, student_id, door, eligible_at, activated_at, buddy_id, messages_used, opener_draft')
    .maybeSingle();
  return (updated as MentorGrant | null) ?? grant;
}

// Gemini, pointed at the buddy (founder: "use Gemini smartly and direct it
// toward the buddy"): drafts the PROACTIVE opener from the student's real
// week — logged days, section balance, skipped plan topics, struggles — so
// the first message already feels worth paying for. Facts come from our
// queries; Gemini only phrases them. Falls back to a rule-built opener when
// Gemini is unavailable — the feature never depends on it.
async function generateOpenerDraft(admin: Admin, studentId: string): Promise<string | null> {
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().split('T')[0];
  const [{ data: reports }, { data: routines }, { data: completions }] = await Promise.all([
    admin.from('daily_reports').select('report_date, study_duration, topics_covered, emotional_chips').eq('student_id', studentId).gte('report_date', twoWeeksAgo).order('report_date'),
    admin.from('daily_routines').select('routine_date, tasks').eq('student_id', studentId).gte('routine_date', twoWeeksAgo),
    admin.from('routine_task_completions').select('routine_date, task_id, confidence').eq('student_id', studentId).gte('routine_date', twoWeeksAgo),
  ]);

  // Served vs completed per section — the avoidance signal.
  const doneIds = new Set((completions ?? []).map((c) => `${c.routine_date}:${c.task_id}`));
  const served: Record<string, number> = {};
  const done: Record<string, number> = {};
  for (const r of routines ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (Array.isArray(r.tasks) ? (r.tasks as any[]) : [])) {
      const sec = (t.section as string) ?? 'General';
      served[sec] = (served[sec] ?? 0) + 1;
      if (doneIds.has(`${r.routine_date}:${t.id}`)) done[sec] = (done[sec] ?? 0) + 1;
    }
  }
  const struggles = (completions ?? []).filter((c) => c.confidence === 'red').length;
  const loggedDays = new Set((reports ?? []).map((r) => r.report_date)).size;
  const facts = [
    `Logged days (last 14): ${loggedDays}`,
    ...Object.keys(served).filter((s) => s !== 'General').map((s) => `${s}: ${done[s] ?? 0}/${served[s]} planned tasks completed`),
    struggles > 0 ? `Marked "struggled" on ${struggles} task${struggles === 1 ? '' : 's'}` : 'No struggled marks',
  ].join('\n');

  // Rule-built fallback: weakest completion-ratio section becomes the question.
  const ratios = Object.keys(served)
    .filter((s) => s !== 'General' && served[s] >= 2)
    .map((s) => ({ s, r: (done[s] ?? 0) / served[s] }))
    .sort((a, b) => a.r - b.r);
  const weak = ratios[0];
  const strong = ratios[ratios.length - 1];
  const fallback = weak && strong && weak.s !== strong.s
    ? `I went through your last two weeks — ${strong.s} tasks are getting done consistently, but ${weak.s} keeps getting left (${done[weak.s] ?? 0} of ${served[weak.s]} done). Before you ask me anything: what's happening with ${weak.s}?`
    : `I went through your prep history — ${loggedDays} logged days in two weeks. Tell me the one thing that feels most stuck right now, and we'll start there.`;

  if (!(await geminiEnabled())) return fallback;
  const ai = await callGemini({
    parts: [{
      text: `You are an IIM mentor opening a chat with a CAT aspirant who just unlocked 3 free questions with you. Their real last-14-days data:\n${facts}\n\nWrite the mentor's OPENING message (2-3 sentences, warm but direct, English with natural simplicity). It must: (1) prove you actually looked at their data by citing one specific pattern, (2) end with ONE pointed question about their weakest area. No greetings fluff, no emojis, no invented numbers — only the facts above.`,
    }],
    maxTokens: 200,
    temperature: 0.4,
  });
  return ai?.trim() || fallback;
}

// ── Chat access for free students ───────────────────────────────────────────
// Bridges the existing pair-based chat (profiles.buddy_id) with grant-based
// access. Returns the pair plus how many of the 3 student messages remain.
export interface GrantChatAccess {
  studentId: string;
  buddyId: string;
  viaGrant: true;
  remaining: number; // of MENTOR_FREE_MESSAGES, for the STUDENT's messages
}

export async function resolveGrantAccess(
  admin: Admin,
  userId: string,
  studentId?: string | null
): Promise<GrantChatAccess | null> {
  if (!mentorDoorsEnabled()) return null;
  const { data: me } = await admin.from('profiles').select('id, role, buddy_id').eq('id', userId).maybeSingle();
  if (!me) return null;

  let sid: string | null = null;
  if (me.role === 'student' && !me.buddy_id) sid = me.id;
  else if (me.role === 'buddy' && studentId) sid = studentId;
  if (!sid) return null;

  const grant = await getGrant(admin, sid);
  if (!grantIsActive(grant)) return null;
  if (me.role === 'buddy' && grant.buddy_id !== me.id) return null;

  const { count } = await admin
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', sid)
    .eq('buddy_id', grant.buddy_id)
    .eq('sender_id', sid);
  return {
    studentId: sid,
    buddyId: grant.buddy_id,
    viaGrant: true,
    remaining: Math.max(0, MENTOR_FREE_MESSAGES - (count ?? 0)),
  };
}
