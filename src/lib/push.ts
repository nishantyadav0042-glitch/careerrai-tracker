import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerConfig } from '@/lib/server-config';
import { logConsentEvent } from '@/lib/consent-history';
import {
  liveEndpointsFor, recordDelivery, revokeEndpoint, type LiveEndpoint,
} from '@/lib/notification-endpoints';

// VAPID keypair is sourced from the server_config table (DB-authoritative) so the
// public key the client subscribes with and the private key the server signs with
// are ALWAYS a matched pair — env vars are deliberately not consulted for the keys
// to avoid an env-public / DB-private mismatch that silently breaks push. (Email
// is not part of the keypair, so it may still come from env.)
async function getVapidConfigured() {
  const pub = await getServerConfig('VAPID_PUBLIC_KEY');
  const priv = await getServerConfig('VAPID_PRIVATE_KEY');
  const email = (await getServerConfig('VAPID_EMAIL', 'VAPID_EMAIL')) ?? 'mailto:admin@careerrai.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(email, pub, priv);
  return true;
}

export interface PushResult { ok: boolean; reason?: string; terminal?: boolean }

// Immediate report the instant a subscription is confirmed dead — not a
// dashboard number nobody checks, an actual email to the inbox already used
// for App Store review contact (business@careerrai.com). Deliberately does
// NOT depend on anyone opening the app: email is a channel nothing else in
// this incident touches. Throttled per-student to one alert per 24h so a
// student who fails 10 sends in a row (e.g. a batch job retrying) doesn't
// spam the inbox — the daily push-recovery digest is the durable record.
async function reportPushDeath(userId: string): Promise<void> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('type', 'push_death_alerted').gte('created_at', since);
  if ((count ?? 0) > 0) return; // already alerted for this student in the last 24h

  const { data: profile } = await admin.from('profiles').select('full_name, phone').eq('id', userId).single();
  await admin.from('notifications').insert({
    user_id: userId, type: 'push_death_alerted', title: 'Push subscription died', body: '',
    channel: 'internal', read: true, reason: 'Immediate death report — see reportPushDeath in push.ts',
  });

  const { sendAdminAlert } = await import('@/lib/email');
  await sendAdminAlert(
    `⚠️ Push died: ${profile?.full_name ?? userId}`,
    `<p><strong>${profile?.full_name ?? 'A student'}</strong> (${profile?.phone ?? 'no phone on file'}) just lost their push subscription — CareerRai can no longer reach them via push.</p><p>They asked for reminders (push preference is ON). This is reported immediately per policy: a dead subscription can never be revived server-side; the only way back is getting them to reopen the app once (their notification permission is likely still granted, so re-opening silently heals it — no re-prompt needed) or reaching them on another channel (WhatsApp/call).</p>`
  ).catch((e) => console.error('[push] admin alert send failed:', e));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The low-level Web Push transport. Talks to the browser's push service,
 * retries transient failures once, and marks a subscription dead on a
 * permanent one. It does NOT create the notification row, does NOT check any
 * budget, and does NOT stamp pushed_at — those are the ledger's job, one
 * level up, in notification-os.dispatch().
 *
 * ── DO NOT CALL THIS DIRECTLY ───────────────────────────────────────────
 *
 * Every product surface must send through notification-os.dispatch(). This
 * function is exported only so dispatch() can import it; a source-scan guard
 * (send-boundary.guard.test.ts) fails the build if any other file calls it.
 *
 * `notifId` is REQUIRED, not optional, on purpose. It used to be optional,
 * and on 15 Aug that turned out to be exactly how fourteen call sites sent a
 * real, delivered push that could never be marked pushed, received, or
 * clicked — the row existed, its id was simply never carried through. A
 * missing id is now a compile error instead of a silent measurement gap.
 *
 * The 10/day hard ceiling used to live here too. It has moved to dispatch(),
 * because a check that runs only when THIS function is called is not a
 * ceiling if a caller can reach the push service without calling it — which,
 * before 15 Aug, fourteen of them did. The ceiling now sits at the one point
 * every send is structurally forced through.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; notifId: string; tag?: string; senderName?: string }
): Promise<PushResult> {
  if (!(await getVapidConfigured())) {
    console.warn(`[push] VAPID not configured — skipped push to ${userId}: ${payload.title}`);
    return { ok: false, reason: 'vapid_not_configured' };
  }

  const admin = createAdminClient();

  // ── EVERY DEVICE, NOT THE ONE COLUMN ──────────────────────────────────────
  //
  // Step 2 of the endpoint-registry migration. This used to read
  // `profiles.push_subscription` — a single jsonb column, so a student who
  // installed on a second device had the first silently evicted and could be
  // reached on exactly one. liveEndpointsFor() returns every live endpoint,
  // and falls back to that same column when the registry holds none, so no
  // student who was reachable before this change is unreachable after it.
  const endpoints = await liveEndpointsFor(admin, userId);
  if (endpoints.length === 0) return { ok: false, reason: 'no_subscription' };

  const results = await Promise.all(
    endpoints.map((ep) => sendToEndpoint(admin, userId, ep, payload)),
  );

  // ONE endpoint landing is a delivered push. A student with a live phone and
  // a stale laptop is reached, and the stale laptop is revoked on its own —
  // the failure of one device must never be reported as the failure of the
  // student, which is precisely what the single column could not express.
  const delivered = results.find((r) => r.ok);
  if (delivered) {
    // The old columns stay true for the ~15 modules still reading them
    // (Step 3 migrates those). A student with at least one working endpoint
    // is not dead, whatever a previous failure wrote.
    await admin.from('profiles').update({ push_died_at: null }).eq('id', userId).not('push_died_at', 'is', null);
    return { ok: true };
  }

  // Nobody could be reached. Only NOW does the student-level "push is dead"
  // fact become true — and only when every endpoint failed terminally, not
  // on a transient network blip that a later send may well survive.
  const allTerminal = results.every((r) => r.terminal);
  if (allTerminal) {
    await admin.from('profiles')
      .update({ push_subscription: null, push_died_at: new Date().toISOString() })
      .eq('id', userId);
    void reportPushDeath(userId).catch((e) => console.error('[push] death report failed:', e));
    void logConsentEvent(admin, userId, 'subscription_died', results[0]?.reason ?? 'all_endpoints_dead');
    void logConsentEvent(admin, userId, 'recovery_required');
  }
  return results[0] ?? { ok: false, reason: 'unreachable' };
}

