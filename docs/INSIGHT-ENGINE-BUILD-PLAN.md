# Insight Engine — Build Plan & Mechanism

**Date: 18 Aug 2026.** This is the HOW document — how the LOG → LEARN → NOTICE → ACT →
SHOW PROGRESS architecture actually gets built on the existing CareerRai codebase without
breaking a single working mechanism. Companion to `docs/RETENTION-STRATEGY.md` (the WHY)
and `docs/PRODUCT-KNOWLEDGE-BASE.md` (the current-state map).

Written to be shared with external reviewers (ChatGPT or anyone) for critique — Part 10
lists the exact open questions worth attacking. Everything marked **[verified]** was
checked against the live code/database on 17–18 Aug 2026; everything marked **[re-verify
at build]** must be re-checked in the same session that writes the code, because code
drifts.

---

## PART 0 — The locked contract (non-negotiable, from the founder)

1. **Insight at every tap.** A single task tick on Home produces an immediate,
   tick-scoped insight. A full log submission produces ONE combined insight — never a
   stack of per-task lines repeated at submit time.
2. **Zero duplication.** The same claim never reaches the same student twice inside its
   cooldown, across ALL surfaces (payoff card, push, weekly story). Dedup is a backend
   state, not a UI check.
3. **No fake insights, no percentage games.** Every number has exactly one definition,
   one source, one rounding rule. A student must never see a percentage move for any
   reason other than their own actions.

Plus the three laws locked in discussion:

- **Law 1:** Every successful log produces at least one earned insight — but the insight
  level may never exceed the evidence level. (L1 facts are always earned; that is why
  "always show" and "never manufacture" are compatible.)
- **Law 2:** Never show an insight merely because we need to show something. Evidence
  earns the level; silence beats an unearned claim.
- **Law 3 (explain = act):** Every actionable claim references the exact system action
  that occurred. No action reference → the language must say "we recommend", never "we
  changed". The claim and the plan-write must be the same object.

---

## PART 1 — Architecture mapped to what already exists

The founder's five-box diagram, with the honest inventory of each box:

```
STUDENT ACTION → CANONICAL EVENTS → FACT ENGINE → MEMORY/STATE
   → INSIGHT ENGINE → INTEGRITY GATE → {STUDENT NOTICE | ACTION REQUEST → PLANNER → RECEIPT}
```

### 1.1 Canonical events — MOSTLY EXISTS, do not rebuild

We do NOT introduce event sourcing. The founder is right to be conservative here. The
canonical, effectively-immutable records already are:

| Event | Canonical store | Verified |
|---|---|---|
| Day logged (incl. rest) | `daily_reports` (one row per student per IST day, written atomically by the `upsert_log_and_streak` Postgres RPC) | **[verified]** |
| Task ticked / unticked | `routine_task_completions` (insert = tick, delete = untick — `api/routine/complete-task`) | **[verified]** |
| Plan generated | `daily_routines` (one frozen row per student per day; rebuild gated by `plan-freshness.ts`) | **[verified]** |
| Topic postponed/swapped | plan-mutate/swap path feeding the topic-selector's `postponedBonus` (+50) | **[re-verify at build — exact table/column]** |
| Coverage state change | `topic_coverage` (status ladder, exam_ready evidence-gated by DB trigger) | **[verified]** |
| Mock entered | `mock_debriefs` (server-owned date, upsert on student+log_date) | **[verified]** |
| Recommendation shown/followed | `study_action_log` (shown_at → outcome reconciled by cron) | **[verified]** |
| Notification sent/received/clicked | `notifications` (`pushed_at` / `received_at` / `clicked_at`) | **[verified — 3,753 sends, 72% receipt, 1.1% CTR last 7d]** |
| Client behavior | `student_events` (append-only, batched) | **[verified]** |

**Rule: the Insight Engine READS these. It never writes any of them.**

### 1.2 Fact Engine — PARTIALLY EXISTS as scattered pure modules

