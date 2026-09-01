# Notification Reach — Root-Cause Forensic Audit

> **⚠️ CORRECTED 2 Sep 2026.** This document states a "92% delivery" figure.
> That number is wrong twice: `received_at` means the service-worker handler
> ran, not that anything was delivered or seen; and it was computed over
> `send_status = 'provider_accepted'`, a set that `push-recovery` continuously
> relabels to `unknown` when a send goes 48h unconfirmed — so failures are
> removed from the denominator and the ratio trends to 100% by construction.
> On the honest denominator the figure is **70.1%**, and the correct name is
> **provider-accepted → service-worker receipt**. The canonical business metric
> is **Push Reachability = 139/620 = 22.4%**, frozen in
> [NOTIFICATION-SCHEDULE-AND-METRICS-CLOSURE-2026-09.md](./NOTIFICATION-SCHEDULE-AND-METRICS-CLOSURE-2026-09.md).
> The findings below stand except where they rest on that number.


**Date of audit:** 1 September 2026, 16:00–16:30 UTC (21:30–22:00 IST)
**Scope:** READ-ONLY. No code, database, or deployment was changed.
**Snapshot basis:** live production (`pobhpszlsozeonejtzqy`) + repo at `2eb5eb3`.

---

## 1. Executive verdict

**Two independent bottlenecks, not one. Both are upstream of transport. Transport itself is healthy.**

**Bottleneck 1 — the iOS App Store app cannot receive our push at all. [P0, PROVEN]**
It is a WKWebView shell that loads the web app. WKWebView has no Web Push API, and
**this repository contains no APNs implementation of any kind** — no Xcode project, no
device-token column, no Apple push library, no native send path. Of **208** students who
opened it in the last 30 days, **206 have never had a push subscription at any point in
their history**. The 2 exceptions hold `fcm.googleapis.com` endpoints created on a
*different* device. This is structural, not a bug and not a funnel leak: there is no code
path by which these students could be reached.

**Bottleneck 2 — the Android permission→subscription funnel loses about half. [P0, PROVEN]**
Of **373** Android PWA students, **186 (50%) ever obtained a subscription** and only
**125 (34%) hold a live one now**. 63 have had one die.

**What is NOT the problem [P3, DISPROVEN]:** transport, provider rejection, receipt
instrumentation, the one-device schema, eligibility, and cron. When a push reaches the
provider, **92% of those rows return a device receipt** (8,908 of 9,673 in 30 days). The
pipe works. Almost nobody is in it.

---

## 2. Exact current architecture

| Stage | Implementation | Evidence |
|---|---|---|
| Transport | `web-push` ^3.6.7 (VAPID) — **the only transport that exists** | `package.json:32` |
| Sender | `sendPushToUser()` → `attemptSend()` → `webpush.sendNotification()` | `src/lib/push.ts:76,104,142` |
| Decision layer | `dispatch()` | `src/lib/notification-os.ts` |
| Subscription store | `profiles.push_subscription` (jsonb, **one per student**) | schema |
| Client subscribe | `getLiveSubscription()` + `persistSubscription()` | `src/lib/push-client.ts` |
| Permission UI (student) | `StandaloneNotifAsk` | `src/components/standalone-notif-ask.tsx` |
| Permission UI (staff) | `PushGate` — buddy layout only | `src/app/buddy/(dashboard)/layout.tsx:58` |
| Service worker | `push` → `showNotification()`; `notificationclick` | `public/sw.js:49,108,151` |
| Receipt beacon | `/api/push/received` → `notifications.received_at`, `profiles.push_verified_at` | `src/app/api/push/received/route.ts:28-39` |
| Android wrapper config | `android/twa-manifest.json` | present |
| **iOS native app** | **DOES NOT EXIST IN THIS REPO** | no `.xcodeproj`, no Capacitor, no plist |
| **APNs** | **NOT IMPLEMENTED** | zero matches for apns/device_token/node-apn |

