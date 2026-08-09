import { describe, it, expect } from 'vitest';
import {
  ENTITY_GRAPH, entityRoute, danglingEdges, referencedColumns, type EntityKind,
} from './entity-graph';

// ── The relationship graph must describe the REAL system ────────────────────
//
// Founder, 9 Aug: "reverse integration — every entity should know everything
// connected to it. Nothing exists in isolation." A graph that claims a
// relationship the database does not have is worse than no graph: it renders a
// neighbour panel that is always empty and looks like a bug in the data rather
// than a lie in the map. These tests hold the graph to the schema.

describe('every declared relationship is symmetric', () => {
  it('has no dangling edges — if A knows B, B knows A', () => {
    // A one-directional edge is a reverse integration someone forgot to finish.
    // Open a payment and it shows its student; open that student and it must
    // show the payment back, or "nothing in isolation" is only half true.
    const dangling = danglingEdges();
    expect(
      dangling.map((d) => `${d.from} → ${d.to} (via ${d.via}) has no edge back`),
      'these relationships point one way only',
    ).toEqual([]);
  });
});

describe('the graph is internally consistent', () => {
  it('every edge points at a defined entity', () => {
    for (const node of Object.values(ENTITY_GRAPH)) {
      for (const edge of node.edges) {
        expect(ENTITY_GRAPH[edge.to], `${node.kind} → unknown entity ${edge.to}`).toBeDefined();
      }
    }
  });

  it('every entity has a table, a key, a label and a route', () => {
    for (const node of Object.values(ENTITY_GRAPH)) {
      expect(node.table, `${node.kind} has no table`).toBeTruthy();
      expect(node.idColumn, `${node.kind} has no id column`).toBeTruthy();
      expect(node.labelColumn, `${node.kind} has no label column`).toBeTruthy();
      expect(node.route, `${node.kind} has no route`).toMatch(/^\/admin/);
    }
  });

  it('the map key matches each node kind', () => {
    for (const [key, node] of Object.entries(ENTITY_GRAPH)) {
      expect(node.kind).toBe(key);
    }
  });

  it('student and buddy share the profiles table but are distinct entities', () => {
    // A student and a buddy are both profiles rows, distinguished by role.
    // They must resolve to different routes so a buddy never opens as a student.
    expect(ENTITY_GRAPH.student.table).toBe('profiles');
    expect(ENTITY_GRAPH.buddy.table).toBe('profiles');
    expect(ENTITY_GRAPH.student.route).not.toBe(ENTITY_GRAPH.buddy.route);
  });
});

describe('routes resolve', () => {
  it('substitutes the id and encodes it', () => {
    // Detail routes carry :id and encode it. List-page entities (payment,
    // coupon) have no :id slot and resolve to their list, which is correct —
    // there is no per-payment page yet, so the palette opens the list.
    expect(entityRoute('student', 'abc-123')).toBe('/admin/student/abc-123');
    expect(entityRoute('lead', 'x/y')).toContain('%2F');
  });

  it('every kind produces a usable admin route', () => {
    for (const kind of Object.keys(ENTITY_GRAPH) as EntityKind[]) {
      expect(entityRoute(kind, 'id')).toMatch(/^\/admin/);
    }
  });
});

describe('referencedColumns lists exactly what the resolver will query', () => {
  it('names a real table and column for every reference', () => {
    const refs = referencedColumns();
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) {
      expect(r.table).toBeTruthy();
      expect(r.column).toBeTruthy();
    }
  });

  it('an inbound edge references the NEIGHBOUR table, not our own', () => {
    // student → payments is inbound via student_payments.student_id. The
    // reference must land on student_payments, or the resolver queries the
    // wrong table and silently returns nothing.
    const refs = referencedColumns();
    expect(refs).toContainEqual({ table: 'student_payments', column: 'student_id' });
  });

  it('an outbound edge references OUR table', () => {
    // payment → student is outbound via student_payments.student_id (the fk
    // lives on the payment row). session → buddy is outbound via
    // video_sessions.buddy_id.
    const refs = referencedColumns();
    expect(refs).toContainEqual({ table: 'video_sessions', column: 'buddy_id' });
  });
});

// ── The schema fixture — the guard against the map drifting from the DB ──────
//
// This is the live shape of the tables the graph touches, captured 9 Aug from
// information_schema. If a migration renames a column the graph uses, this test
// fails and names it, the same way profiles-columns.json guards the routine
// engine against a phantom column. Update this fixture ONLY alongside a real
// schema change.
const LIVE_COLUMNS: Record<string, string[]> = {
  profiles: ['id', 'full_name', 'buddy_id'],
  student_payments: ['id', 'razorpay_order_id', 'student_id', 'coupon_code'],
  daily_routines: ['id', 'routine_date', 'student_id'],
  video_sessions: ['id', 'title', 'student_id', 'buddy_id'],
  notifications: ['id', 'title', 'user_id'],
  student_engagement: ['student_id'],
  student_timetables: ['student_id', 'confirmed_at'],
  coupons: ['code'],
};

describe('the graph matches the live schema', () => {
  it('every referenced column exists on its table', () => {
    const bad: string[] = [];
    for (const { table, column } of referencedColumns()) {
      const cols = LIVE_COLUMNS[table];
      if (!cols) { bad.push(`${table} is not in the schema fixture`); continue; }
      if (!cols.includes(column)) bad.push(`${table}.${column} does not exist`);
    }
    expect(bad, 'the graph references columns the database does not have').toEqual([]);
  });
});
