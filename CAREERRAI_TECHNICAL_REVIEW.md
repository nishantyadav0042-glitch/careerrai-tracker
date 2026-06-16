# CareerRai — Complete Technical Review Document
> Prepared for external review. Covers every feature, route, API, database table, component, hook, and integration.

---

## 1. PRODUCT OVERVIEW

**CareerRai** is a full-stack SaaS product built for Indian students preparing for the CAT (Common Admission Test) exam. It pairs each student with an IIM alumni mentor ("Buddy") who provides weekly accountability, mock test debriefs, and targeted feedback. The product differentiates itself from generic prep apps by: (a) real daily logging with a 3 AM IST boundary, (b) facts-only AI briefings for the mentor (never the student), and (c) a structured accountability loop between mentor and student.

**Business model:** Subscription (₹999/month, ₹2,499/quarter, ₹4,499/half-year). Buddy earns an agreed monthly payout per active student. Admin controls allowlist, payments, scholarships, and coupons.

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, React Server Components) |
| Language | TypeScript (strict mode) |
| UI | React 19.2.4, Tailwind CSS 4, Radix UI, Framer Motion |
| Database | Supabase PostgreSQL 17 (hosted, ap-southeast-1) |
| Auth | Supabase Auth — email OTP (primary), phone OTP (fallback) |
| AI | Google Gemini 2.5 Flash-Lite (free tier, server-side only) |
| Payments | Razorpay (Indian payment gateway) |
| Email | Resend (transactional) |
| Push | Web Push API (VAPID keys, PWA-ready) |
| Google | Google Calendar API + OAuth 2.0 (video sessions) |
| Charts | Recharts |
| Icons | Lucide React |
| Data Fetching | TanStack React Query v5 |
| SMS | MSG91 (legacy OTP fallback) |
| Deployment | Vercel (with Cron Jobs) |

---

## 3. USER ROLES

There are three roles, each with a dedicated UI and access level:

### Student
- Can only see their own data
- Logs daily prep activity (hours, sections studied, mood, emotional state)
- Views their own streak, mock debrief history, buddy feedback, chat thread
- Pays subscription to access the platform
- Goes through a 7-screen onboarding modal on first login

### Buddy (Mentor)
- IIM alumni assigned to 1–N students
- Sees all assigned students' data (via Supabase RLS policies)
- Receives AI-generated briefings (facts-only, never diagnoses)
- Records audio/text feedback, schedules video sessions via Google Calendar
- Earns a monthly payout per active student (managed by admin)

### Admin (Founder)
- Full access to all data
- Controls the student allowlist (who can sign up)
- Manages coupons, scholarships, bulk imports, payouts
- Sees admin audit log of all changes

---

## 4. ALL PAGES & ROUTES

### Student Routes (protected: role=student)

| Route | What It Does |
|---|---|
| `/student/tracker` | **Main daily tracker.** Shows streak hero card, today's log status, pending mock debrief card, daily LRDI puzzle, brain break section, buddy insight card, trajectory wall to CAT date, progress snapshot, todo list. This is the homepage after login. |
| `/student/analysis` | **Performance analytics.** Study hours trend (Recharts), mock percentile progression, confidence/stress correlation, error bucket breakdown by category, 30/60/90 day views. |
| `/student/chat` | **1:1 chat with buddy.** Realtime via Supabase subscription. Shows full thread history, send text messages, view voice notes from buddy (with playback), send text replies to voice notes. |
| `/student/buddy` | **Buddy profile panel.** Shows assigned buddy's name, college, CAT percentile, intro audio clip, upcoming scheduled session with Join button, session request button for urgent sessions. |
| `/student/buddy/history` | Past video sessions with buddy — date, type, duration, notes. |
| `/student/exams` | Log CAT/CUET official or mock exam results independently of daily logs. |
| `/student/goal` | Set/view dream colleges (multi-select), target percentile, starting percentile, is_repeater flag. |
| `/student/journey` | Chronological timeline of all reports, debriefs, sessions, and milestones. |
| `/student/profile` | Profile info, membership plan with upgrade options (Razorpay), subscription status, renewal date. |
| `/student/reports` | Paginated historical daily reports — full detail per day. |
| `/student/settings` | Notification preferences (daily reminder toggle, reminder time, email, push), push notification enable/disable. |
| `/student/onboarding/*` | 7-screen onboarding modal (first login only): Social Proof, Dream Colleges, Honesty Check, Meet Your Buddy, Baseline Test, Daily Commitment, Log Day 1. |
| `/student/debug` | Dev utility: shows full profile data, onboarding status, streak, subscription. Not linked in nav. |

### Buddy Routes (protected: role=buddy)

| Route | What It Does |
|---|---|
| `/buddy/home` | **Buddy dashboard.** Shows urgent session requests (pending), students with no log in 48h (red flag), upcoming scheduled sessions today, pending mock debriefs, triage urgency score for each student. |
| `/buddy/students` | **All assigned students.** Card per student showing: last log date, status badge (logged today/yesterday/inactive), 7-day stats (days logged, avg hours, avg stress), Readiness Score (0-100). |
| `/buddy/students/[id]` | **Individual student deep-dive.** AI briefing (last 7 days facts), mock debrief history, error bucket flags, study trend chart, recent feedback thread, voice note recorder, session scheduler, chat shortcut. |
| `/buddy/chat/[studentId]` | Full chat thread with a specific student. Same UI as student chat. |
| `/buddy/schedule` | Schedule a video session: pick student, date/time, duration, session type, auto-creates Google Calendar event with Meet link. |
| `/buddy/profile` | Buddy's own profile: name, college, CAT percentile, intro voice note recorder/playback. |
| `/buddy/settings` | Same notification preferences panel as student. |
| `/buddy/setup` | One-time setup: record intro voice note for students to hear before first session. |
| `/buddy/earnings` | Monthly payout history — period, agreed amount, active student count, status (pending/paid), payment reference. |
| `/buddy/trends` | Aggregate trends across all assigned students: avg consistency, avg percentile movement, cohort stress levels. |

### Admin Routes (protected: role=admin)

| Route | What It Does |
|---|---|
| `/admin` | **Master dashboard.** Tabs: Students, Buddies, Allowlist, Broadcast, Payments, Coupons, Scholarships. Each tab shows relevant data with actions. |
| `/admin/coupons` | Create discount codes (percent or flat ₹ off), set max uses, expiry date, view redemption count, disable. |
| `/admin/payments` | View all payment records, filter by status (created/paid/failed/refunded), plan type. |
| `/admin/scholarships` | Create founder grants — assign a student a free or discounted rate with expiry date and reason. |

### Public Routes

| Route | What It Does |
|---|---|
| `/login` | **Login page.** Two tabs: Student (email OTP via StudentPhoneLogin component), Buddy · Admin (username + password form posting to `/api/auth/login`). Demo account buttons fill credentials. Shows hint for demo mode. |
| `/goal` | Public landing or redirect. |
| `/debug` | Top-level debug utility. |

---

