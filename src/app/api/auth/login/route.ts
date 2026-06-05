import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  // Support both JSON (fetch) and form-encoded (native form POST)
  let email = '';
  let password = '';
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = await request.json();
    email = body.email;
    password = body.password;
  } else {
    const form = await request.formData();
    email = form.get('email') as string;
    password = form.get('password') as string;
  }

  const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            pending.push({ name, value, options: options as Record<string, unknown> })
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  const origin = request.nextUrl.origin;

  if (error) {
    // Redirect back to login with error flag
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single();

  const role = profile?.role ?? 'student';
  const dest = role === 'buddy' ? '/buddy/students' : role === 'admin' ? '/admin' : '/student/home';

  // Return a redirect — browser follows it and sends the Set-Cookie cookies with the next request
  const response = NextResponse.redirect(`${origin}${dest}`, { status: 302 });
  pending.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });

  return response;
}
