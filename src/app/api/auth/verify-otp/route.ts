import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, token } = (await request.json()) as { email?: string; token?: string };
    const email = rawEmail?.trim().toLowerCase();
    if (!email || !token || typeof token !== 'string') {
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

    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.user) {
      return NextResponse.json({ error: 'That code is incorrect or expired.' }, { status: 401 });
    }

    // First successful login creates the student's profile from the allowlist
    // (name + pre-assigned buddy the founder set). Later logins refresh the link.
    const admin = createAdminClient();
    const { data: entry } = await admin
      .from('student_allowlist')
      .select('full_name, assigned_buddy_id')
      .eq('email', email)
      .maybeSingle();

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();

    // Hard gate: a brand-new email not on the allowlist cannot create a profile.
    if (!existing && !entry) {
      return NextResponse.json({ error: 'This email is not on the access list. Contact support to get access.' }, { status: 403 });
    }

    if (!existing) {
      await admin.from('profiles').insert({
        id: data.user.id,
        role: 'student',
        full_name: entry?.full_name ?? 'Student',
        email,
        buddy_id: entry?.assigned_buddy_id ?? null,
        subscription_status: 'free_beta',
      });
    } else {
      await admin
        .from('profiles')
        .update({ email, ...(entry?.assigned_buddy_id ? { buddy_id: entry.assigned_buddy_id } : {}) })
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
