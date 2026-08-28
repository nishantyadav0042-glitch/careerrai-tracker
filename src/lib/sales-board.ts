import { listOpenFollowups, bucketFor, type OpenFollowup, type DueBucket } from '@/lib/sales-followup';
import { firstContactSla, type SlaState, type SlaTally, tallySla } from '@/lib/sales-sla';
import { readRepConfigs } from '@/lib/sales-capacity';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── The counsellor's day, assembled once ────────────────────────────────────
//
// Two questions decide whether follow-up actually happens, and until now
// neither had a screen a counsellor could open:
//
//   1. WHAT DID I PROMISE?  sales_followup has recorded every promise since
//      23 Aug — created when a rep says "I'll call Tuesday", closed only by an
//      activity row that discharges it. The founder's control tower reads it.
//      The rep, who made the promise, could not see it anywhere.
//   2. WHO IS STILL WAITING TO HEAR FROM ME AT ALL?  Leads handed over and not
//      yet called. Industry research is blunt about this one: most sellers
//      stop after a single attempt, and the first call is the one that decides
//      whether there is a relationship to follow up at all.
//
// Both are assembled here rather than in the page, so the rep's board and the
// founder's team view are answering from the same function instead of two
// hand-written queries that drift.

export interface BoardLead {
  studentId: string;
  name: string | null;
  phone: string | null;
  assignedAt: string | null;
  sla: SlaState;
}

export interface BoardPromise extends OpenFollowup {
  name: string | null;
  bucket: DueBucket;
}

export interface FollowupBoard {
  /** null when the follow-up read FAILED — never an empty board. */
  promises: BoardPromise[] | null;
  overdue: BoardPromise[];
  today: BoardPromise[];
  upcoming: BoardPromise[];
  /** Owned, never contacted. Breached first. */
  awaitingFirstContact: BoardLead[];
  slaMinutes: number | null;
  sla: SlaTally | null;
}

/**
 * One counsellor's board.
 *
 * `promises: null` is load-bearing and deliberately survives all the way to
 * the renderer. An unreadable follow-up list is not an empty one, and a screen
 * that says "nothing due today" when the query failed is the single most
 * expensive lie this surface could tell — the counsellor closes the tab and
 * three students never get called.
 */
export async function getRepFollowupBoard(
  admin: any, repId: string, nowMs: number = Date.now(),
): Promise<FollowupBoard> {
  const [promiseRows, { data: leadRows }, cfgs] = await Promise.all([
    listOpenFollowups(admin, { ownerId: repId, limit: 500 }),
    admin.from('lead_outreach')
      .select('student_id, assigned_at, first_contact_at, status')
      .eq('owner_id', repId)
      // A lead that is won, lost or asked not to be contacted is not waiting
      // for a first call. dnd especially: surfacing it would invite exactly
      // the call the student asked us never to make.
      .not('status', 'in', '("converted","not_interested","dnd")'),
    readRepConfigs(admin, [repId]),
  ]);

  const cfg = cfgs.get(repId) ?? null;
  const leads = ((leadRows ?? []) as any[]).map((r) => ({
    studentId: r.student_id as string,
    assignedAt: (r.assigned_at as string | null) ?? null,
    firstContactAt: (r.first_contact_at as string | null) ?? null,
  }));

  const ids = [...new Set([
    ...((promiseRows ?? []).map((p) => p.studentId)),
    ...leads.map((l) => l.studentId),
  ])];
  const { data: profs } = ids.length
    ? await admin.from('profiles').select('id, full_name, phone').in('id', ids)
    : { data: [] as any[] };
  const byId = new Map(((profs ?? []) as any[]).map((p) => [p.id as string, p]));

  const promises: BoardPromise[] | null = promiseRows == null ? null
    : promiseRows.map((p) => ({
      ...p,
      name: (byId.get(p.studentId)?.full_name as string | null) ?? null,
      bucket: bucketFor(p.dueAt, nowMs),
    }));

  const awaiting: BoardLead[] = cfg
    ? leads
      .map((l) => ({ ...l, sla: firstContactSla(cfg, l, nowMs) }))
      .filter((l) => l.sla.state === 'awaiting' || (l.sla.state === 'unknown' && !l.firstContactAt))
      .map((l) => ({
        studentId: l.studentId,
        name: (byId.get(l.studentId)?.full_name as string | null) ?? null,
        phone: (byId.get(l.studentId)?.phone as string | null) ?? null,
        assignedAt: l.assignedAt,
        sla: l.sla,
      }))
      // Breached first, then longest-waiting. A counsellor opening this screen
      // should not have to decide who has waited longest.
      .sort((a, b) => {
        const ab = a.sla.state === 'awaiting' && a.sla.breached ? 1 : 0;
        const bb = b.sla.state === 'awaiting' && b.sla.breached ? 1 : 0;
        if (ab !== bb) return bb - ab;
        return (a.assignedAt ?? '9').localeCompare(b.assignedAt ?? '9');
      })
    : [];

  return {
    promises,
    overdue: (promises ?? []).filter((p) => p.bucket === 'overdue'),
    today: (promises ?? []).filter((p) => p.bucket === 'today'),
    upcoming: (promises ?? []).filter((p) => p.bucket === 'upcoming'),
    awaitingFirstContact: awaiting,
    slaMinutes: cfg?.firstContactSlaMinutes ?? null,
    sla: cfg ? tallySla(cfg, leads, nowMs) : null,
  };
}
