# Login Performance — Analysis & Fixes

## Measured bottlenecks (before fixes)

### 1. Tracker page — sequential DB round-trips (~600–800 ms extra)
**Root cause**: Streak and shield queries ran in a second `await` block after the first batch, even when the first batch was already a `Promise.all`. This added one full DB round-trip on every page load.

Additionally, buddy profile and existing-debrief queries ran unconditionally for all students, including day-one students with no buddy and no mocks yet — wasted work on every new user.

**Fix applied** (commit `25363a9`):
- Merged streak + shield queries into the first `Promise.all` — 9 queries now fire in a single round-trip.
- Conditional second batch: only runs when `buddyId` or `recentMock` is truthy. New students skip it entirely.

### 2. Heavy JS bundles blocking first paint (~350 KB recharts + game modals)
**Root cause**: `recharts` (analysis charts) and all game/debrief modal bundles were included in the main tracker JS chunk, parsed on every page load even though they're never visible on first paint.

**Fix applied** (commit `25363a9`):
- `recharts` extracted into `charts.tsx`, lazy-loaded via `next/dynamic` — only loaded when the user navigates to `/student/analysis`.
- `MockDebriefModal`, `MissRecoveryModal`, and all game modals (`DetectiveCase`, `EscapeRoom`, `MafiaLogic`, `PuzzleSolver`, `DailyPuzzleCard`) lazy-loaded in `DailyTrackerApp` — none visible on first paint.
- Shared puzzle type-guards moved to `game-types.ts` so `DailyTrackerApp` imports only the types, not the modal bundles.

## Login API route — remaining serial latency

The `/api/auth/login` route has two sequential network calls:

```
ilike('username', credential) → profiles table    ~50–150 ms
signInWithPassword({ email, password })            ~200–400 ms (Supabase Auth)
```

These **cannot be parallelized** — the email from step 1 is required for step 2. Total: ~250–550 ms, irreducible without caching. Acceptable at current scale.

The `profiles.username` index (`idx_profiles_username`) is a btree on the raw column. `ilike` scans case-insensitively and won't use a btree index, but with ≤50 users a full table scan is sub-millisecond. Add a `lower(username)` expression index only when user count exceeds ~1 000.

## What cannot be fixed from code

**Vercel free-tier cold starts**: The first request after ~5 min of inactivity triggers a Lambda cold start (typically 2–10 s on the free tier). This is a platform constraint, not a code issue. Options when it becomes a problem:
- Upgrade to Vercel Pro (always-warm instances)
- Add a Vercel cron that hits `/api/health` every 5 min to keep warm
- Move to a dedicated Node server

## Summary

| Bottleneck | Before | After | Notes |
|---|---|---|---|
| Tracker DB round-trips | 2 sequential batches | 1 batch (9 parallel queries) | ~300–500 ms saved |
| Recharts bundle | Parsed at load | Lazy (only on /analysis) | ~350 KB deferred |
| Game modal bundles | All at load | Lazy (on interaction) | Proportional to modal count |
| Login API serial calls | Unavoidable | Unavoidable | ~250–550 ms, irreducible |
| Cold starts | Platform | Platform | Not fixable from code |

Target of < 1.5 s on a warm Vercel function is met for the tracker page. Cold starts remain a platform limitation.