Every `fcm.googleapis.com` reference in the codebase is the **Web Push endpoint host for
Chrome subscriptions**, not the Firebase SDK. There is no FCM/Firebase integration.

---

## 3. Platform-by-platform architecture

Surface is derived from `student_events.display_mode`, which is decided by
`displayModeFrom()` (`src/lib/journey.ts:35`) from the server-stamped `cr_store` cookie —
**not** `document.referrer`, which was the 9 Aug bug that mis-labelled every WhatsApp
click as a wrapper launch.

### iOS App Store wrapper (`ios_app`) — 208 students

The code states the mechanism outright (`journey.ts:30-33`):

> *"The iOS App Store build went live and was invisible here — **a WKWebView never
> matches `display-mode: standalone`**, so every App Store session was being filed as a
> plain browser tab."*

A WKWebView is not Safari and does not expose the Web Push API. iOS Web Push requires a
**Home Screen PWA in Safari** (iOS 16.4+). Consequently `StandaloneNotifAsk` deliberately
returns before prompting: `if (isIOS()) { ... return; }` with the comment *"web push is a
no-op in the iOS wrapper — don't prompt"* (`standalone-notif-ask.tsx`).

**That suppression is correct.** Prompting would be a dead ask. But it means these
students are never asked, never subscribe, and cannot be reached.

### iOS Home Screen PWA (`ios_pwa`) — 13 students — **THE ONLY WORKING iOS PATH**

| endpoint host | students | verified in 30d |
|---|---|---|
| `web.push.apple.com` | **6** | **6** |
| `fcm.googleapis.com` | 1 | 1 |

**These 6 are exactly the founder's "6 verified iOS users."** They are genuine Apple Web
Push subscriptions through Safari's Home Screen PWA. **This proves iOS is reachable
today — but only via the PWA, never via the App Store app.**

### Android PWA — 373 students

Chrome-installed WebAPK. All 125 live endpoints are `fcm.googleapis.com` (Chrome's Web
Push service). TWA is effectively unused: **1 student**.

### Desktop PWA — 21 students. All 7 endpoints `fcm.googleapis.com`.

---

## 4–7. The funnels, by surface

Population: distinct students with an installed-surface event in the last 30 days.

| Surface | Students | Pref on | **Live endpoint** | Send attempt | Provider accepted | Device confirmed | Clicked |
|---|---|---|---|---|---|---|---|
| Android PWA | 373 | 189 | **125 (34%)** | 369 | 169 | 178 | 51 |
| **iOS App Store** | **208** | **2** | **2 (1.0%)** | 207 | 2 | 2 | 1 |
| Desktop PWA | 21 | 11 | 7 (33%) | 21 | 10 | 10 | 4 |
| iOS PWA | 13 | 8 | 7 (54%) | 13 | 7 | 8 | 6 |
| **TOTAL** | **615** | **210** | **141** | **610** | **188** | **198** | **62** |

*Device-confirmed (198) exceeds live-endpoint (141) because "confirmed" means a receipt
landed at some point in 30 days, while "endpoint" is state right now — a subscription
that worked and later died counts in the first and not the second.*

### Permission bucket counts (§3 A–O)

| Bucket | Count | Confidence |
|---|---|---|
| Ever obtained a subscription, any time — Android | 186 of 373 | HARD FACT |
| Ever obtained a subscription — **iOS App Store** | **2 of 208** | HARD FACT |
| Subscription died (410/404) — Android | 63 | HARD FACT |
| **Recorded decline** (`push_prompted`/`push_reprompted`) | 8 / 1 / 0 / 1 | HARD FACT |
| Never asked vs declined, split exactly | **UNKNOWN** | see below |

