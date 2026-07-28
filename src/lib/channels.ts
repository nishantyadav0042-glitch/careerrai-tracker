// ── Broadcast channels (WhatsApp / Instagram) ───────────────────────────────
//
// Why this exists at all: of 246 students, only 65 can receive a push
// notification — 26%. 222 have a phone number. A broadcast channel is the only
// route that reaches close to everyone, and unlike the WhatsApp Business API
// (which bills per marketing message, roughly ₹0.78–0.88 each in India — about
// ₹6,000/month at today's size and ₹2.3 lakh/month at 10,000 students) a
// Channel broadcast is free and unlimited.
//
// What it cannot do: tell us who joined. Channels expose a follower count and
// nothing else — no member list, no webhook, no export. So membership here is
// always SELF-REPORTED, and every figure derived from it must be described that
// way. A "joined" number in this system means "the student said yes in the
// app", not "WhatsApp confirms they are a follower". Those are different facts
// and must never be shown as if they were the same one.

export type ChannelId = 'whatsapp' | 'instagram' | 'telegram';

export const CHANNELS: ChannelId[] = ['whatsapp', 'instagram', 'telegram'];

export function isChannelId(v: unknown): v is ChannelId {
  return typeof v === 'string' && (CHANNELS as string[]).includes(v);
}

/** server_config key / env var holding each channel's public join URL. */
export const CHANNEL_CONFIG_KEY: Record<ChannelId, string> = {
  whatsapp: 'WHATSAPP_CHANNEL_URL',
  instagram: 'INSTAGRAM_CHANNEL_URL',
  telegram: 'TELEGRAM_CHANNEL_URL',
};

export const CHANNEL_LABEL: Record<ChannelId, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  telegram: 'Telegram',
};

// ── Link tagging ────────────────────────────────────────────────────────────
//
// The counterpart to "we can never see who joined": we CAN see who comes back.
// Every link dropped in a channel carries ?src=<tag>, which the app records on
// open. That turns an unmeasurable channel into a measurable one — you learn
// which message pulled how many students into the app, even though the platform
// will never tell you who is following.

export const CHANNEL_SRC: Record<ChannelId, string> = {
  whatsapp: 'wa',
  instagram: 'ig',
  telegram: 'tg',
};

/** Reverse lookup for an inbound ?src= tag. Unknown tags are kept, not dropped. */
export function channelFromSrc(src: string | null | undefined): ChannelId | null {
  if (!src) return null;
  const hit = (Object.entries(CHANNEL_SRC) as [ChannelId, string][])
    .find(([, tag]) => tag === src.toLowerCase());
  return hit ? hit[0] : null;
}

/**
 * A tagged deep link to paste into a channel message.
 * `channelLink('/student/tracker', 'whatsapp')` → '/student/tracker?src=wa'
 */
export function channelLink(path: string, channel: ChannelId, campaign?: string): string {
  const sep = path.includes('?') ? '&' : '?';
  const c = campaign ? `&c=${encodeURIComponent(campaign)}` : '';
  return `${path}${sep}src=${CHANNEL_SRC[channel]}${c}`;
}
