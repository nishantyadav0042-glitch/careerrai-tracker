/**
 * Guards on the verified external-resource map.
 *
 * Every rule here exists because the research that produced this data broke it
 * at least once. Nine candidate videos did not exist; twenty-two durations were
 * wrong, several by twenty minutes or more; three videos were credited to the
 * wrong channel. See docs/phase0/VERIFICATION-FINAL.md. These tests are the
 * standing cost of never shipping that to a student.
 */
import { describe, it, expect } from 'vitest';
import { TOPIC_RESOURCES, resourceFor, resourceCoverage, type ResourceIntent } from './topic-resources';
import { KNOWLEDGE_GRAPH } from './topics-constants';

const ALL_UNITS = new Set(KNOWLEDGE_GRAPH.flatMap((s) => s.groups).flatMap((g) => g.units));

// Units modern CAT does not test as question types. Grammar was dropped from
// the exam after 2014; the rest are tested only inside Reading Comprehension.
// They may carry ONE orientation pointer, never a practice ladder — otherwise
// the planner would be sending students to practise a question type that does
// not exist.
const SKILL_UNITS = new Set(['Grammar', 'Vocabulary', 'Editorial Reading', 'Reading Speed Practice']);

describe('topic-resources: every key is a real unit', () => {
  it('never invents a topic name outside the knowledge graph', () => {
    // A typo here would silently orphan the resource: the lookup is by exact
    // topic string, so a near-miss key attaches to nothing and fails silently.
    for (const topic of Object.keys(TOPIC_RESOURCES)) {
      expect(ALL_UNITS.has(topic), `"${topic}" is not a unit in topics-constants`).toBe(true);
    }
  });
});

describe('topic-resources: the data must stay verifiable', () => {
  const rows = Object.entries(TOPIC_RESOURCES).flatMap(([t, rs]) => rs.map((r) => [t, r] as const));

  it('carries a real YouTube video id in every row', () => {
    for (const [topic, r] of rows) {
      expect(r.videoId, `${topic}/${r.intent}`).toMatch(/^[A-Za-z0-9_-]{11}$/);
    }
  });

  it('records a real duration, never zero and never an unreviewed marathon', () => {
    // 45 minutes is the ceiling a single daily topic block can hold. Anything
    // longer is real content but needs a splitting decision before a student
    // is pointed at it mid-task.
    for (const [topic, r] of rows) {
      expect(r.realMinutes, `${topic}/${r.intent}`).toBeGreaterThan(0);
      expect(r.realMinutes, `${topic}/${r.intent} exceeds a daily task block`).toBeLessThanOrEqual(45);
    }
  });

  it('records when each row was last checked against the platform', () => {
    for (const [topic, r] of rows) {
      expect(r.verifiedOn, `${topic}/${r.intent}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('names a channel for every row', () => {
    // The provenance gate is channel-level. Three research rows credited the
    // wrong channel, which would have meant vetting one creator and shipping
    // another's video.
    for (const [topic, r] of rows) {
      expect(r.channel.trim().length, `${topic}/${r.intent}`).toBeGreaterThan(0);
    }
  });
});

describe('topic-resources: one resource per slot, no duplicates', () => {
  it('never lists the same intent twice for a topic', () => {
    for (const [topic, rs] of Object.entries(TOPIC_RESOURCES)) {
      const intents = rs.map((r) => r.intent);
      expect(new Set(intents).size, `${topic} has a duplicate intent`).toBe(intents.length);
    }
  });

  it('never reuses one video for two intents in the same topic', () => {
    // The research did exactly this: one Average video was returned as both
    // L1 and L2 under two different titles, and one Time & Work video was
    // graded two levels apart across runs.
    for (const [topic, rs] of Object.entries(TOPIC_RESOURCES)) {
      const ids = rs.map((r) => r.videoId);
      expect(new Set(ids).size, `${topic} reuses a video across intents`).toBe(ids.length);
    }
  });
});

describe('topic-resources: skill units get a pointer, not a ladder', () => {
  it('gives non-question-type units at most one concept resource', () => {
    for (const unit of SKILL_UNITS) {
      const rs = TOPIC_RESOURCES[unit];
      if (!rs) continue;
      expect(rs.length, `${unit} should carry at most one orientation pointer`).toBeLessThanOrEqual(1);
      expect(rs[0].intent, `${unit} must not carry a practice intent`).toBe('concept');
    }
  });
});

describe('resourceFor', () => {
  it('returns null for a topic we have nothing verified for', () => {
    // The overwhelmingly common case, and the card must render fine without a
    // resource. Absence is a normal state, never an error.
    expect(resourceFor('Base System', 'concept')).toBeNull();
    expect(resourceFor('not a real topic', 'concept')).toBeNull();
  });

  it('returns the matching intent when we do have one', () => {
    const r = resourceFor('Percentages', 'concept');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('concept');
    expect(r!.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
  });

  it('returns null for an intent a covered topic does not have', () => {
    // Partial ladders are the norm — most topics have two or three intents,
    // not four, and the caller must handle the hole.
    const covered = Object.keys(TOPIC_RESOURCES)[0];
    const have = new Set(TOPIC_RESOURCES[covered].map((r) => r.intent));
    const missing = (['concept', 'practice_easy', 'practice_cat', 'exam_ready'] as ResourceIntent[])
      .find((i) => !have.has(i));
    if (missing) expect(resourceFor(covered, missing)).toBeNull();
  });
});

describe('resourceCoverage', () => {
  it('reports honest totals', () => {
    const c = resourceCoverage();
    expect(c.topics).toBe(Object.keys(TOPIC_RESOURCES).length);
    expect(c.resources).toBeGreaterThan(0);
  });
});
