import { NextRequest, NextResponse } from 'next/server';
import { applyDemoSession, DEMO_DEST } from '@/lib/demo-session';

// Shareable, one-click demo link. Paste this URL to a lead — opening it signs
// them into the read-only demo student account server-side (no login screen, no
// credentials) and drops them straight onto the student tracker, where a
// one-time "this is a demo profile" popup greets them. ?demo=welcome triggers
// that popup; the persistent "Demo — view only" banner is always shown too.
//
// Also linked from inside the app (the paywalled Buddy tab, for a logged-in
// free-tier student previewing what a buddy relationship looks like) — an
// intentional session swap there is fine, the student just logs back in
// after. A logged-in buddy or admin landing here, though, is almost always
// an accident (a stray link, not a deliberate preview) and swapping out
// their session would silently drop them out of their own work — so only
// those two roles are guarded off.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const role = request.cookies.get('user_role')?.value;
  if ((role === 'buddy' || role === 'admin') && request.cookies.get('cr_demo')?.value !== '1') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const dest = new URL(DEMO_DEST, request.url);
  dest.searchParams.set('demo', 'welcome');

  const res = NextResponse.redirect(dest);
  const result = await applyDemoSession(request, res);
  if (!result) {
    // Demo unavailable — fall back to the login page so the link never dead-ends.
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return result;
}
