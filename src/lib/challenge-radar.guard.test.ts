import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isRadar, radarLabel, RADAR_KINDS, type ChallengeKind } from './challenge';

// ── The Radar drill's standing constraints ──────────────────────────────────
//
// The drill measures whether a student can decide WHICH set to open. That is
// a different faculty from knowing the syllabus, and it is the one a repeater
// who already sat through 200 hours of lectures is usually missing.
//
// The discipline it must keep: we are COLLECTING selection data, not asserting
// what it means. Nothing yet shows selection accuracy here predicts a CAT
// percentile, and no surface may imply it does until the data says so.

describe('a radar row is tellable apart from a knowledge question', () => {
  it('recognises both radar kinds and nothing else', () => {
    for (const k of RADAR_KINDS) expect(isRadar(k)).toBe(true);
    for (const k of ['question', '', null, undefined, 'radar']) expect(isRadar(k)).toBe(false);
  });

  it('a legacy row with no kind reads as a knowledge question, never as radar', () => {
    // Every row written before this migration defaults to 'question'. Treating
    // those as radar would silently relabel 14 existing challenges.
    expect(isRadar(undefined)).toBe(false);
    expect(radarLabel(undefined)).toBeNull();
  });

  it('each radar kind announces which decision is being asked for', () => {
    expect(radarLabel('radar_first')).toMatch(/first/i);
    expect(radarLabel('radar_discard')).toMatch(/drop|discard/i);
    // The two must not be interchangeable — picking the best set and picking
    // the worst are opposite judgements on the same four options.
    expect(radarLabel('radar_first')).not.toBe(radarLabel('radar_discard'));
  });

  it('a knowledge question gets no radar framing', () => {
    expect(radarLabel('question')).toBeNull();
  });
});

describe('the drill never claims more than it has collected', () => {
  /** Comments are where we write the PROHIBITION down; a guard that reads them
   *  flags the rule as though it were the violation. Only what can reach a
   *  student's screen is evidence, so strip the prose first. */
  const withoutComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const sources = [
    'src/lib/challenge.ts',
    'src/components/daily-challenge-card.tsx',
  ].map((f) => withoutComments(readFileSync(f, 'utf8')));

  it('no student-facing copy ties selection to a percentile or an outcome', () => {
    // The idea, not the characters: nothing may promise that doing well here
    // means doing well in CAT. We have 29 attempts and zero evidence.
    for (const src of sources) {
      expect(src).not.toMatch(/selection .{0,40}(percentile|score|rank)/i);
      expect(src).not.toMatch(/(predicts?|guarantees?|means you will) .{0,30}percentile/i);
    }
  });

  it('a wrong radar pick is not scored like a wrong fact', () => {
    // Set selection is a judgement call; a defensible pick that was not the
    // best one must not be told "Not this time" as though it were an error.
    const card = sources[1];
    expect(card).toMatch(/isRadar\(challenge\.kind\)/);
    expect(card).toMatch(/better opening move/i);
  });
});

describe('the kind vocabulary matches what the database will accept', () => {
  it('every kind the code can emit is in the migration’s check constraint', () => {
    const migration = readFileSync('supabase/migrations/20260822a_challenge_kind_radar.sql', 'utf8');
    const kinds: ChallengeKind[] = ['question', ...RADAR_KINDS];
    for (const k of kinds) expect(migration).toContain(`'${k}'`);
  });
});
