# The CareerRai Identity Contract — frozen before Phase 2

**23 Aug 2026 · READ-ONLY. No schema, API, UI or data change. No DDL applied.
No production code written. B3b remains frozen.**

Phase 2 implementation is **HELD** per the founder's ruling. This document is
what the hold is for: the contract that must be frozen first, every clause
backed by a query against production.

---

# THE LAW

> **`profiles.id` is the only internal identity key.**
>
> Phone, email, Expedify ids, Razorpay ids, WhatsApp numbers are **attributes
> and external identifiers**. They are never ownership keys, never join keys
> between our own tables, and never the basis of an identity decision.
>
> **Internal → external:** we send `profiles.id` as the correlation id.
> **External → internal:** the vendor returns that correlation id.
> **Never:** `vendor → phone → guess student`. A missing or ambiguous
> correlation id produces **UNMATCHED**, never a guess.

---

# 1. TWO CORRECTIONS TO MY OWN PHASE 1

## 1.1 `student_crm` is not a shadow table — I was wrong

I recommended retiring it "because it has no reader". The exhaustive search the
ruling demanded found the reason it has no reader, and it is deliberate:

```
DB objects referencing student_crm:
  function public.sync_student_crm()
  trigger  trg_sync_student_crm  ON public.profiles
views: none · FKs into it: none · publications: none
Repo: 8 files — 2 code mentions (a label + a registry note),
      2 migrations, 4 docs including docs/PROFILES-SPLIT-PLAN.md
```

`supabase/migrations/20260726_student_crm.sql` states the intent plainly: this
is **slice 1 of the profiles split**, at the **expand + dual-write** stage of
expand → migrate → contract. Its own header says *"AFTER IT RUNS, NOTHING HAS
CHANGED FOR ANY READER … Reads flip in a later, separate deploy."*

**It has no reader because it is not supposed to have one yet.** The rationale
is also sound and worth preserving: it exists to stop an **outside vendor's
webhook payload landing on the same row that authenticates a student**, beside
their phone and auth state.

**So the choice is not "retire vs keep". It is: finish the split, or abandon
it.** I have no mandate for either and am not choosing. What I can say: leaving
it half-done is the worst of the three, because a dual-write mirror with no
reader is indistinguishable from an orphan to the next person who looks — which
is exactly the mistake I made yesterday.

**Founder decision needed: finish slice 1 (flip reads, soak, drop the three
`profiles` columns) or revert it (drop trigger → function → table).**

## 1.2 `cat_test_leads` — classified, per the ruling's four options

All 7 rows, checked against `profiles` on last-10-digits:

| | |
|---|---|
| Source | `cat_readiness_page` — **all 7** |
| Dates | 18, 23, 24 June 2026 |
| Look like test data | **0 of 7** |
| Already exist as a student | **2 of 7** |
| Never signed up | **5 of 7** |
| Phone format | 6 bare 10-digit, 1 with `91` prefix — **the same drift again** |

**Classification: (1) genuinely different leads.** They are pre-signup marketing
captures from a landing page, not imports, not tests, not duplicates of
`profiles` — except two that later became students by signing up independently,
with nothing linking the two records.

**Recommendation: do NOT bridge, and do NOT retire.** Per the ruling, three
competing universes is the failure to avoid. The honest resolution: a
pre-signup capture is a **different kind of object** from a student. It should
either become a first-class lead source that *creates* a `profiles` row on
capture, or be declared a marketing artefact outside the sales system entirely.
**Founder decision needed. 7 rows is small enough to decide by principle, not
by pressure.**

---

# 2. THE NEW EVIDENCE: EMAIL-KEYED OWNERSHIP IS ALREADY BROKEN, TODAY

This is not a future risk. Two staff accounts exist and **one of them has no
email — the admin. You.**

| role | has email | has name | has phone |
|---|---|---|---|
| admin | **NO** | yes | yes |
| sales | yes | yes | yes |

