# 0C.3 — Architecture Review: the CareerRai Notice System

**18 Aug 2026. NO CODE. No migration, no table, no UI, no consumer migrated.**

Commissioned after 0C.2.2 passed. 0C.2 answered *"what is true?"* This answers the
different and harder question: **"given what is true, what are we allowed to tell the
student?"**

I reject two pieces of my own earlier design in here (§2.3, §5.1). Both are named.

---

# PART 1 — Attacking the current design

## 1.0 The finding that outranks the rest: the registry has zero consumers

**Live today, all producing student-facing lines, none reading the Fact Registry:**

| Producer | Surface |
|---|---|
| `daily-insight.ts` (6 kinds, priority-ranked) | Home + daily cron push |
| `computePrescriptiveLine` (`log-daily/route.ts`) | log payoff card |
| `log-insight.ts` (shipped 17 Aug, mine) | same payoff card, as floor |
| **`facts/registry.ts`** (shipped today) | **nothing** |

**The Fact Registry has not reduced inconsistency by one unit. It has added a fourth
source of numbers.** It only starts paying when consumers migrate — and consumer
migration is precisely what is gated behind this review.

**Invariant required:** *no new rule may be written for a claim an existing producer
already makes, until that producer is migrated or deleted.* Expansion before migration
takes us from three uncoordinated producers to four, then eight. Enforced by **contract +
a guard** that fails if the rule registry declares a claim family an unmigrated producer
still emits.

## 1.1 Risk register

Each row: why it happens · how it happens *here* · the invariant · where enforced.

| # | Risk | Why | In this codebase | Invariant | Enforced |
|---|---|---|---|---|---|
| A | **Duplicate identity** | one key made to answer two questions | my own earlier `identity_key` with `window_bucket` — the same conclusion under 7d and 14d passes a unique index twice | four separate identities (§3) | code + DB |
| B | **Duplicate calculation** | a rule finds it easier to count rows than to call a fact | nothing stops a rule importing `topic_coverage` today | **rules receive `FactResult`s only; a rule evaluator has no data access** | type signature + guard |
| C | **Event vs claim confusion** | using the claim as the event's identity | the build plan did exactly this | event identity = source row + version; claim identity = rule + subject, **no window** | code |
| D | **Tap vs full-log race** | two writers, one interaction | *does not exist yet* — the tap toast is unbuilt. This is prevention, not repair | L1/L2 are **not persisted** (§5.1), so there is nothing to race | architecture |
| E | **Concurrent requests** | read-then-write | already proven in `complete-task` (fixed 0A) | pure recomputation is idempotent; persisted L3+ uses `on conflict do nothing` | code + concurrency test |
| F | **Retry** | network retry re-processes | push retries already exist | event identity absorbs retries | code |
| G | **Refresh / back button** | UI re-requests | any GET | recomputation returns the same value; no write | architecture |
| H | **Notification duplication** | a second path to send | `sendPushToUser` can be called directly, bypassing `dispatch()` budgets | insights deliver **only** through `dispatch()` | guard |
| I | **Weekly-report duplication** | report restates what was already said | weekly assembles from the same insights | delivery identity (§3.4) — one claim, many deliveries, never repeated *as new* | code |
| J | **Same insight on many surfaces** | each surface builds its own text | three producers do this today | surfaces receive rendered text; **never facts** | guard |
| K | **Stale evidence** | source row changes after a claim ships | `mock_debriefs` upserts on (student, log_date) | evidence pins `sourceUpdatedAt`; mismatch ⇒ INVALIDATED | code |
| L | **Fact version change** | a definition correction masquerades as progress | denominator lives in code; a syllabus edit moves everyone | deltas require matching `definition_version` | code + test |
| M | **Rule version change** | a threshold experiment retro-changes history | none yet | rule version stamped on every insight; history interpreted under the version that made it | code |
| N | **UNKNOWN → 0** | a UI wants a number | 47 students have no coverage | `FactResult` makes the value unreadable without handling `known` | **type system** ✓ already |
| O | **Unsupported causal claim** | "your tap did X" when coverage is forward-only | untick does not reverse coverage (0A finding) | L1 claims are **state, never causal**; causal claims require an `action_ref` | contract + guard |
| P | **Planner claims what it didn't do** | insight text written independently of the plan | none yet | `action_ref` must resolve to a real `daily_routines` write, or the claim is refused | code + test |
| Q | **LLM invents numbers** | prose generation over data | not in use | LLM never sees raw data; output validated numeral-by-numeral against the deterministic claim; **not used at all in phases 1–3** | contract |
| R | **Contradictory rules** | two rules, one meaning | inevitable at 100 rules | one claim family = one rule; registry rejects duplicates | guard |
| S | **Insight spam** | every event emits | Law 1 requires a tap response | tap responses are transient and unstored; persisted insights carry cooldown | architecture |
| T | **DB growth from every tap** | persisting UI emissions | the build plan proposed exactly this (~182M rows/yr at 100k students) | **L1/L2 never persisted** (§5.1) | architecture |

