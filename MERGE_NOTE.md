# Merge Note — "Study Days" vs "Logged Days"

## What each meant before this change

In `TrajectoryWall.tsx` mini stats row (now removed):
- **Days logged** (`logCount`): count of all `daily_reports` rows in the last 90 days, regardless of `study_duration`. A 0-hour "I showed up" log counts.
- **Study days** (`daysStudied`): count of rows where `study_duration > 0`. Only actual study sessions count.

In `HeroCard.tsx`:
- **`currentStreak` labelled "study days"**: consecutive days where `study_duration > 0`. Resets to 0 on any break.

These are three genuinely different concepts. However, in practice:
1. Students almost never log 0-hour days deliberately — the difference between "logged" and "study days" was invisible to most.
2. Showing all three on one screen created confusion.

## Decision: merge to two visible metrics

1. **Day run** (streak) — consecutive days, resets on break. Shows in the HeroCard flame counter.
2. **Mission days** (daysInMission) — calendar days this month where study_duration > 0. Fills the 30-day ring. Resets at the start of each calendar month.

`logCount` is still stored in the DB but not shown on the student homepage — it is used internally for trajectory computation in TrajectoryWall.

The "study days" wording is removed from all student-facing UI and replaced with the monthly mission frame.
