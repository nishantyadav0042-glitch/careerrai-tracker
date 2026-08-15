# CareerRai — Preparation Insight Engine
## Final Product + Engineering Specification

**Read-only. NO CODE. NO DATABASE CHANGES. NO COMMIT. NO PUSH.** This document reconciles six prior investigation documents (forensic audit → weakness truth table → redesign spec v1 → research review → two-stage validation → diagnostic signal v2 → existing weightage audit → scheduling-vs-insight architecture) into one canonical spec. Nothing below restarts the research; every claim traces to a document already produced and, wherever real data exists, to production queries already run.

---

## PART A — Product Philosophy

**DECISION:** The product is not "find the student's weakness." It is: take what the student believes about their preparation, inspect what their preparation data actually shows, and give the most useful, honestly-evidenced explanation available — `STUDENT PERCEPTION + PREPARATION EVIDENCE = CAREERRAI INSIGHT`.

**WHY:** The founder's own screenshot complaint was not "the algorithm was wrong" — Functions→Linear Equations is a real, correctly-computed graph fact. The complaint was relevance: CareerRai answered a question the student didn't ask. A pure "weakness detector" invites exactly this failure by treating the algorithm's output as sufficient on its own.

**EVIDENCE:** Forensic audit Part F (zero section-awareness in `findFoundationGap`); the founder's own words, quoted verbatim in the research review: "CareerRai answered a question the student didn't ask."

**ALTERNATIVES REJECTED:** "Weakness detector" (Section 11 of the research review — rejected because 0/34 real students supported an unqualified ability claim, per Part J of the forensic audit — no performance data exists for 96.6% of students). "Diagnostic system" (implies medical-grade authority the data cannot support).

**INVARIANT #3 (locked):** Self-report is perception, not objective truth.

## PART B — Self-Report Signal Model

