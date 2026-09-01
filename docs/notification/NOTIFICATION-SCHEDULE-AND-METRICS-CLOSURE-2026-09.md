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
| reach watch | `notification-reach-watch` | 08:30 daily | — | ⏳ **NOT YET EXECUTED — first scheduled run pending** (08:30 IST 2 Sep) |

### Other schedule facts established

- **42 crons declared, 41 have run.** The 42nd is `notification-reach-watch`,
  deployed 1 Sep with its first scheduled execution at 08:30 IST on 2 Sep. As of
  this reading (01:11 IST, 2 Sep) that time is **7h19m in the future**, so its
  status is **NOT YET EXECUTED — first scheduled run pending**. This is not a
  failure and is not described as one. It is also not yet evidence of anything.

  **After its first scheduled execution, verify all five:** (1) it executes;
  (2) it writes a `cron_runs` row; (3) its production query runs without error;
  (4) it does not false-positive on today's healthy data; (5) it correctly
  detects the historical 10-Aug collapse scenario when that shape is replayed
  against it.
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

### CANONICAL TRANSPORT METRIC — frozen

> **Provider-accepted → service-worker receipt.**
> Never "delivery", never "visible delivery", never "notification display".

```sql
-- CANONICAL TRANSPORT METRIC. Frozen 2 Sep 2026.
select
  count(*)                                                as provider_accepted_swept,
  count(*) filter (where received_at is not null)         as service_worker_receipt,
  count(*) filter (where clicked_at is not null)          as clicked,
  count(*) filter (where received_at is not null
                      or clicked_at is not null)          as confirmed_arrival,
  round(100.0 * count(*) filter (where received_at is not null
                                    or clicked_at is not null)
        / nullif(count(*), 0), 1)                         as confirmed_arrival_pct
from notifications
where pushed_at is not null
  and send_status in ('provider_accepted', 'unknown')
  and pushed_at < now() - interval '48 hours';
```

**Reading, 2 Sep 2026 01:11 IST:** 11,119 swept · 7,781 SW receipt · 83 clicked ·
**7,789 confirmed arrival = 70.1%**.

**1 — What qualifies a row for the denominator.** Three conditions, all required:
`pushed_at IS NOT NULL` (a send was actually attempted, so in-app-only rows can
never dilute it); `send_status IN ('provider_accepted','unknown')` (the provider
returned 2xx — these are the only two labels a provider-accepted row can ever
hold); and `pushed_at < now() - 48h`. Rows before 16 Aug 2026 carry
`send_status = NULL` because the column did not exist; they are **excluded**,
which is why this metric covers the instrumented era only and is not comparable
to pre-16-Aug figures.

**2 — What "fully swept" means.** `push-recovery` runs daily at 10:30 IST and can
only restamp rows whose `pushed_at` is older than the 48h `CONFIRMATION_WINDOW_MS`.
A row younger than 48h may still read `provider_accepted` **merely because the
sweep has not reached it yet**. Including such rows would count not-yet-judged
sends as successes and inflate the number. The `pushed_at < now() - 48h` clause
restricts the denominator to rows whose label is already settled.

**3 — Why these rows are never removed or relabelled out.** The only status
transition that exists is `provider_accepted → unknown`, and **both labels are
inside the denominator**. No row can leave the set. The transition moves a row
between two members of the same union; it cannot shrink it. A late receipt or
tap arriving after the stamp moves the row from unconfirmed to confirmed in the
**numerator** (`resolveDeliveryState` treats arrival evidence as outranking
`send_status`, permanently — `delivery-state.ts:31`) while leaving the
denominator untouched.

**4 — How `unknown` is generated.** `closeOutUnconfirmed()` in
`api/cron/push-recovery/route.ts:158`, as one set-based UPDATE with predicate:
`send_status = 'provider_accepted'` AND `received_at IS NULL` AND
`clicked_at IS NULL` AND `pushed_at IS NOT NULL` AND `pushed_at < now() - 48h`.
It is an **admission that we stopped waiting**, not a verdict about the device.

**5 — Why this metric cannot be improved artificially.** The numerator is
`received_at IS NOT NULL OR clicked_at IS NOT NULL` — both stamped **only by
device-side evidence** (the service-worker beacon; a real tap). No server-side
status write touches the numerator. PushHealer and the relabelling sweep can
only move rows between `provider_accepted` and `unknown`, and since the
denominator is their union, **every such write is a no-op on this ratio**. The
number can rise only if more devices actually come back. That is precisely the
property the discarded 92% figure lacked: it used `provider_accepted` alone as
its denominator, so every sweep mechanically raised it.

