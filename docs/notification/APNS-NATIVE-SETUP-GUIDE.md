# APNs native setup — the founder's half, click by click

**Date:** 3 Sep 2026 · **Server half:** already merged (`apns.ts`, `/api/push/register-apns`, the `ApnsTokenBridge` page global, routing in `push.ts`).
**This document is everything engineering cannot do from the repo** — it needs your Mac, your Apple Developer account, and the existing `.xcodeproj`. Nothing here creates a new app or changes the app's architecture: you are adding push registration to the wrapper you already shipped.

The server side is DORMANT until Part 4's config rows exist — merging it changed nothing for any student on any platform.

---

## Part 0 — Confirm the project builds (5 min)

1. **Spotlight (⌘ Space)** → type your project name → open the `.xcodeproj` (blue blueprint icon). Same as `XCODE-RESUBMIT-GUIDE.md` Part 0.
2. Press **⌘ R** with a simulator selected.
3. **Success looks like:** the simulator opens the app and CareerRai loads.
4. While here, read two values off the **General** tab (click the blue project icon → the target under TARGETS):
   - **Bundle Identifier** (e.g. `com.careerrai.something`) — you will need it twice below.
   - **Team** under Signing & Capabilities.

If it does not build, stop and tell Claude the exact error — nothing below can proceed.

## Part 1 — Mint the APNs auth key (5 min, Apple Developer site)

1. **Screen:** [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles** → **Keys** (left sidebar).
2. **Button:** blue **+** next to "Keys".
3. **Values:** Key Name `CareerRai APNs` → tick **Apple Push Notifications service (APNs)** → **Continue** → **Register**.
4. **Download** the `.p8` file once (Apple only offers it once) and note the **Key ID** shown on that page (10 characters).
5. Also note your **Team ID**: top-right of the account page, or Membership details (10 characters).
6. **Success looks like:** a `.p8` file in your Downloads and two 10-character IDs written down.

> ⚠️ The `.p8` never goes into git, chat, email, or this repo. It goes into the database in Part 4, and nowhere else. If it ever leaks, revoke the key on this same screen and mint a new one — that is the whole recovery procedure.

## Part 2 — Add the capability in Xcode (3 min)

1. **Screen:** project settings → your app target → **Signing & Capabilities** tab.
2. **Button:** **+ Capability** (top-left of that pane) → double-click **Push Notifications**.
3. **Success looks like:** a "Push Notifications" section appears in the tab, and (with Automatically manage signing on) Xcode regenerates the provisioning profile without errors.
4. Background Modes → *remote notifications* is **not needed** for v1 — we send visible alerts only, no silent pushes.

## Part 3 — Paste the registration code (10 min)

The wrapper template is a WKWebView shell. Find the file that owns the web view (`ViewController.swift` or `ContentView.swift` — the one containing `https://careerrai.in`, per `XCODE-RESUBMIT-GUIDE.md` Part 2) and the app's entry point.

**3a. In the app delegate** (if the project is SwiftUI-only with no AppDelegate, add one via `@UIApplicationDelegateAdaptor` — Claude can generate that variant on request):

```swift
import UserNotifications

// In application(_:didFinishLaunchingWithOptions:) — or the adaptor's equivalent:
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
    if granted {
        DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
    }
}

// Add these two delegate methods:
func application(_ application: UIApplication,
                 didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    ApnsTokenHolder.shared.announce(token: hex)
}

func application(_ application: UIApplication,
                 didFailToRegisterForRemoteNotificationsWithError error: Error) {
    print("APNs registration failed: \(error)") // visible in Xcode console; nothing else to do
}
```

**3b. New file `ApnsTokenHolder.swift`** — hands the token to the page, retrying until the student is logged in (the page global only exists inside the authenticated layout):

```swift
import WebKit

final class ApnsTokenHolder {
    static let shared = ApnsTokenHolder()
    weak var webView: WKWebView?          // set this from the view controller after creating the web view
    private var token: String?
    private var timer: Timer?

    func announce(token: String) {
        self.token = token
        deliver()
        // The page may not be ready, or the student not signed in yet.
        // Retry every 10s; the page-side global dedupes, the server is idempotent.
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.deliver() }
    }

    private func deliver() {
        guard let token, let webView else { return }
        let js = "window.__careerraiRegisterApnsToken && (window.__careerraiRegisterApnsToken('\(token)'), true)"
        webView.evaluateJavaScript(js) { [weak self] result, _ in
            if result as? Bool == true { self?.timer?.invalidate() }   // page accepted it — stop retrying
        }
    }
}
```

**3c. One line where the web view is created:** `ApnsTokenHolder.shared.webView = webView`

**Success looks like:** run on a **real iPhone** (simulators get no real APNs token), accept the permission prompt, sign in — then in Supabase:
`select provider, platform, left(device_token, 12), registered_at from notification_endpoints where provider = 'apns' order by registered_at desc limit 3;` shows a fresh row for your student.

## Part 4 — Server credentials (5 min, Supabase dashboard)

**Screen:** Supabase → project `pobhpszlsozeonejtzqy` → Table Editor → `server_config`. Insert four rows (`key` / `value`):

| key | value |
|---|---|
| `APNS_TEAM_ID` | the 10-char Team ID from Part 1 |
| `APNS_KEY_ID` | the 10-char Key ID from Part 1 |
| `APNS_AUTH_KEY` | the **entire text contents** of the `.p8` file, `BEGIN`/`END` lines included |
| `APNS_TOPIC` | the Bundle Identifier from Part 0 |

(Optional fifth row `APNS_ENV` = `sandbox` **only while testing an Xcode-run debug build** — a debug build's token lives on Apple's sandbox gateway. Delete the row before the App Store build goes out; absent means production.)

**Success looks like:** the next dispatch to a student holding an `apns` endpoint records `provider_accepted_at` in `notification_deliveries` instead of `apns_not_configured`.

## Part 5 — Ship it

New build number (`XCODE-RESUBMIT-GUIDE.md` Part 3) → **Product ▸ Archive** → Distribute → App Store review (1–7 days) → release. Then each student must **update the app and open it once**; the token registers on that open.

---

## What this makes true — and the honest limits

- Up to **211 students** (App Store surface, all seen within the last 30 days; **64 in the last 7**) become *registrable*. Each must **update, open, and tap Allow** — engineering can force none of the three, and uninstalls since their last visit are invisible until a send returns 410. Do not read 211 as a promise.
- APNs evidence stops at **provider accepted** for v1. The receipt/click beacons are service-worker code the native shell doesn't run; a native tap-report is a small v2 (`userNotificationCenter(_:didReceive:)` → `/api/push/click`) once v1 is live.
