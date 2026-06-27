import { NextRequest, NextResponse } from 'next/server';
import { applyDemoSession, DEMO_DEST } from '@/lib/demo-session';

// One-tap, read-only student demo login. Signs the visitor into the demo
// student account server-side via a short-lived magic-link token (no password
// env var required) and sets the demo cookies. Shared logic lives in
// lib/demo-session so the shareable /demo link stays in sync with this button.
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true, dest: DEMO_DEST });
  const result = await applyDemoSession(request, res);
  if (!result) {
    return NextResponse.json({ error: 'Demo is temporarily unavailable.' }, { status: 503 });
  }
  return result;
}
