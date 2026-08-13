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
  it('falls back to 90 seconds', () => {
    expect(TARGET_SECONDS).toBe(90);
  });

  it('each question carries its OWN clock — the modal never reads the global 90 directly', () => {
    // Founder, 13 Aug (after solving a VARC summary in 31 of its 90s): "we
    // have to minimise the time for VARC, then only it is a challenge — if
    // they didn't feel the rush of the clock, no one will share." The rush is
    // the product. target_seconds rides each daily_challenges row; both
    // routes and the modal must judge against it, not one shared constant.
    const card = readFileSync(CARD, 'utf8');
    expect(card).toContain('challenge.targetSeconds ?? TARGET_SECONDS');
    const attempt = readFileSync(ATTEMPT, 'utf8');
    expect(attempt).toContain('targetFor(challenge)');
    const today = readFileSync('src/app/api/challenge/today/route.ts', 'utf8');
    expect(today).toContain('targetFor(c)');
  });

  it('a bad or missing stored target can only ever fall back to 90', () => {
    const src = readFileSync('src/lib/challenge.ts', 'utf8');
    // Bounds live in targetFor: below 30s no question is honest, above 600s
    // no clock is felt.
    expect(src).toMatch(/t >= 30 && t <= 600/);
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

  it('every question gets a FRESH clock — the sheet remounts per question', () => {
    // Founder, 13 Aug: "as soon as one question is solved and the other comes
    // to the top, its timer also starts." Without key={open.id} React reuses
    // the mounted sheet when `open` changes, so startedAt — a useState
    // initialiser — survives the swap and question 2 opens with question 1's
    // clock already spent. The key forces a full remount: every question is
    // born at 0 seconds.
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('key={open.id}');
  });

  it('the next question is offered, never forced', () => {
    // A chain the student taps into; auto-advance would yank the explanation
    // away mid-read, and the explanation is where the learning is.
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('Next question · {next.section}');
    expect(src).toContain('onNext(challenge.id, next)');
    // The just-solved question can never be re-offered as "next".
    expect(src).toContain('!justAnswered.has(c.id)');
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

  it('measures against the question\'s own target, not a re-typed 90', () => {
    const src = readFileSync(ATTEMPT, 'utf8');
    expect(src).toContain('<= target');
    expect(src).not.toMatch(/<=\s*90\b/);
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

  // 13 Aug: the loud line went into the question SHEET, which a student cannot
  // see until they have already opened a question. The founder had answered
  // today's question, so the only thing on his screen was the un-redesigned
  // list card — old heading, no clock, no line. "No timer, nothing, no header
  // updates, neither the design updates." The card is the surface; it carries
  // the line.
  it('the CARD itself carries the loud line, not only the sheet', () => {
    const src = readFileSync(CARD, 'utf8');
    const header = src.indexOf('By the students, for the students');
    const modal = src.indexOf('function ChallengeModal');
    expect(header, 'loud line missing from the card').toBeGreaterThan(-1);
    expect(header, 'loud line is inside the sheet, not on the card').toBeLessThan(modal);
  });

  it('the card announces each question\'s clock BEFORE it is opened', () => {
    // A timer nobody was told about is a trap. Every unanswered row wears its
    // own target chip, read from the row's data, never a re-typed number.
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('⏱ {c.targetSeconds ?? TARGET_SECONDS}s');
  });
});

describe('the finished state is a payoff, not a locked door', () => {
  // It was one grey sentence pointing at 8 AM tomorrow. A student who had just
  // solved a timed CAT question was shown nothing about it — and for a founder
  // testing the feature, that grey sentence WAS the feature.
  it('reports their own time back to them', () => {
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('c.attempt?.yourSeconds != null');
    expect(src).toContain('beatTheClock');
  });

  it('the list endpoint actually returns the clock data the card reads', () => {
    // The card can only show this if /api/challenge/today sends it; it used to
    // select neither seconds_taken nor any timing tally. In-time is judged
    // against each row's own target via the targetById map.
    const src = readFileSync('src/app/api/challenge/today/route.ts', 'utf8');
    expect(src).toContain('seconds_taken');
    expect(src).toContain('inTimePct');
    expect(src).toContain('targetById');
  });

  it('"x% finished in time" keeps the density gate here too', () => {
    const src = readFileSync('src/app/api/challenge/today/route.ts', 'utf8');
    expect(src).toContain('st.timed >= SPLIT_MIN_ATTEMPTS');
  });
});

describe('a question is never signed with our own name', () => {
  // The byline sweep on 13 Aug fixed three community surfaces and missed this
  // route, which was still returning the literal string for every contributed
  // question — under the questions, which is exactly what the founder named.
  it('the challenge route resolves a real contributor name or none at all', () => {
    const src = readFileSync('src/app/api/challenge/today/route.ts', 'utf8');
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain("'a CareerRai student'");
    expect(code).toContain('isCuratedName');
  });
});
