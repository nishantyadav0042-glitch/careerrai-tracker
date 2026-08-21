import { requireAdmin } from '@/lib/admin-auth';
import { BrainApprovalList, type PendingDecision } from './brain-approval-list';

// Manual-approval gate for the Product Brain (founder, 24 Jul): "recommend
// first, build a track record, automate later." Nothing the Brain proposes
// reaches a student from here until it's tapped Approve — Reject just closes
// it out. Ranked by impact so the highest-value calls are on top.
export default async function AdminBrainPage() {
  const { admin } = await requireAdmin();

  const { data: rows } = await admin
    .from('decision_log')
    .select('id, student_id, action_id, label, impact, why, pending_notification, created_at, profiles!inner(full_name, phone)')
    .eq('send_status', 'pending_approval')
    .order('impact', { ascending: false })
    .limit(50);

  type Prof = { full_name: string | null; phone: string | null };
  const pending: PendingDecision[] = ((rows ?? []) as unknown as Array<{
    id: number; student_id: string; action_id: string; label: string; impact: number; why: string;
    pending_notification: { title: string; body: string; url: string } | null; created_at: string;
    profiles: Prof | Prof[] | null;
  }>).map((r) => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id, studentId: r.student_id, name: prof?.full_name ?? 'Student', phone: prof?.phone ?? null,
      actionId: r.action_id, label: r.label, impact: r.impact, why: r.why,
      notification: r.pending_notification, queuedAt: r.created_at,
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-20">
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Brain approvals</h1>
        <p className="mt-0.5 text-xs text-stone-500">
          The Product Brain queues these — nothing sends to a student until you approve it here.
        </p>
      </div>
      <BrainApprovalList initial={pending} />
    </div>
  );
}
