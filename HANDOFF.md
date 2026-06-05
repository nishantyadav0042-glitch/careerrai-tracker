# CareerRai — Handoff Guide

For anyone (e.g. a developer or the owner's brother) who needs to maintain or extend this project.
Written in plain English. No assumptions about prior knowledge of the codebase.

---

## What this project is

A multi-user web app for tracking CAT/CUET exam prep. Students fill a daily form; their IIM buddy mentor sees reports and gives feedback. Built with Next.js (React framework) + Supabase (cloud database) + Vercel (hosting).

---

## How to run it locally

```bash
# Prerequisites: Node.js installed, project cloned
cd C:\Users\shekh\careerrai-tracker

# Windows: add Node.js to PATH first
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

npm install        # install packages
npm run dev        # start local server at http://localhost:3000
npm run build      # check for errors (all must pass before deploying)
```

---

## Where each feature lives

### Authentication & login
- **File:** `src/app/login/page.tsx`
- Email + password login. Demo accounts are shown as quick-fill buttons.
- The middleware at `src/middleware.ts` redirects users to the correct dashboard based on their `role` field in the `profiles` table.

### Student dashboard
- `src/app/student/home/page.tsx` — Streak, heatmap, 7-day quick stats
- `src/app/student/today/page.tsx` — The daily form (writes to `daily_reports` table)
- `src/app/student/reports/page.tsx` — Charts and day-by-day breakdown
- `src/app/student/exams/page.tsx` — Self-assessment tests (CAT/CUET readiness)
- `src/app/student/profile/page.tsx` — Name, ID, buddy connection, notification prefs

### Buddy dashboard
- `src/app/buddy/students/page.tsx` — List of assigned students with status badges
- `src/app/buddy/students/[id]/page.tsx` — Full report for one student + feedback form
- `src/app/buddy/trends/page.tsx` — Multi-student comparison charts
- `src/app/buddy/profile/page.tsx` — Buddy profile and notification prefs

### Shared components
- `src/components/bottom-nav.tsx` — Mobile bottom navigation bar
- `src/components/notification-bell.tsx` — Bell icon with unread count and dropdown
- `src/components/logo.tsx` — CareerRai logo
- `src/components/ui/` — Buttons, cards, badges, sliders, toggles, topic chips

### Business logic
- `src/lib/analytics.ts` — All score calculations: overall score/100, red flags, streaks, trends, heatmap data. **This is the single source of truth for all numbers.** If CareerRai wants to change how scores are calculated, edit only this file.
- `src/lib/notifications.ts` — `sendNotification()` function. Writes to the `notifications` table. Stubs for email (Resend) and WhatsApp are clearly marked with `// TODO`.

### Database
- `src/lib/supabase/client.ts` — Browser-side Supabase client (safe to expose to users)
- `src/lib/supabase/server.ts` — Server-side client (used in server components)
- `src/lib/supabase/admin.ts` — Admin client with service role key (bypasses security — server-side only, never expose to browser)

---

## How to make common changes

### Change the daily reminder time default
In `supabase/migrations/001_initial_schema.sql`, find:
```sql
notif_prefs JSONB NOT NULL DEFAULT '{"daily_reminder":true,"reminder_time":"20:00",...}'
```
Change `"20:00"` to your preferred time (24-hour format, IST).

For existing users, run in Supabase SQL Editor:
```sql
UPDATE profiles SET notif_prefs = notif_prefs || '{"reminder_time":"19:00"}' WHERE role = 'student';
```

### Add a new topic to the daily form
In `src/app/student/today/page.tsx`, find:
```typescript
const TOPICS = ['Quant', 'Verbal', 'Logic Games', 'Reading Comprehension', 'Mock Test', 'Revision'];
```
Add your new topic to this array.

### Change copy / wording on any screen
Open the relevant page file (listed above) and find the text you want to change. It's plain English in the JSX.

### Change the scoring formula (overall score /100)
Edit `src/lib/analytics.ts`, function `computeSummary`. The four components are clearly named: `consistency`, `studyScore`, `mockScore`, `moodScore`.

### Add a new buddy
1. Go to Supabase → Authentication → Users → Invite user (or create manually)
2. In the `profiles` table, set their `role` to `buddy`
3. Assign students to them by setting `buddy_id` in the `profiles` table to the buddy's user ID

### Assign a student to a buddy
In Supabase SQL Editor:
```sql
UPDATE profiles
SET buddy_id = '<buddy-user-id>'
WHERE email = 'student@example.com';
```

### Add a new admin
In Supabase SQL Editor:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
```

---

## Database tables (quick reference)

| Table | What it stores |
|-------|---------------|
| `profiles` | Every user: name, role, exam target, buddy assignment, notification prefs |
| `daily_reports` | One row per student per day: study hours, topics, mock scores, mood sliders |
| `buddy_feedback` | Feedback a buddy writes for a student |
| `test_results` | Diagnostic self-assessment scores (CAT/CUET Readiness) |
| `notifications` | In-app notification feed for all users |

All tables have **Row Level Security (RLS)** enabled. This means:
- A student can only read their own data — they cannot see another student's reports, even if they know the URL.
- A buddy can only read data for students assigned to them.
- The admin role can read everything.

---

## Deploying a new version

After making code changes:

```bash
npm run build    # must pass with no errors
vercel --prod    # deploy to live URL
```

Vercel auto-deploys happen if you connect the project to a GitHub repo (optional but recommended for collaboration).

---

## How to add WhatsApp notifications (Phase 3)

The engine is already wired. In `src/lib/notifications.ts`, find:
```typescript
if (channel === 'whatsapp') {
  // TODO: call WhatsApp provider (MSG91/Gupshup) — stub for Phase 3
}
```
Replace the comment with a call to your WhatsApp provider's API. You'll need:
1. A Meta-verified WhatsApp Business number
2. Pre-approved message templates
3. A provider API key (MSG91 / Gupshup / Twilio)

Then add `'whatsapp'` to the `channels` array when calling `sendNotification()`.

---

## How to replace the self-assessment tests with a real question bank (Phase 3)

Currently, questions are hard-coded in `src/app/student/exams/page.tsx` in the `generateQuestions()` function. To move them to the database:

1. Create a `questions` table in Supabase with columns: `id, test_type, category, question_text, options (jsonb), order`
2. In `exams/page.tsx`, replace `generateQuestions()` with a Supabase query
3. Admin can then add/edit questions from the database without a code deploy

---

## Common error messages and fixes

| Error | Fix |
|-------|-----|
| "Email or password incorrect" on login | Check the user exists in Supabase Authentication → Users |
| No data showing on student home | Check the `daily_reports` table in Supabase has rows for that student's ID |
| Build error "Cannot find module" | Run `npm install` then try again |
| Vercel deploy fails | Run `npm run build` locally first — it will show the exact error |
| Login works locally but not on Vercel | Check that env vars are set in Vercel dashboard → Settings → Environment Variables |

---

## Getting help

- Next.js docs: nextjs.org/docs
- Supabase docs: supabase.com/docs
- Tailwind CSS docs: tailwindcss.com/docs
- The original build document is in `C:\Users\shekh\Downloads\files for dashboard codingcode\`
