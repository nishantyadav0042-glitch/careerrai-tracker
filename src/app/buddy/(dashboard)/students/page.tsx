import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { BuddyTriageView } from '../home/buddy-triage-view';

export default async function BuddyStudentsPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buddy') redirect('/');

  const { data: students } = await admin
    .from('profiles')
    .select('id')
    .eq('buddy_id', user.id)
    .eq('role', 'student');

  const count = students?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Buddy dashboard</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Your students
        </h1>
        <p className="text-sm text-stone-600 mt-1">{count} active</p>
      </div>

      <BuddyTriageView buddyId={user.id} />
    </div>
  );
}
