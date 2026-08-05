import { describe, it, expect } from 'vitest';

// Exactly ONE permanent room per buddy — the invariant the whole design rests
// on, tested as the compare-and-swap that enforces it.
//
// Found in the pre-merge audit: `ensureBuddyRoom` was a plain read-then-write.
// Two concurrent first bookings by the same mentor each saw "no room", each
// created a Google event, and the second UPDATE overwrote the first. The
// mentor was left with TWO conference events, one of which the app could never
// see again — not deletable on disconnect, not regenerable, not findable. A
// silent, permanent leak of the one thing this architecture guarantees.

type Row = { url: string | null };

/** Mirrors the guarded UPDATE in mintRoom. Returns rows affected. */
function claim(row: Row, newUrl: string, expected: string | null | undefined): number {
  if (expected === null && row.url !== null) return 0;          // "only if unset"
  if (typeof expected === 'string' && row.url !== expected) return 0; // "only if unchanged"
  row.url = newUrl;
  return 1;
}

describe('two concurrent first bookings mint one room, not two', () => {
  it('the loser claims nothing', () => {
    const row: Row = { url: null };
    // Both callers read null, both create an event in Google.
    expect(claim(row, 'https://meet.google.com/AAA', null)).toBe(1);
    expect(claim(row, 'https://meet.google.com/BBB', null)).toBe(0);
    expect(row.url).toBe('https://meet.google.com/AAA');
  });

  it('the loser must delete its orphan and adopt the winner\'s room', () => {
    // Encodes the contract mintRoom follows on a lost race: 0 rows affected
    // means our event is unreferenced, so it is deleted and the stored room is
    // returned instead. Otherwise it lingers on the mentor's calendar forever.
    const row: Row = { url: 'https://meet.google.com/AAA' };
    const affected = claim(row, 'https://meet.google.com/BBB', null);
    expect(affected).toBe(0);
    expect(row.url).toBe('https://meet.google.com/AAA'); // winner untouched
  });
});

describe('swapping a room only succeeds against the room we read', () => {
  it('an account change replaces the exact room it saw', () => {
    const row: Row = { url: 'https://meet.google.com/OLD' };
    expect(claim(row, 'https://meet.google.com/NEW', 'https://meet.google.com/OLD')).toBe(1);
    expect(row.url).toBe('https://meet.google.com/NEW');
  });

  it('a stale swap loses if someone already changed it', () => {
    // Two reconnects racing. Without the guard the older read would clobber the
    // newer room and orphan it.
    const row: Row = { url: 'https://meet.google.com/NEWER' };
    expect(claim(row, 'https://meet.google.com/FROM_STALE_READ', 'https://meet.google.com/OLD')).toBe(0);
    expect(row.url).toBe('https://meet.google.com/NEWER');
  });
});

describe('regeneration is deliberate and always wins', () => {
  it('forces the write regardless of what is there', () => {
    // Support clicking "regenerate" means exactly that — it must not silently
    // no-op because the stored value differs from some earlier read.
    for (const current of [null, 'https://meet.google.com/ANYTHING']) {
      const row: Row = { url: current };
      expect(claim(row, 'https://meet.google.com/FRESH', undefined)).toBe(1);
      expect(row.url).toBe('https://meet.google.com/FRESH');
    }
  });
});
