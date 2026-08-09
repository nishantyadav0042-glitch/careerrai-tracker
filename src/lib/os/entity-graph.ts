// ── The CareerRai relationship graph, declared once ─────────────────────────
//
// Founder, 9 Aug: "this is no longer an admin panel, it is the internal
// operating system. Reverse integration — every entity should know everything
// connected to it. Nothing exists in isolation. One owner per fact; everything
// else references it."
//
// Forward integration already exists: signup → plan → OCR → reminders → buddy
// → payment. That is the app doing its job. What did NOT exist is the reverse:
// open a payment, see the student, the coupon, the buddy, the refund. Open a
// buddy, see every student, session and rupee attached. That reverse view was
// being hand-assembled per screen (student-360.ts is one such hand-assembly),
// which is how it drifts and how a relationship gets forgotten.
//
// This file is the SINGLE declaration of the graph. Every entity names:
//   - the table that OWNS it (one owner, per the founder's rule)
//   - its neighbours, and the exact column that joins them
//
// A screen never re-derives a relationship; it reads it from here. Adding a new
// object means adding one node and its edges, and a guard test then proves the
// edges point at real tables and real columns — so "nothing in isolation" is
// enforced, not aspired to.

export type EntityKind =
  | 'student'
  | 'buddy'
  | 'payment'
  | 'plan'
  | 'session'
  | 'notification'
  | 'lead'
  | 'timetable'
  | 'coupon';

export type EdgeDirection =
  /** This entity points AT the neighbour (holds the foreign key). */
  | 'outbound'
  /** The neighbour points at THIS entity (reverse integration). */
  | 'inbound';

export interface Edge {
  /** The neighbour entity kind. */
  to: EntityKind;
  /** Human label for the relationship, shown in the UI. */
  label: string;
  /** outbound: our column holds their id. inbound: their column holds our id. */
  direction: EdgeDirection;
  /**
   * The joining column.
   * - outbound: a column on THIS entity's table holding the neighbour's id.
   * - inbound:  a column on the NEIGHBOUR's table holding this entity's id.
   */
  via: string;
  /** One neighbour (a payment has one student) or many (a buddy has many). */
  cardinality: 'one' | 'many';
}

export interface EntityNode {
  kind: EntityKind;
  /** The table that owns this entity — the single source of truth for it. */
  table: string;
  /** Primary key column on that table. */
  idColumn: string;
  /** A human name for a row, and where to read it from. */
  labelColumn: string;
  /** Admin route to open one, with `:id` as the placeholder. */
  route: string;
  edges: Edge[];
}

