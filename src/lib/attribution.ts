// ── Where a lead actually came from ─────────────────────────────────────────
//
// The `cr_attr` cookie has been capturing utm_*/gclid/fbclid on landing for a
// while (meta-pixel.tsx). Nothing ever read it server-side, so every student
// row carried `signup_source = 'self_serve'` and nothing else — which answers
// "how was the account created", never "which ad paid for this person".
// GROWTH-OS §5 lists this exact gap under Planned: "cr_attr is captured but
// not yet read server-side at signup". This module closes it.
//
// ── Why the channels are named the way they are ─────────────────────────────
//
// The single most expensive mistake available here is treating `fbclid` as
// proof of a paid Meta click. It is not. Facebook and Instagram append fbclid
// to ANY outbound link — an organic post, a bio link, a DM, someone sharing
// the app in a group. Counting those as ad conversions would inflate Meta's
// apparent performance with traffic Meta was never paid for, and the founder
// would then move budget toward a channel that didn't earn it.
//
// `gclid` has no such ambiguity: Google mints it only on an ad click.
//
// So the channels split on what we can actually prove:
//
//   google_ads   — gclid present, or utm says google + a paid medium. Certain.
//   meta_ads     — utm says facebook/instagram AND a paid medium. Certain.
//   meta_link    — fbclid only, no paid utm. A Meta click we CANNOT prove was
//                  an ad. Reported separately and never folded into meta_ads.
//   campaign     — some other tagged campaign; the raw source is kept.
//   organic      — a search engine referred us with no paid markers.
//   direct       — no attribution at all. Typed the URL, or the cookie was
//                  never set (see the capture-health readout in admin).
//
// Fixing the ambiguity is a tagging job, not a code job: put utm_medium=cpc on
// the Meta ad URLs and those clicks land in meta_ads instead of meta_link.

export const AD_CHANNELS = [
  'google_ads',
  'meta_ads',
  'meta_link',
  'campaign',
  'organic',
  'direct',
] as const;

export type AdChannel = (typeof AD_CHANNELS)[number];

export const CHANNEL_LABEL: Record<AdChannel, string> = {
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads',
  meta_link: 'Meta link (unconfirmed)',
  campaign: 'Other campaign',
  organic: 'Organic search',
  direct: 'Direct / untagged',
};

export interface AdAttribution {
  channel: AdChannel;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  clickId: string | null;
}

export const NO_ATTRIBUTION: AdAttribution = {
  channel: 'direct',
  source: null,
  medium: null,
  campaign: null,
  clickId: null,
};

/** Mediums that mean somebody paid for the click. */
const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'paid', 'paidsocial', 'paid_social', 'cpm', 'display', 'ads']);

const GOOGLE_SOURCES = new Set(['google', 'googleads', 'google_ads', 'adwords', 'gads', 'youtube']);
const META_SOURCES = new Set(['facebook', 'fb', 'instagram', 'ig', 'meta', 'messenger']);
const SEARCH_SOURCES = new Set(['google', 'bing', 'duckduckgo', 'yahoo', 'ecosia', 'brave']);

/**
 * For utm tags: lowercased, so `Google` and `google` don't split one campaign
 * into two rows in the admin breakdown.
 */
function norm(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return t.length ? t.slice(0, 200) : null;
}

/**
 * For click ids: case PRESERVED.
 *
 * gclid and fbclid are opaque, case-sensitive tokens. Lowercasing one destroys
 * it — and the damage is invisible until the day these are uploaded back to
 * Google as offline conversions to prove which clicks actually paid off, at
 * which point every stored id is silently unmatchable. Trim and bound only.
 */
function normId(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t.slice(0, 200) : null;
}

function isPaid(medium: string | null): boolean {
  return medium != null && PAID_MEDIUMS.has(medium.replace(/[\s-]/g, '_'));
}

/**
 * Read the `cr_attr` cookie value into a flat param bag.
 *
 * Deliberately total: a malformed, truncated, or hand-edited cookie returns
 * null rather than throwing. This runs inside the signup path, and no
 * attribution problem may ever cost a student their account — the signup must
 * survive anything this function is handed.
 */
export function parseAttrCookie(raw: string | null | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    // The cookie is written encodeURIComponent(JSON.stringify(...)). Some
    // clients hand it back already decoded, so try as-is if decoding fails.
    let text = raw;
    try {
      text = decodeURIComponent(raw);
    } catch {
      /* already decoded, or contains a stray % — use the raw value */
    }
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length) out[k] = v.slice(0, 200);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Decide the channel from captured params.
 *
 * Order is the whole design: a click id is checked before utm tags, because a
 * click id is minted by the ad platform itself and a utm tag is typed by a
 * human who can typo it.
 */
export function classifyAttribution(params: Record<string, string> | null): AdAttribution {
  if (!params) return NO_ATTRIBUTION;

  const source = norm(params.utm_source);
  const medium = norm(params.utm_medium);
  const campaign = norm(params.utm_campaign);
  const gclid = normId(params.gclid);
  const fbclid = normId(params.fbclid);

  const base = { source, medium, campaign };

  // gclid is unambiguous — Google only sets it on an ad click. It also beats a
  // conflicting utm_source, because the tag can be mistyped and the click id
  // cannot. Checked before fbclid: a URL carrying both was reached through the
  // Google ad and then shared, and the paid click is the one we're accounting.
  if (gclid) return { ...base, channel: 'google_ads', clickId: gclid };

  if (source && GOOGLE_SOURCES.has(source) && isPaid(medium)) {
    return { ...base, channel: 'google_ads', clickId: null };
  }

  if (source && META_SOURCES.has(source) && isPaid(medium)) {
    return { ...base, channel: 'meta_ads', clickId: fbclid };
  }

  // fbclid with no paid utm: a real Meta click, but it could equally be an
  // organic post or a share. Kept separate rather than credited to ad spend.
  if (fbclid) return { ...base, channel: 'meta_link', clickId: fbclid };

  // A tagged campaign we don't recognise — keep it, don't guess at it.
  if (source && (medium || campaign || !SEARCH_SOURCES.has(source))) {
    return { ...base, channel: 'campaign', clickId: null };
  }

  if (source && SEARCH_SOURCES.has(source)) {
    return { ...base, channel: 'organic', clickId: null };
  }

  return NO_ATTRIBUTION;
}

/** Cookie → the columns stamped onto the student row at signup. */
export function attributionFromCookie(raw: string | null | undefined): AdAttribution {
  return classifyAttribution(parseAttrCookie(raw));
}

/**
 * True when this attribution carries a real acquisition signal.
 *
 * Used by the capture-health readout: a run of signups where this is false for
 * everyone means the cookie is not reaching the server, not that every student
 * arrived by typing the URL.
 */
export function hasSignal(a: Pick<AdAttribution, 'channel'>): boolean {
  return a.channel !== 'direct';
}
