# CareerRai Instant Insight — Research & Product Design Review

**Status: RESEARCH ONLY through Section 15. Section 15 is an implementation plan document, not code. Nothing in this document has been implemented, migrated, or committed as application logic — only this markdown file exists as a new artifact.**

Mandate, restated so the verdict below is checkable against it: attack the "three-finding" hypothesis (student belief validated once, then two hidden high-impact gaps surfaced from elsewhere in the prep) using real production data and real code, and say plainly if it doesn't hold up. It mostly holds up — but one piece of it runs directly into a data-model constraint the codebase itself declares, and that constraint changes the mechanism, not the product idea. Full reasoning below.

---

## 1. What We Currently Know

Carried forward from the three prior documents this session produced (`2026-08-15-instant-insight-forensic-audit.md`, `2026-08-15-weakness-truth-table.md`, `2026-08-15-diagnostic-redesign-spec-v1.md`), not re-derived:

- 412 real students; 364 (88%) have `topic_coverage` data; 14 (3.4%) have any `mock_debriefs`; 11 have a real self-reported weakest section; `baseline_*` and `section_elo` are confirmed dead in production, not just in code.
- `resolveFocusSections()` is the one genuinely canonical, evidence-hierarchy-driven decision in the codebase (performance > self-report > baseline > coverage > default), consolidated 14 Aug after three independent copies were found to disagree.
- `prep-insight-engine.ts`'s coverage-gap and foundation-gap detectors are real, correctly-computed, but blind to the student's self-report and blind to section relevance — this is the mechanism behind the founder's original screenshot complaint.
- `TOPIC_METADATA`'s `weightage`/`difficulty`/`estimatedHours` fields are explicitly disclaimed in their own source comment as editorial, not measured (quoted again in Section 4, this is load-bearing for this whole document).

## 2. What We Do Not Know (before this pass) — now resolved or still open

| Question | Status after this research pass |
|---|---|
| Is there an external CAT topic-frequency dataset backing `weightage`? | **Resolved: no.** Repo-wide search for `.csv`/frequency data files found none relevant; the field's own comment confirms it's an internal estimate. |
| Is there topic-level performance data at any real scale? | **Resolved: no.** `mock_debriefs` is section-level only (VARC/DILR/QA percentiles, never per-topic). `topic_evidence` (the real per-topic ladder) has 10 rows total in production. `exam_ready` has never been reached by any topic for any student (0 rows). |
| Is `weightage` comparable across sections? | **Resolved: no, by explicit design** — this is the central finding of this document, see Section 4. |
| Does a "biggest hidden gap regardless of section" ranker already exist anywhere in the codebase? | **Resolved: no**, but a very close, already-canonical building block does — `baseCoverageScore()` (`src/lib/topic-selector.ts:109-119`), see Section 11. |
| Is there other topic-tracking infrastructure in the schema we hadn't accounted for? | **Resolved: yes — a third one.** `qa_topic_progress`/`qa_daily_plan` (`supabase/migrations/20260722_mastery_schema.sql`), a QA-only mastery-stage schema, fully dead in application code today (zero references in `src/`) despite carrying 14 real rows — an apparent abandoned prototype, not currently reachable from any live feature. |

## 3. Data Quality Audit

