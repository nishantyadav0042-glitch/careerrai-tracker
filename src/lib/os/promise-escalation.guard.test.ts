/**
 * ── A promise past a week gets a name, not a bigger number ─────────────────
 *
 * Founder, 15 Sep 2026: *"ek escalation lagao — 7 din se zyada overdue ho to
 * wo alag dikhe aur founder digest mein naam ke saath aaye, PAR DECK SE HATE
 * NA."*
 *
 * The last clause is the one this file exists to hold shut. Every obvious
 * "fix" for promise debt — a ceiling, an expiry, an auto-cancel — resolves a
 * commitment made to a student for our own convenience, and the student is
 * the one person in the transaction who did nothing wrong. Neelam had ten
 * promises older than a week and every card read "Callback due 4:30 PM", so a
 * student waiting since 7 Sep looked exactly like one who asked this morning.
 * Escalation fixes the LOOKING, never the queueing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readPromiseDebt, stalePromiseLine, promiseDebtReason, promiseDebtException,
  PROMISE_STALE_DAYS, STALE_NAMES_SHOWN,
} from './promise-debt';

const NOW = Date.parse('2026-09-15T12:00:00+05:30');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const reading = (rows: { d: number; name?: string | null }[]) => readPromiseDebt({
  repId: 'r1', repName: 'Neelam Singh', nowMs: NOW,
  rows: rows.map((r, i) => ({
    callbackAt: daysAgo(r.d), studentId: `s${i}`, studentName: r.name === undefined ? `Student${i}` : r.name,
  })),
});

describe('the escalation names people', () => {
  it('counts a promise stale only past the threshold', () => {
    const r = reading([{ d: 9 }, { d: 8 }, { d: 4 }, { d: 1 }]);
    expect(PROMISE_STALE_DAYS).toBe(7);
    expect(r.overdue).toBe(4);
    expect(r.stuck, 'stuck is the older, looser threshold').toBe(3);
    expect(r.stale.map((s) => s.daysOverdue)).toEqual([9, 8]);
  });

  it('puts the longest wait first — that student is why this exists', () => {
    const r = reading([{ d: 8 }, { d: 21 }, { d: 12 }]);
    expect(r.stale.map((s) => s.daysOverdue)).toEqual([21, 12, 8]);
  });

  it('says the names out loud, with how long each has waited', () => {
    const line = stalePromiseLine(reading([{ d: 9, name: 'Aarav' }, { d: 8, name: 'Ishita' }]));
    expect(line).toContain('Aarav (9d)');
    expect(line).toContain('Ishita (8d)');
  });

  it('caps the list rather than printing a page of names', () => {
    const r = reading(Array.from({ length: STALE_NAMES_SHOWN + 4 }, (_, i) => ({ d: 10 + i })));
    const line = stalePromiseLine(r);
    expect(line).toContain('and 4 more');
    expect(line.match(/\(\d+d\)/g)?.length).toBe(STALE_NAMES_SHOWN);
  });

  it('says nothing at all when nothing is stale', () => {
    // A paragraph that prints every morning regardless is a paragraph that
    // stops being read — and then the morning it matters, it is invisible.
    expect(stalePromiseLine(reading([{ d: 2 }, { d: 1 }]))).toBe('');
  });

  it('never invents a name it does not have', () => {
    const r = reading([{ d: 9, name: null }]);
    expect(r.stale[0].studentName).toBe('Name missing');
    expect(r.stale[0].studentName).not.toBe('Student');
  });
});

describe('escalating changes NOTHING about who is dealt', () => {
  it('the exception still says clear, never cancel, bump, expire or cap', () => {
    const r = reading(Array.from({ length: 12 }, (_, i) => ({ d: i < 3 ? 9 : 4 })));
    expect(r.isInDebt).toBe(true);
    const ex = promiseDebtException(r, NOW);
    // The ACTION is where a proposal would live, and it may only ever be to
    // clear them. The reason is allowed the words — it states the rule
    // ("a promise is never bumped"), which is the opposite of proposing it.
    const action = (ex.suggestedAction?.label ?? '').toLowerCase();
    expect(action).toContain('clear');
    expect(action).toContain('still waiting');
    for (const forbidden of ['cancel', 'delete', 'drop', 'bump', 'expire', 'postpone']) {
      expect(action, `a promise is not ours to ${forbidden}`).not.toContain(forbidden);
    }
    expect(ex.reason.toLowerCase(), 'the rule itself must survive in the sentence')
      .toContain('a promise is never bumped');
    expect(ex.evidence.stale_past_days).toBe(PROMISE_STALE_DAYS);
    expect(String(ex.evidence.stale_students)).toContain('(9d)');
  });

  it('the reason carries the names into whatever surface reads it', () => {
    const r = reading([...Array.from({ length: 10 }, () => ({ d: 4 })), { d: 11, name: 'Kabir' }]);
    expect(promiseDebtReason(r)).toContain('Kabir (11d)');
  });

  it('the callback lane keeps its rank, its ceiling-free status and its promise', () => {
    // The deck may RELABEL a stale promise. It may not reorder, cap or drop
    // one. If this ever changes, a student who was told we would call stops
    // being called because the call became inconvenient for us.
    const queue = readFileSync(join(__dirname, '..', 'call-queue.ts'), 'utf8');
    const block = queue.slice(queue.indexOf("dueReason = 'callback'"), queue.indexOf("} else if (dueNow && status === 'no_answer')"));
    expect(block, 'the stale label is the whole change').toContain('days overdue');
    expect(block, 'the sort must stay the untouched promise rank')
      .toMatch(/sort = 7_000_000 \+ minutesOverdue\(\);/);
    expect(block, 'a stale promise must not be skipped').not.toMatch(/\bcontinue;/);

    const day = readFileSync(join(__dirname, '..', 'sales-day.ts'), 'utf8');
    // Anchored on the DECLARATION, not the first mention: prose above it
    // refers to the set by name, and a guard that reads a comment instead of
    // the code it guards proves nothing.
    const untrimmable = day.slice(day.indexOf('const UNTRIMMABLE'), day.indexOf('const UNTRIMMABLE') + 400);
    expect(untrimmable, 'callback stays untrimmable').toContain('callback');
    const ceilings = day.slice(day.indexOf('CEILING'), day.indexOf('CEILING') + 500);
    expect(ceilings, 'a callback ceiling is exactly what the founder refused').not.toMatch(/callback:\s*\w/);
  });
});

describe('the founder reads it in the morning', () => {
  it('the digest carries the named line and renders it', () => {
    const src = readFileSync(join(__dirname, 'founder-digest.ts'), 'utf8');
    expect(src).toContain('readAllPromiseDebt');
    expect(src).toContain('stalePromiseLine');
    expect(src, 'the block must actually be in the email body').toContain('${promisesHtml}');
    expect(src, 'only seats with a stale promise appear').toMatch(/filter\(\(r\) => r\.stale\.length > 0\)/);
    expect(src, 'a failed reading must not cost the founder the whole email').toMatch(/readAllPromiseDebt\([^)]*\)[\s\S]*?\.catch/);
  });
});
