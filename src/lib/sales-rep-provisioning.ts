import type { RepCapacity } from '@/lib/sales-capacity';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Employment type stops being a label ─────────────────────────────────────
//
// 20260824c_sales_rep_config.sql said this about employment_type:
//
//   "LABEL ONLY. No branch in any engine reads this: full-time and part-time
//    differ purely by their numbers"
//
// That sentence was true and it was the bug. Nothing anywhere read the column,
// AND nothing anywhere required the numbers to differ — so a part-time rep
// created today inherits the table defaults (Mon–Sat, 10:00–19:00, 50 units,
// 15 new/day), which are a FULL-TIME week. "They differ by their numbers" only
// holds if something refuses to let the numbers go unstated.
//
// This module is that refusal, plus the second half nobody had written: the
// place where a stated ceiling actually binds. Before it, /api/admin/
// distribute-leads verified `role in (sales, admin)` and then handed out up to
// 500 leads without reading sales_rep_config at all — not `active`, not
// `unavailable_until`, not `max_capacity_units`. A rep configured for 12 units
// could be given 250.
//
// WHAT THIS IS NOT: an allocator. It never chooses who gets a lead. It answers
// "how many may this rep be given right now", and the founder still decides the
// split of LIVE WORK. Book intake — new students entering a seat's book every
// day — is automated since 2 Sep 2026 (Phase 2B-3, lib/lead-intake.ts) and
// reads its ceilings from here.

/**
 * The fields that must be STATED, never inherited, when an account becomes
 * part-time.
 *
 * Not a part-time default — there is no such thing here, and inventing one
 * would be inventing a quota. These are the questions "what does part-time
 * mean for THIS person" decomposes into, and the founder answers them.
 */
export const PART_TIME_REQUIRED_FIELDS = [
  'work_days',
  'work_start_ist',
  'work_end_ist',
  'max_capacity_units',
  'max_new_per_day',
  // Added 28 Aug 2026, the day the first two part-time counsellors were hired.
  //
  // Same reasoning as the five above, applied to the half that was missing.
  // "What does part-time mean for this person" has always included what they
  // are paid, and until sales_conversions existed there was nowhere to say it,
  // so the question simply was not asked. A part-time seat created without pay
  // terms produces a counsellor who converts students all month and whose
  // payslip cannot be computed — which is exactly the silently-full-time
  // failure this list was written to prevent, one column over.
  //
  // Zero is a legal answer to either: a counsellor on fixed pay only states
  // incentive_percent: 0, and readTerms() treats that as STATED. What is
  // refused is silence.
  'monthly_fixed_paise',
  'incentive_percent',
] as const;
export type PartTimeRequiredField = (typeof PART_TIME_REQUIRED_FIELDS)[number];

export type ConfigStatementCheck =
  | { ok: true }
  | { ok: false; missing: PartTimeRequiredField[] };

/**
 * May this config write land?
 *
 * The rule is about the TRANSITION, not the value. Once a row is already
 * part-time its numbers were stated at the moment it became part-time, so
 * later edits may be partial like any other rep's. What is refused is the one
 * move that produces a silently full-time part-timer: arriving at part_time
 * without saying what part-time means.
 */
