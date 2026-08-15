# Instant Insight / Weakness System — Forensic Teardown

**Read-only audit. Nothing in this document has been implemented. No code was modified.**
Prepared 15 Aug 2026, in response to the founder's screenshot of the `/start` "We found something in your prep" screen surfacing a QA finding against a VARC self-report.

Every claim below is labeled **FACT** (cited to file + line, verified by direct reading of the current working tree), **INFERENCE** (a reasonable read of intent not provable from code alone), or **UNKNOWN** (cannot be determined from the code in this repo). Nothing is filled in by assumption.

---

## PART A — Executive System Map

```
Student
  │
  ├─▶ screen-weakest-section.tsx   "Which section costs you the most marks?"
  │     writes: self_reported_weakest_section ('VARC'|'DILR'|'QA'|null)
  │     → held in funnel state only, not yet sent anywhere
  │
  ├─▶ screen-topic-coverage.tsx    53-topic tap grid
  │     writes: topic_matrix ({section,topic,status}[]) → funnel state only
  │
  ├─▶ screen-instant-insight.tsx   "We found something in your prep"
  │     reads: topic_matrix, ambitionDate, selfStudyHours, isRepeater, lastYearPercentile
  │     DOES NOT READ: self_reported_weakest_section  ◀── THE BREAK
  │     │
  │     └─▶ computePrepInsight()  (src/lib/prep-insight-engine.ts)
  │           ├─ weakest = gap-sorted CORE_SECTIONS   (matrix-only, no self-report)
  │           ├─ findFoundationGap()                  (matrix-only, no self-report,
  │           │                                          scans ALL 3 sections at once)
  │           └─ → cards[], strength, sectionCoverage[]
  │
  ├─▶ [Build my plan around this] button
  │     onNext() — NO PAYLOAD. The insight object is discarded here.
  │
  ├─▶ screen-login-build.tsx → POST /api/auth/verify-phone-otp
  │     THIS is where self_reported_weakest_section and topic_matrix are
  │     finally persisted to `profiles` / `topic_coverage` — one screen
  │     AFTER the insight was already shown and already forgotten.
  │
  └─▶ (later, every day) resolveFocusSections()  (src/lib/focus-sections.ts)
        mock → self_reported_weakest_section → baseline_* → coverage-gap → 'DILR'
        → THIS is what actually decides the student's daily study plan,
          and it DOES respect the self-report, at high priority.
```

**The headline fact of this whole audit:** the one-time pre-signup "WOW" screen and the actual every-day study plan are two completely separate engines. The real plan gets the self-report right. The WOW screen — the single highest-trust moment in the funnel — doesn't read it at all.

---

## PART B — File-by-File Map

| File | Function | Responsibility | Input | Output | Used by |
|---|---|---|---|---|---|
| `src/app/student/onboarding/screens/screen-weakest-section.tsx` | `ScreenWeakestSection` | Collect the one-tap self-report | tap | `{self_reported_weakest_section}` | `/start/page.tsx`, `onboarding-modal.tsx` |
| `src/app/student/onboarding/screens/screen-topic-coverage.tsx` | `handleNext` | Collect 53-topic grid | taps | `topic_matrix` (deferSave) or persists directly | `/start/page.tsx`, `onboarding-modal.tsx` |
| `src/app/start/page.tsx` | `StartPageInner` | Pre-auth funnel orchestration | screen answers | `data` state object | itself, `screen-login-build.tsx` |
| `src/app/start/screens/screen-instant-insight.tsx` | `ScreenInstantInsight` | Render the WOW screen | matrix + 4 other fields (no self-report) | JSX | rendered once, in `/start/page.tsx` only |
| `src/lib/prep-insight-engine.ts` | `computePrepInsight` | Compute the diagnosis | `PrepInsightInput` (no self-report field exists in the type) | `PrepInsightResult` | `screen-instant-insight.tsx` — sole caller |
| `src/app/start/screens/screen-login-build.tsx` | signup submit | Create account | `data` (incl. both fields) | `POST /api/auth/verify-phone-otp` | end of `/start` funnel |
| `src/app/api/auth/verify-phone-otp/route.ts` | `POST` | Persist onboarding to DB | request body `onboarding` | `profiles` update, `topic_coverage` upsert | signup |
| `src/lib/focus-sections.ts` | `resolveFocusSections` | **The real, canonical daily weakest-section decision** | `profile`, `coverageRows`, `debriefRows`, `today` | `{weakest, strongest, ...}` | `plan-day.ts` (→ both `daily_routines` writers), `next-action`, `plan/full` |
| `src/lib/section-weakness.ts` | `weakestFromCoverage` | Coverage-only fallback, rank 4 of 5 | `topic_coverage` rows | weakest section | `focus-sections.ts` only |
| `src/app/api/routine/add-block/route.ts` | `POST` | Ad-hoc extra block | raw `self_reported_weakest_section` | section for the block | bypasses `resolveFocusSections` entirely |
| `src/app/api/sessions/book/route.ts` / `src/lib/session-credit.ts` | `matchMentor` | Paid-session mentor assignment | raw `self_reported_weakest_section`, mentor's `own_weakest_section`/`strongest_section` | mentor score | bypasses `resolveFocusSections` |
| `src/lib/buddy-match.ts` | `weakestSection` | Buddy recommendation ranking | `baseline_varc/dilr/qa` only | ranked buddy list | `student/profile/page.tsx` |
| `src/lib/student-brief.ts` | brief builder | Outbound sales-call AI brief | `topic_coverage` %-covered | ranked sections | Expedify sales calls |

