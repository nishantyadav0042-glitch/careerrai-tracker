import { PLANS, SESSION_PRICING } from '@/lib/plans';
import { readRowsForIds } from '@/lib/truth/batch';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── What a counsellor is owed. One definition, and this is it. ──────────────
//
// On 28 Aug 2026 the founder signed engagement letters with Anshul Yadav and
// Neelam: ₹8,000 fixed per month, plus 10% of the amount realised from each
// student they convert, "payable when the student's payment is realised and is
// not subsequently refunded", with a statement of conversions furnished on
// request. Two people are now paid from arithmetic that did not exist.
//
// THE NUMBER THIS REPLACES. The founder's rep screen already showed a "Won
// (paid)" tile and a rupee figure, and it would have been the obvious thing to
// pay from. It must never be used for that, and the reasons are recorded in
// 20260828a: it credits whoever owns the lead TODAY rather than whoever owned
// it when the money landed, it counts payments that predate the relationship,
// it has no month, and — until the same day — it counted refunded money,
// because the refund webhook never took a payment out of the paid ledger.
//
// So a rep's pay is computed HERE, from sales_conversions, and nowhere else.
// A guard test greps for any second place that multiplies money by a rate.
//
// ── LAW L1 LIVES IN THE RETURN TYPE ────────────────────────────────────────
//
// A trustworthy UNKNOWN beats a precise lie, and payroll is where that law
// earns its keep. If a rep's terms have not been entered, this does NOT
// compute ₹0 and it does NOT assume 10% because that is what today's two
// letters happen to say. It returns `termsStated: false` and leaves the money
// null, so every surface is forced to render "terms not set" instead of a
// confident number the founder might pay — or worse, might not.

/** Percent → paise, rounded to whole rupees, PER LINE. */
export function incentiveForPaise(amountPaise: number, percent: number): number {
  // Rounded to the rupee, per conversion, deliberately.
  //
  // 10% of ₹399 is ₹39.90. The engagement letter's own table tells Anshul and
  // Neelam they earn ₹40 on a single session, ₹100 on a month and ₹260 on
  // Till-CAT. Rounding per line to the nearest rupee is what reproduces those
  // three numbers exactly, so a counsellor can check any single row against
  // the letter in their hand and find it agrees. Rounding the monthly total
  // instead would drift from the letter by a few rupees and cost more trust
  // than the rupees are worth.
  return Math.round((amountPaise * percent) / 100 / 100) * 100;
}

export interface ConversionLine {
  paymentId: string;
  studentId: string;
  studentName: string | null;
  plan: string | null;
  /** What the student paid, paise. */
  amountPaise: number;
  realisedAt: string;
  /** Set when the money went back — this line earns nothing. */
  refundedAt: string | null;
  /** Paise. 0 for a refunded line; null when terms are not stated. */
  incentivePaise: number | null;
}

export type RepTerms =
  | { stated: true; fixedPaise: number; incentivePercent: number }
  | { stated: false; missing: Array<'fixed' | 'incentive'> };

export interface Payslip {
  /** YYYY-MM, IST. */
  month: string;
  repId: string;
  lines: ConversionLine[];
  /** Conversions that stuck — refunds excluded. */
  conversionsCounted: number;
  conversionsRefunded: number;
  /** Money the student actually paid and kept paying, paise. */
  netRealisedPaise: number;
  /** Money handed back inside this month's conversions, paise. */
  refundedPaise: number;
  terms: RepTerms;
  /** All null when terms are not stated — never 0. See Law L1 above. */
  fixedPaise: number | null;
  incentivePaise: number | null;
  totalPaise: number | null;
}

/**
 * The IST month window, as an ISO half-open range.
 *
 * Half-open [start, end) rather than an inclusive end: a payment realised at
 * 23:59:59.7 on the last of the month belongs to that month, and an inclusive
 * `<= 23:59:59` boundary silently drops it into nobody's payslip.
 *
 * IST, because the counsellors and the students are in India and the payslip
 * has to match the month a human means. A UTC month boundary moves ₹ between
 * payslips for every sale made after 5:30am IST on the 1st.
 */
