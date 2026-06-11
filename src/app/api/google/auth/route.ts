import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildAuthUrl } from '@/lib/google-calendar';

/**
 * GET /api/google/auth?redirect=/buddy/settings
 * Starts the Google OAuth flow. Requires an authenticated session.
 * The redirect path (where to land after the callback) travels in `state`.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`);
  }

  const redirect = request.nextUrl.searchParams.get('redirect') || '/';
  // Only allow same-app relative paths in state — never absolute URLs
  const safeRedirect = redirect.startsWith('/') ? redirect : '/';

  return NextResponse.redirect(buildAuthUrl(safeRedirect));
}

/**
 * POST kept for backward compatibility with older clients that expect
 * { authUrl } in a JSON body.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let redirect = '/';
  try {
    const body = await request.json();
    if (typeof body?.redirectUrl === 'string' && body.redirectUrl.startsWith('/')) {
      redirect = body.redirectUrl;
    }
  } catch {
    // no body — use default
  }

  return NextResponse.json({ authUrl: buildAuthUrl(redirect) });
}
