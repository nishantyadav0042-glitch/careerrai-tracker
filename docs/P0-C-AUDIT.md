# P0-C — Calibration Integrity Audit

**18 Aug 2026. READ-ONLY. No code changed, no migration written, no consumer touched.**

Commissioned after 0C.1 flagged Defect C and stopped. The Metric Constitution is locked;
this audit establishes whether it applies to the hours model, and what changing anything
would actually cost.

---

## ⚠️ FIRST: I have to correct my own earlier claim

In `docs/METRIC-CONSTITUTION.md` Article 6 I wrote that Defect C affects **"every new
signup"** and is **"larger in reach than defect A."**

**That was wrong.** I traced the code path and did not check which signup path students
actually use. This audit's whole job was to check, and the answer inverts the claim:

**Defect C's real production blast radius is 3 accounts, all named "New User", all
created 11 Aug — and 90% of the student base was never exposed to it.** The reason is in
section G.

The Constitution will need that paragraph amended. I have not amended it unilaterally.

---

## A. Root cause

`src/lib/blueprint-builder.ts:121`
```ts
const AVG_UNIT_HOURS = totalSyllabusHours() / EXAM_UNIT_COUNT; // ≈8.6h, curated
```
`src/lib/blueprint-builder.ts:136`
```ts
const total = input.coverage_total ?? EXAM_UNIT_COUNT;   // caller passes 53
```

The coefficient is **hours per exam unit** — defined as `397h ÷ 46`. It is then multiplied
by a count that includes 7 units the 397h was never measured over. A units mismatch, not a
rounding disagreement: like multiplying a per-kilometre rate by a distance partly in miles.

**This is a recurrence of a bug class the same file already fixed once.** Its header
(lines 111-119) documents the *"3.8h/day promised, 6.6h/day demanded"* blunder, where the
finish-date chooser and the Home ring disagreed because the coefficient was hand-picked.
That fix derived the coefficient from one model. Nobody checked the *count* it multiplies.

---

## B. What 53 means

**46 exam units + 7 habit/support units.** `KNOWLEDGE_GRAPH` holds five sections:
VARC 9 + DILR 9 + QA 28 (= 46 examined) plus MOCKS 4 + READING 3 (= 7 activity).

It reaches the hours model as `coverage_total`, produced at
`screen-topic-coverage.tsx:312` as `matrix.length`, where `matrix` is built from the full
`KNOWLEDGE_GRAPH`. **The variable name is semantically wrong**: it is the size of the
declared *graph*, not of the *syllabus*.

## C. What 46 means

The examined syllabus, per Constitution ruling S1. Now enforced in code as
`EXAM_SYLLABUS_TOPICS` / `isExamSyllabusTopic()` (added in 0C.1).

## D. What 8.6h means — **the decisive evidence**

`src/lib/prep-model.ts:86-89`:
```ts
/** 397h. The whole syllabus from zero, mocks excluded. */
export function totalSyllabusHours(): number {
  return Object.values(TOPIC_METADATA).reduce((s, m) => s + m.estimatedHours, 0);
}
```

Measured this session:

| | |
|---|---|
| `TOPIC_METADATA` entries | **46** |
| `totalSyllabusHours()` | **397.0 h** |
| `AVG_UNIT_HOURS` | **8.630 h per exam unit** |
| Habit units | 7 |
| **Habit units carrying `estimatedHours`** | **0** |

The coefficient's own docstring says *"mocks excluded"*, and not one habit unit
contributes a single hour to the 397. Charging each of them 8.63h **invents 60 hours of
work that the curated model explicitly declined to estimate.**

**This answers the audit's hardest question — was 8.6 calibrated against 46 or 53? It is
calibrated against 46 by construction, in the same expression that defines it.** Changing
53 → 46 does not invalidate the coefficient; it restores the coefficient's own domain.

## E. Exact data flow

