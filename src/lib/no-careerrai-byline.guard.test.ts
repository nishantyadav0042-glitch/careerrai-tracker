import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── We do not sign our own content as if it were a student's ────────────────
//
// Founder, 13 Aug: "don't mention the name of CareerRai under questions… if
// any student submits then only their name should be there, otherwise just
// mention the topic and Section."
//
// Three surfaces were doing it — "— Curated by CareerRai" under seeded tips,
// and "— Priya · verified by CareerRai" under a real student's line. Both are
// wrong for the same reason. The first pads a thin feed with a byline nobody
// asked for and quietly advertises how much of the room is us; the second
// takes half the credit for something a student actually wrote.
//
// The rule: a byline is EARNED by a student. Curated content shows its
// section and nothing else. 60 of the ~70 rows in student_submissions are
// seeded, so this was on most cards on the screen.

const SURFACES = [
  'src/components/student-insights.tsx',
  'src/components/community-vote-card.tsx',
  'src/components/topic-insights.tsx',
];

describe('no student-facing byline ever credits CareerRai', () => {
  for (const file of SURFACES) {
    it(`${file.split('/').pop()} never signs a card`, () => {
      const src = readFileSync(file, 'utf8');
      // Only the rendered strings matter — comments explaining the rule are
      // allowed to name it. Strip line comments before checking.
      const code = src.replace(/^\s*\/\/.*$/gm, '');
      expect(code).not.toContain('Curated by CareerRai');
      expect(code).not.toContain('verified by CareerRai');
      expect(code).not.toContain('CareerRai student');
    });
  }

  it('the insights API returns null rather than a CareerRai byline', () => {
    const src = readFileSync('src/app/api/community/insights/route.ts', 'utf8');
    expect(src).toContain('isCuratedName');
    // The old fallback invented a byline for every unnamed row.
    expect(src).not.toContain("?? 'a CareerRai student'");
  });
});

describe('a real student still gets their name', () => {
  it('student-insights renders displayName when there is one', () => {
    const src = readFileSync('src/components/student-insights.tsx', 'utf8');
    expect(src).toContain('item.displayName ? `— ${item.displayName}`');
  });

  it('topic-insights renders a contributor name when not curated', () => {
    const src = readFileSync('src/components/topic-insights.tsx', 'utf8');
    expect(src).toContain('!ins.curated && ins.name');
  });
});

describe('Student Contributors leads the screen', () => {
  // It sat at the bottom in grey — "you have kept it hidden, such a boring
  // thing". It is the reason a student writes anything here, so it opens the
  // screen. Still no leaderboard or participant count: rank without a vote
  // count is the only honest way to show standing at our size.
  const src = () => readFileSync('src/components/student-insights.tsx', 'utf8');

  it('appears before both the Today\'s Pick and Student Insights sections', () => {
    // Match the JSX, not the prose — the file's header comment mentions both
    // section names and would make any position check meaningless.
    const s = src();
    const contributors = s.indexOf('>Student Contributors<');
    const todaysPick = s.indexOf('<SectionLabel>Today&apos;s Pick</SectionLabel>');
    const insights = s.indexOf('<SectionLabel>Student Insights</SectionLabel>');
    expect(contributors, 'contributors block not found in JSX').toBeGreaterThan(-1);
    expect(todaysPick).toBeGreaterThan(-1);
    expect(insights).toBeGreaterThan(-1);
    expect(contributors).toBeLessThan(todaysPick);
    expect(contributors).toBeLessThan(insights);
  });

  it('still shows rank without ever showing a vote count', () => {
    const s = src();
    expect(s).toContain('myRank');
    expect(s).not.toMatch(/\d+\s*votes/);
  });
});