`streak-utils.ts` (liveStreak), `prep-memory.ts` (firstTouchedDaysAgo, blueprint
confidence), `evidence.ts` (six-rung mastery), `section-weakness.ts`, `syllabus-pace.ts`,
`log-insight.ts` (shipped 17 Aug — the L1/L2 floor) are all already deterministic
fact-derivers. **The build formalizes this family under one roof rather than inventing
it**: new pure modules go in `src/lib/facts/` and existing ones get re-exported there
untouched, so there is one import surface and zero behavior change on day one.

The one genuinely new fact family: **behavior state over a window** — per-section
planned-vs-completed-vs-postponed counts over trailing 7/14/21 days, derived by joining
`daily_routines` tasks against `routine_task_completions`. The buddy briefing already
computes a version of this (plan-avoidance detection) **[verified]** — that logic gets
promoted into the shared fact module instead of living only in the briefing.

### 1.3 Memory/State — INCREMENTAL, not a rebuild

No giant JSON blob (founder is right — an LLM-rewritten memory blob is untrustable).
Structured state = the canonical tables above + ONE new derived table:

```sql
-- The only new "state" table in phase 1. Everything else derives live.
create table insight_state (
  student_id   uuid not null,
  fact_key     text not null,      -- 'dilr_postponements_14d', 'qa_opened_pct', ...
  value        jsonb not null,     -- {count: 3, window: '14d', asOf: '2026-08-18'}
  computed_at  timestamptz not null default now(),
  rule_version text not null,
  primary key (student_id, fact_key)
);
```

Why a keyed snapshot table and not live-compute-everywhere: (a) **deltas** — "18% → 21%"
requires yesterday's number stored under yesterday's definition; (b) **freshness contract**
— the post-log insight recomputes its facts synchronously in the same request (stale L1 is
unacceptable), then upserts the snapshot; heavy analytics read the snapshot async;
(c) **replay** — `rebuildInsightState(studentId, ruleVersion)` can regenerate every row
from canonical events at any time. Raw events untouched, exactly as the founder specified.

### 1.4 Insight Engine — NEW, built on an existing pattern

**The rule registry follows `metric-registry.ts` — a pattern this codebase already
trusts** **[verified]**. That file exists because five dashboard numbers were once wrong in
five different ways, and its fix was: every number a human sees is defined exactly once,
as an executable contract, checked by tests and a nightly integrity endpoint. The Insight
Rule Registry is the same idea one level up:

```ts
// src/lib/insights/rules.ts — every insight the product can produce, defined ONCE.
export interface InsightRule {
  id: string;                    // 'DILR_REPEATED_POSTPONEMENT'
  version: string;               // 'v1' — bumped on ANY threshold change
  level: 1 | 2 | 3 | 4 | 5;
  impact: 'low' | 'medium' | 'high';
  kind: 'inform' | 'reinforce' | 'diagnose' | 'adapt' | 'verify';
  factsRequired: string[];       // keys the Fact Engine must supply
  threshold: (facts: FactBag) => boolean;        // deterministic, no I/O, no LLM
  claim: (facts: FactBag) => string;             // template — numbers from facts ONLY
  evidenceRefs: (facts: FactBag) => EvidenceRef[]; // the receipts
  cooldownDays: number;
  supersedes?: string[];         // tap-level rule ids this combined rule absorbs
}
```

A guard test (mirroring `metric-registry.test.ts`) enforces: every rule has ≥1 evidence
ref producer, every L5 rule has an action mapping, no two rules share an id, and every
threshold is a pure function (no imports of supabase/fetch in the rules file — enforced
by grep-style test, the same technique `planner-unification.test.ts` already uses
**[verified]**).

### 1.5 The insight record — full lifecycle, stored

