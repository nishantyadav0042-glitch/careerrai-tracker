# CareerRai Sales Operating System — architecture gate audit

**23 Aug 2026 · READ-ONLY.** No schema change, no migration, no API change, no
UI change, no backfill, no deletion, no deploy, no cron change, no payment
change, no B3b change. Nothing was implemented. The three items I previously
listed as "without waiting" are **withdrawn** and reclassified as Phase 2
outputs.

Every number is a query against production, run today. Every claim points at a
file. **UNKNOWN is used where it is the truth.**

---

# 1. EXECUTIVE VERDICT

## NOT READY — and the reason is not the dashboard

> **CareerRai has a well-built dialer CRM with zero rows in it, a vendor pipe
> that has never carried a real call, and a sales operating model in which no
> paying customer has ever been linked to a sales action.**

Three numbers carry the whole verdict:

| | |
|---|---|
| `lead_outreach` rows | **0** |
| `sales_activity` rows | **0** |
| Paid customers with any lead attribution | **0 of 5** |

The final quality bar asks whether the founder can open the panel tomorrow and
answer eleven questions. **Today the honest answer to nine of them is "no data
exists", and to two of them ("who are today's new leads", "which students are
progressing") it is "yes, from `profiles` and `student_events`".**

**The architecture below is buildable and mostly already designed. What is
missing is not screens — it is (a) one identity key, (b) a trustworthy vendor
boundary, and (c) anyone actually using the CRM.** Item (c) is not an
engineering problem and I flag it as the largest open question in this
document.

---

# 2. CURRENT ARCHITECTURE

```
LEAD CAPTURE
  /api/cat-leads  (PUBLIC, IP-capped)      → cat_test_leads          7
  phone-OTP signup                         → profiles (role=student) 771
                                                   │
QUALIFICATION                                      ▼
  /api/engagement (buddy-CTA, instant)  ─┐
  /api/cron/sales-ready (streak≥3 …)    ─┴→ student_engagement.sales_ready  445
                                                   │
QUEUE (one authority)                              ▼
  lib/call-queue.ts::buildCallQueue — cap 60/day, 30-day window
        ├→ /admin/sales     (founder frame, unscoped)
        └→ /sales           (rep frame, scoped by repEmail)
                                                   │
OWNERSHIP                                          ▼
  claim_lead(uuid,text) RPC  ── atomic pull-claim on first disposition
  /api/admin/reassign-lead   ── admin push-reassign, NO UI CALLS IT
                                                   │
ACTIVITY                                           ▼
  /api/sales/log → lead_outreach (state, upsert) + sales_activity (history)
                        0 rows                          0 rows
                                                   │
VENDOR (external)                                  ▼
  lib/expedify.ts  OUTBOUND_DISABLED=true since 12 Aug
      → profiles.expedify_status (634) → [trigger] → student_crm (684)
  /api/expedify/outcome   ← 239 events, phone-keyed
  /api/expedify/callback  ← 0 events
                                                   │
PAYMENT                                            ▼
  student_payments (30 orders, 5 paid) → profiles.is_premium (8)
```

**Founder surfaces:** `/admin/sales` (queue) · `/admin/leads` (+`/[id]`) ·
`/admin/sales-queue` (445 sales-ready) · `/admin/sales-performance` ·
`/admin/buddy-interest` · `/admin/reminders`. All nine live in the **Sales
workspace** in `src/lib/admin-workspaces.ts`, in the nav since 21 Aug.

**Rep surfaces:** `/sales` (calls) · `/sales/leads` · `/sales/summary` ·
`/sales/student/[id]`.

---

# 3. CANONICAL IDENTITY MODEL

**The law (frozen in `docs/SALES-IDENTITY-CONTRACT.md`):** `profiles.id` is the
only internal identity key. Phone, email, WhatsApp, vendor ids are attributes
and external identifiers, never ownership keys.

