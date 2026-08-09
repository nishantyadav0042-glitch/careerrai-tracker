# CareerRai Production Audit — evidence log

Started 8 Aug 2026, on `claude/status-update-t1g5as`. Nothing on `main`; the
Play review build is cut from `main` and is untouched.

**Status: Phases 1–2 evidenced, Phases 3–10 not started.** Every number below
was produced by running something, not by reading code. Sections that were not
run say so rather than guessing.

---

## 0. THE PRE-DELETION CHECKLIST — run this before removing anything

Founder, 8 Aug: *do not delete anything that is waiting to be pushed to main
because of the Play Store listing. Make this a checklist.*

This is not ceremony. **My first dead-code sweep produced 13 "unreferenced"
files, and 11 of them were live.** The grep matched `@/lib/x` imports and
missed relative ones. Deleting that list would have taken out the mastery
engines, the replan engine and the daily-pick system on the day we start
onboarding 200 students a day.

Every proposed deletion must pass **all seven**:

| # | Check | Command |
|---|---|---|
| 1 | No import, either style | `grep -rn -E "from '(@/lib/\|\./\|\.\./)NAME'" src/` |
| 2 | No dynamic import | `grep -rn "import(.*NAME" src/` |
| 3 | Not referenced by a cron | `grep -rn NAME src/app/api/cron/` |
| 4 | Not in `vercel.json` crons | `grep NAME vercel.json` |
| 5 | Not referenced by a test | `grep -rn NAME src/**/*.test.ts` |
| 6 | **Not in the un-merged main diff** | `git log main..HEAD --name-only \| grep NAME` |
| 7 | Full suite green after removal | `npx tsc --noEmit && npx vitest run` |

**Check 6 is the Play Store rule.** This branch is ~29 commits ahead of `main`.
A file that looks dead on the branch may be brand new *on the branch* and
waiting to ship — deleting it destroys unshipped work rather than dead weight.
If `git log main..HEAD` touched the file, **do not delete it. Ask.**

And a rule with no exceptions: **a file used only by tests is not dead.** It is
either a fixture or an engine whose consumer has not shipped yet.

---

## 1. Build health — PASS

```
npx tsc --noEmit   → 3 errors, ALL in .next/dev/types (stale generated files)
                     0 errors in src/
npx vitest run     → 698 passed, 1 skipped, 0 failed
```

The three errors are Next.js's own generated route types left behind by a
deleted dev page; `rm -rf .next/dev/types` clears them. **Not a defect, but it
masks real errors** — anyone running typecheck sees red and learns to ignore
red, which is how a real error gets shipped.

**P2 — add `.next` to the typecheck ignore, or clear it in the test script.**

---

## 2. Dead code — 2 files, not 13

Verified with all seven checks above.

| File | prod refs | test refs | Verdict |
|---|---|---|---|
| `lib/analytics-advanced.ts` | 0 | 0 | **Genuinely dead** |
| `lib/syllabus-feasibility.ts` | 0 | 0 | **Genuinely dead** |
| `lib/daily-pick.ts` | 3 | 4 | LIVE |
| `lib/daily.ts` | 0 | 44 | LIVE (fixture/engine) |
| `lib/dilr-mastery-engine.ts` | 1 | 0 | LIVE |
| `lib/dilr-topic-graph.ts` | 1 | 0 | LIVE |
| `lib/notification-decision.ts` | 1 | 1 | LIVE |
| `lib/plan-breach-constants.ts` | 1 | 0 | LIVE |
| `lib/qa-mastery-engine.ts` | 2 | 1 | LIVE |
| `lib/qa-topic-graph.ts` | 1 | 0 | LIVE |
| `lib/replan-engine.ts` | 1 | 1 | LIVE |
| `lib/varc-mastery-engine.ts` | 2 | 1 | LIVE |
| `lib/varc-topic-graph.ts` | 1 | 0 | LIVE |

**Neither has been deleted yet**, because `syllabus-feasibility.ts` fails
check 6 — it was modified on this branch today (made effort-aware) and is part
of the un-merged diff. It is dead, and it will still be dead after the merge;
removing it now would mix a deletion into a branch under Play review.

