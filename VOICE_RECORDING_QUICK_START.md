# 🎙️ Voice Recording - Complete Setup & Testing Guide

## ✅ QUICK START (5 Minutes)

### Phase 1: Deployed Code (✓ DONE)
✅ Voice recording UI components installed  
✅ Buddy feedback card created  
✅ Student voice notes card created  
✅ Diagnostic test page deployed  

**Current App Status:**
- Student homepage: Shows "Buddy Feedback" & "Your Voice Notes" sections
- Buddy dashboard: Shows "Student Voice Notes" section
- Diagnostic page: `/admin/voice-test` for testing setup

---

## 📋 Phase 2: Database Setup (5 min)

**Go to:** https://supabase.com → Your Project → SQL Editor

**Copy & Paste ALL this code at once:**

```sql
-- Add voice note columns to buddy_feedback
ALTER TABLE public.buddy_feedback
ADD COLUMN IF NOT EXISTS voice_note_url TEXT,
ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50) DEFAULT 'text',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Make these nullable for voice-only messages
ALTER TABLE public.buddy_feedback
ALTER COLUMN feedback_text DROP NOT NULL;

ALTER TABLE public.buddy_feedback
ALTER COLUMN feedback_date DROP NOT NULL;

-- Create index for fast queries
CREATE INDEX IF NOT EXISTS idx_buddy_feedback_voice_notes
ON public.buddy_feedback (student_id, created_at DESC)
WHERE voice_note_url IS NOT NULL;
```

**Click: Run**

✅ **Done! Database is ready**

---

## 💾 Phase 3: Storage Bucket Setup (3 min)

**Go to:** https://supabase.com → Your Project → **Storage**

### Step 1: Create Bucket
- Click **Create New Bucket**
- Name: `voice-notes` (exactly)
- Select: **Public** bucket
- Click **Create**

### Step 2: Set Permissions
- Open `voice-notes` bucket
- Go to **Policies** tab
- **Create Policy** button

**Policy 1 - Upload:**
```sql
CREATE POLICY "Allow authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'voice-notes');
```

**Policy 2 - Download:**
```sql
CREATE POLICY "Allow public reads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'voice-notes');
```

✅ **Done! Storage bucket ready**

---

## 🧪 Phase 4: Test Everything (3 min)

### Run Diagnostic Test:
1. Open: https://careerrai-daily.vercel.app/admin/voice-test
2. View all test results
3. Look for ✓ (green checkmarks) on:
   - ✓ Authentication
   - ✓ Database Schema
   - ✓ Storage Bucket
   - ✓ Microphone Access

### If All Green ✓
Great! Everything is set up. Proceed to testing.

### If Anything is Red ✗
- Read the error message carefully
- Follow the troubleshooting steps below
- Run test again

---

## 🎬 Phase 5: Test Voice Recording (5 min each)

### TEST 1: Student Record Voice Note

**Student:**
1. Log in to app
2. Go to `/student/home`
3. Scroll to **"YOUR VOICE NOTES"** section (orange box)
4. Click **"Record new note"** button
5. Record a 5-10 second message: *"Hi buddy, this is a test voice note"*
6. Click **"Send Voice Note"** button
7. ✅ Should see success message

**Verify:**
- Message appears in "Your Voice Notes" section
- Buddy sees it in their dashboard

---

### TEST 2: Buddy Record Voice Feedback

**Buddy:**
1. Log in to app
2. Go to `/buddy/home`
3. Scroll to **"STUDENT VOICE NOTES & DOUBTS"** section (orange box)
4. Click on student name
5. Look for **"Record voice response"** button (at top or in feedback section)
6. Click it
7. Record a 5-10 second message: *"Thanks for sharing! Here's my feedback..."*
8. Click **"Send Voice Note"** button
9. ✅ Should see success message

**Verify:**
- Message appears in student's "Buddy Feedback" section
- Student can click play to hear the message

---

## 📊 TEST RESULTS CHECKLIST

Mark each test:

### Student Voice Note Test
- [ ] Can click "Record new note" button
- [ ] Can record audio (hear yourself in preview)
- [ ] Can click "Send Voice Note"
- [ ] No error message appears
- [ ] Message uploads successfully
- [ ] Appears in student's voice notes list
- [ ] Buddy can see it in dashboard

### Buddy Voice Feedback Test
- [ ] Can click "Record voice response" button
- [ ] Can record audio (hear yourself in preview)
- [ ] Can click "Send Voice Note"
- [ ] No error message appears
- [ ] Message uploads successfully
- [ ] Appears in student's buddy feedback section
- [ ] Student can play back the audio

### Audio Playback Test
- [ ] Can click "Play" on recorded message
- [ ] Audio plays clearly
- [ ] Can pause/resume
- [ ] Can see progress bar

---

## 🔧 TROUBLESHOOTING

### Error: "Failed to send voice note"

**Fix 1: Check Storage Bucket**
```
Supabase → Storage
✓ Do you see 'voice-notes' bucket?
✓ Is it marked as PUBLIC?
```

**Fix 2: Check Policies**
```
Supabase → Storage → voice-notes → Policies
✓ Do you have 2 policies?
✓ Did both create successfully?
```

**Fix 3: Check Microphone**
```
Browser → Settings → Site Permissions → Microphone
✓ Is microphone ALLOWED for this site?
```

**Fix 4: Check Console**
```
Open DevTools (F12)
Go to Console tab
Try recording again
✓ What error message appears?
```

### Error: "File uploaded but nothing appears"

**Likely causes:**
1. RLS policies blocking inserts to buddy_feedback
2. voice_note_url column not created
3. Bucket not public

**Fix:**
1. Re-run database migrations
2. Check if voice_note_url column exists
3. Set bucket to PUBLIC

### Microphone Not Working

**Fixes:**
1. Browser → Settings → Permissions → Microphone = ALLOWED
2. HTTPS required (voice recording needs secure context)
3. Try different browser
4. Restart browser

---

## 📞 HELP

If something isn't working:

1. **Open diagnostic page:** `/admin/voice-test`
2. **Run manual test:** Record and upload audio
3. **Check error message:** Read carefully
4. **Follow troubleshooting:** Above

---

## ✨ SUCCESS INDICATORS

You'll know it's working when:

✓ Record button appears and is clickable  
✓ Recording UI shows with timer  
✓ Preview shows audio waveform  
✓ "Send Voice Note" uploads without error  
✓ Message appears in the other person's view  
✓ They can play back and hear your voice  

---

## 🚀 YOU'RE ALL SET!

Once all tests pass ✓:
- Students can record doubts and notes
- Buddies can record audio feedback
- Both can listen to each other's messages
- Everything saves and syncs properly

Enjoy voice feedback! 🎙️
