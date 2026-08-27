import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// Called once by the client when the app is running in standalone mode (i.e.
// genuinely installed on the home screen). Gives the admin Leads view a REAL
// "app installed" signal instead of a guess. Idempotent; first ping wins the
// timestamp.
export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  await admin.from('profiles')
    .update({ app_installed: true, app_installed_at: new Date().toISOString() })
    .eq('id', user.id)
    .eq('app_installed', false);
  return NextResponse.json({ ok: true });
}
