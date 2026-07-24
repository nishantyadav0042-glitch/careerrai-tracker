import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/request-ip';

// Journey-event ingest. Public (works pre-auth via anon_id) but attaches the
// authenticated user id server-side when a session cookie is present, so events
// can never be spoofed onto another user. Best-effort: always returns 200 so a
// beacon never blocks navigation.
//
// Beyond storing the timeline, it opportunistically HEALS two long-standing
// data gaps from a trustworthy signal — an app_open fired in standalone mode:
//   • last_seen_at was unreliable (many installed students had NULL) — a
//     standalone app_open is a real "still on the phone, opened it" heartbeat.
//   • app_installed is only ever set true here as a backstop to install-ping.
//   • push_context records WHERE push was granted (app vs browser) — the core
//     diagnosis for undelivered notifications.

const MAX_EVENTS = 60;          // per request (autocapture batches are larger)
const MAX_EVENT_LEN = 60;
const MAX_PROPS_BYTES = 2500;
const KNOWN_MODES = new Set(['standalone', 'twa', 'browser', 'unknown']);

interface InEvent { event?: unknown; props?: unknown; path?: unknown; ts?: unknown }

export async function POST(request: NextRequest) {
  let body: {
    anon?: unknown; sessionId?: unknown; displayMode?: unknown;
    browser?: unknown; platform?: unknown; ctx?: unknown; events?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const events = Array.isArray(body.events) ? (body.events as InEvent[]).slice(0, MAX_EVENTS) : [];
  if (events.length === 0) return NextResponse.json({ ok: true });

  const anon = typeof body.anon === 'string' ? body.anon.slice(0, 64) : null;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : null;
  const displayMode = typeof body.displayMode === 'string' && KNOWN_MODES.has(body.displayMode) ? body.displayMode : 'unknown';
  const browser = typeof body.browser === 'string' ? body.browser.slice(0, 32) : null;
  const platform = typeof body.platform === 'string' ? body.platform.slice(0, 16) : null;
  // Per-flush device/session enrichment (viewport, network, day-since-install,
  // app version) — merged into every event's props so it's queryable per event.
  const ctx = body.ctx && typeof body.ctx === 'object' && !Array.isArray(body.ctx)
    ? (body.ctx as Record<string, unknown>) : {};

  // Resolve the authenticated user (if any) server-side — never trust the client.
  let userId: string | null = null;
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    );
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    /* anonymous event — fine */
  }

  const admin = createAdminClient();
  const ip = clientIp(request);

  // Light per-IP flood guard (fail open) — this endpoint is public.
  if (ip) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('student_events')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);
    // Autocapture is higher-volume, and shared IPs (college/hostel wifi)
    // aggregate many students — keep the abuse valve, but well above real use.
    if ((count ?? 0) >= 50000) return NextResponse.json({ ok: true });
  }

  const rows = events
    .map((e) => {
      const name = typeof e.event === 'string' ? e.event.slice(0, MAX_EVENT_LEN) : '';
      if (!name) return null;
      // Event props win over shared ctx on any key collision.
      let props: Record<string, unknown> = { ...ctx };
      if (e.props && typeof e.props === 'object') {
        try {
          const merged = { ...ctx, ...(e.props as Record<string, unknown>) };
          const s = JSON.stringify(merged);
          if (s.length <= MAX_PROPS_BYTES) props = merged;
        } catch { /* drop unserialisable props */ }
      }
      const created = typeof e.ts === 'number' && e.ts > 0 && e.ts <= Date.now() + 60_000
        ? new Date(e.ts).toISOString() : new Date().toISOString();
      return {
        user_id: userId, anon_id: anon, session_id: sessionId,
        event: name, props,
        display_mode: displayMode, browser, platform,
        path: typeof e.path === 'string' ? e.path.slice(0, 200) : null,
        ip, created_at: created,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    await admin.from('student_events').insert(rows);
  }

  // Heal profile signals from a trustworthy standalone app_open (real app,
  // real user). Cheap, idempotent, and only on the highest-confidence signal.
  if (userId && displayMode === 'standalone' && events.some((e) => e.event === 'app_open')) {
    await admin.from('profiles')
      .update({ last_seen_at: new Date().toISOString(), app_installed: true })
      .eq('id', userId);
  }

  return NextResponse.json({ ok: true });
}
