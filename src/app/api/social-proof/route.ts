import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSocialProof } from '@/lib/social-proof';

// GET /api/social-proof — the real, live counts for in-app proof surfaces
// (onboarding, etc.). Auth-gated to logged-in users. Every number is computed
// from the DB; nothing here is fabricated.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const proof = await getSocialProof(createAdminClient());
  return NextResponse.json(proof);
}
