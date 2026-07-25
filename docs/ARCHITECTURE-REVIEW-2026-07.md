# Architecture Governance Review — 26 Jul 2026

*Four parallel evidence audits (duplication · dependency health · layer
violations · event/notification ownership) over 560 modules, followed by one
behavior-preserving convergence wave. Every claim below carries file:line
evidence in the audit transcripts; nothing was changed without proof.*

## Executive summary

The dependency architecture is **fundamentally healthy** — zero runtime
circular dependencies in 560 modules (madge, verified before and after), one
type-only layering leak in 77+ lib modules, clean zero-import leaf engines.
The debt is not direction but **duplication and cohesion**: the audit found
**17 true duplicate implementations of business concepts, 7 of which had
already diverged** into live inconsistencies, plus 4 god files fusing logic
with I/O, a partially-fictional push-budget cap, and an unregistered
free-form event namespace.

This wave eliminated 11 of the 17 duplicates and fixed 2 live bugs — all
provably behavior-preserving (or restoring stated intent before the
divergence could fire). The remaining 6, plus every behavior-affecting fix,
are catalogued below with Product Cost of Delay and reversibility class,
awaiting founder decision.

## Domain ownership map (the SSOT registry)

| Business concept | Owner (the only implementation) | Allowed writers |
|---|---|---|
| Coverage ladder (type/order/labels/guards) | `lib/coverage-status.ts` | — |
| Coverage status writes | `/api/coverage`, `/api/coverage/weekly-review`, evidence route, confidence signals | DB trigger `guard_exam_ready` backstops all |
| Evidence rungs + derived status | `lib/evidence.ts` | `/api/evidence` only |
| Hours (planning estimate) | `lib/prep-model.ts` | — (behavioral estimate arrives later, separately labeled) |
| Required pace | `lib/study-pace.ts` `computeRequiredPace` | — |
| Weakest section | `lib/section-weakness.ts` *(new)* | — |
| Study day (3am IST) | `lib/streak-utils.ts` `getLogDateString` | — |
| Challenge day (8am IST) | `lib/challenge.ts` `activeChallengeDate` | — |
| Home display slots | `lib/day-slot.ts` | — |
| CAT exam date/cycles | `lib/routine-engine.ts` + `lib/cat-cycle.ts` | — |
| Topics taxonomy | `lib/topics-constants.ts` | — |
| Community pipeline (limits, bars, grading) | `lib/community-pipeline.ts` | submit route + admin routes |
| Community safety | `lib/community-safety.ts` | submit route only |
| Admin route gate | `lib/require-admin.ts` `requireAdminCtx` | — |
| Client event tracking | `lib/journey.ts` (autocapture layers on it) | ingest route only *(4 raw-insert violations remain — see backlog)* |
| Push primitive | `lib/push.ts` `sendPushToUser` | *(policy layer `dispatch()` bypassed by 16 callers — see backlog)* |

**Folder policy decision:** physical reorganisation into domain folders is
**deferred deliberately**. `src/lib` is flat but the ownership table above is
what a domain folder structure exists to encode, and moving ~80 files is a
500-file diff with import churn and zero behavior value at 244 students — the
opposite of the small-reversible-deploy rule. Adopted rule instead: *a file
moves into a domain folder when it is next substantively edited* (Type 2,
gradual, each move a one-file diff).

## Changed this wave (all verified behavior-preserving)