export function istMonthWindow(month: string): { startIso: string; endIso: string } {
  const [y, m] = month.split('-').map(Number);
  // IST is UTC+5:30 with no DST, so the month's 00:00 IST is the previous
  // day's 18:30 UTC. Constructed from the offset rather than a library.
  const startUtc = Date.UTC(y, m - 1, 1, 0, 0, 0) - 5.5 * 3600_000;
  const endUtc = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0) - 5.5 * 3600_000;
  return { startIso: new Date(startUtc).toISOString(), endIso: new Date(endUtc).toISOString() };
}

/** The IST month a moment falls in, YYYY-MM. */
export function istMonthOf(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
}

/** Read a rep's terms. Absent or partial → not stated, never a guess. */
export function readTerms(row: { monthly_fixed_paise?: number | null; incentive_percent?: number | string | null } | null): RepTerms {
  const fixed = row?.monthly_fixed_paise ?? null;
  // numeric(5,2) arrives from PostgREST as a string — Number() it once, here,
  // rather than letting '10.00' reach arithmetic somewhere downstream.
  const pctRaw = row?.incentive_percent ?? null;
  const pct = pctRaw == null ? null : Number(pctRaw);
  const missing: Array<'fixed' | 'incentive'> = [];
  if (fixed == null) missing.push('fixed');
  if (pct == null || Number.isNaN(pct)) missing.push('incentive');
  if (missing.length) return { stated: false, missing };
  return { stated: true, fixedPaise: fixed as number, incentivePercent: pct as number };
}

export interface RawConversion {
  payment_id: string; student_id: string; plan: string | null;
  amount_paise: number; realised_at: string; refunded_at: string | null;
}

/**
 * The payslip. PURE — conversions and terms in, money out, no I/O and no
 * clock, so every case is a test rather than an argument.
 */
export function computePayslip(args: {
  repId: string;
  month: string;
  conversions: RawConversion[];
  terms: RepTerms;
  nameById?: Map<string, string | null>;
}): Payslip {
  const { repId, month, conversions, terms, nameById } = args;

  const lines: ConversionLine[] = conversions.map((c) => ({
    paymentId: c.payment_id,
    studentId: c.student_id,
    studentName: nameById?.get(c.student_id) ?? null,
    plan: c.plan,
    amountPaise: c.amount_paise,
    realisedAt: c.realised_at,
    refundedAt: c.refunded_at,
    // A refunded line is shown, and earns nothing. Hiding it would make the
    // statement disagree with the rep's own memory of the sale, which is a
    // worse conversation than the deduction itself.
    incentivePaise: !terms.stated ? null
      : c.refunded_at ? 0
      : incentiveForPaise(c.amount_paise, terms.incentivePercent),
  }));

  const kept = lines.filter((l) => !l.refundedAt);
  const gone = lines.filter((l) => l.refundedAt);

  const incentivePaise = terms.stated
    ? kept.reduce((a, l) => a + (l.incentivePaise ?? 0), 0)
    : null;
  const fixedPaise = terms.stated ? terms.fixedPaise : null;

  return {
    month, repId, lines,
    conversionsCounted: kept.length,
    conversionsRefunded: gone.length,
    netRealisedPaise: kept.reduce((a, l) => a + l.amountPaise, 0),
    refundedPaise: gone.reduce((a, l) => a + l.amountPaise, 0),
    terms,
    fixedPaise,
    incentivePaise,
    totalPaise: fixedPaise == null || incentivePaise == null ? null : fixedPaise + incentivePaise,
  };
}

