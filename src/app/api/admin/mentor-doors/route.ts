import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { activateGrant, mentorDoorsEnabled } from '@/lib/mentor-doors';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Mentor Doors control panel (admin-only).
// GET  → every crossed door: who, which door, when, activated or dormant.
// POST → activate grants: { studentId } for one, { all: true } for everyone
//        waiting. Activation matches the ONE buddy (least-loaded), generates
//        the Gemini opener draft, and stamps activated_at. Access still
//        requires MENTOR_DOORS_ENABLED=true — activation without the flag
//        stays invisible to students, so this is safe to run in advance.
async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  return me?.role === 'admin' ? admin : null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data: grants } = await admin
    .from('mentor_grants')
    .select('student_id, door, eligible_at, activated_at, buddy_id, messages_used')
    .order('eligible_at', { ascending: false });
  const ids = (grants ?? []).map((g) => g.student_id as string);
  const { data: profs } = ids.length
    ? await admin.from('profiles').select('id, full_name, phone').in('id', ids)
    : { data: [] as { id: string; full_name: string | null; phone: string | null }[] };
  const byId = new Map((profs ?? []).map((p) => [p.id, p]));
  return NextResponse.json({
    enabled: mentorDoorsEnabled(),
    grants: (grants ?? []).map((g) => ({
      ...g,
      full_name: byId.get(g.student_id as string)?.full_name ?? null,
      phone: byId.get(g.student_id as string)?.phone ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: { studentId?: string; all?: boolean } = {};
  try { body = await request.json(); } catch { /* empty body */ }

  if (body.studentId) {
    const grant = await activateGrant(admin, body.studentId);
    return NextResponse.json({ ok: true, activated: grant?.activated_at != null, grant });
  }
  if (body.all === true) {
    const { data: waiting } = await admin
      .from('mentor_grants')
      .select('student_id')
      .is('activated_at', null)
      .limit(200);
    let activated = 0;
    for (const g of waiting ?? []) {
      const res = await activateGrant(admin, g.student_id as string);
      if (res?.activated_at) activated++;
    }
    return NextResponse.json({ ok: true, activated, of: (waiting ?? []).length });
  }
  return NextResponse.json({ error: 'Pass { studentId } or { all: true }' }, { status: 400 });
}
