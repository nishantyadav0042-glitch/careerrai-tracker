# Forensic audit — push notification system

**Date:** 27 July 2026 · **Method:** reconstruction from raw persisted rows only.
No dashboard code was trusted. Every number below is followed by the definition
that produced it. Where evidence does not exist, the answer is **CANNOT
CURRENTLY BE PROVEN** — never an estimate.

---

## 1. Architecture, as it actually exists

```
 Student device
   │  Notification.requestPermission()          ← browser prompt
   │  push-gate.tsx / standalone-notif-ask.tsx
   ▼
 PushSubscription (browser + Google endpoint)
   │  POST /api/push/subscribe
   ▼
 profiles.push_subscription (jsonb)             ← the ONLY subscription store
 profiles.push_subscribed_at                      set once, first sub ever
 profiles.push_context                            'standalone' | 'browser'
   │
   │  36 cron jobs → dispatch() → lib/push.ts sendPushToUser()
   ▼
 web-push → Google FCM endpoint
   │  success → notifications.pushed_at
   │  410/404 → push_subscription = null, push_died_at = now()
   ▼
 Device: service worker 'push' event (public/sw.js v6)
   │  POST /api/push/received → notifications.received_at
   ▼
 Notification displayed by the OS               ← NOT MEASURABLE (see §6)
   │
   │  service worker 'notificationclick'
   │  POST /api/push/click → notifications.clicked_at
   ▼
 App opens at data.url → student_events app_open
   ▼
 Target screen → log_open → daily_reports row
```

**There is no queue.** Cron handlers send synchronously in a `for` loop. There
is no retry, no dead-letter, no backoff.

---

## 2. Reconstructed counts — students

Source: `profiles where role='student' and is_test_account is not true`.

| # | Metric | Value | Definition |
|---|---|---|---|
| A1 | Total students | **246** | all rows |
| A2 | Ever created a subscription | **73** | `push_subscribed_at is not null` |
| A3 | `notif_prefs.push = true` | **99** | jsonb field |
| A4 | `notif_prefs.push = false` | **147** | jsonb field |
| A5 | `notif_prefs.push` absent | **0** | — |
| A6 | Live subscription now | **64** | `push_subscription is not null` |
| A7 | Died at least once | **35** | `push_died_at is not null` |
| A8 | Resubscribed after a death | **0** | `push_resubscribed_at > push_died_at` |
| A9 | Delivery ever verified | **62** | `push_verified_at is not null` |

### A4 is not what it looks like — PROVEN

The `notif_prefs` column default is:

```
'{"push": false, "email": true, "reminder_time": "20:00", "daily_reminder": true}'::jsonb
```

**119 of the 147** hold a value byte-identical to that default, with no
`push_prompted` key and zero subscriptions ever. Those rows are **untouched
database defaults, not student decisions.**

`push: false` in this schema does not mean "declined". It means "nothing has
written here". Any funnel that reported 147 refusals was reporting the column
default as a student choice.

---

## 3. Browser permission state — the real answer

Source: latest `student_events.app_open` per student carrying
`props->>'notif_permission'`, which the browser reports directly.

| Browser state | Students | Live sub | Ever subscribed |
|---|---|---|---|
| `granted` | **58** | 48 | 54 |
| `default` — prompt never answered | **64** | 1 | 2 |
| `unsupported` — browser cannot do push | **28** | 1 | 1 |
| `denied` — student pressed Block | **9** | 2 | 2 |
| **No evidence** | **87** | — | — |

**Only 9 students have ever refused push.** Not 147.

**28 students are on browsers that do not support web push at all.** No prompt,
copy or incentive can reach them. The addressable ceiling is 246 − 28 = **218**,
minus the 87 with no evidence.

**64 students sit at `default`** — the OS prompt was never answered. Combined
with §2, this is where reach is actually lost.

---

## 4. Reconstructed counts — notifications

Source: `notifications`, all 17,153 rows.

| # | Metric | Value | Definition |
|---|---|---|---|
| B1 | Rows created | **17,153** | all rows |
| B2 | Handed to the push provider | **5,198** | `pushed_at is not null` |
| B3 | Never pushed | **11,955** | `pushed_at is null` |
| B4 | Device beaconed arrival | **1,712** | `received_at is not null` |
| B5 | Device beaconed a tap | **43** | `clicked_at is not null` |
| B6 | Tapped with **no** arrival beacon | **22** | `clicked_at not null and received_at is null` |
| B7 | In-app read flag | **596** | `read = true` |
| B8 | `read_at` | **0** | **dead column — nothing writes it** |

**B3 explained — PROVEN.** Of the 11,955 never pushed, **11,061** belong to
students who have never had a subscription at all. Notification rows are
created in-app for every student and pushed only to those with a live
subscription. B3 is not a failure count; it is the in-app inbox.

