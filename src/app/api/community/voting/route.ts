import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dailyPickIndex, VOTE_PROMPT } from '@/lib/community-pipeline';
import { getLogDateString } from '@/lib/streak-utils';

export const maxDuration = 30;

// GET /api/community/voting — today's one tip and one question for THIS
// student to judge. Not the leader (rich-get-richer), not a feed (that's
// social media): a stable-for-the-day pick per student from the open pool,
// excluding what they submitted and what they've already voted on. No vote
// counts anywhere in the payload — herding is the failure mode.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [{ data: pool }, { data: myVotes }] = await Promise.all([
    admin.from('student_submissions')
      .select('id, kind, topic, payload, image_path, display_name, student_id')
      .eq('status', 'voting').gt('voting_ends_at', nowIso)
      .order('id'),
    admin.from('submission_votes').select('submission_id').eq('student_id', user.id),
  ]);

  const voted = new Set((myVotes ?? []).map((v) => v.submission_id as string));
  const eligible = (pool ?? []).filter((p) => p.student_id !== user.id && !voted.has(p.id as string));

  const day = getLogDateString();
  const pickBy = (kind: string, section?: string) => {
    const items = eligible.filter((p) => {
      if (p.kind !== kind) return false;
      if (!section) return true;
      return ((p.payload ?? {}) as { section?: string }).section === section;
    });
    if (items.length === 0) return null;
    // Salt the hash with the section so a student doesn't get the same index
    // position across all three sections every day.
    const item = items[dailyPickIndex(`${user.id}:${section ?? ''}`, day, items.length)];
    const payload = (item.payload ?? {}) as { text?: string; section?: string; options?: string[] };
    return {
      id: item.id as string,
      kind,
      section: payload.section ?? null,
      topic: (item.topic as string | null) ?? null,
      text: payload.text ?? null,
      options: Array.isArray(payload.options) ? payload.options : null,
      imageUrl: item.image_path
        ? admin.storage.from('community-questions').getPublicUrl(item.image_path as string).data.publicUrl
        : null,
      displayName: (item.display_name as string | null) ?? 'a CareerRai student',
      prompt: VOTE_PROMPT[kind],
    };
  };

  // One question per section (founder, 25 Jul: all three sections in Daily
  // Pick — long formats arrive as photos). Each is its own stable daily pick.
  const questions = ['QA', 'DILR', 'VARC']
    .map((sec) => pickBy('question', sec))
    .filter((q) => q != null);

  return NextResponse.json({ tip: pickBy('tip'), questions });
}
