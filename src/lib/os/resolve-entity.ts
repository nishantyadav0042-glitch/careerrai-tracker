import { ENTITY_GRAPH, entityRoute, type EntityKind, type Edge } from './entity-graph';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── Walk the graph for one entity, against the live database ────────────────
//
// Given any entity — a student, a payment, a session, a notification — this
// returns every neighbour the graph declares, resolved to real rows. It is the
// single engine behind "open X and never leave the page": the screen decides
// how to render, this decides what is connected.
//
// One function for every entity kind, because the relationships live in
// entity-graph.ts as data. Adding an object to the graph makes it resolvable
// here for free — no new query code, nothing to keep in sync. That is the
// "one owner per fact" rule paying off: the relationship is declared once and
// read everywhere.

export interface NeighbourRow {
  id: string;
  label: string;
  route: string;
  /** A one-line summary for the card, when the row carries useful state. */
  detail?: string;
}

export interface NeighbourGroup {
  /** The relationship, e.g. "Payments" or "Buddy". */
  label: string;
  kind: EntityKind;
  cardinality: 'one' | 'many';
  rows: NeighbourRow[];
  /** True when we capped the result — the founder sees the cap, never a lie. */
  truncated: boolean;
}

const MAX_PER_EDGE = 50;

function rowLabel(kind: EntityKind, row: Record<string, any>): string {
  const node = ENTITY_GRAPH[kind];
  const raw = row[node.labelColumn];
  if (raw == null || raw === '') return `${kind} ${String(row[node.idColumn]).slice(0, 8)}`;
  return String(raw);
}

async function resolveEdge(admin: Admin, edge: Edge, selfId: string): Promise<NeighbourGroup> {
  const neighbour = ENTITY_GRAPH[edge.to];
  const base = { label: edge.label, kind: edge.to, cardinality: edge.cardinality };

  if (edge.direction === 'outbound') {
    // Our row holds the neighbour's id in `edge.via`; but we are given only our
    // OWN id, so the caller must have already fetched our row. To keep this
    // engine self-contained we re-read the single foreign key we need.
    // (Handled by the caller passing the fk value — see resolveEntity.)
    return { ...base, rows: [], truncated: false };
  }

  // inbound: the neighbour's table has a column (`edge.via`) pointing at us.
  const { data } = await admin
    .from(neighbour.table)
    .select('*')
    .eq(edge.via, selfId)
    .limit(MAX_PER_EDGE + 1);

  const rows = (data ?? []).slice(0, MAX_PER_EDGE).map((r: Record<string, any>) => ({
    id: String(r[neighbour.idColumn]),
    label: rowLabel(edge.to, r),
    route: entityRoute(edge.to, String(r[neighbour.idColumn])),
  }));

  return { ...base, rows, truncated: (data?.length ?? 0) > MAX_PER_EDGE };
}

export interface ResolvedEntity {
  kind: EntityKind;
  id: string;
  label: string;
  route: string;
  neighbours: NeighbourGroup[];
}

/**
 * Resolve one entity and all its neighbours.
 *
 * Reads the entity's own row once (to follow its outbound foreign keys), then
 * one query per edge. Every count and every row here is real; nothing is
 * estimated, and a capped relationship reports `truncated` rather than
 * pretending the cap is the total.
 */
export async function resolveEntity(
  admin: Admin,
  kind: EntityKind,
  id: string,
): Promise<ResolvedEntity | null> {
  const node = ENTITY_GRAPH[kind];

  const { data: self } = await admin
    .from(node.table)
    .select('*')
    .eq(node.idColumn, id)
    .maybeSingle();
  if (!self) return null;

  const neighbours: NeighbourGroup[] = [];

  for (const edge of node.edges) {
    if (edge.direction === 'outbound') {
      const fk = self[edge.via];
      if (!fk) {
        neighbours.push({ label: edge.label, kind: edge.to, cardinality: edge.cardinality, rows: [], truncated: false });
        continue;
      }
      const nb = ENTITY_GRAPH[edge.to];
      const { data: nbRow } = await admin
        .from(nb.table)
        .select('*')
        .eq(nb.idColumn, fk)
        .maybeSingle();
      neighbours.push({
        label: edge.label,
        kind: edge.to,
        cardinality: edge.cardinality,
        rows: nbRow
          ? [{ id: String(fk), label: rowLabel(edge.to, nbRow), route: entityRoute(edge.to, String(fk)) }]
          : [],
        truncated: false,
      });
    } else {
      neighbours.push(await resolveEdge(admin, edge, String(self[node.idColumn])));
    }
  }

  return {
    kind,
    id,
    label: rowLabel(kind, self),
    route: entityRoute(kind, id),
    neighbours,
  };
}
