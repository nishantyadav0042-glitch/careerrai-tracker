# Notification closure: schedule consistency + canonical metrics

**Date:** 2 Sep 2026 · **Scope:** the two narrow items that gate the SHIP/NO-SHIP
verdict. Nothing else was reopened. No cron was added. No sender, registry,
healer or dashboard was created.

Both items produced a correction to my own earlier audits. Both corrections make
the picture **worse**, not better, and both are stated as such.

---

## ITEM 1 — Cron / notification-schedule consistency

### The contradiction, resolved

Two claims were both in my earlier reports:

- "the 09:30 `morning` slot has no cron and has never fired"
- "eligibility/cron are not a bottleneck — 610 of 615 students got a notification row"

**Both are true, and the second is not evidence for the first being harmless.**
610/615 measures *whether any row was written*, which four healthy slots achieve
on their own. It cannot detect a fifth slot that was never scheduled, because an
unscheduled slot contributes no rows to succeed or fail. I was using a
population-coverage number to answer a schedule-completeness question. It never
could.

The correct question is per-slot, and production answers it exactly.

### Was `morning` ever an intended production notification? YES — until 27 July

`notifications.type`, all time:

| slot | rows | first | last | still live? |
|---|---:|---|---|---|
| `companion_kickoff` | 17,177 | 13 Jul | **1 Sep 08:02** | ✅ |
| `companion_spark` | 17,584 | 13 Jul | **1 Sep 11:03** | ✅ |
| `companion_progress` | 17,359 | 13 Jul | **1 Sep 20:33** | ✅ |
| `companion_log` | 16,663 | 13 Jul | **1 Sep 21:33** | ✅ |
| `companion_morning` | 1,814 | 13 Jul | 27 Jul 09:32 | ❌ stopped |
| `companion_fact` | 1,943 | 13 Jul | 27 Jul 13:01 | ❌ stopped |
| `companion_open` | 1,952 | 13 Jul | 27 Jul 17:01 | ❌ stopped |
| `companion_wind` | 1,884 | 13 Jul | 27 Jul 18:31 | ❌ stopped |
| `companion_close` | 21 | 13 Jul | 25 Jul 22:00 | ❌ stopped |

Five slots stop on one day while four continue for another five weeks. That is a
decision, not a scheduler failure. And the number it lands on is not arbitrary:
`BUDGET_ACTIVE = 4` (`notification-os.ts:40`) — an engaged logger may receive
four student-budget notifications per day. A fifth slot would be built,
dispatched, and refused as `budget_exhausted`.

**Verdict: `morning`, `fact`, `open`, `wind`, `close` were retired on 27 July
2026. They are NOT intended production notifications.** The dead thing was the
configuration and documentation that still implied otherwise.

### What was actually wrong

Nothing in the system could have caught this, which is why it survived five weeks
and nearly swallowed the 1 Sep lesson-link announcement:

- `cron_runs` only records handlers that **execute**. An unscheduled slot leaves
  no row to be missing — "never scheduled" is invisible, not alarming.
- `findSilentCrons` (`cron-liveness.ts:92`) deliberately keys on the **route**:
  study-companion is one deployment declared four times, and reporting it four
  times in a 3am alert is noise. The consequence is that the four live slots
  prove the route alive and **mask the absence of any fifth**.
- `/admin/notification-health` charts types that *have* rows.

So the check has to be static. That is the fix.

### Fixes shipped (no new cron, no new system)

1. `RETIRED_COMPANION_SLOTS` in `src/lib/companion.ts` — the five slots, with the
   production evidence above in the comment.
2. The cron route **refuses a retired slot** with HTTP 410 rather than trusting
   that nobody re-adds a schedule line. The copy is kept; it is good, and a
   future budget could earn it back.
3. `src/lib/companion-schedule.guard.test.ts` — every slot in `COMPANION_SLOTS`
   is scheduled in `vercel.json` **or** listed as retired, exactly one of the
   two, never both, never neither. Also asserts the live slot count never exceeds
   `BUDGET_ACTIVE`.
4. Stale docs corrected: the `companion.ts` header described a retired 7-slot
   cadence (09:30 / 13:00 / 17:00 …); `docs/CODEMAP.md` said "six daily slots"
   and "33 jobs". `vercel.json` is now stated as the schedule of record.

The guard was verified to fail on the real defect: un-retiring `morning` while
leaving it unscheduled reproduces the 1 Sep condition and the guard rejects it.

### The requested table — every notification job

Production `cron_runs`, read 2 Sep 2026. `cron_runs` is a complete record: all
38 cron routes are wrapped in `withCronTracking`, verified by source scan.

