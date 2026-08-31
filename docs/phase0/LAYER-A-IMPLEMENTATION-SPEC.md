# Layer A — implementation spec

**31 August 2026.** Written before code, per founder. Everything below is read
off the actual files, not assumed.

---

## 0. Two things to settle first

### (a) The number is 40, not 22 — and 34 without a guard change

"22" is the **promotions**. Eighteen topics already ship a concept video, so
Layer A at full strength is **40 of 46 topics**.

But `topic-resources.guard.test.ts` already enforces a ceiling:

```
expect(r.realMinutes, `${topic}/${r.intent} exceeds a daily task block`)
  .toBeLessThanOrEqual(45);
```

with the reason written into it: *"45 minutes is the ceiling a single daily
topic block can hold. Anything longer is real content but needs a splitting
decision before a student is pointed at it mid-task."*

**Six of the 22 promotions exceed it and would fail CI today:**

| Topic | Video | Runtime |
|---|---|---|
| Pipes & Cisterns | `kwO4buoyWHg` | 78.1 min |
| Remainders | `taNnRLuS4pk` | 70.5 min |
| Coordinate Geometry | `9t7cKr-KZ8U` | 67.7 min |
| Set Theory | `IgEKyxYTXDg` | 63.9 min |
| Binary Logic | `z69ElNGKPFs` | 60.9 min |
| Base System | `yVXgLm09yuM` | 56.0 min |

This is the concept-budget problem from earlier, already encoded as a rule by
whoever wrote that guard. Options:

- **(a) Ship 34 now** — 18 live + 16 passing promotions. The six wait for a
  shorter concept video. Consistent with *a missing resource is acceptable*, and
  it respects a rule written for a real reason. **Recommended.**
- **(b) Raise the ceiling deliberately**, with the new reason written into the
  test. Only if you believe a 78-minute lecture is a sane first-exposure link.
- **(c) Research shorter alternatives** for those six — one platform-discovery
  round, and they join later.

**I recommend (a) now, (c) next week.** Six topics showing no row is a smaller
harm than pointing a first-time student at 78 minutes inside a 30-minute slot.

### (b) One existing test will break either way

```
expect(resourceFor('Base System', 'concept')).toBeNull();
```

`topic-resources.guard.test.ts` uses **Base System** as its example of an
uncovered topic. Promoting Base System makes that assertion false. The fix is to
swap the example for a topic that stays genuinely uncovered — `Odd One Out` or
`Caselets`. Mechanical, but it must be in the same commit or CI goes red.

---

## 1. What gets reused, unchanged

| Thing | Where | Why it needs no change |
|---|---|---|
| `TopicResource` record | `topic-resources.ts` | already carries `videoId, title, channel, realMinutes, views, verifiedOn` |
| `resourceForTask(topic, phase)` | `routine-engine.ts:113` | single entry point, already keyed on the right pair |
| `phaseForTopic()` | `routine-engine.ts` | already maps coverage status → phase |
| `resource_shown / _opened / _verdict` | `journey.ts` + surface | all three events already fire |
| Render sites | `TodaysRoutineCard.tsx` | already renders `<TaskResource>` on hero + rows, guarded `!done && task.resource` |
| Coverage ladder | `coverage-status.ts` | untouched — no new status |

## 2. What changes

### `src/lib/topic-resources.ts`
- `ResourceIntent` becomes the locked vocabulary:
  `'concept' | 'worked_example' | 'practice' | 'revision' | 'exam_practice'`.
- Every `practice_easy` row that genuinely solves questions on screen →
  `worked_example`. Everything else in `practice_easy` / `practice_cat` → **deleted**
  from the shipped map and moved to `docs/phase0/parked-resources.json` so nothing
  is lost.
- Add the 16 passing promotions as `concept`.
- Add `rank: 'primary' | 'secondary'` — array order is too implicit for a rule
  this load-bearing.
- New export `resourceSecondary(topic)` → the secondary for that topic, or null.

### `src/lib/routine-engine.ts`
```
foundation: ['concept']        // was ['concept', 'practice_easy']
intensive:  []                 // was ['practice_cat', 'practice_easy', 'concept']
revision:   []                 // was ['exam_ready', 'practice_cat', 'practice_easy']
```

### `src/components/task-resource.tsx`
- New optional prop `secondary?: TaskResource`. **Prop stays singular** — the
  guard forbids `resources: TaskResource[]`, and rightly.
- One `<a>` still. It renders whichever resource is active; the secondary
  **replaces** the primary in the same anchor rather than appearing beside it.
  The one-anchor guard is satisfied by design, not by evasion.
- Feedback becomes four options: **Helpful / Okay / Not helpful / Didn't open**.
- On **Not helpful**, and only if a secondary exists: *"Try another explanation →"*,
  which swaps the anchor and resets the ask.
- On **Not helpful**, a reason picker: too basic · too difficult · too long ·
  didn't explain clearly · couldn't access · not what I needed. Recorded only.
  **No ranking is computed from any of this.**
- `LEAD_IN` map updated to the new intents.

### Guard tests — two deliberate changes, reasons written in
1. `opened && verdict === null` becomes: a **helpfulness** verdict only after an
   open; **"Didn't open"** is available without one. The original rule was that
   we must not manufacture an opinion about a link nobody opened — asking *why*
   they did not open it does not do that, so the rule survives, narrowed.
2. The `Base System` example swaps to a still-uncovered topic.

### Guard tests — three added
1. No `practice*` intent is ever reachable from `foundation`.
2. `resourceForTask` returns null for `intensive` and `revision`.
3. A secondary is never rendered while the primary is showing (still one anchor).

## 3. What explicitly does NOT change

- Coverage statuses, `STATUS_ORDER`, the DB trigger, any migration. **None.**
- `taskVolume`, `phaseForTopic`, topic selection, the plan engine.
- The four standing rules: never hosted, never mandatory, one link never a list,
  source always named.
- The task's `target`. A resource never changes what the student is asked to do.

## 4. Ship list — 34 topics

**18 already live** (unchanged) + **16 promotions**: Linear Equations, Functions,
Lines & Angles, Triangles, Quadrilaterals, Circles, Mensuration, Permutation &
Combination, Probability, Divisibility, HCF & LCM, Sentence Completion, Reading
Speed Practice, Selection & Distribution, Venn / Sets, Hybrid DILR Sets.

Secondaries attach where a second concept-grade candidate exists. *Reading Speed
Practice takes no secondary* — it is a `SKILL_UNIT`, capped at one concept
resource by an existing guard.

Watchlist for early verdicts: `e4Ec4KzqaME` (Sentence Completion — calls itself
a demo session) and the paid-push set.

## 5. Order of work

1. Data: rewrite `topic-resources.ts` (intents, deletions, 16 promotions, ranks).
2. Park the removed rows to `docs/phase0/parked-resources.json`.
3. Engine: the three-line `RESOURCE_PREFERENCE` change.
4. Surface: secondary in the same anchor, four-way feedback, reason picker.
5. Guards: 2 changed, 3 added.
6. `npm test` green, then push.

**Decision needed before step 1: (a), (b) or (c) on the six long videos.**
