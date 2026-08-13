import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── Closing the real gap the founder found: comparing the live app to the ──
// 9 Aug mock, not just Home's colour ──────────────────────────────────────
//
// Two genuine gaps, not styling misses:
//
//   Home never had a mentor-teaser card at all — the mock's "Shreya · your
//   mentor match · Meet her" slot had no equivalent anywhere.
//
//   S2's unassigned state (MentorPool) rendered as a thin compact row, while
//   the mock (and RecommendedBuddies, the paywall's own showcase) uses a
//   rich card — avatar, journey pill, bio, tag, USP grid. Same honest data,
//   much thinner presentation.
//
// Both fixed with real data reused from existing engines — no new match
// logic, no fabricated claim.

describe('Home has a real mentor teaser now', () => {
  const PAGE = 'src/app/student/tracker/page.tsx';
  const CARD = 'src/components/home/mentor-teaser-card.tsx';

  it('the card is actually mounted on Home, between the plan and the log', () => {
    expect(readFileSync(PAGE, 'utf8')).toContain('<MentorTeaserCard');
  });

  it('the premium+assigned state shows a real buddy, never a placeholder name', () => {
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('your mentor');
    expect(src).toContain("eq('id', buddyId)");
  });

  it('the free/unassigned state reuses the SAME showcase engine as My Buddy — no new ranking', () => {
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('getRecommendedBuddiesForStudent');
    // Never claims assignment for the unassigned case.
    expect(src).not.toContain('your mentor match');
    expect(src).toContain('See mentors');
  });
});

describe('S2 (MentorPool) is now the rich card, not the thin row', () => {
  const SCREEN = 'src/app/student/onboarding/screens/screen-meet-buddy.tsx';

  it('renders the same USP grid every rich mentor card on the app uses', () => {
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).toContain("['1-on-1', 'only yours']");
    expect(src).toContain("['Weekly', 'live call']");
    expect(src).toContain("['Daily', 'chat replies']");
  });

  it('the bio line is the mentor\'s own real text, never an invented quote', () => {
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).toContain('{m.bio &&');
    expect(src).not.toMatch(/I was stuck at/);
  });

  it('the journey pill only renders when a real journey exists', () => {
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).toContain('{m.journey &&');
  });

  it('the grid lives inside the per-mentor map, not as a second shared block below the whole list', () => {
    // AssignedMentor and MentorPool are two different components — one grid
    // each is correct (2 total). What must NOT exist is a THIRD, shared grid
    // rendered once for the whole pool after the .map() closes — that was
    // the actual duplicate this refactor removed.
    const src = readFileSync(SCREEN, 'utf8');
    const gridOccurrences = (src.match(/grid-cols-3 gap-2/g) ?? []).length;
    expect(gridOccurrences).toBe(2);
    // The grid must be INSIDE the mentors.map callback, not after it closes.
    expect(src).toMatch(/mentors\.map\(\(m, i\) => \([\s\S]*grid-cols-3 gap-2/);
  });
});
