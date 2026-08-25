# Sales Intelligence — Phase 1.5 Architecture, Duplication & Canonicality Gate

**24 Aug 2026 · Co-founder pass, not a coding pass. No application code was
written for this document.** Labels: **FACT** (verified in code/production this
session), **FINDING** (a defect or debt this audit surfaced), **RECOMMENDATION**,
**UNKNOWN**. Where a finding is in code I wrote myself this week, it says so —
this gate audits Phase 1 (`c0ff0f1`) with the same hostility as everything else.

---

## 1. Executive verdict

**CONDITIONAL GO for Phase 2.**

The architecture is fundamentally sound: one queue, one disposition vocabulary,
one ownership model on `profiles.id`, provenance in the schema, a Control Tower
that is genuinely a read model, and zero legacy data to migrate. Nothing in
Phase 1 created a second CRM.

But this audit found **four consolidation debts** — two of them in the sales
code itself, one of which can put a wrong sentence in a rep's mouth on a live
call. None blocks the Phase 2 *design*; two (C1, C2) must merge before Phase 2
*code* lands:

- **C1 (top priority — student-facing trust):** the sales Student 360 computes
  its own weak/strong section from coverage math, bypassing
  `resolveFocusSections()` — the guard-pinned canonical chain (mock →
  self-report → baseline → coverage) that drives the student's own planner. A
  rep can tell a student "your weak area is VARC" while the student's plan
  says DILR because a recent mock said so. Fix: the 360 consumes
  `resolveFocusSections()` and shows its source rung ("weak: DILR — from your
  20 Aug mock").
- **C2:** `convScore` is the same formula hand-copied in `call-queue.ts:300`
  and `sales-conversion.ts:177`. Two copies of one business rule will drift.
  Fix: one exported `scoreConversion()`, both import it.
- **C3:** `classifyLane()` (Phase 1) is a new pattern engine that overlaps
  `mission-queue.ts`'s silence buckets and `momentum.ts` bands. It is justified
  (explainable lanes ≠ numeric score) but must be DECLARED the one lane
  authority, guard-locked against a second, with the mission-deck convergence
  planned — or in six months there are two "going cold" definitions.
- **C4:** the WHY lives only on the queue card. A rep who opens a student
  directly (search, timeline link) loses the reason. The 360 must carry the
  same lane/why/action block, plus the student's own words (`pain_points`)
  which today reach the queue brief but not the 360.

Estimated cost of C1–C4 together: under a day. They are Phase 1.5 work items,
not redesigns.

## 2. Phase 1 audit — what `c0ff0f1` actually delivered

**FACT, verified by reading the diff and running the suite (3,124 passing):**
retention-first queue with five explainable lanes + per-lane caps; WHY cards
(trigger, evidence, action) on the deck; `dnd` as a connected, permanently
closing outcome with widened DB CHECKs (functionally verified on test, applied
to production); 14-day study strip, latest mock, open follow-ups, merged
CRM-interaction timeline on the shared `getSalesConversionView`; guard tests
pinning the founder's own worked examples. **What Phase 1 did NOT do:** touch
identity, ownership, provenance, payment, or create any new table.

## 3. Current architecture (as it exists, not as documented)

```
                        CAREERRAI STUDENT
                               │
                               ▼
                         profiles.id  ←── the ONE identity key
                               │
        ┌──────────────────────┼───────────────────────┐
        ▼                      ▼                       ▼
  PRODUCT TRUTH           SALES STATE             PAYMENT TRUTH
  daily_reports           lead_outreach           student_payments
  routine_task_compl.       (owner_id, status,      (webhook-only,
  topic_coverage             next_action_at)         server-verified)
  mock_debriefs           sales_activity          session_credits
  topic_evidence            (actor_id, provenance)
  streak_data             sales_followup
  student_events            (promise history)
  student_engagement      admin_audit_log
        │                      │                       │
        │   (read-only to sales; write-revoked)        │
        └──────────────────────┼───────────────────────┘
                               ▼
                    STUDENT INTELLIGENCE (libs)
          momentum · classifyLane · buildCallQueue ·
          getSalesConversionView · sales-portfolio ·
          sales-control-tower · sales-data-quality
                               │
                 ┌─────────────┴─────────────┐
                 ▼                           ▼
          SALESPERSON UI               FOUNDER MIS
          /sales (3 tabs)              /admin/sales/tower
          (operational frame)          (management frame)
```

This is already the founder's target diagram. The gate's job was to verify the
arrows are real — they are, with the §5 exceptions.

## 4. Duplication audit (repo-wide, traced through imports and table reads)

**No second CRM exists.** One lead table, one ownership write-path
(claim/reassign/distribute), one activity table, one follow-up engine, one
disposition vocabulary (code = DB CHECK, guard-pinned), one queue authority
(guard: `sales-clock`). The duplications that DO exist:

| # | Duplication | Where | Verdict |
|---|---|---|---|
| D1 | Weak-section logic: canonical chain vs sales inline coverage math | `focus-sections.ts::resolveFocusSections` (guarded: `plan-integrity`, `plan-inputs`) vs `sales-conversion.ts` §prep | **CONSOLIDATE — condition C1** |
| D2 | convScore formula, two hand copies | `call-queue.ts:300`, `sales-conversion.ts:177` | **CONSOLIDATE — condition C2** |
| D3 | "Silent student" pattern engines | `classifyLane` (new), `mission-queue.ts` buckets, `momentum.ts` bands, `student_dna.churn_risk`, `urgency-score.ts` | **DECLARE + guard — condition C3.** classifyLane becomes THE sales lane authority; momentum stays the numeric authority it already is; mission-deck converges onto classifyLane when next touched; churn_risk/urgency stay in their own (buddy/DNA) domains, never rendered on sales surfaces |
| D4 | Timeline assemblies | `os/timeline.ts` (curated), `student-360.ts` (admin hand-merge), `sales-conversion.ts` timeline (Phase 1, CRM-only) | **ACCEPT for now, CONSOLIDATE at entity-graph (Phase 4+).** The sales timeline merges only CRM rows — narrow, non-competing — but it is a third assembly and is so recorded |
| D5 | Per-topic coverage aggregation | `sales-conversion.ts`, `student-brief.ts` (both via `computeTopicMemory` + `isCovered`) | **KEEP** — same producer, same status authority; presentation-level aggregation only |
| D6 | Two rep-view student assemblies | `student-360.ts` (admin) vs `sales-conversion.ts` (rep) | **KEEP for now** — different authz frames; merge only via entity-graph, not by hand |

"A shared function above two competing tables is still duplication" — checked:
every sales read traces to the single canonical table for its concept. The
duplications above are all *logic* copies, not competing state.

## 5. Canonicality matrix

| Concept | Implementations found | Canonical source | Duplicate? | Verdict | Evidence |
|---|---|---|---|---|---|
| Student identity | 1 | `profiles.id` | No | KEEP | FKs on every sales table; `sales-authz.guard` |
| Lead identity | 1 (+1 orphan) | `lead_outreach.student_id` (= profiles.id) | `cat_test_leads` is a phone-keyed orphan pool, no consumer | KEEP + founder decision F-c | quiz route is its only writer; `/admin/cat-leads` redirects away |
| Lead ownership | 1 | `lead_outreach.owner_id` via atomic `claim_lead` / reassign / distribute | Legacy `owner` TEXT column still exists, read-fallback only | KEEP; drop legacy after soak (already scheduled) | `sales-claim.guard` |
| Lead status | 1 | `LEAD_STATUSES` = DB CHECK (now incl. `dnd`) | No | KEEP | `sales-disposition.test` reads the migration |
| Sales activity | 1 | `sales_activity` (actor FK, provenance CHECK) | Legacy `actor` TEXT, same soak plan | KEEP | |
| Follow-up | 1 | `sales_followup` + `next_action_at` (one clock) | No | KEEP | `sales-clock.guard` |
| Rep disposition | 1 | `CALL_OUTCOMES` | No | KEEP | |
| HOT/WARM/COLD | 1 computed (queue tier); rep-declared field approved (F6) but NOT YET BUILT | `call-queue` tier | No — but when `rep_temperature` lands it must stay a labeled observation | KEEP + build rule | F6 decision 24 Aug |
| System priority | 2 overlapping | `classifyLane` (sales), `momentum` (numeric) | Partially (D3) | DECLARE (C3) | this doc |
| Student engagement | 1 | `student_engagement` + `profiles.last_seen_at` | No | KEEP | |
| Study behaviour | 1 | `daily_reports` / `routine_task_completions` (tick IS the log) | No | KEEP | write-revoked to clients |
| Weakness | 2 | `resolveFocusSections()` | **YES — D1** | CONSOLIDATE (C1) | `plan-integrity.guard` bans re-implementing the chain |
| Conversion (WON) | 1 | `student_payments` paid rows | No — `converted` disposition is a claim, never summed as money | KEEP | `sales-won.guard` |
| Revenue | 1 | `student_payments` | No | KEEP | |
| Buddy interest | 1 | `student_engagement` counters + `os/buddy-interest.ts` heat | No | KEEP | |
| Assignment (mentor) | 1 | `profiles.buddy_id` via admin route | No | KEEP | |
| Rep capacity | **0** | none | — | BUILD (Phase 2: `sales_rep_config`) | grep: no capacity model exists |
| MIS metrics | 1 | `sales-control-tower.ts` `{value, evidence}` | No — pages render the lib, don't recompute | KEEP; Phase 3 additions go in the SAME lib | |
| Student timeline | 3 assemblies (D4) | `timeline_events` for decisions; CRM timeline for sales | Yes, tolerated | CONSOLIDATE later | |

## 6. Identity audit

**FACT — the contract holds.** Ownership: `owner_id uuid` (authority), legacy
`owner` TEXT resolved-then-denied-if-unattributable, never written by new code.
Actorship: `actor_id uuid` FK, DB-enforced since the post-deploy constraint
(applied today, pre-checked clean). `sales_activity.student_id`: FK to
profiles, uuid-validated, real-student-checked, test-accounts refused. Admin &
rep identity: `salesPrincipal` on `profiles.id`; role grants oversight, absence
never does. Vendor identity: `external_ref` = profiles.id outbound; inbound
correlation ONLY by our ref, never phone. Phase 1 added **zero** identity
fields. **Remaining, reported not fixed (per instruction):** (i) the two legacy
TEXT columns + old `claim_lead(uuid,text)` overload — kept deliberately until
production-verified soak, drop scheduled in `SALES-POST-DEPLOY-STEPS.sql` §3;
(ii) `cat_test_leads` is phone-keyed with no profiles link — an identity
orphan by construction, founder decision below.

## 7. Provenance audit

**FACT — the distinction survives Phase 1.** Every rep write is
`self_reported`; assignments/cadence are `system_generated`; vendor callbacks
`vendor_reported` (rejected without the vendor's own call id); payments are
`observed` ledger rows. The Tower never sums claimed with confirmed; the Phase
1 timeline renders a SELF-REPORTED chip.

Mapping the founder's four-way model onto what is knowable:

| Founder class | System reality |
|---|---|
| OBSERVED | `observed` (payments, product events, notification delivery) |
| CLAIMED | `self_reported` — **every human call, permanently**, because no telephony exists |
| ATTEMPTED | knowable only for Expedify (vendor accepted the workflow) — and outbound is disabled |
| FAILED | knowable only for Expedify (`readWorkflowVerdict` reads the body, not the 200) |

**FINDING (accepted limitation, not a blocker):** for human reps,
CLAIMED-vs-ATTEMPTED is not distinguishable and will not be without telephony
we should not buy (§18). The honest substitute is Phase 3's outcome join:
product truth (did the student log after the "call"?) is the only independent
witness we have, and it doubles as the rep-integrity signal.

## 8. Student 360 audit — can it answer "why call this student today, with evidence"?

Against the founder's example card, field by field:

| Element | Status |
|---|---|
| Going-cold trigger + "5/7 → 0/3" | ✅ queue card (guard-pinned) — **❌ not shown on the 360 page itself → C4** |
| Last study date | ✅ strip + lastActivity |
| Strongest section | ⚠️ shown, but from the non-canonical inline calc → C1 |
| Current gap (weak section) | ⚠️ same → C1, and must name its source rung |
| Last contact | ✅ timeline |
| "Student previously said: time management" | ⚠️ `pain_points` reach the queue brief but not the 360 → C4; rep notes ✅ in timeline |
| Next action due | ✅ open follow-ups block |

Principle check (FACT → EVIDENCE → REASON → ACTION): the queue card satisfies
it; the 360 satisfies FACT/EVIDENCE but drops REASON/ACTION when entered
directly. No manufactured intelligence found — every rendered claim traces to
a table, and absent data renders as absent (e.g. no mock ⇒ no mock line).

## 9. Diagnostic/weakness consistency — the STOP-and-flag check

**FINDING (flagged as instructed, deliberately not silently fixed):** the sales
view IS running its own weakness math (D1/C1 above). It does not literally call
`weakestFromCoverage()` (which is why `plan-integrity.guard`'s ban didn't trip
— the guard pins the function name, and this code re-derives from
`computeTopicMemory` instead), but it re-implements the *idea* the guard
exists to protect, minus the mock and self-report rungs that outrank coverage.
Concrete failure: student takes a mock 20 Aug showing DILR weakest; coverage
grid says VARC least-covered; planner says DILR (mock rung); sales page says
VARC. The rep contradicts the product on a live call. **C1 fix:** consume
`resolveFocusSections()` + render `weakestSource`; extend the plan-integrity
guard so the *pattern* (deriving a weakest-section on a non-planner surface)
is caught, not just the function name.

## 10. Control Tower audit — read model?

**FACT: yes.** `sales-control-tower.ts` computes `{value, evidence}` from
canonical tables only (`profiles, lead_outreach, sales_activity,
sales_followup, student_payments, expedify_events`); it owns no state, no
table, no write path; pages render the lib. Zero-data honesty exists in the
type system (`observed | self_reported | not_instrumented | unavailable`, an
all-zero board renders "CRM NOT IN USE", a failed read renders `unavailable`
never 0). **Rule going forward (binding for Phase 3):** every new MIS number
is added to THIS lib with an evidence class; pages never grow their own SQL.

## 11. Auto lead assignment — recommended architecture (Phase 2)

Unchanged in structure from the approved blueprint (F2: auto intake, manual
moves), with this gate adding the safety table (§12) and one honest scope cut
(§21-challenge 1). Pipeline: `pool (sales_ready, usable phone, not test,
owner_id IS NULL, lane-prioritized) → available reps (active, in working
window) → assignable_now per rep → largest-remainder proportional allocation →
guarded write (owner_id IS NULL) → activity row (system_generated, note = lane
+ capacity numbers) → audit row per run (full allocation + capacity snapshot) →
SLA timer (assigned_at, first_contact_sla_due)`. Every assignment is
answerable: *"→ Priya: active, in window (10:00–19:00), 11 slots free (most
available), SLA clock started, lane = new/never-logged."*

## 12. Capacity model

`sales_rep_config` (one row per rep — a third hire is an INSERT, nothing
hard-coded): `active`, `employment_type` (informational), `work_start_ist`,
`work_end_ist`, `work_days`, `max_open_leads` (live open-work ceiling),
`max_new_per_day` (daily intake ceiling), `capacity_override + override_until`
(temporary, expiring), `updated_by/at` + audit row per change. Definitions:
`open(rep)` = owned, status ∉ {converted, not_interested, dnd};
`assignable_now(rep)` = 0 if inactive/outside window, else
`min(max_open − open, max_new_per_day − assigned_today)`. Both ceilings exist
because they answer different questions: "how much can she hold" vs "how much
can she absorb today". Bounds-validated (≤100 open, ≤50/day) so a typo cannot
flood a rep. Missing config row ⇒ treated as `active=false` — fail closed, no
intake.

## 13–14. Outcome measurement (retention + commercial)

Phase 3, computed on demand from existing tables — **no new storage**:
per first-connected-contact at T: logged same day / next day / within 3 / 7;
recovered = at_risk-or-rescue band at T improved by T+7. Commercial: buddy
interest after contact, checkout opened (`payment_checkout_opened`), paid
(ledger), still-active-at-30d post-conversion. Baseline: momentum-matched
uncontacted students, same window. **Labeling is binding:** "ASSOCIATED WITH
SALESPERSON INTERVENTION", never "caused"; per-rep rates stay suppressed below
the existing 30-paid threshold; every rate drills to its exact student list
(count == list, SCALE-CONTRACT). Calls are context columns, never the ranking.

## 15. Founder MIS hierarchy

L1 Today / L2 Team / L3 Leads / L4 Student 360 / L5 Activity / L6 Data
Quality. **FACT:** L1/L2 exist (Tower), L3 exists (`/admin/leads` + filters),
L4 exists (admin 360 + rep 360), L6 exists (12 checks + audit trail). Phase 2
adds the capacity panel to L2; Phase 3 adds retention-outcome columns to L1/L2
and the weekly digest. **L5 as a standalone "every action" browser: do not
build** — `sales_activity` history renders per-student and per-rep already,
and `admin_audit_log` holds the rest; build a browser when a real question
goes unanswerable without it (§21-challenge 6). L3 "source" filter: **not
buildable honestly** — acquisition attribution is not instrumented; no column
until Growth-OS instruments it.

## 16. Zero-data honesty

Already structural (§10). Phase 2/3 additions inherit the same classes, plus
one new one this gate mandates for capacity: a rep with no `sales_rep_config`
row renders **NOT CONFIGURED**, never "capacity 0" — the founder must never
read "0 available" when the truth is "I haven't set her numbers yet". "Can I
send 20 more leads today?" answers with Σ assignable_now and the per-rep
split, or says which input is missing.

## 17. Security model

Unchanged and verified: reps reach owned + unclaimed only; all checks
server-side; deny on unresolvable; no existence oracle; sales tables
RLS-deny-by-default (service-role only); rep writes limited to CRM truth
through one validated route; product/payment tables write-revoked to clients;
no CRM path can touch premium (TRUST-OS). Phase 2 additions: `sales_rep_config`
admin-write / rep-read-own; engine runs service-role; every engine write
guarded (`owner_id IS NULL`) and audited.

## 18. Scaling model (2 → 5 → 20 → 100 reps · 800 → 100k students)

Engine math is O(reps). At 5 reps: nothing changes (config rows). At 20:
`team_id` in config, two-stage allocation, SLA auto-reassign within team. At
100: pool partitioning + materialized workload rollups. Students: queue is
CAP-bounded and chunk-read; 360 is per-student; timeline windowed+paged; MIS
joins windowed, rollups only when measured slow (SCALE-CONTRACT §6 forbids
building them now). Known non-sales debt logged: `student_events` has no TTL —
decide before 100k, not now.

## 19. KEEP / REUSE / CONSOLIDATE / DEPRECATE / DELETE / UNKNOWN

- **KEEP:** everything in §5 marked KEEP (the entire canonical spine).
- **REUSE (Phase 2/3 build on, never beside):** Exception primitive
  (`owner:'sales'`), `scale-config.ts` for thresholds, `admin_audit_log`,
  Tower lib, `sendAdminAlert` for the digest.
- **CONSOLIDATE:** C1 weakness, C2 convScore, C3 lane-authority declaration;
  D4 timelines at entity-graph time.
- **DEPRECATE:** legacy `owner`/`actor` TEXT + `claim_lead(uuid,text)` (drop
  after soak, already scheduled); `student_crm` dual-write (zero readers —
  recommend: stop the trigger, freeze the table, fold into
  PROFILES-SPLIT-PLAN — founder decision F-b).
- **DELETE:** nothing this pass. Grep-unreferenced ≠ dead (learned lesson;
  `student_crm`'s trigger writes it with zero code references).
- **UNKNOWN:** whether Expedify can echo `external_ref` (still never asked —
  the standing external blocker); whether the human team will use Expedify at
  all (F-a below).

## 20. Recommended phases (minimum that separates risk)

| Phase | Objective | DB | Depends on | Rollback | Acceptance |
|---|---|---|---|---|---|
| **1 ✅** | Rep foundation (queue lanes, WHY, 360, dnd) | `20260824b` (applied) | — | revert commit | delivered; 3,124 tests |
| **1.5** | This gate + C1–C4 | none | founder approves this doc | revert | weakSection on sales = planner's, with source; one scoreConversion(); lane-authority guard; WHY + pain_points on 360 |
| **2** | Capacity + auto-intake + SLA | `sales_rep_config`; `lead_outreach.assigned_at`, `first_contact_sla_due` (additive) | F3 numbers, F7 identities, C1–C2 merged | engine kill-switch (global flag + per-rep active=false); revert | every assignment audited+explainable; idempotent under concurrent runs (guarded write proven by test); capacity panel answers "20 more leads?"; unconfigured rep = NOT CONFIGURED |
| **3** | Outcome measurement + MIS | none (read model only) | 2+ weeks of CRM rows | revert | Day-1/3/7 vs matched baseline, drill-down lists, "associated with" labeling, weekly digest |
| **4+ (wait)** | rep_temperature (F6), WhatsApp template pack for reps, cohort views, entity-graph 360 merge, teams/pods, events TTL | — | real usage data | — | — |

## 21. Co-founder challenge (the part you asked me not to soften)

1. **You do not need auto-assignment to onboard the hires.** The shared-pool
   model already works: both reps can start TOMORROW on `/sales` — the queue
   scopes unclaimed + own leads, claiming is atomic, nothing double-assigns.
   Auto-assignment's real value is *accountability* (SLA clocks need
   `assigned_at`), not lead flow. So: hire and start on the shared pool this
   week; land Phase 2 underneath them within the next. Do not let the engine
   delay the hires — the reverse dependency is false.
2. **Your Phase-2-then-3 order is right, but for a different reason than
   volume.** With 2 reps, capacity math is almost decorative — the reason
   Phase 2 still goes first is that outcome measurement (Phase 3) needs
   `assigned_at`/contact timestamps accumulating NOW. Every week without the
   SLA fields is a week of unmeasurable history.
3. **Stop wanting ATTEMPTED for human calls.** Without telephony (which I am
   not willing to buy at 2 reps — cost, consent complexity, and it changes
   how calls feel), every human call is a claim forever. The honest control
   is the outcome join: the student's own logging behaviour after the claimed
   call is the only witness that doesn't work for us. Phase 3 is therefore
   also your rep-integrity system — which is a better one than call
   recordings, because it measures what you actually pay for.
4. **The biggest hidden risk is a wrong sentence on a live call, not a wrong
   number on a dashboard.** C1 is exactly that: the sales surface can name a
   weakness the student's own planner contradicts. A student who hears the
   company disagree with itself about their prep stops believing both. This
   is why C1 outranks every dashboard item in this document.
5. **The most important thing before the two salespeople start:** C1 merged,
   their two logins created, capacity rows configured, and one 30-minute
   founder dry-run of the full loop (open queue → call → log → callback →
   next day it resurfaces) on the test project. Not more features.
6. **We are at risk of overbuilding the MIS.** L5 activity browser, source
   filters, cohort dashboards — at 5 paying customers and 0 CRM rows, every
   hour there is stolen from retention lanes that touch 780 students. The
   Tower's suppression discipline (rates UNAVAILABLE below 30 paid) is the
   correct embarrassment: most rate metrics will honestly read UNAVAILABLE
   for months. Let them.
7. **One assumption of yours I think is wrong:** "the founder should see
   whether calls are helping" as a daily number. Daily, per-rep, at this
   volume, that number is noise — 3 calls and 1 next-day log is 33% one day
   and 0% the next. Weekly, pooled across reps, against the matched baseline,
   it means something. The MIS should refuse to render it daily rather than
   render it and let you read noise as signal.

## 22. Founder decisions required (only what code cannot decide)

- **F3 (blocks Phase 2):** FT and PT — working hours (IST), max open, max
  new/day, first-contact SLA. Any realistic numbers; all become config.
- **F7 (blocks Phase 2):** the two hires' names/emails for `role='sales'`
  logins; is "Priya" one of them?
- **F-a:** calls stay human-manual for now, Expedify outbound stays frozen?
  (My recommendation: yes — revisit with 4 weeks of CRM data.)
- **F-b:** `student_crm` — stop the dual-write trigger and fold into the
  profiles-split plan? (Recommendation: yes.)
- **F-c:** `cat_test_leads` — one-time import into the pool as
  provenance='imported' leads, then retire the quiz writer? (Recommendation:
  yes, they are real phone numbers of real aspirants going to waste.)
- **F-d:** merge Phase 1 (`c0ff0f1`) + Phase 1.5 fixes to main together once
  C1–C4 land? (Recommendation: yes, one PR.)

## 23. Recommendations already argued: §21. ## 24. Risks

(1) C1 live-call contradiction — top, fix first. (2) Empty-CRM
overinterpretation — mitigated by evidence classes + suppression; keep them.
(3) Assignment races — designed out (guarded write, idempotent runs, audit);
must be TESTED with a concurrent-claim test before Phase 2 ships. (4) Capacity
misconfig — bounds + NOT CONFIGURED state. (5) Lane flooding — capped, but
revisit caps when signups pass ~500/week. (6) Metric gaming — provenance
discipline + outcome join; temperature (F6) stays a labeled belief. (7) Scope
creep into enterprise CRM — §20's Phase 4+ list is the fence.

## 24b. KNOWN OPEN DEBT — C0 is contained, not permanently solved

**Founder condition on accepting Phase 1.5 (24 Aug): keep this debt visible
rather than treating C0 as closed forever.**

C0 (a JSONB column rendered into JSX, crashing the rep's page) is fixed at the
point where it occurred, and a guard test pins the defect signature. But the
*class* of bug is not eliminated:

- **FACT:** Supabase rows arrive typed `any` throughout this codebase. If a
  future writer assigns a raw column onto a view object, TypeScript will not
  object — only the guard test catches it, and only for the three columns it
  names.
- **FACT:** the 3,124-test suite passed with a page-crashing bug in it,
  because no test renders that page. "Tests pass" is evidence about logic, not
  about screens. The same blind spot covers every other server-rendered sales
  surface.
- **RECOMMENDATION (not scheduled, deliberately):** a typed row contract at
  the Supabase read boundary would close the class, but it is a repo-wide
  change touching every read in the app — far outside sales, and not worth
  bundling into a sales phase. It belongs on the tech-debt register alongside
  the profiles-split and the `student_events` TTL.
- **Cheaper partial mitigation, worth doing when sales UI is next touched:**
  one smoke render of `/sales/student/[id]` against a student fixture that has
  a mock debrief. It would have caught C0 in one second.

## 25. Final go/no-go

**If I owned CareerRai: CONDITIONAL GO.** Phase 1 stands — nothing in it is a
second system, and its tests encode the founder's intent. The conditions are
C1 and C2 merged before Phase 2 code lands (C3/C4 in the same Phase 1.5 pass),
because building the capacity engine on top of a surface that can misquote a
student's weakness would be pouring concrete over a known crack. With C1–C4
done — under a day — Phase 2 is a GO the moment F3 and F7 arrive, and the two
hires can start on the shared pool even before that.
