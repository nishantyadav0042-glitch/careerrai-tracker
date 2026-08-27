import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── EVENT OS invariant 1, enforced: no direct writers ──────────────────────
//
// docs/OS/EVENT-OS.md: "Nothing but dispatch() may insert into notifications
// or reach a transport." Phase 0 (26 Aug) found 18 files inserting rows
// directly — which is how 24 session events produced 0 pushes: the rows were
// born already invisible to every transport, budget and delivery stamp.
//
// This guard freezes the remaining direct writers as a LEDGER. The ledger may
// only SHRINK: converting a writer removes its entry; adding a new direct
// writer anywhere fails the build with the invariant quoted at you. When the
// ledger reaches empty, Phase 0 is done and this list becomes ceremony.
//
// Matching strips comments first — five separate incidents in this repo were
// guards fired or fooled by prose (see log-tour/retry-unlock history).

const SRC = 'src';

/** Every file allowed to write the notifications table directly, and why.
 *  Batch 2 (26 Aug) emptied this of real notification writers: ten were
 *  converted to dispatch(); the two that remain do not create notifications
 *  at all — they write internal, already-read LEDGER rows whose only purpose
 *  is cross-run deduplication. Forcing those through dispatch() would invent
 *  a notification where the product has none, purely to make a list reach
 *  zero. They are exempt BY BEHAVIOUR, and the exemption is enforced below:
 *  they may only ever write channel:'internal'. */
const DIRECT_WRITER_LEDGER: Record<string, string> = {
  'src/lib/notification-os.ts': 'THE authority — the one permanent entry.',
  'src/lib/push.ts': 'transport-internal bookkeeping row for the e2e push test path',
  'src/app/api/cron/founder-alerts/route.ts':
    "EXEMPT: writes channel:'internal', read:true marker rows keyed on the alert id, so the next run does not re-page the same failure. The alert itself goes by email (sendAdminAlert). Not a notification.",
  'src/app/api/cron/push-recovery/route.ts':
    "EXEMPT: writes channel:'internal', read:true marker rows so tomorrow's digest does not re-list the same student. The digest itself goes by email (sendAdminAlert). Not a notification.",
};

/** The two exempt files may write ONLY internal ledger rows. If either ever
 *  writes a row a human is meant to read, the exemption is void and the
 *  build fails — the exemption is behavioural, not a permanent licence. */
const INTERNAL_ONLY_WRITERS = [
  'src/app/api/cron/founder-alerts/route.ts',
  'src/app/api/cron/push-recovery/route.ts',
];

/** Every writer converted to dispatch(). None may reappear in the ledger — a
 *  regression recreates the exact P0 the audit found (events invisible to
 *  every transport, budget and delivery stamp). */
const CONVERTED_BATCH_1 = [
  'src/app/api/calendar/schedule-meeting/route.ts',
  'src/app/api/calendar/cancel-meeting/route.ts',
  'src/app/api/calendar/reschedule-meeting/route.ts',
  'src/app/api/calendar/complete-orientation/route.ts',
  'src/app/api/sessions/request/route.ts',
];

const CONVERTED_BATCH_2 = [
  'src/lib/premium.ts',
  'src/app/api/buddy/commitment/route.ts',
  'src/app/api/payments/request-refund/route.ts',
  'src/app/api/cron/expire-subscriptions/route.ts',
  'src/app/api/cron/renewal-reminders/route.ts',
  'src/app/api/cron/check-red-flags/route.ts',
  'src/app/api/cron/weekly-digest/route.ts',
  'src/app/api/logging/log-daily/route.ts',
  'src/app/api/admin/broadcast/route.ts',
  'src/app/api/admin/streak-restore-broadcast/route.ts',
];

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