export function checkEmploymentStatement(
  patch: Record<string, unknown>,
  existing: { employment_type?: string | null } | null,
): ConfigStatementCheck {
  const target = (patch.employment_type as string | undefined) ?? existing?.employment_type ?? 'full_time';
  if (target !== 'part_time') return { ok: true };
  // Already part-time and staying part-time → the statement was made before.
  if (existing?.employment_type === 'part_time') return { ok: true };

  const missing = PART_TIME_REQUIRED_FIELDS.filter((f) => patch[f] === undefined || patch[f] === null);
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

// ── The seat cap ────────────────────────────────────────────────────────────
//
// Founder decision, 29 Aug 2026: the sales team is EXACTLY two part-time
// counsellors — Neelam and Anshul. This constant is the application half of
// that rule; the database half is the trigger in
// supabase/migrations/20260829b_two_seat_sales_team.sql, which raises on any
// write that would leave more than this many active rows in sales_rep_config,
// whatever client performs it. The two are deliberately redundant: the route
// check exists to give the founder a sentence instead of a Postgres error, and
// the trigger exists because a route check binds only the routes that call it.
//
// WHY A CAP AND NOT A NAME LIST. The invariant's identities (Neelam, Anshul)
// live in the data — in who actually holds the two seats — not in code.
// Hard-coding names here would make a future legitimate replacement (one
// counsellor leaves, another is hired) a CODE CHANGE, and misspell-sensitive at
// that. The cap makes a third concurrent seat impossible through every path;
// which two people hold the seats is exactly what /admin/sales/capacity is
// for. Growing the team past two is a founder decision and arrives as a
// migration that changes both halves of this rule in one commit.
export const MAX_ACTIVE_SALES_SEATS = 2;

export type SeatCapCheck =
  | { ok: true; activeNow: number }
  | { ok: false; activeNow: number; error: string };

/**
 * May this write leave `repId` holding an ACTIVE seat?
 *
 * Counts the OTHER active seats so the check is idempotent for a rep who is
 * already active (re-saving their own config is not a new seat). Fails closed
 * on a read error: a cap we cannot verify is not a cap.
 */
export async function checkSeatCap(admin: any, repId: string): Promise<SeatCapCheck> {
  const { data, error } = await admin
    .from('sales_rep_config').select('rep_id').eq('active', true).neq('rep_id', repId);
  if (error) {
    return { ok: false, activeNow: -1, error: 'Could not read the current team, so the seat cap cannot be verified. Nothing was changed — try again.' };
  }
  const others = (data ?? []).length;
  if (others >= MAX_ACTIVE_SALES_SEATS) {
    return {
      ok: false, activeNow: others,
      error: `The sales team is capped at ${MAX_ACTIVE_SALES_SEATS} active seats and both are taken. Deactivate a seat on this screen first if you are replacing someone.`,
    };
  }
  return { ok: true, activeNow: others };
}

// ── Allocation headroom ─────────────────────────────────────────────────────

export type AllocationRefusal =
  | 'READ_FAILED'
  | 'NOT_CONFIGURED'
  | 'INACTIVE'
  | 'UNAVAILABLE'
  | 'OVERFLOW'
  | 'CAPACITY_BINDING';

export type AllocationLimit =
  | { ok: true; max: number; boundBy: 'capacity' | 'daily_fuse' }
  | { ok: false; max: 0; reason: AllocationRefusal };

export const REFUSAL_COPY: Record<AllocationRefusal, string> = {
  READ_FAILED: 'their leads could not be read — this is not "they have room"',
  NOT_CONFIGURED: 'no capacity row exists, so no capacity can be stated',
  INACTIVE: 'the account is switched off',
  UNAVAILABLE: 'on leave',
  OVERFLOW: 'already over their ceiling',
  CAPACITY_BINDING: 'at their ceiling',
};

/**
 * How many leads this rep may be handed in ONE distribution.
 *
 * Deliberately NOT gated on the working-hours window. A part-time rep who
 * works 18:00–21:00 still owns their book at 11:00 — hours govern when they
 * are expected to make contact and how the SLA clock runs, not who a student
 * belongs to. Refusing to give a part-timer a lead in the morning would make
 * part-time mean "worse rep" instead of "different hours".
 *
 * The daily fuse binds on what the rep already received today: since 2 Sep
 * 2026 every door into a book stamps lead_outreach.enrolled_at, and
 * getTeamCapacity counts it into `available` before this function sees it.
 */
export function repAllocationLimit(cap: RepCapacity, nowMs: number = Date.now()): AllocationLimit {
  if (cap.readFailed) return { ok: false, max: 0, reason: 'READ_FAILED' };
  if (!cap.configured || !cap.config) return { ok: false, max: 0, reason: 'NOT_CONFIGURED' };
  const cfg = cap.config;
  if (!cfg.active) return { ok: false, max: 0, reason: 'INACTIVE' };
  if (cfg.unavailableUntil && Date.parse(cfg.unavailableUntil) > nowMs) {
    return { ok: false, max: 0, reason: 'UNAVAILABLE' };
  }
  if (cap.overflow > 0) return { ok: false, max: 0, reason: 'OVERFLOW' };
  if (cap.available <= 0) return { ok: false, max: 0, reason: 'CAPACITY_BINDING' };

  const max = Math.min(cap.available, cfg.maxNewPerDay);
  return { ok: true, max, boundBy: max === cfg.maxNewPerDay && cfg.maxNewPerDay < cap.available ? 'daily_fuse' : 'capacity' };
}

// ── OWNING A STUDENT IS NOT WORKING A STUDENT ───────────────────────────────
//
// repAllocationLimit above answers "how many leads may this rep be handed right
// now", and it answers it in CAPACITY UNITS — active work items. That is the
// correct gate for handing someone live work, and it was silently the wrong
// gate for something else that happened to use the same route: building a
// rep's BOOK.
//
// The conflation, verified 29 Aug 2026:
//
//   · 'never_contacted' is an ActiveReason (lib/sales-capacity.ts), so every
//     freshly assigned student consumes a unit until somebody calls them.
//   · max_capacity_units is CHECKed between 1 and 200.
//   · /api/admin/distribute-leads gates assignment on repAllocationLimit.
//
// Therefore a rep could never be given more than ~200 students, ever — and the
// founder's operating model is ~1,000 students per seat. The ceiling that was
// written to stop a part-timer being buried in live work was also, invisibly,
// a ceiling on how many people they could be responsible for.
//
// The column comment on max_capacity_units already said the right thing —
// "Ceiling on ACTIVE work items ... A rep who successfully retains 200 students
// holds 200 relationships and may still have 50 free units" — but nothing
// enforced the distinction at the one place it mattered.
//
// Founder, 29 Aug 2026: "The salesman shouldn't manage 1,000 students. The
// salesman manages today's opportunities. The system manages the 1,000-student
// portfolio. That's a massive distinction."
//
// So the two questions get two functions:
//
//   repAllocationLimit   → may this rep take more LIVE WORK now?  (unchanged)
//   portfolioIntakeLimit → may this seat be responsible for more PEOPLE?
//
// Work capacity keeps gating the daily queue, which is where a part-timer's
// five hours actually bind. It no longer gates who exists in their book.

/**
 * Sanity ceiling on one seat's book. NOT a target and not a capacity model —
 * a fuse against a typo that hands one rep the entire student base.
 *
 * Set well above the founder's stated ~1,000 per seat so it never shapes an
 * operating decision, and finite because an unbounded fuse is not a fuse (the
 * same reasoning as max_new_per_day, 24 Aug). Raising it is a founder decision
 * and a one-line change here.
 */
export const MAX_PORTFOLIO_PER_SEAT = 2500;

/** Bounds one enrolment request, so a single call cannot be unboundedly large. */
export const MAX_INTAKE_PER_CALL = 500;

export type IntakeRefusal = 'NOT_CONFIGURED' | 'INACTIVE' | 'PORTFOLIO_FULL' | 'CALL_TOO_LARGE';

export type IntakeLimit =
  | { ok: true; max: number }
  | { ok: false; max: 0; reason: IntakeRefusal; error: string };

/**
 * How many more students this seat may become responsible for.
 *
 * Deliberately NOT gated on capacity units, working hours or the daily fuse —
 * see the note above. It IS gated on the seat being configured and active,
 * because a book handed to a seat nobody holds is the unowned-book exception
 * with extra steps.
 *
 * `currentBook` is passed in rather than counted here so the function stays
 * pure and the caller's count and the writer's count come from one read.
 */
export function portfolioIntakeLimit(
  cfg: { active: boolean } | null,
  currentBook: number,
  requested: number,
): IntakeLimit {
  if (!cfg) {
    return { ok: false, max: 0, reason: 'NOT_CONFIGURED', error: 'no capacity row exists, so this is not a configured seat' };
  }
  if (!cfg.active) {
    return { ok: false, max: 0, reason: 'INACTIVE', error: 'the seat is switched off — activate it before giving it students' };
  }
  if (requested > MAX_INTAKE_PER_CALL) {
    return { ok: false, max: 0, reason: 'CALL_TOO_LARGE', error: `at most ${MAX_INTAKE_PER_CALL} students may be enrolled in one request` };
  }
  const headroom = MAX_PORTFOLIO_PER_SEAT - currentBook;
  if (headroom <= 0) {
    return { ok: false, max: 0, reason: 'PORTFOLIO_FULL', error: `this seat already holds ${currentBook} students, at the ${MAX_PORTFOLIO_PER_SEAT} ceiling` };
  }
  return { ok: true, max: Math.min(headroom, MAX_INTAKE_PER_CALL) };
}

/** Display label. Never a sort key — see the note in sales-control-tower.ts. */
export const EMPLOYMENT_LABEL: Record<'full_time' | 'part_time', string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
};

// ── Provisioning a real staff account ───────────────────────────────────────

export type NewRepCheck =
  | { ok: true; email: string; fullName: string; phone: string | null }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validate the human-supplied half of "create a sales rep".
 *
 * The password is checked for length and then handed straight to Supabase Auth
 * and forgotten. It is never written to profiles, never logged, never audited —
 * the audit record names the account, not the credential.
 */
export function checkNewRep(body: any): NewRepCheck {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'A valid work email is required.' };
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  if (fullName.length < 2 || fullName.length > 80) return { ok: false, error: 'A full name of 2–80 characters is required.' };
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < 10) return { ok: false, error: 'The password must be at least 10 characters. It is passed to Supabase Auth and never stored by CareerRai.' };
  const phoneRaw = typeof body?.phone === 'string' ? body.phone.trim() : '';
  return { ok: true, email, fullName, phone: phoneRaw === '' ? null : phoneRaw };
}
