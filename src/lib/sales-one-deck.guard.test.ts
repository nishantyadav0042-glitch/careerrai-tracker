/**
 * ── Zero mixup between reps (founder, 16 Sep 2026) ─────────────────────────
 *
 * 86 students were dealt to BOTH reps on the same IST day in early September
 * — 34 on the 2nd, 39 on the 5th. None was worked by both, so no student was
 * called twice, but each took a slot in two seventy-card days.
 *
 * Cause: `canAccessLead` answers TRUE for an unclaimed lead by design (the
 * SA-1D shared book), which is right for AUTHORIZATION and wrong for DEALING.
 * It stopped on 7 Sep because intake now assigns everyone it can and the 75
 * students still unowned are almost all unreachable (72 have no phone). The
 * hole did not close — the thing falling through it ran out.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QUEUE = join(__dirname, 'call-queue.ts');
const code = () =>
  readFileSync(QUEUE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the deck deals an unclaimed student to one rep, not every rep', () => {
  it('narrows the unclaimed case after the authorization gate', () => {
    const s = code();
    expect(s).toContain('dealsUnclaimedTo');
    const gate = s.indexOf('canAccessLead(ownership');
    expect(gate, 'the authorization gate must still exist').toBeGreaterThan(-1);
    // The CALL SITE, not the import at the top of the file.
    const narrow = s.indexOf('!dealsUnclaimedTo(', gate);
    expect(narrow, 'narrowing belongs AFTER authorization, never instead of it')
      .toBeGreaterThan(gate);
  });

  it('narrows ONLY the unclaimed case — an owned lead is already answered', () => {
    expect(code()).toMatch(/ownership\.kind === 'unclaimed'/);
  });

  it('never narrows an admin, who is looking at everybody’s book', () => {
    expect(code()).toMatch(/viewer\?\.role === 'sales'/);
  });

  it('reads the ACTIVE seats, so a deactivated rep is dealt nothing', () => {
    const s = code();
    expect(s).toMatch(/from\('sales_rep_config'\)[\s\S]{0,80}\.eq\('active', true\)/);
  });

  it('a failed seat read deals unclaimed students to NOBODY, not to everybody', () => {
    // The safer direction: an unowned student is already a data-quality
    // exception with a founder alert behind it, not a card to duplicate.
    // `?? []` on the read is what makes the narrow reject every viewer.
    const s = code();
    expect(s).toMatch(/seatRows \?\? \[\]/);
    expect(s).toMatch(/const activeSeatIds = seatCfg\.map/);
  });
});

describe('authorization itself is untouched', () => {
  it('the shared book still lets a rep CLAIM an unclaimed student', () => {
    // The narrow is about what the deck DEALS. If canAccessLead stopped
    // answering yes for unclaimed, a rep who opened that student could no
    // longer pick them up, and an unowned student would be unreachable —
    // which is the failure the shared book exists to prevent.
    const authz = readFileSync(join(__dirname, 'sales-authz.ts'), 'utf8');
    const fn = authz.slice(authz.indexOf('export function canAccessLead'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/case 'unclaimed':\s*\n?\s*return true;/);
  });

  it('an unresolvable owner is still refused, never treated as unclaimed', () => {
    const authz = readFileSync(join(__dirname, 'sales-authz.ts'), 'utf8');
    const fn = authz.slice(authz.indexOf('export function canAccessLead'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/case 'unresolvable':/);
    expect(body).toMatch(/return false;/);
  });
});
