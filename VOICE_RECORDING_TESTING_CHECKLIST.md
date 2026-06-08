# Voice Recording System - Testing Checklist & Debugging Guide

## Current Status Summary

**Last Update:** 2026-06-08
**Test Environment:** Local dev server (localhost:3000) + Vercel deployment

### Network Blocker Alert ⚠️
The local development machine has a system firewall that blocks all outbound HTTPS connections to Supabase. This prevents:
- ❌ Seed script execution (cannot create demo users)
- ❌ Local database login (Supabase auth unreachable)
- ❌ Local testing of protected pages

**Workaround:** Test on https://careerrai-daily.vercel.app (Vercel deployment has full network access to Supabase)

---

## Demo Login Credentials (for Vercel Testing)

All use password: `CareerRai2026!`

| Role | Username | Email |
|------|----------|-------|
| Student | `aarav` | aarav@careerrai.com |
| Student | `priya` | priya@careerrai.com |
| Buddy | `nishant` | nishant@careerrai.com |
| Admin | `admin` | admin@careerrai.com |

If credentials don't work, run the seed script first (requires network access to Supabase):
```bash
node scripts/seed.mjs
```

---

## Part 1: Code Implementation Status ✅

### 1.1 VoiceNoteRecorder Component
**File:** `src/components/voice-note-recorder.tsx`

**Status:** ✅ IMPLEMENTED
- ✅ Accepts `feedbackType` parameter
- ✅ Three modes: 'buddy_feedback', 'student_response', 'text'
- ✅ Records to WebM audio codec
- ✅ Uploads to 'voice-notes' storage bucket
- ✅ Enforces feedbackType in database insert

**Code Check:**
```typescript
// Component enforces feedbackType parameter:
const feedbackType = feedbackTypeParam ?? 'buddy_feedback'; // Default is explicit
// Data insert includes:
{ feedback_type: feedbackType, voice_note_url: signedUrl, ... }
```

### 1.2 Student Panel (Buddy Feedback View)
**File:** `src/app/student/home/buddy-feedback-card.tsx`

**Status:** ✅ IMPLEMENTED
- ✅ Passes `feedbackType="student_response"` to VoiceNoteRecorder
- ✅ Shows "Record voice response" button for buddy feedback
- ✅ Filters buddy feedback by `.eq('feedback_type', 'buddy_feedback')`
- ✅ Prevents self-feedback (checks `buddyId !== studentId`)

**Code Check:**
```typescript
// Student can only record responses to buddy feedback, not record as buddy
<VoiceNoteRecorder 
  feedbackType="student_response"  // Only student responses
  studentId={studentId}
  buddyId={buddyId}
/>

// Displays only buddy feedback:
.select('*')
.eq('feedback_type', 'buddy_feedback')  // Only shows buddy audio
```

### 1.3 Buddy Panel (Recording To Student)
**File:** `src/app/buddy/students/[id]/buddy-student-view-client.tsx`

**Status:** ✅ IMPLEMENTED
- ✅ Passes `feedbackType="buddy_feedback"` to VoiceNoteRecorder
- ✅ Floating "Voice Note" button for recording feedback
- ✅ Records for specific student
- ✅ Stores with correct feedback_type

**Code Check:**
```typescript
// Buddy records feedback for student:
<VoiceNoteRecorder 
  feedbackType="buddy_feedback"  // Only buddy feedback
  studentId={studentId}
  buddyId={buddyId}
/>
```

### 1.4 Database RLS Policies
**File:** `supabase/migrations/007_fix_voice_feedback_rls.sql`

**Status:** ✅ IMPLEMENTED
- ✅ Policy: "Buddy can insert feedback for their students"
  - Allows: `buddy_id = auth.uid()`
  - Prevents: Students recording as buddy (self-feedback)
  
- ✅ Policy: "Student can send voice responses"
  - Allows: `student_id = auth.uid()`
  - Prevents: Buddies recording student responses

- ✅ Policy: "Can read relevant feedback"
  - Allows: `buddy_id = auth.uid() OR student_id = auth.uid()`
  - Prevents: Cross-student visibility

