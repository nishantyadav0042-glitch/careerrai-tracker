# Xcode → App Store resubmission, click by click

Written 29 Jul 2026 for the 1.0 rejection (submission `ddfd8f62…`). Companion
to `docs/APP-STORE-SUBMISSION.md` (which holds the WHY); this file is only the
HOW — every button, shortcut, and what the screen shows at each step.

Time budget: ~20 min in Xcode, ~20 min in App Store Connect, plus Apple's
build-processing wait (5–30 min).

---

## Part 0 — Open the project (2 min)

1. Press **⌘ + Space** (Spotlight), type your project's name, press Enter.
   If you don't remember the name: open **Finder**, press **⌘F**, search for
   `.xcodeproj`. The project file has a **blue blueprint icon**.
2. If the folder contains BOTH a `.xcodeproj` and a `.xcworkspace` (white
   icon), double-click the **`.xcworkspace`**. Otherwise double-click the
   `.xcodeproj`.
3. What you'll see: Xcode opens with three areas —
   - **Left sidebar** = file navigator (your files as a tree)
   - **Middle** = editor
   - **Top toolbar** = ▶ Run button, app name, and a device selector
     (says something like "iPhone 16 Pro")

If the left sidebar is missing, press **⌘ + 1**.

---

## Part 1 — Remove iPad support (3 min)

> Why now: Apple does NOT let a released app drop a device family later.
> 1.0 was rejected, never released — this is the one free chance to go
> iPhone-only. Doing it deletes the 13-inch iPad screenshot requirement,
> which closes guideline 2.3.3 with iPhone screenshots alone.

1. In the left sidebar, click the **very first item at the top** — the blue
   icon with your app's name. The editor turns into the project settings.
2. In the settings screen's own left column you'll see **PROJECT** and
   **TARGETS**. Under **TARGETS**, click your app (the row with the app icon).
3. Across the top of the editor: tabs reading **General · Signing &
   Capabilities · Resource Tags · Info · Build Settings · …** Click
   **General**.
4. Scroll to **Supported Destinations**. You'll see a small table with rows
   like:
   - iPhone
   - iPad
   - Mac (Designed for iPad)
   - Apple Vision (Designed for iPad)
5. Click the **iPad** row once (it highlights blue) → press the **Delete
   key** (or click the **−** button under the table). If a confirmation
   appears, confirm.
6. Do the same for **Mac (Designed for iPad)** and **Apple Vision (Designed
   for iPad)** if they're listed — they piggyback on iPad support.
   Only **iPhone** should remain.
7. *Older Xcode (13 or earlier):* there's no Supported Destinations table;
   instead under **Deployment Info** there are iPhone/iPad checkboxes —
   **untick iPad**.
8. **Verify it took:** click the **Build Settings** tab → in the search box
   (top-right of the editor) type `targeted device` → the row **Targeted
   Device Family** must now say **iPhone** (internally the value `1`). If it
   still says "iPhone, iPad", double-click the value and untick iPad.

---

## Part 2 — Set the start URL (2 min)

> This one parameter switches on two server-side behaviours built for the
> store build: install banners stay hidden (the 2.3.10 fix) and payments
> escape to Safari (the 3.1.1 path). Wrong or missing = both stay off.

1. Press **⌘ + Shift + F** (Find in Workspace). The left sidebar switches to
   a search field. Type `careerrai` and press Enter.
2. Every file containing that text is listed. Look for a **.swift** file with
   a line containing `https://careerrai.in` — typically `ViewController.swift`,
   `ContentView.swift`, or a `Settings`/`Constants` file. Click the result;
   the editor opens with the line highlighted.
3. Change the URL string (keeping its quotes) to exactly:

   ```
   https://careerrai.in/student/tracker?source=ios
   ```

4. If several URL strings exist, change only the **initial/start/home URL**
   — the one the web view loads on launch. Leave any "allowed hosts" or
   domain-whitelist strings alone.
5. Press **⌘ + S** to save.

---

## Part 3 — Version and build number (1 min)

1. Back to project settings: **⌘ + 1** → click the top blue project icon →
   **TARGETS** → your app → **General** tab.
2. In the **Identity** section:
   - **Version**: leave as `1.0`
   - **Build**: change `1` to **`2`**