## 5. ALL API ROUTES (47 ENDPOINTS)

### Auth (`/api/auth/`)

**POST `/api/auth/request-otp`**
- Input: `{ email: string }`
- Rate-limited: 3 sends per 30 min per email, enforced via `otp_send_events` table
- 30-second cooldown between requests from same origin
- Checks allowlist: email must exist in `student_allowlist`
- Calls `supabase.auth.signInWithOtp({ email, shouldCreateUser: false })`
- Returns: `{ ok: true }` or error

**POST `/api/auth/verify-otp`**
- Input: `{ email: string, token: string }`
- Calls `supabase.auth.verifyOtp({ email, token, type: 'email' })`
- Hard gate: if user has no existing profile AND not on allowlist → 403
- Creates profile on first login (name + buddy_id from allowlist entry)
- Updates buddy_id on subsequent logins (allowlist change propagates)
- Sets cookies via `pending` array on `NextResponse`
- Returns: `{ ok: true, dest: '/student/tracker' }`

**POST `/api/auth/login`** (Buddy/Admin username+password)
- Input: `FormData { username: string, password: string }`
- Looks up email by username from `profiles`
- Calls `supabase.auth.signInWithPassword({ email, password })`
- Reads role from profile → redirects: student→`/student/tracker`, buddy→`/buddy/students`, admin→`/admin`
- Sets cookies, triggers 302 redirect

**POST `/api/auth/logout`**
- Calls `supabase.auth.signOut()`, clears cookies, redirects to `/login`

### Google OAuth (`/api/google/`)

**GET `/api/google/auth`**
- Builds Google OAuth URL (scopes: calendar.events + calendar.readonly, offline, prompt:consent)
- Redirects to Google consent screen

**GET `/api/google/callback`**
- Receives `code` from Google
- Exchanges code for `access_token` + `refresh_token`
- Upserts to `google_oauth_tokens` (stores refresh token, access token, expiry, google_email)
- Updates `profiles.google_calendar_connected = true`
- Redirects to `/buddy/schedule`

**POST `/api/google/disconnect`**
- Revokes Google token via `https://oauth2.googleapis.com/revoke`
- Deletes from `google_oauth_tokens`
- Updates `profiles.google_calendar_connected = false`

**POST `/api/google/setup-reminders`**
- Creates a recurring Google Calendar reminder event for student prep sessions

### Calendar (`/api/calendar/`)

**POST `/api/calendar/schedule-meeting`**
- Input: `{ studentId, scheduledAt, durationMinutes, sessionType, title?, description? }`
- Verifies buddy→student pairing
- Gets stored refresh token, auto-refreshes access token if within 60s of expiry
- Creates Google Calendar event with Google Meet link attached
- Inserts `video_sessions` row (status: scheduled)
- Sends in-app notification to student
- Returns: `{ session, meetLink }`

**PATCH `/api/calendar/cancel-meeting`**
- Input: `{ sessionId }`
- Cancels Google Calendar event via `calendar.events.delete()`
- Updates `video_sessions.session_status = 'cancelled'`
- Notifies student