**Recommendation: delete both AFTER the branch merges. P3.**

Also found: **11 `console.log` calls on production paths.** Low priority but
they cost log volume at 10,000 students/day.

---

## 3. AI cost inventory — where every Gemini call lives, and who fires it

Ten files touch Gemini (`lib/gemini.ts` is the client itself). The question that
matters is not "how many callers" but **who pulls the trigger** — a call fired
by a human tap costs what it is worth, and a call fired by a page load or a cron
costs the whole roster whether or not anyone reads the output.

| Caller | Where the student/buddy is | Fired by | Verdict |
|---|---|---|---|
| `api/timetable/parse` | Uploads coaching timetable photo | **Upload** | **KEEP.** Highest-value call in the product |
| `api/parse-scorecard` | Uploads a mock scorecard | **Upload** | **KEEP.** Same reason |
| `lib/community-safety` | Submits community content | **Submit** | **KEEP.** Moderation, not summary |
| `lib/buddy-briefing` | Buddy's student page | **Tap "Refresh"** | **KEEP.** This is the ONE summary |
| `api/weekly-signal` | Buddy's student page | ~~page load~~ → **tap** | **FIXED 9 Aug** |
| `api/feedback-draft` | Buddy writes feedback | Tap "AI facts" | Already on tap |
| `api/chat/draft` | Buddy replies in chat | Tap "Get reply facts" | Already on tap |
| `lib/mentor-doors` | Founder opens a mentor grant | Founder, in admin | Once per grant, has a rule-built fallback |
| `api/coach-line` | — | **nothing** | **DEAD — delete after merge** |

### The three that fired without being asked — all now removed

Founder, 9 Aug: *"don't automatically produce AI response — someone has to tap
to get the response, don't make it auto ready."* Three paths violated that:

1. **`weekly-signal-card.tsx` fired Gemini from a `useEffect` on mount.** Simply
   opening a student's page spent a call. Now the four stats load with the page
   (they are one table read and cost nothing) and the sentence is written only
   when the buddy taps **"Read this week with AI"**. The route's `generate` flag
   **defaults to false**, so an older bundle that never learns to send it gets
   the cheap path, not the expensive one.
2. **`log-daily` generated a buddy briefing on every mock log and every
   non-"all good" mood log.** One Gemini call per log, forever. The buddy is
   still notified — only the AI writing was removed.
3. **The `buddy-brief` cron regenerated a briefing every morning for every
   student who logged the day before.** This was the fastest-growing AI cost in
   the product: it scales with the roster, not with usage, inside a cron that
   already iterates every student in one invocation.

`refreshBriefingIfStale` was deleted rather than left unused — a staleness
helper exists only to serve a caller that generates without being asked.

**Guard test: `src/lib/ai-on-tap.guard.test.ts`** (5 checks). It pins the full
caller list, forbids any AI producer inside `api/cron/`, and asserts the
`!generate` early-return sits *before* `callGemini` — a flag checked after the
call would be decoration.

### Also fixed while in there — a live defect

`api/weekly-signal` returned early from its cache with `{ insight, cached: true }`
and **no `stats`**. So the first buddy to open a student's page in a given week
saw the 2×2 number grid, and every open after that saw an empty card until the
following Sunday. The cache check now runs after the stats are computed and the
stats ride along.

### What removing them actually saves

Honest numbers, not projections dressed as measurements:

| Path | Calls at 258 students | Calls at 10,000 students |
|---|---|---|
| `buddy-brief` cron | ~1/logging student/day | **~1/logging student/day — grows linearly, forever** |
| `log-daily` briefing | 1 per mock/mood log | 1 per mock/mood log |
| `weekly-signal` on open | 1 per student-page open | 1 per student-page open |

Live volume today is small — `buddy_briefings` holds **3 rows total, 2 in the
last 7 days** — because the buddy roster is small. That is precisely the point:
these three paths are priced by roster size, and the roster is about to grow by
150–200 a day. The saving is not on today's bill; it is that this line does not
turn into the bill.

The second benefit is not cost. **A summary generated in advance is a summary of
whatever the data looked like when it was generated, shown as if it were
current.** Tap-to-generate means what a buddy reads is what is true when they
read it.

