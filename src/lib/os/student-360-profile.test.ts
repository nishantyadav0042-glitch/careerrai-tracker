import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ENTITY_GRAPH } from '@/lib/os/entity-graph';

// The student profile must render EVERY relationship the graph declares for a
// student. If the graph gains an edge, the profile shows it for free — that is
// the whole point of resolving from the graph rather than hand-listing panels.

describe('the student 360 renders its graph neighbours', () => {
  const page = readFileSync('src/app/admin/student/[id]/page.tsx', 'utf8');

  it('resolves the entity and renders the connected panel', () => {
    expect(page).toContain("resolveEntity(admin, 'student', id)");
    expect(page).toContain('<EntityNeighbours');
  });

  it('pins this student\'s sacred alerts at the top', () => {
    expect(page).toContain('findSacredFailures');
    expect(page).toContain('a.student.id === id');
  });

  it('the neighbours component draws every group the resolver returns', () => {
    // No hard-coded panel list — it maps over entity.neighbours, so a new edge
    // appears automatically.
    const comp = readFileSync('src/components/admin/entity-neighbours.tsx', 'utf8');
    expect(comp).toContain('entity.neighbours');
    expect(comp).toContain('.map((g)');
  });
});

describe('the student node declares the relationships a founder expects', () => {
  it('a student connects to buddy, payments, sessions, timetables, notifications and plans', () => {
    const targets = ENTITY_GRAPH.student.edges.map((e) => e.to);
    for (const expected of ['buddy', 'payment', 'session', 'timetable', 'notification', 'plan']) {
      expect(targets, `student is missing its ${expected} edge`).toContain(expected);
    }
  });
});
