import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── THE ONE SEND BOUNDARY, ENFORCED ─────────────────────────────────────────
//
// 15 Aug: fourteen call sites sent a real push directly through push.ts's
// transport, each throwing away the notification row's id before calling it.
// Not four, not eight — the first pass found the obvious ones; a second,
// wider sweep found a SECOND competing abstraction (lib/notifications.ts,
// now deleted) with five more callers behind it, including the buddy chat
// reply and the weekly pace-reconcile push (32/day on its own). Every one of
// them also skipped the "no student gets more than 10 pushes a day, at any
// cost" ceiling, because that ceiling lived inside the transport itself and
// none of them called the transport through the door that checked it.
//
// The fix was not fourteen patches. It was making the transport's notifId
// parameter REQUIRED (a compile error catches any future caller who forgets
// it) and making every one of those fourteen route through
// notification-os.dispatch() instead — the one function that creates the
// row, sends with the row's own id, stamps pushed_at, and enforces the hard
// ceiling, all in one place.
//
// This file is the second half of "architecturally impossible": the type
// system stops a caller who forgets notifId, but nothing stops a caller who
// imports push.ts directly and supplies one by hand, rebuilding the bypass
// one field at a time. A source scan closes that: the transport's export may
// be imported by exactly one file, forever.

const LIB = 'src/lib';
const APP = 'src/app';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const SOURCES = [...walk(LIB), ...walk(APP)];
const TRANSPORT = 'src/lib/push.ts';
const ALLOWED_IMPORTER = 'src/lib/notification-os.ts';

describe('the push transport has exactly one importer', () => {
  it('only notification-os.ts imports from lib/push', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      if (file === TRANSPORT || file === ALLOWED_IMPORTER) continue;
      const src = readFileSync(file, 'utf8');
      if (/from ['"]@\/lib\/push['"]/.test(src)) offenders.push(file);
    }
    expect(offenders, `these files import the transport directly, bypassing dispatch():\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('no file outside the two allowed calls sendPushToUser(', () => {
    // Belt and suspenders on the import check above — catches a re-export
    // laundering the same function under a different name.
    const offenders: string[] = [];
    for (const file of SOURCES) {
      if (file === TRANSPORT || file === ALLOWED_IMPORTER) continue;
      const src = readFileSync(file, 'utf8');
      if (/\bsendPushToUser\(/.test(src)) offenders.push(file);
    }
    expect(offenders, `these files call sendPushToUser directly:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the second competing abstraction is gone, not just unused', () => {
    // lib/notifications.ts used to be a second "insert + maybe push"
    // implementation, entirely separate from dispatch(), with its own five
    // callers and the identical missing-notifId defect. Deleted rather than
    // fixed in place — a fixed second path is still a second path, and this
    // repo has paid for "two implementations of one question" enough times
    // this session alone to know it grows back if merely disarmed.
    expect(() => statSync('src/lib/notifications.ts')).toThrow();
  });
});

describe('the transport cannot be called without a notification id', () => {
  it('notifId is a required field in the transport payload type, not optional', () => {
    const src = readFileSync(TRANSPORT, 'utf8');
    expect(src).toContain('notifId: string');
    expect(src).not.toContain('notifId?: string');
  });
});

describe('the hard ceiling lives at the one place every send passes through', () => {
  it('push.ts no longer contains its own daily-cap check', () => {
    // It moved to dispatch() specifically because a check reachable only by
    // calling the transport is not a ceiling once fourteen callers proved
    // they could reach the push service without calling it.
    const src = readFileSync(TRANSPORT, 'utf8');
    expect(src).not.toMatch(/pushedToday[\s\S]*>=\s*10/);
  });

  it('dispatch() enforces it, keyed on pushed_at, not on notification count', () => {
    const src = readFileSync('src/lib/notification-os.ts', 'utf8');
    expect(src).toContain("not('pushed_at', 'is', null)");
    expect(src).toMatch(/pushedToday[\s\S]*>=\s*10/);
  });

  it('the ceiling applies before EVERY push attempt, regardless of type', () => {
    // Not gated behind STUDENT_BUDGET_TYPES.includes(...) — that gate is the
    // separate, OPT-IN soft budget. The hard ceiling must run unconditionally
    // whenever prefs.push is true, or the same bypass returns for any type
    // not on that list (which is most of them, by design — see that
    // constant's own comment on transactional rows).
    const src = readFileSync('src/lib/notification-os.ts', 'utf8');
    const dispatchBody = src.slice(src.indexOf('export async function dispatch'));
    const capBlock = dispatchBody.slice(dispatchBody.indexOf('pushedToday'));
    expect(capBlock.slice(0, 200)).not.toContain('STUDENT_BUDGET_TYPES.includes');
  });
});
