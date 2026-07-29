import { describe, it, expect } from 'vitest';
import { isBlockedPair, isValidReportReason, CHAT_REPORT_REASONS } from './chat-safety';

const S = 'student-1';
const B = 'buddy-1';

describe('isBlockedPair', () => {
  it('is false with no blocks', () => {
    expect(isBlockedPair([], S, B)).toBe(false);
    expect(isBlockedPair(null, S, B)).toBe(false);
    expect(isBlockedPair(undefined, S, B)).toBe(false);
  });

  it('blocks in the direction it was created', () => {
    expect(isBlockedPair([{ blocker_id: S, blocked_id: B }], S, B)).toBe(true);
  });

  it('blocks in the OTHER direction too', () => {
    // The whole point of the guideline: if a student blocks a mentor, the
    // mentor must also be unable to send. A one-way block still lets the
    // abusive party talk, which is not a block at all.
    expect(isBlockedPair([{ blocker_id: S, blocked_id: B }], B, S)).toBe(true);
  });

  it('ignores blocks involving other people', () => {
    expect(isBlockedPair([{ blocker_id: 'someone', blocked_id: 'else' }], S, B)).toBe(false);
    expect(isBlockedPair([{ blocker_id: S, blocked_id: 'other-buddy' }], S, B)).toBe(false);
  });
});

describe('isValidReportReason', () => {
  it('accepts every reason offered in the UI', () => {
    // If the sheet offers a reason the API rejects, the report silently fails
    // and the student believes they reported someone. One list, both sides.
    for (const r of CHAT_REPORT_REASONS) expect(isValidReportReason(r.id)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidReportReason('')).toBe(false);
    expect(isValidReportReason('drop table')).toBe(false);
    expect(isValidReportReason(null)).toBe(false);
    expect(isValidReportReason(42)).toBe(false);
  });
});
