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

## Step 0 — Deploy production FIRST

The iOS app loads `careerrai.in` (same model as the Android TWA — see
`android/README.md`). The WhatsApp screenshot and the old login screen are
**served from the web**, so until production is deployed, a reviewer opening the
app still sees the rejected content no matter what you change in App Store
Connect.

1. Merge and deploy the branch above to production.
2. On a real device, open `https://careerrai.in/login` and confirm:
   - "Log in with password" is visible **without scrolling**.
   - The password screen's first field accepts `appreview@careerrai.in` — letters
     and `@` must actually type. If digits-only, the deploy didn't land.
3. Confirm `https://careerrai.in/testimonials/vedprakash-wa.jpg` returns **404**.
4. Walk the student onboarding once and confirm no WhatsApp-styled chat appears.

Do not proceed until all four pass.

---

## Step 1 — Decide: iPhone-only, or keep iPad?

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

## Known risks on this resubmission

- **4.2 Minimum Functionality.** A webview wrapper around a website is the
  classic 4.2 rejection. You were *not* cited for it this time, and fixing 2.1 /
  2.3.3 / 2.3.10 does not retire it. Going iPhone-only helps. The durable answer
  is genuine native capability — push notifications, offline access, home-screen
  widgets — not more metadata polish.
- **Other third-party mentions.** `/get-app` says *"no app store needed"* and
  promotes a PWA install; `src/components/install/meta-escape.tsx` references
  Instagram/Facebook in-app browsers. Apple's cited next-step for 2.3.10 was
  only about status bar images, so these were left alone. If 2.3.10 recurs,
  hide these surfaces when the app runs inside the iOS wrapper. Student-facing
  "WhatsApp us" support links are normally fine and were also left alone.
- **Admin/sales screens** are full of WhatsApp tooling, but they need an admin
  login a reviewer does not have. Left as-is deliberately.

## If it gets rejected again

Post the **full Resolution Center text**, not just the guideline numbers. The
codes alone don't identify the cause — this round, 2.3.10 looked like it was
about store-link copy and was actually about one Android status bar in one JPEG.