**GET `/api/calendar/upcoming-meetings`**
- Returns next N sessions for the buddy (or student's upcoming session)
- Joins with student profile data

**POST `/api/calendar/complete-orientation`**
- Marks orientation session complete, updates profile flag

### Logging (`/api/logging/`)

**POST `/api/logging/log-daily`**
- Input: `{ hours: 0-6, sections: string[], energy: string, notes?: string, emotional_chips?: string[] }`
- Validates all inputs against `VALID_SECTIONS`, `VALID_ENERGY`, `VALID_EMOTIONAL_CHIPS` constants
- Rate limit: blocks if same report updated within 15 seconds
- Calls `upsert_log_and_streak()` Postgres RPC (atomic transaction):
  - Upserts `daily_reports`
  - Updates `streak_data` (current_streak, last_log_date, longest_streak)
  - Detects and handles streak resets
- Miss-recovery detection: 2+ day gap with prior streak → inserts `recovery_events`, calls `notifyBuddyRecovery()`
- Runs 6-rule prescriptive engine (`computePrescriptiveLine`): returns one coaching line based on avoidance, tunnel vision, consistency gap, emotional state, first log
- Fires 3 parallel notifications to buddy (fire-and-forget): logged, mock logged (if mock day), emotional flag (if chips ≠ all_good)
- Logs analytics event (hour_of_day, day_of_week, is_first_today)
- Returns: `{ success, streak: updatedStreakData, bonus?: string, daily_nudge?: string }`

**POST `/api/logging/mock-debrief`**
- Input: `{ log_date, overall_percentile?, varc?, dilr?, qa?, error_buckets?, strategy_note? }`
- Fetches previous debrief for delta computation
- Upserts `mock_debriefs` (one per student per log_date)
- Updates `profiles.cat_percentile` if overall_percentile provided
- Computes `insight` string: percentile delta (if ≥2 points) OR dominant error bucket, OR bare percentile
- Returns: `{ success, insight }`

**POST `/api/logging/brain-break`**
- Inserts `brain_break_logs` (game_type, score, duration_seconds)

### Chat (`/api/chat/`)

**POST `/api/chat/send`**
- Input: `{ studentId (or buddyId), body: string (max 2000 chars) }`
- Validates sender is either the student or their assigned buddy
- Inserts `chat_messages` via service-role (bypasses RLS for write)
- Returns: `{ message }`

**GET `/api/chat/read`**
- Marks all unread messages as read (`read_at = now()`)
- Returns full thread history (ordered by created_at)

**POST `/api/chat/draft`**
- AI-generated draft reply for buddy
- Fetches last 8 chat messages + 7 days logs + latest debrief
- Sends to Gemini (governing rule: facts + student data only, no advice)
- Strips student name from AI output (privacy for free-tier model)
- Returns: `{ draft: string }` (empty string if Gemini disabled)

### Voice Notes (`/api/voice-notes/`)

**POST `/api/voice-notes/send`**
- Multipart upload (max 15 MB), mime type check
- Uploads audio to Supabase Storage (`voice-notes` bucket, private)
- Inserts `buddy_feedback` row (feedback_type: voice, voice_note_url)
- Sends in-app notification to recipient

**GET `/api/voice-notes/signed-url`**
- Returns a signed URL (60-second expiry) for downloading a private audio file

**POST `/api/voice-notes/mark-read`**
- Updates `buddy_feedback.listened_at = now()`

**POST `/api/voice-notes/send-text`**
- Text reply to a voice note (inserts new `buddy_feedback` row as student_response type)

**POST `/api/voice-notes/thanks`**
- Send a "thank you" text back to buddy (student acknowledges feedback)

### Buddy Briefing (`/api/buddy/`)

**POST `/api/buddy/briefing/[studentId]`**
- Verifies buddy → student ownership
- Fetches: last 7 days' `daily_reports` + last 3 `mock_debriefs`
- Computes facts: streak, daysLogged/7, avg hours, avg confidence, avg stress, top topics, mock history with error breakdown
- Strips student name before sending to Gemini (privacy)
- Gemini prompt: "3-5 bullet points, verifiable facts only, open questions for patterns, no student name"
- Gemini result → strips name again → saves to `buddy_briefings` (upsert on student_id, buddy_id)
- Fallback (Gemini unavailable): generates rule-based text from facts
- Returns: `{ briefing: { summary_text, source: 'ai'|'fallback', generated_at } }`

**GET `/api/buddy/briefing/[studentId]`**
- Returns existing briefing from `buddy_briefings`

**POST `/api/buddy/feedback`**
- Logs text or voice feedback from buddy to student

### Sessions (`/api/sessions/`)

**POST `/api/sessions/request`**
- Student sends urgent session request message
- Validates student → buddy pairing
- Inserts `session_requests` (status: pending)
- Notifies buddy via in-app notification

**PATCH `/api/sessions/request`**
- Buddy resolves the request
- Updates `session_requests.status = 'resolved'`, `resolved_at = now()`

### Payments (`/api/payments/`)

**POST `/api/payments/create-order`**
- Input: `{ plan: 'monthly'|'quarterly'|'halfyear', couponCode?: string }`
- Resolves price hierarchy: scholarship (active? → use scholarship price) > coupon (valid? → apply discount) > base price
- If final price < ₹1 (100 paise): activates subscription directly, no Razorpay
- Otherwise: creates Razorpay order (`razorpay.orders.create()`)
- Inserts `student_payments` row (status: created)
- Returns: `{ orderId, amount, currency, key }` for Razorpay checkout

**POST `/api/payments/webhook`**
- Receives Razorpay payment events
- Verifies HMAC-SHA256 signature with `RAZORPAY_WEBHOOK_SECRET`
- On `payment.captured`: flip payment to 'paid', activate subscription on profile, burn coupon (increment `used_count`)
- On `payment.failed`: flip payment to 'failed'

**POST `/api/payments/request-refund`**
- Records refund request in `student_payments.notes` (manual founder approval)

### Admin APIs (`/api/admin/`)

**POST `/api/admin/allowlist`**
- Add or update allowlist entry (email, full_name, assigned_buddy_id)
- Logs admin action to `admin_audit_log`

**POST `/api/admin/broadcast`**
- Sends in-app notification + optional email to all students or specific cohort
- Uses Resend for email delivery

**POST `/api/admin/bulk-import`**
- Accepts CSV file upload (multipart)
- Required columns: full_name, email, phone, role
- Optional: exam_target, buddy_email, username, password
- First pass: creates auth users OR updates passwords for existing users
- Second pass: assigns buddies to students by buddy_email
- Returns: `{ summary, created[], errors[], buddyErrors[] }`
- Logs to `admin_audit_log`

**POST `/api/admin/assign-buddy`**
- Updates `profiles.buddy_id` for a student

**POST `/api/admin/coupons`**
- Create: insert `coupons` (code, discount_type, discount_value, max_uses, expires_at)
- List: fetch all coupons with redemption counts
- Disable: set status = 'disabled'

**POST `/api/admin/scholarships`**
- Create founder scholarship for specific student (discount_percent OR final_price_paise, expires_at, reason)
- Inserts `scholarships` row (status: active)

**GET/POST `/api/admin/payouts`**
- GET: compute pending payouts (active students per buddy × agreed_monthly_payout)
- POST: mark period as paid (period=YYYY-MM, buddy_id, payment_ref)

### Profiles & Notifications

**POST `/api/profiles/notif-prefs`**
- Updates `profiles.notif_prefs` JSONB (daily_reminder, reminder_time, email, push)

**POST `/api/push/subscribe`**
- Saves push subscription object (endpoint + keys) to `profiles.push_subscription`

### Scorecard Parsing

**POST `/api/parse-scorecard`**
- Input: `{ image: base64string, mediaType: 'image/jpeg'|'image/png'|'image/webp'|'image/gif' }`
- Allowed types only, max 5.5 MB base64
- Rate limit: 30 scans/user/hour (checked via `analytics_events` count)
- Sends image to Gemini with extraction prompt (CAT scorecard → JSON)
- Only counts toward rate limit AFTER successful AI response
- Returns: `{ scorecard: { is_scorecard, mock_name, overall_percentile, overall_score, varc, dilr, qa } }`

### Cron Jobs (`/api/cron/`) — Vercel Scheduled

All cron routes require `Authorization: Bearer ${CRON_SECRET}` header.

**POST `/api/cron/daily-reminder`** — 20:30 UTC (2 AM IST)
- Fetches students with `notif_prefs.daily_reminder = true`
- Checks who hasn't logged today (IST date comparison)
- Sends push + email reminder for each

**POST `/api/cron/weekly-digest`** — Mondays 6:00 AM UTC
- For each buddy: summarize last 7 days for each student
- Send email digest to buddy with student statuses

**POST `/api/cron/check-red-flags`** — Nightly
- For each active student: compute `AnalyticsSummary` red flags
- Flags: streak_broken, avg_hours < threshold, stress > 4, mock_drop > 8pts, performance < 30%ile
- If flags exist AND buddy not alerted in last 24h: create notification + send email

**POST `/api/cron/expire-subscriptions`** — Daily
- Checks `profiles.subscription_renews_at < now()`
- Sets `subscription_status = 'expired'` for lapsed subs

**POST `/api/cron/renewal-reminders`** — Daily
- Finds subscriptions expiring in next 7 days
- Sends renewal reminder email via Resend

---

## 6. DATABASE SCHEMA (30+ Tables)

### `profiles`
Central user table. One row per user of any role.
```
id                    UUID PRIMARY KEY (matches auth.users.id)
role                  TEXT CHECK IN ('student', 'buddy', 'admin')
full_name             TEXT
phone                 TEXT
email                 TEXT
username              TEXT UNIQUE
exam_target           TEXT (e.g., 'CAT 2026')
buddy_id              UUID FK → profiles.id (NULL for buddy/admin)
created_at            TIMESTAMPTZ
avatar_seed           TEXT
notif_prefs           JSONB { daily_reminder, reminder_time, email, push }
push_subscription     JSONB (Web Push endpoint + keys)
dream_colleges        TEXT[]
is_repeater           BOOLEAN
starting_percentile   NUMERIC
hours_available       NUMERIC
study_target_hours    NUMERIC
shadow_rival_id       UUID FK → profiles.id (gamification)
section_elo           JSONB { varc, dilr, qa }
subscription_status   TEXT ('free_beta'|'active'|'expired'|'cancelled')
subscription_plan     TEXT ('monthly'|'quarterly'|'halfyear')
subscription_renews_at TIMESTAMPTZ
agreed_monthly_payout NUMERIC (buddy's payout rate)
cat_percentile        NUMERIC (latest mock percentile, updated on debrief)
target_percentile     NUMERIC (student's goal)
google_calendar_connected BOOLEAN
intro_audio_url       TEXT (buddy's intro recording)
college               TEXT (buddy's IIM)
current_streak        INTEGER
best_streak           INTEGER
last_log_date         DATE
total_logs_completed  INTEGER
free_onboarding_used  BOOLEAN
onboarding_completed  BOOLEAN DEFAULT FALSE
is_demo               BOOLEAN DEFAULT FALSE (marks demo accounts)
```

### `daily_reports`
One row per student per day. Core logging table.
```
id                UUID PRIMARY KEY
student_id        UUID FK → profiles.id
report_date       DATE
study_duration    NUMERIC (hours, 0-6)
topics_covered    TEXT[] ('VARC'|'DILR'|'QA'|'Mock'|'Revision')
quality_focus     INTEGER 1-5
difficulty        INTEGER 1-5
mock_taken        BOOLEAN
mock_name         TEXT
quant_score       NUMERIC
verbal_score      NUMERIC
logic_score       NUMERIC
total_accuracy    NUMERIC
confidence        INTEGER 1-5
stress            INTEGER 1-5
sleep_quality     INTEGER 1-5
nutrition_exercise TEXT
overall_energy    INTEGER 1-5
notes             TEXT
mood_emoji        TEXT (energy level: 🙏/💪/🔥)
emotional_chips   TEXT[] ('mock_scared'|'burned_out'|'comparing'|'family_pressure'|'lost_confidence'|'feeling_behind'|'all_good')
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
UNIQUE (student_id, report_date)
```

### `mock_debriefs`
Detailed post-mock analysis. One per student per date.
```
id                UUID PRIMARY KEY
student_id        UUID FK → profiles.id
taken_on          DATE
log_date          DATE
overall_percentile NUMERIC
varc              JSONB { attempted, correct, time_min, percentile }
dilr              JSONB { attempted, correct, time_min, percentile }
qa                JSONB { attempted, correct, time_min, percentile }
error_buckets     JSONB {
                    conceptual: INT  (knowledge gap)
                    silly: INT       (execution error)
                    time: INT        (time misallocation)
                    panic: INT       (misread/framing error)
                    selection: INT   (should not have attempted)
                  }
strategy_note     TEXT
mock_name         TEXT
created_at        TIMESTAMPTZ
UNIQUE (student_id, log_date)
```

### `buddy_feedback`
All feedback records: text, voice, student responses.
```
id              UUID PRIMARY KEY
buddy_id        UUID FK → profiles.id
student_id      UUID FK → profiles.id
feedback_date   DATE
feedback_text   TEXT
voice_note_url  TEXT (Supabase Storage path)
listened_at     TIMESTAMPTZ
feedback_type   TEXT CHECK IN ('text'|'voice'|'buddy_note'|'student_response')
rating          INTEGER
next_steps      TEXT[]
period_covered  TEXT ('weekly'|'adhoc'|'monthly')
created_at      TIMESTAMPTZ
```

### `chat_messages`
1:1 buddy-student messages. Strict RLS isolation.
```
id          UUID PRIMARY KEY
student_id  UUID FK → profiles.id
buddy_id    UUID FK → profiles.id
sender_id   UUID FK → profiles.id (who sent it)
body        TEXT (max 2000 chars)
created_at  TIMESTAMPTZ
read_at     TIMESTAMPTZ (NULL = unread)
```
Realtime publication enabled. RLS: sender OR recipient only.

### `streak_data`
One row per student, updated atomically with daily_reports.
```
id              UUID PRIMARY KEY
student_id      UUID FK → profiles.id UNIQUE
current_streak  INTEGER DEFAULT 0
longest_streak  INTEGER DEFAULT 0
last_log_date   DATE
milestone_sent_7  BOOLEAN DEFAULT FALSE
milestone_sent_21 BOOLEAN DEFAULT FALSE
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### `streak_shields`
2 shields per month. Allow skipping 1 day without streak reset.
```
id          UUID PRIMARY KEY
student_id  UUID FK → profiles.id
used_on     DATE
granted_by  UUID FK → profiles.id (buddy or self)
reason      TEXT ('student_used'|'buddy_granted')
created_at  TIMESTAMPTZ
```

### `recovery_events`
Tracks students who lapse then return (2+ day gap).
```
id               UUID PRIMARY KEY
student_id       UUID FK → profiles.id
missed_days      INTEGER
previous_streak  INTEGER
created_at       TIMESTAMPTZ
```

### `video_sessions`
Scheduled Google Meet sessions.
```
id                    UUID PRIMARY KEY
student_id            UUID FK → profiles.id
buddy_id              UUID FK → profiles.id
title                 TEXT
description           TEXT
google_meet_link      TEXT
google_event_id       TEXT
session_status        TEXT ('scheduled'|'active'|'completed'|'cancelled')
session_type          TEXT ('session'|'review'|'doubt_solving'|'mock_review')
duration_minutes      INTEGER (20|30|45|60)
scheduled_at          TIMESTAMPTZ
started_at            TIMESTAMPTZ
ended_at              TIMESTAMPTZ
last_session_date     DATE
days_since_last_session INTEGER
student_notified      BOOLEAN
buddy_notified        BOOLEAN
reminder_sent         BOOLEAN
notes                 TEXT
created_at            TIMESTAMPTZ
updated_at            TIMESTAMPTZ
```

### `video_session_history`
Audit trail for session status changes.
```
id          UUID PRIMARY KEY
session_id  UUID FK → video_sessions.id
event_type  TEXT ('created'|'scheduled'|'started'|'completed'|'cancelled'|'reminder_sent')
event_data  JSONB
created_at  TIMESTAMPTZ
```

### `session_requests`
Urgent help requests from students.
```
id          UUID PRIMARY KEY
student_id  UUID FK → profiles.id
buddy_id    UUID FK → profiles.id
message     TEXT
status      TEXT ('pending'|'resolved')
resolved_at TIMESTAMPTZ
created_at  TIMESTAMPTZ
```

### `notifications`
In-app notification inbox.
```
id          UUID PRIMARY KEY
user_id     UUID FK → profiles.id
type        TEXT ('student_logged'|'mock_logged'|'emotional_flag'|'student_recovered'|'red_flag'|'session_scheduled'|...)
title       TEXT
body        TEXT
data        JSONB (arbitrary payload)
read        BOOLEAN DEFAULT FALSE
channel     TEXT ('in_app'|'email'|'push')
link_url    TEXT (optional deep link)
created_at  TIMESTAMPTZ
```

### `student_allowlist`
Controls who can sign up via OTP.
```
id                  UUID PRIMARY KEY
email               TEXT UNIQUE
phone               TEXT
full_name           TEXT
added_by            UUID FK → profiles.id (admin)
assigned_buddy_id   UUID FK → profiles.id
status              TEXT ('active'|'paused')
created_at          TIMESTAMPTZ
```
RLS: enabled, no student-readable policies (service-role only writes).

### `otp_send_events`
Rate-limit tracking for OTP sends.
```
id       UUID PRIMARY KEY
phone    TEXT
email    TEXT
sent_at  TIMESTAMPTZ
```

### `google_oauth_tokens`
Per-buddy Google Calendar credentials.
```
id               UUID PRIMARY KEY
user_id          UUID FK → profiles.id UNIQUE
refresh_token    TEXT (encrypted at rest by Supabase)
access_token     TEXT
token_expires_at TIMESTAMPTZ
google_email     TEXT
updated_at       TIMESTAMPTZ
```

### `student_payments`
Payment records (Razorpay + manual).
```
id                    UUID PRIMARY KEY
student_id            UUID FK → profiles.id
amount                INTEGER (paise, after discount)
original_amount       INTEGER (paise, before discount)
plan                  TEXT ('monthly'|'quarterly'|'halfyear')
discount_source       TEXT ('coupon'|'scholarship'|NULL)
coupon_code           TEXT
razorpay_order_id     TEXT
razorpay_payment_id   TEXT
status                TEXT ('created'|'paid'|'failed'|'refunded')
paid_at               TIMESTAMPTZ
created_at            TIMESTAMPTZ
```

### `coupons`
Discount codes.
```
id             UUID PRIMARY KEY
code           TEXT UNIQUE
discount_type  TEXT ('percent'|'flat')
discount_value NUMERIC
max_uses       INTEGER (NULL = unlimited)
used_count     INTEGER DEFAULT 0
status         TEXT ('active'|'disabled')
expires_at     TIMESTAMPTZ
created_at     TIMESTAMPTZ
```

### `coupon_redemptions`
Prevents double-use per student.
```
id          UUID PRIMARY KEY
coupon_id   UUID FK → coupons.id
student_id  UUID FK → profiles.id
payment_id  UUID FK → student_payments.id
created_at  TIMESTAMPTZ
UNIQUE (coupon_id, student_id)
```

### `scholarships`
Founder grants (free or discounted access).
```
id               UUID PRIMARY KEY
student_id       UUID FK → profiles.id
discount_percent NUMERIC
final_price_paise INTEGER (overrides all other pricing)
status           TEXT ('active'|'expired')
expires_at       TIMESTAMPTZ
reason           TEXT
created_by       UUID FK → profiles.id (admin)
created_at       TIMESTAMPTZ
```

### `buddy_payouts`
Monthly buddy earnings tracking.
```
id                   UUID PRIMARY KEY
buddy_id             UUID FK → profiles.id
period               TEXT (YYYY-MM)
agreed_amount        NUMERIC (rupees)
active_student_count INTEGER
status               TEXT ('pending'|'paid')
paid_date            DATE
payment_ref          TEXT
created_at           TIMESTAMPTZ
UNIQUE (buddy_id, period)
```

### `buddy_briefings`
AI-generated mentor summaries (student never sees these).
```
id            UUID PRIMARY KEY
student_id    UUID FK → profiles.id
buddy_id      UUID FK → profiles.id
summary_text  TEXT (3-5 bullet points, facts only)
source        TEXT ('ai'|'fallback')
generated_at  TIMESTAMPTZ
UNIQUE (student_id, buddy_id)
```

### `mock_drop_alerts`
Triggered when percentile drops >8 points.
```
id                   UUID PRIMARY KEY
student_id           UUID FK → profiles.id
previous_percentile  NUMERIC
current_percentile   NUMERIC
drop_points          NUMERIC
test_score           NUMERIC
triggered_at         TIMESTAMPTZ
buddy_notified       BOOLEAN
```

### `daily_lrdi_puzzles`
One puzzle per day for all students.
```
id                      UUID PRIMARY KEY
puzzle_date             DATE UNIQUE
puzzle_type             TEXT ('seating'|'blood_relation'|'constraint'|'arrangement'|'logic')
puzzle_content          JSONB (puzzle body — question, clues, options)
difficulty              INTEGER 1-10
difficulty_description  TEXT
estimated_time_minutes  INTEGER
solution                TEXT
explanation             TEXT
created_at              TIMESTAMPTZ
```

### `lrdi_puzzle_attempts`
Student attempt tracking (one per student per puzzle).
```
id                   UUID PRIMARY KEY
student_id           UUID FK → profiles.id
puzzle_id            UUID FK → daily_lrdi_puzzles.id
solved               BOOLEAN
time_taken_seconds   INTEGER
accuracy             NUMERIC
submitted_at         TIMESTAMPTZ
UNIQUE (student_id, puzzle_id)
```

### `todo_items`
Student to-do list (buddy-suggested + self-created).
```
id           UUID PRIMARY KEY
student_id   UUID FK → profiles.id
title        TEXT
description  TEXT
category     TEXT ('buddy_suggested'|'student_custom'|'daily_puzzle'|'mock_review'|'session')
due_date     DATE
due_time     TIME
priority     NUMERIC (-1 to 1)
completed_at TIMESTAMPTZ
created_by   UUID FK → profiles.id
created_at   TIMESTAMPTZ
updated_at   TIMESTAMPTZ
```

### `analytics_events`
Behavioral event tracking.
```
id          UUID PRIMARY KEY
student_id  UUID FK → profiles.id
event_type  TEXT ('log_submitted'|'scorecard_parse'|...)
metadata    JSONB
created_at  TIMESTAMPTZ
```
Also used for rate-limiting scorecard scans (30/hr/user).

### `brain_break_logs`
Mini-game session logs.
```
id               UUID PRIMARY KEY
student_id       UUID FK → profiles.id
game_type        TEXT ('math_sprint'|'pattern_lock'|'memory_grid'|'sudoku_blitz')
score            INTEGER
duration_seconds INTEGER
played_at        TIMESTAMPTZ
```

### `admin_audit_log`
Immutable record of all admin actions.
```
id          UUID PRIMARY KEY
admin_id    UUID FK → profiles.id
action      TEXT ('bulk_import'|'assign_buddy'|'create_coupon'|...)
target_type TEXT
target_id   UUID (nullable)
metadata    JSONB
created_at  TIMESTAMPTZ
```

### `server_config`
Server-side key-value config (not exposed to client).
```
key        TEXT PRIMARY KEY (e.g., 'GEMINI_API_KEY')
value      TEXT
updated_at TIMESTAMPTZ
```

---

## 7. DATABASE FUNCTIONS / RPC

### `upsert_log_and_streak(p_student_id, p_report_date, p_study_duration, p_topics_covered, p_mood_emoji, p_mock_taken, p_notes, p_emotional_chips)`
The most critical function. Runs inside a Postgres transaction:
1. Inserts or updates `daily_reports`
2. Reads current `streak_data`
3. Computes new streak:
   - If `last_log_date` was yesterday → increment streak
   - If `last_log_date` was today (re-log) → no change
   - If gap ≥ 2 days (check streak shield first) → reset streak to 1
4. Updates `streak_data` atomically
5. Returns updated streak object

### `increment_coupon_use(p_coupon_id)`
Increments `coupons.used_count` atomically (avoids race conditions on concurrent payments).

---

## 8. KEY COMPONENTS

### DailyTracker Suite (`src/components/DailyTracker/`)

**`DailyTrackerApp.tsx`** — Master shell for `/student/tracker`. Renders:
- `HeroCard` (streak)
- `LoggingModal` trigger button
- `PendingDebriefCard` (if mock logged but no debrief)
- `DailyPuzzleCard` (today's LRDI puzzle)
- `BrainBreakCard` (mental reset games)
- `BuddyInsightCard` (AI briefing snippet)
- `ProgressSnapshot` (weekly stats)
- `TodoListSection`
- `TrajectoryWall` (days remaining to CAT)

**`LoggingModal.tsx`** — The core daily log form:
- Hours selector (0-6, integer steps)
- Section chips: VARC, DILR, QA, Mock, Revision (multi-select)
- Energy level: 🙏 (low), 💪 (good), 🔥 (intense)
- Emotional chip picker: mock_scared, burned_out, comparing, family_pressure, lost_confidence, feeling_behind, all_good
- Notes text area
- Submit → POST `/api/logging/log-daily`
- On success: shows `FeedbackAnimation`, updates streak display

**`MockDebriefModal.tsx`** — Post-mock entry form:
- Date picker
- Overall percentile input
- Per-section (VARC/DILR/QA): attempted, correct, time spent (minutes), sectional percentile
- Error classification (5 buckets):
  - Knowledge gap (conceptual: concept or formula not known)
  - Execution error (silly: concept clear, error in working steps)
  - Time misallocation (time: insufficient time allocated)
  - Misread / framing error (panic: question or data misinterpreted)
  - Selection error (selection: question should not have been attempted)
- Corrective action (strategy note) text area
- Submit → POST `/api/logging/mock-debrief`
- On success: shows AI-computed insight string

**`TrajectoryWall.tsx`** — Visual countdown: days to CAT exam (Nov 29, 2026), percentage of prep time elapsed, milestone markers.

**`BuddyInsightCard.tsx`** — Shows the latest AI briefing snippet (last 7-day summary bullet points). Students see their own briefing; buddy sees an editable version.

**`ProgressSnapshot.tsx`** — Quick stats widget: days logged this week, avg hours, avg confidence, date of last buddy session.

**`DailyPuzzleCard.tsx`** / **`PuzzleSolverModal.tsx`** — Fetches today's LRDI puzzle. Student picks difficulty, attempts inside a modal with a countdown timer. Solution reveals on submit or timeout.

**`BrainBreakCard.tsx`** + game modals — 4 mini-games: Math Sprint (rapid arithmetic), Pattern Lock (visual pattern), Memory Grid (sequence memory), Sudoku Blitz (mini sudoku). Scores logged to `brain_break_logs`.

**`SafeCard.tsx`** — Streak shield UI. Shows shields remaining (2/month), use button.

**`MissRecoveryModal.tsx`** — Shown when student logs after 2+ day gap. Celebrates the comeback, shows missed_days and prior streak as context.

### Student Analysis (`src/app/student/analysis/`)

**`page.tsx`** — Server component fetching all reports + debriefs. Passes to client for charting.
- Study hours bar chart (Recharts) — 30 day view
- Mock percentile line chart — chronological
- Confidence vs. stress scatter/correlation
- Error bucket breakdown (horizontal bar: knowledge-gap, execution, time-misallocation, misread, selection)
- Key metrics cards: avg hours, total mocks, avg confidence, trend indicators

### Buddy Student View (`src/app/buddy/students/[id]/`)

**`page.tsx`** — Deep-dive for one student:
- AI Briefing section: generate/refresh button, displays `buddy_briefings.summary_text`
- Red flag indicators: computed from last mock's error_buckets (if execution errors dominant → flag)
- Study trend mini-chart (last 14 days hours)
- Mock history (last 5 debriefs with percentile + error breakdown)
- Feedback thread (voice + text chronological)
- Voice note recorder
- Session scheduler widget
- Chat shortcut button
- Urgency score badge

### Chat (`src/components/chat/`)

**`chat-thread.tsx`** — Realtime chat UI:
- Subscribes to Supabase realtime channel `chat_messages:student_id=eq.{id}`
- Fetches history on mount (GET `/api/chat/read`)
- Sends on Enter or button (POST `/api/chat/send`)
- Shows timestamp, sender label, read receipt (read_at)
- Voice note playback inline (signed URL fetched per note)
- AI Draft button (POST `/api/chat/draft` → pre-fills input with suggested reply)

### Payments (`src/components/membership-card.tsx`)

Displays 3 plan tiers:
- Monthly: ₹999
- Quarterly: ₹2,499 (₹833/mo)
- Half-year: ₹4,499 (₹750/mo, most popular)

Coupon code input → validates before checkout. Shows scholarship price if active.

Opens Razorpay checkout modal on purchase → on success calls webhook flow.

---

## 9. HOOKS

**`useLogging.ts`**
- Manages all client-state for the daily log form
- Reads streak data (server-seeded as initial state)
- `submitLog(payload)` → POST, returns `{ success, streak, daily_nudge, bonus }`
- Detects `hasLoggedToday` (3 AM IST boundary via `getLogDateString()`)
- Exposes: `currentStreak`, `maxStreak`, `shieldsRemaining`, `hasLoggedToday`, `isSubmitting`

**`useOnboarding.ts`**
- Checks `profiles.onboarding_completed` on mount
- Returns `{ needsOnboarding: boolean, isLoading: boolean }`
- Used in `StudentHomeClient` to conditionally show `OnboardingModal`

**`useDailyPuzzle.ts`**
- Fetches today's LRDI puzzle from `daily_lrdi_puzzles` (by puzzle_date = today IST)
- Checks existing attempt from `lrdi_puzzle_attempts`
- Returns `{ puzzle, attempt, submitAttempt(data), isLoading }`

**`usePushNotifications.ts`**
- Registers service worker
- Requests browser push permission
- Subscribes via `navigator.serviceWorker.pushManager.subscribe()`
- POSTs subscription to `/api/push/subscribe`
- Returns `{ isSubscribed, subscribe(), unsubscribe() }`

**`useRealtimeUpdates.ts`**
- Subscribes to multiple Supabase channels
- Channel: `notifications:user_id=eq.{userId}` → new in-app notifications
- Channel: `chat_messages:...` → new messages
- Calls `onNewNotification`, `onNewMessage` callbacks on events

**`useOfflineSync.ts`**
- Listens to `navigator.onLine` events
- Queues POST requests in localStorage when offline
- Replays queue on reconnect
- Covers: daily logs, voice sends (text-only), session requests

**`useMockDropCheck.ts`**
- After each debrief submit, checks if drop > 8 percentile points vs. previous
- Sets `showDropIntervention: boolean`
- Used to conditionally render `MockDropIntervention` component

---

## 10. LIB UTILITIES

**`src/lib/gemini.ts`** — Gemini API client:
- `callGemini({ parts, system, json, maxTokens, temperature, model, maxRetries })` → `string | null`
- Exponential backoff on 429/5xx (400ms × 2^attempt + jitter)
- Module-level `_keyCache` (cached after successful DB lookup, not on error)
- `GOVERNING_RULE` constant: AI may ONLY summarize/organize/draft. Never diagnose, recommend, or teach.
- `stripNames(text, names[])` — strips all name tokens before sending to free-tier Gemini
- `extractJson<T>(raw)` — tolerant JSON extraction (strips ``` fences, slices to `{...}`)
- `geminiEnabled()` → checks env var first, falls back to `server_config` table

