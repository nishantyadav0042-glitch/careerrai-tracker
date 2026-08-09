import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { sendAdminAlert } from '@/lib/email';
import { waMessages, waNumber } from '@/lib/wa-messages';

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
    const dreamCollege = (s.dream_colleges as string[] | null)?.[0] ?? 'their dream college';
    const msg = waMessages({ firstName, dreamCollege }).find((m) => m.key === 'push_recovery')!;
    const waLink = s.phone ? `https://wa.me/${waNumber(s.phone)}?text=${encodeURIComponent(msg.text)}` : null;
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

  return NextResponse.json({ ok: true, affected: dead.length, newToday: fresh.length });
}
