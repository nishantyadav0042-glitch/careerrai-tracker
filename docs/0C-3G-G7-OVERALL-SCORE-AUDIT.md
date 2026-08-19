# G7 — what UNKNOWN means to `overallScore` and `band`

**Gate:** G7, read-only. No code, schema, migration or data changed.
**Question:** Q3 made an unknown duration UNKNOWN. `studyScore` still turns it back into 0.
What should a composite score do with a component it cannot measure?
**Date:** 18 Aug 2026.

---

## VERDICT — needs a ruling, and the ruling is bigger than the bug

The immediate defect is real and confirmed: **15 students have an unknown study
duration and all 15 sit in the worst band, "Needs intervention"**, partly because a
component nobody measured scores zero.

But the trace turned up something that should be decided first: **the score is already
largely degenerate.** Fixing `studyScore`'s unknown case inside a formula whose other
components are constants would be polishing one number in a total that does not mean
what it appears to mean.

Both leading options land within **0.3 points** of each other, so the choice is not
about arithmetic — it is about what you want the score to *say*.

---

## 1. The trace, end to end

```
daily_reports.study_duration ─┐
daily_reports.day_outcome ────┤ durationIsUnknown()  (G6 pair rule)
daily_reports.study_duration_source ┘
        ↓
   measured days only            (Q3, shipped bb4d6bb)
        ↓
   avgStudy : number | null      ← UNKNOWN is representable here
        ↓
   studyScore = min(25, ((avgStudy ?? 0) / 6) * 25)   ← UNKNOWN becomes 0 HERE
        ↓
   overallScore = consistency + studyScore + mockScore + moodScore
        ↓
   band = ≥70 'On track' · ≥50 'Needs nudging' · else 'Needs intervention'
        ↓
   consumers (below)
```

**The conversion happens on exactly one line**, `analytics.ts`. Nothing downstream
re-derives it.

### Consumers of `overallScore` / `band` — all admin- or founder-facing

| Surface | Uses | Student sees it? |
|---|---|---|
| `admin/admin-students-list.tsx` | band colour + `{score}/100` badge | No |
| `api/cron/weekly-digest` → `lib/email.ts` | `"{name}: {score}/100 ({band})"` in your digest | No |
| `admin/students/page.tsx` | `hasRedFlags` only | No |
| `admin/buddies/roster` | `redFlags.length` only | No |
| `student/profile/history-section.tsx` | **neither** — totals and mocks only | **No** |
| `buddy/(dashboard)/students/[id]` | **neither** — totals, days, avg hours | **No** |

**VERIFIED FROM CODE.** No student and no buddy ever sees `overallScore` or `band`.
The blast radius is your admin list and your weekly digest.

---

## 2. The other `band` is clean — checked, not assumed

`momentum.ts` has its own `band` (champion / on_track / needs_nudge / at_risk / rescue)
and it is the higher-stakes one: it drives `sales-queue`, `call-queue`,
`sales-conversion`, `/admin/momentum` and Mission Control — **who gets called**.

It takes **no duration input at all**. Its four components are recency of last log,
`activeDays14`, push engagement, and buying intent. And `activeDays14` counts *distinct
`report_date`s* — presence only, so it is immune to the A3 defect as well.

**The band that decides who you call is unaffected by any of this.**

---

## 3. What the score is actually made of

This is the finding that should shape the ruling.

| Component | Range | What it does in production |
|---|---|---|
| `consistency` | 0–25 | `(reports / 7) * 25` — **real signal** |
| `studyScore` | 0–25 | **real signal**, now Q3-corrected — except when unknown |
| `mockScore` | 0–25 | **12, fixed**, for every student without a mock |
| `moodScore` | 0–25 | **exactly 20.0 for every student, always** |

**VERIFIED FROM PRODUCTION DATA:** across 110 real reports in the last 7 days,
`confidence`, `stress` and `overall_energy` each have **exactly one distinct value**
(4, 2, 4) — `upsert_log_and_streak` hard-codes them on every write. `moodScore`'s
minimum and maximum are both **20.0**.

