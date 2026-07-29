import { describe, it, expect } from 'vitest';
import { mergeCallFeedback, readCallFeedback, expedifyStatusBadge } from './call-feedback';

describe('mergeCallFeedback', () => {
  it('records a first outcome flat, where the Excel export reads it', () => {
    const r = mergeCallFeedback(null, {
      disposition: 'HOT', notes: 'Wants a mentor before the next mock.',
      event: 'call_report', at: '2026-07-29T12:00:00Z',
    });
    expect(r.disposition).toBe('HOT');
    expect(r.notes).toBe('Wants a mentor before the next mock.');
    expect(r.log).toBeUndefined();
  });

  it('never lets a later sparse event erase what an earlier call learned', () => {
    // The bug this prevents: a NO_ANSWER retry carrying no drop_reason wiping
    // the drop_reason a real conversation produced.
    const first = mergeCallFeedback(null, {
      disposition: 'WARM', drop_reason: 'lost the habit after exams',
      momentum_score: 3, notes: 'Will restart Monday.', event: 'call_report',
      at: '2026-07-29T12:00:00Z',
    });
    const second = mergeCallFeedback(first, {
      disposition: 'NO_ANSWER', event: 'call_report', at: '2026-07-30T12:00:00Z',
    });
    expect(second.disposition).toBe('NO_ANSWER');
    expect(second.drop_reason).toBe('lost the habit after exams');
    expect(second.momentum_score).toBe(3);
  });

  it('pushes the previous call into the log instead of overwriting it', () => {
    const first = mergeCallFeedback(null, { notes: 'first call', event: 'call_report', at: '2026-07-29T12:00:00Z' });
    const second = mergeCallFeedback(first, { notes: 'second call', event: 'call_report', at: '2026-07-30T12:00:00Z' });
    expect(second.notes).toBe('second call');
    expect(second.log).toHaveLength(1);
    expect(second.log?.[0].notes).toBe('first call');
  });

  it('keeps a legacy string write instead of stringifying an object', () => {
    // The old /outcome route wrote a bare string into a jsonb column. Folding a
    // real object onto that used to produce "[object Object]".
    const r = mergeCallFeedback('[29 Jul] agent said she is busy till August', {
      disposition: 'WARM', notes: 'Call back in August.', event: 'call_report', at: '2026-07-30T12:00:00Z',
    });
    expect(r.notes).toBe('Call back in August.');
    expect(r.log?.[0].notes).toContain('busy till August');
    expect(JSON.stringify(r)).not.toContain('[object Object]');
  });

  it('caps the log so one profile cannot grow without bound', () => {
    let acc = mergeCallFeedback(null, { notes: 'call 0', at: '2026-07-01T00:00:00Z' });
    for (let i = 1; i <= 30; i++) {
      acc = mergeCallFeedback(acc, { notes: `call ${i}`, at: `2026-07-01T00:00:00Z` });
    }
    expect(acc.log!.length).toBeLessThanOrEqual(20);
    expect(acc.notes).toBe('call 30');
  });
});

describe('readCallFeedback', () => {
  it('returns null for nothing', () => {
    expect(readCallFeedback(null)).toBeNull();
    expect(readCallFeedback(undefined)).toBeNull();
  });

  it('reads a legacy string as notes rather than dropping it', () => {
    expect(readCallFeedback('older free-text note')?.notes).toBe('older free-text note');
  });

  it('survives a shape it has never seen', () => {
    expect(readCallFeedback(['unexpected'])).toBeNull();
    expect(readCallFeedback({ nothing: 'useful' })?.disposition).toBeNull();
  });
});

describe('expedifyStatusBadge', () => {
  it('does not call a successful call outcome a failure', () => {
    // The actual bug on the lead card: anything !== 'sent' rendered red as
    // "Expedify sync failed", so every real outcome looked broken.
    const b = expedifyStatusBadge('call_report · interested · HOT');
    expect(b?.tone).toBe('info');
    expect(b?.label).toContain('HOT');
  });

  it('still distinguishes the signup state machine', () => {
    expect(expedifyStatusBadge('sent')?.tone).toBe('good');
    expect(expedifyStatusBadge('failed')?.tone).toBe('bad');
    expect(expedifyStatusBadge('queued')?.tone).toBe('wait');
    expect(expedifyStatusBadge('skipped_activated')?.tone).toBe('muted');
    expect(expedifyStatusBadge(null)).toBeNull();
  });
});