**`src/lib/analytics.ts`** — `computeSummary(reports, debriefs)`:
- Returns `AnalyticsSummary`: avgStudy, totalMocks, avgMockScore, avgConfidence, avgStress, studyTrend, band, redFlags[]

**`src/lib/analytics-advanced.ts`**:
- `analyzeMockTrend()` — direction + magnitude of recent percentile movement
- `analyzeConfidenceStressCorrelation()` — Pearson-like correlation coefficient
- `studyIntensityPattern()` — peak days, slump days, pattern string
- `CATReadiness()` — 0-100 composite score (streak, hours, mock trend, confidence)

**`src/lib/urgency-score.ts`** — `calculateUrgencyScore(student)`:
- Composite 0-100 score for buddy triage
- Factors: days since last log, broken streak, mock drop, feedback lag, low performance band
- Maps to color: red (≥70), amber (≥40), green (<40)

**`src/lib/streak-utils.ts`**:
- `getLogDateString()` — current date in IST using 3 AM boundary (students can log until 3 AM)
- `VALID_SECTIONS`: ['VARC', 'DILR', 'QA', 'Mock', 'Revision']
- `VALID_ENERGY`: ['low', 'medium', 'high'] (stored as emoji in UI)
- `VALID_EMOTIONAL_CHIPS`: ['mock_scared', 'burned_out', 'comparing', 'family_pressure', 'lost_confidence', 'feeling_behind', 'all_good']

