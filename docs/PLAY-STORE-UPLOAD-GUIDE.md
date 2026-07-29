# Google Play — complete upload guide, step zero to live

Written 29 Jul 2026 for CareerRai `1.0`. This is the **whole** path: build the
package, every declaration form with our actual answers, the review credentials,
the store assets, the tracks, and what to do after it goes live.

`android/README.md` is the older build-only note. Where the two disagree, **this
file wins** — it was written against the live database and the live site.

> **One honest caveat up front.** Play Console's forms and the mandatory
> target-API level change every few months, and some of those changes are newer
> than my knowledge. Every CareerRai-specific answer below (our package name, our
> fingerprint, our data collection, our credentials) is verified against the real
> project. Where Google's own requirement could have moved, I say so and tell you
> where to read the current value instead of guessing a number.

---

## Part 0 — The five facts you'll be asked for repeatedly

Keep this open in a tab. Every one of these is verified live.

| Thing | Value |
|---|---|
| Package name (**never changeable**) | `com.careerrai.app` |
| App name / launcher name | `CareerRai` |
| Website | `https://careerrai.in` |
| Start URL the app opens | `https://careerrai.in/student/tracker?source=twa` |
| Privacy policy | `https://careerrai.in/privacy` |
| Terms | `https://careerrai.in/terms` |
| Support / contact | `https://careerrai.in/contact` (there is **no** `/support` route) |
| Support email | `business@careerrai.com` |
| Account deletion page | `https://careerrai.in/delete-account` |
| App signing SHA-256 (already live in assetlinks) | `30:7D:08:E8:F0:F8:CE:C3:C9:22:7D:B6:F4:E7:A9:3F:5C:90:43:AD:BD:33:53:98:22:9E:26:98:28:00:49:2B` |
| Category | Education |
| Content rating target | Everyone / 13+ (see Part 4) |

---

## Part 1 — The gate that decides your timeline (do this FIRST)

Open **play.google.com/console → your account → Account details** and find
**Account type: Personal** or **Organisation**.

- **Organisation account** → you can go straight to production. Review is
  typically a few days.
- **Personal account created after Nov 2023** → Google requires a **closed test
  with a minimum number of opted-in testers running for a continuous period**
  (it has been 12 testers for 14 days, and was 20 before that) *before* the
  Production button unlocks. **Read the exact current numbers off your own
  Console** — the "Production" page states your specific requirement and counts
  your progress.

This is the single biggest schedule surprise on Play. If it applies to you, the
app cannot be live today no matter how fast the rest goes, and you need to line
up real people with real Google accounts now. Everything else in this guide still
applies — you just submit to **Closed testing** instead of Production, and the
clock starts.

---

## Part 2 — What you are actually uploading

CareerRai on Android is a **Trusted Web Activity**: a thin native package that
opens `careerrai.in` full-screen with no browser UI. The `.aab` contains no
product code.

Consequences worth internalising, because they change how you work forever:

- **Content changes need no app update.** A `git push` to `main` reaches every
  Android user the moment Vercel deploys. No AAB, no review, no version bump.
- **You only rebuild the AAB** when the native shell changes: app name, icon,
  target SDK, notification delegation, or the start URL.
- **`packageId`, `host`, and the signing key can never change** after the first
  upload. Losing the keystore means you can never update the app.

---

## Part 3 — Build the `.aab`

Pick one path. **Path A needs no tools.**

### Path A — PWABuilder (~20 min, recommended)

1. Go to **https://www.pwabuilder.com** → enter `https://careerrai.in` → **Start**.
2. Open **Android → Store package**, and set:
   - Package ID: `com.careerrai.app`
   - App name: `CareerRai`
   - Launcher name: `CareerRai`
   - Start URL: `/student/tracker?source=twa`
   - **Notification delegation: ON** — this app depends on web push. Off means
     no reminders inside the installed app, which is most of the product.
   - **Signing key: "Use mine"** if you already have `android.keystore` from the
     first build; **"Create new"** only if this is genuinely the first ever
     package.
3. Download the zip → it contains the **`.aab`** (this is what you upload) plus
   the signing key info.

> ⚠️ **The keystore is irreplaceable.** Back up the `.keystore` file *and* both
> passwords to somewhere that isn't your laptop, before you upload anything.

### Path B — Bubblewrap CLI (for a developer)

