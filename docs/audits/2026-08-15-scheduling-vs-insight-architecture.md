# Scheduling Priority ≠ Insight Priority — Candidate Architecture

**Read-only. No code, weights, or data changed. Not committed — file only, per standing instruction on this thread; not asking again this time, per your note.**

The distinction you're drawing is correct and sharpens something the last two documents in this investigation got only partway to. Flagged directly rather than glossed over: the prior weightage audit's Section 8 proposed resolving "does the foundation candidate win?" by comparing `baseCoverageScore(A)` against `baseCoverageScore(B)` — that is itself a category error under your framing, because comparing two candidates by their scheduling score is still a scheduling-flavored operation, not an insight-selection one. This document corrects that specific point (Section 4) rather than carrying it forward silently.

---

## 1. Canonical Responsibilities of Every Existing Scorer

| Scorer | File : location | Input | Output | Intended purpose | Production history | Reuse for Insight? |
|---|---|---|---|---|---|---|
| `baseCoverageScore()` / `chooseTopicForSection()` | `topic-selector.ts:109-165` | status, weightage, sequenceRank, prereq-unmet | a single priority number, per topic | **Scheduling** — which topic gets today's block | Real incident (16 Jul, "finish what you started"), 10 Aug consolidation of two disagreeing rankers | **As a candidate generator only** (Section 3) — never as the sole insight-selection metric (this document's correction) |
| `resolveFocusSections()` | `focus-sections.ts:88-110` | mock, self-report, baseline, coverage rows | one winning section + reason | **Scheduling** — which section leads the day | 14 Aug consolidation, founder-ruled evidence hierarchy | Yes, as the SOURCE of the scheduling candidate specifically (never as the insight-selector itself) |
| `weakestFromCoverage()` | `section-weakness.ts:19-31` | coverage rows | one section | **Scheduling** — lowest-priority fallback inside `resolveFocusSections` | 26 Jul consolidation (was 3 copies) | No independent role — already subsumed by `resolveFocusSections` |
| `mockInformedFocus()` | `mock-informed-focus.ts:63-91` | `mock_debriefs` | one section + disclosed reason | **Scheduling AND diagnosis** — the one scorer that legitimately does both, because it's the one signal ranked as real performance evidence | 13 Aug, explicit founder mandate ("mock score performance is significantly important") | Yes, directly, as a candidate — this is the one scorer whose OUTPUT is already insight-grade (it's disclosed, evidence-backed, and rare enough to always be worth surfacing when it fires) |
| `computePrepInsight`'s `weakest` (section gap) | `prep-insight-engine.ts:178-196,769-771` | coverage matrix | one section | **Diagnosis (intended), but currently mis-wired** | 13 Aug rebuild, but never received the self-report input | Yes, as a candidate generator (the "untouched-topic detector" lane), NOT as a standalone verdict |
| `findFoundationGap()` / `deepestUnmetPrereq()` | `prep-insight-engine.ts:229-270` | coverage matrix, `TOPIC_METADATA.prerequisites` | one topic/prereq pair | **Prerequisite/foundation detection** — a real, distinct category, not scheduling and not diagnosis | 13 Aug, section-blind by construction (the original screenshot bug's mechanism) | Yes, as a candidate generator, gated per Section 5 below — never auto-promoted |
| `session-credit.matchMentor()` | `session-credit.ts:132-166` | self-report, mentor's own weak/strong section | mentor score + disclosed reason | **Mentor matching** — a genuinely different job (who to pair a student with, not what to tell them) | Explicit design intent on record ("a match we cannot explain is one we should not make") | No — mentor matching's inputs and outputs don't belong in the Insight candidate pool; keep separate |
| `buddy-match.weakestSection()` / `rankBuddies()` | `buddy-match.ts:31-95` | `baseline_varc/dilr/qa` only | ranked buddy list | **Mentor/cohort matching (free-tier showcase)** | Confirmed orphaned input (Phase 1 of the earlier redesign spec — 0 real students have baseline data) | No — separate concern, and currently non-functional besides |
| `peer-cohort.ts` | `os/peer-cohort.ts:47-373` | raw `self_reported_weakest_section` | matched peer set + copy | **Cohort matching + explanation (social-proof copy)** | Live, display/matching-dimension use | No — different audience-facing purpose (comparative reassurance, not personal diagnosis) |
| `student-brief.ts`'s coverage ranker | `student-brief.ts:74-89` | `onboarding.topic_matrix` | ranked sections, unweighted %-covered | **Explanation, for a different reader** — the AI sales-call script, not the student | Live, distinct third coverage formula | No — wrong audience, wrong formula, out of scope for this feature entirely |

**The category your message introduces that didn't have a clean home before now: "explanation."** `mockInformedFocus`'s disclosed `basis` string and `matchMentor`'s disclosed `reason` string are the two places in the current codebase that already do real explanation work — both share one property worth reusing directly: **the explanation is generated FROM the same evidence that produced the decision, never invented after the fact.** This is the template Insight's copy layer should follow (Section 7).

## 2. Candidate-Generation Architecture

```
SELF-REPORT (if any)
        ↓
SECTION-LEVEL ANALYSIS (resolveFocusSections' existing evidence hierarchy —
                          reused for WHICH SECTIONS are even worth generating
                          candidates from, not reused as the insight-picker)
        ↓
CANDIDATE GENERATION — independent, parallel, no candidate outranks another yet
   ├── VALIDATION candidate    (self-reported section's own strongest coverage/foundation fact)
   ├── SCHEDULING candidate    (baseCoverageScore's literal top pick — Section 1's correction:
   │                             this is a candidate, not the default winner)
   ├── FOUNDATION candidate    (deepestUnmetPrereq, gated per Section 5, independent of weightage)
   ├── UNTOUCHED candidate     (highest genuinely-untouched topic by weightage TIER, not raw score)
   └── OTHER evidence-backed candidate (mockInformedFocus's finding, when it exists — rare, always strong)
        ↓
EVIDENCE / RELEVANCE / NOVELTY GATE  (qualitative, per candidate — Section 3/4, NOT a score comparison)
        ↓
PRIMARY INSIGHT (the candidate that clears the gate with the strongest combination
                  of relevance-to-self-report and non-obviousness — ties break toward
                  Validation, per the v2 document's Model D acknowledgment guarantee)
        ↓
OPTIONAL SECONDARY INSIGHT (a second candidate, if any, that ALSO clears the gate
                             AND is materially different from the primary)
        ↓
STUDY-PLAN HANDOFF (Section 6's conflict rule)
```

## 3. Insight-Selection Rules

**The gate is qualitative, not a score comparison — this is the direct fix to the prior document's Section 8 error.** For each candidate, ask the same four questions already established across this investigation (redesign spec's 7-check gate, condensed here to the ones that actually discriminate between candidate TYPES rather than candidate instances):