### `api/coach-line` is dead

`daily_coach_line` holds **76 rows, 0 in the last 7 days.** The `CoachLine`
component is imported by nothing — it renders on no page. The route is only
reachable from that component.

It passes **all seven** pre-deletion checks, including check 6 (untouched in
`main..HEAD`). **Not deleted yet**, for the same reason as the two files in §2:
deletions do not get mixed into a branch under Play review. **P3, after merge.**

---

## 4. Scalability — the cliff has a number

**34 cron jobs** are registered in `vercel.json`. **At least 12 iterate every
student in a single invocation:**

```
buddy-brief · buddy-evening · builder-recovery · check-red-flags
compute-dna · daily-heartbeat · daily-insight · daily-reminder
decision-engine · expedify-flush · founder-digest · nishant-weekly
```

This is the scale cliff, and it is not the database. A Vercel function has a
hard duration cap. Each of these loops all students, and several do per-student
DB reads inside the loop.

At 258 students it finishes. **At 10,000 it will not** — the function is killed
mid-loop, and because there is no cursor, the students at the end of the list
are simply never processed. Silently. Every day.

**P0 for the 10,000 target — but NOT for tomorrow.** At 150–200/day you are
weeks away from this. The fix is a cursor and batching, not a rewrite.

**I have not measured the actual per-student duration**, so I cannot yet tell
you whether the cliff is at 2,000 students or 8,000. That measurement is the
first thing the next session should do.

---

## 5. PHASE 3+4 — Plan generation and personalisation: **PASS**

Run, not read. 46 untouched topics, 113 days to CAT, one profile changed at a
time.

```
 2h/day →  10/46 topics · fits=false · capacity 106h
 3h/day →  21/46 topics · fits=false · capacity 191h
 5h/day →  41/46 topics · fits=false · capacity 361h
 8h/day →  46/46 topics · fits=true  · capacity 616h
10h/day →  46/46 topics · fits=true  · capacity 786h

DISTINCT PLAN SIGNATURES: 5/5  → PASS
```

Five different commitments produce five genuinely different plans. **The
founder's "never generate the same plan" requirement holds.**

Archetype and coaching also differentiate:

```
fresher   397h syllabus · 113 days · fits=false
repeater  258h syllabus · 113 days · fits=true    (88th percentile)
coaching   31-day horizon (their uploaded month)
```

Integrity at 6h/day: **all five checks pass** — topics, mocks, analysis,
revision, hours. 113 days, no gaps, no missing weeks. 5 days carry nothing,
which is correct rather than a defect: they are days where the topic queue is
exhausted before revision season begins.

**One thing worth your attention.** At 6h/day the verdict reads *"fits, with 0
study days to spare"*. Six hours is the exact edge for a from-zero first-timer.
Anything less and the syllabus does not fit — which is true, and now visible,
but it means most self-prep students starting today will see a red verdict.
That is honest. It is also a product decision you may want to revisit
(scope-cut option, or CAT 2027 guidance).

---

## 6. PHASE 7-9 — Notifications, Premium, Messaging: live evidence

Read from production, not assumed:

| Signal | Live number |
|---|---|
| Notifications ever sent | **31,183** |
| Sent in the last 7 days | **8,170** |
| Live push subscriptions | 63 |
| **Dead push subscriptions** | **47** |
| Premium users | 6 |
| Plans built | 549 |
| Study logs | 204 |
| Coverage rows | 12,263 |

**Notifications: PASS.** The pipeline is demonstrably alive — 8,170 delivered
in seven days.

**P1 — push subscription death rate is 43%.** 47 dead against 63 live. That
matches the known Android silent-410 problem; `push-recovery` exists but is
clearly not winning. At 10,000 students this is ~4,300 students who stop
receiving anything and are never told.

**Premium (6 users) and messaging: NOT scored.** Six users is too small a
sample to call a payment flow healthy, and I did not execute a purchase. A GO
on payments without running one would be exactly the failure mode this audit
exists to avoid.

---

## 7. PHASE 8 — Security: **PASS**

```
public tables:      78
RLS disabled on:     0
```

**Every one of 78 tables has row-level security enabled.** No gaps.

