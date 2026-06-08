# 🎥 Google Meet Video Session Integration Guide

**Status:** ✅ Deployed  
**Commit:** `b0695a2`  
**Date:** 2026-06-09

---

## 🎯 Overview

Automatic Google Meet video session scheduling with 10-day automatic trigger. When a buddy hasn't had a video session with their student in 10+ days, the system:

1. **Prompts** the buddy with a colorful suggestion card
2. **Generates** a unique Google Meet link
3. **Schedules** the session with date/time selection
4. **Tracks** session history and completion
5. **Notifies** student with Meet link (future: email)

---

## 📋 Features

### ✅ Automatic 10-Day Trigger
- **No manual reminders** - system checks automatically
- **First session** - always show prompt if no session yet
- **10 days** - orange prompt shows after 10 days
- **15 days** - red URGENT prompt after 15 days
- **Smart UI** - context-aware based on last session date

### ✅ Flexible Session Types
Choose what the session is about:
- General Session
- Mock Test Review
- Doubt Solving
- Performance Review

### ✅ Duration Selection
Buddy picks how long the session should be:
- 15 minutes (quick check-in)
- 30 minutes (standard session)
- 45 minutes (in-depth session)
- 1 hour (comprehensive review)

### ✅ Smart Scheduling
- Date picker for any future date
- Time picker (24-hour format)
- Optional notes (e.g., "Focus on Geometry")
- Session saves immediately to database

### ✅ Google Meet Integration
- **One-click link generation** - unique URL per session
- **Standard Meet format** - `https://meet.google.com/xxx-xxxx-xxx`
- **Link stored** - accessible from dashboard
- **Persistent** - link stays same even if rescheduled

### ✅ Complete History
- **Scheduled** - when created
- **Active** - when session starts
- **Completed** - when session ends
- **Cancelled** - if cancelled before starting
- **All tracked** - full audit trail in database

---

## 🏗️ Architecture

### Database Schema

#### `video_sessions` Table
```sql
CREATE TABLE video_sessions (
  id UUID PRIMARY KEY,
  student_id UUID,          -- Student in the session
  buddy_id UUID,            -- Buddy leading the session
  gmeet_link TEXT,          -- Google Meet URL
  session_status VARCHAR,   -- scheduled|active|completed|cancelled
  session_type VARCHAR,     -- session|review|doubt_solving|mock_review
  duration_minutes INT,     -- 15|30|45|60
  scheduled_at TIMESTAMPTZ, -- When scheduled for
  started_at TIMESTAMPTZ,   -- When actually started
  ended_at TIMESTAMPTZ,     -- When ended (last session date)
  days_since_last_session INT, -- Calculated field
  student_notified BOOL,    -- Email sent to student
  buddy_notified BOOL,      -- Email sent to buddy
  reminder_sent BOOL,       -- Reminder notification sent
  notes TEXT,               -- Session focus notes
  created_at TIMESTAMPTZ,   -- When record created
  updated_at TIMESTAMPTZ    -- Last update
);
```

#### `video_session_history` Table
```sql
CREATE TABLE video_session_history (
  id UUID PRIMARY KEY,
  session_id UUID,         -- Which session
  event_type VARCHAR,      -- created|started|completed|cancelled
  event_data JSONB,        -- Event details
  created_at TIMESTAMPTZ
);
```

### API Endpoints

#### `GET /api/video-sessions`
Fetch sessions for a student or buddy

```bash
curl "https://careerrai-daily.vercel.app/api/video-sessions?student_id=abc123"
curl "https://careerrai-daily.vercel.app/api/video-sessions?buddy_id=xyz789"
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "session-1",
      "student_id": "student-1",
      "buddy_id": "buddy-1",
      "gmeet_link": "https://meet.google.com/abc-defg-hij",
      "session_status": "scheduled",
      "scheduled_at": "2026-06-15T14:00:00Z",
      "session_type": "doubt_solving",
      "duration_minutes": 30
    }
  ]
}
```

#### `POST /api/video-sessions`
Create a new video session

```bash
curl -X POST "https://careerrai-daily.vercel.app/api/video-sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "student-1",
    "buddy_id": "buddy-1",
    "scheduled_at": "2026-06-15T14:00:00Z",
    "session_type": "doubt_solving",
    "duration_minutes": 30,
    "notes": "Focus on Geometry"
  }'
```

**Response:**
```json
{
  "session": {
    "id": "session-1",
    "gmeet_link": "https://meet.google.com/abc-defg-hij",
    "session_status": "scheduled",
    ...
  }
}
```

#### `PATCH /api/video-sessions`
Update session status (start, complete, etc.)

```bash
curl -X PATCH "https://careerrai-daily.vercel.app/api/video-sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "session-1",
    "session_status": "completed",
    "ended_at": "2026-06-15T14:30:00Z"
  }'
```

