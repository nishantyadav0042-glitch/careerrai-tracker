import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone, token } = (await request.json()) as { phone?: string; token?: string };
    const phone = normalizeIndianPhone(rawPhone);
    if (!phone || !token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Capture the session cookies Supabase sets on a successful verify so we can
    // attach them to the JSON response (mirrors /api/auth/login).
    const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) =>
              pending.push({ name, value, options: options as Record<string, unknown> })
            ),
        },
      }
    );

    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error || !data.user) {
      return NextResponse.json({ error: 'That code is incorrect or expired.' }, { status: 401 });
    }

    // First successful login creates the student's profile from the allowlist
    // (name + pre-assigned buddy the founder set). Later logins refresh the link.
    const admin = createAdminClient();
    const { data: entry } = await admin
      .from('student_allowlist')
      .select('full_name, assigned_buddy_id')
      .eq('phone', phone)
      .maybeSingle();

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!existing) {
      await admin.from('profiles').insert({
        id: data.user.id,
        role: 'student',
        full_name: entry?.full_name ?? 'Student',
        phone,
        buddy_id: entry?.assigned_buddy_id ?? null,
        subscription_status: 'free_beta',
      });
    } else {
      await admin
        .from('profiles')
        .update({ phone, ...(entry?.assigned_buddy_id ? { buddy_id: entry.assigned_buddy_id } : {}) })
        .eq('id', data.user.id);
    }

    const res = NextResponse.json({ ok: true, dest: '/student/tracker' });
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  } catch (e) {
    console.error('[verify-otp] error', e);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