/**
 * One endpoint, with the retry policy that used to sit in sendPushToUser.
 *
 * A dead subscription (410/404) is TERMINAL — no retry can revive it, a hard
 * property of the Web Push standard on every platform. Anything else (503
 * from the push service, a DNS blip, a momentary timeout) is TRANSIENT, and
 * retrying once after a short backoff is the difference between a reminder
 * that silently vanishes and one that lands.
 */
async function sendToEndpoint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  ep: LiveEndpoint,
  payload: { title: string; body: string; url?: string; notifId: string; tag?: string; senderName?: string },
): Promise<PushResult> {
  // APNs has no transport yet — there is no native iOS app in this repository
  // to register a device token from, so no row can carry provider 'apns'
  // today. Named explicitly rather than silently skipped: when the native
  // shell exists, this is the one line that has to grow, and a delivery row
  // records the gap in the meantime.
  if (ep.provider === 'apns' || !ep.subscription) {
    await recordDelivery(admin, payload.notifId, ep.id, { accepted: false, reason: 'no_transport_for_provider' });
    return { ok: false, reason: 'no_transport_for_provider', terminal: false };
  }

  let last: PushResult = { ok: false, reason: 'unreachable' };
  for (let attempt = 1; attempt <= 2; attempt++) {
    last = await attemptSend(admin, userId, ep.subscription as unknown as webpush.PushSubscription, payload, ep.id);
    if (last.ok || last.terminal) break;
    if (attempt < 2) { console.warn(`[push] attempt ${attempt} failed for ${userId}, retrying…`); await sleep(1500); }
  }

  // Per-endpoint evidence: this is what makes "sent to the student" and
  // "accepted for this phone" separable facts.
  await recordDelivery(admin, payload.notifId, ep.id, { accepted: last.ok, reason: last.reason });
  // A terminal failure kills THIS endpoint and nothing else.
  if (last.terminal && ep.id) await revokeEndpoint(admin, ep.id, last.reason ?? 'terminal');
  return last;
}

