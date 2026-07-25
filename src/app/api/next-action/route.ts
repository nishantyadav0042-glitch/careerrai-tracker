import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextBestActions } from '@/lib/next-action';
import { sanitizeTargets } from '@/lib/timetable';
import { computeTargetProgress, targetKey } from '@/lib/coaching-progress';

export const maxDuration = 60;

// "What's the highest-value thing I can do in the time I have?"
//
// Every number in the answer is this student's own. Nothing is modelled,
// nothing is predicted — we rank real signals we already hold and show the
// evidence beside each one.

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const raw = Number(request.nextUrl.searchParams.get('minutes'));
  const minutes = Number.isFinite(raw) ? Math.max(10, Math.min(300, Math.floor(raw))) : 60;

  const admin = createAdminClient();
  const [{ data: cov }, { data: mock }, { data: tt }, { data: prof }, { data: prog }] = await Promise.all([
    admin.from('topic_coverage').select('topic, status, is_priority, updated_at').eq('student_id', user.id),
    admin.from('mock_debriefs').select('varc, dilr, qa, taken_on')
      .eq('student_id', user.id).order('taken_on', { ascending: false }).limit(1).maybeSingle(),
    admin.from('student_timetables').select('targets, confirmed_at').eq('student_id', user.id).maybeSingle(),
    admin.from('profiles').select('plan_source').eq('id', user.id).maybeSingle(),
    admin.from('coaching_target_progress').select('target_key, done').eq('student_id', user.id),
  ]);

  const coverage = (cov ?? []).map((c) => ({
    topic: c.topic as string,
    status: (c.status as string) ?? 'not_started',
    isPriority: c.is_priority === true,
  }));

  // Days since each topic was last touched, from the coverage row's own
  // timestamp. Approximate, and honestly so — it's the only practice signal
  // we hold per topic.
  const now = Date.now();
  const daysSincePractice: Record<string, number | null> = {};
  for (const c of cov ?? []) {
    daysSincePractice[c.topic as string] = c.updated_at
      ? Math.floor((now - Date.parse(c.updated_at as string)) / 86_400_000)
      : null;
  }

  // Section percentiles live in jsonb ({ percentile: number } per section).
  const pct = (v: unknown): number | null => {
    const n = Number((v as { percentile?: unknown } | null)?.percentile);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  const mockPercentiles = mock
    ? { varc: pct(mock.varc), dilr: pct(mock.dilr), qa: pct(mock.qa) }
    : null;

  const doneBy = new Map<string, number>((prog ?? []).map((r) => [r.target_key as string, Number(r.done) || 0]));
  const targets = sanitizeTargets(tt?.targets)
    .map((t) => computeTargetProgress(t, doneBy.get(targetKey(t)) ?? 0, (tt?.confirmed_at as string | null) ?? null));

  const actions = nextBestActions({
    minutes,
    coverage,
    mock: mockPercentiles,
    daysSincePractice,
    targets,
    followingCoaching: prof?.plan_source === 'coaching',
  });

  return NextResponse.json({ minutes, actions });
}
