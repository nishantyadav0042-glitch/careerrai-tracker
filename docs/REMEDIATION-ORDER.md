# Remediation order — a dependency graph, not a roadmap

**23 Aug 2026 · READ-ONLY. Nothing implemented.** This is ordered by
**security and data-integrity dependency**, not by founder-visible value. Each
step exists because the step after it is unsafe or meaningless without it.

---

# THE DEPENDENCY CHAIN

```
0  STOP THE BLEEDING          (no dependencies — do first)
      │
1  IDENTITY                   (must precede every ownership/attribution fix)
      │
2  AUTHORIZATION              (needs identity to express "owner")
      │
3  PROVENANCE                 (needs identity to name an actor)
      │
4  AUDITABILITY               (needs identity + provenance)
      │
5  DATA-QUALITY SURFACE       (renderable today; needs nothing above — but
      │                        belongs here so it displays the fixed model)
6  FOLLOW-UP AS AN OBJECT     (needs identity for owner, provenance for completion)
      │
7  DISTRIBUTION               (needs identity + authorization + audit)
      │
8  VENDOR BOUNDARY            (needs identity; BLOCKED on a vendor decision)
      │
9  INSTRUMENTATION            (paywall, checkout, message send)
      │
10 CONTROL TOWER L1–L5        (needs everything above to be non-fictional)
      │
11 B3b UNFREEZE               (needs the canonical model to place them)
```

---

# STEP 0 — STOP THE BLEEDING

**Nothing depends on this and everything is safer after it.**

| # | Action | Finding | Why first |
|---|---|---|---|
| 0.1 | Purge `pwa_session_handoff` rows past `expires_at`; null the payload on burn | **P1-A** | 502 stored access+refresh pairs, oldest 12 July, **0 live**, 1.6% ever used. Largest standing exposure, smallest change, zero product impact |
| 0.2 | Reject a null idempotency key on Expedify inbound | **replay** | The `UNIQUE` already exists and is inert; 220 duplicates on 12 Aug prove it |
| 0.3 | Move the Expedify secret out of the query string | P2-2 | header already supported |

**None of these needs identity, DDL beyond a delete, or a vendor conversation.**

---

# STEP 1 — IDENTITY  *(and the reason it is urgent)*

`owner_id` / `actor_id` → `profiles.id`; FK on `sales_activity.student_id`;
`external_identity(person, vendor, ref)` namespaced.

```
lead_outreach  0 rows      sales_activity  0 rows
exact match 0 · missing 0 · ambiguous 0 · orphaned 0 · invalid 0
```

**Zero rows to backfill means zero rows to guess.** One migration, `DROP
COLUMN` rollback, no dual-write, no soak.

> **This is free today and becomes a migration on the day the first call is
> logged.** It is the only item in this document whose cost increases with
> time, which is why it precedes everything except Step 0.

**Blocked on:** founder DDL authorisation.

---

# STEP 2 — AUTHORIZATION

| Fix | Finding |
|---|---|
| `/sales/student/[id]` resolves ownership server-side — call the `leadVisibleTo` helper that already exists | **P1-C** |
| `/api/sales/log` validates `studentId` is a uuid, is `role='student'`, is not a test account | **P1-B** |
| Add the missing FK so a forged uuid cannot persist | **P1-B** |

**Depends on Step 1** only for the *clean* form (ownership by `profiles.id`);
the checks themselves can ship against the current email key if the founder
wants them sooner. **I would not split them** — doing it twice is how the
`phoneVariants` sprawl happened.

**These are the four security stop conditions. No sales UI ships while they
stand.**

---

# STEP 3 — PROVENANCE

Every activity row carries `OBSERVED` or `CLAIMED`. Renderers must display it.

**Why it precedes the Team layer:** every sales metric today is CLAIMED
(`DATA-PROVENANCE-MATRIX.md`). A leaderboard built before this ranks
self-reports and is gameable by construction. The one ungameable rule already
exists — **WON = a paid ledger row** — and must generalise.

---

# STEP 4 — AUDITABILITY

`admin_audit_log` today: **9 rows, 3 action types, one writer.** Premium grant,
premium revoke, payment state change, lead assignment, reassignment, coupon
use and account deletion write **nothing**.

Audit at the mutation boundary, starting with `grantPremiumAndQueueBuddy`.
**Depends on Step 1** so the actor is a person, not the string `'admin'`.

---

# STEP 5 — THE DATA-QUALITY SURFACE (Control Tower L6)