---

## 8. THE SCALE CLIFF — now measured

Plan generation costs **18.1 ms of pure compute per student** (measured over 50
runs, no database time included).

```
   258 students →   4.7s   ← today, fine
 3,300 students →   60s    ← Vercel default function ceiling
10,000 students →  181s    ← pure CPU, before a single DB round trip
```

**The daily-plan cron breaks somewhere around 3,000–3,500 students** on the
default timeout, and earlier once per-student database reads are included.
There is no cursor, so when the function is killed the students at the end of
the list are simply never processed — silently, every day.

**P0 for scale, not for tomorrow.** The fix is batching plus a cursor, not a
rewrite. At 150–200/day you have weeks.

---

## 8b. PHASES 6, 8, 9 — scored 9 Aug

These three were left unscored because each "needs a live artefact". Two of
them turned out not to. The question worth answering was never *did a card work
today* — it was **can someone who has not paid make us believe they did**, and
that is testable for free, deterministically, and it is the half that carries
the risk.

### PHASE 8 — Premium unlock: **PASS**, and it had no test at all

`subscription_status` changes in exactly one place — `api/payments/webhook` —
and only after an HMAC-SHA256 signature verifies. **Nothing covered that
function.** It does now (`src/lib/razorpay.test.ts`, 13 checks):

| Attack | Result |
|---|---|
| Real ₹999 webhook, order id swapped to another student | **rejected** |
| Forged signature | **rejected** |
| Body signed with a different secret | **rejected** |
| Signature header missing / empty | **rejected** |
| `RAZORPAY_WEBHOOK_SECRET` unset | **rejected** — never "skip the check" |
| Wrong-length signature | rejected, and **does not throw** |

That last one matters more than it looks. `timingSafeEqual` throws on unequal
lengths; uncaught that is a 500, and **Razorpay retries a 500** — so a single
malformed probe would become a retry storm against an endpoint that can never
succeed. It is caught.

Also pinned: the 401 fires **before** `JSON.parse` and before any database
client is constructed; a replayed `payment.captured` cannot double-activate
(`row.status !== 'paid'`); a failed activation returns 500 **so Razorpay
retries**, because taking money and granting nothing is the one outcome worse
than rejecting a real payment; and verification runs over the **raw bytes**, not
a re-serialised object — a handler that parsed and re-stringified would reorder
keys and silently reject every genuine payment while looking like a Razorpay
outage.

**Live: 15 orders `created`, 3 `paid`, 1 `failed`.** All 3 passed through this
function. Not scored: a card charge end-to-end. That still needs a real card,
and it is the founder's to run.

### PHASE 9 — Messaging and file transfer: **PASS**, with a real hole found and closed

Chat file transfer is well built and needed no change. The server mints a
`createSignedUploadUrl` at a **server-controlled** path
(`${studentId}/${buddyId}/${uuid}.${ext}`) using the service role; the client
never chooses its own path. Afterwards `chat-attachment-verify` **re-derives**
the expected prefix rather than trusting the string — which is what stops a
caller attaching someone else's already-uploaded file to their own message — and
checks the file's real byte size against the declared one. The bucket is
private with **no SELECT policy at all**, so there is no RLS read path; reads
are signed URLs only.

**The hole was next door.** Storage had two INSERT policies:

```
"Authenticated can upload"  WITH CHECK (auth.role() = 'authenticated')
avatar_upload_own           WITH CHECK (bucket_id = 'avatars'
                              AND (storage.foldername(name))[1] = auth.uid()::text)
```

**Postgres ORs policies for the same command**, so the blanket one won and the
careful one was decoration. Any authenticated student could insert any object,
of any size and any MIME type, into **any bucket at any path** — including
`avatars`, which is PUBLIC and had **no size limit and no MIME allowlist**. That
is arbitrary file hosting on our own domain, reachable by anyone who can sign
up. The 5 MB guard in the buddy setup form is client-side only, so it stops
nobody who is not using the form.

Cross-checked before dropping it, per §0: `chat-attachments` and
`community-questions` upload with the **service role**, which bypasses RLS
entirely; `voice-notes` and `buddy-intros` have **zero references** anywhere in
`src/`; `avatars` is the only client-side upload and `avatar_upload_own` already
covers exactly it. Nothing depended on the blanket policy.

