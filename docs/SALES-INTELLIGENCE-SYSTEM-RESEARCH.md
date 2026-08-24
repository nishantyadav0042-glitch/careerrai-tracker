# Sales Intelligence + Student Success System — Phase 0 Research & Blueprint

**24 Aug 2026 · Founder discovery mandate (uploaded prompt), executed read-only.**
No application code, schema, or UI was changed for this document. Every claim is
labeled **FACT** (verified in code or production), **INFERENCE** (reasoned from
facts), **RECOMMENDATION** (my proposal), or **UNKNOWN** (honestly not knowable
from current evidence).

**The one sentence that frames everything below:** the sales system this
document designs is ~70% already built — it sits unmerged in **PR #99** on this
branch, has **zero rows of production usage**, and what is genuinely missing is
exactly four things: retention-first priority lanes, the capacity/auto-assignment
engine, retention-outcome measurement in the MIS, and the operational repairs
listed in §5. Nothing here proposes a second CRM.

---

## 1. Executive summary

- **FACT:** Production today (queried 24 Aug): 782 real students (test accounts
  excluded), **340 signed up in the last 7 days** (555 in 30 — inflow is
  accelerating to ~49/day), 383 opened the app in the last 7 days, but only
  **88 logged study** — activation, not traffic, is the bottleneck. 5 paying
  students. 443 students carry the `sales_ready` flag. 41 have no usable phone.
- **FACT:** The CRM core (`lead_outreach` with `owner_id`, `sales_activity`
  with provenance, `sales_followup`, atomic `claim_lead`, rep authorization on
  `profiles.id`, the Founder Control Tower, the data-quality panel, lead
  distribution with preview-confirm, the audit trail) is **built, tested
  (3,112 passing), and applied to the production schema — but the application
  code is unmerged (PR #99) and every CRM table holds 0 rows.** Your two hires
  would be its first users. There is no operational history to migrate: this is
  the cheapest moment this system will ever be to shape.
- **FACT:** A rep already sees substantial student intelligence on
  `/sales/student/[id]`: section-wise coverage %, weak/strong section, top
  untouched high-weight topics, momentum band, buddy-intent signals, objection
  playbook, recommended buddy, call history, one-tap call/WhatsApp. The
  "admin-panel-type access" you described mostly exists; §6 lists the real gaps
  (study timeline, mock scores, follow-up history, rep observations).
- **FACT:** **No capacity, bandwidth, working-hours, or per-rep-ceiling model
  exists anywhere in the codebase** (verified by grep across every sales
  module). Lead distribution today is founder-manual (preview → confirm).
  §15 designs the auto-assignment engine from scratch — it is the largest
  genuinely-new build in this document.
- **RECOMMENDATION (headline):** merge PR #99 first (it is the foundation this
  entire design stands on), do the §5 repairs, add the retention lanes +
  capacity engine + MIS outcome columns in one Phase-1 build, and put the two
  hires on it. Do **not** build a new CRM, a new queue, a new disposition
  vocabulary, or an opaque AI score. Full phasing in §29.

---

## 2. Current architecture (the pipeline, stage by stage)

`LEAD → STUDENT → QUEUE → ASSIGNMENT → CALL → DISPOSITION → FOLLOW-UP →
RETENTION INTERVENTION → PRODUCT USAGE → PAYMENT → BUDDY → POST-CONVERSION`

