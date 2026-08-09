import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminStat } from '@/components/admin/workspace-shell';
import { getRealStudents, getLoggedToday, getStreaksAlive, getGoingCold, getWantsBuddy } from '@/lib/admin-filters';

export const dynamic = 'force-dynamic';

// Metric integrity — do the dashboard numbers still agree with the tables?
//
// /api/admin/metric-integrity existed with no page. The panel's strongest idea
// is that a card's count IS the length of the list behind it (lib/admin-filters
// returns both), so the two cannot drift — this page re-runs each filter and
// shows the number, so the guarantee is visible rather than merely believed.
export default async function IntegrityPage() {
  const { admin } = await requireAdmin();

  const students = await getRealStudents(admin);
  const [logged, alive, cold, wants] = await Promise.all([
    getLoggedToday(admin, students),
    getStreaksAlive(admin, students),
    getGoingCold(admin, students),
    getWantsBuddy(admin),
  ]);

  const checks = [
    { label: 'Real students', n: students.length, rule: "role='student', not test, not demo" },
    { label: 'Logged today', n: logged.length, rule: 'daily_reports row for the 3 AM IST log-day' },
    { label: 'Streaks alive', n: alive.length, rule: 'momentum streak ≥ 1' },
    { label: 'Going cold', n: cold.length, rule: 'last log 4+ days ago' },
    { label: 'Want a buddy', n: wants.length, rule: 'said yes at signup, free, unassigned' },
  ];

  return (
    <WorkspaceShell
      workspaceId="ops"
      activeHref="/admin/ops/integrity"
      title="Metric integrity"
      subtitle="Every dashboard filter, re-run live, with its definition"
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {checks.map((c) => (
          <AdminStat key={c.label} label={c.label} value={c.n} hint={c.rule} />
        ))}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
        <p className="text-[12px] font-bold text-stone-800">Why these can never disagree with the cards</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-stone-600">
          Each number above comes from the same function in <code className="text-[10.5px]">lib/admin-filters.ts</code> that
          the dashboard card uses, and the card&apos;s count is literally the length of the list
          behind it. Membership is a deterministic WHERE clause — no card may include a student
          because they look &quot;similar&quot; or &quot;might need attention&quot;.
        </p>
      </div>
    </WorkspaceShell>
  );
}