| File | Why |
|---|---|
| `lib/section-weakness.ts` *(new)* | The weakest-section rule existed 3× byte-identical (one copy apologised for itself in a comment); now once. |
| `lib/companion.ts` | Deleted its copy; re-exports the shared rule. |
| `api/routine/today/route.ts` | Deleted its copy; pace block now calls `computeRequiredPace` (output-identity proven on 200 randomized cases when this formula was first converged). |
| `lib/routine-plan.ts` | Deleted its copy; **bug fix**: restored the `revisionSeason` argument its mirror had silently dropped — from 1 Sept the cron would have named different topics than the real plan. Fixed before it could ever fire (today `revisionSeason=false` for all students, so zero live change). |
| `api/next-action/ack/route.ts` | **Bug fix**: UTC day boundary → the same IST-3am boundary as the GET it serves; between 3:00–5:30am the ack was targeting rows the GET had excluded. |
| `api/student/post-signup/route.ts` | Last inline pace copy → `computeRequiredPace` (identical arithmetic; the 1..12 clamp stays, now visibly separate). |
| `lib/evidence.ts` | `STATUS_RANK` now IS `STATUS_ORDER` (was an independent literal; a 6th rung added to one would have let `mergeStatus` silently demote students). |
| `lib/coverage-validate.ts` | `VALID_STATUSES` derived from the canonical ladder instead of re-declared. |
| `lib/study-pace.ts` | `totalSyllabusHours` now imported from prep-model — one summation (they agreed only because every estimate is an integer). |
| `lib/routine-engine.ts` | `Section` type re-exported from prep-model — one union. |
| `lib/streak-utils.ts` | Deleted dead `CAT_EXAM_DATE` constant (correct for 2026 only, zero importers, a trap for the first engineer who found the constant before the function). |
| `lib/challenge.ts` | Deleted dead `MAX_SUBMISSIONS_PER_DAY = 3` (the live rule is 1, in community-pipeline; same name, different value, one autocomplete away from tripling the spam limit). |
| `lib/community-pipeline.ts` | Gained `MAX_IMAGE_BYTES`/`IMAGE_MIMES` (client+server now share the upload contract) and `gradeSubmission` (the one graduation rule). |
| `api/community/submit/route.ts`, `components/community-submit.tsx` | Import the shared upload contract. |
| `api/admin/daily-pick-stats/route.ts`, `api/admin/challenges/route.ts` | Both rank the voting pool via `gradeSubmission` — previously one sorted by net votes, the other by the bars, so two admin screens disagreed about the same queue. |
| `lib/require-admin.ts` + 5 admin routes | `requireAdminCtx` replaces five byte-identical local `requireAdmin` copies (challenges, daily-pick-stats, payouts, coupons, allowlist). |

## Verification evidence (checks actually performed)

- ✓ `npx tsc --noEmit` clean after every batch
- ✓ `eslint` on all 20 changed files: 0 errors, 0 warnings
- ✓ `npm run build` clean
- ✓ `madge --circular` (560 modules): 0 cycles before, 0 after
- ✓ Anonymous smoke: `/app` 200, `/start` 200, all touched APIs 401/gated exactly as before
- ✓ Zero database schema changes in this wave; zero migrations
- ✓ Pace formula equivalence: proven previously on 200 randomized inputs; both new call-sites use the identical expression path
- ✓ `revisionSeason` restoration verified inert today (1 Sept boundary not yet reached for any attempt year)
- ✓ Dead-export deletions preceded by importer greps returning zero consumers

**NOT verified (requires manual/production QA):** logged-in walkthrough of
routine generation and post-signup rescheduling on a real account; admin
screens rendered with a real admin session; production behavior of the ack
boundary at 3:00–5:30am IST.

## Remaining findings — the decision backlog

Ranked by Business Impact × Engineering Risk × Ease of Fix. R = reversibility.