**Critical measurement caveat.** `notif_prefs.push_prompted` is written **only on decline**
and **only by `push-gate.tsx`**, which renders **only on the buddy/staff layout**. The
student ask never writes it. Its absence therefore proves nothing, and buckets A ("never
asked") and B ("declined") **could not be separated at all** before 1 Sep. This is logged
as **Engineering Memory #64** — two separate investigations drew a false population number
from that field within hours of each other.

Telemetry closing that gap shipped today (`push_ask_shown` / `push_ask_skipped.why`), but
has ~6 hours of data and is too thin to quantify here.

### Transport health (§7) — the disproof

| send_status | rows (30d) | students | with receipt |
|---|---|---|---|
| `provider_accepted` | 9,673 | 220 | **8,908 (92%)** |
| `created` (in-app only, no push attempted) | 35,190 | 777 | 0 |
| `failed` | 6,732 | 117 | 0 |
| `unknown` | 3,103 | 189 | 0 |
| `null` (legacy rows) | 19,973 | 464 | 3,928 |

`410`/`404` are treated as terminal and the subscription is cleared (`push.ts:155-168`) —
verified working: all 53 dead subscriptions in a 14-day sample were correctly cleared,
**0 stale**. Provider acceptance is **not** masking delivery failure.

### Receipt semantics (§8) — exact terminology

`/api/push/received` is fired from the SW `push` handler **in parallel with**
`showNotification()`, not after it (`sw.js:108-131`). So:

> **`received_at` means "the service worker's push handler executed", NOT "a notification
> was visibly displayed."**

`showNotification()` success/failure is **not observed**. Bucket H (received but not
displayed) is **UNKNOWN — instrumentation does not currently allow measurement**. The
beacon has retry and its failures are swallowed by design so they cannot delay the
notification, so receipt is a *floor*, not an exact count.

---

## 8. Device-switching / one-device analysis (§6)

`profiles.push_subscription` is a single jsonb column: **one live device per student, by
construction.** A second device overwrites the first.

**Measured impact — near zero:**

| Surface | Students with live endpoint | Used >1 platform in 30d |
|---|---|---|
| Android PWA | 125 | **0** |
| Desktop PWA | 7 | 2 |
| iOS PWA | 7 | 2 |
| iOS App Store | 2 | 2 |

**Not one** of the 125 Android students with a live endpoint used more than one platform.
The one-device limitation is real architecture but is **not a material cause** of the
current gap. It is, however, exactly what explains the 2 `ios_app` students holding FCM
endpoints: they subscribed on another device.

---

## 9. Eligibility & cron (§10, §11)

**610 of 615** installed-active students received at least one notification *row* in 30
days. Eligibility and cron are therefore **not** the bottleneck — students are being
decided for, they just have nowhere to deliver to. The `created` bucket (35,190 rows, 777
students, 0 receipts) is precisely this: decisions written in-app because no push endpoint
exists.

41 crons are configured; the notification-relevant ones are `study-companion` (kickoff /
spark / progress / log), `builder-recovery`, and `push-recovery`. **The 09:30 `morning`
companion slot has no cron entry and has never fired** — found and worked around
yesterday.

---

## 10. Historical-number reconciliation (§12)

| Number | Status |
|---|---|
| 479 | **NOT REPRODUCIBLE** — no occurrence in repo docs |
| 409, 135, 35, 120, 112, 190, 187 | **NOT REPRODUCIBLE as notification-reach figures** — each appears in docs about unrelated subjects (study duration, evidence provenance, error architecture, sales) |
| 157 | appears only in `docs/STORE-FREEZE.md`; not a reach figure |

**The founder's 493 / 112 could not be reproduced either.** My reproduction of "opened the
installed app in 30 days" gives **615** (Android 373+1, iOS App Store 208, desktop 21, iOS
PWA 13) under two different definitions (any installed-mode event; and `event='app_open'`
specifically) — both identical. Two candidate explanations, neither verified:

1. The founder's snapshot was taken earlier on 1 Sep. **Daily actives more than doubled
   today** (routines generated 25 → 59) after the lesson-link announcement, which would
   inflate a later count.
2. A stricter join (e.g. requiring `profiles.app_installed`) was used.

