# CareerRai Diagnostic System — Product Redesign Specification v1

**Status: SPECIFICATION ONLY. No application code modified. No database data modified. No migrations created. No legacy system deleted.**

This document is the third and final piece of a three-part investigation: the forensic audit (`2026-08-15-instant-insight-forensic-audit.md`), the canonical weakness truth table (`2026-08-15-weakness-truth-table.md`), and this redesign specification. Phase 1 below is a fourth and final read-only validation pass, run directly against the production database, before any design decisions are made on top of it.

---

## PHASE 1 — The Baseline Mystery, Resolved

**Method:** repo-wide grep (not limited to `src/`) across migrations, scripts, and docs; `git log --follow` on the writing route; and direct read-only SQL against the production Supabase project (`pobhpszlsozeonejtzqy`), aggregate counts only, no individual student records disclosed.

### What the code shows

- **Every write location:** exactly one — `POST /api/profiles/baseline` (`src/app/api/profiles/baseline/route.ts`). Confirmed by a repo-wide grep for the literal path string `/api/profiles/baseline`: it appears in exactly one file, the route itself. No client-side `fetch` call to it exists anywhere in `src/`.
- **Every read location:** `focus-sections.ts:54-65` (`weakestFromBaseline`/`strongestFromBaseline`, rank 3 of 5 in `resolveFocusSections`), `buddy-match.ts:31-38` (`weakestSection`, sole input to buddy ranking), `routine/today/route.ts:327-330` (display only, feeds a "Coaching Decision" intelligence card).
- **Every API/route that can write them:** the one route above. It is role-aware: a non-admin can save once (and locks on save via `baseline_locked`); an admin can save repeatedly without re-locking.
- **Cron/background process:** none. Grep for `baseline_varc|baseline_dilr|baseline_qa` across `src/app/api/cron/` returns no matches.
- **Database triggers/functions:** none. The column-adding migration (`supabase/migrations/20260617_student_buddy_profile_expansion.sql:11-15`) is a plain `ADD COLUMN`, no default, no trigger.
- **Migrations/backfills:** none found. No migration in `supabase/migrations/` (119 files) contains an `UPDATE`/`INSERT` touching these columns.
- **Supabase RPCs/Postgres functions:** none found referencing these columns (checked via the same grep sweep and via the `dead_columns()` diagnostic function already built into this project — see below).
- **Legacy code outside `src/`:** `scripts/seed-demo-data.sql` sets these fields, but only for demo/seed accounts, never a real-student runtime path (confirmed: this script is not invoked by any production code path).
- **Git history:** the route was authored in a single commit, 9 Aug (`9ee1a34`, "Admin panel: eleven workspaces, and orphan pages become impossible"), as 66 net-new lines. That commit's own message lists eight new admin pages it shipped — none of them is a baseline-entry form. No later commit adds a caller.
- **A related doc, `docs/STUDY-PLAN-PIPELINE.md:28`** (written 13 Aug), describes the intended source as "Baseline mock (if any) | Onboarding" — confirming the *design intent* was an onboarding diagnostic mock test, which was never built. That same document (line 63) also calls the self-reported-section tap "legacy accounts that answered the old tap" — which was accurate on 13 Aug but is now itself a stale claim, since the weakest-section screen shipped live to every new signup starting 14 Aug. **This document is out of date relative to current code and should not be treated as current truth without a re-read against `focus-sections.ts` directly** — flagged here as a real, citable instance of doc rot, relevant to Phase 12.

### What production data shows (queried directly, aggregate counts only)

| Metric | Value |
|---|---|
| Total students (`role='student'`) | **412** |
| Students with `baseline_varc`/`baseline_dilr`/`baseline_qa` set | **1** (all three, one row) |
| That one row | `is_test_account = true` — **not a real student** |
| `baseline_locked = true` anywhere | **0** — no student has ever completed the self-service save-and-lock flow |
| `baseline_mocks_taken` set | **0** |
| Buddies (`role='buddy'`) with `own_weakest_section` set | **0 of 8** |
| Buddies with `strongest_section` set | **8 of 8** |
| `section_elo` distinct values across all 422 profiles | **1** — literally the unmodified column default `{"qa":1200,"dilr":1200,"varc":1200}`, never once written by any code path |
| `self_reported_weakest_section` set (students) | **13** total, **11** after excluding test/demo accounts (7 VARC, 4 QA, 2 DILR — 2 of the 13 are test/demo) |
| `self_reported_strongest_section` set | **0** |
| `mock_debriefs` rows / distinct students | **18 rows / 14 students** (3.4% of the student base), all 18 complete (all three sections scored), most recent 14 Aug |
| `topic_coverage` rows / distinct students | **19,255 rows / 364 students** (88% of the student base) |
| `topic_coverage.status` distribution | `not_started` 13,505 (70%) · `learning` 2,850 (15%) · `practicing` 2,016 (10%) · `revising` 884 (5%) · **`exam_ready` 0 (0%)** |

