import { describe, it, expect } from 'vitest';
import { refusal, REFUSAL_CODES, PHANTOM_DOORS, type RefusalCode } from './timetable-refusal';

describe('every refusal can be named', () => {
  // The whole point: 23 failures over seven weeks that we could not tell
  // apart. Two refusals sharing a code would put us straight back there.
  it('gives each refusal its own code', () => {
    expect(new Set(REFUSAL_CODES).size).toBe(REFUSAL_CODES.length);
  });

  it('gives each refusal its own message', () => {
    const messages = REFUSAL_CODES.map((c) => refusal(c).message);
    expect(new Set(messages).size).toBe(messages.length);
  });

  // A frozen list. Renaming a code silently splits a count in two and the
  // trend line lies without anyone noticing, so a rename has to be deliberate.
  it('holds the codes stable', () => {
    expect([...REFUSAL_CODES].sort()).toEqual([
      'file_missing', 'file_too_large', 'legacy_xls', 'model_reply_unreadable',
      'not_a_timetable', 'nothing_readable', 'quota_exceeded',
      'scanner_unavailable', 'unsupported_type', 'workbook_empty',
      'workbook_unreadable',
    ]);
  });

  // Seven weeks of telemetry rows carry a status and nothing else. If a status
  // changes meaning now, every one of those old rows becomes a lie.
  it('keeps the statuses production already emitted', () => {
    const expected: Record<RefusalCode, number> = {
      file_missing: 400, legacy_xls: 400, unsupported_type: 400,
      file_too_large: 413, quota_exceeded: 429,
      workbook_unreadable: 422, workbook_empty: 422, model_reply_unreadable: 422,
      not_a_timetable: 422, nothing_readable: 422,
      scanner_unavailable: 503,
    };
    for (const code of REFUSAL_CODES) {
      expect(refusal(code).status, code).toBe(expected[code]);
    }
  });

  it('echoes the code back on the refusal it describes', () => {
    for (const code of REFUSAL_CODES) expect(refusal(code).code).toBe(code);
  });
});

describe('a refusal may only name a door that exists', () => {
  // ── THE BUG THIS TEST EXISTS FOR ──────────────────────────────────────────
  //
  // Three of these messages used to end "…or add your classes by hand", and
  // the by-hand screen has never existed — the phrase appeared nowhere in the
  // product except those three strings. Twelve students were told to walk
  // through a wall.
  //
  // If someone builds manual entry, delete the pattern from PHANTOM_DOORS in
  // the same commit that ships the screen. That is the only way back in.
  it('sends nobody to a screen the product does not have', () => {
    for (const code of REFUSAL_CODES) {
      const { message } = refusal(code);
      for (const door of PHANTOM_DOORS) {
        expect(door.test(message), `${code}: "${message}"`).toBe(false);
      }
    }
  });

  it('blames the file, never the student', () => {
    for (const code of REFUSAL_CODES) {
      const m = refusal(code).message.toLowerCase();
      for (const word of ['wrong', 'invalid', 'failed', 'error', 'you must']) {
        expect(m, code).not.toContain(word);
      }
    }
  });

  it('tells a student whose photo was rejected that skipping is allowed', () => {
    // The dead end that cost the uploads: rejected, then handed the same
    // button with nothing else offered.
    for (const code of ['not_a_timetable', 'nothing_readable', 'model_reply_unreadable'] as const) {
      expect(refusal(code).message.toLowerCase()).toContain('skip');
    }
  });
});