1. **Relevant** — does it relate to what the student said, or does it explicitly declare itself a separate finding (never silently substitute)?
2. **Evidenced** — is every stated fact traceable to a real row (coverage status, prerequisite edge, mock score)?
3. **Non-obvious** — would the student already know this from their own memory of what they tapped? (A bare "you haven't touched X" restatement fails this; "you're revising X while its foundation Y sits untouched" passes, because the RELATIONSHIP is not something a student tracks mentally even if the two individual facts are technically visible to them.)
4. **Actionable** — does it produce a concrete next step the plan can actually execute?

**A candidate that clears all four is eligible. Among eligible candidates, the SCHEDULING candidate is not privileged over the others** — it wins the Insight slot only when it is the ONLY eligible candidate, or when it is also the most specific/non-obvious of the eligible set (Section 4's worked examples show both outcomes occurring on real data).

## 4. Scheduling-Selection Rules (Unchanged, Reconfirmed)

`baseCoverageScore()` remains exactly as it is, unmodified, as the sole authority for "what does today's plan actually contain." Nothing in this document touches its formula, its weights, or its role in `chooseTopicForSection`/`buildWeekPlan`. Its role in the Insight pipeline is narrower than before this document: it generates ONE candidate (Section 2), and that candidate is evaluated by the SAME qualitative gate as every other candidate — it does not get to arbitrate between other candidates by its own numeric output. This is the direct, corrected answer to your foundation-finding test:

**Student has: topic A `learning`, prerequisite B untouched, `baseCoverageScore(A) > score(B)`.**
- **Scheduling says A** — correct, unconditionally, per Section 1's finding that `learning` correctly outranks `not_started` for "what to do today."
- **Insight says "A is your next priority"** ONLY when the A-vs-B relationship fails Section 3's non-obviousness test (e.g., B is a shallow, low-weightage prerequisite the student would find trivial, or A's own progress is still early enough that the foundation risk hasn't materialized yet).
- **Insight says "You're progressing on A while B underneath remains incomplete"** when the relationship passes ALL FOUR gate questions — this is a qualitative call about the RELATIONSHIP's surprise value, never a comparison of `baseCoverageScore(A)` against `baseCoverageScore(B)`. A's score being high is irrelevant to whether the foundation story is worth telling; what matters is whether A is advanced enough that the gap is a real, current risk (this document keeps the research review's earlier `practicing`/`revising` threshold and ≤2-depth rule, both qualitative, not score-based) and whether the student would plausibly not have connected the two facts themselves.

**Foundation does not automatically win, and does not automatically lose — it wins exactly when it is the most non-obvious, evidenced, actionable candidate available, independent of what score `baseCoverageScore` assigned to either topic.**

## 5. Foundation-Selection Rules

Restating Section 4 as a standalone checklist, since foundation findings are the highest-risk category (they produced the original bug):
- Parent topic status ∈ {`practicing`, `revising`} — a `learning`-stage parent hasn't yet reached the point where the gap is a live risk.
- Prerequisite depth ≤ 2 — deeper chains are real but too indirect to state plainly without over-claiming a connection the student can verify.
- The prerequisite itself is not trivially low-stakes for both topics (a real, substantive relationship, not a technicality) — evaluated qualitatively per pair, not by a weightage threshold, since Section 2's Editorial Reading finding already shows weightage cannot be trusted as a pure importance signal.
- Never state or imply causation to felt exam performance ("that's why questions feel random") — state the structural relationship only, exactly as the prior research review's Section 9 already established.

## 6. Conflict-Resolution Rule — The Critical Invariant

**The Insight Engine may name a different finding from the plan's scheduling winner. The plan must never silently contradict what Insight told the student.** Concretely: whichever candidate becomes the PRIMARY (or SECONDARY) insight must be written into the diagnostic object (redesign spec's Phase 8 schema) with an explicit `promised_action` field, and the plan-handoff contract requires ONE of two outcomes, never a silent third:
1. **The plan's next block matches the promised action** (the common case when scheduling and insight agree, or when insight's finding IS the scheduling candidate), OR
2. **The plan's next block differs, and the difference is explicitly disclosed** — using the exact same disclosure discipline `mockInformedFocus`'s `basis` string already established in production ("Built from your mock" pattern) — e.g., "We'll bring Linear Equations forward first, then Functions" if scheduling still needs to finish a `learning`-stage topic before pivoting, stated plainly rather than left for the student to notice as a discrepancy.

