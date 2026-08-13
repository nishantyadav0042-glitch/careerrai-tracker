import { describe, it, expect } from 'vitest';
import {
  TOPIC_METADATA, KNOWLEDGE_GRAPH, ONBOARDING_CORE_GRAPH,
  QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS,
} from './topics-constants';

// ── One taxonomy, or the planner forgets chapters ───────────────────────────
//
// Backbone audit, 13 Aug. Production held four coverage rows for topics that
// do not exist in our taxonomy — 'Averages' (the canonical name is 'Average')
// and 'RC Fundamentals' (canonical: 'Reading Comprehension'), left behind by
// an old rename. They were inert: the planner iterates TOPIC_METADATA, so it
// simply never saw them, and each student's real row already carried an equal
// or further-along status. But they surfaced as phantom duplicate topics on
// the review screen, and the failure mode they represent is severe — rename a
// topic without migrating and every student's declared progress on it goes
// quiet, with no error anywhere.
//
// These assertions make that impossible to ship again.

const SECTION_LISTS = { QA: QUANT_TOPICS, VARC: VERBAL_TOPICS, DILR: LRDI_TOPICS } as const;
const SYLLABUS = [...QUANT_TOPICS, ...VERBAL_TOPICS, ...LRDI_TOPICS];

describe('the syllabus taxonomy is internally consistent', () => {
  it('every syllabus topic has metadata, and every metadata entry is a syllabus topic', () => {
    const meta = new Set(Object.keys(TOPIC_METADATA));
    const list = new Set(SYLLABUS);
    expect(SYLLABUS.filter((t) => !meta.has(t)), 'topics with no metadata').toEqual([]);
    expect([...meta].filter((t) => !list.has(t)), 'metadata for topics in no section').toEqual([]);
  });

  it('no topic is duplicated, and none belongs to two sections', () => {
    expect(new Set(SYLLABUS).size).toBe(SYLLABUS.length);
    for (const t of SYLLABUS) {
      const sections = Object.entries(SECTION_LISTS).filter(([, l]) => (l as readonly string[]).includes(t));
      expect(sections.map(([s]) => s), `${t} sits in ${sections.length} sections`).toHaveLength(1);
    }
  });

  it('every topic carries a usable weightage', () => {
    for (const [topic, meta] of Object.entries(TOPIC_METADATA)) {
      expect(typeof meta.weightage, `${topic}`).toBe('number');
      expect(meta.weightage, `${topic}`).toBeGreaterThanOrEqual(1);
      expect(meta.weightage, `${topic}`).toBeLessThanOrEqual(5);
    }
  });
});

describe('prerequisites can never deadlock the planner', () => {
  it('every prerequisite names a topic that exists', () => {
    const known = new Set(Object.keys(TOPIC_METADATA));
    const dangling: string[] = [];
    for (const [topic, meta] of Object.entries(TOPIC_METADATA)) {
      for (const p of meta.prerequisites ?? []) if (!known.has(p)) dangling.push(`${topic} → ${p}`);
    }
    expect(dangling).toEqual([]);
  });

  it('the prerequisite graph is acyclic', () => {
    // A cycle would leave every topic in it permanently penalised, and no
    // amount of studying could clear it.
    const state = new Map<string, 0 | 1 | 2>();
    const cycles: string[] = [];
    const visit = (n: string, path: string[]) => {
      if (state.get(n) === 1) { cycles.push([...path, n].join(' → ')); return; }
      if (state.get(n) === 2) return;
      state.set(n, 1);
      for (const p of TOPIC_METADATA[n]?.prerequisites ?? []) visit(p, [...path, n]);
      state.set(n, 2);
    };
    for (const t of Object.keys(TOPIC_METADATA)) visit(t, []);
    expect(cycles).toEqual([]);
  });
});

describe('what we seed matches what we plan', () => {
  // KNOWLEDGE_GRAPH seeds the coverage matrix and deliberately holds MORE than
  // the syllabus: habit rows under MOCKS and READING that are tracked but
  // never planned as topics. That is by design — but every seeded row that
  // claims a SYLLABUS section must be a real syllabus topic, or it becomes
  // another 'Averages': a row the student can move that the planner will
  // never read.
  const SYLLABUS_SECTIONS = new Set(['QA', 'VARC', 'DILR']);
  const rows = (graph: typeof KNOWLEDGE_GRAPH) =>
    graph.flatMap((s) => s.groups.flatMap((g) => g.units.map((topic) => ({ section: s.id, topic }))));
  const SEEDED = rows(KNOWLEDGE_GRAPH);

  it('every seeded row in a syllabus section is a real syllabus topic', () => {
    const syllabus = new Set(SYLLABUS);
    const orphans = SEEDED
      .filter((r) => SYLLABUS_SECTIONS.has(r.section) && !syllabus.has(r.topic))
      .map((r) => `${r.section}/${r.topic}`);
    expect(orphans, 'seeded rows the planner can never see').toEqual([]);
  });

  it('every syllabus topic is actually seeded — none is unreachable', () => {
    const seeded = new Set(SEEDED.map((r) => r.topic));
    expect(SYLLABUS.filter((t) => !seeded.has(t)), 'syllabus topics with no coverage row').toEqual([]);
  });

  it('the habit rows are seeded but never planned as topics', () => {
    // MOCKS/READING rows are tracked in the matrix and deliberately absent
    // from TOPIC_METADATA — the planner must never try to schedule them.
    const habit = SEEDED.filter((r) => !SYLLABUS_SECTIONS.has(r.section));
    expect(habit.length).toBeGreaterThan(0);
    for (const r of habit) expect(TOPIC_METADATA[r.topic], `${r.topic} would be planned`).toBeUndefined();
  });

  it('the onboarding grid only asks about topics we actually seed', () => {
    const seeded = new Set(SEEDED.map((r) => r.topic));
    const asked = rows(ONBOARDING_CORE_GRAPH).map((r) => r.topic);
    expect(asked.filter((t) => !seeded.has(t)), 'asked at onboarding but never stored').toEqual([]);
  });

  it('the seed has no duplicate rows', () => {
    const keys = SEEDED.map((r) => `${r.section}/${r.topic}`);
    expect(new Set(keys).size, 'duplicate seed rows').toBe(keys.length);
  });

  it('the counts the docs quote are the counts the code holds', () => {
    // Stale numbers here are how "43 topics?" gets asked in the first place.
    expect(SYLLABUS.length, 'syllabus topics').toBe(46);
    expect(SEEDED.length, 'coverage rows seeded per student').toBe(53);
    expect(rows(ONBOARDING_CORE_GRAPH).length, 'units asked at onboarding').toBe(45);
  });
});
