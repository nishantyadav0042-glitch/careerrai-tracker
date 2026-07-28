# CareerRai — Demo & Review Access (founder only)

> ⚠️ **This repo is public.** No password is written in this file, and none ever
> should be. Passwords are shared privately and live only in Supabase auth +
> the `DEMO_ACCOUNT_PASSWORD` env var.

**Rewritten 28 Jul 2026.** The previous version of this file described a
one-tap demo button (`POST /api/auth/demo-login`), a `cr_demo` read-only cookie
enforced in `src/proxy.ts`, and seven shared demo accounts
(`aarav@careerrai.com` and friends). **None of that existed anymore** — the
route was gone, the cookie appeared nowhere in `src/`, and not one of those
accounts was present in the database. Anyone working from that file was working
from fiction. This is a permanent lesson: see `docs/ENGINEERING-MEMORY.md`.

## What the login page actually offers today

`src/app/login/page.tsx`, two steps:

1. **Role picker** — "Build my free study plan" (student), plus two plainly
   visible buttons, **Log in with OTP** and **Log in with password**, and an
   "I'm an IIM Buddy" link.
2. **Login form** — a visible `Mobile OTP | Password` segmented toggle.
   - *Mobile OTP*: +91 number → 6-digit SMS code.
   - *Password*: mobile number **or email or username** + password.

There is no one-tap demo button and no read-only demo mode. Do not describe
either as if it exists.

## App Store / Play Store review account

Apple rejected 1.0 on **guideline 2.1** — *"We were unable to sign in as no
password login was found."* Two things caused it, both now fixed:

- The password option was a 12px grey link two steps deep. It is now a labelled
  button on the role picker **and** a segmented toggle on the form.
- The password form's credential input stripped every non-digit and capped at
  10 characters, so an **email or username was physically untypeable** — even
  though `/api/auth/login` accepts all three. That stripping is gone.

**The account to give reviewers:**

| Field    | Value                                       |
| -------- | ------------------------------------------- |
| Username | `appreview` (or the email below)             |
| Email    | `appreview@careerrai.in`                     |
| Password | _(shared privately — never commit it here)_  |
| Role     | `student`, `is_demo = TRUE`                  |

Created 28 Jul 2026 for the App Store resubmission. It is seeded with a
lived-in history — 21 consecutive logged days, 2 mock debriefs with an
improving percentile, a 21-day streak — and `onboarding_completed = TRUE`, so a
reviewer lands directly on a populated tracker rather than an empty shell or an
onboarding wall.

`is_demo = TRUE` matters: across `src/lib/*` and the cron routes it only ever
**excludes** the account from founder-facing lists, digests and outbound
notifications. It never gates a feature, so the reviewer still gets full
functionality — which is exactly what guideline 2.1 demands.

To rotate the password:

```sql
update auth.users
   set encrypted_password = crypt('<new-password>', gen_salt('bf'))
 where email = 'appreview@careerrai.in';
```

Then update the value in App Store Connect → App Review Information.

## Admin access (you)

Admin is not advertised on the public page. Use **Password** login with your
admin email or username. Admin lands on `/admin` (tabs: Overview / Students /
Buddies / People & Data / Broadcast, plus quick-links to Payments,
Scholarships, Coupons and CAT Leads).

There is currently **no** `admin@careerrai.com` account in the database. If you
need one, create it the same way the review account was created (see the SQL
pattern above plus an `auth.identities` row) — do not assume the old seed
scripts still work. `scripts/seed-demo-data.sql` is also stale: it `UPDATE`s
profiles by hardcoded UUIDs that no longer exist.

## Verifying a review account before you submit

Run this before every submission. `password_verifies` must be `true` and
`wrong_pw_rejected` must be `false`:

```sql
select p.username, p.role, p.onboarding_completed,
       (u.encrypted_password = crypt('<password>', u.encrypted_password)) as password_verifies,
       (u.encrypted_password = crypt('definitely-wrong', u.encrypted_password)) as wrong_pw_rejected,
       u.email_confirmed_at is not null as email_confirmed,
       (select count(*) from public.daily_reports r where r.student_id = p.id) as logged_days
  from public.profiles p join auth.users u on u.id = p.id
 where p.username = 'appreview';
```

Then sign in through the real UI once, on a device you have not logged in on.
A credential that only passes the SQL check has not been tested.

See `docs/APP-STORE-SUBMISSION.md` for the full resubmission checklist.
