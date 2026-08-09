import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty } from '@/components/admin/workspace-shell';
import { assembleSystemHealth, type HealthSeverity } from '@/lib/os/system-health';
import { AdminBroadcast } from '../admin-broadcast';
import { AdminDataImport } from '../admin-data-import';
import { AdminAllowlist, type AllowlistRow } from '../admin-allowlist';
import { ShieldAlert, AlertTriangle, CircleDot } from 'lucide-react';

export const dynamic = 'force-dynamic';

// SYSTEM HEALTH — broken things surface, a healthy machine disappears.
//
// The ops workspace landing. Same law as People/Revenue/Mentor, applied to the
// machine: it leads with what is actually broken right now — failing invariants
// (the database's own contract self-test) and the proven live-incident class
// (money captured but not unlocked, a paid student past SLA with no mentor). If
// nothing is broken, it says so and gets out of the way. The operational tools
// — broadcast, access, data import — sit below, because a toolbox is not a
// health check and should never masquerade as one.
const TONE: Record<HealthSeverity, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-amber-100 text-amber-800', normal: 'bg-stone-100 text-stone-600',
};
const LABEL: Record<HealthSeverity, string> = { critical: 'Critical', high: 'High', normal: 'Watch' };

export default async function AdminSystemPage() {
  const { admin } = await requireAdmin();

  const [health, { data: allowlistRows }, { data: people }] = await Promise.all([
    assembleSystemHealth(admin, Date.now()),
    admin.from('student_allowlist').select('id, phone, email, full_name, status, assigned_buddy_id, person_type').order('created_at', { ascending: false }),
    admin.from('profiles').select('id, role, full_name').in('role', ['student', 'buddy']),
  ]);
  const students = (people ?? []).filter((p: any) => p.role === 'student');
  const buddies = (people ?? []).filter((p: any) => p.role === 'buddy');

  const criticalN = health.items.filter((i) => i.severity === 'critical').length;

  return (
    <WorkspaceShell
      workspaceId="ops"
      activeHref="/admin/system"
      title="System health"
      subtitle={health.allClear
        ? `Nothing is broken · ${health.invariantsChecked} invariant${health.invariantsChecked === 1 ? '' : 's'} green`
        : `${health.items.length} thing${health.items.length === 1 ? '' : 's'} broken${criticalN ? ` · ${criticalN} critical` : ''}`}
    >
      {/* ── What is broken, right now ── */}
      {health.allClear ? (
        <AdminEmpty>
          The machine is healthy — every one of the {health.invariantsChecked} contracts holds and no sacred fault is open. Go build.
        </AdminEmpty>
      ) : (
        <div className="mb-6 space-y-2">
          {health.items.map((i) => {
            const critical = i.severity === 'critical';
            return (
              <div key={i.id} className={`rounded-2xl border p-3.5 ${critical ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white'}`}>
                <div className="flex items-start gap-2.5">
                  {critical
                    ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    : i.severity === 'high'
                      ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      : <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-stone-900">{i.title}</p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-stone-500">{i.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE[i.severity]}`}>{LABEL[i.severity]}</span>
                </div>
                <div className="mt-2.5 pl-6.5">
                  <Link href={i.route} className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-bold text-white">
                    Inspect →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── The toolbox — operational, not a health signal ── */}
      <div className="space-y-6">
        <div>
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-stone-500">Broadcast notification</h2>
          <AdminBroadcast recipientIds={[...students.map((s: any) => s.id), ...buddies.map((b: any) => b.id)]} />
        </div>
        <div>
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-stone-500">People access</h2>
          <AdminAllowlist
            rows={(allowlistRows ?? []) as AllowlistRow[]}
            buddies={buddies.map((b: any) => ({ id: b.id, full_name: b.full_name }))}
          />
        </div>
        <div>
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-stone-500">Data management</h2>
          <AdminDataImport />
        </div>
      </div>
    </WorkspaceShell>
  );
}
