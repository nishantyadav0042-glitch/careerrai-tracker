import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { assessPlanCoverage, planCoverageExceptions, CONCENTRATION_LIMIT, MIN_DAYS_TO_JUDGE, type PlannedSlot, type PlanCoverageRow } from '@/lib/os/plan-coverage';

export const dynamic = 'force-dynamic';

// Plan Coverage — the report that would have caught the Percentages loop on
// day two instead of day eighteen (founder, 11 Aug).
//
// Every other dashboard counts logs, streaks, hours and completed tasks. All of
// those looked HEALTHY for Abhishek while he was shown 13 topics out of 53 and
// Percentages seven times. Consistency metrics cannot see a plan that repeats
// itself — only distinct-topic counting can, and nothing counted it.
//
// Exceptions first, per the house rule: a healthy plan renders no row.

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'bad' | 'warn' | 'ok' }) {
  const color = tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : 'text-stone-900';
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export default async function PlanCoveragePage() {
  const { admin } = await requireAdmin();

  const [{ data: profiles }, { data: routines }, { data: coverage }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, syllabus_target_date, is_test_account, is_demo')
      .eq('role', 'student'),
    admin.from('daily_routines').select('student_id, routine_date, tasks'),
    admin.from('topic_coverage').select('student_id, status'),
  ]);

  const real = (profiles ?? []).filter((p) => !p.is_test_account && !p.is_demo);
  const byStudent = new Map<string, PlannedSlot[]>();
  for (const r of routines ?? []) {
    const list = byStudent.get(r.student_id) ?? [];
    for (const t of (Array.isArray(r.tasks) ? (r.tasks as Record<string, unknown>[]) : [])) {
      list.push({
        routineDate: r.routine_date as string,
        topic: (t.topic as string | null) ?? null,
        minutes: typeof t.minutes === 'number' ? t.minutes : null,
      });
    }
    byStudent.set(r.student_id, list);
  }
  const cov = new Map<string, { total: number; never: number }>();
  for (const c of coverage ?? []) {
    const e = cov.get(c.student_id) ?? { total: 0, never: 0 };
    e.total++;
    if (c.status === 'not_started') e.never++;
    cov.set(c.student_id, e);
  }

  const today = new Date();
  const rows: PlanCoverageRow[] = real.map((p) => {
    const c = cov.get(p.id) ?? { total: 0, never: 0 };
    const target = p.syllabus_target_date as string | null;
    return assessPlanCoverage({
      studentId: p.id,
      name: (p.full_name as string | null) ?? 'Student',
      slots: byStudent.get(p.id) ?? [],
      neverOpened: c.never,
      totalTopics: c.total,
      daysToTarget: target ? Math.round((Date.parse(target) - today.getTime()) / 86_400_000) : null,
    });
  });

  const judged = rows.filter((r) => r.verdict !== 'too_early');
  const broken = planCoverageExceptions(rows);
  const healthy = judged.length - broken.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Plan Coverage
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-stone-600">
          How many <b>distinct topics</b> each student&apos;s plan has actually taught, and how many
          hours it asked for. Streaks and completed-task counts cannot see a plan that repeats
          itself — this is the only screen that can. A plan is flagged when one topic takes more
          than <b>{CONCENTRATION_LIMIT}%</b> of everything the student has been given.
          Judged after <b>{MIN_DAYS_TO_JUDGE} days</b> of plans; healthy plans do not appear.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Students judged" value={judged.length} />
        <Stat label="Plans repeating" value={broken.length} tone={broken.length ? 'bad' : 'ok'} />
        <Stat label="Healthy" value={healthy} tone="ok" />
        <Stat label="Too early to judge" value={rows.length - judged.length} />
      </div>

      {broken.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          No plan is repeating itself. Every student with {MIN_DAYS_TO_JUDGE}+ days of plans is
          being shown a spread of topics.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="bg-stone-50 text-left text-[10px] uppercase tracking-widest text-stone-500">
                <th className="px-4 py-2.5 font-semibold">Student</th>
                <th className="px-4 py-2.5 font-semibold">Days</th>
                <th className="px-4 py-2.5 font-semibold">Topics taught</th>
                <th className="px-4 py-2.5 font-semibold">Hours planned</th>
                <th className="px-4 py-2.5 font-semibold">Most-repeated</th>
                <th className="px-4 py-2.5 font-semibold">Never opened</th>
                <th className="px-4 py-2.5 font-semibold">Days left</th>
              </tr>
            </thead>
            <tbody>
              {broken.map((r) => (
                <tr key={r.studentId} className="border-t border-stone-100 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/admin/students/${r.studentId}`} className="font-semibold text-stone-900 hover:text-orange-600">
                      {r.name}
                    </Link>
                    <p className="mt-0.5 max-w-md text-xs text-stone-500">{r.reason}</p>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-stone-700">{r.planDays}</td>
                  <td className="px-4 py-3 text-sm tabular-nums">
                    <span className="font-bold text-stone-900">{r.distinctTopics}</span>
                    <span className="text-stone-400"> / {r.totalTopics}</span>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-stone-700">{r.plannedHours}h</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="font-medium text-stone-900">{r.worstTopic}</span>
                    <span className="ml-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold tabular-nums text-rose-700">
                      {r.worstCount}× · {r.concentration}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-stone-700">{r.neverOpened}</td>
                  <td className={`px-4 py-3 text-sm tabular-nums ${r.daysToTarget != null && r.daysToTarget < 30 ? 'font-bold text-rose-700' : 'text-stone-700'}`}>
                    {r.daysToTarget ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