| Stage | Canonical source | Key/table | Writer | Reader/UI | State |
|---|---|---|---|---|---|
| Lead (entry) | The free roster itself + `student_engagement.sales_ready` | `profiles.id` | cron `sales-ready` (streak≥3 ∨ mock_opened+first_log ∨ day-5) | `/admin/sales-queue`, `buildCallQueue` | **FACT: live.** 443 flagged. A "lead" only materializes as a `lead_outreach` row on first claim/assignment |
| Lead (orphan pools) | `cat_test_leads` (public CAT quiz — no consumer reads it); `student_crm` (stalled profiles-split, dual-write, zero readers) | — | quiz route; trigger | none | **FACT: both orphaned.** Founder finish/retire decisions pending (§18) |
| Queue | `src/lib/call-queue.ts` `buildCallQueue()` — THE one queue (guard: `sales-clock.guard.test.ts`) | derived, CAP=60/day | — | `/sales` (rep frame), `/admin/sales` (founder frame) | **FACT: built, conversion-oriented.** Ordering: callback → retry → follow-up → fresh-by-convScore |
| Assignment | `lead_outreach.owner_id` (uuid → `profiles.id`) | `student_id` (unique) | atomic `claim_lead` RPC; `/api/admin/distribute-leads`; `/api/admin/reassign-lead` | Tower L3 assign panel | **FACT: built (PR #99), manual-only, 0 rows** |
| Call | No telephony. Rep taps `tel:`/`wa.me`; Expedify (AI caller "Riya") outbound is **hard-disabled** (`OUTBOUND_DISABLED = true`, founder 12 Aug) | — | — | call deck | **FACT.** Every human call is untracked by any system — see provenance row |
| Disposition | `src/lib/sales-disposition.ts` — vocabulary + cadence, mirrored by DB CHECKs | `sales_activity` (+`lead_outreach.status`) | `POST /api/sales/log` (uuid-validated, real-student-checked, note-mandatory, atomic claim) | QuickLog on rep student page | **FACT: built, guard-tested** |
| Follow-up | `sales_followup` (promise history) + `lead_outreach.next_action_at` (the one cadence clock) | bigint id | `scheduleFollowup`/`completeDueFollowups` inside `/api/sales/log` | Tower, quality panel | **FACT: built. No sweep cron — overdue work surfaces only when the founder opens the Tower** (§5) |
| Retention intervention | **Does not exist as a sales lane.** The signals exist (`momentum.ts` bands, `mission-queue.ts` silence buckets, `student_dna.churn_risk`) but the queue never uses them | — | — | — | **FACT: the biggest product gap vs. your Job #1** (§14) |
| Product usage | `daily_reports` (log), `routine_task_completions` (the tick IS the log), `streak_data`, `topic_coverage`, `mock_debriefs`, `topic_evidence`, `student_events` | per-student | student actions, server-write-only | Home, admin | **FACT: rich, guard-locked, canonical registry in `src/lib/facts/canonical.ts`** |
| Payment | `student_payments` ledger + `profiles.is_premium`; **WON = a paid ledger row, never the typed disposition** (`sales-won.guard.test.ts`) | payment id | Razorpay webhook, server-verified only | Tower, rep "Won" filter | **FACT: hardened. No CRM/admin route may flip premium (TRUST-OS)** |
| Buddy | `profiles.buddy_id` via `/api/admin/assign-buddy`; interest heat in `src/lib/os/buddy-interest.ts` | — | admin | buddy pages | **FACT: live** |
| Post-conversion | `session_credits`, 4 unconsolidated session tables (known debt, PRODUCT-ARCHITECTURE-CONTRACT §3) | — | — | — | **FACT: works; consolidation is P5 of the product track, not this workstream** |

**INFERENCE:** the pipeline's weakest links are the two ends: entry (no
automatic assignment — leads sit in a shared pool until a human moves them) and
the retention loop (no lane, no outcome measurement). The middle (disposition,
follow-up, audit, authz) is the strongest part of the system.

---

## 3. Current capabilities matrix

| Capability | Exists? | Canonical source | Reusable? | Notes |
|---|---|---|---|---|
| Student profile | ✅ | `profiles` (god-table — split planned, stalled) | Yes | KNOWLEDGE §9 risk 6 |
| Daily logs / study time | ✅ | `daily_reports` + `routine_task_completions`; hours via `study-credit.ts` | Yes | Guard-locked ("tick IS the log") |
| Streak / momentum | ✅ | `streak_data`; `momentum.ts` (bands champion→rescue) | Yes | |
| Topic coverage + gaps | ✅ | `topic_coverage`; weakest section = `section-weakness.ts` (+ mock override `mock-informed-focus.ts`) | Yes | Two-authority nuance — any new reader must use both |
| Mock performance | ✅ | `mock_debriefs`; Evidence Layer `evidence/mock-evidence.ts` (fact/inference/unknown contract) | Yes | **Not shown to reps today** — §6 gap |
| Diagnostics / weakness | ✅ | `topic_evidence`, `performance-engine.ts`, DILR Radar (`challenge.ts`) | Yes | Evidence-backed only; L1 law: UNKNOWN over a precise lie |
| Buddy interest / intent | ✅ | `os/buddy-interest.ts` heat + `student_engagement` counters + `wants_mentor` | Yes | Already feeds rep convScore |
| Payment / subscription | ✅ | `student_payments`, `is_premium`, `session_credits` | Yes | Server-write-only, price authority guard-tested |
| Lead status / disposition | ✅ | `sales-disposition.ts` (7 statuses, code=DB CHECK) | Yes | **No hot/warm/cold disposition exists** — see §9 |
| Call history | ✅ | `sales_activity` (provenance-typed, actor FK) | Yes | 0 rows — no history yet |
| Salesperson ownership | ✅ | `lead_outreach.owner_id`, atomic `claim_lead` | Yes | |
| Remarks | ✅ | mandatory note on connected outcomes in `/api/sales/log` | Yes | Free text on the activity row |
| HOT/WARM/COLD | ⚠️ Partial | computed heat **tier** (`call-queue.ts` convScore); not rep-declarable | Extend | Founder decision F6, §9 |
| Callbacks / follow-ups | ✅ | `sales_followup` + `next_action_at` | Yes | Needs sweep cron |
| WhatsApp | ⚠️ Deep-link only | `wa-messages.ts` copy bank + wa.me links; **no API, no automated send** | Yes as-is | Guard: "2 messages a day" group promise |
| Push nudges from sales | ❌ | No sales→`dispatch()` path exists; budgets are constitution-level | — | DO NOT BUILD in Phase 1 (§26) |
| Conversion tracking | ✅ | ledger-derived WON; per-rep rate suppressed < 30 paid | Yes | Honest by construction |
| Retention tracking (post-contact) | ❌ | Signals exist; **no contact→outcome join anywhere** | Build (§12) | The MIS centerpiece |
| Student 360 timeline | ⚠️ Partial | `timeline_events` (curated) + `student_events` (raw, ~90 event names, **no TTL**) + admin `student-360.ts` synthesis | Extend | Three timeline paths — §11 |
| Rep reporting | ✅ | `/sales/summary` | Yes | Price-copy bug (§5) |
| Founder MIS | ✅ Core | Control Tower (`sales-control-tower.ts`) — every metric `{value, evidence}` | Extend | Missing: capacity, retention outcomes |
| Capacity / bandwidth | ❌ **Nothing** | — | Build (§15) | The one large new build |

