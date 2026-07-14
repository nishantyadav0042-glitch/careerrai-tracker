# CareerRai — Founder Runbook

Everything you need to run CareerRai without an AI assistant on hand. Written 14 July 2026.
Stack: **Next.js 16** (App Router, Turbopack) · **Supabase** (Postgres + Auth) · **Vercel** (hosting, region `sin1` = Singapore) · **Razorpay** (payments, LIVE mode) · **Expedify** (AI calls) · **IndiaHost** (OTP SMS).

---

## 1. Deploy & branches
- **Production = the `main` branch.** Every push to `main` auto-deploys to Vercel in ~2 minutes. Nothing else deploys.
- The live URL today is `https://careerrai-daily.vercel.app`. Your domains `careerrai.in` / `careerrai.com` are bought but NOT yet pointed at Vercel (do this before the first paid campaign — see §7).
- `vercel.json` has `"ignoreCommand"` so ONLY `main` builds — feature branches don't waste build minutes.
- To roll back a bad deploy: Vercel dashboard → Deployments → find the last good one → **⋯ → Promote to Production** (instant, no rebuild).

## 2. Environment variables (Vercel → Settings → Environment Variables)
Anything starting `NEXT_PUBLIC_` is visible in the browser — NEVER put a secret behind that prefix.

