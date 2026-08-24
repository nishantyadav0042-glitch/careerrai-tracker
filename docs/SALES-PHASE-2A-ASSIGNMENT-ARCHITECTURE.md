# Phase 2A — Capacity & Auto-Assignment Architecture

**24 Aug 2026 · Design document. No application code written in this pass.**
Labels: **FACT** (verified in code or production this session), **FINDING**
(defect/debt surfaced), **RECOMMENDATION**, **CHALLENGE** (where I disagree
with the brief), **UNKNOWN** (not knowable from current evidence).

Built on: PR #99 (merged, live), Phase 1 `c0ff0f1`, Phase 1.5 `d7c818f`.

---

## 0. The one-paragraph verdict

The assignment engine itself is **small** — a config table, two columns, one
cron, one guarded write. What this design pass actually found is that the
riskiest part of Phase 2 is **not** the engine: it is two structural
assumptions underneath it that break quietly. First, "max open students" as
written **permanently saturates a rep** in a retention business, because a
retention book never closes. Second, the existing queue loads the **entire
student roster on every build**, which is the real 10,000-student wall and
sits in code we already shipped, not in anything new. Both are addressed
below. The engine is the easy part; these two are the architecture.

---

## 1. Complete new-lead lifecycle

```
SIGNUP (profiles row created)
   │
   ├─► NOT a lead yet.  ← CHALLENGE 1 (§21): most students never become leads
   │
   ▼
ELIGIBILITY  (cron sales-ready, 09:30 IST — EXISTS today)
   ·  free student (not premium, no buddy)      ·  not test/demo account
   ·  streak≥3 OR mock_opened+first_log OR day-5 fallback
   ·  ADD: has a usable phone (41 students do not — calling them is impossible)
   ·  ADD: no dnd, not converted, not not_interested
   │
   ▼
LEAD MATERIALISES  (lead_outreach row, owner_id NULL)  ← the shared pool
   │
   ▼
PRIORITISATION  (classifyLane — EXISTS, Phase 1, guard-locked)
   callback ▸ retry ▸ follow-up ▸ going-cold ▸ broken-streak ▸
   never-logged ▸ conversion ▸ fresh
   │                                    ↑ NO second priority engine is built
   ▼
CAPACITY CHECK  (sales_rep_config — NEW)
   assignable_now(rep) = active AND in-window
                         ? min(max_open − open_now, max_new_today − new_today)
                         : 0
   │
   ├── Σ assignable_now = 0 ──► lead STAYS POOLED + Exception(owner:'sales')
   │                            "N leads waiting, 0 capacity" (§22)
   ▼
DETERMINISTIC ASSIGNMENT  (largest-remainder, proportional to free capacity)
   guarded write: UPDATE … WHERE student_id=$1 AND owner_id IS NULL
   │
   ├─► sales_activity row: activity_type='assigned',
   │     provenance='system_generated', note = lane + capacity arithmetic
   ├─► lead_outreach.assigned_at = now(), first_contact_sla_due = now()+SLA
   └─► admin_audit_log: one row per RUN with the full allocation + snapshot
   │
   ▼
SLA CLOCK RUNNING   ── breach ──► Exception(owner:'sales', names rep+student)
   │                              NO auto-reassign by default (§25, F-2)
   ▼
REP SEES LEAD  (their queue — EXISTS; card carries lane/why/action)
   │
   ▼
FIRST CALL → DISPOSITION  (POST /api/sales/log — EXISTS, validated, audited)
   interested │ callback │ converted │ not_interested │ no_answer │ dnd
   │
   ├─► sales_activity (provenance='self_reported')  ← a CLAIM, always
   ├─► lead_outreach.status + next_action_at (one clock)
   └─► sales_followup: promise created / discharged
   │
   ▼
FOLLOW-UP CADENCE  (planDisposition — EXISTS, guard-tested)
   │
   ▼
RETENTION OUTCOME  (Phase 4, computed — NOT stored)
   did the student log on D+1 / D+3 / D+7? did their band recover?
   measured against a momentum-matched uncontacted baseline
   │
   ▼
COMMERCIAL OUTCOME  (student_payments — OBSERVED, webhook-only)
   WON is a paid ledger row. Never a typed disposition.
```

Every transition above is either **EXISTS** (built and tested) or explicitly
marked NEW/ADD. The only genuinely new machinery is the capacity check and the
assignment write.