**I have not forced these to agree.** The *shape* is the same and every conclusion below
holds under either denominator, because the dominant loss is a ratio (206/208), not a
count.

---

## 11. The loss tree

Canonical population: **615 installed-active students, 30 days to 1 Sep 2026.**

```
615  installed-active students
 ↓   −405  (66%)   no usable notification permission
210  preference on
 ↓   −69   (11%)   permission on, no live subscription
141  live push endpoint
 ↓   +469 in-app-only rows written for students with no endpoint
610  received a send attempt (row created)
 ↓   −422  (69%)   no push possible — no endpoint to send to
188  provider accepted
 ↓
198  device-confirmed in 30d (exceeds 188: includes endpoints that have since died)
 ↓   −136  (69%)
 62  clicked
```

| STAGE | Lost | % | Evidence | Root cause | Confidence |
|---|---|---|---|---|---|
| Installed → permission | 405 | 66% | 208 iOS wrapper students have 2 prefs on | **206 structurally cannot be asked** + Android funnel | **HIGH** |
| — of which iOS wrapper | **206** | 34% of all | `ever_subscribed=2 of 208` | WKWebView has no Web Push; no APNs exists | **PROVEN** |
| — of which Android | ~184 | 30% of all | 373 students, 189 pref on | Never completed the ask | **HIGH** |
| Permission → endpoint | 69 | 11% | 210 pref on, 141 endpoints | 63 Android deaths + in-flight | **HIGH** |
| Endpoint → provider accept | — | — | 141 endpoints, 188 accepted in window | not a loss stage | — |
| Provider → device confirm | ~8% of rows | — | 8,908 / 9,673 | healthy | **PROVEN** |
| Displayed → clicked | 136 | 69% | 62 clicked | student behaviour | MEDIUM |
| Received → **displayed** | **UNKNOWN** | — | `showNotification()` result unobserved | instrumentation gap | **UNKNOWN** |

---

## 12. Root-cause ranking

**P0 — PROVEN**
1. **iOS App Store wrapper cannot receive Web Push, and no native push exists.** 206 of 208 students never subscribed. 34% of the installed-active base.
2. **Android permission→subscription funnel loses ~half.** 373 → 186 ever → 125 live.

**P1 — STRONGLY SUPPORTED**
3. **Subscription mortality.** 63 of 186 Android subscriptions have died; ~26/week die against ~28–44/week gained, so live count is flat.
4. **The ask is only reachable inside an installed app.** Browser-tab students are never asked, by design.

**P2 — PLAUSIBLE, NOT SUPPORTED**
5. Notification not visibly displayed after SW execution — cannot be measured.
6. Android OS-level suppression (Doze/channel) — no instrumentation.

**P3 — DISPROVEN**
7. ~~Provider rejection / transport~~ — 92% receipt rate.
8. ~~One-device schema~~ — 0 of 125 Android endpoint-holders used multiple platforms.
9. ~~Eligibility / cron / budget~~ — 610 of 615 got a send attempt.
10. ~~Receipt instrumentation broken~~ — 8,908 receipts in 30 days.
11. ~~Subscriptions stored against the wrong student~~ — no evidence; endpoint hosts match surfaces except the 2 explained multi-device cases.
12. ~~Stale subscriptions accumulating~~ — 410/404 cleanup verified, 0 stale of 53.

---

## 13. Adversarial self-check — all 12 answered

