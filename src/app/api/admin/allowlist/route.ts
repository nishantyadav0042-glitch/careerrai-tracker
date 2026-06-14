import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin, userId: user.id };
}

// Add a number to the allowlist (and optionally assign a buddy) in one action.
export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin, userId } = ctx;

  try {
    const { phone: rawPhone, full_name, assigned_buddy_id } = (await request.json()) as {
      phone?: string; full_name?: string; assigned_buddy_id?: string | null;
    };
    const phone = normalizeIndianPhone(rawPhone);
    if (!phone) return NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 });
    if (!full_name?.trim()) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });

    const { error } = await admin.from('student_allowlist').insert({
      phone,
      full_name: full_name.trim(),
      added_by: userId,
      assigned_buddy_id: assigned_buddy_id || null,
    });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'That number is already on the list.' }, { status: 409 });
      console.error('[allowlist] insert', error);
      return NextResponse.json({ error: 'Could not add number.' }, { status: 500 });
    }

    // If this student has already logged in, keep their buddy assignment in sync.
    if (assigned_buddy_id) {
      await admin.from('profiles').update({ buddy_id: assigned_buddy_id }).eq('phone', phone);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[allowlist] POST', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

// Pause / reactivate, or change the assigned buddy.
export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  try {
    const { id, status, assigned_buddy_id } = (await request.json()) as {
      id?: string; status?: 'active' | 'paused'; assigned_buddy_id?: string | null;
    };
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (status === 'active' || status === 'paused') patch.status = status;
    if (assigned_buddy_id !== undefined) patch.assigned_buddy_id = assigned_buddy_id || null;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

    const { data: row, error } = await admin
      .from('student_allowlist')
      .update(patch)
      .eq('id', id)
      .select('phone, assigned_buddy_id')
      .single();
    if (error) {
      console.error('[allowlist] patch', error);
      return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
    }
    if (assigned_buddy_id !== undefined && row?.phone) {
      await admin.from('profiles').update({ buddy_id: assigned_buddy_id || null }).eq('phone', row.phone);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[allowlist] PATCH', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
