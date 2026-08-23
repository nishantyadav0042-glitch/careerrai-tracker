import { createAdminClient } from '@/lib/supabase/admin';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A rep's PORTFOLIO — only the leads she owns and works, never the company's
// total lead pile. A salesperson sees her book and her numbers; the base size,
// reachability, momentum distribution etc. are founder-level and stay out of
// her workspace. Don't overshare, don't undershare — everything she needs to
// close, nothing that isn't hers.

const PRICE = 999;

export interface PortfolioLead {
  studentId: string; name: string; phone: string | null; waNumber: string | null;
  status: string; callbackAt: string | null; note: string | null; updatedAt: string | null;
  /** SA-1E: financial truth — a 'paid' row exists in student_payments. */
  paid: boolean;
}
export interface PortfolioSummary {
  total: number; working: number; interested: number; callbacks: number;
  /** WON = a paid ledger row (student_payments.status='paid') — NEVER the
   *  typed 'converted' disposition. SA-1E: one financial truth. */
  converted: number;
  lost: number;
  /** Speculative: interested × price. */
  pipeline: number;
  /** Real rupees from the paid ledger rows of this book — not count × price. */
  booked: number;
}

/** SA-1E: summary derivation as a pure function, so the WON rule is testable:
 *  typed-converted-but-unpaid is NOT won; paid is won regardless of typing. */
export function summarizePortfolio(
  leads: { status: string; paid: boolean }[],
  paidPaiseByStudent: number[],
): PortfolioSummary {
  const cnt = (s: string) => leads.filter((r) => r.status === s).length;
  const won = leads.filter((r) => r.paid).length;
  const lost = cnt('not_interested');
  const interested = cnt('interested');
  const bookedPaise = paidPaiseByStudent.reduce((a, b) => a + b, 0);
  return {
    total: leads.length,
    working: leads.length - won - lost,
    interested,
    callbacks: cnt('follow_up'),
    converted: won,
    lost,
    pipeline: interested * PRICE,
    booked: Math.round(bookedPaise / 100),
  };
}
export interface CallStats { attempts: number; connected: number; converted: number; connectRate: number; convRate: number; }

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d.length === 12 && d.startsWith('91') ? d : null;
}

// Active pipeline first (interested → callbacks → working), closed last.
const RANK: Record<string, number> = { interested: 0, follow_up: 1, no_answer: 2, called: 3, converted: 8, not_interested: 9 };

// R3 (23 Aug): keyed on profiles.id, not the rep's email. Both sales tables
// held ZERO rows when this changed, so `owner`/`actor` now carry the uuid with
// nothing to migrate. A caller that cannot identify the rep must pass an id
// that matches nothing — never an empty string, which would widen the query.
export async function getRepPortfolio(admin: any, repId: string): Promise<{ leads: PortfolioLead[]; summary: PortfolioSummary }> {
  const db = admin ?? createAdminClient();
  const { data: rows } = await db.from('lead_outreach')
    .select('student_id, status, callback_at, notes, updated_at')
    .eq('owner', repId);
  const list = (rows ?? []) as any[];
  if (list.length === 0) {
    return { leads: [], summary: summarizePortfolio([], []) };
  }
  const ids = list.map((r) => r.student_id);
  const [{ data: profs }, { data: paidRows }] = await Promise.all([
    db.from('profiles').select('id, full_name, phone').in('id', ids),
    // The financial ledger is the ONE source of WON (SA-1E). client events
    // and typed dispositions are signals, never money truth.
    db.from('student_payments').select('student_id, amount').eq('status', 'paid').in('student_id', ids),
  ]);
  const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const paidSet = new Set((paidRows ?? []).map((r: any) => r.student_id as string));

  const leads: PortfolioLead[] = list.map((r) => {
    const p = byId.get(r.student_id) as any;
    return {
      studentId: r.student_id, name: p?.full_name ?? 'Student', phone: p?.phone ?? null, waNumber: waNumber(p?.phone ?? null),
      status: r.status ?? 'working', callbackAt: r.callback_at ?? null, note: r.notes ?? null, updatedAt: r.updated_at ?? null,
      paid: paidSet.has(r.student_id),
    };
  }).sort((a, b) => (RANK[a.status] ?? 5) - (RANK[b.status] ?? 5) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  const summary = summarizePortfolio(leads, (paidRows ?? []).map((r: any) => (r.amount as number | null) ?? 0));
  return { leads, summary };
}

// Her own call activity (from the append-only log), for her summary.
export async function getRepCallStats(admin: any, repId: string): Promise<{ today: CallStats; week: CallStats }> {
  const db = admin ?? createAdminClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await db.from('sales_activity').select('status, created_at').eq('actor', repId).gte('created_at', since);
  const rows = (data ?? []) as any[];
  const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const isToday = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayIst;
  const roll = (r: any[]): CallStats => {
    const attempts = r.length;
    const connected = r.filter((x) => x.status !== 'no_answer').length;
    const converted = r.filter((x) => x.status === 'converted').length;
    return { attempts, connected, converted, connectRate: attempts ? Math.round((connected / attempts) * 100) : 0, convRate: connected ? Math.round((converted / connected) * 100) : 0 };
  };
  return { today: roll(rows.filter((r) => isToday(r.created_at))), week: roll(rows) };
}
