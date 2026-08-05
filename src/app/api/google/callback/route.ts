import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { exchangeCodeAndStore } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

// Step 2: Google sends the code here. Store tokens, return the mentor to
// wherever they started, with a flag the page can turn into a message.
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const params = new URL(request.url).searchParams;
  const back = decodeURIComponent(params.get('state') || '/buddy/profile');
  const denied = params.get('error');
  const code = params.get('code');

  if (denied || !code) {
    return NextResponse.redirect(new URL(`${back}?google=denied`, request.url));
  }
  const result = await exchangeCodeAndStore(code, user.id);
  if (!result.ok) {
    console.error('[google] connect failed:', result.error);
    return NextResponse.redirect(new URL(`${back}?google=failed`, request.url));
  }
  return NextResponse.redirect(new URL(`${back}?google=connected`, request.url));
}