/** Read one rep's payslip for one IST month. */
export async function getRepPayslip(admin: any, repId: string, month: string): Promise<Payslip> {
  const { startIso, endIso } = istMonthWindow(month);
  const [{ data: convRows, error: convErr }, { data: cfg }] = await Promise.all([
    admin.from('sales_conversions')
      .select('payment_id, student_id, plan, amount_paise, realised_at, refunded_at')
      .eq('rep_id', repId)
      .gte('realised_at', startIso)
      .lt('realised_at', endIso)
      .order('realised_at', { ascending: false }),
    admin.from('sales_rep_config')
      .select('monthly_fixed_paise, incentive_percent').eq('rep_id', repId).maybeSingle(),
  ]);

  // A failed read must not render as "you earned nothing this month". Same
  // rule as the sales queue (Boundary 2): throw, so the surface can say the
  // number is unavailable rather than quietly showing a demoralising zero on
  // the one screen where being wrong costs the most trust.
  if (convErr) throw new Error(`Could not read conversions: ${convErr.message}`);

  const conversions = (convRows ?? []) as RawConversion[];
  const ids = [...new Set(conversions.map((c) => c.student_id))];

  // Chunked, because a bare `.in('id', ids)` is a population-scaled read: it
  // grows with the month's conversions and PostgREST puts the whole list in a
  // URL, so a good month would start silently truncating names. readRowsForIds
  // is the repo's bounded reader and is all-or-nothing across chunks.
  //
  // A failed NAME read is survivable and deliberately does not throw: the
  // money is already correct, and a payslip showing "Student" beside the right
  // rupees is far better than no payslip at all. The conversions read above is
  // the one that throws, because being wrong about THAT is being wrong about
  // what someone is paid.
  const namesSrc = await readRowsForIds<string, { id: string; full_name: string | null }>(
    'payslip student names', ids,
    (chunk) => admin.from('profiles').select('id, full_name').in('id', chunk),
  );
  const nameById = new Map<string, string | null>(
    namesSrc.state === 'value'
      ? namesSrc.value.map((p) => [p.id, p.full_name ?? null] as [string, string | null])
      : [],
  );

  return computePayslip({ repId, month, conversions, terms: readTerms(cfg), nameById });
}

/**
 * Every rep's payslip for one month.
 *
 * SCALE-CONTRACT §: every count must drill down to the exact records behind
 * it, so this returns the LINES, not just totals. The founder's payroll screen
 * shows the number and the conversions that make it up on the same page —
 * there is no separate "detail" query that could disagree with the summary.
 */
export async function getTeamPayslips(admin: any, month: string): Promise<Array<Payslip & { repName: string }>> {
  const { data: staff } = await admin.from('profiles')
    .select('id, full_name, email').in('role', ['sales', 'admin']).order('full_name');
  const reps = ((staff ?? []) as any[]);
  const slips = await Promise.all(reps.map(async (r) => ({
    ...(await getRepPayslip(admin, r.id as string, month)),
    repName: (r.full_name as string | null) ?? (r.email as string | null) ?? (r.id as string),
  })));
  // A rep with no conversions and no terms is noise on a payroll screen —
  // but a rep with terms is owed their fixed fee whether or not they sold
  // anything, so they stay.
  return slips.filter((s) => s.terms.stated || s.lines.length > 0);
}

// ── Writing the ledger ──────────────────────────────────────────────────────

/**
 * Record who closed this sale, at the moment the money is realised.
 *
 * BEST-EFFORT AND NEVER THROWS, by the same rule that governs the booking
 * notification (D3, 27 Aug): a student's payment has already succeeded by the
 * time this runs, and no bookkeeping failure may turn a captured payment into
 * a 500 that makes Razorpay retry an activation that already worked. A missing
 * attribution row is a founder-visible gap the payroll screen reports; a
 * failed activation is a paying student with nothing to show for it.
 *
 * Idempotent twice over: `payment_id` is the primary key, and the insert is
 * `ignoreDuplicates`, so a redelivered webhook cannot pay a rep twice.
 */