**Code Check:**
```sql
-- Buddy can only insert records where they are the buddy
CREATE POLICY "Buddy can insert feedback" ON buddy_feedback
FOR INSERT WITH CHECK (auth.uid() = buddy_id);

-- Student can only insert where they are the student
CREATE POLICY "Student can respond" ON buddy_feedback
FOR INSERT WITH CHECK (auth.uid() = student_id AND feedback_type = 'student_response');

-- Can only see own records
CREATE POLICY "Can read relevant feedback" ON buddy_feedback
FOR SELECT USING (auth.uid() = buddy_id OR auth.uid() = student_id);
```

### 1.5 Data Cleanup Scripts
**Status:** ✅ IMPLEMENTED

Three layers of cleanup implemented:

1. **Migration 008** (`008_cleanup_test_recordings.sql`)
   - Removes records with `feedback_type` NULL or invalid values
   - Removes self-feedback records (buddy_id = student_id)

2. **Migration 009** (`009_comprehensive_audio_fix.sql`)
   - Three-step cleanup process
   - Delete self-feedback
   - Delete invalid types
   - Verify cleanup

3. **Admin API Endpoint** (`src/app/api/admin/fix-audio-issue/route.ts`)
   - Programmatic cleanup execution
   - Returns detailed statistics
   - Can be called manually via: `POST /api/admin/fix-audio-issue`

---

## Part 2: Systematic Testing Plan

### Prerequisites
Before testing, ensure:
1. ✅ You have network access to Supabase (localhost cannot test due to firewall)
2. ✅ Demo users are seeded (run `node scripts/seed.mjs` if needed)
3. ✅ Use https://careerrai-daily.vercel.app for testing
4. ✅ Open browser DevTools (F12) to check for errors

### Test Setup
**Open 2-3 browser windows side-by-side:**
- Window 1: Student (Aarav)
- Window 2: Buddy (Nishant)
- Window 3: Admin (optional, for verification)

---

## Test 1: STUDENT PANEL - Cannot Record as Buddy ❌ (Expected)

**Goal:** Verify students CANNOT record buddy feedback (only responses)

### Steps:
1. Log in as **Student (Aarav)**
2. Go to `/student/home`
3. Look for "Buddy Feedback" section
4. Find a buddy feedback card with a "Record voice response" button
5. DO NOT CLICK (just verify the button appears)

### Expected Result:
- ✅ "Record voice response" button is visible
- ✅ NOT a "Record feedback" button (no buddy recording)
- ✅ Button records as `student_response`, NOT as buddy

### If FAILED:
- Check browser console (F12 → Console) for errors
- Verify `buddy-feedback-card.tsx` line 95-105:
  ```typescript
  <VoiceNoteRecorder feedbackType="student_response" />
  ```
- Look for: Are there multiple recording buttons? Wrong button type?

---

## Test 2: BUDDY PANEL - Can Record Feedback ✅

**Goal:** Verify buddy CAN record feedback for students

### Steps:
1. Log in as **Buddy (Nishant)** (in separate window)
2. Go to `/buddy/students`
3. Click on a student (e.g., "Aarav Sharma")
4. Look for floating "Voice Note" button (bottom-right area)
5. Click "Voice Note" button
6. **Record 5-10 seconds of audio** (say something like "Hello, this is a test")
7. Click "Send"
8. **Wait for upload** (should show success message)

### Expected Result:
- ✅ Floating "Voice Note" button appears
- ✅ Recording UI opens
- ✅ Audio records without errors
- ✅ "Send" button becomes active after recording
- ✅ Upload completes without errors
- ✅ Success message appears: "Voice feedback recorded successfully"

### If FAILED:
- **No "Voice Note" button visible?**
  - Check `buddy-student-view-client.tsx` line 150-160
  - Look for: `<button ... >Voice Note</button>`
  - Verify component is rendered

- **Recording button appears but recording won't start?**
  - Check browser console for microphone permission errors
  - May need to grant microphone access to localhost:3000
  - Error message will say: "NotAllowedError: Permission denied" if mic denied

- **Recording works but upload fails?**
  - Check network tab (F12 → Network)
  - Look for PUT request to Supabase storage
  - Check response: Should be 200 OK
  - If error, check storage bucket permissions

- **Upload succeeds but no success message?**
  - Check browser console for JavaScript errors
  - May be an issue with response handling

---

## Test 3: STUDENT PANEL - Can See Buddy Feedback ✅

