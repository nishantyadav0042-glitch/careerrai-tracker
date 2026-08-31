import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The Share funnel must be able to tell friction from failure ─────────────
//
// Production, 21 Aug: 196 students opened Daily Pick, 145 saw a pick, 30
// voted, 11 opened Share — and 0 ever submitted. Every community item in the
// database (88 of them) is curated by us; not one student contribution has
// ever completed.
//
// The forensic could not say WHY, and that was an instrumentation defect, not
// a mystery: only 'opened' and 'blocked' were recorded, so a student who
// looked and changed their mind was indistinguishable from one whose send
// died in the network. Founder's rule: every failure must be observable —
// and telemetry must never become part of the student's experience.

const SHEET = 'src/components/community-submit.tsx';
const src = readFileSync(SHEET, 'utf8');

describe('every outcome after Send is observable', () => {
  it('pressing Send is recorded, so intent is separable from completion', () => {
    expect(src).toContain("track('community_share_attempted'");
    // It must fire BEFORE the request, or a failure would never be attributed
    // to an attempt at all.
    const attempt = src.indexOf("track('community_share_attempted'");
    const fetchAt = src.indexOf("fetch('/api/community/submit'");
    expect(attempt).toBeGreaterThan(-1);
    expect(attempt).toBeLessThan(fetchAt);
  });

  it('a send that never reached the server is no longer silent', () => {
    // THE blind spot: `catch { setError(...) }` with no event.
    const catchBlock = src.slice(src.indexOf('} catch'), src.indexOf('setBusy(false);\n  }'));
    expect(catchBlock).toContain("track('community_share_failed'");
  });

  it('a server rejection still records the reason code', () => {
    expect(src).toMatch(/track\('community_share_blocked',\s*\{[^}]*code/);
  });

  it('success is recorded exactly once, on the success path only', () => {
    expect(src).toContain("track('community_submitted'");
    const submitted = src.indexOf("track('community_submitted'");
    const notOk = src.indexOf('if (!res.ok)');
    expect(submitted, 'success must be tracked after the not-ok early return').toBeGreaterThan(notOk);
  });

  it('all four rungs are declared in the one event vocabulary', () => {
    const journey = readFileSync('src/lib/journey.ts', 'utf8');
    for (const e of ['community_share_opened', 'community_share_attempted',
                     'community_share_blocked', 'community_share_failed']) {
      expect(journey, `${e} is not a declared event`).toContain(`'${e}'`);
    }
  });
});

describe('telemetry never becomes part of the product', () => {
  it('no tracking call renders anything or blocks the student', () => {
    // Founder rule 16: instrument the funnel, never show the student the
    // instrument. `track` is fire-and-forget and must never be awaited into
    // the path that decides whether their share is sent.
    expect(src).not.toMatch(/await\s+track\(/);
    expect(src).not.toMatch(/if\s*\(\s*await\s+track/);
  });

  it('the student is still asked for nothing but their content', () => {
    // Rule 6: no classification metadata. The sheet must not regrow a
    // section/topic/kind chooser — the server infers all three.
    expect(src).not.toMatch(/Select a section|Choose a topic|<select/i);
    // Send opens on a photo OR enough text, and on nothing else. The exact
    // floor moved on 31 Aug (10 -> MIN_TIP_CHARS) when text-only became a
    // hint; what must not change is that only their own content opens it.
    expect(src).toMatch(/image != null \|\| trimmed\.length >= MIN_TIP_CHARS/);
  });
});

// ── The Send button must never look frozen (21 Aug incident) ────────────────
//
// The original failure was not only slow: it was SILENT. One opaque
// "Checking & sending…" for 20-40 seconds, so the student concluded it was
// broken, pressed again, and was told they had already shared today - for a
// share they believed had failed.

describe('a long wait is narrated, never frozen', () => {
  it('the wait has stages, and they advance on a clock', () => {
    expect(src).toMatch(/setTimeout\(\(\) => setStage\(1\)/);
    expect(src).toMatch(/setTimeout\(\(\) => setStage\(2\)/);
    expect(src).toMatch(/setTimeout\(\(\) => setStage\(3\)/);
    // Four distinct sentences, so 30 seconds never reads as one dead moment.
    expect(src).toMatch(/'Sending…'[\s\S]{0,120}'Almost there/);
  });

  it('every exit path stops the clock — no stage text outlives the request', () => {
    // A stale timer would relabel a finished request, which is its own lie.
    const submitBody = src.slice(src.indexOf('async function submit()'), src.indexOf('return ('));
    const exits = submitBody.match(/stopTicking\(\)/g) ?? [];
    expect(exits.length, 'blocked, submitted, failed and the final exit').toBeGreaterThanOrEqual(4);
  });

  it('no fake progress percentage is invented', () => {
    // fetch cannot report upload progress; a percentage here would be fiction.
    expect(src).not.toMatch(/progress\s*[:=]\s*\d/);
    expect(src).not.toContain('%"');
  });

  it('preparing a photo is visible too, so a big image never looks frozen', () => {
    expect(src).toContain("'Preparing photo…'");
    expect(src).toMatch(/disabled=\{preparing\}/);
  });

  it('the REAL end-to-end duration is recorded on every outcome', () => {
    // The server timing log starts after Vercel buffers the body, so it cannot
    // see the upload leg. Only the client can measure what the student felt.
    for (const evt of ['community_submitted', 'community_share_blocked', 'community_share_failed']) {
      const at = src.indexOf(`track('${evt}'`);
      expect(at, `${evt} missing`).toBeGreaterThan(-1);
      expect(src.slice(at, at + 260)).toContain('ms:');
    }
  });
});