**`src/lib/pricing.ts`**:
- Plan prices: monthly=₹999, quarterly=₹2499, halfyear=₹4499
- `resolvePrice(plan, studentId)` — checks scholarship → coupon → base price
- MIN_CHARGE_PAISE = 100 (₹1 minimum for Razorpay)

**`src/lib/google-calendar.ts`**:
- `getCalendarClient(userId)` — returns authenticated `google.calendar` client
- Auto-refreshes token if within 60s of expiry, persists new token
- `buildAuthUrl()` — Google consent URL with calendar scopes
- `extractMeetLink(event)` — extracts Meet URL from event conferenceData

**`src/lib/auth.ts`** — `getAuthUser()`:
- Uses `cache()` from React for per-request deduplication
- Reads JWT claims locally (no DB round-trip on every request)

**`src/lib/mock-drop-utils.ts`**:
- `detectMockDrop(percentiles: number[])` — checks if latest vs. previous > 8 points drop
- `getDropMessage(drop)` — returns contextual alert string for buddy

**`src/lib/cat-percentile-data.ts`**:
- Lookup table mapping CAT raw scores to percentiles (historical data)
- Used in analysis charts for percentile context

---

## 11. ONBOARDING FLOW (7 Screens)

Shown as a modal on first login. Can be skipped (screen > 0 marks `onboarding_completed`; skipping at screen 0 does NOT permanently suppress it).

