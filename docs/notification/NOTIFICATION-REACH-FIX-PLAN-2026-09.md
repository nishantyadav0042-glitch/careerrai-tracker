# Notification Reach — Fix Plan

**Date:** 1 September 2026 · **Status:** PLAN. Phase 0 complete, no code written.
**Sources of truth:** `NOTIFICATION-REACH-ROOT-CAUSE-AUDIT-2026-09.md`, `IOS-NATIVE-PUSH-SCOPE-2026-09.md`
**Snapshot:** production `pobhpszlsozeonejtzqy`, repo `9725964`.

---

## 1. Executive diagnosis

**There is no duplicate notification architecture, and there is no delivery
problem. The system is already single-authority and the pipe already works.
Reach is lost almost entirely upstream, in two places, for two different
reasons — and the larger of the two is the one nobody has been looking at.**

Of **615** installed-active students:

| Bucket | Students | % |
|---|---|---|
| **B. ACQUISITION** — capable surface, no subscription | **268** | **43.6%** |
| **A. CAPABILITY** — surface cannot receive Web Push at all | **206** | 33.5% |
| Reachable today (live endpoint) | 139 | 22.6% |
| iOS wrapper holding an endpoint made on another device | 2 | 0.3% |
| **C. DELIVERY** — had a subscription, send failed downstream | **~0 students** | — |

**Acquisition is bigger than capability.** That is the correction this plan
turns on. The iOS wrapper is the more dramatic finding, but Android acquisition
loses more students, is fixable today, and carries no product trade-off.

**One line of code did most of the iOS damage** (`src/lib/install/capabilities.ts:37`,
`if (isApple) return 'ios-app-store'`). Every Apple Web Push subscription we own
was created 13–23 July; **zero** since the App Store route shipped on 10 August.
Android kept acquiring throughout (117 of 161 after 10 Aug).

---

## 2. Exact current architecture — and the authority map

**Finding: the "no duplicate systems" requirement is already satisfied.** I
inventoried every candidate. Consolidation is NOT needed and must not be done
for its own sake.

| Concern | THE authority | Callers |
|---|---|---|
| Capability detection | `src/lib/install/capabilities.ts` | install UI |
| Platform/surface detection | `displayModeFrom()` `src/lib/journey.ts:35` | everything |
| Store-source canonicalisation | `normalizeStoreSource()` `src/lib/store-build.ts` | proxy, install |
| Subscription **creation** | `getLiveSubscription()` `src/lib/push-client.ts:49` | all 3 UIs |
| Subscription **persistence** | `persistSubscription()` → `/api/push/subscribe` → `push-subscription-registry.ts` | all 3 UIs |
| "Is this student receiving?" | `src/lib/push-state.ts` | health, UI |
| Eligibility / decision | `dispatch()` `src/lib/notification-os.ts` + `event-policy.ts` | all crons |
| Sending | `sendPushToUser()` `src/lib/push.ts:76` | dispatch only |
| SW push handling | `public/sw.js:49` | — |
| Receipt | `/api/push/received` | sw.js |

Three components request permission — `standalone-notif-ask.tsx` (student
in-app), `push-gate.tsx` (buddy/staff), `push-toggle.tsx` (settings). **These are
three surfaces, not three architectures**: all three import the same
`getLiveSubscription` + `persistSubscription`. Leave them.

---

## 3. Loss tree with production numbers

```
615  installed-active students (30d)
 ↓   −206 (33.5%)  CAPABILITY: iOS App Store WKWebView, no Web Push API
409  on a notification-capable surface
 ↓   UNKNOWN       notification education shown        ← no such stage exists
 ↓   UNKNOWN       permission prompt shown (historic)  ← not instrumented until 1 Sep
210  notification preference ON
 ↓   −69  (11.2%)  permission on, no live subscription (63 died + in-flight)
141  live subscription today
 ↓
188  provider-accepted in window   (>141: includes since-died endpoints)
198  device receipt in window
 ↓   −136 (69%)
 62  clicked
 ?   notification VISIBLY DISPLAYED — UNKNOWN, see §11
```

