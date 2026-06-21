# CareerRai — Demo & Admin Access (founder only)

> ⚠️ **Do not share this file or commit these details to any public page.**
> These credentials were removed from the public login page on purpose — a
> visible credentials list looks unprofessional to prospects.

## Public login page — what visitors see

- **Primary:** Mobile OTP (enter number → 6-digit SMS code → signed in)
- **Secondary:** "Login with password" and "Email link"
- **One premium button:** "👀 See a live student demo" → one-tap, **read-only**
  login to a demo student account (Aarav). No credentials shown anywhere.

## The read-only student demo

- The demo button calls `POST /api/auth/demo-login`, which signs the visitor
  into **Aarav Sharma** (`aarav@careerrai.com`) server-side and sets a `cr_demo`
  cookie.
- **Read-only enforcement:** the proxy (`src/proxy.ts`) blocks every mutating
  API call (POST/PUT/PATCH/DELETE) while the `cr_demo` cookie is set, so a
  prospect can browse the full lived-in student experience but cannot change or
  break any data. A "Demo — view only" banner shows at the top of every student
  screen.
- Logging out (or logging in as a real user) clears the demo flag.

## Admin access (you)

Admin is **not** shown on the public page. Log in via **"Login with password"**:

| Field    | Value                                   |
| -------- | --------------------------------------- |
| Username | `admin`                                 |
| Email    | `admin@careerrai.com`                   |
| Password | _(sent privately — see below)_          |

> 🔒 **This repo is public**, so the actual password is intentionally NOT written
> here. It's the shared demo password (also stored as the `DEMO_ACCOUNT_PASSWORD`
> env var / in Supabase auth). Claude sent it to you in chat.

Lands on `/admin` — now organized into tabs (Overview / Students / Buddies /
People & Data / Broadcast) with quick-links to Payments, Scholarships, Coupons
and CAT Leads.

## All demo accounts (for your reference)

All demo accounts share the password below and are flagged `is_demo = true`.
They are reachable via password login but are **never advertised** on the page.

| Role    | Name           | Username  | Email                   |
| ------- | -------------- | --------- | ----------------------- |
| Student | Aarav Sharma   | `aarav`   | `aarav@careerrai.com`   |
| Student | Priya Kapoor   | `priya`   | `priya@careerrai.com`   |
| Student | Rohan Patel    | `rohan`   | `rohan@careerrai.com`   |
| Student | Meera Patel    | `meera`   | `meera@careerrai.com`   |
| Student | Arjun Singh    | `arjun`   | `arjun@careerrai.com`   |
| Buddy   | Nishant Yadav  | `nishant` | `nishant@careerrai.com` |
| Admin   | Nishant (Admin)| `admin`   | `admin@careerrai.com`   |

**Shared demo password:** _(sent privately in chat — kept out of this public repo)_

> The demo password lives server-side only (`DEMO_ACCOUNT_PASSWORD` env var,
> falling back to the original shared value in code history). To rotate it: set
> `DEMO_ACCOUNT_PASSWORD` in Vercel **and** update the Supabase auth password for
> each demo account. Rotating it is recommended precisely because the old value
> is in this public repo's git history.

## Best demo story to show a prospect

**Aarav** (the default demo) — a 79→94 %ile recovery arc over 30 days, including
a dip-and-recovery. It's the most convincing "the system works" narrative, which
is why the one-tap demo button opens his account.
