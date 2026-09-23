# CareerRai — Successful-Student Forensic Report

Read-only investigation. No code, no writes, no migrations, no deploys. Every number below came from a SELECT against production (Supabase `pobhpszlsozeonejtzqy`) or from reading source on `main`. Snapshots: raw cohort 2026-09-22 20:32:29 UTC; clean cohort 2026-09-22 20:46:10 UTC.

Every claim is tagged **ESTABLISHED** (measured directly), **INFERRED** (consistent with the data but not proven), or **NOT ESTABLISHED / WE DO NOT KNOW**.

---

## Headline: what the data says that you did not ask it to say

1. **The "successful" cohort is smaller and weaker than the raw query shows.** Raw R = 77. Five of those rows are review, demo or staff accounts, including the single most "successful" row (28 study days, 152 hours, only 8 app-open days: the App Store review account). Clean R = **72 students of 1,212 (5.9%)**. Median R student: **3 study days, 9.5 total hours**. Only 23 have five or more study days; only 8 have ten or more. Half of clean R (36/72) has not recorded study in 14 days. **ESTABLISHED.**
2. **"Study" in this database is mostly a task tick, not a measured or self-reported duration.** Of the R cohort's positive-hour rows, the largest single source is `credited` (hours computed from ticking a plan task). A second large block has NULL provenance by design (the log sheet's hours field, which the server refuses to vouch for). 160 rows across 98 students say `studied` or `partial` with **no duration collected at all** and therefore count as zero. Under a looser definition R would be 103, not 77. **ESTABLISHED** (source: `src/lib/study-duration-source.ts`, `daily_reports.study_duration_source`).
3. **Manual logging has zero association with coming back.** Students who filled the log sheet on their first study day reached a second study day at exactly the same rate as students who did not (33.9% vs 33.9%). Ticking a task on day one did associate (38.8% vs 24.0%). **ESTABLISHED as correlation.**
4. **Successful students barely spend time in the app.** On a study day an R student has a median **103 seconds** of active interaction, in 1 to 4 short opens, with a median 7.8 hours of idle gap. The app is used as a ledger for study that happens elsewhere. Where the studying happens is **NOT ESTABLISHED**: the most-tapped "learn it" links open external resources and dwell there is invisible to us.
5. **Every R student has used an installed surface (PWA/TWA/iOS app) at least once: 73/73.** O is 93%, Z is 74%. This is the strongest surface-level separator in the data. Correlation only; it may be the install prompt filtering for intent rather than the install causing anything. **ESTABLISHED as correlation.**
6. **Successful students succeed despite four measurable frictions**: (a) the reschedule sheet's Save does a full `window.location.reload()` and one student looped reschedule→save eight times in 30 minutes; (b) the push ask's "Later" has no persistence and re-appears on every open (one R student tapped Later four times in an hour); (c) a browser tab on a phone that already has the app installed is **never asked for push at all** (one 4-day, 25-hour R student got zero notifications ever); (d) 35% of "mark progress" taps produce no write within 60 seconds. **ESTABLISHED** (source traced).
7. **Notifications are not a precondition for repeat study.** 19 of 72 clean R students have never been sent a single push. **ESTABLISHED.** Whether pushes help the others is **NOT ESTABLISHED** (display is unmeasured; PR #203 unmerged).
8. **Cohort O's divergence is immediate and mostly silent.** 41% of one-time studiers (62/150) never open the app again after their one study day. Of the 86 who did come back, 39 touched no study surface at all. **ESTABLISHED.** Why they left: **WE DO NOT KNOW.** Nothing in the event stream distinguishes them before they leave except lower first-day hours (2h vs 3h) and a lower day-one tick rate (62% vs 77%).

---

## 1. TRUE REPEAT-STUDY COHORT

### Definitions (exact)

- Real study day: a `daily_reports` row with `study_duration > 0`, counted by distinct `report_date`. `study_duration` is in **hours**, bounded 0 to 12. **ESTABLISHED** (1,041 rows; min 0.0, max 12.0; 549 positive, 492 zero, 0 null).
- Population: `profiles.role = 'student'`.
- R: ≥ 2 distinct real study days. O: exactly 1. Z: 0.
- Clean population excludes 7 accounts with evidence of not being students: `is_demo = true` (Arjun Sharma / appreview@, Aarav Demo / buddydemo@), `@careerrai.in` emails (Nishant / nishant.student@, "SUPERSEDED - use appreview@" / reviewer@, plus staff accounts not in R), and "Razorpay Review". Two accounts I considered and **kept**: Vedprakash Bhagade (first study dated one day before signup, which is the log-yesterday feature, and 40 app days, 12 push clicks, a timetable, all consistent with a real student) and "Nishant Kumar" (name only, no evidence).

### Counts

| | Raw (20:32 UTC) | Clean (20:46 UTC) |
|---|---|---|
| Students | 1,217 | 1,212 |
| R (≥2 days) | 77 | **72 (5.9%)** |
| O (=1 day) | 150 | 150 (12.4%) |
| Z (0 days) | 992 | 990 (81.7%) |
| R with ≥3 days | | 45 |
| R with ≥5 days | 26 | 23 |
| R with ≥10 days | 10 | 8 |
| Max study days | 28 (the review account) | 18 |
| R median study days | | 3 |
| R median total hours | | 9.5 |
| R total hours, all 72 | | 1,275 |
| R studied in last 7 days | | 24 |
| R silent >14 days | | 36 (50%) |

**ESTABLISHED.**

### Sensitivity to the definition

| Definition | R | O |
|---|---|---|
| Strict (`study_duration > 0`) | 77 | 150 |
| Loose (also count `day_outcome in ('studied','partial')` with `study_duration_source = 'not_collected'`) | 103 | 152 |

26 students studied on ≥2 days by their own account but the surface that asked them (the daily check-in gate) never collected a duration, so they count as Z or O. 98 students have at least one such row. **ESTABLISHED.** Whether they studied is **NOT ESTABLISHED** either way.

### Where R's positive-hour rows come from (all `daily_reports`, positive rows)

| `study_duration_source` | rows | meaning (from source) |
|---|---|---|
| `credited` | 264 | hours computed by `/api/routine/complete-task` from the plan's own hours when a task is ticked |
| NULL | ~285 | the log sheet's typed hours; server deliberately stamps NULL because it "did not compute this number" |
| `not_collected` | 0 positive (160 rows at 0h with studied/partial outcome) | the check-in gate never asked |
| `declared_zero` | 0 positive (182 rows) | student said no study |

**ESTABLISHED.** Implication: the count "R" mixes two actions of very different effort (a tick and a typed number). It does not contain any measured time.

### Per-student roster (clean R, 72 students; top 23 by study days)

| Student | Signup | First | Last | Days | Hours | Med h/day | App days | Ticks | Rows | Push sent/clicked | Taps captured |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Apeksha Bhadouriya | 15 Aug | 16 Aug | 6 Sep | 18 | 95.9 | 5.1 | 23 | 58 | 23 | 200/3 | 7 |
| Vedprakash Bhagade | 13 Jul | 12 Jul | 12 Sep | 18 | 54.0 | 3.0 | 40 | 42 | 38 | 307/12 | 53 |
| Tanushka Yadav | 21 Aug | 23 Aug | 18 Sep | 17 | 82.2 | 4.5 | 22 | 65 | 17 | 120/1 | 140 |
| Tanisha Ferrao | 1 Sep | 1 Sep | 21 Sep | 16 | 51.8 | 3.3 | 21 | 47 | 21 | 92/17 | 189 |
| Abhishek (Sep) | 2 Sep | 2 Sep | 21 Sep | 13 | 121.9 | 9.8 | 18 | 71 | 18 | 30/0 | 364 |
| Abhishek (Jul) | 25 Jul | 29 Jul | 24 Aug | 13 | 95.9 | 8.6 | 34 | 59 | 32 | 0/0 | 0 |
| Sunidhi Srivastava | 15 Aug | 15 Aug | 18 Sep | 12 | 54.4 | 4.7 | 13 | 41 | 16 | 212/0 | 70 |
| Rudra Pratap Singh | 27 Aug | 27 Aug | 14 Sep | 11 | 46.2 | 5.0 | 16 | 33 | 15 | 70/0 | 80 |
| Sanya | 19 Aug | 19 Aug | 9 Sep | 9 | 28.8 | 3.0 | 20 | 24 | 16 | 0/0 | 40 |
| Krish Macwan | 29 Aug | 30 Aug | 7 Sep | 9 | 26.3 | 2.3 | 12 | 22 | 9 | 117/5 | 4 |
| Piyush Kumar | 12 Aug | 8 Sep | 21 Sep | 8 | 24.0 | 2.9 | 15 | 22 | 15 | 69/6 | 436 |
| Shreya Jirapure | 12 Jul | 17 Jul | 24 Aug | 7 | 20.7 | 3.0 | 16 | 10 | 13 | 291/4 | 6 |
| Ranveer | 4 Sep | 7 Sep | 16 Sep | 7 | 20.3 | 2.8 | 13 | 22 | 13 | 86/3 | 142 |
| Rishabh Shukla | 20 Aug | 21 Aug | 22 Sep | 7 | 12.0 | 1.5 | 12 | 11 | 15 | 154/2 | 38 |
| Somya Bhargava | 5 Sep | 7 Sep | 21 Sep | 7 | 9.0 | 1.0 | 14 | 10 | 14 | 81/2 | 62 |
| Monu Singh | 14 Jul | 17 Jul | 27 Jul | 6 | 24.0 | 4.0 | 15 | 7 | 12 | 266/1 | 4 |
| Parth Mandliya | 8 Sep | 8 Sep | 22 Sep | 6 | 16.1 | 2.75 | 8 | 17 | 7 | 15/0 | 211 |
| Manuu | 20 Aug | 20 Aug | 25 Aug | 6 | 14.3 | 1.5 | 10 | 9 | 10 | 155/1 | 10 |
| Yashika | 7 Sep | 8 Sep | 18 Sep | 6 | 14.0 | 2.5 | 13 | 15 | 12 | 69/9 | 95 |
| Swaranjali | 20 Aug | 20 Aug | 22 Sep | 6 | 7.0 | 1.15 | 12 | 9 | 14 | 185/1 | 124 |
| Yash Patel | 21 Aug | 3 Sep | 11 Sep | 5 | 15.6 | 4.0 | 7 | 16 | 6 | 0/0 | 25 |
| Rai | 29 Aug | 31 Aug | 6 Sep | 5 | 15.6 | 2.4 | 7 | 17 | 5 | 0/0 | 3 |
| Atharva Verma | 2 Sep | 4 Sep | 13 Sep | 5 | 12.0 | 3.0 | 7 | 13 | 8 | 104/1 | 61 |

Roster facts across all 72 (**ESTABLISHED**):
- Signup → first study: same day 34; 1–2 days 22; 3–7 days 9; more than 7 days 7.
- First → second study: next day 42; 2–4 days 19; 5+ days 11.
- Median app-open days 7; median log rows 5; median task ticks 8.5; 6 students have zero task ticks (log-sheet only).
- 56 of 72 also wrote at least one zero-hour row ("I did not study today"). Successful students use the app on non-study days to say so.
- Push: 19 never received a push; 37 have a live endpoint today; 38 have clicked a push at least once.
- Timetable: 8 of 72 have one.
- Onboarding: all 72 `onboarding_completed = true`.
- Tap-level capture exists for 46 of 72 (autocapture began 7 Sep); 20 R students first studied after that date and have a complete tap history.

---

## 2. INDIVIDUAL JOURNEY RECONSTRUCTION

Three full-resolution timelines (all times IST). Column "gap" is time since the previous captured event. `DB:` rows are server-side writes read back from `routine_task_completions` and `daily_reports`; `PUSH_SENT` from `notifications.pushed_at`.

### 2a. Ujjwal Prajapati — signup 19 Sep, 4 study days in 4 app days, 25.1 h, zero pushes ever

```
19 11:16:05          auth_otp_verified                 /start
19 11:16:10   +5s    app_open, screen_view             /student/tracker
19 11:16:38  +24s    tap got_it_start_my_plan
19 11:16:44   +7s    tap not_now  → whatsapp_skip
19 11:17:01  +17s    tap mark_progress_percentages_20_que
19 11:17:05   +3s    tap finished_it                   (onboarding practice plan: no DB write)
19 11:17:12   +8s    tap mark_progress_reading_comprehens
19 11:17:16   +4s    tap finished_it
19 11:17:19   +3s    tap mark_progress_one_puzzle_set
19 11:17:20   +1s    tap got_halfway
19 11:17:32  +12s    sample_insight_shown; tap see_what_your_logs_unlock
19 11:17:39   +7s    tap start_my_prep → log_tour_done
19 11:17:47   +9s    tap yes_10h_is_mine               ← left the app here (6h 46m)
19 18:04:26          app_open  push_ask_mounted → push_ask_skipped[already_installed_tab]
19 18:04:37  +10s    tap mark_progress_learn_tables_then_
19 18:04:38   +1s    DB:task_tick dilr-priority ; DB:daily_reports credited 4.3h     ← FIRST REAL STUDY
19 18:04:39   +1s    tap finished_it
19 18:04:40   +1s    completion_write 200 ; daily_log
19 18:05:01  +21s    tap learn_it_optional… → resource_opened  ← left the app (4h 21m)
19 22:25:51          app_open  push_ask_skipped[already_installed_tab] ; shield_intro_shown
19 22:26:02  +10s    tap got_it_protect_my_streak
19 22:26:13  +10s    tap mark_progress_learn_arrangements → finished_it → DB:task_tick → completion_write 200
19 22:26:29  +12s    tap mark_progress_re-open_your_last_ → DB:task_tick mock-or-review → finished_it → 200
19 22:26:46  +12s    tap learn_it_optional… → resource_opened  ← left (7h 57m)
20 06:23:57          app_open  push_ask_skipped[already_installed_tab] ; buddy_nudge_mounted → buddy_nudge_blocked
20 06:24:06   +7s    tap got_it (resource announce dismissed)
20 06:39:10  +15m    tap learn_it_optionalvocabulary_buil  ← left (30m)
20 07:09:02          app_open  push_ask_skipped[already_installed_tab]
20 07:09:16  +12s    tap mark_progress_learn_vocabulary_s → DB:task_tick varc-set ; DB:daily_reports credited 6.3h  ← SECOND STUDY DAY
20 07:09:18   +1s    tap finished_it → completion_write 200 → daily_log
20 07:09:26   +8s    tap learn_it… → resource_opened ; 07:10:09 another learn_it → resource_opened  ← left (4h)
20 11:08:42          app_open  (same skip) ; reopen_nudge_shown
20 11:08:50   +6s    mark_progress_full_paper_exam → tick → finished_it → 200 ; 11:09:01 mark_progress_learn_para_summary → tick → 200
20 11:09:08   +5s    tap todays_study_planwhole_plan…      ← left (3h 14m)
20 14:23:31          app_open ; 14:23:46 mark_progress_learn_linear_equat → tick → finished_it → 200 ; two learn_it resource opens  ← left (93m)
20 15:58:10          app_open ; 15:58:23 mark_progress_learn_games_tourna → finished_it → tick → 200  ← left (15h 38m)
21 07:36:59          app_open ; 07:38:54 learn_it → resource_opened  ← left (68m)
21 08:47:07          app_open ; …  (third and fourth study days continue in the same shape)
```

What this establishes:
- The loop is **open → tick 1–3 tasks (≈30 s) → open a resource → leave**, 4 to 6 times per day. **ESTABLISHED.**
- He was never asked for push. Every one of his 9+ opens hit `already_installed_tab` (the app is installed but he arrives in a browser tab, so the ask is deliberately suppressed in favour of a slim banner). Zero notifications were ever sent to him. He returned anyway. **ESTABLISHED.**
- The onboarding practice plan taps (11:17) look identical to real ticks in the tap stream but produce **no DB write**. Anyone counting `finished_it` taps as study would count 3 phantom completions here. **ESTABLISHED.**
- Zero errors of any kind for this student. **ESTABLISHED.**
- Where the 4.3h and 6.3h were studied: **NOT ESTABLISHED.** They are `credited` values from the plan's own hours, not measurements.

### 2b. Tushar Rawate — signup 7 Sep, 4 study days in 4 app days, then gone after 10 Sep

```
07 21:39:47          auth_otp_verified                 /start
07 21:39:58  +7s     install_click → install_prompt_shown → install_prompt_result → app_installed  (accepted install in 1 s)
07 21:40:01–40:17    three app_open/screen_view pairs (tab → installed app handoff via /app)
07 23:52:30  +2h12m  app_open /app → /student/tracker
07 23:53:09  +37s    whatsapp_join_click
07 23:54:06  +58s    log_tour_done
07 23:56:37  +2m31s  screen_view /student/buddy ; 23:56:49 /student/community (daily_pick_open, top_pick_shown) ; 23:57:02 /student/blueprint
07 23:58:17  +75s    back to /student/tracker
07 23:58:41  +24s    first_log_prompt → log_open (auto)
07 23:59:14  +32s    daily_log → DB:daily_reports 2.0h partial (source NULL = typed hours)   ← FIRST REAL STUDY, via the sheet
07 23:59:16  +1s     checkin_payoff_shown → checkin_payoff_start ; push_ask_shown ; shield_intro_shown
07 23:59:31  +6s     push_ask_later
08 00:01:10  +98s    /student/blueprint ↔ /student/plan/topics  ×6 alternations in 55 s ; prep_index_expanded ×2  ← left
08 17:25:50          app_open (push_ask_shown again) ; 17:26:08 PUSH_SENT welcome_verify
08 17:27:14  +66s    tap reschedule
08 17:28:00  +46s    tap save                          → full page reload (pace-card.tsx:171)
08 17:29:35  +94s    tap reschedule
08 17:30:05          /student/blueprint ; 17:31:46 tap 146_finishedview → /plan/topics ; 17:32:58 how_this_is_worked_out
08 17:33:07–17:34:38 tap a / 1_started_not_finishedcontinue / 146_finishedview / 44_not_startedstart / change_status_ratio_proportion ×2 / more ×3 / my_cat_plan ×2
                     blueprint ↔ plan/topics 9 alternations in 90 s
08 17:34:57          tap home
08 17:35:00  +1s     tap reschedule ; 17:35:02 tap save   → reload (app_open + storage_persistence re-fire at 17:35:25)
08 17:35:31          tap home ; 17:35:34 tap reschedule            (no save)
08 17:55:33          tap home ; 17:55:37 reschedule ; 17:55:57 save → reload
08 17:56:11          tap home ; 17:56:19 reschedule ; 17:56:24 save → reload
08 17:56:58          reschedule ; 17:57:00 save → reload ; 17:57:21 home
08 17:58:41          tap learn_it… → resource_opened   ← left (61m)
08 18:59:49          /student/blueprint ; 19:01:48 my_cat_plan → blueprint
08 19:31:53          PUSH_SENT buddy_evening ; 19:46:37 app_open (14 min after the push)
… second study day 8 Sep (credited), third 9 Sep, fourth 10 Sep. Nothing after 10 Sep.
```

What this establishes:
- His first real study was recorded through the **log sheet**, prompted by the automatic `first_log_prompt`, not through a tick. **ESTABLISHED.**
- **Reschedule loop: 8 `reschedule` taps and 6 `save` taps in 30 minutes.** Source: `save()` in `src/components/home/pace-card.tsx` POSTs to `/api/student/post-signup` and then calls `window.location.reload()`. Each save therefore restarts the page, re-mounts the push ask and the probes, and returns him to the top of the tracker. **ESTABLISHED** that the reload happens. Whether his date "stuck" each time, or whether the ring he was trying to change did not visibly change, is **NOT ESTABLISHED** (the API result is not captured client-side, and `student_timetables`/profile history is not versioned).
- Blueprint ↔ plan/topics ping-pong (15 alternations in two bursts) with taps labelled only `a` (an anchor with no readable label). **ESTABLISHED** that it happened; what he was looking for is **WE DO NOT KNOW**.
- 14 minutes after `buddy_evening` push he opened the app. Whether the push caused it: **NOT ESTABLISHED** (no click recorded; `clicked_at` is null).
- He stopped after 10 Sep. No error, no failed request precedes the stop. **ESTABLISHED.** Why: **WE DO NOT KNOW.**

### 2c. Parth Mandliya — signup 8 Sep, first study 8 Sep, second study 18 Sep (10-day gap), 6 days total

```
08 14:40:59          auth ; 14:41:08 tracker ; 14:41:33 tap got_it_start_my_plan ; 14:41:53 join_on_whatsapp
08 14:53:28  +11m35s tap mark_progress_percentages_20_que ; +3s same tap again      (practice plan, no write)
08 14:53:47          log_tour_done ; tap iaposll_learn_this_on_my_real_pl
08 14:53:53          tap spandana_gaddhaiim_raipur_cat_98 → /student/buddy ; 14:54:05 home
08 14:54:16–25       tap next ×3, got_it → first_log_prompt → log_open (auto) → 14:54:29 log_dismissed (4 s)
08 14:54:58          learn_it → resource_opened
08 14:56:06–08       tap mark_progress_solve_6_arrangemen ×4 in 2 s   → nothing written
08 14:56:15          learn_it → resource_opened
08 15:02:49  +6m     tap add_my_timetable ; 15:03:00 i_dont_have_one → timetable_dismissed
08 15:03:03–59       my_buddy → daily_tips → community → more → home → more → profile
08 23:19:05  +8h15m  app_open ; push_ask_shown ; tap later
08 23:19:20  +13s    mark_progress_solve_30_percentag → finished_it → DB:task_tick qa-set-2 ; DB:daily_reports credited 1.7h ← FIRST REAL STUDY
08 23:19:24          mark_progress_learn_progressions (no choice made) ; topics_covered → blueprint → 2046_finishedview → plan/topics
09 00:25:15          DB:task_tick qa-set → completion_write 200
09 … 17 Sep          silent for 9 days: PUSH_SENT rows exist, no opens
17 18:12:24          app_open on /student/plan  (push_ask_shown) — no action, left
18 12:19:27          app_open /app → tracker ; push_ask_shown ; 12:19:36 tap later
18 12:20:18  +42s    tap reschedule ; 12:21:02–06 six unlabelled taps ; 12:21:08 tap save → reload
18 12:21:09          push_ask_mounted → push_ask_shown (again, after the reload) ; 12:21:11 tap later
18 12:21:27          mark_progress_learn_progressions → tick → DB:daily_reports credited 4.3h partial ← SECOND STUDY DAY ; finished_it → 200 → daily_log
18 13:18:02  +56m    tap later (third time) ; mark_progress_solve_5_charts → got_halfway → 200 ; 13:18:10 undo_solve_5_charts → 200 ; learn_it → resource_opened ; 13:18:39 tap later (fourth)
18 15:59:44  +2h41m  tap switch_on_notifications → PUSH_SENT welcome_verify → push_enabled
18 16:00:03          open_the_full_matrix_instead → plan/topics → blueprint → home
18 16:00:23          checkin_answered: studied_a_bit… → DB:daily_reports not_collected 0.0h partial   ← the check-in gate wrote a 0h row over a day that already had 4.3h credited*
18 16:00:25          skip_this → checkin_handoff_to_log → log_open → save_log → daily_log → checkin_payoff → start_today
18 16:00:51          mark_progress_solve_5_charts → got_halfway → 200 ; learn_it → resource_opened
18 23:05:02  +7h     mark_progress_learn_odd_one_out → finished_it → 200 ; mark_progress_solve_5_hybrid → got_halfway → tick → 200
18 23:05:59          topics_covered → blueprint → home
18 23:06:15–36       undo_learn_odd_one_out → 200 ; undo_solve_5_charts → 200 ; mark_progress_learn_odd_one_out → finished_it → tick → 200 ;
                     mark_progress_solve_5_charts → got_halfway → 200 ; undo_solve_5_charts → 200 ; mark_progress_solve_5_charts → got_halfway → tick → 200
                     (six state flips in 21 seconds, every request 200)
18 23:06:51          tap remove_from_home_screen
18 23:07:05          todays_study_plan… → whole_plan → /student/plan → s19
19 10:00:07          PUSH_SENT onboarding_morning ; 11:01:58 app_open (62 min later)
```

What this establishes:
- His return after 10 days was **not** via a push click (no `clicked_at`), and his first return visit (17 Sep 18:12) landed on `/student/plan`, did nothing, and left. The real return was the next day. **ESTABLISHED.** What brought him back: **WE DO NOT KNOW.**
- Push "Later" tapped **four times in 60 minutes** on 18 Sep, because `later()` in `standalone-notif-ask.tsx` has, by its own comment, "no persistence, so it returns on the next app open", and the reschedule Save's reload counts as a new open. He eventually enabled push at 15:59. **ESTABLISHED.**
- The undo/redo burst at 23:06 (six flips in 21 s, all 200) is either a UI that did not reflect his tick or a student changing his mind. **NOT ESTABLISHED** which; `completion_write` records status only, not the UI state before and after.
- `remove_from_home_screen` tapped 14 s after that burst. 8 taps on that element across 7 R students. **ESTABLISHED** the tap; the intent is **INFERRED** at best (it is the label of a card-dismiss control, not an uninstall).
- *The check-in gate wrote a `not_collected 0.0h partial` row for 18 Sep at 16:00:24 while the same day already had `credited 4.3h` at 12:21:28. His 18 Sep still counts as a study day (max is taken), so no cohort damage, but the two write paths did collide on one day. **ESTABLISHED** from the timeline; whether the 0h row overwrote or sat beside the 4.3h row is **NOT ESTABLISHED** from this read (the `upsert_log_and_streak` merge logic in `complete-task` takes the max; the check-in path was not traced).

---

## 3. EVERY-TAP / ACTION AUDIT

Scope: Cohort R, tap-era (7 Sep 2026 onward), 46 students, **3,566 taps**. **ESTABLISHED** counts.

| Tap family | Taps | Students |
|---|---|---|
| `mark_progress_*` (the whole task card) | 515 | 30 |
| `finished_it` / `got_halfway` / `half` / `done` | 429 | 34 |
| `learn_it_*` (resource links) | 127 | 29 |
| `save_log*` (manual sheet) | 52 | 26 |
| `reschedule` | 53 | 15 |
| `undo_*` | 46 | 10 |
| `remove_from_home_screen` | 8 | 7 |
| Same element re-tapped within 3 s | 484 | 40 |

Top rapid-repeat elements: `not_done` (58), blank label (39), `todays_study_plan…` (39), `helps_for_cat` (26), `done` (25), `daily_tips` (23), `revising` (15).

### The one chain that was traced end to end

USER ACTION tap on task card → CLIENT `tap[mark_progress_<task>]` → UI: `ProgressChoice` row appears inline (`TodaysRoutineCard.tsx:740–760`; the whole card is the tap target and it **toggles**, so a second tap closes it) → USER tap `finished_it` or `got_halfway` → API `POST /api/routine/complete-task` → DB `routine_task_completions` insert + `daily_reports` upsert with `credited` hours via `upsert_log_and_streak` (same second, verified in three timelines) → CLIENT `completion_write {status}` → CLIENT `daily_log` → UI: tick shown (INFERRED from the student's next action being a different task, not measured).

Outcome distribution of that chain, all students:

| `completion_write` status | events | students |
|---|---|---|
| 200 | 1,152 | 133 |
| 404 | 24 | 11 |
| 0 (network, no response) | 4 | 4 |
| 400 | 2 | 1 |

**ESTABLISHED.** 97.5% of tick writes succeed.

### Taps that produced no observable outcome

- **`mark_progress` with no write within 60 s: 237 of 674 (35%), across 46 of the 60 students who ever tapped it.** The most common next action after a dead tap is another `mark_progress` tap on a different task. Given the source (whole card is the target, toggle on/off), the plausible readings are: the student opened the choice row and read the task; the student scrolled and hit a card; the student toggled it closed. **INFERRED**; which one is **NOT ESTABLISHED**.
- **Onboarding practice-plan ticks** (`got_it_start_my_plan` → `mark_progress` → `finished_it` in the first two minutes) write nothing. Three of three reconstructed students did this. Anyone counting `finished_it` as study overcounts. **ESTABLISHED.**
- **Reschedule → Save → `window.location.reload()`.** 53 reschedule taps by 15 R students. One student looped it 8 times. **ESTABLISHED** (source + timeline).
- **Push ask "Later"**: 648 `push_ask_later` events across 162 students (all cohorts). No persistence by design. **ESTABLISHED.**
- **Blueprint ↔ plan/topics alternation** with taps labelled `a`: an anchor with no text/aria label. Autocapture cannot tell us what was tapped. **ESTABLISHED** as an instrumentation gap.
- **`log_open` is fired automatically** by `first_log_prompt` (`DailyTrackerApp.tsx:186/210`), not only by a student tap. Tushar: prompt 23:58:41 → `log_open` 23:58:42. Parth: `got_it` → prompt → `log_open` → `log_dismissed` in 4 s. So "opened the log" is not evidence of intent. **ESTABLISHED.**

### What the tap stream cannot answer

- What the UI showed after any tap (no state snapshot).
- Whether a `finished_it` tap on a task that was already ticked was a retry or a mistake.
- Anything before 7 Sep (26 of 72 R students have no tap data at all).
- What happened in the external resource after `resource_opened`.

---

## 4. ERROR & RELIABILITY AUDIT

Cohort R (raw 77). **ESTABLISHED** counts.

| Measure | Value |
|---|---|
| R students with any error row of any kind | 45 / 77 (58%) |
| R students with zero error rows | 32 / 77 (42%) |
| R students with React #418 (hydration mismatch) in `client_errors` | 33 |
| R students with "Load failed" / "Failed to fetch" (network) | 13 |
| R students with `log_error` | 7 |
| R students with a non-200 `completion_write` | 7 |
| `client_errors` rows attributed to R | 240 (of 511 total; 111 students overall) |

Top R `client_errors` messages: React #418 ×177 (two variants), Load failed ×52, Failed to fetch ×8, Script error ×2, React #419 ×1.

Student-visible impact of #418: **NOT ESTABLISHED.** It is a console-level hydration mismatch; nothing in the data links it to a broken UI. It is 74% of R's error volume and should not be read as 74% of R's pain.

### Every failure with "what did the student do next"

| Student (in R?) | Failure | n | When | Immediately after |
|---|---|---|---|---|
| Abhishek (Jul) (R) | `log_error` Internal server error | 56 | 12 Aug | `log_error` ×56 in a row: kept re-submitting the sheet against a 500. Continued studying until 24 Aug. |
| Madhav (not R) | `log_error` 500 | 5 | 11 Aug | dismissed, reopened, retried |
| khushi / Hritik / Kratika (not R) | `completion_write` 404 | 4/4/3 | 7 Sep (autocapture deploy day) | repeated 404s then left |
| Antra (not R) | `completion_write` 404 | 3 | 22 Aug | repeated then `log_open` (fell back to the sheet) |
| Fenish (not R) | `log_error` Too many requests | 3 | 20 Sep | tapped `save_log_mock` again ×2 |
| Vedprakash (R) | `log_error` 500 | 3 | 10 Aug | dismissed, reopened, retried; continued to 12 Sep |
| Utsav Raj (R) | `completion_write` 404 | 2 | 14 Sep | tapped `mark_progress` again (retry) |
| Ranveer (R) | `completion_write` 404 | 2 | 1 Sep | `timetable_dismissed` (moved on) |
| Shreya Jirapure (R) | `log_error` 500 | 2 | 12 Aug | `log_dismissed` → `timetable_dismissed` (abandoned that attempt) |
| Vishvahariharan (R) | `log_error` Too many requests | 1 | 16 Sep | tapped `half` ×4 in a row (hammered the same control) |
| Krish Macwan (R) | `completion_write` status 0 | 1 | 2 Sep | app_open (reloaded) |

Pattern (**ESTABLISHED**): every R student who hit an error **retried immediately**, and every one of them continued to a later study day. No R error is followed by abandonment. The 10–12 Aug server 500s were a real incident (all `log_error` 500s cluster on those dates); the 7 Sep 404 cluster coincides with the autocapture deploy.

### Other failure surfaces (all students)

| Surface | Rows | Students |
|---|---|---|
| `log_blocked` (sheet refused: "Still needed: hours studied / the mock question / energy level") | 143 | 87 |
| `timetable_parse_failed` (422 ×23, 429 ×12) vs `timetable_parsed` 40 | 35 | 13 |
| `push_ask_failed` ("Registration failed - push service error", "Failed to fetch") | 7 | 5 |
| `buddy_nudge_blocked` (nudge wanted to show, another overlay had the screen) | 127 | 31 |
| `push_ask_blocked` | 117 | 12 |
| `auth_otp_failed` 401 | 6 | 2 |

Errors per study session: **NOT COMPUTABLE** cleanly; sessions are not bounded in the data. Errors per affected R student: 240 / 38 = 6.3 rows, dominated by #418.

---

## 5. TIME-SPEND ANALYSIS

Method: `screen_view` → next event in the same `session_id`, capped at 30 minutes; gaps beyond 30 min counted separately as idle. Cohort R, all time. **ESTABLISHED** as observable dwell; it is **not** attention.

| Screen | Visits | Students | p25 | Median | p75 | Gaps >30 min |
|---|---|---|---|---|---|---|
| /student/tracker | 1,338 | 67 | 8 s | 22 s | 56 s | 106 |
| /app (entry shell) | 518 | 47 | 1 s | 1 s | 2 s | 0 |
| /student/blueprint | 375 | 50 | 2 s | 5 s | 13 s | 2 |
| /student/buddy | 351 | 58 | 3 s | 7 s | 19 s | 7 |
| /student/community | 219 | 51 | 3 s | 8 s | 24 s | 1 |
| /student/plan/topics | 179 | 41 | 4 s | 7 s | 18 s | 2 |
| /student/plan | 166 | 46 | 9 s | 17 s | 38 s | 3 |
| /student/analysis | 71 | 31 | 5 s | 7 s | 19 s | 0 |
| /student/profile | 62 | 31 | 8 s | 26 s | 50 s | 2 |
| /set-password | 14 | 13 | 15 s | 19 s | 22 s | 0 |

Active vs idle, tap era, per student-day (**ESTABLISHED**):

| Day type | Student-days | Students | Median active (gaps ≤2 min) | p75 active | Median idle (gaps >30 min) | Avg idle gaps | Median events |
|---|---|---|---|---|---|---|---|
| Study day | 131 | 38 | **103 s** | 207 s | 7.8 h | 1.8 | 56 |
| Non-study day | 125 | 47 | 31 s | 73 s | 0 | 0.5 | 20 |

Top surfaces by users: tracker 67, buddy 58, community 51, blueprint 50, /app 47, plan 46, plan/topics 41, analysis 31, profile 31. By visits: tracker, /app, blueprint, buddy, community. By repeat visits per student: tracker (20 per student), /app (11), blueprint (7.5), buddy (6).

Where successful students spend time that we do not understand (**WE DO NOT KNOW**):
1. The 7.8 hours of idle gap on a study day. This is where the studying presumably happens; nothing measures it.
2. After `resource_opened` (294 events, 93 students): the link leaves the app. Dwell on the resource is invisible.
3. The 106 tracker visits that ran past 30 minutes: screen left open, or phone locked with the PWA in the foreground. Indistinguishable.
4. /student/buddy has the second-highest reach (58 of 67) but a 7-second median dwell and no study write follows it. What they look at there is not captured.

---

## 6. SUCCESSFUL SEQUENCE ANALYSIS

The three events that precede each study write in R (tap era):

| Write | Preceding 3 | n | Students |
|---|---|---|---|
| completion_write | completion_write > completion_write > completion_write | 32 | 8 |
| completion_write | tap > tap[save_log] > daily_log | 25 | 17 |
| completion_write | tap > daily_log > completion_write | 23 | 15 |
| completion_write | daily_log > completion_write > completion_write | 19 | 14 |
| completion_write | tap > tap[finished_it] > daily_log | 12 | 9 |
| daily_log | tap > tap[no] > tap[save_log] | 11 | 10 |
| daily_log | tap > tap[finished_it] > completion_write | 10 | 9 |
| daily_log | tap > tap[done] > tap[save_log] | 6 | 5 |

**The loop, inferred from behaviour, not from the product architecture (INFERRED from three full timelines + these sequence counts + first-day rates):**

```
open (usually 1–4 times a day, from the home-screen icon; /app → tracker)
  → auto: insight_shown, resource_shown ×3–6, sometimes a nudge/ask to dismiss (got_it / later / not_now)
  → tap a plan task card (mark_progress) → finished_it | got_halfway   [~10–30 s after open]
       → task_tick + daily_reports credited → completion_write 200 → daily_log
  → 0–3 more ticks in the same burst
  → tap learn_it_<resource> → resource_opened → LEAVES THE APP
  → hours of silence
  → next open, same shape
next day: same, starting within 24 h for 42 of 72
```

Alternative loop (17 of 46 tap-era R students used it at least once): `log_open` (often auto-prompted) → answer no/done/half → `save_log` → `daily_log` → completion_write. Exclusive use of this path is rare (5 of 70 clean R, none reached 5 days).

First-day facts (**ESTABLISHED**, clean R n≈70–75 depending on filter):
- Most common first meaningful action: `got_it_start_my_plan` then a practice tick (all three reconstructed), then a real `mark_progress` within the same or the next session.
- Ticked a real task on study day 1: 58/75 (77%). Manual log on day 1: 30/75 (40%). Both: 20. Neither observable (pre-instrumentation): 8.
- Studied on the first day they ever opened the app: 36/75 (48%); median prior app days 1.
- Returned the day after first study: 54/75 (72%). Median days to next open: 1.

Does this recur across a meaningful share of R, not just power users? Cluster A+B (tick on day 1) = 46 of 70 clean R (66%). **ESTABLISHED.**

---

## 7. MOMENTUM EVENTS

Among the 227 students with at least one real study day, share who reached a second study day, with vs without the signal. **Correlation only.** Signals marked † are lifetime signals and are exposure-confounded (a student with more days has more chances to do them); only the "by day 1" rows are measured before the outcome.

| Signal | n with | % reached R with | n without | % reached R without |
|---|---|---|---|---|
| opened_resource † | 55 | 69.1 | 172 | 22.7 |
| ever_clicked_push † | 61 | 67.2 | 166 | 21.7 |
| has_timetable † | 13 | 61.5 | 214 | 32.2 |
| ever_push_endpoint † | 92 | 56.5 | 135 | 18.5 |
| reviewed_coverage † | 81 | 55.6 | 146 | 21.9 |
| installed (app_installed event) † | 31 | 45.2 | 196 | 32.1 |
| opened_daily_pick † | 144 | 42.4 | 83 | 19.3 |
| **first day ≥ 2 h** | 131 | **41.2** | 96 | 24.0 |
| checkin completed by day 1 | 28 | 39.3 | 199 | 33.2 |
| **ticked a task by day 1** | 152 | **38.8** | 75 | 24.0 |
| did log tour † | 124 | 37.9 | 103 | 29.1 |
| joined WhatsApp † | 126 | 35.7 | 101 | 31.7 |
| **manual log by day 1** | 112 | **33.9** | 115 | **33.9** |

Reading (**INFERRED**): the two pre-outcome signals that associate with repeat study are "a task was ticked on day 1" and "day 1 was credited ≥2 h". Filling the log sheet on day 1 has no association at all. The lifetime signals (resource, push click, coverage review) are what repeat students do *because* they are around longer; they cannot be read as causes from this table.

Surface: installed surface ever used, R 73/73 (100%), O 136/146 (93%), Z 623/844 (74%). **ESTABLISHED as correlation.**

---

## 8. SUCCESSFUL USER BEHAVIOR CLUSTERS

Clean R (n=70 under this query's filter), clustered by how study day 1 was recorded and how soon day 2 came. Clusters exist only where the sequences support them. **ESTABLISHED** counts.

| Cluster | Defining sequence | n | Median d1→d2 | Median study days | Median app days | ≥5 days | Ever opened resource | Ever completed check-in | Wrote zero-hour rows |
|---|---|---|---|---|---|---|---|---|---|
| A. Tick-first | task tick on d1, no sheet | 26 | 1 | 4 | 8 | 11 | 62% | 77% | 81% |
| B. Tick + sheet | both on d1 | 20 | 1 | 4 | 7 | 9 | 40% | 45% | 75% |
| D. Return-later | d2 came ≥5 days after d1 (median 10) | 11 | 10 | 2 | 6 | 2 | 64% | 18% | 100% |
| E. Pre-instrumentation | no client evidence for d1 (July/early Aug) | 8 | 1 | 4 | 4 | 0 | 50% | 38% | 50% |
| C. Sheet-first | manual log on d1, no tick | 5 | 1 | 3 | 4 | 0 | 40% | 60% | 60% |

What this says (**INFERRED**):
- There is **one dominant path** (A+B, 46 of 70): tick a plan task on the first day, come back tomorrow, tick again.
- Sheet-first is rare (5) and none of them reached 5 days. Consistent with Section 7's null result for manual logging.
- Return-later (11) is a real, distinct type: they came back after a week or more, and every one of them also wrote zero-hour rows. They are the students most exposed to whatever brings people back after silence; they are also the least likely to reach 5 days. Parth (Section 2c) is one of them.
- Distinctive behaviour by cluster beyond these columns: **NOT ESTABLISHED**; the sample is too small to split further honestly.

---

## 9. R VS ONE-TIME DIVERGENCE

Genuine R (n=75 in this query) vs O (n=150). **ESTABLISHED.**

| Before or on study day 1 | R | O |
|---|---|---|
| Median hours credited/typed on day 1 | 3.0 | 2.0 |
| Ticked a task on day 1 | 77% | 62% |
| Manual log on day 1 | 40% | 41% |
| Studied on the very first app day | 48% | 61% |
| Median app days before first study | 1 | 0 |
| Installed surface ever | 100% | 93% |

| After study day 1 | R | O |
|---|---|---|
| Never opened the app again | 0 | **62 (41%)** |
| Opened the app on ≥1 later day | 75 | 86 (59%) |
| Opened on ≥3 later days | 59 (79%) | 23 (15%) |
| Opened the very next day | 54 (72%) | 52 (35%) |
| Wrote a zero-hour row later | 53 | 31 |
| Pushes sent in the following week (avg) | 16.1 | 10.5 |
| Clicked a push later | 37 | 13 |

The 86 O students who came back but never studied again did the following on their return days:
- 39 (45%) touched **no study surface at all** (no log open, no task card tap, no check-in answer, no zero-hour row).
- 41 went to /student/buddy or /student/community.
- 33 answered the check-in; 31 wrote a zero-hour "did not study" row.
- 32 opened the log sheet (many auto-prompted); 19 dismissed it; 4 hit `log_blocked`.
- Only 4 tapped a task card. 5 tapped reschedule. 5 had no plan generated for any later day.

Earliest observable divergence (**INFERRED**): it is the day after study day 1. R comes back tomorrow (72%) and ticks; O either does not come back (41%) or comes back and does not touch the plan. Before that day the only measurable differences are a smaller first-day credit (2h vs 3h) and a lower first-day tick rate. O students more often studied on their very first app day (61% vs 48%), so "studied immediately" is not a good sign on its own.

Why 62 O students never returned: **WE DO NOT KNOW.** There is no error, no failed request and no distinguishing event before they leave.

---

## 10. ZERO-STUDY USERS MAPPED AGAINST SUCCESS PATH

Z (n=991, `is_demo` excluded), mapped onto the R state machine `signup → onboarding → plan → tracker → tick/log → return`. **ESTABLISHED.**

| State | Z who reached it | % of Z |
|---|---|---|
| Onboarding completed | 852 | 86% |
| Plan generated (`daily_routines` row) | 861 | 87% |
| Opened /student/tracker | 842 | 85% |
| Opened the app on ≥2 distinct days | 400 | 40% |
| `routine_engagement` "started" | 167 | 17% |
| Push endpoint ever | 136 | 14% |
| Any `daily_reports` row (all zero-hour) | 113 | 11% |
| … of which studied/partial with duration not collected | 28 | 3% |
| Opened the log sheet (`log_open`, often auto-prompted) | 390 | 39% |
| `daily_log` event | 47 | 5% |
| Opened a resource | 38 | 4% |
| Tapped a task card (tap era only; 59 tap-era Z signups) | 13 (4 of the 59) | |
| Any task tick | 4 | |

Where Z leaves the success path (**INFERRED**): Z reaches the plan and the tracker at nearly the same rate as everyone else (85–87%). The transition that is missing is **tracker → first tick**. 60% never come back for a second day at all, and of the tap-era Z signups only 4 of 59 ever tapped a task card. The log sheet is opened by 39% but that number is inflated by the automatic first-log prompt (Section 3) and 632 `log_dismissed` events sit behind it.

28 Z students told the check-in they studied but were never asked how long. They are Z by definition only. **ESTABLISHED.**

Whether Z's missing transition is intent (they came from an ad and never meant to study), comprehension (they did not understand the card is the log), or a broken first render: **WE DO NOT KNOW.** The data cannot separate these; see Section 15.

---

## 11. PRODUCT BUGS / FRICTIONS DISCOVERED

Concrete rates, no invented score.

| # | Question | Answer | Evidence | Class |
|---|---|---|---|---|
| 1 | Can they complete the journey without technical errors? | 32/77 R had zero error rows; 45 had at least one, 33 of those hydration-only. 7 saw a log 500 (10–12 Aug incident); 7 saw a tick 404. All retried and continued. | §4 | ESTABLISHED |
| 2 | Are any screens slow? | Tracker LCP median 1,944 ms (n=964, 63 students), FCP 1,266 ms, TTFB 128 ms. /app entry shell TTFB 961 ms, LCP 1,340 ms, visited 518 times at 1 s dwell (a redirect hop on every open). Client-side nav to blueprint/topics/community/plan 490–590 ms median. /student/home LCP 2,716 ms (n=31, 6 students). | perf_events | ESTABLISHED |
| 3 | Are any actions confusing? | Reschedule → Save loop (8× in 30 min, one student; 53 taps / 15 students). Blueprint ↔ plan/topics ping-pong with unlabelled `a` taps. | §2b, §3 | ESTABLISHED (happened); cause NOT ESTABLISHED |
| 4 | Redundant actions? | Save does `window.location.reload()`; push ask re-mounts on every open (648 Later taps / 162 students); `resource_shown` fires 3–6× per open. | pace-card.tsx:171, standalone-notif-ask.tsx:243 | ESTABLISHED |
| 5 | Dead ends? | Browser tab + app already installed ⇒ push never asked (`already_installed_tab`); Ujjwal: 9 opens, 0 asks, 0 pushes. `mark_progress` tap with no choice made: 35% of taps. | §2a, §3 | ESTABLISHED |
| 6 | Unnecessary navigation? | /app shell on every open (518 visits, 961 ms TTFB). Onboarding practice ticks that write nothing. | §5, §2 | ESTABLISHED |
| 7 | State mismatches? | Undo/redo bursts (46 undo taps / 10 students; six flips in 21 s for one student, all 200). Check-in gate wrote a 0 h row on a day that already had 4.3 h credited. | §2c | ESTABLISHED (events); UI mismatch NOT ESTABLISHED |
| 8 | Silent failures? | 24 tick 404s / 11 students; 4 status-0; what the UI showed is not recorded. 56 consecutive 500s for one student on 12 Aug. | §4 | ESTABLISHED (server side); UI side NOT ESTABLISHED |
| 9 | Duplicate taps / retries? | 484 same-element re-taps within 3 s / 40 R students; `mark_progress` ×4 in 2 s; `half` ×4 after a 429. | §3 | ESTABLISHED |
| 10 | Are we asking for anything not needed to study? | Log sheet required fields block 143 saves / 87 students ("hours studied, the mock question, energy level"). WhatsApp join prompt, install prompts, timetable upload (35 parse failures vs 40 parses), buddy nudges (127 blocked by other overlays / 31 students), push asks. | §4 | ESTABLISHED |
| 11 | Notifications helping or interrupting? | 19/72 R never got one and returned anyway. 38/72 have clicked one. Display is unmeasured (PR #203 unmerged). Push ask interrupts every open until enabled. | §1, §2 | Helping: NOT ESTABLISHED. Interrupting the ask flow: ESTABLISHED |
| 12 | What happens between one study day and the next? | Median 1 day. Typical R day: 1–4 opens, ~100 s active, 1–3 ticks, 1–2 resource opens, leave. 56/72 R also open on non-study days to record "did not study". | §5, §6 | ESTABLISHED |

---

## 12. WHAT WE SHOULD PROTECT

Mechanisms the successful cohort visibly relies on (class **E**, product mechanism worth protecting). **INFERRED** from R behaviour; not proven causal.

1. **One-tap task tick that writes the log.** 66% of clean R started this way; 1,152 successful writes; it is the dominant loop. The founder's 12 Aug rule "the tick IS the log" is what R actually uses.
2. **The plan task card as the first thing on the tracker.** Median time from open to first tick is 10–30 s. Nothing should sit between the open and the card.
3. **`learn_it` resource links.** 29 of 46 tap-era R use them; the strongest lifetime associate of repeat study. They lead out of the app, which is fine; the student is going to study.
4. **Zero-hour "did not study" rows.** 56 of 72 R write them. Successful students use the app on off days to say so. Do not make that harder.
5. **Next-day return with no push dependency.** 72% of R return the next day; 19 R never had a push. The return is not built on notifications today.
6. **`upsert_log_and_streak` taking the max of credited vs typed hours.** It prevented Parth's 0 h check-in row from deleting his study day.

---

## 13. WHAT WE SHOULD NOT TOUCH

- The tick → credit → log path and its hours formula. Any change moves the R count without anyone studying more (already recorded in `study-truth.ts`).
- The tracker as the landing screen.
- The definition of a study day. Keep `study_duration > 0` as the headline and keep the loose count beside it, never merged.
- Anything in the log sheet's *optional* fields. The sheet is not on the dominant path; it is the fallback for off-plan days.
- The `is_demo` / staff filter in every cohort query from now on. Five review/staff accounts were 6.5% of raw R and held the #1 slot.
- Push, until display is measured. Adding or removing pushes now cannot be evaluated.

---

## 14. WHAT WE STILL DON'T KNOW

1. **Whether R students study.** Hours are credited from the plan or typed. No measurement exists. `study_duration` is a claim, not a measurement.
2. **Why 62 O students never returned.** No error, no failed request, no distinguishing event precedes the exit.
3. **What happens after `resource_opened`.** The link leaves the app.
4. **Whether any push was ever displayed** on a device. `device_confirmed_at` means the service worker ran, not that a notification was shown. PR #203 would measure it and is unmerged.
5. **What the UI showed after a 404 tick, an undo burst, or a reschedule save.** Only server status is captured.
6. **Why Tushar stopped after 10 Sep** and why Parth came back on 18 Sep.
7. **What 26 pre-instrumentation R students did on their first study day** (no tap data before 7 Sep).
8. **Whether the installed-surface 100/93/74% gradient is selection or effect.**
9. **What the 7.8 h of idle gap on a study day contains.**
10. **Whether the 28 Z and 98 total "studied but duration not collected" students studied.**

---

## 15. MINIMUM NEXT EVIDENCE STEP

Ranked by evidence strength and relevance, not by impact guesses. Format: OBSERVATION → HYPOTHESIS → EVIDENCE REQUIRED → MINIMUM CHANGE → SIGNAL → TEST → DECISION RULE. Classes: A bug, B UX friction, C unnecessary step, D confusing state, E mechanism to protect, F unknown, G acquisition/intent, H data gap.

**1. [H] Cohort queries include review/staff accounts.**
Observation: 5 of raw R, including the #1 row. Hypothesis: every dashboard number is inflated the same way. Evidence required: none, established. Minimum change: none to product; every analysis query adds the `is_demo`/`@careerrai.in` exclusion. Signal: clean R = 72. Decision: done in this report; apply going forward.

**2. [A/B] Reschedule Save reloads the page and re-arms the push ask.**
Observation: `window.location.reload()` at pace-card.tsx:171; 8-tap loop; Later ×4 in an hour. Hypothesis: the reload makes the change look like it did not stick, and the re-armed ask reads as nagging. Evidence required: for the 15 R students who tapped reschedule, whether their `syllabus_target_date` changed on each save (needs a query against profile/timetable history if any exists; if none, this is NEEDS NEW INSTRUMENTATION: log the POST result client-side). Minimum change: none yet. Signal: reschedule taps per student per day, Later taps per student per day. Test: read-only first. Decision rule: if saves are succeeding, the loop is a UI-feedback problem, not a bug; fix the feedback, not the endpoint.

**3. [B/D] 35% of task-card taps end without a choice.**
Observation: 237 of 674. Hypothesis: whole-card target catches scroll and read taps. Evidence required: distribution of time between the card tap and the next tap (already available: NEEDS QUERY), and whether a second tap on the same card (toggle-close) follows. Minimum change: none. Signal: dead-tap share per student. Decision rule: if dead taps cluster within 1 s of the previous tap they are scroll hits; if they sit 5–30 s alone they are reads; only if followed by a `learn_it` tap on the same task are they a path, not a leak.

**4. [B/C] Push ask re-shown on every open; browser-tab students never asked.**
Observation: no persistence on Later; `already_installed_tab` suppresses the ask entirely. Hypothesis: both leak asks (one too many, one too few). Evidence required: Later taps per student before enable (AVAILABLE NOW); for `already_installed_tab` students, whether the slim banner ever converted (NEEDS QUERY on `reopen_nudge_*`). Minimum change: none until PR #203 (display measurement) is merged, or push changes cannot be evaluated. Decision rule: do not touch the ask until display is measured.

**5. [H] Display of notifications is unmeasured.**
Observation: `device_confirmed_at` ≠ shown. PR #203 built, unmerged. Evidence required: merge and read `display_status` for a week. Decision rule: founder's call, already pending.

**6. [F] Why O leaves.**
Observation: 41% never return; 45% of returners touch nothing. Hypothesis: cannot be formed honestly from the data. Evidence required: this is the one place where talking to five O students beats any query. NEEDS HUMAN CONTACT, not instrumentation.

**7. [H] `log_open` fires on auto-prompt.**
Observation: `first_log_prompt` → `log_open` within 1 s. Minimum change: none to product; analysis must distinguish prompted from tapped opens (NEEDS SOURCE-CODE TRACE to confirm both call sites; AVAILABLE NOW by excluding `log_open` within 2 s of `first_log_prompt`).

**8. [H] Unlabelled taps (`a`, blank).**
Observation: 39 blank-label rapid repeats; blueprint anchors labelled `a`. Minimum change: `data-analytics` on those anchors, which is a one-line attribute per element and the only instrumentation this report asks for, because the blueprint ping-pong cannot be read without it.

**9. [E] Protect the tick path.**
Observation: dominant loop. Evidence required: none. Decision rule: any change to the tracker's first screen must show tick-on-day-1 rate (77% R, 62% O) unchanged before and after, per signup cohort.

Everything else in Section 11 is classified but not ranked, because the evidence for user harm is weaker than for these nine.

---

## 16. REPEATABLE CAREERRAI PRODUCT-LEARNING LOOP

OBSERVE → RECONSTRUCT → IDENTIFY PATTERN → FORM HYPOTHESIS → FIX/EXPERIMENT → MEASURE → KEEP/REJECT → REPEAT, with what each step can use **today**.

| Step | AVAILABLE NOW | NEEDS QUERY | NEEDS SOURCE-CODE TRACE | NEEDS NEW INSTRUMENTATION | IMPOSSIBLE WITH CURRENT DATA |
|---|---|---|---|---|---|
| Observe cohorts R/O/Z weekly | `daily_reports.study_duration`, `profiles` filters (the exact SQL in §1) | | | | Measured study time |
| Reconstruct a student | `student_events` + `routine_task_completions` + `daily_reports` + `notifications` union (the query in §2), from 7 Sep for taps, 8 Aug for screens | | UI state after a tap | Client-side API result on reschedule/undo | Anything inside an external resource |
| Identify pattern | Sequence-before-write, dwell, active/idle, cluster queries (§5–8) | Dead-tap timing (§15.3); prompted vs tapped `log_open` | `log_open` call sites | Labels on blueprint anchors | Attention |
| Form hypothesis | Momentum table (§7) with the † caveat | | | | Causation |
| Fix / experiment | Product freeze is on; nothing until the founder lifts it | | | | |
| Measure | Tick-on-day-1 rate, next-day return rate, R per signup cohort, `completion_write` status mix, `log_blocked` rate, Later-tap rate | Per-cohort 21-day habit rate (already in `study-truth.ts`) | | Display status (PR #203) | Whether a student learned anything |
| Keep / reject | Decision rules in §15 | | | | |

The loop's first honest cycle is already defined: the nine items in Section 15, in that order, each read-only until its evidence step is done.

---

## Appendix: source-of-truth definitions used

```sql
-- real study day
select student_id, report_date::date from daily_reports where study_duration > 0 group by 1,2;
-- cohorts
R: count(distinct report_date) >= 2 ; O: = 1 ; Z: none
-- population
profiles.role = 'student'
-- clean population
and coalesce(is_demo,false) = false and coalesce(email,'') not ilike '%careerrai.in' and full_name not ilike 'razorpay%'
-- taps
student_events.event = 'tap', props->>'el' (autocapture, from 2026-09-07)
-- tick chain
routine_task_completions.completed_at ; daily_reports.study_duration_source = 'credited' ; student_events.event = 'completion_write' (props->>'status')
-- dwell
screen_view → next event in same session_id, capped 1800 s
```

Files read (no changes made): `src/lib/os/study-truth.ts`, `src/lib/study-duration-source.ts`, `src/app/api/routine/complete-task/route.ts`, `src/lib/autocapture.ts`, `src/components/home/pace-card.tsx`, `src/components/standalone-notif-ask.tsx`, `src/components/DailyTracker/TodaysRoutineCard.tsx`, `src/components/DailyTracker/LoggingModal.tsx`, `src/components/session-forensics-probe.tsx`, `src/components/storage-persistence-probe.tsx`.
