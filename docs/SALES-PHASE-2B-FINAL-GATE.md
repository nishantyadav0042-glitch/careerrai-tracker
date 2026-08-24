# Phase 2B — Final Architecture Gate

**24 Aug 2026 · No application code written in this pass.**
Labels: **FACT** (verified this session), **WEAKNESS** (found by attacking my
own Phase 2A design), **FIX**, **RECOMMENDATION**, **UNKNOWN**.

Supersedes conflicting text in `SALES-PHASE-2A-ASSIGNMENT-ARCHITECTURE.md`.

---

## 0. Verdict, and what changed by attacking my own design

**I found eight weaknesses in Phase 2A v2. Three are serious enough that
building 2B on the design as written would have produced incorrect
behaviour.** Two of those three are in claims I made confidently.

| # | Weakness | Severity | Fixed by |
|---|---|---|---|
| **W1** | **Capacity is checked at snapshot, enforced nowhere.** If a rep manually claims leads mid-run, the engine still writes its pre-computed allocation and **pushes them past capacity — violating the very invariant I said was provable.** | **Critical** | Enforce capacity *inside* the write transaction (§8) |
| **W2** | Ownership write and its history are two statements. If the second fails, a lead is owned with no recorded explanation — breaking my own acceptance test #11. | **High** | One RPC does both in one transaction (§7) |
| **W3** | Overflow *cause* is assumed, never computed. Lowering a rep's ceiling 50→30 would be labelled "STICKY REACTIVATIONS", which is a false statement to the founder. | **High** | Compute the cause; three distinct causes (§4) |
| **W4** | Pool ordering "ORDER BY lane_rank" was hand-waved — `classifyLane` is TypeScript, there is no such column. | Medium | Sweep stamps eligible unowned leads too (§4) |
| **W5** | **The sweep inherits the exact O(N) roster fan-out I claimed the engine avoided.** My Phase 2A §3 claim was too broad. | Medium | Honest correction + incremental sweep (§12) |
| **W6** | SLA measured in wall-clock minutes → a 2-hour SLA on a 6pm assignment breaches at 8pm while the rep is off shift. Day one would produce a flood of false breaches. | **High** | SLA in business minutes inside the owner's window (§6) |
| **W7** | A student who buys **without a call** never leaves the book — stays owned, can reactivate, consumes capacity forever. | Medium | Closure by observed entitlement, not only typed disposition (§5) |
| **W8** | If the sweep fails for days, stale `attention_since` keeps consuming capacity silently. | Low | Attention expiry guard (§4) |

**Verdict: GO for 2B-1 with the eight fixes folded in.** None requires a
redesign — the working-set model, sticky ownership, and the lane order all
survived the attack. What did not survive was my assumption that an invariant
stated in application code is an invariant. **W1 is the lesson of this gate:
`claim_lead` is safe because the database enforces it, not because the code
intends it. Assignment must earn its safety the same way.**

---

## 1. Final architecture

Unchanged in shape from Phase 2A; the corrections are in the write path.

```
ELIGIBILITY (cron)        →  lead_outreach row, owner_id NULL
        ↓
LANE SWEEP (cron)         →  stamps attention_since / attention_lane /
                             attention_rank on ALL eligible leads
                             (owned AND unowned) — the ONLY writer,
                             and its only source is classifyLane()
        ↓
ASSIGNMENT ENGINE (cron)  →  reads pool ordered by attention_rank (indexed)
                             computes allocation from assignable_now
                             calls assign_lead() RPC per lead
        ↓
assign_lead() RPC         →  ONE TRANSACTION:
                               re-check capacity   ← W1 fix
                               UPDATE … WHERE owner_id IS NULL  ← race guard
                               INSERT sales_activity            ← W2 fix
                             returns assigned | skipped_taken |
                                     skipped_at_capacity
        ↓
SLA CLOCK (business minutes, owner's window)      ← W6 fix
        ↓
REP QUEUE  →  CALL  →  DISPOSITION  →  FOLLOW-UP
        ↓
CLOSURE: typed disposition OR observed entitlement ← W7 fix
```