---

## 4. Current gaps (ranked by how much they block your two hires)

1. **No auto-assignment / capacity model** — every lead move is founder-manual. (§15)
2. **No retention lane in the queue** — the queue optimizes conversion; your Job #1 is retention. (§14)
3. **No contact→outcome measurement** — "did the call bring the student back?" is unanswerable. (§12)
4. **No follow-up/SLA sweep** — an overdue promise is invisible until the founder opens the Tower. (§5)
5. **Rep student view lacks**: mock scores, day-by-day study timeline, follow-up history, structured observations. (§6–7)
6. **PR #99 unmerged** — none of the above foundation is deployed. Gate on everything.

## 5. Technical debt & operational repairs (small, do these regardless)

All **FACT**, found in this research pass:

- **Two prices on two rep surfaces:** `/sales/summary` hard-codes "Rs 999 per
  Exam Buddy" while the sales script sells the ₹299 session (imported from
  `SESSION_PRICE_PAISE`, guard-tested). The summary page must import, not
  hard-code. A rep quoting ₹999 against a ₹299 checkout is a trust incident
  waiting to happen (TRUST-OS §2.3).
- **`dnd` vocabulary drift:** `call-queue.ts` suppresses status `dnd`, which is
  not in `LEAD_STATUSES` or the DB CHECK — dead suppression today, a real
  do-not-disturb status is missing. Add `dnd` to the vocabulary properly (a
  student who says "stop calling me" must be one tap, and permanent).
- **No follow-up sweep cron:** `sales_followup` overdue rows and stale leads
  have no automated surfacing. Register a daily sweep that emits **Exceptions
  (`src/lib/os/exception.ts`, `owner: 'sales'`)** — not a new dashboard
  (SCALE-CONTRACT rule).
