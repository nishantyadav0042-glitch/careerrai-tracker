# Phase 0 — Integrity Specification

**Status: CONTRACT. Date 18 Aug 2026.** This supersedes the Phase-0 sketch in
`docs/INSIGHT-ENGINE-BUILD-PLAN.md`. It is the agreement between the founder and whoever
implements the memory/insight layer — human or model. It is written to be implemented
literally, not interpreted.

Companions: `docs/INSIGHT-ENGINE-AUDIT.md` (why each clause exists — 12 FAIL / 7 RISK
that produced it), `docs/RETENTION-STRATEGY.md` (why the system exists at all),
`docs/PRODUCT-KNOWLEDGE-BASE.md` (the current system it must not break).

---

## THE CONSTITUTION

> **CareerRai must never know less than it has already recorded, and it must never claim
> more than it can prove.**

Every clause below exists to make one half of that sentence structurally true.

## THE IMPLEMENTATION CONTRACT

Whoever implements this agrees to all seven, per phase-0 item:

1. **Prove the boundary before changing it.** Re-read the exact files/tables/constraints
   the item touches in the same session that writes the code. This document's citations
   are evidence as of 18 Aug, not permission to skip verification.
2. **Every invariant gets a failing test first.** Red, then green. A test written after
   the implementation proves the implementation, not the invariant.
3. **Every migration is reversible**, and its `down` is exercised at least once.
4. **Every new write path is idempotent**, proven under real concurrency, not asserted.
5. **Every derived fact is reproducible** from canonical events plus a version.
6. **Every claim is evidence-backed** — no claim ships without resolvable receipts.
7. **No existing behaviour changes unless it is explicitly listed in this document.**

## THE PHASE-0 RULE

**Phase 0 ships ZERO user-facing change.** No new copy, no new card, no new notification,
no altered response the client renders. Every item below is infrastructure and tests. The
single exception already taken is 0A, which fixes an existing production defect.

If a student could notice Phase 0 shipped, Phase 0 was implemented wrong.

---

## 0A — Tick idempotency · **DONE (commit c2faa3b, 18 Aug)**

**Contract:** N simultaneous requests representing the same logical completion converge
to one completion state and one canonical event — never an error, never a duplicate,
never two derived writes.

**Shipped:** `23505` on insert treated as convergence (any other insert error keeps its
500); coverage advance runs only on the request that created the row; untick deletes by
natural key so a duplicate untick is a no-op; the response is read back from the table
rather than assembled from what the request believed it wrote.

**Guarded by:** `src/lib/tick-idempotency.guard.test.ts` (6 tests).

**Residual, deferred deliberately:** a genuine tick-vs-untick race (two *different*
intents arriving together) still resolves by arrival order. That is inherent to a toggle
API and is not a Phase-0 blocker; if it ever matters, the fix is an explicit desired-state
parameter, which changes the client contract and belongs to its own change.

---

## 0B — Canonical event contract

**Contract:** every student action the memory layer reads has exactly one canonical
record, already existing, which the new layer **reads and never writes**.

| Action | Canonical record | Identity |
|---|---|---|
| Day logged (incl. rest) | `daily_reports` (one row / student / IST day, written by `upsert_log_and_streak`) | `(student_id, report_date)` |
| Task ticked | `routine_task_completions` | `(student_id, routine_date, task_id)` — UNIQUE, verified |
| Plan generated | `daily_routines` | `(student_id, routine_date)` |
| Coverage changed | `topic_coverage` | `(student_id, section, topic)` |
| Mock recorded | `mock_debriefs` | `(student_id, log_date)` |
| Recommendation shown | `study_action_log` | row id |

**Tests first:**
- `insight-no-write.guard`: source scan proving no file under `src/lib/insights/**` or
  `src/lib/facts/**` contains a write verb (`insert(`, `update(`, `upsert(`, `delete(`)
  against any table in the table above. Technique: the existing
  `planner-unification.test.ts` grep style.

**Acceptance:** the guard passes and is wired into CI.

**Must not:** introduce an events table, an event bus, or event sourcing. The records
above are the event log.

---

## 0C — Fact Registry

> **Boundary between 0B and 0C (founder, 18 Aug — do not duplicate work across them):**
> **0B owns STRUCTURAL WRITE-BOUNDARY INTEGRITY** — *the fact layer cannot reach a
> database at all.* Proven by `canonical-boundary.guard.test.ts` (transitive closure, two
> barriers). **0C owns FACT COMPUTATIONAL INTEGRITY** — *this particular producer computes
> its fact correctly, from the approved source, with an honest denominator and an explicit
> temporal definition.* Two different guarantees.
>
> 0C therefore does **not** re-implement DB-write or client-import guards; 0B already
> makes those structurally impossible. 0C **does** own the semantic correctness tests for
> every producer it registers. Purity is inherited; correctness is earned per fact.

