# Insight Engine — Hostile Self-Audit

**Date: 18 Aug 2026.** Written against the standard the founder set: *assume 100,000
students, and assume the founder will reject even one false percentage, duplicate
insight, false plan-change claim, or inconsistent historical number.*

No implementation optimism. No defending the build plan. Where the plan is wrong, it is
marked wrong. Verdicts: **FAIL** (the design as written WILL produce the violation),
**RISK** (can violate under identified conditions; mitigation named but unbuilt),
**PASS** (design or existing system already prevents it, with evidence).

**Score: 12 FAIL · 7 RISK · 1 PASS.** The build plan is not ready. The external review
was right to withhold go.

---

## 0. Verdict on the external review's 20 attacks

**18 of 20 land. 3 are contradictions inside my own document. 2 I partly contest.**

| # | Attack | My verdict |
|---|---|---|
| 1 | Zero duplication needs event-identity AND claim-identity | **Conceded** — root cause of items 1, 2, 19 below |
| 2 | Partial unique index does not "simply lose" | **Conceded, and worse than stated** — see item 3: existing production code already returns 500 on this exact collision |
| 3 | Tap identity stated two incompatible ways | **Conceded** — my document literally says both `student:SECTION_PROGRESS:QA:date` (Part 3) and "key on the completion row id" (Part 2F) |
| 4 | "Tap" undefined for untick/re-tick | **Conceded, and I found a deeper form** — see item 4 |
| 5 | Numeric-subset validation is too weak | **Conceded — the strongest attack in the review.** The counterexample defeats it completely |
| 6 | Ban LLM claim text in v1–v3 | **Accepted** — stricter than my draft, and correct |
| 7 | `insight_state` cannot serve deltas | **Conceded — a self-contradiction.** PK(student_id, fact_key) stores exactly one row while the same document promises snapshot deltas |
| 8 | rule_version ≠ fact_definition_version | **Conceded** — I conflated a threshold change with a denominator change |
| 9 | Percentage needs full provenance | **Accepted** |
| 10 | Combined-insight UX too complicated | **Partly contested** — the founder's Law 1 explicitly requires tap feedback, so three touches is the *requested* behaviour, not an accident. The review's separation of *backend supersession* from *surface budget* is right and accepted; the conclusion "too complicated" is not, provided the student never sees the chain |
| 11 | Every tap ≠ every tap gets a persisted row | **Conceded** — see items 15, 16 |
| 12 | Silence conflicts with Law 1 | **Conceded** — see item 14 |
| 13 | Kill-switch OFF must equal pre-engine, as a test | **Accepted** — see item 19 |
| 14 | Don't let the planner rule creep | **Accepted** (agrees with the plan) |
| 15 | Mock edit/delete UX undefined | **Conceded** — I flagged it myself and still shipped no rule |
| 16 | Never call a self-report "wrong" | **Accepted** — product-language law, added |
| 17 | Escalation state machine missing | **Conceded** — see item 11 |
| 18 | "Why this insight won" rule missing | **Conceded** — impact levels existed, deterministic selection did not |
| 19 | Data dedup ≠ experience dedup | **Conceded** — same root as attack 1 |
| 20 | notice→action denominator can cheat | **Accepted** — actionable/non_actionable classification required |

**Two findings the review did not have**, both from production verification today:
- The existing tick route already fails the idempotency standard (item 3).
- Coverage advance is **asymmetric** — ticking advances it, unticking does not reverse it
  (item 4). This has direct consequences for tap-insight truthfulness.

---

## 1. Event identity vs insight identity — **FAIL**

**Evidence:** `docs/INSIGHT-ENGINE-BUILD-PLAN.md` §1.5 defines one key,
`identity_key = student:rule:subject:window_bucket`, and uses it for both "has this action
already been processed" and "has this conclusion already been shown".

Those are different questions with different lifetimes. A completion row is processed
once, forever. A conclusion may legitimately recur weeks later. Binding both to one key
means either the action can be double-processed (if the key is claim-shaped) or the
conclusion can never recur (if the key is event-shaped).

**Required correction:** two keys.
`event_key = student:completion_row_id:processing_type` (idempotency, permanent) and
`claim_key = student:rule_id:subject:claim_family` (recurrence, governed by cooldown +
state, **window belongs in evidence, never in identity**).

---

## 2. Cross-surface duplication — **FAIL**

**Evidence:** with `window_bucket` inside identity, the same conclusion under a 7-day
bucket and a 14-day bucket produces two rows that both pass the unique index. The Weekly
Story (planned to assemble from `insight_log`) would then legitimately restate what the
payoff card said on Monday. Different rows; identical student experience.

The founder's contract is explicit: *the same claim never reaches the same student twice
inside its cooldown, across ALL surfaces.* The current design cannot enforce it.