Prereqs: Node 18+, JDK 17, Android SDK.

```bash
npm i -g @bubblewrap/cli
cd android
bubblewrap build          # uses the committed twa-manifest.json in this folder
bubblewrap fingerprint list   # prints the SHA-256 for assetlinks
```

Output: `app-release-bundle.aab` (upload this) and `app-release-signed.apk`
(sideload for local testing).

`android/twa-manifest.json` is already correct and committed — `startUrl`,
`enableNotifications: true`, icons, theme colours, `minSdkVersion: 23`.

### If Play rejects the AAB for target SDK

Google raises the mandatory target API level annually (enforced around August).
Both Bubblewrap and PWABuilder set a current target SDK automatically, so a fresh
build normally passes. If Console rejects it, the error message names the exact
API level required — re-run the build with an updated CLI (`npm i -g
@bubblewrap/cli@latest`) rather than hand-editing Gradle files. Do not trust a
hardcoded number from any guide, including this one.

---

## Part 4 — The declarations gauntlet

Play Console → your app → **Policy → App content**. Every item must be green
before Production unlocks. Here are our real answers.

### 4.1 Privacy policy
`https://careerrai.in/privacy`

### 4.2 App access ← **the test credentials**

Select **"All or some functionality is restricted"**, then add one instruction
set:

- **Name:** `Student login (full app)`
- **Username:** `appreview@careerrai.in`
- **Password:** *not written in this repo — see the box below*
- **Any other instructions:**

  ```
  Tap "Log in with password" on the login screen, then sign in with the email
  and password above.

  The default login is a mobile OTP sent to Indian (+91) numbers only, so the
  password option is provided for reviewers. It is on the same screen — choose
  "Password" on the Mobile OTP / Password toggle.

  The account opens on the daily tracker with 21 days of study history, a
  21-day streak and 2 mock analyses already in place.
  ```

> 🔐 **Why the password is not in this file.** This repository is **public**.
> `DEMO_ACCESS.md` states the rule: no password is written into the repo, and
> none ever should be. The review password was shared with you in chat and lives
> only in Play Console / App Store Connect. If you've lost it, rotate it — the
> SQL to set and verify a new one is in `DEMO_ACCESS.md`.

Verified 29 Jul 2026 against the live database: the account exists, email is
confirmed, the password hash matches (and a deliberately wrong password is
rejected), `is_demo` and `is_test_account` are both true so it never pollutes
your student metrics.

### 4.3 Ads
**No, my app does not contain ads.** True — there is no ad SDK anywhere.

### 4.4 Content rating (IARC questionnaire)

- Category: **Reference, News, or Educational**
- Violence, sexuality, profanity, controlled substances, gambling: **No** to all
- **Does the app allow users to interact or exchange content?** → **Yes.** This
  is the one people get wrong. We have: 1:1 student↔mentor chat, **voice notes**,
  and Daily Pick, where students submit tips and photos of questions that other
  students see.
- **Does it share the user's location with other users?** → No
- **Can users purchase digital goods?** → See 4.9 — we sell live 1:1 mentorship,
  a real-world service.

Answer the interaction question honestly. A "no" that contradicts a chat feature
a reviewer can see is a rating-misrepresentation strike, and it is easy to spot.

### 4.5 Target audience and content

- Target age groups: **18+** (CAT aspirants are graduates or final-year students).
  Selecting any under-13 bracket pulls the app into Families policy, which brings
  a much heavier review — and we don't need it.
- **Do you want the app in the Designed for Families programme?** No
- Appeals to children: **No**

### 4.6 News app
**No.**

### 4.7 Government app
**No.**

### 4.8 Health apps
**No.**

### 4.9 Financial features

We take payments for buddy mentorship through **Razorpay**.

- Financial features: for a straight mentorship subscription, **none of the
  listed categories apply** (no loans, no crypto, no investments, no insurance).
  Read the list and tick nothing that isn't true.
- The relevant policy is **Play Billing**, handled in Part 4.10, not here.

### 4.10 Play Billing — read this properly

Play requires Google Play Billing for **in-app digital goods**. CareerRai sells
**live 1:1 human mentorship with a real IIM mentor** — a real-world service,
which is the recognised exception, and inside the store build the payment is
handed off to the external browser rather than taken in-app
(`src/lib/store-build.ts`).