**DECISION:** Self-report becomes **mandatory** for new students going forward (the founder's explicit directive, this turn). It remains structurally non-droppable through the pipeline (Model D/E, Part C). Three concepts, never conflated:

| Concept | Definition | Requires |
|---|---|---|
| **Acknowledgement** | Restating what the student said | Nothing beyond the self-report existing |
| **Validation** | A specific, evidenced statement supporting the self-reported section | Real coverage/foundation/performance evidence IN that section |
| **Discovery** | A novel, relevant, evidenced, actionable finding — anywhere | Part G's four gates, cleared |

**WHY mandatory, not optional:** the founder's ruling this turn is explicit and final — "the fact that the feature is only approximately one day old is NOT a reason to remove or weaken this requirement." This document does not relitigate it.

**WHY never manufacture Validation:** the earlier v2 document's real production check found only 2 of 11 pre-mandate self-reporters produced a genuine, confident agreement between self-report and coverage evidence — retracted there as a distribution claim, but kept here as proof that Validation cannot be assumed to exist by default; it must be earned by real evidence or omitted.

**EVIDENCE:** v2 document Part 1/12 (immature-sample correction, kept as a bug-detection/mechanism-validity finding, not a rate).

**ALTERNATIVES REJECTED:** Model A (self-report overrides evidence — fails the founder's explicit "must not automatically override" rule). Model B (self-report scopes all analysis — fails "must not force every other finding into that section," the exact over-correction ruled out twice now, in the research review and again this turn). Model C alone (self-report as one candidate that can silently lose and disappear — this is structurally how the ORIGINAL bug happened, per redesign spec Part 5).

**INVARIANT #1, #2, #4, #5 (locked):** mandatory for new students; never silently disappears; acknowledgement always possible; validation requires evidence.

## PART C — Evidence Hierarchy

Unchanged from the redesign spec (Phase 2) and reconfirmed against real population numbers throughout this investigation: **performance > self-report > baseline > coverage > prerequisite**, with performance gated on COMPLETE + RECENT(≤45d) + DECISIVE(≥3pt gap) — `mockInformedFocus()`, already live, already founder-approved ("measured evidence beats remembered feeling").

**Real population grounding, not assumed:** 14 of 412 students (3.4%) have any mock data; 364 of 412 (88%) have coverage data; baseline is confirmed structurally dead (1 row, a test account, out of 412). **The hierarchy must default to the coverage tier for the overwhelming majority of real usage — this is the normal case, not a degraded fallback.**

## PART D — Candidate Detectors

Seven independent generators, per this turn's exact list, each with ONE job — the direct fix to "one scorer secretly performing every diagnostic function," the failure mode `prep-insight-engine.ts`'s original `dedupeByRootCause` ranking exhibited:

| Detector | Input | Output | Existing code to reuse |
|---|---|---|---|
| A. Self-report acknowledgement | `self_reported_weakest_section` | Always-present ack candidate | New (thin) — the field already exists and persists correctly |
| B. Self-report validation | self-report + coverage/foundation/mock in that section | An evidenced statement, or nothing | `prep-insight-engine.ts`'s per-section stats, scoped |
| C. Section-level preparation pattern | full coverage matrix | Section-level gap comparison (Stage 1) | `prep-insight-engine.ts`'s weighted gap formula, converged with `section-weakness.ts` per the truth table's Part L finding #7 (two independent copies exist today — pick one before adding a third) |
| D. Scheduling candidate | `baseCoverageScore()` | The literal next-topic pick | `topic-selector.ts`, **unmodified**, used only as ONE candidate input (Part F/Invariant #10) |
| E. Foundation-gap detector | active-topic + unmet-prerequisite graph | A candidate topic pair | `findFoundationGap`/`deepestUnmetPrereq`, gated per Part F (never auto-promoted) |
| F. Meaningful untouched-topic detector | coverage matrix, `TOPIC_METADATA` | A candidate untouched topic | New — evaluated qualitatively (Part G), never by raw `baseCoverageScore` alone (research review's finding: that formula systematically favors `learning`-status topics via the +30 term, so an untouched-topic detector must be a SEPARATE lane, not a byproduct of Scheduling) |
| G. Other evidence-backed pattern | `mock_debriefs` via `mockInformedFocus` | A performance-backed finding, when it exists | Already live, already the strongest evidence tier |

## PART E — Section-Level Analysis

Stage 1 ranks QA/VARC/DILR by the converged gap formula (Part D-C). **P0, locked as of the two-stage validation document's real-data finding:** when all three sections are near-saturated (≥0.95 gap), the section ranking is meaningless — the DILR→QA→VARC tie-break resolved 8 of 8 such real cases to DILR, **including 4 of 11 real self-reporters (a false, arbitrary contradiction of a real, mandatory self-report)**. This is not a rare edge case; it is a structural degeneracy of any three-way near-tie.

**DECISION:** a saturation/insufficient-evidence guard sits BEFORE section ranking, not as an afterthought. If it fires, section-level ranking does not run at all — the pipeline falls straight to Part M's insufficient-evidence state.

**INVARIANT #14 (locked):** saturation/insufficient-evidence guard is mandatory, P0.

## PART F — Foundation Detector

**DECISION, and an explicit self-correction on record:** a prior document in this investigation (the existing-weightage audit) proposed resolving "does the foundation candidate win?" by comparing `baseCoverageScore(active topic)` against `baseCoverageScore(prerequisite)`. **That is wrong, and is retracted here.** It is still a scheduling-flavored comparison. The correct rule is qualitative, per this turn's exact six questions:

1. Is the prerequisite relationship real (a genuine `TOPIC_METADATA.prerequisites` edge)?
2. Is the prerequisite materially incomplete (`not_started`, not merely `learning`)?
3. Is the relationship relevant to the student's CURRENT preparation (parent topic at `practicing`/`revising` — real, demonstrated investment, per the research review's Section 9 threshold)?
4. Is it non-obvious (would the student connect these two facts unprompted)?
5. Is it actionable (does fixing the prerequisite have a clear next step)?
6. Would the student plausibly say "I hadn't noticed that"?

**WHY the score-comparison approach was wrong:** `baseCoverageScore(A)`'s magnitude answers "should the plan keep scheduling A" — a question already correctly answered by Scheduling (Part D). Using that same number to decide whether B deserves the Insight slot imports a scheduling judgment into an insight decision, exactly the conflation Part D exists to prevent.

**EVIDENCE:** re-run against the real Functions/Linear-Equations case (`fea4a910`, Part P) and the SI&CI/Percentages case (`8ac65fdf`, Part P) — both pass all six questions; the low-weightage Coordinate-Geometry/Lines-and-Angles case (`37f6d141`, Part P) fails on relevance and non-obviousness (both topics weightage 2, a shallow relationship) regardless of what either topic's `baseCoverageScore` happens to be.

**INVARIANT #11 (locked):** foundation candidates do not compete with scheduling candidates through scheduling scores.

## PART G — Insight Qualitative Gates

**DECISION:** a hierarchical gate, not a weighted formula — per this turn's explicit instruction against inventing `relevance × novelty × evidence × actionability`.

- **GATE 0 — TRUTH.** Every stated fact traces to a real row (coverage status, prerequisite edge, mock score, or the self-report itself). Deterministic rule: reject any candidate whose claim cannot be pointed at a specific database value.
- **GATE 1 — RELEVANCE.** Does it matter to this student's CURRENT preparation? Deterministic rule: a candidate about a topic with zero recent coverage activity AND zero self-report connection AND zero foundation link to an active topic fails this gate outright.
- **GATE 2 — NOVELTY.** Would the student already know this from their own input? Deterministic rule: a candidate whose entire claim is a single coverage-status restatement ("X is untouched," alone, with no relationship or comparison) fails; a candidate stating a RELATIONSHIP between two facts (a comparison, a prerequisite link, a cross-section pattern) passes.
- **GATE 3 — ACTIONABILITY.** Deterministic rule: the candidate must map to a specific topic (or topic pair) the plan can schedule — a candidate that only names a section, with no topic, fails.
- **GATE 4 — INSIGHT VALUE (tie-break only, among candidates that already passed Gates 0-3).** Deterministic rule, not a score: prefer (a) the self-report-anchored candidate if one exists and passed Gates 0-3, as PRIMARY, per Part B's acknowledgement guarantee; then (b) among remaining candidates, prefer the one whose relationship spans the MOST distinct evidence types (e.g., a foundation-plus-weightage story over a single coverage-status story) — a count of distinct evidence types is a deterministic tie-break, not a weighted score.

**INVARIANT #6, #7, #8 (locked):** discovery requires novelty+relevance+evidence+actionability; discovery does not mean "different section"; no forced discovery — a candidate pool where nothing clears Gates 0-3 produces zero discoveries, not a manufactured one.

## PART H — Primary + Secondary UX

**DECISION:** ONE primary insight + an OPTIONAL secondary — not three equal cards, not a fixed count. Restated directly from this turn's own example (adopted verbatim, it's correct):

> PRIMARY: "You told us VARC feels weakest. Your RC preparation is still incomplete, particularly inference-based work."
> SECONDARY: "But we noticed something you may have missed: you're already working on Functions in QA, while the Linear Equations foundation underneath it is still incomplete."
> Then: "Here's what we'll do next."

**WHY not always three:** the two-stage validation document's real 34-student pull found only 2 clean C/D-tier discoveries — retracted as a rate, but the underlying mechanism finding stands: most real evidence states do not support three independently strong findings, and forcing three produces exactly the "three generic observations" failure this turn explicitly warns against.

**PRIMARY selection, restated from Part D-G:** self-report acknowledgement is always present in some form; whether it upgrades to Validation depends on Gate 0-3 evidence; PRIMARY is whichever candidate (validation or discovery) is strongest per Gate 4's deterministic tie-break.

## PART I — Copy / Evidence Contract

Three-way distinction, mandatory in every rendered sentence:

| Register | Example | Backing required |
|---|---|---|
| **YOU TOLD US** | "You told us VARC feels weakest." | The self-report field, nothing else |
| **WE OBSERVED** | "You've covered..." / "You're currently learning X." | A real coverage/mock row |
| **WE INFERRED** | "That suggests..." / "You're working on X while its prerequisite Y remains incomplete." | A real relationship (Part F/G), never a raw causal leap |

**Forbidden without performance evidence:** "You are weak at X," "This is why you get X wrong," "This topic is heavily tested," "This is definitely costing you marks" — all require rank-1 evidence (Part C) that 96.6% of students don't have.

**Weightage-specific rule (Part I of the existing-weightage audit, carried forward verbatim):** never state a raw weightage number or percentage; never compare weightage across sections (`TOPIC_METADATA.weightage` is explicitly section-relative, per its own source comment); never call a topic "high-weightage" as a stand-in for "heavily tested" without checking WHICH of the five distinct concepts (exam importance / preparation importance / prerequisite importance / scheduling priority / content-team emphasis) is actually being claimed — Editorial Reading (VARC weightage 4, second-highest in its section) is weighted for supporting-habit leverage, not exam frequency, and is the concrete, real, on-the-record warning against collapsing these.

**INVARIANT #12, #13, #15 (locked):** no cross-section weightage comparison; weightage not described as exam frequency without independent support; no unsupported performance/causal claims.

## PART J — Plan Handoff

**DECISION:** the diagnostic object is the SAME object shown to the student and consumed by the plan — not two independently-computed approximations of each other. Schema (conceptual, not code):

```
{ primary_insight, secondary_insight, acknowledged_self_report,
  recommended_action, reason, evidence_source, insight_type,
  plan_priority, promised_action, disclosure_required, timestamp,
  student_acknowledgement }
```

**Conflict rule, P0:** whenever `promised_action` differs from what the plan's next block actually contains, `disclosure_required = true` and a `mockBasis`-style disclosure string (the exact, already-live production pattern from `resolveFocusSections`) must render — never silent. A plan that schedules Functions after Insight promised "fix Linear Equations first," with no explanation anywhere, is a defect under this rule, not a nuance.

**INVARIANT #16, #17, #18 (locked):** structured handoff; no silent divergence; no promise the plan cannot honour or explicitly disclose.

## PART K — Canonical Architecture

```
STUDENT SELECTS WEAKEST SECTION (mandatory, new students)
        ↓
PERSIST SELF-REPORT
        ↓
MANDATORY ACKNOWLEDGEMENT (Part B — always renders in some form)
        ↓
CHECK DATA SUFFICIENCY (Part E's saturation guard)
   │
   ├── INSUFFICIENT → acknowledgement + honest limitation (Part M) → STOP, no fabricated ranking
   │
   └── SUFFICIENT
          ↓
      GENERATE CANDIDATES (Part D, all 7 detectors, independent, parallel)
          ↓
      GATE 0-3 (Part G, per candidate)
          ↓
      SELF-REPORT VALIDATION CHECK (does a self-report-anchored candidate survive Gates 0-3?)
          ↓
      GATE 4 TIE-BREAK (Part G — deterministic, not a score)
          ↓
      PRIMARY INSIGHT (+ optional SECONDARY, Part H)
          ↓
      CONFIRM PLAN CAN HONOUR THE RECOMMENDATION (Part J)
          ↓
      SHOW INSIGHT
          ↓
      PERSIST STRUCTURED DIAGNOSTIC OBJECT
          ↓
      STUDY PLAN CONSUMES IT (never re-derives independently)
```

No change to this turn's proposed tree was needed — it is architecturally sound as given, and matches everything Parts A-J establish.

## PART L — Existing-Engine Audit / Canonical Ownership

| System | Classification | Why |
|---|---|---|
| Instant Insight (`prep-insight-engine.ts`) | **REFACTOR** | Becomes the candidate-generation + gate pipeline (Parts D-H); its existing detector CODE (foundation traversal, section gap math) is reused, its RANKING logic (severity×confidence×nonObvious) is replaced by Part G's hierarchical gate |
| `resolveFocusSections()` | **KEEP** | Already canonical for the daily plan; consumes the same evidence hierarchy (Part C); Insight's diagnostic object becomes one more input it can honour (Part J), not a replacement of its own logic |
| `baseCoverageScore()` / `chooseTopicForSection()` | **KEEP, unmodified** | Scheduling-only (Part D detector D); Invariant #9/#10 |
| `section-weakness.ts`'s `weakestFromCoverage` | **CONSUME CANONICAL / REFACTOR** | Duplicate of `prep-insight-engine.ts`'s section-gap formula — converge to one before this feature ships (Part D-C's explicit note); do not let a second independent formula persist into the new architecture |
| `routine/add-block` | **REFACTOR** | Currently bypasses `resolveFocusSections` with a raw `self_reported_weakest_section ?? 'DILR'` — should consume the canonical resolver instead |
| `session-credit.matchMentor()` | **REFACTOR (lower priority, separate rollout)** | Reads raw self-report; should consume the same canonical diagnosis eventually, but per the redesign spec's Part 9, this is a separate, later migration — not bundled into Instant Insight's rollout |
| `buddy-match.ts` | **DEPRECATE its current baseline-only formula, or CONSUME CANONICAL** | Its sole input (`baseline_varc/dilr/qa`) is confirmed structurally dead (0 of 412 real students) — non-functional as designed today; needs a founder decision on whether to rebuild on canonical evidence or retire, out of scope for Instant Insight itself |
| `peer-cohort.ts` | **KEEP (display/matching-dimension use, not a decision)** | Lower stakes — social-proof copy, not scheduling or spend; reasonable to keep reading the raw field directly |
| `student-brief.ts`'s coverage ranker | **DEPRECATE as a THIRD independent formula, or converge into the same canonical section-gap math** | Wrong audience (sales AI) but same underlying question — should eventually share the converged formula, not stay a third copy |
| `baseline_varc/dilr/qa` | **Founder decision needed, not resolved here** | Confirmed orphaned write path (Phase 1 of the redesign spec); revive-or-retire is a product call, not an engineering one |
| `section_elo` | **DEPRECATE** | 100% unmodified schema default across all 422 profiles, zero code references anywhere — scaffolding for a feature that was never built |
| `own_weakest_section` | **KEEP the mechanism, but note it is non-functional in practice** | Live write path, but 0 of 8 real buddies have ever populated it — the "shared weakness" mentor-matching bonus has never fired in production; not this feature's scope to fix, but worth the founder knowing |
| `strongest_section` (buddy field) | **KEEP** | Live, populated (8/8 real buddies), genuinely used by two real features — distinct from the student-side field of a similar name, do not conflate |

**INVARIANT #19, #20 (locked):** one canonical diagnostic understanding feeds downstream surfaces over time; no duplicate independent "weakness" engines going forward.

## PART M — Data Lifecycle / Null Handling

Restated from the v2 document's precise, DB-verified finding, now as a forward-looking design requirement rather than a historical audit note:

- **Historical null (pre-mandate):** 338 of 412 real students (82%) predate the self-report UI entirely — structurally null, not a preference. This population does not change under the new mandatory-going-forward rule; it remains a distinct, permanent historical cohort.
- **Going forward, under the mandate:** since the question becomes mandatory for new signups, the persisted values become exactly `{VARC, DILR, QA}` for every new student who completes signup — **no legitimate null case remains for NEW students**, except an incomplete/abandoned signup (which, by definition, never reaches a state where downstream systems would query the field anyway, since the profile itself would be a stub).
- **The "not sure yet" skip option** (`screen-weakest-section.tsx`'s fourth choice) needs an explicit product decision under the new mandatory rule: does mandatory mean the three sections ONLY (no skip), or does "not sure" remain a valid, honest fourth answer that satisfies the mandate's completion requirement without picking a section? **This document flags it as unresolved, not assumed** — the founder's message this turn lists three options (VARC/DILR/QA) as the mandatory choice set, which reads as removing the skip option, but does not say so explicitly. Needs confirmation before Part R's implementation proceeds.

**INVARIANT (implicit, made explicit here):** never treat null as "no weakness" for the historical cohort; never assume the skip option's fate without an explicit founder answer.

## PART N — Telemetry

Adopted directly from this turn's list, organized by what each answers:

**Pipeline events:** `insight_generated`, `insight_type`, `self_reported_section`, `primary_insight_section`, `secondary_insight_section`, `finding_topic`, `finding_type`, `evidence_source`, `discovery_fired`.

**Outcome events:** `student_viewed`, `student_started_recommended_topic`, `student_completed_recommended_topic`, `student_changed_plan_after_insight`, `plan_honoured_insight`, `plan_disclosed_difference`.

**Guardrail rates (computed, not raw events):** `insufficient_evidence_rate`, `student_correction_rate`, `irrelevant_insight_rate`, `insight_plan_mismatch_rate`, `unsupported_claim_rate`.

This directly closes the gap the very first forensic audit flagged (Part L #11: no record of which insight a student saw) and gives the exact chain the v2 document's Part 13 learning loop specified.

## PART O — Success + Guardrail Metrics

**Learning metrics:** insight → plan-start conversion; recommended-topic completion rate; next-day return; 7-day retention; repeat study-log submission; insight acceptance; discovery acceptance; plan adherence.

**Guardrail metrics (must not regress, tracked separately from learning metrics per this turn's explicit instruction):** student correction/rejection rate; insight-plan mismatch rate; insufficient-evidence rate (a RISE here is not automatically bad — it may mean the gates are correctly getting stricter as more edge cases are found; a guardrail metric, not a KPI to minimize blindly).

**Explicit non-goal, stated because it needs to be:** "insight viewed" alone is not a success metric — it measures exposure, not value, and optimizing for it would reward showing MORE insights, the opposite of Part G's suppression discipline.

## PART P — Real-Student Validation

Four named cases, reproduced exactly, using real production data already pulled earlier in this investigation — not re-simulated with new assumptions.

### Case 1 — Functions → Linear Equations (student `fea4a910`, self-reported VARC)
- **Self-report:** VARC.
- **Section evidence:** QA gap 0.56, VARC gap 0.35, DILR gap 0.45 (real weighted-gap numbers, two-stage validation document).
- **Candidates:** B (Validation, VARC) — real, VARC gap is non-trivial; D (Scheduling) — Average, QA, `learning`, score 62; E (Foundation) — Functions (`revising`) ← Quadratic Equations (met) ← Linear Equations (`not_started`), depth 2.
- **Gate check on E:** relationship real (yes), materially incomplete (yes, `not_started`), relevant/current (yes — Functions is `revising`, real demonstrated investment), non-obvious (yes — nothing about revising Functions surfaces this), actionable (yes, name both topics) → **passes all six qualitative questions.**
- **Foundation vs. Scheduling:** NOT resolved by comparing scores (Part F's correction) — E passes Gates 0-3 outright regardless of D's score.
- **Final primary insight:** Validation (VARC — acknowledgement + the real VARC gap fact). **Secondary:** the Functions/Linear-Equations foundation finding, explicitly framed as "outside VARC."
- **Plan:** if the plan's next block is still `learning`-stage Average (Scheduling's literal pick) rather than Linear Equations, `disclosure_required = true` and the difference must be stated.

### Case 2 — SI & CI → Percentages (student `8ac65fdf`, no self-report on file)
- **Section evidence:** QA 0.61, VARC 0.27, DILR 0.86.
- **Candidates:** D (Scheduling) — Arrangements, DILR, `learning`, score 70; E (Foundation) — SI & CI (active) ← Percentages (`not_started`, weightage 5, real root topic); F (Untouched) — Percentages also appears independently as the highest-weightage untouched topic.
- **Gate check on E:** passes cleanly — Percentages is a real, substantial (weightage 5) root topic, depth 1, non-obvious (the student is not currently looking at Percentages at all).
- **No self-report to acknowledge** — Primary becomes the strongest discovery directly (Part H allows this when no self-report exists).
- **Final primary insight:** the Foundation finding (SI & CI / Percentages). **Secondary:** none required — one strong, evidenced, actionable finding is sufficient per Part H's "no forced discovery" rule.
- **Plan:** Scheduling still correctly continues Arrangements (DILR) for the actual next block — this is a case where Insight and Plan diverge in TOPIC but not necessarily in a way that reads as contradictory, since the Insight's `recommended_action` (bring Percentages forward) can be honored as a near-term plan addition without displacing today's Arrangements block; disclosure states this explicitly if the plan doesn't act on Percentages within the promised timeframe.

### Case 3 — Cross-section RC / Hybrid DILR Sets (student `a4a286c2`, no self-report on file)
- **Section evidence:** QA 0.63, VARC 0.79, DILR 0.72.
- **Candidates:** D (Scheduling) — Reading Comprehension, VARC, `learning`, score 70; E (Foundation) — Hybrid DILR Sets (active) ← Tables (`not_started`, weightage 4).
- **Gate check on E:** passes — both topics substantial (weightage 4 each), depth 1, cross-section from Scheduling's own pick (genuinely non-obvious to a student focused on VARC).
- **Final primary insight:** the Foundation finding, cross-section. No self-report to validate, so no Validation-anchored primary is forced.
- **Plan:** Scheduling correctly continues RC; disclosure applies if Hybrid DILR Sets/Tables isn't queued.

### Case 4 — Saturated all-three-section (student `b4f30fbb`, self-reported QA)
- **Self-report:** QA.
- **Section evidence:** QA 1.00, VARC 1.00, DILR 1.00 — real, from production.
- **Part E's guard fires immediately** — no section-level ranking is attempted.
- **Candidates generated:** ONLY Part D detector A (acknowledgement) — B/C/D/E/F cannot produce a trustworthy output when there is no real coverage signal to distinguish anything.
- **Final output:** "You told us QA feels weakest. We don't yet have enough preparation evidence to tell you something more specific — here's a real place to start." (Part M's honest-limitation state, using the existing `startingPoints` mechanism.)
- **This is the exact case that, under the PRE-guard architecture, would have produced "DILR" as a false, confident, self-report-contradicting answer** — the guard is what prevents it.

## PART Q — Test Matrix

Extends (does not replace) the redesign spec's original 15-scenario matrix and the research review's 20-scenario matrix — new cases specific to this document's corrections:

| # | Scenario | Expected behavior |
|---|---|---|
| 1 | Self-report VARC, real VARC evidence, real cross-section foundation gap also present | Primary = Validation (VARC), Secondary = Foundation (other section), per Case 1 |
| 2 | No self-report (legacy/edge case pre-mandate), strong foundation candidate | Primary = Foundation directly, no forced Validation, per Case 2/3 |
| 3 | All sections saturated, self-report present | Guard fires before ranking; acknowledgement-only output; self-report is NOT contradicted, per Case 4 |
| 4 | All sections saturated, no self-report (should not occur post-mandate, but must not crash pre-mandate legacy data) | Guard fires; honest-limitation, generic starting points |
| 5 | Foundation candidate exists but fails Gate 3 (parent topic only `learning`, not `practicing`/`revising`) | Foundation suppressed; falls through to next-best candidate |
| 6 | Foundation candidate exists, both topics low-weightage (the `37f6d141` Coordinate-Geometry/Lines-and-Angles case) | Foundation suppressed on relevance/non-obviousness; Untouched or Scheduling wins instead |
| 7 | Two candidates tie on Gates 0-3 | Gate 4's deterministic evidence-type-count tie-break applies, never a numeric score |
| 8 | "Not sure yet" selected under the new mandatory flow | **Blocked pending Part M's open question** — behavior undefined until the founder confirms whether this remains a valid mandate-satisfying answer |

## PART R — Implementation Plan (Not Authorized, Design-Level Only)

- **Files:** `src/lib/prep-insight-engine.ts` (candidate generation + Part G gates, replacing `dedupeByRootCause`'s scoring); `src/lib/section-weakness.ts` + `prep-insight-engine.ts`'s section-gap formula (converge to one, Part L); `src/app/start/screens/screen-instant-insight.tsx` (Primary+Secondary render, Part H); `src/app/start/page.tsx` (wire the still-missing self-report prop — the original, one-line root cause); `src/app/student/onboarding/screens/screen-weakest-section.tsx` (make the three sections mandatory, resolve Part M's skip-option question first).
- **New (small):** a Part G gate module, evaluated per-candidate, independent of both `prep-insight-engine.ts` and `topic-selector.ts`.
- **Types:** the diagnostic object schema, Part J.
- **Persistence:** the diagnostic object needs a real store (new table or a `notifications`-shaped row) if telemetry (Part N) and plan-handoff disclosure (Part J) are to work — additive schema only, no migration of existing data.
- **Tests:** guard test pinning `baseCoverageScore()`'s literal source (Invariant #9); guard test banning raw weightage numbers/percentages in generated copy (Part I); the 34-student real corpus re-run as regression tests (Part P style), never as a distribution estimate (v2 document's standing correction).
- **Feature flag:** yes — this touches the pre-signup funnel's highest-trust screen.

## PART S — Rollout / Feature Flag / Rollback

Flag-gated to a small cohort of new signups first; compare against the current single-hero screen's downstream behavior (plan-start conversion, recommended-topic completion) before widening — per the redesign spec's original Phase 15, unchanged. Rollback: flip the flag; nothing destructive was written, so no data reversal is needed.

## PART T — Implementation Gate

**GREEN — safe to implement:**
- The candidate-generation architecture (Part D), unchanged in shape from what's now locked.
- The saturation/insufficient-evidence guard (Part E) — proven necessary by real, live production data, not theoretical.
- The qualitative, non-scored Foundation gate (Part F) — this document's central correction, now the canonical rule.
- The hierarchical Gates 0-3 (Part G) — deterministic, testable.
- The copy/evidence contract (Part I) — directly extends existing, already-proven production copy discipline.
- The plan-handoff disclosure rule (Part J) — reuses `mockInformedFocus`'s already-live pattern.
- `baseCoverageScore()` remaining completely unmodified (Invariant #9/#10).

**YELLOW — implement behind the feature flag, validate against real usage before widening:**
- Gate 4's tie-break rule (evidence-type count) — logically sound, not yet observed against enough real multi-candidate cases to be fully confident.
- Primary+Secondary UX copy execution (Part H) — the structure is right, the exact wording needs real-signup validation.
- Whether QA's structural size advantage in Discovery (flagged in both the research review and the validation pass) needs an explicit counter-adjustment.
- The section-gap formula convergence (Part L) — the RIGHT move, but which of the two existing formulas becomes canonical needs a deliberate choice, not an assumption.

**RED — do not implement yet:**
- Any resolution of Part M's "not sure yet" open question without explicit founder confirmation.
- Migrating `session-credit.matchMentor()` or `buddy-match.ts` as part of THIS rollout — explicitly separate, later work per Part L.
- Any performance-based claim for the 96.6% of students without mock data.
- Any cross-section weightage number or percentage, anywhere.
- Reviving `baseline_varc/dilr/qa` or `section_elo` as part of this feature — separate founder decision, out of scope.

**NO CODE CHANGES. NO DATABASE CHANGES. NO COMMIT. NO PUSH.**

---

*End of final specification. This document reconciles all prior work in this investigation into one canonical architecture per your explicit instruction; nothing here restarts the research. One open question is flagged for your explicit decision before Part R can proceed (Part M — the fate of "not sure yet" under the mandatory self-report rule). Not committed.*
