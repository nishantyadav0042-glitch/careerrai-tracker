import { NextRequest, NextResponse } from 'next/server';
import { applyDemoSession, DEMO_DEST } from '@/lib/demo-session';

// Shareable, one-click demo link. Paste this URL to a lead — opening it signs
// them into the read-only demo student account server-side (no login screen, no
// credentials) and drops them straight onto the student tracker, where a
// one-time "this is a demo profile" popup greets them. ?demo=welcome triggers
// that popup; the persistent "Demo — view only" banner is always shown too.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
