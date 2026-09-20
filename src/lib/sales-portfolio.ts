import { createAdminClient } from '@/lib/supabase/admin';
import { SESSION_PRICE_PAISE } from '@/lib/session-credit';
import { chunkIds } from '@/lib/truth/batch';
import { buildRemarkHistories, HUMAN_PROVENANCE, MAX_REMARKS_ON_CARD, type RemarkHistory } from '@/lib/sales-remarks';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A rep's PORTFOLIO — only the leads she owns and works, never the company's
// total lead pile. A salesperson sees her book and her numbers; the base size,
// reachability, momentum distribution etc. are founder-level and stay out of
// her workspace. Don't overshare, don't undershare — everything she needs to
// close, nothing that isn't hers.

// The one price a rep sells: the single session, imported from the same
// constant checkout charges (sales-script-honesty rule). A hard-coded 999
// here had the rep's pipeline valued against an offer the script doesn't
// make — two prices on two rep surfaces (found in the 24 Aug research pass).
const PRICE = SESSION_PRICE_PAISE / 100;

export interface PortfolioLead {
  studentId: string; name: string; phone: string | null; waNumber: string | null;
  status: string; callbackAt: string | null; note: string | null; updatedAt: string | null;
  /** SA-1E: financial truth — a 'paid' row exists in student_payments. */
  paid: boolean;
  /**
   * The last real conversation, so the rep does not have to open the profile
   * to remember it (Anshul, 20 Sep 2026). Newest TYPED remark where there is
   * one, else the newest human touch. `null` when nobody has spoken to them.
   */
  lastSaid: string | null;
  lastSaidAt: string | null;
  /** True when the rep wrote these words, false for an auto-note. */
  lastSaidTyped: boolean;
  /** Set only when somebody else wrote it (see lib/sales-remarks). */
  lastSaidBy: string | null;
  /**
   * This sale is CREDITED TO THIS REP in `sales_conversions`.
   *
   * Distinct from `paid` above, which is true for anyone in his book who paid
   * by any route. Founder, 20 Sep 2026: "don't share the total number of
   * students paid. Show him only students paid through him." So his screens
   * count and list THIS, and `paid` is left to do its other job — keeping a
   * paying student out of active calling work (SA-1E).
   */
  attributedToMe: boolean;
}
export interface PortfolioSummary {
  total: number; working: number; interested: number; callbacks: number;
  /** WON = a paid ledger row (student_payments.status='paid') — NEVER the
   *  typed 'converted' disposition. SA-1E: one financial truth.
   *  UNCHANGED, deliberately: see `attributedToMe` below. */
  converted: number;
  /**
   * Conversions CREDITED TO THIS REP, from `sales_conversions`.
   *
   * Anshul, 20 Sep 2026, verifying the fixes: "Won count seems incorrect. I
   * have 2 Won conversions, but the Summary is showing 5. Booked looks fine."
   * He was right, and the system already agreed: the attribution ledger held
   * exactly 2 rows, both his. `converted` above was showing paid students in
   * his book — 2 his, and 3 typed `not_contacted` who paid on their own and
   * whom he has never spoken to. No test accounts.
   *
   * THIS IS A NEW FIELD, NOT A REDEFINITION, and that is the point. SA-1E
   * fixes what `converted` means and its guard asserts it; repurposing that
   * name to mean "attributed" would have made a constitutional test fail and
   * tempted an amendment. Both numbers are legitimate and they answer
   * different questions — how much money landed in this book, and how much of
   * it this rep is credited with.
   *
   * Money-backed, not a keyboard claim: `sales_conversions` is keyed on our
   * payment id, withdrawn when a refund lands, and is the single source rep
   * PAY is computed from (lib/sales-earnings). So this is the number that
   * agrees with his payslip — which is why showing him 5 mattered.
   */
  attributedToMe: number;
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
  /**
   * Conversions credited to this rep (`sales_conversions`). Defaults to 0
   * rather than to the paid count: an unknown attribution must never silently
   * borrow someone else's number (L1).
   */
  attributedConversions: number = 0,
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
    attributedToMe: attributedConversions,
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
export async function getRepPortfolio(admin: any, repId: string): Promise<{
  leads: PortfolioLead[];
  summary: PortfolioSummary;
  /**
   * False when a chunk of the profile or payment read failed. The page says
   * so instead of rendering a book of students called "Student" and a Won
   * column of zero, which is what shipped silently until 20 Sep 2026.
   */
  bookReadable: boolean;
}> {
  const db = admin ?? createAdminClient();
  const { data: rows } = await db.from('lead_outreach')
    .select('student_id, status, callback_at, notes, updated_at')
    .eq('owner_id', repId);
  const list = (rows ?? []) as any[];
  if (list.length === 0) {
    return { leads: [], summary: summarizePortfolio([], []), bookReadable: true };
  }
  const ids = list.map((r) => r.student_id);

  // ── THE BOOK DOES NOT FIT IN A URL (Anshul, 20 Sep 2026) ────────────────
  //
  // "All entries are showing as generic 'Student' instead of individual
  // names. I have to open each profile to see the student's name."
  //
  // Both reads below used to pass the rep's WHOLE BOOK to one `.in()`.
  // PostgREST puts those values in the request URL: at 1,140 leads that is a
  // ~42 KB request, and it fails. Neither error was inspected — the rows came
  // back empty, the maps came back empty, and every row fell through to
  // `?? 'Student'`. Nothing threw and nothing logged.
  //
  // This is the 23 Aug defect for the third time (lib/truth/batch exists
  // because of it, Incident #57 was the same shape at 975 ids, and
  // `sales-board.ts` was fixed for it on 19 Sep). When that fix shipped it
  // said the remaining call sites were "none on the counsellor workspace" —
  // that was wrong, and this file is why. `/sales/leads` IS his workspace.
  //
  // THE PAYMENTS READ IS THE WORSE HALF, and nobody reported it because it is
  // invisible. When it fails, `paid` is false for every lead: the Won filter
  // empties, and SA-1E's rule that a paying student leaves active work stops
  // holding, so a student who has already paid keeps being worked as a lead.
  const chunks = chunkIds(ids);
  let bookReadable = true;
  const byId = new Map<string, { full_name: string | null; phone: string | null }>();
  const paidSet = new Set<string>();
  const paidAmounts: number[] = [];

  const [profResults, paidResults] = await Promise.all([
    Promise.all(chunks.map((c) => db.from('profiles').select('id, full_name, phone').in('id', c))),
    // The financial ledger is the ONE source of WON (SA-1E). client events
    // and typed dispositions are signals, never money truth.
    Promise.all(chunks.map((c) =>
      db.from('student_payments').select('student_id, amount').eq('status', 'paid').in('student_id', c))),
  ]);
  for (const r of profResults as any[]) {
    if (r.error) { bookReadable = false; continue; }
    for (const p of (r.data ?? []) as any[]) {
      byId.set(p.id, { full_name: p.full_name ?? null, phone: p.phone ?? null });
    }
  }
  for (const r of paidResults as any[]) {
    // A failed payments chunk must not quietly read as "nobody paid": that is
    // the direction that puts a paying student back in the calling queue.
    if (r.error) { bookReadable = false; continue; }
    for (const p of (r.data ?? []) as any[]) {
      paidSet.add(p.student_id as string);
      paidAmounts.push((p.amount as number | null) ?? 0);
    }
  }

  // ── WHAT WAS SAID, ON THE ROW (Anshul, 20 Sep 2026) ─────────────────────
  //
  // "I still need to open each profile to check the last update and previous
  // conversation details." `lead_outreach.notes` is a pipeline field, not the
  // conversation — the student's own words live in `sales_activity`, and
  // lib/sales-remarks is the one definition of which rows count (typed, human,
  // self-reported). Incident #69 is exactly what happens when that filter is
  // skipped: our own intake bookkeeping surfaces as the student's last remark.
  //
  // Chunked like the rest, and a failure here costs the remark only — never
  // the row. A book you can read without names is broken; a book you can read
  // without the last remark is merely poorer.
  const remarkRows: any[] = [];
  const actRes = await Promise.all(chunks.map((c) => db.from('sales_activity')
    .select('student_id, created_at, status, note, actor_id, provenance')
    .eq('provenance', HUMAN_PROVENANCE)
    // BOTH halves of isHumanTouch at the database, so null-actor rows cannot
    // eat the limit below before JS discards them.
    .not('actor_id', 'is', null)
    .in('student_id', c)
    .order('created_at', { ascending: false })
    // Scaled to the chunk, never flat — the shape call-queue.ts already uses.
    // A flat 400 across 100 students was 4 rows each against a measured
    // average of 3.4 and a max of 16, so a heavy chunk would silently drop
    // the newest remark for whoever sorted last.
    .limit(c.length * MAX_REMARKS_ON_CARD * 4)));
  for (const r of actRes as any[]) {
    if (r.error) continue;
    remarkRows.push(...((r.data ?? []) as any[]));
  }
  const historyBy = buildRemarkHistories(remarkRows, null, 1, repId);

  // ── WON IS WHAT HE CLOSED, NOT WHAT LANDED IN HIS BOOK ──────────────────
  //
  // sales_conversions is the attribution ledger: keyed on our payment id,
  // withdrawn on refund, and the single source rep PAY is computed from
  // (lib/sales-earnings). Reading it here is what makes the Won tile agree
  // with his payslip.
  //
  // Chunked and error-inspected like every other read on this surface. A
  // failure sets bookReadable rather than quietly reporting zero conversions,
  // because "you closed nothing" is the most damaging wrong number this page
  // could show a counsellor.
  const attributed = new Set<string>();
  const convResults = await Promise.all(chunks.map((c) =>
    db.from('sales_conversions').select('student_id').in('student_id', c)));
  for (const r of convResults as any[]) {
    if (r.error) { bookReadable = false; continue; }
    for (const row of (r.data ?? []) as any[]) attributed.add(row.student_id as string);
  }

  const leads: PortfolioLead[] = list.map((r) => {
    const p = byId.get(r.student_id) as any;
    const h: RemarkHistory | undefined = historyBy.get(r.student_id);
    const said = h?.lastTyped ?? h?.last ?? null;
    return {
      studentId: r.student_id, name: p?.full_name ?? 'Student', phone: p?.phone ?? null, waNumber: waNumber(p?.phone ?? null),
      status: r.status ?? 'working', callbackAt: r.callback_at ?? null, note: r.notes ?? null, updatedAt: r.updated_at ?? null,
      paid: paidSet.has(r.student_id),
      // Prefer what the rep TYPED over the newest row: `no_answer` is the
      // commonest disposition and its auto-note would otherwise bury the
      // actual conversation from the call before it (the 4 Sep rule).
      lastSaid: said?.note ?? null,
      lastSaidAt: said?.atIso ?? null,
      lastSaidTyped: said?.typed ?? false,
      lastSaidBy: said?.by ?? null,
      attributedToMe: attributed.has(r.student_id),
    };
  }).sort((a, b) => (RANK[a.status] ?? 5) - (RANK[b.status] ?? 5) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  const summary = summarizePortfolio(leads, paidAmounts, attributed.size);
  return { leads, summary, bookReadable };
}

// Her own call activity (from the append-only log), for her summary.
export async function getRepCallStats(admin: any, repId: string): Promise<{ today: CallStats; week: CallStats }> {
  const db = admin ?? createAdminClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await db.from('sales_activity').select('status, created_at').eq('actor_id', repId).gte('created_at', since);
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