---

# PART 2 — The canonical data flow

```
EVENT ──▶ FACT ──▶ EVIDENCE ──▶ RULE ──▶ INSIGHT ──▶ SURFACE
                                   │
                                   └──▶ ACTION REQUEST ──▶ PLANNER ──▶ receipt ──┐
                                                                                  │
                                        (an insight may cite an action only ◀─────┘
                                         after the planner has performed it)
```

| Boundary | Input | Output | Authority | May write | May **not** write |
|---|---|---|---|---|---|
| EVENT | student action | canonical row | existing routes | canonical tables | insights |
| FACT | canonical rows (passed in) | `FactResult<T>` | `facts/registry.ts` | **nothing** | anything |
| EVIDENCE | facts + event ref | `Evidence` | assembler | nothing | anything |
| RULE | `Evidence` **only** | decision + claim ref | `rules/registry.ts` | nothing | facts, plans |
| INSIGHT | rule decision | `Insight` (rendered) | renderer | insight state (L3+ only) | facts, plans |
| ACTION | rule request | plan write | **existing planner** | `daily_routines` | — |
| SURFACE | `Insight` | pixels | UI | telemetry | any computation |

**Ownership, stated once:**
- **Truth** → Fact Registry. Nothing else may produce a number.
- **Calculation** → Fact Registry. Rules consume; they never compute.
- **Wording** → the claim template, deterministic. Not the rule, not the surface, not an LLM.
- **Planner changes** → `buildDayPlan()`. The Insight Engine has *no* write path; it may request, and may only describe what actually happened.
- **Delivery** → `dispatch()` for push; the surface for in-app.

---

# PART 3 — Identity, in four kinds

One key cannot answer four questions. This is the design I got wrong before.

### 3.1 Event identity — *"did we already process this action?"*
`student : source_table : source_pk : source_version`

- tap → `student : routine_task_completions : <row id> : —` (insert-once, so no version)
- log → `student : daily_reports : (student,date) : updated_at`

`updated_at` matters: a log **edited** at 22:00 after being submitted at 21:00 is a *new*
event with different evidence. A network **retry** of the same request is not — it carries
the caller's idempotency key, which short-circuits ahead of this.

### 3.2 Claim identity — *"have we told them this recently?"*
`student : rule_id : subject`

**The window is deliberately absent.** It belongs in evidence. Putting `14d` in the key is
how one conclusion becomes two rows under two windows — my earlier error.

`subject` is what the claim is about: `QA`, a topic name, or `—`.

### 3.3 Insight identity
A surrogate id on the row. Distinct from claim identity **because the same claim may
legitimately recur weeks later** — a new insight, the same claim key, governed by cooldown
and lifecycle state.

### 3.4 Delivery identity — *"has this been shown here?"*
`insight_id : surface`

One insight appearing in the payoff card **and** in Sunday's weekly story is not a
duplicate insight — it is one claim, two deliveries. The weekly story may *reference* it;
it may not restate it **as new information**. That distinction is impossible to express
with a single key.

### 3.5 Attacking the model

| Scenario | Resolution |
|---|---|
| Double tap | same completion row → same event identity → one evaluation |
| Tap retry | idempotency key short-circuits before event identity |
| Concurrent taps on different tasks | different events, different subjects → both valid, both L1, neither persisted |
| Page refresh | no event created; recomputation returns the identical value |
| Reopen page | same |
| Full-log submission | different event (daily_reports) → combined insight; §6 governs |
| Notification | same insight, new **delivery identity** |
| Weekly report | same insight, new delivery identity; may not restate as new |
| Same fact tomorrow | new event; claim key identical; **cooldown decides** |
| Same claim, new evidence | new insight row, same claim key, only if lifecycle state advanced |
| Same claim, two surfaces | one insight, two deliveries — never two insights |

---

# PART 4 — Evidence

Minimum object. Every field earns its place by answering a question we will actually be
asked.

```
Evidence {
  student_id          who
  event_ref           what triggered the evaluation (§3.1)
  facts[]             { key, version, value | UNKNOWN, unit, universe, num, denom }
  window?             only for windowed facts — the window lives HERE, never in identity
  rule_id, rule_ver   who judged it
  evaluated_at        when
}
```