// A direct write is .from('notifications') followed by .insert on the same
// chain. Cross-line chains are the norm, so match across whitespace, within
// a short window so an unrelated later insert doesn't false-positive.
const DIRECT_WRITE = /\.from\(\s*['"`]notifications['"`]\s*\)[\s\S]{0,200}?\.insert\s*\(/;

describe('Event OS invariant 1 — no direct notification writers', () => {
  const offenders = tsFiles(SRC).filter((f) => DIRECT_WRITE.test(stripComments(readFileSync(f, 'utf8'))));

  it('every direct writer is on the ledger — new ones are forbidden', () => {
    const unlisted = offenders.filter((f) => !(f in DIRECT_WRITER_LEDGER));
    expect(unlisted, `Direct notifications insert outside the ledger. EVENT-OS.md invariant 1: only dispatch() may create notification rows. Route these through dispatch():\n  ${unlisted.join('\n  ')}`).toEqual([]);
  });

  it('the converted routes stay converted', () => {
    const regressed = [...CONVERTED_BATCH_1, ...CONVERTED_BATCH_2].filter((f) => offenders.includes(f));
    expect(regressed, 'A converted writer regressed to a direct insert — this recreates "events invisible to every transport".').toEqual([]);
  });

  it("the exempt writers may only ever write internal ledger rows", () => {
    for (const f of INTERNAL_ONLY_WRITERS) {
      const code = stripComments(readFileSync(f, 'utf8'));
      // Every insert in these files must carry channel: 'internal'. If one
      // ever writes a row meant for a human, it is a notification and belongs
      // in dispatch() — the exemption does not stretch to cover it.
      const inserts = code.match(/\.insert\([\s\S]{0,600}?\)\s*[;,)]/g) ?? [];
      for (const ins of inserts) {
        if (!/notifications/.test(code)) continue;
        expect(
          /channel:\s*['"`]internal['"`]/.test(ins),
          `${f} writes a notifications row that is not channel:'internal'. The dedup-ledger exemption covers internal rows only — a row a human reads must go through dispatch().`,
        ).toBe(true);
      }
    }
  });

  it('the ledger never lists a file that no longer needs it (shrink discipline)', () => {
    const stale = Object.keys(DIRECT_WRITER_LEDGER)
      .filter((f) => f !== 'src/lib/notification-os.ts')
      .filter((f) => {
        try { return !DIRECT_WRITE.test(stripComments(readFileSync(f, 'utf8'))); }
        catch { return true; } // deleted file = stale entry
      });
    expect(stale, `Converted or deleted, but still on the ledger — remove:\n  ${stale.join('\n  ')}`).toEqual([]);
  });

  it('every converted route actually calls dispatch()', () => {
    for (const f of [...CONVERTED_BATCH_1, ...CONVERTED_BATCH_2]) {
      const code = stripComments(readFileSync(f, 'utf8'));
      expect(code.includes('dispatch('), `${f} no longer calls dispatch() — its event has gone silent.`).toBe(true);
    }
  });
});

// ── The channel policy must never become a QUIET second authority ──────────
//
// event-policy.ts is the executable form of EVENT-OS.md's channel rules. It is
// fully written and fully tested, and as of 27 Aug NOTHING IN THE APP CALLS
// IT: dispatch() still takes its channels from whatever each caller passes in
// `prefs`. That is a shadow authority — two places that answer "which channels
// does this event use?", one of them live and one of them merely correct.
//
// It is not dead code kept "just in case": it is the pure core of Event OS
// Batch 2, which the founder explicitly gated on a clean production
// observation window that is still open (task #61). But an unwired module with
// no marker reads to the next person like something already in force.
//
// The gap is real and is NOT a mechanical substitution. EVENT_POLICY declares
// 26 event types; the codebase dispatches far more, and many are not in the
// table at all. Wiring chooseChannels() into dispatch() therefore changes what
// every one of those events does, for 876 students, and needs its own cycle
// with its own observation window — not a closing edit on a large branch.
//
// So this guard holds the honest middle: the module may be unwired, but it may
// not be unwired SILENTLY, and the moment anything other than its own test
// imports it, that consumer must be the dispatch boundary.

describe('event-policy is either wired to dispatch or visibly not wired', () => {
  const POLICY = 'src/lib/event-policy.ts';
  const BOUNDARY = 'src/lib/notification-os.ts';

  /** Every non-test file that imports the policy. */
  function consumers(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        if (p === POLICY) continue;
        if (/from ['"][^'"]*event-policy['"]/.test(readFileSync(p, 'utf8'))) out.push(p);
      }
    };
    walk('src');
    return out;
  }

  it('if anything consumes the policy, it is the dispatch boundary', () => {
    const bad = consumers().filter((f) => f !== BOUNDARY);
    expect(
      bad,
      'Only notification-os.ts may consume the channel policy. Any other consumer makes a second place that decides channels, and the two will disagree the first time one is edited:\n  ' +
        bad.join('\n  '),
    ).toEqual([]);
  });

  it('while it is unwired, it stays PURE — no client, no transport, no writes', () => {
    // An unwired module that can reach the database is one import away from
    // becoming a second sender rather than a second opinion.
    const code = stripComments(readFileSync(POLICY, 'utf8'));
    expect(code).not.toMatch(/supabase|createAdminClient|from ['"].*\/push['"]|from ['"].*\/email['"]/);
    expect(code).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
  });

  it('the file does not still claim to be unwired', () => {
    // It carried a NOT YET WIRED marker until dispatch() consumed it. A marker
    // that outlives its condition is worse than no marker: it tells the next
    // reader the live channel authority is inert.
    const raw = readFileSync(POLICY, 'utf8');
    const wired = consumers().includes(BOUNDARY);
    expect(wired, 'event-policy is no longer consumed by dispatch — the channel decision has moved somewhere else').toBe(true);
    expect(raw).not.toMatch(/NOT YET WIRED/);
  });
});

// ── The browser may read its notifications and mark them read. Nothing else ──
//
// 20260827b revokes INSERT / DELETE / TRUNCATE from anon and authenticated and
// narrows UPDATE to the single `read` column, because until then any signed-in
// student could — with the public anon key, from a browser console — insert
// notification rows dispatch() never created, rewrite send_status and
// pushed_at on their own rows, or delete the record entirely. None of it
// crosses users; all of it corrupts the table this PR just promoted to the
// delivery authority.
//
// That migration and this guard have to agree. If client code ever starts
// writing another column, the grant will refuse it at runtime — as a silent
// failure in a browser, which is the worst place to discover it. So the rule
// is checked here, at build time, in the direction that fails first.

describe('client-side notification writes stay inside what the grant allows', () => {
  /** Files that talk to Supabase WITHOUT the admin (service_role) client. */
  function clientSideFiles(): Array<readonly [string, string]> {
    const out: Array<readonly [string, string]> = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        const code = stripComments(readFileSync(p, 'utf8'));
        if (!code.includes("from('notifications')")) continue;
        if (code.includes('createAdminClient')) continue; // service_role: unrestricted, by design
        out.push([p, code] as const);
      }
    };
    walk('src');
    return out;
  }

  /** The one column the grant makes writable from a browser. */
  const WRITABLE = ['read'];

  it('finds the client surfaces (the guard is a guard)', () => {
    expect(clientSideFiles().length).toBeGreaterThan(0);
  });

  it('no client-side INSERT or DELETE of a notification', () => {
    const bad: string[] = [];
    for (const [file, code] of clientSideFiles()) {
      for (const m of code.matchAll(/from\('notifications'\)([\s\S]{0,200})/g)) {
        if (/\.(insert|delete|upsert)\s*\(/.test(m[1])) bad.push(file);
      }
    }
    expect(
      [...new Set(bad)],
      'Only dispatch() creates a notification and nothing deletes one. The grant refuses both — this would fail silently in the browser:\n  ' +
        [...new Set(bad)].join('\n  '),
    ).toEqual([]);
  });

  it('client-side UPDATE touches only the granted column', () => {
    const bad: string[] = [];
    for (const [file, code] of clientSideFiles()) {
      for (const m of code.matchAll(/from\('notifications'\)[\s\S]{0,120}?\.update\(\s*\{([^}]*)\}/g)) {
        const cols = [...m[1].matchAll(/([a-z_]+)\s*:/g)].map((c) => c[1]);
        const illegal = cols.filter((c) => !WRITABLE.includes(c));
        if (illegal.length) bad.push(`${file}: ${illegal.join(', ')}`);
      }
    }
    expect(
      bad,
      'A browser may set `read` and nothing else. Delivery stamps (send_status, pushed_at, emailed_at, clicked_at) are service_role-only so the answer to "did we deliver this?" cannot be authored by its recipient:\n  ' +
        bad.join('\n  '),
    ).toEqual([]);
  });

  it('the migration that backs this rule is present and says why', () => {
    const files = readdirSync('supabase/migrations');
    const mig = files.find((f) => f.includes('notifications_are_server_written'));
    expect(mig, 'the grant migration is missing — this guard would be enforcing a rule the database does not').toBeTruthy();
    const sql = readFileSync(join('supabase/migrations', mig!), 'utf8');
    expect(sql).toMatch(/revoke all privileges on public\.notifications from anon, authenticated/);
    expect(sql).toMatch(/grant update \(read\) on public\.notifications to authenticated/);
    // The delivery columns must NOT be handed back.
    expect(sql).not.toMatch(/grant update \([^)]*send_status/);
    expect(sql).not.toMatch(/grant update \([^)]*pushed_at/);
  });
});
