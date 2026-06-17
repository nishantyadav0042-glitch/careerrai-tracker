import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import type { Notification } from '@/types';

type Channel = 'in_app' | 'push';
type NotifType = Notification['type'];

interface SendOptions {
  userId: string;
  type: NotifType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: Channel[];
}

export async function sendNotification(opts: SendOptions): Promise<void> {
  const { userId, type, title, body, data = {}, channels = ['in_app'] } = opts;
  const admin = createAdminClient();

  if (channels.includes('in_app')) {
    await admin.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body,
      data,
      read: false,
      channel: 'in_app',
    });
  }

  if (channels.includes('push')) {
    const { data: prefs } = await admin
      .from('profiles')
      .select('notif_prefs')
      .eq('id', userId)
      .single();
    const p = (prefs?.notif_prefs ?? {}) as Record<string, unknown>;
    if (p.push === true) {
      await sendPushToUser(userId, { title, body, url: (data.url as string) ?? '/' });
    }
  }
}
