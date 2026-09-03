# Scope: what native iOS push (APNs) would actually take

**Date:** 1 September 2026 · **Status:** scope only, nothing built
**Companion to:** `NOTIFICATION-REACH-ROOT-CAUSE-AUDIT-2026-09.md`

---

## Headline

**Native APNs cannot be started from this repository at all.** Not "expensive" —
**blocked**. The iOS app's source code does not exist here. Exhaustive search:
no `.xcodeproj`, no `.xcworkspace`, no `Info.plist`, no `AppDelegate`, no
`Podfile`, no `.entitlements`, no Capacitor config. The App Store build is a
WKWebView shell, built outside this repo, that loads `careerrai.in?source=ios`.

Everything below is therefore a scope of work that **cannot begin today**,
recorded so the decision is made on facts rather than on optimism.

---

## What native APNs requires — all seven, none optional

| # | Requirement | Where it lives | Have it? |
|---|---|---|---|
| 1 | iOS app source to add push registration | outside this repo | **NO — blocker** |
| 2 | Apple Developer APNs auth key (`.p8`) + Key ID + Team ID | Apple Developer account | unknown |
| 3 | Push Notifications capability + `aps-environment` entitlement | app target | **NO** |
| 4 | Native registration (`UNUserNotificationCenter`, `registerForRemoteNotifications`) | Swift/ObjC | **NO** |
| 5 | Token bridge native → server | new endpoint | **NO** |
| 6 | Device-token storage | **schema change** | **NO** |
| 7 | APNs HTTP/2 sender with JWT signing + transport router | `src/lib/push.ts` | **NO** |

### Why #6 is a real schema change, not a column rename

`profiles.push_subscription` is Web Push shaped:

```json
{ "endpoint": "https://…", "keys": { "p256dh": "…", "auth": "…" } }
```

An APNs device token is a bare 64-hex string with no endpoint and no keys, and
it is issued **per app install**, not per browser. It cannot be stuffed into
this shape without lying about what the column means. A second transport needs a
second store and a router in `sendPushToUser()` — which today calls
`webpush.sendNotification()` unconditionally (`src/lib/push.ts:142`).

### Why the timeline is worse than the build

Even with source in hand: build → TestFlight → **App Store review (1–7 days)** →
**and then each student must UPDATE the app**. A student who never updates never
becomes reachable. Nothing here helps a single student this week.

---

## The finding that changes the decision

I checked when every live push subscription was created, by push service:

| Push service | Students | First | Last | Created after 10 Aug |
|---|---|---|---|---|
| `fcm.googleapis.com` (Chrome/Android) | 161 | 1 Jul | **1 Sep** | **117** |
| `web.push.apple.com` (Apple Web Push) | **6** | 13 Jul | **23 Jul** | **0** |

**Every Apple Web Push subscription we have was created between 13 and 23 July.
Not one since.** Android kept acquiring normally through 1 September.

The cause is in the code. `src/lib/install/capabilities.ts:37`:

```ts
if (isApple) return 'ios-app-store';
```

Every iOS student is routed to the App Store app. The same file records why
(line 95): *"Native app shipped 10 Aug 2026 — App Store universal link. **A2HS
stays as the quiet fallback.**"*

**iOS push acquisition did not decline after 10 August. It stopped.** We began
routing every iPhone student into the one surface that structurally cannot
receive a notification, and the surface that demonstrably *could* became a
"quiet fallback" nobody reaches.

This is not a bug in the notification system. It is an install-routing decision
whose notification cost was invisible — because until 1 Sep nothing measured it.

---

## The two options, honestly compared

| | **A. Native APNs** | **B. Operationalize the PWA route** |
|---|---|---|
| Can start today | **No — no source** | **Yes** |
| Proven to work for CareerRai | Never attempted | **Yes — 6 students, live** |
| App Store review | Required | None |
| Needs student to update app | Yes | No |
| Schema change | Yes (token store + router) | **None** |
| Time to first reachable student | Weeks, best case | Same day |
| Keeps the App Store app | Yes | Yes — it stays for everything else |

