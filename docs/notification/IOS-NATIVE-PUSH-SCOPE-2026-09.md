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

*Scope only. No code, schema, or deployment changed.*
