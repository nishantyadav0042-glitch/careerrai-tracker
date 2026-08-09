import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty } from '@/components/admin/workspace-shell';
import {
  toPersonRow, applyFilter, parseFilter, toggledHref,
  SUB_META, ACTIVITY_META, type PersonRow, type PeopleFilter,
  type SubState, type BuddyState, type ActivityState,
} from '@/lib/os/people-filter';
import { priorityMeta } from '@/lib/os/student-priority';

export const dynamic = 'force-dynamic';

// PEOPLE — one screen, combinable filters, priority-sorted, no scrolling.
//
// Founder, 9 Aug: "I should never scroll 250 students. Filter by combining
// audiences — Premium + Active yesterday + Needs buddy — and get exactly those.
// Gmail, not a database." This is that screen. The filters combine (AND), the
// default order is business priority (revenue-at-risk first, never
// alphabetical), and every row opens the student 360. A filtered URL is a
// shareable, bookmarkable view — the honest first version of saved views, with
// no new table to maintain.

const BADGE: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-700',
  stone: 'bg-stone-100 text-stone-600',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
};

const SUBS: SubState[] = ['premium', 'payment_pending', 'payment_failed', 'expired', 'free'];
const BUDDIES: { v: BuddyState; label: string }[] = [
  { v: 'wants', label: 'Wants a buddy' }, { v: 'assigned', label: 'Buddy assigned' }, { v: 'none', label: 'No buddy interest' },
];
const ACTS: ActivityState[] = ['today', 'yesterday', 'this_week', 'going_cold', 'inactive'];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { admin } = await requireAdmin();
  const now = Date.now();
  const filter = parseFilter(await searchParams);

  const [{ data: students }, { data: paidRows }, { data: pendRows }, { data: failRows }, { data: wantRows }, { data: recentLogs }, { data: planRows }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, phone, is_premium, buddy_id, subscription_status')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true),
    admin.from('student_payments').select('student_id').eq('status', 'paid'),
    admin.from('student_payments').select('student_id').eq('status', 'created').gte('created_at', new Date(now - 14 * 86_400_000).toISOString()),
    admin.from('student_payments').select('student_id').eq('status', 'failed').gte('created_at', new Date(now - 30 * 86_400_000).toISOString()),
    admin.from('student_engagement').select('student_id, buddy_cta_last_at'),
    admin.from('daily_reports').select('student_id, report_date').gte('report_date', new Date(now - 30 * 86_400_000).toISOString().slice(0, 10)),
    admin.from('daily_routines').select('student_id').limit(20000),
  ]);

  const paidBy = new Set((paidRows ?? []).map((r: any) => r.student_id));
  const pendBy = new Set((pendRows ?? []).map((r: any) => r.student_id));
  const failBy = new Set((failRows ?? []).map((r: any) => r.student_id));
  const wantsBy = new Set((wantRows ?? []).filter((r: any) => r.buddy_cta_last_at).map((r: any) => r.student_id));
  const hasPlanBy = new Set((planRows ?? []).map((r: any) => r.student_id));

  const lastLog = new Map<string, string>();
  for (const r of recentLogs ?? []) {
    const cur = lastLog.get(r.student_id as string);
    if (!cur || (r.report_date as string) > cur) lastLog.set(r.student_id as string, r.report_date as string);
  }
  const daysSince = (iso: string | undefined): number | null =>
    iso ? Math.floor((now - Date.parse(iso + 'T12:00:00+05:30')) / 86_400_000) : null;

  const everyone: PersonRow[] = (students ?? []).map((s: any) => {
    const isPremium = s.is_premium === true;
    return toPersonRow(s.id, (s.full_name as string) ?? 'Student', s.phone as string | null, {
      isPremium,
      subscriptionStatus: s.subscription_status as string | null,
      hasPaymentPending: !isPremium && pendBy.has(s.id),
      hasPaymentFailed: !isPremium && failBy.has(s.id),
      hasBuddy: !!s.buddy_id,
      wantsBuddy: wantsBy.has(s.id),
      paymentStuck: paidBy.has(s.id) && !isPremium,
      hasPlan: hasPlanBy.has(s.id),
      daysSinceLog: daysSince(lastLog.get(s.id)),
    });
  });

  const rows = applyFilter(everyone, filter);
  const countWith = (dim: keyof PeopleFilter, v: string) =>
    everyone.filter((r) => (r[dim] as string) === v).length;

  const base = '/admin/people';
  const activeFilterCount = Object.values(filter).filter(Boolean).length;

  const chip = (dim: keyof PeopleFilter, value: string, label: string, tone = 'stone') => {
    const on = filter[dim] === value;
    const n = countWith(dim, value);
    return (
      <Link
        key={`${dim}-${value}`}
        href={toggledHref(base, filter, dim, value)}
        className={on
          ? 'shrink-0 rounded-lg bg-stone-900 px-2.5 py-1 text-[11.5px] font-semibold text-white'
          : `shrink-0 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-stone-600 hover:border-stone-400 ${n === 0 ? 'opacity-40' : ''}`}
      >
        {label} <span className="opacity-60">{n}</span>
      </Link>
    );
  };

  return (
    <WorkspaceShell
      workspaceId="students"
      activeHref="/admin/people"
      title="People"
      subtitle={activeFilterCount > 0 ? `${rows.length} match your filter` : `${everyone.length} students · filter to any audience`}
    >
      {/* The filter bar — combine across dimensions, Gmail-style. */}
      <div className="mb-4 space-y-2">
        <FilterRow label="Subscription">{SUBS.map((v) => chip('sub', v, SUB_META[v].label))}</FilterRow>
        <FilterRow label="Buddy">{BUDDIES.map((b) => chip('buddy', b.v, b.label))}</FilterRow>
        <FilterRow label="Activity">{ACTS.map((v) => chip('activity', v, ACTIVITY_META[v]))}</FilterRow>
        {activeFilterCount > 0 && (
          <Link href={base} className="inline-block text-[11px] font-semibold text-teal-700 underline">Clear filters</Link>
        )}
      </div>

      {rows.length === 0 ? (
        <AdminEmpty>No matching students. {activeFilterCount > 0 && <Link href={base} className="underline">Clear filters</Link>}</AdminEmpty>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const m = priorityMeta(r.priority);
            const sm = SUB_META[r.sub];
            return (
              <Link key={r.id} href={`/admin/student/${r.id}`} className="flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white p-3 transition-colors hover:border-stone-400">
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${BADGE[m.tone]}`}>{r.priority}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-stone-900">{r.name}</p>
                  <p className="truncate text-[11px] text-stone-500">{r.reason}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${BADGE[sm.tone]}`}>{sm.label}</span>
                {r.phone && (
                  <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] font-semibold text-teal-700">WA</a>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </WorkspaceShell>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[76px] shrink-0 text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</span>
      <div className="-mx-0.5 flex gap-1 overflow-x-auto pb-0.5">{children}</div>
    </div>
  );
}