| Var | What it is | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (browser) key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | **God-mode DB key — bypasses all row security.** Leak = full data breach | 🔴 SECRET |
| `RAZORPAY_KEY_ID` | Razorpay live key id | semi |
| `RAZORPAY_KEY_SECRET` | Razorpay live secret | 🔴 SECRET |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies payment webhooks are really from Razorpay | 🔴 SECRET |
| `NEXT_PUBLIC_PAYMENTS_ENABLED` | Set `true` to show the pay button | public flag |
| `INDIAHOST_USER` / `INDIAHOST_OTP_KEY` | OTP SMS provider login | 🔴 SECRET |
| `SEND_SMS_HOOK_SECRET` | Auth for Supabase's SMS hook → your sender | 🔴 SECRET |
| `DAILY_OTP_CEILING` / `OTP_IP_HOURLY_CAP` | SMS abuse caps (see §5) | config |
| `CRON_SECRET` | Password every cron job checks before running | 🔴 SECRET |
| `EXPEDIFY_WEBHOOK_URL` | Where new leads are POSTed to trigger a call | semi |
| `EXPEDIFY_API_KEY` | (optional now — webhook mode doesn't need it) | 🔴 SECRET |
| `EXPEDIFY_CALLBACK_SECRET` | Verifies Expedify's post-call data is genuine | 🔴 SECRET |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GEMINI_MODEL` | AI features (scorecard parsing, coach line) | 🔴 SECRET |
| `RESEND_API_KEY` | Transactional email | 🔴 SECRET |
| `META_PIXEL_ID` / `NEXT_PUBLIC_META_PIXEL_ID` / `META_CAPI_TOKEN` | Facebook ad tracking | mixed |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web-push public key (private half is stored server-side) | public |
| `SECURITY_ALERT_WEBHOOK_URL` | Where security-monitor posts alerts | semi |
| `NEXT_PUBLIC_APP_INSTALL_URL` / `NEXT_PUBLIC_SUPPORT_WHATSAPP` / `NEXT_PUBLIC_DEMO_WHATSAPP` | Public links | public |

**After changing ANY env var you must redeploy** (Deployments → ⋯ → Redeploy) — running deployments don't pick up new values.

## 3. Supabase
- Project ref: `pobhpszlsozeonejtzqy`. Dashboard: supabase.com/dashboard/project/pobhpszlsozeonejtzqy
- **Two DB clients in the code — this is the most important thing to understand:**
  - `createClient()` (server.ts) = the logged-in user's identity, respects row-level security.
  - `createAdminClient()` (admin.ts) = the **service role**, bypasses ALL security. Used by API routes and crons. Any route using it MUST check the caller's identity in code, because the database won't.
- ~20 tables have row-level security **enabled with no policies** — meaning only the service client can read them. That's intentional (all access goes through server code), but it's why every API route must do its own auth check.
- **Run SQL / inspect data:** Dashboard → SQL Editor. **Change schema:** SQL Editor or the Table Editor — but write the change as a migration so it's tracked.

## 4. Cron jobs (all times UTC in `vercel.json`; India = +5:30)
25 scheduled jobs. Every one hits `/api/cron/...` and checks `CRON_SECRET`. Key ones:
| Job | UTC | IST | Does |
|---|---|---|---|
| `onboarding-morning` | 4:30 | 10:00 | nudges half-finished signups |
| `daily-reminder` + `decision-engine` | 14:30 | 20:00 | evening "log your day" push |
| `study-companion` (9 slots) | 2:30–16:30 | 08:00–22:00 | the all-day companion notifications |
| `expire-subscriptions` | 3:00 | 08:30 | ends lapsed premium |
| `renewal-reminders` | 4:00 | 09:30 | "your plan renews soon" |
| `expedify-flush` | 3:15 | 08:45 | calls the leads who signed up overnight |
| `nishant-weekly` | Sun 8:00 | Sun 13:30 | your weekly founder digest |
| `security-monitor` | hourly | — | watches `security_events` |
- **If a cron seems dead:** Vercel → the deployment → **Cron Jobs** tab shows last run + status. Manually trigger with `curl -H "Authorization: Bearer $CRON_SECRET" https://careerrai-daily.vercel.app/api/cron/<name>`.

## 5. OTP / SMS (costs real money per send)
- Sender: IndiaHost. Supabase Auth calls our `/api/auth/sms-hook` (guarded by `SEND_SMS_HOOK_SECRET`), which sends the SMS.
- Abuse caps: `DAILY_OTP_CEILING` (total sends/day) and `OTP_IP_HOURLY_CAP` (per-IP/hour). If SMS spend spikes, lower these in Vercel and redeploy.
- OTP send events are logged in the `otp_send_events` table — query it to see abuse.

## 6. Payments (Razorpay LIVE)
- Flow: app calls `/api/payments/create-order` (amount is computed **server-side** from the plan — never trust a client amount) → Razorpay checkout → on success Razorpay POSTs `/api/payments/webhook` → webhook verifies the `x-razorpay-signature` HMAC with `RAZORPAY_WEBHOOK_SECRET` → flips `profiles.is_premium` + stamps `premium_since` → writes `student_payments`.
- **The "website does not match" block (seen 14 July):** live mode checks the checkout's domain against Razorpay's registered websites. Fix: Dashboard → Account & Settings → **Website and App Details** → add `https://careerrai-daily.vercel.app` (+ your real domains). Approval takes minutes–hours.
- See every transaction: Razorpay Dashboard → Transactions → Payments. In our DB: `student_payments` table, and the **Money** tab in admin.
- Refunds: issue from Razorpay dashboard OR the admin refunds route; either way check `is_premium` actually flipped back.

## 7. Pointing your real domain (careerrai.in) at Vercel — do before paid ads
1. Vercel → project → Settings → **Domains** → Add `careerrai.in` and `www.careerrai.in`.
2. Vercel shows the DNS records (an A record or CNAME). Add them at your domain registrar.
3. Wait for "Valid Configuration" (minutes–hours).
4. Add the same domain in Razorpay's Website details (§6) and in Meta/Facebook.
5. Update `NEXT_PUBLIC_APP_INSTALL_URL` if it hardcodes the vercel.app URL, and redeploy.

## 8. Admin panel map (`/admin`)
- **Dashboard** (home) — summary numbers only; tap any number to open its list.
- **Leads** — every signup, newest first, Excel export, tap for full profile + one-tap WhatsApp.
- **Students** — dossiers, buddy matching, buddy performance.
- **Growth** — funnel analytics.
- **Money** — payments, coupons, scholarships.
- **System** — broadcast, allowlist (who can log in), data import, notification health, speed, sales queue.
- Admin access = a profile row with `role='admin'`. Grant via SQL: `update profiles set role='admin' where phone='+91…';`

## 9. Debugging a broken student (the playbook that solved "Vedprakash")
1. Vercel runtime logs are NOT wired to a drain, so a thrown error is invisible there. Instead:
2. Query `security_events` where `event_type='api_error'` — the app writes its own errors there (route, user, message, stack).
3. The student's plan card also shows the real server error text on screen ("Plan engine error: …") — ask for a screenshot of THAT, not a generic "it's not working".
4. Reproduce locally: `npm run build && npm run start`, needs `.env.local` with at least `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Lesson learned: bugs can fire only for users with a specific data shape (e.g. students who already have routine rows). Fresh-account testing won't catch those — the error trap will.

## 10. Expedify AI calls
- New signup → `/api/auth/verify-phone-otp` hands the lead to Expedify (day leads instantly, night leads queued for the 08:45 IST `expedify-flush` cron).
- The lead POSTs to `EXPEDIFY_WEBHOOK_URL`; **that webhook must be connected to an active calling workflow inside Expedify** or leads silently go nowhere (test at `/api/admin/expedify-test?phone=+91…`).
- After each call Expedify POSTs `/api/expedify/callback` (guarded by `EXPEDIFY_CALLBACK_SECRET`) → disposition/momentum/notes land on the lead + Excel.

## 11. Local development
```
git clone … && cd careerrai-tracker
npm install
# create .env.local with the public Supabase vars (min) + any secret you're testing
npm run dev      # localhost:3000, hot reload
npm run build    # production build — run before every deploy to catch type errors
npm run lint     # eslint
```
- Never commit `.env.local` (it's gitignored).
- Test the full onboarding at `/start`; the app at `/app`; admin at `/admin`.

## 12. Emergency contacts / where things live
- Supabase project ref `pobhpszlsozeonejtzqy` · Vercel project `careerrai-tracker` (team scope in the dashboard).
- Payment disputes → Razorpay dashboard. SMS not sending → IndiaHost dashboard + check `otp_send_events`. Calls not happening → Expedify workflow status.
- Break glass: rotate a leaked secret in the provider's dashboard, update it in Vercel env, redeploy. If `SUPABASE_SERVICE_ROLE_KEY` leaks, rotate it in Supabase → Settings → API immediately.
