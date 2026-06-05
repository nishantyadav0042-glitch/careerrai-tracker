import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

function getVapidConfigured() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL ?? 'mailto:admin@careerrai.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(email, pub, priv);
  return true;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  if (!getVapidConfigured()) {
    console.log(`[Push stub] To: ${userId} | ${payload.title}`);
    return;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('push_subscription').eq('id', userId).single();
  if (!profile?.push_subscription) return;

  try {
    await webpush.sendNotification(
      profile.push_subscription as webpush.PushSubscription,
      JSON.stringify(payload)
    );
  } catch (err: unknown) {
    // Subscription expired — clean it up
    if (typeof err === 'object' && err !== null && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
      await admin.from('profiles').update({ push_subscription: null }).eq('id', userId);
    }
  }
}
