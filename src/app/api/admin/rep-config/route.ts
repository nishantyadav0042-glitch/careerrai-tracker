import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isUuid, salesPrincipal } from '@/lib/sales-authz';
import { auditSales } from '@/lib/sales-audit';
import { checkEmploymentStatement } from '@/lib/sales-rep-provisioning';

// Phase 2B-1 — the ONLY write this phase adds, and it writes configuration,
// never ownership. There is deliberately no code path here (or anywhere in
// 2B-1) that can set lead_outreach.owner_id.
//
// Admin-only: a rep may read their own capacity but may not raise their own
// ceiling. Every change is audited with before/after, because a capacity
// number that can be changed invisibly is not a control, it is a rumour.

const BOUNDS = {
  max_capacity_units: [1, 200],
  max_new_per_day: [1, 100],
  first_contact_sla_minutes: [5, 10080],
  capacity_override: [1, 200],
} as const;

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const principal = await salesPrincipal(admin, user.id);
  if (!principal || principal.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) ?? {};
  const repId = body.repId;
  if (!isUuid(repId)) return badRequest('A valid rep id is required.');

  // The target must be real staff. Checked BEFORE anything is written —
  // configuring capacity for a student would be nonsense stored as fact.
  const { data: target, error: targetErr } = await admin
    .from('profiles').select('id, role').eq('id', repId).maybeSingle();
  if (targetErr) return NextResponse.json({ error: 'Could not verify the rep — try again.' }, { status: 503 });
  if (!target || (target.role !== 'sales' && target.role !== 'admin')) {
    return badRequest('That account is not a sales or admin account.');
  }

  const patch: Record<string, unknown> = { rep_id: repId, updated_by: principal.id, updated_at: new Date().toISOString() };

  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    if (body[key] === undefined) continue;
    if (body[key] === null && key === 'capacity_override') { patch.capacity_override = null; patch.override_until = null; continue; }
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < lo || n > hi) return badRequest(`${key} must be a whole number between ${lo} and ${hi}.`);
    patch[key] = n;
  }
  if (body.active !== undefined) patch.active = body.active === true;
  if (body.employment_type !== undefined) {
    if (body.employment_type !== 'full_time' && body.employment_type !== 'part_time') return badRequest('employment_type must be full_time or part_time.');
    patch.employment_type = body.employment_type;
  }
  if (body.work_days !== undefined) {
    const days = Array.isArray(body.work_days) ? body.work_days.map(Number) : null;
    if (!days || days.length === 0 || days.length > 7 || days.some((d: number) => !Number.isInteger(d) || d < 1 || d > 7)) {
      return badRequest('work_days must be 1–7 ISO weekday numbers (1 = Monday).');
    }
    patch.work_days = [...new Set(days)].sort();
  }
  for (const t of ['work_start_ist', 'work_end_ist'] as const) {
    if (body[t] === undefined) continue;
    if (typeof body[t] !== 'string' || !/^\d{2}:\d{2}$/.test(body[t])) return badRequest(`${t} must be HH:MM.`);
    patch[t] = body[t];
  }
  for (const t of ['unavailable_until', 'override_until'] as const) {
    if (body[t] === undefined) continue;
    if (body[t] === null) { patch[t] = null; continue; }
    const ms = Date.parse(body[t]);
    if (!Number.isFinite(ms)) return badRequest(`${t} must be a timestamp or null.`);
    patch[t] = new Date(ms).toISOString();
  }

  const { data: before, error: beforeErr } = await admin.from('sales_rep_config').select('*').eq('rep_id', repId).maybeSingle();
  // The before-row decides whether this write is a TRANSITION into part-time,
  // so a failed read here cannot be shrugged off as "no existing row" — that
  // would let the one write this rule exists to catch through unchecked.
  if (beforeErr) return NextResponse.json({ error: 'Could not read the current configuration — try again.' }, { status: 503 });

  // Part-time is not a label. An account may not ARRIVE at part_time while
  // silently inheriting the table's full-time defaults (Mon–Sat, 10:00–19:00,
  // 50 units, 15/day) — the numbers are what part-time means, so they must be
  // stated. CareerRai invents no part-time defaults of its own.
  const statement = checkEmploymentStatement(patch, before ?? null);
  if (!statement.ok) {
    return badRequest(
      `Part-time must be described, not just labelled. Missing: ${statement.missing.join(', ')}. ` +
      `Send working days, hours, capacity and the daily intake fuse in the same request — there is no part-time default.`
    );
  }

  const { data: after, error } = await admin
    .from('sales_rep_config').upsert(patch, { onConflict: 'rep_id' }).select('*').single();
  if (error) {
    console.error('[rep-config] write failed:', error.message);
    // Surfacing the constraint message matters: "capacity must be 1–200" is
    // actionable, "something went wrong" is not.
    return NextResponse.json({ error: `Could not save the configuration: ${error.message}` }, { status: 400 });
  }

  await auditSales(principal.id, 'rep_config_updated', { type: 'rep', id: repId }, { before: before ?? null, after });

  return NextResponse.json({ ok: true, config: after });
}
