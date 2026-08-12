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

describe('the voting route announces an empty ballot instead of staying silent', () => {
  it('logs when an authenticated student is handed nothing to vote on', () => {
    const route = readFileSync('src/app/api/community/voting/route.ts', 'utf8');
    expect(route).toContain('EMPTY ballot');
    // Must fire on the actual empty case: no tip AND no questions.
    expect(route).toMatch(/!tip && questions\.length === 0/);
  });

  it('the log carries enough to diagnose without a database query', () => {
    const route = readFileSync('src/app/api/community/voting/route.ts', 'utf8');
    expect(route).toContain('student=${user.id}');
    expect(route).toContain('eligiblePool=${eligible.length}');
  });
});
