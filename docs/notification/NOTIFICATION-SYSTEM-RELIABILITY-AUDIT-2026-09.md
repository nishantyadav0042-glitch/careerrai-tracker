# CareerRai Notification System — Reliability Audit

**Date:** 1 September 2026 · **Phase:** 0–9 complete (audit + research). **No code written.**
**Snapshot:** production `pobhpszlsozeonejtzqy`, repo `ff8a4a8`.
**Companions:** `NOTIFICATION-REACH-ROOT-CAUSE-AUDIT-2026-09.md`, `IOS-NATIVE-PUSH-SCOPE-2026-09.md`, `NOTIFICATION-REACH-FIX-PLAN-2026-09.md`

---

## 1. Executive diagnosis

**The notification *system* is not broken. The notification *funnel* is.**

I went a level deeper than the previous audits and deliberately tried to falsify
their conclusions. Three things I expected to find wrong turned out to be
**already correct and I am recording them as disproven hypotheses**, not as work:

- **Idempotency** — a partial unique index enforces one notification per
  student, per type, per **IST** day. **Zero violations inside its scope since
  16 Aug.** Every duplicate found is an out-of-scope type where
  multiple-per-day is correct behaviour.
- **Timezone** — I hypothesised the index used a UTC day boundary while the
  product uses IST, which would let a duplicate through between 00:00–05:30 IST.
  **That hypothesis is wrong.** The index expression is
  `((created_at AT TIME ZONE 'Asia/Kolkata')::date)`.
- **Duplicate architecture** — does not exist. Every permission surface already
  shares one subscription authority.

**The loss is upstream, in two places, for two different reasons:**

| Problem class | Students | % of 615 | Recoverable? |
|---|---|---|---|
| **B. ACQUISITION** — capable, never subscribed | **268** | 43.6% | **Yes** |
| **A. CAPABILITY** — surface cannot receive Web Push | **206** | 33.5% | Only by changing surface |
| **C. SUBSCRIPTION HEALTH** — subscribed once, now dead | 115 (68 active) | — | **Partly** |
| **D. DELIVERY** — valid subscription, failed downstream | **~0 students** | ~8% of *sends* | n/a |

**Acquisition is the largest bucket and the only one fixable with no product
trade-off.**

---

## 2. Architecture map — one authority per concern (verified, not assumed)

| Concern | THE authority | Verified by |
|---|---|---|
| Capability | `src/lib/install/capabilities.ts` | grep: single `isApple` branch |
| Surface detection | `displayModeFrom()` `journey.ts:35` | single definition |
| Store source | `normalizeStoreSource()` `store-build.ts` | comment records the one prior divergence, now fixed |
| Subscription creation | `getLiveSubscription()` `push-client.ts:49` | **all 3 UIs import it** |
| Persistence | `persistSubscription()` → `/api/push/subscribe` → `push-subscription-registry.ts` | single registry |
| "Is student receiving?" | `push-state.ts` | single |
| Eligibility/decision | `dispatch()` `notification-os.ts` | only caller of the sender |
| Sending | `sendPushToUser()` `push.ts:76` | source-scan guard exists |
| Healing | `push-healer.tsx` | single |
| Delivery state | `notifications` columns + `push_verified_at` | single |

**Three permission UIs** — `standalone-notif-ask` (student), `push-gate`
(buddy/staff), `push-toggle` (settings). **Three surfaces, one architecture.**
They must not be merged.

---

## 3. Loss tree (production, 30 days)

```
615  ACTIVE INSTALLED STUDENTS
 ↓  −206  CAPABILITY: iOS WKWebView wrapper has no Web Push API
409  NOTIFICATION-CAPABLE SURFACE
 ↓   UNKNOWN   NOTIFICATION EDUCATION SHOWN      ← stage does not exist in product
 ↓   UNKNOWN   PERMISSION PROMPT SHOWN (historic) ← not instrumented until 1 Sep
210  PERMISSION/PREFERENCE ON
 ↓  −69    subscription created but not current (63 died + in-flight)
141  VALID SUBSCRIPTION TODAY
139  RECENTLY VERIFIED (≤30d)
 ↓
610  SEND ATTEMPTED (row created — incl. in-app-only for students with no endpoint)
188  PROVIDER ACCEPTED
198  SERVICE WORKER RECEIVED (in window; >188 incl. since-died endpoints)
  ?  DISPLAY ATTEMPTED — **UNKNOWN, unobservable**
 62  USER INTERACTED
```

