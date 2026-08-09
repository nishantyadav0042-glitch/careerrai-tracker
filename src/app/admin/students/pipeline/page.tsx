import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty } from '@/components/admin/workspace-shell';
import { classifyStudent, priorityMeta, type Priority } from '@/lib/os/student-priority';

export const dynamic = 'force-dynamic';

// STUDENTS PIPELINE — the daily action queue, P0 at the top.
//
// Co-founder rule: "Students should not be a list, it should be your operating
// pipeline. Every card a priority badge. You never waste time deciding who to
// contact next — the system tells you."
//
// Every student is classified by lib/os/student-priority (pure, tested) and the
// list is sorted P0 → P3. A revenue-at-risk student can never sit below an
// engagement one, because the classifier's check order IS the ranking.

const BADGE: Record<string, string> = {
  red: 'bg-red-100 text-red-700 border-red-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};
const ORDER: Priority[] = ['P0', 'P1', 'P2', 'P3'];

export default async function StudentPipelinePage() {
  const { admin } = await requireAdmin();
  const now = Date.now();

  // One wave of the facts the classifier needs.
  const [{ data: students }, { data: paidRows }, { data: wantRows }, { data: recentLogs }, { data: planRows }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, phone, is_premium, buddy_id')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true),
    admin.from('student_payments').select('student_id, status').eq('status', 'paid'),
    admin.from('student_engagement').select('student_id, buddy_cta_last_at'),
    admin.from('daily_reports').select('student_id, report_date').gte('report_date', new Date(now - 30 * 86_400_000).toISOString().slice(0, 10)),
    admin.from('daily_routines').select('student_id').limit(20000),
  ]);

  const paidBy = new Set((paidRows ?? []).map((r: any) => r.student_id));
  const wantsBy = new Set((wantRows ?? []).filter((r: any) => r.buddy_cta_last_at).map((r: any) => r.student_id));
  const hasPlanBy = new Set((planRows ?? []).map((r: any) => r.student_id));

  // Most recent log per student.
  const lastLog = new Map<string, string>();
  for (const r of recentLogs ?? []) {
    const cur = lastLog.get(r.student_id as string);
    if (!cur || (r.report_date as string) > cur) lastLog.set(r.student_id as string, r.report_date as string);
  }
  const daysSince = (iso: string | undefined): number | null =>
    iso ? Math.floor((now - Date.parse(iso + 'T12:00:00+05:30')) / 86_400_000) : null;

  const rows = (students ?? []).map((s: any) => {
    const dsl = daysSince(lastLog.get(s.id));
    const verdict = classifyStudent({
      isPremium: s.is_premium === true,
      hasBuddy: !!s.buddy_id,
      paymentStuck: paidBy.has(s.id) && s.is_premium !== true,
      wantsBuddy: wantsBy.has(s.id),
      activeRecently: dsl != null && dsl <= 3,
      hasPlan: hasPlanBy.has(s.id),
      daysSinceLog: dsl,
    });
    return { id: s.id, name: (s.full_name as string) ?? 'Student', phone: s.phone as string | null, ...verdict };
  }).sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority));

  const counts = ORDER.map((p) => ({ p, n: rows.filter((r) => r.priority === p).length }));

  return (
    <WorkspaceShell
      workspaceId="students"
      activeHref="/admin/students/pipeline"
      title="Pipeline"
      subtitle="Every student, ranked by what they need — P0 first"
    >
      <div className="mb-4 grid grid-cols-4 gap-2">
        {counts.map(({ p, n }) => {
          const m = priorityMeta(p);
          return (
            <div key={p} className={`rounded-2xl border p-3 text-center ${BADGE[m.tone]}`}>
              <p className="text-[18px] font-bold leading-none">{n}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide">{p}</p>
            </div>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <AdminEmpty>No students.</AdminEmpty>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const m = priorityMeta(r.priority);
            return (
              <Link key={r.id} href={`/admin/student/${r.id}`} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 transition-colors hover:border-stone-400">
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${BADGE[m.tone]}`}>{r.priority}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-stone-900">{r.name}</p>
                  <p className="truncate text-[11.5px] text-stone-500">{r.reason}</p>
                </div>
                {r.phone && (
                  <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-[11px] font-semibold text-teal-700">WA</a>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </WorkspaceShell>
  );
}