**Option B is not a workaround.** `web.push.apple.com` is Apple's own Web Push
service, on iOS 16.4+, in a Home Screen PWA. It is a first-class Apple
transport, and it is the only one we have ever successfully used on iOS.

### What Option B costs, stated plainly

- An iPhone student must add the site to their Home Screen **in Safari** — a
  real friction step, and a worse install than a one-tap App Store link.
- Students already inside the App Store app must be told there is a second way
  to get reminders. That is awkward, and it partially competes with an app the
  founder deliberately shipped on 10 August.
- iOS < 16.4 cannot do it at all.

**This is a genuine product trade, not a free win.** The reason to take it is
that the alternative reaches nobody at all, and cannot be started from here.

---

## Recommendation

**Do not build APNs now — it is blocked, not merely expensive.**

Take Option B, and treat the routing line as the primary fix: an iPhone student
who wants notifications must be able to reach the surface that can deliver them.
The App Store app keeps its role for everything else.

**If the founder wants APNs anyway,** the first step is not code — it is
obtaining the iOS app source and confirming the Apple Developer account holds
(or can mint) an APNs key. Until both exist, no engineering estimate here is
worth anything.

---

# ADDENDUM — 3 September 2026

Everything above was written on 1 Sep. Three of its load-bearing claims have
since changed. Recorded here rather than in a competing document, so this file
stays the single iOS-push source of truth.

## 1. The central finding is FALSIFIED — Apple acquisition restarted

The doc's decisive claim was: *"Every Apple Web Push subscription we have was
created between 13 and 23 July. Not one since."*

That is no longer true.

| Registered | Context at subscribe | Endpoints |
|---|---|---:|
| **3 Sep 2026** | standalone | **2** |
| 23 Jul | standalone | 1 |
| 14 Jul | standalone | 1 |
| 13 Jul | standalone | 4 |

