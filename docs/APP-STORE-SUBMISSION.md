# App Store resubmission — CareerRai iOS 1.0

Written 28 Jul 2026, after Apple rejected **1.0 (1)** on three guidelines.

- Submission ID: `ddfd8f62-381c-43a3-879d-55ad808461b1`
- Review date: 28 Jul 2026 · Review device: **iPad Air 11-inch (M3)**

Read this top to bottom before touching App Store Connect. **Step 0 is not
optional** — because the iOS app is a wrapper around `careerrai.in`, the code
fixes only reach the reviewer once production is deployed.

---

## What Apple actually said, and what fixed it

| Guideline | Apple's complaint | Cause | Fix | Owner |
| --- | --- | --- | --- | --- |
| **2.1** Information Needed | "We were unable to sign in as no password login was found." | Password login was a 12px grey link two steps deep, and its credential field stripped non-digits so an email/username couldn't be typed. No demo account was supplied. | Code fixed + review account created | done / **you** (step 2) |
| **2.3.10** Accurate Metadata | "The app or metadata includes information about third-party platforms…" → *"Revise the app's binary to remove non-iOS status bar images."* | `public/testimonials/vedprakash-wa.jpg` — a raw **Android** WhatsApp screenshot (Android status bar + WhatsApp UI) — plus a WhatsApp-styled chat replica component. | Both deleted | done |
| **2.3.3** Accurate Metadata | "The **13-inch iPad** screenshots do not show the actual app in use in the majority of the screenshots." | Promotional/marketing art in the 13" iPad slot; splash and login screens don't count as "app in use". | Replace screenshots, or go iPhone-only | **you** (step 3) |

### Code changes already made (branch `claude/student-buddy-opt-in-qcdr92`)

- **Deleted** `public/testimonials/vedprakash-wa.jpg` (the Android/WhatsApp screenshot).
- **Deleted** `src/app/student/onboarding/screens/screen-social-proof.tsx`, and
  unwired it from both onboarding flows (`src/app/start/page.tsx`,
  `src/app/student/onboarding/onboarding-modal.tsx`).
- **Deleted** the `WhatsAppLiveChat` component and `WA_CHATS` data — a replica of
  WhatsApp's interface (its header green, chat wallpaper, bubble colours, ✓✓
  receipts) rendered inside our app.
- **Kept** the plain quote cards in `src/components/testimonials.tsx`. Real
  student words in our own styling are compliant; screenshots of other apps are not.
- **Changed** one testimonial's visible context from "via Instagram, name
  withheld" to "name withheld" — don't name third-party platforms in shipped UI.
- **Login** (`src/app/login/page.tsx`): "Log in with password" is now a labelled
  button on the role picker; a `Mobile OTP | Password` toggle sits on the form;
  and the credential field accepts **mobile number, email or username**.

Verified: `npm run typecheck` clean, `npm run lint` 0 errors (35 pre-existing
warnings, none in touched files), `npm test` 104/104 passing, `npm run build`
compiles 182 pages.

---

## Release gate — verified state, 28 Jul 2026 15:5x UTC

Checked against the live systems, not inferred:

| Gate | State | Evidence |
| --- | --- | --- |
| Fixes on `main` | ❌ **NO** | `76acc14` exists only on `origin/claude/student-buddy-opt-in-qcdr92`. `origin/main` is at `b4a46c62`. |
| Fixes in production | ❌ **NO** | `careerrai.in` served `dpl_94pqnJJV8tFfSihs9dVSsXivuPDQ`; the branch build `dpl_ERX3sprsoYa2axw1MVwBBoYrY6V7` is a **preview** (`target: null`) and was `CANCELED`. |
| Offending image live | ❌ **STILL LIVE** | `GET careerrai.in/testimonials/vedprakash-wa.jpg` → **200, image/jpeg, 278,236 bytes** — byte-identical to the deleted file. |
| Review account exists | ✅ yes | `appreview@careerrai.in`, bcrypt verified (right password matches, wrong rejected), `email_confirmed`, 1 identity row. |
| Review account seeded | ✅ yes | 21 logged days, 2 mock debriefs, 21-day streak, `onboarding_completed = TRUE`. |
| Login fix renders | ✅ yes | Playwright at 390×844 and 820×1180: password button visible on the first screen, email accepted in the credential field. |
| typecheck / lint / tests / build | ✅ pass | 0 TS errors · 0 lint errors · 104/104 · 182 pages. |

**Conclusion: submitting before merging to `main` reproduces the exact 2.3.10
rejection**, because the Android/WhatsApp screenshot is still being served.

## Step 0 — Deploy production FIRST

The iOS app loads `careerrai.in` (same model as the Android TWA — see
`android/README.md`). The WhatsApp screenshot and the old login screen are
**served from the web**, so until production is deployed, a reviewer opening the
app still sees the rejected content no matter what you change in App Store
Connect.

