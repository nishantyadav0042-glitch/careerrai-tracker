'use server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function loginAction(_: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: 'Email or password incorrect. Try a demo account below.', dest: null };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single();

  const role = profile?.role ?? 'student';
  const dest =
    role === 'buddy' ? '/buddy/students' : role === 'admin' ? '/admin' : '/student/home';

  // Return dest instead of calling redirect() so Set-Cookie headers are sent in the POST response
  return { error: null, dest };
}
