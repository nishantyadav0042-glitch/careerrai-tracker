# Architecture Cleanup — Report & Reasoning (10 Aug 2026)

> Goal: one implementation per feature, zero conflicting logic, zero legacy
> confusion. Method: a 4-front evidence-based audit (study-plan, notifications/
> crons, streaks+admin, repo-wide dead-code), then delete only what grep proved
> dead, with `tsc` + full test suite green after every batch. Nothing was
> commented out; provably-dead code was deleted. Genuinely ambiguous items were
> NOT touched — they're listed in §4 for your decision.

Branch: `claude/status-update-t1g5as` → `main`. Every batch is its own commit.

---

## 1. What was DELETED (done, verified, green)

Each item was verified by grep to have **zero live references** before removal;
`tsc` clean and **901 tests passing** after each batch.

### Batch 1 — dead parallel systems
| Removed | Was | Why dead |
|---|---|---|
| `cron/growth-nudges`, `cron/streak-risk` | retired push crons | not in `vercel.json`; returned `{retired:true}`; kept only as "revert handles" |
| `lib/notification-decision.ts` (+test), `scripts/simulate-nudges.mjs` | older budget/fatigue nudge engine | superseded by `notification-os.dispatch`; referenced only by its own test + sim script |
| `lib/replan-engine.ts` (+test) | old replan calculator | superseded by `plan-breach` + `full-plan`; only its own test imported it |
| `routine-engine.emergencyTask` | "Emergency Mode" helper | zero references anywhere |
| 6 fns in `streak-utils.ts` (`updateStreakAfterLog`, `checkAndCreateMilestones`, `getStreakStatus`, `getFlameState`, `shouldShowStreakGuard`, `getStreakDays`) | old client-side JS streak writer/milestones | superseded by the `upsert_log_and_streak` RPC + `liveStreak`/`momentumStreak`; zero call sites |
| Postgres `compute_momentum_streak` | shield-awarding streak fn | superseded by `upsert_log_and_streak`; zero `.rpc()` callers (dropped via migration) |

### Batch 2 — 16 orphan files (zero real importers)
`lib/analytics-advanced.ts` · `components/coach-line.tsx` + `api/coach-line/route.ts` (dead AI-caller pair — also removed from the Gemini-caller guard inventory) · `next-action-card.tsx` · `hooks/use-mock-drop-check.ts` + `mock-drop-intervention.tsx` · `sales-workspace.tsx` · `test-push-button.tsx` · `streak-restore-broadcast-button.tsx` · `whats-new-mastery.tsx` · `channel-join-gate.tsx` · `home/milestones.tsx` · `home/daily-insight-card.tsx` · `login/student-phone-login.tsx` · `student/exams/cat-result.tsx` · `tracker/urgent-help-banner.tsx`

### Batch 3 — dead exported functions
`analytics.computeStreak` (dead duplicate of live `utils.calcStreak`), `analytics.getHeatmapData`, and 5 never-wired companion copy generators (`shieldUsedCopy`, `dateMovedCopy`, `revisionDueCopy`, `timetableEndingCopy`, `comebackCopy`).

**Totals: ~24 files deleted, ~14 dead functions removed, 1 DB function dropped. Zero test regressions** (test count dropped only because two dead *test* files went with their dead modules).

### An audit claim I caught and rejected
The study-plan audit said `recommendedMockCount` was dead (only used by the dead replan-engine). **False** — it's called internally by `remainingMockHours`. I verified and **kept** it. (Every agent claim was re-grepped before acting.)

---

## 2. Duplicate systems FOUND — kept vs. flagged