A plan that quietly schedules Functions after Insight said "fix Linear Equations first," with no explanation anywhere, is a product bug under this rule — not a nuance, a defect, exactly as your message states.

## 7. Copy Rules Around "Weightage"

Five distinct concepts, never collapsed into one word in student-facing copy:

| Concept | What it actually is | Safe phrasing | Unsafe phrasing |
|---|---|---|---|
| **Exam importance** | Not evidenced anywhere in this codebase (Section 4 of the prior weightage audit — no per-topic frequency dataset exists) | Do not claim this exists as a number; only usable if a future evidenced source is added | "18% of the paper," any percentage |
| **Preparation importance** | `TOPIC_METADATA.weightage` as most topics actually use it — a content-team estimate of how much a topic matters within its section | "a high-scoring area," "a core part of [section]" | "high weightage," any raw 1-5 number |
| **Prerequisite importance** | A topic's position in the dependency graph — how many other topics sit on top of it | "the foundation several other topics build on" | conflating this with weightage numerically |
| **Scheduling priority** | `baseCoverageScore()`'s output — a derived, multi-factor number combining status + weightage + sequence + prerequisite state | never shown directly; only its CONSEQUENCE ("this is what we'll work on next, and here's why") | showing the raw score, or any of its intermediate terms |
| **Content-team emphasis** | The Editorial-Reading case specifically — a topic weighted for its supporting-habit leverage, not its own exam presence | "helps keep [RC] sharp," explicit habit-framing | describing it as "important" in the same breath as a genuinely heavily-tested topic, with no distinction |

## 8. Three Real-Student Walkthroughs

Same three students from the prior weightage audit (real production data, not constructed), now decomposed correctly.

**`37f6d141`** (no self-report on file)
- Scheduling winner: **Percentages** (`learning`, QA, weightage 5, `baseCoverageScore`=70).
- Foundation candidate: Coordinate Geometry (weightage 2) ← Lines & Angles (weightage 2, untouched) — both low-weightage, a shallow, low-stakes relationship.
- Untouched candidate: **Hybrid DILR Sets** (weightage 4, `baseCoverageScore`=54 as a raw pick, but evaluated here on the qualitative gate, not that number).
- **Why Scheduling is correct for the plan:** the student has real, active momentum on Percentages (`learning`) — continuing it is the right operational default, exactly per the 16 Jul rule.
- **Why a different candidate is better for Insight:** the Foundation candidate fails Section 5's checklist outright (low-stakes on both ends) — it should not be surfaced at all. Between Scheduling (Percentages) and Untouched (Hybrid DILR Sets), Percentages fails Section 3's non-obviousness test (the student is already actively working on it — telling them "keep going" is not a discovery), while Hybrid DILR Sets — a real, substantial, completely untouched DILR topic — passes it: it's evidenced, non-obvious (nothing about working on Percentages would surface this), and actionable. **Recommended Insight: the Untouched candidate, not the Scheduling winner.**

