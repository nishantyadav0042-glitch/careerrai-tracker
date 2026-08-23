# CareerRai Founder Sales Operating System — architecture gate

**23 Aug 2026 · READ-ONLY.** No DDL, no migration, no API, no UI, no
instrumentation, no deletion, no cron change, no vendor change, no deploy.
Nothing implemented.

Companion documents (not duplicated here):
`SALES-OPERATING-SYSTEM-AUDIT.md` (28-section audit) ·
`SALES-IDENTITY-CONTRACT.md` (identity law + 16 integrity checks) ·
`SALES-PHASE-1-IDENTITY.md` (Expedify evidence) ·
`SALES-OPERATING-SYSTEM-FOUNDER-CONTROL-TOWER.md` (first system map).

---

# §12 — THE FOURTEEN HYPOTHESES, VERIFIED

Each was re-checked against code **and** production. Three changed.

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| 1 | Founder/admin identity lacks email | **CONFIRMED** | 2 staff rows; `role='admin'` has `email IS NULL` |
| 2 | owner/actor are text-based | **CONFIRMED** | `lead_outreach.owner text`, `sales_activity.actor text` |
| 3 | `/sales/student/[id]` allows cross-rep access | **CONFIRMED — and worse than stated** | see RT-1 |
| 4 | Expedify identity is phone-based | **CONFIRMED** | both inbound routes `.in('phone', phoneVariants(…)).limit(1)` |
| 5 | Expedify lacks a CareerRai correlation id | **CONFIRMED — and the omission is ours** | `lib/expedify.ts` body has no `studentId` |
| 6 | Follow-up is `next_action_at` | **CONFIRMED** | no `follow_up` table exists; field is overwritten on completion |
| 7 | WhatsApp/SMS/email not independently observed | **CONFIRMED** | `waNumber()` builds a `wa.me` link; no send record anywhere |
| 8 | `/admin/sales-performance` uses `reps[0]` | **CONFIRMED** | `const rep = (reps ?? [])[0]` |
| 9 | Bulk assignment does not exist | **CONFIRMED** | no multi-select in any sales UI |
| 10 | Unassigned queue does not exist | **CONFIRMED** | no such query in the codebase |
| 11 | Student 360 is incomplete | **CONFIRMED** | no timeline surface exists at all |
| 12 | Payment checkout not instrumented | **CONFIRMED** | 0 paywall/checkout events |
| 13 | `student_crm` is an intentional incomplete split | **CONFIRMED** | trigger `trg_sync_student_crm`; mirror disagrees with `profiles` in **0** rows |
| 14 | `cat_test_leads` is a separate pre-signup universe | **CONFIRMED** | 7 rows, all `cat_readiness_page`, 2 later became students unlinked |

**Three things I asserted earlier that this pass corrected or sharpened:**

* **`claim_lead` is genuinely atomic** — I had asserted it; now proven from the
  function body: one `INSERT … ON CONFLICT DO UPDATE … WHERE lead_outreach.owner
  IS NULL OR owner = excluded.owner`, with the guard **inside** the statement.
  No read-then-write window exists. **This is the best-built primitive in the
  sales system.**
* **`expedify_events.dedupe_key` IS `UNIQUE`** — replay protection exists at the
  database. It was **NULL on all 239 rows**, and Postgres permits unlimited
  NULLs in a unique index. **The constraint is present and inert, and the 220
  duplicate deliveries on 12 Aug are the proof.** I previously called
  idempotency "unexercised"; it is worse — it is *bypassed by construction*
  whenever the vendor omits a lead id.
* **`sales_activity` has NO foreign key on `student_id`** — only `lead_outreach`
  does. I had implied both were keyed to `profiles`. They are not.

---

# §4 — SYSTEM MAP, COMPONENT CLASSIFICATION