**`unknown` is NOT `lost`.** A row in the 3,330-row shortfall (11,119 − 7,789)
is consistent with an unobserved `showNotification`, a beacon that failed to
send, a device that never woke the worker, or genuine non-delivery. **We cannot
distinguish these, and no server-side measurement can.** Only the physical-device
test can. It is recorded as UNKNOWN and must never be reported as lost —
nor as delivered.

The two unconfirmed counts in this document are both correct and are not the
same quantity: **3,103** rows carry the `unknown` label, while the unconfirmed
shortfall is **3,330** (11,119 − 7,789). The 227-row difference is rows that
have passed 48h unconfirmed but that the daily 10:30 IST sweep has not yet
relabelled. They sit in the denominator either way, which is the point of
defining it as the union — the sweep's timing cannot move the ratio.

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

**This is the ONLY headline business metric.** Nothing else in this repo may be
presented as "reachability" in a business conversation.

**Exact denominator — installed-active (620).** `profiles` rows satisfying all
three: `role = 'student'` (excludes staff, buddies, admin accounts);
`app_installed IS TRUE` (the student completed an install — a browser-tab
visitor is not in scope); `last_seen_at >= now() - interval '30 days'`. Not all
1,028 profiles: a student who never installed, or has been gone a month, is a
*growth* problem, not a *reachability* problem, and mixing them hides both. The
30-day window is part of the definition — changing it changes the metric.

**Exact endpoint qualification — live endpoint (139).**
`push_subscription IS NOT NULL`. This column holds the stored `PushSubscription`
JSON and `push.ts:158` **nulls it on a terminal 410/404** (`push_died_at` is
stamped in the same write). So a non-null value means exactly: *the server holds
an endpoint it is still permitted to attempt a send to.* It is a **live
endpoint**, deliberately not a verified one, and it requires no delivery
inference whatsoever.

Of the 481 unreachable: **68 had a subscription die** (`push_died_at` set) and
**413 have no push context at all** — the unexposed/unclassified population
described under Item 3. Those two need different fixes and must never be merged.

### The diagnostic ladder — six distinct things, NOT interchangeable

Each rung answers a strictly narrower question than the one above it. Quoting any
rung as a substitute for another is the exact error that produced "92% delivery".

| # | Rung | Definition | Reading (2 Sep 01:11 IST) |
|---|---|---|---|
| 1 | **Live endpoint** | `push_subscription IS NOT NULL` — **CANONICAL** | **139 / 620 = 22.4%** |
| 2 | Verified endpoint | live **and** `push_verified_at IS NOT NULL` | 138 |
| 3 | Provider accepted | provider returned 2xx, fully swept | 11,119 rows |
| 4 | Service-worker receipt | `received_at` — the SW push handler ran | 7,781 rows |
| 5 | **Visible OS notification** | a human's tray actually rendered it | **NOT INSTRUMENTED — UNMEASURABLE server-side** |
| 6 | Click | `clicked_at` — a real tap | 83 rows · 66 students /30d |

Rung 5 is the one that matters to a student and **we cannot measure it at all**.
`sw.js` fires the receipt beacon *in parallel* with `showNotification()` and never
observes its result, so rung 4 can never be promoted to rung 5 by any amount of
server-side work. **This is the entire reason the physical-device gate exists**,
and why no volume of green server metrics can substitute for it.

### Diagnostic metrics — kept, and kept separate

These diagnose the pipe. **None of them is the business metric**, and none may be
reported as "delivery".

| Metric | Definition | Reading (2 Sep) |
|---|---|---|
| Provider acceptance | send returned 2xx from FCM/APNs | 0 failures on attempted sends, 30d |
| Provider-accepted → SW receipt | `received_at` set = SW handler ran | 7,781 / 11,119 = **70.0%** |
| Confirmed-arrival shortfall | accepted, 48h passed, no receipt/tap | **3,330 rows — UNKNOWN, never "lost"** |
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

---

## ITEM 3 — Android engagement, investigated

Asked: why do only ~53 of ~381 Android installed-active students open the app
daily? Tested rather than assumed, because the answer decides whether any
further notification work is justified.

### Reachability by platform (installed-active, 2 Sep)

| `install_source` | students | push-reachable | reach % | seen in last 24h |
|---|---:|---:|---:|---:|
| `browser` (Android web/PWA) | 335 | 105 | 31.3% | 37 |
| `pwa` (Android installed) | 77 | 30 | 39.0% | 8 |
| `ios` | 205 | **3** | **1.5%** | 26 |
| null | 3 | 1 | — | 0 |

iOS at 3 of 205 is the App Store WKWebView wrapper, already proven and not
reopened here. **Non-iOS: 136 of 415 = 32.8% reachable, ~10.8% daily-active** —
consistent with the founder's ~14% figure.

### Where the Android loss actually is

By `push_context` (written only when a subscription is registered):