1. **Screen 0 — Social Proof** (`ScreenSocialProof`)
   - 3 internal slides (own navigation, tab bar): Students, Buddy, Progress
   - Shows: active student cards with streak dots, sample buddy profile, percentile progression chart
   - CTA: "I want this too →" (advances to screen 1)

2. **Screen 1 — Dream Colleges** (`ScreenDreamColleges`)
   - Multi-select from preset list of IIMs + FMS + MDI + XLRI
   - Saved immediately to `profiles.dream_colleges`

3. **Screen 2 — Honesty Check** (`ScreenHonesty`)
   - Is this a repeat attempt? (boolean)
   - Current approximate percentile (starting_percentile)
   - Hours available per day (hours_available)
   - Saved to `profiles.is_repeater`, `starting_percentile`, `hours_available`

4. **Screen 3 — Meet Your Buddy** (`ScreenMeetBuddy`)
   - Shows assigned buddy's name, college, CAT score, intro voice note player
   - Informational — no data collected

5. **Screen 4 — Baseline Test** (`ScreenBaselineTest`)
   - Encourage student to take a baseline sectional mock
   - Provides link to recommended free mock

6. **Screen 5 — Daily Commitment** (`ScreenDailyCommitment`)
   - Slider: hours/day commitment (1-6)
   - Saved to `profiles.study_target_hours` on final complete

