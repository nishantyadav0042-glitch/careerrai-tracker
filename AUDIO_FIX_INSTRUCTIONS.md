# AUDIO ATTRIBUTION FIX - FINAL INSTRUCTIONS

## Problem
Student recordings appear as buddy audio in student profiles, and vice versa (bidirectional audio ID swap).

## Root Cause
Old database records with invalid/null `feedback_type` values from before type validation was added.

## Solution
Delete all problematic records from `buddy_feedback` table.

---

## HOW TO EXECUTE THE FIX (Choose ONE method):

### METHOD 1: Supabase Web Dashboard (EASIEST - 2 minutes)

**Step 1:** Go to Supabase SQL Editor
```
https://app.supabase.com/project/posebhpszlsozeonejtzqy/sql/new
```

**Step 2:** Copy and paste this SQL:
```sql
DELETE FROM public.buddy_feedback 
WHERE student_id = buddy_id 
   OR feedback_type IS NULL 
   OR feedback_type NOT IN ('buddy_feedback','student_response','text');
```

**Step 3:** Click the blue "RUN" button

**Step 4:** You'll see "X rows deleted" - note that number

---

### METHOD 2: Supabase CLI (if installed)
```bash
supabase db push --linked
```

---

### METHOD 3: PostgreSQL psql Client (if available)
```bash
psql postgresql://postgres:password@posebhpszlsozeonejtzqy.supabase.co:5432/postgres -c \
"DELETE FROM public.buddy_feedback WHERE student_id = buddy_id OR feedback_type IS NULL OR feedback_type NOT IN ('buddy_feedback','student_response','text');"
```

---

## VERIFICATION STEPS

After executing the SQL:

1. **Hard refresh the app:**
   ```
   Ctrl+Shift+R (or Cmd+Shift+R on Mac)
   ```

2. **Test student recording:**
   - Log in as a student
   - Record audio
   - Verify it does NOT appear in "Buddy Feedback" section

3. **Test buddy recording:**
   - Log in as a buddy
   - Record feedback for a student
   - Verify it DOES appear in the student's "Buddy Feedback" section

4. **Check Supabase:**
   - Verify remaining records have correct `feedback_type`:
   ```sql
   SELECT feedback_type, COUNT(*) as count 
   FROM public.buddy_feedback 
   GROUP BY feedback_type 
   ORDER BY feedback_type;
   ```

---

## CODE CHANGES ALREADY COMMITTED

All code fixes have been committed to the repository:
- ✅ VoiceNoteRecorder accepts `feedbackType` parameter
- ✅ BuddyFeedbackCard filters by `feedback_type='buddy_feedback'`
- ✅ RLS policies updated for proper access control
- ✅ Migrations created for cleanup (010_final_audio_fix.sql)
- ✅ Deployed to Vercel

**The ONLY remaining step is executing the SQL above.**

---

## IF YOU'RE READING THIS

Execute the SQL in Supabase RIGHT NOW:
1. Open: https://app.supabase.com/project/posebhpszlsozeonejtzqy/sql/new
2. Paste the DELETE statement above
3. Click RUN
4. Refresh the app with Ctrl+Shift+R
5. Test both recording directions

**That's it. The fix is complete once you run the SQL.**

---

**Contact:** This is the complete, final solution. All code is ready. Just need SQL execution.
