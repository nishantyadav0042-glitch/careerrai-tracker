# Sales OS implementation — dependency map (Phase 0 output)

**23 Aug 2026 · Phase 0 is READ + RE-VERIFY ONLY. No code changed in this phase.**
Working tree clean at `b1e6ba0`; branch `claude/status-update-t1g5as`; diff vs
`origin/main` is 24 docs + the 9 migrated crons + their tests. No sales code has
been modified by me at any point.

---

# 0.1 — CORRECTIONS FOUND BY RE-VERIFYING MY OWN AUDIT

The brief said not to assume earlier conclusions are correct. Three were wrong.

### C-1 · "`leadVisibleTo` exists and is unused" — WRONG, and the error mattered

**It is used**, at `src/lib/call-queue.ts:124`:

```ts
if (!leadVisibleTo((o?.owner as string | null) ?? null, repEmail)) continue;
```

It is also guard-tested (`sales-claim.guard.test.ts`), including a test that
asserts the queue **calls** it (`expect(s).toMatch(/leadVisibleTo\(/)`).

**The true, narrower finding:** the queue path is protected; the **detail path
`/sales/student/[id]` is not**. Saying "unused" implied the helper was
abandoned; it is load-bearing in one path and absent in another. Security Stop 2
stands, with corrected scope.

### C-2 · NEW P1, found only because I re-read the caller — a rep with no email sees everything

```ts
// src/app/sales/page.tsx
const repEmail = me?.role === 'sales' ? ((me?.email as string | null) ?? null) : undefined;

// src/lib/sales-disposition.ts
export function leadVisibleTo(owner, repEmail?) {
  if (!owner || !repEmail) return true;   // ← null repEmail = admin oversight frame
  return owner === repEmail;
}
```

A **sales** rep whose `profiles.email` is NULL yields `repEmail = null`, and
`leadVisibleTo(anyOwner, null)` returns **true for every lead**. She silently
receives the founder's oversight frame — **every rep's claimed book**.

*Latent today* (the one sales account has an email) — **and the admin account
already has no email**, which proves the null case is not hypothetical for this
schema. This is a third independent consequence of email-keyed identity, and it
was invisible until the caller was read rather than the helper.

**Severity P1. STATICALLY ASSESSED — NOT EXPLOITED.**

### C-3 · "Audit uses email as actor" — WRONG

`src/lib/audit.ts::logAdminAction(adminId, action, targetType, targetId, metadata)`
writes `admin_id` — **a uuid**. The audit table's identity is already correct.

**The real gap is coverage, not identity:** 9 rows, 3 action types, one writer.
Phase 14 therefore adds *call sites*, not a new identity scheme.

### Re-confirmed unchanged (production, this hour)
`lead_outreach` 0 · `sales_activity` 0 · `admin_audit_log` 9 ·
`expedify_events` 239, **NULL `dedupe_key` on 239** · `pwa_session_handoff`
payloads 502 · sales-role profiles 1 · paid payments 5.

### Root cause of the NULL dedupe, confirmed from source
```ts
const dedupeKey = leadId ? [leadId, attempt ?? 'x', event].join(':') : null;
```
No vendor lead id ⇒ `null` ⇒ the `UNIQUE` index never fires (Postgres permits
unlimited NULLs). The route even treats `23505` as success — correct *when* a
key exists. **The bug is that a missing key is accepted at all.**

---

# 0.2 — THE DEPENDENCY MAP

Edges are hard prerequisites: the target is unsafe or meaningless without the
source.

