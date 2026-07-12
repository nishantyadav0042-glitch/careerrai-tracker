import type { NextRequest } from 'next/server';

// Trusted client IP. On Vercel the platform sets `x-real-ip` to the real client
// address and rewrites `x-forwarded-for` — but the FIRST x-forwarded-for token
// can be a value the client themselves prepended, so keying rate limits on it is
// spoofable. Prefer `x-real-ip` (single, platform-set, not client-appendable),
// then fall back to the LAST x-forwarded-for hop (the one the trusted proxy
// added), never the first. Returns null when it can't be determined — every
// caller MUST fail OPEN on null so a missing header degrades to "no per-IP
// limit", never to a lockout.
export function clientIp(request: NextRequest): string | null {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    // rightmost hop = added by the closest trusted proxy, not client-controlled
    if (hops.length) return hops[hops.length - 1];
  }
  return null;
}
