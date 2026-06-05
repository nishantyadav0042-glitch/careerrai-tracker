import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { title, body, recipientIds } = await request.json();
  if (!title || !body || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const rows = recipientIds.map((uid: string) => ({
    user_id: uid,
    type: 'broadcast',
    title,
    body,
    data: {},
    read: false,
    channel: 'in_app',
  }));

  const { error } = await admin.from('notifications').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sent: rows.length });
}