**Rejected as speculative:** confidence scores (a rule's thresholds already encode
confidence), free-text notes, a `severity` field (that is priority, and priority belongs
to the registry, not the evidence).

`facts[]` carrying `UNKNOWN` entries is deliberate — *"we looked and could not tell"* is
different from *"we never looked"*, and only the first can be shown as a reason for
silence.

---

# PART 5 — Storage, and a rejection of my own earlier design

## 5.1 **REJECTED: persisting every insight**

My earlier build plan proposed one `insight_log` row per insight with a lifecycle state
machine. At 100k students × 5 taps/day that is ~182M rows/year — ~2,000× the largest
table in the product today — for lines the student sees for four seconds.

**The correct rule, and it dissolves several problems at once:**

> **L1/L2 insights are computed, returned, and never persisted. Only L3+ persist.**

L1/L2 are pure functions of current state. That means they are:
- **idempotent** — recomputation gives the identical answer, so refresh/retry/double-tap
  are safe without any dedup machinery;
- **impossible to duplicate** — you cannot duplicate what you do not store;
- **free at scale** — no rows, no index, no lifecycle.

Persistence is required only when an insight must be *remembered*:
- it carries a **cooldown** (we must know we said it),
- it has a **lifecycle** (OBSERVED → REPEATED → …),
- it is delivered **asynchronously** (push, weekly).

Those are exactly L3+. At 100k students, L3+ insights are rare by construction — they
require multi-day evidence.

**Measurement is not lost.** Deliveries are recorded as append-only telemetry in
`student_events` (an existing pattern), not as lifecycle rows. Two different things with
two different retention policies: *insight state* is small and long-lived; *delivery
telemetry* is large, append-only, and prunable.

## 5.2 Consequence for Law 1

The founder's Law 1 (a tap always gets a response) is now **free**: the tap response is a
computed L1 fact, no write, no race, no growth.

---

# PART 6 — Tap versus full log, solved exactly

**Current state, verified: the tap toast does not exist yet.** This is prevention.

Given `QA→complete, DILR→half, VARC→complete`:

- Each tap returns a **transient** section-scoped L1 line. Not stored.
- Full-log submission returns **exactly one** combined line.

**Why there is no race:** neither is persisted, so there is nothing to collide. The
guarantee is a property of the **response**, not of a database write:

> The full-log endpoint returns exactly one insight. It cannot return three, because its
> return type is `Insight`, not `Insight[]`.

Enforced by the type signature, then pinned by a test.

**Why the combined line is not three toasts stapled together:** the combined rule consumes
the *day's aggregate facts* — coverage after all ticks, sections touched, the day's plan
completion — not the three tap outputs. It never sees them. Structurally it cannot
concatenate them.

**Ordering:** if a tap request is still in flight when the log submits, the tap returns a
line for a toast the UI has already replaced. Harmless — it was never authoritative and
was never stored.

**Where persistence *would* reintroduce the race:** if a future L3 pattern insight fires
during the same interaction. Rule: an L3 insight evaluated within a logging interaction is
held until the interaction closes, then evaluated **once** against the final state.

---

# PART 7 — The ladder, attacked

The five levels survive, with one change and one addition.

| L | Claim | Min evidence | Forbidden | Tap | Log | Weekly | Action? | New student | UNKNOWN |
|---|---|---|---|---|---|---|---|---|---|
| **L1 state** | "QA coverage: 24%" | 1 fact, known | any causality; any comparison | ✓ | ✓ | ✓ | ✗ | ✓ | silent |
| **L2 progress** | "+3 topics this week" | 2 observations, same `definition_version` | causality; pattern language | ✗ | ✓ | ✓ | ✗ | ✗ (needs history) | omit the delta |
| **L3 pattern** | "DILR postponed 3× in 14 days" | ≥3 occurrences, ≥3 distinct days, recency-weighted | diagnosis; "you avoid" | ✗ | ✓ | ✓ | ✗ | ✗ | no claim |
| **L4 diagnosis** | "the pattern points at set selection" | L3 + a second independent signal | certainty; "your problem is" | ✗ | ✗ | ✓ | ✗ | ✗ | no claim |
| **L5 action** | "DILR is first today because you postponed it" | a resolvable `action_ref` | any claim without one | ✗ | ✓ | ✓ | **cites** | ✗ | no claim |

**Change: L2 may not appear on tap.** A delta needs two observations sharing a definition
version; mid-interaction, "this week" is still moving. Tap gets L1 only — which is also
the fastest path, and taps must be instant.