Optional but worth 30 seconds — skip the export-compliance question forever:
**Info** tab → hover any row → click **+** → type
`App Uses Non-Exempt Encryption` → set the value to **NO**. (The app only
uses standard HTTPS.) Without this, App Store Connect asks an encryption
question on every submission.

---

## Part 4 — Test in the Simulator (5 min, do not skip)

1. In the top toolbar, click the **device selector** (next to the app name)
   → choose an iPhone simulator, e.g. **iPhone 16 Pro Max**.
2. Press **⌘ + R** (or the ▶ button, top-left). First build takes a minute;
   the Simulator app opens and launches CareerRai.
3. Check, in this order:
   - The login screen appears with **"Log in with password"** clearly
     visible — and **NO orange "Install the CareerRai app" banner**. The
     missing banner is proof the `?source=ios` flag is working end to end.
   - Tap "Log in with password" → the first field accepts
     `appreview@careerrai.in` (letters and @).
   - Sign in with the review credentials → a tracker with a 21-day streak.
4. Stop the run: **⌘ + .** (Command-period) or the ■ Stop button.

**Take the screenshots while you're here** — the Simulator produces exactly
the resolution App Store Connect wants:

5. Still running on **iPhone 16 Pro Max** (that's the required 6.9" size),
   navigate to each screen and press **⌘ + S** in the Simulator on each —
   PNG files land on your **Desktop**:
   1. Home / daily tracker (streak visible)
   2. Today's Study Plan (task list)
   3. The "Topics Studied Today" sheet, open
   4. Mock analysis (the two debriefs)
   5. Blueprint / study plan
   No login screen, no splash — Apple explicitly said those don't count as
   the app in use.

---

## Part 5 — Archive and upload (10 min + processing wait)

1. Device selector → scroll to the very top → choose
   **Any iOS Device (arm64)**.
   ⚠️ If a simulator is selected, **Product → Archive is greyed out** — this
   is the #1 "why can't I archive" issue.
2. Menu bar: **Product → Archive**. A progress bar runs in the toolbar;
   takes a few minutes.
3. When it finishes, the **Organizer** window opens by itself (if not:
   menu **Window → Organizer**), showing today's archive selected.
4. Click the blue **Distribute App** button (right side).
5. Choose **App Store Connect** → **Distribute** (newer Xcode) or
   **App Store Connect → Next → Upload → Next → accept defaults → Upload**
   (older flow). Leave every checkbox at its default; keep
   **Automatically manage signing** selected if asked.
6. Wait for **"Upload Successful" ✅**.
   - *Signing error?* **Signing & Capabilities** tab → tick "Automatically
     manage signing" → pick your **Team**. If no team is listed:
     **Xcode → Settings… (⌘ ,) → Accounts → +** → sign in with your Apple
     Developer Apple ID → retry the archive.
7. Apple now processes the build server-side — **5 to 30 minutes**. You'll
   get an email: "…has completed processing." Nothing to do until then.

---

## Part 6 — App Store Connect (15 min)

All in the browser: **appstoreconnect.apple.com → My Apps → CareerRai**.

1. Left sidebar → the **iOS App 1.0** version (status "Rejected"). You edit
   this same version — no new version needed.
2. **Build section**: if the old rejected build 1.0 (1) is attached, click
   the red **−** beside it to remove it. Then click **⊕ Add Build / Select a
   build** → pick **1.0 (2)** → Done. (If it isn't listed yet, processing
   hasn't finished — wait for the email.)
3. **Previews and Screenshots** → click **"View All Sizes in Media
   Manager"**:
   - **Delete every iPad screenshot** in every iPad tab (select → trash).
     With the iPhone-only build attached, iPad sets are no longer required —
     but stale promotional art left in those slots is exactly what got 1.0
     rejected under 2.3.3.
   - **iPhone 6.9″ tab**: delete the old images, drag in the 5 Simulator
     screenshots from your Desktop. The first 3 are what shows on the store
     — lead with the tracker.
   - If a 6.5″ tab is still marked required: rerun the Simulator as
     **iPhone 11 Pro Max**, retake the same 5 with ⌘S, upload those there.
     (Never upscale — Apple detects resized images.)
4. **App Review Information** (scroll down the version page):
   - Sign-in required: **ON**
   - User name: `appreview@careerrai.in`
   - Password: *(the review password shared in chat)*
   - Notes: paste the block from `docs/APP-STORE-SUBMISSION.md` Step 2
     (explains the +91 OTP limitation and where the password login is).
   - No demo video — Apple said they can't use one.
5. Confirm the URLs on **App Information**: Privacy Policy
   `https://careerrai.in/privacy`, Support `https://careerrai.in/contact`
   (there is **no** `/support` route). Support email
   `business@careerrai.com`.
6. Top-right: **Save**, then **Add for Review / Submit for Review** → the
   summary page → **Submit**.
7. **Reply in the rejection thread**: version page banner (or App Review /
   Resolution Center in the sidebar) → open the reviewer's message →
   **Reply** → paste the three-paragraph response from
   `docs/APP-STORE-SUBMISSION.md` Step 4, including the iPhone-only line.
8. Status will move: **Waiting for Review → In Review → (decision)**.
   Resubmissions after a rejection typically hear back in 24–48 h.

---

## Part 4a — If the app launches to a blank screen (the 29 Jul blocker)

Symptom: app opens, white/blank screen, a crossed-out WiFi icon, and Xcode's
Network monitor reads **0.0 KB / No Active Connections** — while Safari in the
*same* Simulator loads `careerrai.in` fine.

Zero bytes means the web view never made a request. Networking is not the
problem; something inside the app is refusing to start the load. Two causes,
both found by one search sweep. Press **⌘ + Shift + F** and search each term:

1. **`limitsNavigationsToAppBoundDomains`** — if this is `true`, WebKit only
   allows navigation to the domains listed in the Info.plist key
   `WKAppBoundDomains`, and blocks everything else. Two traps:
   - Those entries **must be lowercase**. `CareerRai.in` does not match
     `careerrai.in` — with capitals the allow-list is effectively empty, which
     is exactly the console error *"attempting to navigate away from an
     app-bound domain"*.
   - Deleting the `WKAppBoundDomains` key while this flag stays `true` makes it
     **worse**, not better: an empty list blocks every navigation.

   **Set the flag to `false`** (or delete the line). Do not try to fix the
   domain list instead — checkout (Razorpay) and Google sign-in navigate off
   `careerrai.in`, app-bound domains cap you at 10 domains, and any domain you
   forget becomes a blank screen in production.

2. **`NWPathMonitor` / `Reachability` / `offline`** — the wrapper template ships
   its own connectivity check and an offline placeholder view. If that check
   reports "no network", the app shows the offline screen and never asks the web
   view to load anything — which is precisely 0 bytes transferred. If a gate
   like this exists, bypass it and load unconditionally; the web view surfaces
   real network errors on its own.

Then, before re-running — **Info.plist and entitlement changes do not apply to
an already-installed build**:

3. Xcode: **Product → Clean Build Folder** (**⇧ ⌘ K**).
4. Simulator: long-press the CareerRai icon → **Remove App**. (Stubborn cases:
   Simulator menu → **Device → Erase All Content and Settings**.)
5. **⌘ R** again.

Keep `Settings.swift`'s start URL a plain, valid absolute URL while you test —
a string with a stray space or a broken quote makes `URL(string:)` return nil,
which also loads nothing and looks identical. Restore
`?source=ios` (Part 2) only once you have the app loading.

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Product → Archive greyed out | Device selector is on a simulator — pick **Any iOS Device (arm64)** |
| No team / signing error | Xcode → Settings (⌘,) → Accounts → + → sign in; then Signing & Capabilities → pick Team |
| Build never appears in Connect | Processing not finished — wait for the email; check spam |
| Connect asks encryption question | Answer "standard encryption / exempt", or add the Info.plist key from Part 3 |
| iPad tabs still demand screenshots | The old 1.0 (1) build is still attached — remove it, attach 1.0 (2) |
| Simulator shows the install banner | The start URL edit didn't save or lacks `?source=ios` — recheck Part 2 |
| Blank screen / crossed-out WiFi, 0.0 KB transferred | See Part 4a — app-bound domains, or the template's own offline gate |
| Info.plist edit seems to have no effect | Remove the app from the Simulator and ⇧⌘K — a reinstall is required |