```sql
create table insight_log (
  id             bigint generated always as identity primary key,
  student_id     uuid not null references profiles(id) on delete cascade,
  rule_id        text not null,
  rule_version   text not null,
  level          smallint not null,
  impact         text not null,
  kind           text not null,
  claim          text not null,
  evidence       jsonb not null,        -- window, counts, refs to canonical rows
  confidence     text not null,         -- low | medium | high
  -- state machine: generated → surfaced → acted/acknowledged → resolved/expired
  --               | suppressed | duplicate | invalidated | superseded
  state          text not null default 'generated',
  surfaced_at    timestamptz,
  surfaced_on    text,                  -- 'tap_toast' | 'log_payoff' | 'push' | 'weekly_story'
  acted_at       timestamptz,
  action_ref     text,                  -- what the student did (task id completed, etc.)
  plan_change_ref text,                 -- Law 3: the exact plan-write, when 'adapt'
  expires_at     timestamptz,
  superseded_by  bigint references insight_log(id),
  -- ZERO DUPLICATION: one live instance of a claim per subject per window bucket
  identity_key   text not null,         -- student:rule:subject:window_bucket
  created_at     timestamptz not null default now()
);
create unique index insight_identity_live on insight_log (identity_key)
  where state in ('generated','surfaced');
```

That partial unique index IS the founder's zero-duplication guarantee, enforced by
Postgres, not by application discipline. A concurrent double-submit hits the index and
the second insert simply loses — the same DB-constraint-first philosophy as
`one_live_session_per_pair` and `no_overlapping_buddy_sessions` **[verified — both exist]**.

### 1.6 Integrity Gate — a pure function + a guard test, not a service

```
validateInsight(candidate): evidence refs resolve to real rows? → rule_version exists?
  → confidence ≥ rule minimum? → claim's numbers ⊆ evidence's numbers?
  → kind='adapt' ⇒ plan_change_ref resolves to a real daily_routines write?
  → identity_key free? → PASS | SILENCE (never an error, never an approximation)
```

