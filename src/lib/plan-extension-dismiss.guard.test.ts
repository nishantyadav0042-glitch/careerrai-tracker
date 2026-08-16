import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The "shown once" banner must actually stay dismissed ────────────────────
//
// Student report, 16 Aug (Nishant, testing his own account): dismissed the
// "your finish date has moved" banner three times; it kept reappearing on
// every reopen. Root cause: the X button only ever set local React state
// (`useState(false)`) — nothing was persisted, so a reload always started
// from `dismissed = false` again. The founder's own intent for this banner
// (6 Aug comment in plan-extended-alert.tsx) was explicitly "shown once,"
// and the implementation never made that durable.
//
// This guard locks in the fix at both ends: the dismiss actually reaches the
// server, and the server actually stops re-selecting a dismissed row.

const COMPONENT = 'src/components/home/plan-extended-alert.tsx';
const DISMISS_ROUTE = 'src/app/api/plan/dismiss-extension/route.ts';
const TRACKER_PAGE = 'src/app/student/tracker/page.tsx';

describe('the plan-extension banner dismiss is persisted, not just local state', () => {
  it('the X button calls the dismiss API, not only setDismissed', () => {
    const s = readFileSync(COMPONENT, 'utf8');
    expect(s).toContain("fetch('/api/plan/dismiss-extension'");
    expect(s).toContain('method: \'POST\'');
    // The extension id must actually be sent — without it the server has
    // nothing to mark.
    expect(s).toMatch(/id:\s*extension\.id/);
  });

  it('the dismiss route writes dismissed_at, scoped to the authenticated student', () => {
    const s = readFileSync(DISMISS_ROUTE, 'utf8');
    expect(s).toContain('getUser()');
    expect(s).toContain('dismissed_at');
    // Scoped by student_id, never a bare id-only update — otherwise one
    // student could dismiss another student's row by guessing a UUID.
    expect(s).toMatch(/\.eq\(\s*['"]student_id['"]\s*,\s*user\.id\s*\)/);
  });

  it('tracker/page.tsx excludes dismissed rows at the query, not just in render', () => {
    const s = readFileSync(TRACKER_PAGE, 'utf8');
    expect(s).toContain("from('plan_extensions')");
    expect(s).toMatch(/\.is\(\s*['"]dismissed_at['"]\s*,\s*null\s*\)/);
  });
});
