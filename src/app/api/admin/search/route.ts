import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { universalSearch } from '@/lib/os/universal-search';

export const dynamic = 'force-dynamic';

// Universal search — the endpoint behind ⌘K.
//
// requireAdmin() redirects a non-admin, which for a fetch means the caller gets
// HTML instead of JSON and treats it as no results — acceptable, because the
// palette only ever renders inside the already-admin-gated shell. Kept behind
// the same gate anyway: a search box that can read every student by phone is
// not something to leave open.
export async function GET(request: NextRequest) {
  const { admin } = await requireAdmin();
  const q = request.nextUrl.searchParams.get('q') ?? '';
  const hits = await universalSearch(admin, q);
  return NextResponse.json({ hits });
}
