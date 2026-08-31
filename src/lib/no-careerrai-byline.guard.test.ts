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

describe('no student is turned into a superstar', () => {
  // The contributor leaderboard ("Student Contributors", "You're #6 this
  // month", top-10 → a free Buddy month) led this screen until 20 Aug.
  // Founder ruling: no names, no profiles, no rank, no reward for posting.
  // The reason is not cosmetic — a board changes WHY a student shares. We
  // want "the next student gets un-stuck", not "I am climbing something".
  const src = () => readFileSync('src/components/student-insights.tsx', 'utf8');

  it('shows no rank, no board, no contributor standing', () => {
    const s = src();
    for (const banned of ['myRank', 'Student Contributors', 'this month', 'Trophy']) {
      expect(s, `"${banned}" is a status mechanic and must not return`).not.toContain(banned);
    }
  });

  it('the API does not compute or serve a rank either', () => {
    // Removing it from the component alone would leave the machinery one
    // import away from coming back.
    const route = readFileSync('src/app/api/community/insights/route.ts', 'utf8');
    expect(route).not.toContain('myRank');
    expect(route).not.toContain('rankContributors');
  });

  it('the content still leads the screen', () => {
    // Today's Pick moved to the canonical Daily Pick card (21 Aug): it used to
    // render HERE as well, from the same featured_on stamp, so a student met
    // the same question twice on one screen. The feed keeps its own label —
    // renamed 31 Aug from "Student Insights" to "More hints", because the feed
    // is hints-only now and no student ever wrote one of them. The rule under
    // test is unchanged: the feed carries a label of its OWN, distinct from
    // the pick's, so the two can never read as one stack.
    const s = src();
    expect(s).not.toContain("<SectionLabel>Today&apos;s Pick</SectionLabel>");
    expect(s).toContain('<SectionLabel>More hints</SectionLabel>');
    // And it must not claim peer authorship over content we wrote ourselves.
    expect(s).not.toMatch(/from students preparing alongside you/);
    const card = readFileSync('src/components/community-vote-card.tsx', 'utf8');
    expect(card).toContain("Today&apos;s Pick");
  });
});