**The engine holds no business rules of its own.** Priority comes from
`classifyLane`, vocabulary from `sales-disposition`, ownership from
`lead_outreach`, safety from the database.

---

## 2. Canonical entities — final

| Concept | CANONICAL | Class |
|---|---|---|
| Student identity | `profiles.id` | REUSE |
| Lead identity | `lead_outreach.student_id` (= profiles.id) | REUSE |
| Ownership | `lead_outreach.owner_id` | REUSE |
| Ownership history | `sales_activity` (`assigned`/`reassigned`/`unassigned` + actor + note) — **no new table** (§5) | REUSE |
| Lead status | `LEAD_STATUSES` in `lib/sales-disposition.ts` = DB CHECK | REUSE |
| Assignment | `assign_lead()` RPC (**NEW**), mirroring `claim_lead` | NEW |
| Assignment history | `sales_activity` + `lead_outreach.assignment_reason` | REUSE + EXTEND |
| Sales activity | `sales_activity` (+provenance, actor FK) | REUSE |
| Follow-up | `sales_followup` + `next_action_at` (one clock) | REUSE |
| Rep capacity | `sales_rep_config` (**NEW** — nothing stores rep operational config) | NEW |
| Working-set status | derived: `lib/sales-capacity.ts` `activeState(lead)` | NEW (pure) |
| Retention lane | `classifyLane()` in `lib/call-queue.ts` — **sole authority** | REUSE |
| Lane materialisation | `lead_outreach.attention_*` — stamp of the above, never a rival | EXTEND |
| Conversion score | `scoreConversion()` in `lib/sales-score.ts` | REUSE |
| HOT/WARM/COLD (rep) | `lead_outreach.rep_temperature` — display/MIS only, **firewalled** | future |
| System priority | `classifyLane` verdict + lane rank | REUSE |
| SLA | `lead_outreach.first_contact_sla_due` | EXTEND |
| Student engagement | `student_engagement` + `profiles.last_seen_at` | REUSE |
| Conversion (WON) | `student_payments` paid rows | REUSE |
| Payment state | `student_payments` + `profiles.is_premium` (webhook-only) | REUSE |
| Mentor interest | `student_engagement` counters + `os/buddy-interest.ts` | REUSE |
| MIS metrics | `lib/sales-control-tower.ts` `{value, evidence}` | EXTEND |

**FACT (re-verified this session):** exactly one `classifyLane`, one
`scoreConversion`, one `resolveFocusSections`, zero score arithmetic outside
`sales-score.ts`. (A grep initially suggested five `resolveFocusSections`
definitions; checking showed four were guard tests *reading the source string*
— reported here because I nearly recorded a false finding.)

---

## 3. Assignment state machine

```
                    ┌──────────── founder release ─────────────┐
                    ▼                                          │
 UNOWNED ──assign_lead()/claim_lead()──► ACTIVE ───────────────┤
                                          │  ▲                 │
              work discharged (no due     │  │ sweep stamps    │
              work, no attention stamp)   │  │ attention (A4)  │
                                          ▼  │                 │
                                       DORMANT ────────────────┘
                                          │
              typed disposition  OR  observed entitlement (W7)
                                          ▼
                                       CLOSED  (terminal)
```

`CLOSED` is terminal: never re-assigned, never counted, never re-stamped.
**Overflow is a property of the rep, not a state of the lead.**

---

## 4. Capacity model (final)

**ACTIVE** — four SQL-computable disjuncts (unchanged from 2A §23), plus the
W8 guard:

```
A1  status = 'not_contacted'
A2  next_action_at <= now()
A3  open sales_followup due <= now()
A4  attention_since IS NOT NULL
      AND attention_since > now() - ATTENTION_MAX_AGE   ← W8: stale stamp expires
```

