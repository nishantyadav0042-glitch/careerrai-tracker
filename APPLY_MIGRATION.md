# ⚠️ Apply Video Sessions Migration

**Error:** `Failed to schedule session`  
**Root Cause:** The `video_sessions` table doesn't exist yet

---

## 🔧 Quick Fix (2 minutes)

### Option 1: Using Supabase Dashboard (Easiest)

1. Go to: https://supabase.com → Your Project
2. Click: **SQL Editor** (left sidebar)
3. Click: **New Query**
4. Copy & paste the SQL below (entire migration file)
5. Click: **Run** (blue button)
6. Done! ✅

### Option 2: Using Supabase CLI

```bash
cd C:\Users\shekh\careerrai-tracker

# Link to Supabase project (if not linked)
supabase link --project-ref your-project-ref

# Push migration
supabase db push
```

### Option 3: Using Vercel Environment

If you're on Vercel with Supabase:
1. Check Supabase dashboard for pending migrations
2. Apply from dashboard UI
3. Refresh Vercel app

---

## 📋 Migration SQL

Run this in Supabase SQL Editor:

```sql
-- Add video sessions table for buddy-student video calls

CREATE TABLE IF NOT EXISTS public.video_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buddy_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Google Meet link and session details
  gmeet_link TEXT,
  session_status VARCHAR(50) DEFAULT 'scheduled',
  session_type VARCHAR(50) DEFAULT 'session',
  duration_minutes INTEGER DEFAULT 30,

  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Days since last session tracking
  last_session_date TIMESTAMPTZ,
  days_since_last_session INTEGER,

  -- Notifications
  student_notified BOOLEAN DEFAULT FALSE,
  buddy_notified BOOLEAN DEFAULT FALSE,
  reminder_sent BOOLEAN DEFAULT FALSE,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (session_status IN ('scheduled', 'active', 'completed', 'cancelled')),
  CONSTRAINT valid_type CHECK (session_type IN ('session', 'review', 'doubt_solving', 'mock_review'))
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_video_sessions_student ON public.video_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_buddy ON public.video_sessions(buddy_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_scheduled ON public.video_sessions(scheduled_at) WHERE session_status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_video_sessions_days_since ON public.video_sessions(student_id, last_session_date);

-- RLS Policies
ALTER TABLE public.video_sessions ENABLE ROW LEVEL SECURITY;

-- Students can view their own video sessions
CREATE POLICY "Students view own video sessions"
  ON public.video_sessions
  FOR SELECT
  USING (student_id = auth.uid() OR buddy_id = auth.uid());

-- Buddies can create and manage sessions
CREATE POLICY "Buddies manage video sessions"
  ON public.video_sessions
  FOR ALL
  USING (buddy_id = auth.uid())
  WITH CHECK (buddy_id = auth.uid());

-- Students can update their own sessions
CREATE POLICY "Students update own video sessions"
  ON public.video_sessions
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Audit table for tracking session history
CREATE TABLE IF NOT EXISTS public.video_session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.video_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(50),
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_session_history_session ON public.video_session_history(session_id);
```

**Copy the above SQL and run in Supabase SQL Editor**

---

## ✅ Verify Migration Applied

After running the migration:

1. Go to Supabase Dashboard
2. Click: **Table Editor** (left sidebar)
3. Look for: `video_sessions` table
4. Should see columns: `id`, `student_id`, `buddy_id`, `gmeet_link`, etc.

If you see the table, migration is applied! ✅

---

## 🔄 Refresh App

After migration is applied:

1. Hard refresh: **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac)
2. Wait: Vercel deployment completes (~2 min)
3. Go back to: `/buddy/students/[studentId]`
4. Try scheduling video session again
5. Should work now! ✅

---

## 🐛 Still Getting Error?

After applying migration:

1. **Check browser console:** F12 → Console
2. **Look for errors:** Any red messages?
3. **Clear cache:** Ctrl+Shift+Delete → Clear all
4. **Hard refresh:** Ctrl+Shift+R
5. **Try again:** Schedule a session

---

## 📱 For Vercel Deployment

If you're using Vercel + Supabase:

1. Supabase databases auto-sync with Vercel
2. Run migration in Supabase dashboard
3. May take 1-2 minutes to sync
4. Then hard refresh Vercel app

---

**Status:** ⏳ Waiting for migration to be applied  
**Next:** Apply the SQL above, then test again

Let me know once applied! 🚀