| Stage | Loss | % | Evidence | Root cause | Conf | Recoverable | Fix |
|---|---|---|---|---|---|---|---|
| Installed → capable | 206 | 33.5% | 208 wrapper students, 2 ever subscribed (both endpoints FCM, made on other devices) | WKWebView; no APNs in repo | **PROVEN** | Only via surface change | Phase 2 |
| Capable → permission | ~199 | 32% | 409 capable, 210 pref on; only 8 recorded declines | never completed the ask; **no education step exists** | HIGH | **Yes** | Phase 1 |
| Permission → valid sub | 69 | 11% | 63 `push_died_at`; 115 dead+willing, **68 active** | subscription mortality, no self-serve re-ask | **PROVEN** | **Partly** | Phase 3 |
| Provider → SW receipt | ~8% of rows | — | 8,908/9,673 = **92%** | healthy | **PROVEN** | n/a | none |
| SW receipt → display | **UNKNOWN** | — | `showNotification()` result never observed | web platform limit | **UNKNOWN** | n/a | Phase 4 (honesty) |
| Display → click | 136 | 69% | 62 clicked | behaviour + unknown display | MEDIUM | n/a | product |

---

## 4. Platform breakdown

| Surface | Students | Pref on | Valid sub | Verified ≤30d | Class |
|---|---|---|---|---|---|
| Android PWA | 373 | 189 | **125 (34%)** | 121 | **B — acquisition** |
| iOS App Store wrapper | **208** | 2 | **2 (1%)** | 2 | **A — capability** |
| Desktop PWA | 21 | 11 | 7 (33%) | 7 | B (small) |
| iOS Safari PWA | 13 | 8 | **7 (54%)** | 7 | **works — the proof** |

All 6 `web.push.apple.com` subscriptions were created **13–23 July**. **Zero
since.** The App Store route shipped 10 Aug (`capabilities.ts:37`). Android
acquired 117 of 161 *after* that date. **iOS acquisition did not decline — it stopped.**

---

## 5. Permission × subscription state matrix (production)

| Browser permission | Server subscription | Students | Current behaviour | Correct? |
|---|---|---|---|---|
| granted | valid | 141 | reachable | ✅ |
| granted | missing/dead | — | `PushHealer` silently repairs | ✅ (4 healed) |
| **default** | missing/dead | **≥6 measured** | healer bails (`push-healer.tsx:87`); reconnect ask should fire | ⚠️ **verify** |
| denied | missing | 1 measured | Settings-recovery panel (shipped today) | ✅ |
| denied | old subscription | 0 | cleared on 410/404 | ✅ |
| unknown | unknown | historic | **UNKNOWN — Memory #64** | ⚠️ instrumented 1 Sep |

**`PushHealer` audit (§9).** Runs once per session, gated on
`Notification.permission === 'granted'`. It **cannot** repair a `default` or
`denied` permission — correctly, since only an ask can. Of 11 attempts:
**6 `browser_permission_default`, 1 `denied`, 4 succeeded.** It does not create
duplicates (reuses a live sub, rotates only on key change) and does not
overwrite a healthy subscription. **It is honestly named: it heals what is
healable.** The gap is that nothing *asks* the 6.

---

## 6. Reliability properties — verified, not assumed

**Idempotency (§21): PROVEN CLEAN.**
`notifications_once_per_day_per_type` — UNIQUE `(user_id, type, (created_at AT
TIME ZONE 'Asia/Kolkata')::date)`, partial: rows since 2026-08-16 13:16 and 21
named student-nudge types. **Zero violations inside scope.** All 1,723
same-IST-day duplicates are out-of-scope types — `founder_ping` (628),
`new_signup` (563), `escalation` (42), `chat` (38), `red_flag` (22) — staff and
event-driven notifications where multiple per day is **correct**.