| Feature | Implementations | Kept (latest/intended) | Status |
|---|---|---|---|
| "Which topic next" ranker | `topic-selector.chooseTopicForSection` **vs** `study-forecast.buildWeekPlan` — **opposite** coverage philosophy (`learning>not_started` vs the reverse) | daily selector (newer, research-rebalanced) | **§4-A — needs your call** (product behaviour) |
| Day assembler | `routine-engine.generateRoutine` (daily) **vs** `full-plan.buildFullPlan` (whole) | both live; must share one engine | **§4-A** |
| "Days since log" / "going cold" | `admin-filters.getGoingCold` (≥4d, from `streak_data`) **vs** `people-filter.deriveActivity` (≥7d, from `daily_reports`) | one definition needed | **§4-B — recommend I fix** |
| "Live streak" | `liveStreak` (alive if today/yesterday) **vs** `momentumStreak` (breaks after 1 miss) — mixed on one admin row | one per surface | **§4-C** |
| Shields | UI promotes auto-shield model; **no live code awards shields** | resolve end-to-end | **§4-C** |
| Nudge senders | `dispatch` (governed) **vs** `sendNotification` **vs** inline `sendPushToUser` | `dispatch` is the OS path | mostly legit (transactional); §4-D |
| IST day-string | `getTodayIST()` **vs** the same inline expression in 8+ files | `getTodayIST()` | **§4-E — DRY refactor, low risk** |
| Admin guard | `requireAdmin` (24 callers) **vs** `requireAdminCtx` (10) | pick one | §4-E |

---

## 3. Verified NOT dead (kept — do not remove)
- `admin-filters.ts` — the *new* OS Command screen (`founder-inbox`) depends on it. "Old" but load-bearing.
- The "No page" admin ops endpoints (`buddy-integration`, `integration-metrics`, `mentor-doors`, `kohli-push`, …) — intentional pageless founder tools (documented in `ADMIN-PANEL-INVENTORY.md`).
- `api/auth/sms-hook`, `api/cat-leads`, `api/push/received` (called by `public/sw.js`) — external callers.
- The 3 supabase client factories (server/client/admin) — legit split, not duplicates.
- `admin/students` old components (match-panel, allowlist, data-import, broadcast) — still rendered.

---

## 4. Needs YOUR decision (I did NOT delete/change these)

**A. The one plan engine (biggest).** Collapse the two topic rankers into one and make `generateRoutine`'s "today" = `buildFullPlan`'s day-0. This changes *which topic a real student sees* when the two rankers currently disagree, so pick the philosophy: **"finish what you started"** (my recommendation — the newer, research-rebalanced daily selector) vs "untouched topics first". Full reasoning in `docs/STUDY-PLAN-DESIGN-2026-08.md`.

**B. One "going cold" definition.** Two thresholds (4-day vs 7-day) from two tables (`streak_data` vs `daily_reports`) for the same concept — they disagree for real students. Low-risk to unify; tell me the threshold (recommend **4 days**, the earlier warning) and I'll make both call one function.

**C. Are shields a live feature?** No code awards shields anymore (the RPC that did was just dropped as dead), but the student UI (`momentum-shield-intro.tsx`) still promotes the auto-shield model, and the streak-restore route only *spends* shields. Either re-add shield-awarding, or remove shields from the UI/copy. Also pick the canonical live-streak fn (`liveStreak` vs `momentumStreak`).

**D. Notification gaps to confirm:** several send-types aren't in the shared daily budget list (`daily_insight`, `buddy_evening`, `founder_ping`, `plan_extended`) — bug or intentional exemption? And `buddy-evening` sends a **mentor-upsell push** that bypasses the OS budget — this is in tension with your own "notifications must never sell" rule that retired `growth-nudges`. Confirm keep or kill.

**E. Ambiguous files (created ~Aug 5–6, may be unshipped work — I won't delete without your word):** `google-connect-card.tsx` + `student-google-connect.tsx` (which one is real?), `home/breach-alert.tsx`, `lib/daily.ts` (Daily.co room creator — dead since the Google-Meet migration?), `lib/syllabus-feasibility.ts` (its own header says it's a *deliberate* compile-time guard). Plus low-risk DRY refactors: unify the IST day-string on `getTodayIST()`, and pick one admin guard.

**F. Retire 8 superseded admin pages?** `logged-today`, `live-streaks`, `going-cold`, `wants-buddy`, `streak-breakers`, `momentum`, `sales-queue`, `reminders` are now reproducible via `/admin/people` filters — but a couple carry bespoke actions (reminders' WhatsApp composer, streak-restore broadcast). Retire, or keep as shortcuts?

---

## 5. Risks discovered
- **Two plan engines will keep drifting** until §4-A is done — this is the source of the homepage↔whole-plan mismatch.
- **Shields are half-removed**: the awarding path is gone but the promise is still on screen — students are told about a safety net that no longer exists (§4-C). This is the highest-priority correctness item after the plan engine.
- Migrations are append-only history; the one DB function drop was done via a new migration, not by editing history.
