# CareerRai Engineering Memory

> **Permanent organizational knowledge.** Every production incident, outage,
> rollback, failed experiment, and architecture mistake becomes a durable entry
> here — so no engineer and no AI agent ever repeats it. This is not a changelog;
> it is the record of what went wrong, *why*, what it cost, and what now prevents
> it. **Before building in a subsystem, read the incidents that touch it.**
>
> **How to add an entry:** append with the next number. Be honest about impact
> and root cause — a sanitized memory teaches nothing. When the prevention is
> encoded in a Constitution, link it, so the lesson has teeth beyond this file.

---

## Index

| # | Date | Title | Area | Students hit |
|---|---|---|---|---|
| 1 | 2026-07 | Push subscriptions dying same-day | Notification | 34 |
| 2 | 2026-07-19 | Zero new students could log | Notification / Learning | full cohort (0/29) |
| 3 | 2026-07-21 | Dead video-session links | Trust | all buddy sessions |
| 4 | 2026-07 | Stale streaks (displayed ≠ real) | Learning / Analytics | all loggers |
| 5 | 2026-07-20 | Dashboard contradicted itself | Analytics | founder (decisions) |
| 6 | 2026-07 | 0-hour log excluded from streak | Learning | honest loggers |
| 7 | 2026-07 | Invented statistic nearly shipped | Trust | (caught pre-ship) |
| 8 | 2026-07-25 | PWA start_url redirected, installs silently failed | Growth | student-reported |
| 9 | 2026-07-25 | exam_ready was self-declarable | Trust / data | 6 students |
| 10 | 2026-07-28 | App Store rejection: unreachable login | Growth | launch-blocking |
| 11 | 2026-07-29 | Curated Daily Pick wearing a student's byline | Trust | all readers |
| 14 | 2026-08-01 | Security sweep revoked the one grant | Database access | ≥1 confirmed |
| 15 | 2026-08-01 | iOS payment fix sat on a branch for a day | Trust (payment) | every iOS student |
| 17 | 2026-08-04 | One meeting, two truths — mentor lost Join at T+0 | Trust | 1st orientation |
| 18 | 2026-08-04 | /welcome shipped with no login door | Growth | every returning user |
| 19 | 2026-08-05 | Play rejected listing — screenshots the guide had banned | Growth / store | launch-blocking |
| 20 | 2026-08-05 | Plan told a paying student to re-learn finished topics | Learning | every student |
| 21 | 2026-08-05 | A pair sent to two different video rooms | Trust | 1st paying student |

> Entries 12 and 13 were never written. The gap is left visible rather than
> renumbered — the numbers are referenced from commit messages and code
> comments, so closing it would break those references.

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
   `(buddy_id, session_span)`, where the span carries a **15-minute tail
   buffer**. A call that runs long cannot drop a second student into a live 1:1.
   That is a privacy guarantee, not politeness: sessions are where a student
   says their real percentile out loud.
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

## How prevention becomes permanent

An incident is only closed when its lesson is encoded somewhere with teeth — a
Constitution non-negotiable, a shared library that makes the wrong thing
impossible, or a Playbook gate. A lesson that lives only in this file will be
repeated; a lesson wired into `push-client.ts` or `admin-filters.ts` cannot be.
