import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerConfig } from '@/lib/server-config';

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

export interface PushResult { ok: boolean; reason?: string }

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<PushResult> {
  if (!(await getVapidConfigured())) {
    console.warn(`[push] VAPID not configured — skipped push to ${userId}: ${payload.title}`);
    return { ok: false, reason: 'vapid_not_configured' };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('push_subscription').eq('id', userId).single();
  if (!profile?.push_subscription) return { ok: false, reason: 'no_subscription' };

  try {
    await webpush.sendNotification(
      profile.push_subscription as webpush.PushSubscription,
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (err: unknown) {
    const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err
      ? (err as { statusCode: number }).statusCode : undefined;
    // Subscription expired/invalid — clean it up so we stop trying.
    if (statusCode === 410 || statusCode === 404) {
      await admin.from('profiles').update({ push_subscription: null }).eq('id', userId);
    }
    console.error(`[push] send failed (status ${statusCode}) for ${userId}`);
    return { ok: false, reason: `send_failed_${statusCode ?? 'unknown'}` };
  }
}