**One additional finding, not asked for but directly relevant:** this project already has a built-in `dead_columns()` diagnostic function (documented in `docs/EVIDENCE-POLICY.md`), run against production here. It flagged `baseline_mocks_taken`, `self_reported_strongest_section`, and `own_weakest_section` as fully NULL across every row — but it did **not** flag `baseline_varc/dilr/qa` (one row has values, so a strict all-NULL check misses it) or `section_elo` (never NULL — it's always the default, so a NULL-based dead-column check structurally cannot see it). This is worth carrying into Phase 12: the existing automated dead-column tooling has two specific blind spots — a lone real value hiding among hundreds of nulls, and a non-null default that masks a column nobody ever actually writes to.

### Classification

| Column | Classification | Basis |
|---|---|---|
| `baseline_varc` / `baseline_dilr` / `baseline_qa` | **D — ORPHANED** | Live read path (2 real consumers), confirmed-dead write path (zero callers in code, zero real-student data in production; the one populated row is a test account) |
| `baseline_locked` / `baseline_mocks_taken` | **D — ORPHANED** | Same route, same zero-caller finding; zero rows populated at all |
| `self_reported_strongest_section` | **D — ORPHANED** | Read by the canonical resolver (rank 1 for `strongest`), zero rows populated anywhere, zero writers in code |
| `section_elo` | **D — ORPHANED (by design, not by accident)** | Zero code references; production data is literally 100% the unmodified schema default — this was scaffolded and never wired to anything, not a signal that decayed |
| `own_weakest_section` | **B — LIVE BUT UNRELIABLE (dead in practice)** | Write path exists and works (a real admin-facing buddy form), but zero of 8 real buddies have ever used it — the `+30` "shared weakness" bonus in mentor-matching cannot fire for any student today, not because the code is broken, but because the input is universally absent |
| `strongest_section` (buddy) | **A — LIVE + TRUSTWORTHY** | Two working write paths, 8 of 8 real buddies populated, feeds two real consumers |
| `self_reported_weakest_section` (student) | **A — LIVE + TRUSTWORTHY, LOW VOLUME** | Real write path, real data (11 real students as of this query), consistent with the field having shipped to the funnel only 1-2 days before this audit — expected to grow, not a red flag |
| `mock_debriefs` | **A — LIVE + TRUSTWORTHY, SPARSE** | Real, complete, recent data — but only 3.4% of students have any. Any design that treats this as the primary evidence source must have a graceful, non-degraded path for the other 96.6% |
| `topic_coverage` | **A — LIVE + TRUSTWORTHY, DOMINANT** | 88% of students have real data here — this is the signal nearly every student actually has |

**No UNKNOWN remains on this question.** Both the code trace and the production query independently confirm the same conclusion — the baseline columns were built for a diagnostic-mock-at-onboarding feature that was never shipped, and buddy-matching's "shared weakness" bonus, while correctly coded, has never once fired in production because no mentor has filled in the field it depends on.

---

## PHASE 2 — The CareerRai Diagnostic Contract

### The evidence hierarchy

| Rank | Source | Why it sits here |
|---|---|---|
| **1. Demonstrated performance** | A real score on a real question, under real conditions (a mock's per-section percentile). This is the only category in the entire system that measures outcome rather than input — everything else measures what the student *did* or *said*, not how well it worked. `resolveFocusSections` already ranks this first, with founder sign-off on record (`mock-informed-focus.ts:3-4,12`), gated on COMPLETE + RECENT(≤45d) + DECISIVE(≥3pt gap) so a stale or marginal mock cannot masquerade as strong evidence. **This document adopts that gating unchanged** — it is well-reasoned and already validated in production. The one addition this document makes: per Phase 1, only 3.4% of students currently have any mock data, so **the hierarchy must be designed to degrade gracefully to rank 2 for the overwhelming majority, not to treat "no mock" as an error state.** |
| **2. Student self-report** | The student's own belief about their weak point. Ranked second because it is a real, first-person signal a coverage grid cannot substitute for (a student can have "covered" a section and still feel it costs them marks — the prior audit's Part J already established that coverage measures activity, not ability) — but it is *unverified belief*, not measured outcome, so it yields to rank 1 when rank 1 clears its evidentiary bar. |
| **3. Baseline/history** | Conceptually sound — a pre-signup diagnostic score is exactly the kind of measured evidence that should sit near the top. **Ranked here provisionally, not confidently**, because Phase 1 established it is currently orphaned in production (0 real students). Its rank in the hierarchy is a statement about what the signal *would be worth if it existed*, not a claim that it currently contributes anything. |
| **4. Topic coverage** | What the student has studied vs. not — real, near-universal (88% of students), but explicitly a proxy for *effort/activity*, not ability. Belongs below both performance and self-report for the same reason established in the prior audit: "untouched" and "learning" are not evidence of poor exam performance, only of incomplete or in-progress activity. |
| **5. Prerequisite/foundation relationships** | Not a peer of the above four — it's a different *kind* of thing. Ranks 1-4 answer "how weak is section X"; this answers "why might this specific active topic be shaky." It is real, structurally sound, entirely deterministic — but it runs over `TOPIC_METADATA`, which is explicitly disclaimed in its own source comment as "editorial content... NOT measured data" (`topics-constants.ts:121-126`). Its correct role is **explanatory, layered on top of a rank 1-4 finding**, never a section-level verdict on its own. |
| **6. Other behavioural evidence** | Everything else that exists in the schema but isn't yet meaningfully wired to a diagnosis: `evidence.ts`'s six-check ladder (`concept, easy, medium, hard, revision, tested` — the closest thing to graded, per-topic mastery evidence in the codebase) which Phase 1 confirms has produced **zero `exam_ready` statuses in production to date**; streak/consistency data; time-on-task. Ranked last not because it's unimportant in principle, but because none of it currently reaches a section-weakness question at all — it's potential, not current, evidence. |

### What happens when evidence disagrees

**Case 1 — Student says VARC weak; performance says QA weak; coverage says QA foundation incomplete.**
Performance outranks self-report (rank 1 beats rank 2), and coverage/foundation corroborate the same section performance already named. The diagnosis names QA, **but must explicitly acknowledge the VARC belief rather than silently overriding it** — the same disclosure discipline `mock-informed-focus.ts` already enforces ("never silent"). Correct shape: *"You told us VARC feels like the weak point. Your last mock says otherwise — QA is where the percentile gap actually is, and your coverage data explains part of why."* This is the CORRECTION insight type (Phase 5).

**Case 2 — Student says VARC weak; performance unavailable; coverage says VARC substantially incomplete.**
No rank-1 evidence exists, so rank 2 and rank 4 are being compared, and here they **agree**. The diagnosis names VARC, states the specific coverage gap, and does not need to relitigate anything — belief and the next-best evidence align. This is the CONFIRMATION or EXPLANATION insight type, upgraded with specificity (Phase 5).

**Case 3 — Student says VARC weak; coverage says VARC is healthy; performance says VARC is poor.**
This is the case that most needs a contract, because it is the one where a naive "coverage vs. self-report" comparison would produce a false reassurance ("you've covered it, you're fine") that the strongest evidence in the system directly contradicts. Performance (rank 1) outranks coverage (rank 4) unconditionally under this hierarchy. The diagnosis names VARC, **and must say why performance and coverage disagree rather than just picking a winner silently** — the honest, specific version of this finding is genuinely rare and valuable: *"You've covered VARC well — but your mock scores there are lower than your coverage would predict. That gap usually means the issue isn't what you've studied, it's how you perform under test conditions."* This is a distinct insight shape from Case 1 (student and evidence disagree) — here the *evidence sources disagree with each other* while the student's belief happens to be right. Worth naming separately in Phase 5.

---

## PHASE 3 — Four Concepts, Not Synonyms

| Concept | Precise definition | What is sufficient evidence | What it does NOT prove |
|---|---|---|---|
| **A. WEAKNESS** | A durable, demonstrated gap between the student's actual command of a section/topic and what CAT rewards. This is a claim about **ability**. | Rank-1 evidence (a complete, recent, decisive mock) is the only category in this table that can, alone, support this word. Rank 2-4 evidence can *contribute* to a weakness diagnosis but should not, alone, justify the literal word "weak" applied to the student. | Coverage, self-report, or prerequisite gaps in isolation. |
| **B. COVERAGE GAP** | A fact about **activity**: which topics have and haven't been studied, and to what declared depth. This is a claim about **what has been done**, not about ability. | A `topic_coverage` row (or set of rows) at `not_started`/`learning`. | "Untouched" proves the student has not yet engaged the topic. It does not prove they would struggle with it — some students learn a topic quickly once they start; the metadata itself (`weightage`, `difficulty`) is editorial, not measured. |
| **C. FOUNDATION GAP** | A fact about **sequencing**: a topic the student is actively working has a prerequisite (per the content team's editorial graph) that is itself untouched. This is a claim about **structural risk in how the syllabus is being approached**, not about ability or even about coverage in the aggregate. | `deepestUnmetPrereq`'s traversal, run over the current matrix. | An unmet prerequisite does not prove the student is performing poorly on the *parent* topic's actual exam questions — no performance data enters this calculation at all (Phase 3 of the prior audit, Part F/D). |
| **D. PERFORMANCE PROBLEM** | A claim that the student is scoring, or is likely to score, below where their preparation should place them. This is the ONLY one of the four that is fundamentally an **outcome** claim rather than an **input/process** claim. | Rank-1 mock data, ideally compared against the student's own coverage/foundation state (as in Phase 2's Case 3) so the claim is not just "you scored low" but "you scored low *relative to what you've studied*, which is the specific, useful version of this finding." | Coverage or foundation gaps alone. A student can have severe foundation gaps and still perform adequately on the exam's actual question distribution; the codebase has no data connecting the two claims directly, and per `topics-constants.ts`'s own weightage disclaimer, should not manufacture one. |

**Which concepts can safely produce a student-facing claim, and how?**

- **COVERAGE GAP** can be stated directly and factually ("X is untouched, Y is at 40% within its section") — it is simply true, self-evidently checkable by the student against their own memory of what they've tapped, and requires no inferential leap.
- **FOUNDATION GAP** can be stated as a **structural observation with a hedge**, not a causal certainty: "X's prerequisite Y is untouched" is a fact; "that's *why* the hard questions feel random" (the current `detectFoundation` copy) is an unsupported causal leap and should not survive in that form (Phase 6, Phase 8).
- **WEAKNESS** and **PERFORMANCE PROBLEM** should only be stated in the strong, literal sense ("you are weak here," "you are underperforming here") when rank-1 evidence supports it. In the 96.6% of cases where no such evidence exists (Phase 1), the system should say something evidentially honest instead — naming the coverage/foundation facts precisely, without borrowing the rhetorical weight of a performance claim it cannot back up. This is the single most important discipline this document is proposing, and it maps directly onto the existing company-wide Zero Guess Policy (`docs/EVIDENCE-POLICY.md`): a diagnosis without rank-1 evidence is a **DERIVED** or **HYPOTHESIS**-bucket claim, not a **VERIFIED** one, and should read that way to the student, not just internally in engineering documentation.

---

## PHASE 4 — The "WOW" Diagnostic, Worked

Restating the structure already agreed with you earlier in this conversation, now formalized as the pipeline every insight must pass through:

```
STUDENT BELIEF  →  EVIDENCE  →  INTERPRETATION  →  SPECIFIC DIAGNOSIS  →  ACTION
```

**Worked, using Phase 2's Case 1 shape (the founder's own screenshot case, corrected):**

