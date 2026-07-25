import { requireAdminCtx as requireAdmin } from '@/lib/require-admin';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeIndianPhone } from '@/lib/phone';


export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin, userId } = ctx;

  try {
    const { person_type, email: rawEmail, phone: rawPhone, full_name, assigned_buddy_id } = (await request.json()) as {
      person_type?: string;
      email?: string;
      phone?: string | null;
      full_name?: string;
      assigned_buddy_id?: string | null;
    };

    // Phone is the primary login credential — required.
    const phone = rawPhone ? (normalizeIndianPhone(rawPhone) ?? null) : null;
    if (!phone) {
      return NextResponse.json({ error: 'A valid 10-digit mobile number is required.' }, { status: 400 });
    }
    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }

    // Email is optional — only needed for Google Calendar / Meet integration.
    const email = rawEmail?.trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const type = person_type === 'buddy' ? 'buddy' : 'student';

    const { error } = await admin.from('student_allowlist').insert({
      email,
      phone,
      full_name: full_name.trim(),
      added_by: userId,
      assigned_buddy_id: type === 'student' ? (assigned_buddy_id || null) : null,
      person_type: type,
      status: 'active',
    });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That mobile number is already on the list.' }, { status: 409 });
      }
      console.error('[allowlist] insert', error);
      return NextResponse.json({ error: 'Could not add person.' }, { status: 500 });
    }

    // Keep profile buddy assignment in sync if they've already logged in.
    if (type === 'student' && assigned_buddy_id) {
      await admin.from('profiles').update({ buddy_id: assigned_buddy_id }).eq('phone', phone);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[allowlist] POST', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  try {
    const { id, status, assigned_buddy_id, email: rawEmail } = (await request.json()) as {
      id?: string;
      status?: 'active' | 'paused';
      assigned_buddy_id?: string | null;
      email?: string;
    };
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (status === 'active' || status === 'paused') patch.status = status;
    if (assigned_buddy_id !== undefined) patch.assigned_buddy_id = assigned_buddy_id || null;
    if (rawEmail !== undefined) patch.email = rawEmail.trim().toLowerCase() || null;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

    const { data: row, error } = await admin
      .from('student_allowlist')
      .update(patch)
      .eq('id', id)
      .select('phone, assigned_buddy_id, person_type')
      .single();

    if (error) {
      console.error('[allowlist] patch', error);
      return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
    }

    // Keep profile buddy assignment in sync for students (look up by phone now).
    if (assigned_buddy_id !== undefined && row?.phone && row.person_type !== 'buddy') {
      await admin.from('profiles').update({ buddy_id: assigned_buddy_id || null }).eq('phone', row.phone);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[allowlist] PATCH', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
