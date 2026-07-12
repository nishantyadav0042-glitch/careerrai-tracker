import type { NextRequest } from 'next/server';

// Client IP from the proxy chain. On Vercel the real client is the first hop in
// x-forwarded-for. Returns null when it can't be determined — every caller MUST
// fail OPEN on null (never block a request just because the IP is unknown), so a
// missing header degrades to "no per-IP limit", never to a lockout.
export function clientIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || null;
}