```
active_now(rep)     = Σ weight(item)          weight() ≡ 1 in Phase 2
capacity(rep)       = override_until > now() ? capacity_override : max_capacity_units
assignable_now(rep) = in_window ? max(0, min(capacity − active_now,
                                             max_new_per_day − new_today)) : 0
overflow(rep)       = max(0, active_now − capacity)
```

**W3 fix — overflow cause is computed, not assumed.** Three mutually
exclusive causes, each independently evidenced:

| Cause | Detected by | Founder label |
|---|---|---|
| Sticky reactivation | active items whose `attention_since` post-dates the rep reaching capacity | `CAPACITY OVERFLOW — STICKY REACTIVATIONS` |
| Config reduction | `sales_rep_config.updated_at` lowered capacity below `active_now` | `CAPACITY OVERFLOW — CEILING LOWERED` |
| Manual assignment | `sales_activity('assigned'/'reassigned')` with a human `actor_id` while at capacity | `CAPACITY OVERFLOW — MANUAL ASSIGNMENT` |

Mixed causes render as a breakdown, never a single guess. **The engine appears
in none of them** — that is the invariant, now enforced in §8.

**W4 fix — pool ordering.** The sweep stamps `attention_rank smallint` (lane
priority) on **eligible unowned leads as well as owned ones**, so the engine's
pool read is one indexed `ORDER BY attention_rank, created_at LIMIT n`. No
TypeScript classification in the assignment path.

---

## 5. Ownership model

Sticky. `owner_id` is the single authority. **No new ownership-history
table** — `sales_activity` already records every transfer with actor, note,
and timestamp, and the founder's instruction is explicit: do not build for
theoretical scalability. If ownership-history queries become common, add a
**view** first and materialise only if measured slow.

Every ownership change writes before / after / who / why / when to
`admin_audit_log`. **No code path writes `owner_id` without one**, and Phase
2B adds none.

**W7 fix — closure by observed truth.** A lead closes on a typed disposition
**or** on an observed entitlement (`student_payments` paid row →
`is_premium`/buddy assigned). Rationale: a student who buys without ever being
called must not remain in a rep's book, must not consume capacity, and must
never be re-pitched. The closure is recorded as `provenance:'observed'`,
distinguishing it from a rep's claim of `converted`. This makes
`student_payments` — already the WON authority — the closure authority too,
rather than inventing a second rule.

---

## 6. SLA model

**W6 fix.** `first_contact_sla_due` is computed at assignment time by adding
`first_contact_sla_minutes` **of the owner's working time**, walking their
`work_days`/`work_start_ist`/`work_end_ist`. A 2-hour SLA on a 6:30pm
assignment to a rep who works 10:00–19:00 is due at **11:30 the next working
morning**, not 8:30pm the same evening.

Without this, day one produces a flood of breaches for time nobody was
working — and a metric that cries wolf on day one is ignored by week two.

`unavailable_until` (leave) extends the due time the same way. Stored as one
timestamp (simple, indexable, auditable); it reflects the config at
assignment time, and the sweep recomputes it if the config changes — the
recomputation is audited so a moved deadline is never silent.

---

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| Ownership written, history insert fails | **Impossible after W2 fix** — one RPC, one transaction. Either both or neither. |
| Engine crashes mid-run | Committed assignments stand (each is its own transaction); next run continues. No repair needed. |
| Pool read fails | Assign nothing. Never allocate from a partial pool — the "partial data looks like real data" rule `truth/batch.ts` exists for. |
| Config read fails | Fail closed: `assignable_now = 0`. No intake. |
| Sweep fails | Stamps go stale → expire (W8) → capacity *over*-reports availability rather than under. Data-quality check fires. |
| RPC returns `skipped_at_capacity` | Logged in the run audit with the numbers that caused it; lead stays pooled. |
| Cron does not run | `ENGINE IDLE`, never "0 assigned". Visible in `cron_runs`. |

---

## 8. Concurrency model — the W1 fix