| context | installed-active | reachable | reach % |
|---|---:|---:|---:|
| `standalone` | 182 | 128 | **70.3%** |
| `browser` | 24 | 10 | 41.7% |
| `twa` | 1 | 1 | 100% |
| **null (never subscribed)** | **413** | **0** | **0%** |

**The currently measured Android bottleneck is exposure to the notification
acquisition flow, not conversion after the prompt is shown.**

What the evidence actually supports, and nothing further:

- **128/182 = 70.3%** subscribe after reaching the installed-app notification
  context.
- **16/22 = 72.7%** in the newer direct-prompt telemetry.
- **Zero** observed OS blocks, dismissals, or subscription failures in the newer
  sample.

Two independent samples agree on conversion, and both overturn my own earlier
"Android funnel loses half" framing.

**The 413 students with no `push_context` are NOT proven to be acquisition
failures.** `push_context` is written only at subscription time, so its absence
records that we have no observation — not that a prompt was shown and lost, and
not that the student refused. They are an **unexposed / unclassified
population** and stay that way until telemetry establishes exactly why they
never entered the funnel. Any split of that 413 into causes would be invention.

**No Android push work is justified by this evidence, and none was built.**

### Does push reach explain engagement? Largely NO

Logging rates among installed-active students, by whether push can reach them:

| cohort | students | logged 7d | logged 30d |
|---|---:|---:|---:|
| reachable (push live) | 139 | 23 (**16.5%**) | 65 (46.8%) |
| not reachable | 481 | 40 (**8.3%**) | 135 (28.1%) |

Reachable students log at roughly twice the rate. **This is correlation, and it
is heavily self-selected** — a student who installs, opens, and accepts a
permission prompt is already the engaged kind. It is not evidence that push
causes logging, and must not be quoted as such.

Even taken at face value it bounds the upside: doubling reachability from 22.4%
to ~45% would move weekly loggers from ~63 to ~86 of 620. Real, worth having,
**not** the difference between 53/381 and a healthy daily-active number.

**Conclusion: notification work on Android is FROZEN here.** The crons fire on
time, provider acceptance is clean, and post-prompt conversion is ~70–73% in two
independent samples. Only 16.5% of students we can already reach perfectly log
in a week — and that gap is a **separate product-engagement investigation**,
deliberately NOT folded into the notification P0. Correlation is observed;
**causality is not established, and push is not claimed to cause the
difference.** Building more push machinery would be treating a product problem
as an infrastructure one.

---

## VERDICT: **NO-SHIP**

Gated on exactly one thing: **the physical-device protocol has not been
executed.** It requires a human with a real Android handset and a real iPhone;
it cannot be run from this environment (the sandbox proxy blocks FCM, so
`pushManager.subscribe()` hangs — a browser-automation result here would be
meaningless, not reassuring). The protocol is written and ready in
`docs/notification/TESTER-PROTOCOL-REAL-DEVICE.md`. **Gate status: BLOCKED, not
passed.**

Everything else is closed. **The audit is closed with it** — no further broad
auditing, no new notification architecture, no speculative Android push changes,
no resurrection of retired crons, no metric inflation, and no "tests passed
therefore fixed". Nothing found in this session argues for more building; the
Android investigation argues the opposite.

**The critical path to be observed by a human tester:**
iPhone → Safari → careerrai.in → Add to Home Screen → **open from the Home
Screen icon** → permission prompt → Allow → subscription created → controlled
test push → **an actual visible OS notification** → tap → correct destination.
Execute the Android physical path too where a handset is available.

**If it passes:** SHIP, with the observed evidence recorded.
**If it fails:** the exact failing stage is named and **only that stage is
fixed** — no redesign around it.

### Residual risks, stated

1. **No device has been observed rendering a notification.** Every green signal
   is server-side or beacon-side. `received_at` proves a worker ran, never that
   a human saw a tray.
2. **~30% of provider-accepted sends never confirm arrival** (3,330 rows).
   **UNKNOWN, not lost.** Consistent with an unobserved `showNotification`, a
   failed beacon, a device that never woke the worker, or genuine non-delivery —
   and no server-side measurement can separate these. The real-device test is
   what distinguishes them.
3. **`notification-reach-watch`: NOT YET EXECUTED — first scheduled run pending**
   (08:30 IST, 2 Sep). Written and guarded; carries no production evidence yet.
   Not a failure — simply not yet due. The five verification checks above are
   owed once it fires.
4. **~45 students unaccounted for** in the ever-subscribed vs now-reachable
   reconciliation. Preserved, not forced.
5. **205 iOS students are structurally unreachable** until a native APNs build
   ships — which needs Xcode, an Apple `.p8`, and App Store review. Unchanged.