| Stage | Lost | % | Evidence | Root cause | Confidence | Fix phase |
|---|---|---|---|---|---|---|
| Installed → capable surface | **206** | 33.5% | 208 wrapper students, 2 ever subscribed | WKWebView has no Web Push; no APNs exists | **PROVEN** | 2 |
| Capable → preference ON | ~199 | 32% | 409 capable, 210 pref on | never completed the ask | HIGH | 3 |
| Preference → live subscription | 69 | 11% | 63 `push_died_at` + in-flight | subscription mortality | **PROVEN** | 3 |
| Send → provider accept | — | — | 610/615 got a send row | not a loss stage | PROVEN | — |
| Provider → receipt | ~8% of rows | — | 8,908 / 9,673 = **92%** | healthy | **PROVEN** | — |
| Receipt → **display** | **UNKNOWN** | — | `showNotification()` result unobserved | web platform limit | **UNKNOWN** | 4 |
| Display → click | 136 | 69% | 62 clicked | student behaviour | MEDIUM | — |

**Two stages in the founder's requested tree do not exist in the product at
all:** "notification education shown" and, before 1 Sep, "permission prompt
shown". Marked UNKNOWN, not estimated.

---

## 4. Root causes ranked

**P0**
1. **iOS routing sends every Apple student to the non-capable surface.** `capabilities.ts:37`. Dated proof: 6 Apple subs, all 13–23 Jul, zero after 10 Aug. 206 students.
2. **Android acquisition funnel loses ~half.** 373 → 186 ever → 125 live. 248 students.

**P1**
3. **Subscription mortality with no self-serve repair.** 115 students dead+pref-on; **68 of them are active on a capable surface right now.** The `push-recovery` cron does not repair — it emails the founder a WhatsApp list (`route.ts:74`).
4. **Silent healing is impossible for most of them.** Of 11 `PushHealer` attempts: **6 `browser_permission_default`**, 1 denied, 4 succeeded. `PushHealer` correctly bails when permission isn't granted (`push-healer.tsx:87`) — these students need an *ask*, not a heal.

**P2**
5. Notification received but not visibly displayed — unmeasurable today.
6. Browser permission granted but no subscription — 1 student seen in 6h of new telemetry; likely minor, historically UNKNOWN.

**P3 — DISPROVEN, DO NOT TOUCH**
7. Provider/transport (92% receipt) · 8. One-device schema (**0 of 125** Android endpoint-holders used >1 platform) · 9. Eligibility/cron (610/615 got a send) · 10. Receipt instrumentation (8,908 receipts) · 11. Stale-subscription accumulation (410/404 cleanup verified, 0 stale of 53) · 12. Duplicate architecture (**does not exist**).

---

## 5. Proven vs inferred vs unknown

