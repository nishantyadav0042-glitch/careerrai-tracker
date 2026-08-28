import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isUuid, salesPrincipal } from '@/lib/sales-authz';
import { auditSales } from '@/lib/sales-audit';
import { checkEmploymentStatement, checkNewRep, PART_TIME_REQUIRED_FIELDS } from '@/lib/sales-rep-provisioning';
import { normalizeIndianPhone } from '@/lib/phone';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Onboard a sales rep, without inventing an identity ──────────────────────
//
// Until this route existed, hiring the second rep had no software path at all.
// The only ways to produce a sales login were (a) repurpose a student's
// profile — which destroys a real person's account and their history — or
// (b) hand-write auth.users and auth.identities in SQL, which produces an
// account that logs in until the day Supabase changes its identity shape, and
// silently fails to reset a password long before that.
//
// So this route does what the app already does for bulk student import: calls
// the Supabase Auth ADMIN API. That is not a bypass of Supabase Auth, it IS
// Supabase Auth — the same code path the dashboard's "Add user" button uses.
// The password travels from the founder's form to Supabase and is then gone:
// never written to profiles, never audited, never logged.
//
// TWO MODES, because both are legitimate:
//   · create — CareerRai creates the auth user (email + password + confirmed).
//   · attach — the founder already created the user in the Supabase Dashboard
//     and gives us the user id. Nothing about auth is touched; we provision
//     only the CareerRai half.
//
// WHAT IT REFUSES, in order, before anything is created:
//   · an email that already belongs to a non-sales profile (a student is not
//     raw material for a staff seat)
//   · a part-time seat with no stated numbers (see sales-rep-provisioning.ts)
//   · a user id that is not a real auth user, in attach mode

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
  const mode = body.mode === 'attach' ? 'attach' : 'create';

  const employmentType = body.employment_type;
  if (employmentType !== 'full_time' && employmentType !== 'part_time') {
    return badRequest('employment_type must be full_time or part_time.');
  }

  // Build the config patch first: a part-time seat that cannot be described
  // must be refused BEFORE an auth user exists, otherwise a failed provision
  // leaves an orphan login behind.
  const config: Record<string, unknown> = { employment_type: employmentType };
  if (Array.isArray(body.work_days)) {
    const days = body.work_days.map(Number);
    if (days.length === 0 || days.length > 7 || days.some((d: number) => !Number.isInteger(d) || d < 1 || d > 7)) {
      return badRequest('work_days must be 1–7 ISO weekday numbers (1 = Monday).');
    }
    config.work_days = [...new Set(days)].sort();
  }
  for (const t of ['work_start_ist', 'work_end_ist'] as const) {
    if (body[t] === undefined) continue;
    if (typeof body[t] !== 'string' || !/^\d{2}:\d{2}$/.test(body[t])) return badRequest(`${t} must be HH:MM.`);
    config[t] = body[t];
  }
  for (const [key, lo, hi] of [['max_capacity_units', 1, 200], ['max_new_per_day', 1, 100], ['first_contact_sla_minutes', 5, 10080], ['monthly_fixed_paise', 0, 100_000_000]] as const) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < lo || n > hi) return badRequest(`${key} must be a whole number between ${lo} and ${hi}.`);
    config[key] = n;
  }

  // The incentive rate is the one non-integer term — 10, or 7.5, never 10.005.
  // Validated here rather than trusted to the CHECK constraint so the founder
  // gets a sentence instead of a 23514.
  if (body.incentive_percent !== undefined) {
    const pct = Number(body.incentive_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return badRequest('incentive_percent must be between 0 and 100.');
    }
    config.incentive_percent = Math.round(pct * 100) / 100;
  }

  // `existing: null` is the truth here — this is a brand-new seat, so a
  // part-time one must state everything.
  const statement = checkEmploymentStatement(config, null);
  if (!statement.ok) {
    return badRequest(
      `A part-time seat must be described, not just labelled. Missing: ${statement.missing.join(', ')}. ` +
      `Required for part-time: ${PART_TIME_REQUIRED_FIELDS.join(', ')}. CareerRai has no part-time defaults — ` +
      `inheriting the full-time week is exactly what this refuses.`
    );
  }

  let userId: string;
  let email: string;
  let fullName: string;
  let phone: string | null = null;

  if (mode === 'attach') {
    if (!isUuid(body.userId)) return badRequest('attach mode needs the auth user id from the Supabase Dashboard.');
    const { data: found, error: authErr } = await admin.auth.admin.getUserById(body.userId);
    if (authErr || !found?.user) return badRequest('No Supabase auth user exists with that id.');
    userId = found.user.id;

    // THE SAME REFUSAL AS CREATE MODE, ON THE OTHER KEY.
    //
    // Create mode looks a person up by EMAIL and refuses to promote them.
    // Attach mode arrives with a uuid, and until the PR audit caught it, it
    // went straight to the profiles upsert below — so pasting a student's
    // auth id into the form silently rewrote that student's role to 'sales',
    // leaving their student rows attached to a staff account. Admin-only and
    // requiring a mistyped uuid, but it is precisely the thing the founder
    // prohibited, and a mode-specific hole is still a hole.
    const { data: existingById, error: byIdErr } = await admin
      .from('profiles').select('id, role, full_name').eq('id', userId).maybeSingle();
    // A read we could not complete is not "nobody is there" — the whole point
    // of this check is who is already on the other end of that id.
    if (byIdErr) return NextResponse.json({ error: 'Could not check who that user already is — try again.' }, { status: 503 });
    if (existingById && existingById.role !== 'sales' && existingById.role !== 'admin') {
      return badRequest(
        `That auth user is already a ${existingById.role} account (${existingById.full_name}). ` +
        `A staff seat is never created by converting an existing account — create a separate login for the rep.`
      );
    }

    email = (found.user.email ?? '').toLowerCase();
    fullName = typeof body.fullName === 'string' && body.fullName.trim()
      ? body.fullName.trim()
      : ((existingById?.full_name as string | null) ?? email ?? 'Sales');
    phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  } else {
    const check = checkNewRep(body);
    if (!check.ok) return badRequest(check.error);
    email = check.email;
    fullName = check.fullName;
    phone = check.phone;

    const { data: existingProfile, error: profErr } = await admin
      .from('profiles').select('id, role, full_name').eq('email', email).maybeSingle();
    if (profErr) return NextResponse.json({ error: 'Could not check for an existing account — try again.' }, { status: 503 });
    if (existingProfile) {
      // Never quietly promote someone. If this email is already a person in
      // CareerRai, the founder decides what happens to them — not this route.
      return badRequest(
        existingProfile.role === 'sales'
          ? 'That email is already a sales account. Configure it from the capacity screen instead.'
          : `That email already belongs to a ${existingProfile.role} account (${existingProfile.full_name}). A staff seat is never created by converting an existing account.`
      );
    }

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, ...(phone ? { phone } : {}) },
    });
    if (authErr || !created?.user) {
      return badRequest(`Supabase Auth refused to create the login: ${authErr?.message ?? 'unknown error'}`);
    }
    userId = created.user.id;
  }

  // Normalise the phone the same way login does, so phone login finds this
  // profile. A phone we cannot normalise is stored as NULL rather than as a
  // string that will never match at the login door.
  const normalisedPhone = phone ? normalizeIndianPhone(phone) : null;

  const { error: upsertErr } = await admin.from('profiles').upsert({
    id: userId,
    role: 'sales',
    full_name: fullName,
    email: email || null,
    ...(normalisedPhone ? { phone: normalisedPhone } : {}),
    password_set: true,
  }, { onConflict: 'id' });
  if (upsertErr) {
    console.error('[create-sales-rep] profile write failed:', upsertErr.message);
    return NextResponse.json({
      error: `The login exists but the CareerRai profile could not be written: ${upsertErr.message}. ` +
        `Re-run in attach mode with userId ${userId} once the cause is fixed — do not create a second login.`,
      userId,
    }, { status: 500 });
  }

  const { data: cfg, error: cfgErr } = await admin
    .from('sales_rep_config')
    .upsert({ ...config, rep_id: userId, updated_by: principal.id }, { onConflict: 'rep_id' })
    .select('*').single();
  if (cfgErr) {
    console.error('[create-sales-rep] config write failed:', cfgErr.message);
    return NextResponse.json({
      error: `The sales profile exists but its capacity row could not be written: ${cfgErr.message}. ` +
        `The rep will show as NOT CONFIGURED and receive nothing until it is set.`,
      userId,
    }, { status: 500 });
  }

  // The credential is not in this record, and never will be.
  await auditSales(principal.id, 'sales_rep_provisioned', { type: 'rep', id: userId },
    { after: { email, fullName, mode, config: cfg }, reason: `employment_type=${employmentType}` });

  return NextResponse.json({ ok: true, repId: userId, email, config: cfg });
}