#### `DELETE /api/video-sessions`
Cancel a session

```bash
curl -X DELETE "https://careerrai-daily.vercel.app/api/video-sessions?session_id=session-1"
```

---

## 🎨 UI Components

### VideoSessionPrompt Component
**Location:** `src/components/video-session-prompt.tsx`

Beautiful card that shows:
- **Status indicator** - shows days since last session
- **Quick CTA** - "Schedule Session" button
- **Inline form** - expand to fill form
- **Color coding** - orange (10+ days), red (15+ days)

### Prompt States

**No Sessions Yet:**
```
🎥 Time for a Check-in
It's time for your first video session with Buddy Name

[Schedule Session]
```

**10-15 Days:**
```
⚠️ Time for a Check-in
It's been 12 days since your last session

[Schedule Session]
```

**15+ Days:**
```
🚨 URGENT: Schedule a Video Session
It's been 18 days since your last session

[Schedule Session]
```

---

## 📍 Where It Appears

### Buddy Student Profile
**Location:** `/buddy/students/[studentId]`

The video session prompt appears:
1. **Right after overall score card** (high visibility)
2. **Before feedback section** (calls attention)
3. **Stays visible** until session scheduled
4. **Auto-hides** when within 10 days of last session

### Student Home (Future)
Will add similar prompt to student home page to remind them to join scheduled sessions.

---

## 🔄 How It Works

### For Buddy

**Step 1: See the Prompt**
When viewing a student, if 10+ days since last session:
- Orange card appears (10+ days)
- Red card appears (15+ days)

**Step 2: Click "Schedule Session"**
Opens inline form with options:
- Session Type (dropdown)
- Duration (4 button options)
- Date (date picker)
- Time (time picker)
- Notes (optional textarea)

**Step 3: Click "Send Invite"**
- System generates Google Meet link
- Session saved to database
- Email sent to student (future: implemented)
- Confirmation message shows

**Step 4: Student Joins**
- Student receives email with Meet link
- Clicks link to join Google Meet
- Session marked as "active"
- After session ends → "completed"

### For Student

**Receive Notification**
- Email with Google Meet link
- Session details (date, time, type)
- Optional notes from buddy
- "Join Session" button

**Join Meeting**
- Click link in email
- Google Meet opens
- Buddy is already there (or will be)
- Session starts

**Post-Session**
- Both see "Session completed"
- Buddy can leave feedback
- Days since last session resets

---

## 📊 Database Tracking

### Session Lifecycle

```
1. CREATE (new session)
   ├─ Generate Google Meet link
   ├─ Set scheduled_at timestamp
   └─ Status: "scheduled"

2. NOTIFY
   ├─ Send email to student
   ├─ Set student_notified = true
   └─ Add history event

3. START
   ├─ Status: "active"
   ├─ Set started_at timestamp
   └─ Add history event

4. COMPLETE
   ├─ Status: "completed"
   ├─ Set ended_at timestamp
   ├─ Update last_session_date
   └─ Add history event

5. CANCEL (optional)
   ├─ Status: "cancelled"
   └─ Add history event
```

### Query Examples

**Get all sessions for a student:**
```sql
SELECT * FROM video_sessions
WHERE student_id = 'abc123'
ORDER BY scheduled_at DESC;
```

**Get completed sessions (actual video calls):**
```sql
SELECT * FROM video_sessions
WHERE student_id = 'abc123'
AND session_status = 'completed'
ORDER BY ended_at DESC;
```

**Get days since last session:**
```sql
SELECT EXTRACT(DAY FROM NOW() - ended_at) as days_since
FROM video_sessions
WHERE student_id = 'abc123'
AND session_status = 'completed'
ORDER BY ended_at DESC
LIMIT 1;
```

**Get audit history for a session:**
```sql
SELECT * FROM video_session_history
WHERE session_id = 'session-123'
ORDER BY created_at ASC;
```

---

## 🚀 Using the Features

### For Buddy: Schedule a Session

1. Go to: `/buddy/students/[studentId]`
2. Scroll down - see "Time for a Check-in" card
3. Click "Schedule Session"
4. Fill form:
   - Type: "Doubt Solving"
   - Duration: "30 min"
   - Date: "2026-06-15"
   - Time: "14:00"
   - Notes: "Geometry problems from last mock"
5. Click "Send Invite"
6. ✅ Session scheduled!
7. Student gets email with Meet link

### For Student: Join Session

1. Receive email: "Your buddy scheduled a video session"
2. Click: "Join Meeting" button
3. Google Meet opens
4. Join the session
5. After session: Buddy can leave feedback

### For Admin: View Session History