**The only sales surface buildable today**, because its subject matter *is* the
missing data. All 16 checks return live numbers now. Check #11 — *vendor call
event matched to a non-student* — returns **236** and would have caught the
entire Expedify defect on day one in one line of SQL.

It is placed here, not at position 1, so that it renders the *corrected* model
rather than being rewritten after Steps 1–4.

---

# STEP 6 — FOLLOW-UP AS A FIRST-CLASS OBJECT

`created_at · due_at · owner · reason · channel · status · completed_at ·
completed_by · outcome · next_followup`.

Today `next_action_at` is a field that is **overwritten on completion**, so a
completion record cannot exist. **Depends on Step 1** (owner) and **Step 3**
(who completed it, observed or claimed).

---

# STEP 7 — LEAD DISTRIBUTION

Unassigned queue → filter → multi-select → strategy (manual · equal ·
round-robin · workload-balanced) → **preview** → confirm → audited assignment.

**Depends on 1, 2 and 4.** Note honestly: with every workload at 0, all four
strategies produce identical output on day one, and the UI must say so rather
than imply intelligence it cannot yet exercise.

---

# STEP 8 — VENDOR BOUNDARY  *(BLOCKED — not on engineering)*

Send `external_ref = profiles.id` outbound. Require it back with `call_id`,
structured `disposition`, `started_at`, `ended_at`, agent identity. Missing or
ambiguous ⇒ **UNMATCHED queue** with replay/repair. Never phone.

**Blocked on:** the founder asking Expedify for the contract change, and on the
still-unanswered question of whether the team calls through Expedify at all.

**Do not normalise the existing 236 events into `sales_activity` — they are one
test string and would import 236 rows of fiction.**

---

# STEP 9 — INSTRUMENTATION

`paywall_viewed`, `payment_checkout_opened`, message-send records. Uses the
existing `analytics_events` table — **no DDL**.

`payment_checkout_opened` sits here, not first. The founder's correction is
accepted: it is one cheap event that answers a narrow question, and it does not
repair the lead → rep → interaction → payment chain.

---

# STEP 10 — CONTROL TOWER L1–L5

Today / Team / Lead management / Student 360 / Activity.

**Every one of these is a read model over Steps 1–9.** Built earlier, they
render `NOT AVAILABLE — DATA NOT INSTRUMENTED` in almost every cell — which is
the honest output, and also the proof that building them first is wasted work.

---

# STEP 11 — B3b UNFREEZE

`expire-subscriptions`, `sales-ready`, `founder-alerts`, `expedify-followups`.
**They stay frozen until the canonical model proves where they sit** — the
founder's standing instruction, and the right one: fixing individual crons
while the underlying system produces contradictory states is how four competing
identities accumulated in the first place.

---

# WHAT THIS ORDER DELIBERATELY REFUSES

* **No UI over missing data.** Steps 5 and 10 are the only UI, and Step 5 is
  UI *about* missing data.
* **No rep leaderboard before Step 3.**
* **No distribution UI before Step 2.**
* **No vendor normalisation before Step 8.**
* **No new table because a screen wants one.** Only two tables are added
  (`follow_up`, `external_identity`), each mandated by a frozen rule.

---

# WHAT I KNOW / INFER / CANNOT PROVE

**KNOW** — every count and constraint cited: 87/87 tables RLS-on; 18/18 definer
functions pinned; 502 handoff rows with payload since 12 July; 239 Expedify
events with one distinct summary string; `dedupe_key` UNIQUE and NULL on all of
them; `sales_activity` has no FK on `student_id`; `admin_audit_log` = 9 rows /
3 actions / 1 writer; 0 of 5 paid customers with sales attribution; the admin
profile has no email; `claim_lead` is atomic.

**INFER** — that the 220 same-day duplicates were a looping vendor node (the
pattern fits; their canvas is not visible to me). That the CRM has never been
used, from two empty tables and one rep account — **an inference about people,
not a system fact.**

**CANNOT PROVE** — whether any calls were made by any means (**an empty table is
not evidence of inaction**); whether the stored refresh tokens are still
redeemable; whether Expedify can return an `external_ref`; whether anything
outside this repository reads `student_crm`; whether the rep ever opened
`/sales` (no admin-route telemetry exists); whether campaign tags ever existed.

---

**AUDIT PACKAGE COMPLETE — 8 artifacts. Nothing implemented. Awaiting explicit
implementation authorisation.**
