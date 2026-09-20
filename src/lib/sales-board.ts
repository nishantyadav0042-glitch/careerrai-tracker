import { listOpenFollowups, bucketFor, type OpenFollowup, type DueBucket } from '@/lib/sales-followup';
import { firstContactSla, type SlaState, type SlaTally, tallySla } from '@/lib/sales-sla';
import { readRepConfigs } from '@/lib/sales-capacity';
import { chunkIds } from '@/lib/truth/batch';
import { buildRemarkHistories, HUMAN_PROVENANCE, MAX_REMARKS_ON_CARD } from '@/lib/sales-remarks';

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
  /**
   * The last real conversation, so "what did they say last time" is on the
   * row rather than a profile away (Anshul, 20 Sep 2026). Newest TYPED remark
   * where there is one, else the newest human touch.
   */
  lastSaid: string | null;
  lastSaidAt: string | null;
  /** True when a rep wrote these words, false for an auto-note. */
  lastSaidTyped: boolean;
  /** Set only when somebody else wrote it (see lib/sales-remarks). */
  lastSaidBy: string | null;
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
  /**
   * True when the follow-up read hit its cap, so this board is a PREFIX of his
   * promises rather than all of them.
   *
   * Found 20 Sep 2026 by cross-check, live in production at the time: he had
   * 615 open follow-ups against a cap of 500. Ordered by due_at ascending and
   * 524 already due, the 500 taken were all overdue — so 24 overdue promises
   * and every one of his 91 upcoming ones were invisible, and the Upcoming
   * section rendered empty as though he had promised nobody anything.
   *
   * The same doctrine as `promises: null` and `namesReadable`: a truncated
   * list is not a complete one, and he cannot tell them apart by looking.
   */
  promisesTruncated: boolean;
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
/**
 * How many open follow-ups the rep's own board will read.
 *
 * 500 until 20 Sep 2026, when a cross-check found him holding 615 — so his
 * board silently dropped 115 promises while the FOUNDER'S control tower was
 * already reading 2000. The person the list belongs to had the smaller cap.
 * Matched to the control tower, and truncation is now reported rather than
 * absorbed, because any fixed cap can be crossed again.
 */
export const FOLLOWUP_BOARD_LIMIT = 2000;

export async function getRepFollowupBoard(
  admin: any, repId: string, nowMs: number = Date.now(),
): Promise<FollowupBoard> {
  const [promiseRows, { data: leadRows }, cfgs] = await Promise.all([
    listOpenFollowups(admin, { ownerId: repId, limit: FOLLOWUP_BOARD_LIMIT }),
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

  // ── WHY THE CALL IS DUE IS NOT WHAT WAS SAID (Anshul, 20 Sep 2026) ──────
  //
  // "Although call options appear, the detailed data and remarks underneath
  // are missing. I still need to open each profile to check the last update
  // and previous conversation details."
  //
  // The 19 Sep fix gave the row a name and a dial button, and stopped there.
  // The row still only carried `reason` — "Cadence after 'no_answer'", which
  // is the SYSTEM's account of why the card exists, not the student's. So the
  // board answered "who do I ring" and left "what did they say" a profile
  // away, on every row.
  //
  // lib/sales-remarks is the one definition of a remark, and the reason to
  // reuse it rather than read the newest row is Incident #69: the newest row
  // for 272 of 319 touched students was our own intake bookkeeping, and
  // `no_answer`'s auto-note buried the conversation before it.
  //
  // Only the students actually on this board are read, and the read is
  // chunked. A failure costs the remark, never the row.
  const promiseIds = [...new Set((promiseRows ?? []).map((p) => p.studentId))];
  const remarkRows: any[] = [];
  if (promiseIds.length) {
    const actResults = await Promise.all(chunkIds(promiseIds).map((chunk) =>
      admin.from('sales_activity')
        .select('student_id, created_at, status, note, actor_id, provenance')
        .eq('provenance', HUMAN_PROVENANCE)
        // BOTH halves of isHumanTouch, at the database. Filtering provenance
        // alone let null-actor rows come back and EAT THE LIMIT below before
        // buildRemarkHistories discarded them in JS.
        .not('actor_id', 'is', null)
        .in('student_id', chunk)
        .order('created_at', { ascending: false })
        // Scaled to the chunk, never a flat number — the shape call-queue.ts
        // already uses. A flat 400 across 100 students was 4 rows each against
        // a measured average of 3.4 and a maximum of 16, so a heavy chunk
        // would have dropped the newest remark for the students sorted last:
        // the very "remarks are missing" report this read exists to answer.
        .limit(chunk.length * MAX_REMARKS_ON_CARD * 4)));
    for (const r of actResults as any[]) {
      if (r.error) continue;
      remarkRows.push(...((r.data ?? []) as any[]));
    }
  }
  const historyBy = buildRemarkHistories(remarkRows, null, 1, repId);

  const promises: BoardPromise[] | null = promiseRows == null ? null
    : promiseRows.map((p) => {
      const h = historyBy.get(p.studentId);
      const said = h?.lastTyped ?? h?.last ?? null;
      return {
        ...p,
        name: byId.get(p.studentId)?.full_name ?? null,
        phone: byId.get(p.studentId)?.phone ?? null,
        bucket: bucketFor(p.dueAt, nowMs),
        lastSaid: said?.note ?? null,
        lastSaidAt: said?.atIso ?? null,
        lastSaidTyped: said?.typed ?? false,
        lastSaidBy: said?.by ?? null,
      };
    });

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
    promisesTruncated: (promiseRows?.length ?? 0) >= FOLLOWUP_BOARD_LIMIT,
    overdue: (promises ?? []).filter((p) => p.bucket === 'overdue'),
    today: (promises ?? []).filter((p) => p.bucket === 'today'),
    upcoming: (promises ?? []).filter((p) => p.bucket === 'upcoming'),
    awaitingFirstContact: awaiting,
    namesReadable,
    slaMinutes: cfg?.firstContactSlaMinutes ?? null,
    sla: cfg ? tallySla(cfg, leads, nowMs) : null,
  };
}
