import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { sendAdminAlert } from '@/lib/email';
import { pushRecoveryMessage, waNumber } from '@/lib/wa-messages';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { CONFIRMATION_WINDOW_MS } from '@/lib/delivery-state';

// Every invocation of this route walks the whole student roster. Vercel's
// default ceiling was never a decision anyone made here — it was simply
// inherited, and when it is reached the invocation is killed mid-loop and the
// students at the END of the ordering are silently never processed. Same
// students, every day, invisibly. 300s is declared so the ceiling is a choice,
// and lib/cron-sweep keeps the walk inside it.
export const maxDuration = 300;

// PUSH RECOVERY DIGEST — the daily backstop for the gap identified in the push
// reliability review (18 Jul 2026): a dead push subscription (push_died_at set)
// used to be written to the database and NEVER READ AGAIN by anything. Push.ts
// now fires an immediate per-event email the moment a subscription dies
// (reportPushDeath); THIS cron is the durable daily rollup in case that
// real-time alert was ever missed, and — more importantly — the operational
// checklist: one-tap WhatsApp links ready for every currently-affected student,
// because a dead push subscription can never be revived server-side (a hard
// property of the Web Push standard on every platform) — the only way back is
// a human either reopening the app once (their OS permission is usually still
// granted, so PushHealer fixes it silently, no re-prompt) or being reached on
// a channel push itself can't touch.
//
// Runs once daily. Idempotent: skips anyone already covered by today's digest
// (tracked via a 'push_recovery_digested' marker on the notifications table).
export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/push-recovery', async () => pushRecoveryRun());
}

