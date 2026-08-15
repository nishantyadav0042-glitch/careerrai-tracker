# Existing Topic Weightage — Audit & Product Use

**Read-only. No weights changed, no new weightage system created, no application code written. Not committed per this task's explicit instruction — file only.**

---

## 1. Source of Truth

`TOPIC_METADATA` in `src/lib/topics-constants.ts:149-215` — one `Record<string, TopicMetadata>` covering all 46 syllabus topics (9 VARC, 9 DILR, 28 QA). `weightage` is one field on each entry (`1-5` integer scale), alongside `difficulty`, `estimatedHours`, `revisionFrequencyDays`, `sequenceRank`, `prerequisites`. There is exactly one source — no second copy, no per-topic table in the database, no external file.

**Who assigned it and how, per the file's own header comment (`:121-126`, unchanged since first read of this file):** "a defensible first-pass ranking based on widely-known CAT prep conventions... editable content a subject-matter reviewer should refine, NOT measured data or the output of any study." One narrower exception exists: the QA sub-cluster percentage shares (`qaCluster()`, `:218-232` — "Arithmetic ~40%, Algebra ~33%, Geometry ~15%") cite "published CAT analyses" in a comment, but no citation, link, or source document is attached anywhere in the repo — this is a claim of external grounding for the CLUSTER-level shares only, not a per-topic number, and it is unverifiable from the code alone.

**What the numbers mean, precisely:**
- Higher = more important: yes, directionally confirmed (`highestWeightageTopic()`, `:238-245`, sorts descending by weightage and is used as the real production default for "which topic if none was self-reported").
- Comparable across topics within a section: yes, by construction — it's the field's stated purpose.
- Comparable across sections: **no** — the field's own definition (`:130`) is "relative emphasis within its OWN section, 1-5." This is restated, not newly discovered, from the earlier documents in this investigation; this pass re-verifies it against the same source line.
- Represents CAT question frequency, estimated importance, or internal prioritization: **internal prioritization / founder-and-content-team estimated importance**, explicitly not measured frequency, per the quote above. Labeled as such throughout this document, per your instruction.

## 2. Is the Weightage Itself Valid? — Full Distribution Audit

Read directly from `TOPIC_METADATA`, all 46 topics, no sampling:

**VARC (n=9, sum=24):** `5`: Reading Comprehension · `4`: Editorial Reading · `3`: Para Jumbles, Para Summary, Reading Speed Practice · `2`: Odd One Out, Sentence Completion · `1`: Vocabulary, Grammar.

**DILR (n=9, sum=32):** `5`: Arrangements · `4`: Tables, Charts, Selection & Distribution, Hybrid DILR Sets · `3`: Caselets, Games & Tournaments, Venn/Sets · `2`: Binary Logic · *(no topic at 1)*.

**QA (n=28, sum=81):** `5`: Percentages, Ratio & Proportion · `4`: Profit & Loss, Average, Time & Work, Time Speed Distance, Linear Equations, Quadratic Equations, Triangles · `3`: SI & CI, Functions, Inequalities, Progressions, Circles, Mensuration, Remainders · `2`: Mixtures, Pipes & Cisterns, Logarithms, Lines & Angles, Quadrilaterals, Coordinate Geometry, Permutation & Combination, Probability, Divisibility, HCF & LCM · `1`: Set Theory, Base System.

