import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The onboarding mentor screen must never claim a match that hasn't happened ─
//
// Found 13 Aug while building the S2 mock into real code: the shipped
// "Meet your mentor" screen showed the single top-ranked real buddy labelled
// "Matched for you", with copy claiming they were "already guiding students
// like you" and that upgrading gets the match "confirmed the same day".
//
// Every fact in that claim was individually true (the buddy is real, their
// stats are real) — the claim ITSELF was not. buddy_id is written by a human
// admin, after payment, and could go to any buddy in the pool; nothing at
// onboarding time has matched this student to that specific person. And "same
// day" over-promises the real SLA (lib/premium.ts's actual notification says
// "within 24 hours"). Trust OS: "A mentor match is a promise, not a feature
// flip" — this screen was making that promise before it was true.
//
// Founder's fix, on being asked directly: real mentor pool, no fake match.

const SCREEN = 'src/app/student/onboarding/screens/screen-meet-buddy.tsx';
const ROUTE = 'src/app/api/student/mentor-match/route.ts';

describe('the unassigned state shows a pool, never a single "matched" claim', () => {
  it('no longer claims a specific person is matched before assignment', () => {
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).not.toContain('Matched for you');
    expect(src).not.toContain('already guiding students like you');
    expect(src).not.toContain('confirmed the same day');
  });

  it('renders a pool component for the unassigned case', () => {
    expect(readFileSync(SCREEN, 'utf8')).toContain('function MentorPool');
  });

  it('the SLA line matches the real one the product sends post-payment', () => {
    // lib/premium.ts's actual notification: "assigned within 24 hours".
    // This screen must never promise something faster or more certain.
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).toContain('within 24 hours');
    expect(src).not.toContain('same day');
  });
});

describe('the assigned state is untouched — it was already honest', () => {
  it('still shows the one real mentor when buddy_id genuinely exists', () => {
    const src = readFileSync(SCREEN, 'utf8');
    expect(src).toContain('function AssignedMentor');
    expect(src).toContain("Your mentor");
  });
});

describe('one ranking engine, not two', () => {
  it('the route no longer hand-rolls its own rankBuddies call for the pool', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toContain('getRecommendedBuddiesForStudent');
    // The old inline duplicate queried buddies directly and called rankBuddies
    // itself instead of reusing the shared showcase function.
    expect(src).not.toMatch(/rankBuddies\(/);
  });

  it('never recommends a test/demo account — same guarantee the showcase makes', () => {
    // Enforced inside getRecommendedBuddiesForStudent itself; this just pins
    // that the route still goes through that function rather than a bypass.
    const route = readFileSync(ROUTE, 'utf8');
    const lib = readFileSync('src/lib/buddy-match.ts', 'utf8');
    expect(route).toContain('getRecommendedBuddiesForStudent(admin, user.id)');
    expect(lib).toContain('is_test_account');
  });
});
