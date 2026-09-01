# CareerRai Engineering Memory — ARCHIVE (full incident entries)

> The complete, unabridged record. The hot index lives in
> `ENGINEERING-MEMORY.md`; grep THIS file for the full story of any incident
> before building in its area. Append new full entries here; add the one-line
> row to the index file in the same commit.

---

## Incident #1 — Push subscriptions dying same-day

- **Date:** July 2026 · **Area:** Notification OS · **Severity:** P0
- **Impact:** 34 of 75 opted-in students unreachable by push; 17 died the *same
  day* they signed up. Nearly half the reachable base lost, silently.
- **Root cause (two, compounding):** (1) permission was requested in the **browser
  tab** before install; the browser→WebAPK transition killed those subscriptions
  (production survival: browser-born ~25% vs installed-born ~92%). (2) The healer
  **unsubscribed a healthy subscription** on first standalone open and re-persisted
  with a single un-retried write — a failed write stranded the just-killed endpoint
  as a corpse that 410'd on the next send.
- **How it hid:** "a subscription row exists" was treated as "reachable," and the
  re-ask UI was gated on prefs being OFF — so 34 students with prefs ON and a dead
  sub had no path back at all.
- **Lessons:** Never request notification permission before the installed app.
  Never `unsubscribe()` a healthy subscription. "Accepted by the push service" ≠
  "delivered." A subscription is never trusted — verify device delivery.
- **Prevention (encoded):** `docs/NOTIFICATION-OS.md` §2 (non-negotiables 5–10),
  §7 (permission architecture). In-app-only permission, reuse-not-rotate
  (`push-client.ts`), retried persist, delivery beacon (`received_at`), reconnect
  screen, health engine.
- **Owner:** Nishant

---

## Incident #2 — Zero new students could log

- **Date:** July 19–20 2026 · **Area:** Notification / Learning · **Severity:** P0
- **Impact:** An entire onboarded cohort logged **zero** times (0/29) — students
  who installed and did everything right could not complete the one core action.
- **Root cause (two):** (1) server hours-validation capped at 6 while the log
  modal offered 8/10 → a silent `400 Invalid hours`. (2) The modal could not be
  submitted without ticking a plan-task, so an honest "studied off-plan" or
  "0 hours" day was impossible.
- **How it hid:** the failure was a swallowed 400 with no telemetry — the app
  looked fine; the logs simply never appeared.
- **Lessons:** Validate the client↔server contract as one thing. Never block the
  core action. Instrument the core action so a silent failure is visible.
- **Prevention (encoded):** `daily-heartbeat`/log path allows 0-hour honest logs;
  off-plan study path; `log_open` / `log_blocked` / `log_error` telemetry. See
  Learning OS (log is sacred, never punished) and Analytics OS (no silent
  failure).
- **Owner:** Nishant

---

## Incident #3 — Dead video-session links

- **Date:** July 21 2026 · **Area:** Trust OS · **Severity:** P1
- **Impact:** Scheduled buddy video sessions handed out links that dead-ended at
  meeting time — a broken promise at the worst possible moment.
- **Root cause:** the Daily.co fallback only checked room *creation*, not *join*;
  creation succeeded while join was blocked by a missing payment method. The Jitsi
  fallback then dead-ended on a moderator-login wall.
- **Lessons:** Never hand out a link you can't verify **end to end**. If the
  provider fails, refuse loudly (503) so the user retries — never save a link that
  only fails at the call.
- **Prevention (encoded):** `docs/OS/TRUST-OS.md` — single provider, "no dead
  links" law, 503-not-a-corpse, `/api/admin/video-health` one-tap end-to-end check.
- **Owner:** Nishant

---

## Incident #4 — Stale streaks (displayed ≠ real)

- **Date:** July 2026 · **Area:** Learning / Analytics · **Severity:** P2
- **Impact:** Students (and the admin view) saw a live streak — e.g. "7-day
  streak" — for a student who had actually broken it. A trust-eroding lie in the
  one number students care most about.
- **Root cause:** `current_streak` was persisted and never decayed; the display
  read the stored value, not the live computed one.
- **Lessons:** A displayed value must equal the **live-computed** value, not a
  stale stored one. One source of truth for derived state.
- **Prevention (encoded):** `liveStreak()` / `momentumStreak()` used on every
  surface; the Momentum Shield replay computes from all logs. Analytics OS: a
  number that doesn't reconcile to source is a rumor.
- **Owner:** Nishant

---

## Incident #5 — Dashboard contradicted itself

- **Date:** July 20 2026 · **Area:** Analytics OS · **Severity:** P0 (decisions)
- **Impact:** The admin dashboard showed a card count that disagreed with the list
  behind it (e.g. "logged today = 1" while other cards implied more; remind-count
  132 vs page ~115). The founder could not trust the numbers he steers by.
- **Root cause:** the card count and its list were computed by **different
  queries**, with fuzzy/`similar` membership and NULL-dropping filters.
- **Lessons:** Count and list come from the **same function** — count is literally
  `list.length`. Membership is a deterministic WHERE clause. NULL-safe filters.
- **Prevention (encoded):** `src/lib/admin-filters.ts` (shared filters, one base
  population); `docs/OS/ANALYTICS-OS.md` non-negotiables. This is the reference
  implementation of the count=list.length doctrine.
- **Owner:** Nishant

---

## Incident #6 — 0-hour log excluded from streak

- **Date:** July 2026 · **Area:** Learning · **Severity:** P2
- **Impact:** A student who logged an honest 0-hour day (Hridyansh) showed a zero
  streak — the app punished honesty, the exact opposite of the habit doctrine.
- **Root cause:** the streak replay ignored 0-hour logs as "no activity."
- **Lessons:** Every honest log counts — showing up is the behaviour, hours are
  secondary. Never let a data-shape assumption punish the desired behaviour.
- **Prevention (encoded):** migration + backfill so all distinct log dates count;
  Notification/Learning OS: reward showing up, never punish a miss.
- **Owner:** Nishant

---

## Incident #7 — Invented statistic nearly shipped

- **Date:** July 2026 · **Area:** Trust OS · **Severity:** caught pre-ship
- **Impact:** An insight line claimed error-logging "separates 85%ilers from
  95%ilers" — a fabricated statistic. Caught before students saw it.
- **Root cause:** reaching for a persuasive number that wasn't real.
- **Lessons:** No invented statistics, ever. Persuade with a true behaviour
  ("the habit toppers credit most"), never a made-up percentile.
- **Prevention (encoded):** company-wide non-negotiable in every Constitution and
  the Engineering Playbook.
- **Owner:** Nishant

---

## Incident #8 — PWA start_url redirected, installs silently failed

- **Date:** 25 July 2026 · **Area:** Growth OS (install) · **Severity:** live,
  student-reported
- **Impact:** A student messaged at 07:30 IST: "App open nhi ho rhi." He had
  accepted the install prompt at 07:24 and accepted it AGAIN at 07:35 — Chrome
  does not re-prompt for an installed PWA, so the install never completed.
  Every event he produced stayed `display_mode: browser`; he never once reached
  standalone. Across all students: **74 accepted the install prompt, 66 reached
  standalone, 8 never did** (~11%). All 8 were Chrome on Android.
- **Root cause:** `manifest.json` had `start_url: /student/home?source=pwa`.
  `/student/home` is a server redirect to `/student/tracker`, and the student
  layout redirects to `/login` when unauthenticated — so an unauthenticated
  fetch of start_url returned **307 → /login**, never 200. Chrome validates
  start_url during install; a redirect chain there makes the install unreliable.
  It also cost every real launch an extra redirect hop, and `?source=pwa` was
  destroyed by the redirect exactly as `?source=twa` had been (Incident: TWA
  store-build marker, same week — same bug class, second occurrence).
- **Detection gap:** every automated check we run asks "does this route work
  when logged in". Nothing asked "what does an anonymous fetch of start_url
  return", which is precisely the request Chrome makes.
- **Fix:** `start_url` now points at `/app?source=pwa`, a client-rendered entry
  page that returns **200 unauthenticated** and routes onward in the browser.
  Verified: `/app?source=pwa` → 200, old value → 307 → /login.
- **Lessons:** A URL that a browser or an OS fetches on our behalf must be
  tested **the way that agent fetches it** — unauthenticated, no cookies. And
  the second time a redirect ate a `?source=` marker should have been the first
  time we generalised the lesson.
- **Prevention (encoded):** the release sweep now includes an anonymous fetch of
  every URL an external agent resolves — `manifest.json` start_url, the service
  worker, icons, and `.well-known/assetlinks.json` — asserting 200, not 3xx.
- **Owner:** Nishant

---

## Incident #9 — exam_ready was self-declarable through the mandatory weekly review

- **Date detected:** 25 Jul 2026 · **Severity:** SEV-3 (data integrity, 10 rows / 6 students)
- **What happened:** "exam_ready cannot be self-declared" was enforced in
  `validateCoverageEntry` — but `topic_coverage.status` had ten write paths,
  and the weekly coverage review (the one screen we had just made *mandatory*)
  validated only "is it a real status" and "is it a forward move". Students
  could tap Exam Ready from a chip row. Ten topics across six students
  acquired it in the eight days the review was live, with every section
  engine switched off — no legitimate path existed.
- **Second door found in the same audit:** `applyConfidenceSignal` promoted
  one rank per green tap **up to and including exam_ready**, and the Home
  card's Done button sends green automatically — four Done taps would have
  finished a topic with zero accuracy recorded.
- **Root cause:** an invariant that N writers must each remember is an
  invariant that fails at writer N+1. Same failure class as Incidents #4
  (streak) and #5 (dashboard): a business rule with more than one
  implementation.
- **Fix:** rule enforced three layers deep — (1) the weekly review rejects
  `exam_ready` server-side and no longer renders the chip; (2) green taps cap
  at `revising` (`topic-selector.ts`); (3) a database trigger
  (`guard_exam_ready`, migration `20260725_exam_ready_guard`) refuses
  `exam_ready` for any (student, topic) with zero `topic_evidence` rows — the
  layer no forgotten writer can skip. Both directions live-tested in
  production: write without evidence → rejected; with evidence → accepted,
  then rolled back. The 10 leaked rows were reset to `revising`.
- **Lessons:** enforce integrity invariants **in the database**, where every
  writer must pass, and keep app-level checks as the friendly error message —
  not the wall. The status ladder itself is now declared once
  (`coverage-status.ts`) so a new writer can't quietly diverge.
- **Prevention (encoded):** the trigger; the shared ladder module; the
  Playbook §3 gate ("a change that redefines an existing business concept
  instead of importing it is rejected").
- **Owner:** engineering

---

## Incident #10 — App Store rejection: unreachable login, foreign status bar, fictional demo accounts

- **Date:** 28 July 2026 · **Area:** Growth OS (install/distribution) ·
  **Severity:** live, launch-blocking
- **Impact:** iOS 1.0 (1) rejected on three guidelines at once (submission
  `ddfd8f62-381c-43a3-879d-55ad808461b1`), blocking the App Store launch.
- **What happened, in three separate failures:**
  1. **Guideline 2.1** — "unable to sign in as no password login was found."
     Our primary auth is a +91 SMS OTP a reviewer cannot receive; the password
     escape hatch was a 12px grey link two steps behind a role picker. Worse,
     the password form's credential input ran
     `e.target.value.replace(/\D/g, '').slice(0, 10)` while
     `/api/auth/login` happily accepts phone **or email or username** — so the
     credentials a reviewer would be given were *physically untypeable*.
  2. **Guideline 2.3.10** — "remove non-iOS status bar images."
     `public/testimonials/vedprakash-wa.jpg` was a raw Android WhatsApp
     screenshot: Android status bar, WhatsApp chrome and all. Alongside it,
     `WhatsAppLiveChat` rendered a replica of WhatsApp's interface (header
     green, chat wallpaper, bubble colours, ✓✓ receipts) inside our own app.
  3. **Guideline 2.3.3** — the 13-inch iPad screenshots were promotional art,
     not the app in use. Nobody had opened "View All Sizes in Media Manager"
     to see what was attached to that slot.
- **The compounding failure — documentation as fiction:** `DEMO_ACCESS.md`
  described a one-tap demo button (`POST /api/auth/demo-login`), a `cr_demo`
  read-only cookie enforced in `src/proxy.ts`, and seven shared demo accounts.
  **None of it existed** — no route, no cookie reference anywhere in `src/`,
  and not one of those accounts in the database. `scripts/seed-demo-data.sql`
  was stale the same way, `UPDATE`-ing profiles by UUIDs long gone. Any
  credential handed to Apple from that file would have failed on contact.
- **Root cause:** two of the three rejections trace to shipping *other
  platforms' pixels* as our own proof, and the third to an access path we
  documented but never tested. A credential written in a markdown file is a
  claim, not a fact; only a login attempt is a fact.
- **Fix:** WhatsApp screenshot, WhatsApp-replica component and the whole
  social-proof onboarding screen deleted; testimonials reduced to real student
  words in our own styling. Password login promoted to a labelled button on the
  role picker plus a visible `Mobile OTP | Password` toggle, and the credential
  field now accepts phone/email/username. A real review account
  (`appreview@careerrai.in`, `is_demo = TRUE`) created and seeded with 21 logged
  days, 2 mock debriefs and a 21-day streak, so no screen looks empty. Password
  verified cryptographically (correct matches, wrong rejected).
- **Lessons:**
  1. Never ship a screenshot of another app, or an imitation of its interface,
     inside ours. Quote the student; don't photograph their messaging app.
  2. An auth path that only works for +91 SMS is an auth path that excludes
     every reviewer, auditor and partner outside India. Password login is not
     a fallback to hide in fine print.
  3. Client-side input sanitising must match what the server accepts. Stripping
     to digits in front of an endpoint that resolves emails is a silent lockout.
  4. Access documentation must be re-verified against the database before it is
     used, and never trusted because it reads plausibly.
- **Prevention (encoded):** `docs/APP-STORE-SUBMISSION.md` — the resubmission
  runbook, including a deploy-before-submit gate (the wrapper serves
  `careerrai.in`, so code fixes are invisible until production deploys) and a
  two-part credential check: SQL verification **and** a real UI sign-in.
  `DEMO_ACCESS.md` rewritten to describe only what exists, with the rotation
  and verification SQL inline. Comments at each removal site
  (`src/lib/testimonials.ts`, `src/components/testimonials.tsx`,
  `src/app/login/page.tsx`) name the guideline so the next person doesn't
  reintroduce it.
- **Owner:** Nishant

---

## Incident #11 — Curated Daily Pick content wearing a student's byline

- **Date:** 29 Jul 2026
- **Severity:** S3 (no outage; a Constitution violation live in front of students)
- **Found:** While seeding a month of curated questions and tips, on reading the
  existing shelf. Not reported by anyone — it had been live since 25 Jul.
- **What happened:** All 28 items on the Daily Pick shelf were owned by the
  founder's own admin account (`role = 'admin'`) and rendered as
  "— Pooja, CareerRai student". The content was good; the byline was invented.
  Three surfaces did it: `community-vote-card.tsx` (ballot **and** Top Pick),
  `home-tip-card.tsx` (which also labelled it "💡 Student Tip"), and
  `topic-insights.tsx` ("Shortcut from a student · verified by CareerRai").
- **Why it slipped through:** the anonymisation convention is legitimate — a real
  student's submission gets a random first name so no one becomes a star, and
  "— Priya, CareerRai student" is then *true*: the name is hidden, the words are
  hers. Seed rows reused that same field, so the identical render turned into a
  fabricated attribution with no code change and nothing to notice.
- **Root cause:** the row carried no way to say who wrote it. `display_name` was
  doing double duty as "anonymised student" and "author", and only one of those
  two readings is honest in the UI.
- **Blast radius:** every student who opened Daily Pick or Home between 25 and
  29 Jul. Same class as the 2.3.10 rejection in Incident #10 — a
  misrepresentation of who is speaking.
- **Fix:** `student_submissions.curated` (migration
  `20260729_daily_pick_curated_flag.sql`), backfilled `true` for every
  admin-owned row. All three surfaces now branch on it: "— Curated by CareerRai",
  and the labels drop the word "Student" too. New curated stock is inserted with
  `display_name = 'CareerRai'`, `curated = true`.
- **Lessons:**
  1. A field that means two different things will eventually render a lie. If a
     row can be authored by us *or* by a student, the row has to say which.
  2. Attribution is not copy — it is a claim. Reviewing the seed content for
     quality is not the same as reviewing what the screen asserts about it.
  3. Curated is not the problem and never was. Curated content presented as
     curated is honest and, for hard questions, more credible.
- **Prevention (encoded):** the `byline()` helper in
  `community-vote-card.tsx` is the single place the two cases are decided, so a
  new block cannot hand-roll a student claim. `src/lib/daily-pick-seed.test.ts`
  holds the founder's content constraints (all three sections, no RC, question
  and tip length ceilings, a trap named in every explanation) so the next batch
  clears the same bar. Tip length now comes from `MAX_TIP_CHARS` in
  `community-pipeline.ts` instead of the literal `150` that had been copied into
  the server validator, the textarea and the character counter.
- **Owner:** Nishant

---

## Incident #14 — a security sweep revoked the one grant two migrations told it not to

- **When:** revoked 26 Jul 2026. Found 1 Aug, 00:10 IST, from a student's screenshot.
- **Symptom:** a raw Postgres string rendered into the onboarding UI —
  `permission denied for function is_admin`. Student `+917011443800` signed up
  at 00:08 IST, hit it, and was last seen at 00:10. Ninety seconds, no exam
  target saved.
- **Cause:** `20260726_security_hardening_pre_launch.sql` ran
  `revoke execute on function public.is_admin(uuid) from anon, authenticated;`.
  But `is_admin(uuid)` is referenced by **four RLS policies** — `profiles`
  (cmd `ALL`), `daily_reports`, `test_results`, `buddy_feedback`. Postgres
  evaluates every applicable policy on a statement, so a student reading or
  writing their *own* profile still invokes `is_admin()` as `authenticated`.
  With no EXECUTE the statement aborts.
- **Why the guard failed:** that migration's header states "every revoked RPC
  was verified server-side-only (service role) by grep before revoking." The
  grep ran over application code. `is_admin`'s callers are not application code
  — they are four policies **inside the database**. The verification was
  structurally incapable of seeing them.
- **What makes it worse:** two earlier migrations had already written the
  exception down. 20260707: *"revoked from anon only (not authenticated) — four
  RLS policies call is_admin(auth.uid())"*. 20260712: *"authenticated must keep
  its explicit EXECUTE; only strip the PUBLIC default and anon."* The knowledge
  existed, in this repo, in comments on the very statements being changed.
- **Fix:** `20260731_restore_is_admin_execute_to_authenticated.sql` —
  `grant execute on function public.is_admin(uuid) to authenticated;`
  PUBLIC and `anon` stay revoked, so the hardening intent survives.
- **Blast radius, honestly — and narrower than first stated:** 13 students
  signed up after 26 Jul. **10 of them completed onboarding**, so this was not
  blocking everyone, and the first framing of "onboarding broken for five days"
  was wrong. One student is confirmed by screenshot, at 00:08 IST on 1 Aug.
  How many others hit it is UNKNOWN, and *stays* unknown because nothing was
  logged — which is the next lesson. The revoke's exact landing date could not
  be established either: the repo file
  `20260726_security_hardening_pre_launch.sql` has no matching row in
  `supabase_migrations.schema_migrations`, so it reached production by some
  other path.
- **The number that mattered more, found while building the outreach list:**
  **12 of those 13 students have never logged a single day.** That is not a
  permissions bug, it is the activation cliff — the same wall the check-in
  analysis hit from the other side (27 of 246 opened the app in 2.5 days, while
  the gate converts 85% of students it actually meets). The P0 was real and
  worth fixing in an hour; it was not why those students left.
- **Lessons:**
  1. **A grep over `src/` cannot verify a database permission.** Callers of a
     SQL function live in policies, triggers, views and other functions. Before
     revoking EXECUTE, query `pg_policies`, `pg_trigger` and `pg_proc` — not the
     application code.
  2. **A comment explaining why something must stay is not a guard.** Both
     warnings were written and both were overwritten. Only a test or a check
     that *runs* can stop this.
  3. **A raw Postgres error reached a student's screen.** Whatever the
     underlying fault, `permission denied for function is_admin` is never an
     acceptable thing for a 20-year-old deciding whether to trust us.
  4. **The error was never reported.** `client_errors` holds zero rows matching
     it. We found this from a screenshot, not from our own instrumentation —
     which is why the blast radius is unknowable.
- **Prevention (encoded):**
  `supabase/migrations/20260731_restore_is_admin_execute_to_authenticated.sql`
  carries the full reasoning at the point of change. Still open, and worth more
  than the fix itself: a check that fails when any function referenced by an RLS
  policy lacks `authenticated` EXECUTE — the query already exists in this
  incident's investigation and belongs in `business_invariants()`.
- **Owner:** Nishant

---

## Incident #15 — the iOS payment fix sat on a branch for a day while everyone believed it shipped

- **When:** fixed 31 Jul 2026 13:28 UTC. Still broken in production 1 Aug
  19:24 IST, when the founder hit it on his own iPhone.
- **Symptom:** identical to the bug that was already "fixed" — tap Buy inside
  the iOS app, get a white screen. `window.open()` returns null in a WKWebView,
  `escapeToBrowserForPayment` returned at its `if (!win)` guard, and the wrapper
  painted a blank view over the error message the code correctly produced.
- **Cause — and it is not a code bug.** `cc3c1eb` fixed this properly: iOS skips
  `window.open` entirely and renders a real anchor the navigation delegate
  honours. It was committed, tested, and **pushed to `claude/status-update-t1g5as`.
  It was never merged to `main`.** Vercel deploys production from `main` only, so
  the fix never reached a single student. Production ran the broken code for the
  entire time it was considered fixed.
