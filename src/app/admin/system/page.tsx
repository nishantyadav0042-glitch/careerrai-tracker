import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminBroadcast } from '../admin-broadcast';
import { AdminDataImport } from '../admin-data-import';
import { AdminAllowlist, type AllowlistRow } from '../admin-allowlist';
import { BellRing, BarChart2, PhoneCall, ArrowRight } from 'lucide-react';

// SYSTEM — the toolbox (reorg, 14 July): everything operational that isn't
// day-to-day lead work. Health dashboards link out; broadcast, allowlist,
// and data import live here so the Today page stays an action center.
export default async function AdminSystemPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const [{ data: allowlistRows }, { data: people }] = await Promise.all([
    admin.from('student_allowlist').select('id, phone, email, full_name, status, assigned_buddy_id, person_type').order('created_at', { ascending: false }),
    admin.from('profiles').select('id, role, full_name').in('role', ['student', 'buddy']),
  ]);
  const students = (people ?? []).filter((p) => p.role === 'student');
  const buddies = (people ?? []).filter((p) => p.role === 'buddy');

  const tools = [
    { href: '/admin/notification-health', icon: BellRing, label: 'Notification health', sub: 'Delivery rates, per-device status' },
    { href: '/admin/perf', icon: BarChart2, label: 'Speed', sub: 'Page load + API timings' },
    { href: '/admin/sales-queue', icon: PhoneCall, label: 'Sales queue', sub: 'Call follow-up worklist' },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-20">
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>System</h1>
        <p className="mt-0.5 text-xs text-stone-500">Health dashboards, broadcast, access, and data tools.</p>
      </div>

      <div className="mb-6 space-y-2">
        {tools.map(({ href, icon: Icon, label, sub }) => (
          <Link key={href} href={href} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-400">
            <Icon className="h-4 w-4 shrink-0 text-stone-500" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-stone-900">{label}</div>
              <div className="text-xs text-stone-500">{sub}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" />
          </Link>
        ))}
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-stone-500">Broadcast notification</h2>
          <AdminBroadcast recipientIds={[...students.map((s) => s.id), ...buddies.map((b) => b.id)]} />
        </div>
        <div>
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-stone-500">People access</h2>
          <AdminAllowlist
            rows={(allowlistRows ?? []) as AllowlistRow[]}
            buddies={buddies.map((b) => ({ id: b.id, full_name: b.full_name }))}
          />
        </div>
        <div>
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-stone-500">Data management</h2>
          <AdminDataImport />
        </div>
      </div>
    </div>
  );
}