async function pushRecoveryRun(): Promise<NextResponse> {
  const admin = createAdminClient();
  const todayStart = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30';

  const { data: dead } = await admin
    .from('profiles')
    .select('id, full_name, phone, push_died_at, dream_colleges')
    .eq('role', 'student')
    .not('push_died_at', 'is', null)
    .is('push_subscription', null)
    .not('is_test_account', 'is', true);

  if (!dead?.length) {
    return NextResponse.json({ ok: true, affected: 0, note: 'no push-dead students' });
  }

  const { data: alreadyDigested } = await admin
    .from('notifications')
    .select('user_id')
    .eq('type', 'push_recovery_digested')
    .gte('created_at', todayStart);
  const seen = new Set((alreadyDigested ?? []).map((r) => r.user_id));

  const fresh = dead.filter((s) => !seen.has(s.id));
  if (!fresh.length) {
    return NextResponse.json({ ok: true, affected: dead.length, newToday: 0, note: 'all already in today\'s digest' });
  }

  const rows = fresh.map((s) => {
    const firstName = (s.full_name || 'Student').split(' ')[0];
    const waLink = s.phone ? `https://wa.me/${waNumber(s.phone)}?text=${encodeURIComponent(pushRecoveryMessage(firstName))}` : null;
    return { name: s.full_name ?? 'Unknown', phone: s.phone ?? '—', diedAt: s.push_died_at, waLink };
  });

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;color:#1c1917">Push recovery — ${fresh.length} student${fresh.length === 1 ? '' : 's'} need a WhatsApp nudge</h2>
      <p style="color:#57534e">These students explicitly want reminders (push preference is ON), but their push subscription has died and cannot be revived automatically — this is a hard limit of the Web Push standard on every platform, not a CareerRai bug. One tap opens WhatsApp with the message ready.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        ${rows.map((r) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #e7e5e4">
              <strong style="color:#1c1917">${r.name}</strong><br/>
              <span style="color:#78716c;font-size:13px">${r.phone} · died ${new Date(r.diedAt!).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </td>
            <td style="padding:10px 0;border-bottom:1px solid #e7e5e4;text-align:right">
              ${r.waLink ? `<a href="${r.waLink}" style="background:#1c1917;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">WhatsApp →</a>` : '<span style="color:#dc2626;font-size:12px">no phone on file</span>'}
            </td>
          </tr>`).join('')}
      </table>
    </div>
  `;
  await sendAdminAlert(`⚠️ Push recovery: ${fresh.length} student${fresh.length === 1 ? '' : 's'} to WhatsApp today`, html);

  // Mark as digested so tomorrow's run doesn't re-list them (unless still dead).
  await admin.from('notifications').insert(
    fresh.map((s) => ({
      user_id: s.id, type: 'push_recovery_digested', title: 'In today\'s push recovery digest', body: '',
      channel: 'internal', read: true,
    }))
  );

  const resolved = await closeOutUnconfirmed(admin);

  return NextResponse.json({
    ok: true, affected: dead.length, newToday: fresh.length, resolvedUnknown: resolved,
  });
}

// ── CLOSE OUT THE LIMBO ─────────────────────────────────────────────────────
//
// A notification the transport accepted and no device ever confirmed used to
// sit in 'provider_accepted' forever: 1,689 rows in 7 days, 29.9% of every
// accepted push. "Accepted" then read as "delivered" on every surface, which
// is the quiet version of a green signal meaning no answer.
//
// This gives those rows the honest name — UNKNOWN — once the measured
// confirmation window has elapsed. See lib/delivery-state.ts for why the
// window is 48h rather than a rounder guess.
//
// IT LIVES HERE ON PURPOSE. push-recovery already owns the terminal end of
// push delivery (dead subscriptions, the recovery digest), it already runs
// daily, and it already walks this ground. A new cron would be a new scheduler
// path to own, register in two places and keep in lockstep with the GitHub
// Actions fallback — a second authority for a problem the first one covers.
//
// NOT A RETRY. Nothing is re-sent and no event is created. This completes the
// state machine on rows that already exist.
//
// NOT DESTRUCTIVE. resolveDeliveryState treats a receipt or a tap as proof of
// arrival regardless of send_status, so a confirmation that lands after the
// stamp still reads as delivered. UNKNOWN is an admission, not a verdict.
async function closeOutUnconfirmed(
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - CONFIRMATION_WINDOW_MS).toISOString();

    // ── ONE SET-BASED UPDATE, NO ID LIST ─────────────────────────────────
    //
    // The first draft read the stale rows, filtered them in JS with
    // needsUnknownStamp, then updated `.in('id', ids)`. B3b gate 1
    // (truth/population-read.guard.test.ts) failed it, correctly: 500 UUIDs
    // is ~18.5 KB of request, inside the very bracket where the 23 Aug
    // weekly-plan-reconcile incident died (19.3 KB worked, 33.3 KB did not).
    // That guard says never add a baseline entry to make a build pass, so the
    // shape changed instead of the list.
    //
    // The predicate below IS needsUnknownStamp, expressed in SQL:
    //   send_status = 'provider_accepted'  (still claiming to be waiting)
    //   received_at IS NULL                (no receipt)
    //   clicked_at  IS NULL                (no tap — a tap proves delivery)
    //   pushed_at   IS NOT NULL            (a push was actually attempted)
    //   pushed_at   < now - window         (the window has elapsed)
    //
    // delivery-state-sweep.guard.test.ts pins that agreement, so the database
    // and the read surfaces can never drift into two notions of 'unknown'.
    //
    // Set-based means the request size is constant however many rows match,
    // there is no read-then-write race to lose, and a receipt landing mid-
    // statement simply takes its row out of the matching set.
    const { data: updated, error: writeErr } = await admin
      .from('notifications')
      .update({ send_status: 'unknown' })
      .eq('send_status', 'provider_accepted')
      .is('received_at', null)
      .is('clicked_at', null)
      .not('pushed_at', 'is', null)
      .lt('pushed_at', cutoff)
      .select('id');

    if (writeErr) {
      console.error('[push-recovery] unconfirmed sweep write failed:', writeErr.message);
      return 0;
    }
    return updated?.length ?? 0;
  } catch (err) {
    // Never fatal: the recovery digest above is the primary job of this cron
    // and must still report even if this bookkeeping pass fails.
    console.error('[push-recovery] unconfirmed sweep threw:', err);
    return 0;
  }
}