Three consequences, each traceable to a line of code already in production:

1. **You cannot be assigned a lead.** `/api/admin/reassign-lead` requires
   `target.email`:
   ```ts
   if (!target || (target.role!=='sales' && target.role!=='admin') || !target.email)
     return 400 'New owner must be a sales or admin account.'
   ```
   The founder fails this check. **The one account that must always be able to
   own a lead is the one the system refuses.**
2. **Your actions are logged as a string, not a person.** Same route:
   `const actor = me?.email ?? 'admin'`. Every reassignment you ever make is
   attributed to the literal text `'admin'`.
3. **Two actor namespaces in one column.** `/api/sales/log` uses
   `actor = email ?? full_name ?? 'sales'`. The rep writes an *email*; you would
   write a *full name*. `sales_activity.actor` therefore cannot be reliably
   joined back to a person **by construction**, not by accident.

**IDN-1 is upgraded from P1 to P0.** It is not "a rep might change her email
one day" — the system is already unable to name one of its two operators.

---

# 3. THE BACKFILL RECONCILIATION REPORT — REQUIRED BEFORE MUTATION

The ruling: *"do not backfill ownership by email without an exact one-to-one
proof … zero silent guesses."* Here is the report, run today:

```
lead_outreach rows                     0
├── exact owner match                  0
├── owner missing                      0
├── ambiguous owner                    0
├── orphaned owner (no profile)        0
└── invalid owner (malformed)          0

sales_activity rows                    0
├── actor resolves to exactly one      0
├── actor missing                      0
├── actor ambiguous                    0
└── actor unresolvable                 0
```

**Both tables are empty. There is nothing to backfill, and therefore nothing to
guess.**

This is the single luckiest fact in the whole workstream, and it changes the
migration from risky to trivial:

* `owner_id` / `actor_id` can be introduced as `uuid references profiles(id)`
  and be **the only key from birth** — no dual-write, no soak, no reconciliation
  window, no ambiguous rows to adjudicate.
* The email columns can be dropped in the **same** migration rather than after a
  contraction phase, because no row depends on them.
* Rollback is a plain `DROP COLUMN` — nothing is lost because nothing is there.

**The reconciliation machinery the ruling requires still gets built** — as the
integrity screen in §5 — because it must exist *before* rows arrive, not after.
A report that only runs when there is data to save is a report that runs too
late.

---

# 4. PHONE POLICY — NOT A BLANKET RULE

The ruling withheld approval for "phone uniqueness + one format" pending a
precise policy. Correct, and here is why, case by case, with today's numbers.

| Case | Today | Policy |
|---|---|---|
| **Missing phone** | **41 students** (39 non-test) | Legal. Phone is an attribute; a student without one is valid and **structurally uncallable**. Must be a named cohort, never silently absent from a queue. |
| **Duplicate phone** | **0 groups** (730/730 distinct, also 0 on last-10) | Not yet a problem. **A unique constraint would be safe *today* and is still the wrong instrument** — see below. |
| **Changed number** | no history exists anywhere | Needs a `phone_history` record before any uniqueness rule, or a legitimate change collides with the person's own past. |
| **Shared family number** | 0 observed | **The reason not to add `UNIQUE(phone)`.** Two siblings on one number is a real Indian household case; a unique constraint would reject the second student **at signup**. That is a product decision, not a data-hygiene one. |
| **Duplicate historical leads** | 0 orphans, 2 of 7 `cat_test_leads` overlap a profile | Deduplication belongs to the lead-capture boundary, not to a DB constraint. |
| **Test accounts** | 10 accounts, 7 with phones | Must be excluded from every sales surface by `is_test_account`, and must not consume a phone identity. |
| **International numbers** | **0 true non-Indian** — the 61 "non-+91" are bare 10-digit Indian numbers | `normalizeIndianPhone` is India-only. Fine today; it is a **stated limit**, not a proven capability. |
| **WhatsApp ≠ login number** | **no WhatsApp column exists.** `waNumber()` derives WhatsApp from `phone` by string surgery in **two** places (`call-queue.ts`, `sales-portfolio.ts`) | A rep who reaches a student on a different WhatsApp number has nowhere to record it. Needs its own attribute, not a derivation. |

