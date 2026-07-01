import { NextResponse } from 'next/server';
import { getServerConfig } from '@/lib/server-config';
import { isRequestAdmin } from '@/lib/require-admin';

// Health check for the Daily.co video integration. Reports whether the API key
// is configured and accepted by Daily — never returns the key itself. Lets us
// confirm video is wired up correctly from production (where Daily is reachable).
export async function GET() {
  if (!(await isRequestAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const apiKey = await getServerConfig('DAILY_API_KEY', 'DAILY_API_KEY');
  if (!apiKey) return NextResponse.json({ configured: false, ok: false });
  try {
    const res = await fetch('https://api.daily.co/v1/', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return NextResponse.json({ configured: true, ok: false, status: res.status });
    }
    const data = (await res.json()) as { domain_name?: string };
    return NextResponse.json({ configured: true, ok: true, domain: data.domain_name ?? null });
  } catch {
    return NextResponse.json({ configured: true, ok: false, error: 'unreachable' });
  }
}
