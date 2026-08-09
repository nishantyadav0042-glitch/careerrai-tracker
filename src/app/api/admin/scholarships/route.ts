import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit';
import { emitTimeline } from '@/lib/os/timeline';
import { NextRequest, NextResponse } from 'next/server';

function anonClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
}

// Verify the caller is an authenticated admin. Returns the admin user id on
// success, or a NextResponse to short-circuit with the right status code.
async function requireAdmin(
  request: NextRequest
): Promise<{ userId: string } | { error: NextResponse }> {
  const supabase = anonClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { userId: user.id };
}

interface GrantBody {
  student_id?: unknown;
  kind?: unknown;
  value?: unknown;
  reason?: unknown;
  expires_at?: unknown;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { userId } = auth;
  const admin = createAdminClient();

  let body: GrantBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { student_id, kind, value, reason, expires_at } = body;

  if (typeof student_id !== 'string' || !student_id) {
    return NextResponse.json({ error: 'Missing student_id' }, { status: 400 });
  }
  if (kind !== 'percent' && kind !== 'final') {
    return NextResponse.json({ error: "kind must be 'percent' or 'final'" }, { status: 400 });
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return NextResponse.json({ error: 'value must be a number' }, { status: 400 });
  }

  // Validate the value per kind and build the row's discount columns.
  let discount_percent: number | null = null;
  let final_price_paise: number | null = null;
  if (kind === 'percent') {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      return NextResponse.json({ error: 'Percent must be a whole number between 1 and 100' }, { status: 400 });
    }
    discount_percent = value;
  } else {
    // Client sends rupees; we store paise.
    if (value < 0) {
      return NextResponse.json({ error: 'Fixed price cannot be negative' }, { status: 400 });
    }
    final_price_paise = Math.round(value * 100);
  }

  // Validate the student exists and is actually a student.
  const { data: student, error: studentErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', student_id)
    .single();
  if (studentErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 400 });
  }
  if (student.role !== 'student') {
    return NextResponse.json({ error: 'Target is not a student' }, { status: 400 });
  }

  // Optional expiry: accept a date/datetime string; null if blank.
  let expiresAt: string | null = null;
  if (typeof expires_at === 'string' && expires_at.trim() !== '') {
    const parsed = new Date(expires_at);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400 });
    }
    expiresAt = parsed.toISOString();
  }

  const reasonText =
    typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null;

  try {
    // Granting replaces: revoke any existing active scholarship so the partial
    // unique index (one active per student) doesn't conflict.
    const { error: revokeErr } = await admin
      .from('scholarships')
      .update({ status: 'revoked' })
      .eq('student_id', student_id)
      .eq('status', 'active');
    if (revokeErr) return NextResponse.json({ error: revokeErr.message }, { status: 500 });

    const { error: insertErr } = await admin.from('scholarships').insert({
      student_id,
      discount_percent,
      final_price_paise,
      reason: reasonText,
      granted_by: userId,
      expires_at: expiresAt,
      status: 'active',
    });
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unexpected error' },
      { status: 500 }
    );
  }

  logAdminAction(userId, 'grant_scholarship', 'student', student_id, {
    kind,
    discount_percent,
    final_price_paise,
    reason: reasonText,
    expires_at: expiresAt,
  });

  await emitTimeline(admin, {
    entity: 'student', entityId: student_id, kind: 'scholarship_granted',
    summary: `Scholarship granted — ${discount_percent}% off`, actor: 'admin',
    metadata: { kind, final_price_paise },
  });

  return NextResponse.json({ ok: true });
}

interface RevokeBody {
  id?: unknown;
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { userId } = auth;
  const admin = createAdminClient();

  let body: RevokeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id } = body;
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const { error } = await admin
      .from('scholarships')
      .update({ status: 'revoked' })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unexpected error' },
      { status: 500 }
    );
  }

  logAdminAction(userId, 'revoke_scholarship', 'scholarship', id);

  return NextResponse.json({ ok: true });
}
