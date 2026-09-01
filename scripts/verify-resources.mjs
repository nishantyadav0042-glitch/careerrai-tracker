#!/usr/bin/env node
/**
 * Rewrites docs/phase0/VERIFIED-IDS.json from the YouTube Data API.
 *
 * This is the ONLY thing allowed to write that ledger. It exists because the
 * research pipeline had no mechanical barrier between "I could not find a
 * source" and "here is a plausible-looking source": a model asserted a video
 * id, a title and a runtime as three independent strings, and nothing checked
 * any of them against the platform before the link reached a student. Nine
 * videos in round 1 and eleven in round 2 did not exist at all.
 *
 * Usage:  YOUTUBE_API_KEY=... node scripts/verify-resources.mjs
 *
 * The guard test reads the ledger; it never calls the network, so the test
 * suite stays offline and deterministic.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) {
  console.error('YOUTUBE_API_KEY is not set. Create a key in Google Cloud Console,');
  console.error('enable YouTube Data API v3, and restrict the key to that API.');
  process.exit(1);
}

const src = readFileSync('src/lib/topic-resources.ts', 'utf8');
const ids = [...new Set([...src.matchAll(/videoId: '([^']+)'/g)].map((m) => m[1]))].sort();
if (ids.length === 0) {
  console.error('No videoIds found in topic-resources.ts — refusing to write an empty ledger.');
  process.exit(1);
}

// videos.list costs 1 quota unit and accepts 50 ids, so the whole corpus is a
// couple of units against a 10,000/day free allowance.
const toMinutes = (iso) => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) throw new Error(`unparseable duration: ${iso}`);
  const [h, mn, s] = [m[1], m[2], m[3]].map((x) => (x ? Number(x) : 0));
  return Math.round((h * 3600 + mn * 60 + s) / 60);
};

const videos = {};
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50);
  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${batch.join(',')}&key=${KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`API returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const { items } = await res.json();
  for (const it of items) {
    videos[it.id] = {
      minutes: toMinutes(it.contentDetails.duration),
      channel: it.snippet.channelTitle,
      title: it.snippet.title,
    };
  }
}

// An id the API does not return is deleted, private, or was never real. Say so
// loudly rather than writing a ledger that quietly omits it.
const missing = ids.filter((id) => !(id in videos));
if (missing.length) {
  console.error(`\n${missing.length} id(s) do NOT exist on YouTube:`);
  for (const id of missing) console.error(`  ${id}`);
  console.error('\nRemove them from topic-resources.ts before re-running.');
  process.exit(1);
}

writeFileSync(
  'docs/phase0/VERIFIED-IDS.json',
  JSON.stringify(
    {
      _what:
        'Machine-written ledger of what the YouTube Data API returned for every live resource id. Written ONLY by scripts/verify-resources.mjs against the platform, never by hand and never by a model. topic-resources.guard.test.ts refuses to let any id ship that is not in here, and refuses any row whose runtime or channel disagrees with it.',
      _fetched: new Date().toISOString().slice(0, 10),
      _source: 'YouTube Data API v3 videos.list',
      _ids: Object.keys(videos).length,
      videos,
    },
    null,
    1,
  ) + '\n',
);
console.log(`Verified ${Object.keys(videos).length} ids against the platform.`);
