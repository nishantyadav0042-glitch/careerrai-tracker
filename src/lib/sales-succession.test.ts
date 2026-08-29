import { describe, it, expect } from 'vitest';
import {
  checkBookTransfer,
  describeTransfer,
  unownedBookException,
  type SeatHolder,
} from './sales-succession';

const seat = (over: Partial<SeatHolder> = {}): SeatHolder => ({
  repId: '11111111-1111-1111-1111-111111111111',
  name: 'Anshul',
  configured: true,
  active: true,
  ...over,
});

const other = (over: Partial<SeatHolder> = {}): SeatHolder =>
  seat({ repId: '22222222-2222-2222-2222-222222222222', name: 'Neelam', ...over });

describe('checkBookTransfer', () => {
  it('allows a normal handover between two live seats', () => {
    const r = checkBookTransfer(seat(), other(), 940);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bookSize).toBe(940);
  });

  // THE POINT OF THE WHOLE MODULE. Succession happens on the day the source rep
  // has stopped working — if an inactive or unconfigured SOURCE were refused,
  // the tool would fail on exactly the day it is needed.
  it('moves the book of a rep whose seat is already switched off', () => {
    expect(checkBookTransfer(seat({ active: false }), other(), 940).ok).toBe(true);
  });

  it('moves the book of a rep whose capacity row is gone entirely', () => {
    expect(checkBookTransfer(seat({ active: false, configured: false }), other(), 12).ok).toBe(true);
  });

  it('refuses a destination that is switched off', () => {
    const r = checkBookTransfer(seat(), other({ active: false }), 940);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('TO_INACTIVE');
      expect(r.error).toContain('Neelam');
    }
  });

  it('refuses a destination with no capacity row', () => {
    const r = checkBookTransfer(seat(), other({ configured: false }), 940);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('TO_UNCONFIGURED');
  });

  // An unconfigured destination must be refused for BEING unconfigured, not
  // shrugged off because `active` also happens to be false. Ordering matters:
  // the founder is told to configure the seat, not to activate a seat that does
  // not exist.
  it('names the missing configuration before the inactive flag', () => {
    const r = checkBookTransfer(seat(), other({ configured: false, active: false }), 940);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('TO_UNCONFIGURED');
  });

  it('refuses a transfer to the same person', () => {
    const r = checkBookTransfer(seat(), seat(), 940);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('SAME_REP');
  });

  it('refuses when either side is not a staff account', () => {
    expect(checkBookTransfer(null, other(), 5)).toMatchObject({ ok: false, reason: 'FROM_UNKNOWN' });
    expect(checkBookTransfer(seat(), null, 5)).toMatchObject({ ok: false, reason: 'TO_UNKNOWN' });
  });

  it('refuses an empty book rather than reporting a successful no-op', () => {
    const r = checkBookTransfer(seat(), other(), 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('EMPTY_BOOK');
  });

  // A negative count can only come from a broken read. It must not read as a
  // book worth moving.
  it('treats a negative book size as empty', () => {
    expect(checkBookTransfer(seat(), other(), -3)).toMatchObject({ ok: false, reason: 'EMPTY_BOOK' });
  });
});

describe('describeTransfer', () => {
  it('names the overdue promises the receiving rep has just inherited', () => {
    const s = describeTransfer(seat(), other(), { leadsMoved: 940, followupsMoved: 31, overdueInherited: 7 });
    expect(s).toContain('940 students moved from Anshul to Neelam');
    expect(s).toContain('31 open promises carried over');
    expect(s).toContain('7 of them already overdue');
  });

  it('says so plainly when there are no promises to carry', () => {
    const s = describeTransfer(seat(), other(), { leadsMoved: 5, followupsMoved: 0, overdueInherited: 0 });
    expect(s).toContain('no open promises to carry over');
    expect(s).not.toContain('overdue');
  });

  it('does not pluralise a single student or a single promise', () => {
    const s = describeTransfer(seat(), other(), { leadsMoved: 1, followupsMoved: 1, overdueInherited: 0 });
    expect(s).toContain('1 student moved');
    expect(s).toContain('1 open promise carried over');
    expect(s).not.toContain('1 students');
    expect(s).not.toContain('1 open promises');
  });
});

describe('unownedBookException', () => {
  it('is silent when every student has an owner', () => {
    expect(unownedBookException({ unowned: 0, paying: 0 }, 1000)).toBeNull();
  });

  it('is high severity for unowned free students', () => {
    const e = unownedBookException({ unowned: 240, paying: 0 }, 1000);
    expect(e?.severity).toBe('high');
    expect(e?.code).toBe('unowned_book');
    expect(e?.reason).toContain('240 students have no sales owner');
  });

  it('escalates to critical when a paying student has no owner', () => {
    const e = unownedBookException({ unowned: 240, paying: 3 }, 1000);
    expect(e?.severity).toBe('critical');
    expect(e?.reason).toContain('3 of them are paying customers');
  });

  // L1: a trustworthy UNKNOWN beats a precise lie. An unreadable payment join
  // must never render as the reassuring "and none of them pay".
  it('reports an unreadable payment state as NOT INSTRUMENTED, never as zero', () => {
    const e = unownedBookException({ unowned: 240, paying: null }, 1000);
    expect(e?.evidence.paying_among_them).toBe('NOT INSTRUMENTED');
    expect(e?.reason).toContain('could not be read');
    expect(e?.reason).not.toContain('none');
    // Unknown is not an excuse to relax: still at least 'high'.
    expect(e?.severity).toBe('high');
  });

  it('drills down to exactly the affected students', () => {
    const e = unownedBookException({ unowned: 9, paying: 0 }, 1000);
    // SCALE-CONTRACT §4: a count that cannot be opened is a chart.
    expect(e?.destination).toBe('/admin/leads?owner=none');
    expect(e?.suggestedAction.route).toBe('/admin/sales/capacity');
  });

  it('gives the same problem the same id across recomputes, and a changed one a new id', () => {
    const a = unownedBookException({ unowned: 9, paying: 0 }, 1000);
    const b = unownedBookException({ unowned: 9, paying: 0 }, 9999);
    const c = unownedBookException({ unowned: 10, paying: 0 }, 1000);
    expect(a?.id).toBe(b?.id);
    expect(a?.id).not.toBe(c?.id);
  });
});
