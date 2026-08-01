# STORE FREEZE — active until Play AND Apple both approve

**Founder instruction, 30 Jul 2026:** *"no changes need to be done until we get
our app passed from playstore and apple store."*

Binding. It overrides every roadmap priority in this repo. Read before merging
anything to `main`.

Facts below are VERIFIED against production, Vercel and the database on
30 Jul 2026. Nothing here is inferred.

---

## Where the two submissions stand · VERIFIED

| Store | State |
|---|---|
| **Apple** | ✅ **APPROVED FOR DISTRIBUTION, 30 Jul 2026.** Build 1.0 (3), iPhone-only. Prior rejection (2.1 unreachable login · 2.3.10 foreign status bar · 2.3.3 stale screenshots) remediated. Pending founder checks: Free Apps agreement active, and version released vs. Pending Developer Release. |
| **Play** | `CareerRai.aab` built 29 Jul, new keystore, both fingerprints live in `assetlinks.json`. Awaiting Sumukh's upload; App-signing SHA-256 owed back. |

Production is running **`86e5b7f`** (Vercel `dpl_5pi2orenCAmjJZtqyqyMS2RRwkrW`,
target production, READY).

## The mechanism — why a merge is a deploy · VERIFIED

The Vercel Git integration **is live and working**. Every one of the last eight
production deployments corresponds to a `main` commit, most recently `86e5b7f`.

> **Merge to `main` → production deploys within minutes → the app the reviewer
> is holding changes under them.**

Both store apps are wrappers around careerrai.in. Neither binary contains our
UI; they load production live. `docs/KNOWLEDGE.md` states it plainly: *"Web
deploys reach app users instantly, no store review."* That property is normally
our advantage. During review it is the hazard.

**Branch pushes are safe.** They produce preview deployments (`target: null`),
never production. Verified: commit `28307a9` on a `claude/*` branch created a
preview that Vercel cancelled. Work freely on branches.

## The specific failure a mid-review deploy causes · VERIFIED

Not hypothetical. `public/sw.js` is **v7**, and it calls `skipWaiting()`
(line 157) and `clients.claim()` (line 162) — a newly deployed service worker
takes control on the reviewer's **very next load**, with no waiting period.

**v6 of that same file made the iOS wrapper show a blank screen** — the worker
answered navigations and handed the browser a synthetic network error, which
looked like the device was offline while Safari on the same machine loaded the
site fine. That is commit `132f3db`, and it is the class of bug that already
cost us a rejection.

So a deploy during review can hand an Apple reviewer a blank screen, from a file
we cannot test on their device. That is the whole argument for the freeze.

## The rule

**Nothing merges to `main` while either store review is open.**

**Apple approved on 30 Jul, and the freeze does not lift.** The reason changed
rather than expired, and the new reason is heavier than the old one:

- **Play review is still open.** The original argument stands in full for it.
- **iOS users are now real users, not a reviewer.** Before approval, a bad
  deploy cost us a rejection. Now it breaks live students on a platform where
  this exact wrapper has a documented history of blank screens (`132f3db`).
  Apple never sees a web deploy, so nothing catches it but us.

That second point outlives both reviews. When the freeze finally lifts,
`public/sw.js` does not go back to being an ordinary file.

### Allowed
- Branch work: code, tests, docs, migrations authored but **not applied**
- Research, audits, read-only database analysis
- Store assets and listing metadata (App Store Connect / Play Console only)

