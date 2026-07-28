import { describe, it, expect } from 'vitest';
import {
  decideNudge, nudgesForDay, MAX_NUDGES_PER_DAY, FATIGUE_THRESHOLD, INTENT_WINDOW,
  type StudentNudgeState,
} from './notification-decision';

const base: StudentNudgeState = {
  openedToday: false, loggedToday: false, daysSinceLastLog: 1,
  sentToday: 0, ignoredStreak: 0, reachable: true, hourIST: 9,
};
const s = (over: Partial<StudentNudgeState> = {}): StudentNudgeState => ({ ...base, ...over });

// The question this whole module answers, asserted as tests:
//   Why is THIS student receiving THIS message RIGHT NOW?
// Every rule below exists because our own tap data says clock-triggered sends
// underperform state-triggered ones by 4-6x.

describe('an engaged student is left alone', () => {
  it('sends nothing to someone who has opened AND logged', () => {
    const engaged = s({ openedToday: true, loggedToday: true });
    expect(nudgesForDay(engaged)).toEqual([]);
  });

  it('never tells someone holding the app open to come and open the app', () => {
    expect(decideNudge('start_the_day', s({ openedToday: true, hourIST: 8 })).send).toBe(false);
    expect(decideNudge('inactivity', s({ openedToday: true, hourIST: 15 })).send).toBe(false);
  });

  it('never asks for a log that already exists', () => {
    expect(decideNudge('log_reminder', s({ openedToday: true, loggedToday: true, hourIST: 21 })).send).toBe(false);
  });
});

describe('a student at risk gets help, and only as much as they need', () => {
  it('nudges someone who has not opened today', () => {
    const d = decideNudge('inactivity', s({ hourIST: 15 }));
    expect(d.send).toBe(true);
    expect(d.why).toContain('no app open');
  });

  it('asks for the log only from someone who showed up and did not finish', () => {
    const d = decideNudge('log_reminder', s({ openedToday: true, loggedToday: false, hourIST: 21 }));
    expect(d.send).toBe(true);
  });

  it('does not send a log reminder to someone who never opened — that is an inactivity case', () => {
    // The old fixed-schedule log nudge fired at 21:30 regardless. It was
    // delivered 93 times and tapped zero times, ever.
    expect(decideNudge('log_reminder', s({ openedToday: false, hourIST: 21 })).send).toBe(false);
  });

  it('caps even the worst case at the daily ceiling', () => {
    const atRisk = s({ openedToday: false, loggedToday: false, daysSinceLastLog: 5 });
    expect(nudgesForDay(atRisk).length).toBeLessThanOrEqual(MAX_NUDGES_PER_DAY);
  });

  it('gives an at-risk student more than an engaged one', () => {
    const atRisk = nudgesForDay(s({ daysSinceLastLog: 5 })).length;
    const engaged = nudgesForDay(s({ openedToday: true, loggedToday: true })).length;
    expect(atRisk).toBeGreaterThan(engaged);
  });
});

describe('fatigue — the part nobody builds', () => {
  it('goes quiet once a student has ignored us repeatedly', () => {
    const tired = s({ ignoredStreak: FATIGUE_THRESHOLD });
    expect(decideNudge('start_the_day', { ...tired, hourIST: 8 }).send).toBe(false);
    expect(decideNudge('inactivity', { ...tired, hourIST: 15 }).send).toBe(false);
    expect(decideNudge('log_reminder', s({ ...tired, openedToday: true, hourIST: 21 })).send).toBe(false);
  });

  it('still allows a recovery nudge, because that is what recovery is for', () => {
    // inactive_recovery is our best-performing notification at 6.9% precisely
    // because it targets a student who has gone quiet.
    const tired = s({ ignoredStreak: FATIGUE_THRESHOLD + 5, daysSinceLastLog: 6 });
    expect(decideNudge('recovery', { ...tired, hourIST: 10 }).send).toBe(true);
  });

  it('probes occasionally rather than daily once fatigued', () => {
    const tired = (days: number) => s({ ignoredStreak: FATIGUE_THRESHOLD, daysSinceLastLog: days });
    const sends = [2, 3, 4, 5, 6, 7].filter((d) => decideNudge('recovery', { ...tired(d), hourIST: 10 }).send);
    expect(sends.length).toBeLessThan(6); // not every day
    expect(sends.length).toBeGreaterThan(0); // but never permanently silent
  });

  it('tolerates a normal run of misses without backing off', () => {
    // At a 1-3% tap rate, four ignored in a row is the ORDINARY case. A
    // threshold that fires there would silence everyone immediately.
    expect(decideNudge('inactivity', s({ ignoredStreak: 4, hourIST: 15 })).send).toBe(true);
  });
});

describe('the rules that must never break', () => {
  it('never sends to an unreachable student', () => {
    for (const intent of ['start_the_day', 'log_reminder', 'inactivity', 'recovery'] as const) {
      const [from] = INTENT_WINDOW[intent];
      expect(decideNudge(intent, s({ reachable: false, hourIST: from })).send).toBe(false);
    }
  });

  it('never exceeds the ceiling however extreme the state', () => {
    expect(decideNudge('recovery', s({ sentToday: MAX_NUDGES_PER_DAY, daysSinceLastLog: 30, hourIST: 10 })).send).toBe(false);
  });

  it('never sends a recovery nudge to someone who is active today', () => {
    expect(decideNudge('recovery', s({ openedToday: true, daysSinceLastLog: 9, hourIST: 10 })).send).toBe(false);
    expect(decideNudge('recovery', s({ loggedToday: true, daysSinceLastLog: 9, hourIST: 10 })).send).toBe(false);
  });

  it('explains every decision, sent or suppressed', () => {
    const states = [s(), s({ openedToday: true }), s({ loggedToday: true }),
      s({ reachable: false }), s({ ignoredStreak: 9 }), s({ sentToday: 9 })];
    for (const st of states) {
      for (const intent of ['start_the_day', 'log_reminder', 'inactivity', 'recovery'] as const) {
        const d = decideNudge(intent, { ...st, hourIST: INTENT_WINDOW[intent][0] });
        expect(d.why.length, `${intent} must explain itself`).toBeGreaterThan(10);
      }
    }
  });
});

describe('what this means in practice', () => {
  it('an engaged student receives 0 nudges', () => {
    expect(nudgesForDay(s({ openedToday: true, loggedToday: true })).length).toBe(0);
  });

  it('a student who opened but has not logged receives exactly 1', () => {
    expect(nudgesForDay(s({ openedToday: true, loggedToday: false })).length).toBe(1);
  });

  it('a fatigued student receives at most 1', () => {
    expect(nudgesForDay(s({ ignoredStreak: 10, daysSinceLastLog: 6 })).length).toBeLessThanOrEqual(1);
  });
});