```
ScreenTopicCoverage  → matrix from KNOWLEDGE_GRAPH (53) → coverage_total = 53
   ↓ onboarding-modal.tsx:254
ScreenFinishDate     → remainingPrepHours({coverage_total: 53})
   ↓ blueprint-builder.ts:136-141   53 × 8.63 × REMAINING_FRACTION × effort
   ↓
457h (vs 397h) → weeks → finish date shown to the student
   ↓ screen-finish-date.tsx:93 → onboarding-modal.tsx:467
profiles.syllabus_target_date  ← PERSISTED
   ↓ plan-day.ts:146 → syllabusPace() → the syllabus clock's blocks/day
```

**It is not display-only.** The date persists and paces the planner.

The correct path, for contrast: `study-pace.remainingSyllabusHours()` iterates
`TOPIC_METADATA` (46) directly and never sees a count — which is why Home prices the same
syllabus at 397h the next morning.

## F. User-visible impact (per affected student)

| At | Correct | Shipped | Error |
|---|---|---|---|
| Fresh student, nothing declared | **397 h** | **457 h** | **+60 h (+15.2%)** |
| Finish date @ 4h/day | 14.2 wks | 16.3 wks | **+15 days later** |
| Finish date @ 6h/day | 9.5 wks | 10.9 wks | **+10 days later** |
| Finish date @ 8h/day | 7.1 wks | 8.2 wks | **+8 days later** |

Direction matters for section 9: the student is told the work is **larger and the finish
later** than the model implies. Correcting it is *good news* — fewer hours, earlier date.

Contractual surfaces (payments, refund eligibility, subscription): **not affected.**
Refund eligibility reads `daily_reports` counts, not this date. Notifications: not
affected directly.

## G. Production impact — **this is where the earlier claim collapses**

There are two signup paths and they set the target date completely differently:

| Path | How `syllabus_target_date` is set | Affected? |
|---|---|---|
| **`/start`** (pre-auth funnel) | `verify-phone-otp/route.ts:311` — `syllabus_target_date = onboarding.ambition_date`, **the date the student picked**. The hours model is never invoked. | **NO** |
| **`OnboardingModal`** (fallback, for anyone not arriving via `/start`) | computed from `remainingPrepHours(53)` | **YES** |

`/start` is the only place `signup_source` is set, so the column separates the cohorts
exactly. Live counts:

| Cohort | Students | With target date |
|---|---|---|
| `signup_source = 'self_serve'` (= `/start`) | **423** | 415 |
| `signup_source = null` (everything else) | 45 | **3** |

**The three exposed accounts are all named "New User", all created 11 Aug** — the shape
`verify-phone-otp:187` describes as an empty/abandoned record. No named, active student in
the base carries a target date produced by the inflated path.

**Verdict on reach: the defect is real in code and effectively unexposed in production.**

## H. Historical-data impact

**None required.** No stored value needs rewriting: the 415 real target dates came from
the student's own `ambition_date`, not from the model. The 3 exposed rows are empty
accounts. Fixing the code changes *future* OnboardingModal computations only.

## I. Hidden related inconsistencies — **C2 FOUND, and it is bigger than C**

You asked me to look before fixing C so we don't meet C2 next week. C2 is here.

`src/lib/study-pace.ts:159-160`:
```ts
const totalHours = totalSyllabusHours();                        // 397, UNSCALED
const completedPct = Math.round(((totalHours - remainingHours) / totalHours) * 100);
```
Callers pass `remainingHours = remainingSyllabusHours(rows, effort)` — which **is**
effort-scaled. Numerator scaled, denominator not.

**Consequence: a repeater who has studied nothing reads a non-zero completion percentage.**
`completedPct = (1 − effort) × 100` at zero coverage. Measured against the live base — all
**66 repeaters** are affected:

| Effort band | Repeaters | Fabricated % at zero coverage |
|---|---|---|
| 0.55 (≥90th pct) | 2 | **45%** |
| 0.65 (≥80th) | 6 | **35%** |
| 0.80 (≥70th / no pct) | 41 | **20%** |
| 0.90 (<70th) | 17 | **10%** |

