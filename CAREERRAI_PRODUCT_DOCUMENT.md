# CareerRai — Complete Product Document
*For AI analysis of student experience, gaps, and improvement opportunities*

---

## 1. WHAT IS CAREERRAI?

CareerRai is a **CAT exam preparation accountability platform** for MBA aspirants in India. It pairs each student with a dedicated **Buddy** (an IIM alumnus / high-percentile CAT achiever) who monitors their daily prep, gives feedback on mock tests, and holds sessions over Google Meet.

The product runs as a **Progressive Web App (PWA)** — students install it on their phone like a native app, receive push notifications, and interact daily with a mobile-first interface.

**Target user**: Indian student, 20–27 years old, preparing for CAT exam (IIM entrance). May be a fresher, working professional, or repeat aspirant. Highly stressed, prone to burnout, extremely competitive peer environment.

**Core promise**: "Don't prepare alone. Your buddy keeps you honest, helps you debug your mocks, and shows up every week."

---

## 2. USER ROLES

| Role | Who | What they do |
|---|---|---|
| **Student** | CAT aspirant | Logs daily study, takes mock tests, chats with buddy |
| **Buddy** | IIM alum / high %iler | Reviews student logs, gives feedback, holds weekly sessions |
| **Admin** | CareerRai team | Manages allowlist, payments, coupons, broadcasts |

Students are **manually approved** — only emails in the allowlist (status = 'active') can log in. Buddies are assigned by admins. There's a **1-buddy : many-students** pairing model.

---

## 3. TECH STACK (FOR CONTEXT)

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database**: Supabase (PostgreSQL, Singapore region)
- **Auth**: Supabase Auth — OTP magic-link (primary) + email/password
- **Notifications**: Web Push (VAPID), Email (Resend), In-app bell
- **Calendar**: Google Calendar API (Google Meet scheduling)
- **Payments**: Razorpay (feature-flagged off in beta)
- **SMS**: MSG91
- **Deployment**: Vercel (Singapore) + cron jobs

---

## 4. THE STUDENT JOURNEY — END TO END

### Step 1: Login
Student receives an invitation (added to allowlist by admin). They go to the login page, enter their email, receive a **magic link** in their inbox, click it → logged in automatically. No password required on first login (they set one later).

### Step 2: Onboarding (8 screens, one-time)
New students go through an 8-step onboarding modal before accessing the dashboard:

1. **Social proof** — other students' CAT results shown (motivation)
2. **Dream colleges** — multi-select (IIM A, B, C, FMS, etc.)
3. **Exam context** — Are you a repeater? Category (General/OBC/SC/ST)? Target %ile? Hours available per day?
4. **Meet your buddy** — buddy's photo, college, CAT percentile, bio shown
5. **Baseline test** — Short CAT readiness test (locked forever as their "starting percentile")
6. **About you** — Name, phone, college, year, working professional?, coaching enrolled?
7. **Daily commitment** — How many hours per day they commit to study
8. **Log Day 1** — Must complete their first daily study log before exiting

After onboarding, they reach the main tracker. The baseline percentile is **permanently locked** — it's the reference point for all future progress.

### Step 3: The Daily Loop (Core habit)
Every day, students open the app and log their study session:
- **Hours studied** (0–6 hours)
- **Sections covered**: VARC / DILR / QA / Mock / Revision (checkboxes)
- **Energy level**: 🙏 (low) / 💪 (medium) / 🔥 (peak)
- **Optional**: Notes, emotional chips

**Emotional chips** (one-tap emotional check-in):
- `mock_scared` — scared of mocks
- `burned_out` — exhausted
- `comparing` — comparing with peers
- `family_pressure` — family stress
- `lost_confidence` — confidence dip
- `feeling_behind` — feel behind schedule
- `all_good` — everything fine

After submission, the student sees a confirmation with a **streak count**, milestone message (on 7/21/30 day streaks), or a random encouraging message.

### Step 4: Mock Tests & Debrief
When students take a CAT mock test (on any platform — TIME, IMS, etc.), they mark "Mock taken" in their daily log with the mock name and scores.

Their buddy then fills a **mock debrief** for them:
- Overall percentile, VARC/DILR/QA breakdown
- **Error buckets**: Conceptual mistake / Silly mistake / Time management / Panic / Wrong selection
- Strategy note (what to fix)