```
                     ┌─────────────────────────┐
                     │ P1  SECURITY STOPS      │  no prerequisites
                     │  S1 rep→arbitrary claim │  code + 1 FK
                     │  S2 rep→arbitrary read  │  code only
                     │  S2b null-email frame   │  code only  (C-2)
                     │  S3 vendor picks student│  code + UNMATCHED store
                     │  S4 null dedupe bypass  │  code + backfillable constraint
                     │  S5 audit coverage      │  call sites only
                     └───────────┬─────────────┘
                                 │ S1/S2 clean form needs a person key
                                 ▼
                     ┌─────────────────────────┐
                     │ P2  CANONICAL IDENTITY  │  owner_id / actor_id / FK
                     │     0 rows ⇒ 0 backfill │  external_identity
                     └───────────┬─────────────┘
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
          ┌──────────────┐ ┌───────────┐ ┌──────────────┐
          │ P3 ACTIVITY  │ │ P4 PROV.  │ │ P14 AUDIT    │
          │ append-only  │ │ 6 classes │ │ coverage     │
          └──────┬───────┘ └─────┬─────┘ └──────┬───────┘
                 └────────┬──────┘              │
                          ▼                     │
                 ┌──────────────────┐           │
                 │ P5 FOLLOW-UP obj │           │
                 └────────┬─────────┘           │
                          ▼                     ▼
                 ┌──────────────────────────────────┐
                 │ P6 ASSIGNMENT / DISTRIBUTION     │
                 └────────────────┬─────────────────┘
                                  ▼
   ┌──────────────┐   ┌───────────────────┐   ┌─────────────────┐
   │ P9 DATA      │   │ P10 STUDENT 360   │   │ P7 REP WORKSPACE│
   │ QUALITY *    │   └─────────┬─────────┘   └────────┬────────┘
   └──────┬───────┘             │                      │
          └─────────────────────┴──────────┬───────────┘
                                           ▼
                              ┌────────────────────────┐
                              │ P8 FOUNDER CONTROL     │
                              │    TOWER  (destination)│
                              └────────────────────────┘

  P11 PAYMENT ATTRIBUTION ── needs P3+P4 (to say what preceded a payment)
  P12 FUNNEL INSTRUMENTATION ── independent of sales; needs nothing above
  P13 EXPEDIFY CORRELATION ── needs P2; BLOCKED on a vendor decision
  P21 B3b UNFREEZE ── needs P2..P6 to prove placement

  * P9 is renderable TODAY with zero prerequisites. It is placed after P6 so it
    displays the corrected model rather than being rewritten twice.
```

## Critical path
`P1 → P2 → {P3,P4} → P5 → P6 → P8`. Everything else hangs off it.

## The one time-sensitive edge
`P2` costs one migration with **zero backfill** only while both tables are
empty. **The first logged call converts it into a data migration.** It is the
only item whose cost rises with time.

## Blocked, and on what
| Item | Blocked on |
|---|---|
| P13 Expedify correlation | founder asking the vendor for `external_ref` + `call_id` + structured `disposition`; and the still-unanswered "does the team call through Expedify at all?" |
| P2 DDL | founder DDL authorisation (now given in principle by this brief; I will still produce the migration, test it on `careerrai-test`, and report before touching production) |
| `student_crm` | finish-or-revert decision. **Phase 20 forbids deleting it**, and I will not |
| `cat_test_leads` | merge-or-retire decision |
| P18 conversion rates | 5 paid customers total — **a per-rep conversion rate is not statistically defensible** and will be labelled, not computed |

## Explicitly not touched
Four B3b paths · `reconcile-payments` · payment safety logic · authentication ·
unrelated product logic. No opportunistic refactors.

---

# 0.3 — PHASE 1 EXECUTION PLAN (next, not done)

| Stop | Change | DDL? | Test |
|---|---|---|---|
| S1 | `/api/sales/log`: uuid format check, target must exist and be `role='student'`, reject test accounts | FK on `sales_activity.student_id` — **via `careerrai-test` first** | forged/non-existent/non-student id rejected |
| S2 | `/sales/student/[id]`: resolve ownership server-side before rendering | no | cross-rep IDOR |
| S2b | rep identity resolved from `profiles.id`, never a nullable email; a rep whose identity cannot be resolved gets **no oversight frame** | no | null-email rep sees only unclaimed + own |
| S3 | Expedify: correlation-first, ambiguous ⇒ UNMATCHED, never `.limit(1)` on identity | new UNMATCHED store (P2 dependency) | ambiguity, missing-ref |
| S4 | reject a null dedupe key where idempotency is required; **preserve the 239 historical rows** | constraint after evidence | replay with null key |
| S5 | `logAdminAction` call sites at every privileged sales mutation | no | audit-on-reassign, audit-on-bulk |

**S2 and S2b are pure code with no schema dependency and no vendor dependency.
They are the first thing I will implement.**

---

**PHASE 0 STATUS: PASS.** Nothing implemented. Three corrections recorded, one
of them a new P1 that only re-verification could have found.
