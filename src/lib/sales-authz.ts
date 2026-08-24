import { createAdminClient } from '@/lib/supabase/admin';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── THE sales authorization authority ───────────────────────────────────────
//
// One place decides "may this actor see this lead". Before this file the
// decision was spread across five expressions in five files, and they did not
// agree with each other:
//
//   sales/page.tsx          repEmail = role==='sales' ? (email ?? null) : undefined
//   sales/leads             (email as string) ?? '__none__'
//   sales/summary           (email as string) ?? '__none__'
//   api/sales/log           email ?? full_name ?? 'sales'
//   api/admin/reassign-lead email ?? 'admin'
//
// Four different null behaviours for the same missing field. Two failed CLOSED
// ('__none__' matches nothing → empty book). One fell back to a person's NAME.
// One fell back to null — and `leadVisibleTo(owner, null)` returned true for
// every lead, so a sales rep with no email silently received the founder's
// oversight frame. The same absent column produced either an empty screen or
// total visibility depending on which page you opened.
//
// THE LAW (founder, 23 Aug): profiles.id is the only internal identity key.
// Email, phone, name and vendor ids are attributes. They may be displayed.
// They may never decide authorization.
//
//   NULL email      → authorization unchanged
//   changed email   → authorization unchanged
//   changed name    → authorization unchanged
//   unknown actor   → DENY. Never ALLOW.
//
// ── Why there is a "token" and not just a uuid ──────────────────────────────
//
// lead_outreach.owner and sales_activity.actor are TEXT columns that have
// historically held an EMAIL. The uuid columns are a separate, authorised
// migration that has not been applied. Both tables currently hold ZERO rows,
// which is the only reason this file can be honest without DDL: from now on we
// WRITE profiles.id into those TEXT columns, and we RESOLVE whatever is already
// there through the canonical profiles table before comparing.
//
// So a legacy email token still resolves to the right person, a uuid token
// resolves to itself, and anything that resolves to NOBODY is denied rather
// than treated as unclaimed. That last rule is the whole point: an owner string
// we cannot attribute is not a free lead, it is an unanswered question.

/** The authenticated security principal. Never an email, never a name. */
export interface SalesPrincipal {
  /** profiles.id — the ONLY identity key. */
  id: string;
  role: 'sales' | 'admin';
}

/**
 * Resolution of a stored owner/actor token to a canonical person.
 *
 * `unavailable` exists because a failed READ must never become a business
 * answer — the invariant this codebase has paid for repeatedly. An owner we
 * could not look up is not an unowned lead.
 */
export type OwnerResolution =
  | { kind: 'unclaimed' }
  | { kind: 'owned'; ownerId: string }
  | { kind: 'unresolvable'; token: string }
  | { kind: 'unavailable'; reason: string };

/**
 * Every staff account, indexed by both identity encodings.
 *
 * Two staff exist today, so this is one small query, not an N+1. It is the
 * bridge that lets a uuid-based decision run against a text column without
 * inventing a second identity system.
 */
export interface StaffDirectory {
  /** token (uuid string OR legacy email, lowercased) → profiles.id */
  byToken: Map<string, string>;
  /** profiles.id → display label, for rendering only. */
  labelById: Map<string, string>;
}

const STAFF_ROLES = ['sales', 'admin'] as const;

export async function loadStaffDirectory(admin?: any): Promise<StaffDirectory | null> {
  const db = admin ?? createAdminClient();
  // Retry once: a transient blip must not silently downgrade authorization.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await db
      .from('profiles')
      .select('id, email, full_name, role')
      .in('role', STAFF_ROLES as unknown as string[]);
    if (error) {
      if (attempt === 1) {
        console.error('[sales-authz] staff directory read failed twice:', error.message);
        return null; // caller MUST deny — see resolveLeadOwner
      }
      continue;
    }
    const byToken = new Map<string, string>();
    const labelById = new Map<string, string>();
    for (const p of (data ?? []) as any[]) {
      const id = p.id as string;
      byToken.set(id, id);
      const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
      if (email) byToken.set(email, id);
      labelById.set(id, (p.full_name as string | null) ?? (p.email as string | null) ?? id);
    }
    return { byToken, labelById };
  }
  return null;
}

/** The storage encoding we WRITE from now on: the principal's uuid. */
export function ownerToken(principal: SalesPrincipal): string {
  return principal.id;
}