- **Student belief:** "VARC is my weakest section." (`self_reported_weakest_section = 'VARC'`)
- **Evidence:** VARC coverage is actually reasonably complete; QA coverage has a specific foundation gap (Functions active, Linear Equations untouched, depth 2); no mock data yet for this student.
- **Interpretation:** No rank-1 evidence exists to contradict the student outright, but rank-4 coverage evidence points at QA more sharply than VARC — this is Phase 2's Case 1 but without a mock (a common real case, since 96.6% of students have none).
- **Specific diagnosis:** Not "QA is your weakest" (BAD, Phase 8) — the specific, checkable finding: "Functions is active in your plan, but its foundation — Linear Equations — is still untouched two levels down."
- **Action:** "We'll bring Linear Equations forward before continuing Functions."

The "how did it know that?" feeling comes from the specificity of the diagnosis (naming two exact topics and the exact relationship between them) landing on top of an honest acknowledgment of what the student actually said — not from asserting a section-level verdict with more confidence than the evidence supports.

---

## PHASE 5 — Insight Taxonomy

The proposed six types are a reasonable starting sketch but conflate two different axes: **agreement/disagreement between belief and evidence** (a relationship) and **evidence sufficiency** (a gate). Splitting them produces a cleaner, smaller taxonomy — five types, one of which is "produce nothing."