**Required correction:** experience-level dedup keyed on `claim_family` + a per-surface
budget, independent of the data-level uniqueness constraint.

---

## 3. Concurrent tap/log requests — **FAIL** (and the existing route already fails it)

**Evidence, verified in production today:**
`routine_task_completions` carries `UNIQUE (student_id, routine_date, task_id)`
(`pg_constraint`, verified). `src/app/api/routine/complete-task/route.ts:65-88` does a
**read-then-write**: `maybeSingle()` for an existing completion, then `insert()` on the
else-branch. Two concurrent taps on one task both read null, both insert, the second hits
the unique violation, and the route returns
`{ error: 'Could not save that tick — try again.' }` with **HTTP 500** (line 86-88).

So the plan's phrase "the second insert simply loses" is factually wrong, and the same
pattern already exists in production code. Under the new engine this becomes worse: a
duplicate tap would produce an error *and* an ambiguous insight state.

**Required correction:** `insert ... on conflict do nothing` + re-read, so a duplicate
request converges to the same result and the same single insight, returning 200. Proven
by a real-concurrency test (the technique already used in installment 2's dedup proof).

---

## 4. Untick / re-tick behaviour — **FAIL**, with a deeper problem than the review found

**Evidence:** `complete-task/route.ts:73-80` (delete branch) removes the completion row
and **does nothing else**. The coverage advance lives only on the insert branch
(lines 95-124, `applyConfidenceSignal` → `topic_coverage` upsert).

Therefore: **tick advances coverage; untick does not reverse it.** This is consistent
with the product's deliberate forward-only coverage philosophy (`highestStatus`,
"Green/blue are ADVANCING signals and must never move a topic down", line 114-117) — so
it is not a bug in the planner. But for the Insight Engine it is a trap:

> Student ticks → engine says *"QA coverage is now 24%"* → student unticks (mis-tap) →
> coverage stays 24% → the number the insight attributed to that tap no longer has the
> tap behind it.

That is not a false number, but it is a **false implied causality** — precisely what
Law 7 exists to prevent.

**Required corrections:** (a) only an `incomplete → complete` transition emits a tap
insight; untick emits nothing and invalidates nothing (the coverage claim remains true);
(b) tap claims must be phrased as state, never as causation — *"QA coverage: 24%"*, never
*"your tap moved QA to 24%"*; (c) re-tick after untick is idempotent under `event_key`
and must not emit a second insight.

---

## 5. Snapshot history — **FAIL** (self-contradiction in the plan)

**Evidence:** §1.3 defines `insight_state` with `primary key (student_id, fact_key)` —
exactly one row per fact, the latest. §3 of the same document promises *"deltas compare
two stored snapshots of the SAME fact_key + rule_version."* There is no second snapshot
to compare against. Every delta insight ("18% → 21%") is unbuildable as designed.

**Required correction:** append-only `fact_observation` (student, fact_key, value,
observed_at, effective_log_date, fact_definition_version, rule_version) as the immutable
history; `insight_state` demoted to a materialized latest-value cache derived from it.
This is also the only way item 18 (replay determinism) becomes meaningful.

---

## 6. Fact-definition versioning — **FAIL**