---

## 2. CHALLENGE 1 — "max open students" permanently saturates a rep

**This is the most important finding in this document.**

In a normal sales CRM, a lead *leaves* the book: it converts or it dies. Open
capacity therefore recycles. **CareerRai's rep does not work a pipeline — they
work a relationship.** A student who is contacted, comes back, and studies
happily is still a student, still owned, and still not converted.

Under the model as briefed (`open = owned AND status not in
{converted, not_interested, dnd}`), a full-time rep at 50 open students who
retains all of them successfully reaches capacity **and never receives another
lead again — forever.** Doing their job perfectly is what locks them out. That
is a design flaw, not a tuning problem, and no capacity number fixes it.

**RECOMMENDATION — separate two things the brief merges into one:**

| Concept | Meaning | Counts against capacity? |
|---|---|---|
| **Owned relationship** | `lead_outreach.owner_id = rep`. Sticky. This student is *theirs*; their history, their notes. | **No** |
| **Active working set** | Owned **and** carrying live work: never contacted, OR an open follow-up, OR currently in a retention/conversion lane. | **Yes** |

`open_now(rep)` counts the **active working set**, not the owned book. A
student who is healthy and logging goes *dormant* — still owned, still
visible in "my leads", but no longer consuming a slot. If they go cold three
weeks later, `classifyLane` puts them back in the working set automatically,
and they return to their existing owner (relationship preserved, §9).

This makes capacity mean the honest thing: **"how much live work can this
person hold right now"**, which is what the founder capacity panel is
supposed to answer. It is computable from tables that already exist — no new
state.

---

## 3. CHALLENGE 2 — the real scaling wall is in code we already shipped

**FACT (verified this session):** `getRosterMomentum` → `loadSignals`
(`src/lib/momentum.ts:103-113`) issues **five unbounded reads on every call**:
all student `profiles`, all `daily_reports` for 14 days, **the entire
`streak_data` table**, all `notifications` pushed in 7 days, and all
`student_engagement`. No `.range()`, no pagination — grep confirms neither
exists anywhere in `src/lib` except the id-chunking helper.

`buildCallQueue` calls it on **every rep page load and every admin queue
view.** Today: 786 roster rows, 5,043 notification rows — fine. At 10,000
students it is a multi-megabyte fan-out per page view; at 100,000 it is not
serviceable. **The assignment engine at 100 reps is trivial next to this.**

**FINDING — UNKNOWN, and I could not close it here:** whether PostgREST caps
these responses. If the data API has a `db-max-rows` limit (commonly 1,000),
the 5,043-row notification read is **already silently truncated today**, and
`pushedRecently`/`openedPushRecently` are already wrong for most students —
which would make momentum scores subtly wrong system-wide, well beyond sales.
I attempted a definitive empirical test (1,500-row probe table on the test
project, `Prefer: count=exact`, read `Content-Range`) and **the environment's
network policy blocked the HTTPS call** (proxy 403 to the Supabase host); the
probe table was removed. The Supabase docs surfaced only the *Logs Explorer's*
1,000-row cap, which is a different subsystem and not authoritative here.

Indirect evidence suggests **uncapped**: `notification-metrics.ts` documents a
precise 111-vs-110 reconciliation built on top of these reads, which would be
unreliable under silent truncation. But indirect evidence is not verification.

**RECOMMENDATION:** close this before Phase 2B with a 60-second test —
one authenticated `GET …/rest/v1/notifications?select=user_id` with
`Prefer: count=exact`, comparing returned rows to the `Content-Range` total.
It is a P0 for momentum correctness if capped, and a scheduled performance
fix if not. **It is not a sales problem, but sales is about to depend on it.**

**Design consequence either way:** the assignment engine must **not** call
`getRosterMomentum`. It reads the pool directly with SQL-side filtering,
ordering and `LIMIT` (§C), so the engine stays O(capacity) rather than
O(students) and does not inherit this wall.

---

## 4. Capacity model — `sales_rep_config` (the only new table)