export async function recordConversion(admin: any, args: {
  paymentId: string; studentId: string; amountPaise: number; plan: string | null;
  realisedAt?: string;
}): Promise<void> {
  try {
    if (!args.amountPaise || args.amountPaise <= 0) return;

    // WHO OWNED IT WHEN THE MONEY LANDED — read now, frozen forever.
    const { data: lead, error } = await admin.from('lead_outreach')
      .select('owner_id').eq('student_id', args.studentId).maybeSingle();
    if (error) {
      console.error('[sales-earnings] owner read failed:', error.message);
      return;
    }
    const repId = (lead?.owner_id as string | null) ?? null;
    // Nobody owned this lead, so nobody sold it. An unattributed sale is the
    // honest record — inventing an owner here is how a rep gets paid for a
    // student who bought on their own.
    if (!repId) return;

    // ── A TEST PURCHASE IS NOT A SALE (5 Sep 2026) ──────────────────────────
    //
    // The founder bought a ₹399 session on his own phone-signup account to
    // check that checkout worked, and refunded it twelve hours later. That
    // account sat in Neelam's book, so the payment credited her a conversion.
    // It was the only conversion she had; the sales screen therefore reported
    // one sale for a rep who had made none, and the lead had never even been
    // contacted (`lead_outreach.status = 'not_contacted'`).
    //
    // The population rule already exists and is used everywhere a "real
    // student" is counted (getRealStudents): role student, not a test account,
    // not a demo. Attribution simply never asked. It asks now, because a
    // conversion count that includes our own test transactions is not a
    // measure of selling — and a rep can be paid an incentive on it.
    //
    // HONEST ABOUT THE LIMIT: this catches a payer FLAGGED as test or demo. It
    // would not have caught the 4 Sep case on its own, because that account was
    // never flagged — it looked exactly like a real student. Flagging it is a
    // data fix, done separately; this is the guard that stops the same shape
    // from recurring once an account is correctly marked.
    const { data: payer, error: payerErr } = await admin.from('profiles')
      .select('role, is_test_account, is_demo').eq('id', args.studentId).maybeSingle();
    if (payerErr) {
      // Do not guess. Attributing on an unreadable profile is how the bug
      // above happens; skipping loses a row the payroll screen already reports
      // as an unattributed sale, which is recoverable.
      console.error('[sales-earnings] payer read failed:', payerErr.message);
      return;
    }
    const isRealStudent = payer?.role === 'student'
      && payer?.is_test_account !== true
      && payer?.is_demo !== true;
    if (!isRealStudent) {
      console.warn('[sales-earnings] conversion not attributed — payer is not a real student:', args.studentId);
      return;
    }

    const { error: insErr } = await admin.from('sales_conversions')
      .upsert({
        payment_id: args.paymentId,
        student_id: args.studentId,
        rep_id: repId,
        amount_paise: args.amountPaise,
        plan: args.plan,
        realised_at: args.realisedAt ?? new Date().toISOString(),
        basis: 'owner_at_payment',
      }, { onConflict: 'payment_id', ignoreDuplicates: true });
    if (insErr) console.error('[sales-earnings] conversion insert failed:', insErr.message);
  } catch (e) {
    console.error('[sales-earnings] recordConversion threw:', e);
  }
}

/**
 * The money went back — withdraw the incentive on THIS transaction only.
 *
 * Clause 7 of both letters: "Where a refund is made, only the incentive on
 * that transaction shall stand withdrawn." The row is kept, stamped rather
 * than deleted, so the rep's statement can show the deduction and say why.
 */
export async function markConversionRefunded(admin: any, paymentId: string, at?: string): Promise<void> {
  try {
    const { error } = await admin.from('sales_conversions')
      .update({ refunded_at: at ?? new Date().toISOString() })
      .eq('payment_id', paymentId)
      .is('refunded_at', null);
    if (error) console.error('[sales-earnings] refund stamp failed:', error.message);
  } catch (e) {
    console.error('[sales-earnings] markConversionRefunded threw:', e);
  }
}

/** Display helper — the one place paise becomes rupees on these surfaces. */
export function rs(paise: number | null): string {
  return paise == null ? '—' : '₹' + Math.round(paise / 100).toLocaleString('en-IN');
}

/** Human label for a plan id on a payslip line. */
export function planLabel(plan: string | null): string {
  if (!plan) return 'Purchase';
  if (plan === SESSION_PRICING.id) return SESSION_PRICING.label;
  return (PLANS as any)[plan]?.label ?? plan;
}