async function attemptSend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  subscription: webpush.PushSubscription,
  payload: { title: string; body: string; url?: string; notifId: string; tag?: string; senderName?: string },
  // Which endpoint row this exact copy is going to. Null only for the synthetic
  // fallback endpoint (a student still on profiles.push_subscription, with no
  // registry row) — that copy carries no endpointId and the beacon stays
  // student-level for them, exactly as before this change.
  endpointId: string | null,
): Promise<PushResult & { terminal?: boolean }> {
  try {
    // Every push needs a UNIQUE tag. sw.js falls back to a single shared tag when
    // none is set — per the Web Push spec, two notifications sharing a tag
    // silently collapse into one with no sound/vibration on the second, so a
    // chat-message push followed by a streak-risk push would erase the chat one
    // unheard. A per-send tag guarantees every push actually alerts the device.
    // data.{url,notifId} is what the SW actually reads: url for the click
    // target (the old top-level url was silently ignored by showNotification,
    // so every push click opened "/" instead of its deep link), notifId for
    // the click beacon that stamps clicked_at (see /api/push/click).
    // A caller MAY pin a stable tag instead (chat does: one tag per
    // conversation, so a burst of DMs collapses into ONE tray entry instead
    // of a stack — Shreya, 12 Aug). Collapsing is safe because sw.js sets
    // renotify: true, so every replacement still sounds/vibrates; the SW also
    // rewrites the title to "N new messages" when it stacks (chat- tags only).
    const tagged = {
      ...payload,
      tag: payload.tag ?? `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      data: {
        url: payload.url ?? '/',
        notifId: payload.notifId,
        // WHICH DEVICE THIS COPY WENT TO (task #79). The SW echoes it back on
        // the arrival beacon, which is the only way a receipt can name a
        // device rather than a student — a student with two phones otherwise
        // produces one receipt and no way to tell which phone displayed it.
        //
        // Safe to carry: this is the endpoint's own row id, sent only to that
        // endpoint, inside the aes128gcm payload Web Push encrypts end-to-end
        // between this server and that browser. The push service cannot read
        // it. It is an opaque identifier, never a credential — /api/push/received
        // re-derives ownership server-side and refuses any pair whose
        // notification and endpoint do not name the same student.
        ...(endpointId ? { endpointId } : {}),
        ...(payload.senderName ? { senderName: payload.senderName } : {}),
      },
    };
    // Urgency: 'high' is the fix for "notifications only show when I open the
    // app". The web-push default is NORMAL urgency, which Android's Doze /
    // battery-saver is allowed to DEFER — so background pushes get batched and
    // only flush when the device next wakes (i.e. when the user picks up the
    // phone and opens the app). High urgency tells the push service to deliver
    // immediately even in Doze. TTL 24h so a reminder that couldn't be
    // delivered (device off) expires instead of arriving a day late.
    await webpush.sendNotification(
      subscription,
      JSON.stringify(tagged),
      { urgency: 'high', TTL: 24 * 60 * 60 }
    );
    return { ok: true };
  } catch (err: unknown) {
    const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err
      ? (err as { statusCode: number }).statusCode : undefined;
    // Subscription expired/invalid — clean it up so we stop trying, and
    // stamp push_died_at: a dead endpoint usually means the PWA was
    // uninstalled, which is a CRM signal ("push can't reach them — email or
    // a call are the only doors left"), not just an error to swallow.
    // A 410/404 kills THIS endpoint. It used to null the student's only
    // column and declare them dead right here — which, once a student can
    // hold several endpoints, would mean one stale laptop marking a student
    // with a perfectly live phone as unreachable. The student-level verdict
    // now belongs to sendPushToUser, which is the only place that can see
    // whether EVERY endpoint failed; revocation of the individual row is
    // done by its caller, sendToEndpoint.
    const terminal = statusCode === 410 || statusCode === 404;
    console.error(`[push] send failed (status ${statusCode}) for ${userId}`);
    return { ok: false, reason: `send_failed_${statusCode ?? 'unknown'}`, terminal };
  }
}
