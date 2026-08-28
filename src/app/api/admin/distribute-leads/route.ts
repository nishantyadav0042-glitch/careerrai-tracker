import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isUuid, salesPrincipal } from '@/lib/sales-authz';
import { auditSales } from '@/lib/sales-audit';
import { chunkIds } from '@/lib/truth/batch';
import { getTeamCapacity } from '@/lib/sales-capacity';
import { repAllocationLimit, REFUSAL_COPY } from '@/lib/sales-rep-provisioning';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Distribute leads from a named pool according to an allocation the founder has
// already SEEN. The UI computes and displays the split; this route re-derives
// the pool server-side and applies exactly the counts requested.
//
// Deliberately not an algorithm the server invents: the founder said not to
// implement an opaque automatic distribution, so the server's job is to be a
// faithful, auditable executor of a decision that was shown before it was made.

const MAX_TOTAL = 500;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const principal = await salesPrincipal(admin, user.id);
  if (!principal || principal.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { pool, allocation } = (await request.json().catch(() => ({}))) ?? {};
  if (pool !== 'unassigned' && pool !== 'stale') return NextResponse.json({ error: 'Unknown pool' }, { status: 400 });
  if (!Array.isArray(allocation) || allocation.length === 0) return NextResponse.json({ error: 'No allocation' }, { status: 400 });

  const alloc = allocation
    .filter((a: any) => isUuid(a?.repId) && Number.isInteger(a?.count) && a.count > 0)
    .map((a: any) => ({ repId: a.repId as string, count: a.count as number }));
  if (alloc.length === 0) return NextResponse.json({ error: 'Invalid allocation' }, { status: 400 });
  const total = alloc.reduce((s, a) => s + a.count, 0);
  if (total > MAX_TOTAL) return NextResponse.json({ error: `At most ${MAX_TOTAL} leads per distribution.` }, { status: 400 });

  // Every target must be real staff. Checked BEFORE anything moves — a partial
  // distribution the founder did not preview is worse than an error.
  const repIds = [...new Set(alloc.map((a) => a.repId))];
  // Chunked even though the staff list is tiny: B3b doctrine is that request
  // size is bounded by the chunk, not by an assumption about how many rows the
  // caller "probably" passed.
  const ok = new Set<string>();
  for (const chunk of chunkIds(repIds)) {
    const { data: staff, error: staffErr } = await admin
      .from('profiles').select('id, role').in('id', chunk);
    if (staffErr) return NextResponse.json({ error: 'Could not verify the reps — try again.' }, { status: 503 });
    for (const s of (staff ?? []) as any[]) if (s.role === 'sales' || s.role === 'admin') ok.add(s.id);
  }
  if (repIds.some((id) => !ok.has(id))) {
    return NextResponse.json({ error: 'One or more targets are not sales or admin accounts.' }, { status: 400 });
  }

  // ── The stated ceiling binds here ─────────────────────────────────────────
  //
  // Until now this route read `role` and nothing else: not sales_rep_config,
  // not `active`, not `unavailable_until`, not max_capacity_units. So a rep
  // configured for 12 units could be handed 250, and "part-time" meant nothing
  // at the one moment it should have meant everything — the moment work is
  // handed out.
  //
  // This is still NOT an allocator. It never picks who gets a lead; the
  // founder's previewed split is unchanged whenever it fits. It refuses to
  // exceed a number the founder himself configured, and names the rep and the
  // reason when it does — a silent clamp would be worse than the old bug,
  // because he would believe 50 leads moved when 12 did.
  const team = await getTeamCapacity(admin);
  const capById = new Map(team.map((r) => [r.repId, r]));
  const rejected: { repId: string; name: string; requested: number; allowed: number; why: string }[] = [];
  for (const a of alloc) {
    const cap = capById.get(a.repId);
    if (!cap) {
      rejected.push({ repId: a.repId, name: a.repId, requested: a.count, allowed: 0, why: 'no capacity record could be read for this account' });
      continue;
    }
    const limit = repAllocationLimit(cap);
    const allowed = limit.ok ? limit.max : 0;
    if (a.count > allowed) {
      rejected.push({
        repId: a.repId, name: cap.name, requested: a.count, allowed,
        why: limit.ok
          ? `they can take ${allowed} right now (${limit.boundBy === 'daily_fuse' ? 'daily intake fuse' : 'capacity'})`
          : REFUSAL_COPY[limit.reason],
      });
    }
  }
  if (rejected.length > 0) {
    return NextResponse.json({
      error: 'Nothing was assigned. ' + rejected
        .map((r) => `${r.name}: asked for ${r.requested}, ${r.why}`)
        .join('; ') + '. Lower the numbers or raise the configuration on the capacity screen.',
      rejected,
    }, { status: 409 });
  }

  // Re-derive the pool server-side. The client's count is a request, not a fact.
  const staleCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
  let q = admin.from('lead_outreach').select('student_id').order('updated_at', { ascending: true }).limit(total);
  q = pool === 'unassigned'
    ? q.is('owner_id', null)
    : q.not('owner_id', 'is', null).lt('updated_at', staleCutoff).not('status', 'in', '("converted","not_interested")');
  const { data: rows, error: poolErr } = await q;
  if (poolErr) {
    console.error('[distribute] pool read failed:', poolErr.message);
    return NextResponse.json({ error: 'Could not read the pool — try again.' }, { status: 503 });
  }
  const ids = ((rows ?? []) as any[]).map((r) => r.student_id as string);
  if (ids.length === 0) return NextResponse.json({ error: 'That pool is empty.' }, { status: 400 });

  const now = new Date().toISOString();
  let cursor = 0;
  let assigned = 0;
  for (const a of alloc) {
    const slice = ids.slice(cursor, cursor + a.count);
    cursor += slice.length;
    if (slice.length === 0) break;
    for (const chunk of chunkIds(slice)) {
      const { error } = await admin.from('lead_outreach')
        // assigned_at starts the first-contact SLA clock (lib/sales-sla). Set on
        // every handover, including a re-distribution of a stale lead: the new
        // owner's two hours begin when THEY receive it, not when the previous
        // owner did.
        .upsert(chunk.map((id) => ({
          student_id: id, owner_id: a.repId, assigned_at: now, updated_at: now,
        })));
      if (error) {
        console.error('[distribute] assign failed:', error.message);
        // Report what DID move. Silently rounding a partial run up to success is
        // how a founder ends up believing 200 leads were distributed when 40 were.
        return NextResponse.json({ error: 'Partially assigned — re-run to finish.', assigned }, { status: 500 });
      }
      await admin.from('sales_activity').insert(chunk.map((id) => ({
        student_id: id, actor_id: principal.id, activity_type: 'assigned',
        provenance: 'system_generated', status: 'reassigned', note: `Distributed to ${a.repId}`,
      })));
      assigned += chunk.length;
    }
  }

  await auditSales(principal.id, 'lead_bulk_assigned', { type: 'lead', id: null },
    { after: alloc, count: assigned, reason: `pool=${pool}` });

  return NextResponse.json({ ok: true, assigned, requested: total, poolAvailable: ids.length });
}