Be aware of the actual exposure: this is a **judgement call by a reviewer**, not
a setting you can tick. If Play decides the mentorship is a digital good, the
options are Play Billing (a 15–30% cut) or removing purchase flows from the
Android build. Nothing in this guide changes that risk — I'm flagging it because
it is the most likely reason a CareerRai Android submission gets pushed back, and
it should not be a surprise.

### 4.11 Data safety ← the longest form, and the one with teeth

Declare it to match reality. The DB and code say we collect:

| Data type | Collected | Shared | Required | Purpose |
|---|---|---|---|---|
| Name | Yes | No | Required | App functionality, personalisation |
| Email address | Yes | No | Optional | Account management |
| Phone number | Yes | No | Required | Account management (OTP login) |
| Photos | Yes | No | Optional | App functionality (Daily Pick question photos) |
| **Voice or sound recordings** | Yes | No | Optional | App functionality (student↔mentor voice notes) |
| App interactions | Yes | No | Required | Analytics, app functionality |
| Other user-generated content | Yes | No | Optional | App functionality (study logs, tips) |
| Purchase history | Yes | No | Optional | App functionality (mentorship subscription) |

Do **not** forget the voice notes and the photos. Both are real, both are
reviewer-visible, and an incomplete data-safety declaration is a policy strike.

Then:

- **Is all data encrypted in transit?** → **Yes** (HTTPS everywhere).
- **Do you provide a way for users to request data deletion?** → **Yes**
- **Data deletion URL** → `https://careerrai.in/delete-account`
- We do **not** collect precise or approximate location, contacts, calendar,
  SMS, health, or financial account details.
- Payment card details are handled by Razorpay and **never touch our servers** —
  so do not declare payment info as collected by us.

Play requires both an in-app deletion path and a public URL. Both exist:
in-app under **Profile → Settings → Delete account**
(`src/components/delete-account-button.tsx`), and the public page above.

---

## Part 5 — Store listing

Play Console → **Grow → Store presence → Main store listing**.

| Field | What to use |
|---|---|
| App name (30 chars) | `CareerRai: CAT Prep Tracker` |
| Short description (80 chars) | `Daily CAT study plan that adapts to you, with a real IIM mentor.` |
| Full description (4000 chars) | Lead with the daily plan, the plan rebuild, syllabus coverage, mock analysis by a real mentor, Daily Pick. |
| App icon | 512×512 PNG — `public/icon-512.png` |
| Feature graphic | 1024×500 — **already made**: `docs/store/feature-graphic-light-1024x500.png` |
| Phone screenshots | 2–8 required, min 320px, 16:9 or 9:16 |

**Screenshots.** `public/screenshots/` has three (welcome, onboarding,
diagnostic) wired into `manifest.json`. Two of those three are pre-login screens.
Lead with the app **in use** instead — the tracker with the streak, today's plan,
the "Update topics studied today" sheet, mock analysis. Apple rejected iOS 1.0
partly for showing screens that weren't the app in use; the same instinct applies
here even though Play is more lenient.

Do not write "no app store needed", "install from browser", or anything about
PWAs or wrappers anywhere in the listing.

---

## Part 6 — Upload and release

1. **Test and release → Testing → Internal testing → Create new release.**
2. Upload the `.aab`. Keep **Play App Signing ON** (the default).
3. Release name: `1.0.0 (1)`. Release notes: what a first release does.
4. Add yourself and a couple of colleagues as internal testers, **Save →
   Review release → Start rollout**.
5. Internal testing is available in minutes. **Install from the opt-in link and
   actually use it** — Part 8 is the checklist.
6. Then promote: Internal → **Closed** (mandatory if Part 1 applies to you) →
   **Production**.

For the Production release, Countries: **India** at minimum. Rollout: 100% is
fine for a first release with this little traffic; staged rollout mainly helps
when you have users to protect.

---

## Part 7 — Digital Asset Links (already done — just verify)

This is what removes the URL bar and proves the app owns the domain. **It is
already live and correct**, unlike what `android/README.md` implies:

`public/.well-known/assetlinks.json` contains `com.careerrai.app` and the
SHA-256 fingerprint listed in Part 0.

Verify, don't redo:

1. Open `https://careerrai.in/.well-known/assetlinks.json` — must return JSON.
2. Install from the internal-testing link and confirm **no address bar** appears
   at the top of the app.

