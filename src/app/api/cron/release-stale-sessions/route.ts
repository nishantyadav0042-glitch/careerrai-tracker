import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { audit } from '@/lib/integration-audit';
import { RELEASE_AFTER_MS } from '@/lib/session-window';
import { emitTimeline } from '@/lib/os/timeline';
import { settleCreditForSession } from '@/lib/session-credit';

export const dynamic = 'force-dynamic';

// Releases the booking lock from sessions nobody ever closed out.
//
// A pair may hold exactly ONE live session. That rule is what stops the
// four-rooms-in-one-evening failure — and it has a sharp edge: a session
// left `scheduled` holds the lock FOREVER. This database already had one from
// 21 July still marked live, which under the new rule silently blocks that
// pair from ever booking again. Nobody would have reported it as "the lock is
// stuck"; they would have reported "booking is broken".
//
// So: once a session's own window has been over for STALE_AFTER_HOURS and no
// one has marked it completed or cancelled, we release it.
//
// It is marked `expired` — not `completed`, and deliberately not `cancelled`.
// Both of those make a claim we cannot support:
//
//   'completed' asserts the call happened. That is fabricated evidence, the
//               thing Incident #9's exam_ready guard exists to prevent.
//   'cancelled' asserts it did NOT happen. Writing this cron against live data
//               showed it would have marked the 4 Aug Shreya orientation
//               cancelled — a session the founder watched go well and rated
//               10/10. A cleanup job must not rewrite history it did not see.
//
// 'expired' says only what is true: the window passed, nobody recorded an
// outcome, and it no longer blocks anyone. A mentor can still mark it completed
// afterwards.

/** Long enough that a call running over, or a late close-out, is never touched. */
// Founder, 9 Aug: a session leaves the schedule ONE HOUR after its start time,
// so the mentor can immediately book another. Six hours was the old value, and
// the cron ran every six hours on top of it — so a dead session could sit in
// the schedule for up to TWELVE hours holding its slot.
//
// The slot really is held: `no_overlapping_buddy_sessions` is an EXCLUDE
// constraint over sessions in scheduled/active, so a stale row makes a
// same-slot rebooking fail outright. Arnav's first paid session was still
// sitting there 73 minutes later, blocking the evening it was meant to fill.
//
// RELEASE_AFTER_MS is SESSION_GRACE_MS — the same hour that governs whether a
// session is still joinable. The moment it stops being joinable is the moment
// its slot should free up, or the two rules disagree and the mentor is looking
// at a row they can neither join nor replace.

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/release-stale-sessions', async () => {

    const admin = createAdminClient();
    const now = Date.now();

    // Candidates: still live, and scheduled long enough ago that even a 60-minute
    // session plus the grace window is comfortably past.
    const cutoff = new Date(now - RELEASE_AFTER_MS).toISOString();

    const { data: candidates, error } = await admin
      .from('video_sessions')
      .select('id, buddy_id, student_id, title, scheduled_at, duration_minutes, session_status')
      .in('session_status', ['scheduled', 'active'])
      .lt('scheduled_at', cutoff)
      .order('scheduled_at', { ascending: true })
      .limit(200);

    if (error) {
      console.error('[release-stale-sessions]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Second filter in code, against each session's OWN end time — a 60-minute
    // session starting 6h ago is stale, but the cutoff above is a coarse index
    // scan and this is the precise question.
    // The SQL cutoff above is the coarse filter. This is the exact one, and it
    // applies the same single rule rather than adding a second delay on top —
    // the old code did `end + STALE_AFTER_HOURS` where `end` already included a
    // duration, which is how "release after 6 hours" became "up to 12".
    const stale = (candidates ?? []).filter(
      (s) => now - Date.parse(s.scheduled_at) >= RELEASE_AFTER_MS,
    );

    const released: string[] = [];
    for (const s of stale) {
      const { data: updated, error: e } = await admin
        .from('video_sessions')
        .update({ session_status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', s.id)
        // Guard against releasing a session someone closed out in the meantime.
        .in('session_status', ['scheduled', 'active'])
        .select('id');
      if (e) { console.error('[release-stale-sessions] release failed', s.id, e.message); continue; }
      // A 0-row update means the guard fired — the mentor closed it out between
      // our read and our write. Counting it as released would make the metric
      // lie, and the audit log would claim an event that never happened.
      if (!updated?.length) continue;

      released.push(s.id);
      // Nobody joined, so nothing was delivered. The credit goes back to the
      // student as a rebookable, owned failure rather than staying spent.
      await settleCreditForSession(admin, s.id as string, 'expired');
      // Timeline: a booked session nobody joined — a missed promise, on the
      // student's story and the mentor's both.
      if (s.student_id) await emitTimeline(admin, {
        entity: 'student', entityId: s.student_id, kind: 'session_expired',
        summary: 'Session expired — nobody joined', actor: 'system',
        metadata: { sessionId: s.id, buddyId: s.buddy_id },
      });
      await audit({
        subjectId: s.buddy_id,
        actorId: null, // the system did this, not the mentor
        action: 'booking.expired',
        detail: {
          sessionId: s.id, studentId: s.student_id,
          scheduledAt: s.scheduled_at, wasStatus: s.session_status,
          autoReleased: true, releasedAfterMs: RELEASE_AFTER_MS,
        },
      });
    }

    // Idempotency keys are only useful for as long as a client might retry.
    // Without this they accumulate one row per booking, forever — the orphan
    // table nobody notices until it is large. A day is far beyond any retry.
    const keyCutoff = new Date(now - 24 * 3_600_000).toISOString();
    const { data: prunedKeys, error: pruneErr } = await admin
      .from('idempotency_keys')
      .delete()
      .lt('created_at', keyCutoff)
      .select('key');
    if (pruneErr) console.error('[release-stale-sessions] key prune failed:', pruneErr.message);

    // Abandoned chat attachments: uploaded, never sent, referenced by nothing.
    // A day is far longer than any composer session, so anything unclaimed by
    // now never will be.
    const { data: abandoned } = await admin
      .from('attachment_uploads')
      .select('path')
      .is('claimed_at', null)
      .lt('created_at', keyCutoff)
      .limit(500);

    let attachmentsPruned = 0;
    if (abandoned?.length) {
      const paths = abandoned.map((a) => a.path);
      const { error: rmError } = await admin.storage.from('chat-attachments').remove(paths);
      if (rmError) {
        console.error('[release-stale-sessions] attachment prune failed:', rmError.message);
      } else {
        // Only forget the bookkeeping once the objects are actually gone —
        // otherwise a failed delete would strand files with nothing left
        // pointing at them, which is the exact problem this solves.
        await admin.from('attachment_uploads').delete().in('path', paths);
        attachmentsPruned = paths.length;
      }
    }

    return NextResponse.json({
      ok: true,
      attachmentsPruned,
      examined: candidates?.length ?? 0,
      released: released.length,
      sessionIds: released,
      idempotencyKeysPruned: prunedKeys?.length ?? 0,
    });
  });
}

export { POST as GET };