**B6 is a measurement defect.** 22 of 43 taps have no arrival beacon — the
`notificationclick` beacon fired while the `push` arrival beacon did not.
Delivery is therefore **under-counted**, and any tap rate computed as
`clicked / received` divides a numerator by a denominator that excludes half of
it. Delivery must be `received_at OR clicked_at`.

---

## 5. The measurable outcome funnel — PROVEN

Real students only. Window stated per stage.

| Stage | Count | Evidence |
|---|---|---|
| Tapped | **42** | `clicked_at` |
| App opened ≤10 min after the tap | **28** (67%) | `student_events.app_open` |
| Log opened ≤2 h after | **6** | `student_events.log_open` |
| **Log completed ≤2 h after** | **6** (14% of taps) | `daily_reports.created_at` |

Every tap that opened the log also completed it. **The log does not leak once
reached; reaching it is the problem.**

---

## 6. Truth table — what can and cannot be measured

| Stage | Measurable? | How | Confidence |
|---|---|---|---|
| Permission prompt **shown** | **NO** | No event, no column. `push_prompted` is written only on *dismissal*, and only by `push-gate.tsx` — `standalone-notif-ask.tsx` writes nothing. | **CANNOT BE PROVEN** |
| Permission granted | YES | `push_subscribed_at`, `app_open.notif_permission` | PROVEN |
| Permission denied | YES | `app_open.notif_permission='denied'` | PROVEN (159 of 246 students) |
| Subscription created | YES | `push_subscription`, `push_subscribed_at` | PROVEN |
| Token rotated | **NO** | Old endpoint is overwritten in place; no history kept | **CANNOT BE PROVEN** |
| Sent to provider | YES | `pushed_at` | PROVEN |
| Provider **accepted** | PARTIAL | Inferred from absence of a thrown error. No provider response is persisted. | INFERRED |
| Provider **rejected** | PARTIAL | Only terminal 410/404 leave a trace (`push_died_at`). **Non-terminal failures — 429, 500, network — persist nothing at all.** | **PARTIAL / UNPROVABLE** |
| Delivered to device | YES | `received_at` (SW beacon) | PROVEN but **under-counts** (see B6) |
| **Displayed on screen** | **NO** | The Web Push API exposes no display confirmation. Delivered ≠ seen. | **PLATFORM LIMITATION** |
| Tapped | YES | `clicked_at` (SW beacon) | PROVEN |
| App opened from tap | YES | `app_open` within a time window | PROVEN (correlational, not causal) |
| Target screen reached | PARTIAL | `log_open` fires, but carried no source until 27 Jul | PARTIAL |
| Business action completed | YES | `daily_reports` row in window | PROVEN (correlational) |

---

## 7. Failure analysis

**Requested: group every failed notification by cause, ranked.**

**THIS CANNOT CURRENTLY BE PROVEN.**

`lib/push.ts` computes a reason on failure —
`return { ok: false, reason: 'send_failed_' + statusCode }` — and **no caller
persists it.** The only failure evidence that survives is the side effect of a
terminal 410/404: `push_subscription = null` and `push_died_at` set.

Consequences:
- 429 rate-limits, 500s and network errors leave **no record whatsoever**.
- A death row records **when**, never **why** — the status code is not stored.
- Failures cannot be grouped or ranked, today, at all.

The fix is one column (`notifications.fail_reason`) plus one write. It is not
built. Until it is, any failure breakdown would be fabricated.

---

## 8. Data quality defects found

| # | Defect | Evidence | Status |
|---|---|---|---|
| 1 | `notifications.read_at` never written | 0 of 17,153 | Consumer fixed 27 Jul |
| 2 | Tap rate divided by a denominator excluding 22 of 43 taps | B6 | Fixed 27 Jul |
| 3 | `push: false` default reported as refusal | column default | **Open — funnel still misreads it** |
| 4 | Failure reasons discarded | §7 | **Open** |
| 5 | Token rotation invisible | §6 | **Open** |
| 6 | Permission prompt impressions unmeasured | §6 | **Open** |
| 7 | No queue, no retry, no dead-letter | §1 | **Open** |
| 8 | 87 students have no permission evidence | §3 | **Open** |

---

## 9. What the evidence does and does not support

**Supported:** reach is lost at the *permission* stage, not the *subscription*
stage. 64 students never answered the prompt; 28 cannot receive push at all;
only 9 refused.

**Supported:** once a notification is tapped, it works — 67% reach an app open
and 14% of taps end in a completed log.

**NOT supported by evidence, and previously asserted by me:** that Android
aggressively kills subscriptions. Of 35 deaths, 26 are a pre-22-July cohort
that has produced zero new cases in six days. Current-regime attrition is
5 of 36 subscriptions.

**Cannot be proven either way:** how many students saw a permission prompt;
why any individual send failed; whether any token was ever rotated.
