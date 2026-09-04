import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOnly } from './test-support/code-only';
import { firstVerdict } from './first-verdict';
import { TOPIC_METADATA } from './topics-constants';

/**
 * ── THE FIRST VERDICT — HONESTY BOUNDARIES AND ACTIVATION WIRING ────────────
 *
 * From the 4 Sep activation forensic: 785/1,044 real students never logged;
 * 78% who opened the logging modal did it inside their first hour. This is
 * the interpretive-verdict fix the founder signed off, in place of asking a
 * brand-new student to report study they have not done.
 *
 * What these tests protect, in order of importance:
 *   1. It NEVER claims ability. Only coverage-balance sentences are possible
 *      — this is the whole honesty budget of the feature.
 *   2. It returns null rather than fabricate a story from too little data.
 *   3. It is wired to show ONLY to a never-logged student, and its CTA
 *      points at the existing plan section — no new modal, no new ask.
 */

const QA_TOPICS = Object.keys(TOPIC_METADATA).filter((t) => TOPIC_METADATA[t].section === 'QA');
const VARC_TOPICS = Object.keys(TOPIC_METADATA).filter((t) => TOPIC_METADATA[t].section === 'VARC');
const DILR_TOPICS = Object.keys(TOPIC_METADATA).filter((t) => TOPIC_METADATA[t].section === 'DILR');

function entries(topics: string[], status: string) {
  return topics.map((topic) => ({ topic, status }));
}

describe('firstVerdict — the honesty boundary', () => {
  it('returns null on a completely blank matrix — nothing to interpret', () => {
    const memory = [...entries(QA_TOPICS, 'not_started'), ...entries(VARC_TOPICS, 'not_started'), ...entries(DILR_TOPICS, 'not_started')];
    expect(firstVerdict(memory, null)).toBeNull();
  });

  it('returns null when only one section has any matrix rows at all — no real comparison exists', () => {
    // Genuinely missing rows (not "marked not_started") — computeTopicMemory
    // never actually produces this shape in production (it backfills every
    // topic as not_started), but the function must not crash or fabricate a
    // comparison if a caller ever hands it a sparse matrix.
    const memory = entries(QA_TOPICS, 'learning');
    expect(firstVerdict(memory, null)).toBeNull();
  });

  it('returns null when every section has near-identical attention — no gap worth pointing at', () => {
    // ~30% touched in every section: too even to produce a meaningful "quietest".
    const touch = (topics: string[], frac: number) =>
      topics.map((topic, i) => ({ topic, status: i < Math.round(topics.length * frac) ? 'learning' : 'not_started' }));
    const memory = [...touch(QA_TOPICS, 0.3), ...touch(VARC_TOPICS, 0.32), ...touch(DILR_TOPICS, 0.28)];
    expect(firstVerdict(memory, null)).toBeNull();
  });

  it('produces a real verdict when one section is clearly quieter than another', () => {
    const memory = [
      ...entries(QA_TOPICS, 'learning'),          // fully touched
      ...entries(VARC_TOPICS, 'learning'),         // fully touched
      ...entries(DILR_TOPICS, 'not_started'),      // untouched
    ];
    const v = firstVerdict(memory, null);
    expect(v).not.toBeNull();
    expect(v!.quietestSection.section).toBe('DILR');
    expect(v!.touchedTopics).toBe(QA_TOPICS.length + VARC_TOPICS.length);
  });

  it('unknown/renamed topic keys are skipped, not crashed on', () => {
    const memory = [...entries(QA_TOPICS, 'learning'), ...entries(VARC_TOPICS, 'learning'), { topic: 'Some Retired Topic', status: 'learning' }];
    expect(() => firstVerdict(memory, null)).not.toThrow();
  });

  it('flags disagreement only when the self-reported weakest section differs from the observed quietest', () => {
    const memory = [
      ...entries(QA_TOPICS, 'learning'),
      ...entries(VARC_TOPICS, 'learning'),
      ...entries(DILR_TOPICS, 'not_started'), // quietest = DILR
    ];
    const agree = firstVerdict(memory, 'DILR');
    expect(agree!.selfReportDisagreesWithCoverage, 'same section — no disagreement to flag').toBe(false);

    const disagree = firstVerdict(memory, 'QA');
    expect(disagree!.selfReportDisagreesWithCoverage, 'says QA, coverage says DILR — a real disagreement').toBe(true);
  });

  it('never assembles a sentence claiming ability — only coverage words appear in source', () => {
    // A guard against the single most important regression this file could
    // ever suffer: someone adding a string like "you are weak at" or
    // "your accuracy in" without the evidence to back it.
    const src = codeOnly(readFileSync('src/lib/first-verdict.ts', 'utf8'));
    const banned = /\b(weak at|strong at|good at|bad at|accuracy|your score|you scored|percentile is)\b/i;
    expect(src, 'this module has no evidence for ability claims — only coverage').not.toMatch(banned);

    const componentSrc = codeOnly(readFileSync('src/components/first-verdict-card.tsx', 'utf8'));
    expect(componentSrc, 'the rendered card must not claim ability either').not.toMatch(banned);
  });
});

describe('the tracker page wiring — activation-forensic gate', () => {
  const page = codeOnly(readFileSync('src/app/student/tracker/page.tsx', 'utf8'));

  it('the verdict is computed ONLY for a student with zero logs', () => {
    expect(page).toMatch(/const verdict = \(logs\?\.length \?\? 0\) === 0/);
    expect(page).toMatch(/\? firstVerdict\(topicMemory,/);
  });

  it('the CTA anchor exists on the plan section — no new modal, no new ask', () => {
    expect(page).toMatch(/id="todays-plan"/);
  });

  it('the card is rendered conditionally, never unconditionally', () => {
    expect(page).toMatch(/\{verdict && <FirstVerdictCard/);
  });
});
