# CareerRai Android — build & upload handover

For the developer building and uploading the Play package. Everything
CareerRai-specific is verified against the live site and database (29 Jul 2026).

The long version is `docs/PLAY-STORE-UPLOAD-GUIDE.md`. This file is only what
**you** need to do.

---

## 1. What you're building

CareerRai on Android is a **Trusted Web Activity** — a thin native shell that
opens `https://careerrai.in` full-screen with no browser UI. **There is no
Android source to clone.** The package is generated from the live site.

Consequence worth knowing before you start: **content changes never need a new
build.** A web deploy reaches every Android user immediately. You only rebuild
for app name, icon, target SDK, notification delegation, or the start URL.

## 2. Build it

**Fastest:** https://www.pwabuilder.com → enter `https://careerrai.in` → Start →
**Android → Store package → All settings**.

**Or Bubblewrap**, if you prefer a CLI — `android/twa-manifest.json` in the repo
is already correct and committed, so `bubblewrap build` in that folder needs no
edits.

Settings (these ARE the committed manifest — please don't improvise):

| Field | Value |
|---|---|
| Package ID | `com.careerrai.app` |
| App name / Launcher name | `CareerRai` |
| Version name | `1.0.0` |
| Version code | `1` |
| Start URL | `/student/tracker?source=twa` |
| Host | `careerrai.in` |
| Display | `standalone` |
| Orientation | `portrait` |
| Theme colour | `#ff6b35` |
| Background colour | `#ffffff` |
| Nav colour | `#000000` |
| Min SDK | `23` |
| Fallback | `customtabs` |
| **Notification delegation** | **ON** |

Two of those are load-bearing:

- **`?source=twa` in the start URL.** The server reads it and switches on
  store-build behaviour — it hides the "install our app" banner and routes
  payments out to the browser. Drop the query string and both silently stop.
- **Notification delegation ON.** This app's core loop is daily push reminders.
  Off means no reminders inside the installed app.

## 3. Signing

Create a new keystore (PWABuilder will offer to), keep **Play App Signing ON**
(the Console default), and **back the keystore up off your machine along with
both passwords** before uploading anything.

## 4. ⚠️ The thing that will look broken if you skip it

After your first upload, Play re-signs the app with **Google's own** key. The
fingerprint currently in `public/.well-known/assetlinks.json` came from a local
build, so it **will not match the live app** — and the symptom is a **URL bar
across the top of the app**, which looks like a broken build but isn't.

So: after the first upload, go to **Test and release → Setup → App integrity →
App signing → App signing key certificate**, copy the **SHA-256**, and send it
over. It gets added to `assetlinks.json` (the file holds an array, so the
existing one can stay) and deployed. The bar disappears with no rebuild.

Please don't debug the URL bar before doing this — it is the cause ~90% of the
time.

## 5. Play Console — App content declarations

`docs/PLAY-STORE-UPLOAD-GUIDE.md` Part 4 has every answer already worked out
against what the app really collects. Three that get apps rejected:

- **Data safety (4.11)** — the app collects **voice recordings** (student↔mentor
  voice notes) and **photos** (student-submitted question images), on top of the
  obvious name/email/phone. Both are reviewer-visible; an incomplete declaration
  is a policy strike, not a warning. Data deletion URL:
  `https://careerrai.in/delete-account`.
- **Content rating (4.4)** — answer **YES** to "users can interact or exchange
  content". There is 1:1 chat, voice notes, and student-submitted content.
- **Target audience (4.5)** — **18+**. Do not tick any under-13 bracket; it pulls
  the app into Families policy and a much heavier review for no benefit.

Also: **Ads → No.** There is no ad SDK.

## 6. App access — reviewers need a login

Google's reviewer can't get past the login screen otherwise: the default login
is an OTP to Indian (+91) numbers only.

Under **App access**, choose "All or some functionality is restricted" and add:

- **Username:** `appreview@careerrai.in`
- **Password:** *sent separately — not written in this repo, which is public*
- **Instructions:**

  ```
  Tap "Log in with password" on the login screen, then sign in with the
  credentials above. The default login is a mobile OTP for Indian (+91) numbers
  only, so use the Password option on the Mobile OTP / Password toggle.

  The account opens on the daily tracker with 21 days of study history, a
  21-day streak, syllabus coverage and 2 mock analyses already in place.
  ```

## 7. Store listing

| Field | Value |
|---|---|
| App name | `CareerRai: CAT Prep Tracker` |
| Category | Education |
| Privacy policy | `https://careerrai.in/privacy` |
| Support URL | `https://careerrai.in/contact` (there is **no** `/support` route) |
| Support email | `business@careerrai.com` |
| App icon | `public/icon-512.png` |
| Feature graphic | `docs/store/feature-graphic-light-1024x500.png` (1024×500, ready) |

Screenshots: 2–8 phone shots. Lead with the app **in use** — the tracker with
the streak, today's plan, the mock analysis. `public/screenshots/` has three but
two are pre-login screens; the iOS submission was rejected partly for showing
screens that weren't the app in use.

Please don't mention PWAs, wrappers, websites, or "no app store needed" anywhere
in the listing.

## 8. Release path

Internal testing → (Closed testing, if the Console demands it for this account)
→ Production. Countries: **India** at minimum.

Send the internal-testing opt-in link over as soon as it exists — there's a
pre-flight checklist to run on a real device (Part 8 of the guide) before
production, and the URL-bar check in §4 is part of it.

## 9. Please don't change

`packageId`, `host`, and the signing key. All three are permanent after the
first upload, and `assetlinks.json` on the live domain is pinned to the package
name.

## 10. One known policy risk, so it isn't a surprise

CareerRai sells **live 1:1 human mentorship** — a real-world service, which is
the recognised exception to Play Billing, and the store build already hands
payment off to the external browser. If a reviewer decides it's a digital good
instead, the options are Play Billing or removing purchase flows from the
Android build. Nothing to configure; just the likeliest source of pushback.
