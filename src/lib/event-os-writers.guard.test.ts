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

/** Every file still allowed to insert into notifications directly, with the
 *  reason it has not been converted yet. Batch 2 of Phase 0 burns this down. */
const DIRECT_WRITER_LEDGER: Record<string, string> = {
  'src/lib/notification-os.ts': 'THE authority — the one permanent entry.',
  'src/lib/push.ts': 'transport-internal bookkeeping row for the e2e push test path',
  'src/lib/premium.ts': 'batch 2 — premium activation notice',
  'src/app/api/admin/broadcast/route.ts': 'batch 2 — admin bulk insert; needs a bulk-aware dispatch path',
  'src/app/api/admin/streak-restore-broadcast/route.ts': 'batch 2 — admin bulk insert',
  'src/app/api/buddy/commitment/route.ts': 'batch 2 — commitment notice',
  'src/app/api/cron/check-red-flags/route.ts': 'batch 2 — admin-facing alert rows',
  'src/app/api/cron/expire-subscriptions/route.ts': 'batch 2 — expiry notice',
  'src/app/api/cron/founder-alerts/route.ts': 'batch 2 — founder-facing alert rows',
  'src/app/api/cron/push-recovery/route.ts': 'batch 2 — recovery bookkeeping rows',
  'src/app/api/cron/renewal-reminders/route.ts': 'batch 2 — renewal notice',
  'src/app/api/cron/weekly-digest/route.ts': 'batch 2 — buddy digest in-app rows',
  'src/app/api/logging/log-daily/route.ts': 'batch 2 — four achievement rows on log submit',
  'src/app/api/payments/request-refund/route.ts': 'batch 2 — refund acknowledgement',
};

/** The five session-lifecycle writers converted in batch 1. They must NEVER
 *  reappear in the ledger — a regression here recreates the exact P0 the
 *  audit found (session events invisible to every transport). */
const CONVERTED_BATCH_1 = [
  'src/app/api/calendar/schedule-meeting/route.ts',
  'src/app/api/calendar/cancel-meeting/route.ts',
  'src/app/api/calendar/reschedule-meeting/route.ts',
  'src/app/api/calendar/complete-orientation/route.ts',
  'src/app/api/sessions/request/route.ts',
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

  it('the converted session-lifecycle routes stay converted', () => {
    const regressed = CONVERTED_BATCH_1.filter((f) => offenders.includes(f));
    expect(regressed, 'A batch-1 conversion regressed to a direct insert — this recreates "24 session events, 0 pushes".').toEqual([]);
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

  it('the five batch-1 routes actually call dispatch()', () => {
    for (const f of CONVERTED_BATCH_1) {
      const code = stripComments(readFileSync(f, 'utf8'));
      expect(code.includes('dispatch('), `${f} no longer calls dispatch() — its lifecycle event has gone silent.`).toBe(true);
    }
  });
});
