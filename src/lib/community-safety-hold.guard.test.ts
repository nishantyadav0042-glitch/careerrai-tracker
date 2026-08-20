import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── A held submission must have a way out ──────────────────────────────────
//
// The safety screen fails CLOSED by design: if Gemini cannot answer (outage,
// missing key, malformed JSON), the submission is parked at 'pending' rather
// than published unchecked. That is correct — and it means an outage parks
// REAL student contributions.
//
// Found 20 Aug: there was no publish button anywhere for those. The one
// screen that looked like a review queue belonged to a retired moderation
// generation — it read student_submissions where status='pending' and tried
// to promote them into daily_challenges by reading payload.options, an MCQ
// shape the live submission path has never written. Every column it needed
// is NOT NULL, so Approve could only ever return a 500, and the submission
// would sit held forever while the student assumed it was shared.
//
// Two generations of the word "pending" met in one table. The retired one is
// gone; the surviving one has a real review home.

const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the retired moderation generation is gone', () => {
  it('the challenge admin no longer reads or resolves student submissions', () => {
    const s = code('src/app/api/admin/challenges/route.ts');
    expect(s, "it must not claim the safety-hold queue").not.toMatch(/status'?,?\s*'pending'/);
    expect(s, 'the MCQ promotion path is retired').not.toContain('correct_index: p.correct_index');
    expect(s, "the review action is retired").not.toMatch(/action === 'review'/);
  });

  it('its UI panel is gone too, not just the endpoint', () => {
    const s = read('src/app/admin/challenges/page.tsx');
    expect(s).not.toContain('Student submissions ·');
    expect(s).not.toMatch(/action: 'review'/);
  });
});

describe('a safety hold can always be resolved', () => {
  it('the Daily Pick admin serves the held queue', () => {
    const s = code('src/app/api/admin/daily-pick-stats/route.ts');
    expect(s).toMatch(/eq\('status', 'pending'\)/);
    expect(s).toContain('pending:');
  });

  it('it offers exactly two outcomes, and only on a held item', () => {
    const s = code('src/app/api/admin/daily-pick-stats/route.ts');
    expect(s).toContain("decision !== 'publish' && decision !== 'block'");
    expect(s).toContain("decision === 'publish' ? 'live' : 'blocked'");
    // The guard that stops a resolve racing another admin, or resurrecting
    // something already blocked.
    expect(s).toMatch(/eq\('status', 'pending'\)[\s\S]{0,80}$|eq\('id', id\)[\s\S]{0,120}eq\('status', 'pending'\)/m);
  });

  it('the admin screen actually renders the queue and the buttons', () => {
    const s = read('src/app/admin/daily-pick/page.tsx');
    expect(s).toContain('Held for review');
    expect(s).toContain("resolve(p.id, 'publish')");
    expect(s).toContain("resolve(p.id, 'block')");
  });

  it('the submit route still fails closed — a hold is the safe outcome', () => {
    const s = code('src/app/api/community/submit/route.ts');
    expect(s).toContain("anyManual ? 'pending' : 'live'");
  });
});