| Concept | Key today | Compliant? |
|---|---|---|
| Person | `profiles.id` (uuid = `auth.users.id`) | **YES** |
| Lead | `profiles.id` | **YES** |
| Lead state | `lead_outreach.student_id` (PK) | **YES** |
| Activity subject | `sales_activity.student_id` | **YES** |
| **Lead owner** | `lead_outreach.owner` — **text email** | **NO** |
| **Activity actor** | `sales_activity.actor` — **text email** | **NO** |
| **Vendor contact** | phone → `profiles.phone` | **NO** |
| Pre-signup lead | `cat_test_leads.id` + bare phone | **NO — second universe** |

**Proposed model — no new `lead_id`:**

```
profiles.id ─── the one internal key
   ├── attributes:  phone · email · name · signup_source
   ├── external ids (namespaced, one row per vendor+ref):
   │     expedify:<their contact id>
   │     razorpay:<customer/order/payment id>
   └── sales state:  lead_outreach (1:1)  ·  sales_activity (1:N)
                     owner_id / actor_id → profiles.id
```

**Namespacing is required** because `student_payments` already stores
`razorpay_order_id` and `razorpay_payment_id` as bare columns — a second vendor
would add two more columns rather than a row. That pattern does not scale and
is the shape this contract forbids going forward.

---

# 4. LEAD MODEL

**A lead is a `profiles` row.** Evidence for not creating a `leads` table:
`lead_outreach` is already PK'd on `student_id`, every sales surface already
joins on it, and a separate table would manufacture a third identity plus a
sync mapping.

**The gap:** `cat_test_leads` holds 7 pre-signup captures that are **not**
`profiles` rows. Classified earlier: all from `cat_readiness_page`, June, none
test data, **2 of 7 later became students independently with nothing linking
the records**. This is a genuine second universe and needs a founder decision —
first-class capture that creates a profile, or a marketing artefact outside
sales.

---

# 5. OWNERSHIP MODEL

**Correct in shape, wrong in key.**

* One current owner is guaranteed by the PK — `current_owner = one rep OR NULL`
  holds by construction, not by convention.
* `/api/sales/log` deliberately omits `owner` from its upsert; ownership moves
  **only** through the atomic `claim_lead` RPC and the admin reassign route.
* `leadVisibleTo(owner, repEmail)` in `sales-disposition.ts` encodes the shared-
  book rule: unclaimed → visible to all; claimed → owner only; no rep context →
  everything (admin oversight).

**The defect, proven from production, not hypothesised:** of two staff accounts
the **admin has no email**.

1. `/api/admin/reassign-lead` requires `target.email` → **the founder cannot be
   assigned a lead.**
2. `const actor = me?.email ?? 'admin'` → his reassignments log as the literal
   string `'admin'`.
3. `/api/sales/log` uses `actor = email ?? full_name ?? 'sales'` → the rep
   writes an email, the founder would write a name. **Two actor namespaces in
   one column.**

**IDN-1, P0.** The system cannot name one of its two operators.

---

# 6. ASSIGNMENT MODEL

The ruling's twelve questions, answered precisely:

| # | Can the founder… | Today |
|---|---|---|
| 1 | see all unassigned leads | **NO** — no unassigned view exists (and today *everything* is unassigned) |
| 2 | select multiple leads | **NO** — no multi-select anywhere in the codebase |
| 3 | assign to rep A | **API only** — `POST /api/admin/reassign-lead`, no UI |
| 4 | reassign to B | **API only**, same route |
| 5 | see assignment history | **PARTIAL** — `sales_activity` `status='reassigned'` rows exist; actor unnameable (§5) |
| 6 | bulk assign | **NO** |
| 7 | filter by source/date/status | **PARTIAL** — `/admin/people` filters students, not leads |
| 8 | distribute today's leads | **NO** |
| 9 | distribute historical backlog | **NO** — 445 sales-ready have never entered `lead_outreach` |
| 10 | prevent double ownership | **YES** — `claim_lead` is atomic; a lost race returns 409 and writes nothing |
| 11 | see workload per rep | **BROKEN** — `/admin/sales-performance` reads `reps[0]` |
| 12 | see overdue follow-ups per rep | **NO** — derivable from `next_action_at`, never rendered |

**Distribution today is pull, not push.** That is a legitimate call-centre
model and it is working as designed; it simply cannot express *"give 15 to A,
15 to B, 20 to C"*, which is what the founder asked for.

