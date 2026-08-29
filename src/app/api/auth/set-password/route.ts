import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

export async function POST(request: NextRequest) {
  try {
    const { password, dest: rawDest } = (await request.json()) as { password?: string; dest?: string };

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    // Safe destination — only allow internal paths
    const dest = rawDest?.startsWith('/') ? rawDest : '/student/tracker';

    const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const supabase = createServerClient(
      supabaseUrl(),
      supabaseAnonKey(),
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      console.error('[set-password] updateUser error:', updateError.message);
      return NextResponse.json({ error: 'Could not set password. Try again.' }, { status: 500 });
    }

    // Mark password as set so future OTP logins skip this page
    const admin = createAdminClient();
    await admin.from('profiles').update({ password_set: true }).eq('id', user.id);

    const res = NextResponse.json({ ok: true, dest });
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  } catch (e) {
    console.error('[set-password] error', e);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
