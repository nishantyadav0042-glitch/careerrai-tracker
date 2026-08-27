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
  // raw JSON. Since 27 Aug there is no paste-your-own-link fallback behind
  // this, so the card says plainly that it is our side at fault and asks them
  // to try again, rather than implying they missed a step.
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL(`${from}?google=unavailable`, request.url));
  }
  return NextResponse.redirect(googleConsentUrl(encodeURIComponent(from)));
}
