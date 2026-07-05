# Product vision notes — read before any big architecture change

Distilled from co-founder strategy docs (2026-07-05). These are north-star
principles to check new work against, not a build spec. Do not treat this as
license to start a rewrite — see "what's premature" below.

## The core principle worth keeping

CareerRai should compute state from events, not overwrite state directly.
Real proof this matters: `daily_reports` + the `upsert_log_and_streak` RPC
overwrite `study_duration`/`topics_covered`/`mock_taken` unconditionally on
every call. A routine-task completion calling that RPC could silently erase
a student's real logged mock — a real bug, fixed by merging before upsert
(see `src/app/api/routine/complete-task/route.ts`). That's the
event-sourcing argument made concrete, not hypothetical.

Practical rule going forward: **new mutable state should default to
append-only** (like `routine_task_completions` and `mock_debriefs` already
are) unless there's a specific reason to overwrite. Don't retrofit the
already-live mutable tables (`daily_reports`, `streak_data`) into an event
log preemptively — only revisit them if we hit another merge-bug-class
issue.

## What's already real (don't rebuild)

- **Signal engine** — `src/lib/buddy-briefing.ts` already aggregates streak,
  hours, stress, confidence, mock error-buckets into a factual,
  AI-drafted/human-reviewed buddy briefing.
- **Explainability / "trust engine"** — `routine-engine.ts`'s `reason` field
  on every task + `personalizationSummary()`'s "why" line already do this.
  It's a discipline (always cite the real signal behind a recommendation),
  not a subsystem that needs to be built.
- **"Never ask twice"** — `self_reported_weakest_section` /
  `self_reported_weak_topic` persist and gate future onboarding prompts
  (`needsSetup` in `src/app/api/routine/today/route.ts`).
- **External mock intake** — `mock_debriefs` already stores percentile,
  section scores, error buckets per mock, regardless of where the mock was
  taken.
- **A rudimentary "mission"** — the routine card already elevates exactly
  one priority task with distinct styling (`isImplementationIntention`).

## What's premature — don't build without new, real data first

- **FSRS spaced repetition.** Requires a bank of gradable review items +
  per-attempt recall grading, which doesn't exist (no `questions` table, no
  correctness log). Also arguably the wrong model for CAT — FSRS is tuned
  for memorization (vocab/facts); QA/DILR/VARC are reasoning-skill domains,
  where "days since last practiced" (already in the engine) is more honest
  than a memory-decay curve.
- **Full Knowledge Graph** (Student→Resource→Topic→Question→Mistake→
  Concept→Revision→Mock→Buddy→Routine). Describes a mature platform's data
  model, not a next sprint. When in doubt, reuse the flat topic list in
  `topics-constants.ts` rather than invent graph structure.
- **10-state "Preparation State Engine"** as a formal rewrite. The states
  worth having already exist in lightweight form scattered across real
  tables; don't consolidate them into a new mega-schema speculatively.

## One real next idea worth a look later

Let an override (unanalyzed mock pending, revision debt) promote above the
default weakest-section priority task, instead of the priority task always
defaulting to weakest-section. Small conditional in `generateRoutine()`,
not new infrastructure.

## Watch for fabricated precision in AI-generated strategy docs

Docs like these routinely invent specific-sounding stats with no citation
(e.g. "24% Day 2 retention increase"). Treat every uncited percentage as
illustrative, not fact. The bar for "this is real": a citable source, like
Gollwitzer's implementation-intentions research or the Wang/Wang/Gai 2021
meta-analysis actually used in `routine-engine.ts`.