### Frozen
- Any merge to `main`; any manual run of `vercel-deploy.yml`
- Every student-facing surface, especially login/signup — an unreachable login
  is what caused the first rejection (Incident #10)
- `public/sw.js` — see above; the highest-risk single file in the repo right now
- Payment and pricing surfaces
- Applied database migrations — production and the reviewer share one database
- The review account (below)

### Two exceptions, and only two

**1. P0 incidents.** Students blocked right now: login broken, payments broken,
data loss, security. Fix and ship. A freeze with no emergency valve is a
liability. Tell the founder when it happens, because it re-opens review risk on
both listings.

> **Use it, or the freeze eats the fix.** This exception already failed once by
> being available and unused: the iOS payment fix (`cc3c1eb`, 31 Jul) was
> committed, tested and pushed to a branch, and simply never merged. Production
> ran the broken code for another day while the incident was considered closed,
> and every iOS student who tried to pay got a white screen. **Incident #15.**
>
> A fix on a branch is not a fix. Before closing any commit that claims to fix
> production, prove it is live:
>
>     git merge-base --is-ancestor <sha> origin/main && echo LIVE || echo NOT SHIPPED
>
> A green Vercel build is not proof. Branch pushes build too — they just carry
> `target: null` and go nowhere.

**2. Deploys the store approval itself requires.** The freeze exists to protect
the review, so it must not block the review. Allowed: `assetlinks.json`
fingerprints, review-account access fixes, anything App Review explicitly asks
for. Not allowed: product work riding along in the same deploy. One file, one
reason, reviewed.

### Waiting to ship — keep this list current

A freeze is a queue, and a queue nobody reads is where a P0 goes to die. Every
fix held back by this document belongs here with its severity, so nothing
critical waits unnoticed. Empty is a valid and good state; **missing** is not.

| Branch | What | Severity | Since |
|---|---|---|---|
| — | nothing held back | — | — |

*(`claude/status-update-t1g5as` was merged 1 Aug as the P0 in Incident #15 —
the queue is empty because it was drained, not because it was never used.)*

> ## ⛔ THE ONE THING THAT STILL FAILS PLAY
>
> **`assetlinks.json` is missing the Play App-signing fingerprint.** Verified
> live 1 Aug: `https://careerrai.in/.well-known/assetlinks.json` serves 200 with
> exactly **two** fingerprints (upload keys `30:7D:08…` and `C4:A7:C5…`).
>
> Play App Signing **re-signs the app with Google's own key**, so the installed
> build presents a certificate that is in neither entry. Digital Asset Links
> verification then fails, and a TWA that fails verification **renders a URL bar
> across the top** — which reads as a broken, un-finished app to a reviewer.
>
> Nothing in this repo can fix it. The value only exists after the first upload:
> **Play Console → Setup → App integrity → App signing key certificate →
> SHA-256**. Add it as a third entry, redeploy, and confirm the app opens with
> no URL bar before submitting for review.
>
> Everything else on the Play path was verified clean on 1 Aug (launch lands on
> /login with the password option, store flag stamped, sw.js v7 never answers a
> navigation, no install banner, no pre-auth purchase surface, UGC report+block
> enforced server-side). This is the remaining blocker.

**Open now:** `assetlinks.json` carries 2 fingerprints. Play re-signs with
Google's key, so the App-signing SHA-256 from Play Console → App integrity is a
required third. Without it the Android app renders a URL bar, which reads as a
broken build. This is exception 2, pending the fingerprint from Sumukh.

## The review account — do not touch · VERIFIED

| | |
|---|---|
| Login | `appreview@careerrai.in` (password lives in App Store Connect / Play Console, **never** in this repo) |
| Phone | `+919000000050` · premium **on** · `is_test_account` true |
| Seeded | 21-day streak, syllabus coverage, assigned mentor, 6-message chat, 2 debriefs |
| Last seen | **30 Jul 2026 05:35 UTC** — someone signed in today |

**Credential check, 1 Aug — the password in the Consoles is still the live one.**
Verified from `auth.users`, not assumed:
- `recovery_sent_at` is **null** — no password reset was ever initiated.
- `updated_at` is **26 milliseconds** after `last_sign_in_at`, i.e. that bump is
  the sign-in itself, not an edit. Nothing has changed the password since it
  last worked.
- It last signed in successfully at **30 Jul 22:23 IST**, inside Apple's review
  window. Whatever string is in the Consoles worked then and is unchanged.
- `login_attempts` for it: **0 ever**. Never locked, never brute-forced.
- `banned_until` null, `email_confirmed` true.

The handover docs (`PLAY-STORE-UPLOAD-GUIDE.md` §4.2,
`ANDROID-BUILD-HANDOVER.md`) both name `appreview@careerrai.in`, matching this
account — not the superseded one. Their reviewer instructions also match the
real UI: **"Log in with password"** is the literal button label on /login, and
the "Mobile OTP / Password" toggle exists as described.

Not verifiable from here, and the only remaining gap: whether the password
string typed into Play Console matches the one that works. Confirm by signing in
at `careerrai.in/login` with exactly what is in the Console — copy-paste it, do
not retype.

> **If a reviewer ever reports being locked out:** `/api/auth/login` throttles at
> 5 failures per credential / 30 per IP over 15 minutes and redirects to
> `/login?error=locked`. It clears itself; deleting the account's rows from
> `login_attempts` clears it immediately.

Do not delete it, rename it, or turn premium off. Premium must stay on for two
reasons: without it the mentor hub renders a paywall and the reviewer never
reaches the feature, and it keeps an Apple reviewer away from a payment screen —
the safer side of Guideline 3.1.1.

**Checked, and safe:** `/api/cron/expire-subscriptions` filters
`.eq('subscription_status', 'active')`; this account is `free_beta`, so the cron
**cannot** flip its premium off. Do not change that filter during the freeze.

**Use `appreview@careerrai.in`.** It is the seeded one (streak, coverage,
assigned mentor, chat, debriefs) and the only one that shows the product as
intended.

`reviewer@careerrai.in` / `+919000000001` is the superseded 26 Jul account. It
was a live rejection risk hiding in plain sight: its `full_name` was literally
**"Play Reviewer"**, so anyone filling in Play Console's demo credentials would
reach for it by name — and it had `is_premium` **false**, which lands a reviewer
on the paywall instead of the mentor feature they were sent to test. A warning
in this file could not stop that, because the trap was in the data.

Defused 1 Aug, both halves:
- `is_premium` set **true**, mirroring appreview (`subscription_status` stays
  `free_beta`, so `/api/cron/expire-subscriptions` — which filters on
  `active` — still cannot touch it). Wrong credentials now still get in.
- renamed to **"SUPERSEDED - use appreview@careerrai.in"**, so it cannot be
  picked by name again.

It is still the second-best account (no seeded mentor or history). Put
`appreview@careerrai.in` in both Consoles.

## What this document cannot do

It cannot block a merge. Any session that does not read it can still deploy
production in one action, and several `claude/*` branches merge to `main`
regularly.

**The switch that actually enforces the freeze** is in the Vercel dashboard:
Project → Settings → Git → disable production deployments for `main` (or set
Ignored Build Step to `exit 0`). One click, reversible, and it needs no deploy
of its own. Recommended for the duration.

## Apple reviewed on 29 Jul at 22:04 IST, and got in · VERIFIED

Found in `student_events`, not assumed. Session
`51ad85a4-74f4-4b6e-995c-f35a9c500aa5`, IP `139.178.131.4` — which appears
**exactly once in the whole database**: one user, one session, 119 events,
22:04:07–22:08:20 IST on 29 Jul, never before or since. Every team IP recurs
across many users and days. iOS, `display_mode: standalone`, viewport 402×820.
(Attribution to App Review is inference from that chain; the uniqueness is fact.)

**Two results worth keeping:**

1. **The login works.** `/login` 22:04:07 → two taps → `/student/tracker`
   22:04:52. The 2.1 rejection cause — *"unable to sign in as no password login
   was found"* — is proven fixed by the reviewer's own session, not by our
   testing.
2. **The iOS wrapper launched clean.** `standalone` means inside the app. No
   blank screen. **The `sw.js` v7 fix held on a real reviewer device** — which is
   precisely why that file must not move while a review is open.

They swept tracker → blueprint → buddy → buddy/history → profile → community →
plan/topics → analysis, opened the log twice, and opened the Daily Pick composer
tapping both "A tip" and "A question" (UGC — Guideline 1.2). They never opened
the mentor chat. At 22:08:10 they hit `log_blocked` — tried to save without
marking a topic and were refused by our validation guard. Working as designed,
but a reviewer meeting a refusal is a real if small risk; noted, not changed.

## Known IPs — so nobody raises a false alarm

| IP | Who |
|---|---|
| `157.119.177.23` | team — 974 events, 6 users, 26 sessions |
| `122.169.48.134` | founder, mobile — confirmed 30 Jul |
| `49.36.219.103` | Sumukh — the 29 Jul 23:54 IST session is `display_mode: twa`, which only appears when launched from the Android package. **His Play build installs and runs.** |
| `139.178.131.4` | Apple App Review, 29 Jul only |

## Lifting the freeze

Both stores approved. Record the dates here, re-enable the Vercel switch, then
merge the backlog in small reviewed steps — not all at once.

| Store | Status | Date approved |
|---|---|---|
| Apple App Store | Build 1.0 (3) in review since 29 Jul | — |
| Google Play | Awaiting upload | — |
