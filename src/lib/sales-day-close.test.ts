import { describe, it, expect } from 'vitest';
import { buildDayClose, headline, owed, isConversation } from './sales-day-close';
import { istTodaySoFarWindow, istYesterdayWindow } from './sales-yesterday';
import type { DaySnapshot } from './sales-yesterday';

const snap = (over: Partial<DaySnapshot> = {}): DaySnapshot => ({
  repId: 'r1', label: '2026-09-15', attempts: 0, studentsTouched: 0,
  byOutcome: {}, callbacksSet: 0, remarksTyped: 0, ...over,
});

const build = (over: Parameters<typeof buildDayClose>[0]) => buildDayClose(over);

describe('the day-close card a counsellor screenshots at shift end', () => {
  it('counts a conversation only where a human actually answered', () => {
    expect(isConversation('interested')).toBe(true);
    expect(isConversation('callback')).toBe(true);
    expect(isConversation('not_interested')).toBe(true);
    // The two that mean nobody spoke. SALES-OS §3: collapsing these into
    // "contacted" turns our failure to reach someone into their refusal.
    expect(isConversation('no_answer')).toBe(false);
    expect(isConversation('messaged')).toBe(false);
  });

  it('leads with what the day produced, not with how many taps it took', () => {
    const d = build({
      repName: 'Neelam', cardsGiven: 73, cardsWorked: 20, promisesDueUnkept: 0, voices: [],
      snapshot: snap({ attempts: 60, studentsTouched: 55, callbacksSet: 4,
        byOutcome: { no_answer: 46, interested: 3, callback: 4, messaged: 7 } }),
    });
    expect(d.connected).toBe(7);        // interested + callback
    expect(d.interested).toBe(3);
    expect(headline(d)).toBe('7 conversations · 3 interested · 4 callbacks promised');
    // The attempt count survives, but as context underneath.
    expect(d.attempts).toBe(60);
  });

  // ── THE DAY THIS CARD EXISTS TO REPORT HONESTLY ───────────────────────────
  //
  // 15 Sep 2026: six calls, every one a no-answer, 67 of 73 cards untouched.
  // A summary that could not say that plainly would be worse than no summary.
  it('says plainly when nobody picked up all day', () => {
    const d = build({
      repName: 'Neelam', cardsGiven: 73, cardsWorked: 6, promisesDueUnkept: 30, voices: [],
      snapshot: snap({ attempts: 6, studentsTouched: 6, byOutcome: { no_answer: 6 } }),
    });
    expect(d.connected).toBe(0);
    expect(headline(d)).toBe('6 attempts — nobody picked up today.');
    expect(owed(d)).toBe('67 of 73 cards still open · 30 promised callbacks not kept');
  });

  it('handles a day with nothing logged at all', () => {
    const d = build({ repName: 'X', cardsGiven: 70, cardsWorked: 0, promisesDueUnkept: 0, voices: [], snapshot: snap() });
    expect(headline(d)).toBe('No calls logged today.');
    expect(d.cardsLeftOpen).toBe(70);
  });

  it('drops the owed block entirely on a clean day', () => {
    const d = build({
      repName: 'Anshul', cardsGiven: 71, cardsWorked: 71, promisesDueUnkept: 0, voices: [],
      snapshot: snap({ attempts: 71, byOutcome: { interested: 8 } }),
    });
    expect(owed(d)).toBe('');
    expect(d.cardsLeftOpen).toBe(0);
  });

  it('never reports negative open cards when more was worked than dealt', () => {
    // A rep can work a student the deck did not deal today. Arithmetic must
    // not produce "-3 cards still open" on a screenshot the founder reads.
    const d = build({ repName: 'A', cardsGiven: 10, cardsWorked: 13, promisesDueUnkept: 0, voices: [], snapshot: snap() });
    expect(d.cardsLeftOpen).toBe(0);
  });

  it('caps the student voices so the card survives a screenshot', () => {
    const voices = Array.from({ length: 9 }, (_, i) => ({
      studentId: `s${i}`, studentName: `Student ${i}`, outcome: 'interested', words: `said thing ${i}`,
    }));
    expect(build({ repName: 'A', cardsGiven: 1, cardsWorked: 1, promisesDueUnkept: 0, voices, snapshot: snap() }).voices)
      .toHaveLength(5);
    expect(build({ repName: 'A', cardsGiven: 1, cardsWorked: 1, promisesDueUnkept: 0, voices, snapshot: snap(), maxVoices: 3 }).voices)
      .toHaveLength(3);
  });

  it('keeps singular and plural honest', () => {
    const d = build({
      repName: 'A', cardsGiven: 5, cardsWorked: 4, promisesDueUnkept: 1, voices: [],
      snapshot: snap({ attempts: 1, callbacksSet: 1, byOutcome: { callback: 1 } }),
    });
    expect(headline(d)).toBe('1 conversation · 1 callback promised');
    expect(owed(d)).toBe('1 of 5 cards still open · 1 promised callback not kept');
  });
});

describe('the window the card is built from', () => {
  // 15 Sep 2026, 21:00 IST = 15:30 UTC. A rep closing their shift must read
  // the day they just worked, which is still in progress in UTC terms.
  const shiftEnd = Date.parse('2026-09-15T15:30:00.000Z');

  it('runs today from IST midnight to now, not to midnight', () => {
    const w = istTodaySoFarWindow(shiftEnd);
    expect(w.label).toBe('2026-09-15');
    expect(w.startIso).toBe('2026-09-14T18:30:00.000Z');  // 15 Sep 00:00 IST
    expect(w.endIso).toBe('2026-09-15T15:30:00.000Z');    // now
  });

  it('still gives yesterday the full closed day', () => {
    const w = istYesterdayWindow(shiftEnd);
    expect(w.label).toBe('2026-09-14');
    expect(w.startIso).toBe('2026-09-13T18:30:00.000Z');
    expect(w.endIso).toBe('2026-09-14T18:30:00.000Z');
  });

  it('does not roll the day early for a rep working past midnight UTC', () => {
    // 15 Sep 23:00 IST = 17:30 UTC — same IST day, and the label must say so.
    expect(istTodaySoFarWindow(Date.parse('2026-09-15T17:30:00.000Z')).label).toBe('2026-09-15');
    // 00:30 IST on the 16th is a new IST day.
    expect(istTodaySoFarWindow(Date.parse('2026-09-15T19:00:00.000Z')).label).toBe('2026-09-16');
  });
});

describe('a promise ledger that could not be read', () => {
  it('says so rather than printing nothing outstanding', () => {
    const d = buildDayClose({
      repName: 'A', cardsGiven: 10, cardsWorked: 10, promisesDueUnkept: null, voices: [],
      snapshot: snap({ attempts: 10, byOutcome: { interested: 2 } }),
    });
    // The day looks clean on every other axis, which is exactly when a
    // silent zero would be believed.
    expect(owed(d)).toBe('could not check promised callbacks');
  });

  it('still reports open cards alongside the unreadable ledger', () => {
    const d = buildDayClose({
      repName: 'A', cardsGiven: 10, cardsWorked: 4, promisesDueUnkept: null, voices: [], snapshot: snap(),
    });
    expect(owed(d)).toBe('6 of 10 cards still open · could not check promised callbacks');
  });
});
