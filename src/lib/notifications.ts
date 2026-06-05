import { createAdminClient } from '@/lib/supabase/admin';
import type { Notification } from '@/types';

type Channel = 'in_app' | 'email' | 'push' | 'whatsapp';
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
  const supabase = createAdminClient();

  for (const channel of channels) {
    await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body,
      data,
      read: false,
      channel,
    });

    if (channel === 'push') {
      // TODO: send Web Push via VAPID — stub ready for Phase 2
    }
    if (channel === 'email') {
      // TODO: send via Resend — stub ready for Phase 2
    }
    if (channel === 'whatsapp') {
      // TODO: call WhatsApp provider (MSG91/Gupshup) — stub for Phase 3
    }
  }
}