```
sales_rep_config
  rep_id              uuid  PK → profiles.id        -- same canonical identity
  active              boolean not null default true -- master switch
  employment_type     text                          -- 'full_time' | 'part_time'
                                                    -- LABEL ONLY, never logic
  work_days           int[]  not null                -- ISO 1=Mon … 7=Sun
  work_start_ist      time   not null
  work_end_ist        time   not null
  max_open_leads      int    not null                -- active working set (§2)
  max_new_per_day     int                            -- nullable = unbounded
  first_contact_sla_minutes int not null
  unavailable_until   timestamptz                    -- leave / sick / paused
  capacity_override   int
  override_until      timestamptz                    -- expiring, never sticky
  updated_by          uuid → profiles.id
  updated_at          timestamptz
```

**Why NEW and not an extension of `profiles`:** `profiles` is already the
documented god-table (KNOWLEDGE §9 risk 6) with a stalled split plan; adding
eleven operational columns to it deepens a known problem. This table is
rep-scoped (2 rows today, 100 at scale), has a different lifecycle, and is
admin-write / rep-read-own.

**Derived values (computed, never stored — no cache to go stale):**

```
in_window(rep)   = active AND now_ist.day ∈ work_days
                          AND work_start ≤ now_ist.time < work_end
                          AND (unavailable_until IS NULL OR now > unavailable_until)
open_now(rep)    = |active working set| (§2)
new_today(rep)   = assignments to rep since 00:00 IST
capacity(rep)    = (override_until > now) ? capacity_override : max_open_leads
assignable_now   = in_window ? max(0, min(capacity − open_now,
                                          (max_new_per_day ?? ∞) − new_today))
                             : 0
```

**FT vs PT is nothing but different numbers.** `employment_type` is a label
for the founder's screen; no branch in the engine reads it. A third hire is
one INSERT. Nothing anywhere hard-codes two people.

