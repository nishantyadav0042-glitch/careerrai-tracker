# CareerRai — Setup Notes

Plain-English, click-by-click setup instructions. Written for the non-technical owner.

---

## Environment Variables

Three variables go in `.env.local` (already filled in for the current project):

```
NEXT_PUBLIC_SUPABASE_URL=      # Your Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # The "anon public" key from Supabase → Project Settings → API
SUPABASE_SERVICE_ROLE_KEY=     # The "service_role" key (keep this secret — never share it)
```

The `NEXT_PUBLIC_` prefix means it's safe to expose to the browser. The service role key is server-only.

---

## Supabase Setup (already done for this project)

### If you need to set up a new Supabase project from scratch:

1. Go to **supabase.com** → Sign in → New project
2. Name it, set a database password, choose Singapore region
3. Wait ~60 seconds for it to provision
4. Go to **SQL Editor** → paste the contents of `supabase/migrations/001_initial_schema.sql` → click Run
5. Go to **Project Settings → API** → copy the Project URL, anon key, and service_role key into `.env.local`
6. Run `node scripts/seed.mjs` to create demo accounts

### Current project credentials

- **Project URL:** https://pobhpszlsozeonejtzqy.supabase.co
- **Dashboard:** supabase.com (log in with the account used to create the project)

---

## Demo Login Credentials

All use password: `CareerRai2026!`

| Role | Email |
|------|-------|
| Student (Aarav, CAT) | aarav@careerrai.com |
| Student (Priya, CAT) | priya@careerrai.com |
| Student (Rohan, CUET) | rohan@careerrai.com |
| Student (Meera, CAT) | meera@careerrai.com |
| Student (Arjun, CUET) | arjun@careerrai.com |
| Buddy (Nishant) | nishant@careerrai.com |
| Buddy (Priya M) | mentor2@careerrai.com |
| Admin | admin@careerrai.com |

---

## How to Make Someone an Admin

Admins cannot self-sign-up. To grant the admin role:

1. Go to **supabase.com** → your project → **Table Editor** → `profiles` table
2. Find the user's row (search by email)
3. Click their `role` cell, change `student` or `buddy` to `admin`, save

---

## Deploying to Vercel (the live URL)

### Step 1 — Deploy via Vercel CLI

1. Open PowerShell in the project folder (`C:\Users\shekh\careerrai-tracker`)
2. Run: `npm install -g vercel`
3. Run: `vercel` — a browser window will open. Log in or create a free Vercel account.
4. Vercel will ask a few questions. Answer:
   - "Set up and deploy?" → **Y**
   - "Which scope?" → your account name
   - "Link to existing project?" → **N**
   - "Project name?" → `careerrai-tracker`
   - "Directory?" → press Enter (uses current directory)
5. Vercel will do a preview deploy. Copy the URL it gives you.

### Step 2 — Add environment variables to Vercel

1. Go to **vercel.com** → your project → **Settings → Environment Variables**
2. Add these three (copy the values from your `.env.local` file):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | https://pobhpszlsozeonejtzqy.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | eyJhbGci… (the anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJhbGci… (the service role key — mark as Secret) |

3. Set environment to **Production, Preview, Development** for each one.
4. Click **Save** for each.

### Step 3 — Deploy to production

1. Back in PowerShell, in the project folder, run: `vercel --prod`
2. Vercel deploys. At the end it prints a URL like `careerrai-tracker.vercel.app`.
3. That's your live app. Share it with anyone.

### Step 4 — Supabase auth redirect (important!)

After deploying, Supabase needs to know your live URL so login works properly:

1. Go to **supabase.com** → your project → **Authentication → URL Configuration**
2. Set **Site URL** to your Vercel URL (e.g. `https://careerrai-tracker.vercel.app`)
3. Under **Redirect URLs**, add: `https://careerrai-tracker.vercel.app/**`
4. Click Save

---

## Enabling Real Phone OTP (currently disabled)

Currently, students log in with email+password. To enable real SMS OTP for phone login:

1. Go to **supabase.com** → Authentication → Providers → Phone
2. Enable it, choose a provider: **MSG91** (India, affordable) or **Twilio**
3. Sign up for MSG91 (msg91.com), get your API key and Sender ID
4. Paste the MSG91 credentials into the Supabase Phone provider settings
5. In the code, the phone OTP UI is pre-built in the login flow — just remove the email fallback comment in `src/app/login/page.tsx`

Cost: MSG91 charges ~₹0.15-0.25 per OTP. For 1000 students that's ~₹150-250/month.

---

## Setting Up Real Email Notifications (Phase 2)

1. Sign up at **resend.com** (free tier: 3,000 emails/month)
2. Verify your domain (e.g. noreply@careerrai.com) — Resend has a 5-step wizard
3. Get your API key from Resend dashboard
4. Add to Vercel env vars: `RESEND_API_KEY=re_xxxx`
5. The `sendNotification` function in `src/lib/notifications.ts` has a `// TODO` stub for email — fill it in with the Resend SDK

---

## Setting Up Browser Push Notifications (Phase 2)

1. Generate VAPID keys — run this command once:
   ```
   npx web-push generate-vapid-keys
   ```
2. Add to Vercel env vars:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY=...`
   - `VAPID_PRIVATE_KEY=...`
   - `VAPID_SUBJECT=mailto:hello@careerrai.com`
3. The service worker stub is ready to be wired in `public/sw.js` (Phase 2)

---

## Setting Up WhatsApp (Phase 3)

The `sendNotification` engine already has a `sendWhatsApp` stub in `src/lib/notifications.ts`.

When ready:
1. Sign up for MSG91 WhatsApp Business API (or Gupshup/Twilio)
2. Get a Meta-approved WhatsApp Business number
3. Pre-approve message templates with Meta (required by law — templates like "Your daily report is pending")
4. Fill in the stub function with the provider's API call
5. Add `WHATSAPP_API_KEY` to Vercel env vars

Cost: ~₹0.50-1 per message. Volume discounts available.

---

## Running the App Locally

```bash
# In PowerShell, always set PATH first:
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# Then:
cd C:\Users\shekh\careerrai-tracker
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Re-seeding (if you need to reset demo data)

```bash
node scripts/seed.mjs
```

The script uses `upsert` so it's safe to run multiple times — it won't create duplicates.

---

## Checking Database Contents

- Go to **supabase.com** → your project → **Table Editor**
- You can browse all tables: `profiles`, `daily_reports`, `buddy_feedback`, `test_results`, `notifications`
- To run custom queries: use the **SQL Editor**
