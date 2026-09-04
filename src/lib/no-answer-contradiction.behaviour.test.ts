import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOnly } from './test-support/code-only';
import { readsAsNoAnswer, contradictsConnectedOutcome, NO_ANSWER_CONTRADICTION_CODE } from './no-answer-contradiction';
import { CONNECTED_OUTCOMES } from './sales-disposition';

/**
 * ── "YOUR NOTE SAYS THEY DIDN'T ANSWER" ─────────────────────────────────────
 *
 * Founder order, 4 Sep 2026, from the day's own production rows:
 *   12:36 PM  interested  "not pick"
 *   02:47 PM  callback    "not pick"
 *
 * What these tests protect, hardest first:
 *   1. THE FALSE POSITIVES. A genuine connected call whose note happens to
 *      mention a missed dial must NOT be flagged as a mistake. Getting this
 *      wrong teaches the reps to write shorter, emptier remarks — which would
 *      cost far more than the miscoding this rule exists to catch.
 *   2. The real production strings are caught, typos and all.
 *   3. The gate is on the SERVER and absence of the flag is not consent.
 */

const REAL_MISCODES = ['not pick', 'not pickk', 'not pick voice mail send', 'cut the call', "Didn't pick up the call"];

describe('what counts as "nobody answered"', () => {
  it('catches every phrasing the reps have actually typed in production', () => {
    for (const note of REAL_MISCODES) {
      expect(readsAsNoAnswer(note), `production string: ${note}`).toBe(true);
    }
  });

  it('survives the hurried typo — repeated letters are collapsed', () => {
    expect(readsAsNoAnswer('not pickkkk')).toBe(true);
    expect(readsAsNoAnswer('not   pick')).toBe(true);
    expect(readsAsNoAnswer('NOT PICK')).toBe(true);
  });

  it('reads the romanised Hinglish a rep types on an English keyboard', () => {
    expect(readsAsNoAnswer('call nhi utha')).toBe(true);
    expect(readsAsNoAnswer('phone nhi uthaya')).toBe(true);
  });

  it('nothing to read is not a no-answer', () => {
    expect(readsAsNoAnswer(null)).toBe(false);
    expect(readsAsNoAnswer('')).toBe(false);
    expect(readsAsNoAnswer('   ')).toBe(false);
  });
});

describe('THE FALSE POSITIVES — real conversations must never be questioned', () => {
  // Every string below is a REAL production remark from a genuinely connected
  // call. If any of these starts flagging, the rule is doing harm.
  const REAL_CONNECTED = [
    'the student is currently busy at the office and will be available after 7',
    'he told me send me the application link',
    'the student said he studies on his own mainly on weekends',
    'not even 1% interested',
    'she told me not interested',
    'the student has created her profile on the application',
    'he told me abhi jada time nhi hua bs check kiya h',
    'The student said that she has already downloaded the application',
  ];

  it('a busy student who spoke to us is a conversation, not a missed call', () => {
    for (const note of REAL_CONNECTED) {
      expect(readsAsNoAnswer(note), `must NOT flag: ${note}`).toBe(false);
    }
  });

  it('"not interested" is an outcome, never silence', () => {
    expect(contradictsConnectedOutcome('not_interested', 'she told me not interested', CONNECTED_OUTCOMES)).toBe(false);
  });
});

describe('the contradiction itself', () => {
  it('flags exactly the two production miscodes', () => {
    expect(contradictsConnectedOutcome('interested', 'not pick', CONNECTED_OUTCOMES)).toBe(true);
    expect(contradictsConnectedOutcome('callback', 'not pick', CONNECTED_OUTCOMES)).toBe(true);
  });

  it('every connected outcome is covered — all five assert a human spoke', () => {
    for (const o of CONNECTED_OUTCOMES) {
      expect(contradictsConnectedOutcome(o, 'not pick', CONNECTED_OUTCOMES), `outcome ${o}`).toBe(true);
    }
  });

  it('no_answer, messaged and skipped are NEVER questioned', () => {
    // These claim nothing about a human speaking, so "not pick" agrees with
    // them. Questioning a correct entry is the fastest way to train a rep to
    // click through every prompt without reading it.
    for (const o of ['no_answer', 'messaged', 'skipped']) {
      expect(contradictsConnectedOutcome(o, 'not pick', CONNECTED_OUTCOMES), `outcome ${o}`).toBe(false);
    }
  });
});

describe('the gate is on the server, and silence is not consent', () => {
  const route = codeOnly(readFileSync('src/app/api/sales/log/route.ts', 'utf8'));

  it('the write path checks the contradiction before it writes anything', () => {
    expect(route).toMatch(/contradictsConnectedOutcome\(outcome, noteText, CONNECTED_OUTCOMES\)/);
  });

  it('ONLY an explicit true passes the gate — a client that never asked cannot write', () => {
    // `answeredConfirmed !== true` and not a truthiness check: a missing flag,
    // a null, or a string must all fail closed.
    expect(route).toMatch(/answeredConfirmed !== true/);
  });

  it('the gate sits ABOVE the state and history writes', () => {
    const gate = route.indexOf('contradictsConnectedOutcome');
    const stateWrite = route.indexOf("from('lead_outreach').upsert");
    const historyWrite = route.indexOf("from('sales_activity').insert");
    expect(gate).toBeGreaterThan(-1);
    expect(gate, 'nothing may be written before the question is settled').toBeLessThan(stateWrite);
    expect(gate).toBeLessThan(historyWrite);
  });

  it('returns a machine-readable code so the card asks instead of showing a red error', () => {
    expect(route).toMatch(/code: NO_ANSWER_CONTRADICTION_CODE/);
    expect(route).toMatch(/status: 409/);
  });
});

describe('the card asks the question rather than refusing the entry', () => {
  const deck = codeOnly(readFileSync('src/components/call-deck.tsx', 'utf8'));

  it('a 409 with the code opens the question, not the error line', () => {
    expect(deck).toMatch(/res\.status === 409 && json\?\.code === NO_ANSWER_CONTRADICTION_CODE/);
  });

  it('both answers are offered, and each re-sends the rep\'s own entry', () => {
    expect(deck, 'the correction path saves it as a no-answer').toMatch(/dispose\(a\.lead, 'no_answer', a\.note\)/);
    expect(deck, 'the confirm path re-sends the original outcome with the flag')
      .toMatch(/a\.reasonVerbatim, a\.skipReason, true\)/);
  });

  it('the confirmation flag is never sent unless the rep actually confirmed', () => {
    expect(deck).toMatch(/answeredConfirmed: answeredConfirmed === true/);
  });

  it('a corrected callback drops the promised time — no promise was ever made', () => {
    // dispose(a.lead, 'no_answer', a.note) passes no callbackAt. If someone
    // adds it back, a student who never answered gets a callback clock for a
    // time they never agreed to, which is the original bug wearing a new coat.
    expect(deck).not.toMatch(/dispose\(a\.lead, 'no_answer', a\.note, a\.callbackAt/);
  });
});

it('the code constant is shared, never typed twice', () => {
  expect(NO_ANSWER_CONTRADICTION_CODE).toBe('no_answer_contradiction');
  const route = codeOnly(readFileSync('src/app/api/sales/log/route.ts', 'utf8'));
  const deck = codeOnly(readFileSync('src/components/call-deck.tsx', 'utf8'));
  for (const [name, src] of [['route', route], ['deck', deck]] as const) {
    expect(src, `${name} must import the constant, not hard-code the string`)
      .not.toMatch(/'no_answer_contradiction'/);
  }
});
