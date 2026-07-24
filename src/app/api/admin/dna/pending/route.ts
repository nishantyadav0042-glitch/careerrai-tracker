import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isRequestAdmin } from '@/lib/require-admin';

// Every Brain-recommended push/in_app message currently WAITING for a human
// decision — nothing here has been sent to a student yet (founder, 24 Jul:
// "recommend first, build a track record, automate later").
export async function GET() {
  if (!(await isRequestAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from('decision_log')
    .select('id, student_id, action_id, label, impact, why, pending_notification, created_at, profiles!inner(full_name, phone)')
    .eq('send_status', 'pending_approval')
    .order('impact', { ascending: false })
    .limit(50);

  type Prof = { full_name: string | null; phone: string | null };
  const list = ((rows ?? []) as unknown as Array<{
    id: number; student_id: string; action_id: string; label: string; impact: number; why: string;
    pending_notification: { title: string; body: string; url: string } | null; created_at: string;
    profiles: Prof | Prof[] | null;
  }>).map((r) => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id, studentId: r.student_id, name: prof?.full_name ?? null, phone: prof?.phone ?? null,
      actionId: r.action_id, label: r.label, impact: r.impact, why: r.why,
      notification: r.pending_notification, queuedAt: r.created_at,
    };
  });

  return NextResponse.json({ pending: list });
}