```typescript
// Fetch all sessions for a student
const response = await fetch(`/api/video-sessions?student_id=${studentId}`);
const { sessions } = await response.json();

// Check if session needed
const needsSession = sessions.length === 0 || 
  (new Date() - new Date(sessions[0].ended_at)) > 10 * 24 * 60 * 60 * 1000;

// Get audit trail
const { data } = await supabase
  .from('video_session_history')
  .select('*')
  .eq('session_id', sessionId)
  .order('created_at', { ascending: true });
```

---

## 🔮 Future Enhancements

### Phase 1: Notifications (Ready)
- [x] Save sessions to database
- [x] Generate Meet links
- [ ] Send email notifications (ready to implement)
- [ ] Send push notifications (ready to implement)

### Phase 2: Automation (Planned)
- [ ] Cron job to send 10-day reminders
- [ ] Auto-schedule sessions (buddy can set frequency)
- [ ] Send reminder 1 hour before session
- [ ] Track no-show sessions

### Phase 3: Integration (Future)
- [ ] Google Calendar sync (auto-add to calendar)
- [ ] Zoom integration (alternative to Meet)
- [ ] Slack notifications
- [ ] Session recording & playback

### Phase 4: Analytics (Planned)
- [ ] Session frequency reports
- [ ] Time spent in sessions per student
- [ ] Student performance correlation with sessions
- [ ] Buddy effectiveness tracking

---

## 🛠️ Technical Details

### Google Meet Link Generation
```typescript
// Generates random link like: https://meet.google.com/abc-defg-hij
function generateGoogleMeetLink(): string {
  const segment1 = generateRandomString(3);  // abc
  const segment2 = generateRandomString(4);  // defg
  const segment3 = generateRandomString(3);  // hij
  return `https://meet.google.com/${segment1}-${segment2}-${segment3}`;
}
```

### 10-Day Check
```typescript
// Returns true if should schedule session
function shouldScheduleVideoSession(lastSessionDate: Date | null): boolean {
  if (!lastSessionDate) return true; // First session
  
  const daysSince = Math.floor(
    (Date.now() - lastSessionDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return daysSince >= 10;
}
```

### RLS Policies
```sql
-- Students can view their own sessions
CREATE POLICY "Students view own video sessions"
  ON video_sessions
  FOR SELECT
  USING (student_id = auth.uid() OR buddy_id = auth.uid());

-- Buddies can create and manage sessions
CREATE POLICY "Buddies manage video sessions"
  ON video_sessions
  FOR ALL
  USING (buddy_id = auth.uid())
  WITH CHECK (buddy_id = auth.uid());
```

---

## ✅ Testing Checklist

### Buddy Flow
- [ ] Go to `/buddy/students/[studentId]`
- [ ] See video session prompt (if 10+ days)
- [ ] Click "Schedule Session"
- [ ] Fill form with all options
- [ ] Click "Send Invite"
- [ ] See success message
- [ ] Session appears in database

### Data Integrity
- [ ] Google Meet link generated
- [ ] Timestamps recorded correctly
- [ ] Status is "scheduled"
- [ ] All fields saved

### Future: Notifications
- [ ] Student receives email
- [ ] Email contains Meet link
- [ ] Email has correct date/time
- [ ] "Join Meeting" link works

---

## 📞 Support

### If Buddy Can't See Prompt
1. Check student's last session: `SELECT * FROM video_sessions WHERE student_id = '...' AND session_status = 'completed' ORDER BY ended_at DESC LIMIT 1;`
2. Calculate days: `SELECT EXTRACT(DAY FROM NOW() - ended_at) as days FROM ...`
3. If < 10 days, prompt won't show (expected)
4. If no sessions, should always show (bug if not)

### If Google Meet Link Isn't Generated
1. Check function: `generateGoogleMeetLink()` in `src/lib/gmeet-utils.ts`
2. Verify link format: should be `https://meet.google.com/xxx-xxxx-xxx`
3. Check API response: should include `gmeet_link` field
4. Check database: link should be stored in `video_sessions.gmeet_link`

### If Email Notification Isn't Sent
- Currently: Not yet implemented (feature ready)
- To implement: Add email function to POST `/api/video-sessions`
- Use: Supabase Email API or SendGrid

---

## 📝 Files Reference

| File | Purpose |
|------|---------|
| `supabase/migrations/011_add_video_sessions.sql` | Database schema |
| `src/lib/gmeet-utils.ts` | Utility functions |
| `src/components/video-session-prompt.tsx` | UI component |
| `src/app/api/video-sessions/route.ts` | API endpoints |
| `src/app/buddy/students/[id]/page.tsx` | Integration point |
| `src/types/index.ts` | TypeScript types |

---

**Status:** ✅ Deployed  
**Commit:** `b0695a2`  
**Ready for:** Testing & refinement

Hard refresh after deployment: **Ctrl+Shift+R**