**`8ac65fdf`** (no self-report on file)
- Scheduling winner: **Arrangements** (`learning`, DILR, weightage 5, score 70).
- Foundation candidates: Time & Work / Time Speed Distance ← Ratio & Proportion (real, weightage 4-5 parents, weightage 5 prerequisite); SI & CI ← Percentages (weightage 3 parent, weightage 5 prerequisite — Percentages itself also appears on the Untouched list for this student).
- Untouched candidate: **Percentages** (weightage 5, completely untouched).
- **Why Scheduling is correct for the plan:** same reasoning — Arrangements is real, active, in-progress work worth continuing.
- **Why a different candidate is better for Insight:** this is the strongest foundation story of the three, and it passes Section 5's checklist cleanly — SI & CI is active, its prerequisite Percentages is a real, weightage-5 root topic, depth 1, and Percentages being simultaneously the highest-weightage untouched topic AND a live prerequisite gap makes this doubly evidenced. **Recommended Insight: the Foundation candidate ("You're working on SI & CI, but Percentages — the base most percentage-type QA questions build on — is still untouched"), not the Scheduling winner.**

**`a4a286c2`** (no self-report on file)
- Scheduling winner: **Reading Comprehension** (`learning`, VARC, weightage 5, score 70).
- Foundation candidate: Hybrid DILR Sets (weightage 4) ← Tables (weightage 4, untouched) — a real, substantial relationship, both topics carrying real weight.
- Untouched candidate: **Editorial Reading** (weightage 4).
- **Why Scheduling is correct for the plan:** RC is the single highest-weightage VARC topic and it's actively in progress — clearly correct to continue.
- **Why a different candidate is better for Insight:** the Foundation candidate passes Section 5's checklist (both topics substantial, depth 1) and is additionally interesting for being CROSS-SECTION from the scheduling winner (RC is VARC; the foundation story is DILR) — a genuinely non-obvious fact the student working on VARC wouldn't naturally have front-of-mind. **Recommended Insight: the Foundation candidate.**

**Pattern across all three, stated plainly:** in zero of the three cases does the Scheduling winner also make the best Insight — not because Scheduling is wrong (it's correct in all three, for the plan), but because "what to work on next" and "what's worth understanding about your prep" are, as your message states, different questions with different correct answers even from the identical underlying data.

## 9. Implementation Files / Functions (Design-Level, Not Authorized)

- `src/lib/prep-insight-engine.ts` — restructure `computePrepInsight` to produce the CANDIDATE SET (Section 2) rather than a single ranked `cards[]` array; move `dedupeByRootCause`'s severity×confidence×nonObvious scoring OUT as the sole arbiter, replaced by Section 3's four-question qualitative gate.
- `src/lib/topic-selector.ts` — no changes; `baseCoverageScore`/`chooseTopicForSection` remain scheduling-only, called BY the insight engine as one candidate source, never modified.
- New, small: a candidate-gate module implementing Section 3's four checks per candidate — conceptually separate from both `prep-insight-engine.ts` and `topic-selector.ts`, since it operates on outputs from both.
- `src/app/start/screens/screen-instant-insight.tsx` / `src/app/start/page.tsx` — wire the self-report prop through (the original, still-unfixed one-line gap), and render Primary + optional Secondary per the v2 document's UX structure.
- Diagnostic object (redesign spec Phase 8) — add the `promised_action` field this document's Section 6 requires, and a `source_type` field distinguishing scheduling/foundation/untouched/mock-backed candidates for later telemetry (v2 document's Section 13 learning loop).

## 10. Tests and Invariants

- **Invariant:** `baseCoverageScore()`'s weights and formula must never be modified as part of this feature — a guard test asserting the function's literal source lines match today's values would catch an accidental "just tweak it slightly for insight purposes" regression.
- **Invariant:** no student-facing string may contain a raw weightage number, a percentage, or the literal word "weightage" — extend the existing `wa-messages`/copy guard-test pattern already used elsewhere in this codebase.
- **Invariant:** every PRIMARY/SECONDARY insight's `source_type` must be one of the five candidate types in Section 2 — never an ad hoc sixth generator.
- **Invariant:** if a self-report exists, a Validation-type candidate must always be generated and must always be eligible for at least a mention (never silently dropped) — direct regression test for the original bug.
- **Invariant:** Section 6's conflict rule — a test asserting that whenever the diagnostic object's `promised_action` differs from the plan's actual next block, a `basis`-style disclosure string is present and non-empty.
- **Test corpus:** the same 34-student real-data pull, re-used as the software-correctness corpus per the v2 document's Section 12 — re-run whenever the candidate gate logic changes, checked for the same qualities (respects self-report, avoids irrelevant discoveries, avoids arbitrary section selection), never re-used to estimate a distribution.

---

**NO CODE CHANGES. NO DATABASE CHANGES. NO COMMIT** — this file exists only as a document, exactly as instructed, and per your note I'm not asking again this turn.
