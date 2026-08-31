# The Adaptive Student Effort Model — research and conceptual design (30 Aug 2026)

> Status: CONCEPTUAL SPEC. No code, no schema, no engine change. This document
> is the evidence review and model design the founder asked for before
> revising the resource-research master prompt. The plan-engine's existing
> `minutesPerUnit` numbers remain the ONE planning authority until this model
> earns its calibration data — two authorities for the same minute would
> violate the one-authority rule (`day-topics.ts` header, founder 11 Aug).
>
> Discipline rule for this entire document: every parameter is tagged either
> **[EVIDENCE]** (research-backed, cited) or **[HEURISTIC]** (our judgment,
> honestly labelled, to be replaced by our own calibration data). No
> scientific-looking invented constants.

---

## 1. What was wrong with the fixed-time model

The v1 master prompt (and the engine's pacing constants) treat effort as:
`unit × fixed minutes` — video ×1.5, reading ÷200wpm×1.3, QA question ≈3–4
min, RC passage ≈15/30 min, DILR set ≈15/30 min.

Four specific failures:

1. **It ignores who the student is.** A `not_started` student and a
   `practising` student consume the same resource at materially different
   rates — and the expertise literature says the difference is not noise,
   it's the main effect (§2.3).
2. **It ignores what the unit contains.** A successive-percentage-change
   word problem and a direct "what is 20% of 450" are both "1 question".
   A 5-question Arrangements set with a 3-case branch and a 4-question set
   with none are both "1 set". The unit label carries almost no effort
   information by itself.
3. **It ignores what the task intent is.** "Learn X, solve 10 guided
   questions" and "10 questions, timed" share a count and share nothing
   else. Review/error-analysis time — which the retrieval-practice
   literature says IS the learning (§2.4) — is counted as zero.
4. **It reports fake precision.** "≈22 minutes" communicates a certainty we
   do not have. The honest output is a range plus a confidence.

What was RIGHT about it and must be kept: it is deterministic, explainable,
cheap, and it feeds a planner that must never lie to the student. The
adaptive model refines the estimate; it does not abandon those properties.

---

## 2. Evidence review (Phase 1–2 of the founder's brief)

### 2.1 Reading rate — [EVIDENCE], strong
Brysbaert's 2019 meta-analysis (190 studies, 18,573 participants): mean
silent reading rate for English **non-fiction is 238 wpm**, normal adult
range **175–300 wpm**; rates are lower for readers with English as a second
language; difficult/technical text can roughly **halve** speed (~100–150
wpm), driven by longer words and regressions (re-reading eye movements).

Consequences for us: (a) our old 200 wpm centre was defensible, but a
single number is not — the honest band for Indian ESL students on
CAT-register prose is **[HEURISTIC] 130–220 wpm**, tightening only with our
own data; (b) passage density legitimately doubles reading time — "RC
passage = 15 min" cannot be a constant; (c) first-pass reading ≠ studying:
regression/re-reading is part of comprehension, not overhead.

### 2.2 Video — [EVIDENCE] directional, multiplier is ours
- Guo, Kim & Rubin 2014 (6.9M MOOC sessions): engagement collapses after
  ~6 minutes of video; short segments dominate.
- Learner-control research: **high performers pause frequently** and use
  pauses to take notes; pause/rewind use increases with material
  complexity; learner control lowers experienced cognitive load.
- Murphy et al. 2021: comprehension survives playback up to 2× with minimal
  cost — students genuinely can consume passive exposition faster than 1×.

Consequences: a universal ×1.5 is wrong in BOTH directions. A passive
concept video may cost ~1.0× (or less, sped up); an example-dense video
consumed properly — pause, attempt the example, compare — costs 1.5–2.5×.
The multiplier is a function of **example density × learner stage**, not a
constant: **[HEURISTIC] 1.0–2.5×, choose within the band by counting the
worked examples in the video**.

**First real calibration point (Gemini video-content review, 30 Aug —
N=2, single reviewer, directional only, not a statistical calibration):**
two Rodha concept videos were watched in full and their actual
note-taking/derivation burden assessed. Percentages, 26m19s stated →
45–55 min estimated genuine consumption (**≈1.7–2.1×**); Arrangements,
20m11s stated → 35–45 min (**≈1.75–2.25×**). Both land in the upper half
of the assumed 1.0–2.5× band, consistent with the theory: neither video is
passive-watchable — both require the student to derive/copy a table or
diagram to actually learn from them, which is exactly the "example-dense,
active" end of the range, not the "passive exposition" end. This is one
data point per topic, not a calibration — but it is the first time the
band's upper-half placement has been checked against a specific real
resource rather than assumed from the general video-pacing literature.

### 2.3 Novice vs practitioner — [EVIDENCE], direction; magnitude ours
The worked-example effect (Sweller; replicated widely): novices learn more,
faster, from studying worked examples than from solving equivalent problems
unaided. The expertise-reversal effect: the same scaffolding becomes
redundant, even harmful, for advanced learners who should be solving.

Two consequences, one about time and one about content:
- Time: a foundation student's per-question effort is a multiple of a
  practising student's — **[HEURISTIC] 1.5–3×** (direction evidence-backed,
  magnitude ours until calibrated).