**CRITICAL**
1. **Push budget cap is partially fictional** *(behavior fix — needs founder approval because enforcing it will suppress pushes that currently send)*. The 10/day cap counts `pushed_at IS NOT NULL`, but only 6 of 16 push call-sites stamp it; chat, buddy nudges, log reactions and broadcasts are invisible to the counter, and `notification-health` under-reports for the same reason. The push.ts comment claims the opposite. Migration: make `sendPushToUser` itself record every send (new column or stamped row), then re-enable the cap over the complete count. R: Type 2. *Blocked on the standing "don't touch notifications" instruction.*
2. **Task-volume rule diverged and wrong** (`swap-topic` route + `TodaysRoutineCard` both use flat `minutes/3` → "Solve 15 Reading Comprehension questions"; the engine's `taskVolume` is unit- and phase-aware and would say "3 RC passages"). Fix changes visible task text → approval needed. R: Type 2.

**HIGH**
3. **UTC "today" keys at 7 sites** (brain-break rate limit, mastery-state plan_date ×2, daily-modal lock, insight bubbles ×2, mission-queue send cap) — each resets at 5:30am IST instead of 3am, inside the documented peak-usage window. Brain-break/mastery/modal/bubble fixes are safe; **mission-queue is notification-adjacent** (same standing block as #1). R: Type 2 each.
4. **No event-name registry**: 58 free-form `track()` names, with confirmed double-counting (`coverage_reviewed` fires client AND server for one action → all counts 2×) and split names (`timetable_saved`/`timetable_confirmed`; three payment-failure names inconsistent across the two paywalls). Fix: a typed `EVENT_NAMES` union + delete the server-side duplicate emit. R: Type 2, but **do it before any growth push** — every funnel number built on these events inherits the double-count.
5. **12 inline admin-gate variants remain** (three genuinely divergent: mentor-doors 403-only, scholarships' third auth path, bulk-import leaking DB error text). Converge onto `requireAdminCtx` one route per deploy. R: Type 2.

**MEDIUM**
6. **Status labels visibly disagree** ("Practising" vs "Practicing" vs "Practicing questions" across four maps) — copy decision is the founder's, then one-line convergence. R: Type 2.
7. **`detectBrowser`/`detectPlatform` two taxonomies** — analytics files iPads under `desktop`, install flow says `ipados`; "iPad install conversion" is currently unmeasurable. Converging changes analytics vocabulary → coordinate with any dashboards first. R: Type 2 (but data series break at the seam).
8. **Big-route decomposition**: `routine/today` (585 lines, 11 engines) and `log-daily` (454 lines, 4 notification paths + an inline "prescriptive engine") — extract per the audit's map when next touched. R: Type 2.
9. **`VALID_SECTIONS` name collision** (log categories vs coverage sections vs exam sections — three concepts, one name; `'Mock'` vs `'MOCKS'`) — rename exports, compiler finds the 6 call sites. R: Type 2.
10. **`utils.ts` `calcStreak`/`getTodayIST`** — zero importers found, midnight-boundary variants of streak logic; recommend deletion next wave after one more dynamic-reference sweep. R: Type 2.

**LOW** — sales-stats formula pair (currently agrees), `TOPICS_BY_SECTION`
declarations (single-source derived, cannot disagree in content), display-order
section arrays (deliberate), `urgency-score.ts` pure/UI/DB split,
`use-install.ts` living under lib/, `chat.ts` type import from components.

## The 1-million-students / 100-engineers question

What would bottleneck first, with evidence:

1. **The free-form event namespace** (58 names, no registry, double-counts
   already present at 244 students). At 100 engineers, event names become
   write-only noise and every dashboard is unauditable. Cheapest permanent
   fix available today.
2. **`routine/today` as an 11-engine, 585-line route**: the hot path every
   student hits, unfactored — 100 engineers cannot work in one file, and its
   private helpers are why mirrors (routine-plan) had to copy-and-drift.
3. **Notification policy bypass**: 16 direct push callers and 24 raw in-app
   inserts mean any future rule (quiet hours, per-category budgets,
   user-level mute) must be added in ~40 places. The `dispatch()` layer
   exists; making it the only door is organizational leverage.
4. **Single Supabase instance with service-role fan-out in routes**: fine for
   years at this scale; the repository-layer discipline (lib files that take
   a client vs create one) is already half-adopted and should be finished
   before any read-replica or caching story is possible.
5. **What will NOT bottleneck**: dependency direction (already clean), the
   SSOT core (owners table above), the DB-trigger integrity spine — these
   scale as-is.

## One-sprint founder recommendation

Spend it on: **(a)** the event registry + double-count fix (analytics
trustworthiness compounds into every future decision), **(b)** the push-cap
truth fix (with your explicit approval, since it suppresses over-budget
sends), **(c)** task-volume convergence (visible correctness bug in the swap
flow), **(d)** finishing the admin-gate consolidation. Skip folder moves,
skip decomposing the big routes until a feature forces you into them.
