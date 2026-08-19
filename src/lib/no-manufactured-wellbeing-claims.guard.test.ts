import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Nothing may tell a human about a stress level nobody reported ───────────
//
// daily_reports.stress is not collected. upsert_log_and_streak INSERTs the
// constant 2 for every new row and no writer in src/ ever supplies a real one.
// Yet four surfaces read it and presented it to a MENTOR as an observation
// about their student:
//
//   · weekly-signal-card.tsx rendered a "Stress trend" tile -- a number out of
//     5, a trend arrow, and a colour (emerald below 2.5). Every student
//     therefore showed a calm, improving stress picture.
//   · weekly-signal/route.ts wrote prose from it: "stress steady at 2.0/5" and
//     "Stress trending up ... worth exploring why". Its stress_trend compared
//     the first and last constant, so it could only ever read 'falling'.
//   · weekly-signal/route.ts also put avg_stress and stress_trend into the
//     JSON handed to Gemini, so the AI observation was reasoning about it too.
//   · feedback-draft/route.ts put "avg stress 2.0/5" into the prompt that
//     drafts what a mentor SAYS to the student.
//
// A mentor could open a session with "good to see your stress coming down" to
// a student who is drowning. That is the J2/G7 defect -- a constant wearing
// the costume of a signal -- carried all the way into a human conversation.
//
// J2 retired the burnout and sleep FLAGS rather than repairing them, and G7
// removed moodScore from the composite for exactly this data. Both rulings
// stopped at the scoring layer; these display and prompt surfaces were never
// swept. This guard applies the settled ruling to them.
//
// NOT a decision to abandon wellbeing. If stress is worth knowing, it should be
// COLLECTED -- and then this guard is updated in the same commit that adds the
// input. Until an answer comes from a student, nothing may claim one exists.

const ROOT = process.cwd();

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
// A source-reading guard cannot tell code from prose; this file's own
// explanation above is full of the very strings it forbids.
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SIGNAL_ROUTE = 'src/app/api/weekly-signal/route.ts';
const DRAFT_ROUTE = 'src/app/api/feedback-draft/route.ts';
const CARD = 'src/components/weekly-signal-card.tsx';
const ANALYTICS = 'src/lib/analytics.ts';
const BRIEFING = 'src/lib/buddy-briefing.ts';

describe('no surface claims a stress level that was never collected', () => {
  it('the weekly-signal card renders no stress tile', () => {
    const s = code(CARD);
    expect(s).not.toMatch(/Stress trend/i);
    expect(s).not.toMatch(/avgStress/);
  });

  it('the rule-based insight makes no stress claim', () => {
    const s = code(SIGNAL_ROUTE);
    expect(s).not.toMatch(/stress steady/i);
    expect(s).not.toMatch(/Stress trending/i);
  });

  it('the AI summary handed to Gemini carries no stress field', () => {
    const s = code(SIGNAL_ROUTE);
    expect(s, 'the model must not reason about a manufactured value').not.toMatch(/avg_stress/);
    expect(s).not.toMatch(/stress_trend/);
  });

  it('the mentor feedback prompt states no stress figure', () => {
    const s = code(DRAFT_ROUTE);
    expect(s, 'this prompt drafts what a mentor says to a student').not.toMatch(/avg stress/i);
    expect(s).not.toMatch(/avgStress/);
  });

  it('neither route still averages the manufactured column', () => {
    for (const p of [SIGNAL_ROUTE, DRAFT_ROUTE]) {
      expect(code(p), `${p} must not read daily_reports.stress`).not.toMatch(/r\.stress/);
    }
  });

  it('raises no red flag from a column nobody fills (J2, re-cut)', () => {
    // The first version of this guard scanned three files and passed, while
    // analytics.ts and buddy-briefing.ts made the same claim to the same
    // audience. A guard is only as wide as the doors it watches -- the G15
    // lesson, and the reason these two assertions exist.
    const s = code(ANALYTICS);
    expect(s, 'burnout flag cannot fire from a pinned constant').not.toMatch(/burnout risk/);
    expect(s, 'sleep flag fired 26 times from avg([]) === 0').not.toMatch(/Sleep quality below/);
  });

  it('the mentor briefing states no stress figure', () => {
    const s = code(BRIEFING);
    expect(s, 'this text is what a mentor reads before a session').not.toMatch(/avg stress/i);
    expect(s).not.toMatch(/avgStress/);
  });

  it('the mentor briefing states no confidence average either', () => {
    // Different reason from stress, and the reason is the point. confidence IS
    // collected today (log-daily writes an integer 1-5), so the parked J3's
    // claim that it is uncollected is out of date. It still goes: the RPC
    // INSERTs the constant 4 and 318 of 348 rows carry it, so a real 4 cannot
    // be told from a manufactured one and the MEAN is untrustworthy. An average
    // over mostly-manufactured inputs is not rescued by the field being real.
    const s = code(BRIEFING);
    expect(s, 'the mean is dominated by a manufactured constant').not.toMatch(/Avg confidence/);
    expect(s).not.toMatch(/avgConfidence/);
  });

  it('still reports the things that ARE measured', () => {
    // Guard against "fixing" this by emptying the card or the prompt.
    const card = code(CARD);
    expect(card).toMatch(/Days studied/);
    expect(card).toMatch(/Avg hours/);
    expect(code(SIGNAL_ROUTE)).toMatch(/days_logged/);
    expect(code(DRAFT_ROUTE)).toMatch(/Current streak/);
    expect(code(ANALYTICS), 'the going-quiet flag covers the real cases').toMatch(/going quiet/);
    expect(code(BRIEFING), 'the streak is real and must survive').toMatch(/Streak:/);
  });
});