**Contract:** every measurable quantity the product will ever state to a student has
exactly one producer, registered once. A component that needs a number asks the registry;
it never computes one.

```ts
export interface FactDef {
  key: string;                 // 'qa_syllabus_coverage' — never generic
  definitionVersion: string;   // 'v1' — bumped when the MEANING changes
  unit: 'count' | 'ratio' | 'days' | 'percentile';
  means: string;               // what a human should believe reading it
  source: string;              // the canonical table (0B)
  numerator?: string;          // required when unit === 'ratio'
  denominator?: string;        // required when unit === 'ratio'
  expectedDenominator?: number;// when fixed: 28 / 9 / 9, verified in production
  rounding?: 'round' | 'floor' | 'none';
  produce: (input: FactInput) => FactValue | null;  // pure. no I/O. no LLM.
}
```

**Named definitions are mandatory.** `qa_syllabus_coverage` ≠ `daily_plan_completion` ≠
`weekly_plan_adherence` ≠ `section_topic_completion`. A key named
`completion_percentage` is rejected by test — it is the ambiguity that produces "5 of 10
planned = 50%" being rendered in a sentence about syllabus coverage.

**`safeRatio` is the only ratio producer in the product:**

```ts
safeRatio(num, denom, opts): { pct, num, denom, definition, definitionVersion } | null
```

Returns **null, never a number**, when: `denom <= 0`; `denom !== expectedDenominator`
where one is declared; either input is non-finite or negative. Callers handle null by
rendering counts (Law 6), never by substituting 0.

**Tests first:**
- `fact-registry.guard`: every key unique; every `ratio` fact declares numerator,
  denominator and rounding; no key matches `/^completion_percentage$/` or other banned
  generics; every `produce` is pure (source scan: no supabase/fetch import in the facts
  module).
- `safe-ratio.guard`: null on denom 0, denom mismatch, NaN, negative; identical inputs →
  identical output (determinism); rounding applied exactly once.

**Acceptance:** at least these facts registered and passing —
`qa_syllabus_coverage`, `varc_syllabus_coverage`, `dilr_syllabus_coverage`,
`section_topics_remaining`, `logged_days_last_7`, `logged_days_total`.

**Verified inputs (18 Aug):** denominators are uniform in production — QA 28, VARC 9,
DILR 9, one distinct value each across all 415 students with coverage, matching
`EXAM_UNIT_COUNT = 46` (`src/lib/blueprint-builder.ts:120`). 42 of 457 students have zero
coverage rows; for them every ratio fact must return null.

**Must not:** compute anything the existing modules already own. `isOpened` /
`isAtRevisionDepth` / `isCovered` come from `src/lib/coverage-status.ts`; the day boundary
comes from `getLogDateString()`. Re-spelling either is what
`covered-authority.guard.test.ts` already forbids — and already caught once, on 18 Aug.

---

## 0D — Fact history (append-only) and materialised state

**Contract:** history is immutable; current state is a cache derived from it. Never the
reverse. This is what makes "why did CareerRai say 24% yesterday?" answerable.

```sql
create table fact_observation (            -- APPEND ONLY. No update, no delete.
  id                  bigint generated always as identity primary key,
  student_id          uuid not null references profiles(id) on delete cascade,
  fact_key            text not null,
  value               jsonb not null,
  definition_version  text not null,
  effective_log_date  text not null,       -- the IST study day it describes
  observed_at         timestamptz not null default now(),
  source_event        jsonb not null       -- {table, pk, updated_at} of the trigger
);
create index on fact_observation (student_id, fact_key, effective_log_date desc);

create table fact_state (                  -- cache: latest observation per fact
  student_id  uuid not null references profiles(id) on delete cascade,
  fact_key    text not null,
  value       jsonb not null,
  definition_version text not null,
  observation_id bigint not null references fact_observation(id),
  primary key (student_id, fact_key)
);
```

**Delta rule:** a delta may be computed only between two observations sharing the same
`fact_key` AND the same `definition_version`. Mismatch ⇒ **no delta is rendered**; the
student sees a fresh baseline. This is what makes a definition correction structurally
incapable of masquerading as student progress.

**Tests first:**
- `fact-history.guard`: source scan proving no `update`/`delete` against
  `fact_observation` anywhere.
- `fact-delta.guard`: mismatched `definition_version` ⇒ delta is null; matched ⇒ delta
  computed from the two stored values, never from a live recompute.
- `fact-state-derived.guard`: `fact_state.observation_id` always resolves, and its value
  equals that observation's value.

**Acceptance:** writing a fact twice produces two observations and one updated cache row.

**Must not:** store history in the insight row. The insight cites observations by id.

