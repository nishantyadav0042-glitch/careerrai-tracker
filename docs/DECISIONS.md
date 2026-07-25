# Architecture Decision Log

Why major decisions were made — not just what changed. One entry per decision,
in the structure every future architecture change must follow:

> Observed production failure → Internal evidence → External evidence →
> Chosen solution → Alternatives rejected → Success metric → Cost of delay →
> **Reversibility**

Reversibility uses the Type 1 / Type 2 distinction (Amazon): Type 2 decisions
are cheap to undo, so act and measure; Type 1 decisions are expensive to undo,
so they get design effort *before* the change, proportional to the cost of
being wrong. The same recommendation gets a different process depending on its
class — a trigger can ship same-day; a taxonomy rewrite cannot.

New entries append below. An entry is written when the decision is made, not
retro-fitted after it has aged into folklore.

---

## ADR-001 · exam_ready is earned from evidence, enforced in the database

- **Date:** 25 Jul 2026 · **Status:** shipped, live-tested in production
- **Failure observed:** 10 topics across 6 students reached `exam_ready`
  through the mandatory weekly review in its first 8 days; a second live path
  existed (green confidence taps, sent automatically by the Home card's Done).
- **Internal evidence:** 11,078 self-declared status rows vs 96 rows of
  recorded work at the time of decision (115 opinions per piece of evidence).
- **External evidence:** self-assessment ↔ measured ability r ≈ 0.29 (Mabe &
  West 1982; Zell & Krizan 2014); weakest performers overrate most (Kruger &
  Dunning 1999); practice testing is the highest-utility signal of learning
  (Dunlosky et al. 2013).
- **Decision:** status is derived from `topic_evidence` (six checks,
  volume AND accuracy). Enforced three layers deep: UI (no chip), API
  (rejects), and the `guard_exam_ready` trigger — the layer no forgotten
  writer can skip. The trigger checks a necessary condition only (evidence
  rows exist); duplicating the full six-check rule in SQL would create the
  second implementation this decision exists to kill.
- **Alternatives rejected:** app-level validation alone (already failed once —
  invariants that N writers must remember fail at writer N+1); full rule in
  SQL (creates a clone of `evidence.ts`).
- **Success metric:** count of exam_ready rows with zero evidence rows = 0,
  permanently, by construction.
- **Reversibility:** **Type 2** (drop trigger + one revert commit). Shipped
  same-day accordingly.

## ADR-002 · One declaration per business enum (`coverage-status.ts`)

- **Failure observed:** the five-status ladder was declared three times, its
  rank array copied twice more; the weekly-review leak was possible partly
  because writers didn't share validation.
- **External evidence:** inconsistent evolution of duplicated logic is a
  leading fault source (Juergens et al., ICSE 2009). Corollary used here:
  duplication that is never changed is cheap — so convergence happens at
  write/change points first, not as a big-bang rewrite.
- **Decision:** leaf module `coverage-status.ts`; all prior declarers
  re-export from it. Same treatment owed next to `Section` enums
  (`'Mock'` vs `'MOCKS'`) and progression ladders.
- **Success metric:** grepping for a literal status-union declaration outside
  the module returns nothing.
- **Reversibility:** **Type 2** (re-inline the type). Shipped same-day.

## ADR-003 · One study day: IST with 3am rollover, boundary placed by our own usage curve

- **Failure observed:** "done today" filtered on UTC midnight while logs and
  streaks used IST-3am; `topic_evidence.logged_for`'s SQL default was a third
  definition (plain IST midnight).
- **Internal evidence (decisive):** 22:00–04:00 is our single busiest block
  (peak opens 22:00; log completion 53–60% after 22:00 vs 20% at 13:00);
  03:00–05:00 is the dead zone (7–23 events/hr). The boundary belongs where
  students aren't. Own-data justification outranks any external streak
  folklore here, deliberately.
- **Decision:** `getLogDateString` (3am IST) is the ONE day function; the SQL
  default now encodes the same rule (`(now IST − 3h)::date`).
- **Success metric:** a log written 01:00–02:59 IST lands on the previous
  study day in every table and every filter, verifiably.
- **Reversibility:** **Type 2**.

## ADR-004 · One required-pace implementation (`computeRequiredPace`)

- **Failure observed:** the Home ring said 4.5h/day while My CAT Plan said
  12h/day (five independent pace derivations); the reschedule warning
  reconstructed remaining hours from a rounded number.
- **Decision:** all pace math flows through `computeRequiredPace`;
  routine-plan's inline clone replaced only after proving output-identical on
  200 randomized cases; pace-card prices new dates from the engine's own
  `remainingHours`.
- **Alternatives rejected:** "fix the clamp in each site" (treats symptom;
  five sites drift again one rounding rule at a time).
- **Success metric:** no student's plan-hours and ring-hours can disagree
  from these code paths; recurrence of the 12h/4.5h class = 0.
- **Reversibility:** **Type 2** (behavior proven identical, so even reverting
  changes nothing observable).

## ADR-005 · Hours: planning estimate now, behavioral estimate later, never blended unlabeled

- **Failure observed:** two static hours models (397h canonical vs 523h
  implied by the section graphs) in one product.
- **External evidence:** the planning fallacy (Kahneman & Tversky; Buehler et
  al. 1994) — both static models are guesses of a kind humans are reliably bad
  at, so perfecting either is wasted effort; Mars Climate Orbiter (1999) for
  what two unreconciled models of one quantity do; Knight Capital (2012) for
  why flag-gated divergent code is armed, not dormant.
- **Decision:** `prep-model.ts` is the only hours source (the *planning
  estimate* — a prior whose job is consistency, not truth). Section graphs are
  evidence requirements, not hours; a drift guard blocks any section engine
  whose implied hours diverge >10% from canonical (all three fail today, by
  design). When enough `topic_evidence` exists, the *behavioral estimate*
  (observed hours-to-rung) arrives as a separately-labeled figure; the
  planning estimate becomes one input to it, never averaged into an unlabeled
  number.
- **Success metric:** exactly one hours total reachable from any student
  surface; drift guard green before any `*_model_enabled` flag flips.
- **Reversibility:** guard **Type 2**; the taxonomy mapping + graph re-costing
  it forces is **Type 1** (canonical topic names propagate into stored rows
  and student history — expensive to undo), so that work gets founder/SME
  design time *before* code, and is deliberately not rushed.

## ADR-006 · Four meters, and no composite score

- **Failure observed:** one ring conflating four constructs ("78% complete"
  read as "know 78% of CAT"). The first replacement then re-created the bug at
  a higher level: a "Preparation Index /100" blending the four meters with
  arbitrary weights (50/20/20/10). Removed within a day of shipping.
- **External evidence:** surrogation — people treat the metric as the
  construct (Choi, Hecht & Tayler); algorithm aversion — one visibly
  indefensible number discounts every honest one (Dietvorst, Simmons & Massey
  2015).
- **Decision:** Coverage, Evidence, Revision, Tested are shown separately;
  **constructs may be compared, never summed** (the coverage-vs-evidence gap
  is the product insight). The headline number is Evidence — the only meter
  built from observed work. Rule recorded in `evidence.ts` and Playbook §3.
- **Alternatives rejected:** keeping the blend with printed weights (printed
  weights don't stop people quoting the number as readiness); making the
  blend "smarter" (no defensible weighting exists without outcome data we
  don't have — 13 mock debriefs total).
- **Success metric:** no single student-facing number aggregates two or more
  of the four constructs; grep for a weighted sum of the meter fields returns
  nothing.
- **Reversibility:** **Type 2** (restore the blend in one commit if the
  founder overrules).

## ADR-007 · One canonical read model for behaviour — not necessarily one table

- **Failure observed:** four behavioural event tables from four eras; a
  `student_events`-only query silently missed 30% of 18,429 events.
- **Decision:** `v_student_activity` is the canonical READ model; every
  analytics question starts there. Multiple physical producers are acceptable
  — at scale that's normal — the architectural invariant is that reads have
  one entry point that cannot undercount. Writer convergence is opportunistic
  (per-deploy, when a writer is being touched anyway), per ADR-002's
  change-point principle. `perf_events` / `expedify_events` stay excluded:
  different bounded contexts, and merging them would be the opposite error.
- **Success metric:** any behavioural count derived outside the view that
  disagrees with the view is a bug by definition; dashboards cite the view.
- **Reversibility:** **Type 2** (drop view).

## ADR-008 · Curriculum selection by collective filtering — anonymous, no counts, safety-only gate

- **Date:** 25 Jul 2026 · **Status:** phase 1 shipped (voting pool seeded)
- **Decision driver:** founder direction after the pipeline research: "Students
  create. Students vote. The system ranks." Manual curation of educational
  quality dies at scale AND misallocates founder time at 244 students; the
  bigger risk today is no community at all.
- **Decision:** exactly two contribution types (tip ≤150 chars; question as a
  photo). One automated pre-publication gate — SAFETY only (explicit content,
  hate, spam, contact info, non-CAT; fail-closed to manual review when AI is
  unavailable). Educational quality is decided by votes phrased as curriculum
  judgements ("Should every CareerRai student solve this?"). 72h voting
  window; one submission per student per day; one tip + one question shown
  per student per day, picked stable-per-day-per-student rather than
  leader-first (rich-get-richer defence, verified spreading across all 10
  slots in test). No vote counts shown to students (herding). Everything
  anonymous under random display names — the goal is helping students, not
  making one student a star.
- **External evidence:** wisdom-of-crowds requires independent judgements —
  visible tallies break independence (herding studies); voters here are
  topic-qualified students, a stronger signal than general crowds. Safety
  gate retained per the platform-abuse record of open study communities.
- **Alternatives rejected:** founder-verified quality (bottleneck +
  paternalism at odds with the identity); public credit/reputation (SO
  toxicity + the star-making the founder explicitly rejected); showing
  leaders first (rich-get-richer).
- **Success metric:** votes/day, % of DAU voting, submissions/week passing
  safety; phase 2 (featured daily rotation) unlocks when the seeded pool has
  enough votes to rank top 10 questions + top 10 tips credibly.
- **Reversibility:** **Type 2** throughout (cards and pool can be withdrawn
  in one commit; votes table is additive).