| Component | Class | Basis |
|---|---|---|
| `buildCallQueue` (queue authority) | **LIVE** | one authority, two frames, bounded reads |
| `claim_lead` RPC | **LIVE** | atomic, proven from function body |
| `planDisposition` cadence engine | **LIVE** | pure, DB-CHECK-mirrored, guard-tested |
| `sales-disposition` vocabulary | **LIVE** | mirrors both CHECK constraints exactly |
| `/api/sales/log` | **LIVE, UNUSED** | correct write ordering; 0 rows written ever |
| `/sales` rep workspace (4 pages) | **LIVE, UNUSED** | reachable, gated, scoped |
| `/admin/sales`, `/admin/leads`, `/admin/sales-queue` | **LIVE** | real queries, real data |
| `/admin/sales-performance` | **BROKEN** | `reps[0]`; reads an empty table |
| `/api/admin/reassign-lead` | **PARTIAL** | correct API, no UI, rejects the founder |
| `lead_outreach` | **LIVE, EMPTY** | 0 rows |
| `sales_activity` | **LIVE, EMPTY** | 0 rows; no FK on `student_id` |
| `student_crm` + trigger | **PARTIAL (intentional)** | dual-write slice; 0 disagreements |
| `cat_test_leads` + `/api/cat-leads` | **LIVE, ORPHANED** | captures leads that join nothing |
| `founder_outreach` | **LIVE, STALE** | 198 rows, last 8 Aug |
| Expedify outbound | **DISABLED** | `OUTBOUND_DISABLED = true`, 12 Aug |
| `/api/expedify/outcome` | **BROKEN** | 239 events, 0 correct matches |
| `/api/expedify/callback` | **DEAD** | 0 events ever received |
| `/api/cron/sales-ready` | **LIVE (frozen)** | 445 flagged; B3b-frozen |
| `/api/admin/expedify-followups` | **FROZEN** | B3b, and outbound is off |
| Paywall/checkout instrumentation | **MISSING** | never built |
| Follow-up as an object | **MISSING** | never built |
| Message/WhatsApp tracking | **MISSING** | never built |
| Unassigned queue / bulk assign | **MISSING** | never built |
| Student 360 timeline | **MISSING** | never built |
| Data-quality surface | **MISSING** | never built |

---

# §9 — SECURITY RED TEAM

**Structural fact that frames everything:** `profiles` carries six RLS policies —
admin-all, buddy-reads-their-students, and four self-only. **There is no `sales`
policy.** A rep's browser can read only her own row. Every rep-visible datum
arrives through a server component using `createAdminClient()`, which bypasses
RLS. **Therefore route code is the only authorization control in the sales
system.** That is defensible, but it means each finding below is unmitigated by
any second layer.

| ID | Sev | Attack path | Proof | Impact | Fix | Test required |
|---|---|---|---|---|---|---|
| **RT-1** | **P1** | Rep opens `/sales/student/<any-uuid>` | `requireSales()` then `getSalesConversionView(admin, id)` — **no ownership check** | Reads name, phone, WhatsApp, premium state, momentum, prep, last 20 activities for **any profile**, including another rep's lead, a buddy, or the admin | resolve ownership server-side; `leadVisibleTo` already exists and is simply not called here | cross-rep IDOR test |
| **RT-2** | **P1** | Rep POSTs `/api/sales/log` with an arbitrary `studentId` | body validation is `typeof studentId === 'string'` only — **no uuid check, no role check, no sales-ready check**; `claim_lead` then INSERTs a `lead_outreach` row for that id | A rep can **claim any person in the system as her lead** — including the admin — and write history against them. `sales_activity` has **no FK on `student_id`**, so even a non-existent uuid persists | validate uuid + `role='student'` + not-test; add the missing FK | forged-studentId test |
| **RT-3** | **P1** | Whoever holds the Expedify secret picks the student | both inbound routes resolve identity from `payload.phone` | Vendor payload selects which student row is written; a wrong or spoofed phone writes another student's CRM state | `external_ref` → UNMATCHED on miss; never phone | vendor-identity test |
| **RT-4** | **P1** | Webhook replay | `dedupe_key` is `UNIQUE` **but NULL on 239/239 rows**; Postgres allows unlimited NULLs | **220 duplicate deliveries landed in one day (12 Aug)** — this is not theoretical, it happened | require a non-null idempotency key; reject the event if the vendor sends none | replay test with null key |
| **RT-5** | P2 | Ambiguous identity | `.limit(1).maybeSingle()` on a phone match | Two profiles sharing a number → one is chosen arbitrarily and silently | ambiguous ⇒ UNMATCHED | ambiguity test |
| **RT-6** | P2 | Secret in query string | `/api/expedify/outcome?key=<secret>` | Secret lands in access logs, proxies, referrers | header-only | — |
| **RT-7** | P2 | Actor spoofing (latent) | actor is derived server-side from the session — **correct today** — but `sales_activity.actor` is unconstrained text with no FK | A future writer can supply any actor string; nothing at the database prevents "someone else contacted this student" | `actor_id uuid references profiles(id)`, NOT NULL | actor-integrity test |
| **RT-8** | P2 | Identity collision on staff | actor falls back `email ?? full_name ?? 'sales'`; portfolio scoping falls back to `'__none__'` | Two staff without email collapse into the literal actor `'sales'` — one shared identity. **One of the two current staff already has no email** | `profiles.id` as the key | collision test |
| **RT-9** | P2 | Bulk CSV exfiltration | `/api/admin/leads-export`, 25+ columns, every student | Admin-gated and single-admin today, but no rate limit and no audit row | log to `admin_audit_log`; rate limit | — |
| **RT-10** | P3 | Public lead capture abuse | `/api/cat-leads` unauthenticated | Mitigated: 10/IP/day cap, 24h per-phone dedup, silent accept over cap. **Fails open when IP is unknown** | accept the residual, or fail closed | — |