- **Why it hid:** every signal that normally means "done" was green. The commit
  existed, its message documented production-verified evidence, the tests passed,
  the branch was pushed, and Vercel even built it — as a **preview** with
  `target: null`. Nothing anywhere said "not live." The 31 Jul session's own
  commit message reads as a completed fix, because from inside that session it was.
- **Evidence it was never live:** `origin/main` still contained
  `window.open('about:blank','_blank')`, and grep for `paymentHandoffUrl`,
  `isIosStoreBuild` and `buildGoUrl` in `origin/main` returned **zero** matches —
  the entire iOS anchor path was absent. Telemetry agreed: `pay_escape_browser`
  with `opened:false` on `platform:ios, display_mode:standalone` at 19:24 IST,
  and `pwa_session_handoff` empty since 31 Jul 08:07, proving no token was ever
  minted on the new path.
- **Cost:** every iOS student who tried to pay between 31 Jul and 1 Aug got a
  white screen. Zero payments have ever completed on iOS. Because the wrapper
  hides the error, none of them could have reported anything but "it's broken."
- **Lessons:**
  1. **A fix on a branch is not a fix.** "Committed", "tested" and "pushed" are
     not "shipped". The only question that matters is whether the code is on the
     branch production deploys from.
  2. **A freeze is a queue, and a queue needs a reader.** STORE-FREEZE.md
     correctly stopped the merge. What it never had was a list of what was
     waiting, so a P0 fix and a docs change queued identically and both waited.
  3. **The most dangerous bug is one everybody believes is fixed.** Nobody
     re-checked iOS payment for a day, because the incident was closed.
  4. **A preview build looks exactly like a deploy.** Vercel reported success on
     every branch push. `target: null` was the only difference and nobody reads it.
- **Prevention (encoded):** none yet, and this is the honest gap. The check that
  would have caught it is cheap — for any commit claiming a production fix,
  verify the change is an ancestor of `origin/main` before closing it
  (`git merge-base --is-ancestor <sha> origin/main`). Until the freeze lifts,
  STORE-FREEZE.md needs a "waiting to ship" list naming every unmerged fix and
  its severity, so nothing P0 sits in the queue unnoticed again.
- **Owner:** Nishant

---

## Incident #17 — one meeting, two truths: the mentor lost Join at T+0

- **Date:** 2026-08-04 · **Area:** Trust OS · **Severity:** P1
- **Impact:** The first paid orientation failed at the moment it began. The
  student joined an empty room ("I had joined the call, nobody was in the
  meet!"); her mentor could not get in ("joining my app was stuck").
- **Root cause:** the student's list queried `scheduled_at >= now - 1h` (a
  grace window, with a comment explaining why). Every buddy-side surface
  queried `scheduled_at >= now`. At the scheduled second the row left the
  mentor's query, so the session and its Join button vanished from her app.
  With a `minsAway <= 15` gate, a mentor's whole join window was T-15min to
  T-0, slamming shut exactly when the call started.
- **How it hid:** Daily.co was healthy — room valid, key live, billing fine —
  so every "is video working" check passed. The failure was in *who could see
  the session*, not in video. Nobody had opened the mentor's app at T+0.
- **Lessons:**
  1. **Two people in one meeting must never get two different answers to "is
     this happening."** Same class as Incident #5 (count and list from
     different queries); here, the same session from different queries.
  2. **A grace window added on one side of a two-sided feature is a bug on the
     other side.** It was applied where the symptom was reported.
  3. **Verify end-to-end from every seat**, not only the one that complained.
- **Prevention (encoded):** `src/lib/session-window.ts` — `sessionsVisibleFrom()`
  and `isJoinOpen()` are the single rule, imported by all four surfaces.
  `logged-out-routing.test.ts` pins the join window including the cases that
  used to fail (`isJoinOpen(0)`, `isJoinOpen(-4)`).
- **Owner:** cofounder (AI)

---

## Incident #18 — the landing page shipped with no way to log in

- **Date:** 2026-08-04 · **Area:** Growth OS · **Severity:** P1
- **Impact:** A buddy with a paying student assigned could not reach her own
  dashboard. She opened the link, landed in the student signup funnel, and
  reported that it "is taking me to only student portal now." She had never
  logged in once in the 30 days since her account was created. Every returning
  user whose session lapsed hit the same wall.
- **Root cause (two, compounding):**
  1. `/welcome` — where root redirects every logged-out arrival — contained no
     `/login` link at all. Its only CTA was `/start`, the student funnel.
  2. The proxy sent any logged-out visitor on a protected path to `/start`
     unless a `user_role` cookie existed. On a new device a buddy has no such
     cookie, so `/buddy/home` redirected into the student funnel.
- **How it hid:** `/start` carries a prominent Log in link *in triplicate*,
  added after Incident #10. `/welcome` was built later and placed IN FRONT of
  `/start`, never inheriting the rule. The door was fixed one level too deep.
- **Lessons:**
  1. **This is Incident #10 again.** An unreachable login already cost a store
     rejection; the lesson was encoded on one page instead of as a rule for
     whatever page is currently the front door.
  2. **A new screen placed in front of an old one inherits its obligations.**
  3. **A role that cannot be a new signup must never be routed to signup.**
- **Prevention (encoded):** `/welcome` carries the login door with a
  never-remove comment matching `/start` and `/login`. `proxy.ts` routes only
  `/student*` into the funnel; `/buddy*` and `/admin*` always go to `/login`.
  `logged-out-routing.test.ts` pins the full truth table, including the
  store-launch holdback the store reviews depend on.
- **Owner:** cofounder (AI)

---

## Incident #19 — Play rejected the listing over screenshots the guide had already banned

