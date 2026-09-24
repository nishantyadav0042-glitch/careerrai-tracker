import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── A thin ballot must never be silent again ────────────────────────────────
//
// 12 Aug 2026: 12 students opened Daily Pick, 0 voted. The pool was healthy
// and the route was healthy (confirmed live and by SQL) — but there was no
// way to tell "this student got nothing to vote on" from "they chose not to"
// without an hour of after-the-fact SQL archaeology, because the route never
// said anything either way.
//
// Same shape as the meta-capi fix earlier this session: a path that can go
// quiet must announce itself, so the next thin day is a log line, not an
// investigation.

// MOVED 21 Aug: the ballot route was retired in the Daily Pick consolidation
// (it was a second selection authority over the same pool). The IDEA is
// unchanged and now lives where the one surface is assembled.
describe('the community surface announces an empty state instead of staying silent', () => {
  it('logs when an authenticated student is handed nothing at all', () => {
    const route = readFileSync('src/app/api/community/insights/route.ts', 'utf8');
    expect(route).toContain('EMPTY surface');
    // Must fire on the ACTUAL empty case. The question half of this condition
    // went with the question kind (31 Aug), and the feed half went with the
    // feed (24 Sep: one hint a day, nothing else sent). The hint of the day is
    // now the whole surface, so its absence alone is "handed nothing". A
    // surviving `&& feed.length === 0` would be a clause that can never be
    // false, which is how a guard quietly stops guarding.
    expect(route).toMatch(/if \(!pickTip\) \{/);
    expect(route).not.toMatch(/feed\.length === 0/);
  });

  it('the log carries enough to diagnose without a database query', () => {
    const route = readFileSync('src/app/api/community/insights/route.ts', 'utf8');
    expect(route).toContain('student=${user.id}');
    // The day is what joins the log line to the promoter's stamp. The live
    // pool size went with the feed read; runway is the Daily Pick watch's job.
    expect(route).toContain('day=${day}');
  });
});