**Attacks tested and found NOT exploitable:**

* **Assignment race / double assignment** — `claim_lead` is a single atomic
  statement with the ownership guard in its `WHERE`. Two concurrent claims
  cannot both succeed. **Verified from the function body, not assumed.**
* **Student → sales tables** — all sales tables are RLS-on with zero policies;
  client `INSERT/UPDATE/DELETE` grants were revoked
  (`20260819l_revoke_unusable_client_write_grants.sql`). No student path exists.
* **Rep manipulating another rep's ownership** — reassignment is admin-only and
  `claim_lead` refuses a lead already owned by someone else.
* **Admin impersonation** — `requireAdmin`/`requireSales` read the role
  server-side and *throw* rather than redirect on an unreadable read.

**Follow-up race conditions: NOT TESTABLE.** Follow-ups are a field, not an
object, so there is nothing to race yet. This becomes live the moment §10's
`follow_up` table exists, and its test must be written with it.

---

# §10 — TABLE-BY-TABLE DECISION

| Table | Decision | Evidence |
|---|---|---|
| `profiles` | **KEEP** — the one identity | `profiles.id = auth.users.id`; every sales table already joins it |
| `lead_outreach` | **EXTEND** — add `owner_id` | PK on `student_id` already guarantees one-owner; only the key is wrong |
| `sales_activity` | **EXTEND** — `actor_id`, FK on `student_id`, provenance | append-only shape is right; three integrity holes (RT-2, RT-7) |
| `follow_up` | **ADD** — the one new table | Rule 6 cannot be satisfied by a field; §12.6 confirmed |
| `external_identity` | **ADD** | Rule 7; `student_payments` already has two bare Razorpay columns — the pattern that must stop |
| `student_crm` | **FINISH or REVERT — founder decides** | not dead: trigger-fed, 0 disagreements. Half-done is the worst state |
| `cat_test_leads` | **MERGE or RETIRE — founder decides** | 7 rows, 2 already duplicated as students |
| `founder_outreach` | **MERGE** into `sales_activity` | a third activity log for the same act; 198 rows, stale since 8 Aug |
| `expedify_events` | **KEEP as raw audit** | never read directly by a surface; normalise only after RT-3/RT-4 are fixed |
| `student_payments` | **KEEP** — conversion truth | already canonical and guard-tested |
| `analytics_events` | **EXTEND** — paywall/checkout | existing table, no DDL needed for §18 |

**No table is added because a screen needs one.** `follow_up` and
`external_identity` are the only additions, both mandated by a frozen rule.

---

# §7 — LEAD DISTRIBUTION MODEL

Preview-then-confirm, as specified:

