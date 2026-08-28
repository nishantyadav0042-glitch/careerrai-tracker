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
// split — Phase 2B-2 allocation automation remains unbuilt, deliberately.

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
 * The daily fuse is applied PER DISTRIBUTION, not per day, and says so: there
 * is no assigned_at column yet (2B-2), so how many leads a rep already
 * received today is genuinely unmeasurable. Capping each hand-out at the fuse
 * is the strongest honest reading of it — and it is a cap, never a claim.
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
