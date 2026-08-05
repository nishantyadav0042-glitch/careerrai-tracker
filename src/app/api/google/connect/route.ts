import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { googleConfigured, googleConsentUrl } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

// Step 1 of connecting a mentor's Google account: bounce them to consent.
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));
  if (!googleConfigured()) {
    return NextResponse.json(
      { error: 'Google is not configured on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' },
      { status: 503 },
    );
  }
  // state carries where to return them — the schedule page they came from.
  const from = new URL(request.url).searchParams.get('from') || '/buddy/profile';
  return NextResponse.redirect(googleConsentUrl(encodeURIComponent(from)));
}