1. **Merge `claude/student-buddy-opt-in-qcdr92` into `main`** and wait for the
   `main` deployment to reach `state: READY, target: production`. A preview
   deployment of the branch is **not** production — see the release gate above.
2. On a real device, open `https://careerrai.in/login` and confirm:
   - "Log in with password" is visible **without scrolling**.
   - The password screen's first field accepts `appreview@careerrai.in` — letters
     and `@` must actually type. If digits-only, the deploy didn't land.
3. Confirm `https://careerrai.in/testimonials/vedprakash-wa.jpg` returns **404**.
4. Walk the student onboarding once and confirm no WhatsApp-styled chat appears.

Do not proceed until all four pass.

---

## Step 1 — Decide: iPhone-only, or keep iPad?

**The evidence says your binary currently declares iPad support.** Two
independent signals: Apple reviewed on an *iPad Air 11-inch*, and the 2.3.3
complaint names *13-inch iPad screenshots* — App Store Connect only requires
that size when iPad is a supported device. So treat `UIDeviceFamily = 1,2` as
the working assumption and confirm it before you decide.

How to confirm, in order of speed:
1. App Store Connect → your app → the 1.0 version page → **Previews and
   Screenshots**: if iPad size tabs are present and required, iPad is declared.
2. The binary's `Info.plist` → `UIDeviceFamily` (`1` = iPhone only, `1,2` =
   iPhone + iPad).
3. If PWABuilder produced it, its iOS package targets both by default.

**Recommendation: go iPhone-only for 1.0.**

Apple reviewed on an iPad Air. The app is a mobile-first web UI in a wrapper, so
on iPad it renders as a stretched phone layout. Going iPhone-only:

- **removes the 13-inch iPad screenshot requirement entirely**, which retires
  guideline 2.3.3 without producing new iPad art;
- stops reviewers judging a phone layout on a tablet;
- reduces the **4.2 Minimum Functionality** risk (see Known risks below).

In App Store Connect: your app → **General → App Information**, and in the
target/build settings set the device family to iPhone only. If your build was
produced by PWABuilder or a similar wrapper, the supported-devices list comes
from the binary's `UIDeviceFamily` — so this may require a rebuild with iPad
deselected. Confirm which tool produced the binary before promising Apple
anything; **the iOS project is not in this repo**, so it could not be verified here.

If you keep iPad support, you must do step 3b instead of 3a.

---

## Step 2 — App Review Information (fixes 2.1)

App Store Connect → your app → the **1.0** version page → scroll to
**App Review Information**.

- **Sign-in required:** ON
- **User name:** `appreview@careerrai.in`
- **Password:** the password shared privately (see `DEMO_ACCESS.md` — it is
  deliberately not written into the repo, which is public)

The same account also carries the mobile number **9000000050**, which works in
the 10-digit field. That is deliberate insurance: it means the credential is
usable even on a build that predates the credential-field fix, and it lets you
sanity-check the account **before** merging. Give Apple the email — it is the
form the notes explain.

**Notes** field — paste this:

```
Sign in with the credentials above.

On the login screen, tap "Log in with password" (or the "Password" tab), then
enter the email address above and the password. The first field accepts a mobile
number, an email address, or a username.

Please note: our primary sign-in is a 6-digit OTP sent by SMS to an Indian (+91)
mobile number, which a reviewer outside India cannot receive. Password login is
provided for exactly this reason and is available directly on the login screen.

The account is pre-populated with 21 days of study history, 2 mock-test
debriefs and an active streak, so every screen shows the app in real use.
```

Do not attach a demo video — Apple's message explicitly says they cannot use one
to continue the review.

### Verify the credentials before you submit

Both of these, in order:

1. Run the SQL check in `DEMO_ACCESS.md` — `password_verifies` must be `true`.
   (Confirmed true on 28 Jul 2026, with a wrong password correctly rejected.)
2. **Sign in through the real UI**, on a device or private window where you are
   not already logged in. A credential verified only in SQL has not been tested.

---

## Step 3 — Screenshots (fixes 2.3.3)

Apple's rules, verbatim from the rejection:

- Marketing or promotional material that doesn't reflect the app's UI is **not**
  allowed.
- The **majority** must show main features and functionality.
- **Splash and login screens do not count** as showing the app in use.

Note their hint: *"some screenshots may only be viewed and updated by selecting
**View All Sizes in Media Manager**."* The 13" iPad slot was almost certainly
auto-filled with scaled promotional art you never explicitly reviewed — open
Media Manager and look at every size, not just the iPhone set.

### 3a — If iPhone-only (recommended)

Only the 6.9" / 6.5" iPhone sets are required. Capture **real screens** from the
`appreview` account, which is seeded precisely so these look real:

1. **Daily tracker** — the 21-day streak and logged days visible
2. **Today's plan / routine** — tasks with sections
3. **Log a day** — the 5-second log form
4. **Mock analysis** — the two debriefs with the percentile trend
5. **Blueprint / study plan** — the generated plan

