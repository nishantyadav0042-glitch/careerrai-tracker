import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── One writer for the money, and no terminal state without it ─────────────
//
// The ₹299 has two failure shapes, and they are opposites:
//
//   the credit moves when it should not  → the DB trigger stops it
//                                          (proved on careerrai-test)
//   the credit DOES NOT move when it should → nothing stops that, and it is
//                                          the shape that actually cost us:
//                                          a session ended and the credit sat
//                                          in 'scheduled' forever
//
// The second is a WIRING failure — a route that changes session_status and
// forgets the credit — so only a wiring guard can catch it. This is that
// guard. It reads every file that puts a session into a terminal state and
// insists the same file settles the credit.

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}


/**
 * Does this file MUTATE session_credits?
 *
 * The naive form — from('session_credits') followed by .update within N
 * characters — reported sessions/feedback, which only READS the credit and
 * then inserts into session_feedback a few lines later. The window ran past
 * the end of one query into the beginning of another.
 *
 * A chained query ends where the NEXT .from( begins, so that is the boundary
 * used here. Widening the allow-list to silence the false positive would have
 * been the cheaper fix and would have hidden the next real writer behind a
 * name someone had already approved.
 */
function writesCredits(code: string): boolean {
  const re = /from\('session_credits'\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const rest = code.slice(m.index + m[0].length);
    const next = rest.search(/\bfrom\(/);
    const chain = next === -1 ? rest : rest.slice(0, next);
    if (/\.(update|insert|delete|upsert)\s*\(/.test(chain)) return true;
  }
  return false;
}

const AUTHORITY = 'src/lib/session-credit.ts';
/** Terminal, from the credit's point of view: the session will not deliver. */
const TERMINAL = /session_status:\s*'(completed|cancelled|expired)'/;

const files = tsFiles('src').map((f) => [f, strip(readFileSync(f, 'utf8'))] as const);

describe('every terminal session transition settles the credit', () => {
  const terminalWriters = files.filter(([, c]) => TERMINAL.test(c)).map(([f]) => f);

  it('the guard still finds the transitions it exists to police', () => {
    expect(terminalWriters.length).toBeGreaterThanOrEqual(4);
  });

  it('no route ends a session without settling its credit', () => {
    const silent = terminalWriters.filter((f) => {
      const code = strip(readFileSync(f, 'utf8'));
      return !code.includes('settleCreditForSession');
    });
    expect(
      silent,
      'These files put a session into a terminal state and never touch the credit that paid for it. That is how a student ends up with an entitlement welded to a session that already happened — or already died:\n  ' +
        silent.join('\n  '),
    ).toEqual([]);
  });
});

describe('the credit state machine has exactly one writer', () => {
  /**
   * Files allowed to write session_credits, each for a DIFFERENT part of the
   * lifecycle. The point is not "one file touches the table" — it is that no
   * two files can perform the SAME transition.
   */
  const ALLOWED: Record<string, string> = {
    'src/lib/session-credit.ts': 'the terminal writer: completed / released. Nothing else may reach those states.',
    'src/lib/activate-payment.ts': 'mints the credit when the payment lands. Creation only — never settles one.',
    'src/app/api/payments/create-order/route.ts': 'attaches the payment id before activation. Never changes status.',
  };

  it('nothing outside the declared set writes session_credits', () => {
    const writers = files.filter(([, c]) => writesCredits(c)).map(([f]) => f);
    const undeclared = writers.filter((f) => !(f in ALLOWED));
    expect(
      undeclared,
      'A second writer to session_credits is a second answer to "what does this student own". Route it through session-credit.ts, or declare it here with the transition it owns:\n  ' +
        undeclared.join('\n  '),
    ).toEqual([]);
  });

  it('only the authority may write a TERMINAL credit state', () => {
    const terminal = /status:\s*'(completed|refunded|booking_blocked)'/;
    // SCOPED TO THE SESSION_CREDITS CALL CHAIN, not to the file (28 Aug 2026).
    //
    // This used to be `file mentions session_credits` AND `file contains a
    // terminal status literal anywhere`. Those two facts can be about
    // different tables: activate-payment.ts legitimately touches
    // session_credits (it spends the credit that discounted a payment) and
    // separately writes `status: 'refunded'` to STUDENT_PAYMENTS in
    // settleRefund. Co-occurrence flagged it, and the honest fix is to make
    // the guard precise rather than to except the file — an exception here
    // would have blinded it to a genuine second credit writer in the same
    // file forever after.
    const chainAfterCreditsWrite = (c: string): string[] => {
      const out: string[] = [];
      const re = /from\('session_credits'\)/g;
      for (let m = re.exec(c); m; m = re.exec(c)) out.push(c.slice(m.index, m.index + 400));
      return out;
    };
    const offenders = files
      .filter(([f]) => f !== AUTHORITY)
      .filter(([, c]) => chainAfterCreditsWrite(c).some((chain) => terminal.test(chain)))
      .map(([f]) => f);
    expect(
      offenders,
      'Terminal credit states belong to settleCreditForSession alone — it is the one place that knows a release must carry an owner, a next_action and a failure reason:\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('the release asks the database for the row count, and believes the answer', () => {
    // Without .select() a status-guarded update that matched NOTHING is
    // indistinguishable from one that worked, and a double-cancel reports two
    // releases. A caller keying a notification off that tells the student twice.
    const code = strip(readFileSync(AUTHORITY, 'utf8'));
    const fn = code.slice(code.indexOf('async function settle('));
    expect(fn).toMatch(/\.in\('status', \['scheduled', 'assigned'\]\)\s*\.select\('id'\)/);
    expect(fn).toMatch(/reason: 'already_settled'/);
  });

  it('it cannot throw into a caller that has already changed the session', () => {
    const code = strip(readFileSync(AUTHORITY, 'utf8'));
    const entry = code.slice(
      code.indexOf('export async function settleCreditForSession'),
      code.indexOf('async function settle('),
    );
    expect(entry).toMatch(/try\s*\{[\s\S]*catch/);
  });
});
