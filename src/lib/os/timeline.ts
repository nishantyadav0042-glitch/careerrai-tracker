import type { EntityKind } from './entity-graph';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── The global timeline — decisions, not logs ───────────────────────────────
//
// Co-founder rule, 9 Aug: "Every timeline event must answer 'so what?'. Bad:
// student opened app, clicked button, viewed page. Good: student subscribed,
// buddy assigned, plan regenerated, OCR failed, payment refunded. Timeline is
// for decisions, not logs."
//
// So this is deliberately NOT the analytics stream. student_events already
// records every open and tap — that is the log, and it is noise here. This
// table records only the moments a human would care to see when replaying an
// entity's story: money moved, a mentor was assigned, a promise was kept or
// missed. Writers first (this file and its emit calls); the reader is a thin
// query the profile pages use, added without the reader ever running ahead of
// real events to show.

/**
 * The ONLY events allowed on the timeline.
 *
 * Every one passes the "so what?" test — a founder scrolling an entity would
 * stop on each. Adding a kind here is a deliberate act, and a guard test
 * forbids the noise kinds (app_open, screen_view, tap, click) from ever
 * appearing, so the timeline cannot quietly rot back into a log.
 */
export const TIMELINE_KINDS = {
  subscribed: 'money',
  refunded: 'money',
  payment_stuck: 'money',
  buddy_assigned: 'mentor',
  buddy_unassigned: 'mentor',
  session_expired: 'mentor',
  ocr_failed: 'study',
  scholarship_granted: 'money',
} as const;

export type TimelineKind = keyof typeof TIMELINE_KINDS;

/** Noise that must never reach the timeline. Enforced by a test. */
export const FORBIDDEN_KINDS = ['app_open', 'screen_view', 'tap', 'click', 'page_view', 'scroll'] as const;

export interface TimelineEmit {
  entity: EntityKind;
  entityId: string;
  kind: TimelineKind;
  /** The "so what", in a founder's words. "₹999 refunded", not "refund row". */
  summary: string;
  actor?: 'system' | 'admin' | 'student' | 'buddy';
  metadata?: Record<string, unknown>;
}

/**
 * Record one decision on the timeline.
 *
 * Best-effort and never throwing: a timeline write must never break the payment
 * or assignment it is describing. If the insert fails, the decision still
 * happened — we just lose the breadcrumb, which is the right thing to lose.
 */
export async function emitTimeline(admin: Admin, e: TimelineEmit): Promise<void> {
  try {
    await admin.from('timeline_events').insert({
      entity_kind: e.entity,
      entity_id: e.entityId,
      kind: e.kind,
      summary: e.summary,
      actor: e.actor ?? 'system',
      metadata: e.metadata ?? {},
    });
  } catch (err) {
    console.error('[timeline] emit failed', err);
  }
}

export interface TimelineRow {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  kind: TimelineKind;
  summary: string;
  actor: string;
  createdAt: string;
}

function mapRow(r: any): TimelineRow {
  return {
    id: r.id,
    entityKind: r.entity_kind,
    entityId: r.entity_id,
    kind: r.kind,
    summary: r.summary,
    actor: r.actor,
    createdAt: r.created_at,
  };
}

/** One entity's story, newest first — for a 360 profile. */
export async function getEntityTimeline(admin: Admin, entity: EntityKind, entityId: string, limit = 50): Promise<TimelineRow[]> {
  const { data } = await admin
    .from('timeline_events')
    .select('*')
    .eq('entity_kind', entity)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapRow);
}

/** The global feed — every decision across the system, newest first. */
export async function getGlobalTimeline(admin: Admin, limit = 100): Promise<TimelineRow[]> {
  const { data } = await admin
    .from('timeline_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapRow);
}