| Source | File : schema | Freshness | Students/records | Production-populated | Reliable for a student-facing claim? |
|---|---|---|---|---|---|
| `topic_coverage` | `topic_coverage` table, `student_id, section, topic, status` | Live, continuously updated | 364/412 students, 19,255 rows | Yes, dominant | Yes, for **activity** claims ("untouched," "in progress") — not for ability claims |
| `mock_debriefs` | `mock_debriefs` table, per-section percentile | Live, most recent 14 Aug | 14/412 students | Yes, but sparse | Yes, when present — this is the strongest evidence in the system, just rare |
| `topic_evidence` | `topic_evidence` table, six-check ladder (`concept, easy, medium, hard, revision, tested`) | Live code path exists (`src/lib/evidence.ts`) | 10 rows total | Technically yes, practically negligible | Not yet — n is too small to be a general mechanism today, though the mechanism itself is sound |
| `qa_topic_progress` / `qa_daily_plan` | `supabase/migrations/20260722_mastery_schema.sql` | Dead — zero application code references anywhere in `src/` | 14 / 0 rows | Orphaned, likely from an abandoned prototype | No — nothing reads it, so it cannot inform a live claim regardless of what the 14 rows contain |
| `TOPIC_METADATA.weightage` | `src/lib/topics-constants.ts:143` | Static, code-reviewed, not measured | N/A (content, not student data) | N/A | Reliable as a **content-editorial ranking signal**, not as a statistic — see Section 4 |
| `baseline_varc/dilr/qa` | `profiles` table | Dead in production (Section 1 of this doc, and the prior redesign spec's Phase 1) | 1 row (test account) | No | No |
| `section_elo` | `profiles.section_elo` | Dead by design, 100% unmodified default | 422/422 rows, zero variance | No | No |

## 4. Weightage/Importance Research — the Central Finding

Direct quote, `src/lib/topics-constants.ts:121-126`, unchanged since it was written and re-verified in this pass:

> "Values are a defensible first-pass ranking based on widely-known CAT prep conventions (RC dominates VARC scoring, Arithmetic is the broadest/most heavily tested QA area, DI and LR are roughly equal-weight in DILR) — they are editable content a subject-matter reviewer should refine, NOT measured data or the output of any study. Treat any specific number here as a starting estimate, never as a cited fact."

Answering the ten questions directly:

1. **Official CAT topic-level weightage?** No.
2. **What data do we have instead?** An internally-authored, expert-judgment ranking, on a 1-5 scale per topic.
3. **Frequency-based?** No — described as "widely-known conventions," not a frequency count from any actual paper set.
4. **Historical frequency?** No historical dataset exists in this repository (confirmed by search — no CSV, no imported dataset, no citation anywhere near `TOPIC_METADATA`).
5. **An estimate?** Yes, explicitly, in the field's own words.
6. **Section-level only?** **Yes — and this is the load-bearing fact for everything that follows.** The field is defined (`topics-constants.ts:130`) as "relative emphasis **within its OWN section**, 1-5." A QA topic's `weightage: 5` and a DILR topic's `weightage: 5` are not claims that the two topics are equally important to the exam — they only mean each is near the top of importance *inside its own section*. The first forensic audit already flagged this for a different reason (Part D: "weightage is never summed across sections... the word 'marks' appears nowhere in student-facing copy"); this document extends the same finding to a new consequence, Section 6 below.
7. **Coaching-analysis based?** Partially, per the "widely-known CAT prep conventions" phrasing — this reads as founder/content-team domain expertise, not a formal coaching-industry study.
8. **Internally calculated?** Yes.
9. **How many years of data?** None — there is no data behind it in the "years of past papers" sense.
10. **Does it change materially year to year?** Unanswerable — it was never tied to a yearly cycle to begin with.

**Direct answer to the mandate's instruction:** do not invent a number like "18% weightage." That number would not survive the `docs/EVIDENCE-POLICY.md` Zero Guess Policy already governing this codebase (it would be a HYPOTHESIS wearing VERIFIED clothing). But the codebase has already, independently, arrived at the right answer in production copy: `topic-selector.ts:189` — `if (meta && meta.weightage >= 4) reasons.push('High-scoring area');` — a qualitative, defensible label ("High-scoring area"), never a fabricated percentage. **This exact phrase, or ones like it, is the correct register for any weightage-based student-facing claim**, and it already exists, tested, in a different part of the product. Reuse it; do not invent a number next to it.

## 5. Candidate Ranking Models for "the biggest hidden gap"

Tested conceptually against realistic students, using the real formulas found in the codebase where they exist.

**A. Importance × incompleteness.** This is, almost verbatim, what `baseCoverageScore()` already computes (`topic-selector.ts:109-119`): `COVERAGE_POINTS[status] + weightage×8 + sequence-order nudge − 18 if a prerequisite is unmet`. Real, in production, founder-rebalanced after actual student feedback (the "16 Jul PNC" incident cited in the file's own comment). **Failure mode: only valid within one section**, because `weightage` is section-relative (Section 4). Using it to compare a QA topic's score against a DILR topic's score directly would be comparing two different scales as if they were one — exactly the "false precision" trap the founder's own message explicitly rejected.

**B. Importance × incompleteness × section relevance.** Adds a filter/boost for whether the section matches the self-report. Sound for the VALIDATION finding (Section 4's within-section case). Not the right tool for DISCOVERY/OPPORTUNITY, which are explicitly supposed to range across *other* sections.

**C. Importance × incompleteness × prerequisite depth.** This is close to `findFoundationGap`'s existing mechanism, restricted to a relevance-gated context. Good for a FOUNDATION-type finding specifically, not a general-purpose gap ranker.

**D. Importance × incompleteness × student study history.** No clean existing signal for "study history" beyond what coverage/streak data already imply. Would require defining a new concept (e.g. days-since-last-touch) that partially exists (`revision-due` logic in `topic-selector.ts`) but isn't currently framed as a standalone ranking dimension. Plausible but not free — real design work, not a reuse.

**E. Importance × incompleteness × performance evidence.** Cannot be built today at topic granularity — no per-topic performance data exists at meaningful scale (Section 3: `topic_evidence` n=10, `exam_ready` n=0). Could be built at SECTION granularity using `mock_debriefs`, but only helps the 3.4% of students who have any.

**F. Opportunity / expected-marks impact.** This is the model implied by the mandate's own phrasing ("high-impact/high-frequency"). Given weightage cannot be summed or compared across sections (Section 4), a literal "expected marks impact" number cannot be computed honestly today. A **qualitative** version — "this is a high-scoring area within its own section, and it's still open" — is exactly what's achievable and matches production precedent (Section 4).

**Recommended resolution, not assumed but derived from the above:** a **two-stage model**, not a single cross-section score. Stage 1 ranks *sections* against each other by a within-section-normalized gap measure — this already exists in TWO independently-coded forms in this codebase (`prep-insight-engine.ts`'s weighted `gap` and `section-weakness.ts`'s `weakestFromCoverage`, both explicitly designed to produce a comparable 0-1 score *per section*, precisely because raw weightage cannot cross that boundary). Stage 2, having chosen a section, ranks *topics within it* using `baseCoverageScore()` (Model A), which is exactly what it's for. This avoids ever comparing a QA topic's weightage number to a DILR topic's number directly — the only cross-section comparison made is a normalized gap score, a comparison the codebase already trusts itself to make (both existing coverage-gap formulas do exactly this today, just for a single "weakest section" output rather than multiple ranked findings).

## 6. Distinguishing Gap From Weakness (restated with this document's new grounding)

| Concept | What it can claim | What it cannot claim |
|---|---|---|
| **COVERAGE GAP** | "Linear Equations is untouched" — a fact about activity | That the student is weak at it |
| **HIGH-IMPACT GAP** | "This untouched topic is rated high-scoring **within its own section**" | Any specific number (18%, etc.); any claim it's more important than a topic in a DIFFERENT section — the data cannot support that comparison (Section 4) |
| **FOUNDATION GAP** | "You're actively working on X, and its prerequisite Y is untouched" — a structural/sequencing fact | That this is *causing* a felt exam experience (already flagged in the prior forensic audit as the "hard questions feel random" overclaim) |
| **PERFORMANCE GAP** | "Your last mock shows section X scoring lower than the others" | Anything at topic granularity — no reliable topic-level performance data exists today |

"RC Inference learning" does not prove it's costing marks — it proves activity is in progress, nothing more, consistent with the first forensic audit's Part J and this document's Section 3.

## 7. Attacking the Three-Finding Hypothesis Directly

**What survives the attack:** the product philosophy — *"the student tells us what they already know; CareerRai should tell them what they don't"* — is sound and is NOT undermined by anything found in this research. It correctly reframes the self-report from "the scope of the diagnosis" to "one input among several," which is exactly the fix the forensic audit's founder-reviewed screenshot problem needed. The instinct to reject both "force everything to the self-reported section" and "ignore the self-report entirely" is also correct and matches this session's own evidence hierarchy work.

**What does not survive unmodified:** the literal mechanism — "find the biggest untouched high-weightage topic in QA, and another in DILR, and rank them against the VARC finding" — requires comparing importance numbers across sections, which `TOPIC_METADATA.weightage`'s own definition (Section 4) says cannot be done. If built literally as described, the DISCOVERY and OPPORTUNITY findings would either (a) silently invent a cross-section comparison the data doesn't support (a Zero Guess Policy violation, HYPOTHESIS dressed as VERIFIED), or (b) pick whichever section happens to have more RAW untouched topics, which reintroduces exactly the section-size bias the prior truth table already flagged in `prep-insight-engine.ts`'s `TIE_ORDER`.

**The fix that preserves the product idea:** the two-stage model from Section 5. Section-level comparison (already a solved, trusted problem in this codebase, twice over) picks WHICH sections get a DISCOVERY/OPPORTUNITY slot; topic-level ranking WITHIN that section (also already solved, via `baseCoverageScore`) picks the specific topic to name. The findings are then honestly describable as "the biggest gap in [section]," not "the second-most-important thing in your entire prep" — a real, defensible, only-slightly-softer claim that costs nothing in WOW value (Section 9 shows why) and avoids the false-precision trap entirely.

**One more constraint worth surfacing explicitly, not raised in the mandate:** picking "the weakest OTHER section" for DISCOVERY and "the second-weakest OTHER section" for OPPORTUNITY (a natural way to guarantee three genuinely different sections get represented) still needs a tie-break rule when two non-self-reported sections are close — and the two existing section-gap formulas already have DIFFERENT tie-break rules (`prep-insight-engine.ts`: DILR→QA→VARC on ties for "weakest," meaning VARC structurally never wins; `section-weakness.ts`: same DILR→QA→VARC order but justified explicitly as "DILR is where CAT is most often lost"). Whichever becomes canonical must pick one rule, consciously, not inherit whichever formula happens to get reused first.

## 8. Twenty-Student Simulation

Illustrative constructions (not live production data, per this session's established convention), using the two-stage model from Section 5. `V1/D1/O1` = validation/discovery/opportunity finding.

| # | Self-report | Sketch | V1 | D1 | O1 | Notes |
|---|---|---|---|---|---|---|
| 1 | VARC | QA has the largest actual gap | "RC inference still incomplete" (VARC, real but minor) | "[High-scoring QA topic] still untouched" | "[DILR topic] still at learning" | The founder's original case, now correctly triaged: VARC gets ONE honest, modest pointer; the real story (QA) becomes DISCOVERY, explicitly framed as new information, not silently swapped in |
| 2 | VARC | VARC genuinely has the largest gap | Strong VARC finding | Second-largest gap section | Third | All three findings legitimately trace to real gaps; DISCOVERY/OPPORTUNITY still add value by being MORE specific than the self-report alone |
| 3 | VARC | VARC nearly complete | Honest, modest, or possibly "nothing significant left in VARC" | Real gap elsewhere | Real gap elsewhere | This is Section 9's strongest case — "you were right to feel confident-ish, here's what's actually costing you" |
| 4 | any | Gaps everywhere, roughly even | Self-report section's specific gap | Next section by gap score | Third section by gap score | Straightforward, no ambiguity |
| 5 | any | Almost no topic data | — | — | — | Falls to INSUFFICIENT EVIDENCE per the redesign spec's existing floor logic — three findings should never be manufactured from near-nothing |
| 6 | any | Excellent coverage everywhere | Weak/no V1 | Weak/no D1/O1 | — | This is scenario #12 from the prior redesign spec's test matrix — legitimate STRENGTH output, not a forced three-finding screen |
| 7 | any | A specific high-scoring topic untouched | — | Named directly | — | Model A/Section 5 at its cleanest |
| 8 | any | A specific LOW-scoring topic untouched | Should NOT surface as DISCOVERY | — | — | `baseCoverageScore`'s weightage×8 term naturally suppresses this; the gate should too |
| 9 | any | Two sections tied on gap score | Tie-break rule required (Section 7's flag) | — | — | A real open decision, not resolved by this document |
| 10 | any | Foundation gap present | Could be V1 (if self-reported section) or D1 (if elsewhere), never silently substituted for V1 | | | Directly the founder's screenshot mechanism, now correctly scoped |
| 11 | any | High-frequency topic already mastered (`revising`) | — | Should NOT surface — mastered topics are the opposite of a gap | | `COVERAGE_POINTS.revising: 8` (low) already reflects this |
| 12 | any | Low-frequency topic completely untouched | — | Low priority, likely suppressed by weightage×8 term | | Correctly deprioritized by the existing formula |
| 13 | any | Performance contradicts coverage | V1 should reflect performance if a mock exists, per the redesign spec's Case 3 | | | Rare (3.4% of students) but the correct behavior is already specified |
| 14 | any | No performance data (the 96.6% case) | Coverage/self-report only | | | **This must be the default-path design target, not the edge case** — restated from the redesign spec |
| 15 | any | Self-report contradicts performance | CORRECTION-type V1, explicitly disclosed | | | Per the redesign spec's Phase 2, Case 1 |
| 16 | any | Self-report is the only meaningful evidence | V1 leans harder on it, honestly labeled lower-confidence | | | Matches redesign spec's test matrix #4 |
| 17 | returning student, gap now closed | Previous DISCOVERY topic now covered | New V1/D1/O1 computed fresh | | | Confirms this must be a live recomputation, not a cached one-time artifact — ties to Section 10's staleness question |
| 18 | any | Stale topic matrix (student hasn't opened app in weeks) | Same computation, just on older data — no special handling exists today | | | Flagged as an open question, not solved by this document |
| 19 | any | Topic taxonomy changes (a topic renamed/removed) | Would silently break any hardcoded topic-name references | | | Argues for keying findings by topic ID/metadata lookup, not literal strings, in whatever implementation follows |
| 20 | any | No defensible insight exists anywhere | | | | Must produce the honest "not enough yet" state — never fabricate three findings to fill the screen |

## 9. Attacking the "WOW" Claim

Ranking the five given options on novelty / relevance / credibility / actionability / emotional impact / trust:

- **A** ("You are weak in VARC") — fails credibility (Section 6: no evidence supports "weak" without performance data) and fails novelty (student already believes this).
- **B** ("Your RC inference coverage is incomplete") — credible, but low novelty (restates something checkable from memory) and low emotional impact.
- **C** ("You're spending time on Functions while Linear Equations underneath it is untouched") — high novelty and credibility, but ONLY when it addresses what the student actually asked about; as the sole finding on a screen that ignores a stated self-report, it fails relevance/trust (this is the original bug).
- **D** ("You told us VARC... while checking, we found [QA topic] untouched") — high novelty, high relevance (explicitly anchored to the self-report), credible IF the QA finding is real and specifically named, strong actionability.
- **E** ("You already know VARC needs work. The bigger thing you're missing is [X]") — same strengths as D, slightly more confident/declarative tone.

**The mandate's three-finding structure outperforms all five single-statement options on the combination the mandate asks about**, precisely because it doesn't have to choose between confirming and surprising — it does both, sequenced, which single-sentence options structurally cannot. This is the one place this document agrees without reservation: **the three-finding structure is a genuine product improvement over any single "best" sentence**, conditional on Section 7's two-stage-model fix being the actual mechanism.

## 10. How Many Findings — Not Assumed to Be Three

Tested against Section 8's simulation: three is not universally right.

- **Below the evidence floor** (simulation #5, #20): zero findings, honest insufficient-evidence state.
- **Excellent coverage, nothing to flag** (simulation #6): a strength-only output, not three manufactured gaps.
- **Genuinely one dominant issue with nothing else defensible nearby** (a student with severe, singular gap concentration): two findings (V1 + D1) may be all the evidence honestly supports — forcing a third would violate the redesign spec's "no evidence → no manufactured insight" rule, restated in the mandate's own rejected-approaches list ("give every student an insight — terrible").
- **The mandate's instinct to question "three" is correct.** The right rule is **1 required (V1, when a self-report exists) + up to 2 additional (D1/O1), each independently gated by the same evidence floor** — not a fixed count. This is fully consistent with the redesign spec's existing `cards.slice(0, 2)` pattern in `prep-insight-engine.ts`, which already caps rather than pads.

## 11. Existing Systems to Reuse vs. Replace

| System | Reuse or replace | Why |
|---|---|---|
| `resolveFocusSections()` (`focus-sections.ts`) | **Reuse the philosophy, not the literal function** | It's section-scoped for the daily plan; the three-finding model needs multiple sections represented at once, which this function's single-`weakest`-output shape doesn't support directly — but its evidence-hierarchy discipline is exactly right and should govern each individual finding's confidence |
| `baseCoverageScore()` / `chooseTopicForSection()` (`topic-selector.ts`) | **Reuse directly** for within-section topic ranking (Section 5's Stage 2) | Already canonical (10 Aug consolidation), already founder-tuned against real feedback, already produces legible "why" copy |
| `prep-insight-engine.ts`'s per-section `gap` formula | **Reuse for Stage 1** (section-level ranking), OR converge with `section-weakness.ts`'s formula first | Two independently-coded, differently-weighted versions of the same section-gap concept exist today (prior truth table finding) — building a third for this feature would be exactly the mistake this whole investigation exists to stop |
| `findFoundationGap()` / `deepestUnmetPrereq()` | **Reuse, but relevance-gate it** per the redesign spec's Phase 6 | The mechanism is sound; it just needs to stop competing for the hero slot unconditionally |
| `TOPIC_METADATA` | **Reuse as-is**, treat weightage strictly as section-relative and never let it leak into a cross-section number | Section 4 |
| `evidence.ts`'s six-check ladder / `topic_evidence` | **Not reusable yet** — real infrastructure, negligible data (n=10) | Worth revisiting once (if) adoption grows; not a dependency for this feature today |
| `qa_topic_progress`/`qa_daily_plan` | **Do not build on this** | Confirmed dead, orphaned, likely superseded — reviving it is a separate decision, out of scope here |
| `mockInformedFocus()` | **Reuse directly** wherever a finding can legitimately claim performance evidence (3.4% of students) | Already has the right evidentiary gating (complete/recent/decisive) |

## 12. Canonical Diagnostic Architecture (proposed, per the research above — not assumed in advance)

```
Student input (self-report, if given)
        ↓
Evidence collector
  (coverage rows, mock_debriefs if any, TOPIC_METADATA, prerequisite graph)
        ↓
Stage 1 — Section-level gap ranking
  (ONE canonical formula, converged from the two existing ones — not a third)
        ↓
Candidate finding generators, each independently evidence-gated:
  ├── VALIDATION  (self-reported section, if any — coverage/foundation/mock evidence within it)
  ├── DISCOVERY   (next-highest-gap OTHER section, topic chosen via baseCoverageScore)
  ├── OPPORTUNITY (third-highest-gap OTHER section, same topic-selection method)
  └── (FOUNDATION and PERFORMANCE findings can substitute into any slot when their
       evidence is stronger than a plain coverage-gap finding for that slot)
        ↓
Relevance/evidence gate (redesign spec's Phase 6, seven checks) — per finding, not per screen
        ↓
0-3 surviving findings, each independently gated (Section 10 — not a fixed count)
        ↓
Student Insight screen (belief ack → evidence → diagnosis → why → action, per finding)
        ↓
Diagnostic object(s) — one per surviving finding
        ↓
Plan Engine consumes the SAME object(s), not a re-derived approximation
```

This is close to the mandate's own sketch, with two corrections earned by the research: Stage 1's section-ranking must be singular/converged (not invented fresh), and the finding count is a gated 0-3, not a fixed 3.

## 13. Study-Plan Handoff

Per the redesign spec's Phase 8/9 (not re-litigated here) plus one addition specific to THREE findings: since the plan cannot act on three sections' worth of work simultaneously, **the diagnostic object set needs an explicit priority field distinguishing "this becomes today's plan focus" from "this is queued/secondary."** Recommended default, derived from the evidence hierarchy already established: the highest-confidence finding (performance-backed, if any; otherwise self-report-backed V1) drives the immediate plan; D1/O1 are surfaced to the student but queued, with the same "never promise what the plan won't do" discipline — if D1 is shown but not actioned this cycle, the copy must say so ("worth knowing, we'll get to it after X"), not imply immediate action it doesn't take. Whether the student gets to choose which finding becomes the immediate focus, versus the system deciding by evidence strength, is a real open product question (Section 16) — this document does not resolve it, because it's a UX/control preference, not something the data can settle.

## 14. Hard Product Invariants

Restated and extended from the redesign spec's Phase 14, with additions earned by this research:

1. Never call an incomplete topic a weakness without performance evidence.
2. Never show an unrelated finding as the ONLY/primary insight with no acknowledgment of the self-report — always pair it with a real V1.
3. **Never state or imply a weightage number, and never compare weightage across sections** (this document's central, hard-earned addition).
4. Never show a finding without traceable evidence.
5. Never promise an action the plan engine does not execute.
6. Never silently contradict the student.
7. Never manufacture an insight because the screen needs content — including never padding to exactly three findings when evidence supports fewer.
8. Never use stale/dead diagnostic data (`baseline_*`, `section_elo`, `qa_topic_progress`) as if it were live.
9. **Never build a third independent section-gap formula** — converge the two that exist before adding anything new (Section 11).
10. **Never let DISCOVERY/OPPORTUNITY substitute for VALIDATION** — if a self-report exists, it always gets addressed, even briefly, even when the bigger story is elsewhere (this is the exact fix for the founder's original screenshot).

## 15. Implementation Plan (still not code — a plan for one)

Presented at the level of detail the mandate asked for, without writing the code itself:

- **Files to change:** `src/lib/prep-insight-engine.ts` (restructure `computePrepInsight` to accept `self_reported_weakest_section` and orchestrate the three-slot model), `src/app/start/screens/screen-instant-insight.tsx` (render belief-ack + up to 3 findings instead of 1 hero + minor lines), `src/app/start/page.tsx` (pass the self-report into the props it currently omits — the one-line fix identified at the very start of this investigation).
- **Functions to consolidate, before adding new logic:** `prep-insight-engine.ts`'s per-section `gap` and `section-weakness.ts`'s `weakestFromCoverage` — pick one formula, retire the other, per invariant 9.
- **New logic needed:** a Stage 1 multi-section ranker (returns an ORDERED list of sections by gap, not just the single weakest) — does not exist today in that shape; a slot-assignment layer implementing Section 12's generator list.
- **Database changes:** none required for the core feature — all inputs (`topic_coverage`, `self_reported_weakest_section`, `mock_debriefs`, `TOPIC_METADATA`) already exist and are live. If the diagnostic object is persisted (redesign spec Phase 8), a new table or a `notifications`-style row would be needed — a real but small schema addition, not a migration of existing data.
- **Diagnostic object schema:** per the redesign spec's Phase 8 fields, plus (per this document) a `slot: 'validation' | 'discovery' | 'opportunity'` field and a `priority: 'immediate' | 'queued'` field for the plan handoff (Section 13).
- **Migration strategy:** none needed for existing data (nothing is being renamed or moved); purely additive.
- **Feature flag:** recommended, given this touches the pre-signup funnel's conversion-critical screen — gate the new 3-slot render behind a flag, keep the current single-hero render as fallback until the new path is verified against real signups.
- **Test strategy:** extend `prep-insight-engine.test.ts`'s existing fixture pattern (`fullMatrix`, `BASE`) to cover Section 8's 20 scenarios directly as test cases; a new guard test asserting invariant 3 (no weightage number/percentage ever appears in generated copy) and invariant 10 (self-report, when present, always produces a V1 finding).
- **Telemetry:** per the redesign spec's diagnostic-object `student acknowledgement` field — this is also the fix for the first forensic audit's Part L #11 finding (no record today of which insight a student actually saw).
- **Rollout:** feature-flagged to a small cohort of new signups first, compare against the current single-hero screen's downstream behavior (does the student log a day, does the recommended topic actually get studied) before full rollout.
- **Rollback plan:** flip the feature flag; no data migration to reverse since nothing is destructively changed.
- **Legacy logic to retire:** the losing half of the section-gap duplication (invariant 9); `student-brief.ts`'s independently-coded coverage ranker should also be reconsidered once a converged section-gap formula exists, per the prior truth table's finding — not urgent for THIS feature, but the same underlying formula should eventually serve it too rather than staying a third copy.
- **Systems that will consume the new canonical findings, once built:** the daily plan (already does, via `resolveFocusSections`, once Stage 1 is converged), and per the truth table's ownership recommendations, mentor-matching and buddy-ranking are candidates for a LATER migration, explicitly not bundled into this feature's rollout.

## 16. Open Questions

1. The tie-break rule for near-equal section gaps (Section 7) — needs an explicit, conscious choice, not an inherited default.
2. Whether the student chooses which finding becomes the plan's immediate focus, or the system decides by evidence strength (Section 13).
3. Whether `evidence.ts`'s six-check ladder is worth actively growing (more logging prompts, etc.) now that this research shows it's the only path to genuine topic-level performance evidence — a product investment decision, not something this document can settle.
4. Whether `qa_topic_progress`/`qa_daily_plan` should be formally retired (dropped) or investigated further before being written off — this document treats it as unusable for THIS feature either way, but doesn't resolve its ultimate fate.
5. Exact wording/length constraints for D1/O1 findings on a screen that must still fit a pre-signup funnel's attention span — a UX-execution question, not a data question, deliberately left to the implementation phase.

---

*End of research review. Verdict: the three-finding product hypothesis is sound and worth building; the specific mechanism proposed for finding sections 2 and 3 needed one correction (a two-stage, section-then-topic model, never a direct cross-section weightage comparison) which this document derived from the codebase's own data-model constraints rather than assumed. No code was written or modified in producing this document.*