| Type | Required evidence | Allowed claims | Forbidden claims | Confidence threshold | Student-facing structure |
|---|---|---|---|---|---|
| **1. CONFIRMATION** | Self-report + at least one of {coverage, foundation, performance} pointing the same direction | "You said X, and here's the specific evidence that backs it up" | Treating agreement alone as proof of ability-level weakness if only coverage agrees (no rank-1 evidence) | Medium-high if performance agrees; medium if only coverage/foundation agree — and the copy must reflect which | Belief ack → specific corroborating fact(s) → what we'll do |
| **2. CORRECTION** | Self-report + evidence pointing a DIFFERENT direction, where the contradicting evidence is at least as high-ranked as what would be needed to support the self-report | "You said X. The evidence points to Y instead, specifically because [fact]." | Silently substituting Y for X without naming the disagreement (this is precisely the current bug) | High only when performance data contradicts; medium when only coverage/foundation contradict — and the copy must hedge accordingly, e.g. "your coverage data suggests" rather than "the evidence proves" | Belief ack (explicit) → what the evidence actually shows → why they might diverge → what we'll do |
| **3. FOUNDATION** | A genuine unmet-prerequisite chain under an active topic, regardless of which section it's in — but gated (Phase 6) to only surface when it's relevant to what the student named, or explicitly flagged as a DIFFERENT finding from what they asked about | "You're working on X, but its foundation Y is untouched" | Any claim that this foundation gap is *causing* a felt exam experience ("that's why questions feel random") — that is a performance claim (concept D) this evidence cannot support | High for the structural fact itself, explicitly LOW/none for any causal-to-performance extension | Structural fact → the specific two topics named → the mechanical consequence ("Functions won't fully click until Linear Equations is solid") — stopping short of "this is why exams feel X" |
| **4. COVERAGE-ONLY** | Coverage gap exists, but no rank-1/rank-2 evidence to elevate it to a weakness claim | "Your coverage in X is behind — Y and Z are still untouched" | The word "weak" applied to the student; any performance implication | Low-medium — explicitly presented as an activity fact, not a diagnosis | Coverage fact → what's untouched → what studying it unlocks — no "why" framing that implies ability |
| **5. INSUFFICIENT EVIDENCE** | Below the evidence floor entirely (too few topics touched, no self-report, no mock, no meaningful foundation candidate) | "We don't have enough yet to tell you anything specific and honest" | Any manufactured finding | N/A — this is the floor, not a claim | Honest statement → a real starting point (already built: `startingPoints` in `prep-insight-engine.ts`) |

**What was dropped from the original six, and why:** "EXPLANATION" (student identifies weakness, system explains why) is not a distinct type under this framework — it's CONFIRMATION plus a FOUNDATION layer stacked on top, i.e., composable rather than a sixth category. Insights in production should be allowed to **combine one section-level type (1/2/4) with an optional FOUNDATION layer**, rather than the system being forced to pick a single flat category — this matches how `prep-insight-engine.ts`'s existing `rootCause`-based dedup already thinks about layering findings, just without the missing evidence-sufficiency and belief-comparison axes.

---

## PHASE 6 — The No-Bogus-Insight Gate

Every candidate insight must pass all seven checks before it may render. This gate sits **between** the detector layer (which is allowed to be exploratory/cheap to compute) and the rendering layer (which must never show anything ungated).

