import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isUuid, salesPrincipal } from '@/lib/sales-authz';
import { auditSales } from '@/lib/sales-audit';
import { chunkIds } from '@/lib/truth/batch';
import { portfolioIntakeLimit, MAX_INTAKE_PER_CALL } from '@/lib/sales-rep-provisioning';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── BUILDING A BOOK OUT OF STUDENTS WHO ARE NOT YET LEADS ───────────────────
//
// Verified in production, 29 Aug 2026, the day the two counsellors were hired:
//
//   profiles       985 rows (974 students)
//   lead_outreach    0 rows
//
// Zero. The sales system has never held a single lead. call-queue.ts and
// sales-portfolio.ts both read lead_outreach, so on their first morning Anshul
// and Neelam would each have logged in to an empty screen — not a bug in the
// queue, an empty input to it.
//
// And there was no route that could fix that. /api/admin/distribute-leads
// derives its "unassigned" pool as `lead_outreach WHERE owner_id IS NULL`, so
// it can only redistribute rows that already exist; with zero rows it reports
// "That pool is empty" forever. /api/admin/reassign-lead moves students one at
// a time. Nothing turned a STUDENT into a LEAD in bulk.
//
// This route is that missing step, and it is deliberately a separate door from
// distribute-leads rather than a new `pool` value on it, because the two do
// genuinely different things and are gated differently:
//
//   distribute-leads  hands out LIVE WORK  → gated by repAllocationLimit
//                                             (capacity units, daily fuse)
//   enrol-book        assigns RESPONSIBILITY → gated by portfolioIntakeLimit
//                                             (seat is real, book has headroom)
//
// See the long note above portfolioIntakeLimit in sales-rep-provisioning.ts for
// why those had to stop being the same gate.
//
// assigned_at IS LEFT NULL, AND THAT IS THE WHOLE POINT.
//
// assigned_at starts the first-contact SLA clock. Stamping it on a bulk
// backfill of 974 students who signed up over four months would start 974
// two-hour clocks at once and, by lunchtime, report every one of them as a
// breach — a panel full of red that measures nothing except that a backfill
// happened. firstContactSla() already returns state 'unknown' for a null
// assigned_at and tallies it separately from breached, exactly so that
// "assigned before we recorded assignment times" stays a reported fact instead
// of an invented failure. Speed-to-lead is about a NEW student arriving and
// being called; it is not about the day we imported the back catalogue.

