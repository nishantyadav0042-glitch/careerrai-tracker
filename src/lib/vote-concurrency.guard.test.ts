import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── One tap, one vote — never a queue of one ────────────────────────────────
//
// Founder, 14 Aug: "it isn't letting me tap. If a student scrolls and votes on
// four questions at once, why have you limited it to one?"
//
// He was right and the cause was a single global lock: `busy: string | null`
// with an `if (busy) return` guard at the top of vote(). While ANY vote was in
// flight, every other tap hit that guard and returned silently. On a phone
// that is a 200-800ms dead window after each tap — and the other buttons still
// rendered enabled, so the feed looked live while dropping input on the floor.
// He landed 3 votes across two days of trying.
//
// Votes are independent rows on independent submissions; the API has no
// per-student cap at all, only a unique constraint per (student, submission).
// So they run in parallel, and only a repeat tap on the SAME item is blocked.

const SURFACES = [
  'src/components/student-insights.tsx',
  'src/components/community-vote-card.tsx',
];

describe('votes on different items never block each other', () => {
  for (const file of SURFACES) {
    const name = file.split('/').pop();

    it(`${name} tracks in-flight votes per item, not globally`, () => {
      const src = readFileSync(file, 'utf8');
      // Scoped to the busy declaration: other nullable-string state on these
      // screens (sharedId) is unrelated and legitimate.
      expect(src).toMatch(/const \[busy, setBusy\] = useState<Set<string>>\(new Set\(\)\)/);
      expect(src).not.toMatch(/const \[busy, setBusy\] = useState<string \| null>/);
    });

    it(`${name} guards only the SAME item, never every item`, () => {
      // Comments may describe the old bug; only the code must be free of it.
      const code = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
      expect(code).toContain('busy.has(item.id)');
      // The guard that silently ate taps 2, 3 and 4.
      expect(code).not.toMatch(/if \(busy\)\s*return/);
    });

    it(`${name} disables only the button actually in flight`, () => {
      const src = readFileSync(file, 'utf8');
      // 20 Aug: canVote joined the disabled condition (self-votes), but the
      // busy lock must stay PER-ITEM — the original bug was one global lock.
      expect(src).toMatch(/disabled=\{busy\.has\(item\.id\)/);
      expect(src).not.toContain('disabled={busy === item.id}');
    });

    it(`${name} releases only its own item when done`, () => {
      // setBusy(null) would clear the whole set and let a double-tap through.
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('n.delete(item.id)');
      expect(src).not.toMatch(/setBusy\(null\)/);
    });
  }
});

describe('the server never capped votes either', () => {
  it('one vote per submission, and no per-student total', () => {
    // The limit was purely a client bug; confirming the API stays open so a
    // future "fix" is not attempted in the wrong layer.
    const src = readFileSync('src/app/api/community/vote/route.ts', 'utf8');
    // 20 Aug: insert became upsert-on-uniqueness (a vote is changeable now);
    // still one row per (student, submission), still no volume cap.
    expect(src).toMatch(/from\('submission_votes'\)\.upsert/);
    expect(src).toContain("onConflict: 'student_id,submission_id'");
    // A daily/total cap would look like a count() against submission_votes.
    expect(src).not.toMatch(/count\([\s\S]{0,80}submission_votes/);
  });
});
