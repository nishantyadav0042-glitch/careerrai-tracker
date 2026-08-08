# Where to test a build before it reaches students

Founder, 8 Aug: *"where I can test this — that the build made by you is
appropriate or not… can we freeze test account or any other solution?"*

The honest answer to why this document did not exist: until today there was
**nowhere to test**. `vercel.json` carried
`"ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ]"`, which cancels
every build that is not `main`. So every branch deployment for the last twelve
commits reads CANCELED in Vercel, and the only way to see a change was to ship
it to 257 students. That is not a testing strategy; that is a dare.

Two separate problems, two separate fixes. Keep them separate in your head.

---

## Problem 1 — a place to run the build (staging)

**Fix: branch previews are on for `claude/*` branches.**

```
"ignoreCommand": "case \"$VERCEL_GIT_COMMIT_REF\" in main|claude/*) exit 1;; *) exit 0;; esac"
```

`exit 1` = build it, `exit 0` = skip it. `main` still builds and still deploys
to careerrai.in exactly as before. Nothing else changed about production.

Every push to the working branch now produces a preview URL of the form
`careerrai-daily-<hash>-nishantyadav0042-5715s-projects.vercel.app`.

### Reaching the preview from your phone

Preview URLs are behind Vercel SSO (`all_except_custom_domains`). That is
correct and should stay on — an unlisted URL is not a private one, and this app
has real student data behind it. Two ways in:

- **Quick:** log into vercel.com in your phone browser once, then open the
  preview link. The SSO cookie lasts the session.
- **Proper (recommended, one-time 5 minutes):** attach a subdomain to the
  branch. Vercel → project `careerrai-daily` → Settings → Domains → Add
  `test.careerrai.in` → set **Git Branch** to `claude/status-update-t1g5as`.
  Because protection is `all_except_custom_domains`, a custom domain is **not**
  SSO-gated, so it behaves like the real thing.

The subdomain matters more than it looks. A PWA install, a push subscription
and a service worker are all tied to their **origin**. On a rotating preview
hash you cannot properly test "install the app" or "turn on reminders" — the
two steps our whole funnel turns on. On a stable `test.careerrai.in` you can.

### What staging shares with production, and what it does not

| | Shared? | Consequence |
|---|---|---|
| Supabase database | **Yes — same DB** | A signup on staging creates a real row. Flag it (below). |
| Cron jobs | No — production only | Scheduled notifications will not fire from staging. Send them by hand from `/admin`. |
| Push origin | No — per-origin | A staging push subscription replaces the production one **on that profile**. Use a test account only. |
| Env vars / keys | Yes | Gemini, Razorpay, Expedify all live. Do not run a real payment. |

---

## Problem 2 — an account that does not pollute the numbers

**Fix: this already exists. `profiles.is_test_account`.**

The rule the codebase already follows, and it is the right one:

- **Test accounts stay IN the experience.** `daily-heartbeat`, `daily-insight`
  and `weekly-plan-reconcile` exclude `is_demo` but deliberately keep test
  accounts — *"this cron IS the student experience (founder tests as a
  student)"*. So you get the plan, the insight and the notifications, exactly
  as a student does.
- **Test accounts stay OUT of the numbers.** `lib/admin-filters.ts`
  `getRealStudents()` excludes them from every dashboard card, and so do
  `compute-dna`, `push-recovery`, `buddy-evening` and — importantly —
  `expedify-flush`, so a test signup never triggers an AI call to yourself.

To freeze an account after you sign up:

```sql
update profiles set is_test_account = true where phone = '+91XXXXXXXXXX';
```

Do it **right after signup**, before the next cron tick. `is_demo` is a
different thing (the shared `buddydemo@careerrai.in` login) — do not use it
here; demo accounts are cut out of the experience crons too.

---

## The walkthrough that actually proves Stage A

Order matters — each step is a promise the previous screen made.

1. `/start` → the quick-facts screen asks **"On a bad day, how much can you
   still do?"** (15 / 30 / 1h / 2h), not a fantasy hours number.
2. Say **Enrolled** in coaching → the timetable hint appears inline.
3. Finish signup → the **six-promise screen** is the first thing in the app:
   *You do one thing. STUDY.* + 100% FREE.
4. Reminders → install → open.
5. `/student/tracker` → today's plan is sized to the floor you picked. Pick
   30 min and you should see roughly a 30-minute day, not a 6-hour monument.
6. Finish it → **"One more? +30 min"** adds one block, a different section
   first, never a topic already on today's list.
7. Fire a notification by hand from `/admin` and read the words: they should
   report work done ("Today's plan is ready"), never chase ("don't forget").

If any step reads wrong, that is the point of staging — say so and it changes
before a student sees it.

---

## Ship checklist (state as of 8 Aug)

- [x] `bad_day_floor_minutes` + `bad_day_floor_set_at` applied to the live DB
      (nullable, `check in (15,30,60,120)`; null = pre-floor account, planning
      unchanged — so applying it early is safe and changes nothing for the 257).
- [x] Both plan callers select the column — `api/routine/today` and
      `lib/routine-plan` — and the schema fixture matches the live table
      exactly. Without this the floor is written and then silently ignored:
      the same bug class as the phantom `weakest_section` column.
- [x] Branch previews enabled.
- [ ] `test.careerrai.in` attached to the branch (founder, Vercel dashboard).
- [ ] Founder walkthrough on a real phone.
- [ ] Merge to `main`.
