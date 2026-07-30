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
| **Apple** | Build 1.0 (3), **iPhone-only**, resubmitted 29 Jul. Prior rejection (2.1 unreachable login · 2.3.10 foreign status bar · 2.3.3 stale screenshots) remediated. Resolution Center reply posted. |
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

**2. Deploys the store approval itself requires.** The freeze exists to protect
the review, so it must not block the review. Allowed: `assetlinks.json`
fingerprints, review-account access fixes, anything App Review explicitly asks
for. Not allowed: product work riding along in the same deploy. One file, one
reason, reviewed.

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

Do not delete it, rename it, or turn premium off. Premium must stay on for two
reasons: without it the mentor hub renders a paywall and the reviewer never
reaches the feature, and it keeps an Apple reviewer away from a payment screen —
the safer side of Guideline 3.1.1.

**Checked, and safe:** `/api/cron/expire-subscriptions` filters
`.eq('subscription_status', 'active')`; this account is `free_beta`, so the cron
**cannot** flip its premium off. Do not change that filter during the freeze.

**Do not use `reviewer@careerrai.in` / `+919000000001`.** It is the superseded
26 Jul account, `is_premium` false — a reviewer given those credentials would
hit the paywall.

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