**Addition: L0 — SILENCE is a valid outcome at every level.** Not a level of claim; a
level of *outcome*, and it must be representable so a rule can decline explicitly rather
than fall through to a weaker claim by accident.

**L5 is the one that can lie.** It is the only level whose claim asserts something about
the world beyond the student's own data, so it alone requires an `action_ref` that
resolves. No ref ⇒ the language must be *"we recommend"*, never *"we changed"*.

---

# PART 8 — Rule Registry

```
Rule {
  rule_id, version
  level                L1..L5
  claim_family         ← THE anti-duplication key: two rules may not share one
  requires: FactKey[]  the ONLY data it sees
  minEvidence          thresholds, explicit
  window?              evidence window, if any
  claimTemplate        no numeric literals; placeholders reference fact keys
  priority             deterministic ordering
  cooldown?            L3+ only
  supersedes?          claim families this absorbs
  surfaces[]           where it may appear
  actionAuthority      'none' | 'cites_existing'   ← never 'performs'
  evaluate(evidence) → Decision | SILENCE
}
```

**Challenged and removed:**
- `negative/positive classification` → derivable from the template; a second hand-maintained flag would drift.
- `evidenceBuilder` per rule → evidence assembly is shared; per-rule builders are how five rules acquire five ways to count.
- `deterministic evaluator` as a *field* → it is the only kind permitted, so the field says nothing.

**Kept and load-bearing:** `claim_family`. A registry guard rejects two rules declaring the
same family. This is the single mechanism that stops rule #87 from re-saying what rule #12
already says.

**`actionAuthority` has no `'performs'` value.** The Insight Engine cannot be given the
ability to act, so the type cannot express it.

## 8.1 Priority — and where the thresholds belong

Deterministic order: **L5 action ▸ improvement ▸ L3/L4 diagnostic ▸ L2 progress ▸ L1 state.**

The previously-discussed thresholds — *max one negative per day*, *no same template two
days running*, *early users see encouragement first* — I recommend **against** hard-coding
in the engine:

- *one negative/day* → **policy**, config-level, because it will be tuned
- *no repeat template* → **engine**, because it is a correctness property of supersession
- *tenure-sensitive valence* → **experimentation**, because it is an untested hypothesis
  (Finkelstein & Fishbach is suggestive, not settled for this population)

Putting an untested hypothesis in the engine makes it un-experimentable.

---

# PART 9 — Dedup, suppression, supersession, invalidation

Four mechanisms. **No shared "already shown" flag** — that flag is how they collapse into
one and stop meaning anything.

| Mechanism | Question | Keyed on | Outcome |
|---|---|---|---|
| **Dedup** | "did we already process this action?" | event identity | converge; return the same result |
| **Suppression** | "valid, but something outranks it" | priority within one evaluation | not shown **now**; still true, may show later |
| **Supersession** | "a stronger claim replaced this one" | claim family + interaction | earlier claim retired |
| **Invalidation** | "the evidence changed under us" | evidence `sourceUpdatedAt` | never re-surfaced; not silently recomputed |

Suppression and supersession are genuinely different: a suppressed insight was *never
wrong*, it merely lost a ranking. A superseded one has been *replaced by a better
statement of the same thing*. Conflating them means a suppressed insight can never
resurface — the student silently loses a true observation forever.

---

# PART 10 — Failure modes

**The rule: never fabricate because a surface expects something.**

| Failure | Response |
|---|---|
| Fact Registry throws | fall back to the 17-Aug floor (`log-insight.ts`), which predates the engine and is already trusted. Never nothing, never invented. |
| A fact is UNKNOWN | the rule requiring it declines; a lower-level rule may still fire; if none, silence |
| Rule throws | that rule is skipped, logged as an Exception; other rules continue |
| DB timeout on facts | no insight; the underlying action (log/tick) **must still succeed** — insight failure may never fail the sacred path |
| Duplicate request | event identity converges |
| Concurrent tap | pure recomputation; identical answers |
| Full log races a tap | §6 — nothing persisted, nothing to collide |
| Notification retry | delivery identity absorbs it |
| Planner action fails | the L5 claim is refused — no `action_ref`, no causal claim |
| LLM fails | deterministic claim is already the canonical text; LLM is optional polish |
| Stale insight requested | invalidation check on read; stale ⇒ not shown |

**Non-negotiable:** insight generation is wrapped so that its failure can never break
logging, ticking, or planning. It already is, for the 17-Aug floor.

---

# PART 11 — Scale

| Students | L1/L2 | L3+ rows | Risk |
|---|---|---|---|
| 100 → 10k | computed, 0 rows | hundreds | none |
| 100k | 0 rows | ~thousands/day | fine |
| 1M | 0 rows | manageable | delivery telemetry becomes the large table — prune it |