---

## 0E — Evidence contract

**Contract:** an evidence object is a set of typed references that a reader can resolve
back to canonical rows. Prose is not evidence.

```ts
export interface EvidenceRef {
  kind: 'fact' | 'event';
  factKey?: string;            // kind='fact'
  observationId?: number;      // kind='fact' — pins the exact observation
  table?: string;              // kind='event'
  pk?: string;                 // kind='event'
  sourceUpdatedAt?: string;    // kind='event' — pins the version (0H invalidation)
  label: string;               // human line for the receipts sheet
}
```

**Tests first:**
- `evidence-resolve.guard`: every ref in a generated insight resolves to a live row;
  unresolvable ⇒ the Gate refuses (0I).
- `evidence-nonempty.guard`: no insight reaches `surfaced` with zero refs.

**Acceptance:** a receipts payload can be produced for any insight without re-querying
business logic — refs alone are sufficient.

---

## 0F — Claim registry (typed templates, zero authored numbers)

**Contract:** claims are *derived*, never authored. A template contains no numeric
literal; every number is a typed placeholder resolved from a fact.

```ts
export interface ClaimTemplate {
  id: string;                  // 'QA_COVERAGE_STATE'
  ruleVersion: string;
  placeholders: string[];      // ['qa_syllabus_coverage.current.pct', ...]
  render: (bag: ResolvedFacts) => string;
  countFallback: (bag: ResolvedFacts) => string; // used when a ratio resolves null (Law 6)
}
```

**Why this replaces the numeric-subset check:** the audit showed subset validation is
defeated by evidence `{qa: 8, dilr: 3}` rendering *"You completed 3 QA topics"* — the
number exists, the claim is false. Provenance beats presence. The subset check is retained
only as a cheap backstop.

**Tests first:**
- `claim-no-literals.guard`: no template string contains a bare digit; every placeholder
  names a registered fact key that exists in the registry.
- `claim-fallback.guard`: for every template with a ratio placeholder, a `countFallback`
  exists and renders without that ratio.
- `claim-render.determinism`: same resolved facts ⇒ byte-identical string.

**Must not:** let an LLM produce, alter, or re-phrase claim text in Phases 0–3. Not as a
convenience, not behind a flag. The deterministic claim is the canonical claim.

---

## 0G — Identity system: event identity ≠ claim identity

**Contract:** two keys, two lifetimes, never conflated.

| | `event_key` | `claim_key` |
|---|---|---|
| Answers | "did we already process this action?" | "did we already tell the student this?" |
| Shape | `student:source_table:source_pk:processing_type` | `student:rule_id:subject:claim_family` |
| Lifetime | permanent | governed by cooldown + state (0H) |
| Window | — | **never in the key; the window lives in evidence** |

The audit's finding: the build plan used one key containing `window_bucket`, so the same
conclusion under a 7-day and a 14-day window produced two rows that both passed the unique
index — different rows, identical student experience.

**Tests first:**
- `identity-shape.guard`: `claim_key` construction contains no date/window component
  (source scan + unit test on the builder).
- `identity-collision.guard`: same action processed twice ⇒ one event_key row; same
  conclusion from a 7d and a 14d window ⇒ one claim_key.

---

## 0H — Four separate mechanisms

They are not variants of one idea and must not share code paths.

**1. Deduplication** — "did we process this twice?" Enforced by `event_key` uniqueness
plus DB constraint. Duplicate ⇒ converge, return the same result, never error (the 0A
standard, now generalised).

**2. Cooldown** — "have we said this recently?" Per-rule `cooldownDays` on `claim_key`.
Additionally an **experience budget**, independent of storage: at most one transient tap
notice live at a time; one combined payoff per log; a push only if it carries information
not already surfaced today; the weekly story synthesises and never restates a line the
student already read.

**3. Escalation** — "has the same problem become materially worse?" A state machine, the
only legitimate way to break cooldown:

```
OBSERVED → EMERGING → REPEATED → PERSISTENT → ACTIONED → IMPROVING → STABLE
                                                              ↘ REOPENED
```

Each state owns distinct copy. Re-entering the same state may not speak; progressing to a
new state may. This is what stops both failure modes: silence while a pattern worsens, and
the identical sentence five times.

**4. Invalidation** — "did the evidence change under us?" Every `EvidenceRef` of kind
`event` pins `sourceUpdatedAt`. On material change the dependent insight transitions to
`invalidated`, is never re-surfaced, and is **never silently recomputed as though it had
always said the new thing**. Whether the student is told is a separate product decision;
the default is silence plus internal truthfulness.

The concrete trigger this exists for: `mock_debriefs` is an upsert on
`(student_id, log_date)`, so a corrected mock overwrites the row an already-surfaced
insight cited.