So in practice:

```
overallScore ≈ consistency + studyScore + 32        (range 32–82)
band:  ≥70 On track   ≥50 Needs nudging   else Needs intervention
```

32 of the 100 points are a constant. A student whose duration is unknown scores 0 on
`studyScore` and therefore needs `consistency ≥ 18` — **five or more logs in seven days**
— merely to escape the worst band. That is why all 15 are in it.

This is the same class J2 retired the sleep and burnout flags for: values the RPC
fabricates, being read as if measured. J2 removed the *flags*; the *score* still uses them.

---

## 4. The precedent already in the file

`computeSummary` has already answered "what does a missing component contribute?" — once,
for a different component, and differently:

```ts
const mockScore  = mockScores.length ? Math.min(25, (avgMockScore/100)*25) : 12;  // no evidence → NEUTRAL
const studyScore = Math.min(25, ((avgStudy ?? 0) / 6) * 25);                       // no evidence → WORST
```

A student with no mocks is not punished. A student with no measured hours is punished
maximally. Whatever is decided, that asymmetry is not defensible as-is.

---

## 5. Production impact, and the options priced

Window: last 7 days · 72 real students with a report · demo/test excluded.

- **15 students** have an unknown study duration.
- **All 15** are currently banded **"Needs intervention"**.
- Their average score today: **36.5**.

| Option | What it does | Avg score | Students leaving worst band |
|---|---|---|---|
| **A — Renormalise** | drop `studyScore`, rescale the other 75 points to 100 | **48.7** | **3 of 15** |
| **B — Neutral prior** | `studyScore = 12.5` when unknown, matching `mockScore`'s existing 12 | **49.0** | **3 of 15** |
| **C — Insufficient-data state** | band becomes a fourth value; score suppressed or shown with a marker | n/a | all 15 leave, into a new state |
| **D — Leave as-is** | unknown keeps scoring 0 | 36.5 | 0 |

**A and B are within 0.3 points and move the identical 3 students.** The remaining 12 stay
in the worst band on their own consistency, which is genuinely low — so neither option
whitewashes anyone.

---

## 6. What I need ruled

1. **Which option** — A, B, C, or something else. A and B are near-identical in effect;
   B is one line and matches the file's own precedent, A is more principled but changes
   the score's scale for everyone.
2. **Does `moodScore` stay?** It contributes a constant 20 to every student. Removing it
   (and rescaling) would make the score mean something, but it moves *every* band, not
   just the 15. This is the bigger question and it is why I did not implement anything.
3. **Do the 70/50 thresholds survive either change?** They were presumably tuned against
   today's inflated totals. Changing the composition without revisiting them silently
   re-bands the whole roster.
4. **Is `band` worth keeping at all**, given `momentum.ts` already provides a richer,
   evidence-backed band that drives the decisions that matter? Retiring one of two
   competing scores may be better than repairing the weaker one.

---

## 7. Recommendation

**Option B for the immediate defect, but only as part of answering question 2.**

B is the smallest correct step, it matches the precedent three lines above it, and it
fixes the asymmetry where missing mocks are forgiven and missing hours are punished.
But shipping B alone would leave a score that is 32-points constant and call it 100 —
and this project's whole method has been to refuse that kind of number.

If you would rather not spend a decision on an admin-only metric right now, **D (leave it)
is defensible**: no student or buddy sees it, and G6/Q3 already stopped the student-facing
lie. Recording it as a known, bounded inaccuracy is honest; silently half-fixing it is not.

---

## 8. Method

Traced from `study_duration` outward through every transformation to every consumer, by
grep across `src/`, not from a prior file list. The second `band` system was found this
way and checked rather than assumed. All figures are read-only production queries
excluding demo and test accounts. The degenerate-composition finding was measured
(distinct-value counts), not inferred from the RPC's source.