**PROVEN:** iOS wrapper incapability; the 10 Aug routing correlation; 92% receipt; one-device is not a factor; single-authority architecture; 68 recoverable students.
**INFERRED (HIGH):** Android's ~199 loss is prompt-completion rather than refusal — supported by day-1 telemetry (18 shown → **13 enabled**, 5 Later) and by only 8 recorded declines.
**UNKNOWN:** historic never-asked vs declined split (Memory #64); visible display; whether the 206 wrapper students would say yes if asked.

---

## 6–8. Per-platform root cause

**Android (373):** acquisition. The ask converts well *when it renders* (72% day 1). Loss is students who never reach it — plus 63 deaths. **Biggest single actionable population.**

**iOS App Store wrapper (208):** capability + routing. Cannot receive Web Push. Actively routed here by `capabilities.ts:37`.

**iOS Safari PWA (13):** *works* — 6 on `web.push.apple.com`, 7 live endpoints. The proof the path is real.

**Desktop (21):** acquisition, 7 live. Small; no special work.

---

## 9–11. Permission, lifecycle, delivery diagnosis

**Permission timing.** `StandaloneNotifAsk` fires inside the installed app, before the tour, on every open until resolved (founder call, 23 Jul). It is **not** asked in a browser tab (correct — deliberate) and **not** on iOS (correct — would be a dead ask). **There is no education step before the ask**; the overlay's own copy is the only value explanation. That is the gap, not the timing.

**After "Don't allow":** OS `denied` now shows a recovery panel with real Settings steps and a re-read action (shipped today). `default` (dismissed) hides until next open. Neither is persisted — by design.

**Lifecycle.** Creation and persistence are single-authority. Death is handled correctly (410/404 → terminal → cleared). **What is missing is re-acquisition**: nothing asks a dead-but-willing student to re-grant.

**Delivery.** Healthy. `received_at` means **"the service worker's push handler executed"** — `sw.js` fires the beacon in parallel with `showNotification()` and never observes its result. **The web platform provides no display confirmation.** The strongest honest metric is defined in §18.

---

## 12–13. Target architecture and student journey

**No new architecture. No new system. Three targeted changes inside the
existing authorities.**

**iOS journey (new, additive):**
```
iPhone student wants reminders
 → detect: in App Store wrapper (cr_store=ios) AND iOS ≥16.4
 → explain honestly: "iPhone reminders need the Home Screen version"
 → guided Safari → Share → Add to Home Screen
 → student opens the Home Screen app (display-mode: standalone)
 → the EXISTING StandaloneNotifAsk fires — no new permission code
 → the EXISTING push-client creates + persists the subscription
 → student is reachable
```
The App Store app **stays** and keeps every other job.

**Android journey (change one thing):** add a value line before the ask —
"CareerRai will remind you about today's study task" — inside the existing
overlay. No new component, no new prompt, no extra frequency.

**Recovery journey:** the 68 active+willing+dead students already meet
`StandaloneNotifAsk`'s reconnect branch (`pushEnabled && serverSubDead`). Verify
it actually renders for them before adding anything.

---

## 14. Exact changes required

| # | Change | File | Risk |
|---|---|---|---|
| 1 | iOS students seeking notifications get an A2HS route instead of only the App Store link | `src/lib/install/capabilities.ts` + install UI | **MEDIUM — product trade** |
| 2 | Value sentence before the ask | `standalone-notif-ask.tsx` (copy only) | LOW |
| 3 | Verify/repair the reconnect branch for the 68 | `standalone-notif-ask.tsx` / layout props | LOW |
| 4 | Funnel events: education_shown, a2hs_guided, a2hs_completed | `journey.ts` EventName | LOW |
| 5 | Rename display semantics in docs/UI; never call receipt "displayed" | docs + `notification-health` copy | LOW |

**Not a schema change. Not a new table. Not a new sender. Not a new cron.**

## 15. What NOT to change

`push.ts` sender · 410/404 cleanup · `/api/push/received` · `push-subscription-registry` · `dispatch()`/eligibility · cron schedules · the one-device schema · the three permission surfaces · the App Store app's existence. **All were tested as hypotheses and disproven, or are already single-authority.**

## 16. Migration / compatibility

None required. Every change is additive or copy. No stored data is reinterpreted. Existing subscriptions keep working unchanged.

## 17. Analytics required

Already shipped 1 Sep: `push_ask_shown`, `push_ask_skipped{why}`, `push_ask_later`, `push_ask_blocked`, `push_ask_dismissed`, `push_ask_failed`.
To add: `notif_education_shown`, `ios_a2hs_guide_shown`, `ios_a2hs_completed` (inferred from first `standalone` session by a prior `ios_app` student).

## 18. Success metrics

**Primary:** % of active students with a **valid, recently verified** endpoint —
`push_subscription IS NOT NULL AND push_verified_at >= now() - 30d`, over
installed-active. **Today: 139/615 = 22.6%.**

Reported separately for Android / iOS wrapper / iOS PWA / Desktop.

**Honest display metric.** The web platform cannot confirm visible display.
The strongest honest chain we can assert is:
**provider accepted → service worker executed → (unobservable gap) → clicked.**
`push_verified_at` will be described as **"service worker executed"** everywhere.

**Secondary:** setup completion (`push_ask_shown` → `push_enabled`), permission acceptance, recovery rate for the 68, provider acceptance, receipt rate, click rate, and 7-day retention reachable vs not.

## 19. Regression guards

- Capability authority stays single (no second `isApple` branch).
- Subscription creation stays single (no `pushManager.subscribe` outside `push-client.ts`).
- The ask still returns every app open (founder rule, 23 Jul).
- No copy may claim a notification was "displayed".
- iOS A2HS route must not render for a student already in `standalone`.

## 20. Rollout

**Phase 1 (today):** change 2, 3, 4 — Android copy + reconnect verification + events. Low risk, no product trade.
**Phase 2:** change 1 — iOS A2HS route. Ship behind honest copy; measure `ios_a2hs_completed`.
**Phase 3:** recovery for the 68.
**Phase 4:** observability rename + display honesty.
**Phase 5:** re-quantify what remains blocked by the wrapper; only then revisit APNs.

## 21. Rollback

Every change is a revert. No schema, no migration, no data reinterpretation.

## 22. Risks

- **The iOS A2HS route partially competes with the App Store app** shipped 10 Aug. Real trade; founder has pre-authorised, but it is the one decision worth re-confirming before Phase 2 ships.
- **Reach moves over days, not hours** — students must open the app and act. Today's deploy can prove the *mechanism*, not the *number*.
- Over-prompting risk: mitigated by changing copy, not frequency.
- iOS < 16.4 cannot use A2HS push at all — those students stay unreachable.

---

*Phase 0 complete. No code written.*