- Content: for `not_started`/`learning` states, a resource of worked
  examples is pedagogically BETTER than a raw question bank; for
  `practising`+ states the reverse. **Resource fitness depends on learner
  state, not just topic** — this goes into the sufficiency contract.

### 2.4 Review time is learning time — [EVIDENCE]
Retrieval-practice literature (Roediger & Karpicke 2006; Bjork's desirable
difficulties): testing beats re-reading for retention; effortful, slower,
more error-laden practice produces more durable learning, and feedback
after retrieval is where much of the gain lands. Therefore
solution-review + error-analysis time is a first-class effort component —
**[HEURISTIC] adds 30–100% on top of attempt time**, larger for harder
items and for weaker students (who meet more errors, each carrying review
cost).

### 2.5 CAT-specific timing — [ANECDOTAL-GRADE], coaching consensus only
No peer-reviewed CAT timing data exists. Coaching consensus (Careers360,
iQuanta, CATKing and similar): 68 questions / 120 minutes, hard 40-minute
sections; ~2–3 min/question in QA at exam pace with easy≈1–1.5 /
moderate≈2–2.5 / hard≈3–4; DILR is run at the **set** level — 4–5 sets in
40 minutes, and a wrong set choice costs 10–15 minutes before the student
even abandons it. Treat all of this as anchors for TIMED mode only, tagged
anecdotal; exam pace is the FLOOR of effort, not the estimate for learning
mode. **[HEURISTIC] learning-mode effort ≈ 2–3× exam pace.**

---

## 3. The model (Phase 3) — inputs → reasoning → range + confidence

```
effort_estimate = f(
  student_state,      -- §3.1 (7 stages)
  task_intent,        -- §3.2 (9 intents)
  difficulty_band,    -- §3.3 (5 bands, topic-sensitive)
  unit_structure,     -- §3.4 (per-section decomposition)
  modality,           -- video | reading | interactive practice
  timed_mode          -- untimed | self-timed | exam-condition
) → { lower_min, expected_min, upper_min, confidence, assumptions[] }
```

Output is ALWAYS a range plus confidence plus stated assumptions. A point
estimate may be displayed to a student only as the rounded middle of a
range whose width we know.

### 3.1 Student state (7)
Foundation/not-started · Early learning · Guided practice · Independent
practice · Consolidating · Timed practice · Exam-ready. Maps from our
existing 5 coverage statuses + phase, so it needs no new student-facing
input. Effort multiplier vs the practising baseline: **[HEURISTIC]**
foundation 1.5–3×, early 1.3–2×, consolidating 0.8–1×, timed 0.5–0.8×
(exam pace), exam-ready ~0.5× on familiar material. Why: schema
availability (§2.3) — the novice is building the procedure while using it.