**The weakness:** Phase 2A computed `assignable_now` once per run, then wrote.
Between snapshot and write a rep can claim manually, or a follow-up can come
due. The engine would still write its full allocation — pushing the rep past
capacity and **falsifying the invariant I had called provable.**

**The fix — make the invariant a database precondition, not an application
intention**, exactly as `claim_lead` already does for claiming:

```sql
assign_lead(p_student uuid, p_rep uuid, p_reason text) returns text
-- ONE transaction:
--   1. SELECT count(*) of p_rep's ACTIVE items   (partial index)
--   2. IF count >= capacity  → RETURN 'skipped_at_capacity'   ← W1
--   3. UPDATE lead_outreach SET owner_id = p_rep, assigned_at = now(),
--        first_contact_sla_due = …, assignment_reason = p_reason
--      WHERE student_id = p_student AND owner_id IS NULL       ← race guard
--   4. IF 0 rows → RETURN 'skipped_taken'
--   5. INSERT sales_activity(assigned, system_generated, note = p_reason) ← W2
--   6. RETURN 'assigned'
```

| Race | Outcome |
|---|---|
| Two engine workers, same lead | One `assigned`, one `skipped_taken`. Row-level lock decides. |
| Engine vs rep manual claim | Whoever commits first; the other is skipped. |
| Concurrent claims consume capacity mid-run | Engine gets `skipped_at_capacity` — **cannot overshoot** |
| Retry after timeout | `skipped_taken`; no duplicate, no second activity row |
| 10 leads, 2 reps, simultaneous | Deterministic allocation; each write independently guarded |

Client execute is revoked (same posture as `claim_lead`). Advisory lock per
run recommended at 20+ reps — wasteful duplicate scanning, not incorrectness.

---

## 9. Kill switch

`assignment_enabled = false` (one flag in `scale-config`) → the engine cron
no-ops immediately. The system returns to shared-pool manual claiming, which
is **today's live, tested behaviour** — not an untested fallback path. Already
assigned leads keep their owners (no orphaning, no data change). Turning it
back on resumes from current state; no reconciliation required.

---

## 10. Founder MIS (read model, drill-down mandatory)

**Today:** new leads · assigned · unassigned · contacted · overdue · SLA
breached · going cold · broken streak · never logged · conversion
opportunities.
**Per rep:** working set · available capacity · **overflow + its cause** ·
new today · assigned today · SLA breaches · overdue follow-ups · activities ·
retention outcomes · conversion outcomes.
**Funnel:** signup → first login → first log → continued → going cold →
reactivation → buddy interest → session → subscription.

Every number is produced by a predicate and the destination list applies
**the same predicate** (count == list). Evidence class on every metric;
`NOT CONFIGURED` never renders as 0; `ENGINE IDLE` never renders as
"0 assigned".

