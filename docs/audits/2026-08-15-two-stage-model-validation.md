# Two-Stage Ranking Model — Final Validation Pass

**Read-only. No code, data, or configuration changed.** Method: pulled real `topic_coverage` rows for 34 real students (11 of the 11 real self-reporters + 23 more sampled by coverage volume, all `is_test_account`/`is_demo` excluded) from production, and simulated the two-stage model — Stage 1 ranks QA/VARC/DILR by the existing weighted gap formula (`prep-insight-engine.ts`'s formula, tie-break DILR→QA→VARC), Stage 2 picks a topic within the winning section using `baseCoverageScore()`'s exact published formula — locally, against the real `TOPIC_METADATA` weightage table. Anonymized 8-character student IDs below are pseudonymous primary-key prefixes, not names/phone/email.

**Headline finding, stated before anything else because it changes the shape of every section below:** simulating the model against real data surfaced a real, previously undetected failure mode. **8 of 34 students (24%) — including 4 of the 11 real self-reporters (36%)** — have all three sections at ≥0.95 weighted gap (essentially nothing touched anywhere). For every one of these, Stage 1's tie-break rule (DILR→QA→VARC on ties) picks **DILR every single time, with zero QA and zero VARC wins**, because near-total-saturation is functionally a three-way tie. This isn't a theoretical bias — it's the single most common outcome in this real sample, and it must be treated as a hard refusal case (Section 6/7), not softened.

---

## 1. Proving the Two-Stage Model — 34 Real Student Cases

| # | Student | Self-report | QA gap | VARC gap | DILR gap | Winning section | Winning topic | Would a human find it useful? | Genuinely new to them? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `0af6ea9a` | — | 0.80 | 0.81 | 0.88 | DILR | Arrangements | Yes | N/A (no self-report to compare) |
| 2 | `1853a352` | — | 0.94 | 0.38 | 0.92 | QA | Percentages | Yes | N/A |
| 3 | `1ce2cd0c` | — | 1.00 | 1.00 | 1.00 | DILR *(tie-break)* | Arrangements | **No — refuse** | N/A |
| 4 | `353003c6` | — | 0.52 | 0.23 | 0.45 | QA | Linear Equations | Yes | N/A |
| 5 | `37f6d141` | — | 0.57 | 0.15 | 0.61 | DILR | Charts | Yes | N/A |
| 6 | `3b6ad288` | — | 0.94 | 1.00 | 1.00 | DILR *(near-tie, VARC also 1.00)* | Arrangements | Borderline | N/A |
| 7 | `3ffc2ef9` | — | 0.38 | 0.48 | 0.09 | VARC | Editorial Reading | Yes | N/A |
| 8 | `5b8bf4cf` | — | 1.00 | 1.00 | 1.00 | DILR *(tie-break)* | Arrangements | **No — refuse** | N/A |
| 9 | `6386c435` | — | 0.78 | 0.90 | 1.00 | DILR | Arrangements | Yes | N/A |
| 10 | `71a15929` | — | 1.00 | 1.00 | 1.00 | DILR *(tie-break)* | Arrangements | **No — refuse** | N/A |
| 11 | `7f5f1882` | — | 0.52 | 0.00 | 0.44 | QA | Quadratic Equations | Yes | N/A |
| 12 | `89c8d022` | — | 0.12 | 0.00 | 0.00 | QA | HCF & LCM | Marginal — very low absolute gap everywhere | N/A |
| 13 | `8ac65fdf` | — | 0.61 | 0.27 | 0.86 | DILR | Arrangements | Yes | N/A |
| 14 | `92fd6cca` | **QA** | 0.92 | 0.71 | 0.73 | QA | Percentages | Yes | **No — confirms self-report** |
| 15 | `93e8034b` | — | 0.79 | 0.71 | 0.73 | QA | Percentages | Yes | N/A |
| 16 | `948c4ba0` | **VARC** | 0.51 | 0.50 | 0.50 | QA *(delta 0.01)* | Percentages | **No — too close to claim** | Would be a FALSE discovery |
| 17 | `99ae4fc7` | — | 1.00 | 1.00 | 1.00 | DILR *(tie-break)* | Arrangements | **No — refuse** | N/A |
| 18 | `9eea4c81` | **QA** | 0.20 | 0.29 | 0.20 | VARC *(delta 0.09)* | Editorial Reading | **No — too close to claim** | Would be a FALSE discovery |
| 19 | `a4a286c2` | — | 0.63 | 0.79 | 0.72 | VARC | Reading Comprehension | Yes | N/A |
| 20 | `ad22c2d6` | **VARC** | 0.94 | 0.90 | 0.92 | QA *(delta 0.04)* | Percentages | **No — too close to claim** | Would be a FALSE discovery |
| 21 | `b4f30fbb` | **QA** | 1.00 | 1.00 | 1.00 | DILR *(tie-break)* | Arrangements | **No — refuse** | Would be a FALSE, arbitrary contradiction of a real self-report |
| 22 | `b70fa3f1` | — | 0.77 | 0.69 | 0.67 | QA | Profit & Loss | Yes | N/A |
| 23 | `c3dc60ef` | **VARC** | 1.00 | 1.00 | 1.00 | DILR *(tie-break)* | Arrangements | **No — refuse** | Same as above |
| 24 | `d48ec28f` | **QA** | 0.85 | 0.38 | 0.84 | QA | Average | Yes | **No — confirms self-report** |
| 25 | `daaeee73` | — | 0.31 | 1.00 | 0.16 | VARC | Reading Comprehension | Yes | N/A |
| 26 | `df9416a6` | — | 0.59 | 0.00 | 0.06 | QA | Quadratic Equations | Yes | N/A |
| 27 | `e6d604ab` | **DILR** | 0.67 | 0.44 | 0.33 | QA *(delta 0.34)* | Linear Equations | **Yes — this is a real, large, defensible gap** | **Yes — genuine discovery** |
| 28 | `ed5cbd7c` | **VARC** | 1.00 | 1.00 | 1.00 | DILR *(tie-break)* | Arrangements | **No — refuse** | Same as #21/#23 |
| 29 | `eea8dfe5` | — | 0.85 | 1.00 | 0.80 | VARC | Reading Comprehension | Yes | N/A |
| 30 | `f3dc68d5` | — | 0.44 | 0.21 | 0.34 | QA | Linear Equations | Yes | N/A |
| 31 | `f70400f2` | — | 0.97 | 0.60 | 1.00 | DILR | Arrangements | Yes | N/A |
| 32 | `f95fcdca` | — | 0.83 | 0.44 | 0.73 | QA | Ratio & Proportion | Yes | N/A |
| 33 | `fa8a4f50` | **VARC** | 1.00 | 1.00 | 1.00 | DILR *(tie-break)* | Arrangements | **No — refuse** | Same as #21/#23/#28 |
| 34 | `fea4a910` | **VARC** | 0.56 | 0.35 | 0.45 | QA *(delta 0.21)* | Average | **Yes, moderate** | **Yes — real discovery, and this student ALSO has a live Functions→Linear-Equations foundation gap (Section 9)** |

**Summary of the 11 real self-reporters specifically** (the population this feature is actually judged against): 2 agree cleanly (#14, #24), 4 are tie-break artifacts that would produce a false, confusing contradiction (#21, #23, #28, #33 — **36% of real self-reporters**), 3 are too close to call confidently (#16, #18, #20, delta < 0.10), and only **2 of 11 (18%) produce a genuine, confident, defensible discovery** (#27, #34). This is the real base rate this feature should be designed around, not an assumed "we'll usually find something interesting" rate.

## 2. Attacking Section-Size Bias

Computed both the weighted formula (`prep-insight-engine.ts`, normalized by section weightage total) and the unweighted formula (`section-weakness.ts`, normalized by raw topic count) for all 34 students. **Result: zero disagreements between the two formulas' winning section, across all 34.** This is worth stating plainly rather than forcing a narrative: in this real sample, the theoretical weighted-vs-unweighted divergence the earlier truth table raised as a concern did not materialize as a live case. That concern remains structurally valid (the two formulas ARE mathematically capable of diverging, and a larger or differently-shaped sample could surface one), but **it is not the section-size bias actually observed in production today.**

**The section-size bias that IS real and empirically confirmed:** the tie-break rule itself. QA has 28 topics, VARC and DILR have 9 each — meaningless when a student has touched something everywhere (the gap score already normalizes for section size), but decisive when a student has touched **nothing anywhere**, because then all three sections converge on gap≈1.00 and the arbitrary `DILR→QA→VARC` tie-order becomes the entire decision. 8 of 34 real students hit exactly this condition, and DILR won 8 of 8 times — never QA, never VARC. **This is where "does the section scorer prefer the section with more raw gaps" actually shows up in real data — not through the gap formula itself, but through what happens when the gap formula degenerates into a tie.**

## 3. Attacking "Obvious Gap" Failure

Classified all 34 per the four-tier scale. Real distribution: **0 fell into a clean "A — OBVIOUS" bucket** (the model never produces a bare "VARC has incomplete RC" with no specificity, because Stage 2 always names an actual topic) — this rules out the worst failure mode outright. But real numbers also show the model is far more conservative than the mandate's framing assumed:

- **B — USEFUL (confirms self-report, names a specific topic):** #14, #24 — 2 of 34.
- **C — DISCOVERY (moderate, defensible gap elsewhere):** #34 — 1 of 34.
- **D — STRONG DISCOVERY (large gap, high confidence):** #27 — 1 of 34.
- **MARGINAL, must not be shown as a confident claim (delta < 0.10):** #16, #18, #20 — 3 of 34.
- **REFUSE outright (saturated/tie-artifact):** #3, #8, #10, #17, #21, #23, #28, #33 — 8 of 34.
- **Discovery-only, no self-report to validate against:** the remaining 23.

**What characteristics produce C/D specifically:** in both real cases (#27, #34), the winning section's gap exceeds the self-reported section's gap by **≥0.20** in absolute terms, AND the winning section has a meaningfully large `n` (28 for QA, giving the gap score real statistical weight rather than resting on 2-3 topics). Both also happen to involve QA specifically, which given QA's 28-topic breadth is worth flagging as a possible structural tendency (QA has more room to produce a "there's more here than you think" finding purely because it has 3x the topics of the other two sections) — not proven wrong, but worth watching as the sample grows.

## 4. Validation Finding vs. Discovery Finding — Explicit Separation

**FINDING A (Validation)** uses the self-reported section directly — its evidence is Stage 1's gap score FOR that specific section plus Stage 2's topic pick within it, exactly as computed for e.g. #14 or #24 above. It requires no threshold beyond "a self-report exists and the section has at least one real gap to name" — even a modest, non-dramatic gap is legitimate here, because the finding's job is acknowledgment, not surprise.

**FINDING B (Discovery)** may come from any OTHER section, but per Section 3's real evidence, needs a materially higher bar. **Relevance threshold, derived from the real data above, not assumed in advance:**
- The candidate section's gap must exceed the self-reported section's gap by **at least 0.20** (in the weighted-gap units used throughout this document) — below that, per #16/#18/#20, the difference is noise-level and asserting a "we found something bigger" claim would be a false discovery.
- The candidate section must NOT be part of an all-sections-saturated tie (Section 6/7) — a "discovery" that's actually an artifact of the student having touched nothing anywhere must never render.
- The candidate section must have enough real topics evaluated (`n ≥ 9`, i.e., a full section's worth of taps, not a partial/stale read) to trust the gap number at all.

## 5. Designing the Actual 3-Card Experience

Neither of the two structures offered is quite right on its own. Structure A ("You told us... / We noticed... / So here's what we'll do") is honest about sourcing but risks reading as three disconnected facts. Structure B ("Why your chosen section feels weak / The bigger thing you're missing / The specific topic to fix") compresses steps 2 and 3 of the mandate's original four-layer model (diagnosis, then action) into one card, losing the explicit "here's what we'll actually do" moment that closes the loop.

**Recommended, informed by the real data's actual shape:** given Section 3's finding that a genuine C/D-tier discovery only fires for **2 of 34 real students (6%)**, the UX cannot assume three cards are always warranted — it needs a structure that degrades gracefully:
- **Always:** Validation card (Finding A), whenever a self-report exists.
- **Conditionally, only when Section 4's threshold clears:** a Discovery card (Finding B), explicitly framed as "and separately, we noticed..." — never silently replacing Validation.
- **Always, attached to whichever card is currently the plan's actual focus:** a single "what we'll do" line — not a third independent card, but the action attached to the winning finding (per Section 10 of the redesign spec's handoff contract).

This produces a **1-2 card experience for most students, occasionally 2 cards with real content**, not a fixed three — directly answering the mandate's own instruction not to assume three cards are correct, now with real production evidence behind the answer rather than a UX guess.

## 6. When Is "We Noticed Something Bigger" Allowed?

Per Sections 1-4's real numbers: CareerRai may say **"We noticed something bigger"** ONLY when:
1. A self-report exists, AND
2. The candidate section is not part of an all-saturated tie (Section 6/7's refusal case), AND
3. The candidate section's gap exceeds the self-reported section's gap by ≥0.20 (Section 4's threshold), AND
4. The candidate section has a full, real read (`n≥9`).

In every other case — including the very common case where the self-reported section genuinely does carry the largest real gap (#14, #24, and by extension the majority of non-saturated students who weren't sampled with a self-report here) — CareerRai must say the honest opposite: **"Your biggest current opportunity is actually within [self-reported section]."** This is not a fallback or a consolation message — per this document's own numbers, it is very plausibly the MORE common honest outcome once the model is applied broadly, and the copy must be written to feel just as substantive as a "bigger gap" finding, not like a downgrade.

## 7. The Discovery Threshold, Restated as a Rule

**Discovery fires only when ALL of:**
- self-report exists,
- candidate section ≠ self-reported section,
- candidate section is not part of a ≥0.95-all-sections saturation tie,
- candidate section's gap − self-reported section's gap ≥ 0.20,
- candidate section has `n ≥ 9` real coverage rows.

This is a conjunction of "materially stronger" (the 0.20 delta) AND "not an artifact" (the saturation/`n` guards) — the mandate's OR-framing ("materially stronger OR more important OR less obvious OR reveals an unnoticed relationship") is not what the real data supports; an OR-gate would have let #16/#18/#20/#21/#23/#28/#33 (10 of 34, nearly a third of the sample) through as false or meaningless discoveries. The AND-gate is stricter and, per Section 3, correctly conservative — it produced exactly the 2 real cases that deserved it.

## 8. Auditing `baseCoverageScore()` Line by Line

From `src/lib/topic-selector.ts:109-119`, reproduced exactly (not modified, read-only per this document's own rule):

```
COVERAGE_POINTS = { learning: 30, not_started: 22, unknown: 20, practicing: 12, revising: 8, exam_ready: 2 }
score = COVERAGE_POINTS[status] + weightage×8 + max(0, 30 − sequenceRank)×0.5 + (prereqUnmet ? −18 : 0)
```

- **What it measures:** a single priority number for "which topic should the student work on next within an already-chosen section," combining coverage state (finish-what-you-started bias, `learning` scores highest), content importance (`weightage×8`, the dominant term at 8-40 points), a mild pedagogical-order nudge, and a prerequisite-completeness penalty.
- **Why it was built:** the file's own comment (`:82-88, :98-108`) documents a real production incident — a student who'd done Arithmetic + Geometry and expected Algebra next instead got a low-weightage Permutation & Combination pick under the OLD formula (which over-rewarded raw novelty). It was rebuilt from that specific feedback, and a prior duplicate ranker in `study-forecast.buildWeekPlan` was consolidated into this one on 10 Aug specifically because the two disagreed.
- **Where it's used today:** `chooseTopicForSection()` (daily card) and, per its own comment, `buildWeekPlan` (the whole-plan view) — both now share this one function.
- **Truly production-tested?** Yes, with a real before/after incident on record, not a theoretical formula.
- **Appropriate for student-facing insight as-is?** Mostly, with one caveat found directly in this pass: it selects for coverage-weighted *value*, not for *structural relationships* — Section 9 below shows a real student (#34, `fea4a910`) where `baseCoverageScore` alone picked "Average" over the far more narratively powerful "Functions is active while Linear Equations underneath it sits untouched," because the scorer has no prerequisite-DEPTH awareness, only a flat unmet/met penalty. It is the right tool for "what to schedule next," not automatically the right tool for "what to show as the WOW finding."
- **Hidden assumptions:** weightage is section-relative (Section 4 of the prior document) — using this score to compare topics ACROSS sections would repeat exactly the cross-section error already ruled out.
- **Needs modification?** No — per the mandate's own instruction, and per this audit, it should remain untouched. Its job (topic selection within a section) is different from the Discovery detector's job (finding a genuinely structural/foundation relationship), and Section 9 explains why those need to stay separate mechanisms feeding the SAME slot rather than one subsuming the other.

## 9. Foundation Gaps — What Should the Student Actually See?

Searched the real 34-student sample directly for the exact `Functions`/`Quadratic Equations`/`Linear Equations` chain the founder's original screenshot showed. **Found one live instance: student `fea4a910`** (self-reported VARC) — `Functions: revising`, `Quadratic Equations: not_started`, `Linear Equations: not_started`. This is a real, current, depth-2 unmet-prerequisite case in production today, not a constructed example.

Evaluating the mandate's four options against it:

- **A ("Functions is weak")** — unsupported; `revising` is one of the MOST advanced coverage states, the literal opposite of weak.
- **B ("Linear Equations is untouched")** — true but context-free; doesn't explain why it's being surfaced at all.
- **C ("You're working on Functions before covering Linear Equations underneath it")** — the correct level: states the real relationship, names both real facts (`revising` + `not_started`), makes no claim beyond what the graph actually shows.
- **D (nothing, too indirect)** — wrong for THIS case specifically, because the relationship is direct and two-hop, not a distant/tenuous one; but D is exactly right whenever the chain is deeper or the parent topic is barely started (`learning` rather than `revising`) — a student just beginning a topic hasn't yet reached the point where its foundation matters practically.

**Rule, derived from evidence + UX reasoning together:** show a foundation finding (framed as C) only when the parent topic is at `practicing` or `revising` (real, demonstrated investment, not a first glance) AND the unmet prerequisite is at most 2 levels deep AND — per Section 6/7 — the section it's in has cleared the Discovery threshold if it's not the self-reported section. A foundation relationship under a `learning`-stage parent topic, or a chain 3+ levels deep, should fall through to option D (say nothing about it specifically; it may still contribute to the section's raw gap number, just not be named as its own finding).

## 10. What the System Can Safely Say Today, With Today's Data

**Safely, today (per Section 8 of the prior document's data audit, reconfirmed here against real per-student numbers):**
- A specific coverage fact about any topic ("X is untouched," "Y is at learning") — always defensible, it's the student's own declared state.
- A section-level gap comparison, gated per Section 7's rule — defensible because it's a real, computed number, not an invented one, as long as the refusal/threshold gates hold.
- A structural prerequisite relationship, framed per Section 9's rule C — defensible as a graph fact.
- A qualitative "high-scoring area" label (never a percentage) per the prior document's Section 4 finding.

**Cannot safely say today:**
- Anything implying measured ability/performance for the 96.6% of students with no mock data (unchanged from the prior document, now reconfirmed: only 14 of 412 students in the whole platform have any `mock_debriefs` row at all, and none of the 34 sampled here happened to be among them).
- A cross-section weightage/importance number.
- A causal "this is why you feel X" claim without performance evidence (Section 9's rule already avoids this by construction — option C never claims a feeling, only a relationship).

**Could say LATER, if performance data grows (not designed around now, stated only as a future contingent, per the mandate's explicit instruction not to design around future data):** a performance-corroborated version of Findings A/B when a complete, recent, decisive mock exists (`mockInformedFocus`'s existing gate, unchanged) — this document does not build toward that state, it only notes the door is already open in `resolveFocusSections` for whenever the data exists.

## 11. Final Product Decision

**C — "Preparation opportunity detector."** Not A (this document's own Section 1 shows the model correctly refuses to call anything "weak" without performance evidence — 0 of 34 cases produced an ability claim). Not B alone (coverage-gap is the mechanism, not the product's self-description — "your coverage has a gap" undersells what Section 9's foundation layer and Section 6/7's evidence-gating actually produce). Not D ("diagnostic system" implies a medical-grade authority this data cannot support — per Section 10, this system explicitly cannot diagnose ability). **"Preparation opportunity detector"** is the honest, accurate description: it looks at what the student has and hasn't done, finds real, specific, structurally-grounded things worth doing next, and — per this document's own numbers — is honest and conservative about when it has nothing confident to add.

## 12. Final Architecture (Corrected Against This Document's Findings)

```
Student self-report (if any)
        ↓
Section-level evidence (Stage 1 — the ALREADY-EXISTING weighted gap formula,
                          converged, not re-invented — Section 2)
        ↓
SATURATION/TIE GUARD — refuse to rank at all if all 3 sections ≥0.95 gap (Section 6/7, NEW,
                          not in the mandate's original sketch, added because real data required it)
        ↓
Validation finding (self-reported section, if any — always attempted when not saturated)
        +
Discovery detector (Section 4/7's conjunctive threshold gate — fires in roughly
                     1 in 5 real cases per Section 3, not on every screen)
        ↓
Discovery section (only if the gate clears)
        ↓
Topic selector — baseCoverageScore() for a plain coverage pick,
                  a SEPARATE prerequisite-depth check for a foundation-type pick (Section 9) —
                  these are two different mechanisms feeding the same slot, not one function
        ↓
Evidence/relevance gate (redesign spec's 7 checks, still required per-finding)
        ↓
Insight composition — 1 or 2 cards, not a fixed 3 (Section 5)
        ↓
Student acknowledgement/choice
        ↓
Study-plan handoff (redesign spec's Phase 8/9 object, unchanged)
```

**Corrections made to the mandate's own sketch, and why:** added the saturation guard as its own explicit stage (not implied anywhere in the original sketch, but required by 24% of real students); split "topic selector" into two named mechanisms rather than one, since Section 8/9 showed `baseCoverageScore` alone misses the foundation relationship that made the founder's original screenshot topic notable in the first place.

## 13. Implementation Gate

**GREEN — sufficiently proven to implement:**
- Stage 1 section-level gap ranking, using the already-converged weighted formula.
- Stage 2 within-section topic selection via `baseCoverageScore()`, unmodified.
- The Validation finding (self-reported section + a real topic pick within it) — 34/34 real cases produced a specific, defensible topic when the section wasn't saturated.
- The conjunctive Discovery threshold from Section 7, INCLUDING the saturation/tie guard — this guard is not optional; it is the single most important correction this validation pass produced.
- The foundation-relationship framing rule from Section 9 (option C, gated by parent-topic stage + depth ≤2).

**YELLOW — implement cautiously, behind a feature flag, watch real outcomes before widening:**
- The exact 0.20 delta threshold for Discovery (Section 4/7) — derived from only 2 positive and 3 near-miss cases in a 34-student sample; directionally right, needs more data to confirm the precise cutoff.
- The 1-2 card (not fixed-3) UX structure (Section 5) — the reasoning is sound but this is still a UX hypothesis until watched against real signups.
- Whether QA's structural advantage in Discovery (Section 3's observation that both real discoveries were QA-rooted, plausibly due to its 28-topic breadth) needs an explicit counter-adjustment or is a legitimate reflection of QA genuinely having more surface area — insufficient evidence either way yet.

**RED — must not be implemented yet:**
- Any performance-based claim for students without mock data (unchanged, still 96.6% of the base).
- Any cross-section weightage number or percentage.
- Any discovery finding that skips the saturation/tie guard — this is not a nice-to-have, it is the fix for a confirmed-live bug pattern affecting roughly a quarter of real students.
- Treating this as a "diagnostic system" (Section 11) — the product framing itself, not just the copy on one screen, needs to stay in "opportunity detector" territory until performance data at scale changes what's defensible.

**NO CODE CHANGES AUTHORIZED YET.**

---

*End of validation pass. All figures in this document were computed from real production `topic_coverage` data for 34 real, non-test students, queried read-only, joined locally against the unmodified `TOPIC_METADATA` table and the unmodified `baseCoverageScore()` formula. No code, schema, or data was changed in producing this document.*