### 3.2 Task intent (9)
Concept learning · Worked examples · Guided practice · Independent
practice · Timed practice · Mixed application · Review · Error correction ·
Retrieval/revision. Intent chooses which effort components apply (a timed
set has no pause-and-compare; an error-correction task is ~all review).
"Learn X + solve 10" = concept + guided practice, two components summed —
never the independent-practice rate applied to 10.

### 3.3 Difficulty (5 bands, topic-sensitive)
**Foundation · Easy · Standard-CAT · CAT-hard · Stretch.** Chosen over
easy/medium/hard because CAT preparation has a real discontinuity our
students hit: school-level fluency ≠ CAT-level performance (the
"Khan-Academy-is-not-enough" gap our resource research already found), so
the taxonomy must make "below CAT" (Foundation/Easy) visible as its own
region, and "above standard" (Stretch) must exist so hard banks don't
masquerade as standard. Bands are ANCHORED PER TOPIC — a CAT-hard
Percentages question (≈3–4 exam-min) and a CAT-hard Arrangements set
(≈15+ exam-min) are different absolute magnitudes; the band names the
position within the topic's own distribution, never a cross-topic minute
value.

### 3.4 Unit structure — per-section decomposition

**RC — the passage is two jobs, the questions are a third.**
Components: passage first-pass read (wordcount ÷ state-adjusted wpm from
the §2.1 band) · comprehension/regression (density-dependent, up to ~2× the
first pass on dense abstract prose — [EVIDENCE] directionally) · per
question: read + reason + evidence-lookup + elimination ([HEURISTIC] 1–3
min/question by band and state) · review of explanations ([HEURISTIC]
+30–100%). Recorded passage features: word count, density/abstractness
(subjective 3-point is enough to start), question count and type mix
(factual vs inference-heavy). Word count alone is NOT sufficient —
density can double time at equal length (§2.1).

**QA — the question class carries the effort, not the label "Percentages".**
Percentages effort classes (record which a resource actually contains):
direct calculation · ratio↔percent conversion · successive change ·
reverse/comparison · interaction problems (P&L, SI/CI) · multi-step word
problems · algebraic · DI-style computation. Effort drivers: reasoning
steps, computation burden, representation changes, text length. Bands per
§3.3; separate learning-mode / practice-mode / timed-mode values per §2.5.

**DILR — the set is the unit; question count is secondary.**
Components: set-selection read ([HEURISTIC] 1–3 min) · **setup/modelling
before the first answer** ([HEURISTIC] 3–12+ min by band — this is where
"5 questions × 4 min" collapses as a model) · per-question incremental
effort AFTER setup ([HEURISTIC] 1–4 min) · verification/review. Recorded
set features: type (linear/circular/matrix/hybrid), entities, constraints,
case-branching (the single biggest [HEURISTIC] driver), data volume,
question count. A 4-question set can outweigh a 6-question set; the model
must never be surprised by that.

### 3.5 Modality
Video: stated duration × [1.0–2.5] chosen by worked-example density and
state (§2.2); note that >2× implies the resource should perhaps be split
across days. Reading: §2.1 band + density. Practice: attempt + review per
§2.4. Always output which multiplier/band was chosen and why — the
assumption list is part of the estimate.

### 3.6 The two consumers — never mixed
- **PLANNING** ("how much do I assign today?") keeps using the engine's
  fixed `minutesPerUnit` until calibration data exists. One authority.
- **RESOURCE SUFFICIENCY** ("can this link satisfy this task?") uses this
  model from day one — it's a curation-time judgment, needs no code.
The bridge, when data justifies it, is the engine consuming calibrated
per-(state × topic × band) medians — a future decision, not this document.

---

## 4. Evidence-backed vs heuristic — the honest ledger

