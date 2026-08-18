# Q5 — the finish date must not move on evidence we never collected

**Gate:** Q5 implementation audit. Traced fresh from behaviour outward, not from G6's file list.
**Ruling (founder, 18 Aug):** *"Not measured" ≠ "0 hours."* Do not invent hours, do not
count them as zero, do not push the finish date for an unmeasured day, and give the
student one obvious action: complete the full log.
**Date:** 18 Aug 2026.

---

## 1. The path, end to end

| Step | Where | What happens |
|---|---|---|
| 1 | `check-in-gate.tsx` | Student taps "Studied". Posts `hours: 0`, `hours_source: 'not_collected'`. **Fixed in `3828b8d`** — now hands off to the full log. |
| 2 | `daily_reports` | Row: `day_outcome='studied'`, `study_duration=0`. 58 such rows, 35 students. |
| 3 | `cron/weekly-plan-reconcile/route.ts:78` | `hoursByStudentDay.set(key, Number(r.study_duration ?? 0))` — the 0 is taken at face value. |
| 4 | same, line ~95 | `loggedHoursByDay: week.days.map((d) => hoursByStudentDay.get(...) ?? 0)` — a missing day and an unmeasured day become **the same 0**. |
| 5 | `plan-extension.ts` `reconcileWeek()` | `actual += Math.max(0, Number(h ?? 0))` → deficit → `daysAdded` → **`syllabus_target_date` moves.** |

**Step 4 is the defect.** Three distinct situations collapse into one number:
no row at all · a real zero · a day we never measured.

**VERIFIED FROM CODE.** **VERIFIED FROM PRODUCTION DATA:** 35 students, 58 days.

---

## 2. The exclusion mechanism already exists — do not build a second one

`reconcileWeek` already knows how to not judge a day. `joinedOn` removes a day from
**both** `expected` and `actual`:

```ts
if (joined && input.daysInWeek && input.daysInWeek[i] < joined) continue;   // expected
if (joined && input.daysInWeek && input.daysInWeek[i] < joined) return sum; // actual
```

and its comment states the principle exactly:

> *"A warning that blames someone for time before they arrived is not a coach, it is a
> bug wearing a coach's voice."*

That is the same argument, word for word, for a day whose hours we never asked about.
**Q5 needs no new concept — it needs an existing one applied to a second case.**

Excluding from **both** sides is load-bearing. Removing the day from `actual` alone would
*increase* the deficit and make the harm worse.

`WeekInput.loggedHoursByDay` is already typed `(number | null)[]`. The type has always
allowed the distinction; only the contract ("Missing = 0") collapsed it.

---

## 3. The apparent conflict with the 6 Aug ruling — and why there isn't one

`plan-extension.ts` carries a founder ruling that reads the other way:

> *"A day with no log is a day with no study. Founder's call, and it is what actually
> happened — counting only logged days would mean a student who never opens the app never
> sees their date move, which defeats the point."*

These do **not** conflict; they cover different cases, and the 6 Aug ruling predates the
check-in gate recording an outcome without a duration.

| Case | Evidence we hold | Treatment |
|---|---|---|
| No row at all — never opened the app | Nothing | **0.** 6 Aug ruling stands, untouched. |
| `not_studied` / `skipped` | Student said there was nothing | **0.** Real zero (Q2). |
| `studied` / `partial`, no usable duration | Student said work happened; we never asked how much | **UNKNOWN — day not judged.** |
| Usable duration | A measured number | That number. |

The silent student still sees their date move. Only the student who *told us something we
failed to finish asking about* is protected.

---

## 4. Residual risk, named not hidden

A student could tap "Studied" daily, never complete the log, and never have their date
move. Three things bound it, and it is still the better trade:

1. Since `3828b8d`, tapping "Studied" **opens the full log immediately**. Staying
   unmeasured now requires actively dismissing the sheet — it is no longer the lazy path.
2. The rejected alternative was worse: assuming usual hours made *honest logging strictly
   worse than silence* (log 2h of a 4h target → penalised; log nothing → assumed 4h → not
   penalised).
3. It is measurable. `checkin_handoff_to_log` versus a completed log for the same date
   gives the abandonment rate directly.

**NOT YET KNOWN:** whether abandonment after handoff is material. No data — the handoff
shipped hours ago. Worth reading in a week.

---

## 5. Shortcut surfaces — the "one action" check

| Surface | Verdict |
|---|---|
| Check-in "Studied" / "Studied a bit" | **Was** the loophole. Fixed `3828b8d`: hands off to the full log. |
| `BusyDayButton` → `/api/routine/busy-day` | **Not a loophole.** A deliberate, separate product action that shifts the date on request. Invents no hours. Untouched. |
| Plan-card "Studied off-plan →" | The full log. This *is* the real action. |
| Three window events (`cr-open-mock-log`, `cr-open-off-plan-log`, `cr-open-log-for-date`) | **Duplication.** Three events, three handlers, one modal — differing only in two parameters. Collapsed to one in this gate, per the zero-duplication ruling. |

---

## 6. What this gate changes

1. `reconcileWeek` — `null` in `loggedHoursByDay` now means **UNKNOWN**: the day is
   excluded from `expected` and `actual`, exactly as a pre-join day is. `0` still means a
   real zero.
2. `weekly-plan-reconcile` — reads `day_outcome` and `study_duration_source` and passes
   `null` for a day whose duration was never collected. A day with **no row** still passes `0`.
3. The three log-open events collapse into one.

**Not changed:** `study_duration` values, the source vocabulary, G5's schema, completion
semantics, rest semantics, capacity sizing, A1/A2. No migration. No backfill.
