import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAlreadyPersisted, type LoggedState } from './log-acknowledgement';

// ── P0-1 — THE ACKNOWLEDGEMENT MUST MATCH THE PERSISTED STATE ────────────────
//
// Found by the 0C.3F.1 provenance audit (attack H6) and confirmed against the
// route: `log-daily` rate-limits a resubmission within 15 seconds and answers
// HTTP 429. Neither caller special-cases it, so:
//
//   · the full log sheet shows "Too many requests"
//   · check-in-gate shows "Couldn't save that. Check your connection and
//     try again."
//
// Both while the log is SAFELY SAVED. The student is told their log was lost
// when it was not — and a student who believes that resubmits, and is
// rate-limited again.
//
// This is not a metric defect. It attacks trust directly, which is why it goes
// first: CareerRai's whole claim is that what it tells a student is true.
//
// THE RULE: the acknowledgement corresponds to what is actually committed.
//   · request wrote it              → success
//   · identical payload already in  → success (it IS saved)
//   · different payload, blocked    → honest: saved, but this edit did not apply
//   · nothing committed             → failure
//
// Deliberately NOT changed: the rate limit itself still blocks the write. This
// fixes what the student is told, not what the database does.

const base: LoggedState = {
  hours: 3, sections: ['QA', 'VARC'], mockTaken: false,
  notes: null, energy: '💪', emotionalChips: [],
};

describe('an identical resubmission is already saved', () => {
  it('recognises the same payload', () => {
    expect(isAlreadyPersisted(base, { ...base })).toBe(true);
  });

  it('ignores section ORDER — a set, not a list', () => {
    // The client rebuilds the array from checkbox state; order is not evidence.
    expect(isAlreadyPersisted(base, { ...base, sections: ['VARC', 'QA'] })).toBe(true);
  });

  it('ignores a repeated section', () => {
    expect(isAlreadyPersisted({ ...base, sections: ['QA', 'QA', 'VARC'] }, base)).toBe(true);
  });

  it('treats the check-in shape as identical to itself', () => {
    const checkIn: LoggedState = {
      hours: 0, sections: [], mockTaken: false, notes: null, energy: '💪', emotionalChips: [],
    };
    expect(isAlreadyPersisted(checkIn, { ...checkIn })).toBe(true);
  });
});

describe('a genuine edit is NOT already saved', () => {
  it('notices changed hours', () => {
    expect(isAlreadyPersisted({ ...base, hours: 4 }, base)).toBe(false);
  });

  it('notices an added section', () => {
    expect(isAlreadyPersisted({ ...base, sections: ['QA', 'VARC', 'DILR'] }, base)).toBe(false);
  });

  it('notices a REMOVED section — the direction that erases evidence', () => {
    expect(isAlreadyPersisted({ ...base, sections: ['QA'] }, base)).toBe(false);
  });

  it('notices a mock claim, notes, energy and chips', () => {
    expect(isAlreadyPersisted({ ...base, mockTaken: true }, base)).toBe(false);
    expect(isAlreadyPersisted({ ...base, notes: 'tough day' }, base)).toBe(false);
    expect(isAlreadyPersisted({ ...base, energy: '😴' }, base)).toBe(false);
    expect(isAlreadyPersisted({ ...base, emotionalChips: ['burned_out'] }, base)).toBe(false);
  });

  it('never claims "already saved" when nothing is persisted', () => {
    // No row means no commit. There is nothing to acknowledge as saved.
    expect(isAlreadyPersisted(base, null)).toBe(false);
  });

  it('does not treat 0 hours and absent hours as the same claim', () => {
    expect(isAlreadyPersisted({ ...base, hours: 0 }, base)).toBe(false);
  });
});

describe('the route tells the truth about what it committed', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/logging/log-daily/route.ts'), 'utf8');
  const code = route.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('asks whether the payload is already persisted before refusing', () => {
    expect(code).toContain('isAlreadyPersisted');
  });

  it('reads the persisted payload, not just its timestamp', () => {
    // The old select was `id, updated_at` — enough to rate-limit, not enough
    // to tell the student the truth about what is stored.
    const select = code.slice(code.indexOf("from('daily_reports')"), code.indexOf("from('daily_reports')") + 400);
    for (const col of ['study_duration', 'topics_covered', 'mock_taken', 'emotional_chips']) {
      expect(select, `the rate-limit read needs ${col}`).toContain(col);
    }
  });

  it('never answers "Too many requests" — a true statement that reads as a failure', () => {
    expect(code).not.toContain('Too many requests');
  });

  it('tells a blocked edit that the log itself is saved', () => {
    const block = code.slice(code.indexOf('secsSinceUpdate'), code.indexOf('secsSinceUpdate') + 900);
    expect(block.toLowerCase()).toContain('saved');
  });

  it('does not re-fire side effects when it recognises a duplicate', () => {
    // A duplicate must not notify the buddy twice, re-log analytics, or send a
    // second push. The dedup branch returns before any of that.
    const dupIdx = code.indexOf('isAlreadyPersisted');
    const returnIdx = code.indexOf('return NextResponse.json', dupIdx);
    const between = code.slice(dupIdx, returnIdx);
    for (const effect of ['notifyBuddy', 'logAnalyticsEvent', 'sendPushToUser', 'rpc(']) {
      expect(between, `duplicate branch must not run ${effect}`).not.toContain(effect);
    }
  });
});

describe('the clients stop inventing a failure the server did not report', () => {
  it('check-in-gate uses the server message instead of a connection story', () => {
    const gate = readFileSync(join(process.cwd(), 'src/components/check-in-gate.tsx'), 'utf8');
    expect(gate).not.toMatch(/throw new Error\('save failed'\)/);
    expect(gate, 'the gate must surface what the server actually said').toContain('serverMessage');
  });
});

describe('a retry cannot create duplicate logical log state', () => {
  it('one date holds one row, by database constraint', () => {
    // Already true and asserted here so the acknowledgement fix cannot be
    // mistaken for the thing that makes retries safe. The upsert on
    // (student_id, report_date) is what does.
    const migDir = join(process.cwd(), 'supabase/migrations');
    const all = readFileSync(join(migDir, '001_initial_schema.sql'), 'utf8');
    expect(all).toMatch(/UNIQUE\s*\(\s*student_id\s*,\s*report_date\s*\)/i);
  });
});