| Parameter | Status |
|---|---|
| 238 wpm non-fiction baseline; 175–300 adult range; ESL slower; hard text ≈halves speed | **[EVIDENCE]** |
| 130–220 wpm band for our students on CAT-register prose | [HEURISTIC] (bounded by evidence) |
| Video engagement cliff ~6 min; pausing is real learning behaviour; ≤2× speed low-cost | **[EVIDENCE]** |
| Video multiplier 1.0–2.5× by example density | [HEURISTIC] |
| Novices faster from worked examples; reversal for advanced | **[EVIDENCE]** |
| Novice per-question effort 1.5–3× practitioner | [HEURISTIC] (direction evidenced) |
| Review/error-analysis is learning, not overhead | **[EVIDENCE]** |
| Review adds 30–100% | [HEURISTIC] |
| CAT exam pacing (2–3 min/Q; DILR 4–5 sets/40 min; wrong-set cost 10–15 min) | [ANECDOTAL — coaching consensus] |
| Learning-mode ≈ 2–3× exam pace | [HEURISTIC] |
| DILR setup cost 3–12+ min pre-first-answer | [HEURISTIC] |
| 5-band topic-anchored difficulty taxonomy | [DESIGN CHOICE, argued §3.3] |

Every [HEURISTIC] above is a placeholder for our own calibration data — and
that is the moat. **The formula is copyable in an afternoon; the
student × topic × band × modality × outcome calibration corpus is not.**
Secrecy is not the strategy; accumulated measurement is.

### Calibration signals (theoretical list only — no schema, no analytics design)
Task start/completion timestamps · questions attempted vs completed ·
accuracy · retries · resource open → return interval · resource completion
signal · student-reported difficulty ("harder/about right/easier than
expected" — one tap) · prior topic exposure · coverage state at the time ·
historical personal pace · abandonment events. Each maps to exactly one
heuristic above (e.g. open→return interval calibrates the video
multiplier; attempted-vs-completed under timed mode calibrates exam-pace
anchors; the one-tap difficulty report calibrates band assignment).

---

## 5. Adversarial review (Phase 5) — where this model fails

- **Systematic overestimate:** repeaters and strong students inside a
  `learning` coverage state (state proxy lags ability); passive-watchable
  videos assigned an example-dense multiplier; easy banks under a hard
  band label.
- **Systematic underestimate:** distracted-environment students (all lab
  evidence is focused-attention); very weak readers below the 130 wpm
  floor; DILR sets whose case-branching explodes (branch count is the
  worst-estimated feature); mobile-UX friction (ads, popups) which is in
  no formula — it lives in the curation gates instead.
- **Students it fails:** the tails, by construction — which is why output
  is a range and why the card must never promise a personal minute value
  before calibration exists.
- **Resources that fool it:** "500+ questions" marketing counts (fixed by
  count-yourself rule); banks with inverted difficulty labels (fixed only
  by sampling actual items); a long video that is genuinely MORE efficient
  than five short ones because it carries the worked examples a novice
  needs (fixed by judging example density, not duration); a hard 10-question
  bank that makes a "10 questions" target a 60-minute task, and an easy
  20-question bank that leaves a practising student under-served at 20 —
  both are THE reason sufficiency is judged in effort, not count.
- **The model's own failure mode:** fake precision creep — someone will
  eventually want "22.4 min" on a card. The permanent rule: display
  rounded ranges; narrow them only with observed data, never with more
  arithmetic on the same heuristics.

---

## 6. What changes in the resource-research process (Phase 4)

1. Supply is recorded as **structure**, not count: per resource — units,
   difficulty-band distribution (sampled honestly, or "unknown"), and for
   DILR the set features of §3.4.
2. Sufficiency verdicts are computed as
   `resource supply → expected effort range for the target learner state →
   task requirement`, never `resource count vs task count`.
3. Every estimate ships as lower–upper + confidence + assumptions;
   "could not be reliably assessed" is a permitted and respected answer.
4. Task-card copy inherits the honesty: time shown as a range; counts only
   when counted; difficulty stated when known ("CAT-level", "foundation").
5. The kill-test remains operational, not statistical — the model adds
   honesty to each card, it does not add a metric to Phase 0.

The revised master prompt implementing all of this:
`docs/RESOURCE-RESEARCH-MASTER-PROMPT.md` (v2, same file, rewritten).
