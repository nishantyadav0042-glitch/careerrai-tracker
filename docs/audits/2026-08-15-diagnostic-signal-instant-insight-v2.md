# CareerRai Diagnostic Signal & Instant Insight — v2

**Read-only. No code, database, or configuration changed. Not committed to git per this task's explicit instruction — delivered as a file only; tell me if you want it added to the repo.**

This document corrects a real overreach in the prior validation pass and answers a different, better-scoped question: not "how many students should get a discovery," but "how should CareerRai use a one-day-old signal intelligently while it's still immature."

---

## 1. Why the Previous 11-Student Conclusion Was Statistically Immature

The correction is accepted in full, and it's worth being precise about exactly what was wrong, not just that something was. Re-traced against production timestamps: the post-login screen shipped **14 Aug** (`72d35ac`), the pre-auth `/start` screen shipped **15 Aug** (`84dacd6`) — the feature is, as of this document, **roughly 24-40 hours old**. The 11 real self-reporters are not a sample drawn from a mature, stable population — they are the entire eligible population's early completions from a single day.

The specific errors in the prior document, named exactly:
- Treating "2 of 11 support genuine discovery" as if it estimated a future rate, when it's a count from an n too small to estimate anything, from a population still actively growing.
- Implying the 1-2 card UX recommendation should be shaped around that ratio — conflating "what we observed in an immature sample" with "what the product should assume going forward."
- Not separating **bug-finding** (which n=11, or even n=1, is perfectly valid for — the saturation/tie-break bug was found and is real regardless of sample size) from **distribution estimation** (which n=11 cannot support).

**The corrected framing, adopted here:** the 34-student pull (11 self-reporters + 23 by coverage volume) is a **validation corpus for software/product correctness**, not a market-research sample. Every finding phrased as a rate or percentage in the prior document is retracted as a distribution claim and kept only as a bug-detection result — restated explicitly in Section 12.

## 2. What the New Weakest-Section Signal Actually Represents — Traced Precisely

- **Introduced:** two separate commits, one day apart. `72d35ac` (14 Aug) added `ScreenWeakestSection` to `onboarding-modal.tsx` (post-login path); `84dacd6` (15 Aug) added the same shared component to `/start/page.tsx` (pre-auth path). **Exactly one wording exists for each — no revisions found** (`git log --follow` on `screen-weakest-section.tsx` returns a single commit; the component is shared, not duplicated, across both funnels).
- **Wording:** "Which section costs you the most marks?" with three tappable options (VARC/DILR/QA) plus an explicit fourth choice, "Not sure yet — decide it from my mocks," which submits `null` as a real, honest answer, not a skip in the abandonment sense.
- **Who has seen it, precisely:** only students created on or after 14 Aug could possibly have seen either version. Confirmed directly against production: **338 of 412 real students (82%) were created before the feature existed** and have a structurally guaranteed `null` — not a preference, not a skip, a **pre-existence null**. Of the **67 students actually eligible** (created since 14 Aug), **11 have answered (16.4%)** — this 16.4%-of-eligible figure is the honest completion rate, not "11 of 412."
- **NULL has at least three distinct, currently indistinguishable meanings**, exactly as the mandate suspected — and this document can now say precisely which is dominant:
  1. **Pre-existence** (created before the screen existed) — **84.7% of all nulls** (338 of 399), the overwhelming majority.
  2. **Explicit "Not sure yet"** — a real, honest, low-confidence answer, submitted as `null` by design (`screen-weakest-section.tsx:65-69`).
  3. **Reached the screen but abandoned the funnel before answering** — reachable but not directly countable from `profiles` alone.
  Cases 2 and 3 are **not distinguishable from the `profiles` column value alone** — both write nothing, and there is no separate "seen but skipped" vs "seen and answered null" marker on the row.