---

# 7. ACTIVITY MODEL

`sales_activity` is append-only history; `lead_outreach` is current state.
`/api/sales/log` writes **state first, then history, both error-checked**, so
they cannot contradict each other.

**Can CareerRai answer "did rep A actually contact student B?"** Per source:

| Source | WHO | WHAT | WHEN | STUDENT | LEAD | REP | OUTCOME | NEXT | Trustworthy? |
|---|---|---|---|---|---|---|---|---|---|
| `sales_activity` | actor (email/name) | status | ✓ | ✓ uuid | ✓ | **ambiguous key** | ✓ | via state | **CLAIM, not proof** |
| `lead_outreach` | owner (email) | status | `updated_at` | ✓ uuid | ✓ | **ambiguous key** | ✓ | `next_action_at` | **CLAIM** |
| `expedify_events` | — | `agent_summary` | ✓ | **wrong** | ✗ | ✗ | **absent** | ✗ | **NO** |
| `founder_outreach` | implicit founder | action | ✓ | ✓ uuid | ✗ | ✗ | ✗ | `snoozed_until` | partial |
| `notifications` | system | channel | ✓ | ✓ uuid | ✗ | ✗ | delivery state | ✗ | **OBSERVED** |
| `student_payments` | — | payment | ✓ | ✓ uuid | ✗ | ✗ | status | ✗ | **OBSERVED** |

**Answer: no.** Every sales-side source is a rep's own claim, and the actor key
cannot reliably name a person. **Nothing in the system independently observes
that a call happened** — there is no telephony record, no call id, no duration,
no recording. `summarizePortfolio` already encodes the one honest exception:
**WON = a paid ledger row, never the typed `converted` disposition.**

**WhatsApp/SMS/email are not tracked at all.** `waNumber()` builds a `wa.me`
link by string surgery; opening it is invisible to the system. **"Who did the
rep message" is currently unanswerable in principle, not merely unrecorded.**

---

# 8. FOLLOW-UP MODEL

Real, pure and tested: `planDisposition()` maps a disposition to `status`,
`callback_at`, `next_action_at`, `no_answer_count`; the vocabulary is mirrored
by a DB CHECK and pinned by a guard test. `buildCallQueue` surfaces
**callback → retry → follow-up → fresh**, suppressing closed leads and
same-day repeats.

**A follow-up is not a first-class object.** It is a *field on the lead state*
(`next_action_at`), so:

