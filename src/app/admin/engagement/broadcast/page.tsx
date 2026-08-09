import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell } from '@/components/admin/workspace-shell';
import { AdminBroadcast } from '@/app/admin/admin-broadcast';

export const dynamic = 'force-dynamic';

// Broadcast, given its own home in Engagement.
//
// It used to be one of three inline blocks stacked on /admin/system, which put
// "send a push to every student" on the same screen as database imports and
// the allowlist. Sending a message to the whole roster is an engagement
// decision, not a maintenance one, and it deserves a page you arrive at on
// purpose rather than scroll past on the way to something else.
export default async function BroadcastPage() {
  const { admin } = await requireAdmin();

  // Real recipients, not a placeholder: every non-test student and buddy. The
  // component prints the count on its own button, so the founder sees exactly
  // how many people a tap reaches before making it.
  const { data: people } = await admin
    .from('profiles')
    .select('id')
    .in('role', ['student', 'buddy'])
    .not('is_test_account', 'is', true);
  const recipientIds = (people ?? []).map((p) => p.id as string);

  return (
    <WorkspaceShell
      workspaceId="engagement"
      activeHref="/admin/engagement/broadcast"
      title="Broadcast"
      subtitle={`One message to ${recipientIds.length} people — students and mentors`}
    >
      <AdminBroadcast recipientIds={recipientIds} />
    </WorkspaceShell>
  );
}