If a student's percentile drops **more than 8%ile** from their previous mock, an automatic **Mock Drop Intervention** overlay appears with motivational messaging. Their buddy is also alerted.

### Step 5: Buddy Communication
Students can:
- **Chat** (text) with their buddy in real-time
- **Send voice notes** (recorded in-app)
- **Request urgent help** (session request with a message)
- View buddy's **feedback cards** (text or voice) with rating and next steps

Buddy responds within the day (SLA tracked and shown to student as a trust signal: "Responds within 2 hours — verified").

### Step 6: Weekly Session (Google Meet)
Buddy schedules a weekly 45–60 minute Google Meet session. Student gets a reminder the day before. Session appears in their upcoming sessions widget.

### Step 7: Payments (Beta off, coming soon)
When payments are enabled, students choose a plan (Monthly ₹999 / Quarterly ₹2,499 / Half-year ₹4,499) and pay via Razorpay. Founder scholarships and discount coupons are supported.

---

## 5. STUDENT PAGES & FEATURES

### `/student/tracker` — Daily Tracker (Home)
The main daily logging page. Shows:
- Today's log form (or "already logged today" state)
- **14-day heatmap** of study hours
- **Streak counter** (current + longest)
- Monthly mission progress (30-day study target for the month)
- Pending mock debrief card (if buddy hasn't debriefed recent mock)
- Upcoming session widget
- Miss-recovery message (if student logged after a gap)

### `/student/buddy` — Buddy Hub
- Buddy's profile card (name, college, CAT %ile, bio)
- Buddy's response SLA ("Responds within X hours")
- **Voice note inbox** (from buddy)
- **Feedback history** (last 3 feedback cards, text or voice)
- **Request urgent help** button (sends immediate alert to buddy)

### `/student/chat` — Real-time Chat
Text chat thread with buddy. Messages sync in real-time. Buddy sees all unread counts.

### `/student/analysis` — Mock Analysis
- Percentile trend chart (all mocks over time)
- Error bucket breakdown chart (across all debriefed mocks)
- Individual mock history list

### `/student/reports` — Progress Reports
Weekly and monthly rollup of:
- Study hours logged
- Consistency %
- Mock performance trend
- Mood/energy trends

### `/student/journey` — Timeline
Chronological view of all logs, feedback, and session milestones.

### `/student/profile` — Profile
- Student info (name, email, exam target, dream colleges)
- Buddy credentials (college, CAT %ile, bio)
- Progress summary (days logged, best streak, latest %ile)
- Membership status

### `/student/settings` — Settings
- Daily reminder toggle + reminder time picker
- Email notifications toggle
- **Push notification toggle** (subscribe/unsubscribe)
- Logout

### `/student/goal` — Goal Setting
- Update dream colleges, target percentile, study hours commitment

### `/cat-readiness` — Free Diagnostic (Public)
No login required. 10-question CAT readiness self-assessment. Returns an estimated percentile. Entry point for student acquisition.

---

## 6. BUDDY PAGES & FEATURES

### `/buddy/home` — Dashboard
- **Student triage list** sorted by urgency score (who needs attention most)
- **Urgent help requests** from students (pending session requests)
- **Upcoming session** from Google Calendar
- **Voice note inbox** (from students)
- **Quick voice broadcast** (record and send to selected students)

**Urgency Algorithm**:
- Critical (70+ score): Streak broken (40 pts) + Mock drop detected (35 pts)
- Warning (50–70): No feedback in 8–14 days, performance dropping
- Normal (<50): On track
- Factors: starting %ile, current %ile delta, days since last feedback, flat-performance flag (14+ days logged, zero upward movement)

### `/buddy/students` — Student List
All assigned students with:
- Current percentile
- Last logged date
- Latest mock name/score
- Red flag indicators

### `/buddy/students/[id]` — Student Detail
- 7-day study log chart
- Mock performance history chart
- Latest mock debrief (+ ability to add new debrief)
- Feedback history
- Session history
- **"Before Today's Session"** briefing card — a one-pager auto-summary of student status
- Button to submit feedback (text or voice)
- Button to schedule session (Google Calendar)

### `/buddy/chat` — Chat
List of all students with unread counts → click to open thread.

### `/buddy/schedule` — Sessions
Calendar view of all scheduled Google Meet sessions.

### `/buddy/earnings` — Earnings
Fee tracking per student per month. Payout status.

### `/buddy/trends` — Aggregate Analytics
Collective view of all assigned students' average percentile, study hours, consistency.

---

## 7. NOTIFICATION SYSTEM

### Daily Reminder Cron (8 PM IST daily)
Students who:
- Have `daily_reminder = true` in preferences
- Haven't logged today
- Haven't received a reminder today yet

Get a push + in-app notification. Message rotates through 5 Hindi-Hinglish templates (personalised, informal, motivational).

### Red Flag Detection (daily cron)
Triggers buddy alert when any of:
- Avg stress ≥ 4/5 this week
- Avg study < 3 hrs/day this week
- Avg sleep quality < 3/5 this week
- Fewer than 4 logs this week
- Mock accuracy declining

### Escalation Alerts (9 PM IST daily)
Admin gets notified if:
- A student's chat message is unanswered by buddy for 48+ hours
- A student's mock has no debrief after 48+ hours

### Weekly Buddy Digest (Monday 9:30 AM IST)
Buddy gets a summary of all their students: who's on track, who has red flags, who hasn't logged.

### Real-time Notifications
- Student logs → buddy notified immediately
- Buddy submits feedback → student notified immediately
- Student sends chat → buddy notified
- Student requests urgent help → buddy notified
- Mock drop detected → student sees overlay, buddy alerted

---

## 8. DATA MODEL SUMMARY

### `profiles` (users)
`id, role, full_name, email, phone, exam_target, buddy_id, dream_colleges[], onboarding_completed, study_target_hours, starting_percentile, target_percentile, cat_percentile, is_repeater, coaching_enrolled, college, course_year, is_working_professional, notif_prefs, push_subscription, subscription_status`

### `daily_reports` (core log — 90-day rolling)
`student_id, report_date, study_duration (hours), topics_covered[], mock_taken, mock_name, overall_energy, stress (1-5), confidence (1-5), sleep_quality (1-5), notes, emotional_chips[]`

### `streak_data`
`student_id, current_streak, longest_streak, last_log_date, milestone_sent_7, milestone_sent_21`

### `buddy_feedback`
`buddy_id, student_id, feedback_date, feedback_text, voice_note_url, feedback_type, rating, next_steps[], period_covered`

### `mock_debriefs`
`student_id, taken_on, mock_name, overall_percentile, varc{attempted, correct, time_min, percentile}, dilr{...}, qa{...}, error_buckets{conceptual, silly, time, panic, selection}, strategy_note`

### `test_results`
`student_id, test_type, test_name, attempt_date, score, percentile, breakdown`

### `chat_messages`
`student_id, buddy_id, sender_id, body, created_at, read_at`

### `video_sessions`
`student_id, buddy_id, title, google_meet_link, session_status, session_type, scheduled_at, duration_minutes`

### `session_requests`
`student_id, buddy_id, message, status (pending/resolved)`

### `notifications`
`user_id, type, title, body, data, read, channel (in_app/push/email)`

### `recovery_events`
`student_id, missed_days, previous_streak`

### `mock_drop_alerts`
`student_id, drop_amount, buddy_notified`

### `student_allowlist`
`email, full_name, phone, status, assigned_buddy_id, person_type`

---

## 9. KEY PRODUCT MECHANICS

### Streak System
- Counts **consecutive days** with ≥1 hour logged
- Boundary: 3 AM IST (late-night session before 3 AM = previous day)
- Breaking: Any gap > 1 day resets to 0
- Milestones: 7-day, 21-day, 30-day get special celebration messages

### Miss Recovery
When a student logs after a multi-day gap (had a streak before), a recovery message is shown. Their buddy is notified: "X days missed, Y-day streak was lost. They're back." This is the **#1 retention moment** in the product.

### Monthly Missions
12 named missions (one per calendar month) each with a themed focus area: Foundation (Jan), Momentum (Feb), Accuracy (Mar), etc. Goal: 30 days logged per month. Progress shown as a bar on the tracker.

### Mock Drop Intervention
If the student's latest mock percentile drops 8+ points from previous:
- An overlay appears on their tracker with a motivational message + action steps
- Their buddy gets an alert in the home triage panel
- 30-day cooldown prevents spam

### Buddy SLA as Trust Signal
The app automatically calculates the buddy's average response time (from student's log date to buddy's feedback creation date, last 30 days). This is shown to the student on their profile page as "Responds within X hours — verified."

### Onboarding Baseline Lock
The CAT readiness test taken during onboarding is permanently locked as the student's `starting_percentile`. All progress graphs show delta from this point. Admins can reset if needed.

### Buddy Feedback Authorship Gate
When a buddy writes feedback, the server validates:
- Minimum 15 words written by the buddy
- Maximum 55% similarity to the AI draft (Jaccard similarity)
If the buddy just copies the AI draft without editing, the submission is rejected with "Add your own words — at least 15 of your own."

### Demo Accounts
4 pre-seeded student demo accounts (Aarav, Priya, Rohan, Meera) with 30–60 days of fake data. Used for customer walkthroughs, sales calls, and marketing.

---

## 10. EMOTIONAL & PSYCHOLOGICAL DESIGN CHOICES

1. **Hindi-Hinglish notifications** — daily reminders are informal, use Indian colloquialisms ("Kal ek aur din" rather than "Log your session")
2. **Emotional chips** — allow students to signal stress/fear/confidence without typing. One-tap.
3. **Recovery messaging** — breaking a streak isn't punished, it's acknowledged with a comeback message
4. **Buddy SLA transparency** — student can see exactly how responsive their buddy is (trust signal)
5. **AI draft for buddy** — buddy gets an AI-generated feedback draft they *must* personalise. Prevents generic feedback.
6. **No public leaderboard** — no head-to-head comparisons between students (removes harmful social comparison)
7. **Dream college anchoring** — student's dream colleges are shown in the dashboard as a constant reminder of their why
8. **Milestone celebrations** — 7/21/30 streak messages feel like personal achievements

---

## 11. WHAT THE APP DOES NOT DO (YET)

- No AI-based study planning or scheduling
- No content library (videos, notes, question bank)
- No in-app mock test (the CAT readiness test is a proxy, not a full mock)
- No peer community / cohort / group features
- No voice assistant or AI chat
- No gamification beyond streaks (no coins, badges, leaderboard)
- No calendar integration for *students* (only buddies have Google Calendar)
- No parent-facing features
- No doubt-solving (Q&A) functionality — sessions are the only doubt-solving channel
- No study plan / syllabus tracker
- No automated study plan suggestions from AI
- No integration with external mock platforms (TIME, IMS, etc.)
- No video content within the app
- Payments are feature-flagged off in current beta

---

## 12. CRON JOBS (AUTOMATED SYSTEM BEHAVIOURS)

| Time (IST) | What happens |
|---|---|
| 8:00 PM daily | Daily reminder push/in-app to students who haven't logged |
| 9:00 PM daily | Check red flags for all students, alert buddy |
| 9:30 PM daily | Escalate unanswered chats (48h+) and unreviewed mocks (48h+) to admin |
| Daily | Session-tomorrow reminder to students |
| Monday 9:30 AM | Weekly buddy digest (all students summary) |
| Daily | Subscription expiry check |
| 7 days before renewal | Renewal reminder to student |

---

## 13. ACQUISITION FUNNEL

1. **Free CAT Readiness Test** (`/cat-readiness`) — no login, 10 questions, gives a percentile estimate. Captures name, email, phone → stored as a lead in `cat_leads` table.
2. Admin reviews leads, adds promising ones to `student_allowlist`
3. Student gets an invite → logs in → onboards → pays (when payments enabled)

The free test is the **only public-facing acquisition channel** in the current product.

---

## SUMMARY FOR GEMINI

**CareerRai is**: A structured accountability platform for CAT exam students in India. Its core loop is: Daily log → Buddy reviews → Feedback → Weekly session → Repeat.

**The student's emotional reality**: High stress, fear of failure, social comparison anxiety, burnout risk, guilt about missed days, pressure from family. The app tries to be a safe, non-judgmental space where a student has ONE person (their buddy) who is rooting for them personally.

**What drives retention**: The streak + the buddy relationship. If either breaks, the student churns. The miss-recovery flow and buddy escalations are the key retention mechanisms.

**What's missing**: AI-powered study planning, content, doubt-solving, community, and external integrations. These are the biggest gaps relative to student expectations.

**Competitive context**: Students are also using Unacademy, Career Launcher, IMS, TIME, YouTube, and WhatsApp groups. CareerRai's differentiation is the *human buddy* layer — not content, not practice questions, but accountability and mentorship.