1. **Relevant to what the student said?** If a self-report exists, does this candidate insight address that section, or explicitly acknowledge it's naming a different one (CORRECTION, not silence)? An insight that names a third section with no relationship to the self-report at all fails this check outright — this is precisely how `findFoundationGap`'s section-blind scan currently fails.
2. **Supported by actual evidence?** Every stated fact must trace to a real row (a mock score, a coverage status, a metadata prerequisite) — no synthesized or interpolated numbers.
3. **Specific enough to be useful?** "QA is weak" fails; "Functions is active while Linear Equations underneath it is untouched" passes. A candidate that only reaches section-level granularity when topic-level evidence was available should be rejected in favor of a candidate that used it, or held back with an INSUFFICIENT EVIDENCE outcome if no topic-level candidate exists.
4. **Explains something meaningful?** Does the finding change what the student would otherwise assume? A restatement of what they just tapped (per the original screen's own design rationale, `screen-instant-insight.tsx:20-24`) fails this check.
5. **Can the causal language be defended?** Every "why"/"because"/"that's why" clause must be checked against Phase 3's concept table — a FOUNDATION-type structural fact may not borrow PERFORMANCE-type causal language. If the copy asserts a felt-experience causation ("feels random"), rank-1 evidence must exist to support it, or the clause must be removed/hedged.
6. **Will the student understand why we're showing it?** If the insight contradicts a self-report, the contradiction must be stated, not implied by omission (Phase 5's CORRECTION structure). An insight the student cannot trace back to something they told the app or tapped fails this check.
7. **Does it lead to an actionable next step?** Every surviving insight must carry a concrete action the plan can actually execute — and per Phase 9, that action must be the SAME object the plan engine receives, not a screen-only promise.

**Failure mode:** any single "no" on checks 1, 2, 5, or 6 suppresses the insight outright (these are correctness/trust gates, not quality gates). A "no" on checks 3 or 4 alone should first attempt a MORE specific candidate (drop to topic-level from section-level) before suppressing — only falling through to INSUFFICIENT EVIDENCE if nothing clears the bar. This is consistent with the honest-empty-state design the current screen already has for the too-little-data case; this document extends the same discipline to the too-irrelevant/too-unsupported case, which the current screen does not gate at all.

---

## PHASE 7 — The Final Screen, Information Architecture

```
Headline
  ↓
Student belief acknowledgement   ← NEW, currently absent entirely
  ↓
Evidence                          ← currently present (stats[])
  ↓
Diagnosis                         ← currently present (headline text), but not always earned per Phase 6
  ↓
Why this matters                  ← currently present (note), needs the causal-language audit from Phase 6.5
  ↓
What we'll do                     ← currently present (action text), but Phase 9 makes this a REAL handoff, not just copy
  ↓
CTA
```

The one structural addition versus the current screen is the **belief acknowledgement** step — a short, explicit line stating what the student said, present on every insight type (even CONFIRMATION), because per Phase 5/6 this is the check that makes the difference between "we found something" (current, un-anchored) and "you told us X, and here's what we found" (anchored, trustworthy by construction).

**BAD → BETTER → STRONG → WOW, and precisely why each is different:**