/** A well-formed uuid. Cheap, and the first gate on any request-supplied id. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/**
 * SECURITY STOP 1 — may this id be the SUBJECT of a sales activity?
 *
 * /api/sales/log used to validate `studentId` with `typeof === 'string'` and
 * nothing else, so a rep could claim any person in the system — including the
 * admin — as her lead, and `sales_activity` had no foreign key, so even a
 * non-existent uuid persisted as history.
 *
 * A sales subject must be a real, non-test, non-demo STUDENT. Staff and
 * mentors are people we employ, not leads.
 */
export type SalesTargetCheck =
  | { ok: true }
  | { ok: false; reason: 'malformed' | 'not_found' | 'not_a_student' | 'test_account' | 'unavailable' };

export async function checkSalesTarget(admin: any, studentId: unknown): Promise<SalesTargetCheck> {
  if (!isUuid(studentId)) return { ok: false, reason: 'malformed' };
  const { data, error } = await admin
    .from('profiles')
    .select('id, role, is_test_account, is_demo')
    .eq('id', studentId)
    .maybeSingle();
  // A read we could not complete is not "this student is fine".
  if (error) {
    console.error('[sales-authz] target check read failed:', error.message);
    return { ok: false, reason: 'unavailable' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  if (data.role !== 'student') return { ok: false, reason: 'not_a_student' };
  if (data.is_test_account === true || data.is_demo === true) return { ok: false, reason: 'test_account' };
  return { ok: true };
}

/** Resolve a stored owner/actor token to a canonical profiles.id. */
export function resolveOwnerToken(
  token: string | null | undefined,
  dir: StaffDirectory | null,
): OwnerResolution {
  if (token == null || String(token).trim() === '') return { kind: 'unclaimed' };
  if (!dir) return { kind: 'unavailable', reason: 'staff_directory_unavailable' };
  const raw = String(token).trim();
  const hit = dir.byToken.get(raw) ?? dir.byToken.get(raw.toLowerCase());
  return hit ? { kind: 'owned', ownerId: hit } : { kind: 'unresolvable', token: raw };
}

/**
 * THE decision. Pure, so it is testable without a database.
 *
 * The shared-book rule is NOT my invention and is not assumed — it is the
 * existing product contract (SA-1D), stated in lib/sales-disposition.ts, in
 * lib/call-queue.ts, in app/sales/page.tsx, in api/sales/log, pinned by
 * sales-claim.guard.test.ts, and structurally required by the claim_lead RPC:
 * a rep must be able to act on an unclaimed lead in order to claim it on her
 * first disposition. Removing it here would break claiming, not harden it.
 *
 * What changes is only the KEY the rule is evaluated on, and the failure
 * direction: previously an unknown viewer saw everything; now they see nothing.
 */
export function canAccessLead(
  resolution: OwnerResolution,
  principal: SalesPrincipal | null,
): boolean {
  // No identity → no access. This is the bug this file exists to kill: absence
  // must never be promoted to oversight.
  if (!principal) return false;
  // Admin oversight is granted by ROLE, explicitly — never by a null falling
  // through a truthiness check.
  if (principal.role === 'admin') return true;

  switch (resolution.kind) {
    case 'unclaimed':
      return true; // SA-1D shared book — see the note above.
    case 'owned':
      return resolution.ownerId === principal.id;
    case 'unresolvable':
    case 'unavailable':
      return false; // fail closed
  }
}

/**
 * The principal for the authenticated user, or null.
 *
 * Deliberately does NOT read email. Nothing here may depend on it.
 */
export async function salesPrincipal(admin: any, userId: string): Promise<SalesPrincipal | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin.from('profiles').select('id, role').eq('id', userId).single();
    if (error) {
      if (attempt === 1) {
        console.error('[sales-authz] principal read failed twice:', error.message);
        return null;
      }
      continue;
    }
    const role = data?.role as string | null;
    if (role !== 'sales' && role !== 'admin') return null;
    return { id: data.id as string, role };
  }
  return null;
}

/** Read one lead's ownership and resolve it. Fails closed on a read error. */
export async function resolveLeadOwner(
  admin: any,
  studentId: string,
  dir: StaffDirectory | null,
): Promise<OwnerResolution> {
  const { data, error } = await admin
    .from('lead_outreach')
    .select('owner_id, owner')
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) {
    console.error('[sales-authz] lead owner read failed:', error.message);
    return { kind: 'unavailable', reason: 'lead_read_failed' };
  }
  // owner_id is the authority. `owner` (TEXT) is the legacy encoding, still
  // read so a row written before the migration resolves correctly; it is never
  // preferred over the uuid.
  const ownerId = (data?.owner_id as string | null) ?? null;
  if (ownerId) return { kind: 'owned', ownerId };
  return resolveOwnerToken((data?.owner as string | null) ?? null, dir);
}