| Notification type / slot | Canonical job | Expected schedule (IST) | Last successful execution | Status |
|---|---|---|---|---|
| `companion_kickoff` | `study-companion?slot=kickoff` | 08:00 daily | 1 Sep 08:02 | ✅ healthy |
| `companion_spark` | `study-companion?slot=spark` | 11:00 daily | 1 Sep 11:03 | ✅ healthy |
| `companion_progress` | `study-companion?slot=progress` | 20:30 daily | 1 Sep 20:33 | ✅ healthy |
| `companion_log` | `study-companion?slot=log` | 21:30 daily | 1 Sep 21:33 | ✅ healthy |
| `companion_morning` | — | — | 27 Jul 09:32 | ⛔ **retired**, route returns 410 |
| `companion_fact` | — | — | 27 Jul 13:01 | ⛔ **retired**, route returns 410 |
| `companion_open` | — | — | 27 Jul 17:01 | ⛔ **retired**, route returns 410 |
| `companion_wind` | — | — | 27 Jul 18:31 | ⛔ **retired**, route returns 410 |
| `companion_close` | — | — | 25 Jul 22:00 | ⛔ **retired**, route returns 410 |
| smart insight | `decision-engine` | 20:00 daily | 1 Sep 23:30 | ✅ healthy (2×/day: GH fallback, deduped) |
| daily reminder | `daily-reminder` | 20:00 daily | 1 Sep 23:30 | ✅ healthy (2×/day: GH fallback, deduped) |
| log-yesterday nudge | `log-yesterday-reminder` | 08:00 daily | 1 Sep 08:03 | ✅ healthy |
| onboarding arc | `onboarding-morning` | 10:00 daily | 1 Sep 15:08 | ✅ healthy (2×/day: GH fallback) |
| buddy morning brief | `buddy-brief` | 09:00 daily | 1 Sep 14:25 | ✅ healthy (2×/day: GH fallback) |
| buddy evening | `buddy-evening` | 19:30 daily | 1 Sep 19:31 | ✅ healthy |
| buddy escalation | `buddy-escalation` | 21:00 daily | 2 Sep 00:23 | ✅ healthy (2×/day: GH fallback) |
| buddy check-in | `buddy-checkin` | 09:30 daily | 1 Sep 09:31 | ✅ healthy |
| session reminder | `session-reminder` | every 10 min | 2 Sep 00:53 | ✅ healthy — 144/144 per day |
| session tomorrow | `session-tomorrow` | 11:30 daily | 1 Sep 17:18 | ✅ healthy (2×/day: GH fallback) |
| builder recovery | `builder-recovery` | every 30 min, 09:30–21:00 | 1 Sep 21:01 | ✅ healthy — 336/336 in 14d |
| push death/recovery | `push-recovery` | 10:30 daily | 1 Sep 10:30 | ✅ healthy |
| daily heartbeat | `daily-heartbeat` | 21:00 daily | 1 Sep 21:01 | ✅ healthy |
| reach watch | `notification-reach-watch` | 08:30 daily | **never run** | ⚠️ deployed 1 Sep; **first fire due 2 Sep 08:30** |

### Other schedule facts established

- **42 crons declared, 41 have run.** The only one that has not is
  `notification-reach-watch`, deployed yesterday and not yet due. That is
  expected, not a defect — but it is also **unverified**, and is called out as a
  residual risk rather than assumed good.
- **All 42 answer GET.** Incidents #55/#56 were caused by cron routes exporting
  only `POST` (Vercel invokes with GET → 405 → handler never ran → no
  `cron_runs` row). `cron-get-export.guard.test.ts` passes on all 42.
- **No cron is silently dropping runs.** 14-day totals looked short for several
  high-frequency jobs; per-day counts show those crons were *added* mid-window
  (`session-reminder` 27 Aug, `purge-session-handoffs` 30 Aug). Since going live
  they hit their schedule exactly — 24/24 hourly, 96/96 quarter-hourly, 144/144
  ten-minutely, and companion **4/4 every single day**.
- **The 2× counts are the known GitHub Actions fallback** (`cron-fallback.yml`
  duplicates 14 routes as an independent trigger). This is the dual-scheduler
  shape that caused the Phase-11 duplicate sends; it is now covered by the
  `notifications_once_per_day_per_type` partial unique index, and the audit found
  **zero idempotency violations**. No companion slot is in the fallback list.
- **No duplicate cron was added.** The fix is one constant, one 410, one guard.

---

## ITEM 2 — Metric language and the canonical reachability metric

### The correction: "92% delivery" was wrong twice over

First, the naming. `received_at` means **"the service worker's push handler
executed"** — `sw.js` fires that beacon in parallel with `showNotification()` and
never observes its result. It is not proof a student saw anything. So the metric
is at most **"provider-accepted → service-worker receipt"**, never "delivery".

Second, and worse: **the 92% was circular.** I computed it over
`send_status = 'provider_accepted'`. But `push-recovery` (`route.ts:158`)
*restamps* exactly those rows to `send_status = 'unknown'` when 48 hours pass
with no receipt and no tap. The failures are relabelled **out of the
denominator**. Measuring the receipt rate on what remains asks "of the sends we
have not already reclassified as unconfirmed, how many were confirmed" — a
number that trends to 100% by construction. Today it reads **97.1%**. The 92% was
a snapshot of that artefact mid-sweep.

