# Distress chip acknowledgement — a UX/product issue

**18 Aug 2026. Deliberately kept OUT of `0C-3D-DAILY-REPORT-SEMANTICS.md`.**

This is not a fact, not a rule, not an insight and not a metric defect. Mixing
it into the semantics constitution would be a category error — which is the
error this whole phase exists to stop making.

---

## What happens today

A student ticks a feeling on the log sheet — `burned_out`, `mock_scared`,
`comparing`, `lost_confidence`, `feeling_behind`, `family_pressure` — and
CareerRai answers **only if they already have three or more logs.**

`computePrescriptiveLine` returns `null` at `route.ts:333`
(`if (!recent || recent.length < 3) return null`) **before** the chip branch at
`:336` is ever reached.

## Measured

| | |
|---|---|
| logs carrying a non-`all_good` chip | **28**, from **19 students** |
| of those, on the student's 1st or 2nd log → **silently dropped** | **23 (82%)** |
| `feeling_behind` logs that ever reached the rule | **1** |
| `family_pressure` logs | **6** — **no branch exists at all** |

So: 19 students have told CareerRai they were struggling. Four in five were told
nothing, and the ones most likely to be new are the ones most likely to be
ignored. A student on log #2 saying *"burned out"* gets silence.

## Two smaller defects in the branch itself

**1. The `feeling_behind` line prints zero.**
```ts
`${daysBetween(recent[0]?.report_date)} days of data say you're showing up.`
```
`recent` is `ORDER BY report_date DESC`, queried *after* today's row is written,
so `recent[0]` **is today**. The line renders *"**0** days of data say you're
showing up."* It plainly intends the oldest row. Exactly one student has ever
reached this, which is why nobody has reported it.

**2. `daysBetween` calls `Date.now()`** — in a file that already imports
`getLogDateString()`. A sixth definition of "today".

## Why this is not an Insight Engine problem

An insight is a claim derived from evidence. This is an **acknowledgement of
something the student typed one second ago.** It needs no history, no fact, no
registry, no threshold and no provenance — and today it is gated behind history
it does not use, ranked above every evidence-based rule, and competing for the
same single line.

## Recommendation

Move it out of `computePrescriptiveLine` entirely and answer on the log sheet,
immediately, for every student including log #1.

**Hard constraint on the copy — acknowledgement only.** It may name back what
the student said. It may not diagnose, count, compare or interpret:

| Allowed | Forbidden |
|---|---|
| naming the feeling back | *"Your consistency is…"* |
| one concrete next step | *"You've been struggling for N days"* |
| pointing at the buddy | *"CareerRai noticed a pattern"* |
| — | any invented psychological reading |
| — | any number at all |

The founder's Hindi/English draft is the right register. Exact copy should
follow the existing tone rules rather than be invented here, and `family_pressure`
needs a line of its own — it is currently offered and ignored.

## Scope

Small and self-contained: a chip → copy map on the client, and the removal of
the branch from the server rule. **No fact, no registry, no history, no metric,
no schema change.** It does not touch, and is not blocked by, 0C.3d.

Authorised by the founder as a separate product fix. **Not started** — this
document is the report, and the next action is the founder's ruling on copy.