`full-plan.ts:381` scales **both** sides and is correct, so the two surfaces disagree for
every repeater. The tracker overrides `completedPct` with a topic-count value
(`tracker/page.tsx:168`), but the **buddy cockpit passes it through un-overridden**
(`cockpit.tsx:95-103`) — so a mentor opening a fresh repeater today sees them as 10–45%
through the syllabus.

**C2 affects 66 real, named students. C affects 3 empty ones.** If we fix C alone we will
have fixed the smaller half of one bug class and shipped the larger half.

## J. Classification

| | Verdict | Basis |
|---|---|---|
| **C (53 → 46 in the hours model)** | 🟢 **GREEN** | The coefficient is *defined* as `397h ÷ 46` in the same expression, its docstring says "mocks excluded", and 0 of 7 habit units carry any `estimatedHours`. 46 is not an inference from the Constitution — it is the coefficient's own domain. |
| **C2 (mixed-scale `completedPct`)** | 🟢 **GREEN** as a defect · 🟡 **YELLOW** on the remedy | That numerator and denominator must share a scale is not in doubt. *Which* scale is the product question: scale both (a repeater at 0 coverage reads 0%, matching `full-plan`) or scale neither (the percentage means "of the full 397h syllabus" for everyone). Both are defensible; they are different facts under the naming law. |

Nothing here is RED. Neither requires guessing at a calibration methodology.

## K. Recommended correction

**C:** at the producer, not the consumer —
`screen-topic-coverage.tsx` should send the count of **exam** units
(`isExamSyllabusTopic`, already exists from 0C.1) instead of `matrix.length`; and
`remainingPrepHours` should defend itself by clamping its input to `EXAM_UNIT_COUNT`, so
that a future caller passing a graph-sized count cannot reintroduce the fault. Rename
`coverage_total` → `exam_units_total` so the name stops lying.

**C2:** scale both sides — matching `full-plan.ts`, which is already correct — so a
repeater at zero coverage reads 0%. This changes a number 66 students' mentors currently
see, and therefore needs your explicit decision, not my preference.

## L. Safest migration strategy

No database migration is involved in either. Both are pure-code changes:

1. Failing regression test first, per defect. For C2 the test asserts the invariant
   directly: *a student with zero coverage reads 0%, at every effort multiplier.*
2. Fix C (unexposed) first — it is the safe rehearsal.
3. Fix C2 second, as its own commit, so it can be reverted alone.
4. Full suite (baseline **1,846 passed / 1 skipped**), typecheck, lint.
5. Production verification: recompute `completedPct` for all 66 repeaters and confirm the
   new value matches `full-plan`'s for the same student.

## M. What must NOT be changed

- **No historical rewrite.** The 415 real `syllabus_target_date` values are the students'
  own choices and are correct.
- **`totalSyllabusHours()` (397h) and `TOPIC_METADATA`.** The curated model is the
  authority; nothing here suggests it is wrong.
- **`AVG_UNIT_HOURS`.** It is right; only its multiplicand is wrong.
- **The `/start` path.** It is unaffected, and it carries 90% of the base.
- **`REMAINING_FRACTION`, `studentEffortMultiplier`.** Out of scope.

## N. Requires explicit founder approval

1. **Fix C now, or defer?** Reach is 3 empty accounts. Cheap, safe, and it retires a
   documented bug class — but it is still a behaviour change under a Phase-0
   zero-user-facing-change rule, and the honest reading is that the rule does not bite
   here because no live student can observe it.
2. **C2's remedy: scale both, or scale neither?** A product decision about what the
   percentage *means*, not a bug fix. 66 students' mentors see the number today.
3. **Amend the Constitution's Article 6** to correct my "every new signup" claim to the
   measured reach.
4. **Rename `coverage_total`.** A name that means "graph size" while reading "syllabus
   total" is how this happened; renaming touches onboarding plumbing.

---

**STOPPING HERE.** No code changed. 0C.2 not started.