"Claim's numbers ⊆ evidence's numbers" is mechanically checkable: extract numerals from
the rendered claim, assert each appears in the evidence object. Crude, but it makes an
entire class of fake-number bug structurally impossible — and it runs in tests AND at
runtime (runtime failure = log + silence, per the founder's rule).

### 1.7 Action path — through the ONE planner, receipts back

**[verified]** The planner authority is: `buildDayPlan()` (`plan-day.ts`) assembling
`chooseSectionDay` (`topic-selector.ts`) + `dayShape` (`routine-engine.ts`), with
`resolveFocusSections` (`focus-sections.ts`) as the focus chain — and
`planner-unification.test.ts` fails CI if anything else calls the selector directly.

The Insight Engine gets **zero new write paths into the plan**. Phase-1 'adapt' insights
only VOICE what the planner already did: the +50 `postponedBonus` **[verified — highest
weight in the scoring system]** already moves a postponed topic up; `focusBasis`
**[verified]** already carries the mock-override reason to the plan card. The insight
references the plan-write that the existing engine produced (`plan_change_ref` =
daily_routines row id + rule name). Later phases MAY propose new planner behaviors
(shortened restart blocks) — those get built INSIDE topic-selector/dayShape as weights,
reviewed against `plan-lifetime.gate.test.ts`, never as an external override.

---

## PART 2 — The founder's Section-30 audit (A–H), answered from verified knowledge

**A. Canonical data sources** — table in §1.1. One gap found: postponement's exact
storage needs pinning at build time (the signal demonstrably exists — the selector
consumes it — but I have not read the writing row's schema).

**B. Write paths & protection [verified]:**
- `daily_reports` + `streak_data`: single writer (`upsert_log_and_streak` RPC),
  transactional, `is_new_log` computed in-transaction; 15-second same-row rate limit at
  the route.
- `routine_task_completions`: complete-task route; tick idempotent-by-existence (insert
  checks existing row; untick deletes by id).
- `daily_routines`: two writers, both through `buildDayPlan()`; rebuild gated on zero
  ticked tasks (`plan-freshness.ts`); guard tests pin equivalence
  (`plan-day.equivalence.test.ts`).
- `mock_debriefs`: upsert on (student_id, log_date); server owns the date
  (`mock-date-authority.guard.test.ts`).
- `notifications`: dispatch() with per-student daily budgets + hard cap 10/day at
  `sendPushToUser` + `notification_duplicate_suppressions`.
- Generic idempotency: `src/lib/idempotency.ts` + `idempotency_keys` table exist
  **[verified]** — reuse for insight generation, do not invent a second mechanism.

**C. Planner authority:** §1.7. Exactly one assembly function, test-enforced.

**D. Reusable audit infrastructure:** `study_action_log` (the shown→outcome closed loop —
the Insight state machine is this pattern with more states), `decision_log` +
reconcile crons (notification decisions), `metric-registry` + nightly integrity endpoint,
`student_events` for surfacing telemetry.

**E. Existing constraints [verified]:** RLS on all student tables; exam_ready DB trigger;
plan uniqueness (20260814 migrations); session overlap exclusions; notifications budget
logic. The new `insight_log` adds its own partial-unique dedup index (§1.5).

**F. Race-condition map:**
- Two tabs ticking the same task → existence-check + delete-by-id makes it converge
  **[verified]**; per-tap insight must therefore key on the completion row id, so a
  double-fire produces one insight (identity collision).
- Log submit + complete-task fire in parallel from the client **[verified in
  DailyTrackerApp]** → the combined insight must be computed from the daily_reports write
  alone, never assuming completions have landed — and tap insights must not double-count
  into the combined one (supersession, §3).
- Midnight boundary: ALL windows must use `getLogDateString()`'s 3AM-IST day
  **[verified as the single day authority]** — the new `EvidenceWindow` util wraps it; a
  guard test greps that no insight code calls `new Date().toISOString().split` directly.
- Push retries: `sendPushToUser` retries transient failures **[verified]** — insight
  push notifications carry the insight id as tag, so a retry collapses.

**G. Existing guard tests to respect (never weaken):** `planner-unification`,
`plan-lifetime.gate`, `plan-day.equivalence`, `plan-integrity.guard`,
`mock-date-authority.guard`, `routine-hours.guard`, `metric-registry.test`,
`log-insight.test` (13 tests, 17 Aug), streak/check-in suites.

**H. Insertion points (attach here, touch nothing else):**
1. `api/routine/complete-task` response — ADD tap-insight (it already returns to the
   ticking UI; one added field).
2. `api/logging/log-daily` — the combined insight (already carries the 17-Aug floor;
   floor becomes the L1 rules of the registry, same output field, zero client change).
3. `PlanRebuildPayoff.noticed` + the Home tick toast — surfacing (payoff wiring already
   done 17 Aug).
4. `focusBasis` / plan card — receipts for 'adapt' voicing (field already flows).
5. Weekly story (backlog task #8) — assembles from `insight_log`, no recompute.

**Must-NOT-touch list:** the RPC, streak math, plan-freshness gates, dayShape/topic-selector
internals (phase 1), notification budgets, sw.js, payment paths, onboarding writes.

---

## PART 3 — The founder's tap-vs-log contract, mechanically

**Per-tap (Home inline tick):** complete-task computes tick-scoped facts synchronously
(that topic's section % — cheap: one indexed select on topic_coverage), runs only
tap-eligible rules (L1 topic/section scope), writes `insight_log` with
`identity_key = student:SECTION_PROGRESS:QA:2026-08-18`, returns the claim in the
response → UI shows a small toast under the ticked task. Second QA tick the same day:
identity collision → rule escalates to the day-aggregate variant ("2 QA topics today")
by SUPERSEDING the first (old row → `superseded`, new row references it) — the student
sees progression, never repetition.

**Combined (log submit / check-in):** log-daily runs the full registry pass. Combined
rules declare `supersedes: [tap-rule ids]` — any live tap insights from today for the
same subjects get absorbed (state → `superseded`), and ONE combined line goes out. If the
combined pass finds nothing above the tap insights already shown, it emits the L1 floor
from a DIFFERENT subject (the 17-Aug ladder logic, now expressed as low-priority rules)
— Law 1 holds, duplication cannot happen because the index blocks it.

**Percentage integrity (the founder's "no confusing percentage games"):** one fact
producer owns every ratio. `qa_opened_pct` = opened/total from `topic_coverage`, core
sections only, `Math.round`, computed in exactly one function **[the 17-Aug module
already establishes this]**. Deltas ("18% → 21%") only ever compare two stored snapshots
of the SAME fact_key + rule_version — never a live number against a differently-computed
old one. If the syllabus graph ever changes size, rule_version bumps, old deltas retire,
and the student sees a fresh baseline instead of a phantom drop. A metric-registry-style
test asserts every percentage in every claim template traces to a registered fact.

---

## PART 4 — Build mechanism (the "how I actually work" the founder asked for)

The discipline, phase by phase, the same one used for the notification-reliability
installments this month:

1. **Re-verify before writing.** The session that builds each phase re-reads the exact
   files/tables it touches (the [re-verify] flags above). Nothing is coded against this
   document's memory of the code — documents drift, `git log` doesn't lie.
2. **Guard tests FIRST.** Each phase starts by writing the invariant tests (Part 5) —
   red — then the implementation turns them green. Invariants that survived production
   incidents here are all encoded as tests; the Insight Engine gets the same treatment
   from birth.
3. **Pure core, thin I/O shell.** Every fact producer and rule threshold is a pure
   function testable without a database (the `log-insight.ts` / `peer-cohort.ts` /
   `gst.ts` house style). Routes only fetch → call pure → persist → respond.
4. **Additive-only, behind the existing surfaces.** No client rewrites: phase 1 changes
   two API responses and one toast. Every phase is independently shippable and
   independently revertible (one revert commit each).
5. **Branch-only until the store freeze lifts**; migrations authored in-repo, applied in
   a batch with the founder's go, verified against production immediately after (the
   same protocol as the 20260817 rating_prompts migration).
6. **Production verification is part of "done."** Each phase ends with live queries
   proving the invariants hold on real students (dedup index has zero violations; every
   surfaced 'adapt' insight's plan_change_ref resolves; claim-number check passes on
   every row) — the same evidence-first closing every installment this month has had.
7. **Kill-switch.** One env flag (`INSIGHT_ENGINE_ENABLED`, the `mentorDoorsEnabled`
   pattern **[verified]**) gates all new surfacing; the 17-Aug floor remains the
   fallback. Rules can be disabled individually by removing them from the registry —
   no data loss, history stays.

### Phases

| Phase | Scope | New surface | Data needs |
|---|---|---|---|
| **1. Foundation** (≈1 week) | `insight_log` + identity index, EvidenceWindow, Fact Engine consolidation, rule registry with the existing L1/L2 floor as first rules, Integrity Gate, tap-insight on complete-task, supersession on log-daily | Tap toast; payoff card (existing) | Exists today |
| **2. Patterns** (≈1 week) | L3 rules: postponement, section consistency, completion asymmetry; L5 VOICING of the +50 postponed bonus with plan_change_ref receipts; "Why am I seeing this" drill-down sheet | Receipts UI; ≤1 negative/day budget | Exists today |
| **3. Mock fuel** | "+ Add Mock" door + instant-consequence card (runs the registry on entry); mock-trend L4 rules (≥3 complete mocks) | Add Mock on Home | Creates its own |
| **4. Memory & verify** | Mistake lifecycle states on top of `insight_log` (REPEATED→IMPROVING→STABLE as state transitions); repeater reconciliation ('verify' kind — hypothesis from onboarding checked against mock evidence); Weekly Story assembled from insight_log | Weekly story; repeater dashboard | Needs phase 3 volume |

Explicitly NOT built: LLM-decided insights (LLM may rephrase a claim template later, and
even then the claim-number integrity check runs on ITS output too), a fourth planner, an
event-sourcing rewrite, a giant memory blob, cross-student comparative insights (Peer
Pulse already owns that domain with its own density gates).

---

## PART 5 — Invariants → the actual test list

1. `insight-dedup.guard`: two concurrent identical candidates → exactly one live row
   (real-concurrency test, like the dedup proof in installment 2).
2. `insight-evidence.guard`: no row reaches `surfaced` with empty/unresolvable
   evidence refs; every numeral in every claim exists in its evidence object.
3. `insight-level.guard`: for each rule, fixture data one unit BELOW threshold →
   silence; at threshold → fires. (Table-driven across the whole registry.)
4. `insight-act.guard`: kind='adapt' + no plan_change_ref → Integrity Gate refuses;
   language templates for 'diagnose' contain no past-tense action verbs (regex).
5. `insight-window.guard`: no insight code constructs its own day boundary; all windows
   via EvidenceWindow(getLogDateString).
6. `planner-unification` (existing) still green — proves the engine added no write path.
7. `insight-tap-vs-log.guard`: tap insight for subject X today + combined pass →
   combined either supersedes X or speaks about ≠X; never two live claims on one subject.
8. `insight-cooldown.guard`: surfaced → re-eligible only after cooldown OR a state
   transition (acted→resolved→pattern reopened), never by rerun alone.
9. Replay: `rebuildInsightState` from canonical events reproduces the snapshot table
   byte-for-byte on fixtures (determinism proof).
10. Metric-registry extension: every fact_key registered once, with source + meaning.

---

## PART 6 — Observability

Every insight row already IS the causal chain (student action → evidence refs → rule +
version → surfaced_on/at → acted_at → plan_change_ref). Two additions: an admin
"Insight Health" tab in the existing Analytics workspace (fires/day by rule, supersession
rate, silence rate at the Integrity Gate, notice→action rate by rule — straight SQL on
insight_log), and three metric-registry entries (insight_depth_14d, notice_action_rate,
insight_next_day_return) so the numbers the founder watches are contract-checked like
every other number in the product.

---

## PART 7 — For external reviewers (ChatGPT etc.): attack these

1. **Snapshot-vs-recompute:** is one keyed `insight_state` table enough, or does delta
   integrity (18%→21%) need an append-only fact history? Where does that break first?
2. **Identity key design:** `student:rule:subject:window_bucket` — find the collision
   and the leak. What happens at window boundaries (day 14 → day 15 rebucket)? Does a
   student see the "same" insight again after a bucket rolls?
3. **Supersession semantics:** tap → day-aggregate → combined. Is a 3-level chain
   legible to the student, or does the toast-then-payoff double-touch still FEEL like
   duplication even when the claims differ?
4. **Claim-number ⊆ evidence-number check:** obvious bypasses? (Spelled-out numbers,
   dates, "third time" ordinals.) Is a template-only claim language (no free text ever)
   the stronger contract?
5. **The 3AM IST day boundary** interacting with 14-day windows and DST-free India —
   any edge where a log at 2:59 AM lands in a window the insight then misdescribes?
6. **Cooldown vs escalation:** repeated postponement KEEPS happening during a 7-day
   cooldown — silence, or escalate to the next level? What is the rule that never nags
   but never sits on worsening evidence?
7. **Is the Integrity Gate's runtime silence correct**, or should some failures degrade
   to a lower-level insight instead of nothing (Law 1 tension)?
8. **Scale:** at 10k students × 5 ticks/day the synchronous tap-path adds ~2 indexed
   queries per tick — where is the actual first bottleneck, and is the answer a
   materialized per-section counter or just indexes?
9. **What is missing entirely** from the phase plan that will hurt at phase 3-4?
   (Candidates we already suspect: mock edit/delete propagation into already-surfaced
   insights → 'invalidated' state exists but the UX of retracting a shown claim is
   undesigned.)

---

*Build starts on the founder's go, phase 1 first, on the working branch. This document
is the contract; deviations get written back into it, not around it.*
