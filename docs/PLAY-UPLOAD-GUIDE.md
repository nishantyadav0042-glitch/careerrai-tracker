# Play Store Upload Guide — via a friend's developer account

*Written in simple steps. Follow the ORDER exactly — the order is what
prevents the rejection.*

---

## ⚠️ First, understand what "friend's account" means (2 minutes, important)

1. **The app will legally belong to his account.** Google ties an app to the
   account that publishes it. He will control releases, and see all console
   data. Later you CAN transfer the app to your own account (Google supports
   app transfer; you'll need your own $25 developer account) — plan to do
   this once revenue is real.
2. **Shared fate.** If our app ever violates a policy, HIS account gets the
   strike — and if his account is ever suspended for anything, our app goes
   down with it. Only do this with someone you trust and whose account is
   clean.
3. **What you SHARE with him:** only the `.aab` file + the listing content
   below. **What you NEVER share:** the keystore file, GitHub secrets,
   Vercel/Supabase passwords. He needs none of them — the app file is
   already signed.
4. **Get yourself added:** ask him to add your Google account in Play Console
   → Users and permissions, with Admin access to this app. Then you can see
   crashes, reviews and stats yourself.

---

## Step 1 — Get the app file (you)

The signed build is produced by GitHub Actions (already triggered):
GitHub → careerrai-tracker → Actions → "Build Android app (Play Store)" →
latest run → **Artifacts** → download `careerrai-android-…`.
Inside: `app-release-bundle.aab` ← this is the file for Play.
(The `.apk` is for direct phone testing only; Play wants the `.aab`.)

Send your friend: the `.aab` + this guide.

## Step 2 — Create the app (friend, 5 min)

Play Console → **Create app**
- App name: `CareerRai — CAT Prep, by students`
- Default language: English (India)
- App or game: App · Free
- Accept declarations.

## Step 3 — Upload to INTERNAL TESTING first (friend) — do NOT submit for review yet

Testing → **Internal testing** → Create release → upload the `.aab`.
When asked about **Play App Signing: accept it** (keep it ON).

**Why internal first:** Google re-signs the app with its own key. We must put
that key's fingerprint on our website BEFORE review, or the app opens with a
browser address bar and gets rejected as a "repackaged website."

## Step 4 — Send the fingerprint (friend → you → me) ← THE CRITICAL STEP

Play Console → Test and release → Setup → **App signing** →
under **App signing key certificate**, copy the **SHA-256 certificate
fingerprint** (long, colon-separated).

Friend sends it to you → you paste it to me → I add it to
`careerrai.in/.well-known/assetlinks.json` and deploy (10 minutes).
**Do not go past this step until I confirm it's live.**

## Step 5 — Verify (you, on your phone)

Install the internal-testing build via the tester link. Open it. The app
must open **full screen with NO address bar**. If you see an address bar,
stop and tell me — do not submit.

## Step 6 — Store listing (friend fills, copy below)

**Short description (max 80 chars):**
`CAT prep that tracks your real progress. By the students, for the students.`

**Full description:**
```
CareerRai is a CAT preparation companion built on one idea: students
helping students.

• A daily study plan built around where YOU actually are — not a generic
  timetable
• Log your study in seconds and keep your streak honest
• Evidence-based progress: what you have actually solved, not just what
  you've marked "done"
• Daily Pick: one tip and practice questions shared by fellow aspirants
  every day — you vote on what helps
• Upload your coaching timetable and CareerRai aligns your plan with it
• A 1:1 IIM buddy option to review your prep

No spam, no endless feeds. Open the app, see exactly what to do next,
do it, log it. By the students, for the students.
```

**Assets needed (you prepare):**
- App icon 512×512 PNG (use `public/icon-512.png` from the site)
- Feature graphic 1024×500 (I can generate one — ask me)
- At least 2 phone screenshots (today's Home + Daily Pick look good; crop
  out the status bar with personal notifications)

**Privacy policy URL:** `https://careerrai.in/privacy`

## Step 7 — App content forms (friend, with these exact answers)

**Privacy policy:** `https://careerrai.in/privacy`

**Ads:** No, the app does not contain ads.

**App access:** "All or some functionality is restricted" → provide a
demo login → give the reviewer the test account: phone `8233454449` +
note "OTP login — request access and we will supply a code", OR create a
password-login demo account for review (tell me and I'll set one up —
recommended).

**Content rating questionnaire:** Category: Education/Reference.
- Violence/sexual/drugs/gambling: **No** to all.
- **User-generated content: YES** → users can share text and images; content
  is moderated (automated safety filtering before publication + in-app
  reporting + human review). UGC is NOT the app's primary purpose.
- Users can communicate: No (no chat between users; only moderated shared
  study content).
Expected rating: Everyone / 3+.

**Target audience:** 18+ (CAT aspirants are graduates; choosing 18+ keeps us
out of the Families policy track). Do NOT tick "appeals to children."

**Data safety (answer honestly, exactly this):**
- Collects data? **Yes**
  - Personal info: **Name, Phone number** — required, for account creation —
    not shared with third parties.
  - Photos: **Yes** (optional) — user-shared practice-question photos —
    moderated, visible to other users after review.
  - App activity: **Yes** — study logs, in-app actions — for app
    functionality and analytics — not shared.
- Data encrypted in transit: **Yes** (HTTPS everywhere).
- Users can request deletion: **Yes** →
  account deletion URL: `https://careerrai.in/delete-account`
- Data NOT sold. No third-party advertising SDKs.

**Government apps / Financial features:** No. (Payments are for our own
digital service via Razorpay on the website, not in-app billing.)

## Step 8 — Submit for review (friend)

Only after Step 5 passed. Promote the internal release to **Production** →
choose staged rollout (20% is fine) → Submit. First review typically takes
2–7 days.

## If Google rejects

Send me the exact rejection email text. Most likely causes and my fixes are
pre-mapped (assetlinks mismatch, UGC moderation questions, app-access login
for reviewers). Do not resubmit blindly — one message to me first.

---

### Quick checklist

- [ ] You: download `.aab` from GitHub Actions
- [ ] You: send friend `.aab` + this guide
- [ ] Friend: create app → internal testing → upload
- [ ] Friend: copy App signing SHA-256 → send to you → to me
- [ ] Me: assetlinks live → confirm
- [ ] You: install tester build → NO address bar
- [ ] Me (optional): reviewer demo account + feature graphic
- [ ] Friend: listing + content forms (answers above)
- [ ] Friend: submit
- [ ] Friend: add you as Admin user on the app