- **Screen-reach data exists, partially.** The pre-auth `/start` funnel fires a generic per-screen beacon (`trackFunnel('start:weakest-section')` in `page.tsx`); queried directly against production `funnel_events`: **14 distinct anonymous visitors reached the `/start` weakest-section screen** since it shipped. This is real evidence that people reach the screen and don't all answer it — but `funnel_events` is keyed by pre-auth `anon_id`, not `student_id`, so it cannot be joined cleanly back to the 11 signed-up self-reporters to say precisely how many of the 14 became one of the 11. **The post-login `onboarding-modal.tsx` path has no equivalent generic screen-reach beacon found** — for that path, there is currently zero visibility into how many students reached the screen versus answered it.
- **Multiple versions:** none — single wording, single implementation, shared component.
- **Selection bias in who reaches the screen:** real and unquantified. The screen sits after several other onboarding questions in both funnels; anyone who drops off earlier in either funnel never reaches it, and that drop-off is not measured by this document.
- **Old vs. new students:** definitionally different, not just empirically — old students cannot have this field populated under any circumstance, since the UI to set it didn't exist when they onboarded.

**Direct correction to the mandate's own instruction:** do not treat null as "no weakness." Per the numbers above, treat it, in order of actual prevalence, as **(1) most likely "the student predates the feature," (2) plausibly "explicitly unsure," (3) possibly "abandoned before answering"** — and build the product to never silently collapse those three into one meaning.

## 3. The Signal as a First-Class Input, Not Ground Truth

Restating the mandate's own framing because it's correct and this document adopts it without modification: `self-reported weakness = student perception signal`, never `= ground truth`. Concretely, per the categories asked about:

| Should self-report influence... | Yes/No | Why |
|---|---|---|
| Relevance (what gets acknowledged) | **Yes, always** | This is the non-negotiable fix for the original bug — an insight screen that has a self-report and doesn't address it has already failed, regardless of what else it finds |
| Interpretation (how a finding is framed) | **Yes** | "You said X, and here's the specific reason" reads differently from the same fact stated cold |
| Explanation (the "why" copy) | **Yes** | Directly ties to Section 5's relationship model |
| Prioritization (which finding leads) | **Yes, when evidence doesn't clearly favor something else** | Matches `resolveFocusSections`'s existing precedent: self-report outranks coverage, yields to performance |
| Section ranking (Stage 1 of the two-stage model) | **No, not exclusively** | Section 4/5 — must not cap what the section-level evidence can independently surface |
| Topic ranking (Stage 2) | **No** | `baseCoverageScore` should stay evidence-driven within whichever section is being examined |
| Study-plan priority | **Yes, at the same rank `resolveFocusSections` already gives it (rank 2, below performance)** | This is already correct and live — no change implied here |
| Mentor matching | **Already yes, via the raw field today** — worth revisiting only as part of the broader canonical-diagnosis consolidation (prior truth table's Section 9/10), not this document's scope | |
| Cohort matching | **Already yes, display/matching-dimension only** — same note | |

## 4. Not Overcorrecting the Original Bug

Restating the mandate's distinction because it's the load-bearing sentence of this whole document: **self-report must be acknowledged; self-report does not have to constrain discovery.** The prior validation pass's saturation guard and threshold logic already embody this correctly — they gate WHEN a second finding is shown, never whether the self-reported section may be examined by evidence, and never whether a genuinely different section may be surfaced. Nothing in that mechanism needs to change; what changes in THIS document is how confidently we describe how often each branch fires (Section 1).

## 5. The Correct Relationship — Proving It, Not Assuming It

Testing all five models against two fixed points: (a) the original bug (self-report silently ignored) must not recur, (b) the founder's explicit rejection of "force everything to the self-reported section" must also hold.

- **Model A (self-report overrides evidence):** fails (b) directly — this is the exact over-correction ruled out in Section 4.
- **Model B (self-report scopes the entire analysis):** also fails (b) — a scoped analysis can never surface a genuine QA finding for a VARC self-report, which the founder explicitly wants preserved.
- **Model C (self-report is one candidate finding among several, competing freely):** fails (a) if unmodified — this is structurally how the ORIGINAL bug happened: `prep-insight-engine.ts`'s detectors already compete on `severity × confidence × nonObvious`, and a foundation-gap detector with near-max scores on all three routinely outranks a plain coverage restatement. Self-report entering as "just another candidate" with no floor guarantee reproduces the bug in a new location.
- **Model D (self-report provides context/relevance; independent discovery can occur):** satisfies both — acknowledgment is structural (always happens), discovery is unconstrained by section identity.
- **Model E (hybrid, graduated by evidence strength):** compatible with D, adds the mechanism for HOW discovery activates.

**Proven answer: D is the relationship; E is the mechanism inside it.** Self-report always produces an acknowledgment-anchored finding (a structural guarantee, not a competing candidate that can lose and disappear) — this is what makes Model C insufficient on its own and what makes D necessary. Whether a SECOND, independently-discovered finding also appears is graduated by evidence strength (E), using the threshold logic from the prior validation pass (Section 7 there) — but reframed per Section 1 of this document as a **quality gate**, not a **predicted rate**.

## 6. Designing for Today's Data Without Foreclosing Tomorrow's

No architectural change from the prior redesign spec's evidence hierarchy is needed — it already ranks performance > self-report > baseline > coverage, and already degrades gracefully when higher tiers are absent (which is the norm today: 96.6% of students have no mock data, per repeated confirmation across every document in this investigation). The one addition this document makes: **self-report itself needs a maturity/confidence dimension, not just a presence/absence one** — Section 7 defines it.

## 7. Self-Report History — A Concept, Not an Implementation

**Single observation ("VARC," once) is weak evidence — this document agrees and treats it as low-confidence by default, never upgraded to certainty regardless of how the UI phrases it.**

**Repeated, consistent observation (VARC on day 1, VARC on day 30, VARC on day 60) should increase confidence** — this is a defensible design principle even before any data exists to calibrate exact thresholds, because consistency across time is qualitatively different evidence from a single tap: it's harder to explain by noise, mood, or a momentary bad practice session. **Design concept, not implementation:** a `self_report_history` view (conceptually — table or derived view, not specified further per the "do not implement" rule) recording every self-report event with a timestamp, from which a `consistency_count` and `most_recent` can be derived; confidence scales with `consistency_count` up to some cap, never unboundedly, since even five agreeing self-reports are still perception, not performance.

**Changing observation (VARC on day 1, QA on day 30) is explicitly ambiguous, and this document will not force a single interpretation** — all three of the mandate's candidate explanations (changing perception, changing actual preparation focus, measurement noise) are live possibilities with nothing in current data to arbitrate between them. **The correct product behavior for a changed self-report is to treat the MOST RECENT one as current perception** (consistent with how the rest of the product already treats declared state — coverage status, hours available, etc. all use "latest wins," per `coverage-status.ts`'s `highestStatus`/forward-move discipline) while **not silently discarding the history** — a later analytics pass (Section 12) can examine whether change correlates with anything, but the live product should not attempt that inference today.

## 8. Instant Insight for an Immature Signal

