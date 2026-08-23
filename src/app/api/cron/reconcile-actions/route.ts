import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';

export const maxDuration = 300;

// The half of the learning loop that makes it a loop.
//
// next-action records what we recommended. This job looks at what actually
// happened afterwards and writes the verdict, which then re-ranks that
// student's future recommendations (see nextBestActions' history input).
//
// "Followed" is judged from real movement, never from a tap:
//   * the recommended topic's coverage advanced after we suggested it, or
//   * they logged study in that section on that day.
// A tap on a card proves interest. Coverage moving proves the advice worked,
// and only the second one is worth learning from.
//
// Anything still ambiguous after the window is marked 'ignored' rather than
// left null, because a recommendation that produced nothing IS the signal —
// silently dropping those would make every action kind look effective.

const GRACE_HOURS = 36;
const BATCH = 500;

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/reconcile-actions', async () => {
    const admin = createAdminClient();

    const cutoff = new Date(Date.now() - GRACE_HOURS * 3_600_000).toISOString();
    const { data: pending } = await admin
      .from('study_action_log')
      .select('id, student_id, kind, topic, section, shown_at')
      .is('outcome', null)
      .lt('shown_at', cutoff)
      .order('shown_at', { ascending: true })
      .limit(BATCH);

    if (!pending?.length) return NextResponse.json({ resolved: 0, followed: 0 });

    // One read per student rather than per row — a student typically has three
    // rows in the same batch.
    const byStudent = new Map<string, typeof pending>();
    for (const p of pending) {
      const list = byStudent.get(p.student_id as string) ?? [];
      list.push(p);
      byStudent.set(p.student_id as string, list);
    }

    let followed = 0;
    let resolved = 0;

    for (const [studentId, rows] of byStudent) {
      const earliest = rows.reduce((min, r) => (r.shown_at < min ? r.shown_at : min), rows[0].shown_at as string);

      const [{ data: cov }, { data: reports }] = await Promise.all([
        admin.from('topic_coverage').select('topic, updated_at').eq('student_id', studentId),
        admin.from('daily_reports').select('report_date, sections')
          .eq('student_id', studentId).gte('report_date', String(earliest).slice(0, 10)),
      ]);

      const movedAt = new Map<string, number>();
      for (const c of cov ?? []) {
        if (c.updated_at) movedAt.set(c.topic as string, Date.parse(c.updated_at as string));
      }

      for (const r of rows) {
        const shown = Date.parse(r.shown_at as string);
        let didFollow = false;

        if (r.topic) {
          const moved = movedAt.get(r.topic as string);
          if (moved && moved > shown) didFollow = true;
        }

        if (!didFollow && r.section) {
          const day = String(r.shown_at).slice(0, 10);
          didFollow = (reports ?? []).some((rep) => {
            if ((rep.report_date as string) < day) return false;
            const secs = rep.sections;
            return Array.isArray(secs) && secs.includes(r.section as string);
          });
        }

        await admin.from('study_action_log')
          .update({ outcome: didFollow ? 'followed' : 'ignored', outcome_at: new Date().toISOString() })
          .eq('id', r.id);

        resolved++;
        if (didFollow) followed++;
      }
    }

    return NextResponse.json({ resolved, followed, followRate: resolved ? Math.round((followed / resolved) * 100) : 0 });
  });
}

export { POST as GET };
