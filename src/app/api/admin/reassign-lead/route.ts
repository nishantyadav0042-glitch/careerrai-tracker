import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { checkSalesTarget, isUuid, salesPrincipal } from '@/lib/sales-authz';
import { auditSales } from '@/lib/sales-audit';
import { getTeamCapacity } from '@/lib/sales-capacity';
import { repAllocationLimit, REFUSAL_COPY } from '@/lib/sales-rep-provisioning';
import { chunkIds } from '@/lib/truth/batch';

// SA-1D: the ONE way ownership moves between people. Reassignment is an
// intentional, admin-only action — never a side effect of saving a form — and
// it always leaves history: a 'reassigned' row in sales_activity plus an
// admin_audit_log entry naming who moved what, from whom, to whom.
//
// R3 (23 Aug): ownership is profiles.id. The previous version resolved the
// target to an EMAIL and required one — which meant the founder's own account,
// which has no email, could never be assigned a lead. The one account that must
// always be able to own a lead was the one the system refused.
//
// Accepts a single studentId or a batch, so bulk distribution goes through the
// same authorization, the same atomic claim semantics and the same audit trail
// as a single assignment. A second "bulk" endpoint would be a second set of
// rules to keep in sync.

const MAX_BATCH = 200;

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const principal = await salesPrincipal(admin, user.id);
  if (!principal || principal.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { studentId, studentIds, newOwnerId, unassign } = body ?? {};

  const targets: string[] = Array.isArray(studentIds)
    ? studentIds.filter((s: unknown): s is string => isUuid(s))
    : isUuid(studentId) ? [studentId] : [];
  if (targets.length === 0) return NextResponse.json({ error: 'studentId or studentIds required' }, { status: 400 });
  if (targets.length > MAX_BATCH) {
    return NextResponse.json({ error: `At most ${MAX_BATCH} leads at a time.` }, { status: 400 });
  }
  // Duplicates in one batch would double-count the audit trail.
  const unique = [...new Set(targets)];

  // ── Unassign ──────────────────────────────────────────────────────────────
  // A first-class action, not "assign to nobody". A lead deliberately returned
  // to the shared pool is a decision worth recording.
  if (unassign === true) {
    const now = new Date().toISOString();
    for (const chunk of chunkIds(unique)) {
      const { error } = await admin.from('lead_outreach')
        .update({ owner_id: null, owner: null, updated_at: now })
        .in('student_id', chunk);
      if (error) {
        console.error('[reassign-lead] unassign failed:', error.message);
        return NextResponse.json({ error: 'Could not unassign — try again.' }, { status: 500 });
      }
    }
    await admin.from('sales_activity').insert(unique.map((id) => ({
      student_id: id,
      actor_id: principal.id,
      activity_type: 'unassigned',
      provenance: 'system_generated',
      status: 'reassigned',
      note: 'Returned to the unassigned pool',
    })));
    await auditSales(principal.id, unique.length > 1 ? 'lead_bulk_assigned' : 'lead_unassigned',
      { type: 'lead', id: unique.length === 1 ? unique[0] : null },
      { after: null, count: unique.length, reason: 'unassigned' });
    return NextResponse.json({ ok: true, unassigned: unique.length });
  }

  // ── Assign / reassign ─────────────────────────────────────────────────────
  if (!isUuid(newOwnerId)) {
    return NextResponse.json({ error: 'newOwnerId must be a profile id' }, { status: 400 });
  }
  // The target must be a real staff record, addressed by id. Ownership no
  // longer depends on a column that is allowed to be null.
  const { data: target, error: targetErr } = await admin
    .from('profiles').select('id, role').eq('id', newOwnerId).maybeSingle();
  if (targetErr) {
    return NextResponse.json({ error: 'Could not verify the new owner — try again.' }, { status: 503 });
  }
  if (!target || (target.role !== 'sales' && target.role !== 'admin')) {
    return NextResponse.json({ error: 'New owner must be a sales or admin account.' }, { status: 400 });
  }

  // Every lead in the batch must be a legitimate sales subject. One bad id
  // fails the whole batch rather than silently assigning the rest — a partial
  // distribution the founder did not ask for is worse than an error.
  for (const id of unique) {
    const check = await checkSalesTarget(admin, id);
    if (!check.ok) {
      if (check.reason === 'unavailable') {
        return NextResponse.json({ error: 'Could not verify a student — try again.' }, { status: 503 });
      }
      return NextResponse.json({ error: 'One or more leads are not valid students.', reason: check.reason }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const beforeById = new Map<string, string | null>();
  for (const chunk of chunkIds(unique)) {
    const { data: before } = await admin.from('lead_outreach')
      .select('student_id, owner_id').in('student_id', chunk);
    for (const r of ((before ?? []) as { student_id: string; owner_id: string | null }[])) {
      beforeById.set(r.student_id, r.owner_id);
    }
  }

  // ── Capacity is REPORTED here, not enforced ───────────────────────────────
  //
  // Admin override is unconditional by design — that is what reassignment IS,
  // and that decision predates this code. What was wrong was that it was also
  // BLIND: naming a rep and handing them 40 students told the founder nothing
  // about whether that rep is switched off, on leave, unconfigured, or already
  // past a ceiling he set himself. Pool distribution (/api/admin/
  // distribute-leads) refuses in that situation because nobody named the rep;
  // here he did, so the answer is a fact in the response, not a refusal.
  const targetCapacity = (await getTeamCapacity(admin)).find((r) => r.repId === target.id) ?? null;
  const targetLimit = targetCapacity ? repAllocationLimit(targetCapacity) : null;
  const capacityNote = !targetLimit
    ? 'Their capacity could not be read, so the effect on their workload is UNKNOWN — not "fine".'
    : targetLimit.ok
      ? (unique.length > targetLimit.max
        ? `This is ${unique.length} leads to someone with room for ${targetLimit.max}. Assigned anyway — you named them — but they are now over the ceiling you configured.`
        : null)
      : `This account is ${REFUSAL_COPY[targetLimit.reason]}. Assigned anyway — you named them.`;

  // It deliberately does NOT go through claim_lead, whose guard exists to stop
  // one rep taking another's lead.
  const { error: stateError } = await admin.from('lead_outreach').upsert(unique.map((id) => ({
    student_id: id,
    owner_id: target.id,
    updated_at: now,
  })));
  if (stateError) {
    console.error('[reassign-lead] lead_outreach upsert failed:', stateError.message);
    return NextResponse.json({ error: 'Could not reassign — try again.' }, { status: 500 });
  }

  const { error: historyError } = await admin.from('sales_activity').insert(unique.map((id) => ({
    student_id: id,
    actor_id: principal.id,
    activity_type: beforeById.get(id) ? 'reassigned' : 'assigned',
    provenance: 'system_generated',
    status: 'reassigned',
    note: `Owner set to ${target.id}`,
  })));
  if (historyError) {
    console.error('[reassign-lead] sales_activity insert failed:', historyError.message);
    return NextResponse.json({ error: 'Owner changed but history write failed — retry to record it.' }, { status: 500 });
  }

  await auditSales(
    principal.id,
    unique.length > 1 ? 'lead_bulk_assigned' : (beforeById.get(unique[0]) ? 'lead_reassigned' : 'lead_assigned'),
    { type: 'lead', id: unique.length === 1 ? unique[0] : null },
    {
      before: unique.length === 1 ? (beforeById.get(unique[0]) ?? null) : undefined,
      after: target.id,
      count: unique.length,
    },
  );

  return NextResponse.json({ ok: true, owner: target.id, assigned: unique.length, capacityNote });
}