**Statistical honesty (founder's §8):** retention/conversion lift is
**weekly and pooled**, never daily per-rep. Below the existing 30-paid
threshold it renders `UNAVAILABLE`. Attribution is labelled *"associated
with"*, never *"caused by"*. At 2 reps most rate cells will honestly read
UNAVAILABLE for months — that is correct, not a gap to fill.

---

## 11. Rep UX

Unchanged: the **queue stays the single operational surface**, the 360 is
context. The rep opens one screen and it answers who → why → what to say →
what happened last time → what the student actually did → what to follow up →
next action. Phase 2B adds exactly one line to their world: their capacity
("18 of 50 slots free · 6 new today") and an SLA countdown on uncontacted
leads. **No new screen, no new concept to learn.**

---

## 12. Scaling analysis

| Component | 2 reps / 800 | 100 reps / 100k | Classification |
|---|---|---|---|
| `assign_lead` RPC | trivial | trivial (bounded by assignments/day) | **SAFE NOW** |
| Pool read (indexed, LIMIT) | trivial | trivial | **SAFE NOW** |
| Capacity count (partial index) | trivial | one indexed count per assignment | **SAFE NOW** |
| Assignment contention | none | row-level only; add per-run advisory lock | **OPTIMIZE AT THRESHOLD (~20 reps)** |
| **Lane sweep** | fine | **O(students) — the same fan-out I wrongly said the engine escaped (W5)** | **OPTIMIZE AT THRESHOLD (~5k students)** |
| `getRosterMomentum` (5 unbounded reads per queue build) | fine at 786 | not serviceable | **MUST FIX BEFORE SCALE (~5k)** |
| Data-API row limit | **UNKNOWN** — probe blocked by this environment's network policy | would already be truncating today's 5,043-row read | **MUST VERIFY** (60-second test, §16) |
| `student_events` no TTL | fine | large | MONITOR |
| `admin_audit_log` growth | ~50 rows/day (per run, not per lead) | same | SAFE NOW |
| Notification fan-out | unchanged by Phase 2 | — | out of scope |

**W5, stated plainly:** in Phase 2A §3 I said the assignment engine "does not
inherit this wall." That is true of the *assignment step* and false of the
*sweep*, which must classify lanes and therefore needs log history per
student. The mitigation is that the sweep is a **batch cron, not a request
path**: it can be chunked, run off-peak, and made **incremental** — a
student's lane can only change when they log or when time passes, so the
sweep only needs to examine students whose last log or last evaluation makes
a transition possible. That is a contained optimisation at ~5k students, not
an architectural change. But my original claim was too broad and is corrected
here.

---

## 13. Duplication audit

| Concept | Canonical | Competing implementations | Action |
|---|---|---|---|
| Lane | `classifyLane` (call-queue.ts) | `mission-queue` root-cause census (**different job**: whole-roster branch sizes, not per-student lanes) | REUSE; converge mission-deck when next touched (founder-approved deferral) |
| Conversion score | `scoreConversion` (sales-score.ts) | none (verified 0) | REUSE |
| Weakness | `resolveFocusSections` | none (verified 1 definition) | REUSE |
| Assignment | `assign_lead` RPC | `claim_lead` (**different act**: rep pull vs engine push; both guarded, both atomic) | NEW, mirroring the existing pattern |
| Ownership | `lead_outreach.owner_id` | none | REUSE |
| Ownership history | `sales_activity` | none | REUSE — no new table |
| Capacity | `sales-capacity.ts` | none exists | NEW |
| SLA | `first_contact_sla_due` | none | EXTEND |
| MIS | `sales-control-tower.ts` | none (pages render the lib) | EXTEND |
| Student engagement | `student_engagement` | none | REUSE |

**Nothing is silently duplicated.** The one judgement call — `assign_lead`
alongside `claim_lead` — is deliberate: they are different acts (push vs
pull) sharing one ownership model and one safety pattern. A single function
serving both would need a mode flag that changes its safety semantics, which
is worse.

---

## 14. Test plan

**Structural:** one `classifyLane`, one `scoreConversion`, one weakness
resolver, one ownership writer path; no rival capacity/lane/priority module.
**Type/shape:** no JSONB column reaches JSX raw (extends the C0 guard).
**Unit:** active/dormant/closed over every disjunct and boundary; capacity
arithmetic incl. all binding reasons; SLA business-minute walk across
overnight, weekend and leave.
**Concurrency:** N workers × 1 lead ⇒ exactly one owner; engine vs manual
claim; **capacity race ⇒ `skipped_at_capacity`, never overshoot (W1)**.
**Property:** random reactivation storms ⇒ engine never assigns to a rep at
or over capacity; overflow always attributable to reactivation, config
change, or a human — never the engine.
**Integration:** lead → assignment → activity → follow-up → disposition →
closure (typed and observed).
**Render:** `/sales/student/[id]` and `/sales` rendered against a fixture
carrying a mock debrief, pain points, follow-ups and an overflow state —
**the test class whose absence let C0 ship.**
**Production verification (not "3,000 tests passed"):** rep login → queue →
360 → capacity panel → one assignment → audit row → founder dashboard →
kill switch off and on.

---

## 15. Implementation phases

- **2B-1 — Configuration + visibility. No lead moves.** `sales_rep_config`,
  columns, capacity computation, founder panel, `NOT CONFIGURED` states.
  *Accept:* both reps configured; panel answers "can I send 20 more leads
  today, and to whom"; overflow displays with its computed cause; every
  number drills to students; **zero behaviour change for reps.**
- **2B-2 — SLA + eligibility, still no automatic movement.** Business-minute
  SLA on manual claims too; lane sweep; assignment-reason plumbing; sweep
  data-quality checks. *Accept:* time-to-first-contact measurable; no false
  breaches outside working hours; no lead moved automatically.
- **2B-3 — Controlled auto-assignment.** `assign_lead` RPC, engine cron, kill
  switch. *Accept:* all 12 acceptance tests, especially the concurrency and
  overflow property tests; kill switch verified in production.
- **2B-4 — Observation, no tuning.** Watch assignment failures, duplicate
  attempts, SLA breaches, overflow, unassigned leads, latency, workload,
  reactivation volume, manual reassignments, kill-switch usage. **Tune only
  from evidence.**

---

## 16. Risks

**Architectural:** application-level invariants that the database does not
enforce (**W1 was exactly this — assume there are others**). **Product:** a
rep contradicting the student's own app (C1 class; guarded, stay vigilant).
**Scaling:** the roster fan-out, and the unverified row limit — the single
highest-value 60 seconds available (`GET /rest/v1/notifications?select=user_id`
with `Prefer: count=exact`, compare returned rows to the `Content-Range`
total; if capped, momentum is already wrong system-wide). **Gaming:** rep
temperature (firewalled), claimed-vs-confirmed activity (never summed),
follow-up completion (requires the discharging activity row). **Misleading
MIS:** daily small-sample rates — refused by design; missing instrumentation
rendered as missing, never as zero.

---

## 17. Co-founder recommendation

**Would I build 2B this way if CareerRai were mine? Yes — now.** Not as
written yesterday: W1 would have shipped an engine that could quietly breach
the one guarantee I gave you.

**1. Overbuilding:** `max_new_per_day` at current volume (kept anyway — your
fuse argument was right); the three-way overflow-cause breakdown at 2 reps
(kept because mislabelling a cause is worse than the cost); `employment_type`
as a stored field, which is pure label.
**2. Underbuilding:** rep offboarding (no rehoming workflow); overflow
resolution as a *policy* rather than a founder task; render-test coverage of
sales surfaces — still thinner than it should be after C0.
**3. Biggest architectural risk:** invariants asserted in code and enforced
nowhere. W1 is one instance; the discipline going forward is that any rule
protecting money, ownership, or capacity belongs in a constraint or a
transaction.
**4. Biggest product risk:** the sales system becoming a pressure machine.
Retention-first ordering and the "evidence → relevance → option" framing are
the guardrails; the day a rep's script starts with a deadline instead of a
fact, we have lost the thing that makes this different.
**5. Biggest scaling risk:** the roster fan-out at ~5k students — in shipped
code, unrelated to Phase 2, and it will arrive quietly as a slow page rather
than an error.
**6. Gaming:** if temperature ever touched routing, or if "contacted" counts
were ever summed with confirmed activity, or if follow-ups could be closed
without the discharging activity. All three are structurally blocked; keep
them blocked.
**7. Misleading MIS:** small-sample daily rates, and missing instrumentation
rendered as zero. Both refused by design.
**8. Do not build yet:** ownership-history table, weighted capacity,
auto-reassignment, teams/pods, call recording, telephony, a second dashboard
of any kind, and Phase 3–5 work. **Let the system earn its complexity from
real CareerRai volume.**

**Recommended next step: 2B-1 only** — configuration and visibility, zero
automatic movement. You will see whether the working-set model behaves
correctly against real production data *before* the machine is permitted to
move a single student.

**Status: gate complete. Awaiting approval for 2B-1. No code written.**
