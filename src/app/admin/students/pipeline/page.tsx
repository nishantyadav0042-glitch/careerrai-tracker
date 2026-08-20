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

export default async function StudentPipelinePage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { admin } = await requireAdmin();
  const now = Date.now();
  const { filter = 'all' } = await searchParams;

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

  const paidBy = new Set((paidRows ?? []).map((r: { student_id: string }) => r.student_id));
  const wantsBy = new Set((wantRows ?? []).filter((r: { buddy_cta_last_at: string | null }) => r.buddy_cta_last_at).map((r: { student_id: string }) => r.student_id));
  const hasPlanBy = new Set((planRows ?? []).map((r: { student_id: string }) => r.student_id));

  // Most recent log per student.
  const lastLog = new Map<string, string>();
  for (const r of recentLogs ?? []) {
    const cur = lastLog.get(r.student_id as string);
    if (!cur || (r.report_date as string) > cur) lastLog.set(r.student_id as string, r.report_date as string);
  }
  const daysSince = (iso: string | undefined): number | null =>
    iso ? Math.floor((now - Date.parse(iso + 'T12:00:00+05:30')) / 86_400_000) : null;

  // Typed to exactly the columns selected above — see people/page.tsx.
  type StudentRow = {
    id: string; full_name: string | null; phone: string | null;
    is_premium: boolean | null; buddy_id: string | null;
  };
  const all = ((students ?? []) as StudentRow[]).map((s) => {
    const dsl = daysSince(lastLog.get(s.id));
    const isPremium = s.is_premium === true;
    const wantsBuddy = wantsBy.has(s.id);
    const verdict = classifyStudent({
      isPremium,
      hasBuddy: !!s.buddy_id,
      paymentStuck: paidBy.has(s.id) && !isPremium,
      wantsBuddy,
      activeRecently: dsl != null && dsl <= 3,
      hasPlan: hasPlanBy.has(s.id),
      daysSinceLog: dsl,
    });
    return {
      id: s.id, name: (s.full_name as string) ?? 'Student', phone: s.phone as string | null,
      isPremium, wantsBuddy, cold: dsl != null && dsl >= 4, ...verdict,
    };
  });

  // The simple filter the founder asked for — subscribed / free / wants buddy /
  // at risk. One chip, no nesting.
  const FILTERS: { key: string; label: string; test: (r: typeof all[number]) => boolean }[] = [
    { key: 'all', label: 'All', test: () => true },
    { key: 'subscribed', label: 'Subscribed', test: (r) => r.isPremium },
    { key: 'free', label: 'Free', test: (r) => !r.isPremium },
    { key: 'wants_buddy', label: 'Wants a buddy', test: (r) => r.wantsBuddy && !r.isPremium },
    { key: 'at_risk', label: 'At risk', test: (r) => r.cold },
  ];
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const rows = all.filter(active.test).sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority));

  const counts = ORDER.map((p) => ({ p, n: rows.filter((r) => r.priority === p).length }));

  return (
    <WorkspaceShell
      workspaceId="students"
      activeHref="/admin/students/pipeline"
      title="Pipeline"
      subtitle="Every student, ranked by what they need — P0 first"
    >
      <nav className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={`/admin/students/pipeline?filter=${f.key}`}
            className={f.key === active.key
              ? 'shrink-0 rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white'
              : 'shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-stone-600 hover:border-stone-400'}
          >
            {f.label} <span className="opacity-60">{all.filter(f.test).length}</span>
          </a>
        ))}
      </nav>

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
              // The WA link is a SIBLING of the row link, not a child of it.
              // It used to be nested inside <Link> with an onClick that called
              // stopPropagation — two bugs in one line: an <a> inside an <a> is
              // invalid HTML, and an event handler cannot cross into a server
              // component. React refused to render the page at all (512 crashes
              // between 9 and 15 Aug; this workspace has been dead since).
              // Siblings need no handler: the tap targets simply do not overlap.
              <div key={r.id} className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3 transition-colors hover:border-stone-400">
                <Link href={`/admin/student/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${BADGE[m.tone]}`}>{r.priority}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-stone-900">{r.name}</p>
                    <p className="truncate text-[11.5px] text-stone-500">{r.reason}</p>
                  </div>
                </Link>
                {r.phone && (
                  <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50">WA</a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceShell>
  );
}
