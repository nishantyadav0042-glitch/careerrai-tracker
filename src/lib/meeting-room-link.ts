// Validating a meeting room link a mentor pastes in themselves.
//
// This exists because making booking depend on Google OAuth was a mistake.
// Google's verification wall — "this app is being tested and can only be
// accessed by developer-approved testers" — is an external dependency that can
// block every mentor at once, for days, with nothing we can ship to fix it.
//
// The product need was never the Calendar API. It was a STABLE LINK, the same
// one every time, that a student's saved copy never outgrows. A mentor pasting
// their personal Meet room satisfies that completely. Google is now a
// convenience that makes the link for you, not a gate you must pass.
//
// Deliberately permissive about WHICH provider: a mentor with a Zoom room they
// have used for years should not be told to go and make a Google one.

export type RoomProvider = 'meet' | 'zoom' | 'teams' | 'other';

export interface RoomLink {
  url: string;
  provider: RoomProvider;
}

export type RoomLinkResult = { ok: true; room: RoomLink } | { ok: false; error: string };

const PROVIDERS: { provider: RoomProvider; hosts: string[]; label: string }[] = [
  { provider: 'meet', hosts: ['meet.google.com'], label: 'Google Meet' },
  { provider: 'zoom', hosts: ['zoom.us'], label: 'Zoom' },
  { provider: 'teams', hosts: ['teams.microsoft.com', 'teams.live.com'], label: 'Microsoft Teams' },
];

/** meet.google.com/new makes a room that dies immediately — a classic trap. */
const MEET_DISPOSABLE_PATHS = ['/new', '/new/'];

export function validateRoomLink(raw: string): RoomLinkResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, error: 'Paste your meeting link first.' };

  let parsed: URL;
  try {
    // Accept a pasted link with no scheme — people copy "meet.google.com/abc".
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: "That doesn't look like a link. Paste the full meeting URL." };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'The link must start with https://' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  // Normalise BEFORE validating, not after. A link copied from an address bar
  // often carries a trailing slash, and checking the raw path rejected it as
  // malformed — a confusing failure for a perfectly good room.
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  const match = PROVIDERS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  const provider: RoomProvider = match?.provider ?? 'other';

  if (provider === 'meet') {
    if (MEET_DISPOSABLE_PATHS.includes(parsed.pathname) || path === '/new') {
      return {
        ok: false,
        error: 'meet.google.com/new creates a brand-new room each time. Open it, then copy the link from the address bar — it looks like meet.google.com/abc-defg-hij.',
      };
    }
    // A real Meet code is xxx-xxxx-xxx.
    if (!/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(path)) {
      return {
        ok: false,
        error: 'That Meet link looks incomplete. It should look like meet.google.com/abc-defg-hij.',
      };
    }
  }

  if (provider === 'other') {
    return {
      ok: false,
      error: 'Use a Google Meet, Zoom or Teams link so students can join from any device.',
    };
  }

  // Strip query and hash: tracking junk and one-time passcodes do not belong in
  // a permanent room, and a stale one would break the link months from now.
  const clean = `https://${host}${path === '/' ? '' : path}`;
  return { ok: true, room: { url: clean, provider } };
}

export function providerLabel(provider: RoomProvider): string {
  return PROVIDERS.find((p) => p.provider === provider)?.label ?? 'Meeting room';
}