Adopting the mandate's structure directly, because it's correct and matches Model D/E from Section 5: on any self-report, CareerRai first acknowledges ("Got it — you feel VARC is costing you marks"), then independently examines the full preparation. **All three stated outcomes are valid, and this document explicitly refuses to force a distribution across them:**
- **A.** VARC itself has a real, evidence-backed issue → acknowledgment + specific finding, no second card needed.
- **B.** VARC is relatively healthy; another section carries a materially stronger opportunity → acknowledgment + a clearly-flagged second finding (Section 5/9's threshold gate).
- **C.** Evidence is too sparse anywhere to say anything specific and honest → the existing insufficient-evidence state, unchanged, still legitimate.

No claim is made here about how often each fires — that answer only exists once real usage accumulates (Section 13).

## 9. Redefining "Discovery"

Correcting the prior document's implicit definition (`winner section ≠ self-reported section`) to the mandate's more precise one: **a discovery is a materially useful preparation insight that is not obvious from the student's stated concern — evaluated on novelty + relevance + evidence, not on section identity alone.**

Consequences of the correction:
- A finding **within the self-reported section** can still be a discovery, if it's specific and non-obvious (e.g., a foundation gap the student named the right section for but couldn't have named the specific mechanism themselves — the "STRONG" tier from the earlier research review's WOW-claim comparison).
- A finding in a **different** section is not automatically a discovery merely by virtue of being elsewhere — it still has to clear the same novelty/relevance/evidence bar.
- This reframes the prior validation pass's threshold (Section 7 there: gap delta ≥0.20, not saturated, `n≥9`) as **one operationalization of "evidence strength" for the specific case of a cross-section coverage-gap discovery** — not the general definition of discovery itself. A foundation-gap discovery (Section 9 of the prior document) or a future performance-contradiction discovery (once mock data exists) would need their own evidence-strength operationalizations under this same general definition, not a forced fit into the coverage-delta threshold.

## 10. Revisiting the Three-Finding Model

Adopting the mandate's proposed shape over the prior document's "1-2 cards from a fixed taxonomy" framing: **ONE PRIMARY insight + optional SECONDARY finding(s)**, where PRIMARY is whichever single finding has the strongest combination of relevance-to-self-report and evidence strength (usually, but not definitionally, the self-report-anchored one), and SECONDARY is anything else that clears Section 9's novelty/relevance/evidence bar. This is a genuine improvement over both the mandate's original three-equal-cards sketch and the prior document's implicit "Validation card + optional Discovery card" framing, because it doesn't presuppose which finding leads — a sufficiently strong non-self-reported finding COULD legitimately be primary (e.g., a decisive recent mock result, once that evidence exists), with the self-report acknowledgment folded into the primary card's opening line rather than forced into its own separate slot. The example given in the mandate ("Your VARC concern makes sense because RC inference is incomplete" / "One thing you may have missed: QA's [topic] is also untouched") is exactly this shape and is adopted as the reference structure.

## 11. Saturation Guard — Why It Exists, Restated Correctly

Correcting the prior document's framing: the guard does not exist because "DILR is wrong." It exists because **when all three sections are near-total-gap, the system has no real evidence to distinguish them, and picking one anyway (via an arbitrary tie-order) manufactures false confidence.** The fix is not "pick better" — no section-level formula can distinguish three sections that are all equally untouched — the fix is recognizing this as its own legitimate diagnostic state. **`INSUFFICIENT EVIDENCE` must remain a first-class output, not a fallback apologized for.** This is unchanged from the prior document's conclusion; only the justification is corrected here.

## 12. The 34-Student Corpus, Correctly Used

Reclassifying every finding from the prior validation pass along the mandate's seven questions — kept as **software/product-quality findings**, explicitly stripped of any distributional claim:

| Question | Finding (bug-detection framing, no rate implied) |
|---|---|
| Does the system behave logically? | Yes for non-saturated cases; the saturated case (8 of 34 in this specific pull) exposed a real logic gap, now named (Section 11) |
| Does it respect self-report? | The simulated Stage-1/Stage-2 model does not YET structurally guarantee acknowledgment (Section 5's Model C failure mode) — this remains an open implementation requirement, not something the simulation proved solved |
| Does it avoid irrelevant discoveries? | The 0.20-delta/`n≥9` gate, tested against real cases, correctly suppressed 3 marginal near-ties (`948c4ba0`, `9eea4c81`, `ad22c2d6`) that would otherwise have been false discoveries — this is a genuine, sample-size-independent bug-catch, kept |
| Does it avoid arbitrary section selection? | No, not yet — this is exactly the saturation-guard gap (8 of 34 cases), a real defect this corpus correctly surfaced |
| Does it surface meaningful preparation gaps? | Yes, when evidence is real (`e6d604ab`, `fea4a910`) — kept as existence proof, not frequency claim |
| Does it suppress weak evidence? | Yes, per the threshold gate's behavior on the marginal cases above |
| Does it explain why it selected the insight? | The simulation computed the "why" (gap deltas, topic scores) but this document does not claim the UX copy layer was validated — that's a design task, not something 34 rows of coverage data can test |

**This corpus should be extended, not replaced, as the feature matures** — new real students should be added to it over time specifically to re-run these SAME software-correctness checks, never to recompute a "percentage who get discovery."

## 13. The Learning Loop

Adopting the mandate's proposed instrumentation chain directly, as a design (not implementation) target:

```
self_reported_section
  → instant_insight_primary_section / finding
  → instant_insight_secondary_section / finding (if any)
  → student_action (tapped through, ignored, disagreed if UI supports it)
  → subsequent study behaviour (does the plan's actual focus match?)
  → future self-report (if re-asked)
  → future mock/performance (if it arrives)
```

This directly closes the gap the first forensic audit flagged (Part L #11: "no analytics/telemetry records which specific insight a student saw") and gives a real, dated path to eventually answering the questions the mandate lists (does self-report predict performance, does acknowledgment increase plan-start, etc.) — **none of which this document, or any document in this investigation, can answer today.** The diagnostic object schema from the redesign spec's Phase 8 already has the right shape for this (a `timestamp` and `student acknowledgement` field were already specified there) — this section confirms that schema is still correct and adds the specific event chain above as what should eventually flow through it.

## 14. Final Product Principle

Adopted verbatim, because it is the correct synthesis of everything in this investigation:

> STUDENT PERCEPTION + CAREERRAI'S PREPARATION EVIDENCE = CAREERRAI INSIGHT

Neither side dominates by default (ruling out Models A/B, Section 5); the student's perception supplies context and the anchor for acknowledgment (Section 4); CareerRai's evidence supplies the investigation (Section 9's discovery definition); the insight's job is to state the relationship between the two honestly, including when they simply agree (Section 8's outcome A) and including when there isn't enough evidence to say anything specific yet (Section 8's outcome C, Section 11's insufficient-evidence state).

## 15. Implementation Plan (Design-Level Only, Not Authorized)

Not a change from the prior validation pass's GREEN/YELLOW/RED gate in substance — corrected in framing per this document's central point:

**GREEN, unchanged:** Stage 1/Stage 2 mechanics, the saturation/insufficient-evidence guard, the foundation-relationship framing rule, the conjunctive evidence-strength gate as a QUALITY mechanism (not a rate predictor).

**GREEN, added by this document:** the null-taxonomy awareness (Section 2) — any implementation must be able to represent "pre-existence," "explicit unsure," and "abandoned" as distinct states going forward, even though today's schema can't retroactively distinguish the second and third; the structural acknowledgment guarantee from Section 5 (self-report must never be a droppable candidate — Model D, not Model C).

**YELLOW, corrected from RED-adjacent caution in the prior document:** the primary+secondary UX structure (Section 10) — now the recommended shape, but still needs real-usage validation once the signal has more than a few days of data.

**YELLOW, new:** the self-report-history/consistency concept (Section 7) — a real design direction, not yet backed by enough repeated observations (the feature is a day old) to calibrate.

**RED, unchanged:** any claim that a specific percentage of students should receive a discovery — this document's entire purpose is retracting that framing, not replacing it with a new number.

**RED, new:** treating `null` as a single, uniform "no self-reported weakness" state anywhere in the implementation — Section 2 proved it is at least three different things today.

**NO IMPLEMENTATION AUTHORIZED. No code, database, or configuration was changed in producing this document.**

---

*End of v2. This document supersedes the distributional framing in `2026-08-15-two-stage-model-validation.md` (that document's bug-detection findings — the saturation guard, the threshold gate's suppression of marginal near-ties — remain valid and are carried forward in Section 12; its "2 of 11" and "18%" language is retracted as a product-distribution claim). Not committed to the repository per this task's explicit instruction.*