**Revised proposal — I withdraw "uniqueness + one format":**

1. **Normalise the stored format** to `+91XXXXXXXXXX` — a data fix for the 65
   bare rows plus a write-time normaliser. This removes `phoneVariants` as a
   *correctness* dependency (it stays as a defensive reader).
2. **No `UNIQUE` constraint.** Instead a **non-blocking duplicate detector** in
   the integrity screen, so a shared family number is *visible and adjudicated*
   rather than *rejected at signup*.
3. **`phone` is never an identity key** — the law in §0 already forbids it. That
   is the actual protection; the constraint was only ever a proxy for it.

---

# 5. ADMIN → SYSTEM INTEGRITY → SALES IDENTITY

Required by the ruling. **This is the one screen I would build before any other
sales UI**, because it is the only surface that is *not* UI over missing data —
its subject matter *is* the missing data.

Every row: **Why → Evidence → Corrective action → Audit trail.** Every count
drills to the exact records (`docs/SCALE-CONTRACT.md`). Live numbers, run today:

| # | Check | Now | Why it matters | Corrective action |
|---|---|---|---|---|
| 1 | Students without phone | **41** (39 real) | uncallable — invisible to every phone-keyed surface | flag cohort; collect at next touch |
| 2 | Duplicate phone (exact) | **0** | shared/family number or a duplicate person | adjudicate: merge, or mark shared |
| 3 | Duplicate phone (last-10) | **0** | catches format drift hiding a duplicate | same |
| 4 | Malformed phone | **0** | unreachable + unmatched | normalise |
| 5 | Non-canonical format stored | **65** | forces `phoneVariants` everywhere | normalise to `+91…` |
| 6 | Leads without owner | **0** *(of 0)* | unworked lead | assign |
| 7 | Owner refs that don't resolve | **0** *(of 0)* | orphaned book | reassign |
| 8 | Activity actor unresolvable | **0** *(of 0)* | history that names nobody | repair from audit |
| 9 | **Staff without email** | **1 — the admin** | **blocks assignment, breaks attribution (§2)** | **moot once `owner_id` lands** |
| 10 | Expedify events UNMATCHED | **3** | vendor event with no student | repair queue + replay |
| 11 | **Expedify events matched to a non-student** | **236** | a call event on a staff row is prima facie wrong | quarantine as non-evidence |
| 12 | Orphaned `lead_outreach` | **0** | dangling sales state | delete or restore |
| 13 | Orphaned `sales_activity` | **0** | dangling history | investigate |
| 14 | Legacy `cat_test_leads` | **7** | second lead universe | §1.2 decision |
| 15 | Legacy `student_crm` | **684** | unfinished migration slice | §1.1 decision |
| 16 | External id mapped to >1 student | **n/a — no external id column exists yet** | the defect this contract prevents | — |

Check 11 is the one I want to highlight: **"a vendor call event attached to a
non-student"** would have caught the entire 236-row problem on day one, in one
line of SQL, without anyone reading a payload.

---

# 6. PHASE 2 ACCEPTANCE CRITERIA — STATUS BEFORE ANY CODE

The ruling's checklist, with what is already true and what is not:

### Identity
| Criterion | Status |
|---|---|
| Every internal person ref uses `profiles.id` | **NOT MET** — `owner`, `actor` are emails |
| No email ownership keys | **NOT MET** |
| No phone ownership keys | MET internally; **NOT MET** at the vendor boundary |
| No new `lead_id` | **MET** — none proposed |
| External identifiers explicitly namespaced | **NOT MET** — no namespace exists |
| Vendor callbacks carry a CareerRai correlation id | **NOT MET** — we never send one |
| Missing correlation id → UNMATCHED | **NOT MET** — currently phone-guessed |
| Ambiguous match → UNMATCHED | **NOT MET** — `.limit(1).maybeSingle()` silently takes the first row |
| Never auto-guess identity | **NOT MET** |