---

## PART C — Data Flow, Field by Field

### `self_reported_weakest_section`

| Stage | File : Line | Detail |
|---|---|---|
| Collect | `screen-weakest-section.tsx:34,68` | `onNext({ self_reported_weakest_section: 'VARC'\|'DILR'\|'QA'\|null })`. "Not sure yet" submits `null` — a real answer, not a skip. |
| Pass-through (pre-auth) | `start/page.tsx:236-238, 295` | Merged into funnel `data` state; carried to `screen-login-build.tsx` as the `onboarding` prop. |
| Send | `screen-login-build.tsx:84-88` | `fetch('/api/auth/verify-phone-otp', {body: JSON.stringify({...onboarding})})` |
| Persist (pre-auth) | `verify-phone-otp/route.ts:359-369, 406-407` | Whitelisted to `'VARC'\|'DILR'\|'QA'\|null`, presence-keyed (so `null` survives), `admin.from('profiles').update(...)` |
| Collect + persist (post-login, independent path) | `onboarding-modal.tsx:14,187,403-416` | Same screen component, but writes via a **direct client-side Supabase `.update()`** — not through `verify-phone-otp` at all. Two separately-coded write paths to the same column. |
| **NOT READ** | `screen-instant-insight.tsx:128-133` | Props passed to `ScreenInstantInsight` are `matrix, isRepeater, ambitionDate, selfStudyHours, lastYearPercentile` only. |
| **NOT DECLARED** | `prep-insight-engine.ts:120-129` (`PrepInsightInput`) | The type has no slot for it. This isn't one missed prop wire — the engine's input contract never had a place for the field to go. |
| Consume — real decision | `focus-sections.ts:97` | Rank 2 of 5 in `resolveFocusSections` — **this is what actually runs every day.** |
| Consume — real decision (bypass #1) | `routine/add-block/route.ts:48,62,77` | Raw column, `?? 'DILR'`, skips mock/baseline/coverage fallbacks entirely. |
| Consume — real decision (bypass #2) | `sessions/book/route.ts:97-103` → `session-credit.ts:152,158` | +30/+20 points in paid-mentor matching. |
| Consume — narrative only | `blueprint/route.ts:67,226,253,292` | Feeds text generation, not scheduling. |
| Display-only | `buddy-case-data.ts:131`, `peer-cohort-data.ts:105`, `students/[id]/page.tsx:289`, admin CSV export | Read, shown, nothing decided. |
| Dead-end | `students/[id]/prep-snapshot.ts:15` | Fetched into a shared object; neither of its two consumers ever reads it back out. |
| DB column | `profiles.self_reported_weakest_section`, confirmed `__fixtures__/profiles-columns.json:107` | No migration file in `supabase/migrations/` (119 files searched) contains the column name — **UNKNOWN** which migration added it, or whether it predates the tracked migration history. |

**Why was it collected if the diagnosis engine doesn't use it?** FACT: it demonstrably IS used — by the real daily plan, by mentor matching, by peer-cohort selection. INFERENCE, not proven by any comment in the code: the Instant Insight screen (13 Aug) and the weakest-section question (14 Aug, one day later) were built a day apart, and the founder's own comment in `screen-weakest-section.tsx:6-19` frames it as closing a gap in `resolveFocusSections`'s chain specifically ("78 of 326 students... fell all the way through to the hard-coded DILR default") — there is no comment anywhere suggesting the Instant Insight screen was meant to consume it too. The most defensible reading: the field was built for the real plan, and nobody revisited the WOW screen (built a day earlier, on a different subsystem) to wire it in. Nothing in the code proves intent either way beyond that.

### `topic_matrix`

| Stage | File : Line | Detail |
|---|---|---|
| Collect | `screen-topic-coverage.tsx` (draft mirroring `194-201`, fork at `276-339`) | Every tap is local state (`setStatuses`) + a resumable localStorage draft. On the final step: if `deferSave` is true, calls `onMatrixReady(matrix)` and returns (**no network call**); if false, `POST /api/coverage` immediately. |
| Pre-auth path | `start/page.tsx:247` | `deferSave` set, `onMatrixReady` fires → `data.topic_matrix` |
| Persist (pre-auth, deferred to signup) | `verify-phone-otp/route.ts:403,412,414-437` | Validated via `coverage-validate.ts`; already-covered topics get their `topic_coverage.updated_at` spread across an 18-day window (not stamped "now") so revision doesn't flood day 1; `onboarding_completed=true` is set only AFTER the upsert succeeds (a documented 14 July ordering-bug fix). |
| Persist (post-login, immediate) | `api/coverage/route.ts:63-106` | `upsert` on `(student_id, section, topic)`. |
| DB table | `topic_coverage` (`student_id, section, topic, status, updated_at, is_priority`) | |
| Consume — Instant Insight (one-time only) | `prep-insight-engine.ts` | Sole caller: `screen-instant-insight.tsx:130`. No cron, no dashboard card, no other file calls `computePrepInsight`. |
| Consume — real daily plan | `focus-sections.ts`, `plan-day.ts`, `routine-plan.ts`, `next-action`, `plan/full`, `routine/today` | Independent of the Instant Insight engine entirely — reads `topic_coverage` fresh each time, runs its own math (`weakestFromCoverage` in `section-weakness.ts:19-31`). |

**No persistence of the insight itself.** The `cards`/`strength`/`sectionCoverage` object `computePrepInsight` returns is never written anywhere and never tracked via `trackFunnel`/analytics (confirmed: no `track(...)` call exists in `screen-instant-insight.tsx`, unlike the weakest-section and topic-coverage screens, which do call `track()`). There is no record anywhere of which insight a given student actually saw.

---

## PART D — The 53-Topic Matrix, Exactly

Schema (`src/lib/topics-constants.ts:139-146`):
```ts
interface TopicMetadata {
  section: 'VARC' | 'DILR' | 'QA';
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimatedHours: number;
  weightage: 1 | 2 | 3 | 4 | 5;       // relative emphasis WITHIN its own section
  revisionFrequencyDays: number;
  sequenceRank: number;                // order within section, 1 = earliest
  prerequisites: string[];             // topic keys, SAME SECTION ONLY
}
```

**Status ladder** (`coverage-status.ts:16`): `'not_started' | 'learning' | 'practicing' | 'revising' | 'exam_ready'` — one canonical ladder, imported everywhere (the file's own comment documents this replaced five independent copies after a incident where one of them silently dropped `exam_ready`).

- `isCovered()` = rank ≥ `'practicing'`. "Covered" means tapped through at least once, not mastered.
- `exam_ready` is earned only from evidence (`evidence.ts`'s six checks) — **never self-assignable** in onboarding. The matrix `computePrepInsight` receives can, in practice, never contain `exam_ready` at signup time.
- **Missing data defaults to `not_started`.** `remainingSyllabusHours` (`study-pace.ts:100`) explicitly does `statusByTopic.get(topic) ?? 'not_started'`; `computePrepInsight` filters the incoming matrix to rows carrying `TOPIC_METADATA`, so an absent row simply isn't counted rather than being treated as covered.
- Production writer confirms the same default: `screen-topic-coverage.tsx`'s final-step matrix build defaults any untapped unit to `'not_started'` — though a redirect-to-first-incomplete-step check makes that fallback effectively unreachable in the current UI flow.

**Prerequisites are explicitly intra-section only** (comment, `topics-constants.ts:135`: "topic keys within the same section"). A QA topic's prerequisite chain can never resolve into VARC or DILR. This matters for Part F: the cross-section contamination in the founder's screenshot is NOT prerequisites crossing sections — it's `findFoundationGap` scanning candidate topics across all three sections' active work before picking one, irrespective of which section the student named.

**Weightage is explicitly editorial, not measured.** Comment, `topics-constants.ts:121-126`: "a defensible first-pass ranking... editable content a subject-matter reviewer should refine, NOT measured data or the output of any study. Treat any specific number here as a starting estimate, never as a cited fact." This is load-bearing for Part I: coverage-gap math built on `weightage` is opinion-weighted, not evidence-weighted.

**Cycles:** `deepestUnmetPrereq` (`prep-insight-engine.ts:231-251`) guards with a `seen: Set<string>` — cycle-safe by construction, terminates on a malformed circular edge rather than recursing infinitely. Whether the *data* as authored actually contains a cycle: **UNKNOWN** — not checked in this audit, and the code defends against it regardless.

**Prerequisite depth is dynamically calculated**, not hard-coded — walked live per request via recursive descent (`prep-insight-engine.ts:231-251`).

---

## PART E — "Weakest Section," Exactly (the Instant Insight version)

`prep-insight-engine.ts:178-196` (`buildSectionStats`), `:769-771`:

```
for each CORE_SECTION in [QA, VARC, DILR]:
  entries    = matrix rows in this section (that carry TOPIC_METADATA)
  finished   = entries where isCovered(status)        # practicing/revising/exam_ready
  learning   = entries where status === 'learning'
  untouched  = entries where status === 'not_started'
  weightTotal     = Σ weightage(entries)
  weightDone      = Σ weightage(finished)
  weightLearning  = Σ weightage(learning)
  weightUntouched = Σ weightage(untouched)
  gap = (weightUntouched × 2 + weightLearning) / (weightTotal × 2)     [0 if weightTotal = 0]

sorted = sections sorted by gap DESC, ties broken by TIE_ORDER = {DILR:0, QA:1, VARC:2} ASC
weakest   = sorted[0]
strongest = sorted[last]
```

- **Variables feeding the formula:** only `TOPIC_METADATA[topic].weightage` and the tapped `status`. No self-report, no performance/mock data, no topic count directly (though weightage totals correlate with topic count since sections have different numbers of topics).
- **Section-size bias:** the formula is weight-normalized (divided by `weightTotal`), so raw topic count doesn't directly bias it — but per-topic weightage (editorial opinion, per Part D) does.
- **Untouched vs. learning weighting:** untouched counts double (`×2`) against learning (`×1`) in the numerator — untouched topics dominate the gap score more than half-learned ones.
- **Deterministic:** yes, pure function of the matrix.
- **Tie-break bias, worth flagging:** on an exact three-way gap tie, DILR is chosen "weakest" and VARC is chosen "strongest" every time (ascending `TIE_ORDER`) — VARC can structurally never win "weakest" on a tie, and DILR can never win "strongest" on one. Real-world frequency of exact ties: **UNKNOWN**, likely rare given continuous weightage sums, but the bias is real and citable.
- **Self-report participation:** none. **Actual performance data (mock scores) participation:** none — this calculation is entirely separate from `mockInformedFocus`, which exists only in `focus-sections.ts` for the real daily plan.

### Three worked examples

All three use a simplified illustrative subset of each section's real `TOPIC_METADATA` weightages (not a live production matrix) — arithmetic is exact, topic selection is illustrative.

**Example A — student says VARC weak.**
VARC entries used: RC(w5,learning), Para Jumbles(w3,learning), Para Summary(w3,not_started), Odd One Out(w2,not_started), Sentence Completion(w2,practicing), Vocabulary(w1,not_started), Grammar(w1,not_started), Editorial Reading(w4,not_started), Reading Speed Practice(w3,not_started).
`weightTotal=24, weightUntouched=14, weightLearning=8` → `gap = (14×2+8)/48 = 36/48 = 0.75`.
QA entries: student has been diligent — most topics `practicing`/`revising`, `weightTotal≈70, weightUntouched≈6, weightLearning≈4` → `gap ≈ 16/140 ≈ 0.11`.
**Engine output: `weakest = VARC` (0.75 > 0.11) — in this constructed case the algorithm and the self-report agree.** But `findFoundationGap` (see below) runs independently over ALL sections' active topics regardless of which one "wins" `weakest` — if the student also has, say, Functions in `practicing` with Linear Equations untouched two levels down, `detectFoundation` can still surface a QA finding as the HERO card, because `dedupeByRootCause`'s ranking (severity×confidence×nonObvious) can rank the foundation gap above the imbalance card even when the imbalance card correctly named VARC. This is the exact contradiction the founder's screenshot showed.

**Example B — student says QA weak.**
Suppose QA genuinely has the largest gap (heavy `not_started` coverage) and VARC/DILR are both well-covered. `weakest = QA`. If `findFoundationGap` also surfaces a QA chain (e.g. Functions active, Linear Equations untouched), **both mechanisms now agree with the self-report and with each other** — this is the "strong" case in Part I's framework: student belief, coverage evidence, and foundation evidence all point the same way.

**Example C — student says DILR weak.**
DILR has only 9 topics in `TOPIC_METADATA` (`topics-constants.ts:165-173`) vs QA's larger set — fewer, generally higher-weightage entries (Tables w4, Charts w4, Arrangements w5, Hybrid DILR Sets w4). A student who has tapped even 2-3 DILR topics as `not_started` swings `gap` sharply because `weightTotal` is small — DILR's gap score is more volatile per-tap than QA's. If the self-report says DILR but the student's real activity concentration is in Functions/Linear Equations (QA), the same VARC-vs-QA mismatch from the founder's screenshot reproduces identically for DILR-vs-QA.

---

## PART F — `findFoundationGap`, Exactly (why "Functions → Linear Equations, 2 levels beneath it" fired)

`prep-insight-engine.ts:229-270`.

```
deepestUnmetPrereq(matrix, topic, seen, depth):
  if topic in seen: return null
  seen.add(topic)
  for prereq in TOPIC_METADATA[topic].prerequisites:
    if prereq has no metadata: skip
    unmet = status(prereq) is null OR 'not_started'
    deeper = deepestUnmetPrereq(matrix, prereq, seen, depth+1)   # descend FIRST
    best = deeper if deeper.depth > best.depth else best
    best = {prereq, depth+1} if unmet and depth+1 > best.depth else best
  return best

findFoundationGap(bySection, matrix):
  candidates = []
  for section in bySection:
    for topic in section.finished ∪ section.learning:      # ALL 3 sections, no restriction
      found = deepestUnmetPrereq(matrix, topic, {}, 0)
      if found: candidates.push({topic, status, root: found.prereq, depth: found.depth})
  rank(c) = max(statusRank(c.status), 1) × 10 + c.depth
  return candidates.sorted by rank DESC [0]     # most-advanced topic, then deepest chain
```

**Exact chain that produced the founder's screenshot** (`topics-constants.ts:188-190`):
```
Functions.prerequisites          = ['Quadratic Equations']
Quadratic Equations.prerequisites = ['Linear Equations']
```
If a student has `Functions: 'practicing'` (or `'revising'`) and `Linear Equations: 'not_started'`, while `Quadratic Equations` itself is at or above `'learning'` (i.e. not itself flagged unmet), `deepestUnmetPrereq` descends Functions → Quadratic Equations (met, not a candidate) → Linear Equations (unmet, depth 2) and returns `{root: 'Linear Equations', depth: 2}`. That is depth 2 exactly matching "2 levels beneath it." This is a real, correctly-computed prerequisite gap — the algorithm is not buggy on its own terms.

**Section-awareness: none.** The candidate loop iterates `bySection` (all three sections) and pools every finished/learning topic from all of them into one flat `candidates` list before ranking — there is no per-section grouping, no filter, and no parameter anywhere in the function signature for "restrict to section X." **One section's active topic absolutely can, and by design does, produce an insight framed around a completely different section** — this is not a side effect, it's the literal behavior of scanning `bySection` without restriction.

**Does student-selected weakest section affect it? No** — confirmed by the type signature: `findFoundationGap(bySection: SectionStats[], matrix: MatrixEntry[])` takes no self-report input, and none exists anywhere in the call chain up to `computePrepInsight`.

**Relevance threshold: none.** Any unmet prerequisite chain qualifies regardless of which section the student cares about, how large the depth is (even depth 1 qualifies), or how the finding's section relates to anything else on the screen.

**Ranking against other cards:** `rank(sig) = severity × confidence × (0.4 + 0.06 × nonObvious)` (`prep-insight-engine.ts:709-711`). `detectFoundation` hardcodes `severity:8, confidence:9, nonObvious:10` (`:428`) — near-maximum on every axis, so a foundation-gap card will almost always outrank a same-section imbalance card (`detectImbalance` is `severity:7, confidence:8, nonObvious:8`), meaning even when the coverage-gap `weakest` calculation correctly names the self-reported section, the foundation-gap detector — which may point somewhere else entirely — is favored to win the HERO slot.

---

## PART G — The Final Sentence, Exactly

`headline`/`note`/`action` text lives inline in each detector function (`prep-insight-engine.ts:350-689`) — **template strings with variables interpolated, not hard-coded literals and not LLM-generated.** Every sentence is one of a small, fixed number of variants selected by `if`/ternary branches on the computed state (e.g. `detectTimeline` has 4 distinct headline variants gated on `TimelineState`).

For `detectFoundation` specifically (`:422-438`):
```
headline: "You're building on an incomplete foundation."               [always this exact string]
stats: [`${topic} → ${status label}`, `${root}${depth≥2 ? ' — N levels beneath it —' : ''} → untouched`]
note:  "That's why the hard questions feel random — you're above your own base."   [always this exact string, no variant]
action: `The plan puts ${root} first, then unlocks ${topic}.`
```

**Can the statement become logically false?** Yes, in one specific way: `action` claims *"the plan puts X first"* — but per Part C, the insight object (including this exact recommendation) is **never sent anywhere** when the student taps "Build my plan around this" (`screen-instant-insight.tsx:216-223`, `onNext()` with no payload). The plan that actually gets built afterward runs through `resolveFocusSections`, which — per Part J — may or may not agree with this specific recommendation, since it doesn't consume `findFoundationGap`'s output at all. **This is a causal claim ("the plan puts X first") that the current architecture does not mechanically guarantee**, though it may often happen to be true if the coverage-gap-based real plan independently reaches a similar conclusion.

**"That's why the hard questions feel random" — audited for evidentiary support:** the claim is that a specific *feeling* (hard questions feeling random) is *caused by* an unmet prerequisite. The matrix and metadata contain no evidence about how any question has felt to the student — no confidence-tap data, no mock-question-level performance is read by this detector. This is a plausible pedagogical inference dressed as an observed fact, stated with full certainty (`confidence: 9`) and no hedge in the copy itself ("That's why," not "This can make..."). **This is the clearest instance in the file of a stronger causal claim than the underlying data supports.**

**Multiple variants exist elsewhere** (e.g. `detectNeverMocked` has a `heavy`/non-`heavy` branch changing both headline and note based on `totalFinished`, `:598-611`) — so the engine is capable of hedged, state-aware copy; `detectFoundation` simply doesn't use that capability.

---

## PART H — "What We'll Do" / Plan Generation

**Confirmed: the insight engine only recommends. It does not write to the plan.**

- `screen-instant-insight.tsx:216-223`: the CTA button calls `onNext()` with **zero arguments** — no `cards`, no `recommend`, no `key` is passed forward into the funnel's `data` state.
- `prep-insight-engine.ts` has no persistence call anywhere (confirmed: no `admin.from(...)`, no `fetch(...)` in the file — it is a pure function, by design, matching its own header comment's "pure functions" rule).
- The actual plan is built by an **entirely separate system**: `resolveFocusSections()` (`focus-sections.ts:88-110`) → `buildDayPlan()` (`plan-day.ts:117-165`) → `generateRoutine()`. This chain never imports or calls `computePrepInsight`, `findFoundationGap`, or `deepestUnmetPrereq` (confirmed: grep for those three names returns zero matches outside `prep-insight-engine.ts` and its test file).
- **Does the plan respect prerequisites?** Only incidentally. `resolveFocusSections`'s weakest-section chain has no prerequisite-graph step at all — it goes mock → self-report → baseline → coverage-gap → `'DILR'`. Prerequisite ordering (`sequenceRank`, `prerequisites`) is a completely separate mechanism used elsewhere for topic *selection within* a section (`day-topics.ts`'s `chooseTopicForSection`, not audited in depth here — outside this screen's scope), not something `findFoundationGap`'s specific recommendation feeds into.
- **Can the plan contradict the insight?** Yes, structurally possible: `findFoundationGap`'s section (say, QA) can differ from `resolveFocusSections`'s `weakest` (say, VARC, because rank-2 self-report wins there) — the WOW screen showed a QA card, the actual next-day plan leads with VARC. **UNKNOWN how often this actually happens in production** — would require live data to quantify; not fabricated here.

---

## PART I — 8 Student Scenarios

All matrices are illustrative constructions built from real `TOPIC_METADATA` weightages, not live production records.

| # | Self-report | Matrix sketch | Algorithm `weakest` | `findFoundationGap` | Displayed hero | Relevant? | Defensible? | Likely student reaction |
|---|---|---|---|---|---|---|---|---|
| A | VARC | QA has more untouched-weighted topics than VARC | QA | none (no active-topic prereq gaps) | Imbalance card, QA-framed | **No** — contradicts self-report, no acknowledgment of it | Mathematically yes, contextually no | "I said VARC. Why is this about QA?" |
| B | QA | QA topics mostly `practicing`/`revising`, genuinely well covered | some other section | possibly a QA foundation gap if an active QA topic has an unmet root | Could be a QA foundation card despite good coverage | Partially — foundation ≠ coverage, both real, but neither says so explicitly | Technically yes, but presented as if it's the whole picture | "I thought I was good at QA — why does this still say QA?" (foundation and coverage genuinely can disagree, but the screen doesn't say why) |
| C | VARC | VARC genuinely has the largest gap | VARC | none, or a VARC-consistent gap | Imbalance card, VARC-framed | **Yes** | Yes | "Yes, that's exactly it." — the one case where the current mechanism happens to work, by coincidence, not by design |
| D | any | Only 2 topics tapped | `insufficient_evidence` gate (`totalFinished+totalLearning < 3`) UNLESS a foundation/timeline-passed signal escapes the gate | Can still fire (deliberately, `:783` comment) even with almost no data | Foundation card, or "You're right at the start" | Foundation card can fire off a single tapped topic — self-report totally irrelevant either way | Mathematically yes | Depends entirely on whether the one foundation card happens to match what they said |
| E | any | Many `learning`, zero mock/performance data | Weighted toward `learning` topics via `gap` formula | Candidates drawn from `finished ∪ learning` | Any card type | Neither coverage nor foundation gaps prove actual weakness — see Part J | Yes, mathematically, given the stated inputs | Uncertain — "learning" alone doesn't mean struggling |
| F | any | Active topic's prerequisite chain nested several levels deep, in a DIFFERENT section than any other signal | any | Deep chain from an unrelated section | Foundation card, could be maximally distant from self-report | **No**, by construction — `findFoundationGap` has no cross-signal check at all | Yes, mathematically | Highest-risk case for the "random QA insight" complaint |
| G | any | Almost everything `not_started` | `insufficient_evidence` state (below the 3-topic-activity floor) unless timeline-passed | Rarely fires — few/no `finished ∪ learning` candidates | "We won't invent a weakness you haven't shown us yet" + starting points | Honest, by design | Yes | Likely positive — this is the one deliberately-honest path in the whole system |
| H | any | Broad coverage, all `practicing`, none `revising` | Low gap everywhere, `weakest` may be close to a coin-flip between sections | `detectSectionStrength` requires `mastered.length≥2` (i.e. `revising`) — **will not fire**, since nothing has reached `revising` | Likely a risk/pattern card (e.g. `detectDifficultySkew`), no strength card | Partially — "broad but shallow" is real, but no card explicitly names "you've covered a lot but mastered none of it" as its own headline | Yes | Might feel like it's missing the obvious, most memorable fact about their own prep |

---

## PART J — Product Validity Audit

**What is this feature actually promising?** Reading the screen's own copy and code comments (`screen-instant-insight.tsx:1-44`): it presents itself as items 2 and 3 simultaneously — a **diagnostic engine** ("we found something in your prep," specific evidence, a stated consequence) that also functions as a **preparation-gap detector** (the `SectionCoverage` bars, the `startingPoints` fallback). It explicitly is NOT #1 (a bare "weakness detector" — its whole design rationale, per the header comment, was rejecting the "your weakest section is X" framing as too shallow) and NOT #4 (a study-plan generator — Part H proves it recommends but does not generate).

**What evidence does the system actually have, and what does it NOT have?**

| Claim the screen can make | Evidence basis | FACT / does it hold up |
|---|---|---|
| "You've tapped topic X as `not_started`" | Direct student input | FACT — solid |
| "X is a prerequisite of Y per our content model" | `TOPIC_METADATA.prerequisites` | FACT, but this is **editorial content**, not measured fact (Part D) — a *defensible modeling choice*, not ground truth about this student |
| "Topic X is weighted 5/5 in its section" | `TOPIC_METADATA.weightage` | Same caveat — "editable content... NOT measured data" per the file's own comment |
| "You said VARC is your weakest section" | `self_reported_weakest_section` | FACT — but not read by this screen at all |
| "You are weak at X" (in the sense of low exam performance) | **No mock-score data is read anywhere in `prep-insight-engine.ts`** | **Does NOT hold up.** Coverage (tapped/not-tapped) and prerequisite completeness are proxies for study *activity*, not measured *ability*. `topic_coverage.status` records what a student says they've done, not how well they perform on it. |
| "Untouched = weak" | Implicit in every risk-polarity detector | **Conflated.** Untouched means "hasn't studied it," a students self-declared status — it says nothing about performance on the questions they HAVE attempted. |
| "Learning = weak" | Implicit in `gap`'s `weightLearning` term | Same conflation, one step removed — `learning` status could equally mean "actively improving," not "weak." |
| "Lack of coverage → low marks" | Never stated, but implied by the whole framing | **Not evidenced anywhere in this codebase.** No performance/marks data enters this engine at all — `weightage` is explicitly disclaimed as not-marks (`:19-21` in the file's own header: "the word 'marks' appears nowhere in student-facing copy" — a deliberate, correctly-enforced constraint the engine itself respects in its output, even though the underlying conflation (coverage ≠ ability) remains). |

**Brutally honest summary:** the system can legitimately claim "here is what you've told us about your own study activity, and here is a structural pattern our content model finds in that activity." It cannot legitimately claim to know whether a student is *weak* in the ability sense, and to its credit the copy is careful never to claim marks or scores. But the *feeling* the screen creates ("we found something," presented with total confidence, zero hedging) reads as diagnostic certainty about the student's actual exam performance, which the underlying data does not support. This gap between the copy's confidence and the data's actual epistemic weight is real and is the same gap the founder identified from the outside, independently, before this trace was run.

---

## PART K — Contradiction Matrix

| Student says | Coverage-gap `weakest` (Instant Insight) | Foundation gap (Instant Insight) | Coverage-gap `weakestFromCoverage` (real plan, rank 4) | Real plan's actual `weakest` (rank 1-5 chain) | Product problem |
|---|---|---|---|---|---|
| VARC | VARC | VARC | VARC | VARC | None — full agreement (Example C) |
| VARC | QA | (any) | QA | VARC (self-report wins at rank 2) | **Actively damaging.** WOW screen contradicts self-report with no acknowledgment; real plan silently does the right thing one screen later, so the *contradiction itself* is what a student remembers, not the eventual correctness. This is the founder's exact screenshot. |
| VARC | VARC | QA (foundation, different section) | VARC | VARC | **Confusing.** Coverage math and self-report agree; foundation detector still overrides with an unrelated section because `detectFoundation`'s near-max severity/confidence/nonObvious scores usually win the hero slot regardless of what `detectImbalance` found (Part F). |
| null ("not sure") | any | any | any | falls to baseline → coverage → `'DILR'` | **Acceptable, arguably useful** — student declined to guess; both the WOW screen and the real plan fall back to evidence, which is the intended design for this case. |
| QA | QA | QA | QA | QA | None — full agreement |
| DILR | QA (small-section volatility, Example C reasoning) | QA | QA | DILR (self-report wins at rank 2) | Same shape as row 2, reproduced for DILR because DILR's small topic count makes its gap score noisier |

**Classification:**
- **Acceptable/useful:** self-report `null` falling through to evidence; self-report and evidence agreeing.
- **Confusing:** foundation detector overriding an agreeing coverage/self-report pair with an unrelated-section finding.
- **Actively damaging to trust:** WOW-screen coverage-gap or foundation-gap contradicting self-report *with no acknowledgment that a self-report was ever given* — this is the founder's core complaint, and it is architecturally guaranteed to keep happening under the current wiring, not an edge case.

---

## PART L — Architecture Quality Findings

Ranked P0 (fundamentally misleading) → P3 (cosmetic). Search was repo-wide, not limited to files already discussed.

**P0 — fundamentally misleading**

1. `self_reported_weakest_section` is captured twice (screen-weakest-section.tsx via two independent write paths — `onboarding-modal.tsx:412-414` direct-Supabase vs `verify-phone-otp/route.ts:406-407` via API route) but never reaches `computePrepInsight` in either path. The single highest-trust input in the funnel is discarded by the single highest-trust screen. (Parts C, E, F)
2. `detectFoundation`'s `action` copy ("The plan puts X first, then unlocks Y") is not mechanically true — the recommendation is never transmitted to the systems that actually build the plan (Part H). It's true only when the independently-computed real plan happens to agree.
3. `findFoundationGap` has zero section-awareness — it pools active topics from all three sections into one flat candidate list (Part F). Combined with #1, this guarantees the QA-shown-for-VARC-self-report failure mode is structural, not incidental.

**P1 — materially weak**

4. `self_reported_strongest_section` — write-dead. No onboarding screen, no API route, no client call anywhere sets it (confirmed by the field-cluster trace), yet `focus-sections.ts:102` reads it as rank-1 input for `strongest`. In production it is permanently `null`, silently falling through every time. A planned mirror of `screen-weakest-section.tsx` that never shipped a write path. (Agent trace 3)
5. `baseline_varc/baseline_dilr/baseline_qa` — the only writer (`api/profiles/baseline/route.ts`) has no confirmed caller anywhere in `src/`. These feed rank 3 of the canonical resolver and an entirely separate buddy-matching formula (`buddy-match.ts`), both silently starved unless populated out-of-band. **UNKNOWN** whether production data exists via a process outside this repo.
6. `section_elo` — fully dead. Declared with an Elo-style `{varc:1200, dilr:1200, qa:1200}` default in one migration (`20260612_full_mirror_spec.sql:17`), read and written nowhere in `src/`. Likely a scaffolded, never-built feature (INFERENCE from the default shape).
7. Two independent "weakest section" formulas exist for real production decisions beyond the canonical resolver: `api/routine/add-block/route.ts` (raw self-report + hardcoded `'DILR'`, no mock/baseline/coverage fallback) and `buddy-match.ts` (baseline-only, no mock/self-report/coverage). Both can disagree with `resolveFocusSections` for the same student on the same day.
8. Causal certainty without evidence: "That's why the hard questions feel random — you're above your own base" (`detectFoundation`, Part G) states a feeling-causation link the matrix data cannot support, with no hedge in the copy and `confidence: 9`.

**P2 — optimization**

9. Tie-breaking bias: on an exact gap tie, VARC can never be reported "weakest" and DILR can never be reported "strongest" (`TIE_ORDER`, Part E) — a real but likely low-frequency artifact.
10. `gap` formula weights untouched topics 2× against learning topics, and is normalized by *editorial* weightage (Part D) rather than any measured signal — reasonable as a heuristic, but worth knowing it's opinion-weighted.
11. No analytics/telemetry records which specific insight card a student saw (Part C) — makes it impossible to later measure how often the contradiction in Part K's row 2 actually fires in production, or how students who saw it behaved afterward.

**P3 — cosmetic**

12. `verify-phone-otp/route.ts`'s `OnboardingPayload` interface (lines 23-40) doesn't declare `self_reported_weakest_section` as a typed field even though the route reads it off the object at runtime via `'field' in onboarding` — cosmetic type-contract gap, not a functional bug (per Agent trace 2's finding — request bodies aren't runtime-validated against this interface regardless).
13. `students/[id]/prep-snapshot.ts:15` fetches `self_reported_weakest_section` into a shared object that neither of its two consumers ever reads back out — a harmless but pointless query.

**No evidence found of:** silent null-crash risk in the matrix path (guarded, `computePrepInsight(matrix: null)` doesn't throw per its own test suite), unsupported causal claims beyond #8, or UI copy that outright states something false about the CURRENT matrix data (the false-ness is in the cross-screen `action` promise, #2, not within-screen).

---

## PART M — What Would Have to Be True for a Real WOW Moment

Restating the framework already discussed and agreed with you in this conversation, now grounded in exactly what the current data CAN and CANNOT support (per Part J):

- **BAD** ("QA is your weakest section"): current system CAN say this (mathematically), but it's a restatement no better than what the student already told the app.
- **BETTER** ("Your QA foundation is incomplete"): current system CAN say this — `detectFoundation`'s stats line does exactly this, scoped to whichever topic the algorithm happened to pick.
- **STRONG** ("You're practicing Functions while Linear Equations underneath it is untouched"): current system CAN already say this, verbatim, for any section — this is exactly what `findFoundationGap` computes today (Part F). The mechanism to produce STRONG-tier copy already exists and works correctly on its own terms.
- **WOW** ("You told us VARC is costing you marks. We checked... your real problem isn't VARC overall — it's X, Y, Z"): current system **CANNOT** say this, for one precise, provable reason — the self-report never reaches the engine (Part C, Part E, Part F all confirm zero self-report input to `computePrepInsight`). Every other piece — the STRONG-tier prerequisite chain logic, the per-section coverage stats, the confirm-or-surprise framing you described — already exists in some form in `prep-insight-engine.ts`. The one missing wire is the one you already correctly identified as the visible symptom on 15 Aug: `self_reported_weakest_section` isn't in `PrepInsightInput`, and nothing computes a "does the self-report match, or does the evidence say something more interesting" comparison anywhere in the file.

**What the current data is capable of supporting, precisely:**
- Confirming or contradicting the self-report *if it were wired in* — trivial, the field already exists and is validated (`'VARC'|'DILR'|'QA'|null`).
- Naming specific topics within a section (STRONG-tier specificity) — already works.
- A causal "why" narrative connecting a prerequisite gap to a section — already works, though currently overclaims certainty (Part G, #8).
- **What it cannot support, even if fully wired:** any claim about actual exam performance/ability, since no mock-score or question-level data enters this engine at all (Part J). A WOW-tier sentence claiming "this is costing you marks" would still be an inference beyond what `prep-insight-engine.ts` measures, distinct from the self-report wiring gap.

---

## PART N — What This Audit Did Not Determine (UNKNOWN, stated explicitly)

- Whether `ScreenInstantInsight` in the post-login `onboarding-modal.tsx` is currently reachable at all in production — static analysis (Agent trace 2) found `deferSave` is never passed to `screen-topic-coverage.tsx` in that file, which would make `onMatrixReady` (and therefore `data.topic_matrix`, and therefore the screen's insertion gate) permanently empty. **High-confidence-but-not-runtime-verified** — this audit did not execute the app.
- Whether `src/app/api/cron/daily-insight/route.ts` (a cron job whose name suggests a recurring insight feature) is built on `prep-insight-engine.ts` or an unrelated engine — it did not appear in the `computePrepInsight` caller grep, but was not opened and read in this audit.
- Which Supabase migration (if any tracked in this repo) originally added `self_reported_weakest_section` to `profiles` — not found in 119 searched migration files.
- Whether `baseline_varc/dilr/qa` and related "orphaned-write" columns are actually populated in live production data via some process outside this repository (manual admin action, an external script, a one-off backfill).
- How often, in real production traffic, the Part K row-2 contradiction (self-report vs. WOW-screen finding) actually fires, and what students who see it do afterward — no telemetry exists to answer this (Part C, Part L #11).
- Whether the authored `TOPIC_METADATA.prerequisites` graph contains any cycles in practice — the code defends against this regardless (Part D), but the data itself was not audited for it.

---

*End of forensic teardown. No fix, redesign, or implementation is proposed here, per instruction. Three background research agents traced the DB-persistence and cross-file consumption claims in Parts C, H, K, L, M independently of the primary source-reading pass on `prep-insight-engine.ts`/`topics-constants.ts`/`coverage-status.ts`/`study-pace.ts`; both were cross-checked against each other where they overlapped (e.g. the `Functions`→`Linear Equations` chain in Part F was verified directly against `topics-constants.ts:188-190` independent of the agent traces).*
