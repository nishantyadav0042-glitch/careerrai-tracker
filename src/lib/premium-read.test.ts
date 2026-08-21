import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readPremiumProfile } from './premium';
import { isPremium } from './access';

// ── UNKNOWN premium can never render the locked page (Boundary 2, change 2) ─
//
// /student/buddy read profiles with the error never inspected: one failed
// read → profile null → isPremium(null) === false → a PAYING student shown
// the locked free experience with a "Rs 299 — book now" button. The
// reconcile cron's own comment names this class: a paywall in front of a
// paying student is the worst bug this product can have.
//
// The founder's four cases, driven through the REAL readPremiumProfile with
// clients that succeed, fail, and fail-then-succeed.

function clientAnswering(answers: Array<{ data: unknown; error: unknown }>) {
  let i = 0;
  const chain = { select: () => chain, eq: () => chain, single: async () => answers[Math.min(i++, answers.length - 1)] };
  return { from: () => chain };
}
const row = (is_premium: boolean) => ({ data: { full_name: 'A', buddy_id: null, is_premium }, error: null });
const fail = { data: null, error: { message: 'connection reset' } };

describe("the founder's four cases", () => {
  it('premium = true → the premium experience', async () => {
    const p = await readPremiumProfile(clientAnswering([row(true)]), 's1');
    expect(isPremium(p)).toBe(true);
  });

  it('premium = false → the LEGITIMATE locked experience', async () => {
    const p = await readPremiumProfile(clientAnswering([row(false)]), 's1');
    expect(isPremium(p)).toBe(false);
  });

  it('read fails twice → THROWS — the caller never sees a null profile', async () => {
    // A null return here IS the bug: isPremium(null) is false, and false
    // renders the paywall.
    await expect(readPremiumProfile(clientAnswering([fail, fail]), 's1')).rejects.toThrow(/membership/i);
  });

  it('first read fails, second succeeds → premium arrives, read ran twice', async () => {
    let calls = 0;
    const chain = { select: () => chain, eq: () => chain,
      single: async () => (++calls === 1 ? fail : row(true)) };
    const p = await readPremiumProfile({ from: () => chain }, 's1');
    expect(isPremium(p)).toBe(true);
    expect(calls).toBe(2);
  });
});

describe('UNKNOWN cannot render the locked state', () => {
  it('there is no code path from a failed read to a profile value', async () => {
    // The type says it returns a profile; the runtime proof is that failure
    // REJECTS — so `!isPremium(profile)` can only run on an answer we got.
    const p = readPremiumProfile(clientAnswering([fail, fail]), 's1');
    await expect(p).rejects.toBeInstanceOf(Error);
  });

  it('the page reaches its locked branch only through the primitive (semantic guard)', () => {
    const s = readFileSync('src/app/student/buddy/page.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(s).toContain('await readPremiumProfile(admin, user.id)');
    // The unchecked inline read must not return, in any variable spelling:
    // a destructured `data:` alias followed by a select of is_premium.
    expect(s, 'no unchecked profiles read may feed this decision')
      .not.toMatch(/\{ data[^}]*\} = await admin[\s\S]{0,120}select\('[^']*is_premium/);
    // And the decision itself still exists — the fix must not have removed
    // the legitimate locked experience.
    expect(s).toContain('if (!isPremium(profile))');
  });
});