- **Purge cron unregistered** in `vercel.json` (known, deliberate — PR #99 §9).
- **`student_events` has no retention/TTL policy** — fine at 800 students,
  a real cost at 100k. Decide a policy before Phase 3, not now.
- **Risk-scoring proliferation:** momentum bands, `urgency-score.ts`,
  `student_dna.churn_risk`, `os/student-priority.ts`, and `convScore` are five
  scorers of one concept. Do not add a sixth — §14 declares which one the rep
  surface uses and documents the boundary.

---

## 6. Student 360 — design

**Principle: extend `getSalesConversionView()` (`src/lib/sales-conversion.ts`)
— the authz-scoped rep view that already exists — never a new page fetching
tables directly.** The admin has its own 360 (`student-360.ts`); merging the two
is a Phase-3 entity-graph job, not now (different authorization frames).

What the rep sees, by section — ✅ = already rendered today, ➕ = add:

**A. Identity** — ✅ name, phone, momentum, lead status, premium/buddy banner.
➕ signup date + days-on-app, source (`UNKNOWN` for most today — acquisition
attribution is Growth-OS work, don't fake it), owning rep.

**B. Study behaviour** — ✅ activeDays14, weakest/strongest section. ➕ **the
14-day study strip**: one row of day cells (logged / half / blank) from
`daily_reports` + `routine_task_completions` — the single highest-value add for
a retention call ("I can see you studied 6 days straight and stopped Tuesday —
what happened Tuesday?"). ➕ streak + last-log date, hours last 7d via
`study-credit.ts`.

**C. Preparation** — ✅ per-section coverage %, top untouched high-weight
topics. ➕ latest mock (`mock_debriefs`: VARC/DILR/QA/overall %ile + taken_on)
and the Evidence-Layer verdict where present, rendered with its own
fact/inference/unknown label. Self-reported weaknesses (onboarding matrix)
shown as SELF-REPORTED, never merged with evidence.

**D. Engagement** — ✅ momentum band, buddy-intent signals. ➕ last_seen_at,
going-cold flag (the §14 lane reason, so the rep sees WHY this student
surfaced), push-reachable (can this student even be nudged in-app).

**E. Commercial** — ✅ objection playbook, ₹299 pitch, recommended buddy.
➕ paid/not-paid status only. **RECOMMENDATION: reps see payment *status*,
never amounts/history** — a rep needs "already paid, stop selling" (the banner
does this), not the ledger. Founder decision F4.

**F. Sales intelligence (CRM truth)** — ✅ disposition chip, call history
(last 20), QuickLog. ➕ open/completed follow-up list (`sales_followup` —
built, unrendered), rep-declared temperature if F6 approves, structured
observation capture (§9).

## 7. Product truth vs CRM truth vs salesperson observation

The three-layer boundary, enforced by write paths that already exist:

| Layer | Examples | Written by | May a rep write it? |
|---|---|---|---|
| **PRODUCT FACT** | logs, streak, coverage, mock scores, payments, last_seen | student actions + server-only routes (write-revoked to clients; guard-tested) | **Never.** Structurally impossible today — keep it so |
| **DERIVED SIGNAL** | momentum band, convScore, buddy heat, churn_risk | pure functions over product facts | Never — recomputed, not stored opinion |
| **CRM TRUTH** | owner, disposition, next_action_at, follow-ups | rep via `/api/sales/log` (validated, audited) | Yes — this IS their job |
| **SALESPERSON OBSERVATION** | "says VARC feels weak", objection, best time to call, temperature | rep, `provenance: 'self_reported'` | Yes — displayed with its provenance label, **never merged into product metrics** |

This is the founder's own provenance rule already in the schema
(`sales_activity.provenance` CHECK). The design extends it, changes nothing.

## 8. Chronological student timeline

**FACT:** three timeline paths exist — raw `student_events` (~90 event types,
indexed `(user_id, created_at desc)`), curated `timeline_events`
(`os/timeline.ts`, closed kind-set, bars noise like app_open), and the admin
360's hand-synthesis. **RECOMMENDATION:** the rep timeline = **curated
`timeline_events` + CRM rows (`sales_activity`, `sales_followup`) merged at
render time, windowed (last 30 days, paged)** — never the raw event firehose
(SCALE-CONTRACT: don't load full history per dashboard request). Every entry
carries: timestamp, type, source table, actor, and its layer label from §7.
Riya/Expedify calls appear from `expedify_events`/`call_feedback` as
VENDOR-REPORTED. **UNKNOWN:** no call transcripts exist anywhere — only the
structured `call_feedback` summary. Do not promise reps transcripts.

## 9. Salesperson-writable information

**FACT:** the canonical disposition vocabulary is
`not_contacted / called / interested / follow_up / converted / not_interested /
no_answer` (+ cadence in `planDisposition`). There is **no hot/warm/cold
status** — hot/warm/cool exists only as a *computed* queue tier.

**RECOMMENDATION (founder decision F6):** do not replace the vocabulary — it is
guard-tested and mirrored in DB CHECKs. Add ONE rep-declared field:
`lead_outreach.rep_temperature ∈ hot|warm|cold|null`, explicitly a
SALESPERSON OBSERVATION (self-reported), shown side-by-side with the computed
tier and **never summed with it in any founder metric** — the same
claimed-vs-confirmed discipline the Tower already applies to calls. A rep
saying "hot" is a belief; the system saying "hot" is a signal; the founder sees
both and learns which rep's beliefs are calibrated.

Also writable: structured observations (objection code from a short list +
free-text note — a picklist makes MIS aggregation honest; free text alone
doesn't aggregate), best-call-time, and follow-ups (exists).

## 10. Identity & ownership

**FACT:** already resolved this month, guard-tested (`sales-authz.guard.test.ts`):
identity = `profiles.id` everywhere; email/phone are display attributes;
ownership = `lead_outreach.owner_id` uuid FK; actorship =
`sales_activity.actor_id`; unresolvable ⇒ deny; all checks server-side; RLS
deny-by-default on every sales table (service-role only). Nothing to design —
the capacity engine (§15) simply keys on the same `profiles.id`.

## 11. Activity & timeline data model

No new event infrastructure. New rows needed by this design, all additive:

- `sales_rep_config` — the capacity model (§15). One row per rep.
- `lead_outreach.rep_temperature` (if F6 approved) + `assigned_at timestamptz`
  + `first_contact_sla_due timestamptz` (set at assignment by the engine).
- `sales_activity.activity_type` gains nothing — `'assigned'` already exists
  and is how auto-assignments become visible history (`system_generated`).
- Capacity config changes audit into `admin_audit_log` (existing action
  pattern) — capacity history without a new table.

## 12. Retention intelligence (measurement design)

The contact→outcome join, computed on demand from existing tables (no new
storage):

- For every first `connected` contact on student S at time T:
  **next-day log** = `daily_reports` row at date(T)+1; **Day-3 / Day-7
  continuation** = ≥1 log in (T, T+3] / (T, T+7]; **recovery** = momentum band
  at T ∈ {at_risk, rescue} AND band at T+7 better.
- Baseline: same rates for momentum-matched uncontacted students in the same
  window — the comparison the founder reads. **Never labeled causal**; with a
  2-rep team and no randomization it is correlation, and the doc's MIS renders
  it as such (the same discipline the Daily Pick retention analysis used).
- Every rate drills to the exact student list behind it (SCALE-CONTRACT §4:
  count == list).

## 13. Conversion intelligence

**FACT:** already honest by construction: WON = paid ledger rows; per-rep
conversion rate suppressed below 30 paid customers (today: 5 total, so rates
render UNAVAILABLE); pipeline = interested × price. **Add (Phase 2):** payment
funnel join — of students a rep contacted, how many opened checkout
(`payment_checkout_opened`, instrumented in PR #99) → paid. **Attribution (§
next):** owner-at-payment + meaningful-contact window.

## 14. Salesperson priority engine (retention-first queue)

**FACT:** `buildCallQueue` is deterministic and explainable already (DueReason +
convScore), but its "fresh" lane ranks purely by conversion likelihood.
**RECOMMENDATION:** extend THE existing queue (never a second one — the
`sales-clock` guard exists precisely to stop that) with explainable retention
lanes, reusing scorers that already exist (`momentum.ts` bands +
`mission-queue.ts` silence buckets — no sixth risk scorer):

Priority order (each card shows its lane as the WHY):
1. **Callback promised & due** (exists — a promise beats everything)
2. **Overdue follow-up** (exists via retry/followup)
3. **Going cold** — was-active-now-silent ≥3 days (mission-queue bucket) or
   momentum fell to at_risk/rescue with prior engagement
4. **Broken streak** — streak ≥5 ended within last 48h (streak_data)
5. **New & never logged** — signed up 24–72h ago, `sales_ready` or reachable,
   0 logs (the activation call; with 340 signups/week this is the volume lane)
6. **Hot conversion** — buddy-intent/checkout signals (exists as convScore)

Deterministic, config-driven thresholds in `scale-config.ts` (SCALE-CONTRACT
§7), fully explainable ("Priya sees WHY"), no opaque AI score — the founder
prompt's §20 requirement is met by construction because every lane is a
predicate over named tables.

## 15. Auto lead assignment + capacity model (the new build)

**FACT:** nothing exists. Distribution is founder-manual by explicit earlier
founder instruction ("no opaque automatic distribution" — encoded in
`distribute-leads/route.ts` comments). The new mandate asks for automatic
assignment. **These reconcile:** what was forbidden was *opaque* allocation the
founder couldn't inspect. The engine below is deterministic, previewable,
fully audited, and founder-overridable — automation without opacity.

### A. Capacity model — `sales_rep_config` (one row per rep, config not code)

```
rep_id uuid PK → profiles.id      -- same canonical identity
active boolean                     -- master switch (leave = flip off)
employment_type text               -- 'full_time' | 'part_time' (informational)
work_start_ist / work_end_ist time -- working window
work_days int[]                    -- e.g. {1..6}
max_open_leads int                 -- live open-work ceiling (e.g. FT 40)
max_new_per_day int                -- daily intake ceiling (e.g. FT 15)
capacity_override int, override_until timestamptz  -- temporary, expiring
updated_by uuid, updated_at        -- + admin_audit_log row per change
```

Both ceilings, per the prompt's §16 distinction: **open-work capacity** (how
many live leads a rep can hold) and **daily intake capacity** (how many new
ones per day). FT/PT difference is just different numbers — nothing hard-coded
to two people; a third hire is an INSERT.

- `open(rep)` = owned `lead_outreach` rows with status ∉ {converted, not_interested, dnd}
- `assignable_now(rep)` = 0 if !active or outside working window, else
  `min(max_open_leads − open, max_new_per_day − assigned_today)`

### B. Lead scoring / priority — reuse §14's lanes. The pool = `sales_ready`
students with a usable phone, not test accounts, `owner_id IS NULL`, ordered by
lane priority then recency. No new scorer.

### C. Assignment algorithm (deterministic, idempotent)
Runs as a cron (every 30 min inside any rep's working window) + immediately on
a HOT signal:
1. Compute `assignable_now` per active rep.
2. Take the top `Σ assignable_now` pool leads.
3. Allocate **proportionally to assignable capacity** (largest-remainder — 
   deterministic, no round-robin): FT 12 slots free / PT 3 → 4:1 split.
4. Write each: `UPDATE lead_outreach SET owner_id=… WHERE student_id=… AND
   owner_id IS NULL` (or insert-claim via the existing atomic pattern) — a
   concurrent rep claim always wins; the engine skips and moves on.
5. Per assignment: `sales_activity` row (`activity_type:'assigned'`,
   `provenance:'system_generated'`, note = the lane + capacity numbers used) +
   set `assigned_at`, `first_contact_sla_due`.
6. One `admin_audit_log` row per run with the full allocation and the capacity
   snapshot — the founder can replay WHY every lead went where it went.

**K. Idempotency/races:** re-running assigns nothing new (owner_id no longer
NULL); two concurrent runs converge (guarded WHERE clause); network death
mid-run leaves a smaller, valid allocation, next run completes it. Cron retry
is safe by the same property.

### D–I. Operating rules
- **D. Rebalancing:** never automatic. The engine only fills; moving owned
  leads stays founder-approved via existing `reassign-lead` (a 2-person team
  does not need auto-rebalancing; revisit at 5+).
- **E. Everyone at capacity:** leads stay pooled; an Exception
  (`owner:'sales'`, severity by pool size) tells the founder "N leads waiting,
  0 capacity — raise ceilings or hire." Never silent, never over-assigned.
- **F. Rep offline/inactive:** `active=false` ⇒ zero intake; their open book is
  untouched until the founder reassigns. Their due follow-ups surface as
  Exceptions after 24h.
- **G. HOT lead:** assigned immediately (not next cron tick) to the in-window
  rep with most free capacity; if none in-window, top of next window's queue +
  founder Exception if it's a checkout-abandonment-grade signal.
- **H. SLA miss:** first-touch SLA (default 24 business-hours, config). Missed
  ⇒ Exception naming rep + student. Auto-reassign OFF by default (founder
  decision F2 can change later).
- **I. Auto vs approval:** RECOMMENDATION — **new-lead intake fully automatic**
  (deterministic + audited + kill-switch `active=false` per rep and one global
  flag), **reassignment founder-only**. This honors both founder instructions.
- **L. Manual override:** distribute-leads and reassign-lead panels remain —
  manual acts always win; the engine only touches unowned leads.
- **M. Capacity history:** audit rows (§11).

### Founder capacity view (Tower, new panel)
Per rep: configured ceilings, open now, available now, utilization %, assigned
today, uncontacted, overdue follow-ups, avg first-touch time, SLA breaches —
each number drilling to its exact student list. Directly answers **"Can I
safely send 20 more leads today, and to whom?"**: the panel shows
`Σ assignable_now` and the per-rep split the engine would produce.

### Evolution 2 → 5 → 20 → 100 reps
Same engine, config rows scale: at 5, add per-rep working-window diversity (already
modeled); at 20, add `team_id` to config + allocate two-stage (team then rep)
and turn on SLA-based auto-reassign within a team; at 100, partition the pool
query by team/region and materialize the workload rollup. The algorithm never
changes — only the pool partitioning. **INFERENCE:** nothing in the 2-rep
design needs rework before ~20 reps; SCALE-CONTRACT forbids building the
100-rep machinery now.

## 16. Permissions & security

**FACT (built, guard-tested):** reps reach owned + unclaimed leads only; admin
by role; all server-side; deny on unresolvable; no existence oracle on the
student page; sales tables RLS-deny-by-default; rep writes limited to CRM truth
via one validated route. **Additions:** `sales_rep_config` is admin-write,
rep-read-own; the engine runs service-role in crons; reps never see payment
amounts (F4) or other reps' books (already enforced).
**Binding constitution rules (from MISSION/TRUST-OS — these bound the design):**
no CRM path may flip premium; scripts quote the checkout's own price constant;
no fear-framing ("score falling → buy" is forbidden; evidence → relevance →
option); student data is seen by reps under the licence of helping the student
who generated it, and never leaves the system.

## 17. Scaling (800 → 10k → 100k students)

- **FACT:** the needed indexes exist (`lead_outreach_owner_id_idx`, activity
  student/created and actor indexes, `sales_followup` partial open-due indexes,
  `student_events` composite indexes).
- Queue build is roster-bounded (CAP 60/day) — at 10k the pool query needs the
  same chunked-read discipline already enforced by the population-read guard;
  at 100k, materialize per-rep workload counts (a view, only when measured —
  SCALE-CONTRACT §6).
- Timeline: windowed + paged from day one (§8) — never full-history loads.
- Capacity math is O(reps), trivial at any scale.
- MIS retention joins are windowed per-cohort; if they get slow at 10k,
  precompute a daily rollup then — not now.
- `student_events` TTL decision due before 100k (§5).

## 18. Reuse / consolidate / deprecate

| Verdict | Item |
|---|---|
| **KEEP (reuse as-is)** | call-queue (extend lanes), sales-disposition, sales-authz, sales-followup, sales-portfolio, Tower, quality panel, claim_lead, distribute/reassign routes, Exception primitive, momentum + mission-queue as the retention authorities |
| **REPAIR** | ₹999/₹299 divergence; `dnd` drift; follow-up sweep cron; purge cron registration |
| **CONSOLIDATE (document now, merge later)** | five risk scorers → declare rep-facing authority (momentum + lanes); three timeline paths → curated+CRM merge (§8); two Student-360 assemblies → entity-graph, Phase 3 |
| **DEPRECATE (founder decision)** | `student_crm` (finish the split or drop trigger+table — it has zero readers); `cat_test_leads` (merge into the pool as a lane or retire the quiz writer) |
| **DO NOT CREATE** | second queue, second CRM, second disposition vocabulary, second audit system, opaque lead score |

## 19. Information architecture (smallest useful navigation)

**Rep (exists: Calls / My leads / My summary):** keep three tabs. The retention
lanes live inside Calls (lane chips, not new pages). Follow-ups render inside
My leads. No separate "at-risk" page — the queue IS the at-risk surface.
**Founder:** Tower stays the landing (Today / Team / **Capacity (new)** /
Distribution / Quality). Everything else drills from it. No new top-level
pages. (SCALE-CONTRACT: one Exception stream, not new dashboards.)

## 20. Workflows

**Rep day:** login → Calls (lanes pre-ordered, each card says WHY) → open
student → 360 (study strip, mock, coverage, history) → tel:/wa.me tap →
QuickLog (outcome + note + optional callback/temperature) → next card. The
system answers "who next and why" in zero clicks — the deck is the answer.
End of day: My summary (already exists).
**Founder day:** Tower Today → Exceptions (overdue, SLA, capacity) → drill to
rep → drill to student → timeline → interaction. Weekly: MIS (§21).

## 21. MIS reporting cadence

- **Real-time:** Tower (exists) + capacity panel + Exceptions.
- **Daily (rep):** /sales/summary (exists); add yesterday's retention deltas.
- **Weekly (founder):** one email digest via existing `sendAdminAlert` infra:
  per-rep balanced scorecard — assigned, contacted (self-rep) vs confirmed,
  follow-up completion %, SLA %, Day-1/3/7 post-contact log rates vs baseline,
  paid (observed), revenue. **Never ranked by call count alone** — the
  scorecard weighs outcome columns, and self-reported columns are labeled.
- **Monthly:** cohort view — contacted vs uncontacted retention curves,
  conversion by lane. Phase 2–3.

## 22. IF I WERE THE FOUNDER, I would build it this way

I would merge PR #99 this week and watch one real payment before anything else —
every design in this document stands on unmerged code, and that is the single
point of failure. I would then spend one week on §5 repairs + §14 lanes +
§15 engine and put the hires on the system while it is empty, because the
first 100 activity rows will teach us more than any further design. I would
show reps everything about a student's *study* and nothing about *money*
except paid/not-paid. I would protect from manual editing: everything in the
PRODUCT FACT layer (already write-revoked) and the payment ledger — a CRM that
can touch money becomes a fraud surface. I would automate intake and keep
reassignment in my own hands until the team is 5+. I would make one-click: the
call (tel:), the log (QuickLog), and the WhatsApp opener (composer templates).
I would inspect daily: the Exception stream and uncontacted count; weekly: the
scorecard's outcome columns, and specifically the gap between each rep's
claimed contacts and vendor/product-confirmed reality — that gap is the
integrity metric. I would distinguish outcomes from volume by refusing to
rank reps on calls at all: the ranking columns are Day-3 continuation and
paid conversions, calls are context. And for 800 students I would build
exactly what is in Phase 1 and nothing from Phase 3, because SCALE-CONTRACT
is right: the 10k rebuild you fear is caused by the speculative machinery you
build at 800, not prevented by it.

## 23. IF I WERE THE SALESPERSON, this is what I would want

At 10:00 I open Calls and the deck already knows my morning: two callbacks I
promised (top, with my own note from yesterday), one student whose 9-day streak
broke Sunday, three who went silent after a strong week, and eight new signups
who never logged. Each card tells me why it's here and shows momentum, so I
never open a student cold. I tap the card: the study strip shows me exactly
which day she stopped; the mock line tells me she took one 3 weeks ago and DILR
was the weak section; the playbook gives me the ₹299 answer if she asks the
price. I tap call — one tap, my own phone. She doesn't pick up: one tap
`no_answer`, the system schedules the retry per the cadence, next card slides
in. She picks up and promises tomorrow 6pm: I tap callback, pick 6pm, type one
line. I never fill a form with ten fields, never copy a phone number, never
decide who's next, and never discover at 9pm that I forgot a promise — the
promise IS the queue. At day end my summary shows what I did and what came of
it, and nothing asks me to re-type anywhere what I already logged once.
Unnecessary clicks to remove from today's build: the summary's price is wrong
(erodes my trust in every other number), follow-ups aren't visible on my leads
list yet, and I can't mark "stop calling this student" (`dnd`).

## 24. Product-manager risk register

- **Over-pressure / fear-selling** — highest mission risk. Mitigation: script
  honesty guard (exists), no fear-framing rule surfaced in the playbook UI,
  founder reads notes weekly. A retention call that feels like a collections
  call churns the student it meant to save.
- **Metric gaming** — self-reported contacts inflate. Mitigation already
  structural: claimed vs confirmed never summed; WON is ledger-only;
  temperature is labeled belief. Add: follow-up completion requires the
  discharging activity row (exists in schema).
- **Misleading weakness claims** — a rep telling a student "your VARC is weak"
  from thin data violates L1. Mitigation: rep view renders the Evidence Layer's
  own fact/inference/unknown labels; UNKNOWN renders as UNKNOWN.
- **Privacy** — reps see study behaviour. Licence: helping that student;
  boundary: no amounts, no exports (the CSV export stays admin-only), access
  audited, owned+unclaimed only.
- **Notification spam via humans** — WhatsApp is a human tap today; keep it so.
  No sales-triggered push in Phase 1; the Notification-OS budget exists
  precisely to prevent "sales found a second channel."
- **Attribution error** — with 2 reps and no randomization, every outcome
  number is correlation. The MIS says so on the surface, not in a footnote.
- **Capacity misconfiguration** — a typo'd ceiling of 400 floods a rep.
  Mitigation: sane bounds in validation (e.g. ≤100/open, ≤50/day), audit row,
  preview of next run's allocation on the capacity panel.
- **Stale intelligence** — a 360 rendered from a cached/derived value that
  drifted. Mitigation: the view reads canonical tables live; derived values
  carry their computed-at basis (momentum already does).

## 25. Data model — every proposed change and why

| Change | Why necessary | Why existing can't | Canonical? | Scale | Failure behaviour |
|---|---|---|---|---|---|
| `sales_rep_config` table | Capacity must be data, not code (prompt §16; SCALE-CONTRACT §7) | Nothing stores per-rep operational config | Yes — THE capacity source | O(reps) rows | Engine treats missing row as `active=false` (fail closed: no intake) |
| `lead_outreach.assigned_at`, `first_contact_sla_due` | SLA is unmeasurable without assignment time | `updated_at` is overwritten by every touch | Yes | trivial | NULL on legacy rows = no SLA claim (UNKNOWN over lie) |
| `lead_outreach.rep_temperature` (if F6) | Founder asked for rep-declared heat | Computed tier is a different (system) claim | Observation layer | trivial | NULL = undeclared |
| `dnd` in `LEAD_STATUSES` + CHECK | A permanent stop-calling state | Suppression references it but can't be set | Yes | trivial | Closed status — engine and queue both exclude |
| Assignment/sweep crons | Intake + SLA/overdue surfacing | No cron touches CRM tables today | Reuse Exception primitive | bounded queries | Cron failure = visible in cron_runs; re-run idempotent |
| Tower capacity panel + MIS columns | The founder questions in the prompt | Tower has no capacity/retention section | Extends Tower | windowed queries | Reads render `unavailable`, never 0 |

No other tables. No new event streams, no new audit system, no new queue.

## 26–28. BUILD NOW / NEXT / NOT · deletions · migration strategy

**BUILD NOW (Phase 1):** PR #99 merge + live payment verification (gate) →
§5 repairs → two rep profiles + `sales_rep_config` → assignment engine v1 +
capacity panel → retention lanes → 360 additions (study strip, mocks,
follow-ups, dnd) → SLA/overdue sweep emitting Exceptions.
**BUILD NEXT (Phase 2):** MIS retention-outcome columns + weekly digest +
attribution + checkout-funnel join + rep WhatsApp composer templates +
temperature calibration view.
**DO NOT BUILD:** second CRM/queue/vocabulary/audit; opaque AI score;
sales-triggered push; auto-reassignment; call recording (nothing captures
audio; nav honestly says `planned`); telephony integration (Expedify outbound
stays disabled per standing founder order; whether the vendor echoes
`external_ref` is still UNKNOWN — the standing external blocker); rep-visible
revenue amounts (pending F4).
**DELETE/CONSOLIDATE:** `student_crm` finish-or-drop (F5); `cat_test_leads`
merge-or-retire (F5); scorer/timeline/360 consolidations per §18 (Phase 3).
**Migration strategy:** everything additive; CRM tables are empty so there is
no data migration at all — the entire "migration" is merging PR #99 and
applying one additive migration. Rollback = revert; nothing depends on new
paths until reps start using them.

**Phase 3 (at ~5 reps / 10k students):** teams, auto-reassign-within-team,
cohort MIS, entity-graph 360 consolidation, `student_events` TTL, rollup
materialization only if measured.

---

## FOUNDER DECISIONS REQUIRED

- **F1 — PR #99:** review + merge + one verified live payment. Everything gates on this.
- **F2 — Assignment autonomy:** recommended: intake automatic (audited, kill-switch), reassignment manual. Approve or change.
- **F3 — Capacity numbers:** FT and PT working hours (IST), max open leads, max new/day, and the first-touch SLA. (Illustrative only: FT 40 open/15 per day, PT 15 open/6 per day, 24h SLA.)
- **F4 — Money visibility for reps:** recommended: paid/not-paid status only, never amounts.
- **F5 — Orphans:** `student_crm` finish or drop; `cat_test_leads` merge into the pool or retire.
- **F6 — Hot/warm/cold:** recommended: rep-declared `rep_temperature` as labeled observation beside the computed tier. Approve or drop.
- **F7 — Who are the two hires' accounts:** names/emails for the two `role='sales'` profiles, and whether "Priya" (existing references) is one of them.
