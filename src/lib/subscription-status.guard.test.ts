import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── The DB and the code must agree on what a subscription can be ────────────
//
// Incident #27 (11 Aug): migration `subscription_free_not_beta` tightened the
// profiles.subscription_status CHECK to disallow 'free_beta' — but the code
// that stopped writing 'free_beta' lived on a branch that never reached main.
// For ~23 hours every new signup's profile write bounced off the constraint,
// and because one branch never read its update error, the failure was silent:
// students kept their sessions and lost their names and phone numbers. The
// Sales screen filled with "New User · no phone" while every screen stayed
// green.
//
// This file is the lock on that door: the statuses the code writes must be
// drawn from the exact set the live constraint allows. If either side moves
// alone again, CI goes red before a student pays for it.

/** The profiles_subscription_status_check allow-list, verbatim from the DB. */
const DB_ALLOWED = ['free', 'active', 'expired', 'paused', 'refund_requested'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('subscription_status stays inside the DB constraint', () => {
  const files = walk('src');

  it('no source file writes a status the constraint rejects', () => {
    // Every `subscription_status: '<value>'` literal in the tree, wherever it
    // is written. Comments are stripped line-by-line so the incident that
    // NAMES the dead value does not trip the guard that buries it.
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n');
      for (const m of src.matchAll(/subscription_status['"]?\s*:\s*'([a-z_]+)'/g)) {
        if (!DB_ALLOWED.includes(m[1])) offenders.push(`${f}: '${m[1]}'`);
      }
    }
    expect(
      offenders,
      `a write uses a subscription_status the DB constraint rejects (allowed: ${DB_ALLOWED.join(', ')}) — this is exactly how every signup silently lost its name and phone on 11 Aug`,
    ).toEqual([]);
  });

  it("the dead value 'free_beta' never returns to executable code", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8')
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n');
      return src.includes("'free_beta'");
    });
    expect(offenders, "'free_beta' was deleted from the DB on 10 Aug — nothing may write or branch on it").toEqual([]);
  });
});