**Goal:** Verify student sees buddy feedback but NOT their own recordings

### Steps (as Student Aarav):
1. You should still be logged in as Student (Aarav)
2. Go to `/student/home`
3. Find the buddy feedback section
4. Look for the voice feedback you just recorded (from Buddy Nishant)
5. Should see: Audio player with play button

### Expected Result:
- ✅ Buddy's voice feedback appears in the list
- ✅ Can click play button
- ✅ Audio plays (you hear the Buddy's test recording)
- ✅ "Record voice response" button appears under the feedback card

### If FAILED:
- **No buddy feedback appears?**
  - Check F12 Network tab: Look for query to `/buddy_feedback` table
  - Response should include the record you just created
  - If no data, check that:
    - `feedback_type = 'buddy_feedback'` (not 'text' or null)
    - `buddy_id` matches Nishant's ID
    - `student_id` matches Aarav's ID
    - Check RLS: Is there an "X-Row-Count: 0" in response?

- **Audio player doesn't appear?**
  - Check `buddy-feedback-card.tsx` line 160-180
  - Look for: `<audio controls>` element
  - Verify `voice_note_url` is populated in database

- **Audio file 404 when trying to play?**
  - Check Supabase storage bucket: `voice-notes`
  - Verify file exists and is publicly accessible
  - Check signed URL generation in API

---

## Test 4: STUDENT PANEL - Can Record Response ✅

**Goal:** Verify student CAN record response to buddy feedback

### Steps (as Student Aarav):
1. Find the buddy feedback card with the "Record voice response" button
2. Click "Record voice response"
3. **Record 5-10 seconds** (say "Thanks for the feedback")
4. Click "Send"

### Expected Result:
- ✅ Recording UI opens
- ✅ Audio records successfully
- ✅ "Send" button active after recording
- ✅ Upload completes without errors
- ✅ Success message appears
- ✅ Response appears in feedback card

### If FAILED:
- Troubleshoot same as Test 2 (recording/upload issues)

---

## Test 5: BUDDY PANEL - Can See Student Response ✅

**Goal:** Verify buddy sees student responses

### Steps (as Buddy Nishant):
1. Go back to the student view (should still be logged in)
2. Click the student again (e.g., Aarav)
3. Look for "Student Responses" section (or similar)
4. Should see the response audio you just recorded

### Expected Result:
- ✅ Student response appears in feedback card
- ✅ Can play the student's response audio
- ✅ Audio plays correctly

### If FAILED:
- **Response doesn't appear?**
  - Check database directly (F12 → Network → look for queries)
  - Verify `feedback_type = 'student_response'` in response
  - Check RLS policy: Can buddy see student responses?
  - Verify `student_id` matches, `buddy_id` matches Nishant

---

## Test 6: CROSS-BUDDY ISOLATION ✅

**Goal:** Verify Buddy1 cannot see Buddy2's students' data

### Steps:
1. Create a second buddy account (or use existing if available)
2. Log in as Buddy2
3. Go to `/buddy/students`
4. Try to access a student that belongs to Buddy1 (not Buddy2)
5. Expected: 404 or redirect, NOT able to see student details

### Expected Result:
- ✅ 404 Page or "Not Found" error
- ✅ Cannot access other buddy's students
- ✅ Cannot see their voice feedback

### If FAILED:
- **Can see other buddy's students?**
  - RLS policy failing!
  - Check migration 007: Is the policy correctly filtering by `buddy_id`?
  - Database query should have: `.eq('buddy_id', auth.uid())`

---

## Test 7: STUDENT ISOLATION ✅

**Goal:** Verify Student1 cannot see Student2's data

### Steps:
1. Create/use second student account
2. Log in as Student2
3. Go to `/student/home`
4. Verify: You only see YOUR buddy feedback (not other students')

### Expected Result:
- ✅ Only see buddy feedback for YOUR assigned buddy
- ✅ Cannot see other students' feedback

### If FAILED:
- **Can see other students' data?**
  - RLS policy failing!
  - Check: Is the query filtering by `student_id`?

---

## Test 8: ADMIN PANEL - Data Verification ✅

**Goal:** Verify admin can see overall system state

### Steps:
1. Log in as **Admin**
2. Go to `/admin`
3. Look for voice recording data or feedback statistics
4. Verify you can see (but maybe not modify):
   - Total recordings
   - Recordings by type (buddy_feedback vs student_response)
   - Any errors or orphaned records

### Expected Result:
- ✅ Admin can see voice feedback data
- ✅ Data is categorized by type
- ✅ Statistics are accurate

### If FAILED:
- Check admin panel implementation for voice feedback display

---

## Test 9: LOG SUBMISSION (Yesterday's Fix) ✅

**Goal:** Verify students can submit daily logs with voice feedback

### Steps (as Student):
1. Go to `/student/home`
2. Look for "Daily Log" or "Today's Report" section
3. Fill in the log with various metrics
4. Look for an option to "Add voice note" to the log
5. Click to add voice, record something
6. Submit the log

### Expected Result:
- ✅ Can record voice note for the log
- ✅ Voice note is attached to the log entry
- ✅ Log submits successfully with voice
- ✅ Voice note is saved and retrievable

### If FAILED:
- Check: Are there any error messages?
- Check console (F12) for JavaScript errors
- Verify log submission endpoint is working

---

## Part 3: Debugging Checklist

If tests FAIL, use this systematic debugging approach:

### 3.1 Microphone Permission Issues
**Symptom:** Recording button doesn't work, permission denied error

**Debug Steps:**
1. Check browser permissions: Click 🔒 lock icon in address bar
2. Look for "Microphone" → Should be "Allow"
3. If "Block" → Change to "Allow"
4. Refresh page
5. Try recording again

**If still fails:**
- Check browser console (F12 → Console)
- Look for: `NotAllowedError: Permission denied`
- May need to use HTTPS (localhost works, but http://vercel-url won't)

### 3.2 Storage Upload Failures
**Symptom:** Recording works but upload fails with 403 or 404

**Debug Steps:**
1. Open F12 → Network tab
2. Record and try to upload
3. Look for PUT request to Supabase storage
4. Check response status: 403 = Permission denied, 404 = Bucket not found

**If 403:**
- Storage bucket permissions not set correctly
- Check `supabase/migrations/006_create_voice_storage.sql`
- Verify bucket exists and is public

**If 404:**
- Voice storage bucket doesn't exist
- Run migration: `supabase migration up`
- Or run setup: `POST /api/setup-bucket`

### 3.3 Database Visibility Issues
**Symptom:** Recording uploads but doesn't appear in UI

**Debug Steps:**
1. Open F12 → Network tab
2. Navigate to student home page
3. Look for request to `/buddy_feedback` table
4. Check response: Should contain your new recording

**If not in response:**
- **RLS policy blocking the query**
  - Check auth user ID matches
  - Verify RLS policy in database
  - Try querying as admin: `supabase query --role admin`

- **Wrong feedback_type**
  - Check database directly
  - Should be 'buddy_feedback' or 'student_response', never null
  - If null: Run cleanup migration

- **Wrong student_id or buddy_id**
  - Verify IDs match in recording and assignment

### 3.4 Frontend Component Issues
**Symptom:** Button doesn't appear, component missing

**Debug Steps:**
1. Open F12 → Elements tab
2. Search for button text (e.g., "Record voice feedback")
3. If found in DOM: CSS issue (hidden, display: none)
4. If NOT in DOM: Component not rendering

**If not rendering:**
- Check conditional logic in component file
- Verify props are passed correctly
- Check parent component has required data

**If rendering but hidden:**
- Check CSS classes
- Look in DevTools for `display: none` or `visibility: hidden`
- Check Tailwind classes

### 3.5 Audio File Issues
**Symptom:** Recording uploads but won't play or 404

**Debug Steps:**
1. Find the recording in database
2. Copy the `voice_note_url`
3. Paste in new browser tab
4. If 404 → file doesn't exist in storage
5. If plays → file OK, issue is in UI

**If file doesn't exist:**
- Upload failed silently
- Check browser console during upload
- Check server logs: `npm run logs` or Vercel dashboard

**If signed URL expired:**
- URLs generated with 7-day expiry
- Check: Is date > 7 days after creation?
- Regenerate URL in database

### 3.6 Cross-Panel Visibility Issues
**Symptom:** Buddy records but student doesn't see it, or vice versa

**Debug Steps:**
1. **On Buddy panel:**
   - Record feedback, note the timestamp
   - Open DevTools Network tab, find the POST request
   - Check response: should show inserted ID and feedback_type

2. **Switch to Student panel:**
   - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
   - Check Network tab for buddy_feedback query
   - Count returned records

**If student doesn't see buddy's recording:**
- `feedback_type` is wrong (student_response instead of buddy_feedback)
- `student_id` or `buddy_id` mismatch
- RLS policy blocking the query (check row count in response)

**If buddy doesn't see student's response:**
- `feedback_type` is wrong (buddy_feedback instead of student_response)
- Response filters are wrong in code
- Check `buddy-student-view-client.tsx`: Is it querying student_response records?

---

## Part 4: Final Verification Checklist

Once all tests pass, verify these final conditions:

### ✅ Audio Attribution is Correct
- [ ] Student recordings show in student panel (as responses)
- [ ] Student recordings do NOT show in buddy's view
- [ ] Buddy recordings show in student's panel (as feedback)
- [ ] Buddy recordings do NOT show as student submissions

### ✅ Visibility is Locked Down
- [ ] Student1 cannot see Student2's data
- [ ] Buddy1 cannot see Buddy2's students
- [ ] Admin can see all data
- [ ] No orphaned or incorrect records

### ✅ Storage is Clean
- [ ] No null feedback_type records
- [ ] No self-feedback (buddy_id = student_id)
- [ ] All files exist in storage bucket
- [ ] No expired signed URLs

### ✅ UI is Clear
- [ ] Students see "Record voice response" button
- [ ] Buddies see "Voice Note" button
- [ ] Recording buttons are labeled correctly
- [ ] No duplicate buttons or options

### ✅ Functionality Works
- [ ] Recording works without errors
- [ ] Upload completes successfully
- [ ] Audio plays back correctly
- [ ] Data persists after refresh

---

## Part 5: Running the Tests in Sequence

### Quick Test (15 minutes)
1. Test 2: Buddy records ✅
2. Test 3: Student sees buddy feedback ✅
3. Test 4: Student records response ✅
4. Test 5: Buddy sees student response ✅

### Full Test (45 minutes)
1. Run all Tests 1-9
2. Document any failures
3. Use debugging checklist for each failure
4. Re-test after fixing

### Smoke Test (5 minutes)
1. Log in to all three roles
2. Verify each role can navigate to expected pages
3. Verify no 404 or 500 errors

---

## Command Reference

### Local Testing (if network is available)
```bash
# Start dev server
npm run dev

# Run seed script
node scripts/seed.mjs

# Fix usernames
node scripts/fix-usernames.mjs

# Run verification tests
npm run test
```

### Database Debugging
```bash
# List all records
supabase query "SELECT * FROM buddy_feedback LIMIT 10"

# Check RLS
supabase query "SELECT * FROM buddy_feedback WHERE student_id = auth.uid()"

# Clean up
supabase query "DELETE FROM buddy_feedback WHERE feedback_type IS NULL"
```

### Vercel Debugging
- Deployment logs: https://vercel.com/dashboard
- Runtime errors: Check "Logs" tab in Vercel dashboard
- Database state: Check Supabase dashboard directly

---

## Summary of Expected Behavior

| Actor | Can Record | Can See |
|-------|-----------|---------|
| **Student** | Responses (to buddy) | Buddy feedback |
| **Buddy** | Feedback (for student) | Student responses |
| **Admin** | (via API) | Everything |

| Visibility | Student1 | Student2 | Buddy1 | Buddy2 | Admin |
|-----------|----------|----------|--------|--------|-------|
| **Student1 recordings** | ✅ See | ❌ No | ❌ No | ❌ No | ✅ See |
| **Student2 recordings** | ❌ No | ✅ See | ❌ No | ❌ No | ✅ See |
| **Buddy1 feedback** | ✅ See* | ❌ No | ❌ Own | ❌ No | ✅ See |
| **Buddy2 feedback** | ❌ No | ✅ See* | ❌ No | ❌ Own | ✅ See |

*Only if student is assigned to that buddy

---

## Contact & Questions

If tests pass: ✅ **DONE** - Voice recording system is working correctly

If tests fail: Document which test failed and paste the debugging output from Part 3

For additional questions: Check the code files referenced throughout this guide