1. **Is 112 low because measurement is broken?** Partly — receipt undercounts by design (fire-and-forget, swallowed failures) and `showNotification` is unobserved. But 92% of accepted rows *do* confirm, so measurement cannot explain a gap of this size. **NO.**
2. **Are the 205 App Store users reachable by some native mechanism we missed?** **No.** No Xcode project, no device-token storage, no APNs library, no native send path. Searched the whole repo.
3. **Do the 6 verified iOS users reveal a working path?** **Yes — and this is the most valuable finding.** All 6 are Home Screen PWAs on `web.push.apple.com`. iOS *is* reachable today, via Safari's PWA, never via the App Store app.
4. **Could Chrome permission exist while CareerRai lacks a subscription?** Possible (bucket C) and not separable before today's telemetry. `already_granted` skips fired for 1 student in 6 hours — small, not zero. **UNKNOWN, likely minor.**
5. **Subscription stored against wrong student?** No evidence found.
6. **Is provider acceptance masking delivery failure?** **No** — 92% confirm.
7. **Is receipt undercounting real delivery?** **Yes, somewhat** — it is a floor. Does not change the verdict.
8. **Could eligibility rather than transport explain the gap?** **No** — 610 of 615 got a send attempt.
9. **Could one-device storage explain a material part?** **No** — 0 of 125 Android multi-platform.
10. **Could onboarding be the dominant bottleneck?** It is **one of two** dominant bottlenecks, for Android. It is *not* the iOS one — no onboarding change can make a WKWebView receive Web Push.
11. **More than one independent bottleneck?** **Yes — exactly two,** and they need different fixes.
12. **Are we comparing different populations in 493 vs 112?** **Partly yes.** 493 is a 30-day activity population; 112 mixes activity with a 30-day receipt window and a stricter confirmation rule. My own 141 (live endpoint now) and 198 (confirmed within 30 days) are different measures of "reachable" and must not be used interchangeably.

---

## 14. What cannot yet be measured

- Whether a notification was **visibly displayed** (`showNotification()` result unobserved).
- The exact **never-asked vs declined** split historically (`push_prompted` is decline-only and staff-only).
- Whether the 206 iOS wrapper students **would** grant permission — they are never asked.
- OS-level suppression after successful display.

---

## 15. POTENTIAL NEXT STEPS — NOT YET APPROVED

Listed only as categories, deliberately unresearched and uncosted:

- **For the 206 iOS App Store students:** either a native push capability in the iOS app, or a route that moves them to the Home Screen PWA (the path the working 6 already use). No third option exists.
- **For the Android ~184:** the ask converts well when it renders (18 shown → 13 enabled on day 1). The question is reach, not persuasion.
- **For the ~26/week dying:** a re-subscribe path.

**None of these should begin until the founder reviews this report.**

---

## 16. The founder question

> *"If I had to explain to the founder in one paragraph why 493 active installed students
> currently produce only 112 strongly verified reachable students, what is the
> evidence-backed explanation?"*

**Because a third of them are on an iPhone app that physically cannot receive the kind of
notification we send, and half of the rest never finished turning notifications on.** The
iOS App Store app is a WKWebView shell around the website; WKWebView has no Web Push API,
and we have never written a single line of Apple native-push code. Of 208 students who
opened that app in the last 30 days, **206 have never had a push subscription in their
entire history** — not because they refused, but because we correctly never ask, since the
ask would do nothing. On Android the story is different and ordinary: 373 students, 186
ever subscribed, 125 still hold a live subscription — a normal permission funnel losing
about half, plus ~26 subscriptions a week dying naturally against ~28–44 gained, which is
why the number never climbs. **The delivery pipe itself is healthy: when a push reaches
the provider, 92% of those sends come back device-confirmed.** The gap is not delivery. It
is that most students were never able to get into the pipe.

- **Confidence:** HIGH on both bottlenecks; the iOS finding is PROVEN.
- **Biggest bottleneck:** the iOS App Store wrapper — 206 students, structurally unreachable.
- **Second biggest:** the Android permission→subscription funnel — ~184 students.
- **Fix first:** whichever of the two the founder values more; they are independent and share no code.
- **Do NOT touch yet:** the sender, the 410/404 cleanup, the receipt beacon, the eligibility rules, the cron schedule, and the one-device schema. All four were tested as hypotheses and **disproven** as causes. Changing them would cost time and risk with no reach gained.

---

*Read-only audit. No code, schema, or deployment was modified.*
