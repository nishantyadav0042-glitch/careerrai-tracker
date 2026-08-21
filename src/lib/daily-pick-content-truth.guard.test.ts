import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── A section label must mean what it says ──────────────────────────────────
//
// 21 Aug, founder, on opening Daily Pick: "how can this be in daily pick
// question?????" — a card headed "QA · PREPARATION STRATEGY" carrying a
// 15-second timer, whose content was study advice with four opinion options.
// Two of the fourteen curated challenges were like this ("Preparation
// Strategy", "Exam Strategy"); both were retired on the founder's decision.
//
// Community submissions pass a Gemini safety+classification screen. The
// curated `daily_challenges` table has NO gate at all — whatever section is
// typed at insert is what a student sees. This guard cannot read production,
// so it pins the two things the CODE controls: the section vocabulary means
// the three CAT sections and nothing else, and the timer is a property of the
// challenge, not something invented per-render.

describe('the three sections mean the three CAT sections', () => {
  it('the challenge vocabulary is exactly QA / VARC / DILR', () => {
    // A fourth "section" for strategy content would be the wrong fix — it
    // would make advice look like an exam section. Strategy content does not
    // belong in a timed, section-labelled slot at all.
    const safety = readFileSync('src/lib/community-safety.ts', 'utf8');
    expect(safety).toContain("v === 'QA' || v === 'VARC' || v === 'DILR'");
    const sections = safety.match(/"QA", "VARC", "DILR"/g);
    expect(sections, 'both screens must offer the same three sections').not.toBeNull();
  });

  it('the safety screen judges intent, not vocabulary', () => {
    // The same class of bug in the other direction: "discount" and "fees" are
    // CAT arithmetic, and blocking the WORD blocked the question.
    const safety = readFileSync('src/lib/community-safety.ts', 'utf8');
    expect(safety).toMatch(/arithmetic, not advertising/);
    const local = safety.slice(safety.indexOf('CONTACT_OR_PROMO'), safety.indexOf('localTextScreen'));
    for (const word of ['discount', 'admission', 'enroll']) {
      expect(local, `"${word}" must not be a hard local block`).not.toContain(word);
    }
  });
});

describe('the timer belongs to the content, never to the frame', () => {
  it('the target comes from the challenge row, not a constant per render', () => {
    const route = readFileSync('src/app/api/challenge/today/route.ts', 'utf8');
    expect(route).toContain('targetSeconds');
    expect(route).toMatch(/targetFor\(c\)/);
  });
});

describe('no real name can reach a shared surface', () => {
  it('the challenge route cannot resolve a student identity at all', () => {
    const route = readFileSync('src/app/api/challenge/today/route.ts', 'utf8');
    const code = route.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('full_name');
    expect(code).not.toContain('contributor_id');
  });

  it('the only byline mechanism is the anonymous generated name', () => {
    const pipeline = readFileSync('src/lib/community-pipeline.ts', 'utf8');
    expect(pipeline).toContain('randomDisplayName');
  });
});
