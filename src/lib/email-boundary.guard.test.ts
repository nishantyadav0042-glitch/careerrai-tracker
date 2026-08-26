import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── THE EMAIL BOUNDARY ─────────────────────────────────────────────────────
//
// Push has had a guarded single path since 15 Aug, when fourteen call sites
// were found reaching the transport directly — each throwing away the
// notification row's id, each skipping both volume controls. Email never got
// the same treatment, so it kept the shape push was rescued from: a per-user
// email fired next to a notification row with no shared identity, leaving
// "was this person actually told?" with two different answers and no way to
// reconcile them.
//
// Two kinds of email exist here, and only one is a notification:
//
//   PER-USER EMAIL  — addressed to a student or mentor about their own
//                     situation. This IS a delivery rail for a business
//                     event, so it must ride dispatch()'s email leg, which
//                     stamps emailed_at on the same row the push stamps.
//
//   OPERATIONAL ALERT — sendAdminAlert(), which goes to one fixed internal
//                     inbox. It has no recipient user, no preferences, no
//                     budget and no in-app row. Forcing it through dispatch()
//                     would mean inventing a user to receive it. It is a
//                     separate rail on purpose, and it must never be used to
//                     tell a student or mentor something.
//
// This guard enforces exactly that split.

const SRC = 'src';

/** Per-user email senders. These may only be reached from a dispatch() email leg. */
const PER_USER_SENDERS = [
  'sendDailyReminder',
  'sendBuilderRecovery',
  'sendBuddyWeeklyDigest',
  'sendRedFlagAlert',
];

/**
 * Files allowed to call sendAdminAlert — the operational rail. Each is
 * founder/ops-facing, none tells a student or mentor anything.
 */
const OPERATIONAL_ALERT_CALLERS: Record<string, string> = {
  'src/lib/email.ts': 'defines it',
  'src/lib/push.ts': 'push-death alert to ops when a subscription dies',
  'src/app/api/cron/founder-alerts/route.ts': 'critical-failure escalation to the founder',
  'src/app/api/cron/founder-digest/route.ts': 'daily intelligence digest to the founder',
  'src/app/api/cron/metric-snapshot/route.ts': 'mission-control alerts to ops',
  'src/app/api/cron/push-recovery/route.ts': 'the day\'s WhatsApp-recovery worklist to ops',
  'src/app/api/cron/daily-reminder/route.ts': 'run summary to ops after the student sends',
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = () => tsFiles(SRC).map((f) => [f, stripComments(readFileSync(f, 'utf8'))] as const);

describe('email is a rail of the event, never its own notification system', () => {
  it('every per-user email is sent from inside a dispatch() email leg', () => {
    const violations: string[] = [];
    for (const [file, code] of files()) {
      if (file === 'src/lib/email.ts') continue;
      for (const sender of PER_USER_SENDERS) {
        // Find invocations (not the import line).
        const callRe = new RegExp(`(?<!import[^\\n]*)\\b${sender}\\s*\\(`, 'g');
        let m: RegExpExecArray | null;
        while ((m = callRe.exec(code)) !== null) {
          // Legal shape: `send: () => sendX(...)` inside a dispatch email leg.
          const before = code.slice(Math.max(0, m.index - 120), m.index);
          if (/send:\s*\(\)\s*=>\s*$/.test(before)) continue;
          violations.push(`${file}: ${sender}() called outside a dispatch email leg`);
        }
      }
    }
    expect(
      violations,
      'A per-user email sent outside dispatch() has no event identity: emailed_at is never stamped, the send skips every preference and dedup the event has, and "was this person told?" gets two different answers. Pass it as dispatch({ email: { to, send } }) instead.\n  ' +
        violations.join('\n  '),
    ).toEqual([]);
  });

  it('sendAdminAlert is used only by approved operational callers', () => {
    const callers = files()
      .filter(([, code]) => /\bsendAdminAlert\s*\(/.test(code))
      .map(([f]) => f);
    const unapproved = callers.filter((f) => !(f in OPERATIONAL_ALERT_CALLERS));
    expect(
      unapproved,
      'sendAdminAlert goes to one fixed internal inbox. It is not a way to tell a student or mentor anything — that is a notification and belongs in dispatch(). Add the file to OPERATIONAL_ALERT_CALLERS with a reason only if it is genuinely ops-facing:\n  ' +
        unapproved.join('\n  '),
    ).toEqual([]);
  });

  it('the Resend transport itself has exactly one importer', () => {
    // Same shape as the push boundary: the vendor client lives in one file.
    const importers = files().filter(([, code]) => /from ['"]resend['"]/.test(code)).map(([f]) => f);
    expect(importers).toEqual(['src/lib/email.ts']);
  });

  it('the operational-caller list contains no stale entry', () => {
    const stale = Object.keys(OPERATIONAL_ALERT_CALLERS)
      .filter((f) => f !== 'src/lib/email.ts')
      .filter((f) => {
        try { return !/\bsendAdminAlert\s*\(/.test(stripComments(readFileSync(f, 'utf8'))); }
        catch { return true; }
      });
    expect(stale, `No longer calls sendAdminAlert — remove from the list:\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});