7. **Screen 6 — Log Day 1** (`ScreenLogDayOne`)
   - Mini logging form (first log)
   - On submit: logs via `/api/logging/log-daily`, sets `onboarding_completed = true`

---

## 12. AI INTEGRATION (Gemini)

**Model:** `gemini-2.5-flash-lite` (free tier, not Pro)

**Governing Rule (every request):** AI may ONLY summarize, organize, extract, and draft. It may NEVER diagnose a cause, name a "weakness type", label a concept gap, or recommend any action. Interpretation is the buddy's job — the product moat.

**3 AI Features:**

1. **Buddy Briefing** (POST `/api/buddy/briefing/[studentId]`)
   - Input: 7-day facts (streak, hours, stress, topics, mock history)
   - Output: 3-5 bullet points of verifiable facts + open questions for notable patterns
   - Student name stripped before sending (privacy for free-tier model)
   - Saved to `buddy_briefings` (upsert), source marked 'ai' or 'fallback'
   - Fallback: rule-based text from same facts if Gemini unavailable

2. **Chat Draft** (POST `/api/chat/draft`)
   - Input: last 8 messages + 7-day activity snapshot
   - Output: 2-3 sentence warm reply suggestion for buddy
   - Student messages fenced as `<thread>DATA</thread>` (prompt injection defense)
   - Names stripped from both input and output

3. **Scorecard Parse** (POST `/api/parse-scorecard`)
   - Input: base64 image of mock scorecard
   - Output: JSON `{ overall_percentile, varc, dilr, qa, mock_name }`
   - Rate limited: 30 scans/user/hour
   - Returns 503 on Gemini failure (not 422) so client shows "try again" not "invalid"

---

## 13. PAYMENT FLOW

### Price Resolution (in order of priority)
1. **Scholarship** (admin-created, student-specific): if active + not expired → use `final_price_paise`
2. **Coupon**: if valid code, not expired, max_uses not hit, not used by this student → apply discount
3. **Base price**: monthly=99900, quarterly=249900, halfyear=449900 (in paise)

### Checkout Flow
1. `POST /api/payments/create-order` → resolves price → if < ₹1: activate directly → else: Razorpay order
2. Client opens Razorpay checkout with `key_id` + `order_id`
3. Student pays on Razorpay (UPI/card/netbanking)
4. Razorpay sends POST to `/api/payments/webhook`
5. Webhook: verify HMAC-SHA256 signature → flip payment status → update profile subscription → burn coupon

