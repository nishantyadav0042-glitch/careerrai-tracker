import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isUuid, salesPrincipal } from '@/lib/sales-authz';
import { auditSales } from '@/lib/sales-audit';
import { checkBookTransfer, describeTransfer, type SeatHolder } from '@/lib/sales-succession';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── SUCCESSION, AS ONE ACTION ───────────────────────────────────────────────
//
// Founder, 29 Aug 2026: if a counsellor leaves, the book must transfer by
// itself rather than stranding a thousand students with nobody.
//
// The founder opens one screen, picks who is leaving and who is taking over,
// types why, and the entire book moves — every owned student and every open
// promise — in one transaction that either completes or does nothing.
//
// WHAT THIS ROUTE DOES AND DOES NOT DECIDE. It decides WHETHER (authorisation,
// then checkBookTransfer). It does not decide HOW: the move is
// transfer_sales_book(), a SECURITY DEFINER function, because three separate
// Supabase calls cannot be made atomic and a half-moved book — students split
// across a departed rep and a current one, with no screen showing it — is the
// exact failure succession exists to prevent.
//
// The function trusts p_actor for the audit trail ONLY. Authorisation is here,
// against the session, which is why the function's EXECUTE grant is revoked
// from anon and authenticated: this route is the only door.
//
// DEACTIVATING THE DEPARTING SEAT IS NOT DONE HERE, deliberately. Moving a book
// and closing a seat are two decisions; a rep may hand over their book while
// going on two weeks' leave and come back to it. Bundling them would make the
// only handover tool also a firing tool. The founder closes the seat on the
// capacity screen when that is what he means.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const principal = await salesPrincipal(admin, user.id);
  if (!principal || principal.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) ?? {};
  const fromId = body.fromRepId;
  const toId = body.toRepId;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!isUuid(fromId) || !isUuid(toId)) {
    return NextResponse.json({ error: 'Both reps must be identified by their account id.' }, { status: 400 });
  }
  // A reason is required by the table's CHECK too. Asked for here so the
  // founder gets a sentence instead of a 23514, and because "why did this book
  // move" is the question the history exists to answer — an empty reason makes
  // the row a timestamp with no meaning.
  if (reason.length < 3 || reason.length > 500) {
    return NextResponse.json({ error: 'Say why the book is moving (3–500 characters). It is recorded in the handover history.' }, { status: 400 });
  }

  // ── Who are these two people, really ──────────────────────────────────────
  const { data: people, error: peopleErr } = await admin
    .from('profiles').select('id, full_name, role').in('id', [fromId, toId]);
  if (peopleErr) return NextResponse.json({ error: 'Could not verify the two accounts — nothing was changed.' }, { status: 503 });

  const { data: configs, error: cfgErr } = await admin
    .from('sales_rep_config').select('rep_id, active').in('rep_id', [fromId, toId]);
  if (cfgErr) return NextResponse.json({ error: 'Could not read the team configuration — nothing was changed.' }, { status: 503 });

  const cfgById = new Map(((configs ?? []) as any[]).map((c) => [c.rep_id as string, c]));
  const holderOf = (id: string): SeatHolder | null => {
    const p = ((people ?? []) as any[]).find((r) => r.id === id);
    if (!p) return null;
    // A student is not a seat. Refused here rather than at the FK, so the
    // founder is told what went wrong instead of meeting a constraint.
    if (p.role !== 'sales' && p.role !== 'admin') return null;
    const c = cfgById.get(id);
    return { repId: id, name: p.full_name ?? id, configured: c != null, active: c?.active === true };
  };

  const from = holderOf(fromId);
  const to = holderOf(toId);

  // The book is counted BEFORE the move, from the same table the function will
  // update, so the refusal and the move agree about what "empty" means.
  const { count: bookSize, error: countErr } = await admin
    .from('lead_outreach').select('student_id', { count: 'exact', head: true }).eq('owner_id', fromId);
  if (countErr || bookSize == null) {
    return NextResponse.json({ error: 'Could not count the book being moved — nothing was changed. Try again.' }, { status: 503 });
  }

  const check = checkBookTransfer(from, to, bookSize);
  if (!check.ok) return NextResponse.json({ error: check.error, reason: check.reason }, { status: 409 });

  // ── The move ──────────────────────────────────────────────────────────────
  const { data: moved, error: rpcErr } = await admin.rpc('transfer_sales_book', {
    p_from: fromId, p_to: toId, p_reason: reason, p_actor: principal.id,
  });
  if (rpcErr) {
    console.error('[transfer-book] transfer failed:', rpcErr.message);
    return NextResponse.json({
      error: `The handover did not happen and nothing was moved: ${rpcErr.message}. The book is exactly as it was.`,
    }, { status: 500 });
  }

  const row = (Array.isArray(moved) ? moved[0] : moved) as any;
  const result = {
    leadsMoved: Number(row?.leads_moved ?? 0),
    followupsMoved: Number(row?.followups_moved ?? 0),
    overdueInherited: Number(row?.overdue_inherited ?? 0),
  };

  await auditSales(principal.id, 'sales_book_transferred', { type: 'rep', id: fromId },
    { after: { to: toId, ...result }, reason });

  return NextResponse.json({
    ok: true,
    ...result,
    message: describeTransfer(check.from, check.to, result),
  });
}