On the honest denominator — every row the provider accepted, in the instrumented
era (`send_status` exists from 16 Aug), past the 48h window so both labels are
comparable:

| | rows |
|---|---:|
| Provider-accepted sends (`provider_accepted` ∪ `unknown`) | **11,119** |
| — still labelled `provider_accepted` | 8,016 |
| — restamped `unknown` (48h, no receipt, no tap) | 3,103 |
| Confirmed arrived (receipt **or** tap) | **7,789** |
| **Provider-accepted → confirmed arrival** | **70.1%** |
| *(the circular figure, for contrast)* | *97.1%* |

**~30% of provider-accepted pushes never confirm arrival.** That is not proven
to be lost delivery — an unobserved `showNotification`, a beacon that failed, a
device that never woke the worker all land here identically — but it is
**UNKNOWN**, and 92% asserted it was fine. Correcting this does not change the
SHIP decision, because transport was never the binding constraint; it changes
what we are allowed to claim.

### THE canonical business metric — frozen

> **Push Reachability** = installed-active students who currently hold a live
> push subscription, as a share of installed-active students.

One number. It answers the only business question — *how many of our students can
we actually reach?* — and it is a **state** metric, computed from `profiles`
alone, so no send volume, no relabelling sweep, and no beacon reliability can
move it.

```sql
-- CANONICAL: Push Reachability. Frozen 2 Sep 2026.
-- Changing this SQL means changing the metric; do not "improve" it silently.
select
  count(*)                                                as installed_active_students,
  count(*) filter (where push_subscription is not null)   as reachable_now,
  round(100.0 * count(*) filter (where push_subscription is not null)
        / nullif(count(*), 0), 1)                         as push_reachability_pct
from profiles
where role = 'student'
  and app_installed is true
  and last_seen_at >= now() - interval '30 days';
```

**Reading, 2 Sep 2026: 139 / 620 = 22.4%.**

Definitional choices, stated so they are not re-litigated:
- **Denominator is installed-active**, not all 1,028 profiles. A student who
  never installed or has been gone 30 days is a *growth* problem, not a
  *reachability* problem, and mixing them hides both.
- **`push_subscription IS NOT NULL` is the numerator.** `push.ts` nulls it on a
  terminal 410/404, so the column is the live truth about whether a send can even
  be attempted. It requires no delivery inference at all.
- Of the 481 unreachable: **413 never subscribed**, **68 had a subscription die**.
  Those two need different fixes and must never be merged into one number.

### Diagnostic metrics — kept, and kept separate

These diagnose the pipe. **None of them is the business metric**, and none may be
reported as "delivery".

| Metric | Definition | Reading (2 Sep) |
|---|---|---|
| Provider acceptance | send returned 2xx from FCM/APNs | 0 failures on attempted sends, 30d |
| Provider-accepted → SW receipt | `received_at` set = SW handler ran | **70.1%** (honest denominator) |
| Confirmed-arrival shortfall | accepted, 48h passed, no receipt/tap | **3,103 rows — UNKNOWN, not "lost"** |
| Tap-through | `clicked_at` set | 66 students, 30d |
| Subscription mortality | `push_died_at` set | 68 students |

### The 493 / 112 discrepancy — preserved, NOT reconciled

The earlier audit could not reconcile ~493 students who ought to be reachable
against ~112 showing device-side confirmation. **I did not force these to agree,
and they still do not.** Today's analogous spread, all from the same database, in
the same hour:

| Count | Reading |
|---:|---|
| 620 | installed-active students |
| 252 | have *ever* held a push subscription (`push_subscribed_at`) |
| 238 | received a push attempt in 30d |
| 232 | produced ≥1 SW receipt in 30d |
| 163 | hold a live subscription (any install state) |
| **139** | **hold a live subscription AND are installed-active — canonical** |
| 66 | tapped a notification in 30d |

238 pushed vs 139 currently reachable is explainable — 30 days of sends includes
students whose subscription has since died. **252 ever-subscribed vs 139 now is
not fully explained by the 68 recorded deaths** (252 − 68 = 184 ≠ 139). A gap of
~45 students remains unaccounted for. It is **UNKNOWN**. It does not block the
canonical metric, which reads current state directly and does not depend on the
history reconciling. Logging it here so it is not quietly dropped.

### Language rules, binding from here

- ❌ "92% delivery" · ❌ "delivered" · ❌ "displayed" · ❌ "seen"
- ✅ "provider-accepted" — the provider took the send
- ✅ "service-worker receipt" — the SW push handler ran
- ✅ "confirmed arrival" — receipt **or** tap
- ✅ "UNKNOWN" — accepted, window elapsed, nothing came back
- ✅ **"Push Reachability"** — the canonical business metric, and the only one
  that belongs in a business conversation