**Evidence:** the plan versions rules (`rule_version`) and, after the 18 Aug laws update,
stamps `syllabus_version` on ratio snapshots. But a threshold change (*"3 postponements"
→ *"4 postponements"*) and a denominator change (*QA has 28 topics"* → *"34"*) are
different events with different blast radii, and the plan treats version bumping as one
concept.

**Required correction:** `fact_definition_version` per registered fact (owns numerator,
denominator, source, rounding, effective date) versioned independently of
`insight_rule_version` (owns thresholds, windows, copy). A delta requires matching
**fact_definition_version**; a threshold experiment requires only a rule bump and must
not retire historical facts.

---

## 7. Percentage provenance — **RISK**

**Evidence (good):** denominators are uniform in production — QA 28, VARC 9, DILR 9,
exactly one distinct value each across all 415 students with coverage, matching
`EXAM_UNIT_COUNT = 46` (`src/lib/blueprint-builder.ts:120`). `safeRatio()` as specified
centralises numerator/denominator/definition/rounding.

**Why it is still RISK, not PASS:** (a) `effective_date` is absent from the specified
signature, so a mid-day definition change cannot be attributed to a point in time;
(b) 42 of 457 students have **zero** coverage rows — the null-denominator path is
specified and the 17-Aug floor handles it (`src/lib/log-insight.ts` falls through to the
logged-days line), but no test yet proves the new engine inherits that behaviour;
(c) nothing yet forbids a future component from computing its own ratio — the ban exists
in prose, not in a guard test.

---

## 8. Template numeric integrity — **FAIL**

**Evidence:** the plan's check is "extract numerals from the rendered claim, assert each
appears in the evidence object" (§1.6). The review's counterexample defeats it: evidence
`{qa_completed: 8, dilr_completed: 3}` and claim *"You completed 3 QA topics"* passes the
check and is false. Cross-definition mixing ("18% under v1 → 21% under v2") also passes.

The check validates *presence*, not *provenance*. It is worth keeping as a backstop but
cannot be the guarantee.

**Required correction:** claims carry no human-authored numeric literal at all. Templates
reference typed placeholders (`{{qa_syllabus_coverage.current.pct}}`), the renderer
resolves each against a typed fact with its own definition version, and a guard test
rejects any template string containing a bare digit.

---

## 9. Mock edit/delete propagation — **FAIL**

**Evidence:** `mock_debriefs` is an upsert on (student_id, log_date)
(`src/app/api/logging/mock-debrief/route.ts:146-150`), so a correction silently
overwrites the row that an already-surfaced insight cited. The plan names an
`invalidated` state and admits the UX is undesigned (§7 item 9). Naming a state is not a
rule.

**Required correction:** evidence refs pin the source row *and* its version/updated_at;
on material change, dependent insights transition to `invalidated`, are never re-surfaced,
and are never silently recomputed as though they had always said the new thing. Whether
the student is told is a separate, deliberate product decision — the default is silence
plus internal truthfulness.

---

## 10. 3 AM IST day boundary — **RISK**

**Evidence:** a single day authority exists and is well-documented —
`getLogDateString()` / `studyDayString()` in `src/lib/streak-utils.ts` (fixed +5:30
offset, deliberately timezone-independent after a real bug where server-local
`setHours(3)` misdated logs made 03:00–08:30 IST). `complete-task/route.ts:49` uses it.

**Why RISK:** the plan's `EvidenceWindow` utility is specified but no guard test yet
forbids new insight code from constructing its own boundary (`new Date().toISOString()
.split('T')[0]` is one line away). A 14-day window computed two ways in two modules is
exactly how "Insight says 3, Notification says 2" is born.

---

## 11. Cooldown + escalation — **FAIL**

**Evidence:** the plan specifies `cooldownDays` per rule and nothing else. The review's
scenario is decisive: DILR postponed on days 1, 3, 5, 7, 9 with a 7-day cooldown means
the engine watches a *worsening* pattern in silence, then repeats the identical sentence
on day 8. Both behaviours are wrong.

**Required correction:** an escalation state machine
(`OBSERVED → EMERGING → REPEATED → PERSISTENT → IMPROVING → STABLE`), where new evidence
can break cooldown *only by changing state*, and each state owns distinct copy. Repetition
of the same state is forbidden; progression to a new state is required to speak.

---

## 12. Insight invalidation — **FAIL**

Same root as item 9, broader scope: any evidence source can change after a claim is
surfaced (coverage corrected, plan regenerated, mock edited, syllabus version bumped).
The plan defines the state name and no transition rules, no ownership, no re-surface ban.

---

## 13. Planner receipt integrity — **RISK**

**Evidence (good):** the single planner authority is real and test-enforced —
`buildDayPlan()` (`src/lib/plan-day.ts`) over `chooseSectionDay` + `dayShape`, with
`planner-unification.test.ts` failing CI if anything else calls the selector. Phase 1
only *voices* the existing `postponedBonus` (+50, the highest single weight in
`topic-selector.ts`) rather than adding a write path. That is the right shape.

**Why RISK:** the plan carries an unresolved `[re-verify at build]` on the exact
storage of the postponement signal. A `plan_change_ref` that cannot be resolved back to a
concrete row makes Law 7 unenforceable at runtime, and the Gate would then be refusing
every adapt-claim — silently degrading the most valuable insight class.

---

## 14. Fallback when the engine fails — **FAIL as written**

**Evidence:** the plan states "runtime failure = log + silence" (§1.6) while Law 1
requires every successful log to produce an insight. A failure in the fact layer
therefore violates Law 1 by design.

The distinction the plan misses: **evidence insufficiency** (correct answer: degrade to a
lower earned level) versus **system failure** (correct answer: fall back to the existing
trusted floor). The floor already exists and is already in production —
`src/lib/log-insight.ts`, shipped 17 Aug, 13 tests — and the log route already calls it
inside a `try/catch` that cannot break the log path.

**Required correction:** the Gate's silence applies to *unearned claims only*. Engine
exceptions fall through to the 17-Aug floor, never to nothing.

---

## 15. Scaling 10k → 100k students — **FAIL** for the persist-every-tap design

**Evidence, measured today:** `routine_task_completions` = 244 rows all-time, 70 in the
last 7 days across 457 students. Current tap rate is ~0.02/student/day — nowhere near the
5/day the projection assumes, so this is a *future* failure, not a present one.

At the review's assumption (100k students × 5 taps/day) the tap-insight table reaches
~182M rows/year with a lifecycle state machine and a partial unique index on each. For
scale, today's largest tables are `student_events` 92,679 and `notifications` 46,227 —
the projection is ~2,000× the largest table in the product.

**Required correction:** separate the *user-facing guarantee* ("every tap gets an
immediate, idempotent, computed payoff") from the *storage decision*. L1 tap facts can be
computed and returned without a persisted lifecycle row; persist lifecycle only for L3+
insights, plus a per-student-per-day tap aggregate for measurement. This must be
benchmarked, not assumed.

---

## 16. Database / index growth — **FAIL** (same root as 15)

The partial unique index (`where state in ('generated','surfaced')`) keeps the *index*
small, which is good, but the table itself grows unbounded under the persist-every-tap
design. No retention/archival policy is specified for `insight_log` or
`fact_observation`. At minimum: cold-archive resolved/expired insights beyond N months,
and roll `fact_observation` into daily granularity beyond the delta window.

---

## 17. RLS / security — **PASS**, with one standing caution

**Evidence, verified today:** `rowsecurity = true` on all seven tables the engine would
read — `routine_task_completions`, `topic_coverage`, `daily_routines`, `daily_reports`,
`mock_debriefs`, `study_action_log`, `notifications`.

**Caution (not a failure):** the engine will run server-side under
`createAdminClient()`, which bypasses RLS by design — as every existing route does. The
discipline that must hold: every query filters by the authenticated `user.id`, and no
insight may ever contain another student's data. Peer comparison is Peer Pulse's domain,
with its own 250-active-student density gate; the Insight Engine must not become a second
route to cross-student numbers.

---

## 18. Replay determinism — **RISK**

The plan promises `rebuildInsightState(studentId, ruleVersion)` from canonical events.
That promise is only meaningful once immutable fact observations exist (item 5) and the
day boundary is centrally enforced (item 10). As written, replay would rebuild from
mutable current state — which is not replay, it is recomputation, and it cannot reproduce
what a student was actually told last month.

---

## 19. Migration / rollback — **RISK**

`INSIGHT_ENGINE_ENABLED` is specified (following the verified `mentorDoorsEnabled`
pattern). What is missing is the review's exact demand: an automated contract test
proving **OFF == the pre-engine experience, byte for byte** — same log response shape,
same payoff card, same floor line. Without that test, the kill-switch is a hope.

Migrations themselves are low-risk (two new tables, additive, no changes to canonical
stores) and revertible per phase — but the store freeze still applies: branch-only until
the founder authorises application.

---

## 20. Existing mechanisms this could bypass — **RISK**

Three specific bypass routes, all currently unguarded in the plan:

1. **Notification budgets.** Insight pushes must go through `dispatch()`
   (`src/lib/notification-os.ts:110-150`, per-student daily budgets 4/8/8) and never call
   `sendPushToUser` directly, which would still respect the hard 10/day cap but bypass
   the state machine that keeps a "revision due" nudge away from a quiet student.
2. **The metric registry.** Every number the engine surfaces must be registered
   (`src/lib/metric-registry.ts`) or the product regains exactly the class of unverified
   number that registry was built to eliminate.
3. **Coverage forward-only rule.** The engine reads `topic_coverage` but must never
   write it; the only writers are the confidence path and the evidence path, and
   `exam_ready` is DB-trigger-protected.

---

## What must change before Phase 0 is even written

The four corrections the external review demanded, restated with the two additions found
here:

1. **Split event identity from claim identity** (items 1, 2, 19).
2. **Replace numeric-subset validation with typed fact/template provenance** (item 8).
3. **Fix snapshot/history architecture** — append-only `fact_observation`, `insight_state`
   as cache; and split `fact_definition_version` from `insight_rule_version` (items 5, 6).
4. **Formalise cross-surface dedup, escalation, and invalidation** (items 2, 11, 12, 9).
5. **[new] Make the tick route idempotent** before anything reads it as an event source
   (item 3) — this is an existing production defect, independent of the engine.
6. **[new] Define tap-insight semantics against forward-only coverage** — state claims,
   never causal ones (item 4).

Plus the storage decision (items 15, 16) and the OFF==pre-engine contract test (item 19).

**Recommendation: the founder's HOLD is correct.** The concept, the ladder, the registry
pattern, the planner boundary and the build discipline are sound and should not be
relitigated. The identity, provenance, history and lifecycle layers are not yet safe
enough to carry the founder's own standard — *CareerRai may be silent when evidence is
insufficient, but it must never be confidently wrong.*
