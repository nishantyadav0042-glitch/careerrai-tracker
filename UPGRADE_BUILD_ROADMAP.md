# CareerRai Dashboard Upgrade - BUILD ROADMAP

**Source:** CareerRai_Dashboard_Upgrade_Spec.docx  
**Status:** Ready to Build  
**Priority:** CRITICAL - Sprint 1 must ship before first paid student onboarding

---

## 📋 COMPREHENSIVE BUILD CHECKLIST

### **SPRINT 1 - MUST SHIP BEFORE FIRST PAID STUDENT**

#### **STUDENT DASHBOARD - SPRINT 1**

- [ ] **1.1 ONBOARDING SEQUENCE (Non-skippable, 4 screens)**
  - [ ] Screen 1: Meet Your Buddy
    - Buddy card with avatar, name, IIM college badge, CAT percentile
    - Audio player (MediaRecorder API, stores in Supabase Storage)
    - File path: `buddy-intros/{buddy_id}.webm`
    - "Let's Begin" button (enabled after 10s audio or 5s if no audio)
    - Fallback: Buddy written intro if no audio
    - DB: Read from profiles (buddy_id, full_name, college, cat_percentile, intro_audio_url)
  
  - [ ] Screen 2: Your Baseline Test
    - Message: "Your buddy needs this to guide you"
    - Skip if already completed CAT readiness test
    - "Take the 5-Minute Test" button
    - "I'll do this later" warning option
    - DB: Check test_results table for test_type='cat-readiness'
  
  - [ ] Screen 3: Set Your Daily Commitment
    - Number picker: 1 / 1.5 / 2 / 3 / 4 / 5+ hours
    - Message: "Your buddy will be notified if you consistently miss this target"
    - DB: Save to profiles.study_target_hours (default 2)
  
  - [ ] Screen 4: Log Day 1
    - Animated flame icon (CSS pulse, orange #E8652D)
    - Quick-log: Study Hours (slider), Topics (Quant/VARC/LRDI/Mock/Revision), Feeling (3 emoji: 🙏/💪/🙊)
    - Confetti animation on submit
    - Streak counter animates 0→1
    - DB: Insert daily_reports record, create streak_data record (current_streak=1)

  - **DESIGN NOTES:**
    - Non-skippable flow, 4-screen progress indicator (1/4, 2/4, 3/4, 4/4)
    - Full-screen modal, carousel navigation
    - Orange-tinted background (#FFF3EE) for Screen 1
    - Total onboarding time: ~3 minutes

- [ ] **1.2 HOME PAGE REDESIGN**
  - [ ] Element 1: THE STREAK HERO (top of page, full-width card)
    - Background: Dark navy (#1A1A2E)
    - Flame icon states:
      - Days 1-6: Orange flame 🔥 (no glow)
      - Days 7-13: Orange flame (drop-shadow glow)
      - Days 14+: Gold gradient (#FFD700→#E8652D, pulsing glow)
      - Broken: Grey flame 🩶
    - Large white streak number (48px)
    - Sub-label: "Day streak 🔥 Keep it alive" (orange) or "Streak lost" (red)
    - **CRITICAL:** "Your buddy checks your streak every Monday" (makes streak social)
    - "Log Today" button if today not logged
    - DB: Read streak_data, calculate active/broken based on last_log_date

  - [ ] Element 2: BUDDY SIGNAL CARD (new)
    - Shows most recent buddy interaction (feedback, voice note, milestone)
    - If buddy message in last 7 days: Teal card with avatar, name, preview (80 chars)
    - If voice note: Show audio waveform + play button, duration, "New" badge
    - If no message: "🔔 Waiting for your buddy to review your week..."
    - Tap to expand full message/player
    - DB: Read latest feedback record by created_at DESC, check voice_note_url

  - [ ] Element 3: DAYS TO CAT CONTEXT CARD
    - Shows exact days until CAT (hardcoded: Nov 23, 2026)
    - Dynamic message based on days remaining:
      - 180+: "Foundation phase. Build habits now..."
      - 90-180: "Mock phase. One mock per week minimum..."
      - 30-90: "Final stretch. Don't change strategy..."
      - <30: "Last mile. Trust your preparation..."
    - White card, teal left border (4px), large orange days number
    - DB: None (hardcoded CAT date, client-side calculation)

  - [ ] Element 4: QUICK STATS (keep, minor redesign)
    - Keep existing 4 stats but reduce visual prominence
    - 2x2 grid, below context card
    - Add trend arrows (green=up, red=down, grey=flat)

  - [ ] Element 5: HEATMAP (demote)
    - Move to Reports page as primary home
    - Keep 7-day version on home page only (not 14-day)

  - [ ] Milestone Auto-Messages (critical feature)
    - **Day 7 streak:** Auto-insert feedback: "[Student], 7 days in a row. Most students don't make it here. You're ahead of 60%. Keep it up. — [Buddy], [IIM]"
    - **Day 21 streak:** Auto-insert feedback: "[Student], 3 weeks of consistency. This is where serious aspirants separate. Your CAT prep is on track. — [Buddy]"
    - Buddy receives in-app alert: "[Student] hit 7-day streak. Consider sending voice note — highest-impact moment for retention"
    - DB: Implement via background check (Next.js API route or Supabase Edge Function). Check streak_data.current_streak. Add milestone_sent_7, milestone_sent_21 booleans to streak_data table to prevent duplicate sends

  - **DESIGN NOTES:**
    - Streak hero must be FIRST element (highest retention feature)
    - No animation on first render; flame pulse starts 1s after load
    - Mobile: stack cards vertically
    - Full-width, safe spacing for notch devices

- [ ] **1.3 DAILY LOG - FRICTION REDUCTION**
  - [ ] Quick Log (2-tap minimum, default)
    - Field 1: Hours studied (5 buttons: 0/1/2/3/4+)
    - Field 2: Topics (Quant/VARC/LRDI/Mock/Revision)
    - Field 3: How did it go? (3 emoji: 🙏Tough/💪Solid/🙊Easy)
    - Submit: "Done — Log My Day" button
    - **CRITICAL:** Under 15 seconds to complete
    - Bottom sheet UI (slides up from bottom, dark overlay)

  - [ ] Full Log (expandable, optional)
    - "Tell me more" link reveals optional fields
    - Auto-expand if "Mock" selected
    - Pre-fill where possible
    - All existing daily_reports fields preserved

  - [ ] Emoji to DB Mapping
    - 🙏 = confidence:2, stress:4
    - 💪 = confidence:4, stress:2
    - 🙊 = confidence:5, stress:1
    - Sleep/nutrition: null if not filled

  - [ ] Streak Guard (after 9 PM)
    - Check on every page load after 9 PM
    - If today not logged: Show amber banner at top
    - Banner: "🔔 Log today before midnight to keep your [X]-day streak. Takes 15 seconds."
    - Tap banner → opens Quick Log bottom sheet
    - DB: Check today's date vs last_log_date. Time check: client-side local time > 21:00

  - **DESIGN NOTES:**
    - Bottom sheet, full width on mobile
    - High contrast on dark overlay
    - "X" button to close without saving
    - No autosave (prevent accidental commits)

- [ ] **1.4 MOCK SCORE DROP INTERVENTION**
  - [ ] Drop Detection Logic
    - Trigger when: 
      - Mock score submitted with drop > 8 percentile points, OR
      - CAT Readiness Test score 10+ points lower than previous
    - Create mock_drop_alerts table: student_id, triggered_at, buddy_notified
    - Max trigger: once per 30 days per student

  - [ ] Intervention UI (full-screen overlay after submission)
    - Title: "Score drop detected. This is expected. Here's why."
    - Explanation: "As CAT gets closer, more serious competitors take mocks. Pool gets tougher, same accuracy = lower percentile. Your skill hasn't declined — the benchmark moved."
    - Visual: 2-column comparison ("May pool: All aspirants" vs "October pool: Only serious aspirants")
    - Message: "Your buddy has been flagged about this drop. Expect a message from them within 24 hours."
    - Button: "Got it. Show my score."

  - [ ] Buddy Alert
    - Insert high-urgency flag in buddy triage system
    - Urgency reason: "Mock score dropped [X] points. Student needs context and encouragement."

- [ ] **1.5 CAT READINESS TEST - RESULT SCREEN ENHANCEMENT** (moved to Sprint 2)
  - [ ] Addition 1: AI-Generated Buddy Insight (Claude API)
    - After score/category display, add: "What your buddy would say about this score"
    - Claude API call parameters:
      - Model: claude-sonnet-4-20250514
      - System: "You are an IIM alumni buddy. Tone: direct, warm, like senior bhaiya. Write 3 sentences: (1) observation about strongest category, (2) observation about weakest category, (3) specific action this week. Use first-person as buddy. No generic advice. Specific to their numbers. Max 80 words."
      - User: "Student score: [X]/100. Percentile: [Y]%. Breakdown: Quant [a]%, VARC [b]%, LRDI [c]%, Mock Strategy [d]%, Wellness [e]%. Days to CAT: [n]."
    - Display in teal-bordered card with buddy avatar placeholder
    - Disclaimer: "★ Based on your scores. Your real buddy will review this too."
    - Implementation: Route through Next.js API route /api/buddy-insight. Cache by test attempt ID.

  - [ ] Addition 2: Comparison Anchor
    - Add line: "Students at your percentile need average of [X] additional mocks to reach 90+ percentile."
    - Hardcoded lookup table by percentile bands (no DB needed)
    - Creates urgency without demoralizing

---

#### **BUDDY DASHBOARD - SPRINT 1**

- [ ] **2.1 BUDDY ONBOARDING - INTRO AUDIO RECORDING**
  - [ ] New Page: /buddy/setup (shown on first login if intro not recorded)
    - Title: "Record Your Intro Message"
    - Instructions: "Your students hear this on Day 1. Under 45 seconds. Say: your name, your IIM, your CAT score, one thing you wish you'd known."
    - Record button (large, red ● when recording)
    - MediaRecorder API (no external service)
    - Waveform visualization during recording (CSS bars animation)
    - Playback before saving, re-record option
    - Save button: Upload to Supabase Storage at `buddy-intros/{buddy_id}.webm`
    - Update profiles.intro_audio_url
    
  - [ ] Buddy Bio Field (on same page)
    - 1-sentence bio: "I scored X%ile on my Nth attempt. Here's what I'd tell my past self…"
    - Save to profiles.buddy_bio
    - Max 120 characters
    - Used in student profile view

  - **TECH NOTES:**
    - MediaRecorder API: all modern browsers
    - Record format: audio/webm
    - Max ~2MB for 45s audio
    - Supabase Storage: no paid tier required at this volume

- [ ] **2.2 HOME PAGE - THE TRIAGE VIEW** (replaces current student list)
  - [ ] Urgency Score Algorithm (calculated on page load)
    - Formula (max 100):
      - Days since last log: 0→0pts, 1→10pts, 2→25pts, 3+→45pts (max 45)
      - Stress trend (last 3 days avg): <3→0, 3-4→10, >4→20 (max 20)
      - Mock drop flag: +20pts
      - Days since last buddy feedback: 0-3→0, 4-7→10, 7+→15 (max 15)
    - Thresholds:
      - 0-30: Green (On Track)
      - 31-60: Amber (Monitor)
      - 61+: Red (Needs Attention)

  - [ ] Triage Card Layout
    - Page title: "Your Students" with subtitle: "X need attention • Y to monitor • Z on track"
    - Red cards first (always shown), then Amber, then Green
    - Green cards: Collapsed at bottom ("X students on track — tap to see")
    - Each card:
      - Left: Round avatar with colored border (red/amber/green)
      - Center: Student name (bold), urgency reason (e.g., "3 days no log + stress rising")
      - Right: Three action buttons (icon-only mobile, icon+label desktop):
        - 🎤 Voice
        - 💬 Message
        - 📝 Feedback
      - Tap student name → student detail page

  - [ ] DB Query
    - Join daily_reports (latest per student)
    - Join feedback (latest per student)
    - Join streak_data
    - Join mock_drop_alerts
    - Calculate urgency score in JavaScript (not stored)
    - Always compute fresh on page load

  - **DESIGN NOTES:**
    - Mobile-first, full-width cards
    - Quick-action buttons: icon-only on mobile (<640px)
    - Color coding: Red (#E8652D), Amber (#F59E0B), Green (#10B981)
    - Smooth collapse/expand animation for green section

---

#### **ADMIN DASHBOARD - SPRINT 1**

*(Specifications extracted but not yet detailed in docx)*
- [ ] Keep existing bulk import functionality
- [ ] Monitor CAT exam date (hardcoded as constant)
- [ ] System health checks

---

### **SPRINT 2 - MUST SHIP BY END OF MONTH 1**

#### **STUDENT DASHBOARD - SPRINT 2**

- [ ] **1.5 CAT READINESS TEST - RESULT SCREEN ENHANCEMENT** (continued)
  - [ ] Build Claude API integration (/api/buddy-insight)
  - [ ] Implement comparison anchor
  - [ ] Cache results by test_attempt_id

- [ ] **1.6 STUDENT-BUDDY SHARED TIMELINE** (new page: /student/journey)
  - [ ] New Navigation: Replace "Profile" with "Journey" in bottom nav
  - [ ] Profile accessible via settings icon (top-right)
  
  - [ ] Feed Items (reverse-chronological):
    - 🔥 Study Log: "You studied [X] hrs — [topics]. Streak day [N]." (tap to expand)
    - 🎯 Test Score: "CAT Readiness: [score]/100, [percentile]%ile" (tap for full result)
    - 🎤 Voice Note from Buddy: "[Buddy name] sent you a voice note" (tap to play)
    - 📝 Buddy Feedback: Preview with "Read more" (tap to expand)
    - 🏆 Milestone: "7-day streak achieved!", "90th percentile reached!", etc.

  - [ ] Grouping: By week ("This Week", "Last Week", "[Month] Week 2", etc.)
  - [ ] Empty state: "Your journey starts today. Every log, every buddy message, every milestone will appear here."
  - [ ] Infinite scroll pagination
  - [ ] DB: View combining daily_reports + test_results + feedback, ordered by created_at DESC. No new table needed.

  - **DESIGN NOTES:**
    - Clean white cards, color-coded left border:
      - Orange = log
      - Teal = buddy
      - Gold = milestone
    - Mobile-first, infinite scroll
    - Tap cards to expand inline (no modal)

- [ ] **1.7 PROFILE PAGE - TRUST SIGNALS**
  - [ ] Buddy Credential Display (upgrade)
    - Buddy photo/avatar (round, 80px)
    - Name + IIM college badge
    - CAT percentile achieved
    - Buddy's sentence: "I scored 99%ile on my 2nd attempt. Here's what I wish someone had told me in Month 1."
    - Response rate badge: "Responds within [X] hrs — verified" (calculated from feedback.created_at vs daily_reports.report_date)
    - Visible on student's own profile only

  - [ ] Progress Summary Card (new)
    - Three numbers: Total days logged, Best streak, Latest CAT percentile
    - Small progress bar: "You're [X]% of the way to your target score"
    - Button: "Share my progress"

  - [ ] Shareable Progress Card (Sprint 3)
    - HTML Canvas or CSS screenshot generation
    - CareerRai logo (top-left)
    - "I've been preparing for CAT for [X] days with my IIM buddy on CareerRai"
    - Score: [percentile]%ile
    - Streak: [N] days
    - Bottom: careerrai.com
    - **STRATEGY:** Viral acquisition mechanic (students share on WhatsApp)

#### **BUDDY DASHBOARD - SPRINT 2**

- [ ] **2.3 VOICE NOTE FEATURE** (HIGHEST PRIORITY in Sprint 2)
  - [ ] Accessible from:
    - Triage card quick-action button (🎤)
    - Student detail page top action bar

  - [ ] Voice Note Recorder UI
    - Bottom sheet (slides up)
    - Large red record button (●)
    - Waveform animation while recording
    - Timer: "0:45 / 1:30" format
    - Hard limit: 90 seconds
    - At 1:20: Warning "10 seconds remaining"

  - [ ] Post-Recording
    - Playback with controls
    - "Send" button or "Re-record" button
    - On Send: Upload to Supabase Storage at `voice-notes/{student_id}/{timestamp}.webm`
    - Insert feedback record with voice_note_url, feedback_text=null
    - Insert student notification

  - [ ] Student Notification
    - In-app: "🎤 [Buddy name] sent you a voice note."
    - Show in Buddy Signal Card on student home
    - Mark as read on open

  - **TECH NOTES:**
    - MediaRecorder API
    - Record format: audio/webm
    - Supabase Storage upload
    - **CRITICAL:** This is the highest-impact feature. Voice is 10x more effective than text.

---

### **SPRINT 3 - MONTH 2 ENHANCEMENTS**

- [ ] **1.7 Profile Page - Shareable Progress Card**
  - Canvas-based screenshot generation
  - WhatsApp sharing integration

- [ ] **2.4 Advanced Buddy Features**
  - [ ] Batch voice note recording (record multiple quick notes)
  - [ ] Feedback templates (pre-written messages for common scenarios)
  - [ ] Weekly digest reports (auto-summary of student progress)
  - [ ] Student-level analytics dashboard (grade distribution, improvement trends)

- [ ] **3.1 Admin Enhancements**
  - [ ] Buddy performance dashboard (response times, student retention)
  - [ ] Churn prediction alerts
  - [ ] Batch messaging to students
  - [ ] Advanced bulk import (schedule imports, custom field mapping)

---

## 🛠️ TECHNICAL IMPLEMENTATION NOTES

### **Database Changes Required**

#### New Tables

```sql
-- Streak tracking
CREATE TABLE streak_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id),
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_log_date DATE,
  milestone_sent_7 BOOLEAN DEFAULT FALSE,
  milestone_sent_21 BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Mock score drop alerts
CREATE TABLE mock_drop_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id),
  triggered_at TIMESTAMP DEFAULT now(),
  buddy_notified BOOLEAN DEFAULT FALSE
);
```

#### New Fields on Existing Tables

```sql
-- profiles table additions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS study_target_hours DECIMAL(2,1) DEFAULT 2;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS intro_audio_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS buddy_bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS college VARCHAR(50); -- for IIM college display
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cat_percentile DECIMAL(5,2); -- for buddy display

-- feedback table additions
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS voice_note_url TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50); -- 'milestone_auto', 'voice', 'text', etc.
```

### **API Routes to Create**

```
POST /api/buddy-insight
  - Claude API integration for test result insight
  - Input: score, percentile, category_breakdown, days_to_cat
  - Output: 3-4 sentence buddy insight
  - Cache by test_attempt_id

POST /api/streak/check
  - Runs daily check for milestone messages
  - Inserts Day 7 and Day 21 auto-messages
  - Called on page load or via Supabase Edge Function

POST /api/daily-report/quick-log
  - Simplified endpoint for Quick Log submission
  - Maps emoji to confidence/stress values
  - Creates daily_reports record
  - Updates/creates streak_data record
```

### **Supabase Storage Buckets**

```
buddy-intros/
  - {buddy_id}.webm

voice-notes/
  - {student_id}/{timestamp}.webm
```

### **Row Level Security (RLS) Updates**

- Students can only read/write their own streak_data, daily_reports, test_results
- Buddies can read streak_data and daily_reports for assigned students only
- Admins can read all tables
- Ensure feedback records are read-visible to both student and assigned buddy

### **Client-Side State Management**

- Onboarding state: Check if profile.intro_audio_url is null (buddy) or check for onboarding_completed flag
- Streak display: Calculate from streak_data.current_streak + last_log_date
- Urgency score: Calculate in React component, don't store

### **Animation Libraries Needed**

- None required — all can be done with CSS keyframes
- Confetti: Use simple CSS animation or lightweight library like `canvas-confetti`

### **Third-Party Integrations**

- **Claude API:** Use /api/buddy-insight route to avoid exposing API key
- **Supabase Storage:** Already integrated, use existing upload methods
- **MediaRecorder API:** Built-in browser API, no library needed

---

## 🎯 BUILD ORDER (STRICT PRIORITY)

### Phase 1: Core Infrastructure (Days 1-3)
1. Create new database tables (streak_data, mock_drop_alerts)
2. Add new fields to existing tables
3. Implement streak calculation logic
4. Create /api/buddy-insight route (Claude integration)

### Phase 2: Student Onboarding (Days 4-6)
1. Build 4-screen onboarding flow
2. Implement MediaRecorder for buddy intro audio
3. Add onboarding completion flag
4. Test onboarding → home page transition

### Phase 3: Home Page Redesign (Days 7-10)
1. Streak hero component (with all flame states)
2. Buddy signal card
3. Days to CAT context card
4. Migrate heatmap to Reports page
5. Implement milestone auto-messages

### Phase 4: Daily Log Redesign (Days 11-12)
1. Quick Log bottom sheet
2. Emoji mapping to confidence/stress
3. Streak guard (after 9 PM banner)
4. Full Log expansion

### Phase 5: Mock Drop Intervention (Day 13)
1. Drop detection logic
2. Intervention overlay UI
3. Buddy alert integration

### Phase 6: Buddy Triage View (Days 14-16)
1. Urgency score algorithm
2. Triage card layout
3. Action button integration
4. Green card collapsing

### Phase 7: Buddy Audio & Sprint 2 (Days 17+)
1. Buddy intro audio recording (/buddy/setup)
2. Voice note feature (🎤 button everywhere)
3. Student-buddy shared timeline (/student/journey)
4. Profile trust signals
5. Claude API buddy insight on result screen

---

## ✅ SUCCESS CRITERIA

### Before First Paid Student
- [ ] All Sprint 1 features 100% complete and tested
- [ ] Onboarding flow is smooth, <3 minutes total
- [ ] Streak calculation working correctly
- [ ] Buddy audio recording/playback working
- [ ] Triage view showing correct urgency scores
- [ ] Mock drop intervention triggering correctly
- [ ] All database migrations applied
- [ ] RLS policies tested
- [ ] Mobile responsive verified (320px-1440px)

### By End of Month 1
- [ ] All Sprint 2 features complete
- [ ] Voice notes working end-to-end
- [ ] Timeline feed showing all interaction types
- [ ] Claude API buddy insights generating correctly
- [ ] Student feedback: "feels human" (not automated)
- [ ] Buddy feedback: "under 5 minutes per student per week"
- [ ] Zero critical bugs in production
- [ ] Performance: Page load <2s on 4G

### Data Integrity
- [ ] Streak never increments >1 per day
- [ ] Streak only breaks if >24 hours since last log
- [ ] Urgency score recalculates correctly
- [ ] No duplicate milestone messages
- [ ] Audio files stored and retrieved correctly
- [ ] Voice notes accessible only to student + buddy

---

## 📊 METRICS TO TRACK POST-LAUNCH

- Day 30 retention rate (target: 60%+ for streak holders)
- Buddy response time (target: <24 hours for messages)
- Daily log completion rate (target: 70%+ for logged users)
- Voice note engagement (students who listen to voice notes have 3x better retention)
- Onboarding completion rate (target: 95%+)
- Mock drop intervention effectiveness (students who see intervention don't churn 25% more)

---

**Generated from:** CareerRai_Dashboard_Upgrade_Spec.docx  
**Date:** June 5, 2026  
**Status:** READY TO BUILD