**Frequency (§20).** Shared daily budget across all student nudge types
(`DAILY_BUDGET`), a 10/day push ceiling (`daily_cap`), and
`notification_duplicate_suppressions` logging every prevented duplicate. The
code cites a prior "Inshorts discussion" as the origin of the state-based
budgets.

**Timezone (§22).** Crons are scheduled in UTC (`vercel.json`) but every
day-boundary decision is IST — `studyDayString()` (05:30 IST rollover),
`getLogDateString()`, and the unique index. **No mismatch found.** One
scheduling defect stands, already known: the `morning` slot has **no cron
entry** and has never fired.

---

## 7. Research: what to learn from best-in-class (§18)

**Separating what is publicly observable from inference from our decision:**

- **Publicly documented (Inshorts):** the product is built on a limited number
  of daily notifications and a personalised feed. *Observable claim.*
- **My inference:** the value comes from restraint plus relevance creating a
  daily ritual, not from volume. *Inference — I do not know their internals and
  will not invent them.*
- **Our decision:** CareerRai already implements the restraint half — a shared
  daily budget and a hard duplicate guard. **We should not add notifications.
  We should make the ones we send reach people.** Reach, not volume, is the gap.

I deliberately did **not** research further vendor internals, because nothing
publicly verifiable would change the diagnosis: our loss is at permission and
capability, before content strategy is even reachable.

---

## 8. Target: the health model (§16) — a projection, not a system

Classify every active student over the **existing** authorities. No new table.

```
SURFACE_NOT_SUPPORTED   ios_app wrapper                          → 206
REACHABLE               valid sub + verified ≤30d                → 139
SUBSCRIPTION_STALE      pref on, sub dead                        → 115 (68 active)
PERMISSION_DENIED       recorded denial                          → ~10
PERMISSION_UNKNOWN      capable, no pref, never measurably asked  → ~199
RECENTLY_UNVERIFIED     valid sub, no receipt ≤30d               → 2
DELIVERY_FAILURE        accepted, never received, repeatedly     → measure
CAPABLE_BUT_NOT_SETUP   capable, permission default              → subset of above
UNKNOWN                 must trend to 0
```

---

## 9. Root causes ranked

**P0** — (1) iOS routing to a non-capable surface, 206 students, PROVEN.
(2) Android acquisition funnel, 248 students, PROVEN.
**P1** — (3) 68 active+willing+dead students with no self-serve re-ask.
(4) No education step before the permission ask anywhere in the product.
**P2** — (5) display unobservable. (6) permission-granted-but-no-subscription, historically unmeasurable.
**P3 — DISPROVEN:** transport (92%), one-device schema (**0 of 125** multi-platform), eligibility/cron (610/615), receipt instrumentation, **idempotency**, **timezone**, **duplicate architecture**.

---

## 10. Honest limits

- **Visible display cannot be confirmed on the web platform.** `received_at`
  means *"the service worker's push handler executed."* It will be labelled that
  way everywhere. The strongest honest chain is
  **provider accepted → SW executed → (unobservable) → clicked.**
- **Real-device verification (§14/§15) cannot be performed by me.** I have no
  physical Android phone or iPhone. This is a hard limit, and by the founder's
  own quality gate the project cannot be declared complete without it. It needs
  a human on a real device, or a nominated test student.
- Historic never-asked vs declined: **UNKNOWN** (Memory #64).

---

## 11. Success metrics

**Primary:** valid + verified ≤30d endpoint / active installed students.
**Today: 139 / 615 = 22.6%.** Reported per surface.
**Economic:** notification-reachable active / acquired active — the acquisition
spend is only defensible to the extent students remain reachable.
**Never** report provider acceptance as delivery, a subscription row as reach,
or a prompt shown as onboarding working.

---

## 12. What must NOT be changed

The sender · 410/404 cleanup · `/api/push/received` · `push-subscription-registry` ·
`dispatch()` and eligibility · cron schedules · the one-device schema · the
unique index · the daily budget · the three permission surfaces · the App Store
app's existence. **Each was tested as a hypothesis and disproven, or is already
correct and single-authority.**

---

*Audit phases complete. No code written. Implementation follows the phased plan
in `NOTIFICATION-REACH-FIX-PLAN-2026-09.md`.*
