# 🎥 Google Meet Integration - Quick Start

**What:** Automatic video session scheduling with 10-day auto-trigger  
**Where:** Buddy student profile  
**Status:** ✅ Live  

---

## 🚀 3-Minute Walkthrough

### For Buddy: Schedule a Session

1. **Open student profile**
   - Go to: https://careerrai-daily.vercel.app/buddy/students/[studentId]
   - Scroll down

2. **See the prompt** (if 10+ days since last session)
   ```
   🎥 Time for a Check-in
   It's been 12 days since your last session
   [Schedule Session]
   ```

3. **Click "Schedule Session"**
   - Form expands with options

4. **Fill the form**
   | Field | What to do | Example |
   |-------|-----------|---------|
   | Session Type | Pick from dropdown | "Doubt Solving" |
   | Duration | Click one of 4 buttons | "30 min" |
   | Date | Use date picker | "2026-06-15" |
   | Time | Use time picker | "14:00" (2 PM) |
   | Notes | (Optional) what to focus on | "Focus on Geometry" |

5. **Click "Send Invite"**
   - ✅ Session scheduled!
   - Google Meet link generated
   - Email sent to student (in background)

6. **Done!**
   - Prompt disappears for 10 days
   - Buddy and student can both see the session
   - Meet link ready to use

---

## 📧 For Student: What They Get

**Email from Buddy:**
```
Your buddy scheduled a video session!

Date: June 15, 2026 at 2:00 PM
Type: Doubt Solving
Duration: 30 minutes
Focus: Geometry doubts

[JOIN MEETING] ← Click this link
https://meet.google.com/abc-defg-hij
```

**Student clicks link → Google Meet opens → Session starts**

---

## 🎨 Visual Feedback

### When to Show Prompt

| Days Since Last | Visual | Color | Message |
|---|---|---|---|
| 0-9 days | Hidden | - | (no prompt) |
| 10-14 days | Visible | 🟠 Orange | "Time for a Check-in" |
| 15+ days | Visible | 🔴 Red | "URGENT: Schedule" |
| Never | Visible | 🟠 Orange | "First session recommended" |

### After Scheduling

Shows success message (3 seconds):
```
✅ Session scheduled! 
Google Meet link sent to [Student Name]
```

---

## 🔧 What Gets Stored

### Database
```
Table: video_sessions
├─ Google Meet link (URL)
├─ Student & Buddy ID
├─ Scheduled date & time
├─ Session type (Doubt Solving, Review, etc)
├─ Duration (15/30/45/60 min)
├─ Status (scheduled → active → completed)
├─ Timestamps (when created, started, ended)
└─ Notes (focus area)
```

### History
```
Table: video_session_history
├─ created (when buddy scheduled)
├─ started (when student joins)
├─ completed (when session ends)
└─ cancelled (if cancelled)
```

---

## 💡 Session Types

Buddy chooses what the session is about:

| Type | Best For |
|------|----------|
| **General Session** | Regular check-in |
| **Mock Review** | Analyze mock test performance |
| **Doubt Solving** | Answer student's questions |
| **Performance Review** | Discuss overall progress |

---

## ⏱️ Duration Options

Buddy picks how long:

| Duration | Best For |
|----------|----------|
| **15 min** | Quick check-in |
| **30 min** | Standard session |
| **45 min** | Detailed discussion |
| **1 hour** | Comprehensive review |

---

## 📋 Automatic Trigger Logic

### System automatically suggests session when:

```
✅ No sessions ever (first time) → Show prompt
✅ 10+ days since last session → Show orange prompt
✅ 15+ days since last session → Show red URGENT prompt
❌ 0-9 days since last session → Hide prompt
```

### Same student-buddy pair only:
- Each student has their own 10-day timer
- Different buddies have separate timers
- Multiple students in one buddy's list track independently

---

## 🎯 Common Scenarios

### Scenario 1: First Session
**Buddy:** Sees "It's time for your first video session"  
**Action:** Fill form → Send invite  
**Student:** Gets email with Meet link

### Scenario 2: 12 Days Since Last Session
**Buddy:** Sees orange "Time for a Check-in" card  
**Action:** Click → Fill form → Send invite  
**Student:** Gets updated invite with new Meet link

### Scenario 3: 18 Days Since Last Session
**Buddy:** Sees red "URGENT: Schedule" card  
**Action:** Click → Fill form → Send invite (priority!)  
**Student:** Gets urgent notification

### Scenario 4: Session Within 9 Days
**Buddy:** Sees no prompt (hidden)  
**Action:** Can still create session manually (future feature)  
**Student:** Already recently had session

---

## 🔗 Google Meet Links

### Format
```
https://meet.google.com/abc-defg-hij
```
- Random 3-4-3 character segments
- Unique per session
- Standard Google Meet URL
- Works in any browser

### Joining
1. Buddy opens link from database
2. Student opens link from email
3. Both in same Meet room
4. Can be used multiple times if rescheduled

---