**The thing that would have collapsed:** persisting every tap (§5.1). Removed by design.

**Remaining watch items:** recomputing facts on every request (fine now — facts are pure
over already-fetched rows, adding no queries); weekly generation (batch, off-peak);
delivery telemetry growth (append-only, prunable, no lifecycle).

---

# PART 12 — Mandatory test matrix

1. duplicate event → one evaluation
2. concurrent request → identical result, no duplicate
3. tap → L1 section insight
4. full log → **exactly one** combined insight
5. combined does not concatenate tap outputs (it never receives them)
6. no duplicate combined for one interaction
7. insufficient evidence → UNKNOWN/silence, never a lower-confidence guess
8. every numeral in a claim traces to a `FactResult` (provenance)
9. denominator mismatch → no delta rendered
10. membership violation → UNKNOWN + violation (✓ exists)
11. rule version change → history stays interpretable under its own version
12. fact version change → deltas refuse to cross versions
13. cross-surface consistency → two surfaces, same claim, byte-identical text
14. planner parity → L5 without a resolvable `action_ref` is refused
15. unsupported causal claim → L1 templates contain no causal verb
16. LLM numeric hallucination → output rejected if any numeral is absent from the claim
17. notification duplication → delivery identity
18. weekly duplication → weekly may reference, not restate as new
19. contradictory rules → two rules, one `claim_family` ⇒ registry rejects
20. impossible numeric claim → ratio > range ⇒ UNKNOWN (✓ exists)
21. kill-switch parity → engine OFF == pre-engine, byte for byte
22. **rules cannot compute** → no rule file imports a canonical table or the DB
23. **surfaces cannot compute** → no component imports fact or rule registries
24. **no rule for an unmigrated producer's claim** (§1.0)

22–24 are mine, and they are the three that make the failure modes structurally hard
rather than merely discouraged.

---

# PART 13 — Recommendation

**Correct in the current direction:** the Fact Registry's typed `FactResult`, explicit
UNKNOWN, provenance, universe and versioning; separating self-report from observation;
the planner boundary; guards-first discipline; refusing to build mock facts.

**Dangerous now:**
1. **The registry has zero consumers while three producers still compute their own
   numbers.** Building rules before migrating them makes it four.
2. **Persisting every insight** — rejected here (§5.1).
3. **A single identity key** — rejected (§3).
4. Letting rules touch data. Letting surfaces render from facts. Both currently unprevented.

**Must change:** adopt §3 (four identities), §5.1 (L1/L2 unpersisted), §8's
`claim_family`, and the three structural guards (22–24).

**Must NOT be built yet:** mock facts · repeater reconciliation · LLM phrasing · L4/L5 ·
any new table · any consumer migration beyond the ordered plan below.

**Minimum architecture:** Fact Registry (done) → Evidence assembler → Rule Registry with
`claim_family` → deterministic renderer → surfaces. Persistence only at L3+.

**Invariants that must never break:**
1. Only the Fact Registry produces numbers.
2. Rules consume `FactResult`s and nothing else.
3. Surfaces render text they are handed; they never compute.
4. A causal claim requires a resolvable `action_ref`.
5. UNKNOWN is never converted to a value.
6. The Insight Engine has no write path to any canonical table.
7. Insight failure never breaks logging, ticking or planning.

**Exact next phase — and it is migration, not expansion:**

> **0C.3a — migrate `log-insight.ts` to consume the Fact Registry.** One producer, one
> surface, no new rules, no new claims, output provably identical. It is the smallest
> possible proof that the registry can carry a real consumer.
>
> Only then 0C.3b (`computePrescriptiveLine`), 0C.3c (`daily-insight.ts`), and only then
> 0C.4 (the Rule Registry).

Three producers must become one before a fourth is allowed to exist.

---

# Unresolved decisions

1. **Half-tick** (`fullyDone` vs `creditedHours`) — still unruled; blocks any completion-ratio fact.
2. **`swapped_out`** conflates busy-day deferral with deliberate swap — blocks postponement facts.
3. **Weekly story: reference or restate?** §3.4 says reference. Not yet a founder ruling.
4. **Where the "one negative per day" threshold lives** — my recommendation is policy, not engine (§8.1).
5. **Is `daily-insight.ts` migrated or retired?** It is the most sophisticated existing producer *and* the most duplicative. Migrating preserves its six kinds; retiring loses them.

---

**STOP.** No code written. No consumer migrated. No table created. 0C.3a awaits approval.