```
UNASSIGNED  445
strategy: [manual | equal | round-robin | workload-balanced]

PREVIEW
  Rep A   → 112   (currently owns 0, open 0)
  Rep B   → 111
  Rep C   → 111
  Rep D   → 111
                          [ CONFIRM DISTRIBUTION ]
```

**Constraints the model must respect, all already in the system:**
active reps only (`role IN ('sales','admin')`) · `claim_lead`'s atomicity means
a bulk assign is N conditional writes, not one blind UPDATE · every assignment
appends a `sales_activity` `reassigned` row · **workload-balanced requires a
current-open-leads count, which is 0 for everyone today** — so on day one all
four strategies produce the same result, and the UI must say so rather than
imply intelligence it cannot yet exercise.

---

# §6 — CONTROL TOWER INFORMATION ARCHITECTURE

Six layers, and what each can honestly render **today**:

| Layer | Renderable now | Blocked on |
|---|---|---|
| **L1 Today** | new leads, source | everything else needs `lead_outreach` rows |
| **L2 Team** | rep roster | all metrics need `sales_activity` |
| **L3 Lead management** | list, filter, search | assign/bulk/history need §22 changes |
| **L4 Student 360** | signup, product activity, payment orders | assignment, contact, follow-up, paywall, checkout |
| **L5 Activity** | nothing | `sales_activity` is empty |
| **L6 Data quality** | **all 16 checks, today** | nothing |

**L6 is the only layer that is fully renderable now, and it is the only one
whose subject matter is the missing data itself.** Its check #11 returns 236.

**The zero-rule (§11 of the mandate), as a rendering contract:** every empty
metric renders one of three strings — `NOT AVAILABLE — DATA NOT INSTRUMENTED`,
`NOT AVAILABLE — DATA QUALITY FAILURE`, or `0 — NO ACTIVITY RECORDED (CRM NOT IN
USE)`. **A bare `0` is forbidden**, because `lead_outreach = 0` means "the CRM
has no recorded activity", **not** "the team made zero calls" — and the system
has no independent evidence either way.

---

# §8 — ACTIVITY MODEL AND PROVENANCE

The four states the mandate requires, mapped to what can produce them:

| State | Producible today? | From |
|---|---|---|
| **ACTION OBSERVED** | **YES** | `student_payments`, `notifications` delivery state, `student_events` |
| **ACTION CLAIMED** | YES | `sales_activity` rep-typed rows |
| **ACTION ATTEMPTED** | **NO** | needs a telephony/message record — none exists |
| **ACTION FAILED** | **NO** | same |

> **CareerRai cannot today observe that a call or a message happened. It can
> only record that a rep said so.** There is no call id, no duration, no
> recording, no message receipt. Any leaderboard built on `sales_activity`
> alone is a leaderboard of self-reports and is gameable by construction.

**Therefore provenance is not a nice-to-have column — it is the only thing
standing between a founder dashboard and a fiction.** The one honest anchor
already in the codebase is `summarizePortfolio`: **WON = a paid ledger row,
never the typed `converted` disposition.** That rule must generalise to every
metric that matters.

---

# ARTIFACTS 1–17 — WHERE EACH LIVES

1 architecture map §4 · 2 database map §10 + AUDIT §17 · 3 founder capability
matrix AUDIT §12/§14 · 4 salesperson capability matrix AUDIT §13 · 5 security
red-team §9 above · 6 identity model CONTRACT §0 + AUDIT §3 · 7 activity model
§8 above · 8 follow-up model AUDIT §8 + §10 above · 9 distribution model §7
above · 10 student 360 AUDIT §9 · 11 vendor boundary AUDIT §11 · 12 payment
attribution AUDIT §10 · 13 Control Tower IA §6 above · 14 migration plan AUDIT
§23 · 15 test/guard plan AUDIT §25 + §9 above · 16 rollback AUDIT §24 · 17
founder decisions below.

---

# VERDICT: **NOT READY**

## BLOCKERS

1. **Identity — `profiles.id` is not the ownership key.** `owner`/`actor` are
   text; the admin has no email; `sales_activity` has no FK on `student_id`.
   Rules 1, 2 and 8 all fail. **Free to fix today (0 rows); a migration the
   moment the CRM is used.**