Eight live Apple Web Push endpoints, **two of them minted today**, both from a
Home Screen PWA. The most likely cause is the iOS gating fix merged this morning
(PR #168, "stop blocking genuine iOS Safari standalone push ask"), which removed
a blanket Apple check that was refusing the ask even in standalone.

**Option B is no longer theoretical. It is running, and it acquired today.**

## 2. Requirement #6 is already DONE, and #7 is half done

The table above lists seven requirements. Two have since shipped as part of the
endpoint-registry migration (`20260901a`, Step 1) and Step 2:

- **#6 device-token storage — DONE.** `notification_endpoints` already carries
  `provider` (`'web_push' | 'apns'`), `device_token text`, and a partial unique
  index `notification_endpoints_unique_apns` on `(student_id, device_token)
  where provider = 'apns'`. The "second store" the doc called for exists.
- **#7 transport router — HALF DONE.** `sendToEndpoint()` already branches on
  provider and records a delivery row with reason `no_transport_for_provider`
  for APNs. What is missing is only the APNs HTTP/2 sender with JWT signing —
  not the routing around it.

So the remaining server-side work is **one function**, not a schema migration
plus a refactor.

## 3. "Blocked" was too strong — the source exists, just not here

The doc says native APNs *"cannot be started from this repository at all"*.
True, and still true. But `docs/XCODE-RESUBMIT-GUIDE.md` (Part 0) instructs the
founder to Spotlight-search for the `.xcodeproj` and open it. The iOS source
exists on the founder's Mac; it is outside the repo, not absent.

The correct status is **not blocked — gated on two founder confirmations**
(below), which is a materially different decision.

---

## The reach numbers that make this urgent (3 Sep audit)

Every student whose last observed platform is iOS, by surface:

| iOS surface | Students | Reachable | Rate |
|---|---:|---:|---:|
| `ios_app` — App Store WKWebView | **211** | **2** | **0.9%** |
| `standalone` — Home Screen PWA | 24 | 7 | **29%** |
| `browser` — Safari tab | 32 | 0 | 0% (Apple forbids it) |

The Home Screen PWA converts to a reachable device **32× better** than the App
Store app. And `src/lib/install/capabilities.ts:37` still routes every iOS
student to the App Store app:

```ts
if (isApple) return 'ios-app-store';
```

211 students were sent, deliberately and correctly for install conversion, to
the one iOS surface that structurally cannot receive a notification.

---

## The founder's 14 questions, answered

| # | Question | Answer |
|---|---|---|
| 1 | Current iOS architecture? | WKWebView shell loading `careerrai.in?source=ios` |
| 2 | WKWebView / TWA / native? | **WKWebView wrapper.** (Android is a separate TWA, `com.careerrai.app`) |
| 3 | Apple-supported notification architecture required? | **APNs** — Apple grants Web Push only to Safari and Home Screen PWAs, never to a third-party app's embedded web view |
| 4 | Minimum native changes? | Push Notifications capability + `aps-environment` entitlement; `UNUserNotificationCenter` request; `registerForRemoteNotifications`; POST the token to a new endpoint |
| 5 | Can the web app stay the UI? | **Yes.** Native handles registration + token only; all UI stays web |
| 6 | Credentials required? | APNs auth key (`.p8`) + Key ID + Team ID, from the Apple Developer account |
| 7 | Mac/Xcode needed? | **Yes** — and the founder has both (see §3) |
| 8 | App Store release changes? | New build → review (1–7 days) → **every student must update the app** |
| 9 | Identity → token mapping? | Web view is already authenticated; it posts the native token to `/api/push/register-apns`, stored against `student_id` |
| 10 | Coexist with Web Push? | **Yes, already designed for it.** One student, many endpoints, mixed providers — that is exactly what the registry does |
| 11 | DB changes? | **None.** Already shipped (§2) |
| 12 | Smallest viable implementation? | Native: capability + register + POST token. Server: one APNs sender behind the existing provider branch |
| 13 | Engineering risk? | **Server-side low** (isolated function, existing router, existing schema). **Delivery risk high** — App Store review plus a student-update requirement no engineering can shorten |
| 14 | Human action required? | Two confirmations — see below |

---

## RECOMMENDATION — **A, and it is no longer blocked; B continues in parallel**

Not "A or B". They serve different students, and B is already running.

**B (Home Screen PWA) — continue, no decision needed.** Already live, acquired
2 endpoints today, converts 32× better than the App Store route. Costs nothing
further; it is the status quo now working correctly.

**A (native APNs) — the only thing that reaches the 211, and now viable.** The
schema is done, the router is done, the source exists on the founder's Mac. What
remains is one Swift registration path, one server function, and Apple's
timeline. Recommend proceeding **once the two confirmations below land**.

Explicitly NOT recommended: changing `capabilities.ts:37` to route iPhones away
from the App Store app. That is a genuine product trade against an app the
founder shipped on 10 Aug, and it belongs to the founder, not to engineering.

## EXACT HUMAN ACTIONS REQUIRED

1. **Confirm the iOS project opens** — Spotlight the `.xcodeproj` per
   `docs/XCODE-RESUBMIT-GUIDE.md` Part 0, and say whether it builds.
2. **Confirm the Apple Developer account can mint an APNs auth key** —
   Certificates, Identifiers & Profiles → Keys → **+** → *Apple Push
   Notifications service (APNs)*. Do not send the `.p8` anywhere; only confirm
   it can be created. It is a credential and belongs in the server's env, never
   in this repo.

Until both are confirmed, no APNs engineering estimate here is worth anything —
that part of the 1 Sep doc stands unchanged and correct.

---

*Addendum: analysis only. No code, schema, or deployment changed by it.*
