import { listOpenFollowups, bucketFor, type OpenFollowup, type DueBucket } from '@/lib/sales-followup';
import { firstContactSla, type SlaState, type SlaTally, tallySla } from '@/lib/sales-sla';
import { readRepConfigs } from '@/lib/sales-capacity';
import { chunkIds } from '@/lib/truth/batch';

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
  /** So the counsellor can dial from the list instead of opening a profile. */
  phone: string | null;
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
  /**
   * False when the profile read FAILED, so every name on this board is a
   * placeholder rather than a fact.
   *
   * Same doctrine as `promises: null` above, one field along: a board that
   * silently renders 140 rows all called "Student" is not a board with no
   * names on it, it is a board whose name lookup broke — and the counsellor
   * cannot tell those apart, so he opens 140 profiles one at a time.
   */
  namesReadable: boolean;
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

  // Who actually needs a name. The SLA filter runs FIRST so the lookup covers
  // the rows that get rendered, not every lead the counsellor has ever owned —
  // Anshul owns 1,011 open leads and only the waiting ones reach the screen.
  const waitingLeads = cfg
    ? leads
      .map((l) => ({ ...l, sla: firstContactSla(cfg, l, nowMs) }))
      .filter((l) => l.sla.state === 'awaiting' || (l.sla.state === 'unknown' && !l.firstContactAt))
    : [];

  const ids = [...new Set([
    ...((promiseRows ?? []).map((p) => p.studentId)),
    ...waitingLeads.map((l) => l.studentId),
  ])];

  // CHUNKED, because this is the 23 Aug incident's own shape — see
  // lib/truth/batch: putting every id in one `.in()` puts every id in the
  // REQUEST URL. 656 ids was ~24KB and broke; Anshul crossed it on 19 Sep with
  // 1,013 (140 promises + 1,011 open leads), the request failed, `profs` came
  // back empty, and every row on his calling list rendered the `?? 'Student'`
  // placeholder. Nothing errored and nothing looked broken — he just could not
  // see who he was calling.
  //
  // A failure here is reported, never absorbed: partial names are worse than
  // none, because a half-filled list reads as a complete one.
  const byId = new Map<string, { full_name: string | null; phone: string | null }>();
  let namesReadable = true;
  if (ids.length) {
    const results = await Promise.all(
      chunkIds(ids).map((chunk) =>
        admin.from('profiles').select('id, full_name, phone').in('id', chunk)),
    );
    for (const r of results as any[]) {
      if (r.error) { namesReadable = false; continue; }
      for (const p of (r.data ?? []) as any[]) {
        byId.set(p.id as string, { full_name: p.full_name ?? null, phone: p.phone ?? null });
      }
    }
  }

  const promises: BoardPromise[] | null = promiseRows == null ? null
    : promiseRows.map((p) => ({
      ...p,
      name: byId.get(p.studentId)?.full_name ?? null,
      phone: byId.get(p.studentId)?.phone ?? null,
      bucket: bucketFor(p.dueAt, nowMs),
    }));

  const awaiting: BoardLead[] = cfg
    ? waitingLeads
      .map((l) => ({
        studentId: l.studentId,
        name: byId.get(l.studentId)?.full_name ?? null,
        phone: byId.get(l.studentId)?.phone ?? null,
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
    namesReadable,
    slaMinutes: cfg?.firstContactSlaMinutes ?? null,
    sla: cfg ? tallySla(cfg, leads, nowMs) : null,
  };
}