2. **Provenance — the system cannot distinguish a claimed call from an observed
   one.** Rule 3 fails. Without it, every team metric is self-reported.
3. **Vendor boundary — no correlation id, phone-keyed matching, inert
   idempotency.** Rules 7 fails; RT-3 and RT-4 are live. **Needs a vendor
   decision, not only code.**
4. **Follow-up is a field, not an object.** Rule 6 fails; completion history
   cannot exist.
5. **No evidence anyone will use the CRM.** 445 qualified leads, one rep
   account, zero logged calls. **Not an engineering blocker, and the largest
   one.**

## SECURITY STOP CONDITIONS

*No sales UI may ship while any of these stands.*

1. **RT-1** — `/sales/student/[id]` must resolve ownership server-side.
2. **RT-2** — `/api/sales/log` must validate that `studentId` is a real student,
   and `sales_activity.student_id` must have a foreign key.
3. **RT-3** — the vendor must never select the student row; missing or ambiguous
   correlation ⇒ UNMATCHED.
4. **RT-4** — a null idempotency key must be rejected, not silently accepted.

## FOUNDER DECISIONS REQUIRED

1. **Is the team calling through Expedify, or by hand?** *(still unanswered;
   reorders everything)*
2. **Will the CRM actually be used, and by whom?** *(blocker 5)*
3. `student_crm` — finish slice 1 or revert.
4. `cat_test_leads` — merge into `profiles` on capture, or retire.
5. Ask Expedify for `external_ref` + `call_id` + structured `disposition`?
6. Canonical STALE threshold.
7. Conversion field of record: `is_premium` or `subscription_status` (PAY-01).
8. DDL authorisation for §10's EXTEND/ADD set.
9. Does anything outside this repo read `student_crm`?

## IMPLEMENTATION ORDER

1. **Security stop conditions** RT-1, RT-2 — pure route/schema fixes, no vendor,
   no UI, no new concepts.
2. **Identity** — `owner_id`, `actor_id`, `student_id` FK, `external_identity`.
   Zero-row, single migration, `DROP COLUMN` rollback.
3. **Provenance** on every activity row.
4. **L6 Data Quality screen** — the only layer that is not UI over missing data.
5. **Follow-up as an object.**
6. **Lead distribution** — unassigned queue, preview, bulk assign.
7. **Vendor boundary** — `external_ref`, UNMATCHED queue, non-null idempotency
   *(gated on decision 5)*.
8. **L1–L3** Today / Team / Lead management.
9. **L4/L5** Student 360 + Activity, incl. paywall/checkout instrumentation.
10. **B3b unfreeze**, once the canonical model proves where those four paths sit.

## WHAT I KNOW

Every count in §12, §4 and §9 — from production queries and function bodies read
today. `claim_lead`'s atomicity, the `dedupe_key` UNIQUE-but-null bypass, the
missing FK on `sales_activity.student_id`, the six `profiles` policies with no
`sales` entry, the absent `studentId` in the outbound Expedify body, the
admin's null email, 0 of 5 paid customers with any sales attribution.

## WHAT I INFER

That the 220 same-day duplicate deliveries were a looping vendor node (the
pattern fits; their canvas is not visible to me). That nobody has used the CRM
because both tables are empty and one rep exists — **an inference about human
behaviour, not a system fact.** That all four distribution strategies are
equivalent on day one because every workload is 0.

## WHAT I CANNOT PROVE

1. Whether any calls were actually made by any means. **An empty table is not
   evidence of inaction** — the system has no independent observation either
   way, and I will not present its silence as a finding about your team.
2. Whether Expedify can return an `external_ref`.
3. Whether anything outside this repository reads `student_crm`.
4. Whether the rep ever opened `/sales` — there is no admin-route telemetry.
5. Whether campaign tags ever existed — 771 students, 0 attributed, consistent
   with both "never tagged" and "lost at signup".

---

**ARCHITECTURE GATE COMPLETE. Nothing implemented. Implementation requires
separate explicit authorisation.**