**Tests first:** one guard per mechanism, plus `mechanisms-separate.guard` asserting no
single function implements two of them.

---

## 0I — Integrity Gate

**Contract:** a pure function between claim generation and any surface. It cannot be
bypassed; there is exactly one path to a surface and it runs through the Gate.

```
refs resolve? → definition_versions match across the claim? → confidence ≥ rule minimum?
  → kind='adapt' ⇒ plan_change_ref resolves to a real daily_routines write?
  → claim_key free under cooldown/state? → numeric backstop passes?
  ⇒ PASS | WITHHOLD
```

**The Law-1 correction (audit item 14):** the Gate distinguishes two failures.

- **Unearned claim** (evidence insufficient) ⇒ withhold this claim, degrade to a lower
  earned level. Silence only if no level is earned.
- **System failure** (exception, unavailable dependency) ⇒ fall through to the existing
  trusted floor, `src/lib/log-insight.ts` (shipped 17 Aug, 13 tests, already wrapped in a
  try/catch that cannot break the log path). Never to nothing.

Law 1 therefore survives an engine outage, which is the whole point of having a floor
that predates the engine.

**Tests first:** `gate-single-path.guard` (source scan: no surface imports a claim
producer directly); `gate-degrade.guard` (insufficient evidence ⇒ lower level, not
silence); `gate-failure-floor.guard` (thrown exception ⇒ floor line, not empty).

---

## 0J — Replay

**Contract:** given the same canonical events and the same `definition_version` +
`ruleVersion`, replay reproduces the same facts and the same claims — byte for byte.

```ts
rebuildFactState(studentId, { asOf, definitionVersion }): void  // rewrites cache only
```

**Tests first:** `replay-determinism.guard` — fixture events → facts → claims, run twice,
identical; and replaying after a cache wipe reproduces the same `fact_state`.

**Must not:** rewrite `fact_observation`. Replay rebuilds the cache, never the history.

---

## 0K — Kill switch

**Contract:** `INSIGHT_ENGINE_ENABLED=false` ⇒ CareerRai behaves **exactly** as it did
before the engine existed. Not "mostly". Not "minus the new card".

**Tests first:** `engine-off-parity.guard` — with the flag off, the log-daily response
shape, the payoff card props, and the floor line are identical to the pre-engine
snapshot fixture. This is the review's explicit demand and the difference between a
kill switch and a hope.

**Pattern to follow:** `mentorDoorsEnabled()` in `src/lib/mentor-doors.ts` — recorded
always, granted only behind the flag.

---

## MIGRATION & ROLLBACK POLICY

Two new tables (`fact_observation`, `fact_state`) plus, in Phase 1, `insight_log`. All
additive; no column of any canonical table is altered. Each migration ships with a
`down`, exercised once before the `up` is applied to production.

The store freeze (`docs/STORE-FREEZE.md`) still governs: **branch-only, migrations
authored but not applied**, until the founder authorises application. Nothing in Phase 0
is a P0 incident, so neither freeze exception applies.

---

## DEFINITION OF DONE — PHASE 0

Every one of these, or Phase 0 is not done:

1. 0A–0K each have their guard tests green, written before their implementation.
2. Full suite green (baseline to beat: **1,826 passing, 1 skipped**, 18 Aug).
3. `INSIGHT_ENGINE_ENABLED=false` parity test proves zero user-visible change.
4. A replay run on at least 10 real students reproduces their current facts exactly.
5. Production verification queries, run live and recorded in the commit:
   - zero `fact_observation` rows with an unresolvable `source_event`
   - zero `fact_state` rows whose `observation_id` does not resolve
   - zero duplicate `event_key`
   - every registered ratio fact returns null for all 42 zero-coverage students
6. An honest written report: what was verified, what was assumed, what is still open.

**Only when all six hold does Phase 1 (the tap payoff) begin.**

---

## WHAT PHASE 1 INHERITS — AND WHAT IT STILL MAY NOT DO

Phase 1 may: surface L1/L2 facts on tap and on log, through the Gate, using registered
claims.

Phase 1 may **not**: introduce L3 patterns, mock intelligence, repeater reconciliation,
planner adaptation, or any LLM-generated text. Those are Phases 2–5 and each will earn
its own contract.

**Tap semantics, fixed now (audit item 4):** ticking advances `topic_coverage`; unticking
does not reverse it — a deliberate forward-only design
(`complete-task/route.ts`, `highestStatus`). Therefore a tap claim is a **state claim,
never a causal one**: *"QA coverage: 24%"* is permitted; *"your tap moved QA to 24%"* is
forbidden, because unticking would make the causal version untrue while the state version
stays true. Only an `incomplete → complete` transition emits a tap insight; untick emits
nothing and invalidates nothing.
