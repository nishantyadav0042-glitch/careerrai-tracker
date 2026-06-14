import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin, userId: user.id };
}

// Create a coupon. `value` for flat is RUPEES from the client and is stored as paise.
export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin, userId } = ctx;

  try {
    const body = (await request.json()) as {
      code?: string;
      discount_type?: 'percent' | 'flat';
      value?: number;
      expires_at?: string | null;
      max_uses?: number | null;
    };

    const code = (body.code ?? '').trim().toUpperCase();
    if (!code) return NextResponse.json({ error: 'Code is required.' }, { status: 400 });

    const discountType = body.discount_type;
    if (discountType !== 'percent' && discountType !== 'flat') {
      return NextResponse.json({ error: 'Invalid discount type.' }, { status: 400 });
    }

    const rawValue = Number(body.value);
    if (!Number.isFinite(rawValue) || !Number.isInteger(rawValue) || rawValue <= 0) {
      return NextResponse.json({ error: 'Value must be a positive whole number.' }, { status: 400 });
    }

    let discountValue: number;
    if (discountType === 'percent') {
      if (rawValue < 1 || rawValue > 100) {
        return NextResponse.json({ error: 'Percent must be between 1 and 100.' }, { status: 400 });
      }
      discountValue = rawValue;
    } else {
      // flat: rupees -> paise
      discountValue = Math.round(rawValue * 100);
    }

    let maxUses: number | null = null;
    if (body.max_uses !== null && body.max_uses !== undefined) {
      const m = Number(body.max_uses);
      if (!Number.isFinite(m) || !Number.isInteger(m) || m <= 0) {
        return NextResponse.json({ error: 'Max uses must be a positive whole number.' }, { status: 400 });
      }
      maxUses = m;
    }

    let expiresAt: string | null = null;
    if (body.expires_at) {
      const d = new Date(body.expires_at);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid expiry date.' }, { status: 400 });
      }
      expiresAt = d.toISOString();
    }

    // Pre-check for duplicate code (RLS off via service role).
    const { data: existing } = await admin.from('coupons').select('id').eq('code', code).maybeSingle();
    if (existing) return NextResponse.json({ error: 'A coupon with this code already exists.' }, { status: 409 });

    const { error } = await admin.from('coupons').insert({
      code,
      discount_type: discountType,
      discount_value: discountValue,
      expires_at: expiresAt,
      max_uses: maxUses,
      created_by: userId,
    });

    if (error) {
      // 23505 = unique_violation (race against the pre-check)
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'A coupon with this code already exists.' }, { status: 409 });
      }
      console.error('[coupons] insert', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logAdminAction(userId, 'create_coupon', 'coupon', code, {
      discount_type: discountType,
      discount_value: discountValue,
      expires_at: expiresAt,
      max_uses: maxUses,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[coupons] POST', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

// Change a coupon's status.
export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin, userId } = ctx;

  try {
    const { id, status } = (await request.json()) as {
      id?: string;
      status?: 'active' | 'paused' | 'expired';
    };
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (status !== 'active' && status !== 'paused' && status !== 'expired') {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }

    const { error } = await admin.from('coupons').update({ status }).eq('id', id);
    if (error) {
      console.error('[coupons] update', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logAdminAction(userId, 'update_coupon', 'coupon', id, { status });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[coupons] PATCH', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