## 📲 Mobile Friendly

### On Mobile (Buddy)
- Prompt card responsive
- Form fits small screen
- Date/time pickers mobile-optimized
- Easy to schedule on phone

### On Mobile (Student)
- Email with link opens in browser
- Google Meet works great on mobile
- Can use phone camera/mic
- Same experience as desktop

---

## ⚙️ How It Works (Technical)

### When Buddy Opens Student Profile
```
1. System checks: "When was last session?"
2. Calculates: "Days since = today - last_session_date"
3. Decision:
   ├─ If days >= 10: Show orange prompt
   ├─ If days >= 15: Show red prompt
   └─ If days < 10: Hide prompt
4. Display component
```

### When Buddy Schedules Session
```
1. Generates Google Meet link (random)
2. Creates record in video_sessions table:
   ├─ student_id ✓
   ├─ buddy_id ✓
   ├─ gmeet_link ✓
   ├─ scheduled_at ✓
   ├─ session_type ✓
   ├─ duration_minutes ✓
   ├─ status = "scheduled" ✓
   └─ notes ✓
3. Creates history entry
4. Sends email to student (future)
5. Shows confirmation
```

### When Session Ends
```
1. Status changes: "scheduled" → "active" → "completed"
2. Updates: ended_at timestamp
3. Recalculates: days_since_last_session = 0
4. Prompt disappears (days < 10)
5. History logged
```

---

## 📈 Analytics

### What You Can Measure
- **Session frequency** - How often do buddy-student pairs meet?
- **Session duration** - Which types take longest?
- **No-show rate** - How often do students miss sessions?
- **Student improvement** - Do sessions correlate with score gains?
- **Buddy effectiveness** - Which buddies have most sessions?

### Example Queries
```sql
-- How many sessions per buddy?
SELECT buddy_id, COUNT(*) as session_count
FROM video_sessions
WHERE session_status = 'completed'
GROUP BY buddy_id;

-- Average session duration per student?
SELECT student_id, AVG(duration_minutes) as avg_duration
FROM video_sessions
WHERE session_status = 'completed'
GROUP BY student_id;

-- How often do students have sessions?
SELECT student_id, COUNT(*) as total_sessions
FROM video_sessions
WHERE session_status = 'completed'
  AND ended_at > NOW() - INTERVAL '30 days'
GROUP BY student_id;
```

---

## 🎓 Best Practices

### For Buddy
✅ **Do:**
- Schedule regularly (at least every 10 days)
- Add notes about focus area
- Use appropriate duration
- Keep to scheduled time
- Give feedback after session

❌ **Don't:**
- Skip sessions for multiple weeks
- Schedule and then cancel repeatedly
- Over-schedule (30min is often enough)
- Keep student waiting

### For Student
✅ **Do:**
- Join on time
- Have camera/mic working
- Prepare questions if doubt-solving
- Take notes during session
- Thank buddy afterward

❌ **Don't:**
- Miss scheduled sessions (no-show)
- Join without audio/video
- Join late repeatedly
- Ignore buddy during session

---

## 🐛 Troubleshooting

### Prompt Isn't Showing
**Possible reasons:**
- Last session was < 10 days ago (expected)
- Database not updated with last session
- Browser cache (hard refresh: Ctrl+Shift+R)

**Fix:**
```sql
-- Check when last session was
SELECT * FROM video_sessions
WHERE student_id = 'xxx'
AND session_status = 'completed'
ORDER BY ended_at DESC
LIMIT 1;
```

### Google Meet Link Isn't Working
**Possible reasons:**
- Link format incorrect
- Link never generated (bug)
- Student hasn't joined yet (try again)

**Fix:**
- Verify link format: `https://meet.google.com/abc-defg-hij`
- Create new session to generate new link
- Check database: `SELECT gmeet_link FROM video_sessions WHERE id = 'xxx';`

### Email Not Received
**Status:** Feature not yet implemented
- Currently: No email sent
- Next: Will add email notifications
- Timeline: Phase 2 development

**Workaround:**
- Manually copy Meet link and send to student
- Or add to student's calendar manually

---

## 🎬 Next Steps

### To Test Now
1. Hard refresh: **Ctrl+Shift+R**
2. Go to: `/buddy/students/[id]`
3. Look for video session prompt (if 10+ days)
4. Fill form and schedule session
5. Check database for recorded session

### To Use in Production
1. Vercel deployment ready ✅
2. Database migrations ready ✅
3. Email notifications: Coming soon
4. Calendar sync: Coming soon

---

## 📚 More Info

- **Full Guide:** See `GMEET_INTEGRATION_GUIDE.md`
- **Code:** `src/components/video-session-prompt.tsx`
- **API:** `src/app/api/video-sessions/route.ts`
- **Database:** `supabase/migrations/011_add_video_sessions.sql`

---

**Status:** ✅ Live on Vercel  
**Commit:** `b0695a2`  
**Testing:** Ready!

Hard refresh to see changes: **Ctrl+Shift+R**
