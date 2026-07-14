import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/request-ip';

// Step 13 collector — receives batched timing events from real student
// devices (see components/perf-beacon.tsx) via sendBeacon. Tolerant of
// missing auth (a beacon can fire during logout); strict on shape so the
// table can only ever contain small, typed timing rows.
const METRICS = new Set(['ttfb', 'fcp', 'lcp', 'interactive', 'nav']);
const MAX_EVENTS_PER_POST = 12;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const events = Array.isArray((body as { events?: unknown[] })?.events)
    ? (body as { events: unknown[] }).events.slice(0, MAX_EVENTS_PER_POST)
    : [];
  if (events.length === 0) return NextResponse.json({ ok: true, stored: 0 });

  const user = await getAuthUser().catch(() => null);

  const rows = [];
  for (const e of events) {
    const { path, metric, value, device, connection } = (e ?? {}) as Record<string, unknown>;
    if (typeof path !== 'string' || !path.startsWith('/') || path.length > 120) continue;
    if (typeof metric !== 'string' || !METRICS.has(metric)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 120_000) continue;
    rows.push({
      user_id: user?.id ?? null,
      path,
      metric,
      value_ms: Math.round(value),
      device: typeof device === 'string' ? device.slice(0, 40) : null,
      connection: typeof connection === 'string' ? connection.slice(0, 20) : null,
    });
  }
  if (rows.length === 0) return NextResponse.json({ ok: true, stored: 0 });

  const admin = createAdminClient();

  // Unauthenticated endpoint (a beacon can fire logged-out) — light per-IP
  // flood guard so it can't be used to bloat perf_events for free (security
  // audit, 14 July). Fail open: never blocks a real student's beacon.
  const ip = clientIp(request);
  if (ip) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('perf_events')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);
    if ((count ?? 0) >= 2000) return NextResponse.json({ ok: true, stored: 0 });
  }

  await admin.from('perf_events').insert(rows.map((r) => ({ ...r, ip })));
  return NextResponse.json({ ok: true, stored: rows.length });
}