If a URL bar *does* appear, the fingerprint in that file doesn't match the key
Play actually signed with. Get the real one from **Test and release → Setup →
App integrity → App signing → SHA-256 certificate fingerprint**, add it to the
array (the array takes multiple), and deploy. Both the old and new can coexist.

---

## Part 8 — Pre-flight checklist (do this on a real device before promoting)

Install from the internal-testing link and confirm:

- [ ] App opens **full screen with no address bar** (asset links working)
- [ ] It lands on the tracker, not the marketing page
- [ ] **No orange "Install the CareerRai app" banner** — proof `?source=twa` is
      reaching the site and the store-build flag is set
- [ ] "Log in with password" is visible, and the first field accepts letters
      and `@`
- [ ] `appreview@careerrai.in` signs in and shows the 21-day streak
- [ ] Push: turn on notifications, then fire a test from the admin dashboard and
      confirm it arrives **in the installed app**
- [ ] Profile → Settings → **Delete account** exists and is reachable
- [ ] Back button behaves (doesn't exit the app from a sub-page)

### What the reviewer will actually see (seeded and verified 29 Jul)

Two gaps were found and closed the same day. Current state of
`appreview@careerrai.in`, straight from the database:

| | |
|---|---|
| Logged study days | 21 |
| Streak | 21 |
| Syllabus coverage | 55 topics, **34 touched** — 6 revising, 15 practicing, 13 learning |
| Mock analyses | 2 |
| Mentor | assigned (`Aarav Mehta (Test Mentor)`) |
| Mentor chat | 6 messages, a real coaching exchange about DILR set selection |
| Premium | on — so the mentor hub opens instead of the paywall |

Two deliberate choices in that seed, both worth knowing:

- **The mentor is the test-mentor account, not a real one.** Assigning a real
  IIM mentor would drop a fake student into their live queue and their
  notifications. If you'd rather the chat header didn't read "(Test Mentor)",
  that's a one-word rename — but the account stays `is_test_account = true`
  either way, because the data should say what it is.
- **Premium is on.** Without it the mentor hub renders `LockedBuddyHub` — the
  paywall — and the reviewer never sees the headline feature. It also keeps an
  Apple reviewer away from a payment screen entirely, which is the safer side of
  guideline 3.1.1. It does **not** touch your paid numbers: the admin dashboard
  filters `is_test_account` out of its upgraded count, and real paid students
  still reads the same as before the change (verified).

---

## Part 9 — After it's live (one web change)

So Chrome stops offering the flaky browser-generated WebAPK and points Android
users at the real listing:

1. In `public/manifest.json`:
   ```json
   "prefer_related_applications": true,
   "related_applications": [
     { "platform": "play", "id": "com.careerrai.app",
       "url": "https://play.google.com/store/apps/details?id=com.careerrai.app" }
   ]
   ```
2. Point the Android branch of `src/components/install/install-button.tsx` at the
   Play listing instead of the browser install prompt.

Both are web changes — deploy and done, no new AAB.

---

## Part 10 — What needs a new AAB, and what doesn't

| Change | New AAB + review? |
|---|---|
| Any product feature, copy, screen, bug fix | **No** — web deploy only |
| Adding the WhatsApp group link to onboarding | **No** — web deploy only |
| New Daily Pick questions or tips | **No** — database only |
| App name, icon, splash, theme colour | **Yes** |
| Start URL, notification delegation | **Yes** |
| Google's annual target-SDK bump | **Yes** |
| Store listing text or screenshots | No AAB, but listing changes are reviewed |

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Address bar visible in the app | Fingerprint mismatch — Part 7 |
| Orange install banner inside the app | Start URL lost `?source=twa` — rebuild with it |
| "App not available in your country" | Production countries not set — add India |
| Production button greyed out | Closed-testing requirement — Part 1 |
| Rejected for target API level | Update the CLI and rebuild — Part 3 |
| Data safety rejected | Almost always the missed voice notes or photos — 4.11 |
| Push works in Chrome, not in the app | Notification delegation was off at build time — rebuild |
| Play Protect warns on a sideloaded APK | Expected for a local APK; the Play-signed build is fine |
| Lost the keystore | You cannot update the app. New package name, new listing, users must reinstall. Back it up now. |