const MAX_TOTAL = MAX_INTAKE_PER_CALL;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const principal = await salesPrincipal(admin, user.id);
  if (!principal || principal.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allocation } = (await request.json().catch(() => ({}))) ?? {};
  if (!Array.isArray(allocation) || allocation.length === 0) {
    return NextResponse.json({ error: 'No allocation. Say how many students each seat should take.' }, { status: 400 });
  }
  const alloc = allocation
    .filter((a: any) => isUuid(a?.repId) && Number.isInteger(a?.count) && a.count > 0)
    .map((a: any) => ({ repId: a.repId as string, count: a.count as number }));
  if (alloc.length === 0) return NextResponse.json({ error: 'Invalid allocation.' }, { status: 400 });
  if (new Set(alloc.map((a) => a.repId)).size !== alloc.length) {
    return NextResponse.json({ error: 'The same rep appears twice in the allocation.' }, { status: 400 });
  }
  const total = alloc.reduce((s, a) => s + a.count, 0);
  if (total > MAX_TOTAL) {
    return NextResponse.json({ error: `At most ${MAX_TOTAL} students per enrolment. Run it again for the rest.` }, { status: 400 });
  }

  // ── Every target must be a real, active, configured seat ──────────────────
  //
  // Checked for ALL targets before anything is written. A partial enrolment the
  // founder did not preview is worse than a refusal, and the same reasoning as
  // distribute-leads applies: he is told which seat failed and why, never given
  // a silent clamp.
  const refusals: string[] = [];
  for (const a of alloc) {
    const { data: cfg, error: cfgErr } = await admin
      .from('sales_rep_config').select('rep_id, active').eq('rep_id', a.repId).maybeSingle();
    if (cfgErr) return NextResponse.json({ error: 'Could not read the team configuration — nothing was changed.' }, { status: 503 });

    // A book we cannot count is not an empty book. Failing closed here matters:
    // treating an unreadable count as 0 would grant full headroom on exactly
    // the read that just failed.
    const { count: book, error: bookErr } = await admin
      .from('lead_outreach').select('student_id', { count: 'exact', head: true }).eq('owner_id', a.repId);
    if (bookErr || book == null) {
      return NextResponse.json({ error: 'Could not count an existing book — nothing was changed. Try again.' }, { status: 503 });
    }

    const limit = portfolioIntakeLimit(cfg ? { active: cfg.active === true } : null, book, a.count);
    if (!limit.ok) { refusals.push(`${a.repId}: ${limit.error}`); continue; }
    if (a.count > limit.max) { refusals.push(`${a.repId}: asked for ${a.count}, may take ${limit.max}`); continue; }
  }
  if (refusals.length > 0) {
    return NextResponse.json({ error: 'Nothing was enrolled. ' + refusals.join('; ') + '.', refusals }, { status: 409 });
  }

  // ── The pool: students who are not yet anybody's lead ─────────────────────
  //
  // Derived server-side. The client's count is a request, not a fact.
  //
  // Two-step rather than a join because PostgREST cannot express "no matching
  // row in another table" directly, and an over-fetch here is bounded: we read
  // ONLY the existing lead ids (a set that is small by construction — it is the
  // book itself) and subtract.
  const { data: existingRows, error: exErr } = await admin
    .from('lead_outreach').select('student_id');
  if (exErr) {
    console.error('[enrol-book] existing lead read failed:', exErr.message);
    return NextResponse.json({ error: 'Could not read the current book — nothing was changed.' }, { status: 503 });
  }
  const already = new Set(((existingRows ?? []) as any[]).map((r) => r.student_id as string));

  // Oldest students first: they have the most history for the queue to reason
  // about, and they are the ones who have been waiting longest for anyone at
  // CareerRai to speak to them.
  const { data: studentRows, error: stErr } = await admin
    .from('profiles').select('id, created_at')
    .eq('role', 'student')
    .order('created_at', { ascending: true })
    .limit(total + already.size);
  if (stErr) {
    console.error('[enrol-book] student read failed:', stErr.message);
    return NextResponse.json({ error: 'Could not read the student base — nothing was changed.' }, { status: 503 });
  }
  const pool = ((studentRows ?? []) as any[])
    .map((r) => r.id as string)
    .filter((id) => !already.has(id))
    .slice(0, total);

  if (pool.length === 0) {
    return NextResponse.json({ error: 'Every student already belongs to a book. There is nobody left to enrol.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  let cursor = 0;
  const enrolled: { repId: string; count: number }[] = [];

  for (const a of alloc) {
    const slice = pool.slice(cursor, cursor + a.count);
    cursor += slice.length;
    if (slice.length === 0) break;

    let landed = 0;
    for (const chunk of chunkIds(slice)) {
      // ── ON CONFLICT DO NOTHING, AND THE REASON IS IDEMPOTENCY ─────────────
      //
      // `ignoreDuplicates: true` is what makes this route safe to re-run. The
      // first version used a plain upsert (ON CONFLICT DO UPDATE), which reads
      // as harmless because the pool above already filters out students who
      // have a lead_outreach row. It is not harmless: that filter is a READ,
      // and between the read and this write a second enrolment — a double
      // click, a retry after a timeout, a concurrent admin — can claim the
      // same student. DO UPDATE would then silently move a student who already
      // belongs to Anshul into Neelam's book, changing ownership nobody asked
      // to change and splitting the student's history across two reps.
      //
      // DO NOTHING makes that impossible at the database, not at the filter:
      // an existing owner is never overwritten by an enrolment, so re-running
      // this route any number of times converges on the same assignment.
      // Changing an owner deliberately is what /api/admin/transfer-book and
      // /api/admin/reassign-lead are for, and both record history.
      //
      // assigned_at deliberately omitted — see the header note. updated_at is
      // set so the stale-lead pool in distribute-leads treats these as fresh.
      const { data: inserted, error } = await admin.from('lead_outreach')
        .upsert(
          chunk.map((id) => ({ student_id: id, owner_id: a.repId, updated_at: now })),
          { onConflict: 'student_id', ignoreDuplicates: true },
        )
        .select('student_id');
      if (error) {
        console.error('[enrol-book] enrol failed:', error.message);
        // Report what DID land. Rounding a partial run up to success is how a
        // founder ends up believing 500 students were enrolled when 40 were.
        return NextResponse.json({
          error: 'Partially enrolled — re-run to finish. Nothing was lost; the students already enrolled keep their owner.',
          enrolled,
        }, { status: 500 });
      }

      // The rows the database actually created, never the rows we asked it to.
      // With DO NOTHING these differ exactly when somebody else got there
      // first, and that difference is the thing worth reporting honestly.
      const landedIds = ((inserted ?? []) as any[]).map((r) => r.student_id as string);
      landed += landedIds.length;
      if (landedIds.length > 0) {
        await admin.from('sales_activity').insert(landedIds.map((id) => ({
          student_id: id, actor_id: principal.id, activity_type: 'assigned',
          provenance: 'system_generated', status: 'reassigned',
          note: `Enrolled into book of ${a.repId}`,
        })));
      }
    }
    enrolled.push({ repId: a.repId, count: landed });
  }

  await auditSales(principal.id, 'sales_book_enrolled', { type: 'system', id: null },
    { after: { enrolled, poolSize: pool.length }, reason: 'bulk portfolio enrolment' });

  const moved = enrolled.reduce((s, e) => s + e.count, 0);
  return NextResponse.json({
    ok: true,
    enrolled,
    // Named honestly: the founder asked for `total`, the pool had what it had.
    requested: total,
    assigned: moved,
    // Three numbers that can legitimately disagree, so all three are reported
    // rather than collapsed into one reassuring "done":
    //   requested  what the founder asked for
    //   poolSize   how many unenrolled students actually existed
    //   assigned   how many rows the database actually created
    // assigned < poolSize means somebody else claimed those students between
    // this route's read and its write — which is exactly the case DO NOTHING
    // exists to survive, and exactly the case a silent success would hide.
    poolSize: pool.length,
    note: moved < total
      ? `${moved} of the ${total} requested were enrolled — ${pool.length} unenrolled students were available` +
        (moved < pool.length ? `, and ${pool.length - moved} were claimed by another enrolment while this one ran.` : '.')
      : undefined,
  });
}