- **Date:** 2026-08-05 · **Area:** Growth / store · **Severity:** P1 (launch-blocking)
- **Impact:** Play review ended in REJECTION (Metadata policy, "Unclear
  Visuals") after ~8 days of waiting. Every day of re-review is a day with no
  store presence.
- **Root cause:** the three uploaded store screenshots were
  `public/screenshots/{welcome,onboarding,diagnostic}.png` — the PWA-manifest
  images: a mostly-blank onboarding question, a marketing phone-mockup, and a
  pure promo card with zero app UI. `PLAY-STORE-UPLOAD-GUIDE.md` §5 warned
  against exactly this before upload ("pre-login screens… lead with the app
  in use"). The warning existed; nothing enforced it at upload time.
- **How it hid:** a store listing has no CI. The only gate was a human reading
  a paragraph in a long guide during a manual console workflow.
- **Lessons:**
  1. **A written warning is not a control.** Anything that can be rejected
     needs a checklist at the point of action, not advice inside a long doc.
  2. **Manifest screenshots are not store screenshots.** The PWA trio exists
     for a browser install sheet; a store reviewer needs the app in use.
  3. **Store assets are product surface** — same review bar as a student screen.
- **Prevention (encoded):** `docs/PLAY-RESUBMISSION.md` — capture spec (6
  in-use screens from the evergreen review account), paste-ready compliant
  description, exact resubmit clicks; linked from the freeze doc's status box
  so the next submitter lands on the checklist first.
- **Owner:** founder (upload) + cofounder AI (pack)

---

## Incident #20 — the plan told a paying student to re-learn what he had finished

- **Date:** 2026-08-05 · **Area:** Learning OS · **Severity:** P1
- **Impact:** Our first premium student, to his buddy on Instagram: *"Bhaiya jo
  already completed hai wahi aa rha phir se krne ko kyu?"* His plan told him to
  **Learn** Editorial Reading and **Learn** Arrangements — both marked
  *practising* by him weeks earlier. The buddy had no answer and went quiet.
  Every student on the app saw this every day of August.
- **Root cause:** the task VERB was written from `getPhase()`, which answers
  "where is this student in the CAT **calendar**" — one value for the whole
  day. In August that is `foundation` for everyone, so every task rendered as
  "Learn X" regardless of what the student had already done on that topic.
  The topic's own coverage status was loaded, scored and used to CHOOSE the
  topic, then discarded before the label was written — `TopicChoice` never
  carried it out of the selector.
- **How it hid:** the card contradicted itself in plain sight and no test
  compared the two halves. `expertWhy()` read the coverage status and printed
  *"Finish what you started."* directly under a heading that said *"Learn…"*.
  Both were rendered from the same object, from different sources. It was
  invisible to us because a self-consistent-looking card is only wrong if you
  know what the student already did.
- **Lessons:**
  1. **Calendar is a guess; status is evidence — evidence wins.** The same rule
     the replan engine adopted hours earlier after a student's declared 12
     hrs/day outranked his two logged sessions. Two engines, one disease.
  2. **When one card is built from two sources, test that they agree.** A
     contradiction inside a single UI element is a class of bug, not a typo.
  3. **The student is the best test suite we have.** 338 passing tests and a
     paying customer found this in one glance at his own plan.
- **Prevention (encoded):** `phaseForTopic()` in `routine-engine.ts` is the one
  place a task verb is decided, and it reads the topic's status first, falling
  back to the calendar only when a topic has no coverage row. `TopicChoice`
  now carries `coverageStatus` out of the selector. `task-verb.test.ts` pins
  the rule in both directions — a practised topic is never "Learn", a
  never-started topic is still "Learn" even in November — and replays Harsh's
  exact three cards from 5 Aug as a regression. The swap-topic route was
  carrying the identical fault and is fixed in the same commit.
- **Owner:** cofounder (AI)

---

## Incident #21 — a pair in two different rooms: "I am in separate meeting with Harsh"

- **Date:** 2026-08-05 · **Area:** Trust OS · **Severity:** P0 (paying customer)
- **Impact:** Our first paying student and his mentor could not get into the
  same call across THREE attempts in one evening (16:30, 19:00, 19:30). The
  mentor reported *"Your meeting link is not good"* and *"I have been getting
  dropped off multiple times"*, then moved the session to a personal Google
  Meet — which in turn hit a permission wall. The founder, holding a link we
  gave him, was in yet another room.
- **Root cause:** `schedule-meeting` only ever INSERTed. "Rescheduling" created
  a NEW session with a NEW Daily room and left every earlier one `scheduled`.
  That pair accumulated **four live sessions with four different rooms**. Every
  surface then picked "the first row by `scheduled_at`" — and two of the four
  shared the SAME MINUTE, so the sort key was tied and the database was free to
  return a different winner per query. The student's phone could resolve to one
  room and the mentor's to another, from identical data, and a re-render could
  move either of them again — experienced as being "dropped".
- **How it hid:** every individual piece was healthy. The Daily key worked, the
  rooms existed, were public and unexpired, and `/api/admin/video-health`
  passed. We had verified *a* room end-to-end and concluded "video works" —
  the real question was never "does the room work" but **"are both people
  looking at the same room?"** Nothing in the product or the tests asked that.
- **Lessons:**
  1. **Reschedule is an UPDATE, never an INSERT.** Anything that models "the
     next X" must have exactly one live row, enforced at the write.
  2. **A tied sort key is a coin toss.** Ordering that two clients depend on
     agreeing about must be total — Incident #5's "count and list from the same
     function" rule, applied to ordering.
  3. **Verifying one artifact is not verifying the system.** We proved the room
     joined; we never proved both people were sent to it.
  4. **Blaming the vendor is the expensive mistake.** The instinct was to
     replace Daily. The provider was innocent, and switching would have carried
     the same bug to Google Meet — two live sessions means two Meet links.
- **Prevention (encoded):** `schedule-meeting` cancels a pair's live sessions
  BEFORE inserting the new one, so there is no window with two. All four
  session queries carry a deterministic `created_at DESC` tie-break.
  `session-single.test.ts` replays the exact five rows from this evening and
  asserts both that a pair can never hold two live sessions and that two
  clients given the same rows in different orders resolve to the same session.
  A buddy may now also supply their OWN meeting link (Meet/Zoom), used verbatim
  with no Daily room — a mentor should never be trapped inside our provider.
- **Owner:** cofounder (AI)
- **Follow-up (same day):** the prevention above was application-level only, and
  the founder rejected the *supersede* semantics outright: a second booking must
  **refuse**, not silently replace. See the architecture note below — the rule now
  lives in two database constraints, where it cannot be forgotten by the next
  endpoint someone writes.

---

## Architecture note — one permanent Meet room per buddy (2026-08-05)

Not an incident. A founder decision that reverses a design from earlier the same
day, recorded here because the reasoning matters more than the diff.

**Before:** every booking minted a fresh Google Meet on the mentor's calendar.
**After:** a buddy gets ONE permanent room, created the first time they connect
Google, reused by every session they ever run. No calendar event is created per
booking.

**Why:**
- A mentor learns one link. Ours are IIM alumni with day jobs; a new URL per
  session is one more thing to hunt for while a student waits.
- A link a student already saved can never go stale, so a reschedule cannot
  strand anyone in a retired room — the exact shape of Incident #21.
- Booking no longer depends on a live Google call succeeding.

**What it costs, stated plainly:** the room is shared across all of a buddy's
students, so two of them must never be scheduled into it at once. And neither
side now receives a per-session calendar invite or Google reminder — which is
why the student-side Google-connect card was pulled from `/student/buddy` the
same hour it shipped, rather than left promising a calendar entry that no longer
arrives.

**What makes the shared room safe (encoded):**
1. `no_overlapping_buddy_sessions` — a GiST exclusion constraint over
   `(buddy_id, session_span)`. Sessions may sit flush (10:00–10:30 then
   10:30–11:00) but never overlap. The span originally carried a 15-minute tail
   buffer against a call running long; the founder removed it so a mentor can
   run continuous calls on a free day, and the residual risk is covered by
   Meet's knock-lobby — only the mentor is on the invite, so the next student
   waits to be admitted rather than walking into a live 1:1.
2. `one_live_session_per_pair` — a partial unique index. A second booking for a
   pair is **refused** with a message telling the mentor to cancel the first.
3. Meet's own knock-lobby. Only the buddy is on the invite, so every student
   arrives as an uninvited joiner and the buddy admits them one at a time. A
   student holding a months-old link still cannot walk into someone else's call.
4. `cancel-meeting` compares against `profiles.buddy_meet_event_id` before
   deleting anything in Google — cancelling one session must never be able to
   destroy the room every one of that buddy's students uses.

**The lesson worth keeping:** the first fix for Incident #21 lived in one API
route. Constraints 1 and 2 live in Postgres, so they hold for the admin script,
the next endpoint, and the race between two taps in the same second. *If a rule
matters, put it where the data is.* Both were verified against the live database
inside a deliberately aborted transaction before shipping — five cases, five
expected outcomes, zero rows written.

### Hardening pass (same day, founder review)

The founder accepted the architecture and named ten gaps before merge. What
they have in common is worth stating: **every one is about the states AFTER the
happy path** — a revoked grant, a swapped Google account, a deleted event, a
lost race, a support ticket at 10pm. The happy path was already fine. That is
usually where the next incident is.

- **Connection state and room state die together.** `clearGoogleState` is now
  the only way to disconnect, and it clears the token AND `buddy_meet_url`.
  Deleting just the token is the bug that hides for a week: the app keeps
  believing it can hand out a link on a calendar it can no longer read.
- **A dead grant is torn down once, not retried forever.** A 401 from any
  Calendar call clears the connection on the spot and the mentor is told to
  reconnect. A 429/500/network failure changes *nothing* — their setup is fine,
  and wiping it would turn a 30-second blip into a support ticket. That
  distinction is the point of `FailureReason`.
- **A room belongs to a Google ACCOUNT, not to a buddy.** Reconnecting with a
  different address mints a new room, because the old one now sits on a
  calendar we cannot read, write or cancel.
- **`integration_audit_log`** records every connect, disconnect, revoke, room
  mint, booking, rejection and Google error. Incident #21 cost an hour to
  reconstruct a timeline from `created_at` columns that were never meant to be
  one. A CHECK constraint rejects any row whose detail mentions a token — the
  log is the likeliest place for a credential to leak by accident, so that is
  enforced by the database, not by review.
- **Admin overrides** (`/api/admin/buddy-integration`) cover the four fixes
  support has actually needed: cancel a stuck session to release the pair lock,
  clear a broken Google connection, regenerate a room, and see who cannot book.
  Nobody should be opening the SQL editor to fix a session — that skips the
  audit trail and teaches us nothing.
- **A business rule is a 409, never a 500.** `lib/booking-constraints.ts` is the
  single translator from `23505`/`23P01` to a sentence, with buddy and student
  wording, used by every write path and by the friendly pre-check — so one rule
  cannot produce two different explanations. A 500 is wrong twice: it says
  something is broken when nothing is, and it invites a retry that can only fail
  identically forever.
- **Idempotent booking.** An `Idempotency-Key` header makes a double tap on bad
  mobile data one booking instead of two-then-an-error. Only successes are
  stored — a failure must stay retryable, or a mentor whose one call hit a
  Google blip would replay that error forever. Scoped by (user, endpoint, key),
  because keys are client-generated and must not read across users.
- **Stale sessions expire.** One live session per pair has a sharp edge: a
  session nobody closes out holds the lock *forever*. This database already had
  a 21 July row still `scheduled` — that pair could never have booked again, and
  it would have been reported as "booking is broken", not "the lock is stuck".
  A 6-hourly cron releases them, measured from each session's own END time so a
  call running long is never touched.
- **`expired` exists because both alternatives lie.** The dry run of that cron
  against live data showed it would have marked the 4 Aug Shreya orientation
  `cancelled` — the session the founder watched go well and rated 10/10.
  `completed` fabricates evidence (Incident #9); `cancelled` denies a call that
  happened. `expired` claims only that the window passed with no outcome
  recorded. History renders it as "No outcome recorded", never "Completed".
  *A cleanup job must not rewrite history it did not witness.*
- **What is NOT proven:** the two-simultaneous-requests race was verified as
  far as this environment allows (the constraint rejects the duplicate, live),
  but genuine wall-clock concurrency needs two connections at once —
  unavailable here (no service-role key, `max_prepared_transactions` is 0, and
  the SQL tooling serialises). `scripts/race-booking-test.mjs` fires N parallel
  requests at a deployed instance and asserts exactly one winner; it must be
  run once against production after this ships. **Do not record this as proven
  until that run is green.**

---

## Incident #22 — five engines, one student, and no two numbers the same (2026-08-06)

**What the student saw.** "Bhaiya 11 hr ka plan bnwayi hu aur sirf 4 hr ka task
milta hai?" — Abhishek, 6 Aug, on Instagram. She had set 11 hours a day. Her
plan gave her four. And the founder: "sometimes they are seeing 4 hrs of study,
sometimes 6 hours... I don't want them to come on our app and feel confused
daily. This will be the biggest blunder."

**What was actually happening.** Five separate pieces of code each held an
opinion about how big her day should be, and they ran in sequence:

| # | Where | What it did |
|---|---|---|
| 1 | `post-signup/route.ts` | A date change **rewrote** `study_target_hours` to remaining syllabus ÷ days left, clamped 1..12. Silent, in place, no record of the old value. |
| 2 | `pace-card.tsx` | The Home headline showed `requiredPerDay` — the date's demand — while the plan below was built from something else. |
| 3 | `routine/today` | Fed that same date-derived pace in as the day's budget. |
| 4 | `capacity-engine` | Then shrank it toward what she had recently logged. |
| 5 | `adaptation-engine` | Then scaled the task COUNT by 0.6–1.3 on top. |

Every one was individually defensible and had a sensible comment above it. The
composition was indefensible: her number went in at 11 and nothing she could see
was 11.

**The bug behind the bug.** `lib/routine-plan.ts` is a SECOND plan generator,
written for the notification cron, writing to the same `daily_routines` row. It
kept `capBudget(paceHours ?? claimed, capacity)` after `routine/today` was fixed
to use the student's own hours — and it runs FIRST, at 6am, before the student
opens the app. So for every student who gets a morning notification, the cron's
version was the one that won. A fix aimed straight at this bug missed it by a
whole file. **A duplicated generator is not a duplication problem; it is a
correctness problem the moment the two copies disagree.**

**The rule now** (founder: "one number, one owner, one place it can change"):

- **THE NUMBER** — `profiles.study_target_hours`. `hours_available` is a
  demoted mirror kept only for CRM/export payloads.
- **THE OWNER** — the student. Nothing may derive, cap, trim, or round it
  toward behaviour.
- **THE CHANGE** — `lib/daily-hours.ts` `setDailyHours()` only, from an action
  the student took. Every read goes through `dailyHours()`.
- **THE CONSEQUENCE** — falling behind moves the FINISH DATE, once a week, with
  the arithmetic attached (`lib/plan-extension.ts`). The date gives. The hours
  don't.

**Teeth.** `daily-hours.test.ts` greps every source file for a
`study_target_hours` write outside the one writer, and for any site feeding
`requiredPerDay` into an hours column. Either shape fails the build. The
`daily_routines.generated_pace_hours` column was renamed `generated_hours`
because it now stores the hours a plan was built to, and **a column whose name
describes something it no longer holds is how the next person reintroduces the
bug** — I had already left that comparator watching a dead number for half a day.

**What could not be recovered.** The overwrite happened in place, so for the 257
existing students there is no way to tell a number they chose from one we
imposed. Nine sit on exactly 12 — the fingerprint of the old `Math.min(12, ...)`
clamp — and one on 15, above anything any slider offers. Founder's call: "any
confusion for any student, ask them the question in app and then act, or confirm
from them." So every student gets a one-time in-app card naming their number and
asking whether it is theirs; answering stamps `study_hours_source = 'student'`
and the card never returns. The picker always includes their current value, so
confirming can never quietly move a student off 12 or 15.

**The general lesson.** Each of these five layers was added to help. None was
wrong on its own. What made them a blunder was that no one owned the composed
answer, so "how many hours is this student's day" had five right answers and no
true one. **When several engines can each adjust the same user-visible number,
one module must own it and the others must only read.**

---

## Incident #23 — one file, three walls: a rule written in N places drifts N−1 times (2026-08-06)

**What the user saw.** A buddy tried to send her real study-plan Excel to her
student in chat. Three failures in one evening, each behind the last:
1. ".xlsx files aren't supported" — the app allowlist had no spreadsheets.
2. "That upload didn't go through" — the app said yes, but the storage
   bucket's OWN `allowed_mime_types` (a second copy of the same rule) still
   said no; the PUT died at the bucket.
3. "That upload did not finish" — the byte sniffer (a third copy, in effect)
   required `[Content_Types].xml` in the first 512 bytes. Word writes files
   that way; the library that wrote this file put `xl/worksheets/sheet1.xml`
   first. A genuine file was rejected as a fake — and the server then
   discarded the stored object while the client kept retrying the dead path
   forever ("Ready to send" that could never send).

Earlier the same day, the identical shape: the chat API allowed caption-less
attachments while the DB CHECK constraint still demanded body text.

**The lesson.** When a rule must exist in code AND in config (a DB
constraint, a bucket setting, an external service), it WILL drift unless a
test ties the copies together. And a retry button must know whether the thing
it retries still exists.

**Teeth.** `chat-attachments.test.ts` asserts the newest bucket migration
names every MIME the app accepts; the sniffer parses zip structure instead of
assuming entry order, with the real file's bytes as a fixture; verify
failures return `attachmentGone` and the client re-uploads from the File it
still holds. `lib/timetable-apply.ts` exists so the timetable's two writers
(student upload, buddy editor) can never develop separate save semantics.

---

## Incident #24 — an instruction to a model is not a limit (2026-08-06)

**What the user saw.** A perfect 117-day Excel study plan repeatedly rejected
as "that doesn't look like a class timetable."

**What happened.** The extraction prompt said, clearly, "output blocks only
for the next 21 days." Gemini answered `is_timetable: true`, began emitting
perfect blocks — for ALL 117 days — hit `MAX_TOKENS`, and its truncated JSON
parsed as nothing. The polite request was ignored under exactly the load it
existed for. Found by live-firing the real file at the real API with the real
prompt — the reproduction took one run; the preceding theory-only fix had
already failed in production.

**The lesson.** Limits on model output are enforced on the model's INPUT, in
code. The model cannot overrun dates it never receives. Keep a salvage path
for truncated JSON anyway — dozens of complete objects should not be thrown
away over two missing brackets. And when an AI feature fails in production,
reproduce with the live-fire pattern (real artifact, real API, exact prompt)
before theorising; the harness is committed and key-gated
(`timetable-live-fire.test.ts`).

**Teeth.** `windowDatedSheets` (deterministic 3-week window, threshold 30
dated rows) + `salvageTruncatedJson`, both unit-tested against the exact
observed failure shapes, plus the real file as a fixture.

---

## Incident #25 — a rule the founder killed kept running in three other files (2026-08-07)

**Symptom.** The founder, seeing the Daily Pick dashboard say "needs N more
votes": *"I told you there is no cap for top pick — why are you still working
on minimum 5 cap."* Second time the same instruction had to be given.

**What happened.** On 29 Jul the founder replaced the graduation-bars model
(5-vote minimum, ≥85% → feature, 65–85% → archive, below → drop) with the
no-bar rule: votes ORDER the queue, they never gate it. The fix (`9aa8a12`)
rewrote the *pick* — and stopped there. The bars model kept living in three
other places: `community-recycle.ts` (expired items still judged against the
bars; under-5-vote items extended forever — the cap, live and gating),
`daily-pick-stats` + the founder dashboard (still narrating verdicts and
"needs N more votes"), and the challenges admin (still ranking by
`gradeSubmission`). To the founder, the dashboard IS the system — a dead
model still on screen is the cap still existing, and they were half right:
it wasn't just on screen, it was still archiving items off the ballot.

**The lesson.** Killing a rule means killing every surface that enforces OR
DISPLAYS it, found by grepping for the rule's names, not by fixing the file
the complaint pointed at. This is Incident #23's twin: a rule written in N
places drifts N−1 times — and a rule *deleted* in one of N places survives
in the other N−1. The checklist for retiring any rule: grep every identifier
of the old model, follow every import, and only then say it's gone.

**Teeth.** `gradeSubmission` / `MIN_VOTES_TO_JUDGE` / `FEATURE_BAR` /
`ARCHIVE_BAR` deleted from the codebase; expiry now means "ballot turn over"
(→ archived, still fully pick-eligible), never a judgment. Guard test
`community-no-bar.guard.test.ts` greps the tree for the dead identifiers —
reintroducing the model fails CI by name.

---

## Incident #26 — three planners, one Tuesday (2026-08-11)

**Symptom.** The founder put Home and the Whole Plan side by side, same
student, same date — 11 August:

```
Home        3 tasks   Editorial Reading 264m · Arrangements 198m · Percentages 198m
Whole Plan  5 tasks   RC 4h · Percentages 1h · Inequalities 2.5h · Arrangements 2h · Caselets 1.5h
```

*"There is exactly one planning authority in CareerRai. Home, today's API, and
Whole Plan are different views/materializations of that authority — not
different planners."*

**What happened.** There were three. Home and the 6am notification cron ran
`chooseSectionDay` — the two-clock authority built that morning to end the
Percentages loop. The Whole Plan ran `study-forecast.buildWeekPlan`, a wholly
separate scorer that sorted every remaining topic once and bin-packed the list
into days. The Blueprint's 7-day strip ran that second planner again. The day
SHAPE was doubled too: `generateRoutine` split its day inline (weak 40%, others
30% each), `plan-mix` split it by its own weights (weak ×1.6, VARC 0.8). And
`buildTopicChoices` existed twice, byte for byte, in `today/route.ts` and
`routine-plan.ts` — "kept in lockstep" by a comment that had already lost once,
having silently dropped `revisionSeason` from the cron's copy.

`full-plan.ts` even carried a comment saying `buildWeekPlan` was used "for
ORDER, not for day assignment… a second scoring model here would be the
two-models trap." The trap had already sprung; the comment described the wall
it was standing inside.

**The lesson.** Two planners cannot be kept "roughly in sync", and a comment
asking the next engineer to remember is not a mechanism. The only stable shape
is ONE authority plus VIEWS of it: today is day 0 of the projection, the
Blueprint strip is days 0-6, the Whole Plan is day 0 to CAT. Anything that
computes its own answer is a planner, however small — including a second
weights table for how a day splits.

The corollary the founder had already stated separately: a plan for 15 August
seen today must be the plan that arrives on 15 August. That is only possible
when the future is a PROJECTION of the same authority — pure, deterministic,
advancing exactly the state the live engine will advance — not a second
model's guess.

**What also changed, deliberately.** `checkPlanIntegrity` used to fail a 3h
student with "18 of 46 topics do not fit". Since the syllabus clock reserves
first contact structurally, every student now opens all 46 at every
commitment. The shortfall did not vanish — it moved to where it was always
true, and got its own check: `depth` says "every topic is on your plan, and you
are 230h short of finishing them". Coverage and depth are different promises;
collapsing them into one check had been hiding one of them.

**Teeth.** `lib/plan-projection.ts` is the one forward planner; `lib/day-topics.ts`
is the one today-planner; `routine-engine.dayShape` is the one day splitter;
`plan-mix.ts` is deleted. `planner-unification.test.ts` asserts the property,
not the implementation: Home's today equals the Whole Plan's day 0 (topics,
sections and block count, across three syllabus-target settings and both
archetypes); the Blueprint strip equals the Whole Plan day for day; five reads
of 15 August return one answer; the whole plan is byte-identical across calls;
46/46 holds through the whole-plan path for seven student profiles; and a
source-tree guard fails CI if any file outside the authority calls
`chooseSectionDay` / `chooseTopicForSection`, or if a second day-shape model
reappears.

---

## Incident #27 — the database moved, the code didn't (2026-08-11)

**Symptom.** Founder, 19:58: "still no name captured, what's the blunder" —
the Sales screen full of "New User · no phone" AGAIN, hours after #86 fixed
the signup race. Worse than before: the morning's nameless signups at least
had phone numbers; the afternoon's had neither.

**What happened.** Migration `20260810205901_subscription_free_not_beta` was
applied to the production DATABASE on 10 Aug 20:59 UTC — it rewrote every
`free_beta` row to `free` and tightened the CHECK constraint to reject
`free_beta`. But the CODE that stops writing `free_beta` lived on a branch
that never merged; main kept writing it on every new-student signup. From that
minute, every profile registration UPDATE/UPSERT bounced off the constraint —
and the whole row bounced with it: name, phone, email, signup_source, all in
one rejected write.

Two failures stacked. The `!existing` upsert branch DID check its error (the
#86 fix) and returned 500 — so the student retried, by which time the trigger
stub was visible, and the retry took the `isStub` branch instead. That branch
did NOT check its error. Silent failure, working session, nameless profile,
and onboarding answers saved fine by the later write that happens not to
include subscription_status. The fingerprint that cracked it: pain_points
saved + name/phone/source all empty = the registration write specifically
failed while the route otherwise ran.

Why the morning looked different: #86's one-time backfill (06:30 UTC) had
recovered phones from auth.users for everything signed up before it ran.
Everything after it had no backfill to hide behind.

**The repair.** Code now writes `free` everywhere (`verify-phone-otp`,
`verify-otp`, `auth/callback`) and every read surface expects `free`. The
`isStub` branch checks its error and fails loudly, exactly like the upsert
branch. Eight phones recovered from auth.users the same day. The eight names
are unrecoverable — they existed only inside the rejected UPDATE — and go
through the ask-name WhatsApp outreach.

**The lesson.** A migration applied from an unmerged branch is a loaded gun
pointed at main. Schema and code must move in the same deploy, or the DB
constraint becomes a silent kill-switch for whatever writes the old shape.
And an unchecked `.update()` error converts that kill-switch into weeks of
quiet data loss — the SAME lesson as #86, one branch further down.

**Teeth.** `subscription-states.guard.test.ts` (shipped with the account-types
work, extended here) pins the exact allow-list of the live CHECK constraint;
any source write of a status outside it — or any return of `free_beta` to
executable code — fails CI.

---


---

## Incident #28 — the Whole Plan re-rolled the day the student was holding (2026-08-12)

**Symptom.** Abhishek to his mentor, 08:43: "Bhaiye ye kal dikha rha tha …
aur aaj ye aaye hai today topics me." Yesterday's Whole Plan promised one
Wednesday; the 6am cron built another; and at 10:25 the Whole Plan showed a
THIRD list — including Caselets twice on one day (0.5h + 3h). Three surfaces,
three answers, one authority.

**Root causes (two).** (1) Deploy transition: his 11 Aug routine was built at
07:38 IST, BEFORE the planner unification deployed at 13:19 — so the evening's
projection assumed a day 0 that never existed and projected Wednesday from it.
(2) Structural self-poisoning: /api/plan/full fed the planner's memory the
latest 14 routine rows INCLUDING TODAY'S OWN ROW, so after the cron ran, the
Whole Plan read its own topics as "planned 0 days ago" and the repeat
cool-down pushed them off day 0. Home reads history only through yesterday.
Same authority, different memory — Incident #26's subtler cousin.

**The repair.** Today is a FACT: when daily_routines holds today's row, the
Whole Plan's day 0 IS that row (plan-projection `fixedTopics`, full-plan
`todayPlan`), the memory sees only days before today, and the projection
advances FROM the fact. Agreement with Home by identity, not by resemblance.

**Teeth.** planner-unification.test.ts: "today is a fact" suite — frozen day 0
survives poisoned memory verbatim, day 1 never echoes day 0 wholesale, the
never-twice-in-a-day guard covers fixed days, and the pre-6am fallback still
plans.

---

## Incident #29 — git reset --hard destroyed a verified change pre-commit (2026-08-12)

**Symptom.** Commit 215bdc5 "Exam calendar shared with Home" shipped ONE file:
the orphan module. All wiring — the calendar claim in generateRoutine,
full-plan's delegation, three test files, the CODEMAP note — was missing from
main for a day while the founder was told the gap was closed.

**Root cause.** The agent's commit chain ran `git checkout branch && git reset
--hard main` against a working tree whose edits were NOT yet committed. The
reset destroyed every tracked-file edit; only the untracked new module
survived, which made `git add -A && git commit` look successful. Tests had
been run BEFORE the reset — the pushed tree was never re-verified. A second
occurrence in the same session (the Meta CAPI edits) was caught immediately
only because that commit came out "nothing to commit".

**The lesson.** Never run a destructive git step against an uncommitted tree;
verify the COMMIT (git show --stat + content grep), not the working copy; and
"tests passed" is a statement about a tree, valid only for the tree that
ships. The same lesson as #27 — a silent failure between a success message
and reality — executed by the agent itself this time.

**Teeth.** Recovery commit f092e82 verifies content inside the committed tree
in-command. Session rule (AGENTS.md hygiene section, and this entry): commit
first, move branches second; any reset --hard must be preceded by
`git status --short` showing a clean tree.

---

## Incident #30 — the daily log rejected fractional hours (2026-08-12)

**Symptom.** 22:53 IST, a student marked one task "Done" and one "Half",
pressed **Save log**, and got "Internal server error". They pressed it again —
roughly 25 times in two minutes, every one rejected. The founder caught it from
a screenshot, not from an alert.

**Root cause.** `daily_reports.study_duration` is NUMERIC and has always
accepted decimals. The RPC that writes it, `upsert_log_and_streak`, declared
`p_study_duration INTEGER`. **The function contradicted its own table.** A
"Half" task produces fractional hours (4.6, 2.8), so Postgres refused with
22P02 at the door. Every student who ever half-completed a task hit this.

**How it hid.** The log path has no test that sends a decimal, and the two
types sat in different places — a column definition and a function signature —
that nothing compared. Three decimal logs exist historically, written before
the RPC was introduced, which is why the column was right and the function
was wrong.

**The fix, and the fix NOT taken.** `Math.round()` in the route would have made
the error disappear and quietly lied about how long a student studied. The log
is sacred (Learning OS: never punished, never falsified), so the PARAMETER TYPE
was corrected instead — dropped and recreated as NUMERIC in one transaction,
body byte-identical, ACL restored explicitly because DROP takes grants with it
and a fresh CREATE grants PUBLIC by default (Incident #14's lesson, applied
pre-emptively this time).

**Lessons.**
1. A column type and every function parameter that writes it are ONE decision.
   Split across two places, they drift, and the drift surfaces as a 500 on a
   student's phone at 11pm.
2. When a type error meets a value the product legitimately produces, fix the
   type — rounding is data loss wearing a fix's clothes.
3. Twenty-five retries and no alert. The core action deserves an alarm.

**The alarm, added the same night.** The founder's standing rule — "alert me
always if I face any errors" — had no mechanism behind it for server errors.
Now the three sacred actions (logging, paying, signing up) record their 500s
to `client_errors` (source='server'), `findSacredFailures` detects two failures
of one action inside fifteen minutes, and the existing founder-alert cron
escalates it as critical. On 12 Aug it would have fired ~20 seconds in, not the
next morning. `sacred-failure.test.ts` replays that night and asserts it fires,
plus the noise cases where it must stay silent.

**Teeth.** `log-hours-decimal.guard.test.ts` pins the shape of the fix: the
route sends hours unrounded, the migration declares NUMERIC and DROPs the old
integer overload (leaving both would let Postgres still pick the broken one),
and it restores the grants the DROP removes. Verified in production: the RPC
called with 4.6 stores 4.6, one function version present.

---

## Incident #31 — a paid ₹299 student fell out of the lifecycle and nothing was wrong (2026-08-24)

**Symptom.** Dhruv Vakadia paid ₹299 at 18:34 IST on 24 Aug. The credit was
minted 14 seconds later. Then nothing: no mentor, no session, no reminder, for
**24 hours**. He was rescued ~5h later only because a human used `retry_unlock`
— a manual admin tool — which unstuck him and granted `is_premium: true` as an
undocumented side effect. Scheduling happened as *text in a chat* ("Scheduling
for 8 pm"), so no session row existed, so no reminder fired, so he missed it
and the conversation moved to WhatsApp.

**Root cause — and it is not a bug.** Every row was valid. The ledger balanced.
`session_credits.status = 'paid'` means BOTH "the money just arrived, all is
well" and "the money arrived a day ago and nobody ever came." One state,
two opposite realities, and no column anywhere that answered the only two
questions that matter when a student is stuck: **who owns this, and what has to
happen next.** The schema had no way to *say* a credit was in trouble, so the
system could not report a failure it was structurally unable to name.

**How it hid.** Perfectly. There was nothing to hide — no error, no exception,
no failed job. The forensic pass found the deeper shape: in this database's
entire life there had been **2 credits and 18 video_sessions, with 0 sessions
ever linked to a credit and 0 ever completed.** `session_credits.video_session_id`
had never once been non-null in production. Two partial indexes existed,
purpose-built for the orphan query — with no reader. The machinery to notice
had been built and never wired up.

**What the investigation got wrong first, and what corrected it.** Phase 1
inferred a missing-integrity gap from a nullable column *without first reading
`session_credit_coherent_guard`*. About 80% of the integrity was already
built. Probing the database — 14 adversarial writes against real fixtures —
found **9 of 13 attacks already refused**. The planned migration shrank to
roughly 40% of what the architecture phase implied. Reading a schema is not
knowing what it enforces; only attacking it is.

**The fix.** `20260826b_session_lifecycle_ownership.sql`. Two states the
lifecycle could not express (`assignment_failed`, `booking_blocked`); five
operational columns (`owner` as a four-value enum, `next_action` as deliberate
free text, `failure_reason`, `failure_at`, `last_attempt_at`); four new rules
**appended to** the existing coherence guard, which stays the authority; one
CHECK making owner and next_action inseparable; the video-session FK hardened
from SET NULL to RESTRICT. Preceded by `20260826a_session_credits_parity.sql`,
because the test database was missing five of nine constraints and
`student_payments` had **no primary key** — the seventh prod/test divergence
this repo has logged, and one that would have let every probe "pass" against a
schema physically incapable of refusing.

**The fix NOT taken.** A new table, a new dashboard, or a second trigger for
the credit↔session relationship. Two pointers that can disagree is worse than
one pointer that can be null. The founder's constraint held the design down:
*extend the guard, never replace it.*

**Lessons.**
1. A state machine that cannot NAME a failure will never REPORT one. "Paid" and
   "paid, and abandoned" are different facts and need different names.
2. Work that is visible and unowned is indistinguishable from work that is
   done. `(owner IS NULL) = (next_action IS NULL)` is now a database
   constraint, and probe #22 replays Dhruv's exact shape against it.
3. Manual admin tools with side effects are how a boolean nobody can account
   for ends up on a student's row. Recovery must be an operation, not a flip.
4. An index with no reader is not preparation; it is a decision someone forgot
   to finish.

**Teeth.** `supabase/tests/session_credit_lifecycle_probes.sql` — 30 probes, 22
attacks and 8 legal shapes, run against the real database and raising if any
misbehaves. Every new rule was proved non-vacuous by removing it: with the
guard disabled, probes 16/17/18/20/25/27/30 all become ACCEPTED; with the CHECK
dropped, 21/22/23/28 become ACCEPTED; with the FK back to SET NULL *and* the
guard disabled, deleting a linked session is ACCEPTED and silently orphans the
credit. The verdict block was itself proved non-vacuous by feeding it a false
expectation and confirming it raises.

---

## Incident #32 — the test database is a scaffold, not a replica (2026-08-26)

**Symptom.** A Phase 2C probe asked whether a student with a live session can
book a second one with the same mentor. Production says no — `one_live_session_
per_pair` is a unique index, and Incident #21 is why it exists. The probe came
back **`booked`, sessions=2**. The code was correct. The test database had no
such index.

**Root cause.** `careerrai-test` was stood up on 22 Aug to reproduce one React
error and was never a copy of production. Counting constraints + indexes +
triggers per table across both:

| table | production | test (before) |
|---|---|---|
| `video_sessions` | 25 | 11 |
| `student_payments` | 11 | 5 |
| `profiles` | 36 | 2 |

and 76 of production's 91 tables had **no** constraints on test at all. Phase 2A
had already found this class once and fixed `session_credits` — including a
`student_payments` table with no primary key — but fixed only the table it was
looking at.

**How it hid.** By passing. A probe fired at a schema that cannot refuse always
returns "accepted", which reads identically to "the code allowed it". Every
green probe on a divergent table is a certificate for a hole.

**The fix.** `20260826d_booking_chain_parity.sql` restores video_sessions and
student_payments verbatim from production's `pg_get_constraintdef()`/`indexdef`
output, md5-verified byte-for-byte afterwards. `profiles` is left divergent and
logged rather than silently skipped — 34 objects governing role, premium and
allowlist deserve their own pass, not a footnote in a booking migration.

**A detail worth keeping.** Two CHECKs and one index were semantically correct
but rendered differently by `pg_get_constraintdef()` because the cast was
written per-element instead of per-array. Byte-identity matters here: the whole
point of a fingerprint comparison is that a future divergence stands out, and a
permanent cosmetic difference trains you to ignore it. Written as
`array[...]::character varying[]` so the two databases render identically.

**Lessons.**
1. Before probing a table, prove the table can refuse. Compare the schema
   first; a probe suite's first assertion should be about the schema, not the
   data.
2. Parity is per-chain, not per-table. Phase 2A fixed the table it was staring
   at and left the one next to it.
3. "We have a test database" and "we have a replica" are different claims. Say
   which one is true.

**Teeth.** A per-table object count and an md5 fingerprint of every constraint,
index and trigger, run against both databases. Any table can now be checked in
one query instead of discovered by a failing probe.

**The full inventory, taken 26 Aug** (`docs/SCHEMA-PARITY.md`): every one of
production's 94 tables EXISTS on test — nothing is missing by name, which is
why this hid so long. But 79 of them carry **zero** integrity objects, and 80
of 95 tables on test have **no primary key**. 498 production objects absent.
Nine tables are byte-identical; six are partially enforced. A test fired at one
of the 79 cannot fail on an integrity rule, because there is none to fail.

---

## Incident #33 — `revoke from public` did not revoke it (2026-08-26)

**Symptom.** The Phase 2C migration created `book_session_credit()` — a
SECURITY-sensitive RPC that books a paid ₹299 session — and carefully revoked
it: `revoke all on function ... from public`. The comment above that line
explained, correctly, that PostgREST exposes every public function at
`/rest/v1/rpc/` and that leaving it open would let any logged-in student book
against a credit they did not pay for.

Probe 13 then reported: **`anon=true authenticated=true`.**

**Root cause.** Supabase ships `ALTER DEFAULT PRIVILEGES` that grant EXECUTE on
new functions in `public` to `anon`, `authenticated` and `service_role`
**explicitly**. An explicit grant to a role is not touched by a revoke from
PUBLIC. The revoke succeeded and changed nothing.

**How it hid.** It didn't — for one turn. The hole existed underneath a comment
describing the hole. What caught it was that the probe tested the *actual
privilege* with `has_function_privilege()` rather than asserting that the
migration file contained the word `revoke`. A source-reading guard would have
passed on the broken version.

**The fix.** `revoke all on function ... from public, anon, authenticated;`
then `grant execute ... to service_role;`. Verified with
`has_function_privilege()` on all three roles, and pinned by a guard test that
requires the roles to be named.

**What the sweep found.** 206 of production's 224 public functions are
executable by `authenticated`. Almost all are `btree_gist` internals or trigger
functions, which PostgREST will not call. The real list of app-owned,
student-callable, non-trigger functions is four — and one of them,
**`claim_lead`, is SECURITY DEFINER and lets any caller reassign lead ownership
for any student**. Reported to the founder; not fixed here, because it belongs
to the sales CRM and not to a booking migration.

**Lessons.**
1. Test the privilege, not the DDL. `has_function_privilege()` is one line and
   it is the only thing that knows the truth.
2. On Supabase, a new function in `public` is world-callable until three roles
   are named. `from public` is not one of them.
3. Every SECURITY DEFINER function is an API endpoint. Count them deliberately.

---

## Incident #34 — `claim_lead` is SECURITY DEFINER and callable by anyone (2026-08-26, OPEN)

**STATUS: OPEN. Reported, not fixed.** Found while sweeping function grants for
Incident #33; deliberately NOT patched inside the booking migration, because a
security fix smuggled into an unrelated change is a fix nobody reviewed.

**What it is.** `public.claim_lead` is `SECURITY DEFINER` — it runs with the
definer's rights, bypassing RLS — and both of its overloads are executable by
`anon` and `authenticated`. PostgREST exposes it at `/rest/v1/rpc/claim_lead`.
Anyone holding the public anon key can therefore reassign ownership of any
student lead to any owner, by student id, without being logged in as anybody.

**Two overloads, and the older one is the worse one:**
- `claim_lead(p_student_id uuid, p_owner_id uuid)` validates that `p_owner_id`
  is a `sales` or `admin` profile. It does not validate the CALLER.
- `claim_lead(p_student_id uuid, p_owner text)` validates only that `p_owner`
  is a non-empty string. Any text becomes an owner.

**Blast radius.** `lead_outreach` is the sales CRM's ownership table. Rewriting
it does not touch student data or money, but it can silently reassign the whole
pipeline, misdirect follow-ups, and corrupt every ownership-based report. It is
also a write path that leaves no trace of who called it.

**Why it was invisible.** Nothing in the repo asserts who may execute a
function. Guard tests read source; grants live in the database. The sweep that
found it counted 206 of 224 public functions executable by `authenticated` —
almost all `btree_gist` internals and trigger functions that PostgREST will not
call. Filtering to app-owned, non-trigger, student-callable functions leaves
four: `claim_lead`, `is_admin`, `refresh_buddy_demo_account`,
`refresh_review_account_logs`. Only `claim_lead` both mutates business state
and accepts caller-controlled targets.

**The fix when it is scheduled** (not applied): revoke from `public, anon,
authenticated` and grant to `service_role` only — naming the roles, per
Incident #33 — then drop the `text` overload, which no current caller needs.
Both changes belong to the sales workstream with its own review.

**Lesson.** Every SECURITY DEFINER function in `public` is an unauthenticated
API endpoint until proven otherwise. The repo needs one test that enumerates
them and fails on any that is callable by `anon` — a list, not a per-function
assertion, so a new one cannot be added quietly.

---

## Incident #35 — the deploy that took the whole site down (2026-08-26)

**Symptom.** Every request to careerrai.in returned **HTTP 500** — homepage,
`/api/version`, `/api/events/track`, `/admin/log-breakers`, all of it. Not a
route bug: the failure was in middleware, so nothing downstream ever ran.
Runtime logs, one line repeated across every path:

```
Error running the exported Web Handler:
  Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
```

**Root cause.** `.github/workflows/vercel-deploy.yml` built the app **on the
GitHub runner** and shipped the finished artifact with
`vercel deploy --prebuilt --prod`. A runner build only knows the environment
that `vercel pull` handed back, and `vercel pull` did not return
`NEXT_PUBLIC_SUPABASE_URL`. `NEXT_PUBLIC_*` values are **inlined at build
time**, so the empty string was baked into the middleware bundle permanently.
Vercel's own builder never sees this failure mode — it builds with the
project's real production environment — which is why the identical commit
built by Vercel (`dpl_Br1rdR…`) served 44 requests, all 200, while the runner
build of the same commit (`dpl_7nrA6n…`) 500'd everything.

Nothing caught it. The build succeeded. The deploy succeeded. The workflow
went green. **A green deploy is not a working site.**

**Cost.** Full outage, 874 students, 12:18–12:27 IST (06:48–06:57 UTC), about nine
minutes. The migrations applied
just before it (`20260826b/c/h/i`) were not implicated and did not need
reverting.

**The second trap, found during recovery.** The first recovery attempt was an
empty commit pushed to `main` to make the Git integration rebuild. Vercel
**cancelled** it. The project has an *Ignored Build Step*:

```sh
main) git diff --quiet HEAD^ HEAD -- ':(exclude)docs' ':(exclude)*.md' \
        ':(exclude)e2e' ':(exclude)*.test.ts' ':(exclude)*.test.tsx' || exit 1; exit 0;;
```

Commits touching only docs, markdown or tests are cancelled by design. This is
also the real explanation for the long-held belief that "the Vercel webhook is
dead for this repo" — it was never dead. Doc-only commits were being cancelled
exactly as configured, and the fallback workflow was built to work around a
problem that did not exist. Recovery only worked once the pushed commit
touched real source.

**Prevention (in the same commit as this entry).** Two guard steps now sit
between `vercel pull` and `vercel deploy` in the fallback workflow:

1. **Before the build** — assert `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` each appear
   with a non-empty value in `.vercel/.env.production.local`. Vercel withholds
   variables marked *Sensitive* from `vercel pull`, and a missing one must stop
   the run, not silently produce a broken bundle.
2. **After the build** — parse the Supabase host out of that file and `grep`
   for it in `.vercel/output`. If the built artifact never mentions the host,
   the URL was not inlined and the deploy is refused.

Guard 2 was proven non-vacuous before shipping: with the host absent from the
output it fails, with the host present it passes.

**Standing rules.**
- **The Git integration is the deploy path.** The runner workflow is a
  fallback for when it genuinely cannot run, and it is now the only path with
  guards precisely because it is the one that can lose the environment.
- **A doc-only commit will never deploy.** That is configuration, not a fault.
  Do not push empty commits expecting a build.
- **Verify the site, not the pipeline.** After any production deploy, fetch a
  real URL and read the status code. `careerrai.in` is unreachable from the
  agent sandbox (network policy denies CONNECT), so use the Vercel MCP
  `web_fetch_vercel_url` tool, or check runtime logs grouped by status code.

---

## Incident #36 — a cancelled session welded the ₹299 to a booking that would never happen (2026-08-27)

**Severity:** P0 (Trust). Money paid, delivery failed, entitlement unreachable.

**What happened.** `session_credit_coherent()` rule (5) forbade a credit from
ever changing its linked session, and rule (8) forbade `booking_blocked` from
holding one. Both rules were individually correct. Together they left a credit
whose session was CANCELLED with no exit at all:

- it could not be relinked to a new session (rule 5)
- it could not fall back to `booking_blocked` (rules 5 + 8)
- `sessions/schedule` read `video_session_id` as set and answered "already
  booked", pointing the student at the cancelled session
- `hasOpenSessionCredit()` counted it as open, so they could not buy another

The student had paid, their mentor had cancelled, and the only recovery was a
manual refund that the student had to notice was owed and go ask for.

**Why nobody saw it.** 20260826b's own comment named it and deferred it:
*"Phase 3's problem, not a state to fake here."* That was honest at the time —
nothing had been cancelled yet, so the trap had never been sprung. The comment
then aged into permission. **A deferred defect with no owner and no date is not
deferred; it is accepted.**

There was also no terminal writer at all: nothing in the codebase ever moved a
credit to `completed`. The state machine had a start and no end.

**The fix.**
- `settleCreditForSession()` (`src/lib/session-credit.ts`) — the single writer
  that closes a credit. `completed` on delivery; on cancel/expire it releases
  the credit into `booking_blocked` with `owner`, `next_action`,
  `failure_reason` and `failure_at`, guarded on the credit's prior status so a
  double-settle cannot fire twice. It never throws: a settlement failure must
  not roll back the cancellation the student already saw.
- `20260827a_session_credit_recovery.sql` — the narrowest possible relaxation
  of rule 5. Written as `if not (<all three preconditions>) then raise`, so it
  fails CLOSED: release only, into `booking_blocked` only, and only when
  `video_sessions` (the delivery authority, re-read inside the trigger) says
  the session is `cancelled` or `expired`.

**How it was proven.** Applied to careerrai-test only. Ten-case adversarial
matrix run with fixtures created and rolled back inside one transaction (both
tables verified back to zero rows): the two legal releases and the subsequent
rebook were ALLOWED; relink, release-while-scheduled, release-after-completed,
unlink-into-`paid`, release-without-owner and blocked-while-still-linked were
all REFUSED. Non-vacuity: the same legal release, run against production's
current rule 5 restored into the test DB, was REFUSED.

**Schema-parity lesson, and a correction to Incident #32.** The test DB's
`pg_get_functiondef()` md5 differed from production's, which under #32's rule
means "your test result is worthless". Comparing the two bodies showed the
entire difference was `--` comments. Comment-stripped and whitespace-
normalised, both hash to `5eacc10fecbdc6f8a67bab22fa128fed`. **#32's discipline
is to prove the schemas match, not to compare hashes — a raw hash mismatch is
where the investigation starts, not where it ends.** The same normalisation,
with the rule-5 block excised, hashes to `69c4e5877914907e1a4f4499c17ad5f9` on
both sides after the migration, which is the actual proof that rule 5 is the
only thing that changed.

**Encoded with teeth.** `src/lib/session-credit-release.guard.test.ts` reads
the NEWEST migration defining the function — not a pinned filename — and fails
if any one of the three preconditions is deleted or the `if not (...)` shape is
flipped to fail-open. Both mutations were run and both failed the guard.
`session-assignment.guard.test.ts`'s rule-5 row was relabelled, because it
reads a superseded migration and would otherwise have stayed green while the
live behaviour changed.

**MIGRATION NOT APPLIED TO PRODUCTION.** It ships with the branch and needs
explicit founder approval.

---

## Incident #37 — the Daily Insight repeated for days (2026-08-27)

**Severity:** P1 (Learning). The product's core daily intelligence looked dead.

**What happened.** The founder saw the identical "23 topics done / 23 to go"
card for several consecutive mornings. The suspicion was frozen state or a
stuck cron. It was neither.

`loadSuppressedInsightKeys()` read the last-shown ledger with a lower bound
only: `last_shown_on > cutoff`. Today's own row satisfies that. So the moment an
insight was shown, it suppressed itself. Home records a show on EVERY server
render, so each visit re-ran the selection against a set that had just grown by
one — four or five visits in a morning drained a candidate pool of one to three
items, and what survived was the suppression-EXEMPT `progress` fallback, whose
numbers come from `topic_coverage` and genuinely do not move for days.

**The lesson.** *A "recently shown" filter must exclude the window it is
selecting FOR.* The bug is not that the insight was suppressed; it is that the
suppression window and the selection window overlapped, so the act of selecting
changed the input to selection. Any read-then-write loop where the write
becomes the next read's input needs its boundary written down explicitly.

Second lesson: **the fallback hid the failure.** A rotation that silently
degrades to an exempt static card looks like a working feature showing
unchanging data. If a selector falls back, that fallback needs to be visible in
telemetry, or the failure is indistinguishable from the truth.

**The fix.** One added bound — `.lt('last_shown_on', today)` — plus
`src/lib/daily-insight-rotation.test.ts`, which spies on the FILTERS the query
applies rather than the rows it returns, because the filters are where the bug
lived. Removing the bound makes the boundary test fail.

---

## Incident #38 — a task id means nothing without its day (2026-08-27)

**Severity:** P1 (Learning). A live, shipped insight named topics students had
not studied, and then silenced the real ones for a week.

**What happened.** `computeDailyInsight()` builds a `task_id → {topic, section}`
map from the served routines, then resolves each completion through it. The
planner REUSES task ids across days. In one production week (17–23 Aug) 362 ids
repeated, and **314 of them carried a different topic on different days**. Keyed
by id alone the map was last-write-wins, so **135 of 190 completions — 71% —
resolved to a topic the student had not worked on.**

Two consequences, and the second is worse:

1. the sentence named the wrong topic — the RECOVERY rule congratulating a
   student for beating "Algebra" when they had never opened it;
2. the suppression identity is `kind:subject`, so a wrong subject **suppressed
   the wrong insight for seven days**. The student stopped hearing about a real
   gap because we had recorded a fictional one.

**Why it survived.** Section attribution was unaffected — zero ids conflicted on
section — so every section-level number on every surface looked correct. The
only wrong values were topic names, which nobody can verify by eye. *A bug that
corrupts only the labels, never the counts, is invisible to every check that
looks at counts.*

**How it was found.** Not by reading the code. A production sanity check on the
new Weekly Insight returned by-section totals of 145 against 25 completions —
a fan-out in the verification SQL, not in the engine. Chasing why the SQL
fanned out is what surfaced the id reuse, and the engine's own map turned out
to have the mirror-image flaw. **The discrepancy that exposes a defect is often
in the checking tool, not the system; investigate it anyway.**

**The fix.** Both engines key the map by `(routine_date, task_id)` — the pair
that is actually unique — via a shared `metaKey()`. `daily-insight.ts` and
`weekly-insight.ts` were changed in the same commit; the new Weekly Insight had
inherited the bug by copying the pattern before it was known to be wrong.

**Encoded with teeth.** `src/lib/insight-task-attribution.test.ts` drives both
engines through a fixture where one id carries three different topics across
three days. Reverting `metaKey` to id-only fails both tests.

**Test-discipline lesson, paid twice in one day.** The first version of the
daily test PASSED with the fix reverted: the conflicting routine sat in the
middle of the fixture array, so last-write-wins happened to land on the right
topic. The conflicting day now sits LAST, so the two keyings genuinely diverge.
This is the second vacuous assertion caught by mutation in this session — the
other hid behind `if (status === 'ready')` on a fixture that never reached
`ready`. **Both were written by the same person who wrote the fix, and both
passed on the broken code. A test is not a test until it has been seen to
fail.**

## Incident #39 — the guard read one of the two routes it named (2026-08-27)

**Severity:** P1 (Trust). A mentor was told a booking failed that had happened.

**What happened.** `calendar/schedule-meeting` and `calendar/reschedule-meeting`
each ran `await dispatch(...)` bare, inside the route's single `try`. A
transport failure therefore fell through to the outer `catch` and answered the
mentor with `500 "Couldn't create the session"` — for a session already
committed by the insert above it. The mentor retried, hit the `session_exists`
refusal, and held two contradictory answers about one booking.
`rememberIdempotent()` sat below the dispatch and never ran, so the replay
record that exists to make the retry safe was never written. The student's
notification was lost with no retry path.

**Why nobody saw it.** `session-booking-notified.guard.test.ts` named both
booking routes in `BOOKING_ROUTES` — and then ran four of its six assertions
against a hardcoded `sessions/schedule/route.ts`. The sibling route was checked
only for "the token `dispatch(` appears somewhere in this file". Assertion (5),
*notification failure can never fail a committed booking*, is the exact rule
that was being broken, and it never ran on the file that broke it.

Worse, (5) could not have worked where it was pointed even if it had run: it
matched `catch (...) { ... console.error }` at FILE level, and every one of
these routes has an outer `catch (error) { console.error(...) }`. The
assertion was satisfied by the very handler whose catch was the problem.

**The lesson.** *A guard's route list is not its scope.* Reading a file name in
a table at the top of a guard tells you nothing about which assertions run
against it. And **a structural assertion about error handling is meaningless
without a scope** — `catch` and `console.error` exist in almost every route, so
matching them anywhere in the file is close to matching nothing. Both
assertions here are now evaluated inside the notifier's own function body,
found by brace-matching.

**The fix.** Each route owns a notifier (`tellTheStudent`,
`tellTheStudentItMoved`) shaped like the one that was already correct,
`tellBothParties`: try/catch, log, never rethrow. The guard now runs every
assertion over every route in its table, adds `reschedule-meeting` to it, and
adds a rule the old guard had no way to express — **no bare `dispatch(` may
survive in the handler**, where the outer catch makes a transport failure fatal
to a write that already committed.

**How it was proven.** Three mutations, each run against the rewritten guard:
restoring the inline dispatch (the original defect) failed 2 assertions;
removing the notifier's try/catch failed 1; deleting the notifier call while
leaving the function defined failed 1. Baseline green before and after, file
byte-identical.

A fourth mutation was caught by the guard's own construction rather than by
intent: anchoring "notified before success" on `NextResponse.json(payload)`
matched the `already: true` REPLAY return, which must NOT notify — a
double-submit re-telling the student is a different defect. The anchor now
names the new-booking success specifically.

---

## Incident #40 — the rules were real, and attached to the wrong verb (2026-08-27)

**Severity:** P1 (Trust). Sessions could be moved outside a mentor's week.

**What happened.** `calendar/reschedule-meeting` wrote a new `scheduled_at`
after validating three things: that the timestamp parsed, that it was in the
future, and that the duration was one of 20/30/45/60. It never read
`buddy_availability`, never generated slots, and never checked time off. A
mentor could move a student's session onto a day they do not work, to 3am, or
into their own holiday, and nothing refused it.

**Why nobody saw it.** The table looked guarded, and half of it was. Two
triggers sit on `video_sessions`, and only one reaches an UPDATE:

```
set_video_session_span                   before insert OR UPDATE OF
                                         scheduled_at, duration_minutes,
                                         buddy_id   → the GIST exclusion still
                                                      refuses a double-booking
                                                      on a reschedule.
video_session_within_availability_guard  before INSERT      ← only
                                         → work days, hours and time off are
                                           never re-read when a session MOVES.
```

So double-booking — the failure everyone thinks of first, and the one that
would have been noticed — was covered the whole time. That is precisely what
made the uncovered half invisible: a reschedule that collided with another
session WAS refused, so the path looked defended.

**The lesson.** *Coverage is per-verb, not per-table.* A constraint that fires
on INSERT protects rows that are created, not rows that are changed, and the
two are different populations. When reviewing an invariant, read the trigger's
event list, not its name. **Half-covered reads as covered** — the rule that was
enforced supplied the confidence that the rule that was not enforced borrowed.

**The fix — one line, in the trigger.** The function was never wrong. It reads
nothing but `new.*` and returns `new`, so it was always correct on an UPDATE and
was simply never called on one. `20260827c_availability_on_update.sql` changes
the trigger's event list and nothing else:

```
before insert
  →  before insert or update of scheduled_at, duration_minutes, buddy_id
```

Proof that only the trigger moved, rather than an assurance that it did: the
normalised md5 of `video_session_within_availability()` is
`9f5965f220431a1c15fbe4b21cd792d1` on production and on careerrai-test, both
before and after the migration.

**The column list is load-bearing.** A bare `or update` would fire on every
write to the row, including the status transitions that end a session's life. A
6pm session completed at 7:05pm is normal and would have begun raising
`check_violation` on a row nobody was rescheduling. Scoped to the three
scheduling columns, the trigger fires only when the session is actually MOVED —
mirroring `set_video_session_span` directly above it. The writer inventory says
what that costs: of every `.update()` against video_sessions in the codebase,
exactly ONE sets any of those columns, and it is the defective route.

**A first attempt solved this in the application and was thrown away.** It
re-checked availability inside `reschedule-meeting` through a new
`offeredSlotProblem()` helper. It worked, and it was wrong: it made the mentor's
week answerable in two places, which is Incident #23 waiting to happen. The
founder's call — enforce at the single existing authority — deleted more code
than it added. **When a rule already exists and is merely mis-scoped, widening
its scope beats re-implementing it upstream.**

Removing that helper exposed a consequence worth recording. With the check gone
from the route, the legacy Google-calendar move ran BEFORE the database could
refuse, so a rejected reschedule would have left the mentor's calendar sitting
on a time the database had just declined — Incident #17 arriving from the
opposite direction. The calendar sync now runs AFTER the row is committed, and a
calendar failure can no longer refuse a move that already happened; it is logged
and audited as `google.api_error` instead.

**How it was proven.** `supabase/tests/reschedule_availability_probes.sql`:
seven probes on careerrai-test, inside one block that raises at the end so every
fixture rolls back. A valid reschedule is allowed. A non-working day, a time
outside hours, mentor time off, and a lengthened session that overruns closing
time are all refused. A non-scheduling write (title, status) is unaffected. A
mentor with no availability row is unaffected, as documented.

Non-vacuity, and the only result that really matters: with the trigger reverted
to `before insert` — production's shape today — the Sunday move was **ALLOWED**
and `scheduled_at` became 2026-08-30, a day the fixture mentor does not work.
The defect reproduces on demand.

---

## Incident #41 — the mentor could give away the thing the product sells (2026-08-27)

**Severity:** P0 (Trust, money). A paid session delivered against no payment.

**What happened.** `grep -c session_credits` in
`calendar/schedule-meeting/route.ts` returned **0**. The mentor-initiated
booking path inserted a `video_sessions` row directly and never touched the
ledger. So a mentor could book the very session a student had paid ₹299 for,
and the credit never learned about it: it stayed `status='paid'` with
`video_session_id` null while the session it bought went ahead.

Both halves then compound. `hasOpenSessionCredit()` still counted the credit
open, so the student could not buy another — they had paid, attended, and were
now blocked from purchasing again by the entitlement they had already consumed.
And any count of "sessions paid for" and "sessions delivered" disagreed with no
row anywhere being wrong.

**Why nobody saw it.** This is Incident #31's shape exactly — *a paid student
fell out of the lifecycle and no row was wrong* — and it was missed for the same
reason: every individual record is valid. There is no failing query to find,
because the defect is a JOIN that nobody performs. The route also looked
complete: it validated the mentor, the student's assignment, the duration, the
slot, and the free-orientation allowance, and notified the student correctly.
The one thing it did not do was the one thing nothing displays.

An earlier pass over this route reported it as "notification-correct, credit
gap" — and got the notification half wrong too (Incident #39). Both errors came
from asserting behaviour from the presence of a name in a file rather than from
reading the call, which is Law L2.

**The founder's rule (27 Aug), and the correction that sharpened it.** The first
reading was "guidance costs a credit", and it shipped a 409 for a student who
had none. The founder narrowed it: the rule protects a PAID ENTITLEMENT, it does
not price the session. *If the student holds an applicable paid credit, a
mentor-initiated booking must consume it. If they hold none, the mentor's free
booking is exactly what it always was.* Orientation never consumes one either
way — spending ₹299 on the session we advertise as free is the same defect
wearing the opposite sign.

That distinction is the lesson: **the defect was never that mentor sessions were
free, it was that the path a booking arrived through could bypass an
entitlement.** Where there is no entitlement, there is nothing to bypass.

**The fix.** Orientation, and guidance for a student holding no credit, keep the
direct insert this route has always used. Guidance for a student who holds one
goes through `book_session_credit()` — the RPC that already locks the credit,
inserts the session, links it and moves the state in ONE transaction, and that
writes the same eight columns the direct insert does. Inventing a ₹0 credit so
the free path could share that writer was rejected: it would put a row in the
ledger that every revenue count then has to special-case.

**NO SECOND WRITER.** A credit-linking path written in TypeScript beside the one
in plpgsql is Incident #23 aimed at money. `p_expected_buddy_id` is the booking
mentor, so a credit assigned to someone else is refused by the database rather
than by a check here that can drift out of step with it.

**One distinction that is easy to lose and expensive to lose.** "We could not
read the ledger" is not "this student owns nothing". Collapsing them hands out a
paid session on a dropped connection — and it becomes reachable the moment
no-credit stops being a refusal and becomes a fall-through. A credit read
failure is a 503 that books nothing, with a test and a mutation holding it
there.

**Settlement needed no change, and that was verified rather than assumed.**
`settle()` finds the credit with `.eq('video_session_id', sessionId)` and never
learns who wrote the link, so a mentor-linked credit completes, releases and
refuses to double-settle identically to a student-linked one.

**How it was proven.** Eleven behaviour tests through the real `POST` handler,
including: no credit falls back to the free booking; a credit READ FAILURE does
not; a refused RPC never becomes a free session; `mentor_changed` never becomes
a free session; two simultaneous attempts report one session and notify once;
orientation never calls the RPC. Four mutations, all caught — removing the credit
call (the pre-fix route, 10 failures), treating an unreadable ledger as
no-credit, letting a refusal fall through to a free session, and making
orientation consume a credit.

**Cross-path parity is now held by a test, not by inspection.**
`booking-paths-parity.behaviour.test.ts` drives both doors against the same
credit: both call the same RPC with the same entitlement arguments, neither
writes video_sessions directly while a credit exists, and settlement cannot tell
them apart. It also surfaced a difference the database erases — the student path
omits `p_session_type` and relies on the RPC's `default 'guidance'` while the
mentor path passes it explicitly. Both write 'guidance', so the test normalises
through the declared default rather than comparing the raw call: comparing raw
would fail on a difference that does not exist, while still passing if one path
later started sending 'onboarding'.

**No migration.** This route now uses a function that already exists in
production; nothing in the schema changed.

---


## Incident #40 — a refunded payment stayed 'paid' forever (2026-08-28)

**Severity:** P1 (Trust, money). Every refund ever processed still counts as
revenue. From 2 September it would also have paid commission on money that had
been handed back.

**What happened.** `api/payments/webhook` handled `refund.processed` by
revoking premium, emitting a timeline event and logging a security event — and
never touching `student_payments`. The row kept `status = 'paid'` permanently.
The status CHECK constraint had listed `'refunded'` since the table was
created; nothing had ever written it. So every reader that defines money as
`status = 'paid'` counted refunds: the founder's revenue screen, the rep
portfolio's "Won (paid)" tile and its booked-rupees figure.

**Why it stayed invisible.** The refund path was audited twice and improved
both times — Boundary 2 change 4 made the read throw rather than silently skip
the revoke, and `webhook-ack.test.ts` has five tests on this branch. Every one
of them asks *did the student lose premium*. Not one asks *did the ledger stop
saying we were paid*. The tests encoded the belief that a refund is an
entitlement problem; it is also an accounting problem, and the second half had
no owner. Production had 6 paid rows and 0 refunded ones, so the number looked
plausible on every screen.

**What made it urgent.** Two engagement letters were signed on 28 Aug promising
10% of what a converted student pays, "payable when the student's payment is
realised and is not subsequently refunded". The system had no way to honour the
second half of that clause, and the first payslip is due 7 October.

**The fix.** `settleRefund()` in `lib/activate-payment.ts` writes
`status='refunded'` and the new `refunded_at`, guarded by `.eq('status','paid')`
so a redelivered webhook cannot move the timestamp into a different month. It
throws on failure, so an unrecorded refund 500s and Razorpay redelivers rather
than being ACKed and lost. It also stamps `sales_conversions.refunded_at`,
which withdraws the incentive on that one transaction and nothing else.

**The lesson, encoded.** `sales-earnings.guard.test.ts` asserts the webhook
calls `settleRefund`, that it writes both columns, and that it only moves a row
still claiming to be paid. The deeper rule: **a state change that revokes an
entitlement must also correct the ledger that granted it.** Two systems learned
about the refund; only one of them was asked about it in a test.

**Related:** #15 (payment fix stranded on a branch), #36 (a credit welded to a
cancelled session). All three are the same family — money and entitlement
drifting apart because only one side had a test.

---

## Incident #34 — closed (2026-08-28)

Fixed in `20260828b_claim_lead_lockdown.sql`, in its own migration as the
original entry demanded. `claim_lead(uuid,uuid)`, `refresh_buddy_demo_account()`
and `refresh_review_account_logs()` are now `service_role` only;
`claim_lead(uuid,text)` is dropped. Verified against production: zero
app-owned, non-trigger functions remain reachable by `anon`.

**One correction to the original report, from reading the live grants rather
than the write-up.** It named the `text` overload as "the worse one". That
overload was already locked to `postgres` + `service_role` and was never
reachable by anon. The exposed function was `claim_lead(uuid, uuid)`, which
*did* validate that the new owner was a sales or admin profile — and never
validated the caller. A stranger could not invent an owner, but could hand any
lead to any real rep at will. Since 28 Aug that ownership also feeds
`sales_conversions`, so the same hole had become a lever on payroll.

**Encoded in:** `rpc-exposure.guard.test.ts` — asserts the revokes name `anon`
and `authenticated` explicitly rather than relying on `PUBLIC` (Incident #33),
that no later migration re-grants them, and that the lockdown is the last
migration to touch `claim_lead`. The guard states plainly what it cannot see: a
grant made by hand in the Supabase console.


## Incident #41 — the fix removed the protection the bug was providing (2026-08-28)

**Severity:** P0 (Trust, money). Caught during the verification pass on #40,
before any real refund met it.

**What happened.** #40's fix made the refund webhook write
`student_payments.status = 'refunded'`. Correct in isolation. But both
activation entry points — the Razorpay webhook and the checkout callback —
guarded activation with `row.status !== 'paid'`, and while a refunded payment
wrongly kept `status='paid'` FOREVER, that guard had also been the only thing
preventing re-activation after a refund. Nobody knew it was doing that job.

Writing the correct status removed the accidental protection:

    pays → refund (status='refunded', premium revoked)
         → Razorpay redelivers payment.captured (it retries for hours)
         → 'refunded' !== 'paid' → guard passes
         → activatePaidOrder runs again → status back to 'paid' beside a live
           refunded_at, premium handed back to a refunded student

**Why it was nearly invisible.** `razorpay.test.ts` had a test named "is
idempotent — a replayed captured event cannot double-activate" whose entire
body was `expect(route).toContain("row.status !== 'paid'")`. It asserted the
IMPLEMENTATION STRING, so it passed while the property it was named for was
false. Pinning that string would also have made the test the reason the bug
could not be fixed. `callback.behaviour.test.ts` compounded it by mocking
`@/lib/activate-payment` wholesale, so the predicate under test was a stub.

**The fix.** One predicate, `mayActivatePayment(status)`, in the authority.
'paid' and 'refunded' are both non-activatable; 'created', 'failed' and an
absent status (reconcile-payments filters in the query) are activatable.
Enforced INSIDE `activatePaidOrder` above every side effect — both call sites
had independently written the same wrong guard, and a rule every caller must
remember is one the third caller forgets. It returns `true`, not `false`, so a
refused replay is a no-op rather than a 500 that makes Razorpay redeliver
forever.

**Two other readers were changed the same day by the same root cause.**
`mission-queue.ts` used `.neq('status','paid')` to mean "reached checkout and
did not complete" — a refunded student started matching it, and would have been
surfaced to the founder as the product's strongest buying signal. The activation
predicate and that filter are now both covered by
`payment-status-semantics.guard.test.ts`.

**The lesson, encoded.** **When you fix a bug, ask what the bug was protecting.**
A wrong value that everything reads is load-bearing whether or not anyone
designed it that way. Encoded in `refund-finality.test.ts` (the property, not
the string) and `payment-status-semantics.guard.test.ts` (no reader may express
"not paid" ambiguously).

**Related:** #40, and #39 — both are tests that named the right property and
asserted something else.


## Incident #42 — the guard was in the caller, the bug was in the callee (2026-08-28)

**Severity:** P0 (Trust, money). Found in the release audit of 84c2be3 and
REPRODUCED against the real function before it could reach a real refund.

**What happened.** #41 added `mayActivatePayment()` and enforced it inside
`activatePaidOrder`. The audit then re-ran the same scenario end-to-end and it
still failed:

    1 captured + activated   payment=paid,     subscription=active
    2 refunded               payment=refunded, subscription=free
    3 activate_payment()     payment=PAID,     subscription=ACTIVE
                             refunded_at still set → a row claiming both

**Two root causes, both below the fix.**

1. `activate_payment` guards its own write with `where ... and status != 'paid'`
   — the exact defect #41 fixed in TypeScript, still written in SQL. 'refunded'
   is not 'paid', so the row moved. The fix travelled to the callers and never
   reached the callee.
2. The `profiles` update had NO condition at all. Even where the payment row
   correctly refused to move, premium was handed back regardless. That is the
   half that actually costs money.

**And why an application guard could never have been enough.**
`activatePaidOrder` reads the status in one statement and writes in another,
with an attribution read and an insert in between. A refund landing in that
window passes a guard evaluated against a stale row. Check-then-act is not a
guard; it is a race with good intentions.

**The fix.** `SELECT ... FOR UPDATE` inside `activate_payment` (20260828c),
taking the row lock that `settleRefund`'s own UPDATE contends for, so the two
serialise in either order and exactly one truthful row survives. The refunded
check returns before `profiles` is touched. The session path got the same
treatment in application code: the update filters
`.in('status', ['created','failed'])` and reads the affected rows back, so the
DATABASE decides rather than a value read several statements ago.

**One regression caught inside the fix.** The first version early-returned
whenever no row moved. That would have meant: delivery one marks the payment
paid, then fails to mint the credit; the retry finds 'paid', returns true, and
the student has paid ₹399 for a session credit that never existed. The code now
re-reads and distinguishes 'refunded' (mint nothing) from 'paid' (fall through
and mint) from anything else (500 and let Razorpay redeliver). A surviving
mutation showed that last branch was uncovered; it now has a test.

**The lesson, encoded.** **A guard belongs in the write, not in the caller** —
anything else is check-then-act. Encoded in `refund-finality.test.ts`
(behavioural: refund mid-activation mints nothing, a retry after a failed mint
still mints, a stuck row 500s) and in the migration's own assertions.

**Related:** #40, #41. The three together are one story: a wrong value that
everything read was load-bearing, fixing it broke the things leaning on it, and
the fix had to go one layer deeper than the first attempt.

---

## Incident #43 — three defects, one loop: the Google signup that could not be escaped (2026-08-29)

**Symptom (founder, reported in Hindi; translated here because these documents
have to be readable by every reviewer).** "When I logged in — I had ticked all
my basic onboarding steps and the coverage metrics. After that comes the login
option with Google, and the moment I logged in through Google it sent me back
to do onboarding again… it's a loop." He answered all 53 topic questions, chose
Continue with Google, and was returned to the start of onboarding. Answering
again reached the same screen. There was no exit. Phone OTP was unaffected
throughout.

**Blast radius.** Every student who chose Google since the feature shipped.
`select count(*) from onboarding_drafts` returned **0** — not zero unconsumed,
zero rows *ever written*. The feature had never once done its job.

### The three defects

**1. The throttle was read inverted, so the endpoint refused everything.**
`registerAttemptAndCheck` returns TRUE when the caller is over the limit; every
other caller reads `if (await registerAttemptAndCheck(...)) return 429`.
`/api/auth/stash-onboarding` named the result `ok` and wrote `if (!ok) return
429`. It therefore answered 429 from request number one, with an empty table and
the limit nowhere in sight, forever. Vercel showed exactly one line for the
route: `POST /api/auth/stash-onboarding 429`.

The name is the whole defect. `ok` describes the outcome the author wanted, not
the value the callee returns, and once a variable is named for a hope the
condition around it reads correctly to everyone including its author.

**2. The claim sat in a branch a database trigger made unreachable.**
`/auth/callback` claimed the parked draft only inside `if (isNewUser)`, where
`isNewUser = !existing`. But `on_auth_user_created` on `auth.users` inserts the
profile inside the same transaction that creates the auth user, and that happens
in GoTrue before our route is ever reached. Production, both of the founder's
Google accounts:

```
profiles.created_at    2026-08-29 06:10:39.92984+00
auth.users.created_at  2026-08-29 06:10:39.951019+00
```

The profile is stamped **21 ms earlier than the auth user it belongs to**. So
`existing` is never null here, `isNewUser` is never true for a Google signup,
and the branch had never executed. Two independent confirmations: `full_name`
held Google's "Nishant Kumar", not the route's own `'Student'` fallback.

**3. Because of (2), the state was unrecoverable, and that is what made it a
loop rather than a lost questionnaire.** Once a profile exists with
`onboarding_completed = false`, the old rule could never repair it — the only
branch that could apply a draft required the profile not to exist. The student
layout gates every `/student/*` page on that flag, so it sent him back to
/start, where finishing the questions reached the same dead end. Each defect
alone loses answers; together they close the exit.

### The fix

- The stash endpoint tests the throttle for what it means (`if (throttled)`),
  and the callee's contract now says **RETURNS TRUE WHEN BLOCKED** in the line a
  caller reads before wiring it up.
- `login_attempts` gained a `scope` column. The per-key and per-IP counts are
  taken within one scope, so a funnel completion no longer spends the login
  lockout budget. This was not cosmetic: fixing (1) meant the stash finally
  started writing rows, and on CGNAT — one exit IP for an entire campus or
  carrier — enough honest /start traffic would have pushed that address past the
  30/IP login lockout and locked strangers out of their own accounts. The three
  credential surfaces keep sharing one pool on purpose, so spraying across them
  still cannot multiply an attacker's allowance. Per-IP for the funnel is 300 /
  15 min, sized for a shared address rather than for one human.
- The draft claim is gated on `onboarding_completed !== true` and on the stored
  role, not on newness. A trigger-created stub qualifies. An abandoned signup
  qualifies, which is what gives the loop an exit. A student who has finished
  onboarding never does, so the property the old check was protecting — a
  replayed cookie cannot overwrite a real profile — survives intact.

### Lessons

**A structural guard can demand the bug.** `onboarding-authority.guard.test.ts`
asserted that the claim sat *inside the `isNewUser` branch*. It passed for the
life of the defect, protecting the position of code that could not run. That is
L2 stated as sharply as it gets: **a test that a call is in a place is not a
test that the call happens.** It is now asserted on the data condition, and the
behaviour is driven end to end in `google-onboarding-loop.behaviour.test.ts` —
the stash endpoint and the callback executed against a filtering fake, with the
real cookie from the real endpoint carried into the real callback.

**Application code cannot reason about its own newness while a trigger writes
the same row.** `!existing` looks like "brand new" and means "nothing wrote this
row before me" — a claim about a race the application does not win. Where a
trigger owns creation, ask about the *state* you actually need (`has this
student finished onboarding`), not about who got there first.

**Gate on the same fact the reader gates on.** The student layout redirects on
`onboarding_completed`. The claim now permits on `onboarding_completed`. When
the condition to write and the condition to redirect are one column instead of
two proxies for it, they cannot drift into a loop.

**Zero is a finding.** `total_drafts_ever: 0` was the moment this stopped being
a hypothesis. A feature whose table has never held a row has never run — no
amount of reading the code establishes that, and no amount of code review had.

---

## Incident #44 — an invisible character in an environment variable (2026-08-29)

**Symptom.** Every Google sign-in failed. The student was bounced to `/login`
after granting consent. Three Google accounts existed in production with
`onboarding_completed = false` and zero coverage rows: Supabase had created the
account, and our callback had never completed the exchange.

**What the logs said.**

```
[auth/callback] exchangeCodeForSession error:
PKCE code verifier not found in storage.
```

Nine of ten callbacks on 29 Aug, across five hours and four separate deploys —
eight of eight on careerrai.in. The one success was a same-origin vercel.app
flow, which is what made an origin theory look plausible for an hour.

**Root cause.** `NEXT_PUBLIC_SUPABASE_URL` in the Vercel environment carried a
leading **U+FEFF byte-order mark**. It is invisible in the dashboard, in log
output and in an editor; it is not whitespace, so nothing trims it; and every
copy-paste carries it forward. `new URL()` rejects the string outright.

**How it was found.** Not by reading code — the code is correct and greps
clean. A diagnostic endpoint was added that asks Supabase what it sends Google,
and the probe threw on its own URL:

```
TypeError: Failed to parse URL from ￼https://pobhpszlsozeonejtzqy.supabase.co/...
```

The BOM is visible there only as a rendering artefact. What made it certain was
Node refusing to parse a string that reads as an ordinary URL.

**Fix.** Sixteen files read those two variables raw, so cleaning one would have
left fifteen holes. One authority, `lib/supabase/env`, owns them. Stripping is
deliberately narrow — BOM, zero-width space, surrounding whitespace: the
characters a paste adds. A URL wrong in any other way still fails loudly rather
than being silently rewritten into one that works.

**Lessons.**

**An error message names the layer that noticed, not the layer that broke.**
"PKCE code verifier not found in storage" points at cookies, storage and
origins. It never mentions a URL. Four rounds of investigation went into
redirect URIs, OAuth clients and stale browser tabs because the message pointed
there. When a message names a layer, check whether that layer is even reachable
before searching it.

**Configuration is input, and input is hostile.** Every string from an
environment variable deserves the same suspicion as a request body. The app now
sanitises it once, centrally, exactly as it does for any other untrusted input.

**Functions, not constants, for environment reads.** The first version of the
authority exported `const`s. Those evaluate at import — before anything a test
sets in `beforeAll` — so they captured empty strings and
`oauth-callback-routing.guard` went red immediately. Reading per call preserves
the timing every caller had before the module existed, and that property is now
pinned by a test rather than remembered.

---

## Incident #45 — the OAuth state was encoded twice (2026-08-29)

**Symptom.** "Connect Google" for mentors had never worked once. Not degraded —
never. `google_oauth_tokens` held **0 rows across the project's entire life**,
and Google Cloud's own OAuth dashboard reported *"No data is available for this
project"* for traffic, errors and users.

**Root cause.** `/api/google/connect` built its consent URL as:

```js
googleConsentUrl(encodeURIComponent(encodeOAuthState(nonce, from)))
```

`googleConsentUrl` assembles its query with `URLSearchParams`, which
percent-encodes every value itself. The state went to Google **encoded twice**.

The state is `<nonce>:<returnPath>`. Google received
`nonce%253A%252Fbuddy%252Fhome`; the single decode a query parser performs left
`nonce%3A%2Fbuddy%2Fhome`. Then:

```js
const sep = raw.indexOf(':');            // -1 — the colon is still %3A
const nonce = sep === -1 ? '' : ...      // nonce = ''
```

Empty nonce, so `verifyOAuthState` refused the callback as `state_mismatch`.

**The audit row, on a flow nobody had tampered with:**

```json
{"stage": "state", "reason": "state_mismatch"}
```

**How it was isolated.** The callback has two exits that redirect to
`?google=failed`. The token-exchange one writes to console; the state one only
audits. Vercel showed the callback returning 307 with **no console line**,
which named the branch before any code was read. The audit row then named the
reason.

**Lessons.**

**A security error on a flow nobody attacked is a bug report, not an attack.**
`state_mismatch` names CSRF. It cost four separate investigations — redirect
URIs, OAuth clients, consent screens, verification status — none of which were
ever wrong. Google accepted the request the entire time; the application was
rejecting its own callback. When a security check fires on a flow with no
attacker, suspect the check's inputs before its premise.

**Two encoders that each behave correctly can still corrupt a value between
them.** `encodeOAuthState` and `verifyOAuthState` agree with each other
perfectly, and a unit test of the pair passes forever. The corruption happened
in transit, in the URL, where neither function looks. The regression test
therefore drives the WHOLE trip: build the real consent URL, parse it as a
browser and Google do, hand it back to the callback.

**Make the failure branch distinguishable in the logs.** The one thing that
made this tractable in minutes rather than hours was that the two
`?google=failed` exits differed in what they wrote. Two exits that log
identically are one exit as far as an investigation is concerned.

**Zero is a finding, again.** `0 rows ever` in a token table, and "no data
available" in Google's own console, say the feature has never run. Incident #43
turned on the same signal four hours earlier and it still took a day to look
for it here.

---

## Incident #46 — the client secret belonged to a different client (2026-08-29)

**Area.** Trust OS — mentor Google Calendar connection.

**Symptom.** With #43, #44 and #45 fixed, `Connect Google` still failed. The
mentor walked the entire consent journey, pressed Allow, and landed on
`/buddy/home?google=failed`. The audit row named the stage exactly —
`{"stage": "token_exchange"}` — and the log carried Google's own words:
**"The provided client secret is invalid."**

**Why it surfaced fourth.** Google checks the secret LAST. `client_id` and
`redirect_uri` are validated at the consent screen; the secret is not looked at
until the code is redeemed, at the final step. So a wrong secret is invisible
until everything else is right: the consent screen renders normally, the
client-recognition check passes, and the failure appears only after the mentor
has done all the work. Three earlier bugs each masked it.

**What the shape check could not see.** `googleSecretShape()` reported
`present: true, length: 35, hasGooglePrefix: true, hadStrayCharacters: false`.
That is a perfectly well-formed Google client secret. It was well-formed AND
wrong — a valid secret belonging to a different OAuth client. After #44, where
an invisible U+FEFF in a URL was the whole bug, a shape check was the right
instinct; it simply answered a question that was no longer the question.

**Root cause.** `GOOGLE_CLIENT_SECRET` in Vercel did not belong to
`GOOGLE_CLIENT_ID` `307670815298`.

**Fix.** A new secret generated on that client and saved to Vercel, plus a
probe that makes the pairing checkable in one request instead of a six-screen
mentor journey. It posts a deliberately fake authorization code to Google's
token endpoint and reads which question Google refuses first: `invalid_client`
means the pair is wrong, `invalid_grant` means the pair authenticated and only
the fake code failed.

**Verified in production**, `/api/google/status` on the deployment carrying the
new secret:

```json
{"probed": true, "secretMatchesClient": true, "googleError": "invalid_grant",
 "googleErrorDescription": "Malformed auth code."}
```

Google authenticated the client and rejected only the fake code. That is the
pass, and it is the first time this pairing has ever been shown correct.

**Lessons.**

**Well-formed is not correct.** Four checks said the secret was fine — present,
right length, right prefix, no stray characters — and every one of them was
true. Shape validation answers "is this the kind of thing I expect", never "is
this the right one". Only the system that owns the credential can answer the
second, so ask it.

**An error message names the layer that noticed, not the layer that broke —
and that cuts both ways.** `PKCE code verifier not found` (#44) was a URL.
`state_mismatch` (#45) was an encoder. "The provided client secret is invalid"
was, for once, exactly what it said — and by then the message had been
disbelieved three times running. Neither reflex is a method. Check what the
message claims before deciding whether to believe it.

**Make the last check the first check.** The order a protocol validates in is
not the order to debug in. Google validates the secret last, so the flow
reveals it last. A probe that asks the token endpoint directly reverses that.

---

## Incident #47 — a health check that could only see one kind of failure (2026-08-29)

**Area.** Trust OS — mentor Google Calendar connection / diagnostics.

**Symptom.** `/api/google/status` reported `googleRecognizesClient: true` and
"Google recognizes this client" while a mentor starting the flow on
`careerrai-daily.vercel.app` received **"Access blocked. Error 400:
redirect_uri_mismatch"** every time. The founder, reading the endpoint,
reasonably believed all callback URIs were registered. They were not.

**Root cause.** The check fetched the consent URL, followed every redirect,
and searched roughly 800 KB of returned HTML for the string `invalid_client`:

```js
const probe = await fetch(googleConsentUrl('probe'), { redirect: 'follow' });
googleRecognizesClient = !(await probe.text()).includes('invalid_client');
```

That detects exactly one failure — a deleted OAuth client — and is structurally
blind to the more common one. Google answers an unregistered redirect URI with
`redirect_uri_mismatch`, a response that contains no `invalid_client` anywhere,
so the absence of that substring was scored as health. The check also only ever
asked about ONE URI (the canonical origin's), while the app ships two.

**How it was found.** Not by the check, and not by the test suite, which was
green. By asking Google about each URI individually and including a control:

| redirect_uri | Google's verdict |
|---|---|
| `https://careerrai.in/api/google/callback` | registered (302 to sign-in) |
| `https://careerrai-daily.vercel.app/api/google/callback` | **redirect_uri_mismatch** |
| `https://pobhpszlsozeonejtzqy.supabase.co/auth/v1/callback` | registered |
| `https://careerrai.in/definitely-not-registered` (control) | redirect_uri_mismatch |

The control is what makes the table evidence rather than an assertion: it
proves the method can still tell the two answers apart.

**Fix.** `lib/google-consent-probe.ts`. Google decides this before rendering
anything and says so in one header, so the probe follows no redirects and reads
the `Location`: `/v3/signin/…` means accepted, `/signin/oauth/error?authError=…`
means refused, and the base64 protobuf in `authError` carries the error name in
plain ASCII. One small request per URI instead of a megabyte, no consent screen
reached, no auth state created. Every run also probes a URI that cannot be
registered; if Google calls THAT one registered, the method has stopped
discriminating and every verdict in the run is withdrawn rather than reported.

**Lessons.**

**A check that can only detect one failure mode reports health it cannot see.**
`!body.includes('invalid_client')` is not "the client is healthy", it is "this
one string is absent" — and the two were silently equated in the endpoint's
own summary line. Name what a check actually measures, and let the message say
only that.

**Searching a rendered page for a substring is not asking a question.** The
answer was in a header the check discarded by following the redirect. Following
redirects turned a precise machine-readable verdict into a megabyte of HTML to
guess at.

**A negative control is part of the check, not part of the test.** In
production, a classifier with no control degrades to "everything passes" the
day the upstream response shape changes — the most dangerous failure available,
because it is indistinguishable from success. Shipping the control means the
endpoint can say UNKNOWN about itself (L1).

**The green suite was green throughout.** 4515 tests passed while this check
was blind, because nothing tested what it claimed to measure against what
Google actually returns. The regression test now uses REAL captured Location
headers from both outcomes; invented fixtures would only have proved the code
agrees with the same wrong idea of Google that wrote it.

---

## Incident #48 — the security gate had been red long enough to stop being read (2026-08-29)

**Area.** Engineering Playbook — CI security scanning.

**Symptom.** The `security` workflow failed on EVERY commit to main. Not
intermittently: five consecutive merges on 29 Aug alone, and the failure was
not new to that day. Semgrep reported 16 blocking findings on every run, and
every run was ignored, because a check that is always red carries no
information — which is the same failure as Incident #47 one level up, and was
found within the hour of logging it.

**Why the PRs were green.** `semgrep ci` scans DIFF-AWARE on a pull request and
FULL on a push to a branch. So every PR that touched none of the offending
files passed, and main went red the moment it merged. Nobody was ignoring a
warning on their own work; the warning was never shown on their own work.

**The 16 findings, and what each one actually was:**

| Rule | Where | Verdict |
|---|---|---|
| `gcm-no-tag-length` | `src/lib/session-handoff-crypto.ts` | **Real.** Fixed. |
| `bypass-tls-verification` | `scripts/run-db-sql.mjs` | **Real.** Fixed. |
| `detected-google-oauth-access-token` | `src/lib/integration-audit.test.ts` | False positive. Fixed without suppressing the rule. |
| `github-actions-mutable-action-tag` | 13 steps across 4 workflows | Real; open. Needs SHA pinning. |

**The GCM finding was not noise.** `decryptHandoff` called `setAuthTag` — so it
looked authenticated, and was. Against whatever strength the caller chose:
without `authTagLength`, Node accepts a SHORT tag, and GCM's forgery resistance
is exactly the length of the tag actually verified. A 4-byte tag is 2^-32 per
attempt instead of 2^-128, and the tag travels inside the payload. This module
wraps a student's access AND refresh token for the PWA hand-off, and it had
**no test file at all**, which is how it stayed that way for its whole life.
It now has eleven tests, and reverting the fix turns exactly one of them red.

**The TLS finding was not noise either.** `scripts/run-db-sql.mjs` opens the
PRODUCTION database as the postgres superuser and passed
`rejectUnauthorized: false` — accepting any certificate from any host that
answers. The most privileged credential the company holds, plus every row it
returns, one hostile network away from being read.

**The false positive was the most dangerous of the three to fix badly.** The
scanner matched `ya29.…` in a test fixture. The obvious fix is `nosemgrep` on
that line — in the one file that exists to prove credentials never reach the
audit log, which is precisely the line a real token gets pasted next to one
day and scanned straight past. The fixture stopped being a literal instead, so
the rule stays fully armed on that file.

**Lessons.**

**A check that is always red is a check that has been turned off.** It costs
nothing to leave failing and it removes the signal permanently. Either the
findings get fixed or the rule gets removed with a reason written down; leaving
16 blocking findings on main is choosing the third option, which is to keep the
appearance of a gate without the gate.

**Diff-aware on the PR and full on the branch means the branch accumulates
what no PR ever showed anyone.** Nobody made a bad call here — the information
never reached the person who could act on it. Where the two modes differ, the
stricter one has to run somewhere a human looks.

**"It calls setAuthTag, so it's authenticated" is the shape of the mistake this
archive keeps recording.** Reading the code found the call; only asking what
happens with a hostile input found that the call takes whatever length it is
given. Same lesson as #46's well-formed-but-wrong secret, in a different layer.

---

## CLOSURE — Connect Google worked, 2026-08-29 13:15:17 UTC

Incidents #43, #44, #45, #46 and #47 all sat on one flow that had **never once
completed** in the product's life. It completed. The evidence, from production:

**The audit log, in order, on one buddy account:**

| time (UTC) | action | detail |
|---|---|---|
| 12:10:56 | `google.connect_failed` | `stage: state, reason: state_mismatch` (#45) |
| 12:25:33 | `google.connect_failed` | `stage: token_exchange, reason: "The provided client secret is invalid."` (#46) |
| **13:15:17** | **`google.connected` ok=true** | `role: buddy` |
| **13:15:18** | **`room.created` ok=true** | a real Google Calendar event id |

**What each success proves, rather than suggests:**

- `google.connected` cannot be reached without a **refresh token**:
  `exchangeCodeAndStore` refuses to store a token that lacks one, because a
  connection without it dies in an hour.
- It also cannot be reached without the **calendar.events grant**: the same
  function reads the token response's `scope` field — what was GRANTED, not
  what was asked — and refuses when calendar is missing. So the granular-consent
  checkbox was ticked.
- `room.created` means Google Calendar accepted a real write and returned a
  Meet link. `google_oauth_tokens` went from 0 rows, ever, to 1 real row, and
  `profiles.buddy_meet_url` holds a `https://meet.google.com/…` address.

**Every fix in the chain is therefore load-bearing and confirmed live:** the
un-inverted throttle (#43), the cleaned Supabase URL (#44), the single-encoded
state (#45), the correct client secret (#46), and PKCE — which was added the
same day and had never been exercised, and which Google accepted with the
challenge echoed back unchanged.

**Still open, and not fixed by this.** `https://careerrai-daily.vercel.app/api/google/callback`
is still absent from the OAuth client (#47's finding, confirmed by the shipped
probe and its control). The connection above ran on `careerrai.in`, which IS
registered. A mentor who starts from the INSTALLED PWA — which lives on the
other origin — still gets Access blocked, Error 400. One flow works; the other
does not, and only the per-URI check can tell them apart.

**The lesson worth keeping.** Six incidents, four of them in our own code, one
in configuration, one in the check that was supposed to see the configuration.
Not one was Google's fault, and every error message named the layer that
noticed rather than the layer that broke. The thing that finally closed it was
not a better guess: it was building probes that make the system state a fact
about itself, and shipping a control alongside each one so the probe can say
UNKNOWN when it has stopped working.

---

## Incident #49 — ownership was bound to a person, and the database was willing to lose a book (2026-08-29)

**Area.** Sales operations — lead ownership, rep succession.

**Symptom.** None yet. This was found by asking a question nobody had asked:
the founder said "if Anshul stops turning up tomorrow and someone else takes
his seat, what happens to his students?" The answer was that nothing happens
automatically, and that the two tables holding the answer disagreed with each
other.

**Root cause.** Two foreign keys, written five days apart in the same
migration, with opposite delete behaviour:

```
lead_outreach.owner_id  → profiles(id) ON DELETE SET NULL
sales_followup.owner_id → profiles(id) ON DELETE RESTRICT
```

One event — the departing rep's profile is removed — had two outcomes. The
students would be silently unowned, with nothing raised anywhere and no screen
showing it; the promises made to those students would simultaneously block the
delete with a foreign-key error naming a table the founder has never heard of.
So the founder either got an unexplained failure, or got no error and an
invisible orphaning of an entire book.

**Why SET NULL is the dangerous half.** It is the database quietly deciding
that "nobody owns these students now" is an acceptable resting state. It is
not: ownership is the thing that makes a student get called. A silently unowned
book is a thousand students who will never hear from anyone, and the system
would report no problem at all.

**Fix.** Both constraints become RESTRICT, so the tables agree and a rep who
owns students cannot be deleted at all. The founder is forced through
`transfer_sales_book()` — one transaction that moves every owned lead and every
OPEN promise together, records the counts and the reason, and cannot half-happen.
A refusal at the FK is not an obstacle to succession, it *is* succession: it
converts a silent data loss into a visible "hand the book over first."

**What made it cheap.** Both tables had 0 rows. Verified immediately before
writing the migration. The same change after two counsellors have worked a book
for a month is a lock on every lead plus a reconciliation problem. The cheap day
to fix a constraint is the day before it holds data.

**Prevention.** `src/lib/sales-succession.ts` (pure decision), the RESTRICT
constraints and `transfer_sales_book()` (the atomic move),
`unownedBookException()` so an unowned book is an Exception the founder sees
rather than a silence, and `src/lib/sales-succession.test.ts` — whose first
assertion is that a book moves even when the SOURCE seat is already switched
off, because succession is only ever needed on the day the rep has stopped
working.

---

## Incident #50 — one ceiling was answering two different questions (2026-08-29)

**Area.** Sales operations — capacity vs portfolio.

**Symptom.** None yet, because no book had been built. Had one been, a seat
could never have held more than about 200 students, against an operating model
of roughly 1,000 per seat — and the refusal would have arrived as "they can
take 0 right now (capacity)", which reads like a correct answer.

**Root cause.** Three facts that were individually right:

* `never_contacted` is an `ActiveReason`, so a freshly assigned student
  consumes a capacity unit until somebody calls them.
* `max_capacity_units` is CHECKed between 1 and 200.
* `/api/admin/distribute-leads` gated assignment on `repAllocationLimit`.

Together they meant the ceiling written to stop a part-timer being buried in
live work was also, invisibly, a ceiling on how many people they could be
responsible for. The column comment already said the right thing — "Ceiling on
ACTIVE work items ... a rep who retains 200 students holds 200 relationships and
may still have 50 free units" — but nothing enforced that distinction at the one
place it mattered, so the comment was documentation of an intention rather than
of a behaviour.

**The distinction, in the founder's words.** "The salesman shouldn't manage
1,000 students. The salesman manages today's opportunities. The system manages
the 1,000-student portfolio."

**Fix.** Two questions, two functions. `repAllocationLimit` still gates live
work (capacity units, daily fuse) and is unchanged. `portfolioIntakeLimit` gates
responsibility — the seat must be configured and active, the book must have
headroom under a sanity fuse set well above the operating model so it never
shapes a decision. Work capacity keeps binding the daily queue, which is where a
part-timer's five hours actually bind. It no longer binds who exists in the book.

**Prevention.** `src/lib/sales-portfolio-intake.test.ts` pins the two apart —
its central test asserts that a rep at their live-work ceiling may still take
students into their book. `sales-employment-binding.guard.test.ts` was widened
from "every ownership writer calls `repAllocationLimit`" to "…calls one of the
two ceilings", and then immediately narrowed again by a second test asserting
the two are NOT interchangeable, so a route that consults the wrong one passes
the first check and fails the second. Widening a guard without adding that
second test would have been the real regression here.

---

## Incident #51 — the sales system had never held a lead (2026-08-29)

**Area.** Growth / sales operations — the gap between having students and having
a book.

**Symptom.** Production, on the day two part-time counsellors were hired:

```
profiles       985 rows (974 students)
lead_outreach    0 rows
```

`call-queue.ts` and `sales-portfolio.ts` both read `lead_outreach`. Anshul and
Neelam would each have logged in on their first morning to an empty screen. Not
a bug in the queue — an empty input to it.

**Root cause.** No route could turn a STUDENT into a LEAD in bulk.
`/api/admin/distribute-leads` derives its "unassigned" pool as `lead_outreach
WHERE owner_id IS NULL`, so it can only redistribute rows that already exist;
against zero rows it reports "That pool is empty" forever.
`/api/admin/reassign-lead` moves students one at a time. The enrolment step
between "we have 974 students" and "a counsellor has a book" had simply never
been written, and nothing failed loudly enough to reveal that — every component
downstream of it worked correctly on an empty set.

**The near-miss inside the fix.** The obvious implementation stamps
`assigned_at` on every enrolled row, as `distribute-leads` correctly does.
`assigned_at` starts the first-contact SLA clock. Doing that to a backfill of
974 students who signed up across four months would have started 974 two-hour
clocks at once and reported every one of them as a breach by lunchtime — a panel
full of red measuring nothing except that a backfill had happened. The
enrolment route leaves `assigned_at` NULL; `firstContactSla()` already renders
that as `unknown` and tallies it separately from `breached`, which is the honest
answer. Speed-to-lead is about a new student arriving and being called, not
about the day the back catalogue was imported.

**Fix.** `/api/admin/enrol-book` — a separate door from `distribute-leads`
because the two do different things and are gated differently: one hands out
live work, the other assigns responsibility (Incident #50).

**Prevention.** A guard test asserts the enrolment upsert never contains
`assigned_at`. Its first assertion checks that the upsert payload was found at
all, added after the first version of that guard passed while matching an empty
string — a guard that greps nothing proves nothing.

**Wider lesson.** Every component of the sales system was individually correct
and fully tested, and the system as a whole could not have been used, because
nothing tested the step that produces its input. "All the parts work" and "a
person can do their job with this" are different claims, and only the second one
matters on the first morning.

---

## Incident #52 — a mistaken tap deleted a student from the sales system (2026-08-29)

**Area.** Sales operations — conversion truth.

**Symptom.** None yet. Found by the Contract × Repo audit the founder ordered
before implementation, while `lead_outreach` still had zero rows.

**Root cause.** Two independently reasonable pieces of code:

* `call-queue.ts` held `CLOSED = {'converted','not_interested','dnd'}` and
  skipped those students with the comment *"gone forever"*.
* `/api/sales/log` accepted `converted` as an ordinary call outcome — it is in
  `CALL_OUTCOMES` — and nothing consulted the payment ledger before writing it.

Together: a counsellor who tapped "Converted" by mistake, or optimistically
after a promising call, **permanently removed that student from every future
queue**. No payment required, no exception raised, no way back. The two people
whose entire job is retention and conversion would never see that student again.

**The detail that would have made it hard to find.** `/sales/leads` filters
Active as `!paid && status in (…,'converted')`, so the same student still
appeared under "Active" in the portfolio while being invisible in the queue.
Two surfaces, opposite answers — and the one a counsellor actually works from
was the one that hid them. A founder checking "is this student still in the
book?" on the portfolio screen would have been told yes.

**Why it had never fired.** `lead_outreach` has never held a row. The bug was
written against an empty table and would have gone live on the same day 965
students were enrolled.

**A test was asserting the bug.** `crm-end-to-end.test.ts` Scenario D asserted
*"converted and not_interested never re-enter the queue"* — the old rule, stated
as a guarantee. It passed for the whole life of the defect. The test was
rewritten rather than deleted, and now asserts the four cases that actually
matter, including the one that used to be inverted.

**Fix.** `src/lib/sales-conversion-truth.ts`. `isClosedForSales()` closes a
student on the payment ledger and on the two things the student themselves said
(`not_interested`, `dnd`, plus `unqualified`) — never on a typed status. The
queue now reads `student_payments` directly rather than trusting the
`is_premium` profile flag, which a failed webhook can leave stale.
`resolveConvertedClaim()` downgrades an unbacked claim to `interested` while
keeping the rep's own outcome in `sales_activity` with `self_reported`
provenance, so what they believed survives as history and only the state is
corrected. The mismatch becomes a founder exception, because a claimed
conversion with no money is either a failed payment or a misused button and both
need a look.

**An unreadable ledger is not "unpaid".** `resolveConvertedClaim(null)` keeps
the student actionable and says the payment could not be verified. Treating a
transient database error as "they did not pay" would downgrade a real conversion
— the same class of lie in the opposite direction (L1).

**Prevention.** Eight mutations killed with zero survivors on the new module. A
guard test reintroduces the literal `CLOSED` set and fails, verified by
injection. Contract §3 rule 1 amended: it used to claim this was "already true
in code", which was the most dangerous sentence in the document — a Constitution
asserting a property nothing enforced.

**Wider lesson.** The audit was ordered because the founder refused to let
implementation start on an unverified contract. It found a P0 that had survived
every test suite, because the suite encoded the same assumption the code did.
A contract that describes intended behaviour and a test that asserts current
behaviour can agree with each other and both be wrong.

---

## Incident #53 — coverage had no denominator (2026-08-29)

**Area.** Sales operations — measurement.

**Symptom.** Not a failure, an absence, and it would have become visible on the
counsellors' first working day. `sales_activity` records outreach that happened.
Nothing recorded the **offer**. So two questions had no answer at all:

* *Did they work the students that mattered?* — no denominator.
* *How much of today is left?* — no list to subtract from.

**Why the live queue could not answer it.** `call-queue.ts` is computed on every
request and stores nothing, which is the right design for "who matters NOW" and
exactly wrong at 9pm: by then the morning's list has been recomputed away, and a
student who was skipped is indistinguishable from one who was never chosen. The
statelessness that makes the queue always fresh is what makes it unable to
remember.

**The design constraint that shaped the fix.** The founder was explicit: the
counsellor must never report this. They do not tell the system "today I was
given 72" — the system decided it, so the system records it. Every number on the
checkpoint is derived from rows the platform wrote, which is both why it can be
trusted and why it costs the counsellor nothing.

**Fix.** `sales_opportunity`: one row per rep per student per IST day, written
when the queue is built. Two database constraints carry the weight:

* `unique (rep_id, student_id, ist_day)` — the founder's "the same student must
  not surface twice in a day" as a database fact rather than a frontend hope.
  It is also what makes recording idempotent: the queue is rebuilt on every page
  load, and every rebuild after the first is a no-op.
* `check ((worked_at is null) = (outcome is null))` — a half-written record
  would silently corrupt every coverage number computed from it.

**The rule that keeps it from becoming a performance score.** `worked_at` is set
in exactly one place: the disposition path in `/api/sales/log`. Opening a card,
pressing call, tapping WhatsApp — none of them reach it. A counter any tap could
advance is a counter that will be advanced by tapping. SALES-OS.md §0 puts
telemetry at P5 and forbids it becoming P0, and a guard test asserts no
telemetry field reaches `computePayslip`.

**An empty day has no coverage percentage.** `coveragePercent` returns null
rather than 100 when nothing was surfaced. A day with no opportunities is not a
perfectly covered day, and rendering it as 100% would be a precise lie about an
empty set (L1). The counsellor sees "Nothing needs attention right now" — a
quiet day is information about the base, not evidence about the person.

**What was removed in the same change.** The old headline was "12 connected
today — keep going": a call-VOLUME number in the counsellor's face every
morning, which is the exact metric the contract says must never frame a day. It
is gone, replaced by what is left and how much of it is high priority.

**Rehearsed before shipping.** Five page rebuilds created five rows, not
twenty-five, and did not overwrite the stored reason with the rebuilt one. A
second disposition on the same student did not overwrite the first outcome. All
four invalid writes — outcome without a time, time without an outcome, a
duplicate surfacing, an empty reason — were refused by the database.

**Wider lesson.** Every part of the sales system worked and none of it could be
measured, because the thing that decides was not the thing that remembers. When
a component is deliberately stateless, ask separately who writes down what it
decided — otherwise the audit trail is missing precisely where the system is
most confident.

---

## Incident #54

**2026-08-29 · Trust / student experience (P0) · caught by simulation, hours before the first counsellor shift**

**What was wrong.** The disposition cadence engine had no upper bound on
contact. Every branch of `planDisposition` returned a next-action time; none of
them could return "stop". Worse, the `hot` branch was evaluated FIRST and
ignored the miss count entirely:

```ts
if (hot) nextActionAt = istFutureIso(nowMs, 1, 10, 0);  // tomorrow, 10:00 IST
```

so a hot lead who never answered was rescheduled for tomorrow morning, every
morning, indefinitely.

**Measured, not estimated.** Walking the real engine forward for 30 days
against a student who reports `no_answer` every time:

| lead | calls in 30 days |
|---|---|
| hot | **31** |
| ordinary | 13 |
| answers "interested" every time | 15 |

Thirty-one calls to somebody who has never once picked up. And it selects for
the worst possible victim: `hot` comes from `conversionTier`, so the students
who abandoned a checkout — the 16 most commercially valuable people in the
first batch — are exactly the ones who would have been called daily forever.

**Why nothing caught it.** Every existing cadence test asserted the NEXT step
from one disposition. Not one of them iterated. A rule that is correct at every
single step and catastrophic in aggregate is invisible to step-wise testing,
and this is the second time that shape of defect has appeared in the queue (see
#39's inverted ranking, also correct per-line).

**The fix.** Two constants in `sales-disposition.ts`, deliberately not scattered
judgement calls: `MAX_CONSECUTIVE_NO_ANSWER = 6` returns a null clock (stop
scheduling), and `HOT_DAILY_RETRY_LIMIT = 3` makes hot urgency expire into
normal spacing rather than lasting forever.

`call-queue.ts` refuses to DEAL a lead at the ceiling, which is not redundant
with the null clock and the test proves it: the abandoned-checkout lane is
evaluated before the lane classifier and, unlike the classifier's fallback,
never consults `last_attempt_at`. Without the queue check a null clock would
have fallen straight through and the ceiling would have made the over-calling
WORSE — the exhausted lead returning as a fresh card every day.

**The line that decides where a cap belongs.** The ceiling counts CONSECUTIVE
silence, and any connected outcome resets it. `interested` is left uncapped on
purpose: a student who picks up and talks every two days is choosing to engage,
and inventing a limit on real conversations would be a rule with no evidence
behind it. Silence is the case where we are the only participant — so we are
the ones who have to stop.

**Lesson.** *A cadence rule that is correct at each step can still be abusive in
aggregate. Any engine that schedules the next contact must be simulated over a
horizon, not just asserted one step at a time — and the first question of any
retry policy is "what makes this stop?", not "when does this run again?".*

---

## Incident #55

**2026-08-29 · Analytics / experiment integrity (P0) · would have silently voided the two-counsellor experiment**

**What was wrong.** `/api/cron/outcome-sweep` was added to `vercel.json` on
24 Aug with schedule `45 1 * * *`. Five days later `cron_runs` contained **zero
rows for it — it had never executed once**, while 36 other cron paths were
firing normally (1,327 runs in three days, all `trigger_source = 'vercel'`).
`purge-session-handoffs`, added 27 Aug, was in exactly the same state. Those two
are the two most recently added jobs, and the only two in the file that have
never run.

**Why it mattered more than a missed job.** The sweep is the observation half of
the learning loop. The rep records what they did and what the student said; the
sweep records what the student then actually DID — `logged_d1`, `logged_d3`,
`logged_d7`, `sustained_7d`, `streak_resumed`, `session_booked`. That split is
the only reason those columns are worth anything as evidence, because a rep
cannot mark their own intervention successful.

With the sweep dead, every outcome column in `intervention_ledger` stays NULL
forever. The founder's central question — "did two counsellors actually move
retention and conversion?" — would have had no data behind it at all, and the
failure is invisible: a ledger that stopped being measured looks identical to
one whose windows have not matured yet. The route's own comment anticipated
exactly this ("a ledger that silently stops being measured still LOOKS
complete") and the monitoring it describes was for the sweep's internal errors,
not for the sweep never being invoked.

**Diagnosis honesty.** CONFIRMED: it never ran. NOT CONFIRMED: why. The
strongest hypothesis is a registration ceiling on Vercel's side — 41 cron
entries are declared and the two that fail are the two most recently added —
but that was not proven, and a POST-vs-GET theory was tested and refuted
(`sales-ready`, `daily-reminder` and others are POST-only and run fine).

**The fix.** Route it through `.github/workflows/cron-fallback.yml`, which
exists precisely because Vercel's scheduler has failed silently before. This
does not depend on the hypothesis being right. Scheduled 30 minutes after
Vercel's attempt; the sweep only fills matured NULL windows, so a double run is
a no-op rather than a double count.

**Lesson.** *A scheduled job is not running because it is scheduled. Every cron
that carries evidence needs a "has this ever actually fired?" check against
`cron_runs`, because the failure mode is silence — and a job that has never run
once looks exactly like a job whose work has not come due. Deploying a
scheduler entry is not the same as observing an execution (L2).*

---

## Incident #56

**2026-08-29 · Security / data retention (P0) · a purge that purged nothing for two days**

**What was wrong.** `/api/cron/purge-session-handoffs` shipped on 27 Aug with
schedule `20 * * * *`. Two days later `cron_runs` held zero rows for it — the
same silent non-execution as Incident #55, found by the same query.

The consequence is worse than a missed cleanup. The job exists to stop
`pwa_session_handoff` storing Supabase **access + refresh token pairs**
indefinitely. Production at the time of this entry:

| | |
|---|---|
| rows | 595 |
| still holding a credential payload | **595** |
| of those, dead (used or expired) | **595** |
| legitimately live | 0 |
| past the 7-day row TTL | 441 |
| oldest row | 12 July |

Every credential the purge was written to remove was still there, and the
population had grown from the 502 the original audit found to 595. The purge
existed, was correct, was deployed — and had removed nothing, ever.

**Why the obvious fix was blocked.** Routing it through the GitHub Actions
fallback, as #55 did for `outcome-sweep`, failed `scheduler-authority.guard`.
That guard exists because on 27 Aug twelve routes were fired by both schedulers
at the identical minute and `weekly-digest` double-sent to every mentor. Its gap
assertion required both schedules to be a fixed daily time, and this primary is
hourly — so the guard rejected the fallback with "primary schedule is not a
fixed time", which reads like a malformed cron rather than an unsupported
shape.

Two wrong ways out were available and both were rejected: dropping the Vercel
entry to make it fallback-only (a different rule in the same guard forbids a
route whose only firer is its own backup), and degrading the cadence to daily
(the mint rate has run as high as 58 hand-offs/day, and with encryption that
only defends a database-only leak, the retention window IS the control).

**The fix.** Teach the guard the shape it could not express. Two hourly
schedules are compared on minute-of-hour with a wrap-around, and the gap must
clear `MIN_GAP_MINUTES` in BOTH directions — a backup at :50 trails a :20
primary by 30 minutes, but it also runs 30 minutes before the *next* hour's
primary, and crowding the run ahead races it exactly as badly as crowding the
one behind. Both directions are pinned by mutation: :30 fails as "only 10 min
apart", :10 fails as "only 10 min before the NEXT hour's primary".

**Lesson.** *When a guard blocks a correct change, read what it cannot express
before deciding what to degrade. This one had a coverage hole shaped exactly
like the job that needed it, and the tempting workarounds — weaken the cadence,
or drop the primary and keep only the backup — would each have traded a real
property away to satisfy a check that was simply incomplete. Extending a guard
to cover a case it silently could not model is strengthening it, not bending
it.*

**Second lesson, and the one that keeps recurring.** This is the third time in
two days that "declared" was mistaken for "running" (#55, this, and the earlier
`sales_ready` assumption). A scheduled job is not running because it is
scheduled, and the check is one query — `cron_runs` grouped by path, looking for
zero.

**Lesson encoded (same day).** Both #55 and this were found by a human thinking
to ask, which is not a control. `lib/cron-liveness.ts` now compares every path
declared in `vercel.json` against `cron_runs` and reports anything that has
never run or has gone quiet for a generous multiple of its own period; the
nightly `integrity-check` calls it and alerts through the existing channel. No
new cron and no new dashboard — the job that already exists to notice we are
flying blind now also notices when the instruments have stopped.

Validated against the real table rather than fixtures, which is what caught the
defect that would have made it useless: `cron_runs` stores the path the
scheduler actually called, query string included, so matching declared paths as
raw strings reported the healthy four-slot `study-companion` route as never-run.
An alert that cries wolf on a working job trains you to ignore it. On real
production data it now flags exactly two jobs — `outcome-sweep` and
`purge-session-handoffs` — and nothing else across 39 healthy paths.

---

## Incident #57

**2026-08-30 · Growth / sales ops (P0) · both counsellors locked out on their first morning**

**What was wrong.** `/sales` rendered *"This page didn't load. Your data is safe — please try again."* The founder sent a screenshot; Vercel's error table showed
`Error: Could not read the sales queue state: Bad Request`, 6 occurrences across 2 users on `/sales` and `/admin/sales`, first seen 28 Aug and still firing on the newest deploy.

PostgREST puts `.in()` lists in the **query string**. `buildCallQueue` passed every free student — 975 of them — to seven separate reads. At ~39 characters per UUID that is a **~38,000 character URL**, and the request comes back 400 every single time, for everybody.

**Why it was worse than one broken page.** Only `readLeadOutreach` inspects its error (Boundary 2, added in #P0-B). It threw, and the throw is the only reason anyone found out. The other six reads swallow the failure and continue with empty data — including:

```
db.from('student_payments').select('student_id').eq('status','paid').in('student_id', ids)
```

With that read silently empty, `paidIds` is empty, `isClosedForSales` returns false for a paying customer, and a student who has already paid gets dealt to a counsellor as a cold lead. That is Incident #52's failure mode arriving through a different door — and the loud crash next to it is the only thing that stopped it shipping quietly.

**This is a scale wall, not a typo.** It appeared the week the base crossed roughly 850 students. Nothing about the query was wrong when it was written; the data grew into the limit. `docs/SCALE-CONTRACT.md` says to build today's correct system with a 100,000-student path — this is exactly the class of defect it exists to catch, and it was missed because the read looked innocent.

**How 4,723 passing tests missed a total outage.** Every fake database in the suite implements `.in()` as `() => c` — it accepts any argument and returns everything. A harness that cannot reject an argument cannot fail on the argument being too large, so the bug was invisible to the entire test suite *by construction*. The suite was green while the product was down for its only two users.

**The fix.** `selectInChunks()` walks the id list in batches of 150 (~5,900 characters of URL) and concatenates the rows, returning the first error with whatever it had — so `readLeadOutreach` can still fail closed. All seven reads use it.

`queue-url-limit.guard.test.ts` models the one property the other harnesses miss: it records every `.in()` length and returns `{error: 'Bad Request'}` above a threshold, exactly as the server does. Reverting the chunking reproduces the production error string verbatim and fails four tests.

**Lesson.** *A fake that accepts everything proves nothing about the arguments. When a harness stubs a method as "returns the same thing regardless", it has silently declared that method's constraints untestable — and constraints are where scale walls live. Any collection passed whole to a backend needs a test that models the backend REFUSING it, at a size the real data will actually reach.*

**Second lesson.** *One checked error rescued six unchecked ones. `lead_outreach` threw only because a previous incident forced it to inspect its error; the six reads beside it still swallow theirs. Error-checking one read in a fan-out does not protect the fan-out — it just decides which failure you get to see.*

## Incident #58

**2026-08-29 · Payments / diagnosis (P0) · we paid Razorpay for the answer and threw it in the bin**

**The symptom.** The founder asked whether payments work on iPhone and Android. Attributing every order ever created to the device that created it (`student_events.platform` + `display_mode`, joined on the minute the order was minted) gives:

| surface | paid | failed | created (never settled) |
|---|---|---|---|
| iOS — installed (`ios_app` + `standalone`) | **0** | 2 | 6 |
| iOS — mobile Safari (`browser`) | 1 | 0 | 0 |
| Android — installed (`standalone`) | 2 | 1 | 10 |

**Eight orders from an installed iOS surface, zero paid, ever.** The same platform in Safari converted 1 of 1. This is not a hypothesis about iOS any more; it is a measurement.

**Why nobody could say why — and this is the actual defect.** `reconcile-payments` runs every 15 minutes (96 runs/day, verified in `cron_runs`) and asks Razorpay directly what happened to every unpaid order. Razorpay answers with the whole payment entity: `method`, `error_code`, `error_description`, `error_source`, `error_step`. The cron read **one** field —

```ts
if (payments.some((p) => p.status === 'failed')) {
  await admin.from('student_payments').update({ status: 'failed' }).eq('id', row.id);
}
```

— wrote a bare status, and discarded the rest. `RazorpayPayment` was even *typed* as `{ id, status, amount }`, so every caller was type-blind to the diagnosis. `student_payments` had no column that could have held it.

The discarded fields are the entire question. `method='upi'` with `error_step='payment_initiation'` is the app-switch gap the iOS wrapper is suspected of — a `upi://` deep link a WKWebView never hands to the UPI app. `method='card'` with `error_step='payment_authentication'` and `error_source='bank'` is an ordinary decline and means our app is innocent. **Those two demand opposite work, cost differently, and were indistinguishable in our ledger.** The most expensive open question in the product had an answer arriving four times an hour, and we deleted it four times an hour.

**Why this had to be fixed before any iOS change.** `src/app/probe/escape/page.tsx` already says it: production shows `pay_escape_browser {opened:true}` seven times out of seven, which proves the wrapper returned a window object and proves nothing about which browser rendered it — *"building a payment flow on that gap is the speculative change we were told not to make."* The same applies here. Shipping a WKWebView workaround on a guess about UPI would have been a native change, outside this repo, justified by nothing. Recording what Razorpay already tells us costs one migration and turns the guess into a reading.

**The fix.** `lib/payment-failure.ts` — `failureFacts()`, a pure function that copies what Razorpay reported and **deliberately refuses to classify it**. A classifier here would turn `method: 'upi'` into "the app-switch bug" on the strength of a guess. Six columns on `student_payments`; the failing path in the cron writes them alongside the status.

**The half that is easy to forget.** The rescue loop only ever selects `status='created'`. The moment a row is marked `failed` it leaves that population **forever** — so every failure that predates this fix, including the two 25 Aug iOS attempts that prompted it, would have stayed unexplained for life. A second *explain pass* selects `status='failed' AND failure_seen_at IS NULL`, asks Razorpay once, and stamps the row. Razorpay retains payment history indefinitely, so the August answers are still recoverable; five rows were waiting when the migration landed.

That pass exposed a trap. The route began `if (!stuck?.length) return ...` — and with no order in flight on most ticks, the backlog would have drained *almost never* while every unit test still passed. Removing that early return is load-bearing: restoring it as a mutation fails four tests.

**Why `failure_seen_at` is a column and not an inference.** L1. `failure_code IS NULL` conflates two different states: *we never asked Razorpay* (a hole in our instrumentation) and *we asked and Razorpay named no error* (a fact about the payment). Only a separate timestamp separates them, and every reader must be able to. It is stamped unconditionally, including when the explain pass finds no failed attempt at all — which is also what stops that row being re-queried forever.

**Proof.** Seven mutations of `payment-failure.ts` (first-failure-instead-of-last, missing null guard, conditional timestamp, no length bound, no trim, no type guard, any-attempt-counts) each fail a test. Six mutations of the cron — including reverting to the original status-only write and restoring the early return — each fail; a no-op control edit stays green.

**Lesson.** *A field you read and do not store is not evidence you have, it is evidence you destroyed. When a system already queries an external source of truth, storing its whole answer is nearly free and discarding it is permanent — Razorpay had been telling us why every payment failed since the first one, four times an hour, and no amount of later analysis could recover a single one of those answers from our own database.*

**Second lesson.** *A backfill is part of the fix, not a follow-up. A change that only records new data leaves the incident that motivated it permanently unexplained — the failures you already have are the ones you most need explained, and they are exactly the ones outside the new code path.*

**CORRECTION, same day, after a forensic re-audit the founder demanded.**

The device numbers that open this entry were wrong. They came from a join keyed on
`distinct on (user_id, date_trunc('minute', created_at))` — one arbitrary event per
user-minute — which silently dropped every order whose surface emits no matching event
(nine of them landed in "unattributed") and merged in-app sessions with the browser
sessions the app itself handed students to.

Re-derived from the SESSION that initiated each order:

| claimed | actual |
|---|---|
| installed iOS: 0 paid of 8 | **0 paid of 11** (App Store 5, home-screen PWA 6) |
| iOS Safari: 1 paid of 1 | **2 paid of 3** |
| installed Android: 2 paid of 13 | **3 paid of 16** |

The one paid order that looked like it came from the App Store build did not: the
student escaped to Safari 18 seconds earlier and paid there. Session id is the only key
that separates "inside the app" from "the browser the app handed them to", and a
±5-minute window merges the two.

The instrumentation defect this entry is about is real and unchanged. What it motivated
was right; the numbers used to motivate it were a proxy presented as a measurement.

**And the answer, once the explain pass ran (5 minutes after deploy):** not iOS at all.
Two of the five failures were `source=internal`, "Payment blocked as website does not
match registered website(s)" — Razorpay refusing an origin. See Incident #59. The other
three were UPI collect-request timeouts, one of them on an ANDROID home-screen PWA,
which is what finally killed the iOS-specific hypothesis.

**Still open, deliberately.** *Why* installed iOS fails is UNKNOWN until the explain pass reports. No iOS behaviour was changed in this commit, because nothing yet justifies one. Separately noted: the session checkout mints orders through `/api/sessions/book` rather than `/api/payments/create-order`, so it emits no `payment_order_created` event and does not share the 30-minute duplicate-order reuse guard — two `session` orders were minted 2.5 minutes apart for the same student on 25 Aug. Not fixed here; not money-losing (an unpaid order costs nothing), but it is a real divergence between two order-minting paths.

## Incident #59

**2026-08-29 · Payments / conversion (P0) · we served a paywall on a domain Razorpay refuses**

**What #58 made visible.** The moment the reconcile cron stopped discarding Razorpay's failure fields, the very first read of the five recorded failures answered a question that had been open for weeks — and the answer was not the one anyone expected:

```
order_TTc9Xwf45TqoaR   upi / payment_initiation / source=INTERNAL
order_TTcAJRnVkWzuXC   upi / payment_initiation / source=INTERNAL
  "Payment blocked as website does not match registered website(s)"
```

`source=internal` means **Razorpay refused, before the student ever chose how to pay**. Not a bank decline, not a UPI timeout, not iOS.

**The controlled experiment production handed us.** Both orders belong to one student on `careerrai-daily.vercel.app`, minted 44 seconds apart. Nine minutes later the same student, same plan, same amount, same phone, paid — on `careerrai.in`. And the whole ledger agrees: **13 orders minted from the legacy origin, 0 paid; 20 from the canonical origin, 5 paid.** 101 students used the legacy origin in the seven days to 29 Aug; the most recent was 90 minutes before this was written.

**Why the domain exists at all, and why it is not a mistake.** CareerRai serves from two live origins on one deployment. `careerrai-daily.vercel.app` was deliberately left serving rather than redirected, because installed PWAs and their push subscriptions live on it and a canonical redirect would break them (`lib/site.ts`, `proxy.ts`). Both origins are real and both carry signed-in students. The repo already knew this and had already paid for it once — the ten-day Google OAuth investigation that ended in `APP_ORIGINS` existed for exactly this reason.

**So the defect is not the second origin. It is that the payment flow never knew the difference.** Every other cross-origin hazard in this codebase had been handled: OAuth round-trips, cookie scoping, session hand-off. Payments — the one flow where the cost is measured in rupees rather than in a re-login — had no origin concept at all.

**What this cost, and the honest bound on it.** Between 0 and 13 orders. The two blocked ones are certain. The other 11 legacy-origin orders never produced a Razorpay payment attempt of any kind, so nothing distinguishes "the block stopped them" from "they changed their mind". Claiming 13 lost sales would be exactly the kind of precise-looking number this file exists to prevent.

**The fix.** `lib/payment-origin.ts` decides — purely — whether the current origin can transact, and `lib/checkout-origin-guard.ts` moves the student to `careerrai.in` before an order is minted, reusing the existing one-time encrypted session hand-off rather than inventing a second way to move a session between origins. `/pay/continue` lands them back on the same paywall, signed in.

Three properties carry all the risk, and all three are mutation-proven:

- **Fail-closed.** `needsCheckoutHandoff` fires only on an origin positively established as non-transactable. localhost, previews, unknown hosts, lookalike hosts, wrong scheme — all return false. The inverted rule ("anything that isn't the canonical origin") would hand every developer and every preview reviewer off to production; that mutation fails three tests.
- **Before the order, never after.** A hand-off after minting would strand a live Razorpay order on a domain that can never pay it — and the 30-minute reuse guard would then hand that dead order back for the next half hour. Moving the gate below the mint fails the surface guard.
- **Never claims to have moved without navigating.** All three callers `return` on `move: true`. A hand-off that reported success without navigating would leave the student on a button that does nothing at all — worse than the block, which is at least visible. Every failure path resolves to `move: false` and lets today's checkout run unchanged.

`checkout-surfaces-gated.guard.test.ts` pins the wiring in all three surfaces, because these three components have drifted before: only two emit `payment_order_created`, and only two share the duplicate-order reuse guard — which is why one student minted three session orders in nine minutes.

**Registering the second domain in the Razorpay dashboard also clears the block, and should still be done.** It is not a substitute. It leaves the product one console setting away from silently losing every payment again, on any origin anyone adds later. A payment page belongs on the payment domain, and that should be a property of the code.

**Lesson.** *A second origin is not a deployment detail, it is a second product. Everything host-scoped has to be re-decided for it — cookies, OAuth, push, and payments — and payments are the one where the failure is silent, because a blocked checkout looks exactly like a student who changed their mind. This repo had already answered the question three times for three other subsystems and never noticed that the fourth had not been asked.*

**Second lesson.** *The fix for #58 paid for itself in five minutes. Storing what Razorpay already told us turned "iOS payments are broken, cause unknown" into a named mechanism on a different axis entirely — and the previous report's confident device-level numbers, built on a proxy join, were wrong in both directions. Instrument first, theorise second.*

## Incident #60

**2026-08-30 · Infrastructure / learning loop (P0) · two crons "never ran" because they only answered POST**

**The thing that was actually wrong.** Vercel Cron invokes an endpoint with **GET**. `outcome-sweep` and `purge-session-handoffs` exported only `POST`. Next answered **405**, the handler body never executed — and because `withCronTracking` lives INSIDE the handler, no `cron_runs` row was written either.

So a job that was being called on schedule, every day, and rejected every day, was **indistinguishable in our own telemetry from a job nobody had ever scheduled**. That is precisely how both were recorded:

- Incident #55: *"`/api/cron/outcome-sweep` was declared in `vercel.json` on 24 Aug and had NEVER run."*
- Incident #56: *"`/api/cron/purge-session-handoffs` was declared on 27 Aug and had NEVER run."*

Of 41 crons in `vercel.json`, **exactly two lacked the GET export, and they were exactly the two that had never run.** Every other cron carries `export { POST as GET };`.

**Two incidents were diagnosed as the wrong thing, by me, twice.** Both were read as scheduling failures and both were "fixed" by routing the job through a GitHub Actions fallback that POSTs. That is a workaround for a problem neither job had. Worse, it looked like it worked for `purge-session-handoffs`, which did start appearing in `cron_runs` — via the fallback, not via Vercel — which is why the real defect survived a second investigation.

**And the fallback is not a scheduler.** Its runs are dropped wholesale: an hourly entry (`50 * * * *`) plus twelve daily ones should produce well over 24 runs a day; the workflow fired 12, 10, 1 and 5 times on the four days before this. `outcome-sweep`'s `15 2 * * *` entry has not fired once. Scheduled GitHub Actions are best-effort and skipped under load — acceptable as a backstop, useless as the only path.

**The second defect, underneath the first.** `purge-session-handoffs` did run three times via the fallback, and failed all three:

```
[purge-handoffs] scrub failed: null value in column "payload" of
relation "pwa_session_handoff" violates not-null constraint
```

`payload` was declared **NOT NULL**, and the scrub's entire job is to set it to NULL. The two-stage design — strip the credential within the hour, keep the row as history for seven days — was never representable in the schema. 595 rows, every one still holding an AES-GCM blob of a Supabase access+refresh token pair, oldest from 12 July.

So even after the route was reachable, the purge would still have failed. Two independent bugs, stacked, both of which had to be fixed for a single credential to be destroyed.

**The fix.** One line on each route, and `alter column payload drop not null`.

**The prevention.** `cron-get-export.guard.test.ts` reads `vercel.json` and asserts every declared cron path resolves to a route file that exports a GET handler. It generates one test per cron (42 today), so a new cron added without the export fails the build rather than silently never running. Removing the export from `outcome-sweep` fails it.

**Lesson.** *"It has never run" is a claim about our telemetry, not about the platform. When the tracking lives inside the handler, every pre-handler rejection — 405, 401, 404 — produces exactly the same evidence as "never scheduled", and the obvious reading is the wrong one. Before concluding a job is not being called, confirm that a call would leave a trace: if the only proof of life is written by code the failure prevents from running, absence of proof is not evidence of absence.*

**Second lesson.** *I diagnosed this twice and built a fallback for it twice. A workaround that makes the symptom partially disappear is the most expensive kind of wrong fix, because it removes the pressure to find the cause. The fallback made `purge-session-handoffs` appear in `cron_runs`, which read as success, and the actual 405 went unexamined for another three days.*

## Incident #61

**2026-08-30 · Diagnostics (P1) · the answer was in the table for two days and three wrong diagnoses**

**What was actually true.** The forensics probe read the login visit correctly, the first time, and every time. Arnav's forced login on 29 Aug produced, on `/login` at 20:21:10:

```
verdict: no_marker   cookieMarker: false   localMarker: false
persistedBefore: false      (it was TRUE at his 16:17 visit, same device)
```

Both stores gone, and the persistence grant lost between visits. That is origin-level eviction, not the cookie-specific loss I had been reporting.

**Why nobody could see it.** On `/login` the student is not signed in, so the event lands with `user_id` NULL. Every query run against this problem filtered by his user id, so every one of them excluded the only reading that mattered. The rows that DID carry his user id were taken seconds later on `/student/tracker` — after the probe had re-armed the markers on `/login` — and so reported `all_intact, markerAgeH=0` every time.

**The attributed reading was the meaningless one and the meaningful one was anonymous.** That is the whole defect.

**Three wrong diagnoses, in order, all mine.**

1. *"He has not returned after a gap yet"* — he had, twice.
2. *"The probe is vacuous and must not be trusted"* — too broad. It is contaminated only on the post-login mount; ordinary return visits produced genuine readings (`markerAgeH` 11 and 12) within hours of that claim.
3. *"The /login event never arrives — its `track()` beacon dies with the navigation"* — flatly wrong. `track()` already flushes on `pagehide` via `sendBeacon`, the `/login` OTP events from that same batch arrived fine, and so did the forensics event. I asserted a mechanism without checking `journey.ts`, which does exactly what I said it did not.

Each diagnosis was a claim about our telemetry made without querying the telemetry the right way — the same shape as Incident #60, one day apart.

**The fix.** The `/login` reading is stashed in `sessionStorage` (which survives login's full page load and dies with the tab) and re-emitted verbatim by the first signed-in mount, flagged `carriedFromLogin: true`. Same verdict, now attached to a person. It is re-emitted rather than moved, so a student who never completes the login still leaves the anonymous trace.

The once-per-session guard moved from module scope — which reset on every page load, which is what produced the artefact — to `sessionStorage`. A carried reading beats a fresh one on the signed-in screen, because the fresh reading available there is the probe reading its own handwriting.

**Prevention.** `session-forensics-carry.test.ts` covers the decision table and pins the wiring: `/login` mounts the probe unsigned, the student layout mounts it `signedIn`. The entire carry depends on that one prop, and dropping it fails the guard. Four of five logic mutations fail a test; the fifth (an early `if (!raw) return null`) is an equivalent mutant, redundant with the `try/catch` below it — recorded rather than papered over.

**Lesson.** *A filter is a hypothesis. Querying `where user_id = X` for an event that happens before sign-in does not return nothing because nothing happened — it returns nothing because the question excluded the answer. When a diagnostic "produces no data", check what the query would have had to look like for the data to appear, before concluding the diagnostic is broken.*

**Second lesson.** *I claimed three times that a mechanism did not work without reading the mechanism. `track()`'s `pagehide`/`sendBeacon` flush is nine lines and would have refuted the third diagnosis in thirty seconds. L2 — no claim about behaviour from code location alone — applies just as hard to claims about code that is NOT there.*

## Incident #62

**2026-08-30 · Identity / Auth (P0) · "Continue with Google" could only ever create a second account**

**What was live.** Google identity sign-in shipped 28 Aug and was made the PRIMARY CTA on `/start` on 29 Aug. Two days later production held exactly 5 Google accounts, and **all 5 had no phone identity at all**. Three were real students. One — Anshita Kulshrestha, `44ea1750` — completed onboarding, returned the next day, and has `profiles.phone` NULL: an active student nobody can ever reach by SMS or WhatsApp.

**Why it could not have gone any other way.** Supabase links a Google identity to an existing user only when the email matches and is **confirmed**. Production: **963 of 969 student profiles have no email on file**, because this product sold phone-first auth for a year. So on that screen Google could not recognise a returning student even in principle. The only account it could produce was a *new* one — fresh streak, no plan, no buddy, no payment history — sitting beside the real one under a different id.

**The guard that existed and had never run.** `/auth/callback` already carried a duplicate-account refusal. It was gated on `if (!existing && userEmail)`. But `handle_new_user` inserts the profile INSIDE the GoTrue transaction that creates the auth user, so `existing` is **always** non-null by the time the route runs — production shows `profiles.created_at` 21ms *earlier* than `auth.users.created_at`. The refusal was structurally unreachable and had never executed once.

The file already documented this exact trap twenty lines lower, for `isNewUser`, in a comment ending *"Location in the code is not behaviour."* The same mistake was live twenty lines above it.

**Three more defects found by tracing the same path.**

- **The onboarding "Mobile" field was a client write into `profiles.phone`.** It stripped `+91` to display and posted back what it displayed, so 92 rows held a bare 10-digit number over the verified E.164 the OTP route had written. Worse than format drift: a student could point the column the sales team calls, and the notification system trusts, at a number they do not hold. Checked before removing — across all 917 accounts holding both a profile phone and an auth phone, the last ten digits matched in **917** cases and differed in **0**. Nobody had exploited it.
- **The "54 students with a NULL profile phone" were not students.** All 54 have `phone_confirmed_at` NULL and `last_sign_in_at` NULL. GoTrue creates the auth user at OTP **send** time, not verify time, so an abandoned signup leaves a complete-looking profile row behind. 84 such rows exist. Every "students" count in the product is inflated by them. *I had reported these to the founder as reachable students being missed by outreach; that was wrong and is corrected here.*
- **`otp_send_events` stores phone numbers in its `email` column** (`claim_otp_send_slot` inserts `(email, ip)` from `p_phone`). Self-consistent, so rate limiting works — but the `phone` column and `idx_otp_send_events_phone_time` are dead, and any split of "phone vs email OTP" by column is silently inverted. My own first query on this incident read "0 phone, 939 email" and was exactly backwards.

**The fix — an anchor, not a better heuristic.** Guessing which account a stranger belongs to is how one student's history gets handed to another. So: **a student account is a verified phone number**, recorded in `profiles.phone_verified_at`, stamped only by a completed OTP round-trip. `lib/identity.ts` is the sole authority for the rules; `/auth/callback` and the student layout both consult it.

Google no longer creates anything. It is a door onto an account that must already be anchored; an unanchored arrival is routed to `/auth/link-phone`, which attaches a phone to **that same id** via `updateUser({phone})` + `verifyOtp({type:'phone_change'})`. Never `type:'sms'` — that verifier would mint a *second session for whoever holds the number*, which is the very account we are preventing. A number already owned by another account is refused, never merged, and the student is sent to the OTP door that owns their real history.

**What was deliberately not done.** No auth user was deleted, including the 5 orphans — they keep their sessions and their answers, and are asked once for a number. No second "who owns this phone" function: the drafted one was deleted in favour of the existing `profile_id_for_verified_phone` (20260819f).

**The gate's blast radius was measured before it shipped, not after.** A blanket gate would have locked out `appreview@careerrai.in` — the **Apple App Store reviewer**, who has no Indian SIM to receive an OTP on — failing the next submission, plus `buddydemo`, plus Neelam Singh, an active counsellor on the email door whose phone was never confirmed. `requiresPhoneAnchor` is therefore scoped to `role === 'student'` and skips `is_test_account`/`is_demo`. Final radius: **6 live accounts, 3 of them the founder's own**; the other 84 unanchored rows have no session and never see it.

**Prevention.** `identity.test.ts` (24 cases) proves the rules; `phone-anchor.behaviour.test.ts` and `anchor-gate.behaviour.test.ts` call the real route handlers and the real layout and assert what they *did*. **12 mutations** — inverted role scope, swapped decision order, auto-merge on conflict, always-anchored, gate deleted, test/demo exemption dropped, anchoring on the phone string instead of the verification, writing the raw posted phone, anchoring after a failed OTP, conflict refusal bypassed, self-exclusion dropped, gate override removed — **each fail a test**. The old guard that asserted onboarding must keep an editable phone input was inverted, not deleted.

**Lesson.** *A guard is not a defence until you have watched it refuse something. Both defences that failed here — the duplicate-account check and `isNewUser` — were correct rules behind conditions that could never be true, in a file whose own comments warned about exactly that. The repo had the lesson written down and shipped the bug anyway, because the lesson lived in a comment instead of a test.*

**Second lesson.** *Ask what a column is EVIDENCE of, not what it contains. `profiles.phone` held a plausible number for 54 people who never verified anything and 92 people who typed it themselves. "Has a phone" and "we proved they hold this phone" are different facts, and a schema that cannot tell them apart will be read as the stronger one every time.*

## Incident #63

**Date:** 2026-08-31
**Area:** Community / Daily Pick
**Severity:** P1 (latent — found before it reached a student)

### What was wrong

`promoteDailyPick` (src/lib/daily-pick-runner.ts) stamps one winner per day by
writing `featured_on = today` on the chosen submission. The write was guarded:

```ts
.update({ featured_on: today }).eq('id', id).is('featured_on', null)
```

That guard was added on 21 Aug for a real reason — two concurrent promoters
could otherwise crown two different winners for one kind and permanently burn a
submission's single featured day. First-writer-wins was correct. The predicate
chosen to express it was not.

`pickForKind` (src/lib/daily-pick.ts) has five rules, and rule 5 is explicit:
*"The shelf cannot run dry: once every item has had its day, the one that held
the slot longest ago comes back round."* A recycled item has `featured_on` SET,
by definition. So on the first day the fresh shelf emptied, the picker would
return a recycled id, `.is('featured_on', null)` would match zero rows, nothing
would be written, and `getTodaysPick` would find no featured row. Daily Pick
would render empty — not repeat, not degrade: blank — from that day onward, for
every student, with no error logged anywhere.

The recycle path had unit tests and they all passed. They tested `pickForKind`,
which is pure and was correct. Nothing tested that the id it returned could
actually be written.

### Why it stayed hidden for ten days

It needed the fresh shelf to hit zero, and it never had: 89 live submissions
across two kinds against one pick per kind per day. The bug was one arithmetic
condition away from firing and nothing in the system was watching that number.

It surfaced only because the founder removed questions from Daily Pick on
31 Aug. That collapsed the shelf to tips alone — 38 live, of which **34 had
already been featured**. Four days of fresh stock. Checking the runway before
shipping the change is what exposed it.

### The fix

```ts
.or(`featured_on.is.null,featured_on.lt.${today}`)
```

Same concurrency property (a second promoter reads `featured_on = today` and
matches zero rows), but a recycled row can now take the slot.

Written as an `.or()` and NOT as `.neq('featured_on', today)`, which reads more
naturally and would have been wrong in the opposite direction: PostgREST's
not-equal drops NULL rows, so it would have excluded every never-featured item —
the shelf would then only ever recycle and never serve anything fresh. This is
the same NULL-comparison trap that nearly swept the App Store reviewer out of
premium the previous night (`.eq('is_test_account', false)` dropping NULL
flags), twenty-four hours apart, in unrelated code.

### The lesson, with teeth

**A pure function's correctness says nothing about whether its output can be
persisted.** The selection rule and the write guard were authored three weeks
apart, each defensible alone, and disagreed about which rows were legal. Tests
covered the rule; nothing covered the seam.

Encoded in `src/lib/daily-pick-is-a-hint.guard.test.ts` — "a recycled hint can
still take the slot" — which asserts the write predicate directly (it is a
PostgREST filter string, not behaviour an in-process fake reproduces
faithfully): no is-null gate on `featured_on`, the today-exclusion still
present, and no `.neq` on that column. All three were mutation-tested.

Second, operational: the runway warning in the community-recycle cron now says
`Shelf is dry: students are now seeing REPEATS of old hints` when fresh stock
hits zero, so the condition that would have triggered this is visible in logs
rather than inferred from a blank screen.


---

## Incident #64

**Date:** 2026-09-01
**Area:** Diagnostics / Notification reachability
**Severity:** P1 (no student harmed — two wrong diagnoses, one nearly acted on)

### What was wrong

Two separate sessions, hours apart, independently concluded from the same field
that ~630-704 students "were never prompted" for push permission. Neither
conclusion was supported. The field cannot carry that meaning.

`notif_prefs.push_prompted` is written in exactly one place —
`persistDismissal` in `src/components/push-gate.tsx` — and only **on decline**.
`push-gate.tsx` renders in exactly one layout:
`src/app/buddy/(dashboard)/layout.tsx`, the buddy/staff surface. The student
ask, `src/components/standalone-notif-ask.tsx`, contains **zero** references to
it; `grep -c push_prompted` returns 0. The student layout says so out loud:
*"The old browser PushGate asks are gone."*

So for a student the flag is never written under any circumstance — prompted or
not, shown or not, declined or not. Its absence is not evidence of anything.
Across the entire database only 36 profiles carry it, and those are staff plus
pre-July legacy.

The trap is baited by a second fact: `notif_prefs` has a DATABASE DEFAULT of
`{"push": false, ...}`, so **every profile is born looking like a refusal**
(`src/lib/notification-health.ts:15`). A reader who joins "push is false" to
"no prompt flag" gets a number that looks like a measurement of refusal or of
silence, and is neither.

### Why it kept happening

This was already known. `src/app/admin/notification-health/page.tsx` records a
15 Aug rename made for precisely this reason: *"'opted out' used to mean the
database DEFAULT (push:false from birth), not a real refusal — checked against
production, only 9.7% of that bucket ever saw an actual prompt."* The knowledge
existed in a UI copy string and in a comment in `notification-health.ts`.

Neither location is where an investigator looks. Both sessions started where
any competent investigator starts — the database — and the database schema
carries no hint that the column means something narrower than its name.

**A lesson that lives only in prose gets re-learned by whoever queries first.**

### What it cost

Nothing shipped. Both diagnoses were caught before any code changed. The cost
was investigative: two sessions spent effort deriving a number that was never
real, and one of them nearly presented it to the founder as fact.

### The prevention

The real fix is not a warning, it is a signal that actually exists. PR #159
(merged to main 1 Sep, live in production) instruments every path out of the
student ask, with no behaviour change:

| event | meaning |
|---|---|
| `push_ask_shown` | the overlay actually rendered |
| `push_ask_skipped` | it did not, with `why` |
| `push_ask_later` / `_blocked` / `_dismissed` / `_failed` | outcomes after it rendered |

`push_ask_skipped.why` is the answer to the question both sessions were asking:
`not_standalone` (browser tab — asked only inside the installed app, by design),
`ios_wrapper` (the App Store WKWebView cannot receive web push at all),
`unsupported`, `already_granted`.

```sql
select props->>'why' as why, count(*) as n, count(distinct user_id) as students
from student_events where event = 'push_ask_skipped' group by 1 order by students desc;
```

`src/lib/push-ask-telemetry.guard.test.ts` holds the property that would rot
silently: every early return in `evaluate()` must report a reason. Verified to
fail when one is removed.

**Rule this leaves behind:** before inferring a population from the ABSENCE of
a flag, find the line that writes it and confirm that line can run for the
population you are counting. A default value is not a decision, and an unwritten
flag is not a "no". This is the same failure class as Incident #61 — a query
that excluded the very rows that carried the answer, then three confident wrong
diagnoses on top of it.