Migration `20260809a_scope_storage_upload_policy.sql`, **applied and verified**:

| Bucket | Visibility | Before | After |
|---|---|---|---|
| avatars | PUBLIC | no limit, any MIME | 5 MB, 3 image types |
| community-questions | PUBLIC | no limit, any MIME | 5 MB, 3 image types |
| voice-notes | private | no limit, any MIME | 10 MB, 4 audio types |
| buddy-intros | PUBLIC | no limit, any MIME | 50 MB, 2 video types |
| chat-attachments | private | 20 MB, 10 types | unchanged |

`avatar_upload_own` survives, so buddy avatar upload still works.

### PHASE 6 — OCR accuracy: **still NOT scored**, and here is exactly why

The deterministic half of the pipeline passes — **60 tests** across
`workbook-text`, `timetable-extract`, `timetable-align`, `timetable-month`,
including both real malformed fixtures (a syllabus list flattened onto Monday,
and a student's own gym/sleep routine).

The model half is unscored. `timetable-live-fire.test.ts` runs the exact
production pipeline against the real file that failed in production, hitting the
real API — but it is gated on `GEMINI_LIVE_KEY`, and **the key is deliberately
not in this environment**. It lives in Supabase `server_config`, the repo is
public, and reading it into a session transcript to score a test would be a
worse outcome than leaving the phase unscored.

**One command scores it**, run by someone who holds the key:

```
GEMINI_LIVE_KEY=<key> npx vitest run src/lib/timetable-live-fire.test.ts
```

I will not claim an accuracy number I did not measure.

### A probe I ran, and threw away

An anon-perspective probe against live storage and RLS returned **7/7 PASS**.
It was worthless. The sandbox cannot reach `supabase.co` at all — every request
died at `CONNECT tunnel failed, 403` from the local egress proxy, and
"Forbidden" from a proxy is indistinguishable from "Forbidden" from Postgres
unless you check. Recorded here because a green result from a blocked network
is exactly the kind of evidence an audit is supposed to catch, and this one was
mine. The Phase 9 verdict above rests on policy definitions read through the
Supabase MCP, which is authoritative.

---

## 9. What is still NOT audited

Stated plainly rather than implied:

| Phase | Status |
|---|---|
| 3 — Plan generation | ✅ **PASS** — integrity, no gaps, verdict correct |
| 4 — Personalisation | ✅ **PASS** — 5/5 distinct signatures |
| 5 — Coaching flow | ⚠️ Engine tested with both real fixtures; **a live upload was not performed** |
| 6 — OCR accuracy | ❌ **Still not scored.** Deterministic half green (60 tests); model half needs `GEMINI_LIVE_KEY`, deliberately absent here |
| 7 — Notifications | ✅ **PASS** on delivery; the "43% death" re-read — see §11 |
| 8 — Premium | ✅ **PASS** — signature boundary now covered by 13 tests; a card charge still unrun |
| 9 — Messaging | ✅ **PASS** — and a real storage hole was found and closed |
| 10 — Security | ✅ **PASS** — RLS on 78/78 tables; storage INSERT policy tightened 9 Aug |

---

## RELEASE DECISION

**🟡 GO WITH RISKS — for 150–200/day. 🟡 GO WITH RISKS for 10,000/day** (was
🔴 NO GO; the cron cliff was the blocker and it has moved — see §11).

Justification:

- **Nothing found blocks tomorrow.** Build green, 698 tests, RLS complete,
  plan generation correct and genuinely personalised, notifications delivering
  at volume.
- **The scale cliff is now measured, not guessed: ~3,000–3,500 students** on
  the daily-plan cron. It fails silently, which is the worst mode.
- **Push subscription death at 43%** is the most under-rated finding here. It
  does not block launch; it quietly erodes every promise made on the
  notification screen.
- **Three phases remain unscored** — OCR on real files, a real purchase, a real
  file transfer. Each needs a live account and a real artefact. I will not
  score them from code, and a GO on an unexecuted payment flow would be exactly
  the failure this audit exists to prevent.
