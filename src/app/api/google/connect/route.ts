import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { googleConfigured, googleConsentUrl } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

// Step 1 of connecting a mentor's Google account: bounce them to consent.
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));
  // state carries where to return them — the schedule page they came from.
  const from = new URL(request.url).searchParams.get('from') || '/buddy/profile';

  // While the server has no Google credentials — during a credential rotation,
  // or on a preview deploy — send the mentor BACK with a flag, not a page of
  // raw JSON. They still have the paste-your-own-link path, which needs no
  // Google at all, so this is a detour and not a dead end.
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL(`${from}?google=unavailable`, request.url));
  }
  return NextResponse.redirect(googleConsentUrl(encodeURIComponent(from)));
}