Then in Media Manager, **delete the 13-inch iPad set** so no stale promotional
art remains attached to the version.

### 3b — If keeping iPad

Additionally capture the same five screens on a **13-inch iPad** (2064×2752 or
2048×2732 portrait), running the real app signed in as `appreview`. Do not
upscale iPhone screenshots — Apple detects it and it is a repeat 2.3.3.

Avoid in every screenshot: device frames with non-iOS status bars, added
marketing headlines that aren't in the UI, the login screen, the splash screen.

---

## Step 4 — Resubmit and reply (closes the review)

1. Confirm **Step 0** is deployed and verified.
2. Upload a new build and bump the build number (**1.0 (2)**). A metadata-only
   resubmission of 1.0 (1) is technically possible, but Apple's 2.3.10 next-step
   says "revise the app's binary" — a fresh build number signals the change and
   avoids an argument.
3. Attach the new build, save the new screenshots, save App Review Information.
4. **Submit for Review.**
5. In **Resolution Center**, reply on the existing thread:

```
Thank you for the detailed review. We have addressed all three items.

Guideline 2.1 — Sign-in: our primary sign-in is an SMS OTP to an Indian (+91)
number, which a reviewer outside India cannot receive, and our password option
was not prominent enough to find. Password login is now a clearly labelled
option directly on the login screen, and the credential field now accepts an
email address or username as well as a mobile number. Working demo credentials
are provided in App Review Information.

Guideline 2.3.10 — We have removed the image containing a non-iOS status bar
from the app, along with all third-party messaging-platform imagery. Student
testimonials are now presented in our own interface only.

Guideline 2.3.3 — We have replaced the screenshots with captures of the actual
app in use, showing the daily tracker, study plan, daily log and mock-test
analysis. [If iPhone-only: "We have also set the app to iPhone only, as it is
designed for phone use."]

Please let us know if anything else is needed.
```

Trim the bracketed line if you kept iPad support.

---

## Step 5 — App Store Connect metadata (the second-rejection killers)

These are present in the app and just need pasting into App Store Connect:

| Field | Value |
| --- | --- |
| Privacy Policy URL | `https://careerrai.in/privacy` |
| Terms of Use URL | `https://careerrai.in/terms` |
| Support URL | `https://careerrai.in/contact` |
| Marketing URL (optional) | `https://careerrai.in` |
| Support email | `business@careerrai.com` |

There is no `/support` route — use `/contact`. Also confirm: version and build
number both incremented, new archive uploaded and **attached to the version**,
new screenshots saved, App Review Information saved, and no stale screenshot
left behind in any size tab.

## Native-shell flag — set this on the wrapper's start URL

The install CTAs are now suppressed inside a store build, but only when the app
identifies itself. Set the iOS wrapper's **start URL** to:

```
https://careerrai.in/student/tracker?source=ios-app
```

(mirroring `startUrl: "/student/tracker?source=twa"` in
`android/twa-manifest.json`). The marker is persisted in `localStorage`, so it
survives navigation away from the start URL. Without it the app still works —
it will simply keep showing the "Install the app" banner, which is what you want
to avoid inside an App Store build.

If you cannot change the start URL for this submission, that is not a blocker
for the three cited guidelines — but say so and we'll gate on iOS detection
instead.

## Known risks on this resubmission

- **4.2 Minimum Functionality.** A webview wrapper around a website is the
  classic 4.2 rejection. You were *not* cited for it this time, and fixing 2.1 /
  2.3.3 / 2.3.10 does not retire it. Going iPhone-only helps. The durable answer
  is genuine native capability — push notifications, offline access, home-screen
  widgets — not more metadata polish.
- **Install CTAs inside the store build (now fixed, needs the flag).** The
  login screen was rendering an "Install the CareerRai app — Just ~3 MB" banner
  and `/get-app` said *"no app store needed"* **inside the iOS app**, because an
  iOS WKWebView is not `display-mode: standalone` and read as plain Safari.
  `detectNativeShell()` now suppresses every install surface in a store build.
  Requires the start-URL flag above to take effect.
- **Other third-party mentions.** `src/components/install/meta-escape.tsx`
  references Instagram/Facebook in-app browsers; student-facing "WhatsApp us"
  support links exist in `/app` and the escape sheet. Apple's cited next-step
  for 2.3.10 was only about status bar images, and support links are normally
  fine, so these were left alone. If 2.3.10 recurs, gate them on
  `isNativeShell` too.
- **Admin/sales screens** are full of WhatsApp tooling, but they need an admin
  login a reviewer does not have. Left as-is deliberately.

## If it gets rejected again

Post the **full Resolution Center text**, not just the guideline numbers. The
codes alone don't identify the cause — this round, 2.3.10 looked like it was
about store-link copy and was actually about one Android status bar in one JPEG.