### Ownership
| Criterion | Status |
|---|---|
| One current owner | **MET** — `lead_outreach` PK on `student_id` |
| Ownership history auditable | MET in shape (`sales_activity` `reassigned` rows); **actor unnameable** |
| Reassignment preserves history | **MET** |
| Founder can reassign | **BROKEN** — §2, the founder has no email |
| Rep accesses only permitted records | **NOT MET** — `/sales/student/[id]` has no ownership check |
| Every action has `actor_id = profiles.id` | **NOT MET** |

### Expedify
Outbound correlation id · callback contract · structured disposition · call/event
id for idempotency · callback timestamp · agent identity · UNMATCHED queue ·
replay/repair · duplicate protection — **9 of 9 NOT MET.** `dedupe_key` exists
but was NULL on all 236 rows, so even idempotency is unproven in practice.

### Data integrity
Backfill report before mutation — **MET (§3, all zeros)** · no ambiguous
auto-backfill — **MET vacuously** · constraints only after reconciliation —
**MET by deferral** · rollback documented — **MET (§3)** · tests preventing
email/phone becoming ownership keys — **NOT MET, and this is the one that stops
the defect returning.**

### Security
Founder sees all — MET · rep sees only authorised — **NOT MET** · student cannot
manipulate owner — MET (deny-all RLS, no client path) · rep cannot manipulate
another rep's ownership — **PARTIAL**: `claim_lead` is atomic and refuses a
claimed lead, but reassignment is admin-only and the read path is unguarded ·
**external callback cannot assign itself to an arbitrary student — NOT MET**:
today the inbound webhook chooses the student by phone, so whoever controls the
payload chooses the row · service-role paths enforce their own authorization —
**MET in principle, and it is the only control that exists** (all sales tables
are RLS-on with zero policies).

**Score: 8 of 33 met. That is the honest reason Phase 2 was right to be held.**

---

# 7. WHAT I NEED, AND WHAT I WILL DO MEANWHILE

**Decisions only you can make:**

1. **`student_crm`** — finish slice 1, or revert it? (Not "retire": §1.1.)
2. **`cat_test_leads`** — first-class capture that creates a profile, or a
   marketing artefact outside sales? (7 rows; decide by principle.)
3. **Is the human team calling through Expedify, or by hand?** Still
   unanswered, and it still reorders everything downstream.
4. **Expedify contract change** — will you ask them for `external_ref` +
   structured `disposition` + `call_id`? Nothing vendor-side moves without it.
5. **DDL, when you are ready:** `owner_id` / `actor_id` as `profiles.id`. Given
   §3, this is now a **zero-row, zero-risk, single-migration** change with a
   `DROP COLUMN` rollback — materially smaller than what I proposed yesterday.

**Work I will do without waiting, none of it UI over missing data, none of it
requiring DDL:**

* **The identity guard test** — fails the build if any sales module keys a
  person by email or phone. This is criterion "tests prevent email/phone from
  becoming ownership keys again", and it is buildable now, against the current
  code, as a failing-then-passing gate.
* **The UNMATCHED policy alignment** — the two inbound Expedify routes
  currently disagree (one 404s and stores nothing, one silently succeeds). One
  policy: always audit, never guess, never silently succeed.
* **The `.limit(1).maybeSingle()` ambiguity defect** — a phone matching two
  profiles today takes the first arbitrarily. Under the law that must be
  UNMATCHED. Zero rows are affected today; the code is wrong regardless.

**Still not started and not requested:** Control Tower, payment funnel events,
the four frozen B3b paths, and any Phase 2 production code.