### Subscription States
- `free_beta` — default
- `active` — paid and valid
- `expired` — renewal date passed (cron flips this)
- `cancelled` — manual

---

## 14. SECURITY MODEL

| Threat | Mitigation |
|---|---|
| Unauthorized sign-up | Allowlist gate: email must be in `student_allowlist` to get OTP |
| OTP brute force | Rate limit: 3 requests/30 min/email, 30s cooldown |
| Non-allowlist new user via OTP | Hard gate in verify-otp: `!existing && !entry → 403` |
| Cross-student data access | Supabase RLS: student can only SELECT own rows |
| Buddy seeing other buddy's students | RLS: buddy reads only rows where `buddy_id = auth.uid()` |
| Service-role abuse | Admin client never exposed to client, only in API routes |
| Payment replay/forgery | Razorpay HMAC-SHA256 webhook signature verification |
| AI prompt injection | Chat messages fenced as `<thread>DATA</thread>`, governing rule in system prompt |
| Name leakage to free AI | `stripNames()` applied to both input and output before/after Gemini |
| Coupon double-use | `UNIQUE (coupon_id, student_id)` + atomic `increment_coupon_use()` RPC |
| Scorecard scanner abuse | 30 scans/hour/user enforced via `analytics_events` count |
| Admin data exposure | All admin API routes verify `role === 'admin'` via service-role client |
| Cron endpoint abuse | `Authorization: Bearer CRON_SECRET` required on all `/api/cron/*` |
| Voice note unauthorized access | Signed URLs only (60s expiry), private Supabase Storage bucket |

---

## 15. DEMO DATA

7 demo accounts. All sign in via the "Buddy · Admin" tab with password `CareerRai2026!`.

| Username | Persona | Role |
|---|---|---|
| `aarav` | 79→94%ile in 30 days, high-growth arc | Student |
| `priya` | First-timer, 62→74%ile | Student |
| `rohan` | Thriving at 97%ile | Student |
| `meera` | Lapsed, needs attention | Student |
| `arjun` | Brand new, 2 days in | Student |
| `nishant` | IIM-A + Bain alum mentor | Buddy |
| `admin` | Platform admin | Admin |

All demo profiles have `is_demo = true`. The `Demo` badge is shown in student/buddy layouts when `is_demo = true`.

---

## 16. CRON SCHEDULE (vercel.json)

| Cron Expression | Endpoint | What It Does |
|---|---|---|
| `30 20 * * *` | `/api/cron/daily-reminder` | 2 AM IST: remind students who haven't logged |
| `0 6 * * 1` | `/api/cron/weekly-digest` | Monday 11:30 AM IST: buddy weekly summary email |
| `0 18 * * *` | `/api/cron/check-red-flags` | 11:30 PM IST: scan for red flags, alert buddies |
| `0 0 * * *` | `/api/cron/expire-subscriptions` | Midnight UTC: expire lapsed subscriptions |
| `0 1 * * *` | `/api/cron/renewal-reminders` | 1 AM UTC: 7-day renewal warning emails |

---

## 17. ENVIRONMENT VARIABLES

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | YES | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | YES | Anon key (safe for client) |
| `SUPABASE_SERVICE_ROLE_KEY` | YES | Service role (server-only, bypasses RLS) |
| `NEXT_PUBLIC_APP_URL` | YES | Base URL (must match OAuth redirect URI exactly) |
| `GOOGLE_CLIENT_ID` | YES (Calendar) | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | YES (Calendar) | Google OAuth client secret |
| `GEMINI_API_KEY` | YES (AI features) | Gemini Flash-Lite API key |
| `GEMINI_MODEL` | Optional | Override model name (default: gemini-2.5-flash-lite) |
| `RESEND_API_KEY` | YES (email) | Transactional email (silent fail without it) |
| `MSG91_AUTH_KEY` | YES (SMS OTP) | SMS gateway |
| `MSG91_OTP_TEMPLATE_ID` | YES (SMS OTP) | SMS template |
| `MSG91_SENDER_ID` | YES (SMS OTP) | SMS sender ID |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | YES (push) | Web Push public key |
| `VAPID_PRIVATE_KEY` | YES (push) | Web Push private key |
| `RAZORPAY_KEY_ID` | YES (payments) | Razorpay publishable key |
| `RAZORPAY_KEY_SECRET` | YES (payments) | Razorpay secret key |
| `RAZORPAY_WEBHOOK_SECRET` | YES (payments) | Webhook HMAC secret |
| `CRON_SECRET` | YES | Secures all cron endpoints |
| `ANTHROPIC_API_KEY` | Optional | Claude API (weekly-signal endpoint) |
| `NEXT_PUBLIC_PAYMENTS_ENABLED` | Optional | Feature flag (default: disabled) |

---

## 18. KNOWN PRE-LAUNCH BUGS (FIXED)

These were found and fixed during code review:

1. **Gemini cache permanently disabled on DB error** — `_keyCache = null` in catch block killed AI for worker lifetime. Fixed: only cache on successful DB query.
2. **Crash on buddy students page** — `student.full_name.split(' ')` threw TypeError when `full_name = null`. Fixed: null-safe with `(student.full_name ?? '').split(' ').filter(Boolean)`.
3. **Allowlist bypass in OTP verify** — non-allowlisted email could complete OTP and create a profile. Fixed: hard 403 gate if `!existing && !entry`.
4. **Scorecard rate-limit charged for failed scans** — analytics event inserted before Gemini call, so 503s consumed quota. Fixed: event inserted only after successful AI response.
5. **Onboarding permanently suppressed at screen 0** — closing modal at first screen set `onboarding_completed = true`. Fixed: only screens 1+ trigger the permanent mark.
6. **Outer "Next" button conflicted with ScreenSocialProof** — outer modal Next advanced to screen 1 without completing social proof slides. Fixed: outer nav hidden on screen 0.
7. **Dead `loginAction` server action** — `actions.ts` read `formData.get('email')` but form uses `username` field and posts to `/api/auth/login`. Deleted.
8. **14 debug `console.log` in bulk-import** — logged user emails and IDs to production logs. Removed.

---

## 19. BUILD STATUS

- TypeScript: **0 errors** (`tsc --noEmit` clean)
- Build: **PASSED** (Next.js 16.2.6, Turbopack, 22.5s, 80 pages)
- Linting: ESLint configured
- No `.env.local` — all vars must be set in Vercel project settings

---

## 20. FILE COUNTS / SCALE

| Category | Count |
|---|---|
| Pages/routes | 30+ |
| API endpoints | 47 |
| Database tables | 30+ |
| Database migrations | 37 SQL files |
| Postgres RPC functions | 2 (`upsert_log_and_streak`, `increment_coupon_use`) |
| UI components | 50+ |
| Custom React hooks | 7 |
| Lib utility modules | 29 |
| TypeScript interfaces | 10+ core domain types |
| Cron jobs | 5 |
| Estimated LOC | ~50,000 |