**CHALLENGE 3 — `max_new_per_day` mostly will not bind.** With 443
sales-ready students and a combined open capacity of perhaps 65, the
open-capacity ceiling binds essentially always; the daily cap only matters
during first-week ramp-up or after a bulk import. Keep it (it is the guard
against dumping 50 leads on someone's day one) but **default it to NULL**, and
have the capacity panel state which ceiling is actually binding — otherwise
the founder tunes a knob that is doing nothing.

---

## 5. Assignment algorithm (deterministic, explainable, idempotent)

**Trigger:** cron every 30 min while any rep is in-window, plus an immediate
run when a lead enters a high-priority lane (§C hot path).

```
1. ELIGIBLE REPS      reps with sales_rep_config.active
2. REMOVE UNAVAILABLE not in_window → out (leave, off-shift, paused)
3. REMOVE FULL        assignable_now = 0 → out
4. IF no reps remain  → stop. Pool untouched. Exception if pool > threshold.
5. POOL               lead_outreach WHERE owner_id IS NULL
                      AND status NOT IN (converted, not_interested, dnd)
                      AND eligible (§1)     ORDER BY lane_rank, age
                      LIMIT Σ assignable_now          ← bounded, never O(N)
6. ALLOCATE           largest-remainder proportional to assignable_now
                      (FT 12 free / PT 3 free → 4:1). Deterministic:
                      same inputs ⇒ same output. No randomness, no RNG,
                      no round-robin pointer to drift.
7. WRITE (per lead)   UPDATE lead_outreach
                        SET owner_id=$rep, assigned_at=now(),
                            first_contact_sla_due=now()+sla,
                            assignment_reason=$explanation
                      WHERE student_id=$id AND owner_id IS NULL   ← the guard
                      0 rows updated ⇒ someone else took it ⇒ skip, continue
8. HISTORY            sales_activity(activity_type='assigned',
                      provenance='system_generated', actor_id=NULL,
                      note=the explanation)
9. AUDIT              admin_audit_log: one row per RUN — full allocation,
                      capacity snapshot, pool size, what was skipped
```

**Every assignment answers "why this rep":**

> Assigned to Priya — active, in window (10:00–19:00 IST), 18 of 50 slots free
> (highest available capacity), SLA 120 min started. Lead class:
> going-cold (studied 5 of the previous 7 days, 0 in the last 3).

That string is stored on the row (`assignment_reason`) and in
`sales_activity.note`, so the founder's MIS can show it months later without
recomputing anything.

**No hidden heuristics.** No ML, no opaque score, no "fairness" fudge factor.
If the allocation looks wrong, the audit row contains every input that
produced it.

---

## 6. Races, idempotency, retries

| Scenario | Behaviour |
|---|---|
| Two engine runs overlap | Guarded `WHERE owner_id IS NULL` — second run updates 0 rows and skips. Converges. |
| Engine vs rep manual claim | Rep's atomic `claim_lead` wins or the engine wins; whoever is second sees 0 rows. **FACT:** `claim_lead` is already a single atomic `INSERT … ON CONFLICT DO UPDATE` (guard-tested), not read-then-write. |
| Two reps claim simultaneously | Already solved pre-Phase-2 (409 on conflict). Unchanged. |
| Cron retry after timeout | Re-running assigns nothing already assigned. Safe by construction. |
| Network death mid-run | Leaves a smaller, valid, fully-audited allocation. Next run completes it. No partial-state repair needed. |
| Duplicate assignment | Structurally impossible: `owner_id IS NULL` is the precondition, and `student_id` is unique in `lead_outreach`. |
| Rep goes unavailable mid-run | Their already-written assignments stand (they own them); no further leads go to them. Due follow-ups surface as Exceptions after 24h (§24). |

**Idempotency key:** the state itself (`owner_id IS NULL`), not a token. This
is stronger than a dedupe key — there is no key to lose, expire, or collide.

---

## 7. Manual founder override

**REUSE — nothing new.** `/api/admin/reassign-lead` and
`/api/admin/distribute-leads` already exist, are audited, and are the only
paths that move ownership. Phase 2 adds:

- pause a rep = `sales_rep_config.active=false` (audited) — the engine stops
  giving them leads; their book is untouched
- change capacity = a config update (audited, bounds-validated)
- release a lead = set `owner_id=NULL` (audited) — it returns to the pool
- **manual always beats the engine**: the engine only ever touches
  `owner_id IS NULL`, so it can never take a lead a human placed

**Audit record for every ownership change:** who, when, why, previous owner,
new owner. `admin_audit_log` already carries exactly this shape
(`SALES_AUDIT_ACTIONS` includes `lead_assigned/reassigned/unassigned/
bulk_assigned`). **No silent reassignment is possible** — there is no code
path that writes `owner_id` without an audit row, and Phase 2 adds none.

---

## 8. The three-field separation (§5 of the brief) — agreed, with one addition

| Layer | Field | Written by | Example |
|---|---|---|---|
| **System priority** | `classifyLane` verdict (computed, never stored) | engine | "going cold — 5 of 7 → 0 of 3" |
| **Rep judgement** | `lead_outreach.rep_temperature` (F6-approved, **not yet built**) | rep | "HOT" |
| **Commercial outcome** | `student_payments` paid row | Razorpay webhook | "₹299 session booked" |

**My addition — an integrity rule the brief does not state:**
**`rep_temperature` must never influence assignment, priority, or lane order.**
If a rep's own label could pull leads toward them or raise their queue rank,
the label stops being a judgement and becomes a lever. It is display-and-MIS
only, always shown beside the system's verdict, never summed with it. This is
the same claimed-vs-confirmed discipline the Control Tower already applies to
call counts.

---

## 9. Retention-first priority — and where it collides with ownership

**Agreed and already built:** `classifyLane` puts retention lanes above
conversion (guard-pinned: a going-cold student *with* buddy intent is called
for retention, not the pitch). Assignment consumes that order; it does not
re-rank.

**CHALLENGE 4 — the collision nobody has named yet.** Ownership is *sticky*;
retention urgency is *dynamic*. A student owned by Rep A since March goes cold
today while Rep A is on leave. Under sticky ownership, the most
time-sensitive lane in the system sits in an absent person's queue.

**RECOMMENDATION:** ownership stays sticky (the relationship is the product —
a student should not be re-introduced to a stranger every time they wobble),
**but** a high-priority lane on an unavailable owner's lead raises an
Exception naming both, with a one-tap founder reassign. Automatic
reassignment stays **off** by default (F-2). At 2 reps this is a handful of
cards a week; at 20 it becomes the rule that earns automation.

---

## 10. What the rep sees / what the founder sees

**Rep — unchanged surfaces** (Calls / My leads / My summary). Additions:
their capacity line ("18 of 50 slots free · 6 new today"), the SLA countdown
on uncontacted leads, and — already shipped in Phase 1.5 — the lane, the
evidence, the action, and the student's own words on both the card and the
360. **Nothing new to learn**; the queue is still the answer to "who next".

**Founder — Control Tower gains one panel** (§E). No new top-level page.

---

## 11. Founder MIS — the data model that must exist from Day 1

The brief's requirement is right: **design MIS now so the events make it
possible later.** Mapping every question to the row that answers it:

| Founder question | Answered from | Status |
|---|---|---|
| How many leads did each rep receive? | `sales_activity` `activity_type='assigned'` | needs `assigned_at` (NEW column) |
| Contacted? | `sales_activity` connected outcomes | EXISTS (claim) |
| Actually spoke? | vendor-confirmed only | **UNKNOWN for human calls, permanently** (§16) |
| Follow-ups / unresolved / overdue | `sales_followup` | EXISTS |
| DND | `lead_outreach.status='dnd'` | EXISTS (Phase 1) |
| Returned after contact (D1/D3/D7) | `daily_reports` vs contact time | computable — Phase 4 |
| Broken streak recovered / dormant reactivated | `streak_data` + lane transitions | computable — Phase 4 |
| Buddy interest → booked → paid | `student_engagement`, `session_credits`, `student_payments` | EXISTS |
| SLA breaches | `first_contact_sla_due` vs first activity | needs the NEW column |
| Overdue leads / follow-up misses | `sales_followup`, `next_action_at` | EXISTS |
| Utilisation / available capacity / overload | `sales_rep_config` + derived | NEW table |
| Incoming lead pressure | pool size over time | EXISTS |

**Only two additions carry the entire MIS: `assigned_at` and
`first_contact_sla_due`.** Everything else the founder asked for is already
recordable. That is the strongest evidence that this design is an extension
rather than a second system.

**Drill-down is mandatory and structural** (SCALE-CONTRACT §4): every number
is produced by a predicate, and the destination list applies *the same
predicate*. Count == list, or the number does not ship.

---

## 12. The truth layer (§8 of the brief) — agreed, already in the schema

| Class | Source | Rendered as |
|---|---|---|
| **Observed** | product/payment tables, webhooks | plain fact |
| **Student said** | onboarding `pain_points`, self-report fields | "they told us" |
| **Rep reported** | `sales_activity.provenance='self_reported'` | SELF-REPORTED chip |
| **System calculated** | `classifyLane`, momentum | "system: going cold" |
| **Commercial event** | `student_payments` | ₹ amount, observed |

**FACT:** the provenance CHECK constraint already enforces this, and since
today's post-deploy migration a human activity without an actor is rejected by
the database. Phase 1.5 added the source-rung label on weakness
("from their mock" vs "no evidence yet — do not assert"). The layer exists;
Phase 2 must not erode it — specifically, `assignment_reason` is
`system_generated` and must never be phrased as if a human decided.

---

## 13. Reuse ledger — KEEP / REUSE / EXTEND / NEW

| Item | Class | Note |
|---|---|---|
| `lead_outreach` (ownership, status, one clock) | **REUSE** | no second lead table |
| `claim_lead` RPC (atomic) | **REUSE** | already race-safe |
| `sales_activity` (+provenance, actor FK) | **REUSE** | `'assigned'` type already legal |
| `sales_followup` | **REUSE** | promise history |
| `classifyLane` | **REUSE** | THE priority engine; engine consumes, never re-ranks |
| `sales-disposition` vocabulary | **REUSE** | incl. `dnd` |
| `sales-authz` (`profiles.id`) | **REUSE** | identity unchanged (§17 of brief satisfied) |
| `admin_audit_log` + `SALES_AUDIT_ACTIONS` | **REUSE** | override trail |
| `os/exception.ts` (`owner:'sales'`) | **REUSE** | SLA breach, capacity exhaustion — **not a new dashboard** |
| `os/scale-config.ts` | **EXTEND** | pool/Exception thresholds |
| `sales-control-tower.ts` | **EXTEND** | capacity panel goes in the existing lib |
| `/api/admin/reassign-lead`, `/distribute-leads` | **REUSE** | manual override paths |
| `lead_outreach.assigned_at`, `first_contact_sla_due`, `assignment_reason` | **EXTEND** | 3 additive columns |
| `sales_rep_config` | **NEW** | justified §4 |
| assignment cron + SLA sweep cron | **NEW** | no cron touches CRM tables today |
| **Nothing** | DELETE | — |
| `student_crm` dual-write, `cat_test_leads` | **DEPRECATE** | founder decisions F-b/F-c, unchanged from the gate doc |

**Proof obligation met:** every requirement that could have justified a new
table was checked against an existing one first. Only rep operational config
had no home.

---

## 14. Indexes, security, query performance

**Indexes (add 2, rest exist):**
```
NEW  lead_outreach (status, updated_at) WHERE owner_id IS NULL   -- the pool scan
NEW  lead_outreach (first_contact_sla_due) WHERE first_contact_sla_due IS NOT NULL
                                             AND status = 'not_contacted'
HAVE lead_outreach (owner_id) WHERE owner_id IS NOT NULL
HAVE sales_activity (actor_id) · (student_id, created_at DESC)
HAVE sales_followup (due_at) WHERE status='open' · (owner_id, due_at) WHERE status='open'
```
Both new indexes are **partial** — they index the working set, not the table,
so they stay small as closed leads accumulate.

**Security:** `sales_rep_config` RLS-on, deny-by-default, service-role only
(consistent with every other sales table — adding policies would create a
second authorization model under a client that bypasses RLS anyway). Admin
writes via an audited route; a rep reads only their own row. Engine runs
service-role inside a cron authenticated the same way every other cron is.
Identity remains `profiles.id` everywhere — **no email/phone/name ownership
shortcut is introduced anywhere in this design.**

**Query performance:** the engine's pool read is `LIMIT Σ assignable_now`
(tens of rows), served by the partial index. It never loads the roster (§3).

---

## 15. Operational edge cases

| Situation | Behaviour |
|---|---|
| **Rep reaches capacity** | `assignable_now = 0`; receives nothing; keeps their book; queue still shows their existing work. Nothing is lost. |
| **All reps at capacity** | Leads stay pooled. Exception: "N eligible leads waiting, 0 assignable capacity — raise a ceiling or hire." Never over-assign, never silently drop. |
| **SLA approaching** | Surfaced in the rep's own queue first (their chance to fix it), before it becomes a founder Exception. |
| **SLA breached** | Exception naming rep + student + minutes overdue. No auto-reassign (F-2). |
| **Rep unavailable** | Zero intake; book untouched; open follow-ups become Exceptions after 24h; high-priority lanes escalate per §9. |
| **Founder override** | Wins always; fully audited; engine cannot undo it. |
| **Engine misconfigured / misbehaving** | Kill switch (§29 of brief): one flag → engine no-ops → **shared-pool claiming, exactly as today**. The queue already handles `owner_id IS NULL`, so the fallback is the current live behaviour, not an untested path. This is why the kill switch is credible rather than aspirational. |

---

## 16. Scaling: 2 → 5 → 20 → 100 reps · 800 → 100k students

| Scale | What changes | Architecture change? |
|---|---|---|
| **2 reps** | as designed | — |
| **5** | more config rows; per-rep working windows already modelled | **none** |
| **20** | `team_id` on config; two-stage allocation (team → rep); SLA auto-reassign within team becomes worth enabling | additive column |
| **100** | pool query partitioned by team; workload counts materialised (only when measured slow) | additive |

**What breaks first, honestly:** not the engine — **the queue's roster load
(§3)**, at roughly 10,000 students. Second: `student_events` has no TTL
(logged debt). Third: `admin_audit_log` growth — one row per assignment run,
not per assignment, so ~50/day at any scale; fine.

**Contention analysis at 100 reps / 100k leads:** all assignment writes hit
`lead_outreach` row-level with a guarded predicate — no table locks, no
advisory locks needed. The engine allocates in chunks (bounded by
`Σ assignable_now`, itself bounded by team size × per-rep ceiling), so no long
transactions. Concurrent runs are safe by §6. The one thing I would add at 20+
reps is a per-run advisory lock so two crons do not both scan the pool —
wasteful, not incorrect.

---

## 17. Failure, recovery, monitoring, data quality

**Failure modes:** engine crash mid-run (idempotent re-run), pool read fails
(abort, assign nothing, Exception — never assign from a partial pool: the same
"partial data looks like real data" rule `truth/batch.ts` was written for),
config read fails (fail closed — no intake), SLA sweep fails (visible in
`cron_runs`).

**Monitoring — extends the existing 12-check data-quality panel:**
leads assigned to an inactive rep · assignments with no explanation ·
SLA breaches open > 48h · reps with no config row (**renders NOT CONFIGURED,
never "capacity 0"**) · pool starving while capacity exists (engine not
running) · capacity configured above bounds · owned leads with no activity
since assignment.

---

## 18. Zero-data honesty

Every new metric declares its class: `observed | self_reported |
system_generated | not_instrumented | unavailable`. Specifically: a rep with no
config row is **NOT CONFIGURED**, never 0. An empty pool is **POOL EMPTY**, not
"0 leads waiting". Zero assignments on a day the engine did not run is
**ENGINE IDLE**, not "0 assigned". The founder must never mistake missing
instrumentation for good performance.

---

## 19. Would I build this differently from the original request?

**Yes, in four places — all argued above:**

1. **Capacity counts the active working set, not the owned book** (§2).
   Without this the model self-destructs in a retention business.
2. **`max_new_per_day` defaults to unbounded** (§4) — it is a ramp-up guard,
   not a daily-operations control, and at our volume it rarely binds.
3. **The SLA clock is the deliverable, not the assignment** (§11). The
   founder's per-rep MIS *does* require assignment — but "time to first
   contact" could be measured pool-wide without it, and conflating the two
   makes assignment look more load-bearing than it is.
4. **Fix the roster-load wall before it is a crisis** (§3), and settle the
   PostgREST cap question first — it is cheap now and expensive at 10k.

**And one thing I would NOT change:** the retention-first lane order. It is
the thing that makes this a student-success system rather than a CRM, and it
is already guard-locked.

---

## 20. Implementation phases & acceptance criteria

**Phase 2B-1 — Configuration & visibility (no automation).**
`sales_rep_config` + 3 columns + capacity panel + NOT CONFIGURED states.
Manual claiming continues unchanged.
*Accept:* founder can configure both reps; panel answers "can I send 20 more
leads today, and to whom"; every number drills to its students; zero behaviour
change to the rep's day.

**Phase 2B-2 — SLA measurement (still no automation).**
`assigned_at`/`first_contact_sla_due` populated on manual claims too; SLA sweep
cron emitting Exceptions.
*Accept:* time-to-first-contact measurable per lead and per rep; breaches
visible; no lead moved automatically.

**Phase 2B-3 — The engine.**
Assignment cron + guarded write + audit + kill switch.
*Accept:* deterministic (same inputs ⇒ same allocation, proven by test);
**concurrent-run test proves no double assignment**; every assignment carries
its explanation; kill switch reverts to shared-pool in one flag; manual
override always wins; all reps at capacity ⇒ Exception, never over-assignment.

Splitting 2B this way means **the founder gets capacity visibility and SLA
truth before any lead moves automatically** — and if the engine is ever
disabled, phases 1 and 2 still stand on their own.

**Phase 3** Control Tower/MIS · **Phase 4** outcome attribution ·
**Phase 5** scale hardening. Unchanged from the founder's sequence.

---

## 21. Decisions only the founder can make

- **F-1 — the eight numbers** (FT and PT): work days, hours IST, max open
  (active working set), max new/day (or "unbounded"), first-contact SLA.
- **F-2 — SLA breach:** Exception only (recommended) or auto-reassign?
- **F-3 — sticky ownership** on a returning student: same rep always
  (recommended — the relationship is the product), or back to the pool?
- **F-4 — the two hires' names/emails** (deliberately deferred by the founder
  until architecture is approved — correct).
- **F-5 — Expedify outbound** stays frozen? (recommended: yes)
- **F-6 — `student_crm` / `cat_test_leads`** (recommended: stop dual-write;
  one-time import of quiz leads then retire the writer)
- **F-7 — the PostgREST verification** (§3): who runs the 60-second check?

---

## 22. Risks

(1) Permanent saturation — designed out (§2), but only if the working-set
definition ships with the config table. (2) PostgREST cap — **UNKNOWN, could
be a live momentum-wide P0.** (3) Roster-load wall at ~10k. (4) Capacity
misconfiguration — bounds + NOT CONFIGURED + preview. (5) Sticky ownership vs
dynamic urgency (§9). (6) Rep-temperature gaming — blocked by §8's rule.
(7) Over-assignment in the first week (a rep with 0 open gets a full book on
day one) — mitigated by `max_new_per_day` during ramp-up, which is exactly
when it *does* bind.

---

**Status: awaiting founder review. No Phase 2 code will be written until this
document is approved.**