- **BAD** — "You're weak in QA." A section-level ability claim (concept A/D) with no evidence shown, no belief acknowledgement, no specificity. Fails Phase 6 checks 2, 3, 4 simultaneously.
- **BETTER** — "Your QA coverage has a significant foundation gap." Correctly downgrades the claim to concept C (foundation), states it factually rather than as an ability verdict — but still has no belief acknowledgement, so if the student said something different, this reads as BAD's silent-override problem wearing more careful words.
- **STRONG** — "You told us VARC feels weakest. Your current preparation data actually points to QA as the larger structural gap." Adds the belief acknowledgement (Phase 7's new required step) and correctly hedges the evidence source ("preparation data," not "the truth") — this is a complete CORRECTION-type insight (Phase 5, type 2) and would pass the Phase 6 gate as long as the underlying QA finding is itself specific.
- **WOW** — "You're spending time on Functions, but the Linear Equations foundation underneath it is still untouched. That can make harder algebra feel harder than it should." This is STRONG's diagnosis made maximally specific (topic-level, not section-level) with a causal clause correctly hedged ("can make... feel," not "that's why questions feel random") — the exact causal-language fix Phase 6, check 5 requires.

---

## PHASE 8 — Insight → Study Plan Contract (Mandatory Handoff)

**The core defect this closes:** per the prior audit's Part H, the current CTA (`onNext()` with zero payload) discards the insight entirely — the "what we'll do" line is a promise the architecture does not keep. This phase defines what must flow instead, conceptually — not as code.

```
Insight Engine  →  Diagnostic Object  →  Plan Engine  →  Persisted Decision  →  Actual Study Plan
```

**What the diagnostic object should conceptually contain**, and why each field exists:

- **Diagnosed section** — the section this specific insight is about, so the plan engine knows what to prioritize.
- **Diagnosis type** — one of Phase 5's taxonomy (CONFIRMATION / CORRECTION / FOUNDATION / COVERAGE-ONLY / INSUFFICIENT EVIDENCE), so the plan engine (and any future display of "why this plan looks like this") can render the right level of certainty.
- **Evidence** — the specific facts that produced the diagnosis (topic names, coverage percentages, mock reference if applicable) — not for re-display necessarily, but so a later "why is my plan like this" screen can trace back to the original reasoning without recomputing it and risking a different answer.
- **Confidence** — mapped to the Zero Guess Policy's five buckets (`docs/EVIDENCE-POLICY.md`) already governing every other claim in this codebase: VERIFIED (rank-1-backed), DERIVED (computed from coverage/foundation), HYPOTHESIS (a foundation-gap causal extension), never silently upgraded.
- **Recommended focus** — the topic(s), not just the section, the plan should prioritize — this is what makes the "what we'll do" line true rather than aspirational.
- **Prerequisite chain, if applicable** — so `resolveFocusSections`-adjacent logic can sequence correctly rather than just picking a section.
- **Reason** — a short, student-facing-safe string, matching the existing `reason` field discipline already used elsewhere in this codebase's notification system (`notification-os.ts`'s `dispatch()` requires a `reason` on every send) — this pattern already exists and should be reused, not reinvented.
- **Source** — which evidence tier produced the final verdict (mirrors `mockBasis` in `resolveFocusSections`, which already renders "Built from your mock" when true — the diagnostic object should carry the equivalent for every tier, not just mock).
- **Timestamp** — when this diagnosis was computed, since (unlike the daily plan, which is recomputed live) a signup-time diagnosis is a snapshot that will age.
- **Student acknowledgement/choice** — whether the student engaged with a CORRECTION (i.e., saw that their belief and the evidence disagreed) — this is the field that would let a future analytics pass actually answer "how often does this disagreement happen and what do students do about it," which nothing in the current system can answer today (prior audit, Part L #11 and Part N).

**The non-negotiable rule:** the plan engine must **consume** this object, not merely be shown alongside it. Per Phase 9, that means the diagnostic object should be persisted somewhere `resolveFocusSections` (or its eventual replacement) can read as one more evidence tier — not a second, parallel plan-generation path.

---

## PHASE 9 — Canonical Source of Truth: Ownership Model

| Responsibility | Owner (conceptual) | Notes |
|---|---|---|
| **The diagnosis** ("what is this student's weakness, and why") | A single diagnostic engine, evidence-hierarchy-driven per Phase 2, gated per Phase 6 | This does not currently exist as a distinct thing — today it is smeared across `prep-insight-engine.ts` (Instant Insight only) and `resolveFocusSections` (daily plan only), with no shared object between them |
| **The study plan** (which section/topic to schedule, when) | `resolveFocusSections()` → `plan-day.ts` → `generateRoutine()` | Already canonical, already well-governed (Phase 1's re-confirmation of its own header comment). Should **consume** the diagnostic engine's output as one more input, not be replaced by it |
| **Mentor matching** (paid session assignment) | `session-credit.ts`'s `matchMentor()` | Currently reads raw `self_reported_weakest_section` directly, bypassing the resolver. Should consume the same canonical diagnosis the plan uses, so a student's assigned mentor and assigned study focus are never plainly two different answers to "what's your weak section" |
| **Cohort/peer matching** | `peer-cohort.ts` | Currently reads raw `self_reported_weakest_section` for display and matching dimension. Lower stakes (social-proof copy, not a scheduling or spending decision) — can reasonably continue to consume the same field directly, AS LONG AS it's understood as a display/matching convenience, not a second diagnosis |
| **Buddy showcase ranking (free tier)** | `buddy-match.ts` | Currently the narrowest and most fragile: baseline-only, no fallback, and per Phase 1, its ONLY input (`baseline_*`) is orphaned in production. This is the system most urgently in need of a decision — it is not currently working as designed for any real student today |

**Which existing systems should consume the canonical diagnosis, remain independent, be deprecated, or be merged — stated plainly, without yet designing the mechanism:**

- **Consume the canonical diagnosis:** `resolveFocusSections()` (as an additional evidence input, not a replacement of its own mock/self-report/coverage chain — those ARE the evidence hierarchy, just currently unlabeled as such), `session-credit.matchMentor()` (replace its raw self-report read).
- **Remain independent, by design, not by neglect:** `peer-cohort.ts`'s display use of the raw self-report — this is copy generation, not a decision with financial or scheduling weight, and forcing it through a heavier canonical-diagnosis object would be disproportionate to what it's for.
- **Should be deprecated as a separate computation:** `api/routine/add-block`'s inline `self_reported_weakest_section ?? 'DILR'` bypass (it should call whatever the daily plan already decided, since it's adding to the SAME day's plan), `student-brief.ts`'s unweighted coverage ranker (a THIRD independently-coded coverage formula for a sales script has no principled reason to exist separately from whatever the canonical diagnosis already computed).
- **Needs a founder decision, not just an engineering merge:** `buddy-match.ts` — given `baseline_*` is confirmed dead in production (Phase 1), this system is currently non-functional for its stated purpose for every real student. Whether it should be rebuilt on the canonical diagnosis, rebuilt on a revived baseline concept, or reconsidered entirely is a product question this document surfaces but does not answer.
- **`section_elo`** — Phase 1 confirms this is scaffolding for a feature that was never built. Whether an Elo-style adaptive system is still wanted is, again, a founder decision outside this document's scope; if not, this is the cleanest possible retirement candidate in the whole map (zero code touches it, zero data varies from default).

---

## PHASE 10 — Redesign Test Matrix

Fifteen students, each traced INPUT → EVIDENCE → DIAGNOSIS → STUDENT-FACING INSIGHT → PLAN ACTION under this document's proposed model (not the current system).

| # | Student | Input | Evidence | Diagnosis (type) | Student-facing insight (shape) | Plan action |
|---|---|---|---|---|---|---|
| 1 | Self-report VARC, evidence VARC | Self-report=VARC | Coverage: VARC weakest | CONFIRMATION | "You said VARC — your coverage backs that up, specifically at [topics]." | Plan prioritizes VARC, names the same topics |
| 2 | Self-report VARC, evidence QA | Self-report=VARC | Coverage+foundation: QA weakest | CORRECTION | "You said VARC. Your prep data points to QA instead — here's specifically why." | Plan prioritizes QA, diagnostic object records the disagreement and the student's exposure to it |
| 3 | Self-report QA, evidence VARC | Self-report=QA | Coverage: VARC weakest | CORRECTION | Same shape as #2, section names swapped | Plan prioritizes VARC |
| 4 | Strong self-report, no objective data | Self-report=DILR | No coverage, no mock | CONFIRMATION (belief-only) — explicitly labeled low-confidence | "You said DILR. We don't have coverage or mock data yet to check that against — we'll start there and confirm as you go." | Plan starts DILR on self-report alone, diagnostic object confidence = HYPOTHESIS-adjacent (self-report is real but uncorroborated) |
| 5 | Performance contradicts self-report | Self-report=DILR, decisive recent mock says VARC | Rank-1 evidence available | CORRECTION, high confidence | "You said DILR. Your last mock says otherwise, clearly — VARC needs the work." (mirrors existing `mockBasis` disclosure) | Plan prioritizes VARC, `source=mock`, confidence=VERIFIED |
| 6 | Coverage contradicts performance | Coverage: VARC healthy; mock: VARC poor | Rank-1 + rank-4 disagree with each other | Special case (Phase 2, Case 3) | "Your VARC coverage looks solid, but your mock scores there are lower than expected — that gap usually means it's a testing-conditions issue, not a knowledge gap." | Plan keeps VARC coverage light, adds a mock-analysis/testing-skill task instead of more topic coverage |
| 7 | Foundation gap exists, performance good | Active topic X, unmet prereq Y; mock in that section is strong | FOUNDATION exists but rank-1 evidence contradicts urgency | FOUNDATION, explicitly downgraded by the performance evidence | Likely suppressed or shown as a minor/secondary note only, per Phase 6 check 4 ("does it explain something meaningful") — if performance is already strong, a structural risk that hasn't manifested is lower priority to lead with | Plan does not reprioritize; foundation gap logged for later, not acted on now |
| 8 | Foundation gap in an unrelated section from self-report | Self-report=VARC; foundation gap is in QA (Functions/Linear Eq) | No rank-1/2 evidence connecting them | Must NOT surface as the hero insight per Phase 6 check 1 — this is exactly the founder's original screenshot bug | Either suppressed, or explicitly framed as a SEPARATE, second-tier note: "Separately, unrelated to VARC: [QA foundation fact]" — never presented as if it answers the VARC question | Plan may still note the QA foundation gap as a secondary task, but never displaces VARC as the lead |
| 9 | Almost no topic data | 2 topics tapped, no self-report, no mock | Below evidence floor | INSUFFICIENT EVIDENCE (unless a rank-1/foundation exception clears, per existing `MIN_ACTIVITY_TO_DIAGNOSE` design) | "We don't know enough yet — here's where to start." | Plan uses `startingPoints` logic (already built), no weakness claim made |
| 10 | Nearly complete preparation | Coverage 90%+, all sections | Low absolute gaps everywhere | COVERAGE-ONLY, or a distinct "consolidation" note (this document does not invent a sixth insight type for it, but flags it as a real gap — see Open Questions) | "You're closer to the end than the start — the risk now is retention, not coverage." (mirrors the existing `detectFinalStretch` detector, which already exists and is sound) | Plan shifts from new-topic coverage to spaced revision |
| 11 | Multiple equal weaknesses | Coverage gap in VARC and QA, roughly tied | No mock, no self-report | Ambiguous — must not force a false single winner | "Two sections need real attention, not one — VARC and QA are close, DILR is ahead." Names both rather than picking a coin-flip winner (directly addresses this document's Part 1B finding about `TIE_ORDER`'s VARC/DILR structural bias in the CURRENT system) | Plan may split priority or ask the student which to lead with, rather than silently resolving a near-tie |
| 12 | No meaningful weakness can be established | High coverage, high mock scores across the board, no self-reported concern | All evidence agrees: no weakness | Legitimate STRENGTH output, not a forced weakness | "Nothing here is dragging you down right now — here's where to hold steady." (mirrors existing `detectSectionStrength`, sound design, kept) | Plan holds current section balance, shifts effort to mocks/revision |
| 13 | Strongest and weakest section identical/invalid state | Data error or a genuine tie across the whole matrix | Degenerate input | Must fail safe, not fail confident | "We're not confident enough in a specific weak point today — here's a safe starting point." | Falls through to INSUFFICIENT EVIDENCE rather than asserting a meaningless "your weakest is your strongest" |
| 14 | Baseline unavailable | No `baseline_*` data (the norm, per Phase 1 — 411 of 412 students) | Falls to next tier | Handled entirely by hierarchy fallthrough (Phase 2) — NOT an error state | Same as any other tier-4/tier-2 case above | Same as any other case — this is the default, not an edge case, and the system must never treat it as degraded |
| 15 | Baseline stale/orphaned | The one test-account row with `baseline_locked=false`, values set months ago (illustrative — this exact row is a test account, not real) | If this pattern occurred for a real student: baseline present but never locked, never revisited | Should have a staleness consideration analogous to `mockInformedFocus`'s 45-day window — an unlocked, ancient baseline is weaker evidence than a fresh one | Would render at reduced confidence, or fall through to coverage if stale enough | This document does not specify an exact staleness threshold for baseline — flagged as an Open Question, since baseline itself is not currently a live feature to calibrate against |

**Cases where the system MUST REFUSE to generate a section-level insight:**
- #9 (below evidence floor) and #13 (degenerate/tied state) — both must fall through to INSUFFICIENT EVIDENCE rather than manufacture a winner.
- #8 — must refuse to present an unrelated-section foundation gap AS IF it answers the student's self-reported question; it may still be shown, but never as the hero, and never without explicit re-framing as a separate finding.
- #7 — must refuse to lead with a foundation gap that contradicts strong performance evidence in the same section, per Phase 6 check 4 ("does it explain something meaningful" — a risk contradicted by outcome evidence is not currently meaningful to lead with).
- Any case where the only evidence for a WEAKNESS-or-PERFORMANCE-PROBLEM-level claim (Phase 3, concepts A/D) is coverage or foundation alone — the system may describe the coverage/foundation fact plainly, but must refuse to use the words "weak" or imply poor performance without rank-1 or corroborated rank-2 evidence.

---

## Migration Considerations (Section 12)

This document does not propose an implementation sequence, but the evidence gathered surfaces constraints any future sequencing must respect:

- **Volume reality:** rank-1 evidence (mock data) exists for 3.4% of students today. A phased rollout must not accidentally make the product WORSE for the 96.6% by, say, shipping only the "performance available" path first and leaving the coverage/self-report path regressed relative to what exists now.
- **`self_reported_weakest_section` is brand new (11 real rows) and growing** — any redesign should assume its population will look very different (much larger) within weeks, not treat today's low-n as representative.
- **`baseline_*` and `own_weakest_section` are dead in production, not just in code** — reviving them (if a founder decision is made to do so) requires an actual product surface to collect them, not a schema/route fix alone; the route and columns already exist and work correctly for whoever eventually calls them.
- **`docs/STUDY-PLAN-PIPELINE.md` is stale** relative to current code (Phase 1) — worth a documentation pass independent of any code change, since it's a founder-facing reference document that currently misdescribes self-report as "legacy."
- **The existing `dead_columns()` tooling has blind spots** (Phase 1) that a future cleanup pass should account for rather than trust blindly.

## Open Questions (Section 13)

1. Should `baseline_*` be revived as a real onboarding-diagnostic-mock feature, or formally retired? Zero real production usage either way today — this is a clean decision point, not an entangled one.
2. What is the right staleness window for a diagnostic object itself (Phase 8's `timestamp` field) — should a signup-time diagnosis ever be recomputed, and on what trigger (a new mock, a significant coverage change, a fixed time window)?
3. Scenario #10/#11's near-tie and "nothing left to diagnose, but not literally strength" cases don't cleanly fit Phase 5's five types — is a sixth type warranted, or should these compose from existing types (this document leans toward composition, per Phase 5's reasoning, but flags it as a real open edge)?
4. Should `buddy-match.ts` and `session-credit.matchMentor()` be migrated to consume the canonical diagnosis in the same rollout as Instant Insight, or sequenced later given they touch a paid-conversion surface?
5. What should the diagnostic object's `student acknowledgement` field actually capture — did they see the CORRECTION, did they tap through it, did they explicitly disagree? This has direct implications for whatever UI eventually renders Phase 7's screen.

## Things We Must NOT Implement (Section 14)

- Must not invent or interpolate performance data where none exists — the 96.6%-no-mock reality (Phase 1) must be treated as the normal case, not patched over with a synthetic confidence score.
- Must not let `findFoundationGap`-style structural facts carry performance-level causal language without rank-1 backing (Phase 3, Phase 6 check 5) — this is the single most direct fix implied by the whole investigation, and it must not regress into unhedged copy under deadline pressure.
- Must not silently override a student's self-report anywhere in the product — every CORRECTION-type insight, wherever it eventually surfaces (Instant Insight, mentor matching, buddy ranking), must disclose the disagreement, mirroring `mockBasis`'s existing "never silent" rule.
- Must not build a sixth independently-coded "weakest section" formula to solve this — Phase 9's whole point is consolidation, and any implementation that adds a new parallel calculator (even a well-intentioned one, even for a legitimate-seeming special case) repeats the exact failure this investigation catalogued five times over.
- Must not gate Home, plan access, or onboarding completion on a student engaging with or resolving a CORRECTION-type disagreement — this repo has a documented incident (referenced in the guard-test comments already in the codebase, "Incident #2 shape") where requiring an action to proceed took a whole cohort's logging to zero; a diagnosis screen must remain skippable exactly as it is today.
- Must not treat `dead_columns()` or any single automated tool as sufficient verification going forward — Phase 1 found real blind spots in it; manual verification (code trace + production query) remains necessary for decisions with product weight.

---

*End of specification. Nothing in this document has been implemented. Phase 1's findings are direct production-query results (aggregate counts only, no individual student data disclosed), cross-checked against independent code-trace evidence. Per your instruction, an implementation plan is a separate, later deliverable, to be produced only after your review of this document.*
