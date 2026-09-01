# CareerRai Notification System — Production Audit

**Date:** 1 September 2026 · **Deployed:** `cdb891e` (PR #162), production READY
**Verdict:** **SHIP WITH EXPLICIT LIMITATION** — see §14.

---

## 1. Executive verdict

The notification *system* is sound. The notification *funnel* was not. Of 615
installed-active students, **139 (22.6%)** hold a valid, recently verified
endpoint. The loss is almost entirely upstream of transport: **206** students on
a surface that physically cannot receive Web Push, and **268** on capable
surfaces who never completed permission→subscription. **Delivery loses
approximately zero students** — 92% of provider-accepted sends return a device
receipt. Four hypotheses I expected to confirm were **disproven**: transport,
idempotency, timezone, and the one-device schema. The single defect found this
session was caused by the one thing the founder warned about — a capability rule
duplicated across three components, where only one copy carried the bug.

## 2. Architecture (post-change)

```
capability ── lib/push-capability.ts  ← NEW single authority (was 3 inline copies)
     │
permission ── standalone-notif-ask (student) │ push-gate (staff) │ push-toggle (settings)
     │              └── all three call ──┐
creation ─────────────────────────────── getLiveSubscription()  lib/push-client.ts
persistence ──────────────────────────── persistSubscription() → /api/push/subscribe
                                              → push-subscription-registry.ts
healing ──────────────────────────────── push-healer.tsx (permission=granted only)
eligibility ──────────────────────────── dispatch()  lib/notification-os.ts + event-policy
transport ────────────────────────────── sendPushToUser()  lib/push.ts  (web-push/VAPID)
receipt ──────────────────────────────── sw.js → /api/push/received
state ────────────────────────────────── lib/push-state.ts
```

**One authority per responsibility. Verified by call-graph, not filename.**

## 3. Root causes

**P0** (1) iOS routing sends every Apple student to the App Store wrapper
(`capabilities.ts:37`); all 6 Apple Web Push subs date 13–23 Jul, **zero** after
10 Aug. (2) Android acquisition: 373 → 186 ever → 125 live.
**P1** (3) 68 active+willing students with dead subscriptions and no self-serve
re-ask. (4) No education step existed before the ask.
**P2** (5) Visible display unobservable. (6) Permission-granted-without-subscription, historically unmeasurable.

**DISPROVEN:** transport (92% receipt) · idempotency (**zero violations in
scope**; all 1,723 same-day duplicates are out-of-scope staff/event types) ·
timezone (index correctly uses `Asia/Kolkata`; **my UTC hypothesis was wrong**) ·
one-device schema (**0 of 125** Android endpoint-holders used >1 platform) ·
eligibility/cron (610 of 615 got a send) · duplicate architecture (**none existed**).

## 4. Reach funnel

| Stage | Count | Definition |
|---|---|---|
| Installed-active (30d) | **615** | ≥1 event with display_mode standalone/twa/ios_app |
| Notification-capable surface | 409 | excludes the 208 iOS wrapper |
| Preference on | 210 | `notif_prefs.push = true` |
| Valid subscription | 141 | `push_subscription IS NOT NULL` |
| **Recently verified** | **139** | + `push_verified_at ≥ 30d` ← **primary metric, 22.6%** |
| Provider accepted (window) | 188 | |
| Service worker executed | 198 | **not** "displayed" |
| Clicked | 62 | |

| Surface | Students | Valid sub | % |
|---|---|---|---|
| Android PWA | 373 | 125 | 34% |
| iOS App Store wrapper | 208 | 2 | **1%** |
| iOS Safari PWA | 13 | 7 | **54%** |
| Desktop PWA | 21 | 7 | 33% |

## 5. Changes implemented (PR #162, deployed)

| File | Change |
|---|---|
| `src/lib/push-capability.ts` | **NEW.** THE capability authority. Pure, leaf, total. Returns a *remedy*, not a boolean. |
| `src/lib/push-capability.test.ts` | 11 tests incl. all 16 signal combinations + the one-authority tree guard |
| `src/components/standalone-notif-ask.tsx` | Uses the authority; **unblocks iOS Home Screen PWA**; guidance panel for surfaces with a remedy |
| `src/components/push-gate.tsx` | Inline copy removed → authority |
| `src/components/push-toggle.tsx` | Inline copy removed → authority |
| `src/lib/journey.ts` | `push_setup_guidance_shown` (deliberately **not** an "ask") |
| `src/lib/push-ask-telemetry.guard.test.ts` | 3 guards updated to preserve intent against new structure |

Earlier the same day: the blocked-student recovery panel (#161) and the six
push-ask funnel events (#159).

## 6. Regression guards

1. No file outside the authority may re-derive capability from display-mode + Apple-ness (**tree-walking; caught 2 files immediately**).
2. All 16 capability signal combinations return a coherent answer.
3. Wrapper judged before standalone — never "install the app you already have".
4. Every early return in `evaluate()` reports an outcome; none is silent.
5. A blocked student never gets the button that cannot work.
6. `recheck()` must never call `requestPermission()`.
7. Guidance is never counted as `push_ask_shown`.
8. Every emitted event exists in the `EventName` union itself.

## 7. Real-device verification — NOT DONE, and I proved why rather than assuming

**I have no physical device. This gate is open.** Automated tests prove code
correctness; they prove nothing about whether a notification appears on a phone.

### I attempted it in a real browser first. Here is exactly how far it got.

Rather than assert the limitation, I built a push harness and drove real
Chromium (Playwright, the pre-installed `/opt/pw-browsers/chromium-1194`)
against a local origin with a real generated VAPID key:

| Stage | Real-Chromium result |
|---|---|
| `Notification.permission` granted | **PASS** — `"granted"` |
| Service worker registered + activated | **PASS** — `swRegistered: true` |
| `pushManager.subscribe()` | **BLOCKED** |

Two distinct walls, both real:

1. Playwright's default context is **incognito**, and Chrome disables the Push
   API there outright — the browser said so itself:
   *"Chrome currently does not support the Push API in incognito mode
   (crbug.com/401439)."* Result: `AbortError: Registration failed - permission denied`.
2. Re-run with a **persistent profile** (the correct fix) and `subscribe()`
   **hangs indefinitely** — because minting an endpoint requires reaching
   Google's FCM service, and this sandbox's egress proxy blocks it. That limit
   is already documented in `PROJECT_KNOWLEDGE.md:180`:
   *"Agent sandbox proxy blocks many third-party APIs (Daily, Razorpay, FCM,
   Mozilla/Apple push) — verify those from production, not the build sandbox."*

**Conclusion, evidence-backed:** the first two stages of the chain are
verifiable here and PASS. Everything from subscription creation onward — the
entire half that matters — is unreachable from this environment by
construction, not by my lack of effort. **A human on a real device is the only
remaining path.** The protocol below is therefore not a substitute for doing
the work; it IS the work, and it needs hands.

### Tester protocol (run once per row, record actual)

| # | Device / surface | Steps | Expected |
|---|---|---|---|
| 1 | **Android, Chrome PWA (installed)** | open app → prompt appears → Allow | prompt shows; `push_ask_shown` then `push_enabled` in `student_events`; `profiles.push_subscription` non-null with `fcm.googleapis.com` |
| 2 | Android, same student | POST `/api/push/test` | **notification visibly appears**; `notifications.received_at` set |
| 3 | Android | tap the notification | opens `/student/tracker`; `clicked_at` set |
| 4 | Android | app closed, repeat 2 | notification still appears |
| 5 | Android | Settings → block notifications → reopen app | **blocked panel** with "App info → Notifications" + "I've turned it on — check again" |
| 6 | Android | re-enable in Settings → tap check again | subscribes without a second OS prompt |
| 7 | **iPhone, App Store app** | open | **guidance panel**: "Reminders come from the Home Screen app" + 3 Safari steps. `push_setup_guidance_shown` with `context=ios_app`. **No permission prompt.** |
| 8 | **iPhone, Safari → Add to Home Screen** | open from Home Screen | **prompt appears** (this is the fix). Endpoint host = `web.push.apple.com` |
| 9 | iPhone PWA | POST `/api/push/test` | notification appears |
| 10 | **Desktop Chrome PWA** | install → open | prompt → subscribe → test send appears |
| 11 | Any, Safari **tab** on iPhone | open | guidance, `add_to_home_screen`, no prompt |

Record: device, OS version, surface, expected, **actual**, event rows observed.
Row 8 is the highest-value: it verifies the defect fix on the only working iOS path.

## 8. Remaining limitations (genuine)

- **Visible display cannot be confirmed on the web platform.** `received_at` = *"service worker executed"*. The honest chain is provider accepted → SW executed → **(unobservable)** → clicked.
- **iOS < 16.4** cannot receive Web Push on any surface.
- **The App Store wrapper cannot receive Web Push, ever.** Only a surface change or native APNs helps; APNs is **blocked** — the iOS source is not in this repo.
- Historic never-asked vs declined: **UNKNOWN** (Engineering Memory #64).
- Reach moves over days as students meet the flows; today's deploy proves the mechanism, not the number.

## 9. Monitoring & the alert that should exist

**Weekly metric:** `valid + verified ≤30d ÷ installed-active`. Today **22.6%**.

**Alert (not yet built):** page when, on a 7-day rolling basis, the count of
students with `push_verified_at` inside 30 days falls **>15% week-over-week**, or
when `push_enabled` events fall to zero for 48h on a surface that previously
converted. The second condition is what would have caught the 10 Aug iOS
collapse in days instead of three weeks.

## 10. Final verdict

**SHIP WITH EXPLICIT LIMITATION.** Shipped and deployed. Not "production-ready"
by the founder's own §27 gate until §7 is executed by a human on real hardware.

---

*No claim in this document rests on a passing test suite.*


---

## 11. CORRECTION (1 Sep, 23:45 IST) — Android is not an acquisition problem

The earlier framing in this and the reach audit — *"the Android acquisition
funnel loses about half"* — is **wrong as a description of the funnel**, and the
telemetry shipped this morning disproves it. Recorded here rather than quietly
amended.

**Android, first ~14 hours of real funnel data:**

| Stage | Students |
|---|---|
| Opened the app at all | 53 |
| Opened it **installed** (the only surface asked) | 38 |
| — already had a working endpoint (correctly not asked) | 21 |
| **Prompt shown** | **22** |
| **Subscribed** | **16 — 73% conversion** |
| Tapped Later | 8 |
| OS blocked / dismissed / subscribe failed | **0 / 0 / 0** |
| Never asked, no endpoint (unexplained) | 7 |

**When the prompt is shown, 73% of Android students subscribe, and not one
failure occurred at any step.** There is no conversion leak to fix.

The 373 → 125 historical gap is therefore **not** a broken funnel. It is the
accumulated result of a low daily open rate: **53 of 381** Android
installed-active students opened the app today (~14%). Reach grows only as fast
as students open the app.

**Consequence for the plan: do not change the Android permission flow.** It
works. Adding education copy or re-prompting would be optimising a stage that
converts at 73%, and would risk the fatigue rules for no measured gain. The
remaining 7 "unexplained silent" students are ~18% of installed opens and are
most likely in a blocking flow (onboarding / post-signup), where the ask is
correctly suppressed — that is an inference, not proven.

**PROVEN:** 73% conversion when asked; zero failures at every step.
**INFERRED:** the 7 silent students are in blocking flows.
**UNKNOWN:** why any individual student does not open the app — that is a
retention question, not a notification one.
