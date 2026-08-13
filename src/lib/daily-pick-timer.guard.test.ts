import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TARGET_SECONDS, SPLIT_MIN_ATTEMPTS } from './challenge';

// ── The clock, and the one screen it lives on ───────────────────────────────
//
// Founder, 13 Aug: "start a timer as soon as they click Daily Pick — solve
// this in 90 secs — so they don't even think, they just read and start
// solving… tell only x% finished in time… but for this you have to increase
// the difficulty of the questions."
//
// And separately: "2 different screens are live… this mix of screen should
// not exist."
//
// Both are one product decision. A timed question only works if the student
// knows that is what they are opening, and a timer only means anything if the
// question is hard enough to actually cost most of the 90 seconds.

const CARD = 'src/components/daily-challenge-card.tsx';
const SLOT = 'src/components/daily-slot-card.tsx';
const ROUTE = 'src/app/api/community/daily-slot/route.ts';
const ATTEMPT = 'src/app/api/challenge/attempt/route.ts';

describe('the clock', () => {
  it('targets 90 seconds', () => {
    expect(TARGET_SECONDS).toBe(90);
  });

  it('starts on open, not on first tap', () => {
    // The whole point is that reading time counts — a timer that starts when
    // they pick an option would reward exactly the deliberation it exists to
    // prevent.
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('const [startedAt] = useState(() => Date.now())');
    expect(src).toMatch(/setInterval\(/);
  });

  it('freezes once answered', () => {
    expect(readFileSync(CARD, 'utf8')).toContain('if (verdict) return;');
  });

  it('never blocks the answer — it counts up past the target instead', () => {
    // A hard cutoff turns a daily habit into something you can fail, which is
    // the fastest way to stop it being daily.
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('overtime');
    // No disabling of the option buttons on time.
    expect(src).not.toMatch(/disabled=\{[^}]*overtime/);
  });
});

describe('"x% finished in time" obeys the same density gate as everything else', () => {
  it('is null until enough attempts exist', () => {
    // A percentage over three people reports how small we are, not how hard
    // the question is — the no-small-numbers rule, applied to the clock.
    const src = readFileSync(ATTEMPT, 'utf8');
    expect(src).toContain('timed.length >= SPLIT_MIN_ATTEMPTS');
    expect(SPLIT_MIN_ATTEMPTS).toBeGreaterThan(1);
  });

  it('measures against the shared target, not a re-typed 90', () => {
    const src = readFileSync(ATTEMPT, 'utf8');
    expect(src).toContain('<= TARGET_SECONDS');
  });

  it('the student\'s OWN time needs no gate — it is their own data', () => {
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('verdict.yourSeconds != null');
  });
});

describe('one screen, every day', () => {
  it('the question wins the hero slot whenever one exists', () => {
    expect(readFileSync(ROUTE, 'utf8')).toContain("available.question\n    ? 'question'");
  });

  it('the card routes a question slot to the challenge, before any other kind', () => {
    const src = readFileSync(SLOT, 'utf8');
    const question = src.indexOf("slot.kind === 'question'");
    const community = src.indexOf("slot.kind === 'community'");
    expect(question).toBeGreaterThan(-1);
    expect(question).toBeLessThan(community);
  });

  it('the rotation still runs when no question is scheduled', () => {
    // The other kinds are not deleted — deleting them would throw away a
    // working engine and its tests for a problem that was only ever about
    // which card owns the hero slot.
    expect(readFileSync(ROUTE, 'utf8')).toContain('pickKindForDay(user.id, day, available, recent)');
  });
});

describe('the screen says whose it is', () => {
  it('leads with the by-students-for-students line', () => {
    expect(readFileSync(CARD, 'utf8')).toContain('by the students, for the students');
  });
});
