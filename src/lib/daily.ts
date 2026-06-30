import { getServerConfig } from '@/lib/server-config';

const DAILY_API = 'https://api.daily.co/v1';

/**
 * Create a Daily.co video room and return its join URL.
 *
 * Uses ONE server-side API key (DAILY_API_KEY in server_config / env) — there is
 * NO per-user OAuth or Google verification for anyone. Rooms are `public` (anyone
 * with the link can join, just like a Meet/Jitsi link) and auto-expire so they
 * don't pile up.
 *
 * Returns null when Daily isn't configured or the API call fails, so callers can
 * fall back to a no-account Jitsi link and scheduling never breaks.
 */
export async function createDailyRoom(opts: { expiresAt: Date }): Promise<string | null> {
  const apiKey = await getServerConfig('DAILY_API_KEY', 'DAILY_API_KEY');
  if (!apiKey) return null;

  try {
    const res = await fetch(`${DAILY_API}/rooms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        privacy: 'public',
        properties: {
          // Auto-expire the room (unix seconds) so old rooms clean themselves up.
          exp: Math.floor(opts.expiresAt.getTime() / 1000),
          enable_prejoin_ui: true,
          enable_chat: true,
          enable_screenshare: true,
        },
      }),
    });

    if (!res.ok) {
      console.error('[daily] create room failed', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch (err) {
    console.error('[daily] create room error', err);
    return null;
  }
}
