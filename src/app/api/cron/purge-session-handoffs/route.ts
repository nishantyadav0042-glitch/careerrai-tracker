import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';

// ── P1-A: stop storing session credentials forever ──────────────────────────
//
// `pwa_session_handoff` mints a one-time, 15-minute hand-off so an installed
// iOS PWA can inherit the browser's session. Each row's payload is an
// AES-256-GCM blob containing a Supabase ACCESS + REFRESH token pair.
//
// The audit found 502 rows, every one carrying a payload, the oldest from 12
// July: 494 expired-and-never-used, 8 used, 0 live. No purge existed anywhere
// in the repository. The payload is needed for fifteen minutes and was being
// kept for six weeks, at 1.6% utilisation — pure liability with no offsetting
// benefit.
//
// The encryption is real but bounded: the key is sha256(SUPABASE_SERVICE_ROLE_KEY),
// so it defends a database-only exposure (a backup or replica leak) and gives
// nothing against service-role compromise. Retention is the actual control.
//
// DELIBERATELY NOT DONE: the stored refresh tokens are not redeemed, tested, or
// revoked from here. Whether they are still valid is UNKNOWN and testing one
// would mean using it.
//
// Two-stage, because they answer different questions:
//   · payload NULLed as soon as a row is expired or used — the credential is
//     gone within the hour, while the row still proves a hand-off happened.
//   · row deleted after 7 days — operational history, then nothing.

const PAYLOAD_TTL_MINUTES = 20;   // 15-minute TTL + slack
const ROW_TTL_DAYS = 7;

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/purge-session-handoffs', async () => {
    const admin = createAdminClient();
    const now = Date.now();
    const payloadCutoff = new Date(now - PAYLOAD_TTL_MINUTES * 60_000).toISOString();
    const rowCutoff = new Date(now - ROW_TTL_DAYS * 86_400_000).toISOString();

    // 1. Strip the credential from anything that can no longer be redeemed.
    //    `used` rows are burned by /api/install/exchange but keep their payload;
    //    expired rows are dead by definition.
    const { data: scrubbed, error: scrubErr } = await admin
      .from('pwa_session_handoff')
      .update({ payload: null })
      .not('payload', 'is', null)
      .or(`used.eq.true,expires_at.lt.${payloadCutoff}`)
      .select('token');
    if (scrubErr) {
      // A failed purge is a real incident: it means credentials are still
      // sitting there. Answer non-2xx so cron tracking records a failure rather
      // than a quiet success.
      console.error('[purge-handoffs] scrub failed:', scrubErr.message);
      return NextResponse.json({ error: 'scrub failed', detail: 'see logs' }, { status: 500 });
    }

    // 2. Remove the rows themselves once they are only history.
    const { data: deleted, error: delErr } = await admin
      .from('pwa_session_handoff')
      .delete()
      .lt('expires_at', rowCutoff)
      .select('token');
    if (delErr) {
      console.error('[purge-handoffs] delete failed:', delErr.message);
      return NextResponse.json({ error: 'delete failed', detail: 'see logs' }, { status: 500 });
    }

    // 3. Report what is LEFT holding a credential. This is the number that
    //    matters: if it is not trending to ~0 the purge is not working, and a
    //    zero from a broken job would otherwise look like success.
    const { count: remaining, error: countErr } = await admin
      .from('pwa_session_handoff')
      .select('*', { count: 'exact', head: true })
      .not('payload', 'is', null);

    return NextResponse.json({
      ok: true,
      scrubbed: (scrubbed ?? []).length,
      deleted: (deleted ?? []).length,
      // null, not 0 — an unreadable count is not "nothing left".
      still_holding_payload: countErr ? null : (remaining ?? 0),
    });
  });
}

// Vercel Cron invokes with GET. Without this line the platform's daily call
// lands on a route that only answers POST, Next returns 405, the handler body
// never runs — and because `withCronTracking` lives INSIDE the handler, no
// cron_runs row is written either. The job then looks identical to one that
// was never scheduled at all, which is exactly how this route was recorded as
// "declared but NEVER RUN" for days (Incidents #55 and #56). Every other cron
// in this repo carries this line; these two were the only ones that did not,
// and they were the only two that had never run.
export { POST as GET };