// Every relationship in CareerRai, in one place. `via` names the real column,
// so the guard test can verify it against the live schema.
export const ENTITY_GRAPH: Record<EntityKind, EntityNode> = {
  student: {
    kind: 'student',
    table: 'profiles',
    idColumn: 'id',
    labelColumn: 'full_name',
    route: '/admin/student/:id',
    edges: [
      { to: 'buddy', label: 'Buddy', direction: 'outbound', via: 'buddy_id', cardinality: 'one' },
      { to: 'payment', label: 'Payments', direction: 'inbound', via: 'student_id', cardinality: 'many' },
      { to: 'session', label: 'Sessions', direction: 'inbound', via: 'student_id', cardinality: 'many' },
      { to: 'timetable', label: 'Timetables', direction: 'inbound', via: 'student_id', cardinality: 'many' },
      { to: 'notification', label: 'Notifications', direction: 'inbound', via: 'user_id', cardinality: 'many' },
      { to: 'lead', label: 'Lead record', direction: 'inbound', via: 'student_id', cardinality: 'one' },
      { to: 'plan', label: 'Daily plans', direction: 'inbound', via: 'student_id', cardinality: 'many' },
    ],
  },
  buddy: {
    kind: 'buddy',
    table: 'profiles',
    idColumn: 'id',
    labelColumn: 'full_name',
    route: '/admin/buddy/:id',
    edges: [
      { to: 'student', label: 'Students assigned', direction: 'inbound', via: 'buddy_id', cardinality: 'many' },
      { to: 'session', label: 'Sessions', direction: 'inbound', via: 'buddy_id', cardinality: 'many' },
    ],
  },
  payment: {
    kind: 'payment',
    table: 'student_payments',
    idColumn: 'id',
    labelColumn: 'razorpay_order_id',
    route: '/admin/payment/:id',
    edges: [
      { to: 'student', label: 'Student', direction: 'outbound', via: 'student_id', cardinality: 'one' },
      { to: 'coupon', label: 'Coupon', direction: 'outbound', via: 'coupon_code', cardinality: 'one' },
    ],
  },
  plan: {
    kind: 'plan',
    table: 'daily_routines',
    idColumn: 'id',
    labelColumn: 'routine_date',
    route: '/admin/plan-engine',
    edges: [
      { to: 'student', label: 'Student', direction: 'outbound', via: 'student_id', cardinality: 'one' },
    ],
  },
  session: {
    kind: 'session',
    table: 'video_sessions',
    idColumn: 'id',
    labelColumn: 'title',
    route: '/admin/buddies/sessions',
    edges: [
      { to: 'student', label: 'Student', direction: 'outbound', via: 'student_id', cardinality: 'one' },
      { to: 'buddy', label: 'Buddy', direction: 'outbound', via: 'buddy_id', cardinality: 'one' },
    ],
  },
  notification: {
    kind: 'notification',
    table: 'notifications',
    idColumn: 'id',
    labelColumn: 'title',
    route: '/admin/notification-health',
    edges: [
      { to: 'student', label: 'Recipient', direction: 'outbound', via: 'user_id', cardinality: 'one' },
    ],
  },
  lead: {
    kind: 'lead',
    table: 'student_engagement',
    idColumn: 'student_id',
    labelColumn: 'student_id',
    route: '/admin/leads/:id',
    edges: [
      { to: 'student', label: 'Student', direction: 'outbound', via: 'student_id', cardinality: 'one' },
    ],
  },
  timetable: {
    kind: 'timetable',
    table: 'student_timetables',
    // One timetable per student — the table is keyed on student_id, not an id.
    idColumn: 'student_id',
    labelColumn: 'confirmed_at',
    route: '/admin/ocr',
    edges: [
      { to: 'student', label: 'Student', direction: 'outbound', via: 'student_id', cardinality: 'one' },
    ],
  },
  coupon: {
    kind: 'coupon',
    table: 'coupons',
    idColumn: 'code',
    labelColumn: 'code',
    route: '/admin/coupons',
    edges: [
      { to: 'payment', label: 'Redemptions', direction: 'inbound', via: 'coupon_code', cardinality: 'many' },
    ],
  },
};

/** The route to open an entity, id substituted. */
export function entityRoute(kind: EntityKind, id: string): string {
  return ENTITY_GRAPH[kind].route.replace(':id', encodeURIComponent(id));
}

/**
 * The graph must be symmetric: if A has an edge to B, B must acknowledge A.
 *
 * This is what "nothing exists in isolation" means concretely — a one-directional
 * relationship is a reverse integration someone forgot to finish. Returns the
 * list of edges that have no matching edge back, so a test can fail on them.
 */
export function danglingEdges(): { from: EntityKind; to: EntityKind; via: string }[] {
  const missing: { from: EntityKind; to: EntityKind; via: string }[] = [];
  for (const node of Object.values(ENTITY_GRAPH)) {
    for (const edge of node.edges) {
      const back = ENTITY_GRAPH[edge.to].edges.find(
        (e) => e.to === node.kind && e.via === edge.via,
      );
      if (!back) missing.push({ from: node.kind, to: edge.to, via: edge.via });
    }
  }
  return missing;
}

/** Every distinct (table, column) the graph references — for schema validation. */
export function referencedColumns(): { table: string; column: string }[] {
  const out: { table: string; column: string }[] = [];
  const seen = new Set<string>();
  const add = (table: string, column: string) => {
    const k = `${table}.${column}`;
    if (!seen.has(k)) { seen.add(k); out.push({ table, column }); }
  };
  for (const node of Object.values(ENTITY_GRAPH)) {
    add(node.table, node.idColumn);
    add(node.table, node.labelColumn);
    for (const edge of node.edges) {
      // outbound: the column lives on THIS node's table.
      // inbound:  the column lives on the NEIGHBOUR's table.
      if (edge.direction === 'outbound') add(node.table, edge.via);
      else add(ENTITY_GRAPH[edge.to].table, edge.via);
    }
  }
  return out;
}