* it has **no owner of its own** (it inherits the lead's owner),
* it has **no reason**, **no `completed_at`**, and **no completion activity**,
* completing it overwrites the field — **§13's history gap**.

OVERDUE / DUE TODAY / UPCOMING / NEVER-CONTACTED are all *derivable* today and
**none is rendered**. **STALE has no canonical threshold anywhere** — that is a
product decision the founder owes, not a number I should invent.

---

# 9. STUDENT 360 MODEL

What exists to build a timeline from, with identity coverage measured:

| Step | Source | Rows | Identity |
|---|---|---|---|
| Pre-signup funnel | `funnel_events` (12 steps) | 14,083 | **0% — anon_id only** |
| Registration | `profiles.created_at` | 771 | 100% |
| App open | `student_events.app_open` | 13,396 | **45%** |
| Screen view/exit | `student_events` | 38,160 | 55% |
| **Taps** | `student_events.tap` | **94,888** | **31%** |
| Install | `install_*` | 1,304 | 80–89% |
| Daily log | `daily_log`, `log_submitted` | 515 | 100% |
| Buddy intent | `buddy_unlock_open` etc. | 104+ | 100% |
| **Paywall viewed** | — | **0** | **NOT INSTRUMENTED** |
| **Checkout opened** | — | **0** | **NOT INSTRUMENTED** |
| Payment attempted | `student_payments` | 30 | 100% |
| Payment succeeded | `student_payments.status='paid'` | 5 | 100% |

**The anon→identified stitch is the ceiling on any Student 360.** Two thirds of
taps and the entire pre-signup funnel cannot be attached to a person. That is a
*stated limit of the architecture*, not something a UI can resolve.

---

# 10. CONVERSION MODEL

**Canonical definition already exists and is correct:** a paid row in
`student_payments` (`status='paid'`), never the typed `converted` disposition —
encoded in `summarizePortfolio` (SA-1E) and guard-tested by `sales-won.guard`.

**And it is currently unattributable to sales:**

```
paid customers                                5
… with a lead_outreach row                    0
… with any sales_activity                     0
```

**"Which sales activities generated conversions?" → 0 of 5. Not "low" — none.**

Separately, `is_premium` (8) and `subscription_status` disagree for at least
one student (PAY-01, from the payment audit). **A sales conversion view must
name which one it means.**

---

# 11. EXPEDIFY BOUNDARY — FACT / RECOMMENDATION / UNKNOWN, kept separate

## FACT

* 239 inbound events total: 236 `call_report` (7–12 Aug), 3 `contact.updated`
  (29 Jul ×2, 7 Aug).
* All 236 `call_report` rows carry **one distinct `agent_summary`**: the
  18-character string `"first webhook test"`. 220 of them arrived on 12 Aug.
* All 236 carry **one distinct phone**, which resolves to the **admin** profile.
* `call_report` payload keys are exactly: `agent_summary, event, phone`. **No
  disposition, no outcome, no call id, no timestamps, no agent identity.**
* All 3 `contact.updated` rows have `student_id = NULL` — matched nothing.
* `dedupe_key` is NULL on all 239 rows, so idempotency is **unexercised**.
* `lib/expedify.ts` outbound body sends: `name, phone, email, source,
  lead_type, summary, attempt, target_percentile, dream_colleges,
  hours_per_day, coaching, wants_mentor, target_date, pain_points,
  strongest_section, weakest_section, device, coverage`. **`studentId` is in
  the TypeScript interface and is deliberately not in the request body.**
* Outbound `email` is fabricated from the phone when absent:
  `{digits}@noemail.careerrai.app`.
* `OUTBOUND_DISABLED = true` since 12 Aug, on the founder's instruction.
* Both inbound routes match by phone via `.limit(1).maybeSingle()`.
* The two inbound routes have **opposite** unmatched policies: `/outcome`
  stores the event and returns success; `/callback` returns 404 and stores
  nothing.

## Explicitly NOT claimed

**I do not claim Expedify lost CareerRai data.** Per rule 16.9: we never sent a
CareerRai identity in the outbound payload, so none could be lost on return.
**The absent correlation id is ours.** My earlier "236 mis-attributed real
calls" claim is withdrawn — recorded in full in §16 of this document and in
`docs/SALES-PHASE-1-IDENTITY.md`.

## UNKNOWN

1. Whether Expedify **can** echo an `external_ref`. Never asked, never tested.
2. Whether the human team calls through Expedify or by hand. **No evidence
   either way, and it reorders every phase downstream.**
3. Why the same phone appears on all 236 — their node config is not visible.
4. Whether `student_crm` has any consumer outside this repository.

## RECOMMENDATION (not authorised, not started)

Required future contract, to be evaluated against what they can actually do:
`external_ref` · `call_id` · structured `disposition` · `started_at` ·
`ended_at` · agent identity · callback/follow-up fields. Missing or ambiguous
`external_ref` → **UNMATCHED**, never a phone guess.

---

# 12. CURRENT ADMIN CAPABILITIES

| Capability | State |
|---|---|
| See the call queue | **YES** — `/admin/sales`, same `buildCallQueue` the rep sees |
| See sales-ready students | **YES** — 445, drill-down at `/admin/sales-queue` |
| See a lead detail | **YES** — `/admin/leads/[id]`: profile, streak, 10 daily reports, mocks, `lead_outreach` |
| Log a call | **YES** — `/api/sales/log` accepts admin |
| Reassign a lead | **API only, and broken for the founder** (§5) |
| See rep performance | **BROKEN** — `reps[0]`, and reads an empty table |
| Export leads | **YES** — `/api/admin/leads-export`, 25+ columns CSV, admin-gated |
| Founder outreach log | **YES** — `founder_outreach`, 198 rows, last 8 Aug |
| Bulk anything | **NO** |
| Activity timeline | **NO — never built** |
| Data-quality view | **NO** |

---

# 13. CURRENT SALESPERSON CAPABILITIES

`/sales` (queue with brief) · `/sales/leads` (own book) · `/sales/summary`
(own stats) · `/sales/student/[id]` (convert view + quick log).

Data surface via `getSalesConversionView`: name, phone, WhatsApp number,
`is_premium`, has-buddy, conversion score/tier, momentum, reachability, last
activity, symptoms, topic-coverage prep, objections, pitch, last 20 activities,
lead status, recommended buddy.

**Actions:** call/WhatsApp link, log a disposition, set a callback. **No note
without a disposition, no follow-up as its own object, no message tracking.**

---

# 14. FOUNDER VISIBILITY GAPS

| The backend knows | The founder cannot see it because |
|---|---|
| 445 sales-ready, none ever worked | visible as a count; **445 never entered `lead_outreach`** |
| 334 signups in 7 days, 68 yesterday | no *sales* framing of "today's new leads" |
| Ownership is possible | 0 leads owned; no unassigned view; no assign UI |
| Reassignment is possible | API exists, no UI, and it rejects the founder |
| Per-rep performance | `reps[0]` only, from an empty table |
| 165,861 product events | no per-student timeline anywhere |
| 239 vendor events | all wrong or unmatched; no unmatched view |
| 5 paid customers | **none linked to any sales action** |

---

# 15. SECURITY FINDINGS

**Posture:** every sales table is RLS-on with **zero policies** (deny-all) — no
browser reaches them. All access is server-side through `createAdminClient()`,
which **bypasses RLS entirely**. Therefore *route code is the only
authorization control that exists.*

| ID | Sev | Finding |
|---|---|---|
| **SALES-SEC-1** | **P1** | `/sales/student/[id]` calls `requireSales()` then reads the `id` from the URL with **no ownership check**. Any rep can open any student — including another rep's lead and any admin/buddy profile. Not downgraded for having no link in the UI: it is a direct-object reference on an authenticated route. |
| **SALES-SEC-2** | **P1** | **Vendor callback chooses the student.** Both Expedify routes resolve identity from `payload.phone`. Whoever holds the shared secret selects which student row is written. Combined with `.limit(1).maybeSingle()`, an ambiguous phone silently selects an arbitrary profile. |
| **SALES-SEC-3** | P2 | `/api/expedify/outcome` authenticates via **`?key=` in the query string**, which lands in access logs and referrers. A header is accepted too; the query form is the weak one. |
| **SALES-SEC-4** | P2 | Actor is **derived server-side** from the session (`me.email`) — correct, no spoofing — but because it is an unconstrained text column, a future writer *could* supply any string. The protection is a convention, not a constraint. |
| **SALES-SEC-5** | P2 | No rate limit or audit on `/api/admin/leads-export` (25+ columns, all students, CSV). Admin-gated, single admin, but it is the widest sales-data egress in the app. |
| INF | info | `/api/cat-leads` is public **by design** with an IP cap of 10/day and 24h per-phone dedup, failing open on unknown IP. Reasonable; it also writes **bare 10-digit phones**, a source of the format drift. |

**Clean:** authentication is uniform (`getUser()` → `profiles.role`) on all nine
sales routes; `claim_lead` is atomically safe against concurrent claims;
reassignment is admin-only; students have no path to any sales table.

---

# 16. DATA-INTEGRITY FINDINGS, AND MY OWN CORRECTIONS

**Corrections to my prior conclusions, recorded as rule 16.9 requires:**

1. **"236 real call outcomes were mis-attributed."** **WRONG.** They are one
   test string delivered 236 times. Not one genuine call outcome has ever
   arrived.
2. **"`student_crm` is a shadow table with no reader — retire it."** **WRONG.**
   It is slice 1 of the documented profiles split (`docs/PROFILES-SPLIT-PLAN.md`),
   written by trigger `trg_sync_student_crm` on `profiles`, in expand+dual-write
   state. It has no reader **by design**; reads flip in a later deploy. The
   choice is finish or revert, not retire.
3. **"Phone uniqueness + one format."** **WITHDRAWN.** `UNIQUE(phone)` would
   reject a second sibling on a shared family number at signup.
4. **"The sales panel is not visible."** **MISLEADING** — it has been in the nav
   since 21 Aug. The panel exists; the data under it does not.

**Live defects:**

| ID | Sev | Finding |
|---|---|---|
| IDN-1 | **P0** | Ownership and actor keyed by email; the admin has none (§5) |
| IDN-2 | **P0** | Vendor boundary keyed by phone, no correlation id ever sent (§11) |
| IDN-3 | P2 | `cat_test_leads` is a second lead universe (§4) |
| ACT-1 | **P1** | No follow-up completion history — `next_action_at` is overwritten (§17) |
| ACT-2 | P1 | WhatsApp/SMS/email interactions are not recorded at all (§7) |
| VEN-1 | P2 | Two inbound routes, opposite unmatched policies (§11) |
| VEN-2 | P2 | `.limit(1).maybeSingle()` silently picks one of an ambiguous match |
| CRM-1 | P2 | `student_crm` split is stalled half-done (§16.2) |

---

# 17. RECONCILIATION — ACTUAL COUNTS, NO ESTIMATES

```
profiles (all)                                          781
  role=student                                          771
  role=buddy                                              8
  role=admin                                              1     ← no email
  role=sales                                              1
  is_test_account                                        10

PHONE
  students with phone                                   730
  students without phone                                 41   (39 non-test)
  distinct phones                                       730
  duplicate phone groups (exact)                          0
  duplicate phone groups (last-10)                        0
  malformed phones                                        0
  stored as bare 10-digit (non-canonical)                65
  true international numbers                              0

SALES
  lead_outreach rows                                      0
  sales_activity rows                                     0
  leads without owner                                     0  (of 0)
  owner refs unresolvable                                 0  (of 0)
  activities with no student / no actor                   0  (of 0)
  orphan lead_outreach / sales_activity                   0
  activity-without-lead-row                               0
  sales_ready students never in lead_outreach           445

VENDOR
  expedify_events total                                 239
    call_report                                         236   ← one test string
    contact.updated                                       3   ← unmatched
  events with student_id NULL                             3
  events matched to a NON-student                       236   ← prima facie wrong
  distinct students across all events                     1
  profiles.expedify_status set                          634
  profiles.call_feedback set                              1

MIRROR (student_crm)
  rows                                                  684
  rows disagreeing with profiles                          0   ← trigger is working
  orphans                                                 0
  profiles with CRM cols but no mirror row                0

PAYMENT
  student_payments rows                                  30
  paid                                                    5
  paid with a lead_outreach row                           0
  paid with any sales_activity                            0

LEGACY
  cat_test_leads                                          7   (2 later became students)
```

---

# 18. MISSING INSTRUMENTATION

| Not instrumented | Consequence |
|---|---|
| **Paywall viewed** | cannot tell interest from ignorance |
| **Checkout opened** | 24 abandoned orders are one undifferentiated bucket |
| WhatsApp / SMS / email sent | "who did the rep message" unanswerable **in principle** |
| Call telephony record (id, duration, recording) | no independent observation that a call happened |
| Follow-up completion | no `completed_at`, no completing activity |
| Assignment source/reason | history says who and when, never why |
| Rep session activity | UNKNOWN whether the one rep ever opened `/sales` |
| anon→identified stitch | 69% of taps and 100% of pre-signup funnel unattributable |

---

# 19. PROPOSED CANONICAL ARCHITECTURE

```
                      profiles.id  ── the one internal key
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
   external_identity   lead_outreach        student_events
   (vendor, ref)       (1:1 state)          (product truth)
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        sales_activity  follow_up   assignment history
        (append-only)   (1st-class)  (sales_activity rows)
              │
        student_payments  ── the only conversion truth
```

**Rules that must hold:**

1. Every person reference is `profiles.id`. No email, no phone, no name.
2. External identifiers live in one namespaced place, never as per-vendor
   columns.
3. **Lead state, student state, sales activity and payment state are four
   separate things** and no surface may collapse them. A student may be
   *registered + assigned + contacted twice + interested + unpaid*; another
   *registered + unassigned + never contacted + active + paid*. Both must be
   expressible and distinguishable.
4. Every activity row carries provenance: **OBSERVED** (payment, notification,
   product event) or **CLAIMED** (rep-typed). Renderers must show it.
5. Conversion = a paid ledger row. Never a typed disposition.
6. The Control Tower is a **read model** over this. It computes nothing of its
   own.

---

# 20. CONTROL TOWER INFORMATION ARCHITECTURE

Not pixels — the information contract. Every number drills to its rows.

```
L1  TODAY        new · unassigned · assigned · first-contact-pending ·
                 contacted · overdue follow-ups · interested · converted · lost
L2  SALES TEAM   per rep: owned · new today · contacted today · calls ·
                 messages · due · overdue · conversions · revenue · rate
L3  LEAD QUEUE   filter · search · bulk select · assign · reassign · history
L4  STUDENT 360  signup → assignment → contact → follow-up → product activity
                 → checkout → payment → conversion  (each row OBSERVED/CLAIMED)
L5  ACTIVITY     every sales action, actor + timestamp
L6  DATA QUALITY the 16 integrity checks (docs/SALES-IDENTITY-CONTRACT.md §5)
```

**L6 is not optional and not last.** It is the only level that is *not* UI over
missing data, and its check #11 — *"vendor call event matched to a
non-student"* — returns **236** and would have caught the entire Expedify
problem on day one in one line of SQL.

**Honesty rule:** a zero must read *"0 calls logged — the CRM is not in use"*,
never a bare `0` that looks like a quiet day.

---

# 21. REQUIRED APIs

**Exists, reusable:** `POST /api/sales/log` · `POST /api/admin/reassign-lead` ·
`claim_lead` RPC · `buildCallQueue`.

**Missing:** bulk assign · unassigned-queue read · follow-up complete ·
note-without-disposition · unmatched-vendor-event list + repair/replay ·
integrity-check read · Student-360 timeline read (cursor-paginated).

---

# 22. REQUIRED DATABASE CHANGES (proposed — NOT applied, NOT authorised)

| # | Change | Risk |
|---|---|---|
| 1 | `lead_outreach.owner_id`, `sales_activity.actor_id` → `uuid references profiles(id)` | **zero-row** — see §23 |
| 2 | `external_identity(person_id, vendor, ref)` namespaced, unique per (vendor, ref) | additive |
| 3 | `follow_up` as a first-class row (owner, due_at, reason, status, completed_at, completing_activity) | additive |
| 4 | Normalise the 65 bare phones to `+91…` + write-time normaliser | data fix, reversible |
| 5 | Provenance column on activity (`observed` \| `claimed`) | additive |
| 6 | Finish **or** revert the `student_crm` split slice | **founder decision** |

**No `UNIQUE(phone)`** — §16.3.

---

# 23. MIGRATION / BACKFILL STRATEGY

```
lead_outreach rows      0    sales_activity rows     0
├── exact owner match   0    ├── actor resolves      0
├── owner missing       0    ├── actor missing       0
├── ambiguous           0    ├── actor ambiguous     0
├── orphaned            0    └── unresolvable        0
└── invalid             0
```

**Both tables are empty, so there is nothing to backfill and nothing to guess.**
`owner_id`/`actor_id` can be **the only key from birth** — no dual-write, no
soak, no reconciliation window. The email columns can be dropped in the same
migration.

**This is the single reason the identity fix is cheap today and will not be in
three months.** Every day the CRM stays unused is a day this stays free; the
first real row makes it a migration.

For change 4 (phone normalisation) the reconciliation report runs **before**
mutation and any row that does not normalise to exactly one canonical form is
**left untouched and surfaced**, never guessed.

---

# 24. ROLLBACK STRATEGY

| Change | Rollback |
|---|---|
| 1 owner_id/actor_id | `DROP COLUMN` — no data lost (zero rows) |
| 2 external_identity | drop table — nothing reads it until wired |
| 3 follow_up | drop table; `next_action_at` remains authoritative until reads flip |
| 4 phone normalisation | reversible from a pre-image snapshot taken in the same transaction |
| 5 provenance | drop column |
| 6 student_crm | already documented in its own migration: drop trigger → function → table; `profiles` untouched throughout |

---

# 25. TEST STRATEGY

**Existing guards to keep:** `sales-claim`, `sales-clock`, `sales-won`,
`sales-ready-drain`, `sales-script-honesty`, `sales-disposition`,
`crm-end-to-end`, `assignment-verified-phone`.

**New guards required, each pinning an idea rather than a string:**

1. **Identity guard** — fails the build if any sales module keys a person by
   email or phone. Must resolve through helpers (the population-read guard
   missed `dispatch()`-mediated writes exactly this way).
2. **Cross-rep authorization test** — rep A requesting rep B's student is
   refused server-side.
3. **Multi-rep performance test** — fails on `reps[0]`.
4. **Provenance test** — a `claimed` row can never render as `observed`.
5. **Vendor-identity test** — a payload with no `external_ref`, or an ambiguous
   one, produces UNMATCHED and writes nothing to a student.
6. **State-separation test** — lead state, student state and payment state
   cannot be collapsed into one field.

---

# 26. ACCEPTANCE CRITERIA — SCORE TODAY

From the founder's Phase 2 checklist: **8 of 33 met.**

* Identity 1/9 · Ownership 3/6 · Expedify **0/9** · Data integrity 4/5 ·
  Security 3/6 (net of SALES-SEC-1 and SALES-SEC-2).

The final quality bar, eleven questions:

| Question | Answerable today? |
|---|---|
| Who are today's new leads? | **YES** (from `profiles`) |
| Who owns each one? | **NO** — 0 owned |
| Who has contacted them? | **NO** — 0 activities |
| When? | **NO** |
| What happened? | **NO** |
| Who needs follow-up? | **NO** |
| Which rep is falling behind? | **NO** — one rep, empty table |
| Which students are progressing? | **YES** (`student_events`, `daily_reports`) |
| Which students reached payment? | **PARTIAL** — orders yes, checkout not instrumented |
| Which sales activities generated conversions? | **NO — 0 of 5 paid have any** |
| Where is information missing? | **NO** — no data-quality surface exists |

**2 YES, 1 PARTIAL, 8 NO. NOT READY.**

---

# 27. EXPLICITLY FROZEN

* The four B3b money/CRM paths — `expire-subscriptions`, `sales-ready`,
  `founder-alerts`, `expedify-followups`. **They stay frozen until this
  architecture proves where they belong.**
* Control Tower UI · payment funnel events (`payment_checkout_opened` moved to
  Phase 9) · Expedify outbound (`OUTBOUND_DISABLED = true`) · `reconcile-payments`.
* **Withdrawn from "do now":** identity guard test, Expedify unmatched-policy
  alignment, `.limit(1).maybeSingle()` fix. All three are Phase 2 outputs.

---

# 28. UNKNOWNS REQUIRING A FOUNDER OR VENDOR DECISION

| # | Question | Blocks |
|---|---|---|
| 1 | **Is the human team calling through Expedify, or by hand?** If by hand, the vendor pipe is not the priority and `/api/sales/log` already works — the gap is that nobody uses it. **No evidence exists either way.** | the entire phase order |
| 2 | **Is anyone going to use the CRM?** 445 qualified leads, 0 logged calls, one rep account. This is the largest open question in the document and it is not an engineering one. | everything |
| 3 | `student_crm` — finish slice 1, or revert? | CRM-1 |
| 4 | `cat_test_leads` — first-class capture that creates a profile, or marketing artefact outside sales? | IDN-3 |
| 5 | Will you ask Expedify for `external_ref` + structured `disposition` + `call_id`? | IDN-2, all vendor work |
| 6 | Canonical **STALE** threshold for a lead. | follow-up queues |
| 7 | Conversion field of record: `is_premium` or `subscription_status`? (PAY-01) | conversion metric |
| 8 | DDL authorisation for §22 changes 1–5. | Phase 2 |
| 9 | Does anything outside this repository read `student_crm`? | CRM-1 |

---

**AUDIT COMPLETE. Nothing implemented. Implementation requires separate
explicit authorisation after this document is reviewed.**