**Findings against the specific checklist asked for:**
- **Missing weights:** none. All 46 topics carry a value; confirmed independently by the earlier validation pass's production data pull (every real `topic_coverage` row's topic name matched `TOPIC_METADATA` with zero unmatched names).
- **Duplicate weights:** present, but this is not a defect — it's an expected property of a coarse 1-5 ordinal scale, not a bug. What would be a real problem (two topics tied where a tie causes a bad downstream decision) is addressed by `baseCoverageScore`'s secondary `sequenceRank` tiebreak, already in place.
- **Section-size distortion:** QA's 28 topics vs. 9/9 doesn't distort within-section comparisons (each section's weightage is only ever compared to itself), but it does mean QA's total weightage sum (81) is far larger than VARC/DILR's (24/32) — this is exactly why the earlier validation pass's Stage-1 section-gap formula normalizes by section total rather than raw sum, and why using raw weightage sums cross-section would be invalid (Section 3).
- **Obvious anomaly worth naming:** **Editorial Reading is weighted 4 — second only to Reading Comprehension's 5, ahead of every other VARC topic including Para Jumbles/Para Summary.** The section's own header comment explains this deliberately: "Editorial Reading is the feeder habit-skill that keeps [RC] alive." This is a real, notable case of weightage encoding **prep-habit leverage**, not raw exam-frequency importance — Editorial Reading is not itself a heavily-tested question type the way RC is; it's weighted high because the content team judges it upstream-load-bearing for RC. Worth flagging explicitly: **weightage is not a single, uniform concept even within its own stated definition** — most topics are weighted by estimated exam importance, but at least one is weighted by supporting-habit leverage. This is a real nuance, not necessarily a bug, but it means "high weightage" cannot always be translated as "heavily tested" in student-facing copy without checking which kind of importance is actually being claimed.
- **Distribution shape, DILR vs. QA:** DILR's 9 topics cluster tightly (7 of 9 sit at weightage 3 or 4) — a compressed range with less numeric separation power. QA's 28 topics span a full, roughly bell-shaped 1-5 distribution. **Practical consequence for Stage 2 topic selection:** within DILR, `weightage×8`'s spread is only 16 points (24 vs. 40) across most real topics, so `baseCoverageScore`'s coverage-status term (up to 30) dominates DILR topic selection almost entirely; within QA, weightage swings a full 32 points (8 vs. 40), so weightage genuinely drives QA's topic selection. **This is a real, previously unstated asymmetry between sections' internal behavior**, not a defect, but relevant to Section 6 below.

## 3. Cross-Section Comparability, Answered Directly

- **A. Within QA:** Yes — this is the field's designed purpose, and the full 1-5 spread (Section 2) gives it real discriminating power.
- **B. Within VARC:** Yes, with less spread (Section 2's compressed range, though not as tight as DILR's).
- **C. Within DILR:** Yes, but with the least discriminating power of the three sections (Section 2's clustering finding).
- **D. QA vs. VARC vs. DILR directly:** **No — not defensible.** Proven, not assumed: the field's own definition line (`:130`) states the scale is section-relative; there is no evidence anywhere in the repo (no external dataset, no cross-section calibration comment, no shared denominator) that a QA-4 and a VARC-4 represent the same real-world exam importance. This matches every prior document in this investigation and is reconfirmed here by direct re-inspection of the source, not inherited without checking.

## 4-5. Using Existing Weightage for "Next Priority" — Formula and Student-Value Framing

**Verified existing stage semantics before assuming any mapping**, per your explicit instruction — from `src/lib/topic-selector.ts:89-119` (real, unmodified, already in production):

```
COVERAGE_POINTS = { learning: 30, not_started: 22, unknown: 20, practicing: 12, revising: 8, exam_ready: 2 }
score = COVERAGE_POINTS[status] + weightage×8 + max(0, 30−sequenceRank)×0.5 + (prereqUnmet ? −18 : 0)
```

**This does NOT match the mapping suggested in the request, and the mismatch is real and important, not a wording nuance.** The suggested mapping treats "high importance + untouched" as the strongest priority signal and "high importance + learning" as a lesser, secondary one ("move toward practice"). The EXISTING, already-tuned production formula does the opposite: `learning` (30) outscores `not_started` (22) by a full 8 points before weightage is even applied — because of a **documented real incident** (`topic-selector.ts:82-88`): a student who'd done Arithmetic + Geometry and expected Algebra next instead got a low-value new topic under the old novelty-favoring formula, and the founder's own ruling ("finish what you started") is why `learning` now outranks `not_started`. **This is not this document's invention — it is the existing, real, production philosophy, and it should govern "Next Priority" rather than the request's initial intuition, per your own instruction not to assume the mapping.**

**Recommended formula: reuse `baseCoverageScore()` exactly as it stands, unmodified**, for the actual candidate-ranking arithmetic — this satisfies "do not create a new weightage system" literally, since a working, tuned system already exists for precisely this question. What's genuinely new is not the number, but **translating the score's components into a sentence**, per your example:

> Score = 70 (Percentages, `learning`, weightage 5) → "You've started several high-impact QA topics, but most are still in learning — moving these toward practice is worth more right now than opening new ones."

The number itself never appears; the STORY (coverage-status label + weightage tier + what it implies) does. `weightage ≥4` maps to "high-impact"/"high-scoring area" (already the exact phrase used in production copy elsewhere, per the prior research review's Section 4 finding — reused here, not invented).

## 6. Testing on Real Students — Where the Existing Algorithm Actually Lands

Ran the exact `baseCoverageScore()` formula against real, non-test production `topic_coverage` data (same 34-student pull used in the prior validation pass), specifically searching for students where all three competing patterns from your Question 9 co-occur simultaneously. Found three real cases:

| Student | A: high-weightage untouched | B: foundation gap under an active topic | C: high-weightage stuck in `learning` | Existing formula's actual pick |
|---|---|---|---|---|
| `37f6d141` | Hybrid DILR Sets (score 54), Triangles | Coordinate Geometry ← Lines & Angles (score 28) | 11 topics incl. Tables, Percentages, Ratio & Proportion | **Percentages, score 70 (Pattern C)** |
| `8ac65fdf` | Charts, Percentages (score 62), Profit & Loss | Time & Work ← Ratio & Proportion (score 44) | 9 topics incl. Editorial Reading, Tables, Arrangements | **Arrangements, score 70 (Pattern C)** |
| `a4a286c2` | Editorial Reading (score 54), Tables, Linear Equations | Hybrid DILR Sets ← Tables (score 44) | 5 topics incl. Reading Comprehension, Arrangements | **Reading Comprehension, score 70 (Pattern C)** |

**Direct, unambiguous answer to Question 9, from real data, not theory:** in every one of the three real cases where all three patterns genuinely co-occur, **the existing formula picks Pattern C (a high-weightage topic already in `learning`) every time**, and by a consistent, structural margin (~70 vs. high-40s/low-60s for the other two patterns) — because `COVERAGE_POINTS['learning']=30` is the single largest term in the formula, larger than the entire weightage swing (`8` at weightage-1 to `40` at weightage-5) can offset when comparing against a `not_started` or foundation-flagged candidate of similar weightage.

**This is worth stating as a real product tension, not just a computed fact:** the existing formula is correctly tuned for **scheduling** ("what should today's block be" — finishing in-progress high-value work is the right operational default, per the documented 16 Jul incident). But an **insight** meant to surprise or inform the student is a different job — always surfacing "keep going on what you already started" as the headline finding would under-use Pattern A (a genuinely untouched high-value area) and Pattern B (a real foundation risk) as INSIGHT material, even though both remain correctly present in the coverage data and correctly influence the plan's other tasks. **Recommendation: "Next Priority" as a student-facing insight should default to the existing formula's literal pick (Pattern C) when it wins by a wide margin (as it did in all three real cases here), but should surface Pattern A or B instead when they are close enough in score to be a genuine judgment call** — this document does not compute an exact "close enough" threshold (that would require the same evidence-graduated, non-distributional discipline the prior v2 document established for the self-report threshold, and one afternoon of real coincidental co-occurrences is not enough to calibrate it) — it recommends the DIRECTION (default to C, override toward A/B when scores are close or B involves a deep/high-confidence chain) without asserting a precise cutoff.

## 7. The Three Insight Types, Reconciled With Everything Established So Far

1. **YOUR WEAKNESS** — student perception (`self_reported_weakest_section`) + evidence, exactly as designed in the v2 document (Model D/E: acknowledged always, never silently overridden, discovery unconstrained by section identity). Weightage plays only a supporting role here (Section 5 of the prior research review — never a raw number, only "high-scoring area" framing).
2. **YOUR NEXT PRIORITY** — this document's focus. Driven primarily by `baseCoverageScore()`, unmodified, applied within whichever section is currently relevant (the self-reported one first, per Model D, but not exclusively — Section 9's discovery definition from v2 still governs whether a different section's Next Priority is worth surfacing too). Weightage IS the dominant term here, exactly as your message specifies.
3. **YOUR FUTURE RISK** — structural gaps that could matter later if ignored. This is the natural home for Pattern B (foundation gaps) when they DON'T win the immediate Next Priority slot (Section 6) but are still real and worth naming — e.g., `8ac65fdf`'s Time & Work ← Ratio & Proportion gap (score 44, real, just not the top pick) becomes a legitimate "future risk" line even when Arrangements (score 70) is the immediate Next Priority. Weightage contributes here too, exactly as you note it may — a LOW-weightage foundation gap is a weaker "future risk" claim than a high-weightage one, using the same weightage-as-supporting-signal discipline as #1.

**Confirmed per your instruction:** weightage does not automatically override self-reported weakness anywhere in this model — #1 and #2 are structurally separate insight types with separate primary drivers (perception vs. coverage-value), consistent with the v2 document's Model D relationship.

## 8. The Foundation Example, Resolved With the Relative-Importance Test

For the canonical case (Functions active, Linear Equations untouched underneath): **do not automatically promote it, per your instruction — and the real-data test in Section 6 shows exactly why not.** The correct test is the one you specified: **does this foundation gap matter relative to the student's higher-impact unfinished topics right now?** Concretely, using `baseCoverageScore`'s own arithmetic as the yardstick (not a new formula): compute the foundation candidate's score (parent topic's status points + weightage×8 − 18 for the unmet prerequisite) and compare it against the best-scoring Pattern-A/Pattern-C candidate available in the same evidence pass. If the foundation candidate's score is close to or exceeds the alternatives, it becomes the Next Priority (or at minimum a co-equal Future Risk); if a clearly higher-scoring alternative exists (as happened in all three real Section 6 cases), the foundation gap is real, logged, and shown as Future Risk rather than promoted to the hero slot. This is precisely the mechanism, not a new one — `baseCoverageScore`'s existing `-18` unmet-prerequisite penalty already encodes "a foundation gap matters, but not infinitely" as a real, tuned number, not an assumption this document introduces.

## 9. The Product Decision, Answered From Real Data (Restated for Emphasis)

Already answered fully in Section 6, restated here because your message asks for it as its own numbered item: **run against real students, the existing scoring consistently favors "several high-weightage topics stuck in learning" over both "one high-weightage untouched topic" and "one foundation gap," by a real, structural margin rooted in the `learning`-status bonus being the formula's single largest term.** This is not a theoretical answer — it is what `baseCoverageScore()`, unmodified, actually outputs on three real, independently-found production students where the three patterns you asked about all genuinely co-occur.

## 10. Recommended Scoring / Decision Logic — Summary

- **Do not build a new weightage system or a new base score.** `baseCoverageScore()` already is the correct "importance × preparation state" formula, already production-tuned against a real incident, already handles the prerequisite-penalty case.
- **Do build a translation layer** from that score's components (status label + weightage tier + prerequisite state) into the student-value sentence template (Section 4-5) — this is new work, but it's a presentation layer over existing intelligence, not a new intelligence layer.
- **Default Next Priority to the existing formula's literal top pick**; reserve Foundation/Future-Risk framing for cases where the foundation candidate's score is close to or exceeds the alternatives (Section 8's relative test), rather than promoting every unmet prerequisite unconditionally (the original bug) or suppressing all of them unconditionally (an equal and opposite mistake).
- **Never state weightage as a number or percentage** in student-facing copy — same rule as every prior document in this investigation, reconfirmed here against the source directly, including the one real exception (Editorial Reading, Section 2) that shows weightage is not even internally uniform in what it claims to measure.

---

*End of audit. No weights were changed. No new weightage or scoring system was created — `baseCoverageScore()` is reused exactly as it exists in `src/lib/topic-selector.ts`. No application code was written. All three real-student examples in Section 6 came from actual production `topic_coverage` data (the same pull used in the prior validation pass), computed locally against the unmodified formula. Not committed to the repository per this task's explicit instruction.*
