import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('[TEST] API called');

  try {
    // Check basic auth
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    console.log('[TEST] User:', user?.id);

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check admin
    const admin = createAdminClient();
    const { data: profile, error } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log('[TEST] Profile:', profile, 'Error:', error);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Not an admin', role: profile?.role },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      user: user.id,
      role: profile.role,
      message: 'API is working!',
    });
  } catch (err) {
    console.error('[TEST] Error:', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
