import type { NextRequest } from 'next/server';

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically.
// Manual triggers (scripts, admin tooling) may use "x-cron-secret" instead.
// Both are accepted; missing CRON_SECRET in the environment always fails.
export function authorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (request.headers.get('x-cron-secret') === secret) return true;
  return false;
}
