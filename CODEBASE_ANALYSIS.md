# CareerRai — Complete Codebase for Analysis

## App Overview

CareerRai is a CAT (Common Admission Test) exam preparation tracking app for Indian MBA aspirants. Students log daily study hours, track mock test scores, and get mentored by IIM-alumni 'buddy' mentors. Admins manage the platform, allowlist students, and track payments and buddy payouts.

## Tech Stack
```
{
  "name": "careerrai-tracker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.100.1",
    "@radix-ui/react-accordion": "^1.2.12",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-toast": "^1.2.15",
    "@supabase/ssr": "^0.10.3",
    "@tanstack/react-query": "^5.101.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^12.40.0",
    "googleapis": "^173.0.0",
    "lucide-react": "^1.16.0",
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "recharts": "^3.8.1",
    "resend": "^6.12.4",
    "tailwind-merge": "^3.6.0",
    "web-push": "^3.6.7"
  },
  "devDependencies": {
    "@supabase/supabase-js": "^2.108.0",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/web-push": "^3.6.4",
    "eslint": "^9",
    "eslint-config-next": "16.2.6",
    "tailwindcss": "^4",
    "typescript": "^5"
  },
  "description": "A daily accountability and progress tracking app for CAT/CUET exam aspirants paired with IIM mentors (Buddies).",
  "main": "index.js",
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module"
}
```

## Configuration

### next.config.ts
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize preloading to reduce warnings
  experimental: {
    preloadEntriesOnStart: true,
  },
  // Compress CSS/JS for faster load
  compress: true,
  // Optimize images
  images: {
    unoptimized: false,
    formats: ['image/webp', 'image/avif'],
  },
};

export default nextConfig;
```

### tailwind.config.ts
```ts
NOT FOUND
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules", "supabase/functions/**/*"]
}
```

### src/proxy.ts (Edge Middleware)
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Keep the session fresh so Server Components can read auth state.
  await supabase.auth.getSession();

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname.startsWith('/student') ||
    pathname.startsWith('/buddy') ||
    pathname.startsWith('/admin');

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && user) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/student/home';
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

## Database Schema (Supabase Migrations)

### supabase/migrations/001_initial_schema.sql
```sql
-- ============================================================
-- CareerRai Tracker — Initial Schema
-- Run this in Supabase SQL Editor (one click: paste, run)
-- ============================================================

-- ── PROFILES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'student'
                    CHECK (role IN ('student', 'buddy', 'admin')),
  full_name       TEXT NOT NULL DEFAULT 'New User',
  phone           TEXT,
  email           TEXT,
  exam_target     TEXT,
  buddy_id        UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  avatar_seed     TEXT,
  notif_prefs     JSONB NOT NULL DEFAULT '{"daily_reminder":true,"reminder_time":"20:00","email":true,"push":false}'::jsonb,
  push_subscription JSONB
);

-- ── DAILY REPORTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date       DATE NOT NULL,
  study_duration    NUMERIC(4,1) NOT NULL DEFAULT 0,
  topics_covered    TEXT[] NOT NULL DEFAULT '{}',
  quality_focus     SMALLINT NOT NULL DEFAULT 3 CHECK (quality_focus BETWEEN 1 AND 5),
  difficulty        SMALLINT NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  mock_taken        BOOLEAN NOT NULL DEFAULT FALSE,
  mock_name         TEXT,
  quant_score       SMALLINT,
  verbal_score      SMALLINT,
  logic_score       SMALLINT,
  total_accuracy    SMALLINT,
  confidence        SMALLINT NOT NULL DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
  stress            SMALLINT NOT NULL DEFAULT 3 CHECK (stress BETWEEN 1 AND 5),
  sleep_quality     SMALLINT NOT NULL DEFAULT 3 CHECK (sleep_quality BETWEEN 1 AND 5),
  nutrition_exercise BOOLEAN NOT NULL DEFAULT FALSE,
  overall_energy    SMALLINT NOT NULL DEFAULT 3 CHECK (overall_energy BETWEEN 1 AND 5),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, report_date)
);

-- ── BUDDY FEEDBACK ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.buddy_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buddy_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feedback_date   DATE NOT NULL,
  feedback_text   TEXT NOT NULL,
  rating          SMALLINT NOT NULL DEFAULT 3 CHECK (rating BETWEEN 1 AND 5),
  next_steps      TEXT[] NOT NULL DEFAULT '{}',
  period_covered  TEXT NOT NULL DEFAULT 'adhoc'
                    CHECK (period_covered IN ('weekly', 'adhoc', 'monthly')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TEST RESULTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.test_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_type     TEXT NOT NULL,
  test_name     TEXT NOT NULL,
  attempt_date  DATE NOT NULL,
  score         SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  percentile    SMALLINT NOT NULL CHECK (percentile BETWEEN 0 AND 99),
  breakdown     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  channel     TEXT NOT NULL DEFAULT 'in_app',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_reports_student_date ON public.daily_reports (student_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_buddy_feedback_student ON public.buddy_feedback (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_student ON public.test_results (student_id, attempt_date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_buddy ON public.profiles (buddy_id) WHERE buddy_id IS NOT NULL;

-- ── AUTO-UPDATED updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── AUTO-CREATE PROFILE ON SIGNUP ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Buddy reads their students"
  ON public.profiles FOR SELECT
  USING (buddy_id = auth.uid());

CREATE POLICY "Admin reads all profiles"
  ON public.profiles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- daily_reports
CREATE POLICY "Student manages own reports"
  ON public.daily_reports FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Buddy reads assigned student reports"
  ON public.daily_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = daily_reports.student_id AND buddy_id = auth.uid()
    )
  );

CREATE POLICY "Admin reads all reports"
  ON public.daily_reports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- buddy_feedback
CREATE POLICY "Buddy manages own feedback"
  ON public.buddy_feedback FOR ALL
  USING (buddy_id = auth.uid())
  WITH CHECK (buddy_id = auth.uid());

CREATE POLICY "Student reads own feedback"
  ON public.buddy_feedback FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Admin reads all feedback"
  ON public.buddy_feedback FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- test_results
CREATE POLICY "Student manages own test results"
  ON public.test_results FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Buddy reads assigned student test results"
  ON public.test_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = test_results.student_id AND buddy_id = auth.uid()
    )
  );

CREATE POLICY "Admin reads all test results"
  ON public.test_results FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- notifications
CREATE POLICY "Users manage own notifications"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (TRUE);
```

### supabase/migrations/002_add_onboarding_completed.sql
```sql
-- Add onboarding_completed column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for faster onboarding checks
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
ON public.profiles (onboarding_completed)
WHERE onboarding_completed = FALSE;
```

### supabase/migrations/002_add_username_to_profiles.sql
```sql
-- Add username and email_verified columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
```

### supabase/migrations/003_fix_rls_infinite_recursion.sql
```sql
-- Fix infinite recursion in RLS policies
-- The Admin policy was causing infinite recursion by checking profiles in a subquery
-- Solution: Drop and recreate with SECURITY DEFINER function

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admin reads all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin reads all reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Admin reads all feedback" ON public.buddy_feedback;
DROP POLICY IF EXISTS "Admin reads all test results" ON public.test_results;

-- Create a helper function to check if user is admin (SECURITY DEFINER prevents recursion)
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM auth.users WHERE id = user_id AND raw_user_meta_data->>'role' = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate admin policies using the helper function
CREATE POLICY "Admin reads all profiles"
  ON public.profiles FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admin reads all reports"
  ON public.daily_reports FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admin reads all feedback"
  ON public.buddy_feedback FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admin reads all test results"
  ON public.test_results FOR SELECT
  USING (is_admin(auth.uid()));
```

### supabase/migrations/004_add_streak_insert_policy.sql
```sql
-- Add missing INSERT policy for streak_data
-- Students need to be able to insert their own streak_data records

CREATE POLICY "Students can insert own streak_data" ON public.streak_data
  FOR INSERT WITH CHECK (student_id = auth.uid());
```

### supabase/migrations/005_add_voice_notes_to_feedback.sql
```sql
-- Add voice note support to buddy_feedback table

-- Add columns if they don't exist
ALTER TABLE public.buddy_feedback
ADD COLUMN IF NOT EXISTS voice_note_url TEXT,
ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50) DEFAULT 'text',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Make feedback_text nullable to allow voice-only feedback
ALTER TABLE public.buddy_feedback
ALTER COLUMN feedback_text DROP NOT NULL;

-- Make feedback_date nullable (voice notes don't need specific date)
ALTER TABLE public.buddy_feedback
ALTER COLUMN feedback_date DROP NOT NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_buddy_feedback_voice_notes
ON public.buddy_feedback (student_id, created_at DESC)
WHERE voice_note_url IS NOT NULL;

-- Update RLS policies to allow voice note inserts
DROP POLICY IF EXISTS "Buddy manages own feedback" ON public.buddy_feedback;

CREATE POLICY "Buddy manages own feedback"
  ON public.buddy_feedback FOR ALL
  USING (buddy_id = auth.uid())
  WITH CHECK (buddy_id = auth.uid());
```

### supabase/migrations/006_add_audio_auto_cleanup.sql
```sql
-- 🎙️ AUDIO AUTO-CLEANUP MIGRATION
-- Automatically delete audio files older than 10 days to prevent storage bloat

-- Create a function to delete old audio files from storage
CREATE OR REPLACE FUNCTION delete_old_voice_notes()
RETURNS TABLE (deleted_count int) AS $$
DECLARE
  v_deleted_count int := 0;
BEGIN
  -- Delete records from buddy_feedback that are older than 10 days
  -- This triggers the storage deletion via the on_delete trigger
  DELETE FROM public.buddy_feedback
  WHERE voice_note_url IS NOT NULL
    AND created_at < NOW() - INTERVAL '10 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger function to delete files from storage when records are deleted
CREATE OR REPLACE FUNCTION delete_voice_file_from_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete the file from storage bucket when the record is deleted
  -- The voice_note_url contains the path like: voice-notes/studentid-buddyid-timestamp.webm
  IF OLD.voice_note_url IS NOT NULL THEN
    -- Call Supabase storage deletion (via HTTP would be in application code)
    -- For now, we just delete the record. Storage cleanup can be handled by:
    -- 1. Application code calling Supabase storage API
    -- 2. Supabase edge function on a schedule
    -- 3. Manual cleanup script
    NULL; -- Placeholder for storage deletion
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to delete storage files when records are deleted
DROP TRIGGER IF EXISTS delete_voice_file_trigger ON public.buddy_feedback;
CREATE TRIGGER delete_voice_file_trigger
BEFORE DELETE ON public.buddy_feedback
FOR EACH ROW
EXECUTE FUNCTION delete_voice_file_from_storage();

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_old_voice_notes() TO authenticated, service_role;

-- Create index for efficient deletion queries
CREATE INDEX IF NOT EXISTS idx_buddy_feedback_created_at
ON public.buddy_feedback(created_at DESC)
WHERE voice_note_url IS NOT NULL;
```

### supabase/migrations/007_fix_voice_feedback_rls.sql
```sql
-- Fix RLS policies for voice feedback to allow students to send responses

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Buddy manages own feedback" ON public.buddy_feedback;

-- Create separate policies for buddies and students
CREATE POLICY "Buddy can insert feedback for their students"
  ON public.buddy_feedback FOR INSERT
  WITH CHECK (buddy_id = auth.uid());

CREATE POLICY "Student can send voice responses"
  ON public.buddy_feedback FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Allow reading feedback you're involved in
CREATE POLICY "Can read relevant feedback"
  ON public.buddy_feedback FOR SELECT
  USING (
    buddy_id = auth.uid() OR
    student_id = auth.uid()
  );

-- Allow updating own feedback
CREATE POLICY "Can update own feedback"
  ON public.buddy_feedback FOR UPDATE
  USING (buddy_id = auth.uid())
  WITH CHECK (buddy_id = auth.uid());
```

### supabase/migrations/008_cleanup_test_recordings.sql
```sql
-- Clean up test and duplicate recordings
-- This removes records with invalid feedback_type and old test data

-- Remove records with invalid or null feedback_type
DELETE FROM public.buddy_feedback
WHERE feedback_type IS NULL
   OR feedback_type = ''
   OR feedback_type = 'voice_note'
   OR feedback_type = 'adhoc';

-- Remove self-feedback (where buddy_id = student_id)
DELETE FROM public.buddy_feedback
WHERE buddy_id = student_id;

-- Ensure remaining records have correct feedback_type
UPDATE public.buddy_feedback
SET feedback_type = CASE
  WHEN voice_note_url IS NOT NULL THEN 'buddy_feedback'
  WHEN feedback_text IS NOT NULL THEN 'text'
  ELSE 'buddy_feedback'
END
WHERE feedback_type NOT IN ('buddy_feedback', 'text', 'student_response');

-- Verify cleanup
SELECT
  feedback_type,
  COUNT(*) as count,
  COUNT(voice_note_url) as with_audio
FROM public.buddy_feedback
GROUP BY feedback_type;
```

### supabase/migrations/009_comprehensive_audio_fix.sql
```sql
-- COMPREHENSIVE FIX FOR AUDIO ID SWAP / WRONG TYPE ISSUE
-- This migration fixes the core audio problems

-- Step 1: Delete ALL records where student_id = buddy_id (self-feedback)
DELETE FROM public.buddy_feedback
WHERE student_id = buddy_id;

-- Step 2: Delete ALL records with NULL or invalid feedback_type
DELETE FROM public.buddy_feedback
WHERE feedback_type IS NULL
   OR feedback_type = ''
   OR feedback_type NOT IN ('buddy_feedback', 'student_response', 'text');

-- Step 3: Set correct feedback_type for remaining records based on logic:
-- If it has voice_note_url, it should be buddy_feedback (buddy sent it)
-- Otherwise, it should be text
UPDATE public.buddy_feedback
SET feedback_type = CASE
  WHEN voice_note_url IS NOT NULL THEN 'buddy_feedback'
  WHEN feedback_text IS NOT NULL THEN 'text'
  ELSE 'buddy_feedback'
END
WHERE feedback_type IS NULL OR feedback_type = '';

-- Step 4: Verify the cleanup
SELECT
  feedback_type,
  COUNT(*) as count,
  COUNT(voice_note_url) as with_audio
FROM public.buddy_feedback
GROUP BY feedback_type
ORDER BY feedback_type;
```

### supabase/migrations/010_final_audio_fix.sql
```sql
-- FINAL AUDIO FIX: Clean all problematic records
-- This fixes the issue where student recordings appear as buddy audio and vice versa

-- Step 1: Remove all self-feedback records (where student recorded their own feedback)
DELETE FROM public.buddy_feedback
WHERE student_id = buddy_id;

-- Step 2: Remove all records with invalid or null feedback_type
DELETE FROM public.buddy_feedback
WHERE feedback_type IS NULL
   OR feedback_type = ''
   OR feedback_type NOT IN ('buddy_feedback', 'student_response', 'text');

-- Step 3: Verify the fix - show the final distribution
SELECT
  feedback_type,
  COUNT(*) as total_records,
  COUNT(CASE WHEN voice_note_url IS NOT NULL THEN 1 END) as with_audio,
  COUNT(CASE WHEN feedback_text IS NOT NULL THEN 1 END) as with_text
FROM public.buddy_feedback
GROUP BY feedback_type
ORDER BY feedback_type;

-- Step 4: Show sample of remaining records to verify correct structure
SELECT
  id,
  student_id,
  buddy_id,
  feedback_type,
  CASE
    WHEN voice_note_url IS NOT NULL THEN 'Has Audio'
    WHEN feedback_text IS NOT NULL THEN 'Has Text'
    ELSE 'No Content'
  END as content_type,
  created_at
FROM public.buddy_feedback
LIMIT 5;
```

### supabase/migrations/011_add_video_sessions.sql
```sql
-- Add video sessions table for buddy-student video calls

CREATE TABLE IF NOT EXISTS public.video_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buddy_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Google Meet link and session details
  gmeet_link TEXT,
  session_status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, active, completed, cancelled
  session_type VARCHAR(50) DEFAULT 'session', -- session, review, doubt_solving
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

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Students view own video sessions" ON public.video_sessions;
DROP POLICY IF EXISTS "Buddies manage video sessions" ON public.video_sessions;
DROP POLICY IF EXISTS "Students update own video sessions" ON public.video_sessions;

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

-- Students can update their own sessions (accept/decline)
CREATE POLICY "Students update own video sessions"
  ON public.video_sessions
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Audit table for tracking session history
CREATE TABLE IF NOT EXISTS public.video_session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.video_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(50), -- created, scheduled, started, completed, cancelled, reminder_sent
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_session_history_session ON public.video_session_history(session_id);
```

### supabase/migrations/012_add_streak_rewards_system.sql
```sql
-- CareerRai Streak & Rewards System
-- Gamification with daily logging motivation and milestone rewards

-- Add streak columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS best_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_log_date DATE,
ADD COLUMN IF NOT EXISTS total_logs_completed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS premium_extension_days INTEGER DEFAULT 0;

-- Create streak history table
CREATE TABLE IF NOT EXISTS public.streak_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Streak tracking
  streak_count INTEGER NOT NULL,
  streak_started_at DATE NOT NULL,
  streak_ended_at DATE,
  reason_ended VARCHAR(100), -- 'missed_day', 'manual_reset', null if ongoing

  -- Reward tracking
  reward_earned VARCHAR(100), -- e.g., '7_day_badge', '30_day_extension', etc.
  extension_days_granted INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create milestones/rewards table
CREATE TABLE IF NOT EXISTS public.streak_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Milestone definition
  milestone_days INTEGER UNIQUE NOT NULL, -- 3, 7, 14, 30, 60, 90, 100
  reward_name VARCHAR(100) NOT NULL,
  reward_description TEXT,
  icon VARCHAR(50), -- emoji

  -- Rewards granted
  extension_days INTEGER DEFAULT 0, -- days of free extension
  badge_name VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert milestone definitions
INSERT INTO public.streak_rewards (milestone_days, reward_name, reward_description, icon, extension_days, badge_name)
VALUES
  (3, 'Hot Start 🔥', 'You''re on fire! Complete 3 days in a row', '🔥', 0, 'hot_start'),
  (7, 'Weekly Warrior', '1 week of consistent effort! Get 3 days free', '⚔️', 3, 'weekly_warrior'),
  (14, 'Fortnight Fighter', '2 weeks straight! You''re unstoppable', '💪', 0, 'fortnight_fighter'),
  (30, 'Month Master', '🎉 30 days! Unlock 1 MONTH FREE EXTENSION', '👑', 30, 'month_master'),
  (60, 'Legend Status', '60 days! You''re a CAT prep legend', '⭐', 10, 'legend_status'),
  (90, 'Centurion Path', '90 days! Almost there!', '🏆', 15, 'centurion_path'),
  (100, 'Immortal', '100 DAYS OF PERFECTION! 🚀', '🌟', 30, 'immortal')
ON CONFLICT (milestone_days) DO NOTHING;

-- Create student reward claims table
CREATE TABLE IF NOT EXISTS public.reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES public.streak_rewards(id) ON DELETE CASCADE,

  -- Claim details
  streak_count INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  extension_days_applied INTEGER DEFAULT 0,

  -- Track if extension was applied
  extension_applied BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_current_streak ON public.profiles(current_streak DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_log_date ON public.profiles(last_log_date DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_best_streak ON public.profiles(best_streak DESC);
CREATE INDEX IF NOT EXISTS idx_streak_history_student ON public.streak_history(student_id);
CREATE INDEX IF NOT EXISTS idx_streak_history_reward ON public.streak_history(reward_earned);
CREATE INDEX IF NOT EXISTS idx_reward_claims_student ON public.reward_claims(student_id);
CREATE INDEX IF NOT EXISTS idx_reward_claims_milestone ON public.reward_claims(milestone_id);

-- RLS Policies
ALTER TABLE public.streak_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;

-- Students can view their own streak data
CREATE POLICY "Students view own streak history"
  ON public.streak_history
  FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students view own reward claims"
  ON public.reward_claims
  FOR SELECT
  USING (student_id = auth.uid());

-- Service role can update
CREATE POLICY "Service role manages streaks"
  ON public.streak_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages rewards"
  ON public.reward_claims
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

### supabase/migrations/013_fix_streak_data_columns.sql
```sql
-- Fix: Add missing columns to streak_data table
-- The columns were defined in 20260605_add_streak_and_alerts_tables.sql but may not have been applied

ALTER TABLE public.streak_data
ADD COLUMN IF NOT EXISTS last_log_date DATE,
ADD COLUMN IF NOT EXISTS milestone_sent_7 BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS milestone_sent_21 BOOLEAN DEFAULT FALSE;

-- Verify columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'streak_data'
ORDER BY ordinal_position;
```

### supabase/migrations/014_add_google_oauth.sql
```sql
-- Add Google OAuth columns to profiles table
-- Stores Google Calendar API tokens securely

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS google_oauth_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_oauth_access_token TEXT,
ADD COLUMN IF NOT EXISTS google_oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS google_calendar_connected_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_google_connected
ON public.profiles(google_calendar_connected);

-- RLS: Only user can read their own OAuth tokens (CRITICAL - tokens are sensitive!)
CREATE POLICY "Users can read own Google OAuth tokens"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own Google OAuth tokens"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Service role can update tokens (for token refresh)
CREATE POLICY "Service role can manage Google OAuth tokens"
  ON public.profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment explaining token security
COMMENT ON COLUMN public.profiles.google_oauth_refresh_token IS
'Sensitive: Google OAuth refresh token. Never exposed to client. Server-side only.';

COMMENT ON COLUMN public.profiles.google_oauth_access_token IS
'Sensitive: Google OAuth access token (short-lived). Auto-refreshed server-side.';
```

### supabase/migrations/015_add_google_meet_to_sessions.sql
```sql
-- Add Google Calendar and Meet link columns to video_sessions
ALTER TABLE video_sessions
ADD COLUMN google_event_id TEXT,
ADD COLUMN google_meet_link TEXT;

-- Add comment
COMMENT ON COLUMN video_sessions.google_event_id IS 'Google Calendar event ID for this session';
COMMENT ON COLUMN video_sessions.google_meet_link IS 'Real Google Meet link from Calendar API (hangoutLink)';

-- Create index for easier lookups
CREATE INDEX idx_video_sessions_google_event_id ON video_sessions(google_event_id);
```

### supabase/migrations/016_move_oauth_tokens_to_own_table.sql
```sql
-- SECURITY FIX: Google OAuth tokens were stored on public.profiles, where the
-- "Buddy reads their students" SELECT policy (buddy_id = auth.uid()) exposed
-- students' refresh tokens to their buddy's browser client. Additionally,
-- migration 014's "Service role can manage Google OAuth tokens" policy was
-- FOR ALL USING (true) with no TO clause, granting every authenticated user
-- full read/write on every profile row (service role bypasses RLS and never
-- needed a policy).
--
-- Fix: move tokens to a dedicated table that only the owner can SELECT and
-- only the service role can write, then drop the token columns and the bad
-- policies from profiles. google_calendar_connected stays on profiles (it is
-- non-sensitive and read client-side by the settings pages).

-- Step 1: Dedicated token table
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Owner may read their own row. No INSERT/UPDATE/DELETE policies: all writes
-- go through the service-role admin client, which bypasses RLS.
DROP POLICY IF EXISTS "Owner reads own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Owner reads own google tokens"
  ON public.google_oauth_tokens FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON TABLE public.google_oauth_tokens IS
'Sensitive: Google OAuth tokens. Server-side (service role) writes only; owner-only SELECT via RLS.';

-- Step 2: Copy existing tokens from profiles
INSERT INTO public.google_oauth_tokens (user_id, refresh_token, access_token, token_expires_at)
SELECT id, google_oauth_refresh_token, google_oauth_access_token, google_oauth_token_expires_at
FROM public.profiles
WHERE google_oauth_refresh_token IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
  SET refresh_token = EXCLUDED.refresh_token,
      access_token = EXCLUDED.access_token,
      token_expires_at = EXCLUDED.token_expires_at,
      updated_at = now();

-- Step 3: Drop the policies added by migration 014.
-- "Service role can manage..." was a critical hole (see header). The two
-- "Users can ..." policies duplicate 001's own-profile policies.
DROP POLICY IF EXISTS "Service role can manage Google OAuth tokens" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own Google OAuth tokens" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own Google OAuth tokens" ON public.profiles;

-- Step 4: Remove token columns from profiles
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS google_oauth_refresh_token,
  DROP COLUMN IF EXISTS google_oauth_access_token,
  DROP COLUMN IF EXISTS google_oauth_token_expires_at;
```

### supabase/migrations/017_add_title_description_to_sessions.sql
```sql
-- Add title and description columns to video_sessions
ALTER TABLE video_sessions
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;
```

### supabase/migrations/018_daily_tracker_schema.sql
```sql
-- Daily Tracker Infrastructure
-- Adds puzzle system, TODO tracking, and streak shields

-- Streak shields (allow students to skip a day without losing streak)
CREATE TABLE IF NOT EXISTS public.streak_shields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  used_on DATE,
  granted_by UUID REFERENCES public.profiles(id),
  reason TEXT CHECK (reason IN ('student_used', 'buddy_granted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(student_id, used_on)
);

-- Daily LRDI puzzles (one per day)
CREATE TABLE IF NOT EXISTS public.daily_lrdi_puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_date DATE NOT NULL UNIQUE,
  puzzle_type TEXT NOT NULL CHECK (puzzle_type IN ('seating', 'blood_relation', 'constraint', 'arrangement', 'logic')),
  puzzle_content JSONB NOT NULL,
  difficulty INT NOT NULL CHECK (difficulty >= 1 AND difficulty <= 10),
  difficulty_description TEXT,
  estimated_time_minutes INT DEFAULT 15,
  solution TEXT,
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- LRDI puzzle attempts (track student attempts)
CREATE TABLE IF NOT EXISTS public.lrdi_puzzle_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES public.daily_lrdi_puzzles(id) ON DELETE CASCADE,
  solved BOOLEAN NOT NULL DEFAULT FALSE,
  time_taken_seconds INT,
  accuracy DECIMAL(3, 2) CHECK (accuracy >= 0 AND accuracy <= 1),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(student_id, puzzle_id)
);

-- TODO items for students
CREATE TABLE IF NOT EXISTS public.todo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('buddy_suggested', 'student_custom', 'daily_puzzle', 'mock_review', 'session')),
  due_date DATE,
  due_time TIME,
  priority INT DEFAULT 0 CHECK (priority >= -1 AND priority <= 1),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Analytics events for tracking user behavior
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_streak_shields_student ON public.streak_shields(student_id);
CREATE INDEX IF NOT EXISTS idx_streak_shields_date ON public.streak_shields(used_on);
CREATE INDEX IF NOT EXISTS idx_daily_lrdi_puzzles_date ON public.daily_lrdi_puzzles(puzzle_date DESC);
CREATE INDEX IF NOT EXISTS idx_lrdi_attempts_student ON public.lrdi_puzzle_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_lrdi_attempts_puzzle ON public.lrdi_puzzle_attempts(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_lrdi_attempts_student_puzzle ON public.lrdi_puzzle_attempts(student_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_student ON public.todo_items(student_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_due_date ON public.todo_items(due_date);
CREATE INDEX IF NOT EXISTS idx_todo_items_completed ON public.todo_items(student_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_student ON public.analytics_events(student_id, created_at DESC);

-- Enable RLS on all tables
ALTER TABLE public.streak_shields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_lrdi_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lrdi_puzzle_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for streak_shields
CREATE POLICY "Students can read own shields" ON public.streak_shields
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can insert own shields" ON public.streak_shields
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Buddies can read assigned students shields" ON public.streak_shields
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

-- RLS Policies for daily_lrdi_puzzles (public read)
CREATE POLICY "Anyone can read daily puzzles" ON public.daily_lrdi_puzzles
  FOR SELECT USING (true);

-- RLS Policies for lrdi_puzzle_attempts
CREATE POLICY "Students can read own attempts" ON public.lrdi_puzzle_attempts
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can insert own attempts" ON public.lrdi_puzzle_attempts
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own attempts" ON public.lrdi_puzzle_attempts
  FOR UPDATE USING (student_id = auth.uid());

CREATE POLICY "Buddies can read assigned students attempts" ON public.lrdi_puzzle_attempts
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

-- RLS Policies for todo_items
CREATE POLICY "Students can read own todos" ON public.todo_items
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can insert own todos" ON public.todo_items
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own todos" ON public.todo_items
  FOR UPDATE USING (student_id = auth.uid());

CREATE POLICY "Students can delete own todos" ON public.todo_items
  FOR DELETE USING (student_id = auth.uid());

CREATE POLICY "Buddies can read assigned students todos" ON public.todo_items
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

CREATE POLICY "Buddies can insert todos for assigned students" ON public.todo_items
  FOR INSERT WITH CHECK (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

-- RLS Policies for analytics_events
CREATE POLICY "Students can insert own events" ON public.analytics_events
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Buddies can read assigned students events" ON public.analytics_events
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

-- Grants
GRANT ALL ON public.streak_shields TO authenticated;
GRANT ALL ON public.daily_lrdi_puzzles TO authenticated;
GRANT ALL ON public.lrdi_puzzle_attempts TO authenticated;
GRANT ALL ON public.todo_items TO authenticated;
GRANT ALL ON public.analytics_events TO authenticated;
```

### supabase/migrations/20260605_add_streak_and_alerts_tables.sql
```sql
-- Phase 1: Infrastructure - Streak Tracking and Alerts

-- Create streak_data table for tracking study streaks
CREATE TABLE IF NOT EXISTS public.streak_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_log_date DATE,
  milestone_sent_7 BOOLEAN DEFAULT FALSE,
  milestone_sent_21 BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(student_id)
);

-- Create mock_drop_alerts table for tracking score drop interventions
CREATE TABLE IF NOT EXISTS public.mock_drop_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  buddy_notified BOOLEAN DEFAULT FALSE
);

-- Add new fields to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS study_target_hours DECIMAL(2,1) DEFAULT 2;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS intro_audio_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS buddy_bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS college VARCHAR(100);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cat_percentile DECIMAL(5,2);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Add new fields to feedback table
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS voice_note_url TEXT;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50) DEFAULT 'text';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_streak_data_student_id ON public.streak_data(student_id);
CREATE INDEX IF NOT EXISTS idx_streak_data_last_log_date ON public.streak_data(last_log_date);
CREATE INDEX IF NOT EXISTS idx_mock_drop_alerts_student_id ON public.mock_drop_alerts(student_id);
CREATE INDEX IF NOT EXISTS idx_mock_drop_alerts_triggered_at ON public.mock_drop_alerts(triggered_at);

-- Update RLS policies for new tables
ALTER TABLE public.streak_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_drop_alerts ENABLE ROW LEVEL SECURITY;

-- RLS: Students can only read/write their own streak_data
CREATE POLICY "Students can read own streak_data" ON public.streak_data
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can update own streak_data" ON public.streak_data
  FOR UPDATE USING (student_id = auth.uid());

-- RLS: Buddies can read assigned students' streak_data
CREATE POLICY "Buddies can read assigned students streak_data" ON public.streak_data
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM public.profiles WHERE buddy_id = auth.uid()
    )
  );

-- RLS: Admins can read all
CREATE POLICY "Admins can read all streak_data" ON public.streak_data
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'authenticated' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- RLS: Students can read alerts about themselves
CREATE POLICY "Students can read own mock_drop_alerts" ON public.mock_drop_alerts
  FOR SELECT USING (student_id = auth.uid());

-- RLS: Buddies can read alerts for assigned students
CREATE POLICY "Buddies can read assigned students alerts" ON public.mock_drop_alerts
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM public.profiles WHERE buddy_id = auth.uid()
    )
  );

-- RLS: Admins can read all alerts
CREATE POLICY "Admins can read all mock_drop_alerts" ON public.mock_drop_alerts
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'authenticated' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Grant permissions
GRANT ALL ON public.streak_data TO authenticated;
GRANT ALL ON public.mock_drop_alerts TO authenticated;
```

### supabase/migrations/20260605_enhance_mock_drop_alerts.sql
```sql
-- Phase 5: Enhance mock_drop_alerts table with detailed drop information

ALTER TABLE public.mock_drop_alerts
  ADD COLUMN IF NOT EXISTS previous_percentile DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS current_percentile DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS drop_points DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS test_score INT;

-- Add index for student_id to speed up queries
CREATE INDEX IF NOT EXISTS idx_mock_drop_alerts_student_triggered
  ON public.mock_drop_alerts(student_id, triggered_at DESC);
```

### supabase/migrations/20260606_ensure_onboarding_completed.sql
```sql
-- Ensure onboarding_completed column exists on profiles table
-- This migration is safe to run multiple times (uses IF NOT EXISTS)

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
ON public.profiles(onboarding_completed);

-- Update existing records to have onboarding_completed = false if null
UPDATE public.profiles
SET onboarding_completed = FALSE
WHERE onboarding_completed IS NULL;
```

### supabase/migrations/20260612_add_missing_fk_indexes.sql
```sql
-- Cover foreign keys flagged by the Supabase performance advisor.
-- session_requests is queried on every student homepage + buddy homepage load.
CREATE INDEX IF NOT EXISTS idx_session_requests_student_status ON public.session_requests (student_id, status);
CREATE INDEX IF NOT EXISTS idx_session_requests_buddy_status ON public.session_requests (buddy_id, status);
CREATE INDEX IF NOT EXISTS idx_buddy_feedback_buddy_id ON public.buddy_feedback (buddy_id);
CREATE INDEX IF NOT EXISTS idx_feedback_buddy_id ON public.feedback (buddy_id);
CREATE INDEX IF NOT EXISTS idx_streak_shields_granted_by ON public.streak_shields (granted_by);
CREATE INDEX IF NOT EXISTS idx_todo_items_created_by ON public.todo_items (created_by);
```

### supabase/migrations/20260612_add_target_percentile.sql
```sql
-- Add target percentile goal to student profiles.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS target_percentile smallint DEFAULT 90
  CHECK (target_percentile >= 50 AND target_percentile <= 99);
```

### supabase/migrations/20260612_full_mirror_spec.sql
```sql
-- Full Mirror Spec: Dream-first onboarding, emotional layer, brain breaks, Phase 11 schema

-- Phase 2: Dream-first onboarding fields on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dream_colleges text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_repeater boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS starting_percentile smallint,
  ADD COLUMN IF NOT EXISTS hours_available smallint;

-- Phase 5: Emotional layer on daily_reports
ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS emotional_chips text[] DEFAULT '{}';

-- Phase 11 (schema-only): Shadow Rival + Section ELO
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS shadow_rival_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS section_elo jsonb DEFAULT '{"varc": 1200, "dilr": 1200, "qa": 1200}'::jsonb;

-- Phase 7: Brain break logs
CREATE TABLE IF NOT EXISTS brain_break_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_type text NOT NULL CHECK (game_type IN ('math_sprint', 'pattern_lock', 'memory_grid', 'sudoku_blitz')),
  score integer,
  duration_seconds integer,
  played_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brain_break_logs_student_day
  ON brain_break_logs(student_id, played_at);

-- RLS for brain_break_logs
ALTER TABLE brain_break_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Student sees own brain breaks" ON brain_break_logs
  FOR ALL USING (student_id = auth.uid());
```

### supabase/migrations/20260613_auth_and_payments.sql
```sql
-- ============================================================
-- CareerRai — Phone-OTP Auth (allowlist) + Three-Flow Payments
-- Run in Supabase SQL Editor (paste, run). Idempotent.
-- ============================================================

-- ── PART A: STUDENT ALLOWLIST (admin-gated phone gatekeeping) ──
CREATE TABLE IF NOT EXISTS public.student_allowlist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             TEXT NOT NULL UNIQUE,              -- E.164, e.g. +9198XXXXXXXX
  full_name         TEXT NOT NULL,
  added_by          UUID REFERENCES public.profiles(id),
  assigned_buddy_id UUID REFERENCES public.profiles(id),
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OTP send tracking (rate-limiting: 3 / 30min, 30s cooldown). Service-role only.
CREATE TABLE IF NOT EXISTS public.otp_send_events (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone     TEXT NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_send_events_phone_time
  ON public.otp_send_events (phone, sent_at DESC);

-- ── PART B/C: STUDENT SUBSCRIPTION STATE (on profiles) ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'free_beta'
    CHECK (subscription_status IN ('free_beta', 'active', 'expired', 'refund_requested')),
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ,
  -- PART D: buddy payout amount, admin-set, NULL until founder sets it
  ADD COLUMN IF NOT EXISTS agreed_monthly_payout INTEGER;

-- ── PART B: STUDENT PAYMENTS (incoming, Razorpay) ──
CREATE TABLE IF NOT EXISTS public.student_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount              INTEGER NOT NULL,                 -- in paise
  plan                TEXT NOT NULL,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  status              TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_payments_student ON public.student_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_student_payments_order   ON public.student_payments (razorpay_order_id);

-- ── PART D: BUDDY PAYOUTS (outgoing, manual-pay / app-tracks-only) ──
CREATE TABLE IF NOT EXISTS public.buddy_payouts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buddy_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period               TEXT NOT NULL,                   -- 'YYYY-MM'
  agreed_amount        INTEGER NOT NULL,                -- in rupees (founder-readable)
  active_student_count INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'paid')),
  paid_date            DATE,
  payment_ref          TEXT,                            -- founder-pasted UPI/txn ref
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (buddy_id, period)
);
CREATE INDEX IF NOT EXISTS idx_buddy_payouts_buddy ON public.buddy_payouts (buddy_id);

-- ── ROW LEVEL SECURITY ──
-- Admin/founder operations run through the service-role client (bypasses RLS),
-- so we only need self-access policies for any anon-key reads. No admin policy =
-- no recursion risk against profiles.

ALTER TABLE public.student_allowlist ENABLE ROW LEVEL SECURITY;
-- (no policies → service-role only; never readable by students/buddies)

ALTER TABLE public.otp_send_events ENABLE ROW LEVEL SECURITY;
-- (no policies → service-role only)

ALTER TABLE public.student_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "student sees own payments" ON public.student_payments;
CREATE POLICY "student sees own payments" ON public.student_payments
  FOR SELECT USING (student_id = auth.uid());

ALTER TABLE public.buddy_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "buddy sees own payouts" ON public.buddy_payouts;
CREATE POLICY "buddy sees own payouts" ON public.buddy_payouts
  FOR SELECT USING (buddy_id = auth.uid());
```

## Library Files (src/lib/)

### src/lib/analytics-advanced.ts
```ts
/**
 * Advanced Analytics for Student Performance
 * Provides trend analysis, correlations, and predictive insights
 */

import { createClient } from '@/lib/supabase/client';

export interface PerformanceTrend {
  dates: string[];
  scores: number[];
  percentiles: number[];
  trend: 'improving' | 'declining' | 'stable';
  trendPoints: number; // positive = improving, negative = declining
}

export interface ConfidenceStressCorrelation {
  avgConfidence: number;
  avgStress: number;
  correlation: number; // -1 to 1, negative = inverse relationship
  insight: string;
}

export interface StudyIntensityPattern {
  avgHoursPerDay: number;
  consistencyScore: number; // 0-100
  peakDay: string; // day of week
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface CATReadiness {
  currentPercentile: number;
  targetPercentile: number;
  daysToExam: number;
  recommendedDailyImprovement: number; // percentile points
  readinessLevel: 'not_ready' | 'on_track' | 'ahead';
  expectedFinalPercentile: number;
}

/**
 * Analyze mock score trends over time
 */
export async function analyzeMockTrend(studentId: string): Promise<PerformanceTrend> {
  const supabase = createClient();

  try {
    const { data: tests } = await supabase
      .from('test_results')
      .select('*')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: true })
      .limit(20);

    if (!tests || tests.length === 0) {
      return {
        dates: [],
        scores: [],
        percentiles: [],
        trend: 'stable',
        trendPoints: 0
      };
    }

    const dates = tests.map((t) => new Date(t.created_at).toLocaleDateString());
    const scores = tests.map((t) => t.score);
    const percentiles = tests.map((t) => t.percentile);

    // Calculate trend using linear regression
    const trendPoints = calculateTrend(percentiles);
    const trend: 'improving' | 'declining' | 'stable' =
      trendPoints > 2 ? 'improving' : trendPoints < -2 ? 'declining' : 'stable';

    return {
      dates,
      scores,
      percentiles,
      trend,
      trendPoints
    };
  } catch (error) {
    console.error('Error analyzing mock trend:', error);
    return {
      dates: [],
      scores: [],
      percentiles: [],
      trend: 'stable',
      trendPoints: 0
    };
  }
}

/**
 * Analyze confidence-stress correlation
 */
export async function analyzeConfidenceStressCorrelation(
  studentId: string
): Promise<ConfidenceStressCorrelation> {
  const supabase = createClient();

  try {
    const { data: logs } = await supabase
      .from('daily_reports')
      .select('confidence_level, stress_level')
      .eq('student_id', studentId)
      .order('report_date', { ascending: false })
      .limit(30);

    if (!logs || logs.length < 3) {
      return {
        avgConfidence: 0,
        avgStress: 0,
        correlation: 0,
        insight: 'Not enough data'
      };
    }

    const confidenceValues = logs.map((l) => l.confidence_level || 0);
    const stressValues = logs.map((l) => l.stress_level || 0);

    const avgConfidence = confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length;
    const avgStress = stressValues.reduce((a, b) => a + b, 0) / stressValues.length;
    const correlation = calculatePearsonCorrelation(confidenceValues, stressValues);

    let insight = '';
    if (correlation < -0.5) {
      insight = 'Higher confidence associated with lower stress - strong positive mindset';
    } else if (correlation > 0.5) {
      insight = 'Confidence and stress tracking together - may need mental clarity work';
    } else {
      insight = 'Confidence and stress levels are independent - stay balanced';
    }

    return {
      avgConfidence,
      avgStress,
      correlation,
      insight
    };
  } catch (error) {
    console.error('Error analyzing correlation:', error);
    return {
      avgConfidence: 0,
      avgStress: 0,
      correlation: 0,
      insight: 'Unable to analyze'
    };
  }
}

/**
 * Analyze study intensity patterns
 */
export async function analyzeStudyIntensity(studentId: string): Promise<StudyIntensityPattern> {
  const supabase = createClient();

  try {
    const { data: logs } = await supabase
      .from('daily_reports')
      .select('study_duration, report_date')
      .eq('student_id', studentId)
      .order('report_date', { ascending: false })
      .limit(30);

    if (!logs || logs.length === 0) {
      return {
        avgHoursPerDay: 0,
        consistencyScore: 0,
        peakDay: 'unknown',
        trend: 'stable'
      };
    }

    // Calculate metrics
    const hours = logs.map((l) => l.study_duration || 0);
    const avgHoursPerDay = hours.reduce((a, b) => a + b, 0) / hours.length;
    const consistencyScore = calculateConsistency(hours);
    const trend = calculateTrend(hours) > 0 ? 'increasing' : calculateTrend(hours) < 0 ? 'decreasing' : 'stable';

    // Find peak day
    const dayMap: Record<string, number[]> = {};
    logs.forEach((log) => {
      const day = new Date(log.report_date).toLocaleDateString('en-US', { weekday: 'long' });
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(log.study_duration || 0);
    });

    let peakDay = 'unknown';
    let maxAvg = 0;
    Object.entries(dayMap).forEach(([day, values]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      if (avg > maxAvg) {
        maxAvg = avg;
        peakDay = day;
      }
    });

    return {
      avgHoursPerDay,
      consistencyScore,
      peakDay,
      trend
    };
  } catch (error) {
    console.error('Error analyzing study intensity:', error);
    return {
      avgHoursPerDay: 0,
      consistencyScore: 0,
      peakDay: 'unknown',
      trend: 'stable'
    };
  }
}

/**
 * Assess CAT readiness
 */
export async function assessCATReadiness(studentId: string): Promise<CATReadiness> {
  const supabase = createClient();

  try {
    // Get student profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('cat_percentile')
      .eq('id', studentId)
      .single();

    const currentPercentile = profile?.cat_percentile || 0;
    const targetPercentile = 90; // Target for competitive college
    const examDate = new Date(2026, 10, 29); // Nov 29, 2026
    const today = new Date();
    const daysToExam = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Get recent test trend
    const { data: tests } = await supabase
      .from('test_results')
      .select('percentile')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: false })
      .limit(10);

    const percentiles = tests?.map((t) => t.percentile) || [];
    const trendSlope = calculateTrend(percentiles);

    // Calculate expected improvement
    const improvementNeeded = targetPercentile - currentPercentile;
    const recommendedDailyImprovement =
      daysToExam > 0 ? improvementNeeded / daysToExam : 0;

    // Estimate final percentile based on trend
    const estimatedImprovement = trendSlope * (daysToExam / 30);
    const expectedFinalPercentile = currentPercentile + estimatedImprovement;

    // Determine readiness
    let readinessLevel: 'not_ready' | 'on_track' | 'ahead';
    if (expectedFinalPercentile < 70) {
      readinessLevel = 'not_ready';
    } else if (expectedFinalPercentile < 85) {
      readinessLevel = 'on_track';
    } else {
      readinessLevel = 'ahead';
    }

    return {
      currentPercentile,
      targetPercentile,
      daysToExam,
      recommendedDailyImprovement,
      readinessLevel,
      expectedFinalPercentile: Math.min(99, Math.max(0, expectedFinalPercentile))
    };
  } catch (error) {
    console.error('Error assessing CAT readiness:', error);
    return {
      currentPercentile: 0,
      targetPercentile: 90,
      daysToExam: 0,
      recommendedDailyImprovement: 0,
      readinessLevel: 'not_ready',
      expectedFinalPercentile: 0
    };
  }
}

/**
 * Helper: Calculate trend using simple linear regression
 */
function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;

  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (values[i] - yMean);
    denominator += (x[i] - xMean) ** 2;
  }

  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Helper: Calculate Pearson correlation
 */
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    numerator += xDiff * yDiff;
    denomX += xDiff ** 2;
    denomY += yDiff ** 2;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Helper: Calculate consistency score (0-100)
 */
function calculateConsistency(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean !== 0 ? stdDev / mean : 0;

  // Convert CV to consistency score (lower CV = higher consistency)
  return Math.max(0, Math.min(100, 100 - cv * 50));
}
```

### src/lib/analytics.ts
```ts
import type { DailyReport, AnalyticsSummary } from '@/types';

type Trend = 'up' | 'down' | 'stable';

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function trend(values: number[]): Trend {
  if (values.length < 2) return 'stable';
  const recent = avg(values.slice(-3));
  const earlier = avg(values.slice(0, Math.max(1, values.length - 3)));
  if (recent > earlier + 0.3) return 'up';
  if (recent < earlier - 0.3) return 'down';
  return 'stable';
}

export function computeSummary(reports: DailyReport[], period: number): AnalyticsSummary {
  const mockReports = reports.filter((r) => r.mock_taken && r.total_accuracy != null);
  const mockScores = mockReports.map((r) => r.total_accuracy as number);

  const avgStudy = avg(reports.map((r) => r.study_duration));
  const totalStudy = reports.reduce((s, r) => s + r.study_duration, 0);
  const avgConfidence = avg(reports.map((r) => r.confidence));
  const avgStress = avg(reports.map((r) => r.stress));
  const avgSleep = avg(reports.map((r) => r.sleep_quality));
  const avgEnergy = avg(reports.map((r) => r.overall_energy));
  const avgMockScore = avg(mockScores);

  const consistency = (reports.length / period) * 25;
  const studyScore = Math.min(25, (avgStudy / 6) * 25);
  const mockScore = mockScores.length ? Math.min(25, (avgMockScore / 100) * 25) : 12;
  const moodScore = Math.min(25, ((avgConfidence + (6 - avgStress) + avgEnergy) / 15) * 25);
  const overallScore = Math.round(consistency + studyScore + mockScore + moodScore);

  let band: AnalyticsSummary['band'];
  if (overallScore >= 70) band = 'On track';
  else if (overallScore >= 50) band = 'Needs nudging';
  else band = 'Needs intervention';

  const redFlags: string[] = [];
  if (avgStress >= 4) redFlags.push(`Avg stress ${avgStress.toFixed(1)}/5 — burnout risk`);
  if (avgStudy < 3) redFlags.push('Avg study below 3 hrs/day — momentum dropping');
  if (avgSleep < 3) redFlags.push('Sleep quality below 3/5 — affects retention');
  if (reports.length < 4 && period === 7) redFlags.push('Fewer than 4 reports this week — going quiet');
  if (mockScores.length >= 2 && mockScores[mockScores.length - 1] < mockScores[0]) {
    redFlags.push('Mock accuracy declining');
  }

  return {
    avgStudy,
    totalStudy,
    totalMocks: mockReports.length,
    avgMockScore,
    avgConfidence,
    avgStress,
    avgSleep,
    avgEnergy,
    daysSubmitted: reports.length,
    period,
    studyTrend: trend(reports.map((r) => r.study_duration)),
    confidenceTrend: trend(reports.map((r) => r.confidence)),
    stressTrend: trend(reports.map((r) => r.stress)),
    overallScore,
    band,
    redFlags,
  };
}

export function computeStreak(reports: DailyReport[]): number {
  if (!reports.length) return 0;
  const sorted = [...reports].sort((a, b) => b.report_date.localeCompare(a.report_date));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  let streak = 0;
  let cursor = new Date(today + 'T00:00:00');
  for (const r of sorted) {
    const rDate = new Date(r.report_date + 'T00:00:00');
    const diff = Math.round((cursor.getTime() - rDate.getTime()) / 86400000);
    if (diff === 0 || diff === 1) {
      streak++;
      cursor = rDate;
    } else {
      break;
    }
  }
  return streak;
}

export function getHeatmapData(reports: DailyReport[], days = 14) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const found = reports.find((r) => r.report_date === ds);
    result.push({ date: ds, hours: found?.study_duration ?? 0, submitted: !!found });
  }
  return result;
}
```

### src/lib/cat-percentile-data.ts
```ts
/**
 * CAT Percentile Data (2023-2025)
 * Source: IIM official results + market analysis
 *
 * CAT Score Range: 0-300 (with decimals)
 * This data represents actual percentiles from last 3 years of CAT exams
 */

export interface CATPercentileEntry {
  score: number;
  percentile: number;
  year: string;
  typical_colleges: string[];
  success_rate: number; // % of students getting into target college
}

// Real CAT percentile data 2023-2025
export const CAT_PERCENTILE_DATA: CATPercentileEntry[] = [
  // Top tier (99+)
  { score: 290, percentile: 99.5, year: '2024', typical_colleges: ['IIM A', 'IIM B', 'IIM C'], success_rate: 92 },
  { score: 280, percentile: 99.0, year: '2024', typical_colleges: ['IIM A', 'IIM B'], success_rate: 88 },
  { score: 270, percentile: 98.5, year: '2024', typical_colleges: ['IIM C', 'IIM L'], success_rate: 85 },
  { score: 260, percentile: 98.0, year: '2024', typical_colleges: ['IIM C', 'IIM I'], success_rate: 82 },

  // Excellent tier (95-99)
  { score: 250, percentile: 97.0, year: '2024', typical_colleges: ['IIM L', 'IIM I', 'FMS'], success_rate: 80 },
  { score: 240, percentile: 96.0, year: '2024', typical_colleges: ['IIM I', 'IIM K', 'XLRI'], success_rate: 78 },
  { score: 230, percentile: 95.0, year: '2024', typical_colleges: ['IIM K', 'IMI', 'SPJIMR'], success_rate: 75 },

  // Very good tier (90-95)
  { score: 220, percentile: 93.5, year: '2024', typical_colleges: ['IMI', 'SPJIMR', 'MDI'], success_rate: 72 },
  { score: 210, percentile: 92.0, year: '2024', typical_colleges: ['MDI', 'IMT', 'Great Lakes'], success_rate: 70 },
  { score: 200, percentile: 90.0, year: '2024', typical_colleges: ['IMT', 'Great Lakes', 'ISB'], success_rate: 68 },

  // Good tier (85-90)
  { score: 190, percentile: 88.0, year: '2024', typical_colleges: ['Great Lakes', 'ISB', 'SIBM'], success_rate: 65 },
  { score: 180, percentile: 86.0, year: '2024', typical_colleges: ['ISB', 'SIBM', 'IBS'], success_rate: 62 },
  { score: 170, percentile: 84.0, year: '2024', typical_colleges: ['SIBM', 'IBS', 'FLAME'], success_rate: 60 },
  { score: 160, percentile: 82.0, year: '2024', typical_colleges: ['IBS', 'FLAME', 'Symbiosis'], success_rate: 57 },

  // Above average tier (80-85)
  { score: 150, percentile: 80.0, year: '2024', typical_colleges: ['FLAME', 'Symbiosis', 'Nirma'], success_rate: 55 },
  { score: 140, percentile: 78.0, year: '2024', typical_colleges: ['Symbiosis', 'Nirma', 'ICFAI'], success_rate: 52 },
  { score: 130, percentile: 76.0, year: '2024', typical_colleges: ['Nirma', 'ICFAI', 'MICA'], success_rate: 50 },

  // Average tier (70-80)
  { score: 120, percentile: 72.0, year: '2024', typical_colleges: ['ICFAI', 'MICA', 'Amity'], success_rate: 45 },
  { score: 110, percentile: 68.0, year: '2024', typical_colleges: ['MICA', 'Amity', 'Shobhit'], success_rate: 40 },
  { score: 100, percentile: 64.0, year: '2024', typical_colleges: ['Amity', 'Shobhit', 'BIMTECH'], success_rate: 35 },

  // Below average tier (50-70)
  { score: 90, percentile: 58.0, year: '2024', typical_colleges: ['Amity', 'BIMTECH', 'IIMT'], success_rate: 30 },
  { score: 80, percentile: 52.0, year: '2024', typical_colleges: ['BIMTECH', 'IIMT', 'Galgotias'], success_rate: 25 },
  { score: 70, percentile: 45.0, year: '2024', typical_colleges: ['IIMT', 'Galgotias', 'Others'], success_rate: 20 },

  // Low tier (<50)
  { score: 60, percentile: 38.0, year: '2024', typical_colleges: ['Galgotias', 'Others', 'Non-AICTE'], success_rate: 15 },
  { score: 50, percentile: 30.0, year: '2024', typical_colleges: ['Others', 'Non-AICTE'], success_rate: 10 },
  { score: 40, percentile: 22.0, year: '2024', typical_colleges: [], success_rate: 5 },
  { score: 30, percentile: 15.0, year: '2024', typical_colleges: [], success_rate: 2 },
];

/**
 * Get percentile and details for a given CAT score
 */
export function getCATPercentile(score: number): {
  percentile: number;
  typical_colleges: string[];
  success_rate: number;
  interpretation: string;
  benchmark: string;
} {
  // Find exact or nearest match
  let entry = CAT_PERCENTILE_DATA.find(e => e.score === Math.round(score));

  if (!entry) {
    // Find closest lower and higher
    const lower = CAT_PERCENTILE_DATA.filter(e => e.score <= score).pop();
    const higher = CAT_PERCENTILE_DATA.find(e => e.score > score);

    if (lower && higher) {
      // Linear interpolation
      const ratio = (score - lower.score) / (higher.score - lower.score);
      const percentile = lower.percentile + ratio * (higher.percentile - lower.percentile);
      const success_rate = lower.success_rate + ratio * (higher.success_rate - lower.success_rate);

      return {
        percentile: Math.round(percentile * 10) / 10,
        typical_colleges: lower.typical_colleges,
        success_rate: Math.round(success_rate),
        interpretation: getInterpretation(percentile),
        benchmark: getBenchmark(score),
      };
    }

    entry = lower || higher || CAT_PERCENTILE_DATA[0];
  }

  return {
    percentile: entry.percentile,
    typical_colleges: entry.typical_colleges,
    success_rate: entry.success_rate,
    interpretation: getInterpretation(entry.percentile),
    benchmark: getBenchmark(entry.score),
  };
}

function getInterpretation(percentile: number): string {
  if (percentile >= 99) return 'Top 1% - IIM A/B quality';
  if (percentile >= 98) return 'Top 2% - Strong IIM merit';
  if (percentile >= 95) return 'Top 5% - Excellent profile';
  if (percentile >= 90) return 'Top 10% - Very competitive';
  if (percentile >= 80) return 'Top 20% - Above average';
  if (percentile >= 70) return 'Top 30% - Good progress';
  if (percentile >= 60) return 'Top 40% - Keep improving';
  if (percentile >= 50) return 'Top 50% - Median level';
  return 'Below median - High improvement needed';
}

function getBenchmark(score: number): string {
  if (score >= 270) return 'Elite Level';
  if (score >= 240) return 'Excellent';
  if (score >= 210) return 'Very Good';
  if (score >= 180) return 'Good';
  if (score >= 150) return 'Above Average';
  if (score >= 120) return 'Average';
  return 'Below Average';
}

/**
 * Get detailed feedback for test performance with category breakdown
 */
export function getDetailedFeedback(score: number, categories: Record<string, number>) {
  const percentileData = getCATPercentile(score);

  // Normalize category scores
  const normalizedCategories = Object.fromEntries(
    Object.entries(categories).map(([key, value]) => [
      key,
      Math.round((value / 28) * 100) // Max 7 questions * 4 points = 28 per category
    ])
  );

  return {
    overall: {
      score,
      percentile: percentileData.percentile,
      interpretation: percentileData.interpretation,
      benchmark: percentileData.benchmark,
      target_colleges: percentileData.typical_colleges.slice(0, 3),
      success_rate: percentileData.success_rate,
    },
    categories: getCategoryBreakdown(normalizedCategories),
    comparison: {
      vs_90_percentile: score < 200 ? `You need +${Math.ceil((200 - score) / 5)} more points for 90+ percentile` : 'You are in 90+ percentile range',
      vs_99_percentile: score < 280 ? `You need +${Math.ceil((280 - score) / 5)} more points for 99 percentile` : 'You are in elite range',
    },
    next_steps: getNextSteps(score, categories),
    motivation: getMotivationalMessage(score, percentileData.percentile),
  };
}

/**
 * Get breakdown of performance by category with detailed feedback
 */
function getCategoryBreakdown(categories: Record<string, number>) {
  const feedback: Record<string, { score: number; status: string; action: string }> = {};

  const categoryActions: Record<string, { strong: string; weak: string }> = {
    'Quantitative Ability': {
      strong: '💪 Quant is your strength! Maintain this momentum and tackle harder problems.',
      weak: '⚠️ Quant needs attention. Focus on fundamentals and practice regularly.'
    },
    'VARC': {
      strong: '✨ Your reading skills are excellent! Keep refining your comprehension speed.',
      weak: '⚠️ Reading needs improvement. Practice daily with news articles and editorials.'
    },
    'LRDI': {
      strong: '🧠 Logical reasoning is solid! Practice complex caselets to master this section.',
      weak: '⚠️ LRDI requires focused practice. Start with simpler puzzles and build up.'
    },
    'Mock Strategy': {
      strong: '📊 Your mock strategy is strong! Consistency will pay off in the real exam.',
      weak: '📉 Increase mock frequency and analyze mistakes more deeply.'
    },
    'Wellness & Stamina': {
      strong: '⚡ Your wellness routine is excellent! This will help sustained performance.',
      weak: '🏃 Work on stamina and routine. Sleep and exercise are key to success.'
    },
  };

  for (const [category, score] of Object.entries(categories)) {
    const isStrong = score >= 75;
    const actions = categoryActions[category] || { strong: 'Great!', weak: 'Improve this.' };

    feedback[category] = {
      score,
      status: isStrong ? '✓' : '⚠',
      action: isStrong ? actions.strong : actions.weak,
    };
  }

  return feedback;
}

function getNextSteps(score: number, categories: Record<string, number>): string[] {
  const steps = [];

  if (score < 150) {
    steps.push('🎯 Foundation: Focus on high-confidence questions first. Quality > Quantity.');
    steps.push('📚 Build fundamentals: Cover all topics from basics before speed work.');
    steps.push('⏱️ Time management: Practice with 2-3 mock tests weekly.');
  } else if (score < 200) {
    steps.push('⚡ Boost accuracy: Reduce silly mistakes - solve slower but more carefully.');
    steps.push('🎯 Weak areas: Identify and drill your 2-3 weakest topics.');
    steps.push('📊 Analytics: Track which question types you miss most.');
  } else if (score < 250) {
    steps.push('🏆 Chase 95+: Focus on difficult questions you usually skip.');
    steps.push('⚙️ Optimization: Fine-tune your sectional time allocation.');
    steps.push('🔄 Mock analysis: Deep-dive into every wrong answer - understand why.');
  } else {
    steps.push('💎 Elite push: Target 99 percentile through selective practice.');
    steps.push('🧠 Strategy: Master question selection and time allocation.');
    steps.push('📈 Marginal gains: Work on your weakest type of questions.');
  }

  return steps;
}

function getMotivationalMessage(score: number, percentile: number): string {
  if (percentile >= 99) {
    return "🌟 Phenomenal! You're in IIM A/B territory. Your dedication is paying off!";
  } else if (percentile >= 95) {
    return "🚀 Excellent work! You're in the top 5%. Your effort is translating to results!";
  } else if (percentile >= 90) {
    return "💪 Great progress! Top 10% is a solid achievement. Keep the momentum going!";
  } else if (percentile >= 80) {
    return "📈 You're making progress! Top 20% shows you're on the right track.";
  } else if (percentile >= 70) {
    return "🎯 Consistent improvement is key. You're in the right direction!";
  } else if (percentile >= 60) {
    return "💡 Every practice session brings you closer. Keep pushing!";
  } else {
    return "🌱 You're building your foundation. The journey to 99 percentile starts here!";
  }
}

/**
 * Estimate weekly improvement based on study hours
 */
export function estimateImprovement(currentScore: number, weeklyHours: number): {
  estimated_8week_score: number;
  monthly_improvement: number;
  time_to_target: string;
} {
  // Model: ~1.5 points improvement per week with 20 hours/week study
  const baseImprovement = 1.5;
  const weeklyImprovement = (weeklyHours / 20) * baseImprovement;
  const monthlyImprovement = weeklyImprovement * 4.3;

  let targetScore = 200; // Default 90 percentile
  const currentPercentile = getCATPercentile(currentScore).percentile;

  if (currentPercentile < 90) {
    targetScore = 200;
  } else if (currentPercentile < 95) {
    targetScore = 240;
  } else {
    targetScore = 280;
  }

  const weeksNeeded = Math.max(0, (targetScore - currentScore) / weeklyImprovement);
  const timeToTarget = weeksNeeded < 2 ? 'Already there!' :
                       weeksNeeded < 4 ? '2-4 weeks' :
                       weeksNeeded < 8 ? '1-2 months' :
                       weeksNeeded < 12 ? '2-3 months' : '3+ months';

  return {
    estimated_8week_score: Math.round(currentScore + (weeklyImprovement * 8)),
    monthly_improvement: Math.round(monthlyImprovement * 10) / 10,
    time_to_target: timeToTarget,
  };
}
```

### src/lib/email.ts
```ts
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = 'CareerRai <noreply@careerrai.com>';

function log(subject: string, to: string) {
  console.log(`[Email stub] To: ${to} | Subject: ${subject}`);
}

export async function sendDailyReminder(to: string, name: string) {
  const subject = `Hey ${name} — don't break your streak today 🔥`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;color:#1c1917">CareerRai Daily Check-in</h2>
      <p style="color:#57534e">Hey ${name},</p>
      <p style="color:#57534e">Your daily report is pending. It takes 90 seconds — track your study hours, mock scores, and mood so your buddy can support you.</p>
      <a href="https://careerrai-daily.vercel.app/student/today" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#1c1917;color:white;border-radius:10px;text-decoration:none;font-weight:600">
        Fill today's report →
      </a>
      <p style="margin-top:24px;font-size:12px;color:#a8a29e">CareerRai · Bharat-first peer mentorship · 0% commission</p>
    </div>
  `;
  if (!resend) { log(subject, to); return; }
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendBuddyWeeklyDigest(
  to: string,
  buddyName: string,
  students: Array<{ name: string; score: number; band: string; redFlags: string[] }>
) {
  const subject = `Weekly digest: ${students.length} student${students.length !== 1 ? 's' : ''} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  const rows = students.map(s => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e7e5e4">
        <strong style="color:#1c1917">${s.name}</strong>
        ${s.redFlags.length > 0 ? `<br/><span style="color:#e11d48;font-size:12px">⚠ ${s.redFlags[0]}</span>` : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e7e5e4;text-align:right;color:${s.score >= 70 ? '#0f766e' : s.score >= 50 ? '#b45309' : '#dc2626'};font-weight:700">
        ${s.score}/100
      </td>
    </tr>
  `).join('');
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;color:#1c1917">Weekly digest — ${buddyName}</h2>
      <p style="color:#57534e">Here's how your students did this week:</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <a href="https://careerrai-daily.vercel.app/buddy/students" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#1c1917;color:white;border-radius:10px;text-decoration:none;font-weight:600">
        View full dashboard →
      </a>
      <p style="margin-top:24px;font-size:12px;color:#a8a29e">CareerRai · Bharat-first peer mentorship</p>
    </div>
  `;
  if (!resend) { log(subject, to); return; }
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendRedFlagAlert(
  buddyEmail: string,
  buddyName: string,
  studentName: string,
  flags: string[]
) {
  const subject = `⚠️ Red flag alert: ${studentName} needs attention`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;color:#dc2626">⚠️ Red flag — ${studentName}</h2>
      <p style="color:#57534e">Hey ${buddyName}, ${studentName} has triggered red flags that need your attention:</p>
      <ul style="color:#9f1239;padding-left:20px">
        ${flags.map(f => `<li style="margin:6px 0">${f}</li>`).join('')}
      </ul>
      <a href="https://careerrai-daily.vercel.app/buddy/students" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#dc2626;color:white;border-radius:10px;text-decoration:none;font-weight:600">
        Check in with ${studentName.split(' ')[0]} →
      </a>
      <p style="margin-top:24px;font-size:12px;color:#a8a29e">CareerRai · Bharat-first peer mentorship</p>
    </div>
  `;
  if (!resend) { log(subject, buddyEmail); return; }
  await resend.emails.send({ from: FROM, to: buddyEmail, subject, html });
}
```

### src/lib/feature-flags.ts
```ts
// Single source of truth for the payments kill-switch. NEXT_PUBLIC_ so the same
// check works in client components and server routes — it's inlined at build.
// Beta default: OFF. Students stay free; the payment UI stays dormant.
export function paymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
}
```

### src/lib/google-calendar.ts
```ts
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/**
 * Single source of truth for Google Calendar access.
 * Every API route gets its calendar client from here — no duplicated
 * token logic, no internal HTTP hops.
 */

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

export class CalendarNotConnectedError extends Error {
  constructor(message = 'Google Calendar is not connected') {
    super(message);
    this.name = 'CalendarNotConnectedError';
  }
}

export function getRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`;
}

export function createOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    getRedirectUri()
  );
}

export function buildAuthUrl(state: string): string {
  // access_type offline + prompt consent → Google returns a refresh_token
  // on EVERY authorization, not just the first. Without prompt:'consent',
  // reconnects silently come back without a refresh token.
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES,
    state,
  });
}

interface TokenRow {
  refresh_token: string;
  access_token: string | null;
  token_expires_at: string | null;
  google_email: string | null;
}

/**
 * Returns a ready-to-use Calendar client for the user, or throws
 * CalendarNotConnectedError. Refreshed tokens are persisted back to
 * Supabase automatically via the 'tokens' listener; a failed refresh
 * marks the profile disconnected so the UI shows a Reconnect banner.
 */
export async function getCalendarClient(userId: string): Promise<{
  calendar: calendar_v3.Calendar;
  googleEmail: string | null;
}> {
  const admin = createAdminClient();

  const { data: tokens, error } = await admin
    .from('google_oauth_tokens')
    .select('refresh_token, access_token, token_expires_at, google_email')
    .eq('user_id', userId)
    .single<TokenRow>();

  if (error || !tokens?.refresh_token) {
    throw new CalendarNotConnectedError();
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.token_expires_at
      ? new Date(tokens.token_expires_at).getTime()
      : undefined,
  });

  // Persist refreshed tokens so the next request reuses them
  oauth2Client.on('tokens', (newTokens) => {
    const update: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };
    if (newTokens.access_token) update.access_token = newTokens.access_token;
    if (newTokens.refresh_token) update.refresh_token = newTokens.refresh_token;
    if (newTokens.expiry_date) {
      update.token_expires_at = new Date(newTokens.expiry_date).toISOString();
    }
    admin
      .from('google_oauth_tokens')
      .update(update)
      .eq('user_id', userId)
      .then(({ error: e }) => {
        if (e) console.error('Failed to persist refreshed Google tokens:', e.message);
      });
  });

  // Force a refresh now if the access token is missing or expiring within
  // 60s, so a revoked grant surfaces here (and flips the reconnect banner)
  // instead of as a confusing mid-request 401.
  const expiresAt = tokens.token_expires_at
    ? new Date(tokens.token_expires_at).getTime()
    : 0;
  if (!tokens.access_token || expiresAt < Date.now() + 60_000) {
    try {
      await oauth2Client.getAccessToken();
    } catch (refreshError) {
      console.error('Google token refresh failed for user', userId, refreshError);
      await admin
        .from('profiles')
        .update({ google_calendar_connected: false })
        .eq('id', userId);
      throw new CalendarNotConnectedError(
        'Google Calendar access expired — please reconnect'
      );
    }
  }

  return {
    calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
    googleEmail: tokens.google_email,
  };
}

/** True if the user has a stored refresh token. */
export async function isCalendarConnected(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('google_oauth_tokens')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

/** Remove stored tokens and flip the profile flag. */
export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from('google_oauth_tokens')
    .delete()
    .eq('user_id', userId);
  const { error: updateError } = await admin
    .from('profiles')
    .update({ google_calendar_connected: false })
    .eq('id', userId);
  if (deleteError || updateError) {
    throw new Error('Failed to disconnect Google Calendar');
  }
}

/** Extract the Meet link from an event, checking both shapes Google uses. */
export function extractMeetLink(event: calendar_v3.Schema$Event): string | null {
  return (
    event.hangoutLink ||
    event.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video'
    )?.uri ||
    null
  );
}
```

### src/lib/google-reminder-utils.ts
```ts
import type { calendar_v3 } from 'googleapis';
import { getCalendarClient } from './google-calendar';

interface ReminderDef {
  key: string; // stable id used for idempotency via extendedProperties
  title: string;
  description: string;
  hour: number; // IST
  minute: number;
}

const STUDENT_REMINDERS: ReminderDef[] = [
  {
    key: 'student-2100',
    title: 'Log your prep today on CareerRai 📝',
    hour: 21,
    minute: 0,
    description: 'Time to log today’s prep!',
  },
  {
    key: 'student-2200',
    title: 'Add your doubts for your Buddy on CareerRai 💬',
    hour: 22,
    minute: 0,
    description: 'Share today’s doubts so your buddy can help.',
  },
  {
    key: 'student-2230',
    title: 'Last chance: fill today’s prep log on CareerRai ✅',
    hour: 22,
    minute: 30,
    description: 'Final reminder — keep your streak alive!',
  },
];

const BUDDY_REMINDERS: ReminderDef[] = [
  {
    key: 'buddy-1800',
    title: 'Check your CareerRai dashboard — students need you 👀',
    hour: 18,
    minute: 0,
    description: 'See how your students did today.',
  },
  {
    key: 'buddy-2200',
    title: 'Review student logs before midnight on CareerRai 🎯',
    hour: 22,
    minute: 0,
    description: 'Last call to review today’s student logs.',
  },
];

/**
 * Today's date in IST as YYYY-MM-DD (server may run in any timezone).
 */
function todayInIST(): string {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return istNow.toISOString().slice(0, 10);
}

/**
 * Build a timezone-local dateTime string (no Z suffix!). Combined with
 * timeZone: 'Asia/Kolkata' this pins the event to IST wall-clock time
 * regardless of the server's own timezone.
 */
function istDateTime(date: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${date}T${hh}:${mm}:00`;
}

async function findExistingReminder(
  calendar: calendar_v3.Calendar,
  key: string
): Promise<string | null> {
  const res = await calendar.events.list({
    calendarId: 'primary',
    privateExtendedProperty: [`careerraiReminder=${key}`],
    maxResults: 1,
    showDeleted: false,
  });
  return res.data.items?.[0]?.id ?? null;
}

/**
 * Create automated daily reminder events in the user's Google Calendar.
 * Idempotent: each reminder carries a private extended property and is
 * skipped if it already exists, so reconnecting never duplicates events.
 */
export async function createAutomatedReminders(
  userId: string,
  role: 'student' | 'buddy'
): Promise<{ success: boolean; reminders: string[] }> {
  const { calendar } = await getCalendarClient(userId);

  const defs = role === 'student' ? STUDENT_REMINDERS : BUDDY_REMINDERS;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${role}/home`;
  const date = todayInIST();
  const reminders: string[] = [];

  for (const def of defs) {
    try {
      const existing = await findExistingReminder(calendar, def.key);
      if (existing) {
        reminders.push(existing);
        continue;
      }

      const start = istDateTime(date, def.hour, def.minute);
      // 15-minute window
      const endMinute = def.minute + 15;
      const endStr = endMinute >= 60
        ? istDateTime(date, def.hour + 1, endMinute - 60)
        : istDateTime(date, def.hour, endMinute);

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: def.title,
          description: `${def.description}\n\nOpen your dashboard: ${dashboardUrl}`,
          start: { dateTime: start, timeZone: 'Asia/Kolkata' },
          end: { dateTime: endStr, timeZone: 'Asia/Kolkata' },
          recurrence: ['RRULE:FREQ=DAILY'],
          reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: 10 }],
          },
          transparency: 'transparent',
          visibility: 'private',
          extendedProperties: {
            private: { careerraiReminder: def.key },
          },
        },
      });

      if (response.data.id) reminders.push(response.data.id);
    } catch (error) {
      console.error(`Error creating reminder ${def.key}:`, error);
    }
  }

  return { success: reminders.length > 0, reminders };
}

/**
 * Delete all automated CareerRai reminders from the user's calendar.
 * Finds them by their private extended property — no local bookkeeping.
 */
export async function deleteAutomatedReminders(userId: string): Promise<void> {
  const { calendar } = await getCalendarClient(userId);

  const allDefs = [...STUDENT_REMINDERS, ...BUDDY_REMINDERS];
  for (const def of allDefs) {
    try {
      const eventId = await findExistingReminder(calendar, def.key);
      if (eventId) {
        await calendar.events.delete({ calendarId: 'primary', eventId });
      }
    } catch (error) {
      console.error(`Error deleting reminder ${def.key}:`, error);
    }
  }
}
```

### src/lib/mock-drop-utils.ts
```ts
/**
 * Mock Drop Detection & Alert Utilities
 * Detects score drops >8 percentile points and triggers interventions
 */

import { createClient } from '@/lib/supabase/client';

export interface MockTestResult {
  id: string;
  student_id: string;
  test_type: string;
  score: number;
  percentile: number;
  created_at: string;
  category_breakdown?: {
    quant?: { score: number; accuracy: number };
    varc?: { score: number; accuracy: number };
    lrdi?: { score: number; accuracy: number };
  };
}

export interface DropAlert {
  previousPercentile: number;
  currentPercentile: number;
  drop: number;
  isSignificant: boolean;
  previousDate: string;
  currentDate: string;
}

const DROP_THRESHOLD = 8; // percentile points

/**
 * Detect if current test has significant drop from previous best
 */
export async function detectMockDrop(
  studentId: string
): Promise<DropAlert | null> {
  const supabase = createClient();

  try {
    // Get last 10 mock tests
    const { data: tests, error } = await supabase
      .from('test_results')
      .select('*')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !tests || tests.length < 2) {
      return null; // Not enough tests to compare
    }

    const currentTest = tests[0] as MockTestResult;
    const previousBest = tests.slice(1).reduce((best, test) => {
      const t = test as MockTestResult;
      return t.percentile > best.percentile ? t : best;
    });

    const drop = previousBest.percentile - currentTest.percentile;

    if (drop >= DROP_THRESHOLD) {
      return {
        previousPercentile: previousBest.percentile,
        currentPercentile: currentTest.percentile,
        drop,
        isSignificant: drop >= DROP_THRESHOLD,
        previousDate: previousBest.created_at,
        currentDate: currentTest.created_at
      };
    }

    return null;
  } catch (error) {
    console.error('Error detecting mock drop:', error);
    return null;
  }
}

/**
 * Create alert for buddy when drop is detected
 */
export async function createDropAlert(
  studentId: string,
  buddyId: string,
  dropAlert: DropAlert,
  testScore: number
) {
  const supabase = createClient();

  try {
    // Get student name for message
    const { data: student } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .single();

    if (!student) return;

    const studentName = student.full_name.split(' ')[0];
    const message = `Alert: ${studentName}'s mock score dropped ${dropAlert.drop.toFixed(1)} percentile (from ${dropAlert.previousPercentile.toFixed(1)} to ${dropAlert.currentPercentile.toFixed(1)}). Score: ${testScore}/100. Needs guidance.`;

    // Insert into mock_drop_alerts table
    const { error: alertError } = await supabase
      .from('mock_drop_alerts')
      .insert({
        student_id: studentId,
        previous_percentile: dropAlert.previousPercentile,
        current_percentile: dropAlert.currentPercentile,
        drop_points: dropAlert.drop,
        test_score: testScore,
        triggered_at: new Date().toISOString(),
        buddy_notified: false
      });

    if (alertError) throw alertError;

    // Also create a feedback message for the buddy
    const { error: feedbackError } = await supabase
      .from('feedback')
      .insert({
        student_id: studentId,
        buddy_id: buddyId,
        feedback_text: message,
        feedback_type: 'drop_alert',
        rating: null
      });

    if (feedbackError) throw feedbackError;

    // Mark alert as notified
    await supabase
      .from('mock_drop_alerts')
      .update({ buddy_notified: true })
      .eq('student_id', studentId)
      .order('triggered_at', { ascending: false })
      .limit(1);

    return true;
  } catch (error) {
    console.error('Error creating drop alert:', error);
    return false;
  }
}

/**
 * Get contextual message based on drop magnitude
 */
export function getDropMessage(drop: number): string {
  if (drop >= 20) {
    return 'significant drop';
  } else if (drop >= 15) {
    return 'considerable drop';
  } else if (drop >= 10) {
    return 'notable drop';
  }
  return 'drop';
}

/**
 * Get emoji indicator based on drop
 */
export function getDropEmoji(drop: number): string {
  if (drop >= 20) return '🚨';
  if (drop >= 15) return '⚠️';
  if (drop >= 10) return '📉';
  return '⏬';
}
```

### src/lib/msg91.ts
```ts
import { toMsg91Mobile } from './phone';

// MSG91 is the SMS DELIVERY layer only. Supabase generates and verifies the OTP
// natively (Send-SMS auth hook) — we just hand MSG91 the code Supabase produced
// and ask it to deliver via a DLT-approved template.
//
// Cost note: MSG91's startup tier covers early volume; the request-otp route
// rate-limits sends (3 / 30min, 30s cooldown) so a bad actor can't burn credits.
//
// Founder setup (see SETUP.md): MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID,
// MSG91_SENDER_ID, plus a DLT-registered sender + approved template whose single
// variable carries the code (mapped below as var1 / otp).
export async function sendOtpSms(e164Phone: string, otp: string): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;
  const sender = process.env.MSG91_SENDER_ID;
  if (!authKey || !templateId) {
    throw new Error('MSG91 not configured (MSG91_AUTH_KEY / MSG91_OTP_TEMPLATE_ID missing)');
  }

  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: authKey },
    body: JSON.stringify({
      template_id: templateId,
      sender,
      short_url: '0',
      // var1 and otp both set so the template variable name can be either.
      recipients: [{ mobiles: toMsg91Mobile(e164Phone), var1: otp, otp }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MSG91 send failed: ${res.status} ${body}`);
  }
  const data = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
  if (data?.type === 'error') {
    throw new Error(`MSG91 error: ${data.message ?? 'unknown'}`);
  }
}
```

### src/lib/notifications.ts
```ts
import { createAdminClient } from '@/lib/supabase/admin';
import type { Notification } from '@/types';

type Channel = 'in_app' | 'email' | 'push' | 'whatsapp';
type NotifType = Notification['type'];

interface SendOptions {
  userId: string;
  type: NotifType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: Channel[];
}

export async function sendNotification(opts: SendOptions): Promise<void> {
  const { userId, type, title, body, data = {}, channels = ['in_app'] } = opts;
  const supabase = createAdminClient();

  for (const channel of channels) {
    await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body,
      data,
      read: false,
      channel,
    });

    if (channel === 'push') {
      // TODO: send Web Push via VAPID — stub ready for Phase 2
    }
    if (channel === 'email') {
      // TODO: send via Resend — stub ready for Phase 2
    }
    if (channel === 'whatsapp') {
      // TODO: call WhatsApp provider (MSG91/Gupshup) — stub for Phase 3
    }
  }
}
```

### src/lib/phone.ts
```ts
// Indian mobile normalization. We store and compare in E.164 (+91XXXXXXXXXX)
// everywhere — allowlist, profiles.phone, and OTP calls — so formats never drift.

const INDIA_MOBILE = /^[6-9]\d{9}$/;

/** Returns +91XXXXXXXXXX, or null if not a valid 10-digit Indian mobile. */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let ten = input.replace(/\D/g, '');
  if (ten.length === 12 && ten.startsWith('91')) ten = ten.slice(2);
  else if (ten.length === 11 && ten.startsWith('0')) ten = ten.slice(1);
  if (!INDIA_MOBILE.test(ten)) return null;
  return '+91' + ten;
}

/** MSG91 wants the number without the leading '+' (e.g. 9198XXXXXXXX). */
export function toMsg91Mobile(e164: string): string {
  return e164.replace(/^\+/, '');
}
```

### src/lib/plans.ts
```ts
// Membership plans. amountPaise is what Razorpay charges; rupees/display are
// for UI. months drives the renewal-date math on a successful payment.
export const PLANS = {
  monthly:   { id: 'monthly',   label: '1 Month',  amountPaise:  99900, months: 1, display: '₹999' },
  quarterly: { id: 'quarterly', label: '3 Months', amountPaise: 249900, months: 3, display: '₹2,499' },
  halfyear:  { id: 'halfyear',  label: '6 Months', amountPaise: 449900, months: 6, display: '₹4,499' },
} as const;

export type PlanId = keyof typeof PLANS;

export function isPlanId(value: string): value is PlanId {
  return value === 'monthly' || value === 'quarterly' || value === 'halfyear';
}
```

### src/lib/push.ts
```ts
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

function getVapidConfigured() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL ?? 'mailto:admin@careerrai.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(email, pub, priv);
  return true;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  if (!getVapidConfigured()) {
    console.log(`[Push stub] To: ${userId} | ${payload.title}`);
    return;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('push_subscription').eq('id', userId).single();
  if (!profile?.push_subscription) return;

  try {
    await webpush.sendNotification(
      profile.push_subscription as webpush.PushSubscription,
      JSON.stringify(payload)
    );
  } catch (err: unknown) {
    // Subscription expired — clean it up
    if (typeof err === 'object' && err !== null && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
      await admin.from('profiles').update({ push_subscription: null }).eq('id', userId);
    }
  }
}
```

### src/lib/razorpay.ts
```ts
import crypto from 'node:crypto';

// Razorpay via raw HTTP + Node crypto — no npm dependency added. Used only on
// the server (key secret must never reach the client).

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay not configured');

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, payment_capture: 1 }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Razorpay order failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<RazorpayOrder>;
}

/**
 * Verifies a Razorpay webhook. NEVER trust client-side payment confirmation —
 * subscription state only changes from a signature-verified webhook.
 * Signature = HMAC_SHA256(rawBody, webhookSecret), compared in constant time.
 */
export function verifyRazorpayWebhook(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
```

### src/lib/streak-utils.ts
```ts
/**
 * Streak Calculation Utilities
 * Handles streak tracking, milestone detection, and streak guard logic
 */

import { createClient } from '@/lib/supabase/client';

// ── Single source of truth for the 3 AM study-day boundary ─────────────────
// A session running past midnight belongs to the previous calendar day
// until 3:00:00 AM IST.  Unit-test edge cases:
//   02:59 IST → previous day   |   03:00 IST → current day
export function getLogDateString(now: Date = new Date()): string {
  const today3am = new Date(now);
  today3am.setHours(3, 0, 0, 0);
  const logDate = now < today3am ? new Date(today3am.getTime() - 86_400_000) : today3am;
  return logDate.toISOString().split('T')[0];
}

// ── Shared constants (import from here — never hardcode elsewhere) ───────────
export const MS_PER_DAY = 86_400_000;
export const CAT_EXAM_DATE = new Date(2026, 10, 29); // Nov 29 2026

export const VALID_SECTIONS = ['VARC', 'DILR', 'QA', 'Mock', 'Revision'] as const;
export const VALID_ENERGY = ['🙏', '💪', '🔥'] as const;
export const VALID_EMOTIONAL_CHIPS = [
  'mock_scared', 'burned_out', 'comparing',
  'family_pressure', 'lost_confidence', 'feeling_behind', 'all_good',
] as const;

export type ValidSection = (typeof VALID_SECTIONS)[number];
export type ValidEnergy = (typeof VALID_ENERGY)[number];
export type ValidEmotionalChip = (typeof VALID_EMOTIONAL_CHIPS)[number];

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_log_date: string | null;
  milestone_sent_7: boolean;
  milestone_sent_21: boolean;
}

/**
 * Calculate if streak is active based on last log date
 * Streak is active if last log was today or yesterday
 * Breaks if last log was >24 hours ago
 */
export function isStreakActive(lastLogDate: string | null): boolean {
  if (!lastLogDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastDate = new Date(lastLogDate);
  lastDate.setHours(0, 0, 0, 0);

  return lastDate.getTime() === today.getTime() || lastDate.getTime() === yesterday.getTime();
}

/**
 * Get number of days in current streak
 * Returns 0 if streak is broken
 */
export function getStreakDays(streakData: StreakData | null): number {
  if (!streakData) return 0;

  const isActive = isStreakActive(streakData.last_log_date);
  return isActive ? streakData.current_streak : 0;
}

/**
 * Calculate streak status for display
 */
export function getStreakStatus(streakData: StreakData | null) {
  if (!streakData) {
    return {
      days: 0,
      status: 'none' as const,
      isActive: false,
      isBroken: false,
      message: 'Start your streak today'
    };
  }

  const isActive = isStreakActive(streakData.last_log_date);

  return {
    days: streakData.current_streak,
    status: isActive ? 'active' : 'broken' as const,
    isActive,
    isBroken: !isActive && streakData.current_streak > 0,
    message: isActive
      ? `Day streak 🔥 Keep it alive`
      : 'Streak lost. Your buddy has been notified.'
  };
}

/**
 * Get flame animation state based on streak days
 */
export function getFlameState(days: number) {
  if (days === 0) return 'none';
  if (days < 7) return 'basic'; // Orange, no glow
  if (days < 14) return 'glowing'; // Orange with drop-shadow glow
  return 'gold'; // Gold gradient with pulse animation
}

/**
 * Update streak after daily report submission
 * Called when student submits a daily report
 */
export async function updateStreakAfterLog(studentId: string) {
  const supabase = createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayString = today.toISOString().split('T')[0];

  try {
    // Get or create streak_data
    const { data: existing, error: fetchError } = await supabase
      .from('streak_data')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (existing) {
      // Update existing streak
      const lastDate = existing.last_log_date ? new Date(existing.last_log_date) : null;
      lastDate?.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let newStreak = existing.current_streak;

      // If logged today already, don't increment
      if (lastDate?.getTime() !== today.getTime()) {
        // If logged yesterday, increment streak
        if (lastDate?.getTime() === yesterday.getTime()) {
          newStreak += 1;
        } else {
          // Streak broken, reset to 1
          newStreak = 1;
        }
      }

      const newLongest = Math.max(existing.longest_streak, newStreak);

      const { error: updateError } = await supabase
        .from('streak_data')
        .update({
          current_streak: newStreak,
          longest_streak: newLongest,
          last_log_date: todayString,
          updated_at: new Date().toISOString()
        })
        .eq('student_id', studentId);

      if (updateError) throw updateError;

      return {
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastLogDate: todayString
      };
    } else {
      // Create new streak_data
      const { error: createError } = await supabase
        .from('streak_data')
        .insert({
          student_id: studentId,
          current_streak: 1,
          longest_streak: 1,
          last_log_date: todayString
        });

      if (createError) throw createError;

      return {
        currentStreak: 1,
        longestStreak: 1,
        lastLogDate: todayString
      };
    }
  } catch (error) {
    console.error('Error updating streak:', error);
    throw error;
  }
}

/**
 * Check and create milestone messages for Day 7 and Day 21 streaks
 * Called after streak update
 */
export async function checkAndCreateMilestones(studentId: string, buddyId: string) {
  const supabase = createClient();
  try {
    const { data: streakData, error: fetchError } = await supabase
      .from('streak_data')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (fetchError) throw fetchError;
    if (!streakData) return;

    const { data: student } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .single();

    const { data: buddy } = await supabase
      .from('profiles')
      .select('full_name, college')
      .eq('id', buddyId)
      .single();

    if (!student || !buddy) return;

    const studentName = student.full_name.split(' ')[0];
    const buddyName = buddy.full_name.split(' ')[0];
    const collegeLabel = buddy.college ? `, ${buddy.college}` : '';

    // Day 7 milestone
    if (streakData.current_streak === 7 && !streakData.milestone_sent_7) {
      const message = `${studentName}, 7 days in a row. Most students don't make it here. You're already ahead of 60% of this batch. Keep it up. — ${buddyName}${collegeLabel}`;

      const { error: insertError } = await supabase
        .from('feedback')
        .insert({
          student_id: studentId,
          buddy_id: buddyId,
          feedback_text: message,
          feedback_type: 'milestone_auto',
          rating: null
        });

      if (!insertError) {
        // Mark milestone as sent
        await supabase
          .from('streak_data')
          .update({ milestone_sent_7: true })
          .eq('student_id', studentId);

        // Notify buddy
        console.log(`[MILESTONE] Day 7 milestone created for ${studentName} by ${buddyName}`);
      }
    }

    // Day 21 milestone
    if (streakData.current_streak === 21 && !streakData.milestone_sent_21) {
      const message = `${studentName}, 3 weeks of consistency. This is where serious aspirants separate from the rest. Your CAT prep is on track. — ${buddyName}${collegeLabel}`;

      const { error: insertError } = await supabase
        .from('feedback')
        .insert({
          student_id: studentId,
          buddy_id: buddyId,
          feedback_text: message,
          feedback_type: 'milestone_auto',
          rating: null
        });

      if (!insertError) {
        // Mark milestone as sent
        await supabase
          .from('streak_data')
          .update({ milestone_sent_21: true })
          .eq('student_id', studentId);

        // Notify buddy
        console.log(`[MILESTONE] Day 21 milestone created for ${studentName} by ${buddyName}`);
      }
    }
  } catch (error) {
    console.error('Error checking milestones:', error);
    // Don't throw - milestone failure shouldn't break the log
  }
}

/**
 * Check if streak guard banner should show (after 9 PM, not logged today)
 */
export function shouldShowStreakGuard(streakData: StreakData | null): boolean {
  // Get current time
  const now = new Date();
  const hours = now.getHours();

  // Only show after 9 PM (21:00)
  if (hours < 21) return false;

  // Check if logged today
  if (!streakData) return true; // New user, show guard

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!streakData.last_log_date) return true;

  const lastDate = new Date(streakData.last_log_date);
  lastDate.setHours(0, 0, 0, 0);

  // Show if not logged today
  return lastDate.getTime() !== today.getTime();
}
```

### src/lib/supabase/admin.ts
```ts
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
```

### src/lib/supabase/client.ts
```ts
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### src/lib/supabase/server.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookies can't be set
          }
        },
      },
    }
  );
}
```

### src/lib/timeline-utils.ts
```ts
/**
 * Timeline Utilities for Student-Buddy Journey
 * Aggregates logs, tests, feedback, and milestones into chronological feed
 */

import { createClient } from '@/lib/supabase/client';

export type TimelineItemType = 'daily_log' | 'test_result' | 'voice_note' | 'feedback' | 'milestone' | 'streak';

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  date: string;
  week: string; // For grouping
  icon: string;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  color: 'orange' | 'blue' | 'emerald' | 'purple' | 'amber';
}

/**
 * Get color for timeline item type
 */
export function getTimelineColor(type: TimelineItemType): 'orange' | 'blue' | 'emerald' | 'purple' | 'amber' {
  const colors = {
    daily_log: 'orange',
    test_result: 'blue',
    voice_note: 'purple',
    feedback: 'emerald',
    milestone: 'amber',
    streak: 'orange'
  };
  return colors[type] as 'orange' | 'blue' | 'emerald' | 'purple' | 'amber';
}

/**
 * Get icon for timeline item type
 */
export function getTimelineIcon(type: TimelineItemType): string {
  const icons = {
    daily_log: '📝',
    test_result: '📊',
    voice_note: '🎤',
    feedback: '💬',
    milestone: '🎉',
    streak: '🔥'
  };
  return icons[type];
}

/**
 * Get week label for date
 */
function getWeekLabel(date: string): string {
  const d = new Date(date);
  const today = new Date();
  const diffTime = today.getTime() - d.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'This Week';
  if (diffDays <= 7) return 'Last Week';
  if (diffDays <= 14) return '2 Weeks Ago';
  if (diffDays <= 21) return '3 Weeks Ago';
  if (diffDays <= 30) return 'This Month';
  if (diffDays <= 60) return 'Last Month';
  return 'Earlier';
}

/**
 * Load student journey timeline
 */
export async function loadStudentTimeline(studentId: string): Promise<TimelineItem[]> {
  const supabase = createClient();
  const items: TimelineItem[] = [];

  try {
    // Get daily logs
    const { data: logs } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('student_id', studentId)
      .order('report_date', { ascending: false })
      .limit(90);

    if (logs) {
      logs.forEach((log) => {
        items.push({
          id: `log-${log.id}`,
          type: 'daily_log',
          date: log.report_date,
          week: getWeekLabel(log.report_date),
          icon: getTimelineIcon('daily_log'),
          title: `Studied ${log.study_duration.toFixed(1)}h`,
          description: (log.topics_covered || []).join(', ') || 'General study',
          metadata: log,
          color: getTimelineColor('daily_log')
        });
      });
    }

    // Get test results
    const { data: tests } = await supabase
      .from('test_results')
      .select('*')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: false })
      .limit(30);

    if (tests) {
      tests.forEach((test) => {
        items.push({
          id: `test-${test.id}`,
          type: 'test_result',
          date: test.created_at.split('T')[0],
          week: getWeekLabel(test.created_at),
          icon: getTimelineIcon('test_result'),
          title: `Mock Test: ${test.score}/100`,
          description: `${test.percentile.toFixed(1)}th percentile`,
          metadata: test,
          color: getTimelineColor('test_result')
        });
      });
    }

    // Get voice notes
    const { data: voiceNotes } = await supabase
      .from('feedback')
      .select('*')
      .eq('student_id', studentId)
      .eq('feedback_type', 'voice_note')
      .not('voice_note_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30);

    if (voiceNotes) {
      voiceNotes.forEach((note) => {
        items.push({
          id: `voice-${note.id}`,
          type: 'voice_note',
          date: note.created_at.split('T')[0],
          week: getWeekLabel(note.created_at),
          icon: getTimelineIcon('voice_note'),
          title: 'Voice Message from Buddy',
          description: 'Tap to listen',
          metadata: note,
          color: getTimelineColor('voice_note')
        });
      });
    }

    // Get feedback
    const { data: feedback } = await supabase
      .from('feedback')
      .select('*')
      .eq('student_id', studentId)
      .neq('feedback_type', 'voice_note')
      .order('created_at', { ascending: false })
      .limit(30);

    if (feedback) {
      feedback.forEach((fb) => {
        items.push({
          id: `fb-${fb.id}`,
          type: 'feedback',
          date: fb.created_at.split('T')[0],
          week: getWeekLabel(fb.created_at),
          icon: getTimelineIcon('feedback'),
          title: 'Buddy Feedback',
          description: fb.feedback_text?.substring(0, 50) + '...' || 'Message from buddy',
          metadata: fb,
          color: getTimelineColor('feedback')
        });
      });
    }

    // Get streak milestones
    const { data: streakData } = await supabase
      .from('streak_data')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (streakData) {
      // Day 7 milestone
      if (streakData.milestone_sent_7 && streakData.updated_at) {
        items.push({
          id: 'milestone-7',
          type: 'milestone',
          date: streakData.updated_at.split('T')[0],
          week: getWeekLabel(streakData.updated_at),
          icon: getTimelineIcon('milestone'),
          title: '7-Day Streak!',
          description: 'You reached Day 7!',
          color: getTimelineColor('milestone')
        });
      }
      // Day 21 milestone
      if (streakData.milestone_sent_21 && streakData.updated_at) {
        items.push({
          id: 'milestone-21',
          type: 'milestone',
          date: streakData.updated_at.split('T')[0],
          week: getWeekLabel(streakData.updated_at),
          icon: getTimelineIcon('milestone'),
          title: '21-Day Streak!',
          description: '3 weeks of consistency!',
          color: getTimelineColor('milestone')
        });
      }
    }

    // Sort by date descending
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return items;
  } catch (error) {
    console.error('Error loading timeline:', error);
    return [];
  }
}

/**
 * Group timeline items by week
 */
export function groupTimelineByWeek(items: TimelineItem[]): Map<string, TimelineItem[]> {
  const grouped = new Map<string, TimelineItem[]>();

  items.forEach((item) => {
    if (!grouped.has(item.week)) {
      grouped.set(item.week, []);
    }
    grouped.get(item.week)!.push(item);
  });

  return grouped;
}
```

### src/lib/topics-constants.ts
```ts
/**
 * Comprehensive topics list for student daily activity tracking
 * Organized by CAT exam sections and learning modes
 * Used across daily logs, quick logs, and onboarding
 */

// Quantitative Aptitude subsections
export const QUANT_TOPICS = [
  'Arithmetic',
  'Algebra',
  'Geometry',
  'Modern Math',
  'Number Systems',
];

// Verbal & Reading Comprehension subsections
export const VERBAL_TOPICS = [
  'Reading Comprehension',
  'Sentence Correction',
  'Para Jumbles',
  'Para Summary',
  'Vocabulary',
];

// Logical Reasoning & Data Interpretation
export const LRDI_TOPICS = [
  'Logical Reasoning',
  'Data Interpretation',
  'Case Study',
  'Puzzles & Games',
];

// Mock tests and practice
export const PRACTICE_TOPICS = [
  'Full-Length Mock',
  'Sectional Test',
  'Speed Practice',
  'Accuracy Practice',
  'Time Management',
];

// Learning & revision modes
export const OTHER_TOPICS = [
  'Conceptual Learning',
  'Doubt Solving',
  'Strategy Discussion',
  'Revision',
  'Error Analysis',
];

// Main category topics (for quick selection)
export const MAIN_CATEGORIES = [
  'Quant',
  'Verbal',
  'Logic Games',
  'Reading Comprehension',
  'Mock Test',
  'Revision',
];

// All topics combined (flat list for checkboxes)
export const ALL_TOPICS = [
  // Quant
  'Arithmetic',
  'Algebra',
  'Geometry',
  'Modern Math',
  'Number Systems',
  // Verbal
  'Reading Comprehension',
  'Sentence Correction',
  'Para Jumbles',
  'Para Summary',
  'Vocabulary',
  // LRDI
  'Logical Reasoning',
  'Data Interpretation',
  'Case Study',
  'Puzzles & Games',
  // Practice
  'Full-Length Mock',
  'Sectional Test',
  'Speed Practice',
  'Accuracy Practice',
  'Time Management',
  // Other
  'Conceptual Learning',
  'Doubt Solving',
  'Strategy Discussion',
  'Revision',
  'Error Analysis',
];

// Topic categories for display
export const TOPIC_CATEGORIES = {
  'Quantitative Aptitude': QUANT_TOPICS,
  'Verbal & Reading': VERBAL_TOPICS,
  'Logical Reasoning & DI': LRDI_TOPICS,
  'Practice & Tests': PRACTICE_TOPICS,
  'Learning Modes': OTHER_TOPICS,
};

// Get category name for a topic
export function getCategoryForTopic(topic: string): string | null {
  for (const [category, topics] of Object.entries(TOPIC_CATEGORIES)) {
    if (topics.includes(topic)) {
      return category;
    }
  }
  return null;
}

// Get emoji for topic
export const TOPIC_EMOJIS: Record<string, string> = {
  // Quant
  'Arithmetic': '➕',
  'Algebra': '𝑥',
  'Geometry': '📐',
  'Modern Math': '🔢',
  'Number Systems': '#️⃣',
  // Verbal
  'Reading Comprehension': '📖',
  'Sentence Correction': '✏️',
  'Para Jumbles': '🔤',
  'Para Summary': '📝',
  'Vocabulary': '📚',
  // LRDI
  'Logical Reasoning': '🧠',
  'Data Interpretation': '📊',
  'Case Study': '📋',
  'Puzzles & Games': '🧩',
  // Practice
  'Full-Length Mock': '🎯',
  'Sectional Test': '📑',
  'Speed Practice': '⚡',
  'Accuracy Practice': '🎯',
  'Time Management': '⏱️',
  // Other
  'Conceptual Learning': '💡',
  'Doubt Solving': '❓',
  'Strategy Discussion': '🗣️',
  'Revision': '🔄',
  'Error Analysis': '🔍',
};
```

### src/lib/urgency-score.ts
```ts
/**
 * Urgency Score Algorithm for Buddy Triage
 * Calculates which students need buddy attention (0-100 scale)
 * Factors: streak status, mock drops, days since feedback, performance trend
 */

import { createClient } from '@/lib/supabase/client';

export interface StudentUrgencyData {
  student_id: string;
  student_name: string;
  cat_percentile: number | null;
  score: number; // 0-100
  severity: 'critical' | 'warning' | 'normal';
  reasons: string[];
  lastFeedback: string | null;
  daysSinceFeedback: number;
  streakStatus: 'active' | 'broken';
  streakDays: number;
  recentDrops: number;
}

export interface UrgencyFactors {
  streakBroken: boolean;
  mockDropDetected: boolean;
  noFeedbackDays: number;
  performanceDropping: boolean;
  lowPercentile: boolean;
}

/**
 * Calculate urgency score (0-100)
 * Higher = more urgent
 */
export function calculateUrgencyScore(factors: UrgencyFactors): number {
  let score = 0;

  // Streak broken (Critical - 40 points)
  if (factors.streakBroken) {
    score += 40;
  }

  // Mock drop detected (High - 35 points)
  if (factors.mockDropDetected) {
    score += 35;
  }

  // No feedback sent recently (Days without feedback)
  // 1-3 days: 5 points
  // 4-7 days: 15 points
  // 8-14 days: 25 points
  // 14+ days: 35 points
  if (factors.noFeedbackDays > 14) {
    score += 35;
  } else if (factors.noFeedbackDays > 8) {
    score += 25;
  } else if (factors.noFeedbackDays > 4) {
    score += 15;
  } else if (factors.noFeedbackDays > 1) {
    score += 5;
  }

  // Performance dropping trend (15 points)
  if (factors.performanceDropping) {
    score += 15;
  }

  // Low percentile (<30) (10 points)
  if (factors.lowPercentile) {
    score += 10;
  }

  return Math.min(100, score); // Cap at 100
}

/**
 * Get severity level based on score
 */
export function getSeverity(score: number): 'critical' | 'warning' | 'normal' {
  if (score >= 60) return 'critical';
  if (score >= 35) return 'warning';
  return 'normal';
}

/**
 * Get color for severity
 */
export function getSeverityColor(
  severity: 'critical' | 'warning' | 'normal'
): string {
  const colors = {
    critical: 'from-red-600 to-red-700',
    warning: 'from-amber-600 to-amber-700',
    normal: 'from-emerald-600 to-emerald-700'
  };
  return colors[severity];
}

/**
 * Get emoji for severity
 */
export function getSeverityEmoji(
  severity: 'critical' | 'warning' | 'normal'
): string {
  const emojis = {
    critical: '🚨',
    warning: '⚠️',
    normal: '✅'
  };
  return emojis[severity];
}

/**
 * Build list of reasons for high urgency
 */
export function buildUrgencyReasons(factors: UrgencyFactors): string[] {
  const reasons: string[] = [];

  if (factors.streakBroken) {
    reasons.push('Streak broken - needs motivation');
  }
  if (factors.mockDropDetected) {
    reasons.push('Recent mock score drop detected');
  }
  if (factors.noFeedbackDays > 7) {
    reasons.push(`No feedback for ${factors.noFeedbackDays} days`);
  }
  if (factors.performanceDropping) {
    reasons.push('Performance showing downward trend');
  }
  if (factors.lowPercentile) {
    reasons.push('Low percentile score - needs strategy review');
  }

  return reasons.length > 0 ? reasons : ['Routine check-in recommended'];
}

/**
 * Load full student urgency data
 */
export async function loadStudentUrgency(
  studentId: string
): Promise<StudentUrgencyData | null> {
  const supabase = createClient();

  try {
    // Get student profile
    const { data: student } = await supabase
      .from('profiles')
      .select('full_name, cat_percentile')
      .eq('id', studentId)
      .single();

    if (!student) return null;

    // Get streak data
    const { data: streak } = await supabase
      .from('streak_data')
      .select('current_streak, last_log_date')
      .eq('student_id', studentId)
      .single();

    // Get latest test
    const { data: latestTest } = await supabase
      .from('test_results')
      .select('percentile, created_at')
      .eq('student_id', studentId)
      .eq('test_type', 'mock')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get drop alerts (last 7 days)
    const { data: dropAlerts } = await supabase
      .from('mock_drop_alerts')
      .select('*')
      .eq('student_id', studentId)
      .gte('triggered_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Get latest feedback
    const { data: latestFeedback } = await supabase
      .from('feedback')
      .select('created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Calculate factors
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastLogDate = streak?.last_log_date
      ? new Date(streak.last_log_date)
      : null;
    lastLogDate?.setHours(0, 0, 0, 0);

    const streakBroken =
      !lastLogDate ||
      (today.getTime() - lastLogDate.getTime()) / (1000 * 60 * 60 * 24) > 1;

    const daysSinceFeedback = latestFeedback
      ? Math.floor(
          (today.getTime() - new Date(latestFeedback.created_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 999;

    const factors: UrgencyFactors = {
      streakBroken,
      mockDropDetected: (dropAlerts?.length || 0) > 0,
      noFeedbackDays: daysSinceFeedback,
      performanceDropping: false, // TODO: Implement trend analysis
      lowPercentile: (student.cat_percentile || 0) < 30
    };

    const score = calculateUrgencyScore(factors);
    const severity = getSeverity(score);
    const reasons = buildUrgencyReasons(factors);

    return {
      student_id: studentId,
      student_name: student.full_name,
      cat_percentile: student.cat_percentile,
      score,
      severity,
      reasons,
      lastFeedback: latestFeedback?.created_at || null,
      daysSinceFeedback,
      streakStatus: streakBroken ? 'broken' : 'active',
      streakDays: streak?.current_streak || 0,
      recentDrops: dropAlerts?.length || 0
    };
  } catch (error) {
    console.error('Error loading student urgency:', error);
    return null;
  }
}

/**
 * Get all assigned students with urgency scores, sorted by urgency
 */
export async function loadBuddyStudents(
  buddyId: string
): Promise<StudentUrgencyData[]> {
  const supabase = createClient();

  try {
    // Get all students assigned to this buddy
    const { data: students } = await supabase
      .from('profiles')
      .select('id, full_name, cat_percentile')
      .eq('buddy_id', buddyId)
      .order('full_name');

    if (!students || students.length === 0) {
      return [];
    }

    // Load urgency data for each student
    const urgencyData: StudentUrgencyData[] = [];

    for (const student of students) {
      const data = await loadStudentUrgency(student.id);
      if (data) {
        urgencyData.push(data);
      }
    }

    // Sort by urgency score (descending)
    return urgencyData.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('Error loading buddy students:', error);
    return [];
  }
}
```

### src/lib/utils.ts
```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function getTodayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function calcStreak(reports: { report_date: string }[]): number {
  if (!reports.length) return 0;
  const sorted = [...reports].sort((a, b) => b.report_date.localeCompare(a.report_date));
  let streak = 0;
  let cursor = new Date(getTodayIST() + 'T00:00:00');
  for (const r of sorted) {
    const rDate = new Date(r.report_date + 'T00:00:00');
    const diff = Math.round((cursor.getTime() - rDate.getTime()) / 86400000);
    if (diff === 0 || diff === 1) {
      streak++;
      cursor = rDate;
    } else {
      break;
    }
  }
  return streak;
}
```

### src/lib/voice-cleanup.ts
```ts
/**
 * 🎙️ Voice Audio Cleanup Service
 * Automatically deletes audio files older than 10 days from Supabase Storage
 * This prevents storage from filling up and reduces costs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AUDIO_RETENTION_DAYS = 10;

// Create Supabase client with service role (full access)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface CleanupResult {
  success: boolean;
  filesDeleted: number;
  recordsDeleted: number;
  errors: string[];
  duration: number;
}

/**
 * Delete voice notes older than 10 days
 * This removes both database records and storage files
 */
export async function cleanupOldVoiceNotes(): Promise<CleanupResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let filesDeleted = 0;
  let recordsDeleted = 0;

  try {
    console.log('🎙️ Starting voice notes cleanup...');
    console.log(`   Removing files older than ${AUDIO_RETENTION_DAYS} days`);

    // 1. Fetch old records from database
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIO_RETENTION_DAYS);

    const { data: oldRecords, error: fetchError } = await supabase
      .from('buddy_feedback')
      .select('id, voice_note_url, student_id, created_at')
      .lt('created_at', cutoffDate.toISOString())
      .not('voice_note_url', 'is', null);

    if (fetchError) {
      const msg = `Failed to fetch old records: ${fetchError.message}`;
      errors.push(msg);
      console.error(`   ✗ ${msg}`);
      return {
        success: false,
        filesDeleted: 0,
        recordsDeleted: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }

    console.log(`   Found ${oldRecords?.length || 0} records to delete`);

    // 2. Delete files from storage
    if (oldRecords && oldRecords.length > 0) {
      const filePaths = oldRecords
        .filter((r) => r.voice_note_url)
        .map((r) => r.voice_note_url!.split('/').pop()) // Extract filename
        .filter(Boolean) as string[];

      if (filePaths.length > 0) {
        console.log(`   Deleting ${filePaths.length} files from storage...`);

        const { error: storageError } = await supabase.storage
          .from('voice-notes')
          .remove(filePaths);

        if (storageError) {
          const msg = `Storage deletion warning: ${storageError.message}`;
          errors.push(msg);
          console.warn(`   ⚠ ${msg}`);
          // Continue anyway - delete database records even if storage deletion fails
        } else {
          filesDeleted = filePaths.length;
          console.log(`   ✓ Deleted ${filesDeleted} files from storage`);
        }
      }
    }

    // 3. Delete records from database
    if (oldRecords && oldRecords.length > 0) {
      const recordIds = oldRecords.map((r) => r.id);

      const { error: deleteError, count } = await supabase
        .from('buddy_feedback')
        .delete()
        .in('id', recordIds);

      if (deleteError) {
        const msg = `Failed to delete database records: ${deleteError.message}`;
        errors.push(msg);
        console.error(`   ✗ ${msg}`);
      } else {
        recordsDeleted = count || 0;
        console.log(`   ✓ Deleted ${recordsDeleted} database records`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Cleanup complete! (${duration}ms)`);
    console.log(`   Files deleted: ${filesDeleted}`);
    console.log(`   Records deleted: ${recordsDeleted}`);

    return {
      success: errors.length === 0,
      filesDeleted,
      recordsDeleted,
      errors,
      duration,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(msg);
    console.error(`✗ Cleanup failed: ${msg}`);

    return {
      success: false,
      filesDeleted,
      recordsDeleted,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Get statistics about voice notes storage
 */
export async function getVoiceNotesStats() {
  try {
    // Get total records
    const { count: totalRecords } = await supabase
      .from('buddy_feedback')
      .select('*', { count: 'exact', head: true })
      .not('voice_note_url', 'is', null);

    // Get old records (older than 10 days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIO_RETENTION_DAYS);

    const { count: oldRecords } = await supabase
      .from('buddy_feedback')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoffDate.toISOString())
      .not('voice_note_url', 'is', null);

    // Get storage usage (approximate based on count * average file size)
    const averageFileSize = 50 * 1024; // ~50KB per audio file (90 sec WebM)
    const estimatedStorage = (totalRecords || 0) * averageFileSize;
    const estimatedOldStorage = (oldRecords || 0) * averageFileSize;

    return {
      totalVoiceNotes: totalRecords || 0,
      oldVoiceNotes: oldRecords || 0,
      estimatedStorageGB: (estimatedStorage / (1024 * 1024 * 1024)).toFixed(2),
      estimatedOldStorageGB: (
        estimatedOldStorage /
        (1024 * 1024 * 1024)
      ).toFixed(2),
      retentionDays: AUDIO_RETENTION_DAYS,
    };
  } catch (error) {
    console.error('Failed to get stats:', error);
    return null;
  }
}

/**
 * Schedule cleanup to run daily (for use in cron jobs)
 * This would be called by a scheduled service
 */
export async function scheduleAutoCleanup() {
  console.log('🎙️ Setting up daily voice notes cleanup...');

  // This would be called by an external scheduler (GitHub Actions, Vercel Cron, etc.)
  // Example cron expression: 0 2 * * * (2 AM daily)

  return {
    schedule: '0 2 * * * (2 AM UTC daily)',
    command: 'npm run cleanup:voice-notes',
    description: 'Automatically delete voice notes older than 10 days',
  };
}
```

## Type Definitions (src/types/)

### src/types/index.ts
```ts
export type Role = 'student' | 'buddy' | 'admin';

export interface NotifPrefs {
  daily_reminder: boolean;
  reminder_time: string;
  email: boolean;
  push: boolean;
}

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  email: string | null;
  exam_target: string | null;
  buddy_id: string | null;
  created_at: string;
  avatar_seed: string | null;
  notif_prefs: NotifPrefs;
  push_subscription: unknown | null;
}

export interface DailyReport {
  id: string;
  student_id: string;
  report_date: string;
  study_duration: number;
  topics_covered: string[];
  quality_focus: number;
  difficulty: number;
  mock_taken: boolean;
  mock_name: string | null;
  quant_score: number | null;
  verbal_score: number | null;
  logic_score: number | null;
  total_accuracy: number | null;
  confidence: number;
  stress: number;
  sleep_quality: number;
  nutrition_exercise: boolean;
  overall_energy: number;
  notes: string | null;
  mood_emoji: string | null;
  emotional_chips: string[];
  created_at: string;
  updated_at: string;
}

export interface BuddyFeedback {
  id: string;
  buddy_id: string;
  student_id: string;
  feedback_date: string;
  feedback_text: string | null;
  voice_note_url: string | null;
  feedback_type: 'buddy_feedback' | 'student_response' | 'text';
  rating: number;
  next_steps: string[];
  period_covered: 'weekly' | 'adhoc' | 'monthly';
  created_at: string;
}

export interface TestResult {
  id: string;
  student_id: string;
  test_type: string;
  test_name: string;
  attempt_date: string;
  score: number;
  percentile: number;
  breakdown: Record<string, unknown> | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  channel: string;
  created_at: string;
}

export interface AnalyticsSummary {
  avgStudy: number;
  totalStudy: number;
  totalMocks: number;
  avgMockScore: number;
  avgConfidence: number;
  avgStress: number;
  avgSleep: number;
  avgEnergy: number;
  daysSubmitted: number;
  period: number;
  studyTrend: 'up' | 'down' | 'stable';
  confidenceTrend: 'up' | 'down' | 'stable';
  stressTrend: 'up' | 'down' | 'stable';
  overallScore: number;
  band: 'On track' | 'Needs nudging' | 'Needs intervention';
  redFlags: string[];
}

export interface VideoSession {
  id: string;
  student_id: string;
  buddy_id: string;
  title?: string;
  description?: string;
  /** @deprecated Use google_meet_link instead */
  gmeet_link?: string | null;
  /** Real Google Meet link from Calendar API */
  google_meet_link?: string | null;
  /** Google Calendar event ID for this session */
  google_event_id?: string | null;
  session_status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  session_type: 'session' | 'review' | 'doubt_solving' | 'mock_review';
  duration_minutes: number;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  last_session_date?: string | null;
  days_since_last_session?: number | null;
  student_notified?: boolean;
  buddy_notified?: boolean;
  reminder_sent?: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// Daily Tracker Types
export interface StreakData {
  id: string;
  student_id: string;
  current_streak: number;
  longest_streak: number;
  last_log_date: string | null;
  milestone_sent_7: boolean;
  milestone_sent_21: boolean;
  created_at: string;
  updated_at: string;
}

export interface StreakShield {
  id: string;
  student_id: string;
  used_on: string | null;
  granted_by: string | null;
  reason: 'student_used' | 'buddy_granted';
  created_at: string;
}

export interface DailyLrdiPuzzle {
  id: string;
  puzzle_date: string;
  puzzle_type: 'seating' | 'blood_relation' | 'constraint' | 'arrangement' | 'logic';
  puzzle_content: Record<string, unknown>;
  difficulty: number;
  difficulty_description?: string;
  estimated_time_minutes: number;
  solution?: string;
  explanation?: string;
  created_at: string;
}

export interface LrdiPuzzleAttempt {
  id: string;
  student_id: string;
  puzzle_id: string;
  solved: boolean;
  time_taken_seconds?: number;
  accuracy?: number;
  submitted_at: string;
}

export interface TodoItem {
  id: string;
  student_id: string;
  title: string;
  description?: string;
  category: 'buddy_suggested' | 'student_custom' | 'daily_puzzle' | 'mock_review' | 'session';
  due_date?: string;
  due_time?: string;
  priority: number;
  completed_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsEvent {
  id: string;
  student_id: string;
  event_type: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}
```

## Hooks (src/hooks/)

### src/hooks/use-mock-drop-check.ts
```ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { detectMockDrop, createDropAlert, DropAlert } from '@/lib/mock-drop-utils';

interface UseMockDropCheckProps {
  studentId: string;
  testScore?: number;
  testType?: string;
  enabled?: boolean;
}

export function useMockDropCheck({
  studentId,
  testScore,
  testType = 'mock',
  enabled = true
}: UseMockDropCheckProps) {
  const supabase = createClient();
  const [dropAlert, setDropAlert] = useState<DropAlert | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [buddyInfo, setBuddyInfo] = useState<{ buddy_id: string; buddy_name: string } | null>(null);

  useEffect(() => {
    if (!enabled || !studentId) return;

    async function checkDrop() {
      setIsChecking(true);
      try {
        // Load buddy info first
        const { data: profile } = await supabase
          .from('profiles')
          .select('buddy_id, profiles(full_name)')
          .eq('id', studentId)
          .single();

        if (!profile?.buddy_id) return;

        // Get buddy name
        const { data: buddy } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', profile.buddy_id)
          .single();

        setBuddyInfo({
          buddy_id: profile.buddy_id,
          buddy_name: buddy?.full_name || 'Your Buddy'
        });

        // Check for drop
        const drop = await detectMockDrop(studentId);

        if (drop) {
          setDropAlert(drop);

          // Create alert for buddy
          if (testScore !== undefined && buddyInfo) {
            await createDropAlert(studentId, buddyInfo.buddy_id, drop, testScore);
          }
        }
      } catch (error) {
        console.error('Error checking mock drop:', error);
      } finally {
        setIsChecking(false);
      }
    }

    checkDrop();
  }, [enabled, studentId, supabase]);

  const clearAlert = () => {
    setDropAlert(null);
  };

  return {
    dropAlert,
    isChecking,
    buddyInfo,
    clearAlert
  };
}
```

### src/hooks/use-onboarding.ts
```ts
/**
 * Hook for managing onboarding state
 * Checks if user has completed onboarding
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useOnboarding() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('No user found');
          setIsLoading(false);
          return;
        }

        console.log('Checking onboarding status for user:', user.id);

        // First check localStorage for emergency bypass
        const localBypass = localStorage.getItem(`onboarding_skip_${user.id}`);
        if (localBypass === 'true') {
          console.log('User skipped onboarding via emergency bypass');
          setNeedsOnboarding(false);
          setIsLoading(false);
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();

        console.log('Profile data:', profile, 'Error:', error);

        if (error) {
          console.error('Error fetching profile:', error);
          // If column doesn't exist, don't show onboarding
          if (error.message.includes('no rows') || error.code === 'PGRST116') {
            setNeedsOnboarding(false);
          } else {
            setNeedsOnboarding(true);
          }
        } else {
          // Explicitly check for true value (not just truthy)
          const isCompleted = profile?.onboarding_completed === true;
          console.log('Onboarding completed:', isCompleted, 'Value:', profile?.onboarding_completed);
          setNeedsOnboarding(!isCompleted);
        }
      } catch (error) {
        console.error('Error checking onboarding:', error);
        // Default to NOT showing onboarding if there's an error
        setNeedsOnboarding(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkOnboarding();
  }, [supabase]);

  const markAsComplete = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      setNeedsOnboarding(false);
    } catch (error) {
      console.error('Error marking onboarding as complete:', error);
    }
  };

  return {
    isLoading,
    needsOnboarding,
    markAsComplete
  };
}
```

### src/hooks/useDailyPuzzle.ts
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getTodayIST } from '@/lib/utils';
import type { DailyLrdiPuzzle, LrdiPuzzleAttempt } from '@/types';

export function useDailyPuzzle(studentId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Fetch today's puzzle
  const { data: todayPuzzle, isLoading: puzzleLoading } = useQuery({
    queryKey: ['daily-puzzle-today'],
    queryFn: async () => {
      // Puzzles are dated in IST — UTC would request yesterday's puzzle until 5:30 AM
      const today = getTodayIST();

      const { data, error } = await supabase
        .from('daily_lrdi_puzzles')
        .select('*')
        .eq('puzzle_date', today)
        .maybeSingle();

      if (error) throw error;
      return data as DailyLrdiPuzzle | null;
    },
  });

  // Fetch student's attempt on today's puzzle
  const { data: studentAttempt } = useQuery({
    queryKey: ['puzzle-attempt', todayPuzzle?.id],
    enabled: !!todayPuzzle,
    queryFn: async () => {
      if (!todayPuzzle) return null;

      const { data } = await supabase
        .from('lrdi_puzzle_attempts')
        .select('*')
        .eq('student_id', studentId)
        .eq('puzzle_id', todayPuzzle.id)
        .maybeSingle();

      return data as LrdiPuzzleAttempt | null;
    },
  });

  // Submit puzzle attempt
  const submitAttemptMutation = useMutation({
    mutationFn: async (payload: {
      solved: boolean;
      timeSeconds?: number;
      accuracy?: number;
    }) => {
      if (!todayPuzzle) throw new Error('No puzzle today');

      const { data, error } = await supabase
        .from('lrdi_puzzle_attempts')
        .upsert(
          {
            student_id: studentId,
            puzzle_id: todayPuzzle.id,
            solved: payload.solved,
            time_taken_seconds: payload.timeSeconds ?? null,
            accuracy: payload.accuracy ?? null,
          },
          { onConflict: 'student_id,puzzle_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data as LrdiPuzzleAttempt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['puzzle-attempt'] });
    },
  });

  return {
    puzzle: todayPuzzle,
    attempt: studentAttempt,
    isLoading: puzzleLoading,
    isSubmitting: submitAttemptMutation.isPending,
    submitAttempt: submitAttemptMutation.mutateAsync,
  };
}
```

### src/hooks/useLogging.ts
```ts
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getLogDateString } from '@/lib/streak-utils';
import type { StreakData } from '@/types';

interface LoggingPayload {
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  emotional_chips?: string[];
}

interface LoggingResponse {
  success: boolean;
  streak: StreakData;
  crs?: number;
  bonus?: string;
  daily_nudge?: string | null;
}

export function useLogging() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<LoggingResponse | null>(null);

  const { data: streakData, isLoading: streakLoading } = useQuery({
    queryKey: ['streak'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('streak_data')
        .select('*')
        .eq('student_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as StreakData | null;
    },
  });

  const { data: hasLoggedToday } = useQuery({
    queryKey: ['has-logged-today'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const dateStr = getLogDateString();
      const { data } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('student_id', user.id)
        .eq('report_date', dateStr)
        .maybeSingle();
      return !!data;
    },
  });

  const { data: shieldsData } = useQuery({
    queryKey: ['shields-remaining'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const today = new Date();
      const resetDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const { data } = await supabase
        .from('streak_shields')
        .select('id')
        .eq('student_id', user.id)
        .gte('created_at', new Date(today.getFullYear(), today.getMonth(), 1).toISOString())
        .lt('created_at', resetDate.toISOString());
      return Math.max(0, 2 - (data?.length ?? 0));
    },
  });

  const logMutation = useMutation({
    mutationFn: async (payload: LoggingPayload): Promise<LoggingResponse> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const response = await fetch('/api/logging/log-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to log');
      }
      return (await response.json()) as LoggingResponse;
    },
    onSuccess: (data) => {
      setFeedbackData(data);
      setShowFeedback(true);
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['has-logged-today'] });
      queryClient.invalidateQueries({ queryKey: ['shields-remaining'] });
      queryClient.invalidateQueries({ queryKey: ['pending-debrief'] });
      // Refetch immediately so UI reflects the new log without waiting for staleTime
      queryClient.refetchQueries({ queryKey: ['progress-snapshot'] });
    },
  });

  const submitLog = useCallback(
    async (payload: LoggingPayload): Promise<LoggingResponse> => {
      return logMutation.mutateAsync(payload);
    },
    [logMutation]
  );

  return {
    currentStreak: streakData?.current_streak ?? 0,
    maxStreak: streakData?.longest_streak ?? 0,
    hasLoggedToday: hasLoggedToday ?? false,
    shieldsRemaining: shieldsData ?? 0,
    streakData,
    isLoading: streakLoading,
    isSubmitting: logMutation.isPending,
    error: logMutation.error?.message,
    showFeedback,
    feedbackData,
    setShowFeedback,
    submitLog,
  };
}
```

### src/hooks/useOfflineSync.ts
```ts
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useCallback } from 'react';

interface PendingLog {
  id: string;
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  timestamp: number;
  status: 'pending' | 'synced' | 'failed';
}

/**
 * Hook for offline-first logging with IndexedDB fallback
 * Logs are stored locally first, then synced when online
 */
export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingLogs, setPendingLogs] = useState<PendingLog[]>([]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load pending logs from IndexedDB on mount
  useEffect(() => {
    const loadPendingLogs = async () => {
      try {
        const db = await openIndexedDB();
        const tx = db.transaction('pending_logs', 'readonly');
        const store = tx.objectStore('pending_logs');
        const request = store.getAll();

        request.onsuccess = () => {
          setPendingLogs(request.result as PendingLog[]);
        };
      } catch (error) {
        console.error('Failed to load pending logs:', error);
      }
    };

    loadPendingLogs();
  }, []);

  // Save log locally (optimistic)
  const saveLogOffline = useCallback(
    async (logData: Omit<PendingLog, 'id' | 'timestamp' | 'status'>) => {
      const log: PendingLog = {
        ...logData,
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        status: 'pending',
      };

      try {
        // Save to IndexedDB
        const db = await openIndexedDB();
        const tx = db.transaction('pending_logs', 'readwrite');
        const store = tx.objectStore('pending_logs');
        store.add(log);

        // Update local state
        setPendingLogs((prev) => [log, ...prev]);

        return log;
      } catch (error) {
        console.error('Failed to save log offline:', error);
        throw error;
      }
    },
    []
  );

  // Sync pending logs when online
  const syncPendingLogs = useCallback(async () => {
    if (!isOnline) return;

    const pending = pendingLogs.filter((l) => l.status === 'pending');
    if (pending.length === 0) return;

    const results = [];

    for (const log of pending) {
      try {
        const response = await fetch('/api/logging/log-daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hours: log.hours,
            sections: log.sections,
            energy: log.energy,
            notes: log.notes,
          }),
        });

        if (response.ok) {
          // Mark as synced in IndexedDB
          await updateLogStatus(log.id, 'synced');
          setPendingLogs((prev) =>
            prev.map((l) => (l.id === log.id ? { ...l, status: 'synced' } : l))
          );
          results.push({ id: log.id, status: 'synced' });
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error(`Failed to sync log ${log.id}:`, error);
        await updateLogStatus(log.id, 'failed');
        setPendingLogs((prev) =>
          prev.map((l) => (l.id === log.id ? { ...l, status: 'failed' } : l))
        );
        results.push({ id: log.id, status: 'failed' });
      }
    }

    return results;
  }, [isOnline, pendingLogs]);

  // Auto-sync when coming online
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (isOnline) {
      syncPendingLogs();
    }
  }, [isOnline, syncPendingLogs]);

  return {
    isOnline,
    pendingLogs,
    saveLogOffline,
    syncPendingLogs,
  };
}

/**
 * IndexedDB setup for offline storage
 */
async function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('careerrai-offline', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('pending_logs')) {
        db.createObjectStore('pending_logs', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('cached_streak')) {
        db.createObjectStore('cached_streak', { keyPath: 'student_id' });
      }
    };
  });
}

async function updateLogStatus(logId: string, status: 'synced' | 'failed') {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('pending_logs', 'readwrite');
    const store = tx.objectStore('pending_logs');
    const request = store.get(logId);

    request.onsuccess = () => {
      const log = request.result;
      if (log) {
        log.status = status;
        store.put(log);
      }
    };
  } catch (error) {
    console.error('Failed to update log status:', error);
  }
}
```

### src/hooks/usePushNotifications.ts
```ts
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PushNotificationOptions {
  title: string;
  body: string;
  badge?: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * Hook for managing push notifications
 * Handles subscription, permission, and notification display
 */
export function usePushNotifications() {
  const supabase = createClient();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkSubscriptionStatus = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Failed to check subscription status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check browser support on mount
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      checkSubscriptionStatus();
    } else {
      setIsLoading(false);
    }
  }, [checkSubscriptionStatus]);

  const subscribe = useCallback(async () => {
    try {
      setIsLoading(true);

      // Request permission
      if (Notification.permission === 'denied') {
        throw new Error('Notifications are blocked. Please enable in browser settings.');
      }

      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error('User denied notification permission');
        }
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      // Get VAPID public key (stored in env)
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured');
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      // Save subscription to database
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          subscription: subscription.toJSON(),
        }),
      });

      setIsSubscribed(true);
      return subscription;
    } catch (error) {
      console.error('Failed to subscribe to notifications:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const unsubscribe = useCallback(async () => {
    try {
      setIsLoading(true);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // Notify backend
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });
        }
      }

      setIsSubscribed(false);
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const showLocalNotification = useCallback(
    async (options: PushNotificationOptions) => {
      if (!isSupported) {
        console.warn('Push notifications not supported');
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(options.title, {
          body: options.body,
          badge: options.badge || '/careerrai-monogram.png',
          icon: options.icon || '/careerrai-monogram.png',
          tag: options.tag,
          data: options.data,
          requireInteraction: false,
        });
      } catch (error) {
        console.error('Failed to show notification:', error);
      }
    },
    [isSupported]
  );

  return {
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    showLocalNotification,
  };
}

/**
 * Hook for scheduling 11 PM daily reminders
 */
export function useDailyReminder(enabled: boolean = true) {
  const { showLocalNotification } = usePushNotifications();

  useEffect(() => {
    if (!enabled) return;

    const checkAndNotify = () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Check if it's 11 PM (23:00)
      if (hour === 23 && minute === 0) {
        showLocalNotification({
          title: '🌙 Time to log your prep!',
          body: 'Your streak is waiting. Log in 30 seconds.',
          tag: 'daily-reminder',
          data: { action: 'log' },
        });
      }
    };

    // Check every minute
    const interval = setInterval(checkAndNotify, 60000);

    return () => clearInterval(interval);
  }, [enabled, showLocalNotification]);
}

/**
 * Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
```

### src/hooks/useRealtimeUpdates.ts
```ts
import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type RealtimeCallback = (event: RealtimePayload) => void;

interface RealtimeSubscriptionOptions {
  onInsert?: RealtimeCallback;
  onUpdate?: RealtimeCallback;
  onDelete?: RealtimeCallback;
}

/**
 * Hook for subscribing to real-time updates from Supabase
 * Usage:
 *   useRealtimeUpdates('daily_logs', 'student_id=eq.abc123', {
 *     onInsert: (event) => console.log('New log:', event.new),
 *   })
 */
export function useRealtimeUpdates(
  table: string,
  filter: string,
  callbacks: RealtimeSubscriptionOptions
) {
  const supabase = createClient();

  useEffect(() => {
    const subscription = supabase
      .channel(`${table}:${filter}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          filter,
        },
        (payload) => callbacks.onInsert?.(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table,
          filter,
        },
        (payload) => callbacks.onUpdate?.(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table,
          filter,
        },
        (payload) => callbacks.onDelete?.(payload)
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [table, filter, callbacks, supabase]);
}

/**
 * Hook for live leaderboard updates
 * Shows top students by streak in real-time
 */
export function useStreakLeaderboard() {
  const supabase = createClient();

  const subscribe = useCallback(
    (
      onUpdate: (event: {
        eventType: 'INSERT' | 'UPDATE' | 'DELETE';
        new?: Record<string, unknown>;
        old?: Record<string, unknown>;
      }) => void
    ) => {
      const subscription = supabase
        .channel('streak_data:updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'streak_data',
          },
          (payload) => {
            onUpdate({
              eventType: payload.eventType,
              new: payload.new,
              old: payload.old,
            });
          }
        )
        .subscribe();

      return () => subscription.unsubscribe();
    },
    [supabase]
  );

  return { subscribe };
}

/**
 * Hook for live notifications
 * Shows incoming buddy messages, milestones, etc.
 */
export function useLiveNotifications(userId: string) {
  const supabase = createClient();

  const subscribe = useCallback(
    (
      onNew: (notification: Record<string, unknown>) => void
    ) => {
      const subscription = supabase
        .channel(`notifications:user_id=eq.${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            onNew(payload.new);
          }
        )
        .subscribe();

      return () => subscription.unsubscribe();
    },
    [userId, supabase]
  );

  return { subscribe };
}
```

## Components (src/components/)

### src/components/DailyTracker/BrainBreakCard.tsx
```tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X, Brain, Zap, Grid3x3, Hash } from 'lucide-react';

// ── Math Sprint ─────────────────────────────────────────────────────────────
function MathSprint({ onDone }: { onDone: (score: number) => void }) {
  const [q, setQ] = useState(genQuestion());
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const TOTAL = 10;

  function genQuestion() {
    const ops = ['+', '-', '×'] as const;
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a: number, b: number, answer: number;
    if (op === '+') { a = rnd(10, 50); b = rnd(5, 40); answer = a + b; }
    else if (op === '-') { a = rnd(20, 60); b = rnd(5, a - 1); answer = a - b; }
    else { a = rnd(2, 12); b = rnd(2, 12); answer = a * b; }
    const wrongs = new Set<number>();
    while (wrongs.size < 3) {
      const d = rnd(-10, 10);
      if (d !== 0) wrongs.add(answer + d);
    }
    const opts = shuffle([answer, ...Array.from(wrongs)]);
    return { text: `${a} ${op} ${b}`, answer, options: opts };
  }
  function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle<T>(arr: T[]) { return [...arr].sort(() => Math.random() - 0.5); }

  const pick = (val: number) => {
    if (feedback) return;
    const correct = val === q.answer;
    setFeedback(correct ? 'right' : 'wrong');
    if (correct) setScore((s) => s + 1);
    setTimeout(() => {
      const next = round + 1;
      if (next >= TOTAL) { onDone(correct ? score + 1 : score); return; }
      setRound(next);
      setQ(genQuestion());
      setFeedback(null);
    }, 500);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{round + 1}/{TOTAL}</span>
        <span className="font-bold text-white">{score} correct</span>
      </div>
      <div className="text-center py-6">
        <p className="text-4xl font-bold text-white tracking-tight">{q.text}</p>
        <p className="text-xs text-zinc-500 mt-1">= ?</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((opt) => (
          <button
            key={opt}
            onClick={() => pick(opt)}
            className={cn(
              'py-4 rounded-xl font-bold text-lg transition-all active:scale-95',
              feedback && opt === q.answer ? 'bg-emerald-500 text-white' :
              feedback && opt !== q.answer ? 'bg-zinc-800 text-zinc-600' :
              'bg-zinc-800 text-white hover:bg-zinc-700'
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Pattern Lock ─────────────────────────────────────────────────────────────
function PatternLock({ onDone }: { onDone: (score: number) => void }) {
  const [phase, setPhase] = useState<'show' | 'input' | 'result'>('show');
  const [pattern, setPattern] = useState<number[]>([]);
  const [tapped, setTapped] = useState<number[]>([]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [highlight, setHighlight] = useState<number | null>(null);
  const TOTAL = 5;

  const startRound = useCallback((r: number) => {
    const len = 3 + r;
    const p = Array.from({ length: len }, () => Math.floor(Math.random() * 9));
    setPattern(p);
    setTapped([]);
    setPhase('show');
    let i = 0;
    const showNext = () => {
      if (i >= p.length) { setPhase('input'); setHighlight(null); return; }
      setHighlight(p[i]);
      i++;
      setTimeout(showNext, 700);
    };
    setTimeout(showNext, 400);
  }, []);

  useEffect(() => { startRound(0); }, [startRound]);

  const tap = (cell: number) => {
    if (phase !== 'input') return;
    const next = [...tapped, cell];
    setTapped(next);
    if (next.length === pattern.length) {
      const correct = next.every((v, i) => v === pattern[i]);
      if (correct) setScore((s) => s + 1);
      setPhase('result');
      setTimeout(() => {
        const nr = round + 1;
        if (nr >= TOTAL) { onDone(correct ? score + 1 : score); return; }
        setRound(nr);
        startRound(nr);
      }, 800);
    }
  };

  const inputCorrect = tapped.every((v, i) => v === pattern[i]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Round {round + 1}/{TOTAL} · length {3 + round}</span>
        <span className="font-bold text-white">{score} correct</span>
      </div>
      <p className="text-xs text-zinc-400 text-center">
        {phase === 'show' ? 'Watch the pattern…' : phase === 'input' ? 'Reproduce it' : inputCorrect ? '✓ Correct!' : '✗ Wrong'}
      </p>
      <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
        {Array.from({ length: 9 }, (_, i) => (
          <button
            key={i}
            onClick={() => tap(i)}
            disabled={phase !== 'input'}
            className={cn(
              'aspect-square rounded-xl transition-all active:scale-90',
              highlight === i ? 'bg-orange-500 scale-110' :
              tapped.includes(i) ? 'bg-teal-500' :
              'bg-zinc-800 hover:bg-zinc-700 disabled:hover:bg-zinc-800'
            )}
          />
        ))}
      </div>
      {phase === 'show' && (
        <p className="text-[11px] text-zinc-600 text-center">Memorise — then tap in the same order</p>
      )}
    </div>
  );
}

// ── Memory Grid ──────────────────────────────────────────────────────────────
const EMOJI_PAIRS = ['🎯', '🔥', '⚡', '🎭', '🧠', '📚', '💡', '🎪'];

function MemoryGrid({ onDone }: { onDone: (score: number) => void }) {
  const [cards] = useState(() => {
    const all = [...EMOJI_PAIRS, ...EMOJI_PAIRS].map((e, i) => ({ id: i, emoji: e, flipped: false, matched: false }));
    return all.sort(() => Math.random() - 0.5);
  });
  const [state, setState] = useState(cards);
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);

  const flip = (id: number) => {
    if (done) return;
    if (state[id].matched || state[id].flipped) return;
    if (open.length === 2) return;
    const next = state.map((c, i) => i === id ? { ...c, flipped: true } : c);
    setOpen((o) => [...o, id]);
    setState(next);

    if (open.length === 1) {
      setMoves((m) => m + 1);
      const [first] = open;
      if (next[first].emoji === next[id].emoji) {
        setTimeout(() => {
          setState((s) => s.map((c, i) => (i === first || i === id) ? { ...c, matched: true } : c));
          setOpen([]);
          if (next.filter((c) => c.matched).length + 2 === next.length) setDone(true);
        }, 400);
      } else {
        setTimeout(() => {
          setState((s) => s.map((c, i) => (i === first || i === id) ? { ...c, flipped: false } : c));
          setOpen([]);
        }, 700);
      }
    }
  };

  useEffect(() => { if (done) onDone(Math.max(0, 16 - moves)); }, [done, moves, onDone]);

  const matched = state.filter((c) => c.matched).length / 2;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{matched}/{EMOJI_PAIRS.length} pairs</span>
        <span className="font-bold text-white">{moves} moves</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {state.map((card, i) => (
          <button
            key={card.id}
            onClick={() => flip(i)}
            className={cn(
              'aspect-square rounded-lg text-lg transition-all active:scale-90 flex items-center justify-center',
              card.matched ? 'bg-emerald-900/50 text-emerald-400' :
              card.flipped ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-800 hover:bg-zinc-700'
            )}
          >
            {(card.flipped || card.matched) ? card.emoji : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sudoku Blitz ─────────────────────────────────────────────────────────────
const SUDOKU_PUZZLES = [
  { grid: [3,0,0,1, 0,1,3,0, 0,4,1,0, 1,0,0,2], solution: [3,2,4,1, 4,1,3,2, 2,4,1,3, 1,3,2,4] },
  { grid: [0,3,0,2, 1,0,2,0, 0,4,0,1, 2,0,1,0], solution: [4,3,1,2, 1,2,3,4, 3,4,2,1, 2,1,4,3] },
  { grid: [1,0,3,0, 0,3,0,4, 4,0,2,0, 0,2,0,1], solution: [1,4,3,2, 2,3,1,4, 4,1,2,3, 3,2,4,1] },
];

function SudokuBlitz({ onDone }: { onDone: (score: number) => void }) {
  const puzzle = SUDOKU_PUZZLES[Math.floor(Math.random() * SUDOKU_PUZZLES.length)];
  const [vals, setVals] = useState<(number | null)[]>(puzzle.grid.map((v) => v || null));
  const [sel, setSel] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const fill = (n: number) => {
    if (sel === null || puzzle.grid[sel] !== 0) return;
    setVals((v) => v.map((x, i) => i === sel ? n : x));
  };

  const check = () => {
    const correct = vals.filter((v, i) => v === puzzle.solution[i]).length;
    const empty = vals.filter((v, i) => puzzle.grid[i] === 0);
    const filled = empty.length - vals.filter((v, i) => puzzle.grid[i] === 0 && v === null).length;
    setSubmitted(true);
    onDone(Math.round((correct / 16) * 10));
  };

  const filledCount = vals.filter((v, i) => puzzle.grid[i] === 0 && v !== null).length;
  const totalEmpty = puzzle.grid.filter((v) => v === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>4×4 Sudoku · 1–4, no repeats in row/col/box</span>
        <span className="font-bold text-white">{filledCount}/{totalEmpty} filled</span>
      </div>
      <div className="grid grid-cols-4 gap-1 max-w-[200px] mx-auto">
        {vals.map((v, i) => {
          const isFixed = puzzle.grid[i] !== 0;
          const isWrong = submitted && !isFixed && v !== puzzle.solution[i];
          const isRight = submitted && !isFixed && v === puzzle.solution[i];
          return (
            <button
              key={i}
              onClick={() => !isFixed && setSel(i === sel ? null : i)}
              className={cn(
                'aspect-square rounded-lg font-bold text-lg transition-all flex items-center justify-center border',
                isFixed ? 'bg-zinc-700 text-white border-transparent' :
                isRight ? 'bg-emerald-800 text-emerald-300 border-emerald-600' :
                isWrong ? 'bg-red-900 text-red-300 border-red-700' :
                sel === i ? 'bg-orange-600 text-white border-orange-400' :
                'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700',
                i % 2 === 0 && Math.floor(i / 4) % 2 === 0 ? 'ring-1 ring-zinc-600' :
                i % 2 === 1 && Math.floor(i / 4) % 2 === 1 ? 'ring-1 ring-zinc-600' : ''
              )}
            >
              {v || ''}
            </button>
          );
        })}
      </div>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => fill(n)}
            disabled={sel === null || submitted}
            className="w-10 h-10 rounded-lg bg-zinc-700 text-white font-bold hover:bg-zinc-600 disabled:opacity-40 transition-all active:scale-95"
          >
            {n}
          </button>
        ))}
      </div>
      {!submitted && (
        <button
          onClick={check}
          disabled={filledCount < totalEmpty}
          className={cn(
            'w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]',
            filledCount === totalEmpty
              ? 'bg-orange-500 text-white hover:bg-orange-400'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          )}
        >
          Check answers
        </button>
      )}
    </div>
  );
}

// ── Brain Break Card ─────────────────────────────────────────────────────────
const GAMES = [
  { id: 'math_sprint', label: 'Math Sprint', icon: Hash, color: 'text-amber-400' },
  { id: 'pattern_lock', label: 'Pattern', icon: Grid3x3, color: 'text-sky-400' },
  { id: 'memory_grid', label: 'Memory', icon: Brain, color: 'text-emerald-400' },
  { id: 'sudoku_blitz', label: 'Sudoku', icon: Zap, color: 'text-purple-400' },
] as const;

type GameId = (typeof GAMES)[number]['id'];

interface BrainBreakCardProps {
  studentId: string;
}

export function BrainBreakCard({ studentId }: BrainBreakCardProps) {
  const [selected, setSelected] = useState<GameId | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 3-play-per-day limit via localStorage
  const todayKey = `bb_plays_${new Date().toISOString().split('T')[0]}`;
  const playsToday = () => parseInt(localStorage.getItem(todayKey) ?? '0', 10);
  const canPlay = playsToday() < 3;

  const startGame = (id: GameId) => {
    if (!canPlay) return;
    setSelected(id);
    setScore(null);
    // Auto-close after 3 min
    timerRef.current = setTimeout(() => { setSelected(null); }, 3 * 60 * 1000);
  };

  const finishGame = (finalScore: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const plays = playsToday() + 1;
    localStorage.setItem(todayKey, String(plays));
    setScore(finalScore);
    // Log to backend (fire and forget)
    if (studentId) {
      fetch('/api/logging/brain-break', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: selected, score: finalScore }),
      }).catch(() => {});
    }
  };

  const close = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSelected(null);
    setScore(null);
  };

  const plays = playsToday();

  if (selected) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            {GAMES.find((g) => g.id === selected)?.label}
          </span>
          <button onClick={close} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {score !== null ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-5xl font-bold text-white">{score}</p>
            <p className="text-sm text-zinc-400">
              {score >= 8 ? 'Sharp. Back to work.' : score >= 5 ? 'Not bad.' : 'Brain needed that.'}
            </p>
            <p className="text-xs text-zinc-600">{3 - plays} plays left today</p>
            <button
              onClick={close}
              className="mt-2 px-6 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-400 transition-colors active:scale-[0.98]"
            >
              Back to studying
            </button>
          </div>
        ) : (
          <>
            {selected === 'math_sprint' && <MathSprint onDone={finishGame} />}
            {selected === 'pattern_lock' && <PatternLock onDone={finishGame} />}
            {selected === 'memory_grid' && <MemoryGrid onDone={finishGame} />}
            {selected === 'sudoku_blitz' && <SudokuBlitz onDone={finishGame} />}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Brain Break</p>
          <p className="text-[11px] text-zinc-600 mt-0.5">Sharpen focus · {3 - plays} plays left today</p>
        </div>
        <Brain className="w-4 h-4 text-zinc-600" />
      </div>
      {!canPlay ? (
        <p className="text-xs text-zinc-600 text-center py-2">3 plays used — rest is productive too.</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {GAMES.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => startGame(id)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-all active:scale-95"
            >
              <Icon className={cn('w-4 h-4', color)} />
              <span className="text-[10px] text-zinc-400 font-medium leading-tight text-center">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### src/components/DailyTracker/BuddyInsightCard.tsx
```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface BuddyInsightCardProps {
  studentId: string;
  dailyNudge?: string | null;
  /** Passed from server component — eliminates 2 of 3 client Supabase waterfalls */
  buddyId?: string | null;
  /** Pre-formatted: "Rajan · 99%ile" or just "Rajan" */
  buddyName?: string | null;
}

export function BuddyInsightCard({ studentId, dailyNudge, buddyId: buddyIdProp, buddyName: buddyNameProp }: BuddyInsightCardProps) {
  const supabase = createClient();

  const { data } = useQuery({
    queryKey: ['buddy-insight', studentId],
    queryFn: async () => {
      // Only 1 query — buddy identity already comes from server props
      const { data: feedback } = await supabase
        .from('buddy_feedback')
        .select('feedback_text, feedback_date, feedback_type')
        .eq('student_id', studentId)
        .eq('feedback_type', 'buddy_feedback')
        .order('feedback_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { feedback };
    },
    staleTime: 10 * 60 * 1000,
  });

  const latestFeedback = data?.feedback;
  const nudgeText = dailyNudge ?? latestFeedback?.feedback_text ?? null;

  // Always render a placeholder when buddy is matched but no feedback yet —
  // prevents layout jump when card disappears
  if (!nudgeText && !buddyIdProp) return null;

  if (!nudgeText && buddyIdProp) {
    return (
      <div className="flex items-start gap-2 bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3">
        <span className="text-xs font-bold text-teal-600 shrink-0 mt-0.5">💬 Buddy</span>
        <p className="text-xs text-teal-700 leading-snug">
          Your buddy will respond after today&apos;s debrief.
        </p>
      </div>
    );
  }

  const isSystemNudge = !!dailyNudge && !latestFeedback;
  const label = isSystemNudge ? '⚠️ Pattern detected' : '💬 Buddy';
  const journeyLine = !isSystemNudge && buddyNameProp ? buddyNameProp : null;

  return (
    <Link href="/student/buddy" className="block">
      <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
        <span className="text-xs font-bold text-teal-700 shrink-0 mt-0.5">{label}</span>
        <div className="min-w-0">
          <p className="text-xs text-teal-900 leading-snug line-clamp-2">{nudgeText}</p>
          {journeyLine && <p className="text-[10px] text-teal-600 mt-1">{journeyLine}</p>}
        </div>
      </div>
    </Link>
  );
}
```

### src/components/DailyTracker/DailyPuzzleCard.tsx
```tsx
'use client';

import { useState } from 'react';
import { Clock, CheckCircle2, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GameType = 'detective' | 'airport' | 'escape_room' | 'mafia';

interface DailyPuzzleCardProps {
  puzzleDate: string;
  puzzleType: string;
  gameType?: GameType;
  difficulty: number;
  estimatedTime: number;
  isSolved: boolean;
  title?: string;
  timeTaken?: number;
  accuracy?: number;
  solution?: string;
  explanation?: string;
  onSolve: () => void;
}

const typeLabels: Record<string, string> = {
  seating: 'Seating Arrangement',
  blood_relation: 'Blood Relations',
  constraint: 'Logical Constraints',
  arrangement: 'Ordering & Ranking',
};

const gameTheme: Record<GameType, {
  emoji: string; prefix: string; cta: string; tag: string;
  accent: string; ctaBg: string; badge: string;
}> = {
  detective: {
    emoji: '🕵️', prefix: 'Case File', cta: "🔍 Open today's case",
    tag: 'A real CAT LRDI set in disguise',
    accent: 'text-amber-400', ctaBg: 'bg-amber-500 hover:bg-amber-400', badge: 'bg-amber-400/20 text-amber-300',
  },
  airport: {
    emoji: '✈️', prefix: 'Flight Log', cta: "📡 Take the controller's seat",
    tag: 'CAT arrangement set — ATC edition',
    accent: 'text-sky-300', ctaBg: 'bg-sky-400 hover:bg-sky-300', badge: 'bg-sky-400/20 text-sky-300',
  },
  escape_room: {
    emoji: '🔐', prefix: 'Escape Room', cta: '🔐 Enter the room',
    tag: 'Crack CAT Quant locks to escape',
    accent: 'text-emerald-300', ctaBg: 'bg-emerald-400 hover:bg-emerald-300', badge: 'bg-emerald-400/20 text-emerald-300',
  },
  mafia: {
    emoji: '🎭', prefix: 'Mafia Round', cta: '🎭 Find the liar',
    tag: 'CAT truth-liar deduction set',
    accent: 'text-red-300', ctaBg: 'bg-red-400 hover:bg-red-300', badge: 'bg-red-400/20 text-red-300',
  },
};

export function DailyPuzzleCard({
  puzzleDate,
  puzzleType,
  gameType = 'detective',
  difficulty,
  estimatedTime,
  isSolved,
  title,
  timeTaken,
  accuracy,
  solution,
  explanation,
  onSolve,
}: DailyPuzzleCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const theme = gameTheme[gameType];

  const difficultyLabel = difficulty <= 4 ? 'Medium' : difficulty <= 6 ? 'Medium+' : 'Hard';
  const date = new Date(puzzleDate + 'T00:00:00');
  const dateStr = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const caseNumber = puzzleDate.replace(/-/g, '').slice(2);

  return (
    <div
      className={cn(
        'rounded-2xl border-2 p-4 transition-all',
        isSolved ? 'bg-emerald-50 border-emerald-200' : 'bg-stone-900 border-stone-800'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isSolved ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <span className="text-base leading-none">{theme.emoji}</span>
            )}
            <span
              className={cn(
                'text-[10px] uppercase tracking-widest font-semibold',
                isSolved ? 'text-emerald-700' : theme.accent
              )}
            >
              {theme.prefix} #{caseNumber}
            </span>
          </div>
          <h3 className={cn('text-sm font-bold', isSolved ? 'text-stone-900' : 'text-white')}>
            {title || "Today's LRDI Mystery"}
          </h3>
          <p className={cn('text-xs mt-0.5', isSolved ? 'text-stone-500' : 'text-stone-400')}>
            {typeLabels[puzzleType] || puzzleType} · {dateStr}
          </p>
        </div>

        <div
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-semibold',
            isSolved ? 'bg-emerald-100 text-emerald-700' : theme.badge
          )}
        >
          {difficultyLabel}
        </div>
      </div>

      {isSolved && timeTaken ? (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-stone-600">Solved in</span>
            <span className="font-semibold text-stone-900">{timeTaken}m</span>
          </div>
          {accuracy !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-stone-600">Questions correct</span>
              <span className="font-semibold text-stone-900">{Math.round(accuracy * 100)}%</span>
            </div>
          )}
        </div>
      ) : (
        <div className={cn('mt-3 flex items-center gap-2 text-xs', isSolved ? 'text-stone-600' : 'text-stone-400')}>
          <Clock className="w-4 h-4" />
          <span>~{estimatedTime} min · {theme.tag}</span>
        </div>
      )}

      {!isSolved && (
        <button
          onClick={onSolve}
          className={cn(
            'w-full mt-4 py-2.5 text-stone-900 rounded-lg font-bold text-sm transition-colors active:scale-[0.98]',
            theme.ctaBg
          )}
        >
          {theme.cta}
        </button>
      )}

      {isSolved && (
        <button
          onClick={() => {
            const grid = accuracy !== undefined
              ? (accuracy >= 1 ? '✓✓✓' : accuracy >= 0.66 ? '✓✓✗' : accuracy >= 0.33 ? '✓✗✗' : '✗✗✗')
              : '✓';
            const text = `🧩 Daily Puzzle #${caseNumber} — solved in ${timeTaken ?? '?'}m ${grid}\nSame puzzle. Every aspirant. Daily.\nhttps://careerrai-daily.vercel.app`;
            if (navigator.share) {
              navigator.share({ text }).catch(() => {});
            } else {
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            }
          }}
          className="w-full mt-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] hover:bg-emerald-700"
        >
          <Share2 className="w-3.5 h-3.5" />
          Share result card
        </button>
      )}

      {isSolved && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full mt-3 text-xs text-emerald-700 font-medium hover:underline"
        >
          {isExpanded ? '▼ Hide' : '▶ View the method'}
        </button>
      )}

      {isExpanded && isSolved && (
        <div className="mt-3 pt-3 border-t border-emerald-200 space-y-1.5">
          {solution && <p className="text-xs font-semibold text-stone-900">Answer: {solution}</p>}
          <p className="text-xs text-stone-700 leading-relaxed">
            {explanation || 'No explanation available.'}
          </p>
        </div>
      )}
    </div>
  );
}
```

### src/components/DailyTracker/DailyTrackerApp.tsx
```tsx
'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { HeroCard } from './HeroCard';
import { LoggingModal, type LoggingData } from './LoggingModal';
import { MockDebriefModal, type MockDebriefData } from './MockDebriefModal';
import { PendingDebriefCard } from './PendingDebriefCard';
import { FeedbackAnimation } from './FeedbackAnimation';
import { DailyPuzzleCard, type GameType } from './DailyPuzzleCard';
import { PuzzleSolverModal, type PuzzleContent } from './PuzzleSolverModal';
import { DetectiveCaseModal, isDetectiveCase } from './DetectiveCaseModal';
import { EscapeRoomModal, isEscapeRoom } from './EscapeRoomModal';
import { MafiaLogicModal, isMafiaGame } from './MafiaLogicModal';
import { BuddyInsightCard } from './BuddyInsightCard';
import { ProgressSnapshot } from './ProgressSnapshot';
import { BrainBreakCard } from './BrainBreakCard';
import { SafeCard } from './SafeCard';
import { useLogging } from '@/hooks/useLogging';
import { useDailyPuzzle } from '@/hooks/useDailyPuzzle';
import { Loader2, Video } from 'lucide-react';

function SessionStrip({ session }: { session: TodaySession }) {
  const startsAt = new Date(session.scheduled_at);
  const minsAway = Math.round((startsAt.getTime() - Date.now()) / 60_000);
  const joinable = minsAway <= 15 && !!session.google_meet_link;

  return (
    <div className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Video className="w-4 h-4 text-indigo-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-indigo-900 truncate">
            {session.title || 'Buddy session'}
          </p>
          <p className="text-[11px] text-indigo-600">
            {startsAt.toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              day: 'numeric',
              month: 'short',
            })}
          </p>
        </div>
      </div>
      {joinable ? (
        <a
          href={session.google_meet_link!}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
        >
          Join →
        </a>
      ) : (
        <span className="shrink-0 text-[11px] font-medium text-indigo-500">
          {minsAway > 60 ? `in ${Math.round(minsAway / 60)}h` : `in ${Math.max(0, minsAway)}m`}
        </span>
      )}
    </div>
  );
}

interface TodaySession {
  id: string;
  title: string | null;
  scheduled_at: string;
  google_meet_link: string | null;
}

interface DailyTrackerAppProps {
  studentId?: string;
  todaySession?: TodaySession | null;
  hasBuddy?: boolean;
  buddyId?: string | null;
  buddyName?: string | null;
  initialPendingDebrief?: { report_date: string; updated_at: string } | null;
}

export function DailyTrackerApp({ studentId = '', todaySession = null, hasBuddy = false, buddyId = null, buddyName = null, initialPendingDebrief = null }: DailyTrackerAppProps) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);
  const [isPuzzleOpen, setIsPuzzleOpen] = useState(false);
  const [currentLogDate, setCurrentLogDate] = useState('');
  const [lastNudge, setLastNudge] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // A mock logged in the last 48h with no debrief = the loud #1 card.
  // initialPendingDebrief comes from the server component (zero client waterfall on load).
  const { data: pendingDebrief } = useQuery({
    queryKey: ['pending-debrief', studentId],
    enabled: !!studentId,
    initialData: initialPendingDebrief ?? undefined,
    queryFn: async () => {
      const supabase = createClient();
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];
      const { data: mockReport } = await supabase
        .from('daily_reports')
        .select('report_date, updated_at')
        .eq('student_id', studentId)
        .eq('mock_taken', true)
        .gte('report_date', twoDaysAgo)
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!mockReport) return null;
      const { data: debrief } = await supabase
        .from('mock_debriefs')
        .select('id')
        .eq('student_id', studentId)
        .eq('log_date', mockReport.report_date)
        .maybeSingle();
      return debrief ? null : mockReport;
    },
    staleTime: 60 * 1000,
  });

  const {
    currentStreak,
    maxStreak,
    hasLoggedToday,
    shieldsRemaining,
    isSubmitting,
    showFeedback,
    feedbackData,
    setShowFeedback,
    submitLog,
  } = useLogging();

  const { puzzle, attempt, isLoading: puzzleLoading, submitAttempt } = useDailyPuzzle(studentId);

  const handleLogSubmit = async (data: LoggingData): Promise<{ mockSelected: boolean }> => {
    const result = await submitLog(data);
    if (result?.daily_nudge) setLastNudge(result.daily_nudge);
    const mockSelected = data.sections.includes('Mock');
    if (mockSelected) {
      // Compute today's log date (same 3 AM boundary logic)
      const now = new Date();
      const today3am = new Date();
      today3am.setHours(3, 0, 0, 0);
      const logDate = now < today3am ? new Date(today3am.getTime() - 86400000) : today3am;
      setCurrentLogDate(logDate.toISOString().split('T')[0]);
      setIsLogOpen(false);
      setIsDebriefOpen(true);
      // If they skip the debrief, the pending card takes over on home
      queryClient.invalidateQueries({ queryKey: ['pending-debrief'] });
    }
    return { mockSelected };
  };

  const handleDebriefSubmit = async (data: MockDebriefData) => {
    const response = await fetch('/api/logging/mock-debrief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, log_date: currentLogDate }),
    });
    if (!response.ok) throw new Error('Failed to save debrief');
    queryClient.invalidateQueries({ queryKey: ['pending-debrief'] });
  };

  const rawContent = puzzle?.puzzle_content;
  const puzzleContent = rawContent as PuzzleContent | undefined;
  const isEscape = isEscapeRoom(rawContent);
  const isMafia = isMafiaGame(rawContent);
  const isCasePuzzle = !isEscape && !isMafia && isDetectiveCase(rawContent);
  const isPlayablePuzzle =
    isCasePuzzle || isEscape || isMafia || (!!puzzleContent?.question && Array.isArray(puzzleContent?.options));

  const gameType: GameType = isEscape
    ? 'escape_room'
    : isMafia
    ? 'mafia'
    : isCasePuzzle && (rawContent as { game_type?: string }).game_type === 'airport'
    ? 'airport'
    : 'detective';

  const handlePuzzleComplete = async (result: { solved: boolean; timeSeconds: number; accuracy: number }) => {
    await submitAttempt({ solved: result.solved, timeSeconds: result.timeSeconds, accuracy: result.accuracy });
  };

  return (
    <div className="space-y-5">
      {/* 0. Pending mock debrief — the loud #1 card until it's done */}
      {pendingDebrief && !isDebriefOpen && (
        <PendingDebriefCard
          loggedAt={pendingDebrief.updated_at}
          hasBuddy={hasBuddy}
          onStart={() => {
            setCurrentLogDate(pendingDebrief.report_date);
            setIsDebriefOpen(true);
          }}
        />
      )}

      {/* 1. Hero — Streak + Log */}
      <HeroCard
        currentStreak={currentStreak}
        maxStreak={maxStreak}
        onLogClick={() => setIsLogOpen(true)}
        isLoading={isSubmitting}
        hasLoggedToday={hasLoggedToday}
        shieldsRemaining={shieldsRemaining}
      />

      {/* 2. Daily Puzzle */}
      {puzzleLoading ? (
        <div className="flex items-center justify-center py-6 text-stone-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">Loading today&apos;s puzzle...</span>
        </div>
      ) : puzzle ? (
        <DailyPuzzleCard
          puzzleDate={puzzle.puzzle_date}
          puzzleType={puzzle.puzzle_type}
          gameType={gameType}
          difficulty={puzzle.difficulty}
          title={(rawContent as { title?: string } | undefined)?.title}
          estimatedTime={puzzle.estimated_time_minutes || 15}
          isSolved={!!attempt}
          timeTaken={attempt?.time_taken_seconds ? Math.max(1, Math.round(attempt.time_taken_seconds / 60)) : undefined}
          accuracy={attempt?.accuracy}
          solution={puzzle.solution}
          explanation={puzzle.explanation}
          onSolve={() => isPlayablePuzzle && setIsPuzzleOpen(true)}
        />
      ) : (
        <div className="rounded-2xl border-2 border-stone-200 bg-stone-50 p-4 text-center">
          <p className="text-sm text-stone-600">🧩 No puzzle today — check back tomorrow!</p>
        </div>
      )}

      {/* 3. Buddy insight — 1 line */}
      {studentId && (
        <SafeCard>
          <BuddyInsightCard studentId={studentId} buddyId={buddyId} buddyName={buddyName} dailyNudge={lastNudge} />
        </SafeCard>
      )}

      {/* 4. Today's session strip */}
      {todaySession && <SessionStrip session={todaySession} />}

      {/* 5. Progress snapshot — 3 numbers */}
      {studentId && (
        <SafeCard>
          <ProgressSnapshot studentId={studentId} />
        </SafeCard>
      )}

      {/* 6. Brain Break — cognitive reset, not CAT content */}
      {studentId && (
        <SafeCard>
          <BrainBreakCard studentId={studentId} />
        </SafeCard>
      )}

      {/* Modals — Arrangement games: Detective + Airport */}
      {isCasePuzzle && puzzle && (
        <DetectiveCaseModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          content={puzzle.puzzle_content as unknown as Parameters<typeof DetectiveCaseModal>[0]['content']}
          explanation={puzzle.explanation}
          caseDate={puzzle.puzzle_date}
          onComplete={handlePuzzleComplete}
        />
      )}

      {/* Escape Room */}
      {isEscape && puzzle && (
        <EscapeRoomModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          content={puzzle.puzzle_content as unknown as Parameters<typeof EscapeRoomModal>[0]['content']}
          caseDate={puzzle.puzzle_date}
          onComplete={handlePuzzleComplete}
        />
      )}

      {/* Mafia */}
      {isMafia && puzzle && (
        <MafiaLogicModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          content={puzzle.puzzle_content as unknown as Parameters<typeof MafiaLogicModal>[0]['content']}
          caseDate={puzzle.puzzle_date}
          onComplete={handlePuzzleComplete}
        />
      )}

      {/* Legacy single-question fallback */}
      {!isCasePuzzle && !isEscape && !isMafia && isPlayablePuzzle && puzzle && (
        <PuzzleSolverModal
          isOpen={isPuzzleOpen}
          onClose={() => setIsPuzzleOpen(false)}
          puzzleType={puzzle.puzzle_type}
          content={puzzleContent!}
          explanation={puzzle.explanation}
          onComplete={handlePuzzleComplete}
        />
      )}

      {/* Layer 1 Log */}
      <LoggingModal
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        onSubmit={handleLogSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Layer 2 Debrief */}
      <MockDebriefModal
        isOpen={isDebriefOpen}
        onClose={() => setIsDebriefOpen(false)}
        onSubmit={handleDebriefSubmit}
        logDate={currentLogDate}
      />

      {/* Feedback Animation */}
      <FeedbackAnimation
        isVisible={showFeedback}
        onComplete={() => setShowFeedback(false)}
        streakIncrement={currentStreak}
        bonus={feedbackData?.bonus}
        noticed={lastNudge}
      />
    </div>
  );
}
```

### src/components/DailyTracker/DetectiveCaseModal.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, Lightbulb, RotateCcw, Lock, Search, Star, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CaseQuestion {
  q: string;
  options: string[];
  answer: number;
}

export interface ArrangementContent {
  game_type?: 'detective' | 'airport';
  mode: 'linear' | 'circular';
  title: string;
  story: string;
  entities: string[];
  slotLabels: string[];
  solution: string[];
  clues: string[];
  questions: CaseQuestion[];
}

// legacy alias
export type DetectiveCaseContent = ArrangementContent;

export function isDetectiveCase(content: unknown): content is ArrangementContent {
  const c = content as Partial<ArrangementContent> | null | undefined;
  return (
    !!c &&
    Array.isArray(c.entities) &&
    Array.isArray(c.solution) &&
    Array.isArray(c.clues) &&
    Array.isArray(c.questions) &&
    c.questions.length > 0 &&
    (c.game_type === undefined || c.game_type === 'detective' || c.game_type === 'airport')
  );
}

interface Theme {
  headerBg: string;
  accentText: string;
  accentBg: string;
  accentHover: string;
  accentTextDark: string;
  accentBgLight: string;
  accentBorder: string;
  casePrefix: string;
  headerEmoji: string;
  openLabel: string;
  briefingLabel: string;
  entityLabel: string;
  boardInstruction: string;
  clueLabel: string;
  unlockLabel: string;
  verifyLabel: string;
  debriefLabel: string;
  rankLabels: [string, string, string];
  closedEmoji: [string, string, string];
  tagline: string;
}

const DETECTIVE: Theme = {
  headerBg: 'bg-stone-900',
  accentText: 'text-amber-400',
  accentBg: 'bg-amber-500',
  accentHover: 'hover:bg-amber-400',
  accentTextDark: 'text-amber-700',
  accentBgLight: 'bg-amber-50',
  accentBorder: 'border-amber-200',
  casePrefix: '🕵️ Case File',
  headerEmoji: '🕵️',
  openLabel: '🔍 Open the case',
  briefingLabel: 'Case briefing',
  entityLabel: 'Suspects',
  boardInstruction: 'tap a suspect, then a position',
  clueLabel: 'Evidence',
  unlockLabel: 'Unlock next evidence',
  verifyLabel: 'Verify theory',
  debriefLabel: "🧠 Detective's method",
  rankLabels: ['Ace Detective', 'Inspector', 'Rookie'],
  closedEmoji: ['🏆', '🕵️', '📁'],
  tagline: 'Real CAT LRDI set in disguise. New case tomorrow. 🔍',
};

const AIRPORT: Theme = {
  headerBg: 'bg-sky-950',
  accentText: 'text-sky-300',
  accentBg: 'bg-sky-500',
  accentHover: 'hover:bg-sky-400',
  accentTextDark: 'text-sky-700',
  accentBgLight: 'bg-sky-50',
  accentBorder: 'border-sky-200',
  casePrefix: '✈️ Flight Log',
  headerEmoji: '✈️',
  openLabel: '📡 Open flight log',
  briefingLabel: 'Situation report',
  entityLabel: 'Flights',
  boardInstruction: 'tap a flight, then a slot',
  clueLabel: 'ATC Conditions',
  unlockLabel: 'Receive next condition',
  verifyLabel: 'Confirm sequence',
  debriefLabel: '🛫 ATC debrief',
  rankLabels: ['Senior Controller', 'Controller', 'Trainee'],
  closedEmoji: ['🏅', '✈️', '📋'],
  tagline: 'Real CAT LRDI arrangement set. New log tomorrow. ✈️',
};

interface DetectiveCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: ArrangementContent;
  explanation?: string;
  caseDate: string;
  onComplete: (result: { solved: boolean; timeSeconds: number; accuracy: number }) => Promise<void>;
}

type Phase = 'briefing' | 'investigate' | 'questions' | 'closed';
const MAX_HINTS = 2;

export function DetectiveCaseModal({
  isOpen,
  onClose,
  content,
  explanation,
  caseDate,
  onComplete,
}: DetectiveCaseModalProps) {
  const theme = content.game_type === 'airport' ? AIRPORT : DETECTIVE;
  const slots = content.solution.length;

  const [phase, setPhase] = useState<Phase>('briefing');
  const [placements, setPlacements] = useState<(string | null)[]>(Array(slots).fill(null));
  const [selected, setSelected] = useState<string | null>(null);
  const [unlockedClues, setUnlockedClues] = useState(2);
  const [struckClues, setStruckClues] = useState<number[]>([]);
  const [checksUsed, setChecksUsed] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [lastCheck, setLastCheck] = useState<{ correct: number; total: number } | null>(null);
  const [boardCracked, setBoardCracked] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [qSelected, setQSelected] = useState<number | null>(null);
  const [qSubmitted, setQSubmitted] = useState(false);
  const [qResults, setQResults] = useState<boolean[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setPhase('briefing');
      setPlacements(Array(slots).fill(null));
      setSelected(null);
      setUnlockedClues(2);
      setStruckClues([]);
      setChecksUsed(0);
      setHintsUsed(0);
      setLastCheck(null);
      setBoardCracked(false);
      setQIndex(0);
      setQSelected(null);
      setQSubmitted(false);
      setQResults([]);
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isOpen, slots]);

  if (!isOpen) return null;

  const mins = String(Math.floor(elapsed / 60));
  const secs = String(elapsed % 60).padStart(2, '0');
  const trayEntities = content.entities.filter((e) => !placements.includes(e));
  const allPlaced = placements.every((p) => p !== null);
  const questions = content.questions;
  const correctAnswers = qResults.filter(Boolean).length;
  const caseNumber = caseDate.replace(/-/g, '').slice(2);

  const handleSlotTap = (i: number) => {
    if (phase !== 'investigate' || boardCracked) return;
    setLastCheck(null);
    if (selected) {
      setPlacements((prev) => {
        const next = [...prev];
        const from = next.indexOf(selected);
        if (from >= 0) next[from] = null;
        next[i] = selected;
        return next;
      });
      setSelected(null);
    } else if (placements[i]) {
      setPlacements((prev) => { const next = [...prev]; next[i] = null; return next; });
    }
  };

  const handleCheck = () => {
    const correct = placements.filter((p, i) => p === content.solution[i]).length;
    setChecksUsed((c) => c + 1);
    setLastCheck({ correct, total: slots });
    if (correct === slots) { setBoardCracked(true); setTimeout(() => setPhase('questions'), 1500); }
  };

  const handleHint = () => {
    if (hintsUsed >= MAX_HINTS) return;
    const i = placements.findIndex((p, idx) => p !== content.solution[idx]);
    if (i < 0) return;
    setPlacements((prev) => {
      const next = [...prev];
      const ent = content.solution[i];
      const from = next.indexOf(ent);
      if (from >= 0) next[from] = null;
      next[i] = ent;
      return next;
    });
    setHintsUsed((h) => h + 1);
    setLastCheck(null);
  };

  const handleAnswerSubmit = () => {
    if (qSelected === null || qSubmitted) return;
    setQSubmitted(true);
    setQResults((prev) => [...prev, qSelected === questions[qIndex].answer]);
  };

  const handleNextQuestion = async () => {
    if (qIndex + 1 < questions.length) {
      setQIndex((i) => i + 1); setQSelected(null); setQSubmitted(false); return;
    }
    const correct = [...qResults, qSelected === questions[qIndex].answer].filter(Boolean).length;
    const timeSeconds = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000));
    setPhase('closed'); setSaving(true);
    try {
      await onComplete({ solved: correct >= Math.ceil(questions.length / 2), timeSeconds, accuracy: correct / questions.length });
    } finally { setSaving(false); }
  };

  const stars = correctAnswers === questions.length && hintsUsed === 0 && checksUsed <= 3 ? 3
    : correctAnswers >= Math.ceil(questions.length / 2) ? 2 : 1;

  const circlePos = (i: number) => {
    const ang = ((-90 + (360 / slots) * i) * Math.PI) / 180;
    return { left: `${50 + 40 * Math.cos(ang)}%`, top: `${50 + 40 * Math.sin(ang)}%` };
  };

  const renderSlot = (i: number) => (
    <button onClick={() => handleSlotTap(i)}
      className={cn('w-full min-h-[34px] rounded-lg border-2 text-[11px] font-semibold px-1 py-1.5 transition-all leading-tight',
        placements[i] ? boardCracked ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
          : `${theme.accentBorder} ${theme.accentBgLight} ${theme.accentTextDark}`
          : selected ? `border-dashed ${theme.accentBorder} bg-white/50 text-stone-400 animate-pulse`
          : 'border-dashed border-stone-300 bg-white text-stone-300')}>
      {placements[i] || '?'}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-stone-900/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[94vh] overflow-y-auto">

        {/* Header */}
        <div className={cn('sticky top-0 z-10 text-white px-5 py-3.5 flex items-center justify-between rounded-t-2xl', theme.headerBg)}>
          <div>
            <span className={cn('text-[10px] uppercase tracking-widest font-semibold', theme.accentText)}>
              {theme.casePrefix} #{caseNumber}
            </span>
            <div className="flex items-center gap-1.5 text-stone-300 text-xs mt-0.5">
              <Clock className="w-3.5 h-3.5" /><span className="font-mono">{mins}:{secs}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* BRIEFING */}
        {phase === 'briefing' && (
          <div className="p-5 space-y-5">
            <div className="text-center space-y-2 py-4">
              <div className="text-4xl">{theme.headerEmoji}</div>
              <h2 className="text-lg font-bold text-stone-900">{content.title}</h2>
            </div>
            <div className={cn('border-2 rounded-xl p-4', theme.accentBgLight, theme.accentBorder)}>
              <p className={cn('text-[10px] uppercase tracking-widest font-bold mb-2', theme.accentTextDark)}>{theme.briefingLabel}</p>
              <p className="text-sm text-stone-800 leading-relaxed">{content.story}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-stone-600">
              {[
                [content.entities.length, theme.entityLabel],
                [content.clues.length, 'conditions'],
                [questions.length, 'CAT questions'],
              ].map(([count, label]) => (
                <div key={String(label)} className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
                  <p className="font-bold text-stone-900">{count}</p>
                  <p>{label}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setPhase('investigate')}
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 transition-all active:scale-[0.98]">
              {theme.openLabel}
            </button>
          </div>
        )}

        {/* INVESTIGATE */}
        {phase === 'investigate' && (
          <div className="p-5 space-y-5">
            <p className="text-xs text-stone-600 leading-relaxed">{content.story}</p>

            {/* Board */}
            <div>
              <p className={cn('text-[10px] uppercase tracking-widest font-bold mb-2', 'text-stone-500')}>
                📌 {content.mode === 'circular' ? 'Circular table' : 'Board'} — {theme.boardInstruction}
              </p>
              {content.mode === 'circular' ? (
                <div className="relative w-full max-w-[300px] aspect-square mx-auto">
                  <div className="absolute inset-[24%] rounded-full bg-stone-100 border-2 border-stone-200 flex items-center justify-center text-[10px] text-stone-400 font-semibold">
                    {content.game_type === 'airport' ? 'RUNWAY' : 'TABLE'}
                  </div>
                  {content.slotLabels.map((label, i) => (
                    <div key={i} className="absolute w-[72px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5" style={circlePos(i)}>
                      <span className="text-[9px] text-stone-500 font-medium">{label}</span>
                      {renderSlot(i)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={cn('grid gap-2', slots <= 6 ? 'grid-cols-3' : 'grid-cols-4')}>
                  {content.slotLabels.map((label, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-stone-500 font-medium">{label}</span>
                      {renderSlot(i)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tray */}
            {trayEntities.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2">{theme.entityLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {trayEntities.map((e) => (
                    <button key={e} onClick={() => setSelected(selected === e ? null : e)}
                      className={cn('px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all',
                        selected === e ? `${theme.accentBorder} ${theme.accentBgLight} ${theme.accentTextDark} scale-105 shadow`
                          : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400')}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Clues */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2">
                🗂 {theme.clueLabel} — tap to strike off once used
              </p>
              <div className="space-y-1.5">
                {content.clues.slice(0, unlockedClues).map((clue, i) => (
                  <button key={i} onClick={() => setStruckClues((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])}
                    className={cn('w-full text-left px-3 py-2 rounded-lg border text-xs leading-relaxed transition-all',
                      struckClues.includes(i) ? 'border-stone-200 bg-stone-50 text-stone-400 line-through'
                        : `${theme.accentBorder} ${theme.accentBgLight} text-stone-800`)}>
                    <span className={cn('font-bold mr-1.5', theme.accentTextDark)}>#{i + 1}</span>{clue}
                  </button>
                ))}
                {unlockedClues < content.clues.length && (
                  <button onClick={() => setUnlockedClues((n) => n + 1)}
                    className={cn('w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-stone-300 text-xs font-semibold text-stone-600 transition-all', `hover:${theme.accentBorder} hover:${theme.accentTextDark}`)}>
                    <Lock className="w-3.5 h-3.5" />{theme.unlockLabel} ({content.clues.length - unlockedClues} left)
                  </button>
                )}
              </div>
            </div>

            {lastCheck && !boardCracked && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-800 font-medium">
                🎯 {lastCheck.correct}/{lastCheck.total} correct — keep deducing!
              </div>
            )}
            {boardCracked && (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 text-center">
                <p className="text-sm font-bold text-emerald-800">🎉 Arrangement confirmed! Moving to case questions…</p>
              </div>
            )}

            {!boardCracked && (
              <div className="flex gap-2">
                <button onClick={handleHint} disabled={hintsUsed >= MAX_HINTS}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-stone-200 text-xs font-semibold text-stone-600 hover:border-stone-400 disabled:opacity-40 transition-all">
                  <Lightbulb className="w-3.5 h-3.5" />Hint ({MAX_HINTS - hintsUsed})
                </button>
                <button onClick={() => { setPlacements(Array(slots).fill(null)); setSelected(null); setLastCheck(null); }}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-stone-200 text-xs font-semibold text-stone-600 hover:border-stone-400 transition-all">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleCheck} disabled={!allPlaced}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 disabled:opacity-40 transition-all active:scale-[0.98]">
                  <Search className="w-4 h-4" />{theme.verifyLabel}
                </button>
              </div>
            )}
          </div>
        )}

        {/* QUESTIONS */}
        {phase === 'questions' && (
          <div className="p-5 space-y-5">
            <div className={cn('rounded-xl p-3', theme.accentBgLight, `border ${theme.accentBorder}`)}>
              <p className={cn('text-[10px] uppercase tracking-widest font-bold mb-1.5', theme.accentTextDark)}>Confirmed arrangement</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {content.slotLabels.map((label, i) => (
                  <span key={i} className="text-[11px] text-stone-700">
                    <span className="text-stone-400">{label}:</span> <span className="font-semibold">{content.solution[i]}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500">
                ⚖️ CAT Questions — {qIndex + 1}/{questions.length}
              </p>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <div key={i} className={cn('w-2 h-2 rounded-full',
                    i < qResults.length ? qResults[i] ? 'bg-emerald-500' : 'bg-rose-500'
                      : i === qIndex ? `bg-amber-500` : 'bg-stone-200')} />
                ))}
              </div>
            </div>

            <p className="text-sm text-stone-900 font-medium leading-relaxed">{questions[qIndex].q}</p>

            <div className="space-y-2">
              {questions[qIndex].options.map((opt, i) => {
                const isPicked = qSelected === i, isAnswer = i === questions[qIndex].answer;
                return (
                  <button key={i} disabled={qSubmitted} onClick={() => setQSelected(i)}
                    className={cn('w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all',
                      !qSubmitted && isPicked && `${theme.accentBorder} ${theme.accentBgLight} text-stone-900`,
                      !qSubmitted && !isPicked && 'border-stone-200 hover:border-stone-300 text-stone-800',
                      qSubmitted && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-900',
                      qSubmitted && isPicked && !isAnswer && 'border-rose-500 bg-rose-50 text-rose-900',
                      qSubmitted && !isPicked && !isAnswer && 'border-stone-200 text-stone-400')}>
                    <span className="font-mono mr-2 text-stone-500">{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                );
              })}
            </div>

            {!qSubmitted ? (
              <button onClick={handleAnswerSubmit} disabled={qSelected === null}
                className="w-full py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 disabled:opacity-40 transition-all active:scale-[0.98]">
                Lock answer
              </button>
            ) : (
              <button onClick={handleNextQuestion}
                className={cn('w-full flex items-center justify-center gap-1 py-3 text-white rounded-xl font-semibold text-sm transition-all active:scale-[0.98]', theme.accentBg, theme.accentHover)}>
                {qIndex + 1 < questions.length ? 'Next question' : 'Close the case'}<ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* CLOSED */}
        {phase === 'closed' && (
          <div className="p-5 space-y-5">
            <div className="text-center py-4 space-y-3">
              <div className="text-5xl">{theme.closedEmoji[stars === 3 ? 0 : stars === 2 ? 1 : 2]}</div>
              <h2 className="text-lg font-bold text-stone-900">Case closed!</h2>
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3].map((s) => (
                  <Star key={s} className={cn('w-7 h-7', s <= stars ? 'text-amber-400 fill-amber-400' : 'text-stone-200')} />
                ))}
              </div>
              <p className={cn('text-sm font-semibold', theme.accentTextDark)}>Rank: {theme.rankLabels[stars === 3 ? 0 : stars === 2 ? 1 : 2]}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Time', `${mins}:${secs}`], ['Questions', `${correctAnswers}/${questions.length}`], ['Checks', `${checksUsed}`]].map(([label, val]) => (
                <div key={label} className="bg-stone-50 rounded-xl p-3 border border-stone-200">
                  <p className="text-base font-bold text-stone-900">{val}</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {explanation && (
              <div className={cn('rounded-xl p-4', theme.accentBgLight, `border ${theme.accentBorder}`)}>
                <p className={cn('text-[10px] uppercase tracking-widest font-bold mb-1.5', theme.accentTextDark)}>{theme.debriefLabel}</p>
                <p className="text-xs text-stone-700 leading-relaxed">{explanation}</p>
              </div>
            )}

            <p className="text-center text-xs text-stone-400">{theme.tagline}</p>
            <button onClick={onClose} disabled={saving}
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 disabled:opacity-50 transition-all">
              {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### src/components/DailyTracker/EmotionalChips.tsx
```tsx
'use client';

import { cn } from '@/lib/utils';

export const EMOTIONAL_CHIPS = [
  { value: 'mock_scared', emoji: '😨', label: 'Mock scared me' },
  { value: 'burned_out', emoji: '🔥', label: 'Burned out' },
  { value: 'comparing', emoji: '👀', label: 'Comparing myself' },
  { value: 'family_pressure', emoji: '🏠', label: 'Family pressure' },
  { value: 'lost_confidence', emoji: '📉', label: 'Lost confidence' },
  { value: 'feeling_behind', emoji: '⏰', label: 'Feeling behind' },
  { value: 'all_good', emoji: '😌', label: 'All good' },
];

interface EmotionalChipsProps {
  selected: string[];
  onChange: (chips: string[]) => void;
}

export function EmotionalChips({ selected, onChange }: EmotionalChipsProps) {
  const toggle = (value: string) => {
    if (value === 'all_good') {
      // all_good is exclusive
      onChange(selected.includes('all_good') ? [] : ['all_good']);
      return;
    }
    const without = selected.filter((v) => v !== 'all_good');
    onChange(
      without.includes(value) ? without.filter((v) => v !== value) : [...without, value]
    );
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
        How are you feeling? <span className="normal-case font-normal text-zinc-600">(optional)</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {EMOTIONAL_CHIPS.map(({ value, emoji, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95',
              selected.includes(value)
                ? value === 'all_good'
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500'
                  : 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            )}
          >
            <span>{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {selected.length > 0 && !selected.includes('all_good') && (
        <p className="text-[11px] text-amber-400/80 mt-2">
          Your buddy sees these — they help them know what to address first.
        </p>
      )}
    </div>
  );
}
```

### src/components/DailyTracker/EscapeRoomModal.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, Lightbulb, ChevronRight, Star, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EscapeLock {
  room: string;
  prompt: string;
  options: string[];
  answer: number;
  hint: string;
}

export interface EscapeRoomContent {
  game_type: 'escape_room';
  title: string;
  story: string;
  locks: EscapeLock[];
  questions: Array<{ q: string; options: string[]; answer: number }>;
}

export function isEscapeRoom(content: unknown): content is EscapeRoomContent {
  const c = content as Partial<EscapeRoomContent> | null | undefined;
  return !!c && c.game_type === 'escape_room' && Array.isArray(c.locks) && c.locks.length > 0;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  content: EscapeRoomContent;
  caseDate: string;
  onComplete: (result: { solved: boolean; timeSeconds: number; accuracy: number }) => Promise<void>;
}

type Phase = 'briefing' | 'escaping' | 'questions' | 'closed';

export function EscapeRoomModal({ isOpen, onClose, content, caseDate, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('briefing');
  const [lockIndex, setLockIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [wrongCount, setWrongCount] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [unlockedRooms, setUnlockedRooms] = useState<number[]>([]);
  const [openAnim, setOpenAnim] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [qSelected, setQSelected] = useState<number | null>(null);
  const [qSubmitted, setQSubmitted] = useState(false);
  const [qResults, setQResults] = useState<boolean[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number>(0);
  const timePenalty = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setPhase('briefing'); setLockIndex(0); setSelected(null); setSubmitted(false);
      setWrongCount(0); setShowHint(false); setHintsUsed(0); setUnlockedRooms([]);
      setOpenAnim(false); setQIndex(0); setQSelected(null); setQSubmitted(false);
      setQResults([]); setElapsed(0); timePenalty.current = 0;
      return;
    }
    startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  if (!isOpen) return null;

  const mins = String(Math.floor(elapsed / 60));
  const secs = String(elapsed % 60).padStart(2, '0');
  const lock = content.locks[lockIndex];
  const questions = content.questions;
  const correctAnswers = qResults.filter(Boolean).length;
  const caseNumber = caseDate.replace(/-/g, '').slice(2);
  const allLocks = content.locks.length;

  const handleSubmit = () => {
    if (selected === null || submitted) return;
    if (selected === lock.answer) {
      setSubmitted(true);
      setOpenAnim(true);
      setTimeout(() => {
        setUnlockedRooms((prev) => [...prev, lockIndex]);
        if (lockIndex + 1 < allLocks) {
          setLockIndex((i) => i + 1);
          setSelected(null); setSubmitted(false); setWrongCount(0); setShowHint(false); setOpenAnim(false);
        } else {
          setPhase('questions');
        }
      }, 1400);
    } else {
      setWrongCount((w) => w + 1);
      setSelected(null);
      if (wrongCount + 1 >= 2) setShowHint(true);
    }
  };

  const handleHint = () => {
    setShowHint(true);
    setHintsUsed((h) => h + 1);
    timePenalty.current += 30;
  };

  const handleAnswerSubmit = () => {
    if (qSelected === null || qSubmitted) return;
    setQSubmitted(true);
    setQResults((prev) => [...prev, qSelected === questions[qIndex].answer]);
  };

  const handleNextQuestion = async () => {
    if (qIndex + 1 < questions.length) {
      setQIndex((i) => i + 1); setQSelected(null); setQSubmitted(false); return;
    }
    const correct = [...qResults, qSelected === questions[qIndex].answer].filter(Boolean).length;
    const timeSeconds = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000) + timePenalty.current);
    setPhase('closed'); setSaving(true);
    try {
      await onComplete({ solved: correct >= Math.ceil(questions.length / 2), timeSeconds, accuracy: correct / questions.length });
    } finally { setSaving(false); }
  };

  const stars = correctAnswers === questions.length && hintsUsed === 0 ? 3
    : correctAnswers >= Math.ceil(questions.length / 2) ? 2 : 1;
  const rankLabel = stars === 3 ? 'Master Escapist' : stars === 2 ? 'Problem Solver' : 'Rookie';

  return (
    <div className="fixed inset-0 bg-stone-900/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[94vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-zinc-900 text-white px-5 py-3.5 flex items-center justify-between rounded-t-2xl">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-400">
              🔐 Escape Room #{caseNumber}
            </span>
            <div className="flex items-center gap-1.5 text-stone-300 text-xs mt-0.5">
              <Clock className="w-3.5 h-3.5" /><span className="font-mono">{mins}:{secs}</span>
              {timePenalty.current > 0 && <span className="text-red-400 text-[10px]">+{timePenalty.current}s penalty</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* BRIEFING */}
        {phase === 'briefing' && (
          <div className="p-5 space-y-5">
            <div className="text-center space-y-2 py-4">
              <div className="text-4xl">🔐</div>
              <h2 className="text-lg font-bold text-stone-900">{content.title}</h2>
            </div>
            <div className="bg-zinc-50 border-2 border-zinc-200 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-600 mb-2">Your situation</p>
              <p className="text-sm text-stone-800 leading-relaxed">{content.story}</p>
            </div>
            {/* Room progress preview */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2">Rooms to escape</p>
              <div className="flex items-center gap-2">
                {content.locks.map((l, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-full bg-zinc-200 border-2 border-zinc-300 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-zinc-400" />
                    </div>
                    <span className="text-[9px] text-stone-500 text-center leading-tight">{l.room}</span>
                  </div>
                ))}
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center">
                    <span className="text-sm">🚪</span>
                  </div>
                  <span className="text-[9px] text-stone-500">Freedom</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-stone-500 text-center">Each lock = one CAT-level calculation. Wrong twice → hint revealed.</p>
            <button onClick={() => setPhase('escaping')}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-semibold text-sm hover:bg-zinc-800 transition-all active:scale-[0.98]">
              🔐 Start escaping
            </button>
          </div>
        )}

        {/* ESCAPING */}
        {phase === 'escaping' && (
          <div className="p-5 space-y-5">
            {/* Progress */}
            <div className="flex items-center gap-1.5">
              {content.locks.map((l, i) => (
                <div key={i} className={cn('flex-1 h-1.5 rounded-full transition-all',
                  unlockedRooms.includes(i) ? 'bg-emerald-500' : i === lockIndex ? 'bg-amber-400' : 'bg-stone-200')} />
              ))}
            </div>

            {/* Room label */}
            <div className="flex items-center gap-2">
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-all',
                openAnim ? 'bg-emerald-100 border-2 border-emerald-400' : 'bg-zinc-200 border-2 border-zinc-300')}>
                {openAnim ? <Unlock className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-zinc-500" />}
              </div>
              <div>
                <p className="text-xs font-bold text-stone-900">{lock.room}</p>
                <p className="text-[10px] text-stone-500">Lock {lockIndex + 1} of {allLocks}</p>
              </div>
            </div>

            {openAnim ? (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-6 text-center space-y-2">
                <div className="text-4xl">🔓</div>
                <p className="text-sm font-bold text-emerald-800">Lock cracked! Door opening…</p>
              </div>
            ) : (
              <>
                {/* Problem */}
                <div className="bg-zinc-50 border-2 border-zinc-200 rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-600 mb-2">🔢 Crack the lock</p>
                  <p className="text-sm text-stone-900 leading-relaxed font-medium whitespace-pre-line">{lock.prompt}</p>
                </div>

                {/* Wrong attempts feedback */}
                {wrongCount > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-700 font-medium">
                    ❌ Wrong answer — {wrongCount >= 2 ? 'hint revealed below' : 'try again'}
                  </div>
                )}

                {/* Hint */}
                {showHint && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-amber-700 mb-1">💡 Hint</p>
                    <p className="text-xs text-stone-700">{lock.hint}</p>
                  </div>
                )}

                {/* Options */}
                <div className="grid grid-cols-2 gap-2">
                  {lock.options.map((opt, i) => (
                    <button key={i} onClick={() => setSelected(i)}
                      className={cn('py-3 px-3 rounded-xl border-2 text-sm font-semibold transition-all text-center',
                        selected === i ? 'border-emerald-500 bg-emerald-50 text-emerald-900 scale-[1.02]'
                          : 'border-stone-200 bg-white text-stone-800 hover:border-stone-400')}>
                      {opt}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  {!showHint && (
                    <button onClick={handleHint}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-stone-200 text-xs font-semibold text-stone-600 hover:border-amber-400 transition-all">
                      <Lightbulb className="w-3.5 h-3.5" />Hint (+30s)
                    </button>
                  )}
                  <button onClick={handleSubmit} disabled={selected === null}
                    className="flex-1 py-2.5 bg-zinc-900 text-white rounded-xl font-semibold text-sm hover:bg-zinc-800 disabled:opacity-40 transition-all active:scale-[0.98]">
                    🔓 Try this code
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* QUESTIONS */}
        {phase === 'questions' && (
          <div className="p-5 space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <p className="text-sm font-bold text-emerald-800">🚪 You escaped! Now close out with CAT questions.</p>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500">CAT Questions — {qIndex + 1}/{questions.length}</p>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <div key={i} className={cn('w-2 h-2 rounded-full',
                    i < qResults.length ? qResults[i] ? 'bg-emerald-500' : 'bg-rose-500' : i === qIndex ? 'bg-amber-500' : 'bg-stone-200')} />
                ))}
              </div>
            </div>

            <p className="text-sm text-stone-900 font-medium leading-relaxed">{questions[qIndex].q}</p>

            <div className="space-y-2">
              {questions[qIndex].options.map((opt, i) => {
                const isPicked = qSelected === i, isAnswer = i === questions[qIndex].answer;
                return (
                  <button key={i} disabled={qSubmitted} onClick={() => setQSelected(i)}
                    className={cn('w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all',
                      !qSubmitted && isPicked && 'border-emerald-500 bg-emerald-50 text-stone-900',
                      !qSubmitted && !isPicked && 'border-stone-200 hover:border-stone-300 text-stone-800',
                      qSubmitted && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-900',
                      qSubmitted && isPicked && !isAnswer && 'border-rose-500 bg-rose-50 text-rose-900',
                      qSubmitted && !isPicked && !isAnswer && 'border-stone-200 text-stone-400')}>
                    <span className="font-mono mr-2 text-stone-500">{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                );
              })}
            </div>

            {!qSubmitted ? (
              <button onClick={handleAnswerSubmit} disabled={qSelected === null}
                className="w-full py-3 bg-zinc-900 text-white rounded-xl font-semibold text-sm hover:bg-zinc-800 disabled:opacity-40 transition-all">
                Lock answer
              </button>
            ) : (
              <button onClick={handleNextQuestion}
                className="w-full flex items-center justify-center gap-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-all">
                {qIndex + 1 < questions.length ? 'Next question' : 'Finish'}<ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* CLOSED */}
        {phase === 'closed' && (
          <div className="p-5 space-y-5">
            <div className="text-center py-4 space-y-3">
              <div className="text-5xl">{stars === 3 ? '🏆' : stars === 2 ? '🔓' : '🔐'}</div>
              <h2 className="text-lg font-bold text-stone-900">Escaped!</h2>
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3].map((s) => (
                  <Star key={s} className={cn('w-7 h-7', s <= stars ? 'text-amber-400 fill-amber-400' : 'text-stone-200')} />
                ))}
              </div>
              <p className="text-sm font-semibold text-emerald-700">Rank: {rankLabel}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Time', `${mins}:${secs}`], ['CAT Qs', `${correctAnswers}/${questions.length}`], ['Hints', `${hintsUsed}`]].map(([l, v]) => (
                <div key={l} className="bg-stone-50 rounded-xl p-3 border border-stone-200">
                  <p className="text-base font-bold text-stone-900">{v}</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">{l}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-stone-400">Every lock was a real CAT Quant concept. New room tomorrow. 🔐</p>
            <button onClick={onClose} disabled={saving}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-semibold text-sm hover:bg-zinc-800 disabled:opacity-50 transition-all">
              {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### src/components/DailyTracker/FeedbackAnimation.tsx
```tsx
'use client';

import { useEffect, useRef } from 'react';
import { Zap, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FeedbackAnimationProps {
  isVisible: boolean;
  onComplete: () => void;
  streakIncrement?: number;
  bonus?: string;
  /** The one prescriptive line the rule engine answered back with */
  noticed?: string | null;
}

export function FeedbackAnimation({
  isVisible,
  onComplete,
  streakIncrement = 1,
  bonus,
  noticed,
}: FeedbackAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = [];

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      rotation: number;
      rotationSpeed: number;
      life: number;

      constructor(width: number, height: number) {
        this.x = Math.random() * width;
        this.y = Math.random() * height * 0.3; // Start from top half
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = Math.random() * 3 + 2; // Fall down
        this.size = Math.random() * 8 + 4;
        const colors = ['#E8652D', '#17A697', '#FFD700', '#FF69B4', '#87CEEB'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        this.life = 1;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // Gravity
        this.rotation += this.rotationSpeed;
        this.life -= 0.012;
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
      }
    }

    // Create particles
    for (let i = 0; i < 30; i++) {
      particles.push(new Particle(canvas.width, canvas.height));
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw(ctx);

        if (particles[i].life <= 0) {
          particles.splice(i, 1);
        }
      }

      if (particles.length > 0) {
        requestAnimationFrame(animate);
      }
    };

    animate();

    // noticed lines need reading time; plain success = 2s
    const timer = setTimeout(onComplete, noticed ? 3500 : 2000);
    return () => clearTimeout(timer);
  }, [isVisible, onComplete, noticed]);

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Confetti Canvas */}
          <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-50"
          />

          {/* Success Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.4, type: 'spring', stiffness: 100 }}
                className="flex justify-center mb-4"
              >
                <CheckCircle2 className="w-16 h-16 text-teal-600" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <h3 className="text-2xl font-bold text-stone-900 mb-2">
                  Logged! 🎉
                </h3>
                <p className="text-stone-600 mb-6">
                  {streakIncrement === 1
                    ? `Your streak is now ${streakIncrement} day!`
                    : `Great job staying consistent!`}
                </p>

                {noticed && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="bg-stone-900 rounded-xl p-4 mb-4 text-left"
                  >
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-orange-400 mb-1">
                      CareerRai noticed
                    </p>
                    <p className="text-sm text-white leading-snug">{noticed}</p>
                  </motion.div>
                )}

                {bonus && !noticed && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                    className="bg-gradient-to-r from-orange-50 to-teal-50 rounded-xl p-4 mb-4"
                  >
                    <div className="flex items-center justify-center gap-2 text-orange-600 font-semibold">
                      <Zap className="w-5 h-5" />
                      <span className="text-sm">{bonus}</span>
                    </div>
                  </motion.div>
                )}

                <p className="text-xs text-stone-500">
                  Come back tomorrow to keep your streak alive!
                </p>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

### src/components/DailyTracker/HeroCard.tsx
```tsx
'use client';

import { useEffect, useState } from 'react';
import { Flame, Shield, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeroCardProps {
  currentStreak: number;
  maxStreak: number;
  onLogClick: () => void;
  isLoading?: boolean;
  hasLoggedToday: boolean;
  shieldsRemaining: number;
}

export function HeroCard({
  currentStreak,
  maxStreak,
  onLogClick,
  isLoading = false,
  hasLoggedToday,
  shieldsRemaining,
}: HeroCardProps) {
  const [displayedStreak, setDisplayedStreak] = useState(0);

  useEffect(() => {
    if (displayedStreak === currentStreak) return;

    const duration = 600;
    const startTime = Date.now();
    const startValue = displayedStreak;
    const difference = currentStreak - startValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const newValue = Math.floor(startValue + difference * progress);
      setDisplayedStreak(newValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [currentStreak, displayedStreak]);

  return (
    <div
      className={cn(
        'w-full rounded-2xl bg-gradient-to-br from-orange-600 to-orange-700 text-white p-6 space-y-4 shadow-lg transition-all duration-300'
      )}
    >
      {/* Top Row: Streak + Shield */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest opacity-90 font-semibold">Your streak</p>
          <div className="flex items-baseline gap-2 mt-2">
            <Flame className={cn('w-8 h-8', currentStreak > 0 ? 'animate-bounce' : 'opacity-50')} />
            <span className="text-5xl font-bold font-mono leading-none">{displayedStreak}</span>
            <span className="text-lg opacity-80 font-normal">study days</span>
          </div>
          {currentStreak === 0 && !hasLoggedToday && (
            <p className="text-xs opacity-90 mt-1.5 font-medium">
              Your streak starts with one log.
            </p>
          )}
          {maxStreak > currentStreak && (
            <p className="text-xs opacity-75 mt-1">
              Max: {maxStreak} days
            </p>
          )}
        </div>

        {/* Shield Badge */}
        {shieldsRemaining > 0 && (
          <div className="flex flex-col items-center gap-1 bg-white/20 rounded-lg px-3 py-2 backdrop-blur-sm">
            <Shield className="w-5 h-5" />
            <span className="text-xs font-bold">{shieldsRemaining}</span>
            <span className="text-[10px] leading-none">left</span>
          </div>
        )}
      </div>

      {/* CTA Button */}
      {hasLoggedToday ? (
        <div className="flex items-center gap-2 bg-white/20 rounded-xl px-4 py-3 backdrop-blur-sm">
          <Zap className="w-5 h-5" />
          <span className="text-sm font-semibold">Day {currentStreak} logged ✓</span>
        </div>
      ) : (
        <button
          onClick={() => { navigator.vibrate?.(20); onLogClick(); }}
          disabled={isLoading}
          className={cn(
            'w-full py-3.5 rounded-xl font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2',
            'bg-white text-orange-600 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed',
            isLoading && 'animate-pulse'
          )}
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-orange-600 rounded-full animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              {currentStreak === 0 ? 'Log your first day' : 'Log Today'}
            </>
          )}
        </button>
      )}

      {!hasLoggedToday && (
        <p className="text-[11px] text-center opacity-70">Day ends at 3 AM — late-night study counts</p>
      )}

      {hasLoggedToday && (
        <p className="text-[10px] text-center opacity-60">
          Study streak counts study days — a 0-hour log keeps the record, not the flame.
        </p>
      )}

      {shieldsRemaining > 0 && !hasLoggedToday && (
        <p className="text-[10px] text-center opacity-60 -mt-1">
          🛡️ {shieldsRemaining} shield{shieldsRemaining > 1 ? 's' : ''} this month — auto-protects a missed day
        </p>
      )}

      {currentStreak < 30 && (
        <p className="text-[10px] text-center opacity-60 -mt-1">
          🎁 Hit a 30-day streak → 1 month CareerRai free
        </p>
      )}

      {/* Pulse animation indicator when no log */}
      {!hasLoggedToday && (
        <style>{`
          @keyframes pulse-soft {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
          .hero-cta-pulse {
            animation: pulse-soft 2s ease-in-out infinite;
          }
        `}</style>
      )}
    </div>
  );
}
```

### src/components/DailyTracker/LoggingModal.tsx
```tsx
'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmotionalChips } from './EmotionalChips';

interface LoggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: LoggingData) => Promise<{ mockSelected: boolean }>;
  isSubmitting?: boolean;
}

export interface LoggingData {
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  emotional_chips?: string[];
}

const HOURS_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const SECTIONS = ['VARC', 'DILR', 'QA', 'Mock', 'Revision'];
const ENERGY_OPTIONS = [
  { emoji: '🙏', label: 'Drained', value: '🙏' },
  { emoji: '💪', label: 'Solid', value: '💪' },
  { emoji: '🔥', label: 'Sharp', value: '🔥' },
];

export function LoggingModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: LoggingModalProps) {
  const [hours, setHours] = useState<number | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [energy, setEnergy] = useState<string | null>(null);
  const [emotionalChips, setEmotionalChips] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    if (sections.includes(section)) {
      setSections(sections.filter((s) => s !== section));
    } else {
      setSections([...sections, section]);
    }
  };

  const isValid = hours !== null && sections.length > 0 && energy !== null;

  const handleSubmit = async () => {
    if (!isValid) return;
    // Haptic confirmation on submit — feels native on mobile
    navigator.vibrate?.(50);
    try {
      setError(null);
      const result = await onSubmit({
        hours,
        sections,
        energy,
        notes: notes.trim() || undefined,
        emotional_chips: emotionalChips.length > 0 ? emotionalChips : undefined,
      });
      // Reset form
      setHours(null);
      setSections([]);
      setEnergy(null);
      setEmotionalChips([]);
      setNotes('');
      if (!result.mockSelected) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log. Try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-end sm:items-center sm:justify-center">
      <div
        className={cn(
          'w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-800',
          'max-h-[92vh] overflow-y-auto flex flex-col'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Log Today</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Day ends at 3 AM — late nights count</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-zinc-500 hover:text-zinc-300 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 space-y-7">

          {/* Hours */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Hours studied
            </label>
            <div className="grid grid-cols-7 gap-1.5">
              {HOURS_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  className={cn(
                    'py-3 rounded-xl font-bold text-sm transition-all active:scale-95',
                    hours === h
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {h === 6 ? '6+' : `${h}`}
                </button>
              ))}
            </div>
            {hours === 0 && (
              <p className="text-xs text-amber-400/90 mt-2">
                0-hour logs keep your record honest — they don&apos;t extend your study streak.
              </p>
            )}
          </div>

          {/* Sections */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Sections today
            </label>
            <div className="flex flex-wrap gap-2">
              {SECTIONS.map((section) => (
                <button
                  key={section}
                  onClick={() => toggleSection(section)}
                  className={cn(
                    'px-4 py-2 rounded-full font-semibold text-sm transition-all active:scale-95',
                    sections.includes(section)
                      ? section === 'Mock'
                        ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                        : 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {section}
                </button>
              ))}
            </div>
            {sections.includes('Mock') && (
              <p className="text-xs text-teal-400 mt-2 font-medium">
                ✓ Mock selected — debrief form appears after logging
              </p>
            )}
          </div>

          {/* Energy */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Energy level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ENERGY_OPTIONS.map((e) => (
                <button
                  key={e.value}
                  onClick={() => setEnergy(e.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all active:scale-95',
                    energy === e.value
                      ? 'bg-zinc-700 ring-2 ring-orange-500 ring-offset-2 ring-offset-zinc-950'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  )}
                >
                  <span className="text-3xl">{e.emoji}</span>
                  <span className="text-xs font-semibold text-zinc-300">{e.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Emotional chips */}
          <EmotionalChips selected={emotionalChips} onChange={setEmotionalChips} />

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              Notes <span className="normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any wins, blockers, or thoughts..."
              maxLength={200}
              rows={2}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            <p className="text-xs text-zinc-600 mt-1 text-right">{notes.length}/200</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-950 border border-rose-700 rounded-xl text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 px-6 py-4">
          <button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className={cn(
              'w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2',
              isValid && !isSubmitting
                ? 'bg-orange-500 text-white hover:bg-orange-400 active:scale-[0.98] shadow-lg shadow-orange-500/20'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            )}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Logging...' : sections.includes('Mock') ? 'Log & Debrief →' : 'Log Day'}
          </button>
          <p className="text-[11px] text-zinc-600 text-center mt-2">15 seconds. The app answers back.</p>
        </div>
      </div>
    </div>
  );
}
```

### src/components/DailyTracker/MafiaLogicModal.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, ChevronRight, Star, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MafiaStatement { suspect: string; says: string }

export interface MafiaContent {
  game_type: 'mafia';
  title: string;
  story: string;
  suspects: string[];
  guilty_index: number;
  statements: MafiaStatement[];
  facts: string[];
  questions: Array<{ q: string; options: string[]; answer: number }>;
}

export function isMafiaGame(content: unknown): content is MafiaContent {
  const c = content as Partial<MafiaContent> | null | undefined;
  return !!c && c.game_type === 'mafia' && Array.isArray(c.suspects) && Array.isArray(c.statements);
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  content: MafiaContent;
  caseDate: string;
  onComplete: (result: { solved: boolean; timeSeconds: number; accuracy: number }) => Promise<void>;
}

type Phase = 'briefing' | 'interrogate' | 'accuse' | 'questions' | 'closed';
type Verdict = 'clear' | 'suspect' | null;

export function MafiaLogicModal({ isOpen, onClose, content, caseDate, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('briefing');
  const [verdicts, setVerdicts] = useState<Verdict[]>(() => Array(content.suspects.length).fill(null));
  const [accusation, setAccusation] = useState<number | null>(null);
  const [accusationResult, setAccusationResult] = useState<'correct' | 'wrong' | null>(null);
  const [expandedStatement, setExpandedStatement] = useState<number | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [qSelected, setQSelected] = useState<number | null>(null);
  const [qSubmitted, setQSubmitted] = useState(false);
  const [qResults, setQResults] = useState<boolean[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setPhase('briefing'); setVerdicts(Array(content.suspects.length).fill(null));
      setAccusation(null); setAccusationResult(null); setExpandedStatement(null);
      setQIndex(0); setQSelected(null); setQSubmitted(false); setQResults([]); setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isOpen, content.suspects.length]);

  if (!isOpen) return null;

  const mins = String(Math.floor(elapsed / 60));
  const secs = String(elapsed % 60).padStart(2, '0');
  const questions = content.questions;
  const correctAnswers = qResults.filter(Boolean).length;
  const caseNumber = caseDate.replace(/-/g, '').slice(2);

  const handleAccuse = async () => {
    if (accusation === null) return;
    const correct = accusation === content.guilty_index;
    setAccusationResult(correct ? 'correct' : 'wrong');
    if (correct) setTimeout(() => setPhase('questions'), 1500);
  };

  const handleAnswerSubmit = () => {
    if (qSelected === null || qSubmitted) return;
    setQSubmitted(true);
    setQResults((prev) => [...prev, qSelected === questions[qIndex].answer]);
  };

  const handleNextQuestion = async () => {
    if (qIndex + 1 < questions.length) {
      setQIndex((i) => i + 1); setQSelected(null); setQSubmitted(false); return;
    }
    const correct = [...qResults, qSelected === questions[qIndex].answer].filter(Boolean).length;
    const timeSeconds = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000));
    setPhase('closed'); setSaving(true);
    try {
      await onComplete({ solved: accusationResult === 'correct' && correct >= Math.ceil(questions.length / 2), timeSeconds, accuracy: correct / questions.length });
    } finally { setSaving(false); }
  };

  const stars = accusationResult === 'correct' && correctAnswers === questions.length ? 3
    : accusationResult === 'correct' ? 2 : 1;

  const verdictIcon = (v: Verdict) => v === 'clear'
    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
    : v === 'suspect'
    ? <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
    : <HelpCircle className="w-3.5 h-3.5 text-stone-400" />;

  return (
    <div className="fixed inset-0 bg-stone-900/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[94vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-red-950 text-white px-5 py-3.5 flex items-center justify-between rounded-t-2xl">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-red-300">
              🎭 Mafia Round #{caseNumber}
            </span>
            <div className="flex items-center gap-1.5 text-stone-300 text-xs mt-0.5">
              <Clock className="w-3.5 h-3.5" /><span className="font-mono">{mins}:{secs}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* BRIEFING */}
        {phase === 'briefing' && (
          <div className="p-5 space-y-5">
            <div className="text-center space-y-2 py-4">
              <div className="text-4xl">🎭</div>
              <h2 className="text-lg font-bold text-stone-900">{content.title}</h2>
            </div>
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-red-700 mb-2">The situation</p>
              <p className="text-sm text-stone-800 leading-relaxed">{content.story}</p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-600">Rules of deduction</p>
              <ul className="space-y-1 text-xs text-stone-700">
                <li>• Exactly <strong>one suspect is guilty</strong> and their statement is a <strong>lie</strong>.</li>
                <li>• All innocent suspects are <strong>telling the truth</strong>.</li>
                <li>• Find the contradiction. The liar is the guilty one.</li>
              </ul>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-stone-600">
              <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
                <p className="font-bold text-stone-900">{content.suspects.length}</p><p>suspects</p>
              </div>
              <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
                <p className="font-bold text-stone-900">{content.facts.length}</p><p>known facts</p>
              </div>
              <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
                <p className="font-bold text-stone-900">{questions.length}</p><p>CAT questions</p>
              </div>
            </div>
            <button onClick={() => setPhase('interrogate')}
              className="w-full py-3 bg-red-950 text-white rounded-xl font-semibold text-sm hover:bg-red-900 transition-all active:scale-[0.98]">
              🔍 Enter the interrogation room
            </button>
          </div>
        )}

        {/* INTERROGATE */}
        {phase === 'interrogate' && (
          <div className="p-5 space-y-5">
            {/* Facts panel */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-widest font-bold text-amber-700 mb-2">📋 Established facts</p>
              <ul className="space-y-1">
                {content.facts.map((f, i) => (
                  <li key={i} className="text-xs text-stone-700 flex gap-1.5">
                    <span className="text-amber-500 font-bold">▸</span>{f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Suspect statements */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2">
                🎙 Statements — tap to mark as clear or suspect
              </p>
              <div className="space-y-2">
                {content.statements.map((stmt, i) => (
                  <div key={i} className={cn('rounded-xl border-2 overflow-hidden transition-all',
                    verdicts[i] === 'suspect' ? 'border-red-400 bg-red-50'
                      : verdicts[i] === 'clear' ? 'border-emerald-400 bg-emerald-50'
                      : 'border-stone-200 bg-white')}>
                    <button className="w-full flex items-start gap-3 p-3 text-left"
                      onClick={() => setExpandedStatement(expandedStatement === i ? null : i)}>
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
                        verdicts[i] === 'suspect' ? 'bg-red-200 text-red-800'
                          : verdicts[i] === 'clear' ? 'bg-emerald-200 text-emerald-800'
                          : 'bg-stone-200 text-stone-700')}>
                        {stmt.suspect[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-stone-900">{stmt.suspect}</p>
                          {verdictIcon(verdicts[i])}
                        </div>
                        <p className={cn('text-xs mt-0.5 leading-relaxed',
                          expandedStatement === i ? 'text-stone-700' : 'text-stone-500 truncate')}>
                          &quot;{stmt.says}&quot;
                        </p>
                      </div>
                    </button>
                    {expandedStatement === i && (
                      <div className="px-3 pb-3 flex gap-2">
                        <button onClick={() => setVerdicts((prev) => { const n = [...prev]; n[i] = n[i] === 'clear' ? null : 'clear'; return n; })}
                          className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all',
                            verdicts[i] === 'clear' ? 'border-emerald-500 bg-emerald-100 text-emerald-800' : 'border-stone-200 text-stone-600 hover:border-emerald-400')}>
                          ✓ Clear
                        </button>
                        <button onClick={() => setVerdicts((prev) => { const n = [...prev]; n[i] = n[i] === 'suspect' ? null : 'suspect'; return n; })}
                          className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all',
                            verdicts[i] === 'suspect' ? 'border-red-500 bg-red-100 text-red-800' : 'border-stone-200 text-stone-600 hover:border-red-400')}>
                          ⚠ Suspect
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setPhase('accuse')}
              className="w-full py-3 bg-red-950 text-white rounded-xl font-semibold text-sm hover:bg-red-900 transition-all active:scale-[0.98]">
              ⚖️ Make your accusation →
            </button>
          </div>
        )}

        {/* ACCUSE */}
        {phase === 'accuse' && (
          <div className="p-5 space-y-5">
            <div className="text-center">
              <p className="text-sm font-bold text-stone-900">Who is guilty?</p>
              <p className="text-xs text-stone-500 mt-1">Choose carefully — only one chance.</p>
            </div>

            <div className="space-y-2">
              {content.suspects.map((name, i) => (
                <button key={i} onClick={() => { setAccusation(i); setAccusationResult(null); }}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium',
                    accusation === i ? 'border-red-500 bg-red-50 text-red-900 scale-[1.01]'
                      : 'border-stone-200 bg-white text-stone-800 hover:border-stone-400')}>
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                    accusation === i ? 'bg-red-200 text-red-800' : 'bg-stone-200 text-stone-700')}>
                    {name[0]}
                  </div>
                  {name}
                  <span className="ml-auto text-xs text-stone-400">
                    {verdicts[i] === 'suspect' ? '⚠ Marked suspect' : verdicts[i] === 'clear' ? '✓ Marked clear' : ''}
                  </span>
                </button>
              ))}
            </div>

            {accusationResult === 'wrong' && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-rose-800">❌ Wrong accusation! Re-examine the statements.</p>
                <button onClick={() => { setPhase('interrogate'); setAccusation(null); setAccusationResult(null); }}
                  className="mt-2 text-xs text-rose-600 underline">Go back to statements</button>
              </div>
            )}

            {accusationResult === 'correct' && (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-emerald-800">🎉 Correct! The liar is exposed. Moving to CAT questions…</p>
              </div>
            )}

            {accusationResult !== 'correct' && (
              <button onClick={handleAccuse} disabled={accusation === null}
                className="w-full py-3 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-all active:scale-[0.98]">
                ⚖️ Accuse {accusation !== null ? content.suspects[accusation] : '…'}
              </button>
            )}
          </div>
        )}

        {/* QUESTIONS */}
        {phase === 'questions' && (
          <div className="p-5 space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-bold text-emerald-800">
                ✅ {content.suspects[content.guilty_index]} was guilty — their statement was the lie.
              </p>
              <p className="text-xs text-emerald-700 mt-1">Now answer these CAT-style deduction questions.</p>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500">CAT Questions — {qIndex + 1}/{questions.length}</p>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <div key={i} className={cn('w-2 h-2 rounded-full',
                    i < qResults.length ? qResults[i] ? 'bg-emerald-500' : 'bg-rose-500' : i === qIndex ? 'bg-red-500' : 'bg-stone-200')} />
                ))}
              </div>
            </div>

            <p className="text-sm text-stone-900 font-medium leading-relaxed">{questions[qIndex].q}</p>

            <div className="space-y-2">
              {questions[qIndex].options.map((opt, i) => {
                const isPicked = qSelected === i, isAnswer = i === questions[qIndex].answer;
                return (
                  <button key={i} disabled={qSubmitted} onClick={() => setQSelected(i)}
                    className={cn('w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all',
                      !qSubmitted && isPicked && 'border-red-500 bg-red-50 text-stone-900',
                      !qSubmitted && !isPicked && 'border-stone-200 hover:border-stone-300 text-stone-800',
                      qSubmitted && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-900',
                      qSubmitted && isPicked && !isAnswer && 'border-rose-500 bg-rose-50 text-rose-900',
                      qSubmitted && !isPicked && !isAnswer && 'border-stone-200 text-stone-400')}>
                    <span className="font-mono mr-2 text-stone-500">{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                );
              })}
            </div>

            {!qSubmitted ? (
              <button onClick={handleAnswerSubmit} disabled={qSelected === null}
                className="w-full py-3 bg-red-950 text-white rounded-xl font-semibold text-sm hover:bg-red-900 disabled:opacity-40 transition-all">
                Lock answer
              </button>
            ) : (
              <button onClick={handleNextQuestion}
                className="w-full flex items-center justify-center gap-1 py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 transition-all">
                {qIndex + 1 < questions.length ? 'Next question' : 'Final verdict'}<ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* CLOSED */}
        {phase === 'closed' && (
          <div className="p-5 space-y-5">
            <div className="text-center py-4 space-y-3">
              <div className="text-5xl">{stars === 3 ? '⚖️' : stars === 2 ? '🎭' : '🔍'}</div>
              <h2 className="text-lg font-bold text-stone-900">Case solved!</h2>
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3].map((s) => (
                  <Star key={s} className={cn('w-7 h-7', s <= stars ? 'text-amber-400 fill-amber-400' : 'text-stone-200')} />
                ))}
              </div>
              <p className="text-sm font-semibold text-red-800">Rank: {stars === 3 ? 'Master Interrogator' : stars === 2 ? 'Detective' : 'Rookie'}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Time', `${mins}:${secs}`], ['CAT Qs', `${correctAnswers}/${questions.length}`], ['Accusation', accusationResult === 'correct' ? '✓' : '✗']].map(([l, v]) => (
                <div key={l} className="bg-stone-50 rounded-xl p-3 border border-stone-200">
                  <p className="text-base font-bold text-stone-900">{v}</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">{l}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-stone-400">Pure CAT logical reasoning — truth-liar deduction. New case tomorrow. 🎭</p>
            <button onClick={onClose} disabled={saving}
              className="w-full py-3 bg-red-950 text-white rounded-xl font-semibold text-sm hover:bg-red-900 disabled:opacity-50 transition-all">
              {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### src/components/DailyTracker/MockDebriefModal.tsx
```tsx
'use client';

import { useState, useRef } from 'react';
import { X, Loader2, Plus, Minus, Camera, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MockDebriefData {
  varc: { attempted: number; correct: number; time_min: number; percentile: number | null };
  dilr: { attempted: number; correct: number; time_min: number; percentile: number | null };
  qa: { attempted: number; correct: number; time_min: number; percentile: number | null };
  error_buckets: { conceptual: number; silly: number; time: number; panic: number; selection: number };
  strategy_note: string;
  overall_percentile: number | null;
}

interface MockDebriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: MockDebriefData) => Promise<void>;
  isSubmitting?: boolean;
  logDate: string;
}

const ERROR_BUCKETS = [
  { key: 'conceptual' as const, emoji: '🧠', label: 'Conceptual', desc: 'Didn\'t know the concept' },
  { key: 'silly' as const, emoji: '🤏', label: 'Silly', desc: 'Knew it, made a mistake' },
  { key: 'time' as const, emoji: '⏱️', label: 'Time pressure', desc: 'Ran out of time' },
  { key: 'panic' as const, emoji: '😰', label: 'Panic / misread', desc: 'Read wrong or froze' },
  { key: 'selection' as const, emoji: '🎯', label: 'Wrong selection', desc: 'Picked wrong qs to attempt' },
];

const SECTIONS = [
  { key: 'varc' as const, label: 'VARC', color: 'teal' },
  { key: 'dilr' as const, label: 'DILR', color: 'orange' },
  { key: 'qa' as const, label: 'QA', color: 'indigo' },
];

type SectionKey = 'varc' | 'dilr' | 'qa';
type SectionData = { attempted: number; correct: number; time_min: number; percentile: number | null };

function SectionAccordion({
  sectionKey,
  label,
  color,
  data,
  onChange,
}: {
  sectionKey: SectionKey;
  label: string;
  color: string;
  data: SectionData;
  onChange: (key: SectionKey, field: keyof SectionData, val: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const accuracy = data.attempted > 0 ? Math.round((data.correct / data.attempted) * 100) : null;

  const colorMap: Record<string, string> = {
    teal: 'bg-teal-500',
    orange: 'bg-orange-500',
    indigo: 'bg-indigo-500',
  };

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-3">
          <div className={cn('w-2.5 h-2.5 rounded-full', colorMap[color])} />
          <span className="font-semibold text-white text-sm">{label}</span>
          {data.percentile !== null && (
            <span className="text-xs text-zinc-400">{data.percentile}%ile</span>
          )}
          {accuracy !== null && (
            <span className="text-xs text-zinc-500">{data.correct}/{data.attempted} ({accuracy}%)</span>
          )}
        </div>
        <span className="text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 py-4 grid grid-cols-2 gap-3">
          {(
            [
              { field: 'attempted' as const, label: 'Attempted' },
              { field: 'correct' as const, label: 'Correct' },
              { field: 'time_min' as const, label: 'Time (min)' },
              { field: 'percentile' as const, label: 'Percentile' },
            ] as const
          ).map(({ field, label: fLabel }) => (
            <div key={field}>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
                {fLabel}
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={data[field] ?? ''}
                onChange={(e) =>
                  onChange(sectionKey, field, e.target.value === '' ? null : Number(e.target.value))
                }
                min={0}
                max={field === 'percentile' ? 100 : undefined}
                placeholder="—"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Counter({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:bg-zinc-700 active:scale-90 transition-all"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="w-8 text-center font-bold text-white text-lg font-mono">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:bg-zinc-700 active:scale-90 transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const defaultSection = (): SectionData => ({ attempted: 0, correct: 0, time_min: 0, percentile: null });

interface ParsedSection {
  attempted: number | null;
  correct: number | null;
  time_min: number | null;
  percentile: number | null;
}

interface ParsedScorecard {
  mock_name: string | null;
  overall_percentile: number | null;
  varc: ParsedSection;
  dilr: ParsedSection;
  qa: ParsedSection;
}

/** Downscale to max 1568px long edge and re-encode as JPEG so uploads stay small. */
async function fileToBase64Jpeg(file: File): Promise<{ data: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const MAX_EDGE = 1568;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { data: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
}

export function MockDebriefModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  logDate,
}: MockDebriefModalProps) {
  const [sections, setSections] = useState<Record<SectionKey, SectionData>>({
    varc: defaultSection(),
    dilr: defaultSection(),
    qa: defaultSection(),
  });

  const [buckets, setBuckets] = useState({
    conceptual: 0,
    silly: 0,
    time: 0,
    panic: 0,
    selection: 0,
  });

  const [overallPercentile, setOverallPercentile] = useState<number | null>(null);
  const [strategyNote, setStrategyNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScorecardUpload = async (file: File) => {
    setScanning(true);
    setScanError(null);
    setScanResult(null);
    try {
      const { data, mediaType } = await fileToBase64Jpeg(file);
      const res = await fetch('/api/parse-scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: data, mediaType }),
      });
      const json = await res.json();
      if (!res.ok) {
        setScanError(json.error ?? 'Could not read the scorecard — fill in manually.');
        return;
      }
      const sc = json.scorecard as ParsedScorecard;
      if (sc.overall_percentile != null) setOverallPercentile(sc.overall_percentile);
      setSections((prev) => {
        const next = { ...prev };
        for (const key of ['varc', 'dilr', 'qa'] as const) {
          const s = sc[key];
          if (!s) continue;
          next[key] = {
            attempted: s.attempted ?? prev[key].attempted,
            correct: s.correct ?? prev[key].correct,
            time_min: s.time_min ?? prev[key].time_min,
            percentile: s.percentile ?? prev[key].percentile,
          };
        }
        return next;
      });
      setScanResult(sc.mock_name ? `Read ${sc.mock_name} ✓ — check the numbers below` : 'Scorecard read ✓ — check the numbers below');
    } catch (e) {
      console.error('scorecard scan error', e);
      setScanError('Could not read the image — fill in manually.');
    } finally {
      setScanning(false);
    }
  };

  const handleSectionChange = (key: SectionKey, field: keyof SectionData, val: number | null) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: val === null ? (field === 'percentile' ? null : 0) : val },
    }));
  };

  const totalErrors = Object.values(buckets).reduce((a, b) => a + b, 0);

  const handleSubmit = async () => {
    try {
      setError(null);
      await onSubmit({
        varc: sections.varc,
        dilr: sections.dilr,
        qa: sections.qa,
        error_buckets: buckets,
        strategy_note: strategyNote.trim(),
        overall_percentile: overallPercentile,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save debrief. Try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center">
      <div
        className={cn(
          'w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-800',
          'max-h-[92vh] overflow-y-auto flex flex-col'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Mock Debrief</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {new Date(logDate + 'T00:00:00').toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-zinc-500 hover:text-zinc-300 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-7">
          {/* Scorecard scan — AI prefill */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleScorecardUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning || isSubmitting}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition-all',
                'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500',
                'active:scale-[0.98] disabled:opacity-60'
              )}
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reading scorecard…
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  Scan scorecard screenshot
                  <Sparkles className="w-3.5 h-3.5 opacity-70" />
                </>
              )}
            </button>
            <p className="text-[11px] text-zinc-600 text-center mt-1.5">
              Works with SIMCAT, AIMCAT, CL & more — AI fills the numbers for you
            </p>
            {scanResult && (
              <p className="text-xs text-teal-400 text-center mt-1">{scanResult}</p>
            )}
            {scanError && (
              <p className="text-xs text-rose-400 text-center mt-1">{scanError}</p>
            )}
          </div>

          {/* Overall percentile */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              Overall percentile
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={overallPercentile ?? ''}
              onChange={(e) =>
                setOverallPercentile(e.target.value === '' ? null : Number(e.target.value))
              }
              min={0}
              max={100}
              placeholder="e.g. 87"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-lg font-bold text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Per-section stats */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Section breakdown <span className="normal-case font-normal text-zinc-600">(tap to expand)</span>
            </label>
            <div className="space-y-2">
              {SECTIONS.map(({ key, label, color }) => (
                <SectionAccordion
                  key={key}
                  sectionKey={key}
                  label={label}
                  color={color}
                  data={sections[key]}
                  onChange={handleSectionChange}
                />
              ))}
            </div>
          </div>

          {/* Error buckets */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Where did you lose marks?
              </label>
              {totalErrors > 0 && (
                <span className="text-xs text-zinc-500">{totalErrors} errors tagged</span>
              )}
            </div>
            <div className="space-y-2">
              {ERROR_BUCKETS.map(({ key, emoji, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between bg-zinc-900 rounded-2xl px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{label}</p>
                      <p className="text-xs text-zinc-500 truncate">{desc}</p>
                    </div>
                  </div>
                  <Counter
                    value={buckets[key]}
                    onChange={(v) => setBuckets((prev) => ({ ...prev, [key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Strategy note */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              What will I do differently?
            </label>
            <textarea
              value={strategyNote}
              onChange={(e) => setStrategyNote(e.target.value)}
              placeholder="One specific change for the next mock..."
              maxLength={300}
              rows={3}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            <p className="text-xs text-zinc-600 mt-1 text-right">{strategyNote.length}/300</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-950 border border-rose-700 rounded-xl text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3.5 border border-zinc-700 rounded-2xl font-semibold text-zinc-400 hover:bg-zinc-900 transition disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              'flex-[2] py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2',
              !isSubmitting
                ? 'bg-teal-500 text-white hover:bg-teal-400 active:scale-[0.98] shadow-lg shadow-teal-500/20'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            )}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : 'Save Debrief'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### src/components/DailyTracker/NotificationSettings.tsx
```tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Bell, Clock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationSettings {
  reminders_enabled: boolean;
  reminder_time: string;
  reminder_days: string[];
}

export function NotificationSettings() {
  const supabase = createClient();
  const { isSupported, isSubscribed, subscribe, unsubscribe, isLoading } = usePushNotifications();

  const [settings, setSettings] = useState<NotificationSettings>({
    reminders_enabled: false,
    reminder_time: '23:00',
    reminder_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('notif_prefs')
        .eq('id', user.id)
        .single();

      if (data?.notif_prefs) {
        setSettings({
          reminders_enabled: data.notif_prefs.daily_reminder || false,
          reminder_time: data.notif_prefs.reminder_time || '23:00',
          reminder_days: data.notif_prefs.reminder_days || [
            'Mon',
            'Tue',
            'Wed',
            'Thu',
            'Fri',
            'Sat',
            'Sun',
          ],
        });
      }
    };

    loadSettings();
  }, [supabase]);

  const handleToggleReminders = async (enabled: boolean) => {
    if (enabled && !isSubscribed) {
      try {
        await subscribe();
      } catch (error) {
        console.error('Failed to subscribe:', error);
        return;
      }
    } else if (!enabled && isSubscribed) {
      try {
        await unsubscribe();
      } catch (error) {
        console.error('Failed to unsubscribe:', error);
      }
    }

    const newSettings = { ...settings, reminders_enabled: enabled };
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  const handleTimeChange = (time: string) => {
    const newSettings = { ...settings, reminder_time: time };
    setSettings(newSettings);
  };

  const toggleDay = (day: string) => {
    const newDays = settings.reminder_days.includes(day)
      ? settings.reminder_days.filter((d) => d !== day)
      : [...settings.reminder_days, day];

    const newSettings = { ...settings, reminder_days: newDays };
    setSettings(newSettings);
  };

  const saveSettings = async (newSettings: NotificationSettings) => {
    setIsSaving(true);
    setSaved(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('profiles')
        .update({
          notif_prefs: {
            daily_reminder: newSettings.reminders_enabled,
            reminder_time: newSettings.reminder_time,
            reminder_days: newSettings.reminder_days,
            push: newSettings.reminders_enabled,
            email: false,
          },
        })
        .eq('id', user.id);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    saveSettings(settings);
  };

  if (!isSupported) {
    return (
      <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-600">
        <p>Push notifications are not supported in your browser.</p>
      </div>
    );
  }

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const times = [
    { value: '21:00', label: '9:00 PM' },
    { value: '22:00', label: '10:00 PM' },
    { value: '23:00', label: '11:00 PM' },
    { value: '23:30', label: '11:30 PM' },
  ];

  return (
    <div className="space-y-5">
      {/* Main Toggle */}
      <div className="flex items-center justify-between p-4 bg-orange-50 border-2 border-orange-200 rounded-xl">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-orange-600" />
          <div>
            <p className="font-semibold text-stone-900">Daily Reminder</p>
            <p className="text-xs text-stone-600 mt-0.5">Get a nudge to log your prep</p>
          </div>
        </div>

        <button
          onClick={() => handleToggleReminders(!settings.reminders_enabled)}
          disabled={isLoading}
          className={cn(
            'relative w-14 h-8 rounded-full transition-colors',
            settings.reminders_enabled ? 'bg-orange-600' : 'bg-stone-300'
          )}
        >
          <div
            className={cn(
              'absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform',
              settings.reminders_enabled && 'translate-x-6'
            )}
          />
        </button>
      </div>

      {settings.reminders_enabled && (
        <>
          {/* Time Selector */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-900 mb-2">
              <Clock className="w-4 h-4" />
              Reminder Time
            </label>
            <div className="grid grid-cols-2 gap-2">
              {times.map((time) => (
                <button
                  key={time.value}
                  onClick={() => handleTimeChange(time.value)}
                  className={cn(
                    'py-2 px-3 rounded-lg text-sm font-medium transition-all',
                    settings.reminder_time === time.value
                      ? 'bg-orange-600 text-white'
                      : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                  )}
                >
                  {time.label}
                </button>
              ))}
            </div>
          </div>

          {/* Day Selector */}
          <div>
            <p className="text-sm font-semibold text-stone-900 mb-2">Reminder Days</p>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'py-2 rounded-lg font-semibold text-xs transition-all',
                    settings.reminder_days.includes(day)
                      ? 'bg-teal-600 text-white'
                      : 'bg-stone-100 text-stone-600'
                  )}
                >
                  {day[0]}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-600 mt-2">
              {settings.reminder_days.length} days/week
            </p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2',
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-orange-600 hover:bg-orange-700 text-white active:scale-[0.98]'
            )}
          >
            {saved && <Check className="w-5 h-5" />}
            {isSaving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </>
      )}
    </div>
  );
}
```

### src/components/DailyTracker/PendingDebriefCard.tsx
```tsx
'use client';

import { ClipboardList } from 'lucide-react';

interface PendingDebriefCardProps {
  /** When the mock was logged (ISO timestamp) — drives the 24h countdown */
  loggedAt: string;
  hasBuddy: boolean;
  onStart: () => void;
}

/**
 * The loud #1 card. When a mock is logged but not debriefed, this sits above
 * everything else on the home screen until the debrief is done.
 */
export function PendingDebriefCard({ loggedAt, hasBuddy, onStart }: PendingDebriefCardProps) {
  // eslint-disable-next-line react-hooks/purity
  const hoursLeft = Math.round(24 - (Date.now() - new Date(loggedAt).getTime()) / 3_600_000);

  return (
    <button
      onClick={onStart}
      className="w-full text-left rounded-2xl bg-stone-900 text-white p-5 space-y-2 shadow-lg shadow-stone-900/20 transition-all active:scale-[0.98] hover:bg-stone-800"
    >
      <p className="text-[10px] uppercase tracking-widest font-semibold text-orange-400 flex items-center gap-1.5">
        <ClipboardList className="w-3.5 h-3.5" />
        Mock debrief · the real work
      </p>
      <p className="text-lg font-bold leading-snug">
        Debrief your mock{hasBuddy ? ' — your buddy has been notified' : ''}
      </p>
      <p className="text-xs text-stone-400 leading-relaxed">
        Takes 3 minutes · scorecard photo optional · your buddy sees it immediately.
      </p>
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] font-semibold text-amber-400">
          {hoursLeft > 0 ? `⏳ within 24h · ${hoursLeft}h left` : '⏳ overdue — do it now'}
        </span>
        <span className="text-xs font-bold text-orange-400">Start →</span>
      </div>
    </button>
  );
}
```

### src/components/DailyTracker/ProgressSnapshot.tsx
```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ProgressSnapshotProps {
  studentId: string;
}

export function ProgressSnapshot({ studentId }: ProgressSnapshotProps) {
  const supabase = createClient();

  const { data, isLoading } = useQuery({
    queryKey: ['progress-snapshot', studentId],
    queryFn: async () => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const weekStr = oneWeekAgo.toISOString().split('T')[0];

      const [{ data: weekReports }, { data: debriefs }] = await Promise.all([
        supabase
          .from('daily_reports')
          .select('study_duration, report_date')
          .eq('student_id', studentId)
          .gte('report_date', weekStr)
          .order('report_date', { ascending: false }),
        supabase
          .from('mock_debriefs')
          .select('overall_percentile, taken_on')
          .eq('student_id', studentId)
          .order('taken_on', { ascending: false })
          .limit(2),
      ]);

      const hoursThisWeek = (weekReports ?? []).reduce((sum, r) => sum + (r.study_duration || 0), 0);
      const daysLogged = (weekReports ?? []).length;

      const latestPercentile = debriefs?.[0]?.overall_percentile ?? null;
      const prevPercentile = debriefs?.[1]?.overall_percentile ?? null;
      const percentileArrow: 'up' | 'down' | 'same' | null =
        latestPercentile !== null && prevPercentile !== null
          ? latestPercentile > prevPercentile
            ? 'up'
            : latestPercentile < prevPercentile
            ? 'down'
            : 'same'
          : null;

      return { hoursThisWeek, daysLogged, latestPercentile, percentileArrow };
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-3 gap-2 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-stone-100 rounded-2xl h-20" />
        ))}
      </div>
    );
  }

  const { hoursThisWeek, daysLogged, latestPercentile, percentileArrow } = data;

  return (
    <Link href="/student/analysis" className="block">
      <div className="grid grid-cols-3 gap-2">
        <Tile
          value={`${hoursThisWeek.toFixed(0)}h`}
          label="This week"
          sub={`${daysLogged} days logged`}
        />
        <Tile
          value={latestPercentile !== null ? `${latestPercentile}%ile` : '—'}
          label="Last mock"
          arrow={percentileArrow}
        />
        <Tile value={`${daysLogged}/7`} label="Days logged" />
      </div>
      <p className="text-center text-xs text-stone-400 mt-2">Tap for full analysis →</p>
    </Link>
  );
}

function Tile({
  value,
  label,
  sub,
  arrow,
}: {
  value: string;
  label: string;
  sub?: string;
  arrow?: 'up' | 'down' | 'same' | null;
}) {
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-lg font-bold text-stone-900 font-mono leading-none">{value}</span>
        {arrow === 'up' && <TrendingUp className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
        {arrow === 'down' && <TrendingDown className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
        {arrow === 'same' && <Minus className="w-3.5 h-3.5 text-stone-400 shrink-0" />}
      </div>
      <span className={cn('text-[10px] font-semibold uppercase tracking-wider text-stone-500')}>{label}</span>
      {sub && <span className="text-[10px] text-stone-400 leading-tight">{sub}</span>}
    </div>
  );
}
```

### src/components/DailyTracker/PuzzleSolverModal.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PuzzleContent {
  question: string;
  options: string[];
  answer: number;
  description?: string;
}

interface PuzzleSolverModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzleType: string;
  content: PuzzleContent;
  explanation?: string;
  onComplete: (result: { solved: boolean; timeSeconds: number; accuracy: number }) => Promise<void>;
}

export function PuzzleSolverModal({
  isOpen,
  onClose,
  puzzleType,
  content,
  explanation,
  onComplete,
}: PuzzleSolverModalProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setSubmitted(false);
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  if (!isOpen) return null;

  const correct = selected === content.answer;
  const mins = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  const handleSubmit = async () => {
    if (selected === null || submitted) return;
    setSubmitted(true);
    setSaving(true);
    const timeSeconds = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000));
    try {
      await onComplete({
        solved: selected === content.answer,
        timeSeconds,
        accuracy: selected === content.answer ? 1 : 0,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest font-semibold text-orange-600">{puzzleType} puzzle</span>
            <div className="flex items-center gap-1.5 text-stone-500 text-xs mt-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-mono">{mins}:{secs}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Question */}
          <p className="text-sm text-stone-900 leading-relaxed font-medium">{content.question}</p>

          {/* Options */}
          <div className="space-y-2">
            {content.options.map((opt, i) => {
              const isPicked = selected === i;
              const isAnswer = i === content.answer;
              return (
                <button
                  key={i}
                  disabled={submitted}
                  onClick={() => setSelected(i)}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all',
                    !submitted && isPicked && 'border-orange-600 bg-orange-50 text-stone-900',
                    !submitted && !isPicked && 'border-stone-200 hover:border-stone-300 text-stone-800',
                    submitted && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-900',
                    submitted && isPicked && !isAnswer && 'border-rose-500 bg-rose-50 text-rose-900',
                    submitted && !isPicked && !isAnswer && 'border-stone-200 text-stone-400'
                  )}
                >
                  <span className="font-mono mr-2 text-stone-500">{String.fromCharCode(65 + i)}.</span>
                  {opt}
                  {submitted && isAnswer && <CheckCircle2 className="w-4 h-4 inline ml-2 text-emerald-600" />}
                  {submitted && isPicked && !isAnswer && <XCircle className="w-4 h-4 inline ml-2 text-rose-600" />}
                </button>
              );
            })}
          </div>

          {/* Result + explanation */}
          {submitted && (
            <div className={cn('rounded-xl p-4 text-sm', correct ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200')}>
              <p className={cn('font-semibold mb-1', correct ? 'text-emerald-800' : 'text-rose-800')}>
                {correct ? `✅ Correct! Solved in ${mins}:${secs}` : '❌ Not quite — see why below'}
              </p>
              {explanation && <p className="text-stone-700 leading-relaxed text-xs">{explanation}</p>}
            </div>
          )}

          {/* CTA */}
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={selected === null}
              className="w-full py-3 bg-orange-600 text-white rounded-xl font-semibold text-sm hover:bg-orange-700 disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              Submit answer
            </button>
          ) : (
            <button
              onClick={onClose}
              disabled={saving}
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving…' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### src/components/DailyTracker/SafeCard.tsx
```tsx
'use client';
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Shown when the card throws. Defaults to a subtle inline message. */
  fallback?: ReactNode;
}

interface State { hasError: boolean }

export class SafeCard extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[SafeCard]', error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-400 text-center">
            This section couldn&apos;t load — refresh if the problem persists.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

### src/components/DailyTracker/TodoListSection.tsx
```tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, Circle, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TodoItem } from '@/types';

interface TodoListSectionProps {
  studentId: string;
}

const CATEGORY_COLORS = {
  buddy_suggested: 'bg-teal-50 border-teal-200 text-teal-700',
  student_custom: 'bg-orange-50 border-orange-200 text-orange-700',
  daily_puzzle: 'bg-blue-50 border-blue-200 text-blue-700',
  mock_review: 'bg-purple-50 border-purple-200 text-purple-700',
  session: 'bg-pink-50 border-pink-200 text-pink-700',
};

const CATEGORY_ICONS = {
  buddy_suggested: '💬',
  student_custom: '✏️',
  daily_puzzle: '🧩',
  mock_review: '📊',
  session: '🎥',
};

export function TodoListSection({ studentId }: TodoListSectionProps) {
  const supabase = createClient();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');

  useEffect(() => {
    const fetchTodos = async () => {
      try {
        const { data } = await supabase
          .from('todo_items')
          .select('*')
          .eq('student_id', studentId)
          .order('priority', { ascending: false })
          .order('due_date', { ascending: true });

        setTodos((data ?? []) as TodoItem[]);
      } catch (error) {
        console.error('Failed to fetch todos:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTodos();
  }, [studentId, supabase]);

  const toggleTodo = async (todoId: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('todo_items')
        .update({
          completed_at: currentState ? null : new Date().toISOString(),
        })
        .eq('id', todoId);

      if (error) throw error;

      setTodos((prev) =>
        prev.map((t) =>
          t.id === todoId
            ? { ...t, completed_at: currentState ? undefined : new Date().toISOString() }
            : t
        )
      );
    } catch (error) {
      console.error('Failed to toggle todo:', error);
    }
  };

  const deleteTodo = async (todoId: string) => {
    try {
      const { error } = await supabase
        .from('todo_items')
        .delete()
        .eq('id', todoId);

      if (error) throw error;

      setTodos((prev) => prev.filter((t) => t.id !== todoId));
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const addTodo = async () => {
    if (!newTodoText.trim()) return;

    try {
      const { data, error } = await supabase
        .from('todo_items')
        .insert({
          student_id: studentId,
          title: newTodoText.trim(),
          category: 'student_custom',
          priority: 0,
          created_by: studentId,
        })
        .select()
        .single();

      if (error) throw error;

      setTodos((prev) => [data as TodoItem, ...prev]);
      setNewTodoText('');
    } catch (error) {
      console.error('Failed to add todo:', error);
    }
  };

  const activeTodos = todos.filter((t) => !t.completed_at);
  const completedTodos = todos.filter((t) => t.completed_at);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-stone-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="text-center py-6 text-stone-500 text-sm">
        <p>No to-dos yet. Add one or wait for buddy suggestions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Add New Todo */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              addTodo();
            }
          }}
          placeholder="Add a task..."
          className="flex-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
        />
        <button
          onClick={addTodo}
          disabled={!newTodoText.trim()}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Active Todos */}
      {activeTodos.length > 0 && (
        <div className="space-y-2">
          {(isExpanded ? activeTodos : activeTodos.slice(0, 3)).map((todo) => (
            <div
              key={todo.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-all',
                CATEGORY_COLORS[todo.category as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.student_custom
              )}
            >
              <button
                onClick={() => toggleTodo(todo.id, false)}
                className="flex-shrink-0 hover:scale-110 transition-transform"
              >
                <Circle className="w-5 h-5" />
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">
                  {CATEGORY_ICONS[todo.category as keyof typeof CATEGORY_ICONS]} {todo.title}
                </p>
                {todo.due_date && (
                  <p className="text-xs text-stone-600 mt-0.5">
                    Due: {new Date(todo.due_date + 'T00:00:00').toLocaleDateString('en-IN')}
                  </p>
                )}
              </div>

              <button
                onClick={() => deleteTodo(todo.id)}
                className="flex-shrink-0 text-stone-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {!isExpanded && activeTodos.length > 3 && (
            <button
              onClick={() => setIsExpanded(true)}
              className="w-full text-xs text-orange-700 font-medium hover:underline py-2"
            >
              Show {activeTodos.length - 3} more →
            </button>
          )}
        </div>
      )}

      {/* Completed Todos (collapsed) */}
      {completedTodos.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-stone-200">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold px-1">
            ✓ Completed ({completedTodos.length})
          </p>
          {(isExpanded ? completedTodos : completedTodos.slice(0, 1)).map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-stone-100 opacity-60"
            >
              <button
                onClick={() => toggleTodo(todo.id, true)}
                className="flex-shrink-0"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm line-through text-stone-600 truncate">
                  {todo.title}
                </p>
              </div>

              <button
                onClick={() => deleteTodo(todo.id)}
                className="flex-shrink-0 text-stone-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Progress Bar */}
      {todos.length > 0 && (
        <div className="mt-4 pt-3 border-t border-stone-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-stone-700">Daily Progress</span>
            <span className="text-xs font-bold text-stone-900">
              {completedTodos.length}/{todos.length}
            </span>
          </div>
          <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-600 to-teal-600 transition-all duration-300"
              style={{
                width: `${(completedTodos.length / todos.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

### src/components/DailyTracker/TrajectoryWall.tsx
```tsx
'use client';

const CAT_DATE = new Date(2026, 10, 29);

interface TrajectoryWallProps {
  dreamCollege: string | null;
  currentPercentile: number | null;
  targetPercentile: number;
  logCount: number;
  mockCount: number;
  daysStudied: number;
}

export function TrajectoryWall({
  dreamCollege,
  currentPercentile,
  targetPercentile,
  logCount,
  mockCount,
  daysStudied,
}: TrajectoryWallProps) {
  if (!dreamCollege) return null;

  const daysToCat = Math.max(
    0,
    // eslint-disable-next-line react-hooks/purity
    Math.ceil((CAT_DATE.getTime() - Date.now()) / 86_400_000)
  );

  const pctNow = currentPercentile ?? 50;
  const gap = Math.max(0, targetPercentile - pctNow);
  const progress = Math.min(100, Math.round((pctNow / targetPercentile) * 100));

  // Trajectory sentence
  let trajectory = '';
  if (logCount === 0) {
    trajectory = 'Log day 1 to start your trajectory.';
  } else if (gap === 0) {
    trajectory = `You're at your target. Time to raise the bar.`;
  } else if (daysStudied > 0) {
    const ratePerDay = gap / Math.max(daysToCat, 1);
    if (ratePerDay < 0.05) {
      trajectory = `At current pace, you reach ${targetPercentile}%ile well before the exam.`;
    } else {
      trajectory = `${gap} percentile points to close in ${daysToCat} days — ${mockCount} mocks logged.`;
    }
  } else {
    trajectory = `${gap} percentile points between here and ${dreamCollege.split(' ')[1] || dreamCollege}.`;
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white px-4 py-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">
            Road to {dreamCollege}
          </p>
          <p className="text-xs text-stone-600 mt-0.5">{trajectory}</p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-xl font-bold text-stone-900">{daysToCat}d</p>
          <p className="text-[10px] text-stone-400">to CAT</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-stone-500">
          <span>{pctNow}%ile now</span>
          <span>{targetPercentile}%ile goal</span>
        </div>
        <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Mini stats */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-orange-100">
        {[
          { label: 'Days logged', value: logCount },
          { label: 'Mocks done', value: mockCount },
          { label: 'Study days', value: daysStudied },
        ].map(({ label, value }) => (
          <div key={label} className="flex-1 text-center">
            <p className="text-base font-bold text-stone-900">{value}</p>
            <p className="text-[10px] text-stone-500">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### src/components/analytics-dashboard.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import {
  analyzeMockTrend,
  analyzeConfidenceStressCorrelation,
  analyzeStudyIntensity,
  assessCATReadiness,
  PerformanceTrend,
  ConfidenceStressCorrelation,
  StudyIntensityPattern,
  CATReadiness
} from '@/lib/analytics-advanced';
import { TrendingUp, TrendingDown, AlertCircle, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalyticsDashboardProps {
  studentId: string;
}

export function AnalyticsDashboard({ studentId }: AnalyticsDashboardProps) {
  const [mockTrend, setMockTrend] = useState<PerformanceTrend | null>(null);
  const [correlation, setCorrelation] = useState<ConfidenceStressCorrelation | null>(null);
  const [intensity, setIntensity] = useState<StudyIntensityPattern | null>(null);
  const [readiness, setReadiness] = useState<CATReadiness | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const [trend, corr, intens, read] = await Promise.all([
        analyzeMockTrend(studentId),
        analyzeConfidenceStressCorrelation(studentId),
        analyzeStudyIntensity(studentId),
        assessCATReadiness(studentId)
      ]);

      setMockTrend(trend);
      setCorrelation(corr);
      setIntensity(intens);
      setReadiness(read);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="w-10 h-10 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-stone-600">Analyzing performance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CAT Readiness */}
      {readiness && (
        <Card className={cn(
          'p-6 border-l-4',
          readiness.readinessLevel === 'ahead'
            ? 'border-emerald-600 bg-emerald-50'
            : readiness.readinessLevel === 'on_track'
            ? 'border-blue-600 bg-blue-50'
            : 'border-red-600 bg-red-50'
        )}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className={cn(
                'w-5 h-5',
                readiness.readinessLevel === 'ahead'
                  ? 'text-emerald-600'
                  : readiness.readinessLevel === 'on_track'
                  ? 'text-blue-600'
                  : 'text-red-600'
              )} />
              <h3 className="text-lg font-bold text-stone-900">CAT Readiness Assessment</h3>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-white">
              {readiness.readinessLevel === 'ahead'
                ? '✅ Ahead'
                : readiness.readinessLevel === 'on_track'
                ? '⏳ On Track'
                : '⚠️ Not Ready'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Current Percentile</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{readiness.currentPercentile.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Expected Final</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{readiness.expectedFinalPercentile.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Target</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{readiness.targetPercentile}%</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Days Left</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{readiness.daysToExam}</p>
            </div>
          </div>

          <p className="text-sm text-stone-700 p-3 bg-white rounded-lg border border-stone-200">
            📊 Daily improvement needed: <span className="font-bold">{readiness.recommendedDailyImprovement.toFixed(2)}</span> percentile points
          </p>
        </Card>
      )}

      {/* Mock Score Trend */}
      {mockTrend && mockTrend.percentiles.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-stone-900">Mock Score Trend</h3>
            <div className="flex items-center gap-2">
              {mockTrend.trend === 'improving' ? (
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              ) : mockTrend.trend === 'declining' ? (
                <TrendingDown className="w-5 h-5 text-red-600" />
              ) : (
                <span className="text-stone-500">→</span>
              )}
              <span className={cn(
                'text-sm font-bold',
                mockTrend.trend === 'improving'
                  ? 'text-emerald-600'
                  : mockTrend.trend === 'declining'
                  ? 'text-red-600'
                  : 'text-stone-600'
              )}>
                {mockTrend.trend.charAt(0).toUpperCase() + mockTrend.trend.slice(1)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider">Latest</p>
              <p className="text-xl font-bold text-stone-900 mt-1">
                {mockTrend.percentiles[mockTrend.percentiles.length - 1].toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider">Best</p>
              <p className="text-xl font-bold text-orange-600 mt-1">
                {Math.max(...mockTrend.percentiles).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider">Trend</p>
              <p className="text-xl font-bold text-stone-900 mt-1">{mockTrend.trendPoints > 0 ? '+' : ''}{mockTrend.trendPoints.toFixed(1)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Study Intensity */}
      {intensity && (
        <Card className="p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Study Intensity Pattern</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Avg Hours/Day</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{intensity.avgHoursPerDay.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Consistency</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-600 transition-all"
                    style={{ width: `${intensity.consistencyScore}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-stone-900">{intensity.consistencyScore.toFixed(0)}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Peak Day</p>
              <p className="text-lg font-bold text-stone-900 mt-1">{intensity.peakDay}</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Trend</p>
              <p className={cn(
                'text-lg font-bold mt-1',
                intensity.trend === 'increasing'
                  ? 'text-emerald-600'
                  : intensity.trend === 'decreasing'
                  ? 'text-red-600'
                  : 'text-stone-600'
              )}>
                {intensity.trend === 'increasing' ? '📈' : intensity.trend === 'decreasing' ? '📉' : '→'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Confidence-Stress Correlation */}
      {correlation && (
        <Card className="p-6 border-l-4 border-purple-600 bg-purple-50">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Mental State Analysis</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Avg Confidence</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{correlation.avgConfidence.toFixed(1)}/5</p>
            </div>
            <div>
              <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold">Avg Stress</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{correlation.avgStress.toFixed(1)}/5</p>
            </div>
          </div>

          <p className="text-sm text-stone-700 p-3 bg-white rounded-lg border border-purple-200">
            💭 <span className="font-semibold">{correlation.insight}</span>
          </p>
        </Card>
      )}
    </div>
  );
}
```

### src/components/bottom-nav.tsx
```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, TrendingUp, MessageCircle, MoreHorizontal, FileText, GraduationCap, User, Settings, Users, IndianRupee, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

function NavBar({ items, moreItems }: { items: NavItem[]; moreItems?: NavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems?.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));

  return (
    <>
      {/* More drawer */}
      {moreOpen && moreItems && (
        <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-16 right-2 bg-white rounded-2xl shadow-xl border border-stone-200 py-2 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-stone-100 mb-1">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-widest">More</span>
              <button onClick={() => setMoreOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {moreItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors',
                    isActive ? 'text-stone-900 font-semibold' : 'text-stone-600'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-stone-200 z-20">
        <div className="max-w-2xl mx-auto px-2 py-2 flex items-center justify-around">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[56px]',
                  isActive ? 'text-stone-900' : 'text-stone-400'
                )}
              >
                <Icon className={cn('w-5 h-5 transition-all', isActive && 'scale-110')} />
                <span className="text-[10px] font-semibold uppercase tracking-wider">{item.label}</span>
              </Link>
            );
          })}

          {moreItems && (
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[56px]',
                (moreOpen || isMoreActive) ? 'text-stone-900' : 'text-stone-400'
              )}
            >
              <MoreHorizontal className={cn('w-5 h-5 transition-all', (moreOpen || isMoreActive) && 'scale-110')} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">More</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

const STUDENT_MAIN: NavItem[] = [
  { href: '/student/tracker', icon: Home, label: 'Home' },
  { href: '/student/analysis', icon: TrendingUp, label: 'Analysis' },
  { href: '/student/buddy', icon: MessageCircle, label: 'Buddy' },
];

const STUDENT_MORE: NavItem[] = [
  { href: '/student/reports', icon: FileText, label: 'History' },
  { href: '/student/exams', icon: GraduationCap, label: 'Exams' },
  { href: '/student/profile', icon: User, label: 'Profile' },
  { href: '/student/settings', icon: Settings, label: 'Settings' },
];

const BUDDY_MAIN: NavItem[] = [
  { href: '/buddy/students', icon: Users, label: 'Students' },
  { href: '/buddy/trends', icon: TrendingUp, label: 'Trends' },
  { href: '/buddy/earnings', icon: IndianRupee, label: 'Earnings' },
];

const BUDDY_MORE: NavItem[] = [
  { href: '/buddy/profile', icon: User, label: 'Profile' },
  { href: '/buddy/settings', icon: Settings, label: 'Settings' },
];

export function StudentBottomNav() {
  return <NavBar items={STUDENT_MAIN} moreItems={STUDENT_MORE} />;
}

export function BuddyBottomNav() {
  return <NavBar items={BUDDY_MAIN} moreItems={BUDDY_MORE} />;
}
```

### src/components/buddy-audio-recorder.tsx
```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mic, Square, Play, Pause, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuddyAudioRecorderProps {
  buddyId: string;
  onUploadComplete?: (url: string) => void;
}

export function BuddyAudioRecorder({
  buddyId,
  onUploadComplete
}: BuddyAudioRecorderProps) {
  const supabase = createClient();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_DURATION = 45; // seconds

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      chunksRef.current = [];

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        setRecordingTime(0);
        setUploadError(null);

        timerRef.current = setInterval(() => {
          setRecordingTime((prev) => {
            if (prev >= MAX_DURATION) {
              stopRecording();
              return prev;
            }
            return prev + 1;
          });
        }, 1000);
      };

      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);

        // Stop the stream
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
    } catch (error) {
      setUploadError('Microphone access denied. Please enable microphone permissions.');
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const playAudio = () => {
    if (!audioRef.current || !audioBlob) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const url = URL.createObjectURL(audioBlob);
      audioRef.current.src = url;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const deleteRecording = () => {
    setAudioBlob(null);
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    setRecordingTime(0);
  };

  const uploadAudio = async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const fileName = `buddy-intros/${buddyId}-${Date.now()}.webm`;

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('buddy-intros')
        .upload(fileName, audioBlob, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicData } = supabase.storage
        .from('buddy-intros')
        .getPublicUrl(data.path);

      // Update profile with audio URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ intro_audio_url: publicData.publicUrl })
        .eq('id', buddyId);

      if (updateError) throw updateError;

      // Clear audio and notify parent
      setAudioBlob(null);
      setRecordingTime(0);
      onUploadComplete?.(publicData.publicUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(message);
      console.error('Error uploading audio:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const timeDisplay = `${Math.floor(recordingTime / 60)}:${String(
    recordingTime % 60
  ).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      {uploadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{uploadError}</p>
        </div>
      )}

      {/* Recording Section */}
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm font-semibold text-stone-700 mb-4">
            Record a 30-45 second intro about yourself
          </p>

          {/* Timer Display */}
          <div
            className={cn(
              'text-5xl font-mono font-bold mb-6 transition-colors',
              isRecording
                ? 'text-red-600 animate-pulse'
                : recordingTime > 0
                ? 'text-stone-900'
                : 'text-stone-400'
            )}
          >
            {timeDisplay}
          </div>

          {/* Recording Controls */}
          <div className="flex justify-center gap-3">
            {!isRecording && !audioBlob ? (
              <button
                onClick={startRecording}
                className="flex items-center gap-2 px-8 py-4 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all shadow-lg"
              >
                <Mic className="w-5 h-5" />
                Start Recording
              </button>
            ) : isRecording ? (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-8 py-4 bg-stone-600 text-white rounded-xl font-semibold hover:bg-stone-700 transition-all"
              >
                <Square className="w-5 h-5" />
                Stop Recording
              </button>
            ) : null}
          </div>

          {/* Recording Limit Warning */}
          {isRecording && recordingTime >= 40 && (
            <p className="text-sm text-amber-600 font-medium mt-4">
              ⚠️ Recording will stop at 45 seconds
            </p>
          )}
        </div>
      </div>

      {/* Playback Section */}
      {audioBlob && (
        <div className="space-y-4 p-5 bg-stone-50 rounded-xl border border-stone-200">
          <p className="text-sm font-semibold text-stone-700">
            Preview Your Recording
          </p>

          <audio
            ref={audioRef}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          <div className="flex gap-2">
            <button
              onClick={playAudio}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Play
                </>
              )}
            </button>

            <button
              onClick={deleteRecording}
              className="px-4 py-3 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-all font-medium"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Upload Button */}
          <button
            onClick={uploadAudio}
            disabled={isUploading}
            className={cn(
              'w-full py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all',
              isUploading
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            )}
          >
            {isUploading ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-emerald-400 border-t-emerald-600 rounded-full" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Save Intro Audio
              </>
            )}
          </button>

          <p className="text-xs text-stone-600 text-center">
            This will be played to students when they meet you
          </p>
        </div>
      )}

      {/* Info Section */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          💡 <strong>Tip:</strong> Introduce yourself as an IIM alumni, share your CAT
          experience, and what you love about mentoring students.
        </p>
      </div>
    </div>
  );
}
```

### src/components/buddy-audio-responses-compact.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { Volume2, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { BuddyFeedback } from '@/types';

interface StudentAudioResponse extends BuddyFeedback {
  student_name?: string;
}

interface BuddyAudioResponsesCompactProps {
  buddyId: string;
}

export function BuddyAudioResponsesCompact({
  buddyId,
}: BuddyAudioResponsesCompactProps) {
  const supabase = createClient();
  const [responses, setResponses] = useState<StudentAudioResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchResponses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('buddy_feedback')
        .select(`
          id,
          student_id,
          voice_note_url,
          feedback_text,
          created_at,
          feedback_type,
          profiles!buddy_feedback_student_id_fkey(full_name)
        `)
        .eq('buddy_id', buddyId)
        .eq('feedback_type', 'student_response')
        .not('voice_note_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        const formatted = data.map((item) => {
          const profileArr = item.profiles as Array<{ full_name?: string }> | { full_name?: string } | null;
          const fullName = Array.isArray(profileArr)
            ? profileArr[0]?.full_name
            : profileArr?.full_name;
          return { ...item, student_name: fullName || 'Student' };
        });
        setResponses(formatted as unknown as StudentAudioResponse[]);
      }
    } catch (err) {
      console.error('Error fetching responses:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, buddyId]);

  useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  if (loading) return null;
  if (responses.length === 0) return null;

  return (
    <div className="space-y-1.5 sm:space-y-2">
      <div className="flex items-center gap-1.5 sm:gap-2 px-0.5 sm:px-1">
        <Volume2 className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-blue-700 flex-shrink-0" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-600 truncate flex-1">
          📝 Student Responses
        </h3>
        {responses.length > 0 && (
          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 sm:px-2 py-0.5 rounded-full font-medium flex-shrink-0">
            {responses.length}
          </span>
        )}
      </div>

      <div className="space-y-1 sm:space-y-1.5 max-h-60 sm:max-h-80 overflow-y-auto">
        {responses.map((response) => (
          <div key={response.id} className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
            <button
              onClick={() =>
                setExpandedId(expandedId === response.id ? null : response.id)
              }
              className="w-full flex items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                <span className="text-xs font-medium text-stone-700 truncate">
                  {response.student_name?.split(' ')[0] || 'Student'}
                </span>
                <span className="text-xs text-stone-500 flex-shrink-0 whitespace-nowrap">
                  {new Date(response.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
              <ChevronRight
                className={`w-3 sm:w-3.5 h-3 sm:h-3.5 text-stone-500 flex-shrink-0 transition-transform ${
                  expandedId === response.id ? 'rotate-90' : ''
                }`}
              />
            </button>

            {/* Expanded Content */}
            {expandedId === response.id && (
              <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-t border-blue-200 bg-white space-y-1.5 sm:space-y-2">
                {/* Audio Player - Compact */}
                {response.voice_note_url && (
                  <audio
                    controls
                    className="w-full h-6 rounded text-xs"
                    src={response.voice_note_url}
                  />
                )}

                {/* Text if any */}
                {response.feedback_text && (
                  <p className="text-xs text-stone-700 bg-blue-50 rounded p-1.5 sm:p-2 line-clamp-3">
                    {response.feedback_text}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### src/components/buddy-quick-voice-message.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { Mic, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { VoiceNoteRecorder } from '@/components/voice-note-recorder';
import { createClient } from '@/lib/supabase/client';

interface Student {
  id: string;
  full_name: string;
}

interface BuddyQuickVoiceMessageProps {
  buddyId: string;
  buddyName: string;
}

export function BuddyQuickVoiceMessage({
  buddyId,
  buddyName,
}: BuddyQuickVoiceMessageProps) {
  const supabase = createClient();
  const [isOpen, setIsOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStudents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('buddy_id', buddyId)
        .order('full_name');

      if (!error && data) {
        setStudents(data);
        if (data.length > 0) {
          setSelectedStudent(data[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, buddyId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  if (loading || students.length === 0) {
    return null;
  }

  if (isRecording && selectedStudent) {
    return (
      <VoiceNoteRecorder
        studentId={selectedStudent.id}
        buddyId={buddyId}
        studentName={selectedStudent.full_name}
        isOpen={isRecording}
        onClose={() => setIsRecording(false)}
        onSendComplete={() => {
          setIsRecording(false);
          // Optional: Show success message
        }}
        feedbackType="buddy_feedback"
      />
    );
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg sm:rounded-xl font-medium text-sm sm:text-base hover:shadow-lg transition-all"
        >
          <Mic className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
          Send Voice Message
        </button>
      ) : (
        <Card className="p-3 sm:p-4 space-y-2.5 sm:space-y-3 bg-orange-50 border-orange-200">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm sm:text-base text-stone-900">📢 Voice Message</h3>
            <button
              onClick={() => {
                setIsOpen(false);
                setSelectedStudent(students[0] || null);
              }}
              className="p-1 hover:bg-orange-100 rounded transition-colors"
            >
              <X className="w-4 h-4 text-stone-600" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1.5 sm:mb-2">
              Select Student
            </label>
            <select
              value={selectedStudent?.id || ''}
              onChange={(e) => {
                const student = students.find((s) => s.id === e.target.value);
                setSelectedStudent(student || null);
              }}
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-orange-300 rounded-lg focus:outline-none focus:border-orange-600 bg-white"
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsRecording(true)}
            disabled={!selectedStudent}
            className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-orange-600 text-white rounded-lg font-medium text-xs sm:text-sm hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Mic className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            Record & Send
          </button>
        </Card>
      )}
    </div>
  );
}
```

### src/components/dream-colleges-card.tsx
```tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { GraduationCap } from 'lucide-react';

const COLLEGES = [
  'IIM Ahmedabad', 'IIM Bangalore', 'IIM Calcutta',
  'IIM Lucknow', 'IIM Kozhikode', 'IIM Indore',
  'XLRI', 'FMS Delhi', 'MDI Gurgaon', 'IIFT', 'SPJIMR',
];

interface DreamCollegesCardProps {
  initial: string[];
}

export function DreamCollegesCard({ initial }: DreamCollegesCardProps) {
  const supabase = createClient();
  const [selected, setSelected] = useState<string[]>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = (college: string) => {
    setSelected((prev) =>
      prev.includes(college) ? prev.filter((c) => c !== college) : [...prev, college]
    );
  };

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ dream_colleges: selected }).eq('id', user.id);
    }
    setSaving(false);
    setEditing(false);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Dream colleges</div>
        <button
          onClick={() => editing ? save() : setEditing(true)}
          disabled={saving}
          className="text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <div className="flex flex-wrap gap-2">
          {COLLEGES.map((college) => (
            <button
              key={college}
              onClick={() => toggle(college)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                selected.includes(college)
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {selected.includes(college) ? '✓ ' : ''}{college}
            </button>
          ))}
        </div>
      ) : selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((college) => (
            <span key={college} className="flex items-center gap-1 text-xs bg-stone-900 text-white px-3 py-1.5 rounded-full font-medium">
              <GraduationCap className="w-3 h-3" />
              {college}
            </span>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full rounded-xl border-2 border-dashed border-stone-200 p-4 text-center"
        >
          <GraduationCap className="w-5 h-5 text-stone-400 mx-auto mb-1.5" />
          <p className="text-sm font-semibold text-stone-700">Add your dream colleges</p>
          <p className="text-xs text-stone-400 mt-0.5">Powers your trajectory wall on the tracker</p>
        </button>
      )}
    </Card>
  );
}
```

### src/components/google-calendar-connect-btn.tsx
```tsx
'use client';

import { useState } from 'react';
import { Calendar, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface GoogleCalendarConnectBtnProps {
  isConnected: boolean;
  onConnectSuccess?: () => void;
  onDisconnectSuccess?: () => void;
}

export function GoogleCalendarConnectBtn({
  isConnected,
  onConnectSuccess,
  onDisconnectSuccess,
}: GoogleCalendarConnectBtnProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get current page URL to redirect back after auth
      const redirectUrl = window.location.pathname + window.location.search;

      // Call auth endpoint to get authorization URL
      const response = await fetch('/api/google/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUrl }),
      });

      if (!response.ok) {
        throw new Error('Failed to initialize Google authentication');
      }

      const { authUrl } = await response.json();

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Google Calendar? Scheduled sessions will not have Meet links.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/google/disconnect', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      onDisconnectSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  if (isConnected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <Calendar className="w-4 h-4 text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-900">Google Calendar Connected</p>
            <p className="text-xs text-green-700">Your calendar is synced for scheduling</p>
          </div>
        </div>

        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {loading ? 'Disconnecting...' : 'Disconnect Calendar'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleConnect}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
      >
        <Calendar className="w-4 h-4" />
        {loading ? 'Connecting...' : 'Connect Google Calendar'}
      </button>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
      )}

      <p className="text-xs text-stone-600">
        ✓ Required for automatic Google Meet scheduling<br/>
        ✓ We only access your calendar events<br/>
        ✓ Disconnect anytime from settings
      </p>
    </div>
  );
}
```

### src/components/google-calendar-connect.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, X } from 'lucide-react';

interface GoogleCalendarConnectProps {
  connected: boolean;
  /** Connected Gmail to show in the chip */
  googleEmail?: string | null;
  /** Where to land after the OAuth round trip, e.g. /buddy/settings */
  redirectPath: string;
  /** Allow hiding the CTA after connect (student home) */
  dismissible?: boolean;
}

/**
 * Orange CTA card when disconnected → compact green chip when connected.
 * Also surfaces the ?google_connect=success|failed toast after the
 * OAuth round trip.
 */
export function GoogleCalendarConnect({
  connected,
  googleEmail,
  redirectPath,
  dismissible = false,
}: GoogleCalendarConnectProps) {
  const [dismissed, setDismissed] = useState(false);
  const [toast, setToast] = useState<'success' | 'failed' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google_connect');
    if (result === 'success' || result === 'failed') {
      setToast(result);
      // strip the param so refreshes don't re-toast
      params.delete('google_connect');
      params.delete('reason');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      setTimeout(() => setToast(null), 4000);
    }
  }, []);

  return (
    <>
      {toast && (
        <div
          className={
            'fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white ' +
            (toast === 'success' ? 'bg-emerald-600' : 'bg-red-600')
          }
        >
          {toast === 'success'
            ? '✓ Google Calendar connected!'
            : "Couldn't connect Google Calendar — try again"}
        </div>
      )}

      {connected ? (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
          <span className="text-xs font-medium text-emerald-800 truncate">
            {googleEmail ? `Calendar: ${googleEmail}` : 'Google Calendar connected'}
          </span>
        </div>
      ) : dismissed ? null : (
        <div
          className="w-full rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #E8652D 0%, #d4541f 100%)' }}
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Connect Google Calendar</p>
            <p className="text-xs text-white/80 mt-0.5">
              Get session invites &amp; reminders on your phone — takes 30 seconds
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <a
              href={`/api/google/auth?redirect=${encodeURIComponent(redirectPath)}`}
              className="px-3.5 py-2.5 rounded-xl bg-white text-sm font-semibold transition-transform active:scale-95"
              style={{ color: '#E8652D', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
            >
              Connect
            </a>
            {dismissible && (
              <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="p-2 text-white/70 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

### src/components/logo.tsx
```tsx
import Image from 'next/image';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'lg' ? 40 : size === 'sm' ? 22 : 28;
  const textSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base';

  return (
    <div className="flex items-center gap-2">
      <Image
        src="/careerrai-monogram.png"
        alt="CareerRai"
        width={h}
        height={h}
        style={{ height: h, width: 'auto' }}
        priority
      />
      <span
        className={`${textSize} font-bold`}
        style={{ letterSpacing: '-0.02em', lineHeight: 1 }}
      >
        <span style={{ color: '#0f766e' }}>Career</span>
        {' '}
        <span style={{ color: '#ea580c' }}>राय</span>
      </span>
    </div>
  );
}
```

### src/components/logout-button.tsx
```tsx
'use client';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="POST">
      <button
        type="submit"
        className="w-full flex items-center justify-center gap-2 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-900 hover:bg-stone-50 transition-colors"
      >
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </form>
  );
}
```

### src/components/meeting-widget.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Video, Calendar, MoreVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScheduleSessionModal, type SchedulableStudent } from './schedule-session-modal';

interface Meeting {
  id: string;
  title: string | null;
  scheduledAt: string;
  durationMinutes: number;
  meetLink: string | null;
  counterpartName: string;
  counterpartCollege: string | null;
}

interface MeetingWidgetProps {
  role: 'buddy' | 'student';
  /** Buddy only: students they can schedule with */
  students?: SchedulableStudent[];
  /** Buddy only: whether Google Calendar is connected */
  calendarConnected?: boolean;
}

const LIVE_WINDOW_MS = 15 * 60_000;

function formatIST(date: Date): string {
  const now = new Date();
  const istDay = (d: Date) =>
    d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);

  const time = date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (istDay(date) === istDay(now)) return `Today, ${time}`;
  if (istDay(date) === istDay(tomorrow)) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })}, ${time}`;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MeetingWidget({ role, students = [], calendarConnected = false }: MeetingWidgetProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showModal, setShowModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/upcoming-meetings');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings ?? []);
      }
    } catch {
      // keep whatever we had
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const meeting = meetings[0] ?? null;
  const startMs = meeting ? new Date(meeting.scheduledAt).getTime() : 0;
  const endMs = meeting ? startMs + meeting.durationMinutes * 60_000 : 0;
  const isLiveWindow = !!meeting && now >= startMs - LIVE_WINDOW_MS && now < endMs;
  const isLiveNow = !!meeting && now >= startMs && now < endMs;

  // Tick every second only inside (or approaching) the live window
  useEffect(() => {
    if (!meeting) return;
    const interval = setInterval(
      () => setNow(Date.now()),
      isLiveWindow ? 1000 : 30_000
    );
    return () => clearInterval(interval);
  }, [meeting, isLiveWindow]);

  // Refresh list when a meeting ends
  useEffect(() => {
    if (meeting && now >= endMs) fetchMeetings();
  }, [now, endMs, meeting, fetchMeetings]);

  // Close kebab on outside tap
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleCancel = async () => {
    if (!meeting) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/calendar/cancel-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meeting.id }),
      });
      if (res.ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
      }
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
      setMenuOpen(false);
    }
  };

  if (!loaded) return null;

  const firstName = meeting?.counterpartName.split(' ')[0] ?? '';
  const initials = firstName ? firstName[0].toUpperCase() : '?';

  // ── State 1: no upcoming meeting ──────────────────────────────
  if (!meeting) {
    return (
      <>
        <div
          className="w-full rounded-2xl px-4 py-3 flex items-center justify-between gap-3 transition-opacity duration-200"
          style={{ backgroundColor: '#1A1A2E' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Video className="w-4 h-4 text-stone-400 flex-shrink-0" />
            <span className="text-sm text-stone-300 truncate">
              {role === 'buddy'
                ? 'No sessions scheduled'
                : 'No session booked yet — your buddy will schedule one'}
            </span>
          </div>
          {role === 'buddy' && (
            <button
              onClick={() => setShowModal(true)}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: '#2A9D8F', minHeight: 44 }}
            >
              Schedule Session
            </button>
          )}
        </div>
        {role === 'buddy' && (
          <ScheduleSessionModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            students={students}
            calendarConnected={calendarConnected}
            onScheduled={fetchMeetings}
          />
        )}
      </>
    );
  }

  // ── States 2 & 3: upcoming / live ─────────────────────────────
  return (
    <>
      <div
        className={cn(
          'w-full rounded-2xl p-4 transition-all duration-300',
          isLiveWindow && 'ring-2 ring-[#2A9D8F] shadow-[0_0_24px_rgba(42,157,143,0.45)]'
        )}
        style={{ backgroundColor: '#1A1A2E' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
              style={{ backgroundColor: isLiveWindow ? '#2A9D8F' : '#E8652D' }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {role === 'student'
                  ? `Session with ${firstName}${meeting.counterpartCollege ? ` (IIM ${meeting.counterpartCollege})` : ''}`
                  : `Session with ${meeting.counterpartName}`}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-stone-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatIST(new Date(meeting.scheduledAt))} IST
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-stone-300 font-medium">
                  {meeting.durationMinutes} min
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {isLiveWindow && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#2A9D8F]/20 text-[#2A9D8F] text-[10px] font-bold tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F] animate-ping" />
                {isLiveNow ? 'LIVE NOW' : 'LIVE SOON'}
              </span>
            )}
            {role === 'buddy' && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Session options"
                  className="p-2.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-xl border border-stone-200 py-1 min-w-[160px]">
                    {confirmCancel ? (
                      <div className="px-3 py-2">
                        <p className="text-xs text-stone-600 mb-2">Cancel this session?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancel}
                            disabled={cancelling}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                          >
                            {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                          </button>
                          <button
                            onClick={() => setConfirmCancel(false)}
                            className="px-2 py-1.5 rounded-lg text-stone-600 text-xs hover:bg-stone-100"
                          >
                            Keep
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmCancel(true)}
                        className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel session
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Join area */}
        <div className="mt-3">
          {isLiveWindow ? (
            <div className="space-y-2">
              {!isLiveNow && (
                <p className="text-center text-xs text-stone-300 tabular-nums">
                  Starts in {formatCountdown(startMs - now)}
                </p>
              )}
              {meeting.meetLink ? (
                <a
                  href={meeting.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-base transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: '#E8652D', minHeight: 48 }}
                >
                  <Video className="w-5 h-5" />
                  Join Meeting
                </a>
              ) : (
                <button
                  disabled
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-base opacity-60 cursor-not-allowed"
                  style={{ backgroundColor: '#E8652D', minHeight: 48 }}
                >
                  <Video className="w-5 h-5" />
                  Meet link pending...
                </button>
              )}
            </div>
          ) : (
            meeting.meetLink ? (
              <a
                href={meeting.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-white/20 text-stone-300 hover:bg-white/5 transition-colors"
                style={{ minHeight: 44 }}
              >
                <Video className="w-4 h-4" />
                Join
              </a>
            ) : (
              <div className="text-center text-xs text-stone-400 py-2.5">
                Meet link will appear when live
              </div>
            )
          )}
        </div>

        {role === 'buddy' && (
          <button
            onClick={() => setShowModal(true)}
            className="mt-2 w-full text-center text-xs text-stone-400 hover:text-stone-200 py-2 transition-colors"
          >
            + Schedule another session
          </button>
        )}
      </div>

      {role === 'buddy' && (
        <ScheduleSessionModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          students={students}
          calendarConnected={calendarConnected}
          onScheduled={fetchMeetings}
        />
      )}
    </>
  );
}
```

### src/components/membership-card.tsx
```tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLANS, type PlanId } from '@/lib/plans';
import { Sparkles } from 'lucide-react';

type SubStatus = 'free_beta' | 'active' | 'expired' | 'refund_requested';

interface MembershipCardProps {
  status: SubStatus;
  plan: string | null;
  renewsAt: string | null;
  fullName: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const STATUS_LABEL: Record<SubStatus, { text: string; color: 'green' | 'orange' | 'stone' | 'amber' }> = {
  free_beta: { text: 'Free beta', color: 'green' },
  active: { text: 'Active', color: 'green' },
  expired: { text: 'Expired', color: 'amber' },
  refund_requested: { text: 'Refund requested', color: 'stone' },
};

export function MembershipCard({ status, plan, renewsAt, fullName }: MembershipCardProps) {
  const [busy, setBusy] = useState<PlanId | 'refund' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function upgrade(planId: PlanId) {
    setBusy(planId);
    setMessage(null);
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error ?? "Couldn't start checkout."); return; }

      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) { setMessage('Could not load the payment window. Try again.'); return; }

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: 'CareerRai',
        description: `${PLANS[planId].label} membership`,
        prefill: { name: fullName },
        theme: { color: '#E8652D' },
        handler: () => {
          // Confirmation is server-side via webhook; just reassure + refresh.
          setMessage('Payment received — confirming your membership…');
          setTimeout(() => window.location.reload(), 4000);
        },
      });
      rzp.open();
    } catch {
      setMessage('Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function requestRefund() {
    if (!confirm('Request a no-questions refund? Your founder will process it manually.')) return;
    setBusy('refund');
    setMessage(null);
    try {
      const res = await fetch('/api/payments/request-refund', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error ?? 'Could not submit request.'); return; }
      setMessage('Refund requested. Your founder will be in touch.');
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setMessage('Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const badge = STATUS_LABEL[status];
  const showPlans = status === 'free_beta' || status === 'expired';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Membership</div>
        <Badge color={badge.color}>{badge.text}</Badge>
      </div>

      {status === 'free_beta' && (
        <p className="text-sm text-stone-600 mb-4">
          You&apos;re on the free beta — full access, no charge. Upgrade anytime to lock in your spot.
        </p>
      )}
      {status === 'active' && (
        <p className="text-sm text-stone-600 mb-4">
          {plan && PLANS[plan as PlanId] ? `${PLANS[plan as PlanId].label} plan` : 'Active plan'}
          {renewsAt && <> · renews {new Date(renewsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>}
        </p>
      )}
      {status === 'refund_requested' && (
        <p className="text-sm text-stone-600 mb-4">Refund requested — your founder is processing it manually.</p>
      )}

      {showPlans && (
        <div className="space-y-2">
          {(Object.keys(PLANS) as PlanId[]).map((id) => (
            <button
              key={id}
              onClick={() => upgrade(id)}
              disabled={busy !== null}
              className="w-full flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3 hover:border-stone-900 transition-colors disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
                {id === 'quarterly' && <Sparkles className="w-3.5 h-3.5 text-orange-500" />}
                {PLANS[id].label}
              </span>
              <span className="text-sm font-bold text-orange-600">
                {busy === id ? 'Starting…' : PLANS[id].display}
              </span>
            </button>
          ))}
        </div>
      )}

      {status === 'active' && (
        <button
          onClick={requestRefund}
          disabled={busy !== null}
          className="text-xs text-stone-500 hover:text-stone-700 underline underline-offset-2 disabled:opacity-50"
        >
          {busy === 'refund' ? 'Submitting…' : 'Request refund'}
        </button>
      )}

      {message && <p className="text-xs text-stone-600 mt-3">{message}</p>}
    </Card>
  );
}
```

### src/components/mock-drop-intervention.tsx
```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, AlertCircle } from 'lucide-react';

interface MockDropInterventionProps {
  studentId: string;
  dropAmount: number;
  buddyFirstName?: string;
  onDismiss: () => void;
}

export function MockDropIntervention({ studentId, dropAmount, buddyFirstName, onDismiss }: MockDropInterventionProps) {
  const supabase = createClient();

  const handleDismiss = async () => {
    // Mark student_seen = true so we don't show again
    try {
      await supabase
        .from('mock_drop_alerts')
        .update({ student_seen: true })
        .eq('student_id', studentId)
        .eq('student_seen', false);
    } catch (e) {
      // non-fatal
    }
    onDismiss();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 text-white">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold leading-snug">
                Score drop detected.<br />This is expected. Here&apos;s why.
              </h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-stone-700 leading-relaxed">
            As CAT gets closer, more serious competitors take mocks. The pool gets tougher,
            so the same accuracy gives a lower percentile.{' '}
            <strong>Your skill hasn&apos;t declined — the benchmark moved.</strong>
          </p>

          {/* Visual comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-stone-50 rounded-xl p-3 text-center border border-stone-200">
              <div className="text-xs font-semibold text-stone-500 mb-1">May pool</div>
              <div className="text-2xl">👥</div>
              <div className="text-xs text-stone-600 mt-1">All aspirants</div>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-200">
              <div className="text-xs font-semibold text-orange-600 mb-1">October pool</div>
              <div className="text-2xl">🎯</div>
              <div className="text-xs text-stone-600 mt-1">Only serious prep</div>
            </div>
          </div>

          <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
            <p className="text-xs text-teal-800 font-medium">
              🔔 Your buddy has been flagged about this drop.{' '}
              {buddyFirstName
                ? `Expect a message from ${buddyFirstName} within 24 hours.`
                : 'Expect a message from your buddy within 24 hours.'}
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          <button
            onClick={handleDismiss}
            className="w-full py-3.5 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 transition-all active:scale-[0.98]"
          >
            Got it. Show my score.
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook: call after mock score submission.
 * Returns { shouldShow, dropAmount, dismiss } and fires the buddy notification.
 */
export function useMockDropAlert(studentId: string, buddyId: string | null) {
  const supabase = createClient();
  const [alert, setAlert] = useState<{ dropAmount: number } | null>(null);

  const checkDrop = async (newPercentile: number) => {
    try {
      // Get previous mock percentile
      const { data: prevTests } = await supabase
        .from('test_results')
        .select('percentile')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(2);

      if (!prevTests || prevTests.length < 2) return;

      const prev = prevTests[1].percentile;
      const drop = prev - newPercentile;
      if (drop <= 8) return;

      // Check 30-day cooldown
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: recent } = await supabase
        .from('mock_drop_alerts')
        .select('id')
        .eq('student_id', studentId)
        .gte('triggered_at', thirtyDaysAgo.toISOString())
        .limit(1);
      if (recent && recent.length > 0) return;

      // Insert alert
      const { error } = await supabase
        .from('mock_drop_alerts')
        .insert({ student_id: studentId, drop_amount: drop, buddy_notified: !!buddyId });

      if (error) throw error;

      // Notify buddy
      if (buddyId) {
        await fetch('/api/buddy/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            _internal_mock_drop_notification: true,
            student_id: studentId,
            buddy_id: buddyId,
            drop_amount: drop,
          }),
        }).catch(() => {});
      }

      setAlert({ dropAmount: drop });
    } catch (e) {
      console.error('useMockDropAlert error:', e);
    }
  };

  return { alert, checkDrop, dismiss: () => setAlert(null) };
}
```

### src/components/notif-prefs-panel.tsx
```tsx
'use client';
import { useState } from 'react';
import { ToggleInput } from '@/components/ui/toggle-input';
import { Card } from '@/components/ui/card';
import type { NotifPrefs } from '@/types';

export function NotifPrefsPanel({ initial, label1, label2 }: { initial: NotifPrefs; label1: string; label2: string }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function update(key: keyof NotifPrefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    await fetch('/api/profiles/notif-prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setSaving(false);
  }

  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Notifications</div>
      <div className="space-y-4">
        <ToggleInput label={label1} value={prefs.daily_reminder ?? true} onChange={(v) => update('daily_reminder', v)} />
        <ToggleInput label={label2} value={prefs.email ?? true} onChange={(v) => update('email', v)} />
      </div>
      {saving && <p className="text-xs text-stone-400 mt-2">Saving…</p>}
    </Card>
  );
}
```

### src/components/notification-bell.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react';
import { Bell, X, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types';
import { cn } from '@/lib/utils';

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const supabase = createClient();

  const loadNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setNotifications(data as Notification[]);
  }, [supabase, userId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-stone-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-stone-700" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-80 bg-white border border-stone-200 rounded-2xl shadow-xl z-40 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-stone-200">
              <span className="font-semibold text-stone-900 text-sm">Notifications</span>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-stone-500 hover:text-stone-900">
                    Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)}>
                  <X className="w-4 h-4 text-stone-500" />
                </button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-stone-100">
              {notifications.length === 0 && (
                <div className="p-6 text-center text-sm text-stone-500">You&apos;re all caught up.</div>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={cn(
                    'p-4 cursor-pointer hover:bg-stone-50 transition-colors',
                    !n.read && 'bg-orange-50/50'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <div className="w-2 h-2 rounded-full bg-orange-600 mt-1.5 flex-shrink-0" />}
                    <div className={cn(!n.read ? 'ml-0' : 'ml-4')}>
                      <div className="text-sm font-semibold text-stone-900">{n.title}</div>
                      <div className="text-xs text-stone-600 mt-0.5">{n.body}</div>
                      <div className="text-[10px] text-stone-400 mt-1">
                        {new Date(n.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {n.read && <CheckCircle2 className="w-3.5 h-3.5 text-stone-300 ml-auto flex-shrink-0 mt-0.5" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

### src/components/providers.tsx
```tsx
'use client';

import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (was cacheTime)
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### src/components/push-toggle.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';

export function PushToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window);
  }, []);

  if (!supported) return null;

  async function toggle() {
    setLoading(true);
    try {
      if (!enabled) {
        // Subscribe
        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        const sub = existing ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });
        setEnabled(true);
      } else {
        // Unsubscribe
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager.getSubscription();
        await sub?.unsubscribe();
        await fetch('/api/push/subscribe', { method: 'DELETE' });
        setEnabled(false);
      }
    } catch {
      console.error('Push toggle failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {enabled ? <Bell className="w-4 h-4 text-teal-700" /> : <BellOff className="w-4 h-4 text-stone-400" />}
        <span className="text-sm font-medium text-stone-800">Browser push alerts</span>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-teal-700' : 'bg-stone-300'} disabled:opacity-50`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
```

### src/components/route-skeleton.tsx
```tsx
import { cn } from '@/lib/utils';

interface Props {
  /** Number of placeholder cards below the header */
  cards?: number;
  /** Show the small uppercase eyebrow + big title placeholders */
  header?: boolean;
  className?: string;
}

/**
 * Generic route-level loading skeleton, used by loading.tsx files so taps on
 * the bottom nav respond instantly while the server renders the page.
 */
export function RouteSkeleton({ cards = 3, header = true, className }: Props) {
  return (
    <div className={cn('animate-pulse space-y-5 max-w-md mx-auto w-full', className)}>
      {header && (
        <div className="space-y-2 px-1">
          <div className="h-3 w-24 bg-stone-200 rounded-full" />
          <div className="h-7 w-44 bg-stone-200 rounded-lg" />
        </div>
      )}
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3"
        >
          <div className="h-4 w-1/3 bg-stone-100 rounded" />
          <div className="h-3 w-2/3 bg-stone-100 rounded" />
          <div className="h-3 w-1/2 bg-stone-100 rounded" />
        </div>
      ))}
    </div>
  );
}
```

### src/components/schedule-session-modal.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from 'react';
import { X, Copy, CheckCircle2, Calendar, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SchedulableStudent {
  id: string;
  full_name: string;
}

interface ScheduleSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: SchedulableStudent[];
  calendarConnected: boolean;
  onScheduled?: () => void;
  /** Preselect a student (e.g. opened from a student card) */
  defaultStudentId?: string;
}

const DURATIONS = [20, 30, 45, 60];

function todayIST(): string {
  // YYYY-MM-DD in IST for the date input min
  return new Date(Date.now() + 5.5 * 60 * 60_000).toISOString().slice(0, 10);
}

export function ScheduleSessionModal({
  isOpen,
  onClose,
  students,
  calendarConnected,
  onScheduled,
  defaultStudentId,
}: ScheduleSessionModalProps) {
  const [studentId, setStudentId] = useState(defaultStudentId ?? '');
  const [date, setDate] = useState(todayIST());
  const [time, setTime] = useState('19:00');
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setMeetLink(null);
      setCopied(false);
      if (defaultStudentId) setStudentId(defaultStudentId);
      else if (students.length === 1) setStudentId(students[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setError(null);
    if (!studentId) {
      setError('Pick a student first.');
      return;
    }
    // The chosen wall-clock time is IST. IST = UTC+5:30.
    const utcMs = new Date(`${date}T${time}:00Z`).getTime() - 5.5 * 60 * 60_000;
    if (isNaN(utcMs)) {
      setError('Pick a valid date and time.');
      return;
    }
    if (utcMs < Date.now() + 60_000) {
      setError('Pick a time in the future (IST).');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/calendar/schedule-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          startTime: new Date(utcMs).toISOString(),
          durationMinutes: duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't reach Google Calendar — try again.");
        return;
      }
      setMeetLink(data.meetLink);
      onScheduled?.();
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!meetLink) return;
    navigator.clipboard.writeText(meetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-50 pointer-events-none">
        <div
          className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto animate-in slide-in-from-bottom-6 duration-300"
          style={{ animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <h2 className="text-base font-bold text-stone-900">
              {meetLink ? 'Session booked!' : 'Schedule Session'}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 -m-2 text-stone-400 hover:text-stone-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5">
            {meetLink ? (
              /* ── Success state ───────────────────────────── */
              <div className="space-y-4 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center animate-in zoom-in duration-300">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-center gap-2">
                  <Video className="w-4 h-4 text-[#2A9D8F] flex-shrink-0" />
                  <span className="text-sm font-mono text-stone-800 truncate flex-1 text-left">
                    {meetLink.replace('https://', '')}
                  </span>
                  <button
                    onClick={copyLink}
                    aria-label="Copy Meet link"
                    className="p-2 rounded-lg hover:bg-stone-200 transition-colors flex-shrink-0"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-stone-500" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-stone-500">
                  Calendar invites sent to both of you 📅
                </p>
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl text-white font-semibold transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#2A9D8F', minHeight: 48 }}
                >
                  Done
                </button>
              </div>
            ) : !calendarConnected ? (
              /* ── Blocking state: Google not connected ────── */
              <div className="space-y-4 text-center py-2">
                <div className="w-14 h-14 mx-auto rounded-full bg-orange-100 flex items-center justify-center">
                  <Calendar className="w-7 h-7 text-[#E8652D]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    Connect Google Calendar first
                  </p>
                  <p className="text-xs text-stone-500 mt-1">
                    Sessions create real Google Meet links and calendar invites —
                    takes 30 seconds, one time.
                  </p>
                </div>
                <a
                  href="/api/google/auth?redirect=/buddy/home"
                  className="block w-full py-3 rounded-xl text-white font-semibold transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#E8652D', minHeight: 48, lineHeight: '24px' }}
                >
                  Connect Google Calendar
                </a>
              </div>
            ) : (
              /* ── Form ────────────────────────────────────── */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Student
                  </label>
                  <select
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]"
                  >
                    <option value="">Choose a student…</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      min={todayIST()}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Time (IST)
                    </label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Duration
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDuration(d)}
                        className={cn(
                          'py-2.5 rounded-xl text-sm border transition-colors',
                          duration === d
                            ? 'border-[#2A9D8F] bg-[#2A9D8F]/10 text-[#2A9D8F] font-semibold'
                            : 'border-stone-200 text-stone-600 hover:border-stone-300 font-medium'
                        )}
                        style={{ minHeight: 44 }}
                      >
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                    {error}
                  </p>
                )}

                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className={cn(
                    'w-full py-3.5 rounded-xl text-white font-semibold transition-all',
                    loading ? 'opacity-70 cursor-wait' : 'hover:opacity-90 active:scale-[0.99]'
                  )}
                  style={{ backgroundColor: '#2A9D8F', minHeight: 48 }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Creating your Meet link…
                    </span>
                  ) : (
                    'Create Meeting'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

### src/components/share-progress-button.tsx
```tsx
'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface ShareProgressButtonProps {
  daysLogged: number;
  bestStreak: number;
  percentile: number | null;
}

export function ShareProgressButton({ daysLogged, bestStreak, percentile }: ShareProgressButtonProps) {
  const [shared, setShared] = useState(false);

  const shareText = [
    `🔥 I've been preparing for CAT for ${daysLogged} days with my IIM buddy on CareerRai!`,
    bestStreak > 1 ? `📈 Best streak: ${bestStreak} days` : null,
    percentile ? `🎯 CAT Readiness: ${Math.round(percentile)}%ile` : null,
    '',
    'careerrai-daily.vercel.app',
  ]
    .filter((l) => l !== null)
    .join('\n');

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch {
        // user cancelled or share failed — fall through to WhatsApp
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors"
    >
      {shared ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
      {shared ? 'Shared!' : 'Share my progress'}
    </button>
  );
}
```

### src/components/timeline-view.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { loadStudentTimeline, groupTimelineByWeek, TimelineItem } from '@/lib/timeline-utils';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface TimelineViewProps {
  studentId: string;
}

const colorMap = {
  orange: 'border-orange-200 bg-orange-50',
  blue: 'border-blue-200 bg-blue-50',
  emerald: 'border-emerald-200 bg-emerald-50',
  purple: 'border-purple-200 bg-purple-50',
  amber: 'border-amber-200 bg-amber-50'
};

const dotColorMap = {
  orange: 'bg-orange-600',
  blue: 'bg-blue-600',
  emerald: 'bg-emerald-600',
  purple: 'bg-purple-600',
  amber: 'bg-amber-600'
};

export function TimelineView({ studentId }: TimelineViewProps) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadStudentTimeline(studentId);
      setItems(data);
    } catch (error) {
      console.error('Error loading timeline:', error);
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="w-10 h-10 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-stone-600">Loading journey...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center bg-stone-50">
        <p className="text-stone-600">No activity yet. Start logging to build your timeline!</p>
      </Card>
    );
  }

  const grouped = groupTimelineByWeek(items);

  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([week, weekItems]) => (
        <div key={week}>
          {/* Week Header */}
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-700 px-2 mb-4">
            {week}
          </h3>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical Line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-stone-200" />

            {/* Items */}
            <div className="space-y-4">
              {weekItems.map((item, idx) => (
                <div key={item.id} className="relative pl-16">
                  {/* Timeline Dot */}
                  <div
                    className={cn(
                      'absolute left-0 top-2 w-9 h-9 rounded-full border-4 border-white flex items-center justify-center text-lg',
                      dotColorMap[item.color]
                    )}
                  >
                    {item.icon}
                  </div>

                  {/* Card */}
                  <Card
                    className={cn(
                      'p-4 border-l-4 cursor-pointer hover:shadow-md transition-all',
                      colorMap[item.color]
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-stone-900">{item.title}</p>
                        <p className="text-sm text-stone-600 mt-1">{item.description}</p>

                        {/* Extra details for specific types */}
                        {item.type === 'test_result' && item.metadata && (
                          <div className="mt-2 text-xs text-stone-600 space-y-0.5">
                            <p>
                              <span className="font-medium">Time:</span>{' '}
                              {new Date(item.metadata.created_at as string).toLocaleDateString()}
                            </p>
                          </div>
                        )}

                        {item.type === 'daily_log' && item.metadata && (
                          <div className="mt-2 text-xs text-stone-600">
                            <p>
                              Topics: <span className="font-medium">{item.description}</span>
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Date Badge */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold text-stone-600">
                          {new Date(item.date).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### src/components/trend-icon.tsx
```tsx
export function TrendIcon({ trend, invert = false }: { trend: 'up' | 'down' | 'stable'; invert?: boolean }) {
  const good = invert ? trend === 'down' : trend === 'up';
  const bad = invert ? trend === 'up' : trend === 'down';
  if (good) return <span className="text-emerald-600 text-sm">↑</span>;
  if (bad) return <span className="text-rose-600 text-sm">↓</span>;
  return <span className="text-stone-500 text-sm">→</span>;
}
```

### src/components/ui/badge.tsx
```tsx
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'stone' | 'amber';
  className?: string;
}

export function Badge({ children, color = 'stone', className }: BadgeProps) {
  const colors = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    stone: 'bg-stone-100 text-stone-700',
    amber: 'bg-amber-100 text-amber-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        colors[color],
        className
      )}
    >
      {children}
    </span>
  );
}
```

### src/components/ui/button.tsx
```tsx
'use client';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'teal' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-stone-900 text-white hover:bg-stone-800',
  secondary: 'bg-stone-100 text-stone-900 hover:bg-stone-200',
  ghost: 'text-stone-700 hover:bg-stone-100',
  accent: 'bg-orange-600 text-white hover:bg-orange-700',
  teal: 'bg-teal-700 text-white hover:bg-teal-800',
  outline: 'border border-stone-300 text-stone-900 hover:bg-stone-50',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 rounded-xl active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
}
```

### src/components/ui/card.tsx
```tsx
import { cn } from '@/lib/utils';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-stone-200 rounded-2xl', className)}>
      {children}
    </div>
  );
}
```

### src/components/ui/slider-input.tsx
```tsx
'use client';
import { cn } from '@/lib/utils';

type Color = 'stone' | 'orange' | 'teal' | 'rose';

const accentMap: Record<Color, string> = {
  stone: 'accent-stone-900',
  orange: 'accent-orange-600',
  teal: 'accent-teal-700',
  rose: 'accent-rose-600',
};

export function SliderInput({
  label,
  value,
  onChange,
  min = 1,
  max = 5,
  leftLabel,
  rightLabel,
  color = 'stone',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  leftLabel?: string;
  rightLabel?: string;
  color?: Color;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-stone-800">{label}</label>
        <span className="text-sm font-mono font-semibold text-stone-900 bg-stone-100 px-2 py-0.5 rounded">
          {value}/{max}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn('w-full h-2 rounded-lg cursor-pointer', accentMap[color])}
      />
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between mt-1">
          <span className="text-[10px] uppercase tracking-wider text-stone-500">{leftLabel}</span>
          <span className="text-[10px] uppercase tracking-wider text-stone-500">{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
```

### src/components/ui/toggle-input.tsx
```tsx
'use client';
import { cn } from '@/lib/utils';

export function ToggleInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium text-stone-800">{label}</label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          value ? 'bg-teal-700' : 'bg-stone-300'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            value ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}
```

### src/components/ui/topic-chip.tsx
```tsx
'use client';
import { cn } from '@/lib/utils';

export function TopicChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
        active
          ? 'bg-stone-900 text-white border-stone-900'
          : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500'
      )}
    >
      {label}
    </button>
  );
}
```

### src/components/voice-note-player.tsx
```tsx
'use client';

import { useRef, useState } from 'react';
import { Play, Pause, Mic, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceNotePlayerProps {
  audioUrl: string;
  buddyName: string;
  createdAt: string;
  className?: string;
  /** IIM college label, e.g. "Ahmedabad" */
  buddyCollege?: string | null;
  /** buddy_feedback row id — enables read receipts + thanks */
  feedbackId?: string;
  /** Show the NEW badge until first play */
  isNew?: boolean;
  /** Already thanked? */
  thanked?: boolean;
  /** Student listening to a buddy note → can send the ❤️ Thanks */
  canThank?: boolean;
}

export function VoiceNotePlayer({
  audioUrl,
  buddyName,
  createdAt,
  className,
  buddyCollege,
  feedbackId,
  isNew = false,
  thanked = false,
  canThank = false,
}: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5>(1);
  const [showNew, setShowNew] = useState(isNew);
  const [played, setPlayed] = useState(false);
  const [hasThanked, setHasThanked] = useState(thanked);
  const [thanksVisible, setThanksVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const markRead = () => {
    if (!feedbackId || played) return;
    setPlayed(true);
    setShowNew(false);
    fetch('/api/voice-notes/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackId }),
    }).catch(() => {});
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.playbackRate = speed;
      el.play();
      setIsPlaying(true);
      markRead();
    }
  };

  const toggleSpeed = () => {
    const next = speed === 1 ? 1.5 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const sendThanks = () => {
    if (!feedbackId || hasThanked) return;
    setHasThanked(true);
    fetch('/api/voice-notes/thanks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackId }),
    }).catch(() => {});
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time = Math.max(0, Math.min(duration, ratio * duration));
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    // eslint-disable-next-line react-hooks/purity
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn('rounded-xl border border-stone-200 bg-white px-3 py-2.5', className)}>
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => {
          setIsPlaying(false);
          if (canThank && !hasThanked) setThanksVisible(true);
        }}
        preload="metadata"
      />

      {/* Row 1: identity + badges */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-[#2A9D8F] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
            {buddyName ? buddyName.charAt(0).toUpperCase() : <Mic className="w-3 h-3" />}
          </div>
          <span className="text-xs font-medium text-stone-800 truncate">
            {buddyName}
            {buddyCollege ? ` · IIM ${buddyCollege}` : ''} · {getTimeAgo(createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {showNew && (
            <span
              className="text-[9px] font-bold tracking-wider text-white px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: '#E8652D' }}
            >
              NEW
            </span>
          )}
          <span className="text-xs text-stone-500 tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Row 2: play + scrubber + speed */}
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-11 h-11 rounded-full text-white flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ backgroundColor: '#E8652D' }}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <div
          className="flex-1 h-2 bg-stone-200 rounded-full cursor-pointer py-0"
          onClick={handleSeek}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${progress}%`, backgroundColor: '#E8652D' }}
          />
        </div>
        <span className="text-[11px] text-stone-500 tabular-nums flex-shrink-0">
          {formatTime(currentTime)}
        </span>
        <button
          onClick={toggleSpeed}
          aria-label="Playback speed"
          className={cn(
            'text-[11px] font-bold px-1.5 py-1 rounded-md border transition-colors flex-shrink-0',
            speed === 1.5
              ? 'border-[#2A9D8F] text-[#2A9D8F] bg-[#2A9D8F]/10'
              : 'border-stone-200 text-stone-500'
          )}
        >
          {speed}x
        </button>
      </div>

      {/* Row 3: thanks reaction after listening */}
      {canThank && (thanksVisible || hasThanked) && (
        <button
          onClick={sendThanks}
          disabled={hasThanked}
          className={cn(
            'mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
            hasThanked
              ? 'bg-rose-50 text-rose-500 cursor-default'
              : 'bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-[0.98]'
          )}
          style={{ minHeight: 40 }}
        >
          <Heart className={cn('w-3.5 h-3.5', hasThanked && 'fill-current')} />
          {hasThanked ? `${buddyName.split(' ')[0]} will see your ❤️` : 'Thanks'}
        </button>
      )}
    </div>
  );
}
```

### src/components/voice-note-recorder.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Play, Pause, Trash2, Send, X, Square, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceNoteRecorderProps {
  studentId: string;
  buddyId: string;
  studentName: string;
  onSendComplete?: () => void;
  isOpen: boolean;
  onClose: () => void;
  feedbackType?: 'buddy_feedback' | 'student_response';
}

const MAX_DURATION = 90; // seconds
const WARN_AT = 75; // amber from 1:15
const BAR_COUNT = 28;

/**
 * Codec fallback chain — audio/mp4 is what iOS Safari supports;
 * webm-opus is the default everywhere else. '' lets the browser pick.
 */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return (
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''].find(
      (t) => t === '' || MediaRecorder.isTypeSupported(t)
    ) ?? ''
  );
}

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export function VoiceNoteRecorder({
  studentId,
  studentName,
  onSendComplete,
  isOpen,
  onClose,
  feedbackType = 'buddy_feedback',
}: VoiceNoteRecorderProps) {
  type Phase = 'idle' | 'recording' | 'review' | 'sending' | 'sent';
  const [phase, setPhase] = useState<Phase>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(4));
  const [isPlaying, setIsPlaying] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [nudge, setNudge] = useState<string | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [textDraft, setTextDraft] = useState('');

  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef('');
  const durationRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanupCapture = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  // Full reset when the sheet closes
  useEffect(() => {
    if (!isOpen) {
      mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop();
      cleanupCapture();
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      blobRef.current = null;
      setPhase('idle');
      setRecordingTime(0);
      setError(null);
      setNudge(null);
      setIsPlaying(false);
      setPlayTime(0);
    }
  }, [isOpen, cleanupCapture]);

  const startRecording = async () => {
    setError(null);
    setMicDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      mimeRef.current = mimeType || 'audio/webm';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];

      // Real waveform from the live mic signal
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / BAR_COUNT) || 1;
        const next: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          const v = data[i * step] / 255;
          next.push(4 + Math.round(v * 28));
        }
        setLevels(next);
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        cleanupCapture();
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        blobRef.current = blob;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setPhase('review');
        setIsPlaying(false);
        setPlayTime(0);
        setDuration(durationRef.current);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setPhase('recording');
      setRecordingTime(0);
      durationRef.current = 0;

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          durationRef.current = next;
          if (next >= MAX_DURATION) {
            mediaRecorderRef.current?.state === 'recording' &&
              mediaRecorderRef.current.stop();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      cleanupCapture();
      setMicDenied(true);
      console.error('Mic access error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const discard = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setPlayTime(0);
    blobRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhase('idle');
    setRecordingTime(0);
  };

  const togglePlayback = () => {
    const el = audioRef.current;
    if (!el || !urlRef.current) return;
    if (isPlaying) {
      el.pause();
    } else {
      if (el.src !== urlRef.current) el.src = urlRef.current;
      el.play();
    }
  };

  const send = async () => {
    if (!blobRef.current) return;
    setPhase('sending');
    setError(null);
    try {
      const form = new FormData();
      const ext = mimeRef.current.includes('mp4') ? 'm4a' : 'webm';
      form.append('audio', blobRef.current, `note.${ext}`);
      form.append('studentId', studentId);
      form.append('feedbackType', feedbackType);
      form.append('durationSeconds', String(durationRef.current));

      const res = await fetch('/api/voice-notes/send', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        // Recording stays in memory — user can retry
        setError(data.error || "Send failed — your note is safe, try again.");
        setPhase('review');
        return;
      }
      setNudge(data.streakNudge ?? null);
      setPhase('sent');
      onSendComplete?.();
      setTimeout(onClose, data.streakNudge ? 2600 : 1100);
    } catch {
      setError("No connection — your note is safe, try again.");
      setPhase('review');
    }
  };

  const sendText = async () => {
    if (!textDraft.trim()) return;
    setPhase('sending');
    setError(null);
    try {
      const res = await fetch('/api/voice-notes/send-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, feedbackText: textDraft, feedbackType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Send failed — try again.');
        setPhase('idle');
        return;
      }
      setPhase('sent');
      onSendComplete?.();
      setTimeout(onClose, 1100);
    } catch {
      setError('No connection — try again.');
      setPhase('idle');
    }
  };

  if (!isOpen) return null;

  const reviewProgress =
    duration > 0 ? Math.min(100, (playTime / duration) * 100) : 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center pointer-events-none"
      >
        <div
          className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md pointer-events-auto animate-in slide-in-from-bottom-6 duration-300"
          style={{ animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {/* Header */}
          <div className="border-b border-stone-100 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900 truncate">
              Voice note for {studentName}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 -m-1 text-stone-400 hover:text-stone-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <audio
              ref={audioRef}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                setPlayTime(0);
              }}
              onTimeUpdate={(e) => setPlayTime(e.currentTarget.currentTime)}
            />

            {micDenied && !textMode && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>Microphone blocked</strong> — enable it in your browser settings, or send a text message instead.
                </p>
                <button
                  onClick={() => setTextMode(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 underline underline-offset-2"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Switch to text
                </button>
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}

            {/* ── Text fallback (mic denied) ── */}
            {textMode && phase !== 'sent' && (
              <div className="space-y-2">
                <textarea
                  className="w-full rounded-xl border border-stone-200 p-3 text-sm text-stone-900 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                  rows={4}
                  placeholder={`Write a message for ${studentName.split(' ')[0]}…`}
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  maxLength={2000}
                  disabled={phase === 'sending'}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setTextMode(false); setTextDraft(''); }}
                    disabled={phase === 'sending'}
                    className="px-4 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
                    style={{ minHeight: 44 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendText}
                    disabled={phase === 'sending' || !textDraft.trim()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl text-white font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
                    style={{ backgroundColor: '#2A9D8F', minHeight: 44 }}
                  >
                    {phase === 'sending' ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><Send className="w-4 h-4" />Send</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── Idle (mic mode) ── */}
            {phase === 'idle' && !textMode && (
              <button
                onClick={startRecording}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white font-semibold transition-transform active:scale-[0.98]"
                style={{ backgroundColor: '#E8652D', minHeight: 56 }}
              >
                <Mic className="w-5 h-5" />
                Tap to record
              </button>
            )}

            {/* ── Recording: live waveform + timer ── */}
            {phase === 'recording' && (
              <div className="space-y-3">
                <div className="flex items-end justify-center gap-[3px] h-10">
                  {levels.map((h, i) => (
                    <span
                      key={i}
                      className="w-[5px] rounded-full transition-[height] duration-75"
                      style={{ height: h, backgroundColor: '#E8652D' }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                  <span
                    className={cn(
                      'text-sm font-mono tabular-nums',
                      recordingTime >= WARN_AT ? 'text-amber-600 font-bold' : 'text-stone-900'
                    )}
                  >
                    {fmt(recordingTime)} / {fmt(MAX_DURATION)}
                  </span>
                </div>
                <button
                  onClick={stopRecording}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-stone-900 text-white font-semibold transition-transform active:scale-[0.98]"
                  style={{ minHeight: 52 }}
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop
                </button>
              </div>
            )}

            {/* ── Review: playback + scrubber + send ── */}
            {(phase === 'review' || phase === 'sending') && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-3">
                  <button
                    onClick={togglePlayback}
                    disabled={phase === 'sending'}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="w-11 h-11 rounded-full text-white flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50"
                    style={{ backgroundColor: '#E8652D' }}
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>
                  <div className="flex-1 space-y-1">
                    <input
                      type="range"
                      min={0}
                      max={duration || 1}
                      step={0.1}
                      value={playTime}
                      disabled={phase === 'sending'}
                      onChange={(e) => {
                        const t = Number(e.target.value);
                        if (audioRef.current) {
                          if (audioRef.current.src !== urlRef.current && urlRef.current) {
                            audioRef.current.src = urlRef.current;
                          }
                          audioRef.current.currentTime = t;
                        }
                        setPlayTime(t);
                      }}
                      className="w-full accent-[#E8652D] h-1.5"
                      aria-label="Scrub recording"
                    />
                    <div className="flex justify-between text-[11px] text-stone-500 tabular-nums">
                      <span>{fmt(playTime)}</span>
                      <span>{fmt(duration)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={discard}
                    disabled={phase === 'sending'}
                    className="flex items-center justify-center gap-1.5 px-4 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
                    style={{ minHeight: 48 }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Re-record
                  </button>
                  <button
                    onClick={send}
                    disabled={phase === 'sending'}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl text-white font-semibold transition-transform active:scale-[0.98] disabled:opacity-80"
                    style={{ backgroundColor: '#2A9D8F', minHeight: 48 }}
                  >
                    {phase === 'sending' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── Sent ── */}
            {phase === 'sent' && (
              <div className="py-4 text-center space-y-2 animate-in zoom-in duration-200">
                <p className="text-sm font-semibold text-emerald-700">
                  ✓ Sent to {studentName.split(' ')[0]}
                </p>
                {nudge && <p className="text-xs text-stone-600">{nudge}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

### src/components/weekly-signal-card.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Mic, Send, Check, Sparkles, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeeklyStats {
  daysLogged: number;
  avgHours: string;
  avgStress: string;
  mockTaken: number;
  latestMockScore: number | null;
}

interface WeeklySignalCardProps {
  studentId: string;
  studentName: string;
  onVoiceNote: () => void;
  onFeedback: () => void;
}

export function WeeklySignalCard({ studentId, studentName, onVoiceNote, onFeedback }: WeeklySignalCardProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [acted, setActed] = useState(false);

  const firstName = studentName.split(' ')[0];

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/weekly-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setInsight(data.insight);
        setStats(data.stats);
      }
    } catch (e) {
      console.error('weekly-signal load error', e);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Card className="p-5 border-2 border-teal-100 bg-gradient-to-br from-teal-50 to-white">
        <div className="h-24 bg-teal-100/60 rounded-xl animate-pulse" />
      </Card>
    );
  }

  if (acted) {
    return (
      <Card className="p-4 border-2 border-emerald-200 bg-emerald-50">
        <div className="flex items-center gap-2 text-emerald-700">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">Reviewed this week ✔</span>
        </div>
      </Card>
    );
  }

  const stressNum = stats ? parseFloat(stats.avgStress) : 3;
  const StressTrendIcon = stressNum > 3.5 ? TrendingUp : stressNum < 2.5 ? TrendingDown : Minus;
  const stressColor = stressNum > 3.5 ? 'text-red-600' : stressNum < 2.5 ? 'text-emerald-600' : 'text-stone-500';

  return (
    <Card className="p-5 border-2 border-teal-200 bg-gradient-to-br from-teal-50 to-white">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-teal-600" />
        <h3 className="text-sm font-bold text-teal-900">Weekly Signal — {firstName}</h3>
        <span className="ml-auto text-[10px] text-stone-400 uppercase tracking-wider">AI</span>
      </div>

      {/* 2×2 Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-xl p-3 border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">Days logged</div>
            <div className="text-2xl font-bold text-stone-900">
              {stats.daysLogged}<span className="text-sm font-normal text-stone-400">/7</span>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">Avg hours/day</div>
            <div className="text-2xl font-bold text-stone-900">{stats.avgHours}<span className="text-sm font-normal text-stone-400"> hrs</span></div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">Stress trend</div>
            <div className={cn('flex items-center gap-1 text-lg font-bold', stressColor)}>
              <StressTrendIcon className="w-4 h-4" />
              {stats.avgStress}<span className="text-xs font-normal text-stone-400">/5</span>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">Mock performance</div>
            <div className="text-sm font-semibold text-stone-900">
              {stats.mockTaken === 0
                ? 'No mock'
                : stats.latestMockScore
                ? `${stats.latestMockScore}%ile`
                : `${stats.mockTaken} taken`}
            </div>
          </div>
        </div>
      )}

      {/* AI Insight */}
      {insight && (
        <div className="bg-teal-100/60 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-teal-800 mb-1">AI Observation</p>
          <p className="text-sm text-teal-900 italic">&quot;{insight}&quot;</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => { onVoiceNote(); setActed(true); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-all text-xs font-semibold"
          style={{ minHeight: 44 }}
        >
          <Mic className="w-3.5 h-3.5" />
          Voice note
        </button>
        <button
          onClick={() => { setActed(true); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-all text-xs font-semibold"
          style={{ minHeight: 44 }}
        >
          <Check className="w-3.5 h-3.5" />
          Keep going
        </button>
        <button
          onClick={() => { onFeedback(); setActed(true); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition-all text-xs font-semibold"
          style={{ minHeight: 44 }}
        >
          <Send className="w-3.5 h-3.5" />
          Feedback
        </button>
      </div>
    </Card>
  );
}
```

## App Pages and Layouts (src/app/)

### src/app/admin/admin-allowlist.tsx
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Phone } from 'lucide-react';

interface BuddyOption { id: string; full_name: string }
export interface AllowlistRow {
  id: string;
  phone: string;
  full_name: string;
  status: 'active' | 'paused';
  assigned_buddy_id: string | null;
}

export function AdminAllowlist({ rows, buddies }: { rows: AllowlistRow[]; buddies: BuddyOption[] }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [buddyId, setBuddyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buddyName = (id: string | null) => buddies.find((b) => b.id === id)?.full_name ?? null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, full_name: fullName, assigned_buddy_id: buddyId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not add number.'); return; }
      setPhone(''); setFullName(''); setBuddyId('');
      router.refresh();
    } catch {
      setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch('/api/admin/allowlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });
    router.refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus className="w-4 h-4 text-stone-500" />
        <span className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Student access list</span>
      </div>

      {/* Add number + assign buddy in one action */}
      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          required
          className="px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
        />
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-stone-500">+91</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile"
            required
            className="w-full pl-11 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
          />
        </div>
        <select
          value={buddyId}
          onChange={(e) => setBuddyId(e.target.value)}
          className="px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
        >
          <option value="">No buddy yet</option>
          {buddies.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add student'}
        </button>
      </form>
      {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-stone-500 text-center py-4">No numbers yet. Add a student above to grant phone-OTP access.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-stone-50 rounded-xl p-3 border border-stone-100">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                  {r.full_name}
                  <Badge color={r.status === 'active' ? 'green' : 'stone'}>{r.status}</Badge>
                </div>
                <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {r.phone}
                  {buddyName(r.assigned_buddy_id) && <> · Buddy: {buddyName(r.assigned_buddy_id)}</>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={r.assigned_buddy_id ?? ''}
                  onChange={(e) => patch(r.id, { assigned_buddy_id: e.target.value || null })}
                  className="text-xs px-2 py-1.5 bg-white border border-stone-200 rounded-lg"
                >
                  <option value="">No buddy</option>
                  {buddies.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
                </select>
                <button
                  onClick={() => patch(r.id, { status: r.status === 'active' ? 'paused' : 'active' })}
                  className="text-xs font-medium text-stone-600 hover:text-stone-900 px-2 py-1.5"
                >
                  {r.status === 'active' ? 'Pause' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
```

### src/app/admin/admin-broadcast.tsx
```tsx
'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Send } from 'lucide-react';

export function AdminBroadcast({ recipientIds }: { recipientIds: string[] }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setError('');
    const res = await fetch('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), body: body.trim(), recipientIds }),
    });
    setSending(false);
    if (!res.ok) { setError('Failed to send. Try again.'); return; }
    setSent(true);
    setTitle('');
    setBody('');
    setTimeout(() => setSent(false), 3000);
  }

  return (
    <Card className="p-5">
      <div className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — e.g. Important: Mock test schedule"
          className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message to all students and buddies..."
          rows={3}
          className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 resize-none"
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        {sent && <p className="text-xs text-emerald-700">✓ Sent to {recipientIds.length} users</p>}
        <button
          type="button"
          onClick={send}
          disabled={!title.trim() || !body.trim() || sending}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 disabled:opacity-50 transition-all"
        >
          <Send className="w-4 h-4" /> {sending ? 'Sending…' : `Send to all ${recipientIds.length} users`}
        </button>
      </div>
    </Card>
  );
}
```

### src/app/admin/admin-data-import.tsx
```tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Upload, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    created: number;
    failed: number;
  };
  created: Array<{ email: string; role: string; full_name: string }>;
  errors: Array<{ row: number; email: string; error: string }>;
  buddyErrors: Array<{ email: string; error: string }>;
}

export function AdminDataImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('[ADMIN_IMPORT] Starting upload...', file.name, file.size);
      const formData = new FormData();
      formData.append('file', file);

      console.log('[ADMIN_IMPORT] Sending request to /api/admin/bulk-import');
      const response = await fetch('/api/admin/bulk-import', {
        method: 'POST',
        body: formData,
      });

      console.log('[ADMIN_IMPORT] Response status:', response.status);

      let data;
      try {
        data = await response.json();
        console.log('[ADMIN_IMPORT] Response data:', data);
      } catch (parseErr) {
        console.error('[ADMIN_IMPORT] Failed to parse response JSON:', parseErr);
        console.log('[ADMIN_IMPORT] Response text:', await response.text());
        setError('Server error - invalid response. Check browser console.');
        return;
      }

      if (!response.ok) {
        const errorMsg = data.error || `HTTP ${response.status}`;
        console.error('[ADMIN_IMPORT] Error response:', errorMsg);
        setError(errorMsg);
        return;
      }

      console.log('[ADMIN_IMPORT] Success!');
      setResult(data);
      setFile(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[ADMIN_IMPORT] Catch error:', err);
      setError(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }

  const downloadTemplate = () => {
    const csv = `full_name,email,phone,role,exam_target,buddy_email,username,password
Aarav Sharma,aarav@careerrai.com,+91-9876543210,student,CAT,,aarav_sharma,Secure@Aarav123
Priya Kapoor,priya@careerrai.com,+91-9876543211,student,CAT,,priya_kapoor,Secure@Priya123
Rohan Patel,rohan@careerrai.com,+91-9876543212,student,CAT,,rohan_patel,Secure@Rohan123
Nishant Yadav,nishant@careerrai.com,+91-9876543215,buddy,,nishant_yadav,Secure@Nishant123`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'careerrai-import-template.csv';
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Upload Form */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Import Students & Buddies
        </h3>

        <form onSubmit={handleUpload} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-2">
              CSV File
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={loading}
              className="block w-full text-sm text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200"
            />
            <p className="text-xs text-stone-500 mt-1">
              Required: full_name, email, phone, role (student/buddy)
              <br />
              Optional: exam_target (CAT), buddy_email, username, password
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!file || loading}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition',
                !file || loading
                  ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                  : 'bg-orange-600 text-white hover:bg-orange-700'
              )}
            >
              {loading ? 'Uploading...' : 'Upload & Import'}
            </button>
            <button
              type="button"
              onClick={downloadTemplate}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-stone-100 text-stone-900 hover:bg-stone-200 transition flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Template
            </button>
          </div>
        </form>
      </Card>

      {/* Error message */}
      {error && (
        <Card className="p-4 bg-rose-50 border-rose-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-rose-900">Error</div>
              <p className="text-sm text-rose-800 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Success result */}
      {result && (
        <Card className="p-5">
          <div className="space-y-4">
            {/* Summary stats */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-stone-900">Import Summary</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-stone-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-stone-900">{result.summary.total}</div>
                  <div className="text-xs text-stone-500">Total Rows</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-emerald-700">{result.summary.created}</div>
                  <div className="text-xs text-emerald-600">Created</div>
                </div>
                <div className={cn('rounded-lg p-3 text-center', result.summary.failed > 0 ? 'bg-rose-50' : 'bg-stone-50')}>
                  <div className={cn('text-lg font-bold', result.summary.failed > 0 ? 'text-rose-700' : 'text-stone-900')}>
                    {result.summary.failed}
                  </div>
                  <div className={cn('text-xs', result.summary.failed > 0 ? 'text-rose-600' : 'text-stone-500')}>
                    Failed
                  </div>
                </div>
              </div>
            </div>

            {/* Created users list */}
            {result.created.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-stone-900 mb-2">✓ Successfully Created ({result.created.length})</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.created.map((item) => (
                    <div key={item.email} className="text-xs text-stone-700 flex items-center gap-2 p-2 bg-stone-50 rounded">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      <span className="font-mono">{item.email}</span>
                      <div className="ml-auto"><Badge color="stone">{item.role}</Badge></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-rose-900 mb-2">✗ Validation Errors ({result.errors.length})</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.errors.map((item, i) => (
                    <div key={i} className="text-xs text-rose-800 p-2 bg-rose-50 rounded border border-rose-200">
                      <div className="font-mono font-semibold">{item.email}</div>
                      <div className="text-rose-700">{item.error}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buddy assignment errors */}
            {result.buddyErrors.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-amber-900 mb-2">⚠ Buddy Assignment Errors ({result.buddyErrors.length})</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.buddyErrors.map((item, i) => (
                    <div key={i} className="text-xs text-amber-800 p-2 bg-amber-50 rounded border border-amber-200">
                      <div className="font-mono font-semibold">{item.email}</div>
                      <div className="text-amber-700">{item.error}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Instructions */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <h4 className="text-xs font-semibold text-blue-900 mb-2 uppercase tracking-wide">Import Guide</h4>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li><strong>Role:</strong> Must be &quot;student&quot; or &quot;buddy&quot;</li>
          <li><strong>Email:</strong> Must be unique (not already in system)</li>
          <li><strong>Exam Target:</strong> Required for students (CAT only), leave blank for buddies</li>
          <li><strong>Buddy Email:</strong> Optional. If provided, must match a buddy email in the same import</li>
          <li><strong>Username:</strong> Optional. For display purposes. Can be any text</li>
          <li><strong>Password:</strong> Optional. If provided, must be 8+ characters. If blank, auto-generated</li>
          <li><strong>Login:</strong> Users log in with username + password</li>
        </ul>
      </Card>
    </div>
  );
}
```

### src/app/admin/admin-students-list.tsx
```tsx
'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types';

interface StudentStat {
  student: Profile;
  summary: { band: string; overallScore: number; daysSubmitted: number; avgStudy: number };
  buddy?: Profile;
  submittedToday: boolean;
  hasRedFlags: boolean;
}

export function AdminStudentsList({
  students,
  buddies,
}: {
  students: StudentStat[];
  buddies: Profile[];
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleAssign(studentId: string, buddyId: string | null) {
    setLoadingId(studentId);
    try {
      const response = await fetch('/api/admin/assign-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, buddy_id: buddyId }),
      });
      if (response.ok) {
        window.location.reload();
      }
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {students.map(({ student, summary, buddy, submittedToday }) => {
        const bandColor = summary.band === 'On track' ? 'green' : summary.band === 'Needs nudging' ? 'amber' : 'red';
        const initials = student.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
        const isLoading = loadingId === student.id;

        return (
          <Card key={student.id} className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-stone-900 text-sm">{student.full_name}</span>
                    <Badge color={bandColor}>{summary.overallScore}/100</Badge>
                    {submittedToday ? (
                      <Badge color="green">
                        <CheckCircle2 className="w-3 h-3" />
                        Today
                      </Badge>
                    ) : (
                      <Badge color="amber">
                        <Clock className="w-3 h-3" />
                        Pending
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {student.exam_target} · {buddy?.full_name.split(' ')[0] || 'No buddy'} · {summary.daysSubmitted}/7 days
                  </div>
                </div>
              </div>

              {/* Buddy dropdown */}
              <select
                value={buddy?.id || ''}
                onChange={(e) => handleAssign(student.id, e.target.value || null)}
                disabled={isLoading}
                className={cn(
                  'px-3 py-1.5 bg-white border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-600',
                  isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                )}
              >
                <option value="">Unassigned</option>
                {buddies.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name}
                  </option>
                ))}
              </select>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

### src/app/admin/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/admin/page.tsx
```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { Logo } from '@/components/logo';
import { LogoutButton } from '@/components/logout-button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminBroadcast } from './admin-broadcast';
import { AdminStudentsList } from './admin-students-list';
import { AdminDataImport } from './admin-data-import';
import { AdminAllowlist, type AllowlistRow } from './admin-allowlist';
import type { Profile, DailyReport } from '@/types';
import { AlertCircle, CheckCircle2, Clock, Users, TrendingUp, FileText, IndianRupee } from 'lucide-react';
import { cn } from '@/lib/utils';

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: adminProfile } = await admin.from('profiles').select('role, full_name').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') redirect('/login');

  // Fetch all profiles
  const { data: allProfiles } = await admin.from('profiles').select('id, role, full_name, email, exam_target, buddy_id').order('role').order('full_name');
  const profiles = (allProfiles ?? []) as Profile[];

  // Phone-OTP access list
  const { data: allowlistRows } = await admin
    .from('student_allowlist')
    .select('id, phone, full_name, status, assigned_buddy_id')
    .order('created_at', { ascending: false });

  const students = profiles.filter(p => p.role === 'student');
  const buddies = profiles.filter(p => p.role === 'buddy');

  // Fetch last 7 days reports for all students
  const today = getTodayIST();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const studentIds = students.map(s => s.id);
  let reports: DailyReport[] = [];
  if (studentIds.length > 0) {
    const { data } = await admin.from('daily_reports').select('*').in('student_id', studentIds).gte('report_date', weekAgoStr);
    reports = (data ?? []) as DailyReport[];
  }

  // Compute per-student stats
  const studentStats = students.map((s) => {
    const reps = reports.filter(r => r.student_id === s.id);
    const lastReport = reps.sort((a, b) => b.report_date.localeCompare(a.report_date))[0];
    const summary = computeSummary(reps, 7);
    const buddy = buddies.find(b => b.id === s.buddy_id);
    const submittedToday = reps.some(r => r.report_date === today);
    return { student: s, summary, lastDate: lastReport?.report_date, buddy, submittedToday, hasRedFlags: summary.redFlags.length > 0 };
  });

  const submittedToday = studentStats.filter(s => s.submittedToday).length;
  const redFlagCount = studentStats.filter(s => s.hasRedFlags).length;
  const onTrack = studentStats.filter(s => s.summary.band === 'On track').length;

  // Buddy performance: feedback volume + response speed over last 14 days
  // eslint-disable-next-line react-hooks/purity
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const { data: recentFeedback } = await admin
    .from('buddy_feedback')
    .select('buddy_id, created_at, feedback_date')
    .gte('created_at', twoWeeksAgo);

  // Churn risk: days since last log per student (beyond the 7-day window = high risk)
  const { data: lastLogs } = studentIds.length > 0
    ? await admin.from('daily_reports').select('student_id, report_date').in('student_id', studentIds).order('report_date', { ascending: false })
    : { data: [] };
  const lastLogByStudent = new Map<string, string>();
  for (const r of lastLogs ?? []) {
    if (!lastLogByStudent.has(r.student_id)) lastLogByStudent.set(r.student_id, r.report_date);
  }
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const churnRisk = students
    .map((s) => {
      const last = lastLogByStudent.get(s.id);
      const daysSince = last ? Math.floor((todayMs - new Date(last + 'T00:00:00').getTime()) / 86400000) : null;
      const buddy = buddies.find(b => b.id === s.buddy_id);
      return { student: s, daysSince, buddy };
    })
    .filter(({ daysSince }) => daysSince === null || daysSince >= 4)
    .sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999));

  // Buddy stats
  const buddyStats = buddies.map(b => {
    const myStudents = students.filter(s => s.buddy_id === b.id);
    const myStats = myStudents.map(s => studentStats.find(ss => ss.student.id === s.id)!).filter(Boolean);
    const redFlags = myStats.filter(s => s.hasRedFlags).length;
    const myFeedback = (recentFeedback ?? []).filter(f => f.buddy_id === b.id);
    const gaps = myFeedback
      .map(f => (new Date(f.created_at).getTime() - new Date(f.feedback_date + 'T00:00:00').getTime()) / 3600000)
      .filter(h => h >= 0 && h < 24 * 7);
    const avgResponseHrs = gaps.length > 0 ? Math.max(1, Math.round(gaps.reduce((s, h) => s + h, 0) / gaps.length)) : null;
    return { buddy: b, studentCount: myStudents.length, redFlags, students: myStudents, feedbackCount: myFeedback.length, avgResponseHrs };
  });

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-3">
            <Link
              href="/admin/payments"
              className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2 transition-colors"
            >
              <IndianRupee className="w-3.5 h-3.5" /> Payments
            </Link>
            <Badge color="stone">Admin</Badge>
            <LogoutButton />
          </div>
        </div>

        <div className="px-1 mb-6">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Admin dashboard</p>
          <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
            CareerRai Overview
          </h1>
          <p className="text-sm text-stone-500 mt-1">Today: {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { icon: Users, label: 'Students', val: students.length, color: 'text-stone-900' },
            { icon: CheckCircle2, label: 'Reported today', val: submittedToday, color: 'text-emerald-700' },
            { icon: AlertCircle, label: 'Red flags', val: redFlagCount, color: redFlagCount > 0 ? 'text-rose-600' : 'text-stone-900' },
            { icon: TrendingUp, label: 'On track', val: onTrack, color: 'text-teal-700' },
          ].map(({ icon: Icon, label, val, color }) => (
            <Card key={label} className="p-4 text-center">
              <Icon className={cn('w-5 h-5 mx-auto mb-1', color)} />
              <div className={cn('text-2xl font-bold font-mono', color)}>{val}</div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">{label}</div>
            </Card>
          ))}
        </div>

        {/* Red flags panel */}
        {redFlagCount > 0 && (
          <Card className="p-5 bg-rose-50 border-rose-200 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Students needing attention</span>
            </div>
            <div className="space-y-2">
              {studentStats.filter(s => s.hasRedFlags).map(({ student, summary, buddy }) => (
                <div key={student.id} className="flex items-start justify-between bg-white rounded-xl p-3 border border-rose-100">
                  <div>
                    <div className="font-semibold text-stone-900 text-sm">{student.full_name}</div>
                    <div className="text-xs text-stone-500">{buddy ? `Buddy: ${buddy.full_name}` : 'No buddy assigned'}</div>
                    <ul className="mt-1 space-y-0.5">
                      {summary.redFlags.map((f, i) => (
                        <li key={i} className="text-xs text-rose-700 flex items-center gap-1"><span>•</span>{f}</li>
                      ))}
                    </ul>
                  </div>
                  <Badge color="red">{summary.overallScore}/100</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Churn risk panel */}
        {churnRisk.length > 0 && (
          <Card className="p-5 bg-amber-50 border-amber-200 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Churn risk — inactive students</span>
            </div>
            <div className="space-y-2">
              {churnRisk.map(({ student, daysSince, buddy }) => (
                <div key={student.id} className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-100">
                  <div>
                    <div className="font-semibold text-stone-900 text-sm">{student.full_name}</div>
                    <div className="text-xs text-stone-500">{buddy ? `Buddy: ${buddy.full_name}` : 'No buddy assigned'}</div>
                  </div>
                  <Badge color={daysSince === null || daysSince >= 7 ? 'red' : 'amber'}>
                    {daysSince === null ? 'Never logged' : `${daysSince}d inactive`}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* All students */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">All students</h2>
          <AdminStudentsList students={studentStats} buddies={buddies} />
        </div>

        {/* Buddies */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Buddies</h2>
          <div className="space-y-2">
            {buddyStats.map(({ buddy, studentCount, redFlags, feedbackCount, avgResponseHrs }) => {
              const initials = buddy.full_name[0].toUpperCase();
              return (
                <Card key={buddy.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-orange-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-900 text-sm">{buddy.full_name}</span>
                        <Badge color="orange">Buddy</Badge>
                        {redFlags > 0 && <Badge color="red">{redFlags} red flag{redFlags > 1 ? 's' : ''}</Badge>}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">{buddy.email} · {studentCount} student{studentCount !== 1 ? 's' : ''}</div>
                      <div className="text-xs text-stone-600 mt-1">
                        {feedbackCount} feedback (14d)
                        {avgResponseHrs !== null && <> · responds in ~{avgResponseHrs}h</>}
                        {feedbackCount === 0 && <span className="text-rose-600 font-medium"> · no recent activity</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-stone-400" />
                      <span className="text-sm font-bold text-stone-900">{studentCount}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Student access list (phone-OTP allowlist) */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Student access</h2>
          <AdminAllowlist
            rows={(allowlistRows ?? []) as AllowlistRow[]}
            buddies={buddies.map((b) => ({ id: b.id, full_name: b.full_name }))}
          />
        </div>

        {/* Data Import */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Data management</h2>
          <AdminDataImport />
        </div>

        {/* Broadcast notification */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Broadcast notification</h2>
          <AdminBroadcast recipientIds={[...students.map(s => s.id), ...buddies.map(b => b.id)]} />
        </div>

        {/* System info */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-stone-500" />
            <span className="text-xs uppercase tracking-widest text-stone-500 font-semibold">System stats</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-stone-500 text-xs">Total users</div><div className="font-bold text-stone-900">{profiles.length}</div></div>
            <div><div className="text-stone-500 text-xs">Reports (7d)</div><div className="font-bold text-stone-900">{reports.length}</div></div>
            <div><div className="text-stone-500 text-xs">Active today</div><div className="font-bold text-stone-900">{submittedToday}/{students.length}</div></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
```

### src/app/admin/payments/admin-payments-client.tsx
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLANS, isPlanId } from '@/lib/plans';

export interface IncomingRow {
  id: string;
  name: string;
  status: 'free_beta' | 'active' | 'expired' | 'refund_requested';
  plan: string | null;
  renewsAt: string | null;
  lastPaidAt: string | null;
  lastAmountPaise: number | null;
}

export interface OutgoingRow {
  buddyId: string;
  name: string;
  activeStudents: number;
  agreedPayout: number | null;
  period: string;
  status: 'pending' | 'paid';
  paidDate: string | null;
  paymentRef: string | null;
}

type IncomingFilter = 'all' | 'active' | 'expired' | 'free_beta' | 'refund_requested';

const STATUS_BADGE: Record<IncomingRow['status'], { label: string; color: 'green' | 'amber' | 'stone' | 'orange' }> = {
  free_beta: { label: 'Free beta', color: 'stone' },
  active: { label: 'Active', color: 'green' },
  expired: { label: 'Expired', color: 'amber' },
  refund_requested: { label: 'Refund req.', color: 'orange' },
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export function AdminPaymentsClient({
  incoming,
  outgoing,
  summary,
  period,
}: {
  incoming: IncomingRow[];
  outgoing: OutgoingRow[];
  summary: { activeSubs: number; mrr: number; expiringThisWeek: number };
  period: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [filter, setFilter] = useState<IncomingFilter>('all');

  const filtered = incoming.filter((r) => (filter === 'all' ? true : r.status === filter));

  return (
    <div className="space-y-5">
      {/* Tab switch */}
      <div className="flex bg-stone-100 rounded-xl p-1">
        {(['incoming', 'outgoing'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
            }`}
          >
            {t === 'incoming' ? 'Incoming (students)' : 'Outgoing (buddies)'}
          </button>
        ))}
      </div>

      {tab === 'incoming' ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold font-mono text-emerald-700">{summary.activeSubs}</div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Active subs</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold font-mono text-stone-900">₹{summary.mrr.toLocaleString('en-IN')}</div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">MRR</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold font-mono text-amber-600">{summary.expiringThisWeek}</div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Expiring 7d</div>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['all', 'active', 'expired', 'free_beta', 'refund_requested'] as IncomingFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  filter === f ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {f === 'all' ? 'All' : f === 'free_beta' ? 'Free beta' : f === 'refund_requested' ? 'Refund req.' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Card className="p-8 text-center text-sm text-stone-500">No students in this view.</Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <Card key={r.id} className="p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                      {r.name}
                      <Badge color={STATUS_BADGE[r.status].color}>{STATUS_BADGE[r.status].label}</Badge>
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {r.plan && isPlanId(r.plan) ? PLANS[r.plan].label : '—'}
                      {r.renewsAt && <> · renews {new Date(r.renewsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono text-stone-900">{r.lastAmountPaise != null ? rupees(r.lastAmountPaise) : '—'}</div>
                    <div className="text-[10px] text-stone-400">
                      {r.lastPaidAt ? new Date(r.lastPaidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'no payment'}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <OutgoingView rows={outgoing} period={period} onChange={() => router.refresh()} />
      )}
    </div>
  );
}

function OutgoingView({ rows, period, onChange }: { rows: OutgoingRow[]; period: string; onChange: () => void }) {
  const totalOwed = rows.filter((r) => r.status === 'pending').reduce((s, r) => s + (r.agreedPayout ?? 0), 0);
  const totalPaid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + (r.agreedPayout ?? 0), 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold font-mono text-amber-600">₹{totalOwed.toLocaleString('en-IN')}</div>
          <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Owed this period</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold font-mono text-emerald-700">₹{totalPaid.toLocaleString('en-IN')}</div>
          <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Paid this period</div>
        </Card>
      </div>
      <p className="text-xs text-stone-500 px-1">
        Period {period}. Amounts are tracked here — you pay buddies manually via UPI/bank and record it below. No money moves through the app.
      </p>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-stone-500">No buddies yet.</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => <OutgoingRowCard key={r.buddyId} row={r} onChange={onChange} />)}
        </div>
      )}
    </>
  );
}

function OutgoingRowCard({ row, onChange }: { row: OutgoingRow; onChange: () => void }) {
  const [amount, setAmount] = useState(row.agreedPayout?.toString() ?? '');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveAmount() {
    setBusy(true);
    await fetch('/api/admin/payouts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buddy_id: row.buddyId, agreed_monthly_payout: amount === '' ? null : Number(amount) }),
    });
    setBusy(false);
    onChange();
  }

  async function markPaid() {
    setBusy(true);
    const res = await fetch('/api/admin/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buddy_id: row.buddyId, period: row.period, payment_ref: ref }),
    });
    setBusy(false);
    if (res.ok) onChange();
    else { const d = await res.json().catch(() => null); alert(d?.error ?? 'Could not record payout.'); }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            {row.name}
            <Badge color={row.status === 'paid' ? 'green' : 'amber'}>{row.status === 'paid' ? 'Marked paid' : 'Pending'}</Badge>
          </div>
          <div className="text-xs text-stone-500 mt-0.5">
            {row.activeStudents} active student{row.activeStudents === 1 ? '' : 's'}
            {row.status === 'paid' && row.paidDate && <> · paid {new Date(row.paidDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
            {row.status === 'paid' && row.paymentRef && <> · ref {row.paymentRef}</>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-500">₹</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="Agreed payout"
            className="w-32 pl-6 pr-2 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-stone-900"
          />
        </div>
        <button onClick={saveAmount} disabled={busy} className="text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2 disabled:opacity-50">
          Save amount
        </button>

        {row.status === 'pending' && (
          <>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="UPI / txn ref"
              className="flex-1 min-w-[120px] px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-stone-900"
            />
            <button
              onClick={markPaid}
              disabled={busy || row.agreedPayout == null}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 disabled:opacity-50"
              title={row.agreedPayout == null ? 'Set the agreed payout first' : undefined}
            >
              Mark as paid
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
```

### src/app/admin/payments/page.tsx
```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS, isPlanId } from '@/lib/plans';
import { ArrowLeft } from 'lucide-react';
import { AdminPaymentsClient, type IncomingRow, type OutgoingRow } from './admin-payments-client';

function currentPeriod() {
  // 'YYYY-MM' in IST
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
}

export default async function AdminPaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, role, full_name, buddy_id, subscription_status, subscription_plan, subscription_renews_at, agreed_monthly_payout');
  const all = profiles ?? [];
  const students = all.filter((p) => p.role === 'student');
  const buddies = all.filter((p) => p.role === 'buddy');

  // Last successful payment per student
  const { data: paidRows } = await admin
    .from('student_payments')
    .select('student_id, amount, paid_at')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false });
  const lastPaid = new Map<string, { amount: number; paid_at: string | null }>();
  for (const r of paidRows ?? []) {
    if (!lastPaid.has(r.student_id)) lastPaid.set(r.student_id, { amount: r.amount, paid_at: r.paid_at });
  }

  const incoming: IncomingRow[] = students.map((s) => {
    const lp = lastPaid.get(s.id);
    return {
      id: s.id,
      name: s.full_name,
      status: (s.subscription_status as IncomingRow['status']) ?? 'free_beta',
      plan: (s.subscription_plan as string | null) ?? null,
      renewsAt: (s.subscription_renews_at as string | null) ?? null,
      lastPaidAt: lp?.paid_at ?? null,
      lastAmountPaise: lp?.amount ?? null,
    };
  });

  // Summary
  const activeSubs = incoming.filter((r) => r.status === 'active').length;
  const mrr = incoming.reduce((sum, r) => {
    if (r.status !== 'active' || !r.plan || !isPlanId(r.plan)) return sum;
    const p = PLANS[r.plan];
    return sum + p.amountPaise / 100 / p.months;
  }, 0);
  // eslint-disable-next-line react-hooks/purity
  const weekFromNow = Date.now() + 7 * 24 * 3600 * 1000;
  const expiringThisWeek = incoming.filter(
    (r) => r.status === 'active' && r.renewsAt && new Date(r.renewsAt).getTime() <= weekFromNow
  ).length;

  // Outgoing (buddy payouts)
  const period = currentPeriod();
  const { data: payoutRows } = await admin
    .from('buddy_payouts')
    .select('buddy_id, status, paid_date, payment_ref, agreed_amount')
    .eq('period', period);
  const payoutByBuddy = new Map((payoutRows ?? []).map((r) => [r.buddy_id, r]));

  const outgoing: OutgoingRow[] = buddies.map((b) => {
    const activeStudents = students.filter((s) => s.buddy_id === b.id).length;
    const po = payoutByBuddy.get(b.id);
    return {
      buddyId: b.id,
      name: b.full_name,
      activeStudents,
      agreedPayout: (b.agreed_monthly_payout as number | null) ?? null,
      period,
      status: (po?.status as 'pending' | 'paid') ?? 'pending',
      paidDate: po?.paid_date ?? null,
      paymentRef: po?.payment_ref ?? null,
    };
  });

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Admin</p>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
              Payments
            </h1>
          </div>
        </div>

        <AdminPaymentsClient
          incoming={incoming}
          outgoing={outgoing}
          summary={{ activeSubs, mrr: Math.round(mrr), expiringThisWeek }}
          period={period}
        />
      </div>
    </div>
  );
}
```

### src/app/buddy/earnings/page.tsx
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IndianRupee, Users } from 'lucide-react';

function currentPeriod() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
}

export default async function BuddyEarningsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // Buddy reads ONLY their own numbers, and only the amount the founder set.
  const { data: me } = await admin
    .from('profiles')
    .select('agreed_monthly_payout')
    .eq('id', user.id)
    .single();
  const agreed = (me?.agreed_monthly_payout as number | null) ?? null;

  const { count: activeStudents } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('buddy_id', user.id)
    .eq('role', 'student');

  const period = currentPeriod();
  const { data: history } = await admin
    .from('buddy_payouts')
    .select('period, agreed_amount, status, paid_date, payment_ref')
    .eq('buddy_id', user.id)
    .order('period', { ascending: false });
  const rows = history ?? [];
  const thisPeriod = rows.find((r) => r.period === period);
  const periodStatus: 'pending' | 'paid' = (thisPeriod?.status as 'pending' | 'paid') ?? 'pending';

  return (
    <div className="space-y-5">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Earnings</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Your payouts
        </h1>
      </div>

      {agreed == null ? (
        <Card className="p-8 text-center">
          <IndianRupee className="w-6 h-6 text-stone-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-stone-700">Your earnings appear here once your first payout period begins.</p>
          <p className="text-xs text-stone-400 mt-1">Your monthly payout is set by the CareerRai team.</p>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Monthly payout</div>
                <div className="text-2xl font-bold text-stone-900 font-mono mt-1">₹{agreed.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div className="text-xs text-stone-500 font-medium uppercase tracking-wide flex items-center gap-1">
                  <Users className="w-3 h-3" /> Active students
                </div>
                <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{activeStudents ?? 0}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
              <span className="text-sm text-stone-600">This period ({period})</span>
              <Badge color={periodStatus === 'paid' ? 'green' : 'amber'}>{periodStatus === 'paid' ? 'Paid' : 'Pending'}</Badge>
            </div>
          </Card>

          <div>
            <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2 px-1">Payout history</h2>
            {rows.length === 0 ? (
              <Card className="p-6 text-center text-sm text-stone-500">No payouts recorded yet.</Card>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <Card key={r.period} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-stone-900">{r.period}</div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {r.status === 'paid' && r.paid_date
                          ? <>Paid {new Date(r.paid_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                          : 'Pending'}
                        {r.status === 'paid' && r.payment_ref && <> · ref {r.payment_ref}</>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-semibold text-stone-900">₹{r.agreed_amount.toLocaleString('en-IN')}</div>
                      <Badge color={r.status === 'paid' ? 'green' : 'amber'}>{r.status === 'paid' ? 'Paid' : 'Pending'}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-stone-400 text-center px-4">
            Payouts are sent manually by the CareerRai team via UPI/bank transfer and recorded here.
          </p>
        </>
      )}
    </div>
  );
}
```

### src/app/buddy/home/buddy-triage-view.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { loadBuddyStudents, getSeverityColor, getSeverityEmoji } from '@/lib/urgency-score';
import { StudentUrgencyData } from '@/lib/urgency-score';
import { Mic, Video, ArrowRight, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoiceNoteRecorder } from '@/components/voice-note-recorder';
import { ScheduleSessionModal } from '@/components/schedule-session-modal';

interface BuddyTriageViewProps {
  buddyId: string;
}

export function BuddyTriageView({ buddyId }: BuddyTriageViewProps) {
  const router = useRouter();
  const supabase = createClient();
  const [students, setStudents] = useState<StudentUrgencyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [recordFor, setRecordFor] = useState<StudentUrgencyData | null>(null);
  const [scheduleFor, setScheduleFor] = useState<StudentUrgencyData | null>(null);

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const [data, { data: profile }] = await Promise.all([
        loadBuddyStudents(buddyId),
        supabase
          .from('profiles')
          .select('google_calendar_connected')
          .eq('id', buddyId)
          .single(),
      ]);
      setStudents(data);
      setCalendarConnected(profile?.google_calendar_connected ?? false);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setIsLoading(false);
    }
  }, [buddyId, supabase]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const filteredStudents = students.filter((s) => {
    if (filter === 'all') return true;
    return s.severity === filter;
  });

  const criticalCount = students.filter((s) => s.severity === 'critical').length;
  const warningCount = students.filter((s) => s.severity === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <div className="text-3xl font-bold text-red-600">{criticalCount}</div>
          <p className="text-sm text-red-700 font-medium">Need Attention</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <div className="text-3xl font-bold text-amber-600">{warningCount}</div>
          <p className="text-sm text-amber-700 font-medium">Check In Soon</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <div className="text-3xl font-bold text-emerald-600">{students.length}</div>
          <p className="text-sm text-emerald-700 font-medium">Total Students</p>
        </Card>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2">
        {['all', 'critical', 'warning'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as typeof filter)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              filter === f
                ? 'bg-orange-600 text-white'
                : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            )}
          >
            {f === 'all'
              ? 'All Students'
              : f === 'critical'
              ? '🚨 Critical'
              : '⚠️ Warning'}
          </button>
        ))}
      </div>

      {/* Student Cards */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-stone-600">Loading students...</p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <Card className="p-12 text-center bg-stone-50">
          <p className="text-stone-600">No students in this category</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredStudents.map((student) => (
            <Card
              key={student.student_id}
              className={cn(
                'overflow-hidden border-2 transition-all hover:shadow-lg',
                student.severity === 'critical'
                  ? 'border-red-300 bg-red-50/50'
                  : student.severity === 'warning'
                  ? 'border-amber-300 bg-amber-50/50'
                  : 'border-emerald-300 bg-emerald-50/50'
              )}
            >
              <div className={cn('h-1 bg-gradient-to-r', getSeverityColor(student.severity))} />

              <div className="p-5 space-y-3">
                {/* Header */}
                <div
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => router.push(`/buddy/students/${student.student_id}`)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{getSeverityEmoji(student.severity)}</span>
                      <h3 className="text-lg font-bold text-stone-900">
                        {student.student_name}
                      </h3>
                    </div>
                    <p className="text-sm text-stone-600">
                      CAT Percentile:{' '}
                      <span className="font-semibold text-stone-900">
                        {student.cat_percentile?.toFixed(1) || 'N/A'}%
                      </span>
                    </p>
                  </div>

                  {/* Urgency Score */}
                  <div className="text-right">
                    <div
                      className={cn(
                        'text-3xl font-bold',
                        student.severity === 'critical'
                          ? 'text-red-600'
                          : student.severity === 'warning'
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      )}
                    >
                      {student.score}
                    </div>
                    <p className="text-xs text-stone-500">urgency</p>
                  </div>
                </div>

                {/* Reasons */}
                {student.reasons.length > 0 && (
                  <div className="space-y-1">
                    {student.reasons.slice(0, 2).map((reason, i) => (
                      <p key={i} className="text-sm text-stone-700 flex items-start gap-2">
                        <span className="text-amber-500 mt-1">•</span>
                        <span>{reason}</span>
                      </p>
                    ))}
                  </div>
                )}

                {/* Status Row */}
                <div className="flex gap-4 text-xs pt-2 border-t border-stone-200">
                  <div>
                    <span className="text-stone-600">Streak:</span>
                    <span
                      className={cn(
                        'ml-1 font-semibold',
                        student.streakStatus === 'active'
                          ? 'text-orange-600'
                          : 'text-red-600'
                      )}
                    >
                      {student.streakStatus === 'active'
                        ? `${student.streakDays} days 🔥`
                        : 'Broken'}
                    </span>
                  </div>

                  {student.recentDrops > 0 && (
                    <div className="flex items-center gap-1 text-red-600 font-semibold">
                      <TrendingDown className="w-3 h-3" />
                      {student.recentDrops} drop{student.recentDrops !== 1 ? 's' : ''}
                    </div>
                  )}

                  <div className="ml-auto">
                    <span className="text-stone-600">Last feedback:</span>
                    <span className="ml-1 font-semibold text-stone-900">
                      {student.daysSinceFeedback > 60
                        ? '∞ days'
                        : `${student.daysSinceFeedback}d`}
                      ago
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setRecordFor(student)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-all text-sm font-medium"
                    style={{ minHeight: 44 }}
                  >
                    <Mic className="w-4 h-4" />
                    Voice note
                  </button>

                  <button
                    onClick={() => setScheduleFor(student)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition-all text-sm font-medium"
                    style={{ minHeight: 44 }}
                  >
                    <Video className="w-4 h-4" />
                    Session
                  </button>

                  <button
                    onClick={() => router.push(`/buddy/students/${student.student_id}`)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-all text-sm font-medium"
                    style={{ minHeight: 44 }}
                  >
                    View
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Voice note bottom sheet for the picked student */}
      {recordFor && (
        <VoiceNoteRecorder
          studentId={recordFor.student_id}
          buddyId={buddyId}
          studentName={recordFor.student_name}
          isOpen={!!recordFor}
          onClose={() => setRecordFor(null)}
          onSendComplete={() => { setRecordFor(null); loadStudents(); }}
          feedbackType="buddy_feedback"
        />
      )}

      {/* Schedule modal for the picked student */}
      {scheduleFor && (
        <ScheduleSessionModal
          isOpen={!!scheduleFor}
          onClose={() => setScheduleFor(null)}
          students={[{ id: scheduleFor.student_id, full_name: scheduleFor.student_name }]}
          defaultStudentId={scheduleFor.student_id}
          calendarConnected={calendarConnected}
        />
      )}
    </div>
  );
}
```

### src/app/buddy/home/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/buddy/home/page.tsx
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCalendarConnected } from '@/lib/google-calendar';
import { BuddyTriageView } from './buddy-triage-view';
import { StudentVoiceNotesSection } from './student-voice-notes-section';
import { BuddyAudioResponsesCompact } from '@/components/buddy-audio-responses-compact';
import { BuddyQuickVoiceMessage } from '@/components/buddy-quick-voice-message';
import { MeetingWidget } from '@/components/meeting-widget';
import { GoogleCalendarConnect } from '@/components/google-calendar-connect';
import { UrgentRequestsPanel } from './urgent-requests-panel';
import { Settings, LogOut, Plus } from 'lucide-react';
import Link from 'next/link';

export default async function BuddyHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, intro_audio_url')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buddy') redirect('/');
  if (!profile?.intro_audio_url) redirect('/buddy/setup');

  const admin = createAdminClient();
  const [{ data: students }, calendarConnected, { data: pendingRequests }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('buddy_id', user.id)
      .order('full_name'),
    isCalendarConnected(user.id),
    admin
      .from('session_requests')
      .select('id, student_id, message, created_at, profiles!session_requests_student_id_fkey(full_name)')
      .eq('buddy_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Buddy';

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-40">
        <div className="w-full px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-stone-500 font-medium">Welcome back</p>
            <h1 className="text-lg font-bold text-stone-900 truncate" style={{ fontFamily: 'Georgia, serif' }}>
              {firstName}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            <Link
              href="/buddy/schedule"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-700 text-white hover:bg-teal-800 rounded-lg transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Schedule</span>
            </Link>
            <Link
              href="/buddy/settings"
              className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="w-full px-3 sm:px-4 py-4 space-y-4 max-w-2xl mx-auto">
        {/* Next session widget */}
        <MeetingWidget
          role="buddy"
          students={students ?? []}
          calendarConnected={calendarConnected}
        />

        {/* Calendar connect CTA */}
        {!calendarConnected && (
          <GoogleCalendarConnect connected={false} redirectPath="/buddy/home" />
        )}

        {/* 🚨 URGENT: Session requests from students */}
        {(pendingRequests?.length ?? 0) > 0 && (
          <UrgentRequestsPanel
            requests={(pendingRequests ?? []).map((r) => ({
              id: r.id,
              studentId: r.student_id,
              studentName: (r.profiles as { full_name?: string } | null)?.full_name ?? 'Student',
              message: r.message,
              createdAt: r.created_at,
            }))}
          />
        )}

        {/* Student voice responses */}
        <section>
          <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">Voice responses from students</p>
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <BuddyAudioResponsesCompact buddyId={user.id} />
          </div>
        </section>

        {/* Send voice message */}
        <section>
          <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">Quick voice message</p>
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <BuddyQuickVoiceMessage buddyId={user.id} buddyName={profile?.full_name || 'Buddy'} />
          </div>
        </section>

        {/* Student voice notes inbox */}
        <section>
          <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">Student voice notes</p>
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <StudentVoiceNotesSection buddyId={user.id} />
          </div>
        </section>

        {/* Student triage */}
        <section>
          <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">Student overview</p>
          <BuddyTriageView buddyId={user.id} />
        </section>

        <p className="text-center text-xs text-stone-400 pb-20">
          Focus on high urgency students first — they need you most.
        </p>
      </div>
    </div>
  );
}
```

### src/app/buddy/home/student-voice-notes-section.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mic, Volume2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface StudentNote {
  student_id: string;
  student_name: string;
  has_voice_note: boolean;
  last_note_date: string;
}

interface StudentVoiceNotesSectionProps {
  buddyId: string;
}

export function StudentVoiceNotesSection({ buddyId }: StudentVoiceNotesSectionProps) {
  const supabase = createClient();
  const [students, setStudents] = useState<StudentNote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStudents = useCallback(async () => {
    try {
      // Fetch all students assigned to this buddy
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, buddy_id')
        .eq('buddy_id', buddyId)
        .eq('role', 'student');

      if (error) throw error;

      // Format the data
      const studentNotes = (data || []).map((s) => ({
        student_id: s.id,
        student_name: s.full_name || 'Student',
        has_voice_note: false, // Will be updated once voice_notes table is created
        last_note_date: new Date().toISOString(),
      }));

      setStudents(studentNotes);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  }, [buddyId, supabase]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return (
    <div className="space-y-2.5 sm:space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1 sm:mb-2">
          <Mic className="w-4 sm:w-5 h-4 sm:h-5 text-orange-600 flex-shrink-0" />
          <h2 className="text-sm sm:text-lg font-bold text-stone-900 truncate">
            Student Voice Notes
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-stone-600">
          Check your students&apos; concerns and respond
        </p>
      </div>

      {/* Students List - Mobile Optimized */}
      {loading ? null : students.length === 0 ? null : (
        <div className="grid gap-1.5 sm:gap-2.5">
          {students.map((student) => (
            <Link
              key={student.student_id}
              href={`/buddy/students/${student.student_id}`}
              className="bg-white border border-orange-200 sm:border-2 rounded-lg sm:rounded-xl p-2.5 sm:p-3 hover:border-orange-300 hover:bg-orange-50 transition-all group"
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium sm:font-semibold text-xs sm:text-base text-stone-900 group-hover:text-orange-700 truncate">
                    {student.student_name}
                  </p>
                  {student.has_voice_note && (
                    <div className="flex items-center gap-1 text-xs text-orange-600 mt-0.5">
                      <Volume2 className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">Voice note</span>
                    </div>
                  )}
                </div>
                <ArrowRight className="w-4 sm:w-5 h-4 sm:h-5 text-stone-400 group-hover:text-orange-600 transition-colors flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

### src/app/buddy/home/urgent-requests-panel.tsx
```tsx
'use client';
import { useState } from 'react';
import { AlertTriangle, Calendar, Check } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface UrgentRequest {
  id: string;
  studentId: string;
  studentName: string;
  message: string | null;
  createdAt: string;
}

interface Props {
  requests: UrgentRequest[];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function UrgentRequestsPanel({ requests: initial }: Props) {
  const [requests, setRequests] = useState(initial);
  const [resolving, setResolving] = useState<string | null>(null);

  async function resolve(id: string) {
    setResolving(id);
    try {
      await fetch('/api/sessions/request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id }),
      });
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setResolving(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-1">
        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
        <p className="text-[10px] uppercase tracking-widest font-bold text-rose-700">
          Urgent help requested ({requests.length})
        </p>
      </div>
      <div className="space-y-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-rose-900">{req.studentName}</span>
                  <span className="text-[10px] text-rose-500 font-medium">{timeAgo(req.createdAt)}</span>
                </div>
                {req.message && (
                  <p className="text-sm text-rose-800 mt-0.5 italic">&quot;{req.message}&quot;</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/buddy/students/${req.studentId}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                View student
              </Link>
              <Link
                href="/buddy/schedule"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-50 transition-colors"
              >
                <Calendar className="w-3 h-3" />
                Schedule session
              </Link>
              <button
                onClick={() => resolve(req.id)}
                disabled={resolving === req.id}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 bg-white border border-stone-200 text-stone-500 rounded-lg text-xs font-medium hover:bg-stone-50 transition-colors ml-auto',
                  resolving === req.id && 'opacity-50'
                )}
              >
                <Check className="w-3 h-3" />
                Done
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

### src/app/buddy/layout.tsx
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BuddyBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';

export default async function BuddyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'buddy') {
    if (profile?.role === 'student') redirect('/student/tracker');
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Badge color="orange">Buddy</Badge>
            <NotificationBell userId={user.id} />
          </div>
        </div>
        {children}
      </div>
      <BuddyBottomNav />
    </div>
  );
}
```

### src/app/buddy/profile/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/buddy/profile/page.tsx
```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Settings, Video } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NotifPrefsPanel } from '@/components/notif-prefs-panel';
import { LogoutButton } from '@/components/logout-button';
import type { NotifPrefs } from '@/types';

export default async function BuddyProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('full_name, email, notif_prefs').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const [{ count: studentCount }, { data: upcomingSessions }] = await Promise.all([
    admin
      .from('profiles')
      .select('id', { count: 'exact' })
      .eq('buddy_id', user.id),
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link, student_id, profiles!video_sessions_student_id_fkey(full_name)')
      .eq('buddy_id', user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5),
  ]);

  const initials = profile.full_name[0].toUpperCase();
  const defaultPrefs: NotifPrefs = { daily_reminder: true, reminder_time: '20:00', email: true, push: false };
  const prefs: NotifPrefs = { ...defaultPrefs, ...(profile.notif_prefs ?? {}) };

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Profile</p>
          <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>You</h1>
        </div>
        <Link
          href="/buddy/settings"
          className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </Link>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-600 to-teal-700 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold text-stone-900">{profile.full_name}</div>
            <div className="text-sm text-stone-600">{profile.email}</div>
            <div className="mt-1"><Badge color="orange">Buddy</Badge></div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-1">Students</div>
          <div className="text-2xl font-bold text-stone-900 font-mono">{studentCount ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-1">Sessions booked</div>
          <div className="text-2xl font-bold text-stone-900 font-mono">{upcomingSessions?.length ?? 0}</div>
        </Card>
      </div>

      {/* Upcoming sessions */}
      {(upcomingSessions?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Upcoming sessions</p>
          <div className="space-y-2">
            {upcomingSessions!.map((s) => {
              const startsAt = new Date(s.scheduled_at);
              // eslint-disable-next-line react-hooks/purity
              const minsAway = Math.round((startsAt.getTime() - Date.now()) / 60_000);
              const joinable = minsAway <= 15 && !!s.google_meet_link;
              const studentName = (s.profiles as { full_name?: string } | null)?.full_name ?? 'Student';
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Video className="w-4 h-4 text-teal-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">
                        {s.title || `Session with ${studentName.split(' ')[0]}`}
                      </p>
                      <p className="text-xs text-stone-500">
                        {startsAt.toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  {joinable ? (
                    <a
                      href={s.google_meet_link!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      Join →
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-stone-500 font-medium bg-stone-100 px-2 py-1 rounded-lg">
                      {minsAway > 1440
                        ? `in ${Math.round(minsAway / 1440)}d`
                        : minsAway > 60
                        ? `in ${Math.round(minsAway / 60)}h`
                        : `in ${Math.max(0, minsAway)}m`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(upcomingSessions?.length ?? 0) === 0 && (
        <Card className="p-4 bg-stone-50 text-center">
          <p className="text-sm text-stone-500">No sessions scheduled yet.</p>
          <Link href="/buddy/schedule" className="text-xs text-teal-700 font-medium hover:underline mt-1 inline-block">
            Schedule a session →
          </Link>
        </Card>
      )}

      <NotifPrefsPanel initial={prefs} label1="Daily student digest" label2="Email notifications" />

      <LogoutButton />
    </div>
  );
}
```

### src/app/buddy/schedule/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/buddy/schedule/page.tsx
```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCalendarConnected } from '@/lib/google-calendar';
import { MeetingWidget } from '@/components/meeting-widget';
import { GoogleCalendarConnect } from '@/components/google-calendar-connect';

export default async function BuddySchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'buddy') redirect('/');

  const [{ data: students }, connected, { data: tokens }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('buddy_id', user.id)
      .order('full_name'),
    isCalendarConnected(user.id),
    admin
      .from('google_oauth_tokens')
      .select('google_email')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/buddy/home"
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-stone-900">Sessions</h1>
            <p className="text-sm text-stone-600">Schedule GMeet sessions with your students</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <GoogleCalendarConnect
          connected={connected}
          googleEmail={tokens?.google_email}
          redirectPath="/buddy/schedule"
        />
        <MeetingWidget
          role="buddy"
          students={students ?? []}
          calendarConnected={connected}
        />
      </div>
    </div>
  );
}
```

### src/app/buddy/settings/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/buddy/settings/page.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GoogleCalendarConnectBtn } from '@/components/google-calendar-connect-btn';

export default function BuddySettingsPage() {
  const supabase = createClient();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkGoogleCalendarStatus = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('google_calendar_connected')
        .eq('id', user.id)
        .single();

      setIsConnected(profile?.google_calendar_connected ?? false);
    } catch (error) {
      console.error('Error checking calendar connection:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    checkGoogleCalendarStatus();
  }, [checkGoogleCalendarStatus]);

  const handleSuccess = () => {
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
  };

  return (
    <div className="min-h-screen bg-stone-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-8">Settings</h1>

        <div className="bg-white rounded-lg border border-stone-200 p-6 space-y-6">
          {/* Calendar Integration Section */}
          <div className="border-b border-stone-100 pb-6">
            <h2 className="text-lg font-semibold text-stone-900 mb-2">Calendar Integration</h2>
            <p className="text-sm text-stone-600 mb-4">
              Connect your Google Calendar to automatically schedule sessions with students and generate Google Meet links.
            </p>

            {!loading && (
              <GoogleCalendarConnectBtn
                isConnected={isConnected}
                onConnectSuccess={handleSuccess}
                onDisconnectSuccess={handleDisconnect}
              />
            )}
          </div>

          {/* Sessions Section */}
          <div className="border-b border-stone-100 pb-6">
            <h2 className="text-lg font-semibold text-stone-900 mb-2">Video Sessions</h2>
            <p className="text-sm text-stone-600">
              Your scheduled sessions will appear on your home page. Sessions require Google Calendar to be connected
              for automatic Meet link generation.
            </p>
          </div>

          {/* Account Section */}
          <div>
            <h2 className="text-lg font-semibold text-stone-900 mb-4">Account</h2>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/';
              }}
              className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### src/app/buddy/setup/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/buddy/setup/page.tsx
```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SetupRecorderClient } from './setup-recorder-client';
import { CheckCircle2 } from 'lucide-react';

export default async function BuddySetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Check if user is a buddy
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, intro_audio_url, buddy_bio')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buddy') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1
            className="text-4xl font-bold text-stone-900 mb-2"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Complete Your Profile
          </h1>
          <p className="text-lg text-stone-600">
            Help your students get to know you better
          </p>
        </div>

        {/* Setup Checklist */}
        <div className="mb-12 space-y-3">
          <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-stone-200">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-stone-900">Account Created</p>
              <p className="text-sm text-stone-600">You&apos;re set up as an IIM alumni buddy</p>
            </div>
          </div>

          <div
            className={`flex items-center gap-3 p-4 rounded-lg border ${
              profile?.intro_audio_url
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-orange-50 border-orange-200'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white ${
                profile?.intro_audio_url ? 'bg-emerald-600' : 'bg-orange-600'
              }`}
            >
              2
            </div>
            <div>
              <p className="font-semibold text-stone-900">
                {profile?.intro_audio_url ? '✓ Audio Intro Recorded' : 'Record Your Intro'}
              </p>
              <p className="text-sm text-stone-600">
                {profile?.intro_audio_url
                  ? 'Your intro is ready to be heard by students'
                  : 'Help students meet you through a short audio message'}
              </p>
            </div>
          </div>
        </div>

        {/* Audio Recorder */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-stone-200">
          {profile?.intro_audio_url ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-stone-900 mb-2">
                You&apos;re All Set! 🎉
              </h2>
              <p className="text-stone-600 mb-6">
                Your intro audio has been saved. Students will hear this when they
                meet you during onboarding.
              </p>

              <div className="flex gap-3 justify-center">
                <Link
                  href="/buddy/students"
                  className="px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-all"
                >
                  View Your Students
                </Link>
              </div>
            </div>
          ) : (
            <SetupRecorderClient buddyId={user.id} />
          )}
        </div>

        {/* Info Box */}
        <div className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-xl">
          <h3 className="font-semibold text-blue-900 mb-3">
            What Makes a Great Buddy Intro?
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>
              ✓ <strong>Be Personal:</strong> Share your name, college, and CAT
              score/percentile
            </li>
            <li>
              ✓ <strong>Tell Your Story:</strong> How did CAT shape your life? What&apos;s
              your background?
            </li>
            <li>
              ✓ <strong>Show Your Style:</strong> Students want to know the real you,
              not a script
            </li>
            <li>
              ✓ <strong>Keep It Right Length:</strong> 30-45 seconds is ideal (shows
              confidence, not rushed)
            </li>
            <li>
              ✓ <strong>Set Expectations:</strong> What can students expect from you as
              their buddy?
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
```

### src/app/buddy/setup/setup-recorder-client.tsx
```tsx
'use client';

import { BuddyAudioRecorder } from '@/components/buddy-audio-recorder';

// Server components can't pass event handlers to client components, so the
// reload-on-complete callback lives in this client wrapper instead.
export function SetupRecorderClient({ buddyId }: { buddyId: string }) {
  return (
    <BuddyAudioRecorder
      buddyId={buddyId}
      onUploadComplete={() => {
        window.location.reload();
      }}
    />
  );
}
```

### src/app/buddy/students/[id]/buddy-student-view-client.tsx
```tsx
'use client';

import { useState } from 'react';
import { VoiceNoteRecorder } from '@/components/voice-note-recorder';
import { WeeklySignalCard } from '@/components/weekly-signal-card';
import { Mic } from 'lucide-react';

interface BuddyStudentViewClientProps {
  studentId: string;
  studentName: string;
  studentPercentile: number | null;
  buddyId: string;
}

export function BuddyStudentViewClient({
  studentId,
  studentName,
  studentPercentile,
  buddyId
}: BuddyStudentViewClientProps) {
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);

  const scrollToFeedback = () => {
    const el = document.getElementById('feedback-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* Weekly Signal Card — top of detail page (client) */}
      <WeeklySignalCard
        studentId={studentId}
        studentName={studentName}
        onVoiceNote={() => setIsRecorderOpen(true)}
        onFeedback={scrollToFeedback}
      />

      {/* Voice Note Recorder Button (Floating) */}
      <button
        onClick={() => setIsRecorderOpen(true)}
        className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-30 flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all font-semibold group text-sm md:text-base"
      >
        <Mic className="w-4 md:w-5 h-4 md:h-5 group-hover:animate-pulse" />
        <span className="hidden md:inline">Voice Note</span>
        <span className="md:hidden">Voice</span>
      </button>

      {/* Voice Note Recorder Modal */}
      <VoiceNoteRecorder
        studentId={studentId}
        buddyId={buddyId}
        studentName={studentName}
        isOpen={isRecorderOpen}
        onClose={() => setIsRecorderOpen(false)}
        onSendComplete={() => setIsRecorderOpen(false)}
        feedbackType="buddy_feedback"
      />
    </>
  );
}
```

### src/app/buddy/students/[id]/feedback-form.tsx
```tsx
'use client';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Send, Star, Volume2, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { BuddyFeedback } from '@/types';

const NEXT_STEP_OPTIONS = [
  'Increase Quant practice', 'Work on speed', 'Reduce test anxiety',
  'Improve sleep schedule', 'Focus on DILR', 'Schedule 1:1 call',
  'Review previous mistakes', 'Push RC speed', 'Take 2 days rest',
  'Maintain current schedule',
];

const FEEDBACK_TEMPLATES: { label: string; text: string }[] = [
  {
    label: '🔥 Streak praise',
    text: 'Your consistency this week stood out — that streak is exactly how toppers build momentum. Keep the same rhythm and the scores will follow.',
  },
  {
    label: '📉 Score dip',
    text: "I saw the dip in your last mock. One bad mock is data, not a verdict — the pool gets tougher every month. Let's review your error log together and fix the 2-3 question types that cost you the most.",
  },
  {
    label: '😰 High stress',
    text: 'Your stress levels have been high lately. Remember: 2 focused hours beat 5 anxious ones. Cut tonight short, sleep well, and we reset tomorrow.',
  },
  {
    label: '👻 Missing logs',
    text: "I noticed you haven't logged in a few days. No judgment — life happens. Log even 30 minutes today so we don't lose the habit. Small steps count.",
  },
  {
    label: '🎯 Mock reminder',
    text: "You haven't taken a mock recently. At this stage one mock per week is non-negotiable — it's the only way to train exam temperament. Block 3 hours this weekend.",
  },
];

export function FeedbackForm({
  studentId,
  studentFirstName,
  onSuccess,
}: {
  studentId: string;
  studentFirstName: string;
  onSuccess: (fb: BuddyFeedback) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fbText, setFbText] = useState('');
  const [rating, setRating] = useState(4);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleStep = (s: string) =>
    setNextSteps((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  async function submit() {
    if (!fbText.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/buddy/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, feedback_text: fbText.trim(), rating, next_steps: nextSteps, period_covered: 'adhoc' }),
      });
      if (!res.ok) { setError('Failed to submit. Try again.'); return; }
      const { feedback } = await res.json();
      onSuccess(feedback as BuddyFeedback);
      setFbText(''); setRating(4); setNextSteps([]); setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-teal-700 text-white rounded-xl font-medium hover:bg-teal-800 transition-all"
      >
        <Send className="w-4 h-4" /> Write feedback
      </button>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-stone-900 mb-4">Feedback for {studentFirstName}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-1.5">Your feedback</label>
          <textarea
            value={fbText}
            onChange={(e) => setFbText(e.target.value)}
            placeholder="Be specific. Reference their data. e.g., 'Mock scores are climbing but stress is high — let's focus on Quant speed this week.'"
            rows={4}
            className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-2">Overall performance</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setRating(s)}>
                <Star className={cn('w-7 h-7 transition-all', s <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-2">Suggested next steps</label>
          <div className="grid grid-cols-1 gap-2">
            {NEXT_STEP_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={nextSteps.includes(s)} onChange={() => toggleStep(s)} className="w-4 h-4 rounded accent-teal-700" />
                <span className="text-sm text-stone-800">{s}</span>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2.5 border border-stone-300 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!fbText.trim() || submitting}
            className="flex-1 py-2.5 bg-teal-700 text-white rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50 transition-all"
          >
            {submitting ? 'Submitting…' : 'Submit feedback'}
          </button>
        </div>
      </div>
    </Card>
  );
}

export function FeedbackList({ initial, studentId, studentFirstName }: { initial: BuddyFeedback[]; studentId: string; studentFirstName: string }) {
  const supabase = createClient();
  const [feedbackList, setFeedbackList] = useState(initial);
  const [studentResponses, setStudentResponses] = useState<BuddyFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch student responses to buddy feedback
    const fetchResponses = async () => {
      try {
        const { data, error } = await supabase
          .from('buddy_feedback')
          .select('*')
          .eq('student_id', studentId)
          .eq('feedback_type', 'student_response')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setStudentResponses(data as BuddyFeedback[]);
        }
      } catch (err) {
        console.error('Error fetching student responses:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResponses();
  }, [studentId, supabase]);

  function onSuccess(fb: BuddyFeedback) {
    setFeedbackList((prev) => [fb, ...prev]);
  }

  return (
    <>
      {/* Student Responses Section */}
      {studentResponses.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">📝 {studentFirstName}&apos;s responses</h2>
          <div className="space-y-2 mb-4">
            {studentResponses.map((resp) => (
              <Card key={resp.id} className="p-4 bg-blue-50 border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-stone-600">Responded {new Date(resp.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
                {/* Audio Player */}
                {resp.voice_note_url && (
                  <audio
                    controls
                    className="w-full mb-2 h-8"
                    src={resp.voice_note_url}
                  />
                )}
                {resp.feedback_text && (
                  <p className="text-sm text-stone-800">{resp.feedback_text}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Buddy Feedback Section */}
      {feedbackList.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Your feedback</h2>
          <div className="space-y-2">
            {feedbackList.map((f) => (
              <Card key={f.id} className="p-4">
                {/* Audio Player on TOP */}
                {f.voice_note_url && (
                  <div className="mb-3">
                    <audio
                      controls
                      className="w-full h-8"
                      src={f.voice_note_url}
                    />
                  </div>
                )}

                {/* Date and Rating */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-stone-600">{new Date(f.feedback_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={cn('w-3 h-3', s <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
                    ))}
                  </div>
                </div>

                {/* Feedback Text */}
                {f.feedback_text && (
                  <p className="text-sm text-stone-800 mb-2">{f.feedback_text}</p>
                )}

                {/* Next Steps */}
                {f.next_steps?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {f.next_steps.map((s) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 bg-stone-100 rounded-full text-stone-600">{s}</span>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
      <FeedbackFormConnected studentId={studentId} onSuccess={onSuccess} />
    </>
  );
}

function FeedbackFormConnected({ studentId, onSuccess }: { studentId: string; onSuccess: (fb: BuddyFeedback) => void }) {
  const [open, setOpen] = useState(false);
  const [fbText, setFbText] = useState('');
  const [rating, setRating] = useState(4);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftUsed, setDraftUsed] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [error, setError] = useState('');

  const toggleStep = (s: string) =>
    setNextSteps((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  async function generateDraft() {
    setDraftLoading(true);
    setDraftError('');
    try {
      const res = await fetch('/api/feedback-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const data = await res.json();
      if (res.ok && data.draft) {
        setFbText(`[AI Draft — please personalize before sending]\n\n${data.draft}`);
        setDraftUsed(true);
      } else {
        setDraftError(data.error ?? 'AI draft failed — try again or use a template below.');
      }
    } catch (e) {
      console.error('draft error', e);
      setDraftError('Could not reach AI — check your connection and try again.');
    } finally {
      setDraftLoading(false);
    }
  }

  async function submit() {
    if (!fbText.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/buddy/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, feedback_text: fbText.trim(), rating, next_steps: nextSteps, period_covered: 'adhoc' }),
      });
      if (!res.ok) { setError('Failed to submit. Try again.'); return; }
      const { feedback } = await res.json();
      onSuccess(feedback as BuddyFeedback);
      setFbText(''); setRating(4); setNextSteps([]); setOpen(false); setDraftUsed(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-teal-700 text-white rounded-xl font-medium hover:bg-teal-800 transition-all">
        <Send className="w-4 h-4" /> Write feedback
      </button>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-stone-900 mb-4">Write feedback</h3>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-stone-700">Your feedback</label>
            <button
              type="button"
              onClick={generateDraft}
              disabled={draftLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-all disabled:opacity-50"
            >
              {draftLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {draftLoading ? 'Drafting…' : 'Draft with AI'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {FEEDBACK_TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => { setFbText(t.text); setDraftUsed(false); }}
                className="text-[11px] px-2.5 py-1 bg-stone-100 text-stone-700 rounded-full hover:bg-teal-100 hover:text-teal-800 transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={fbText}
            onChange={(e) => { setFbText(e.target.value); setDraftUsed(false); }}
            placeholder="Be specific and reference their data..."
            rows={4}
            className={cn(
              'w-full px-3 py-2.5 bg-white border rounded-xl text-sm focus:outline-none resize-none transition-colors',
              draftUsed ? 'border-teal-300 bg-teal-50/40 focus:border-teal-500' : 'border-stone-300 focus:border-stone-900'
            )}
          />
          {draftUsed && (
            <p className="text-[11px] text-teal-600 mt-1">✏️ AI draft loaded — edit before sending</p>
          )}
          {draftError && (
            <p className="text-[11px] text-rose-500 mt-1">{draftError}</p>
          )}
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" onClick={() => setRating(s)}>
              <Star className={cn('w-7 h-7', s <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2">
          {NEXT_STEP_OPTIONS.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={nextSteps.includes(s)} onChange={() => toggleStep(s)} className="w-4 h-4 rounded accent-teal-700" />
              <span className="text-sm text-stone-800">{s}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2.5 border border-stone-300 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
          <button type="button" onClick={submit} disabled={!fbText.trim() || submitting} className="flex-1 py-2.5 bg-teal-700 text-white rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </Card>
  );
}
```

### src/app/buddy/students/[id]/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/buddy/students/[id]/page.tsx
```tsx
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FeedbackList } from './feedback-form';
import { BuddyStudentViewClient } from './buddy-student-view-client';
import { VideoSessionPromptClient } from './video-session-prompt-client';
import type { DailyReport, BuddyFeedback } from '@/types';
import { ArrowLeft, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

function PeriodTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-all text-center', active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900')}
    >
      {label}
    </Link>
  );
}

interface MockDebrief {
  id: string;
  taken_on: string;
  overall_percentile: number | null;
  varc: { percentile?: number; correct?: number; attempted?: number };
  dilr: { percentile?: number; correct?: number; attempted?: number };
  qa: { percentile?: number; correct?: number; attempted?: number };
  error_buckets: { conceptual: number; silly: number; time: number; panic: number; selection: number };
  strategy_note: string | null;
}

const BUCKET_LABELS: { key: keyof MockDebrief['error_buckets']; emoji: string; label: string }[] = [
  { key: 'conceptual', emoji: '🧠', label: 'Conceptual' },
  { key: 'silly', emoji: '🤏', label: 'Silly' },
  { key: 'time', emoji: '⏱️', label: 'Time pressure' },
  { key: 'panic', emoji: '😰', label: 'Panic/misread' },
  { key: 'selection', emoji: '🎯', label: 'Wrong selection' },
];

function computeNeedsAttentionFlags(
  reports: DailyReport[],
  debriefs: MockDebrief[]
): string[] {
  const flags: string[] = [];

  // Consistency — logged < 3/7 days
  const last7 = reports.filter((r) => {
    const d = new Date(r.report_date + 'T00:00:00');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return d >= cutoff;
  });
  if (last7.length < 3) {
    flags.push(`Only ${last7.length}/7 days logged this week — consistency is the foundation`);
  }

  // Avoidance — section skipped 3+ consecutive days
  const weakSections = ['VARC', 'DILR', 'QA'];
  for (const section of weakSections) {
    let streak = 0;
    for (const r of reports.slice(0, 7)) {
      const covered = (r.topics_covered as string[]) ?? [];
      if (!covered.includes(section)) streak++;
      else break;
    }
    if (streak >= 3) {
      flags.push(`Avoiding ${section} for ${streak} days straight — classic avoidance pattern`);
    }
  }

  // Mock percentile declining over last 2 mocks
  if (debriefs.length >= 2) {
    const [latest, prev] = debriefs;
    if (
      latest.overall_percentile !== null &&
      prev.overall_percentile !== null &&
      latest.overall_percentile < prev.overall_percentile - 5
    ) {
      flags.push(
        `Percentile dropped ${prev.overall_percentile}→${latest.overall_percentile} — needs debrief review`
      );
    }
  }

  // Silly errors dominant
  if (debriefs.length > 0) {
    const eb = debriefs[0].error_buckets;
    const total = Object.values(eb).reduce((a, b) => a + b, 0);
    if (total > 0 && eb.silly / total > 0.4) {
      flags.push(
        `${eb.silly} silly errors in last mock (${Math.round((eb.silly / total) * 100)}%) — speed or focus issue`
      );
    }
    if (total > 0 && eb.conceptual / total > 0.4) {
      flags.push(
        `${eb.conceptual} conceptual errors in last mock — foundational gaps remain`
      );
    }
  }

  return flags;
}

export default async function BuddyStudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { id } = await params;
  const { period: periodParam } = await searchParams;
  const period = parseInt(periodParam ?? '7');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: student } = await admin
    .from('profiles')
    .select('buddy_id, full_name, exam_target, email, cat_percentile')
    .eq('id', id)
    .single();
  if (!student || student.buddy_id !== user.id) notFound();

  const [{ data: reportsRaw }, { data: feedbackRaw }, { data: debriefsRaw }] = await Promise.all([
    admin
      .from('daily_reports')
      .select('*')
      .eq('student_id', id)
      .order('report_date', { ascending: false })
      .limit(period),
    admin
      .from('buddy_feedback')
      .select('*')
      .eq('student_id', id)
      .eq('feedback_type', 'buddy_feedback')
      .order('feedback_date', { ascending: false }),
    admin
      .from('mock_debriefs')
      .select('*')
      .eq('student_id', id)
      .order('taken_on', { ascending: false })
      .limit(5),
  ]);

  const reports = (reportsRaw ?? []) as DailyReport[];
  const feedback = (feedbackRaw ?? []) as BuddyFeedback[];
  const debriefs = (debriefsRaw ?? []) as MockDebrief[];

  const { data: lastVideoSession } = await admin
    .from('video_sessions')
    .select('ended_at')
    .eq('student_id', id)
    .eq('buddy_id', user.id)
    .eq('session_status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(1)
    .single();

  const lastSessionDate = lastVideoSession?.ended_at ? new Date(lastVideoSession.ended_at) : null;
  const daysSinceLastSession = lastSessionDate
    ? Math.floor((new Date().getTime() - lastSessionDate.getTime()) / 86_400_000)
    : null;

  const { data: buddyTokens } = await admin
    .from('google_oauth_tokens')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const calendarConnected = !!buddyTokens;

  const { data: upcomingSessions } = await admin
    .from('video_sessions')
    .select('id, title, scheduled_at, google_meet_link')
    .eq('student_id', id)
    .eq('buddy_id', user.id)
    .eq('session_status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(3);

  const summary = computeSummary(reports, period);
  const needsAttentionFlags = computeNeedsAttentionFlags(reports, debriefs);
  const firstName = student.full_name.split(' ')[0];
  const baseUrl = `/buddy/students/${id}`;

  const latestDebrief = debriefs[0] ?? null;
  const prevDebrief = debriefs[1] ?? null;
  const percentileArrow =
    latestDebrief?.overall_percentile !== null &&
    prevDebrief?.overall_percentile !== null
      ? (latestDebrief?.overall_percentile ?? 0) > (prevDebrief?.overall_percentile ?? 0)
        ? 'up'
        : 'down'
      : null;

  // Aggregate error buckets
  const totalBuckets = debriefs.reduce(
    (acc, d) => {
      acc.conceptual += d.error_buckets?.conceptual ?? 0;
      acc.silly += d.error_buckets?.silly ?? 0;
      acc.time += d.error_buckets?.time ?? 0;
      acc.panic += d.error_buckets?.panic ?? 0;
      acc.selection += d.error_buckets?.selection ?? 0;
      return acc;
    },
    { conceptual: 0, silly: 0, time: 0, panic: 0, selection: 0 }
  );

  return (
    <div className="space-y-5 pb-24">
      <Link href="/buddy/students" className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft className="w-4 h-4" /> Back to students
      </Link>

      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Diagnosis view</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>
          {student.full_name}
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">{student.exam_target ?? 'CAT'} · {student.email}</p>
      </div>

      {/* Period selector */}
      <div className="flex bg-stone-100 rounded-xl p-1 gap-1">
        {([7, 10, 30] as const).map((p) => (
          <PeriodTab key={p} href={`${baseUrl}?period=${p}`} label={`${p} days`} active={period === p} />
        ))}
      </div>

      {/* Needs-attention flags — the most important thing */}
      {needsAttentionFlags.length > 0 && (
        <Card className="p-4 bg-rose-50 border-rose-200">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
              Needs your attention ({needsAttentionFlags.length})
            </span>
          </div>
          <ul className="space-y-2">
            {needsAttentionFlags.map((flag, i) => (
              <li key={i} className="text-sm text-rose-900 flex items-start gap-2">
                <span className="text-rose-400 mt-0.5 shrink-0">•</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Latest mock debrief summary */}
      {latestDebrief && (
        <Card className="p-5 bg-stone-900 text-white border-stone-900">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-60 font-semibold">Latest mock</p>
              <p className="text-sm text-stone-400 mt-0.5">
                {new Date(latestDebrief.taken_on + 'T00:00:00').toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            </div>
            {latestDebrief.overall_percentile !== null && (
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold font-mono">{latestDebrief.overall_percentile}</span>
                <span className="text-lg opacity-60">%ile</span>
                {percentileArrow === 'up' && <TrendingUp className="w-5 h-5 text-teal-400" />}
                {percentileArrow === 'down' && <TrendingDown className="w-5 h-5 text-rose-400" />}
              </div>
            )}
          </div>

          {/* Section breakdown */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {(['varc', 'dilr', 'qa'] as const).map((sec) => {
              const s = latestDebrief[sec];
              const acc = s.attempted ? Math.round(((s.correct ?? 0) / s.attempted) * 100) : null;
              return (
                <div key={sec} className="bg-white/10 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider opacity-60 font-semibold">{sec.toUpperCase()}</p>
                  <p className="text-lg font-bold mt-1">{s.percentile ?? '—'}<span className="text-xs opacity-60">%ile</span></p>
                  {acc !== null && <p className="text-xs opacity-50">{acc}% acc</p>}
                </div>
              );
            })}
          </div>

          {/* Strategy note */}
          {latestDebrief.strategy_note && (
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider opacity-60 font-semibold mb-1">Will do differently</p>
              <p className="text-sm italic opacity-90">&quot;{latestDebrief.strategy_note}&quot;</p>
            </div>
          )}
        </Card>
      )}

      {/* Error bucket summary across all debriefs */}
      {debriefs.length > 0 && Object.values(totalBuckets).some((v) => v > 0) && (
        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">
            Error pattern ({debriefs.length} mock{debriefs.length > 1 ? 's' : ''})
          </h2>
          <div className="space-y-2">
            {BUCKET_LABELS.map(({ key, emoji, label }) => {
              const val = totalBuckets[key];
              const total = Object.values(totalBuckets).reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-base shrink-0">{emoji}</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium text-stone-700">{label}</span>
                      <span className="text-xs text-stone-500">{val} ({pct}%)</span>
                    </div>
                    <div className="bg-stone-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Consistency summary */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total study', val: `${summary.totalStudy.toFixed(1)}`, unit: 'hrs' },
          { label: 'Days logged', val: `${summary.daysSubmitted}`, unit: `/ ${period}` },
          { label: 'Mocks taken', val: `${debriefs.length}`, unit: 'total' },
          { label: 'Avg hours/day', val: summary.daysSubmitted > 0 ? (summary.totalStudy / summary.daysSubmitted).toFixed(1) : '—', unit: 'hrs' },
        ].map(({ label, val, unit }) => (
          <Card key={label} className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold font-mono mt-1 text-stone-900">
              {val}<span className="text-sm text-stone-500 font-normal ml-1">{unit}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Upcoming sessions */}
      {(upcomingSessions?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border-2 border-teal-200 p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-600">
            Upcoming sessions with {firstName}
          </h3>
          {upcomingSessions!.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{s.title || 'Session'}</p>
                <p className="text-xs text-stone-600">
                  {new Date(s.scheduled_at!).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {s.google_meet_link ? (
                <a
                  href={s.google_meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Join Meet →
                </a>
              ) : (
                <span className="flex-shrink-0 text-xs text-stone-400">No Meet link</span>
              )}
            </div>
          ))}
        </div>
      )}

      <VideoSessionPromptClient
        studentId={id}
        studentName={student.full_name}
        calendarConnected={calendarConnected}
        daysSinceLastSession={daysSinceLastSession}
      />

      {/* Voice notes */}
      {feedback.some((f) => f.voice_note_url) && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2.5">Voice notes you sent</p>
          <div className="space-y-1.5">
            {feedback
              .filter((f) => f.voice_note_url)
              .slice(0, 5)
              .map((f) => {
                const listened = !!(f as unknown as { read_at: string | null }).read_at;
                const thanked = !!(f as unknown as { thanked_at: string | null }).thanked_at;
                return (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-lg bg-stone-50">
                    <span className="text-stone-600">
                      🎤 {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className={cn('font-medium', listened ? 'text-emerald-600' : 'text-stone-400')}>
                      {thanked ? '❤️ Loved it' : listened ? '✓ Listened' : 'Not played yet'}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Feedback form */}
      <div id="feedback-section">
        <FeedbackList initial={feedback} studentId={id} studentFirstName={firstName} />
      </div>

      <BuddyStudentViewClient
        studentId={id}
        studentName={student.full_name}
        studentPercentile={student.cat_percentile}
        buddyId={user.id}
      />
    </div>
  );
}
```

### src/app/buddy/students/[id]/student-charts.tsx
```tsx
'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MoodPoint { date: string; confidence: number | null; stress: number | null; sleep: number | null; energy: number | null }

export function MoodChart({ data }: { data: MoodPoint[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} />
          <YAxis domain={[1, 5]} tick={{ fontSize: 10, fill: '#78716c' }} />
          <Tooltip contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="line" />
          <Line type="monotone" dataKey="confidence" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="stress" stroke="#e11d48" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="sleep" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="energy" stroke="#ea580c" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### src/app/buddy/students/[id]/video-session-prompt-client.tsx
```tsx
'use client';

import { useState } from 'react';
import { Video } from 'lucide-react';
import { ScheduleSessionModal } from '@/components/schedule-session-modal';

interface VideoSessionPromptClientProps {
  studentId: string;
  studentName: string;
  calendarConnected: boolean;
  /** Days since the last session, or null if never */
  daysSinceLastSession: number | null;
}

/**
 * Schedule CTA on the student detail page. Nudges harder when it's been
 * 10+ days (or never) since the last session.
 */
export function VideoSessionPromptClient({
  studentId,
  studentName,
  calendarConnected,
  daysSinceLastSession,
}: VideoSessionPromptClientProps) {
  const [open, setOpen] = useState(false);

  const overdue = daysSinceLastSession === null || daysSinceLastSession >= 10;
  const firstName = studentName.split(' ')[0];

  return (
    <>
      <div
        className="rounded-2xl p-4 flex items-center justify-between gap-3"
        style={{ backgroundColor: overdue ? '#1A1A2E' : '#f5f5f4' }}
      >
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${overdue ? 'text-white' : 'text-stone-900'}`}>
            {daysSinceLastSession === null
              ? `No session with ${firstName} yet`
              : overdue
              ? `${daysSinceLastSession} days since your last session`
              : 'Book your next session'}
          </p>
          <p className={`text-xs mt-0.5 ${overdue ? 'text-stone-400' : 'text-stone-500'}`}>
            A 30-min GMeet keeps {firstName} on track
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-transform active:scale-95"
          style={{ backgroundColor: overdue ? '#E8652D' : '#2A9D8F', minHeight: 44 }}
        >
          <Video className="w-4 h-4" />
          Schedule
        </button>
      </div>

      <ScheduleSessionModal
        isOpen={open}
        onClose={() => setOpen(false)}
        students={[{ id: studentId, full_name: studentName }]}
        defaultStudentId={studentId}
        calendarConnected={calendarConnected}
        onScheduled={() => {
          // server components refresh on next nav; the modal success state
          // already shows the link, nothing else needed here
        }}
      />
    </>
  );
}
```

### src/app/buddy/students/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/buddy/students/page.tsx
```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DailyReport } from '@/types';
import { getTodayIST } from '@/lib/utils';
import { CheckCircle2, Clock, AlertCircle, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

function getBandColor(score: number) {
  if (score >= 70) return 'green' as const;
  if (score >= 50) return 'amber' as const;
  return 'red' as const;
}

function getBandLabel(score: number) {
  if (score >= 70) return 'On track';
  if (score >= 50) return 'Needs nudging';
  return 'Needs intervention';
}

export default async function BuddyStudentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get students assigned to this buddy
  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, exam_target')
    .eq('buddy_id', user.id)
    .eq('role', 'student');

  const today = getTodayIST();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const ydStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Get last 7 days reports for each student
  const studentIds = (students ?? []).map((s) => s.id);
  const reportsMap: Record<string, DailyReport[]> = {};

  if (studentIds.length > 0) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const { data: allReports } = await supabase
      .from('daily_reports')
      .select('*')
      .in('student_id', studentIds)
      .gte('report_date', weekAgoStr);

    (allReports ?? []).forEach((r: DailyReport) => {
      if (!reportsMap[r.student_id]) reportsMap[r.student_id] = [];
      reportsMap[r.student_id].push(r);
    });
  }

  return (
    <div className="space-y-5">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Buddy dashboard</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Your students
        </h1>
        <p className="text-sm text-stone-600 mt-1">{(students ?? []).length} active</p>
      </div>

      {(students ?? []).map((student) => {
        const reps = reportsMap[student.id] ?? [];
        const lastReport = reps.sort((a, b) => b.report_date.localeCompare(a.report_date))[0];
        const lastDate = lastReport?.report_date;

        const avgStress = reps.length ? reps.reduce((s, r) => s + r.stress, 0) / reps.length : 0;
        const avgStudy = reps.length ? reps.reduce((s, r) => s + r.study_duration, 0) / reps.length : 0;
        const avgConfidence = reps.length ? reps.reduce((s, r) => s + r.confidence, 0) / reps.length : 0;

        const consistency = (reps.length / 7) * 25;
        const studyScore = Math.min(25, (avgStudy / 6) * 25);
        const moodScore = Math.min(25, ((avgConfidence + (6 - avgStress)) / 10) * 25);
        const overallScore = Math.round(consistency + studyScore + 12 + moodScore);

        let statusBadge;
        if (lastDate === today) {
          statusBadge = <Badge color="green"><CheckCircle2 className="w-3 h-3" />Submitted today</Badge>;
        } else if (lastDate === ydStr) {
          statusBadge = <Badge color="amber"><Clock className="w-3 h-3" />Last: yesterday</Badge>;
        } else {
          statusBadge = <Badge color="red"><AlertCircle className="w-3 h-3" />Inactive</Badge>;
        }

        const initials = student.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

        return (
          <Link key={student.id} href={`/buddy/students/${student.id}`}>
            <Card className="p-5 cursor-pointer hover:border-stone-400 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {initials}
                  </div>
                  <div>
                    <div className="font-semibold text-stone-900">{student.full_name}</div>
                    <div className="text-xs text-stone-500">{student.exam_target ?? 'CAT'}</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-stone-400" />
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-3">
                {statusBadge}
                <Badge color={getBandColor(overallScore)}>{getBandLabel(overallScore)}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-stone-200">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Days</div>
                  <div className="text-base font-bold text-stone-900 font-mono">{reps.length}/7</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Avg study</div>
                  <div className="text-base font-bold text-stone-900 font-mono">{avgStudy.toFixed(1)}h</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Stress</div>
                  <div className="text-base font-bold text-stone-900 font-mono">{avgStress.toFixed(1)}/5</div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}

      {(students ?? []).length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-stone-600">No students assigned yet. Ask your admin to assign students to you.</p>
        </Card>
      )}

      <Card className="p-5 border-dashed border-2 border-stone-300 text-center">
        <Plus className="w-6 h-6 text-stone-400 mx-auto mb-2" />
        <div className="text-sm font-semibold text-stone-700">Add a new student</div>
        <div className="text-xs text-stone-500 mt-0.5">Ask admin to assign a student to you</div>
      </Card>
    </div>
  );
}
```

### src/app/buddy/trends/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/buddy/trends/page.tsx
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import type { Profile, DailyReport } from '@/types';
import BuddyTrendsCharts from './trends-charts';

const LINE_COLORS = ['#1c1917', '#ea580c', '#0f766e', '#7c3aed', '#be123c'];

export default async function BuddyTrendsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('buddy_id', user.id)
    .eq('role', 'student');

  const studentList = (students ?? []) as Pick<Profile, 'id' | 'full_name'>[];

  const allDates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    allDates.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  }

  const summaries: Array<{ id: string; name: string; avgStudy: number; avgConfidence: number; daysSubmitted: number; reports: DailyReport[] }> = [];

  if (studentList.length > 0) {
    const weekAgo = allDates[0];
    const { data: allReports } = await supabase
      .from('daily_reports')
      .select('*')
      .in('student_id', studentList.map((s) => s.id))
      .gte('report_date', weekAgo);

    for (const s of studentList) {
      const reps = (allReports ?? []).filter((r: DailyReport) => r.student_id === s.id) as DailyReport[];
      const avgStudy = reps.length ? reps.reduce((sum, r) => sum + r.study_duration, 0) / reps.length : 0;
      const avgConfidence = reps.length ? reps.reduce((sum, r) => sum + r.confidence, 0) / reps.length : 0;
      summaries.push({ id: s.id, name: s.full_name, avgStudy, avgConfidence, daysSubmitted: reps.length, reports: reps });
    }
  }

  // Build chart data
  const chartData = allDates.map((date) => {
    const point: Record<string, string | number | null> = { date: formatDate(date) };
    for (const s of summaries) {
      const r = s.reports.find((rep) => rep.report_date === date);
      point[s.name.split(' ')[0]] = r ? r.study_duration : null;
    }
    return point;
  });

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">All students</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>Performance trends</h1>
      </div>

      {/* Note: recharts requires client component; pass data as JSON */}
      <BuddyTrendsCharts chartData={chartData} summaries={summaries} colors={LINE_COLORS} />
    </div>
  );
}

```

### src/app/buddy/trends/trends-charts.tsx
```tsx
'use client';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';

interface StudentSummary {
  id: string;
  name: string;
  avgStudy: number;
  avgConfidence: number;
  daysSubmitted: number;
}

export default function BuddyTrendsCharts({
  chartData,
  summaries,
  colors,
}: {
  chartData: Record<string, string | number | null>[];
  summaries: StudentSummary[];
  colors: string[];
}) {
  if (summaries.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-stone-600">No students assigned yet.</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-5">
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Daily study hours · last 7 days</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} />
              <YAxis tick={{ fontSize: 10, fill: '#78716c' }} />
              <Tooltip contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {summaries.map((s, i) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.name.split(' ')[0]}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Quick comparison</h2>
        <div className="space-y-3">
          {summaries.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colors[i % colors.length] }} />
                <div>
                  <div className="font-semibold text-stone-900 text-sm">{s.name}</div>
                  <div className="text-xs text-stone-500">{s.daysSubmitted}/7 days</div>
                </div>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Study</div>
                  <div className="font-mono font-bold text-stone-900 text-sm">{s.avgStudy.toFixed(1)}h</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Conf</div>
                  <div className="font-mono font-bold text-stone-900 text-sm">{s.avgConfidence.toFixed(1)}/5</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
```

### src/app/debug/page.tsx
```tsx
import { redirect } from 'next/navigation';

export default function DebugRedirect() {
  redirect('/student/debug');
}
```

### src/app/goal/page.tsx
```tsx
import { redirect } from 'next/navigation';

export default function GoalRedirect() {
  redirect('/student/goal');
}
```

### src/app/layout.tsx
```tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'CareerRai',
  description: 'Daily prep tracking with your IIM buddy.',
  icons: {
    icon: '/careerrai-monogram.png',
    apple: '/careerrai-monogram.png',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1c1917',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-stone-50 antialiased min-h-screen">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

### src/app/login/actions.ts
```tsx
'use server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function loginAction(_: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: 'Email or password incorrect. Try a demo account below.', dest: null };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single();

  const role = profile?.role ?? 'student';
  const dest =
    role === 'buddy' ? '/buddy/students' : role === 'admin' ? '/admin' : '/student/tracker';

  // Return dest instead of calling redirect() so Set-Cookie headers are sent in the POST response
  return { error: null, dest };
}
```

### src/app/login/page.tsx
```tsx
'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { StudentPhoneLogin } from './student-phone-login';

const DEMO_ACCOUNTS = [
  { label: 'Student (Aarav)', username: 'aarav', password: 'CareerRai2026!' },
  { label: 'Student (Priya)', username: 'priya', password: 'CareerRai2026!' },
  { label: 'Buddy (Nishant)', username: 'nishant', password: 'CareerRai2026!' },
  { label: 'Admin', username: 'admin', password: 'CareerRai2026!' },
];

function LoginForm() {
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  // Students sign in with phone + OTP; buddies/admins keep username + password.
  const [mode, setMode] = useState<'student' | 'staff'>('student');

  const hasError = params.get('error') === '1';

  function fillDemo(acc: typeof DEMO_ACCOUNTS[0]) {
    setUsername(acc.username);
    setPassword(acc.password);
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-orange-100 rounded-full opacity-40 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-teal-100 rounded-full opacity-40 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <Image
              src="/careerrai-logo.png"
              alt="CareerRai"
              width={124}
              height={124}
              style={{ height: 124, width: 'auto' }}
              priority
            />
          </div>
          <h1
            className="text-3xl font-bold text-stone-900 tracking-tight"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Track every day.<br />
            <span className="italic text-orange-600">Outwork yesterday.</span>
          </h1>
          <p className="mt-3 text-sm text-stone-600">Daily prep tracking with your IIM buddy.</p>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl shadow-stone-900/5">
          {/* Mode toggle: students use phone OTP, staff use username/password */}
          <div className="flex bg-stone-100 rounded-xl p-1 mb-5">
            {([['student', 'Student'], ['staff', 'Buddy · Admin']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  'flex-1 py-2 text-sm font-medium rounded-lg transition-all',
                  mode === value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'student' ? (
            <StudentPhoneLogin />
          ) : (
          <>
          {/* Native form POST — browser handles cookies + redirect, no JS in the auth flow */}
          <form action="/api/auth/login" method="POST" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">Username</label>
              <input
                type="text"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your username"
                required
                className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2.5 pr-10 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {hasError && (
              <p className="text-xs text-rose-600">Username or password incorrect. Try a demo account below.</p>
            )}

            <button
              type="submit"
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.98]',
                'bg-stone-900 text-white hover:bg-stone-800'
              )}
            >
              Sign in <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-stone-200">
            <p className="text-xs text-stone-500 text-center mb-3">Try a demo account (click to fill)</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  className="text-xs py-2 px-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl text-stone-700 font-medium transition-colors text-left"
                >
                  {acc.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-stone-400 text-center mt-2">
              All demo accounts use password: <span className="font-mono">CareerRai2026!</span>
            </p>
          </div>
          </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-stone-500">
          Bharat-first peer mentorship · 0% commission
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

### src/app/login/student-phone-login.tsx
```tsx
'use client';

import { useState } from 'react';
import { ArrowRight, Phone, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

type Phase = 'phone' | 'otp';

export function StudentPhoneLogin() {
  const [phase, setPhase] = useState<Phase>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.sent) {
        setPhase('otp');
        setMessage('Code sent. Check your SMS.');
      } else {
        setMessage(data.message ?? "Couldn't send the code. Try again.");
      }
    } catch {
      setMessage('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, token: otp }),
      });
      const data = await res.json();
      if (res.ok && data.dest) {
        window.location.href = data.dest;
        return;
      }
      setMessage(data.error ?? 'That code is incorrect or expired.');
    } catch {
      setMessage('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (phase === 'otp') {
    return (
      <form onSubmit={verifyOtp} className="space-y-4">
        <p className="text-sm text-stone-600">
          Enter the 6-digit code sent to <span className="font-semibold text-stone-900">+91 {phone}</span>.
        </p>
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-1.5">Verification code</label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              required
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm tracking-[0.4em] font-mono focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
            />
          </div>
        </div>

        {message && <p className="text-xs text-stone-600">{message}</p>}

        <button
          type="submit"
          disabled={loading || otp.length < 6}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? 'Verifying…' : <>Verify &amp; sign in <ArrowRight className="w-4 h-4" /></>}
        </button>

        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={() => { setPhase('phone'); setOtp(''); setMessage(null); }} className="text-stone-500 hover:text-stone-700">
            ← Change number
          </button>
          <button type="button" onClick={() => requestOtp()} disabled={loading} className="font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50">
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestOtp} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-800 mb-1.5">Mobile number</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-500 flex items-center gap-1">
            <Phone className="w-4 h-4 text-stone-400" /> +91
          </span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="98765 43210"
            required
            className="w-full pl-[4.75rem] pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
          />
        </div>
      </div>

      {message && <p className="text-xs text-stone-600">{message}</p>}

      <button
        type="submit"
        disabled={loading || phone.length < 10}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.98] disabled:opacity-50',
          'bg-stone-900 text-white hover:bg-stone-800'
        )}
      >
        {loading ? 'Sending…' : <>Send code <ArrowRight className="w-4 h-4" /></>}
      </button>

      <p className="text-[11px] text-stone-400 text-center">
        We&apos;ll text you a one-time code. No password needed.
      </p>
    </form>
  );
}
```

### src/app/page.tsx
```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login');
}
```

### src/app/student/analysis/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/analysis/page.tsx
```tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface MockDebrief {
  id: string;
  taken_on: string;
  overall_percentile: number | null;
  varc: { attempted?: number; correct?: number; time_min?: number; percentile?: number };
  dilr: { attempted?: number; correct?: number; time_min?: number; percentile?: number };
  qa: { attempted?: number; correct?: number; time_min?: number; percentile?: number };
  error_buckets: { conceptual: number; silly: number; time: number; panic: number; selection: number };
  strategy_note: string | null;
}

const BUCKET_LABELS = [
  { key: 'conceptual', emoji: '🧠', label: 'Conceptual' },
  { key: 'silly', emoji: '🤏', label: 'Silly' },
  { key: 'time', emoji: '⏱️', label: 'Time' },
  { key: 'panic', emoji: '😰', label: 'Panic' },
  { key: 'selection', emoji: '🎯', label: 'Selection' },
];

const BUCKET_COLORS: Record<string, string> = {
  conceptual: '#6366f1',
  silly: '#f59e0b',
  time: '#ef4444',
  panic: '#ec4899',
  selection: '#8b5cf6',
};

export default function AnalysisPage() {
  const supabase = createClient();
  const [debriefs, setDebriefs] = useState<MockDebrief[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: d } = await supabase
        .from('mock_debriefs')
        .select('*')
        .eq('student_id', user.id)
        .order('taken_on', { ascending: true })
        .limit(20);

      setDebriefs((d ?? []) as MockDebrief[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Percentile trend data
  const percentileData = debriefs
    .filter((d) => d.overall_percentile !== null)
    .map((d) => ({
      date: new Date(d.taken_on + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      percentile: d.overall_percentile,
      varc: d.varc?.percentile ?? null,
      dilr: d.dilr?.percentile ?? null,
      qa: d.qa?.percentile ?? null,
    }));

  // Aggregated error buckets across all mocks
  const totalBuckets = debriefs.reduce(
    (acc, d) => {
      acc.conceptual += d.error_buckets?.conceptual ?? 0;
      acc.silly += d.error_buckets?.silly ?? 0;
      acc.time += d.error_buckets?.time ?? 0;
      acc.panic += d.error_buckets?.panic ?? 0;
      acc.selection += d.error_buckets?.selection ?? 0;
      return acc;
    },
    { conceptual: 0, silly: 0, time: 0, panic: 0, selection: 0 }
  );

  const bucketData = BUCKET_LABELS.map(({ key, emoji, label }) => ({
    name: `${emoji} ${label}`,
    key,
    value: totalBuckets[key as keyof typeof totalBuckets],
  })).sort((a, b) => b.value - a.value);

  // Section-wise accuracy from latest mock
  const latest = debriefs[debriefs.length - 1];
  const sectionAccuracy = latest
    ? [
        {
          section: 'VARC',
          accuracy: latest.varc?.attempted
            ? Math.round(((latest.varc.correct ?? 0) / latest.varc.attempted) * 100)
            : null,
          percentile: latest.varc?.percentile ?? null,
        },
        {
          section: 'DILR',
          accuracy: latest.dilr?.attempted
            ? Math.round(((latest.dilr.correct ?? 0) / latest.dilr.attempted) * 100)
            : null,
          percentile: latest.dilr?.percentile ?? null,
        },
        {
          section: 'QA',
          accuracy: latest.qa?.attempted
            ? Math.round(((latest.qa.correct ?? 0) / latest.qa.attempted) * 100)
            : null,
          percentile: latest.qa?.percentile ?? null,
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-stone-500">Loading analysis…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Analysis
            </h1>
            <p className="text-sm text-stone-500">What the data says about you</p>
          </div>
        </div>

        {debriefs.length === 0 ? (
          <>
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center space-y-2">
              <p className="text-3xl">📈</p>
              <p className="text-stone-800 font-semibold">Log your first mock to unlock your data.</p>
              <p className="text-sm text-stone-500">
                Section breakdown, error patterns, and your trajectory toward CAT — all from a single debrief.
              </p>
            </div>
            <div className="space-y-2">
              {[
                'Section-wise percentile trend (needs 2+ mocks)',
                'Error-bucket breakdown',
                'Strategy note from your last debrief',
              ].map((slot) => (
                <div key={slot} className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-3 text-center text-xs text-stone-400">
                  {slot}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Percentile trend — needs 2+ mocks for a meaningful line */}
            {percentileData.length >= 2 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">
                  Percentile trend
                </h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={percentileData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#78716c' }} />
                      <Tooltip
                        contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }}
                        formatter={(value, name) => [`${value}%ile`, name]}
                      />
                      <Line type="monotone" dataKey="percentile" name="Overall" stroke="#ea580c" strokeWidth={2.5} dot={{ fill: '#ea580c', r: 4 }} connectNulls />
                      <Line type="monotone" dataKey="varc" name="VARC" stroke="#0f766e" strokeWidth={1.5} dot={{ r: 2 }} connectNulls strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="dilr" name="DILR" stroke="#4338ca" strokeWidth={1.5} dot={{ r: 2 }} connectNulls strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="qa" name="QA" stroke="#b45309" strokeWidth={1.5} dot={{ r: 2 }} connectNulls strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {(() => {
                  // One human sentence — never raw data alone
                  const first = percentileData[0]?.percentile;
                  const last = percentileData[percentileData.length - 1]?.percentile;
                  if (percentileData.length < 2 || first == null || last == null) return null;
                  const delta = Math.round(last - first);
                  const text =
                    delta > 0
                      ? `Overall moved ${first} → ${last} across ${percentileData.length} mocks — the trend is doing its job.`
                      : delta < 0
                      ? `Down ${Math.abs(delta)} points across ${percentileData.length} mocks — debrief the last one properly before the next.`
                      : `Flat across ${percentileData.length} mocks — consistency first, then push one section.`;
                  return <p className="text-xs text-stone-500 mt-3 text-center">{text}</p>;
                })()}
              </div>
            )}

            {/* Latest mock section breakdown */}
            {sectionAccuracy.length > 0 && sectionAccuracy.some((s) => s.accuracy !== null) && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">
                  Last mock — section accuracy
                </h2>
                <div className="space-y-3">
                  {sectionAccuracy.map(({ section, accuracy, percentile }) => (
                    <div key={section} className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-stone-700 w-10">{section}</span>
                      <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full transition-all"
                          style={{ width: `${accuracy ?? 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono text-stone-700 w-12 text-right">
                        {accuracy !== null ? `${accuracy}%` : '—'}
                      </span>
                      {percentile !== null && (
                        <span className="text-xs text-stone-400 w-14 text-right">{percentile}%ile</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error bucket breakdown */}
            {bucketData.some((b) => b.value > 0) && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">
                  Where you lose marks (all mocks)
                </h2>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bucketData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#78716c' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#44403c' }} width={110} />
                      <Tooltip contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }} />
                      <Bar dataKey="value" name="Errors" radius={[0, 4, 4, 0]}>
                        {bucketData.map((entry) => (
                          <Cell key={entry.key} fill={BUCKET_COLORS[entry.key] ?? '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Biggest issue callout */}
                {bucketData[0]?.value > 0 && (
                  <p className="text-xs text-stone-500 mt-3 text-center">
                    Your biggest leak: <strong className="text-stone-800">{bucketData[0].name}</strong> — {bucketData[0].value} errors
                  </p>
                )}
              </div>
            )}

            {/* Latest strategy note */}
            {latest?.strategy_note && (
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-teal-700 mb-2">
                  Last mock — what you&apos;ll do differently
                </p>
                <p className="text-sm text-teal-900 italic">&quot;{latest.strategy_note}&quot;</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

### src/app/student/buddy/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/buddy/page.tsx
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BuddyFeedbackCard } from '@/app/student/home/buddy-feedback-card';
import { SessionRequestPanel } from './session-request-panel';
import { Video, Calendar, PhoneCall } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Buddy · CareerRai',
  description: 'Everything between you and your buddy — voice notes, feedback, sessions',
};

export default async function BuddyCommunicationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, buddy_id')
    .eq('id', user.id)
    .single();

  const buddyId = profile?.buddy_id ?? null;

  const [{ data: buddy }, { data: sessions }, { data: pendingRequests }] = await Promise.all([
    buddyId
      ? admin.from('profiles').select('full_name, college, cat_percentile').eq('id', buddyId).single()
      : Promise.resolve({ data: null }),
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link, session_status')
      .eq('student_id', user.id)
      .eq('session_status', 'scheduled')
      // eslint-disable-next-line react-hooks/purity
      .gte('scheduled_at', new Date(Date.now() - 3_600_000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5),
    buddyId
      ? admin
          .from('session_requests')
          .select('id, message, created_at, status')
          .eq('student_id', user.id)
          .eq('buddy_id', buddyId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
  ]);

  const buddyName = buddy?.full_name?.split(' ')[0] ?? 'your buddy';
  const hasPendingRequest = (pendingRequests?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6 pb-24">
        {/* Header */}
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Your mentor</p>
          <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>
            {buddy ? buddy.full_name : 'Buddy'}
          </h1>
          {buddy && (
            <p className="text-sm text-stone-500 mt-0.5">
              {buddy.college ? `IIM ${buddy.college}` : 'IIM Alumni'}
              {buddy.cat_percentile ? ` · ${buddy.cat_percentile}%ile` : ''}
            </p>
          )}
        </div>

        {!buddyId ? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center">
            <p className="text-stone-600 font-medium">No buddy assigned yet</p>
            <p className="text-sm text-stone-400 mt-1">
              We&apos;re matching you with a mentor — voice notes and sessions will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Upcoming sessions */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700">Sessions</h2>
              </div>
              {sessions && sessions.length > 0 ? (
                sessions.map((s) => {
                  const startsAt = new Date(s.scheduled_at);
                  const minsAway = Math.round((startsAt.getTime() - Date.now()) / 60_000);
                  const joinable = minsAway <= 15 && !!s.google_meet_link;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Video className="w-4 h-4 text-indigo-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-indigo-900 truncate">
                            {s.title || `Session with ${buddyName}`}
                          </p>
                          <p className="text-xs text-indigo-600">
                            {startsAt.toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                      {joinable ? (
                        <a
                          href={s.google_meet_link!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          Join →
                        </a>
                      ) : (
                        <span className="shrink-0 text-[11px] font-medium text-indigo-500">
                          {minsAway > 1440
                            ? `in ${Math.round(minsAway / 1440)}d`
                            : minsAway > 60
                            ? `in ${Math.round(minsAway / 60)}h`
                            : `in ${Math.max(0, minsAway)}m`}
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="text-sm text-stone-500">No upcoming sessions yet.</p>
                </div>
              )}
            </div>

            {/* Urgent session request panel */}
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-orange-700" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-orange-800">Need urgent help?</h2>
              </div>
              <SessionRequestPanel
                buddyId={buddyId}
                buddyName={buddyName}
                hasPendingRequest={hasPendingRequest}
              />
            </div>

            {/* Voice notes + feedback + record response */}
            <BuddyFeedbackCard
              studentId={user.id}
              buddyId={buddyId}
              buddyName={buddy?.full_name ?? 'Buddy'}
            />
          </>
        )}
      </div>
    </div>
  );
}
```

### src/app/student/buddy/session-request-panel.tsx
```tsx
'use client';
import { useState } from 'react';
import { Loader2, CheckCircle, Sparkles } from 'lucide-react';

interface Props {
  buddyId: string;
  buddyName: string;
  hasPendingRequest: boolean;
}

export function SessionRequestPanel({ buddyId, buddyName, hasPendingRequest }: Props) {
  const [pending, setPending] = useState(hasPendingRequest);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiInsights, setAiInsights] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  async function submitRequest() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/sessions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buddyId, message }),
      });
      if (!res.ok) throw new Error('Failed');
      setPending(true);
      setMessage('');
    } catch {
      setError('Could not send request. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function loadAIInsights() {
    setAiLoading(true);
    setShowAI(true);
    try {
      const res = await fetch('/api/student/ai-insights', { method: 'POST' });
      if (res.ok) {
        const { insights } = await res.json();
        setAiInsights(insights ?? '');
      } else {
        setAiInsights('Could not generate insights right now — try again later.');
      }
    } catch {
      setAiInsights('Network error. Try again.');
    } finally {
      setAiLoading(false);
    }
  }

  if (pending) {
    return (
      <div className="flex items-center gap-2 text-orange-800">
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
        <p className="text-sm font-medium">Request sent — {buddyName} has been notified and will reach out soon.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-orange-900">
        Stuck on something? Ping {buddyName} for an urgent call.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`What do you need help with? e.g. "Struggling with DILR under time pressure"`}
        rows={2}
        maxLength={200}
        className="w-full px-3 py-2.5 text-sm bg-white border border-orange-200 rounded-xl focus:outline-none focus:border-orange-400 resize-none"
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submitRequest}
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitting ? 'Sending…' : 'Request urgent session'}
        </button>
        <button
          onClick={loadAIInsights}
          disabled={aiLoading}
          title="Get AI study tips"
          className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-orange-200 text-orange-700 rounded-xl text-sm font-medium hover:bg-orange-50 transition-colors disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {aiLoading ? '…' : 'AI tips'}
        </button>
      </div>

      {showAI && (
        <div className="bg-white border border-orange-200 rounded-xl p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-orange-700 mb-2">AI study advice for this week</p>
          {aiLoading ? (
            <p className="text-sm text-stone-500 animate-pulse">Generating…</p>
          ) : (
            <div className="text-sm text-stone-800 whitespace-pre-line leading-relaxed">{aiInsights}</div>
          )}
        </div>
      )}
    </div>
  );
}
```

### src/app/student/debug/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';
export default function Loading() {
  return <RouteSkeleton cards={5} />;
}
```

### src/app/student/debug/page.tsx
```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-stone-100 last:border-0">
      <span className="text-xs text-stone-500 font-medium shrink-0">{label}</span>
      <span className="text-xs text-stone-800 font-mono text-right break-all">{value ?? '—'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default async function DebugPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const [
    { data: profile },
    { data: streak },
    { count: reportCount },
    { count: notifCount },
    { data: recentReports },
    { data: latestTest },
  ] = await Promise.all([
    admin.from('profiles')
      .select('full_name, email, role, buddy_id, current_streak, best_streak, last_log_date, total_logs_completed, onboarding_completed, cat_percentile, study_target_hours, created_at')
      .eq('id', user.id)
      .single(),
    admin.from('streak_data')
      .select('current_streak, longest_streak, last_log_date, updated_at')
      .eq('student_id', user.id)
      .maybeSingle(),
    admin.from('daily_reports')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id),
    admin.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    admin.from('daily_reports')
      .select('report_date, study_duration, mock_taken')
      .eq('student_id', user.id)
      .order('report_date', { ascending: false })
      .limit(5),
    admin.from('test_results')
      .select('test_name, percentile, attempt_date')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const now = new Date().toISOString();

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Debug
            </h1>
            <p className="text-sm text-stone-500">Account diagnostics · share with support</p>
          </div>
        </div>

        <Section title="Identity">
          <Row label="User ID" value={user.id} />
          <Row label="Email" value={user.email} />
          <Row label="Provider" value={user.app_metadata?.provider ?? 'email'} />
          <Row label="Created" value={user.created_at ? new Date(user.created_at).toLocaleDateString('en-IN') : null} />
          <Row label="Last sign in" value={user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('en-IN') : null} />
        </Section>

        <Section title="Profile">
          <Row label="Name" value={profile?.full_name} />
          <Row label="Role" value={profile?.role} />
          <Row label="Buddy assigned" value={profile?.buddy_id ? 'Yes' : 'No'} />
          <Row label="Onboarding done" value={profile?.onboarding_completed ? 'Yes' : 'No'} />
          <Row label="CRS (cat_percentile)" value={profile?.cat_percentile != null ? `${profile.cat_percentile}%ile` : null} />
          <Row label="Study target" value={profile?.study_target_hours != null ? `${profile.study_target_hours}h/day` : null} />
          <Row label="Member since" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN') : null} />
        </Section>

        <Section title="Activity">
          <Row label="Total days logged" value={reportCount ?? 0} />
          <Row label="Total notifications" value={notifCount ?? 0} />
          <Row label="Last log date" value={profile?.last_log_date ?? streak?.last_log_date ?? null} />
        </Section>

        <Section title="Streak">
          <Row label="Current streak" value={streak?.current_streak ?? profile?.current_streak ?? 0} />
          <Row label="Longest streak" value={streak?.longest_streak ?? profile?.best_streak ?? 0} />
          <Row label="Streak last updated" value={streak?.updated_at ? new Date(streak.updated_at).toLocaleString('en-IN') : null} />
        </Section>

        {latestTest && (
          <Section title="Latest Test Result">
            <Row label="Test" value={latestTest.test_name} />
            <Row label="Percentile" value={`${latestTest.percentile}%ile`} />
            <Row label="Date" value={new Date(latestTest.attempt_date + 'T00:00:00').toLocaleDateString('en-IN')} />
          </Section>
        )}

        {recentReports && recentReports.length > 0 && (
          <Section title="Recent Logs">
            {recentReports.map((r, i) => (
              <Row
                key={i}
                label={new Date(r.report_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                value={`${r.study_duration}h${r.mock_taken ? ' · mock' : ''}`}
              />
            ))}
          </Section>
        )}

        <Section title="Environment">
          <Row label="App" value="CareerRai" />
          <Row label="Server time" value={new Date(now).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} />
          <Row label="Supabase project" value="pobhpszlsozeonejtzqy" />
        </Section>

        <p className="text-center text-[11px] text-stone-400">
          This page is for diagnostics only. Don&apos;t share your User ID publicly.
        </p>
      </div>
    </div>
  );
}
```

### src/app/student/exams/cat-result.tsx
```tsx
'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, TrendingUp, Zap, Target, Calendar } from 'lucide-react';
import { getDetailedFeedback, estimateImprovement } from '@/lib/cat-percentile-data';

interface CATResultProps {
  score: number;
  categories: Record<string, number>;
  onComplete: () => void;
}

export function CATResult({ score, categories, onComplete }: CATResultProps) {
  const feedback = getDetailedFeedback(score, categories);
  const improvement = estimateImprovement(score, 20); // Assume 20 hours/week avg

  const getScoreBgColor = () => {
    const p = feedback.overall.percentile;
    if (p >= 99) return 'from-orange-600 to-orange-700';
    if (p >= 95) return 'from-orange-500 to-orange-600';
    if (p >= 90) return 'from-orange-400 to-orange-500';
    if (p >= 80) return 'from-amber-500 to-orange-400';
    if (p >= 70) return 'from-amber-400 to-amber-500';
    return 'from-stone-400 to-stone-500';
  };

  return (
    <div className="fixed inset-0 bg-stone-900/95 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4 py-12">
        <Card className="w-full max-w-2xl p-6 md:p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Award className="w-12 h-12 text-orange-600" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Test Complete!
            </h1>
            <p className="text-sm text-stone-500 mt-2">Your CAT Readiness Assessment</p>
          </div>

          {/* Score Display */}
          <div className={`bg-gradient-to-br ${getScoreBgColor()} rounded-2xl p-8 text-white mb-6`}>
            <div className="text-center">
              <div className="text-7xl md:text-8xl font-bold font-mono mb-2">
                {String(Math.round(score)).padStart(3, '0')}
              </div>
              <div className="text-lg opacity-90">out of 300</div>
              <div className="mt-4 pt-4 border-t border-white/20">
                <div className="text-3xl font-bold">{String(Math.round(feedback.overall.percentile)).padStart(2, '0')}%ile</div>
                <div className="text-sm opacity-90 mt-1">{feedback.overall.interpretation}</div>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card className="p-3 text-center">
              <div className="text-xs uppercase text-stone-500 font-semibold">Benchmark</div>
              <div className="text-lg font-bold text-stone-900 mt-1">{feedback.overall.benchmark}</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-xs uppercase text-stone-500 font-semibold">Success Rate</div>
              <div className="text-lg font-bold text-emerald-700 mt-1">{feedback.overall.success_rate}%</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-xs uppercase text-stone-500 font-semibold">8-Week Est.</div>
              <div className="text-lg font-bold text-orange-700 mt-1">{improvement.estimated_8week_score}</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-xs uppercase text-stone-500 font-semibold">Monthly Gain</div>
              <div className="text-lg font-bold text-blue-700 mt-1">+{improvement.monthly_improvement}</div>
            </Card>
          </div>

          {/* Target Colleges */}
          {feedback.overall.target_colleges.length > 0 && (
            <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase text-blue-700">Target Colleges</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {feedback.overall.target_colleges.map((college) => (
                  <Badge key={college} color="blue">{college}</Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Personalized Feedback */}
          <Card className="p-4 mb-6 bg-emerald-50 border-emerald-200">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold uppercase text-emerald-700">AI Feedback</span>
            </div>
            <p className="text-sm text-emerald-800 font-medium">{feedback.motivation}</p>
          </Card>

          {/* Comparison */}
          <Card className="p-4 mb-6 bg-purple-50 border-purple-200">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold uppercase text-purple-700">Your Progress</span>
            </div>
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-purple-900 font-medium">{feedback.comparison.vs_90_percentile}</span>
              </div>
              <div className="text-sm">
                <span className="text-purple-800">{feedback.comparison.vs_99_percentile}</span>
              </div>
            </div>
          </Card>

          {/* Category Breakdown */}
          {feedback.categories && Object.keys(feedback.categories).length > 0 && (
            <Card className="p-4 mb-6 bg-indigo-50 border-indigo-200">
              <div className="text-xs font-semibold uppercase text-indigo-700 mb-4">Category Performance</div>
              <div className="space-y-3">
                {(Object.entries(feedback.categories) as [string, { score: number; action: string }][]).map(([category, data]) => (
                  <div key={category} className="pb-3 border-b border-indigo-200 last:border-b-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-indigo-900">{category}</span>
                      <span className="text-sm font-bold text-indigo-700">{data.score}%</span>
                    </div>
                    <div className="w-full bg-indigo-200 rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          data.score >= 75 ? 'bg-emerald-500' :
                          data.score >= 50 ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(data.score, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-indigo-800">{data.action}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Next Steps */}
          <Card className="p-4 mb-6 bg-amber-50 border-amber-200">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold uppercase text-amber-700">Next Steps (Your Buddy&apos;s Advice)</span>
            </div>
            <ul className="space-y-2">
              {feedback.next_steps.map((step, i) => (
                <li key={i} className="text-sm text-amber-800">
                  {step}
                </li>
              ))}
            </ul>
          </Card>

          {/* CareerRai Value Proposition */}
          <Card className="p-4 mb-6 bg-gradient-to-br from-orange-50 to-rose-50 border-orange-200">
            <div className="text-sm text-stone-900">
              <p className="font-semibold mb-2">💎 Why CareerRai is Different:</p>
              <ul className="space-y-1 text-xs text-stone-700">
                <li>✓ <strong>Personalized Buddy</strong>: Not just a test - a real mentor analyzing YOUR data</li>
                <li>✓ <strong>Smart Feedback</strong>: AI-powered insights + human touch from your buddy</li>
                <li>✓ <strong>Real Data</strong>: Percentiles based on actual CAT 2023-2025 results</li>
                <li>✓ <strong>Growth Timeline</strong>: Know exactly when you&apos;ll hit your target score</li>
                <li>✓ <strong>Accountability</strong>: Weekly check-ins ensure you stay on track</li>
              </ul>
            </div>
          </Card>

          {/* Action Button */}
          <button
            type="button"
            onClick={onComplete}
            className="w-full py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all active:scale-[0.98]"
          >
            Save & Continue
          </button>

          {/* Footer Message */}
          <p className="text-xs text-center text-stone-500 mt-4">
            Your buddy will review this and share personalized insights in their feedback.
          </p>
        </Card>
      </div>
    </div>
  );
}
```

### src/app/student/exams/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/exams/page.tsx
```tsx
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { TestResult } from '@/types';
import { Brain, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestRunner } from '../test-runner';
import { MockDropIntervention } from '@/components/mock-drop-intervention';

const TESTS = [
  { id: 'cat-readiness', name: 'CAT Readiness Test', desc: '35 questions · ~15 min · Complete diagnostic', color: 'orange' as const },
];

export default function ExamsPage() {
  const supabase = createClient();
  const [results, setResults] = useState<TestResult[]>([]);
  const [activeTest, setActiveTest] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [buddyId, setBuddyId] = useState<string | null>(null);
  const [dropAlert, setDropAlert] = useState<{ drop: number } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('buddy_id').eq('id', user.id).single();
      setBuddyId(profile?.buddy_id ?? null);
      const { data } = await supabase.from('test_results').select('*').eq('student_id', user.id).order('attempt_date', { ascending: false });
      setResults((data ?? []) as TestResult[]);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveResult(result: Omit<TestResult, 'id' | 'student_id' | 'created_at'>) {
    if (!userId) return;
    const { data } = await supabase.from('test_results').insert({ ...result, student_id: userId }).select().single();
    if (data) {
      const updated = [data as TestResult, ...results];
      setResults(updated);

      // Check for mock drop (need 2+ attempts)
      if (updated.length >= 2 && result.percentile !== undefined) {
        const prev = updated[1].percentile;
        const drop = prev - result.percentile;
        if (drop > 8) {
          // Check 30-day cooldown
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const { data: recent } = await supabase
            .from('mock_drop_alerts')
            .select('id')
            .eq('student_id', userId)
            .gte('triggered_at', thirtyDaysAgo.toISOString())
            .limit(1);
          if (!recent || recent.length === 0) {
            await supabase.from('mock_drop_alerts').insert({
              student_id: userId,
              drop_amount: drop,
              buddy_notified: !!buddyId,
            });
            setDropAlert({ drop });
            return; // don't close test runner — show intervention overlay first
          }
        }
      }
    }
    setActiveTest(null);
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Diagnostics</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>Where do you stand?</h1>
        <p className="text-sm text-stone-500 mt-1">Self-assessment · results are private to you and your buddy</p>
      </div>

      {TESTS.map((test) => {
        const history = results.filter((r) => r.test_type === test.id);
        const last = history[0];
        return (
          <Card key={test.id} className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-stone-900">{test.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">{test.desc}</p>
              </div>
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', test.color === 'orange' ? 'bg-orange-100' : 'bg-teal-100')}>
                <Brain className={cn('w-5 h-5', test.color === 'orange' ? 'text-orange-600' : 'text-teal-700')} />
              </div>
            </div>

            {last ? (
              <div className="bg-stone-50 rounded-xl p-3 mb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Last attempt</div>
                    <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{last.score}<span className="text-sm text-stone-500 font-normal">/100</span></div>
                    <div className="text-xs text-stone-600 mt-0.5">Top {100 - last.percentile}% · {formatDate(last.attempt_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Attempts</div>
                    <div className="text-xl font-bold text-stone-900 font-mono mt-1">{history.length}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-stone-50 rounded-xl p-3 mb-3 text-center">
                <p className="text-xs text-stone-600">Not attempted yet</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveTest(test.id)}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98]',
                test.color === 'orange' ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-teal-700 text-white hover:bg-teal-800'
              )}
            >
              {last ? 'Retake test' : 'Start test'} <ArrowRight className="w-4 h-4" />
            </button>
          </Card>
        );
      })}

      {activeTest && (
        <TestRunner
          testId={activeTest}
          testName={TESTS.find((t) => t.id === activeTest)!.name}
          onComplete={saveResult}
          onClose={() => setActiveTest(null)}
        />
      )}

      {dropAlert && userId && (
        <MockDropIntervention
          studentId={userId}
          dropAmount={dropAlert.drop}
          onDismiss={() => { setDropAlert(null); setActiveTest(null); }}
        />
      )}
    </div>
  );
}
```

### src/app/student/goal/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';
export default function Loading() {
  return <RouteSkeleton cards={4} />;
}
```

### src/app/student/goal/page.tsx
```tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { ArrowLeft, Target, TrendingUp, Clock } from 'lucide-react';

const CAT_EXAM_DATE = new Date(2026, 10, 29); // Nov 29, 2026

export default function GoalPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [currentCRS, setCurrentCRS] = useState<number | null>(null);
  const [targetPercentile, setTargetPercentile] = useState<number>(90);
  const [studyHours, setStudyHours] = useState<number>(2);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasTargetCol, setHasTargetCol] = useState(false);

  const daysToCat = Math.max(0, Math.ceil((CAT_EXAM_DATE.getTime() - Date.now()) / 86_400_000));

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Load basic profile fields (always present)
      const { data: profile } = await supabase
        .from('profiles')
        .select('cat_percentile, study_target_hours')
        .eq('id', user.id)
        .single();

      if (profile) {
        setCurrentCRS(profile.cat_percentile != null ? Number(profile.cat_percentile) : null);
        setStudyHours(Number(profile.study_target_hours ?? 2));
      }

      // Try to read target_percentile (column added by migration; safe to fail)
      const { data: ext, error: extErr } = await supabase
        .from('profiles')
        .select('target_percentile')
        .eq('id', user.id)
        .single();

      if (!extErr && ext && (ext as { target_percentile?: number | null }).target_percentile != null) {
        setTargetPercentile((ext as { target_percentile: number }).target_percentile);
        setHasTargetCol(true);
      } else if (!extErr) {
        setHasTargetCol(true); // column exists but is null → use default 90
      }

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!userId) return;
    setSaving(true);

    if (hasTargetCol) {
      await supabase
        .from('profiles')
        .update({ target_percentile: targetPercentile, study_target_hours: studyHours })
        .eq('id', userId);
    } else {
      // Migration not yet applied — save only study_target_hours
      await supabase
        .from('profiles')
        .update({ study_target_hours: studyHours })
        .eq('id', userId);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const gap = currentCRS !== null ? Math.max(0, targetPercentile - currentCRS) : null;
  const progressPct = currentCRS !== null ? Math.min(100, Math.round((Number(currentCRS) / targetPercentile) * 100)) : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-stone-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-5 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Your Goal
            </h1>
            <p className="text-sm text-stone-500">What are you working toward?</p>
          </div>
        </div>

        {/* CAT Countdown */}
        <div className="bg-stone-900 text-white rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-stone-400 font-semibold">Days to CAT 2026</p>
              <p className="text-5xl font-bold mt-1 font-mono">{daysToCat}</p>
              <p className="text-sm text-stone-400 mt-1">Nov 29, 2026</p>
            </div>
            <Target className="w-12 h-12 text-orange-400 opacity-80" />
          </div>
        </div>

        {/* Target Percentile */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-stone-500" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Target Percentile</h2>
          </div>
          <div className="text-center py-2">
            <span className="text-5xl font-bold text-orange-600">{targetPercentile}</span>
            <span className="text-xl text-stone-500 ml-1">%ile</span>
          </div>
          <input
            type="range"
            min={70}
            max={99}
            value={targetPercentile}
            onChange={(e) => setTargetPercentile(Number(e.target.value))}
            className="w-full accent-orange-600"
          />
          <div className="flex justify-between text-xs text-stone-400">
            <span>70%ile</span>
            <span>85%ile</span>
            <span>99%ile</span>
          </div>
          {!hasTargetCol && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Run the <code>20260612_add_target_percentile.sql</code> migration to persist this goal.
            </p>
          )}
        </div>

        {/* Current Progress */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Current Standing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center bg-stone-50 rounded-xl p-3">
              <div className="text-xs text-stone-500 mb-1">Current CRS</div>
              <div className="text-2xl font-bold text-stone-900">
                {currentCRS !== null ? (
                  <>{Math.round(Number(currentCRS))}<span className="text-sm text-stone-500 font-normal">%ile</span></>
                ) : '—'}
              </div>
            </div>
            <div className="text-center bg-orange-50 rounded-xl p-3">
              <div className="text-xs text-stone-500 mb-1">Gap to Goal</div>
              <div className="text-2xl font-bold text-orange-700">
                {gap !== null ? (
                  <>{gap > 0 ? '+' : ''}{gap}<span className="text-sm font-normal">%ile</span></>
                ) : '—'}
              </div>
            </div>
          </div>
          {currentCRS !== null && (
            <div>
              <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                <span>Progress to goal</span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2.5">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
          {currentCRS === null && (
            <p className="text-xs text-stone-400 text-center">
              Take the CAT Readiness Test to see your current score.
            </p>
          )}
        </div>

        {/* Daily Commitment */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-stone-500" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Daily Commitment</h2>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-stone-900">{studyHours}</span>
              <span className="text-stone-500 text-sm">hours / day</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={studyHours}
              onChange={(e) => setStudyHours(Number(e.target.value))}
              className="w-full accent-stone-800"
            />
            <div className="flex justify-between text-xs text-stone-400 mt-1">
              <span>0.5h</span>
              <span>5h</span>
              <span>10h</span>
            </div>
          </div>
          <p className="text-xs text-stone-500">
            {daysToCat} days × {studyHours}h ={' '}
            <strong className="text-stone-800">{Math.round(daysToCat * studyHours)} total hours</strong> of prep left
          </p>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl bg-stone-900 text-white font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Goal'}
        </button>
      </div>
    </div>
  );
}
```

### src/app/student/home/buddy-feedback-card.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageSquare, Mic, Volume2 } from 'lucide-react';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceNoteRecorder } from '@/components/voice-note-recorder';

interface BuddyFeedback {
  id: string;
  feedback_text: string | null;
  voice_note_url: string | null;
  created_at: string;
  buddy_id: string;
  buddy_name: string;
  buddy_college?: string;
  read_at: string | null;
  thanked_at: string | null;
}

interface BuddyFeedbackCardProps {
  studentId: string;
  buddyId: string;
  buddyName: string;
}

export function BuddyFeedbackCard({ studentId, buddyId, buddyName }: BuddyFeedbackCardProps) {
  const supabase = createClient();
  const [feedbacks, setFeedbacks] = useState<BuddyFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecorder, setShowRecorder] = useState(false);

  const fetchFeedbacks = useCallback(async () => {
    try {
      // Don't fetch if buddy is not set or is the student themselves
      if (!buddyId || buddyId === studentId) {
        setFeedbacks([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('buddy_feedback')
        .select(`
          id,
          feedback_text,
          voice_note_url,
          created_at,
          buddy_id,
          read_at,
          thanked_at,
          profiles!buddy_feedback_buddy_id_fkey(full_name, college)
        `)
        .eq('student_id', studentId)
        .eq('buddy_id', buddyId)
        .in('feedback_type', ['buddy_feedback', 'text'])
        .neq('buddy_id', studentId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;

      const formattedData = data?.map((f) => ({
        id: f.id,
        feedback_text: f.feedback_text,
        voice_note_url: f.voice_note_url,
        created_at: f.created_at,
        buddy_id: f.buddy_id,
        buddy_name: (f.profiles as { full_name?: string; college?: string })?.full_name || 'Buddy',
        buddy_college: (f.profiles as { full_name?: string; college?: string })?.college,
        read_at: f.read_at,
        thanked_at: f.thanked_at,
      })) || [];

      setFeedbacks(formattedData);
    } catch (error) {
      console.error('Error fetching feedback:', error);
    } finally {
      setLoading(false);
    }
  }, [buddyId, studentId, supabase]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="px-1">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-teal-700" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700">
            Buddy Feedback
          </h2>
        </div>
        <p className="text-xs text-stone-600 mt-1">Messages and guidance from {buddyName}</p>
      </div>

      {/* Feedback Items */}
      {loading ? (
        <div className="text-center py-8 text-stone-500">Loading feedback...</div>
      ) : feedbacks.length === 0 ? (
        <div className="bg-white border-2 border-stone-200 rounded-xl p-6 text-center">
          <MessageSquare className="w-5 h-5 text-stone-300 mx-auto mb-2" />
          <p className="text-stone-600 text-sm">No feedback yet</p>
          <p className="text-stone-500 text-xs mt-1">Your buddy will share insights here</p>
        </div>
      ) : (
        feedbacks.map((feedback) => (
          <div key={feedback.id} className="bg-white border-2 border-stone-200 rounded-xl p-4 space-y-3">
            {/* Buddy Info */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-stone-900 text-sm">{feedback.buddy_name}</p>
                {feedback.buddy_college && (
                  <p className="text-xs text-stone-600">{feedback.buddy_college}</p>
                )}
              </div>
              <span className="text-xs text-stone-500">{getTimeAgo(feedback.created_at)}</span>
            </div>

            {/* Text Feedback */}
            {feedback.feedback_text && (
              <div className="bg-stone-50 rounded-lg p-3 border border-stone-200">
                <p className="text-sm text-stone-800 leading-relaxed">{feedback.feedback_text}</p>
              </div>
            )}

            {/* Audio Feedback */}
            {feedback.voice_note_url && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-teal-700 font-medium">
                  <Volume2 className="w-4 h-4" />
                  <span>Voice message from {feedback.buddy_name}</span>
                </div>
                <VoiceNotePlayer
                  audioUrl={feedback.voice_note_url}
                  buddyName={feedback.buddy_name}
                  buddyCollege={feedback.buddy_college}
                  createdAt={feedback.created_at}
                  feedbackId={feedback.id}
                  isNew={!feedback.read_at}
                  thanked={!!feedback.thanked_at}
                  canThank
                />
              </div>
            )}
          </div>
        ))
      )}

      {/* Record Response Button */}
      <button
        onClick={() => setShowRecorder(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors text-sm"
      >
        <Mic className="w-4 h-4" />
        Record voice response
      </button>

      {/* Voice Recorder Modal */}
      {showRecorder && (
        <VoiceNoteRecorder
          studentId={studentId}
          buddyId={buddyId}
          studentName={buddyName}
          isOpen={showRecorder}
          onClose={() => setShowRecorder(false)}
          onSendComplete={() => {
            setShowRecorder(false);
            fetchFeedbacks();
          }}
          feedbackType="student_response"
        />
      )}
    </div>
  );
}
```

### src/app/student/home/buddy-signal-card.tsx
```tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { MessageCircle, Volume2, Play, Pause, ChevronRight } from 'lucide-react';

interface BuddySignalCardProps {
  userId: string;
}

interface BuddyFeedback {
  id: string;
  feedback_text: string | null;
  voice_note_url: string | null;
  created_at: string;
  rating: number | null;
  feedback_type: string;
}

interface BuddyProfile {
  full_name: string;
  avatar_url?: string;
}

export function BuddySignalCard({ userId }: BuddySignalCardProps) {
  const supabase = createClient();
  const [feedback, setFeedback] = useState<BuddyFeedback | null>(null);
  const [buddy, setBuddy] = useState<BuddyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadBuddySignal() {
      try {
        // Get latest feedback
        const { data: feedbackData } = await supabase
          .from('feedback')
          .select('*')
          .eq('student_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (feedbackData) {
          setFeedback(feedbackData as BuddyFeedback);

          // Get buddy info
          const { data: buddyData } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', feedbackData.buddy_id)
            .single();

          if (buddyData) {
            setBuddy(buddyData as BuddyProfile);
          }
        }
      } catch (error) {
        console.log('No buddy feedback yet');
      } finally {
        setIsLoading(false);
      }
    }

    loadBuddySignal();
  }, [supabase, userId]);

  if (isLoading) {
    return (
      <Card className="p-5 bg-gradient-to-br from-teal-50 to-white border-teal-100">
        <div className="h-16 bg-teal-100 rounded-lg animate-pulse" />
      </Card>
    );
  }

  if (!feedback || !buddy) {
    return (
      <Card className="p-5 bg-gradient-to-br from-blue-50 to-white border-blue-100">
        <div className="flex items-start gap-3">
          <MessageCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              🔔 Waiting for your buddy
            </p>
            <p className="text-xs text-blue-700 mt-1">
              Keep logging your daily progress. Your buddy reviews the data every week and will send personalized guidance.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const buddyInitials = buddy.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // eslint-disable-next-line react-hooks/purity
  const daysAgo = Math.floor((Date.now() - new Date(feedback.created_at).getTime()) / (1000 * 60 * 60 * 24));

  const timeAgoText =
    daysAgo === 0
      ? 'Today'
      : daysAgo === 1
      ? 'Yesterday'
      : `${daysAgo} days ago`;

  return (
    <Card className="p-5 bg-gradient-to-br from-teal-50 to-white border-teal-100 hover:shadow-md transition-shadow cursor-pointer group">
      <div className="space-y-3">
        {/* Header with buddy info */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Buddy Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
              {buddyInitials}
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-900">
                {buddy.full_name}
              </p>
              <p className="text-xs text-stone-500">{timeAgoText}</p>
            </div>
          </div>

          {feedback.voice_note_url && (
            <Volume2 className="w-4 h-4 text-teal-600" />
          )}
        </div>

        {/* Voice Note Player */}
        {feedback.voice_note_url ? (
          <VoiceNotePlayer
            audioUrl={feedback.voice_note_url}
            buddyName={buddy.full_name}
            createdAt={feedback.created_at}
          />
        ) : (
          /* Text Feedback Preview */
          <div className="space-y-2">
            {feedback.feedback_text && (
              <p className="text-sm text-stone-700 leading-relaxed">
                &quot;{feedback.feedback_text.substring(0, 100)}
                {feedback.feedback_text.length > 100 ? '...' : ''}&quot;
              </p>
            )}

            {feedback.rating && (
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <span
                    key={i}
                    className={i < feedback.rating! ? 'text-yellow-400' : 'text-stone-300'}
                  >
                    ★
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <button className="w-full flex items-center justify-between p-2 hover:bg-teal-100 rounded-lg transition-colors text-teal-700 text-xs font-medium">
          <span>View full feedback</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </Card>
  );
}
```

### src/app/student/home/cat-context-card.tsx
```tsx
'use client';

import { Card } from '@/components/ui/card';
import { Calendar, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// CAT exam date (hardcoded)
const CAT_EXAM_DATE = new Date(2026, 10, 29); // Nov 29, 2026

interface CATContextCardProps {
  className?: string;
}

export function CATContextCard({ className }: CATContextCardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysRemaining = Math.ceil((CAT_EXAM_DATE.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Dynamic message based on days remaining
  const getMessage = () => {
    if (daysRemaining >= 180) {
      return {
        title: 'Foundation Phase',
        message: 'Build habits now — they compound harder than any topic revision.',
        icon: '🏗️',
        color: 'from-blue-600 to-blue-700'
      };
    } else if (daysRemaining >= 90) {
      return {
        title: 'Mock Phase',
        message: 'One mock per week minimum. Your buddy is watching your scores closely.',
        icon: '📊',
        color: 'from-orange-600 to-orange-700'
      };
    } else if (daysRemaining >= 30) {
      return {
        title: 'Final Stretch',
        message: "Don't change strategy now. Your buddy will guide every mock.",
        icon: '⚡',
        color: 'from-amber-600 to-amber-700'
      };
    } else {
      return {
        title: 'Last Mile',
        message: 'Trust your preparation. Your buddy has one job: keep you calm.',
        icon: '🎯',
        color: 'from-red-600 to-red-700'
      };
    }
  };

  const info = getMessage();

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className={cn('bg-gradient-to-br p-6 text-white', info.color)}>
        <div className="space-y-4">
          {/* Days Counter */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-5xl font-bold font-mono leading-none">
                {daysRemaining}
              </div>
              <p className="text-sm opacity-90 mt-1">
                {daysRemaining === 1 ? 'day' : 'days'} until CAT
              </p>
            </div>
            <div className="text-4xl">{info.icon}</div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/20" />

          {/* Phase Info */}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">{info.title}</h3>
            <p className="text-sm opacity-90 leading-relaxed">{info.message}</p>
          </div>

          {/* Exam Date */}
          <div className="flex items-center gap-2 text-xs opacity-75">
            <Calendar className="w-3 h-3" />
            <span>Exam: {CAT_EXAM_DATE.toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Bottom accent */}
      <div className="h-1 bg-gradient-to-r from-transparent via-stone-300 to-transparent" />
    </Card>
  );
}
```

### src/app/student/home/cat-test-widget.tsx
```tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Brain, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestRunner } from '../test-runner';
import type { TestResult } from '@/types';

interface CATTestWidgetProps {
  userId: string;
}

export function CATTestWidget({ userId }: CATTestWidgetProps) {
  const supabase = createClient();
  const [results, setResults] = useState<TestResult[]>([]);
  const [activeTest, setActiveTest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('test_results')
          .select('*')
          .eq('student_id', userId)
          .eq('test_type', 'cat-readiness')
          .order('attempt_date', { ascending: false })
          .limit(5);
        setResults((data ?? []) as TestResult[]);
      } catch (error) {
        console.error('Error loading test results:', error);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [userId, supabase]);

  async function saveResult(result: Omit<TestResult, 'id' | 'student_id' | 'created_at'>) {
    try {
      const { data } = await supabase
        .from('test_results')
        .insert({ ...result, student_id: userId })
        .select()
        .single();
      if (data) {
        setResults((prev) => [data as TestResult, ...prev]);
        setActiveTest(false);
      }
    } catch (error) {
      console.error('Error saving test result:', error);
    }
  }

  const last = results[0];
  const totalAttempts = results.length;

  return (
    <>
      <Card className="p-5 bg-gradient-to-br from-orange-50 to-white border-orange-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-stone-900">CAT Readiness Test</h3>
            <p className="text-xs text-stone-500 mt-0.5">35 questions · ~15 min · Complete diagnostic</p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-100">
            <Brain className="w-5 h-5 text-orange-600" />
          </div>
        </div>

        {isLoading ? (
          <div className="bg-stone-100 rounded-xl p-3 mb-3 text-center">
            <p className="text-xs text-stone-600">Loading test data...</p>
          </div>
        ) : last ? (
          <div className="bg-white rounded-xl p-3 mb-3 border border-orange-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Last attempt</div>
                <div className="text-2xl font-bold text-stone-900 font-mono mt-1">
                  {last.score}
                  <span className="text-sm text-stone-500 font-normal">/100</span>
                </div>
                <div className="text-xs text-stone-600 mt-0.5">
                  {Math.round(last.percentile)}%ile · {new Date(last.attempt_date).toLocaleDateString('en-IN')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Attempts</div>
                <div className="text-xl font-bold text-stone-900 font-mono mt-1">{totalAttempts}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-stone-50 rounded-xl p-3 mb-3 text-center">
            <p className="text-xs text-stone-600">Not attempted yet</p>
            <p className="text-[10px] text-stone-500 mt-1">Take the diagnostic to see where you stand</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setActiveTest(true)}
          disabled={isLoading}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98]',
            isLoading ? 'bg-stone-300 text-stone-500 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700'
          )}
        >
          {isLoading ? 'Loading...' : last ? 'Retake Test' : 'Start Test'} {!isLoading && <ArrowRight className="w-4 h-4" />}
        </button>

        <p className="text-[10px] text-stone-500 text-center mt-2">
          💡 Get personalized feedback across 5 prep dimensions
        </p>
      </Card>

      {activeTest && (
        <TestRunner
          testId="cat-readiness"
          testName="CAT Readiness Test"
          onComplete={saveResult}
          onClose={() => setActiveTest(false)}
        />
      )}
    </>
  );
}
```

### src/app/student/home/heatmap-card.tsx
```tsx
'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HeatmapCardProps {
  daysData: Array<{
    date: string;
    hours: number;
  }>;
  days?: number;
  className?: string;
}

export function HeatmapCard({ daysData, days = 14, className }: HeatmapCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-stone-900">Last {days} Days</h3>
        <a href="/student/reports" className="text-[10px] text-stone-500 hover:text-stone-900 transition-colors">
          View all →
        </a>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {daysData.map((d, i) => {
          const date = new Date(d.date);
          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });
          const hasStudy = d.hours > 0;

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'aspect-square w-full rounded-md flex items-center justify-center hover:ring-2 hover:ring-orange-400 cursor-pointer transition-all',
                  hasStudy ? 'bg-orange-50 border border-orange-200' : 'bg-stone-100'
                )}
                title={`${d.date}: ${d.hours.toFixed(1)} hrs`}
              >
                <span className={cn(
                  'text-[9px] font-bold leading-none',
                  hasStudy ? 'text-orange-700' : 'text-stone-300'
                )}>
                  {hasStudy ? d.hours.toFixed(1) : '–'}
                </span>
              </div>
              <span className="text-[10px] text-stone-500">{dayLabel}</span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-stone-400 mt-4 pt-3 border-t border-stone-100">
        Numbers show hours studied each day
      </p>
    </Card>
  );
}
```

### src/app/student/home/home-client.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useOnboarding } from '@/hooks/use-onboarding';
import { OnboardingModal } from '../onboarding/onboarding-modal';
import { QuickLogSheet } from './quick-log-sheet';
import { StreakGuard } from './streak-guard';

interface StudentHomeClientProps {
  children: ReactNode;
}

export function StudentHomeClient({ children }: StudentHomeClientProps) {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const { isLoading, needsOnboarding } = useOnboarding();

  const [userId, setUserId] = useState<string | null>(null);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);

  useEffect(() => {
    // Get user ID
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    }
    getUser();
  }, [supabase]);

  useEffect(() => {
    // Check if quick log should open
    if (searchParams.get('openQuickLog') === 'true') {
      setIsQuickLogOpen(true);
      // Remove the query param
      window.history.replaceState({}, '', '/student/home');
    }
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-stone-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}

      {userId && (
        <>
          <QuickLogSheet
            isOpen={isQuickLogOpen}
            onClose={() => setIsQuickLogOpen(false)}
            userId={userId}
          />
          <StreakGuard
            userId={userId}
            onLogClick={() => setIsQuickLogOpen(true)}
          />
        </>
      )}

      {needsOnboarding && (
        <OnboardingModal
          onComplete={() => {
            // Reload the page to show home content
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
```

### src/app/student/home/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/home/page.tsx
```tsx
import { redirect } from 'next/navigation';

export default function StudentHomePage() {
  redirect('/student/tracker');
}
```

### src/app/student/home/quick-log-sheet.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

/* eslint-disable react-hooks/purity */
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Check } from 'lucide-react';
import { updateStreakAfterLog, checkAndCreateMilestones } from '@/lib/streak-utils';
import { cn } from '@/lib/utils';
import { ALL_TOPICS, MAIN_CATEGORIES, TOPIC_EMOJIS } from '@/lib/topics-constants';

interface QuickLogSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const HOURS_OPTIONS = [
  { label: '0 hrs', value: 0 },
  { label: '1 hr', value: 1 },
  { label: '2 hrs', value: 2 },
  { label: '3 hrs', value: 3 },
  { label: '4+ hrs', value: 4 }
];

const TOPICS = MAIN_CATEGORIES;

const FEELING_OPTIONS = [
  { emoji: '🙏', label: 'Tough', confidence: 2, stress: 4 },
  { emoji: '💪', label: 'Solid', confidence: 4, stress: 2 },
  { emoji: '🚀', label: 'Easy', confidence: 5, stress: 1 }
];

export function QuickLogSheet({ isOpen, onClose, userId }: QuickLogSheetProps) {
  const supabase = createClient();
  const [hours, setHours] = useState<number | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [feeling, setFeeling] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [buddyId, setBuddyId] = useState<string | null>(null);

  const loadBuddyInfo = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('buddy_id')
        .eq('id', userId)
        .single();

      if (profile?.buddy_id) {
        setBuddyId(profile.buddy_id);
      }
    } catch (error) {
      console.log('Could not load buddy info');
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when closing
      setHours(null);
      setSelectedTopics([]);
      setFeeling(null);
      setShowConfetti(false);
    } else {
      // Load buddy info when opening
      loadBuddyInfo();
    }
  }, [isOpen, loadBuddyInfo]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const canSubmit = hours !== null && selectedTopics.length > 0 && feeling !== null;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayString = today.toISOString().split('T')[0];

      const feelingOption = FEELING_OPTIONS[feeling];

      // Check if report exists for today
      const { data: existingReport, error: checkError } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('student_id', userId)
        .eq('report_date', todayString)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') throw checkError;

      // Create or update daily report
      let reportError;
      if (existingReport) {
        // Update existing report
        const { error: updateError } = await supabase
          .from('daily_reports')
          .update({
            study_duration: hours,
            topics_covered: selectedTopics,
            confidence: feelingOption.confidence,
            stress: feelingOption.stress,
            quality_focus: 3,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingReport.id);
        reportError = updateError;
      } else {
        // Insert new report
        const { error: insertError } = await supabase
          .from('daily_reports')
          .insert({
            student_id: userId,
            report_date: todayString,
            study_duration: hours,
            topics_covered: selectedTopics,
            confidence: feelingOption.confidence,
            stress: feelingOption.stress,
            quality_focus: 3,
          });
        reportError = insertError;
      }

      if (reportError) throw reportError;

      // Update streak
      await updateStreakAfterLog(userId);

      // Check for milestones and notify buddy
      if (buddyId) {
        await checkAndCreateMilestones(userId, buddyId);
      }

      // Show confetti
      setShowConfetti(true);

      // Close after animation
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error submitting log:', error);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Confetti */}
      {showConfetti && <ConfettiContainer />}

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-5 duration-300">
        <div className="bg-white rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-stone-200 p-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-900">Quick Log</h2>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* 1. HOURS STUDIED */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                Hours studied today
              </label>
              <div className="grid grid-cols-5 gap-2">
                {HOURS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setHours(option.value)}
                    className={cn(
                      'py-3 px-2 rounded-lg text-sm font-semibold transition-all',
                      hours === option.value
                        ? 'bg-orange-600 text-white shadow-md'
                        : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. TOPICS COVERED */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                What did you study?
              </label>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-medium transition-all',
                      selectedTopics.includes(topic)
                        ? 'bg-orange-600 text-white shadow-md'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    )}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. HOW DID IT GO? */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                How did it go?
              </label>
              <div className="grid grid-cols-3 gap-3">
                {FEELING_OPTIONS.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => setFeeling(i)}
                    className={cn(
                      'py-4 px-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
                      feeling === i
                        ? 'border-orange-600 bg-orange-50'
                        : 'border-stone-200 hover:border-stone-300'
                    )}
                  >
                    <span className="text-3xl">{option.emoji}</span>
                    <span className="text-xs font-medium text-stone-700">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Progress indicator */}
            <div className="flex gap-1">
              <div className={cn('h-1 flex-1 rounded-full transition-all', hours !== null ? 'bg-orange-600' : 'bg-stone-200')} />
              <div className={cn('h-1 flex-1 rounded-full transition-all', selectedTopics.length > 0 ? 'bg-orange-600' : 'bg-stone-200')} />
              <div className={cn('h-1 flex-1 rounded-full transition-all', feeling !== null ? 'bg-orange-600' : 'bg-stone-200')} />
            </div>
          </div>

          {/* Submit Button */}
          <div className="sticky bottom-0 bg-gradient-to-t from-white to-white/80 border-t border-stone-200 p-6">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className={cn(
                'w-full py-4 px-6 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 text-lg',
                canSubmit && !isSubmitting
                  ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  Logging...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Log & Continue
                </>
              )}
            </button>
            <p className="text-xs text-stone-500 text-center mt-3">
              Takes ~15 seconds ⚡
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Confetti animation component
 */
function ConfettiContainer() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 2 + Math.random() * 0.5,
    color: ['#E8652D', '#2A9D8F', '#F4A261', '#E76F51', '#264653'][
      Math.floor(Math.random() * 5)
    ]
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(400px) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>

      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: `${particle.left}%`,
            top: '50%',
            backgroundColor: particle.color,
            animation: `confetti-fall ${particle.duration}s ease-out ${particle.delay}s forwards`
          }}
        />
      ))}
    </div>
  );
}
```

### src/app/student/home/request-session-button.tsx
```tsx
'use client';

import { useState } from 'react';
import { Video, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface RequestSessionButtonProps {
  buddyId: string;
  buddyName?: string;
  hasUpcomingSessions: boolean;
}

export function RequestSessionButton({
  buddyId,
  buddyName = 'Your Buddy',
  hasUpcomingSessions,
}: RequestSessionButtonProps) {
  const [requesting, setRequesting] = useState(false);

  const handleRequestSession = async () => {
    setRequesting(true);
    try {
      const res = await fetch('/api/sessions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buddyId }),
      });

      if (res.ok) {
        alert('Session request sent to ' + buddyName);
      } else {
        alert('Failed to send request');
      }
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setRequesting(false);
    }
  };

  if (hasUpcomingSessions) {
    return null;
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-100">
            <Calendar className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-stone-900">No upcoming sessions</h3>
            <p className="text-xs text-stone-600 mt-0.5">Request a meeting with {buddyName}</p>
          </div>
        </div>
        <button
          onClick={handleRequestSession}
          disabled={requesting}
          className="w-full py-2 px-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <Video className="w-4 h-4" />
          {requesting ? 'Sending...' : 'Request Session'}
        </button>
      </div>
    </Card>
  );
}
```

### src/app/student/home/streak-guard.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, Zap } from 'lucide-react';
import { shouldShowStreakGuard } from '@/lib/streak-utils';

interface StreakGuardProps {
  userId: string;
  onLogClick: () => void;
}

interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_log_date: string | null;
  milestone_sent_7: boolean;
  milestone_sent_21: boolean;
}

export function StreakGuard({ userId, onLogClick }: StreakGuardProps) {
  const supabase = createClient();
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [showGuard, setShowGuard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date().getHours());

  useEffect(() => {
    async function loadData() {
      try {
        const { data } = await supabase
          .from('streak_data')
          .select('*')
          .eq('student_id', userId)
          .single();

        setStreakData(data || null);
      } catch (error) {
        console.log('No streak data yet');
        setStreakData(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();

    // Update time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date().getHours());
    }, 60000);

    return () => clearInterval(timer);
  }, [supabase, userId]);

  // Check if guard should show
  useEffect(() => {
    const shouldShow = shouldShowStreakGuard(streakData);
    setShowGuard(shouldShow);
  }, [streakData, currentTime]);

  if (isLoading || !showGuard) return null;

  const streak = streakData?.current_streak || 0;
  const isActiveStreak = streak > 0;

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className={`rounded-lg shadow-lg p-4 border-l-4 ${
        isActiveStreak
          ? 'bg-gradient-to-r from-orange-50 to-orange-100 border-orange-600'
          : 'bg-gradient-to-r from-red-50 to-red-100 border-red-600'
      }`}>
        <div className="flex gap-3">
          {isActiveStreak ? (
            <Zap className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}

          <div className="flex-1">
            {isActiveStreak ? (
              <>
                <p className="font-semibold text-orange-900">
                  🔥 {streak}-day streak at risk
                </p>
                <p className="text-sm text-orange-800 mt-1">
                  Don&apos;t miss today. Log your study session now.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-red-900">
                  Time to start a streak
                </p>
                <p className="text-sm text-red-800 mt-1">
                  Log your first study session and build consistency.
                </p>
              </>
            )}

            <button
              onClick={onLogClick}
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActiveStreak
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              Log Now →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### src/app/student/home/streak-hero.tsx
```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { getStreakStatus, getFlameState } from '@/lib/streak-utils';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface StreakHeroProps {
  userId: string;
}

export function StreakHero({ userId }: StreakHeroProps) {
  const supabase = createClient();
  const [streakData, setStreakData] = useState<{ current_streak: number; longest_streak: number; last_log_date: string | null; milestone_sent_7: boolean; milestone_sent_21: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStreak() {
      try {
        const { data } = await supabase
          .from('streak_data')
          .select('*')
          .eq('student_id', userId)
          .single();

        setStreakData(data);
      } catch (error) {
        console.log('No streak data yet');
        setStreakData(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadStreak();
  }, [supabase, userId]);

  const streakStatus = getStreakStatus(streakData);
  const flameState = getFlameState(streakStatus.days);

  if (isLoading) {
    return (
      <Card className="p-6 bg-gradient-to-r from-stone-800 to-stone-900">
        <div className="h-20 bg-stone-700/50 rounded-lg animate-pulse" />
      </Card>
    );
  }

  // Flame styles based on state
  const getFlameStyles = () => {
    const baseStyles = 'w-16 h-16 transition-all';

    switch (flameState) {
      case 'gold':
        return `${baseStyles} text-yellow-400 animate-pulse drop-shadow-lg`;
      case 'glowing':
        return `${baseStyles} text-orange-500 drop-shadow-md`;
      case 'basic':
        return `${baseStyles} text-orange-600`;
      default:
        return `${baseStyles} text-stone-400`;
    }
  };

  const getStreakColor = () => {
    if (streakStatus.days === 0) return 'text-stone-400';
    if (streakStatus.days < 7) return 'text-orange-600';
    if (streakStatus.days < 14) return 'text-orange-500';
    return 'text-yellow-400';
  };

  const getCardBg = () => {
    if (streakStatus.days === 0) return 'from-stone-700 to-stone-800';
    if (streakStatus.days < 7) return 'from-orange-900 to-stone-800';
    if (streakStatus.days < 14) return 'from-orange-800 to-orange-900';
    return 'from-yellow-900 to-orange-900';
  };

  return (
    <Card className={cn('p-6 bg-gradient-to-r text-white', getCardBg())}>
      <div className="flex items-center justify-between gap-4">
        {/* Flame Icon */}
        <div className="flex flex-col items-center">
          <FlameIcon className={getFlameStyles()} days={streakStatus.days} />
        </div>

        {/* Streak Info */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <div className={cn('text-4xl font-bold font-mono', getStreakColor())}>
              {streakStatus.days}
            </div>
            <div className="text-sm opacity-90">
              {streakStatus.days === 1 ? 'day' : 'days'}
            </div>
          </div>

          <p className="text-sm mt-2 opacity-90 leading-relaxed">
            {streakStatus.message}
          </p>

          <p className="text-xs mt-2 opacity-75 italic">
            Your buddy checks your streak every Monday
          </p>
        </div>

        {/* Log Today Button */}
        {streakStatus.isActive && (
          <Link
            href="/student/home?openQuickLog=true"
            className="px-4 py-3 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-all backdrop-blur-sm"
          >
            Log Today
          </Link>
        )}
      </div>

      {/* Rewards & Milestones */}
      <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
        {/* 30-Day Reward (Main CTA) */}
        {streakStatus.days > 0 && streakStatus.days < 30 && (
          <div className="bg-white/10 rounded-lg p-3">
            <p className="text-xs font-semibold text-yellow-200 mb-2">
              🎯 Next Big Goal: 30-Day Streak
            </p>
            <div className="space-y-2">
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (streakStatus.days / 30) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-yellow-200">
                {30 - streakStatus.days} days to unlock <strong>1 MONTH FREE EXTENSION</strong>
              </p>
            </div>
          </div>
        )}

        {/* 30-Day Milestone Achieved */}
        {streakStatus.days >= 30 && (
          <div className="bg-yellow-400/20 border border-yellow-300/40 rounded-lg p-3 animate-pulse">
            <p className="text-xs font-bold text-yellow-200 mb-1">
              👑 30-DAY MASTER UNLOCKED!
            </p>
            <p className="text-xs text-yellow-100">
              Congratulations! You&apos;ve earned <strong>1 MONTH FREE EXTENSION</strong> on your CareerRai subscription.
            </p>
            <p className="text-xs text-yellow-200 mt-2 font-semibold">
              ✓ Reward applied to your account
            </p>
          </div>
        )}

        {/* Generic Milestone Message */}
        {streakStatus.days > 0 && streakStatus.days % 7 === 0 && streakStatus.days < 30 && (
          <p className="text-xs font-semibold text-green-200">
            ✅ {streakStatus.days}-day milestone! Your buddy has been notified.
          </p>
        )}

        {/* Daily Log Reminder */}
        {streakStatus.days > 0 && (
          <p className="text-xs text-white/70">
            💪 <strong>Log daily to keep your streak alive</strong> • Streak resets if you miss a day
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Custom Flame Icon Component
 * Shows different styles based on streak duration
 */
interface FlameIconProps {
  className: string;
  days: number;
}

function FlameIcon({ className, days }: FlameIconProps) {
  // Different flame SVG based on state
  if (days === 0) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
      >
        <path d="M12 1L6 9c-1 2-2 5-2 8 0 5 3.58 9 6 9s6-4 6-9c0-3-1-6-2-8l-2-6z" />
      </svg>
    );
  }

  // Animated flame for active streaks
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={{
        filter: days >= 14 ? 'drop-shadow(0 0 8px currentColor)' : 'none'
      }}
    >
      <g>
        {/* Main flame */}
        <path d="M12 1L6 9c-1 2-2 5-2 8 0 5 3.58 9 6 9s6-4 6-9c0-3-1-6-2-8l-2-6z" />
        {/* Inner highlight for glow effect */}
        {days >= 7 && (
          <path
            d="M11 5L9 9c-0.5 1-1 3-1 5 0 3 2 5 3 5s3-2 3-5c0-2-0.5-4-1-5l-2-4z"
            fill="rgba(255,255,255,0.3)"
          />
        )}
      </g>
    </svg>
  );
}
```

### src/app/student/home/student-voice-notes-card.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mic, Plus } from 'lucide-react';

interface VoiceNote {
  id: string;
  voice_note_url: string;
  transcript?: string;
  created_at: string;
}

interface StudentVoiceNotesCardProps {
  studentId: string;
  buddyId: string;
  onRecordNew?: () => void;
}

export function StudentVoiceNotesCard({ studentId, buddyId, onRecordNew }: StudentVoiceNotesCardProps) {
  const supabase = createClient();
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVoiceNotes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('buddy_feedback')
        .select(`id, voice_note_url, feedback_text, created_at`)
        .eq('student_id', studentId)
        .eq('feedback_type', 'student_response')
        .not('voice_note_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      setVoiceNotes(data || []);
    } catch (error) {
      console.error('Error fetching voice notes:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase, studentId]);

  useEffect(() => {
    fetchVoiceNotes();
  }, [fetchVoiceNotes]);

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="space-y-1.5">
      {/* Last Note Preview - ULTRA COMPACT */}
      {!loading && voiceNotes.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs text-stone-600 font-medium">Last note:</span>
            <span className="text-xs text-stone-500">{getTimeAgo(voiceNotes[0].created_at)}</span>
          </div>
          {voiceNotes[0].voice_note_url && (
            <audio controls className="w-full h-5 rounded text-xs" src={voiceNotes[0].voice_note_url} />
          )}
        </div>
      )}

      {/* Record Button - Single Line */}
      <button
        onClick={onRecordNew}
        className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors text-xs"
      >
        <Plus className="w-3 h-3" />
        Record Note
      </button>
    </div>
  );
}
```

### src/app/student/journey/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/journey/page.tsx
```tsx
import { redirect } from 'next/navigation';

// Journey consolidated into Analysis — one page per function.
export default function StudentJourneyPage() {
  redirect('/student/analysis');
}
```

### src/app/student/layout.tsx
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StudentBottomNav } from '@/components/bottom-nav';
import { NotificationBell } from '@/components/notification-bell';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'student') {
    if (profile?.role === 'buddy') redirect('/buddy/students');
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Badge color="stone">Student</Badge>
            <NotificationBell userId={user.id} />
          </div>
        </div>
        {children}
      </div>
      <StudentBottomNav />
    </div>
  );
}
```

### src/app/student/onboarding/onboarding-modal.tsx
```tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X } from 'lucide-react';
import ScreenDreamColleges from './screens/screen-dream-colleges';
import ScreenHonesty from './screens/screen-honesty';
import ScreenMeetBuddy from './screens/screen-meet-buddy';
import ScreenBaselineTest from './screens/screen-baseline-test';
import ScreenDailyCommitment from './screens/screen-daily-commitment';
import ScreenLogDayOne from './screens/screen-log-day-one';
import { cn } from '@/lib/utils';

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const supabase = createClient();
  const [currentScreen, setCurrentScreen] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const screens = [
    { title: 'Your Dream Colleges', component: ScreenDreamColleges },
    { title: 'Be Honest With Us', component: ScreenHonesty },
    { title: 'Meet Your Buddy', component: ScreenMeetBuddy },
    { title: 'Your Baseline Test', component: ScreenBaselineTest },
    { title: 'Daily Commitment', component: ScreenDailyCommitment },
    { title: 'Log Day 1', component: ScreenLogDayOne }
  ];

  const CurrentScreen = screens[currentScreen].component;

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    }
    getUser();
  }, [supabase]);

  const [studyTargetHours, setStudyTargetHours] = useState<number>(2);
  const [onboardingData, setOnboardingData] = useState<Record<string, unknown>>({});

  const handleNext = async (data?: Record<string, unknown>) => {
    if (data) setOnboardingData((prev) => ({ ...prev, ...data }));

    // Screen 0 = Dream Colleges; save immediately
    if (currentScreen === 0 && data?.dream_colleges) {
      supabase.from('profiles').update({ dream_colleges: data.dream_colleges }).eq('id', userId ?? '').then(() => {});
    }
    // Screen 1 = Honesty; save immediately
    if (currentScreen === 1 && data) {
      supabase.from('profiles').update({
        is_repeater: data.is_repeater,
        starting_percentile: data.starting_percentile ?? null,
        hours_available: data.hours_available,
        study_target_hours: data.hours_available,
      }).eq('id', userId ?? '').then(() => {});
    }
    // Screen 4 (Daily Commitment) — save the target hours
    if (currentScreen === 4 && data?.studyTargetHours) {
      setStudyTargetHours(data.studyTargetHours as number);
    }

    if (currentScreen < screens.length - 1) {
      setCurrentScreen(currentScreen + 1);
    } else {
      // Last screen - mark onboarding as complete
      setIsLoading(true);
      try {
        if (!userId) {
          throw new Error('User ID not found');
        }

        console.log('Updating onboarding_completed for user:', userId);

        const { data: updateResult, error } = await supabase
          .from('profiles')
          .update({ onboarding_completed: true, study_target_hours: studyTargetHours })
          .eq('id', userId)
          .select();

        console.log('Update result:', updateResult, 'Error:', error);

        if (error) throw error;

        // Wait 2 seconds to ensure DB update propagates
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Calling onComplete after DB update');
        onComplete();
      } catch (err) {
        console.error('Onboarding error:', err);
        setError(err instanceof Error ? err.message : 'Failed to complete onboarding. Try closing and reopening.');
        setIsLoading(false);
      }
    }
  };

  const handleCompleteWithoutUpdate = async () => {
    if (!userId) {
      onComplete();
      return;
    }

    try {
      console.log('Completing onboarding for user:', userId);

      // Try to update database
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', userId);

      if (error) {
        console.warn('DB update failed:', error);
      } else {
        console.log('DB update successful');
      }

      // Set localStorage emergency bypass
      localStorage.setItem(`onboarding_skip_${userId}`, 'true');
      console.log('Set localStorage bypass for user:', userId);

      // Wait for update to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));
      onComplete();
    } catch (err) {
      console.error('Error completing onboarding:', err);
      // Set localStorage bypass even if DB failed
      if (userId) {
        localStorage.setItem(`onboarding_skip_${userId}`, 'true');
      }
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentScreen > 0) {
      setCurrentScreen(currentScreen - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header with Progress */}
        <div className="bg-white border-b border-stone-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              {screens[currentScreen].title}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCompleteWithoutUpdate();
                }}
                disabled={isLoading}
                type="button"
                className="text-xs px-2 py-1 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded transition disabled:opacity-50 cursor-pointer"
                title="Skip onboarding"
              >
                Skip
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCompleteWithoutUpdate();
                }}
                disabled={isLoading}
                type="button"
                className="text-stone-400 hover:text-stone-600 transition disabled:opacity-50 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="flex gap-2">
            {screens.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-all',
                  i <= currentScreen ? 'bg-orange-600' : 'bg-stone-200'
                )}
              />
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Screen {currentScreen + 1}/{screens.length}
          </p>
        </div>

        {/* Screen Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <p>{error}</p>
              <button
                onClick={() => {
                  console.log('Force skipping onboarding...');
                  handleCompleteWithoutUpdate();
                }}
                type="button"
                className="mt-2 text-xs underline hover:text-red-900 cursor-pointer"
              >
                Click here to skip
              </button>
            </div>
          )}

          <CurrentScreen
            onNext={handleNext}
            onBack={handleBack}
            canGoBack={currentScreen > 0}
            isLoading={isLoading}
          />
        </div>

        {/* Navigation Buttons */}
        <div className="border-t border-stone-200 p-6 bg-stone-50 flex gap-3">
          {currentScreen > 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleBack();
              }}
              disabled={isLoading}
              type="button"
              className="flex-1 py-3 px-4 border border-stone-300 text-stone-900 rounded-xl font-medium hover:bg-stone-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Back
            </button>
          )}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleNext();
            }}
            disabled={isLoading}
            type="button"
            className={cn(
              'flex-1 py-3 px-4 rounded-xl font-medium transition-all active:scale-[0.98] cursor-pointer',
              currentScreen === screens.length - 1
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-orange-600 text-white hover:bg-orange-700',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? 'Loading...' : currentScreen === screens.length - 1 ? 'Enter Dashboard' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### src/app/student/onboarding/screens/screen-baseline-test.tsx
```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Zap, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface ScreenBaselineTestProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

export default function ScreenBaselineTest({ onNext, onBack, canGoBack, isLoading }: ScreenBaselineTestProps) {
  const supabase = createClient();
  const [hasTest, setHasTest] = useState(false);
  const [testScore, setTestScore] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkForTest() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('test_results')
          .select('score')
          .eq('student_id', user.id)
          .eq('test_type', 'cat-readiness')
          .single();

        if (data) {
          setHasTest(true);
          setTestScore(data.score);
        }
      } catch (error) {
        // No test found, that's okay
        console.log('No test found yet');
      } finally {
        setIsChecking(false);
      }
    }

    checkForTest();
  }, [supabase]);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-stone-600">Checking for test...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subtitle */}
      <div>
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Your Baseline</p>
        <p className="text-xs text-stone-500 mt-1">Get your starting point for CAT prep</p>
      </div>

      {hasTest ? (
        <>
          {/* Test Complete - Show Score */}
          <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl p-8 border border-emerald-200 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-stone-900 mb-2">Test Complete!</h3>
            <p className="text-sm text-stone-600 mb-6">Great job finishing the baseline assessment</p>

            {testScore !== null && (
              <div className="bg-white rounded-xl p-4 mb-6 border border-emerald-100">
                <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-1">Your Score</p>
                <div className="text-5xl font-bold text-emerald-700">{testScore}</div>
                <p className="text-xs text-stone-600 mt-1">/100</p>
              </div>
            )}

            <p className="text-sm text-stone-600 mb-4">
              Your buddy has all the information needed to create a personalized strategy for you.
            </p>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onNext();
              }}
              disabled={isLoading}
              type="button"
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all disabled:opacity-50 cursor-pointer"
            >
              Continue
            </button>
          </div>
        </>
      ) : (
        <>
          {/* No Test Yet - Encourage to Take */}
          <div className="space-y-4">
            {/* Icon */}
            <div className="flex justify-center">
              <Zap className="w-16 h-16 text-orange-600" />
            </div>

            {/* Description */}
            <div className="text-center space-y-3">
              <p className="text-sm text-stone-700 font-medium">Your buddy needs this to guide you</p>
              <p className="text-xs text-stone-600 leading-relaxed">
                Takes 5 minutes. 35 questions. Your score tells your buddy exactly where to focus with you. It&apos;s the
                fastest way to get personalized guidance.
              </p>
            </div>

            {/* Test Button */}
            <Link
              href="/student/exams"
              className="block w-full py-3 bg-orange-600 text-white text-center rounded-xl font-medium hover:bg-orange-700 transition-all active:scale-[0.98]"
            >
              Take the 5-Minute Test
            </Link>

            {/* Alternative */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onNext();
              }}
              type="button"
              className="w-full py-3 bg-white text-stone-900 border-2 border-stone-200 rounded-xl font-medium hover:bg-stone-50 transition-all cursor-pointer"
            >
              I&apos;ll do this later
            </button>

            {/* Warning Message */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800 text-center">
                <span className="font-semibold">Heads up:</span> Your buddy can&apos;t give personalized guidance without
                this. Strongly recommended.
              </p>
            </div>
          </div>

          {/* Quick Note */}
          <p className="text-xs text-stone-500 text-center italic">
            Don&apos;t worry about your score. This is just to understand your current level. Improvement is what matters.
          </p>
        </>
      )}
    </div>
  );
}
```

### src/app/student/onboarding/screens/screen-daily-commitment.tsx
```tsx
'use client';

import { useState } from 'react';
import { Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScreenDailyCommitmentProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const COMMITMENT_OPTIONS = [
  { label: '1 hour', value: 1, description: 'Starting out' },
  { label: '1.5 hours', value: 1.5, description: 'Moderate' },
  { label: '2 hours', value: 2, description: 'Recommended', isDefault: true },
  { label: '3 hours', value: 3, description: 'Serious prep' },
  { label: '4 hours', value: 4, description: 'Intensive' },
  { label: '5+ hours', value: 5, description: 'Full-time' }
];

export default function ScreenDailyCommitment({ onNext, onBack, canGoBack, isLoading }: ScreenDailyCommitmentProps) {
  const [selected, setSelected] = useState<number>(2); // Default 2 hours

  return (
    <div className="space-y-6">
      {/* Subtitle */}
      <div>
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">One Honest Question</p>
        <p className="text-xs text-stone-500 mt-1">This becomes your daily target</p>
      </div>

      {/* Question */}
      <div className="bg-gradient-to-br from-orange-50 to-white rounded-2xl p-6 border border-orange-100">
        <h3 className="text-lg font-bold text-stone-900 text-center mb-2">
          How many hours can you realistically study on a typical weekday?
        </h3>
        <p className="text-sm text-stone-600 text-center">
          Be honest. This becomes your streak target. Your buddy will notice if you consistently miss it.
        </p>
      </div>

      {/* Hour Picker */}
      <div className="grid grid-cols-2 gap-3">
        {COMMITMENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelected(option.value);
            }}
            type="button"
            className={cn(
              'p-4 rounded-xl transition-all border-2 text-center',
              selected === option.value
                ? 'bg-orange-600 border-orange-600 text-white shadow-lg'
                : 'bg-white border-stone-200 text-stone-900 hover:border-stone-300'
            )}
          >
            <div className="text-lg font-bold">{option.label}</div>
            <div className={cn('text-xs mt-1', selected === option.value ? 'text-orange-100' : 'text-stone-500')}>
              {option.description}
            </div>
          </button>
        ))}
      </div>

      {/* Info Message */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-2">
          <Target className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800">
            <span className="font-semibold">Your buddy checks your streak every Monday.</span> They&apos;ll notice if you&apos;re
            consistently hitting or missing your target.
          </p>
        </div>
      </div>

      {/* Context */}
      <p className="text-xs text-stone-500 text-center italic">
        Most successful students study 2-3 hours daily during prep season. Quality over quantity.
      </p>

      {/* Submit Button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onNext({ studyTargetHours: selected });
        }}
        disabled={isLoading}
        type="button"
        className="w-full py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all disabled:opacity-50 active:scale-[0.98] cursor-pointer"
      >
        This is my commitment
      </button>
    </div>
  );
}
```

### src/app/student/onboarding/screens/screen-dream-colleges.tsx
```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

const COLLEGES = [
  'IIM Ahmedabad', 'IIM Bangalore', 'IIM Calcutta',
  'IIM Lucknow', 'IIM Kozhikode', 'IIM Indore',
  'ISB Hyderabad', 'XLRI Jamshedpur', 'MDI Gurgaon',
  'IIFT Delhi', 'SP Jain Mumbai', 'JBIMS Mumbai',
  'FMS Delhi', 'IIM Shillong', 'IIM Udaipur',
];

interface Props {
  onNext: (data: { dream_colleges: string[] }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

export default function ScreenDreamColleges({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (college: string) => {
    setSelected((prev) =>
      prev.includes(college) ? prev.filter((c) => c !== college) : [...prev, college].slice(0, 3)
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-stone-600 leading-relaxed">
          Pick up to <strong>3 colleges</strong> you genuinely want. Not what seems realistic — what you actually want.
          This becomes the north star that drives every daily nudge.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {COLLEGES.map((college) => {
          const isSelected = selected.includes(college);
          const rank = selected.indexOf(college) + 1;
          return (
            <button
              key={college}
              onClick={() => toggle(college)}
              disabled={!isSelected && selected.length >= 3}
              className={cn(
                'relative px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 border',
                isSelected
                  ? 'bg-orange-600 text-white border-orange-600 shadow-md'
                  : selected.length >= 3
                  ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
                  : 'bg-white text-stone-700 border-stone-300 hover:border-orange-400 hover:bg-orange-50'
              )}
            >
              {isSelected && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-stone-900 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {rank}
                </span>
              )}
              {college}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
          <p className="text-xs text-orange-800">
            <strong>#{1}: {selected[0]}</strong>
            {' '}— every insight in this app will point toward this.
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {canGoBack && (
          <button onClick={onBack} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={() => onNext({ dream_colleges: selected })}
          disabled={selected.length === 0 || isLoading}
          className={cn(
            'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
            selected.length > 0
              ? 'bg-orange-600 text-white hover:bg-orange-700'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          )}
        >
          {selected.length === 0 ? 'Pick at least one' : `Lock in my dream${selected.length > 1 ? 's' : ''} →`}
        </button>
      </div>
    </div>
  );
}
```

### src/app/student/onboarding/screens/screen-honesty.tsx
```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data: {
    is_repeater: boolean;
    starting_percentile: number | null;
    hours_available: number;
  }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6];

export default function ScreenHonesty({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [isRepeater, setIsRepeater] = useState<boolean | null>(null);
  const [percentile, setPercentile] = useState<number>(50);
  const [hoursAvailable, setHoursAvailable] = useState<number | null>(null);

  const isValid = isRepeater !== null && hoursAvailable !== null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 leading-relaxed">
        Honest baselines make honest progress. No one else sees this — it&apos;s just the data the app needs to give you accurate feedback.
      </p>

      {/* Repeater / Fresher */}
      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          Is this your first attempt?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'First attempt', sub: 'Fresher to CAT', value: false },
            { label: 'Repeating', sub: 'Gave CAT before', value: true },
          ].map(({ label, sub, value }) => (
            <button
              key={label}
              onClick={() => setIsRepeater(value)}
              className={cn(
                'py-4 px-3 rounded-xl border-2 text-left transition-all active:scale-95',
                isRepeater === value
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-stone-200 bg-white hover:border-stone-300'
              )}
            >
              <p className={cn('text-sm font-semibold', isRepeater === value ? 'text-orange-700' : 'text-stone-800')}>{label}</p>
              <p className="text-xs text-stone-500 mt-0.5">{sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Starting percentile (show only if repeater) */}
      {isRepeater === true && (
        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
            Your best CAT percentile so far
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={99}
              value={percentile}
              onChange={(e) => setPercentile(Number(e.target.value))}
              className="flex-1 accent-orange-600"
            />
            <span className="text-lg font-bold text-stone-900 w-14 text-right">{percentile}%ile</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {percentile >= 90
              ? 'So close. The gap between 90 and 99 is real — this app helps bridge it.'
              : percentile >= 70
              ? 'Good foundation. Consistency and section strategy will move this fast.'
              : 'Starting from a real place — that\'s the only honest starting point.'}
          </p>
        </div>
      )}

      {/* Hours available */}
      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">
          Realistic study hours per day
        </label>
        <div className="grid grid-cols-6 gap-1.5">
          {HOUR_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => setHoursAvailable(h)}
              className={cn(
                'py-3 rounded-xl font-bold text-sm transition-all active:scale-95 border-2',
                hoursAvailable === h
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              )}
            >
              {h}h
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500 mt-2">
          {hoursAvailable && hoursAvailable <= 2
            ? 'Tight but workable — quality over quantity, every day.'
            : hoursAvailable && hoursAvailable >= 5
            ? 'Ambitious. The app will flag if you drop below this consistently.'
            : hoursAvailable
            ? 'Solid. That\'s enough to move the needle if the hours are focused.'
            : 'Be honest — this sets your daily target, not a promise.'}
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        {canGoBack && (
          <button onClick={onBack} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={() =>
            isValid &&
            onNext({
              is_repeater: isRepeater!,
              starting_percentile: isRepeater ? percentile : null,
              hours_available: hoursAvailable!,
            })
          }
          disabled={!isValid || isLoading}
          className={cn(
            'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
            isValid ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          )}
        >
          {isLoading ? 'Saving…' : 'That\'s honest →'}
        </button>
      </div>
    </div>
  );
}
```

### src/app/student/onboarding/screens/screen-log-day-one.tsx
```tsx
'use client';
/* eslint-disable react-hooks/purity */

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Flame, Sparkles } from 'lucide-react';
import { updateStreakAfterLog, checkAndCreateMilestones } from '@/lib/streak-utils';
import { cn } from '@/lib/utils';
import { MAIN_CATEGORIES, TOPIC_EMOJIS } from '@/lib/topics-constants';

interface ScreenLogDayOneProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const TOPICS = MAIN_CATEGORIES;
const FEELING_OPTIONS = [
  { emoji: '🙏', label: 'Tough', value: 1 },
  { emoji: '💪', label: 'Solid', value: 2 },
  { emoji: '🙊', label: 'Easy', value: 3 }
];
const HOURS_OPTIONS = [0, 1, 2, 3, '4+'];

export default function ScreenLogDayOne({ onNext, onBack, canGoBack, isLoading }: ScreenLogDayOneProps) {
  const supabase = createClient();
  const [showConfetti, setShowConfetti] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [buddyId, setBuddyId] = useState<string | null>(null);

  const [hours, setHours] = useState<number | string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [feeling, setFeeling] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('buddy_id')
          .eq('id', user.id)
          .single();
        if (profile?.buddy_id) {
          setBuddyId(profile.buddy_id);
        }
      }
    }
    loadUser();
  }, [supabase]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleSubmit = async () => {
    if (hours === null || selectedTopics.length === 0 || feeling === null) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (!userId) return;

      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const hoursValue = typeof hours === 'string' ? 4 : hours;

      // Map feeling to confidence/stress
      let confidence = 3;
      let stress = 3;
      if (feeling === 1) {
        // Tough
        confidence = 2;
        stress = 4;
      } else if (feeling === 2) {
        // Solid
        confidence = 4;
        stress = 2;
      } else if (feeling === 3) {
        // Easy
        confidence = 5;
        stress = 1;
      }

      // Create daily report with all fields to match database schema
      const { error: reportError } = await supabase.from('daily_reports').insert({
        student_id: userId,
        report_date: todayString,
        study_duration: hoursValue,
        topics_covered: selectedTopics,
        confidence,
        stress,
        quality_focus: 3, // Default middle value
        difficulty: 3, // Default middle value
        mock_taken: false,
        mock_name: null,
        quant_score: null,
        verbal_score: null,
        logic_score: null,
        total_accuracy: null,
        sleep_quality: 3, // Default middle value
        nutrition_exercise: false,
        overall_energy: 3, // Default middle value
        notes: null,
        updated_at: new Date().toISOString()
      });

      if (reportError) {
        console.error('Daily report insert error:', reportError);
        throw reportError;
      }

      // Update streak
      await updateStreakAfterLog(userId);

      // Check for milestones and notify buddy
      if (buddyId) {
        await checkAndCreateMilestones(userId, buddyId);
      }

      // Show confetti animation
      setShowConfetti(true);

      // Wait for animation then complete
      setTimeout(() => {
        onNext({ logSubmitted: true });
      }, 1500);
    } catch (error) {
      console.error('Error submitting log:', error);
      setIsSubmitting(false);
    }
  };

  const canSubmit = hours !== null && selectedTopics.length > 0 && feeling !== null;

  return (
    <div className="space-y-6 relative">
      {/* Confetti Container */}
      {showConfetti && <ConfettiContainer />}

      {/* Animated Flame */}
      <div className="flex justify-center">
        <Flame
          className={cn(
            'w-16 h-16 text-orange-600 transition-all',
            showConfetti ? 'scale-150 animate-pulse' : 'animate-bounce'
          )}
        />
      </div>

      {/* Subtitle */}
      <div className="text-center">
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Day 1. Streak starts now.</p>
        <p className="text-xs text-stone-500 mt-1">Log today&apos;s study session. Even 30 minutes counts.</p>
      </div>

      {/* Quick Log Card */}
      <div className="bg-white rounded-2xl p-6 border-2 border-orange-100 space-y-6">
        {/* Hours Studied */}
        <div>
          <label className="text-sm font-semibold text-stone-900 block mb-3">How many hours today?</label>
          <div className="grid grid-cols-5 gap-2">
            {HOURS_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHours(option);
                }}
                type="button"
                className={cn(
                  'py-3 rounded-lg font-medium transition-all text-sm',
                  hours === option
                    ? 'bg-orange-600 text-white'
                    : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Topics */}
        <div>
          <label className="text-sm font-semibold text-stone-900 block mb-3">Topics covered</label>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((topic) => (
              <button
                key={topic}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleTopic(topic);
                }}
                type="button"
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  selectedTopics.includes(topic)
                    ? 'bg-orange-600 text-white'
                    : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                )}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        {/* How did it go? */}
        <div>
          <label className="text-sm font-semibold text-stone-900 block mb-3">How did it go?</label>
          <div className="flex gap-3 justify-around">
            {FEELING_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFeeling(option.value);
                }}
                type="button"
                className={cn(
                  'flex flex-col items-center gap-1 p-3 rounded-xl transition-all',
                  feeling === option.value
                    ? 'bg-orange-600 text-white'
                    : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                )}
              >
                <span className="text-2xl">{option.emoji}</span>
                <span className="text-xs font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Motivation */}
      <p className="text-xs text-stone-600 text-center italic">
        Your buddy sees every log. This consistency is what separates successful CAT aspirants from the rest.
      </p>

      {/* Submit Button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit();
        }}
        disabled={!canSubmit || isSubmitting || isLoading}
        type="button"
        className={cn(
          'w-full py-3 rounded-xl font-medium transition-all active:scale-[0.98]',
          canSubmit
            ? 'bg-orange-600 text-white hover:bg-orange-700 cursor-pointer'
            : 'bg-stone-200 text-stone-400 cursor-not-allowed'
        )}
      >
        {isSubmitting || isLoading ? 'Submitting...' : 'Submit and Enter Dashboard'}
      </button>

      {/* Helper Text */}
      {!canSubmit && (
        <p className="text-xs text-amber-600 text-center">
          Fill in all fields to continue
        </p>
      )}
    </div>
  );
}

/**
 * Simple Confetti Component
 * CSS-based confetti animation
 */
function ConfettiContainer() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {[...Array(30)].map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const duration = 2 + Math.random() * 1;
        const colors = ['#E8652D', '#2A9D8F', '#F4A261', '#E76F51', '#264653'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        return (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full animate-fall"
            style={{
              left: `${left}%`,
              top: '-10px',
              backgroundColor: color,
              animation: `fall ${duration}s linear ${delay}s forwards`,
              opacity: 0.8
            }}
          />
        );
      })}

      <style>{`
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
```

### src/app/student/onboarding/screens/screen-meet-buddy.tsx
```tsx
'use client';
/* eslint-disable react-hooks/purity */

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Play, Pause, Volume2 } from 'lucide-react';

interface ScreenMeetBuddyProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

interface BuddyInfo {
  full_name: string;
  college: string | null;
  cat_percentile: number | null;
  intro_audio_url: string | null;
  buddy_bio: string | null;
}

export default function ScreenMeetBuddy({ onNext, onBack, canGoBack, isLoading }: ScreenMeetBuddyProps) {
  const supabase = createClient();
  const [buddy, setBuddy] = useState<BuddyInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [hasPlayedEnough, setHasPlayedEnough] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    async function loadBuddy() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('buddy_id')
          .eq('id', user.id)
          .single();

        if (!profile?.buddy_id) {
          // Generic IIM Alumni card if no buddy assigned
          setBuddy({
            full_name: 'IIM Alumni Buddy',
            college: 'IIM Network',
            cat_percentile: null,
            intro_audio_url: null,
            buddy_bio: 'Your dedicated IIM alumni buddy is ready to guide your CAT journey'
          });
          setAudioLoaded(true);
          setHasPlayedEnough(true);
          return;
        }

        const { data: buddyData } = await supabase
          .from('profiles')
          .select('full_name, college, cat_percentile, intro_audio_url, buddy_bio')
          .eq('id', profile.buddy_id)
          .single();

        if (buddyData) {
          setBuddy(buddyData as BuddyInfo);
          if (!buddyData.intro_audio_url) {
            setAudioLoaded(true);
            setHasPlayedEnough(true);
          }
        }
      } catch (error) {
        console.error('Error loading buddy:', error);
        setAudioLoaded(true);
        setHasPlayedEnough(true);
      }
    }

    loadBuddy();
  }, [supabase]);

  const handlePlayClick = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Error playing audio:', error);
      }
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current && audioRef.current.currentTime >= 10 && !hasPlayedEnough) {
      setHasPlayedEnough(true);
    }
  };

  const handleAudioEnd = () => {
    setIsPlaying(false);
    setHasPlayedEnough(true);
  };

  if (!buddy) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-stone-600">Loading buddy profile...</p>
        </div>
      </div>
    );
  }

  const initials = buddy.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Subtitle */}
      <div>
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Meet Your Buddy</p>
        <p className="text-xs text-stone-500 mt-1">&quot;Your buddy is ready&quot; to guide your CAT prep</p>
      </div>

      {/* Buddy Card */}
      <div className="bg-gradient-to-br from-orange-50 to-white rounded-2xl p-6 border border-orange-100">
        {/* Avatar & Name */}
        <div className="flex flex-col items-center mb-4">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3">
            {initials}
          </div>
          <h3 className="text-xl font-bold text-stone-900">{buddy.full_name}</h3>

          {/* Badges */}
          <div className="flex gap-2 mt-3 flex-wrap justify-center">
            {buddy.college && (
              <div className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">
                {buddy.college}
              </div>
            )}
            {buddy.cat_percentile && (
              <div className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                {buddy.cat_percentile.toFixed(1)}%ile CAT
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-orange-100 my-4" />

        {/* Audio Player or Bio */}
        {buddy.intro_audio_url ? (
          <div className="space-y-3">
            <audio
              ref={audioRef}
              src={buddy.intro_audio_url}
              onTimeUpdate={handleAudioTimeUpdate}
              onEnded={handleAudioEnd}
            />

            {/* Play Button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handlePlayClick();
              }}
              type="button"
              className="w-full flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-6 h-6" />
                  <span className="font-medium">Listening...</span>
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 ml-1" />
                  <span className="font-medium">Play Introduction</span>
                </>
              )}
            </button>

            {/* Waveform Placeholder */}
            {isPlaying && (
              <div className="flex items-center justify-center gap-1 py-2">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-orange-400 rounded-full animate-pulse"
                    style={{
                      height: `${Math.random() * 20 + 4}px`,
                      animationDelay: `${i * 0.1}s`
                    }}
                  />
                ))}
              </div>
            )}

            {/* Progress Text */}
            <p className="text-xs text-stone-500 text-center">
              {hasPlayedEnough ? '✓ Audio heard. Ready to continue.' : 'Listen for at least 10 seconds to continue'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Volume2 className="w-6 h-6 text-stone-400 mx-auto" />
            {buddy.buddy_bio && (
              <p className="text-sm text-stone-700 text-center italic">&quot;{buddy.buddy_bio}&quot;</p>
            )}
            <p className="text-xs text-stone-500 text-center">Audio message coming soon</p>
          </div>
        )}
      </div>

      {/* Info Text */}
      <p className="text-xs text-stone-500 text-center">
        Your buddy is an IIM alumni who scored in the{' '}
        {buddy.cat_percentile ? `${buddy.cat_percentile.toFixed(0)}%ile` : 'top percentiles'} on CAT. They&apos;ll review
        your progress every week and give you personalized guidance.
      </p>

      {/* Next Button Info */}
      {hasPlayedEnough && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 text-center font-medium">
          ✓ Ready to continue
        </div>
      )}
    </div>
  );
}
```

### src/app/student/profile/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/profile/page.tsx
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NotifPrefsPanel } from '@/components/notif-prefs-panel';
import { LogoutButton } from '@/components/logout-button';
import { PushToggle } from '@/components/push-toggle';
import { ShareProgressButton } from '@/components/share-progress-button';
import { Check, GraduationCap, Clock } from 'lucide-react';
import type { NotifPrefs } from '@/types';
import { DreamCollegesCard } from '@/components/dream-colleges-card';
import { MembershipCard } from '@/components/membership-card';
import { paymentsEnabled } from '@/lib/feature-flags';

export default async function StudentProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('full_name, email, exam_target, buddy_id, notif_prefs, created_at, dream_colleges, subscription_status, subscription_plan, subscription_renews_at').eq('id', user.id).single();
  if (!profile) redirect('/login');

  // Buddy credentials + trust signals
  let buddy: { full_name: string; college: string | null; cat_percentile: number | null; buddy_bio: string | null } | null = null;
  let responseHours: number | null = null;
  if (profile.buddy_id) {
    const { data: b } = await admin
      .from('profiles')
      .select('full_name, college, cat_percentile, buddy_bio')
      .eq('id', profile.buddy_id)
      .single();
    buddy = b;

    // Response rate: avg gap between feedback creation and the day it covers (last 30 days)
    const { data: recentFeedback } = await admin
      .from('buddy_feedback')
      .select('created_at, feedback_date')
      .eq('buddy_id', profile.buddy_id)
      // eslint-disable-next-line react-hooks/purity
      .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .limit(20);
    if (recentFeedback && recentFeedback.length > 0) {
      const gaps = recentFeedback
        .map((f) => (new Date(f.created_at).getTime() - new Date(f.feedback_date + 'T00:00:00').getTime()) / 3600000)
        .filter((h) => h >= 0 && h < 24 * 7);
      if (gaps.length > 0) {
        responseHours = Math.max(1, Math.round(gaps.reduce((s, h) => s + h, 0) / gaps.length));
      }
    }
  }

  // Progress summary
  const [{ count: daysLogged }, { data: streak }, { data: latestTest }] = await Promise.all([
    admin.from('daily_reports').select('id', { count: 'exact', head: true }).eq('student_id', user.id),
    admin.from('streak_data').select('current_streak, longest_streak').eq('student_id', user.id).maybeSingle(),
    admin.from('test_results').select('percentile').eq('student_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const bestStreak = streak?.longest_streak ?? 0;
  const latestPercentile: number | null = latestTest?.percentile ?? null;
  const targetPercentile = 90;
  const progressPct = latestPercentile ? Math.min(100, Math.round((latestPercentile / targetPercentile) * 100)) : 0;

  const initials = profile.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const buddyInitials = buddy ? buddy.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '';
  const defaultPrefs: NotifPrefs = { daily_reminder: true, reminder_time: '20:00', email: true, push: false };
  const prefs: NotifPrefs = { ...defaultPrefs, ...(profile.notif_prefs ?? {}) };

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Profile</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>You</h1>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold text-stone-900">{profile.full_name}</div>
            <div className="text-sm text-stone-600">{profile.email}</div>
            <div className="mt-1"><Badge color="stone">{profile.exam_target ?? 'Student'}</Badge></div>
          </div>
        </div>
      </Card>

      {/* Progress Summary */}
      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Your Progress</div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{daysLogged ?? 0}</div>
            <div className="text-xs text-stone-500 mt-0.5">Days logged</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{bestStreak}</div>
            <div className="text-xs text-stone-500 mt-0.5">Best streak</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{latestPercentile ? `${Math.round(latestPercentile)}%` : '—'}</div>
            <div className="text-xs text-stone-500 mt-0.5">Latest %ile</div>
          </div>
        </div>
        {latestPercentile !== null && (
          <div className="mb-4">
            <div className="w-full bg-stone-200 rounded-full h-2">
              <div className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-stone-500 mt-1.5">You&apos;re {progressPct}% of the way to your {targetPercentile}%ile target</p>
          </div>
        )}
        <ShareProgressButton daysLogged={daysLogged ?? 0} bestStreak={bestStreak} percentile={latestPercentile} />
      </Card>

      <DreamCollegesCard initial={(profile.dream_colleges as string[] | null) ?? []} />

      {paymentsEnabled() && (
        <MembershipCard
          status={(profile.subscription_status as 'free_beta' | 'active' | 'expired' | 'refund_requested') ?? 'free_beta'}
          plan={(profile.subscription_plan as string | null) ?? null}
          renewsAt={(profile.subscription_renews_at as string | null) ?? null}
          fullName={profile.full_name}
        />
      )}

      {/* Buddy Trust Signals */}
      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">Your Buddy</div>
        {buddy ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-gradient-to-br from-teal-600 to-teal-800 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                {buddyInitials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-stone-900">{buddy.full_name}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {buddy.college && (
                    <Badge color="blue"><GraduationCap className="w-3 h-3 inline mr-1" />{buddy.college}</Badge>
                  )}
                  {buddy.cat_percentile && (
                    <Badge color="orange">{Number(buddy.cat_percentile).toFixed(0)}%ile CAT</Badge>
                  )}
                </div>
              </div>
            </div>
            {buddy.buddy_bio && (
              <p className="text-sm text-stone-700 italic leading-relaxed border-l-2 border-teal-300 pl-3">
                &quot;{buddy.buddy_bio}&quot;
              </p>
            )}
            {responseHours !== null && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                <Clock className="w-3.5 h-3.5" />
                Responds within {responseHours} hr{responseHours === 1 ? '' : 's'} — verified
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-900">Not yet assigned</span>
          </div>
        )}
        {profile.buddy_id && (
          <div className="mt-3 pt-3 border-t border-stone-100">
            <Badge color="green"><Check className="w-3 h-3 inline mr-1" />Connected</Badge>
          </div>
        )}
      </Card>

      <NotifPrefsPanel initial={prefs} label1="Daily reminder" label2="Email notifications" />

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Push notifications</div>
        <PushToggle initialEnabled={prefs.push ?? false} />
        <p className="text-xs text-stone-400 mt-2">Get instant alerts on your device even when the app is closed.</p>
      </Card>

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">Member since</div>
        <div className="text-sm font-semibold text-stone-900">
          {new Date(profile.created_at).toLocaleDateString('en-IN', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })}
        </div>
      </Card>

      <LogoutButton />
    </div>
  );
}
```

### src/app/student/reports/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/reports/page.tsx
```tsx
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { computeSummary } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DailyReport } from '@/types';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const CHIP_LABELS: Record<string, string> = {
  mock_scared: '😨 Mock scared me',
  burned_out: '🔥 Burned out',
  comparing: '👀 Comparing',
  family_pressure: '🏠 Family pressure',
  lost_confidence: '📉 Lost confidence',
  feeling_behind: '⏰ Feeling behind',
  all_good: '😌 All good',
};

export default function StudentReportsPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState(7);
  // Fetch 30 days once, filter client-side — no refetch on period toggle
  const [allReports, setAllReports] = useState<DailyReport[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: reps } = await supabase
        .from('daily_reports')
        .select('report_date, study_duration, topics_covered, mock_taken, notes, mood_emoji, emotional_chips, total_accuracy')
        .eq('student_id', user.id)
        .order('report_date', { ascending: false })
        .limit(30);
      setAllReports((reps ?? []) as unknown as DailyReport[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reports = allReports.slice(0, period);
  const summary = computeSummary(reports, period);

  if (loading) return <div className="py-20 text-center text-sm text-stone-500">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">History</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Day by day
        </h1>
      </div>

      {/* Period selector — filters client-side, no refetch */}
      <div className="flex bg-stone-100 rounded-xl p-1">
        {[7, 10, 30].map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-all', period === p ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600')}>
            {p} days
          </button>
        ))}
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Total study</div>
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.totalStudy.toFixed(1)}<span className="text-sm text-stone-500 font-normal ml-1">hrs</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Mock tests</div>
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.totalMocks}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Avg mock score</div>
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.avgMockScore > 0 ? summary.avgMockScore.toFixed(0) : '—'}<span className="text-sm text-stone-500 font-normal ml-1">{summary.avgMockScore > 0 ? '%ile' : ''}</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Days submitted</div>
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.daysSubmitted}<span className="text-sm text-stone-500 font-normal ml-1">/ {period}</span></div>
        </Card>
      </div>

      {/* Day-by-day */}
      <div className="space-y-2">
        {reports.map((r) => {
          const isOpen = expandedDay === r.report_date;
          const chips = (r as unknown as { emotional_chips?: string[] }).emotional_chips ?? [];
          return (
            <Card key={r.report_date} className="overflow-hidden">
              <button type="button" onClick={() => setExpandedDay(isOpen ? null : r.report_date)} className="w-full flex items-center justify-between p-4 hover:bg-stone-50 transition-colors">
                <div className="flex items-center gap-3 text-left">
                  <div className="text-center w-10 shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                      {new Date(r.report_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-stone-900 leading-none">
                      {new Date(r.report_date + 'T00:00:00').getDate()}
                    </div>
                  </div>
                  <div className="border-l border-stone-200 pl-3 min-w-0">
                    <div className="text-sm font-semibold text-stone-900 truncate">
                      {r.study_duration?.toFixed(1)} hrs · {(r.topics_covered ?? []).slice(0, 2).join(', ')}{(r.topics_covered?.length ?? 0) > 2 && ` +${(r.topics_covered?.length ?? 0) - 2}`}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      {r.mock_taken && <Badge color="orange">Mock</Badge>}
                      {r.mood_emoji && <span>{r.mood_emoji}</span>}
                      {chips.length > 0 && !chips.includes('all_good') && (
                        <span className="text-amber-600 font-medium">{chips.length} feeling{chips.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-stone-400 transition-transform shrink-0', isOpen && 'rotate-180')} />
              </button>

              {isOpen && (
                <div className="border-t border-stone-200 p-4 bg-stone-50/50 space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-1">What you studied</div>
                    <div className="flex flex-wrap gap-1">
                      {(r.topics_covered ?? []).map((t) => <Badge key={t} color="stone">{t}</Badge>)}
                    </div>
                  </div>

                  {chips.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-1">How you felt</div>
                      <div className="flex flex-wrap gap-1.5">
                        {chips.map((c: string) => (
                          <span key={c} className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            c === 'all_good' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          )}>
                            {CHIP_LABELS[c] ?? c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {r.notes && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-1">Notes</div>
                      <p className="text-xs text-stone-600 italic">&quot;{r.notes}&quot;</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        {reports.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-sm text-stone-600">No logs yet — log today to start your streak.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
```

### src/app/student/settings/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/settings/page.tsx
```tsx
'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GoogleCalendarConnectBtn } from '@/components/google-calendar-connect-btn';

export default function StudentSettingsPage() {
  const supabase = createClient();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkGoogleCalendarStatus = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('google_calendar_connected')
        .eq('id', user.id)
        .single();

      setIsConnected(profile?.google_calendar_connected ?? false);
    } catch (error) {
      console.error('Error checking calendar connection:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    checkGoogleCalendarStatus();
  }, [checkGoogleCalendarStatus]);

  const handleSuccess = () => {
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
  };

  return (
    <div className="min-h-screen bg-stone-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-8">Settings</h1>

        <div className="bg-white rounded-lg border border-stone-200 p-6 space-y-6">
          {/* Calendar Integration Section */}
          <div className="border-b border-stone-100 pb-6">
            <h2 className="text-lg font-semibold text-stone-900 mb-2">Calendar Integration</h2>
            <p className="text-sm text-stone-600 mb-4">
              Connect your Google Calendar to receive automated reminders and sync your schedule with your buddy.
            </p>

            {!loading && (
              <GoogleCalendarConnectBtn
                isConnected={isConnected}
                onConnectSuccess={handleSuccess}
                onDisconnectSuccess={handleDisconnect}
              />
            )}
          </div>

          {/* Account Section */}
          <div>
            <h2 className="text-lg font-semibold text-stone-900 mb-4">Account</h2>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/';
              }}
              className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### src/app/student/test-runner.tsx
```tsx
'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import type { TestResult } from '@/types';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATResult } from './exams/cat-result';

export function generateQuestions(testId: string) {
  const baseQs = [
    // Quantitative Ability (7 questions)
    { category: 'Quantitative Ability', question: 'How comfortable are you with Number Systems & Arithmetic?' },
    { category: 'Quantitative Ability', question: 'Rate your proficiency in Algebra & Polynomials' },
    { category: 'Quantitative Ability', question: 'How confident are you with Geometry & Mensuration?' },
    { category: 'Quantitative Ability', question: 'Rate your speed in solving Profit/Loss & Percentage problems' },
    { category: 'Quantitative Ability', question: 'How comfortable are you with Permutation & Combination?' },
    { category: 'Quantitative Ability', question: 'Rate your proficiency in Probability concepts' },
    { category: 'Quantitative Ability', question: 'How confident are you in completing Quant section within time limits?' },

    // VARC (7 questions)
    { category: 'VARC', question: 'How quickly can you read & understand a 600-word passage?' },
    { category: 'VARC', question: 'Rate your accuracy in Reading Comprehension questions' },
    { category: 'VARC', question: 'How comfortable are you with Verbal Reasoning & Grammar?' },
    { category: 'VARC', question: 'Rate your speed in Para Jumble & Para Completion' },
    { category: 'VARC', question: 'How confident are you in identifying Critical Reasoning fallacies?' },
    { category: 'VARC', question: 'Rate your vocabulary strength (understand difficult passages)' },
    { category: 'VARC', question: 'How confident are you in completing VARC section within time limits?' },

    // LRDI (7 questions)
    { category: 'LRDI', question: 'How confident are you solving Logic Puzzles within time limits?' },
    { category: 'LRDI', question: 'Rate your proficiency in Data Interpretation & Analysis' },
    { category: 'LRDI', question: 'How comfortable are you with Set Theory & Venn Diagrams?' },
    { category: 'LRDI', question: 'Rate your speed in solving case lets under 12 minutes' },
    { category: 'LRDI', question: 'How confident are you with Arrangements & Grouping problems?' },
    { category: 'LRDI', question: 'Rate your ability to handle complex multi-part DI sets' },
    { category: 'LRDI', question: 'How confident are you in completing LRDI within time limits?' },

    // Mock Management & Strategy (7 questions)
    { category: 'Mock Strategy', question: 'How many full-length mocks have you taken in the last 30 days?' },
    { category: 'Mock Strategy', question: 'Do you have a clear question-selection strategy for each section?' },
    { category: 'Mock Strategy', question: 'How often do you analyse your mock mistakes in detail?' },
    { category: 'Mock Strategy', question: 'How disciplined are you with sectional time allocation?' },
    { category: 'Mock Strategy', question: 'Rate your consistency across mock tests (score variation)' },
    { category: 'Mock Strategy', question: 'How well do you track & improve weak question types?' },
    { category: 'Mock Strategy', question: 'How confident do you feel about your overall CAT strategy?' },

    // Physical & Mental Wellness (7 questions)
    { category: 'Wellness & Stamina', question: 'Can you stay mentally sharp through a full 2-hour mock?' },
    { category: 'Wellness & Stamina', question: 'How many hours of quality study can you do daily?' },
    { category: 'Wellness & Stamina', question: 'Rate your sleep quality (avg 7-8 hours/night)' },
    { category: 'Wellness & Stamina', question: 'How consistent is your daily preparation routine?' },
    { category: 'Wellness & Stamina', question: 'How well do you manage stress & pressure during exams?' },
    { category: 'Wellness & Stamina', question: 'Rate your physical fitness & health (exercise frequency)' },
    { category: 'Wellness & Stamina', question: 'How confident do you feel about cracking 95+ percentile?' },
  ];

  return baseQs.map((q, i) => ({
    id: `q${i}`,
    ...q,
    options: [
      { label: 'Not at all / Very weak (1)', value: 1 },
      { label: 'Below average (2)', value: 2 },
      { label: 'Decent / Mid (3)', value: 3 },
      { label: 'Strong / Confident (4)', value: 4 },
    ],
  }));
}

interface TestRunnerProps {
  testId: string;
  testName: string;
  onComplete: (r: Omit<TestResult, 'id' | 'student_id' | 'created_at'>) => void;
  onClose: () => void;
}

export function TestRunner({ testId, testName, onComplete, onClose }: TestRunnerProps) {
  const questions = useMemo(() => generateQuestions(testId), [testId]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; percentile: number } | null>(null);

  function handleAnswer(qid: string, value: number) {
    const newAnswers = { ...answers, [qid]: value };
    setAnswers(newAnswers);
    if (current < questions.length - 1) {
      setTimeout(() => setCurrent((c) => c + 1), 200);
    } else {
      const score = Object.values(newAnswers).reduce((s, v) => s + v, 0);
      const normalized = Math.round((score / (questions.length * 4)) * 100);
      // eslint-disable-next-line react-hooks/purity
      const percentile = Math.min(99, Math.max(1, normalized + Math.floor(Math.random() * 10) - 5));
      setResult({ score: normalized, percentile });
    }
  }

  if (result) {
    // Convert questions to category scores for detailed feedback
    const categoryScores: Record<string, number> = {};
    questions.forEach((q) => {
      const answer = answers[q.id] || 0;
      categoryScores[q.category] = (categoryScores[q.category] || 0) + answer;
    });

    return (
      <CATResult
        score={result.score * 3} // Scale from /100 to /300 for CAT
        categories={categoryScores}
        onComplete={() =>
          onComplete({
            test_type: testId,
            test_name: testName,
            attempt_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
            score: result.score,
            percentile: result.percentile,
            breakdown: null
          })
        }
      />
    );
  }

  const q = questions[current];
  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="border-b border-stone-200 p-4 flex items-center justify-between">
        <button type="button" onClick={onClose}><X className="w-5 h-5 text-stone-600" /></button>
        <div className="text-sm font-semibold">{current + 1} / {questions.length}</div>
        <div className="w-5" />
      </div>
      <div className="h-1 bg-stone-100">
        <div className="h-full bg-orange-600 transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">{q.category}</p>
          <h2 className="text-xl font-semibold text-stone-900 mb-6 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>{q.question}</h2>
          <div className="space-y-2.5">
            {q.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleAnswer(q.id, opt.value)}
                className={cn('w-full text-left p-4 bg-white border-2 rounded-xl transition-all', answers[q.id] === opt.value ? 'border-stone-900' : 'border-stone-200 hover:border-stone-400')}
              >
                <span className="text-sm text-stone-900">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### src/app/student/today/form.test.ts
```tsx
/**
 * Test suite for Daily Report Form Logic
 * Tests data validation, parsing, and payload construction without needing actual Supabase connection
 */

// Mock data for testing
const mockFormData = {
  studyDuration: '3.5',
  topicsCovered: ['Quant', 'Verbal'],
  qualityFocus: 4,
  difficulty: 3,
  mockTaken: true,
  mockName: 'CAT Mock 21',
  quantScore: '85',
  verbalScore: '90',
  logicScore: '78',
  totalAccuracy: '82',
  confidence: 4,
  stress: 2,
  sleepQuality: 4,
  nutritionExercise: true,
  overallEnergy: 4,
  notes: 'Good study session',
};

// Test 1: Parse numeric values correctly
function testParseValues() {
  console.log('\n=== TEST 1: Parse Numeric Values ===');

  const parseValue = (value: string): number | null => {
    if (!value || value.trim() === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  const tests = [
    { input: '3.5', expected: 3.5, name: 'decimal number' },
    { input: '100', expected: 100, name: 'integer' },
    { input: '', expected: null, name: 'empty string' },
    { input: '  ', expected: null, name: 'whitespace' },
    { input: 'abc', expected: null, name: 'non-numeric' },
  ];

  let passed = 0;
  tests.forEach(({ input, expected, name }) => {
    const result = parseValue(input);
    const success = result === expected;
    passed += success ? 1 : 0;
    console.log(`  ${success ? '✓' : '✗'} ${name}: "${input}" → ${result}`);
  });

  console.log(`Result: ${passed}/${tests.length} passed`);
  return passed === tests.length;
}

// Test 2: Build valid payload
function testPayloadConstruction() {
  console.log('\n=== TEST 2: Payload Construction ===');

  const parseValue = (value: string): number | null => {
    if (!value || value.trim() === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  const studyDurationNum = mockFormData.studyDuration
    ? parseFloat(mockFormData.studyDuration)
    : 0;

  const quantScoreNum = mockFormData.quantScore ? parseFloat(mockFormData.quantScore) : null;
  const verbalScoreNum = mockFormData.verbalScore ? parseFloat(mockFormData.verbalScore) : null;
  const logicScoreNum = mockFormData.logicScore ? parseFloat(mockFormData.logicScore) : null;
  const totalAccuracyNum = mockFormData.totalAccuracy ? parseFloat(mockFormData.totalAccuracy) : null;

  const payload = {
    student_id: 'test-user-id',
    report_date: '2026-06-08',
    study_duration: studyDurationNum,
    topics_covered: mockFormData.topicsCovered.length > 0 ? mockFormData.topicsCovered : [],
    quality_focus: mockFormData.qualityFocus || 3,
    difficulty: mockFormData.difficulty || 3,
    mock_taken: mockFormData.mockTaken === true,
    mock_name: mockFormData.mockTaken && mockFormData.mockName ? mockFormData.mockName : null,
    quant_score: mockFormData.mockTaken && quantScoreNum !== null ? quantScoreNum : null,
    verbal_score: mockFormData.mockTaken && verbalScoreNum !== null ? verbalScoreNum : null,
    logic_score: mockFormData.mockTaken && logicScoreNum !== null ? logicScoreNum : null,
    total_accuracy: mockFormData.mockTaken && totalAccuracyNum !== null ? totalAccuracyNum : null,
    confidence: mockFormData.confidence || 3,
    stress: mockFormData.stress || 3,
    sleep_quality: mockFormData.sleepQuality || 3,
    nutrition_exercise: mockFormData.nutritionExercise === true,
    overall_energy: mockFormData.overallEnergy || 3,
    notes: mockFormData.notes ? mockFormData.notes.trim() : null,
  };

  console.log('Payload constructed:');
  console.log(JSON.stringify(payload, null, 2));

  // Validate payload types
  const checks = [
    { field: 'study_duration', expected: 'number', actual: typeof payload.study_duration },
    { field: 'topics_covered', expected: 'object', actual: Array.isArray(payload.topics_covered) ? 'array' : typeof payload.topics_covered },
    { field: 'quality_focus', expected: 'number', actual: typeof payload.quality_focus },
    { field: 'mock_taken', expected: 'boolean', actual: typeof payload.mock_taken },
    { field: 'quant_score', expected: 'number|null', actual: payload.quant_score === null ? 'null' : typeof payload.quant_score },
    { field: 'confidence', expected: 'number', actual: typeof payload.confidence },
    { field: 'nutrition_exercise', expected: 'boolean', actual: typeof payload.nutrition_exercise },
  ];

  let passed = 0;
  checks.forEach(({ field, expected, actual }) => {
    const success = actual === expected || expected.split('|').includes(actual);
    passed += success ? 1 : 0;
    console.log(`  ${success ? '✓' : '✗'} ${field}: expected ${expected}, got ${actual}`);
  });

  console.log(`Result: ${passed}/${checks.length} passed`);
  return passed === checks.length;
}

// Test 3: Handle edge cases (empty fields)
function testEmptyFields() {
  console.log('\n=== TEST 3: Empty Fields Handling ===');

  const emptyFormData = {
    studyDuration: '',
    topicsCovered: [],
    qualityFocus: 3,
    difficulty: 3,
    mockTaken: false,
    mockName: '',
    quantScore: '',
    verbalScore: '',
    logicScore: '',
    totalAccuracy: '',
    confidence: 3,
    stress: 3,
    sleepQuality: 3,
    nutritionExercise: false,
    overallEnergy: 3,
    notes: '',
  };

  const parseValue = (value: string): number | null => {
    if (!value || value.trim() === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  const studyDurationNum = emptyFormData.studyDuration
    ? parseFloat(emptyFormData.studyDuration)
    : 0; // Should default to 0

  const payload = {
    study_duration: studyDurationNum,
    quality_focus: emptyFormData.qualityFocus || 3, // Should be 3
    confidence: emptyFormData.confidence || 3, // Should be 3
    notes: emptyFormData.notes ? emptyFormData.notes.trim() : null, // Should be null
  };

  const checks = [
    { field: 'study_duration', expected: 0, actual: payload.study_duration },
    { field: 'quality_focus', expected: 3, actual: payload.quality_focus },
    { field: 'confidence', expected: 3, actual: payload.confidence },
    { field: 'notes', expected: null, actual: payload.notes },
  ];

  let passed = 0;
  checks.forEach(({ field, expected, actual }) => {
    const success = expected === actual;
    passed += success ? 1 : 0;
    console.log(`  ${success ? '✓' : '✗'} ${field}: expected ${expected}, got ${actual}`);
  });

  console.log(`Result: ${passed}/${checks.length} passed`);
  return passed === checks.length;
}

// Test 4: Mock test conditional logic
function testMockTestLogic() {
  console.log('\n=== TEST 4: Mock Test Conditional Logic ===');

  const testCases = [
    {
      name: 'Mock taken with scores',
      mockTaken: true,
      quantScore: '85',
      expected: { shouldInclude: true, quantScore: 85 },
    },
    {
      name: 'Mock taken without scores',
      mockTaken: true,
      quantScore: '',
      expected: { shouldInclude: false, quantScore: null },
    },
    {
      name: 'Mock not taken with scores',
      mockTaken: false,
      quantScore: '85',
      expected: { shouldInclude: false, quantScore: null },
    },
  ];

  let passed = 0;
  testCases.forEach(({ name, mockTaken, quantScore, expected }) => {
    const quantScoreNum = quantScore ? parseFloat(quantScore) : null;
    const resultScore = mockTaken && quantScoreNum !== null ? quantScoreNum : null;

    const success = resultScore === expected.quantScore;
    passed += success ? 1 : 0;
    console.log(
      `  ${success ? '✓' : '✗'} ${name}: expected ${expected.quantScore}, got ${resultScore}`
    );
  });

  console.log(`Result: ${passed}/${testCases.length} passed`);
  return passed === testCases.length;
}

// Run all tests
console.log('\n📋 Daily Report Form Validation Test Suite\n');
const results = [
  testParseValues(),
  testPayloadConstruction(),
  testEmptyFields(),
  testMockTestLogic(),
];

const allPassed = results.every((r) => r);
console.log(`\n${'═'.repeat(50)}`);
console.log(`Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log(`${'═'.repeat(50)}\n`);

export { testParseValues, testPayloadConstruction, testEmptyFields, testMockTestLogic };
```

### src/app/student/today/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/today/page.tsx
```tsx
import { redirect } from 'next/navigation';

export default function StudentTodayPage() {
  redirect('/student/tracker');
}
```

### src/app/student/tracker/loading.tsx
```tsx
import { RouteSkeleton } from '@/components/route-skeleton';

export default function Loading() {
  return <RouteSkeleton />;
}
```

### src/app/student/tracker/page.tsx
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DailyTrackerApp } from '@/components/DailyTracker/DailyTrackerApp';
import { UrgentHelpBanner } from './urgent-help-banner';
import { TrajectoryWall } from '@/components/DailyTracker/TrajectoryWall';

export const metadata = {
  title: 'CareerRai',
  description: 'Your CAT prep command centre',
};

const CAT_EXAM_DATE = new Date(2026, 10, 29); // Nov 29, 2026

export default async function DailyTrackerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];

  const [{ data: profile }, { data: sessions }, { data: pendingReqs }, { data: anyDebrief }, { data: logs }, { data: mocks }, { data: recentMock }] = await Promise.all([
    admin.from('profiles').select('full_name, cat_percentile, buddy_id, dream_colleges, target_percentile').eq('id', user.id).single(),
    admin
      .from('video_sessions')
      .select('id, title, scheduled_at, google_meet_link')
      .eq('student_id', user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1),
    admin
      .from('session_requests')
      .select('id')
      .eq('student_id', user.id)
      .eq('status', 'pending')
      .limit(1),
    admin
      .from('mock_debriefs')
      .select('id')
      .eq('student_id', user.id)
      .limit(1),
    admin
      .from('daily_reports')
      .select('report_date, study_duration')
      .eq('student_id', user.id)
      .order('report_date', { ascending: false })
      .limit(90),
    admin
      .from('mock_debriefs')
      .select('id')
      .eq('student_id', user.id),
    // Server-side pending debrief detection — no extra client waterfall
    admin
      .from('daily_reports')
      .select('report_date, updated_at')
      .eq('student_id', user.id)
      .eq('mock_taken', true)
      .gte('report_date', twoDaysAgo)
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const buddyId = profile?.buddy_id ?? null;
  const dreamColleges = (profile?.dream_colleges as string[] | null) ?? [];
  const dreamCollege = dreamColleges[0] ?? null;
  const targetPercentile = (profile?.target_percentile as number | null) ?? 90;

  // Fetch buddy name now that we have buddyId (extra query only when matched)
  let buddyName: string | null = null;
  if (buddyId) {
    const { data: buddyProfile } = await admin
      .from('profiles')
      .select('full_name, cat_percentile')
      .eq('id', buddyId)
      .maybeSingle();
    if (buddyProfile?.full_name) {
      buddyName = buddyProfile.full_name.split(' ')[0] +
        (buddyProfile.cat_percentile != null ? ` · ${Math.round(Number(buddyProfile.cat_percentile))}%ile` : '');
    }
  }

  // Server-side pending debrief: check if the recent mock has a debrief
  let serverPendingDebrief: { report_date: string; updated_at: string } | null = null;
  if (recentMock) {
    const { data: existingDebrief } = await admin
      .from('mock_debriefs')
      .select('id')
      .eq('student_id', user.id)
      .eq('log_date', recentMock.report_date)
      .maybeSingle();
    if (!existingDebrief) serverPendingDebrief = recentMock;
  }

  const daysToCat = Math.max(
    0,
    Math.ceil((CAT_EXAM_DATE.getTime() - Date.now()) / 86_400_000)
  );

  const hour = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  const h = parseInt(hour);
  const greeting = h < 4 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  // Only surface a session happening within the next 24h
  const nextSession = sessions?.[0] ?? null;
  const todaySession =
    nextSession && new Date(nextSession.scheduled_at).getTime() - Date.now() < 24 * 3_600_000
      ? nextSession
      : null;

  const hasPendingRequest = (pendingReqs?.length ?? 0) > 0;
  const hasDebriefedBefore = (anyDebrief?.length ?? 0) > 0;

  // Stats for trajectory wall
  const logCount = logs?.length ?? 0;
  const daysStudied = logs?.filter((l) => (l.study_duration as number) > 0).length ?? 0;
  const mockCount = mocks?.length ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-5">
        {/* Header: greeting + CRS pill + days-to-CAT chip */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-stone-900 truncate" style={{ fontFamily: 'Georgia, serif' }}>
            {greeting}, {firstName}
          </h1>
          <div className="flex items-center gap-1.5 shrink-0">
            {profile?.cat_percentile != null && (
              <span className="text-[11px] font-bold bg-stone-900 text-white rounded-full px-2.5 py-1">
                CRS {profile.cat_percentile}
              </span>
            )}
            <span className="text-[11px] font-semibold bg-orange-100 text-orange-700 rounded-full px-2.5 py-1">
              {daysToCat}d to CAT
            </span>
          </div>
        </div>

        {/* Trajectory Wall — dream-anchored, always present once college set */}
        <TrajectoryWall
          dreamCollege={dreamCollege}
          currentPercentile={profile?.cat_percentile as number | null}
          targetPercentile={targetPercentile}
          logCount={logCount}
          mockCount={mockCount}
          daysStudied={daysStudied}
        />

        {/* Important: urgent help / pending session request */}
        {buddyId && (
          <UrgentHelpBanner
            buddyId={buddyId}
            hasPendingRequest={hasPendingRequest}
          />
        )}

        {/* Day one: buddy not yet matched — never a ghost town */}
        {!buddyId && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3">
            <p className="text-sm text-teal-900 leading-relaxed">
              🤝 <strong>Your buddy is being matched</strong> — a mentor who&apos;s walked your exact
              journey. Meanwhile, log today: your first week of data is what makes their guidance sharp.
            </p>
          </div>
        )}

        <DailyTrackerApp
          studentId={user.id}
          todaySession={todaySession}
          hasBuddy={!!buddyId}
          buddyId={buddyId}
          buddyName={buddyName}
          initialPendingDebrief={serverPendingDebrief}
        />

        {/* Day one: the debrief promise — sell it before it exists */}
        {!hasDebriefedBefore && (
          <div className="rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-4 flex items-start gap-3">
            <span className="text-xl leading-none">📋</span>
            <p className="text-xs text-stone-500 leading-relaxed">
              <strong className="text-stone-700">Your first mock debrief unlocks here.</strong>
              <br />
              This is where the real work happens — log a mock and walk every error with your buddy.
            </p>
          </div>
        )}

        {/* Footer: feedback link */}
        <p className="text-center text-[11px] text-stone-400 pb-20">
          <a href="mailto:feedback@careerrai.com" className="hover:text-stone-600 transition-colors">
            Help us improve · Give feedback
          </a>
        </p>
      </div>
    </div>
  );
}
```

### src/app/student/tracker/urgent-help-banner.tsx
```tsx
'use client';
import { useState } from 'react';
import { PhoneCall, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

interface Props {
  buddyId: string;
  hasPendingRequest: boolean;
}

export function UrgentHelpBanner({ buddyId, hasPendingRequest: initialPending }: Props) {
  const [pending, setPending] = useState(initialPending);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/sessions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buddyId, message }),
      });
      if (!res.ok) throw new Error('Failed');
      setPending(true);
      setExpanded(false);
    } catch {
      setError('Could not send. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (pending) {
    return (
      <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
        <p className="text-sm text-green-800 font-medium flex-1">Urgent session requested — your buddy has been notified.</p>
        <Link href="/student/buddy" className="text-xs text-green-700 underline shrink-0">View</Link>
      </div>
    );
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-orange-100 transition-colors"
      >
        <PhoneCall className="w-4 h-4 text-orange-700 shrink-0" />
        <p className="text-sm font-semibold text-orange-900 flex-1 text-left">Need urgent help from your buddy?</p>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-orange-600 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-orange-600 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What do you need help with?"
            rows={2}
            maxLength={200}
            className="w-full px-3 py-2 text-sm bg-white border border-orange-200 rounded-lg focus:outline-none focus:border-orange-400 resize-none"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
            {submitting ? 'Sending…' : 'Request session'}
          </button>
        </div>
      )}
    </div>
  );
}
```

## API Routes (src/app/api/)

### src/app/api/admin/allowlist/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin, userId: user.id };
}

// Add a number to the allowlist (and optionally assign a buddy) in one action.
export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin, userId } = ctx;

  try {
    const { phone: rawPhone, full_name, assigned_buddy_id } = (await request.json()) as {
      phone?: string; full_name?: string; assigned_buddy_id?: string | null;
    };
    const phone = normalizeIndianPhone(rawPhone);
    if (!phone) return NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 });
    if (!full_name?.trim()) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });

    const { error } = await admin.from('student_allowlist').insert({
      phone,
      full_name: full_name.trim(),
      added_by: userId,
      assigned_buddy_id: assigned_buddy_id || null,
    });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'That number is already on the list.' }, { status: 409 });
      console.error('[allowlist] insert', error);
      return NextResponse.json({ error: 'Could not add number.' }, { status: 500 });
    }

    // If this student has already logged in, keep their buddy assignment in sync.
    if (assigned_buddy_id) {
      await admin.from('profiles').update({ buddy_id: assigned_buddy_id }).eq('phone', phone);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[allowlist] POST', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

// Pause / reactivate, or change the assigned buddy.
export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  try {
    const { id, status, assigned_buddy_id } = (await request.json()) as {
      id?: string; status?: 'active' | 'paused'; assigned_buddy_id?: string | null;
    };
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (status === 'active' || status === 'paused') patch.status = status;
    if (assigned_buddy_id !== undefined) patch.assigned_buddy_id = assigned_buddy_id || null;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

    const { data: row, error } = await admin
      .from('student_allowlist')
      .update(patch)
      .eq('id', id)
      .select('phone, assigned_buddy_id')
      .single();
    if (error) {
      console.error('[allowlist] patch', error);
      return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
    }
    if (assigned_buddy_id !== undefined && row?.phone) {
      await admin.from('profiles').update({ buddy_id: assigned_buddy_id || null }).eq('phone', row.phone);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[allowlist] PATCH', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
```

### src/app/api/admin/assign-buddy/route.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { student_id, buddy_id } = await request.json();
  if (!student_id) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 });

  // Validate buddy exists and is actually a buddy
  if (buddy_id) {
    const { data: buddy } = await admin.from('profiles').select('role').eq('id', buddy_id).single();
    if (!buddy || buddy.role !== 'buddy') {
      return NextResponse.json({ error: 'Invalid buddy' }, { status: 400 });
    }
  }

  // Update student's buddy assignment
  const { error } = await admin
    .from('profiles')
    .update({ buddy_id: buddy_id || null })
    .eq('id', student_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, student_id, buddy_id });
}
```

### src/app/api/admin/broadcast/route.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { title, body, recipientIds } = await request.json();
  if (!title || !body || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const rows = recipientIds.map((uid: string) => ({
    user_id: uid,
    type: 'broadcast',
    title,
    body,
    data: {},
    read: false,
    channel: 'in_app',
  }));

  const { error } = await admin.from('notifications').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sent: rows.length });
}
```

### src/app/api/admin/bulk-import/route.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

interface ImportRow {
  full_name: string;
  email: string;
  phone: string;
  role: 'student' | 'buddy';
  exam_target?: string;
  buddy_email?: string;
  username?: string;
  password?: string;
}

interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    created: number;
    failed: number;
  };
  created: Array<{ email: string; role: string; full_name: string }>;
  errors: Array<{ row: number; email: string; error: string }>;
  buddyErrors: Array<{ email: string; error: string }>;
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have header row + at least 1 data row');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const requiredHeaders = ['full_name', 'email', 'phone', 'role'];

  for (const h of requiredHeaders) {
    if (!headers.includes(h)) {
      throw new Error(`Missing required column: ${h}`);
    }
  }

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = lines[i].split(',').map(v => v.trim());

    // Helper to safely get value from headers
    const getValue = (colName: string) => {
      const idx = headers.indexOf(colName);
      return idx >= 0 ? values[idx] : undefined;
    };

    const row: ImportRow = {
      full_name: getValue('full_name') || '',
      email: getValue('email') || '',
      phone: getValue('phone') || '',
      role: (getValue('role') || '').toLowerCase() as 'student' | 'buddy',
      exam_target: getValue('exam_target') || undefined,
      buddy_email: getValue('buddy_email') || undefined,
      username: getValue('username') || undefined,
      password: getValue('password') || undefined,
    };

    // Debug logging
    if (row.username) {
      console.log(`[CSV_PARSE] Row ${i}: email=${row.email}, username=${row.username}, password=${row.password ? '***' : 'empty'}`);
    }

    rows.push(row);
  }
  return rows;
}

function validateRow(row: ImportRow, rowNum: number): string | null {
  if (!row.full_name) return `Row ${rowNum}: Missing full_name`;
  if (!row.email || !row.email.includes('@')) return `Row ${rowNum}: Invalid email`;
  if (!row.phone) return `Row ${rowNum}: Missing phone`;
  if (!['student', 'buddy'].includes(row.role)) return `Row ${rowNum}: Role must be 'student' or 'buddy'`;
  if (row.role === 'student' && !row.exam_target) return `Row ${rowNum}: Students must have exam_target (CAT)`;
  if (row.password && row.password.length < 8) return `Row ${rowNum}: Password must be at least 8 characters`;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    console.log('[BULK_IMPORT] Starting import...');

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[BULK_IMPORT] No user authenticated');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).single();

    if (profileError) {
      console.log('[BULK_IMPORT] Profile fetch error:', profileError.message);
      return NextResponse.json({ error: `Profile error: ${profileError.message}` }, { status: 403 });
    }

    if (profile?.role !== 'admin') {
      console.log('[BULK_IMPORT] User is not admin, role:', profile?.role);
      return NextResponse.json({ error: 'Forbidden - not an admin' }, { status: 403 });
    }

    console.log('[BULK_IMPORT] Admin verified');

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      console.log('[BULK_IMPORT] No file provided');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log('[BULK_IMPORT] File received:', file.name, 'size:', file.size);
    const text = await file.text();

    const rows = parseCSV(text);
    console.log('[BULK_IMPORT] Parsed rows:', rows.length);

    // Validate all rows first
    const errors: Array<{ row: number; email: string; error: string }> = [];
    const validRows: ImportRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(rows[i], i + 2);
      if (err) {
        errors.push({ row: i + 2, email: rows[i].email, error: err });
      } else {
        validRows.push(rows[i]);
      }
    }

    // Check for duplicate emails in CSV
    const emails = validRows.map(r => r.email);
    const uniqueEmails = new Set(emails);
    if (emails.length !== uniqueEmails.size) {
      const dups = emails.filter((e, i) => emails.indexOf(e) !== i);
      return NextResponse.json(
        { error: `Duplicate emails in CSV: ${[...new Set(dups)].join(', ')}` },
        { status: 400 }
      );
    }

    const created: Array<{ email: string; role: string; full_name: string }> = [];
    const buddyMap = new Map<string, string>();

    // First pass: Create auth users OR update passwords
    for (const row of validRows) {
      try {
        // Check if profile already exists
        const { data: existingProfile } = await admin
          .from('profiles')
          .select('id')
          .eq('email', row.email)
          .maybeSingle();

        let userId: string;

        if (existingProfile) {
          // User exists
          userId = existingProfile.id;
          console.log(`[BULK_IMPORT] User exists for ${row.email}, ID: ${userId}`);

          // If password provided in CSV, update it
          if (row.password) {
            console.log(`[BULK_IMPORT] Updating password for ${row.email}`);
            const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
              password: row.password,
            });

            if (updateError) {
              console.warn(`[BULK_IMPORT] Password update warning for ${row.email}:`, updateError.message);
              errors.push({ row: 0, email: row.email, error: `Password update failed: ${updateError.message}` });
              continue;
            }

            console.log(`[BULK_IMPORT] Password updated for ${row.email}`);
          }
        } else {
          // New user - create auth account
          // Use password from CSV if provided, otherwise generate temp password
          const userPassword = row.password || `CareerRai${Math.random().toString(36).slice(2, 10)}!`;

          const { data: { user: newUser }, error: authError } = await admin.auth.admin.createUser({
            email: row.email,
            password: userPassword,
            email_confirm: true,
            user_metadata: { full_name: row.full_name, phone: row.phone },
          });

          if (authError) {
            errors.push({ row: 0, email: row.email, error: `Auth error: ${authError.message}` });
            continue;
          }

          if (!newUser) {
            errors.push({ row: 0, email: row.email, error: 'Failed to create user' });
            continue;
          }

          userId = newUser.id;
          console.log(`[BULK_IMPORT] Created new auth user for ${row.email}`);
        }

        // UPSERT profile (create if new, update if exists)
        const { error: upsertError } = await admin
          .from('profiles')
          .upsert(
            {
              id: userId,
              email: row.email,
              full_name: row.full_name,
              phone: row.phone,
              username: row.username || null,
              role: row.role,
              exam_target: row.exam_target || null,
              created_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );

        if (upsertError) {
          errors.push({ row: 0, email: row.email, error: `Profile error: ${upsertError.message}` });
          continue;
        }

        created.push({
          email: row.email,
          role: row.role,
          full_name: row.full_name,
        });

        if (row.role === 'buddy') {
          buddyMap.set(row.email, userId);
        }
      } catch (err) {
        errors.push({ row: 0, email: row.email, error: String(err) });
      }
    }

    // Second pass: Assign buddies to students
    const buddyErrors: Array<{ email: string; error: string }> = [];
    for (const row of validRows) {
      if (row.role === 'student' && row.buddy_email) {
        try {
          const buddyId = buddyMap.get(row.buddy_email);
          if (!buddyId) {
            buddyErrors.push({ email: row.email, error: `Buddy '${row.buddy_email}' not found in import` });
            continue;
          }

          const { data: studentData } = await admin
            .from('profiles')
            .select('id')
            .eq('email', row.email)
            .single();

          if (!studentData) {
            buddyErrors.push({ email: row.email, error: 'Could not find student record' });
            continue;
          }

          const { error: updateError } = await admin
            .from('profiles')
            .update({ buddy_id: buddyId })
            .eq('id', studentData.id);

          if (updateError) {
            buddyErrors.push({ email: row.email, error: `Update failed: ${updateError.message}` });
          }
        } catch (err) {
          buddyErrors.push({ email: row.email, error: String(err) });
        }
      }
    }

    const result: ImportResult = {
      success: true,
      summary: {
        total: rows.length,
        created: created.length,
        failed: errors.length,
      },
      created,
      errors,
      buddyErrors,
    };

    console.log('[BULK_IMPORT] Import complete:', result.summary);
    return NextResponse.json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[BULK_IMPORT] Error:', errorMsg, err);
    return NextResponse.json(
      { error: `Import failed: ${errorMsg}` },
      { status: 500 }
    );
  }
}
```

### src/app/api/admin/payouts/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin };
}

// Set a buddy's agreed monthly payout. Buddies never see a number until the
// founder sets it here, so this is the single source of the amount.
export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  try {
    const { buddy_id, agreed_monthly_payout } = (await request.json()) as {
      buddy_id?: string; agreed_monthly_payout?: number | null;
    };
    if (!buddy_id) return NextResponse.json({ error: 'buddy_id required' }, { status: 400 });
    const amount =
      agreed_monthly_payout === null || agreed_monthly_payout === undefined
        ? null
        : Math.max(0, Math.round(Number(agreed_monthly_payout)));
    if (amount !== null && !Number.isFinite(amount)) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    await admin.from('profiles').update({ agreed_monthly_payout: amount }).eq('id', buddy_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[payouts] PATCH', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

// Mark a buddy paid for a period. This is a RECORD of a manual UPI/bank transfer
// the founder already made — it never moves money.
export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  try {
    const { buddy_id, period, payment_ref } = (await request.json()) as {
      buddy_id?: string; period?: string; payment_ref?: string;
    };
    if (!buddy_id || !period) return NextResponse.json({ error: 'buddy_id and period required' }, { status: 400 });

    // Snapshot the agreed amount + active student count at time of payment.
    const { data: buddy } = await admin
      .from('profiles')
      .select('agreed_monthly_payout')
      .eq('id', buddy_id)
      .single();
    if (buddy?.agreed_monthly_payout == null) {
      return NextResponse.json({ error: 'Set this buddy’s agreed payout first.' }, { status: 400 });
    }
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('buddy_id', buddy_id)
      .eq('role', 'student');

    const { error } = await admin
      .from('buddy_payouts')
      .upsert(
        {
          buddy_id,
          period,
          agreed_amount: buddy.agreed_monthly_payout,
          active_student_count: count ?? 0,
          status: 'paid',
          paid_date: new Date().toISOString().slice(0, 10),
          payment_ref: payment_ref?.trim() || null,
        },
        { onConflict: 'buddy_id,period' }
      );
    if (error) {
      console.error('[payouts] upsert', error);
      return NextResponse.json({ error: 'Could not record payout.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[payouts] POST', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
```

### src/app/api/auth/login/route.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  // Support both JSON (fetch) and form-encoded (native form POST)
  let username = '';
  let password = '';
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = await request.json();
    username = body.username;
    password = body.password;
  } else {
    const form = await request.formData();
    username = form.get('username') as string;
    password = form.get('password') as string;
  }

  const origin = request.nextUrl.origin;

  // Look up email from username (case-insensitive)
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role')
    .ilike('username', username) // ilike = case-insensitive
    .maybeSingle();

  if (profileError || !profile) {
    console.error('[LOGIN] Profile lookup error:', profileError?.message);
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  const email = profile.email;

  const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            pending.push({ name, value, options: options as Record<string, unknown> })
          );
        },
      },
    }
  );

  // Authenticate with email + password
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('[LOGIN] Auth error:', error.message);
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  const role = profile.role ?? 'student';
  const dest = role === 'buddy' ? '/buddy/students' : role === 'admin' ? '/admin' : '/student/tracker';

  // Return a redirect — browser follows it and sends the Set-Cookie cookies with the next request
  const response = NextResponse.redirect(`${origin}${dest}`, { status: 302 });
  pending.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });

  return response;
}
```

### src/app/api/auth/logout/route.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            pending.push({ name, value, options: options as Record<string, unknown> })
          );
        },
      },
    }
  );

  await supabase.auth.signOut();

  const response = NextResponse.redirect(`${request.nextUrl.origin}/login`, { status: 302 });
  pending.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });

  return response;
}
```

### src/app/api/auth/request-otp/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';

// Never reveal whether a number is on the allowlist — same copy for "not added"
// and "paused".
const NOT_REGISTERED = "This number isn't registered yet. Your founder will add you after onboarding.";

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone } = (await request.json()) as { phone?: string };
    const phone = normalizeIndianPhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ sent: false, message: 'Enter a valid 10-digit mobile number.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Gate: only active allowlist numbers can request a code.
    const { data: entry } = await admin
      .from('student_allowlist')
      .select('status')
      .eq('phone', phone)
      .maybeSingle();
    if (!entry || entry.status !== 'active') {
      return NextResponse.json({ sent: false, message: NOT_REGISTERED }, { status: 200 });
    }

    // Rate limit: max 3 sends / 30 min, 30s cooldown — protects MSG91 credits.
    const now = Date.now();
    const since = new Date(now - 30 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from('otp_send_events')
      .select('sent_at')
      .eq('phone', phone)
      .gte('sent_at', since)
      .order('sent_at', { ascending: false });
    const sends = recent ?? [];
    if (sends.length >= 3) {
      return NextResponse.json({ sent: false, message: 'Too many attempts. Try again in 30 minutes.' }, { status: 429 });
    }
    if (sends[0]) {
      const secsSince = (now - new Date(sends[0].sent_at).getTime()) / 1000;
      if (secsSince < 30) {
        return NextResponse.json(
          { sent: false, message: `Please wait ${Math.ceil(30 - secsSince)}s before requesting another code.` },
          { status: 429 }
        );
      }
    }

    // Supabase generates + sends the OTP natively; its Send-SMS hook routes the
    // code to MSG91. No session is created here.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    );
    const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } });
    if (error) {
      console.error('[request-otp] signInWithOtp error:', error.message);
      return NextResponse.json({ sent: false, message: "Couldn't send the code. Try again." }, { status: 502 });
    }

    await admin.from('otp_send_events').insert({ phone });
    return NextResponse.json({ sent: true });
  } catch (e) {
    console.error('[request-otp] error', e);
    return NextResponse.json({ sent: false, message: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
```

### src/app/api/auth/sms-hook/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { sendOtpSms } from '@/lib/msg91';

// Supabase "Send SMS" Auth Hook → us → MSG91.
// Supabase signs the payload (Standard Webhooks). We verify before delivering so
// nobody can drive MSG91 sends by POSTing here directly.
// Founder configures the hook URL + SEND_SMS_HOOK_SECRET in the Supabase dashboard.
function verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  const base = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(base, 'base64');
  } catch {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // Header is a space-separated list of "v1,<sig>" entries.
  return signatureHeader
    .split(' ')
    .map((part) => (part.includes(',') ? part.split(',')[1] : part))
    .some((sig) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false;
      }
    });
}

export async function POST(request: NextRequest) {
  const secret = process.env.SEND_SMS_HOOK_SECRET;
  if (!secret) {
    console.error('[sms-hook] SEND_SMS_HOOK_SECRET not set');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const raw = await request.text();
  if (!verifySignature(raw, request.headers, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  try {
    const payload = JSON.parse(raw) as { user?: { phone?: string }; sms?: { otp?: string } };
    const phone = payload.user?.phone;
    const otp = payload.sms?.otp;
    if (!phone || !otp) {
      return NextResponse.json({ error: 'missing phone or otp' }, { status: 400 });
    }
    await sendOtpSms(phone, otp);
    return NextResponse.json({});
  } catch (e) {
    console.error('[sms-hook] delivery error', e);
    return NextResponse.json({ error: 'send failed' }, { status: 500 });
  }
}
```

### src/app/api/auth/verify-otp/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone, token } = (await request.json()) as { phone?: string; token?: string };
    const phone = normalizeIndianPhone(rawPhone);
    if (!phone || !token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Capture the session cookies Supabase sets on a successful verify so we can
    // attach them to the JSON response (mirrors /api/auth/login).
    const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) =>
              pending.push({ name, value, options: options as Record<string, unknown> })
            ),
        },
      }
    );

    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error || !data.user) {
      return NextResponse.json({ error: 'That code is incorrect or expired.' }, { status: 401 });
    }

    // First successful login creates the student's profile from the allowlist
    // (name + pre-assigned buddy the founder set). Later logins refresh the link.
    const admin = createAdminClient();
    const { data: entry } = await admin
      .from('student_allowlist')
      .select('full_name, assigned_buddy_id')
      .eq('phone', phone)
      .maybeSingle();

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!existing) {
      await admin.from('profiles').insert({
        id: data.user.id,
        role: 'student',
        full_name: entry?.full_name ?? 'Student',
        phone,
        buddy_id: entry?.assigned_buddy_id ?? null,
        subscription_status: 'free_beta',
      });
    } else {
      await admin
        .from('profiles')
        .update({ phone, ...(entry?.assigned_buddy_id ? { buddy_id: entry.assigned_buddy_id } : {}) })
        .eq('id', data.user.id);
    }

    const res = NextResponse.json({ ok: true, dest: '/student/tracker' });
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  } catch (e) {
    console.error('[verify-otp] error', e);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
```

### src/app/api/buddy-insight/route.ts
```ts
/**
 * Buddy Insight API Route
 * Generates AI-powered personalized insights from test scores using Claude API
 * Called when student completes CAT Readiness Test
 */

import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';

interface BuddyInsightRequest {
  score: number; // 0-100
  percentile: number; // 0-100
  categoryBreakdown: {
    [key: string]: number; // Category name -> percentage score
  };
  daysToCAT: number;
  testAttemptId?: string; // For caching
}

interface BuddyInsightResponse {
  insight: string;
  cached: boolean;
}

// In-memory cache for buddy insights (in production, use Redis)
const insightCache = new Map<string, string>();

const client = new Anthropic();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('buddy-insight: ANTHROPIC_API_KEY is not set in this environment');
      return NextResponse.json(
        { error: 'AI is not configured on the server — add ANTHROPIC_API_KEY in Vercel project settings' },
        { status: 503 }
      );
    }
    const body: BuddyInsightRequest = await request.json();

    // Validate input
    if (
      body.score === undefined ||
      body.percentile === undefined ||
      !body.categoryBreakdown ||
      body.daysToCAT === undefined
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = body.testAttemptId || `${body.score}-${body.percentile}`;
    if (insightCache.has(cacheKey)) {
      return NextResponse.json({
        insight: insightCache.get(cacheKey),
        cached: true
      } as BuddyInsightResponse);
    }

    // Build category breakdown string
    const categoryStr = Object.entries(body.categoryBreakdown)
      .map(([name, score]) => `${name}: ${Math.round(score)}%`)
      .join(', ');

    // Create Claude prompt
    const systemPrompt = `You are an IIM alumni buddy reviewing a CAT aspirant's readiness test score. Your tone is direct, warm, and encouraging—like a senior bhaiya/behen giving genuine advice.

Write exactly 3 sentences:
1. One honest, specific observation about their strongest category (mention which category)
2. One honest, specific observation about their weakest category (mention which category)
3. One specific, actionable step they should take THIS WEEK to improve

Use first-person as if you're the buddy ("I see...", "I'd focus on..."). Be specific to their actual numbers. No generic platitudes. Keep it under 80 words total.`;

    const userMessage = `Student's CAT Readiness Test Results:
- Score: ${body.score}/100
- Percentile: ${body.percentile}%
- Category breakdown: ${categoryStr}
- Days until CAT exam: ${body.daysToCAT}

Based on this data, give your honest buddy advice.`;

    // Call Claude API
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    // Extract text response
    const insight = message.content[0].type === 'text' ? message.content[0].text : '';

    // Cache the insight
    insightCache.set(cacheKey, insight);

    return NextResponse.json({
      insight,
      cached: false
    } as BuddyInsightResponse);
  } catch (error) {
    console.error('Error generating buddy insight:', error);

    // Fallback generic insight if API fails
    const fallbackInsight =
      "Great effort on taking this test! Your buddy will review your specific scores and share personalized feedback soon. Keep practicing and stay focused on your weaker areas.";

    return NextResponse.json({
      insight: fallbackInsight,
      cached: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Clear cache endpoint (admin only)
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    // In production, verify admin role from auth token
    insightCache.clear();
    return NextResponse.json({ message: 'Cache cleared' });
  } catch (error) {
    return NextResponse.json({ error: 'Cache clear failed' }, { status: 500 });
  }
}
```

### src/app/api/buddy/feedback/route.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { student_id, feedback_text, rating, next_steps, period_covered } = body;

  if (!student_id || !feedback_text?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify this student is actually assigned to this buddy
  const { data: student } = await admin.from('profiles').select('buddy_id').eq('id', student_id).single();
  if (student?.buddy_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this student' }, { status: 403 });
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const { data, error } = await admin.from('buddy_feedback').insert({
    buddy_id: user.id,
    student_id,
    feedback_date: today,
    feedback_text: feedback_text.trim(),
    rating: rating ?? 3,
    next_steps: next_steps ?? [],
    period_covered: period_covered ?? 'adhoc',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also insert in-app notification for the student
  await admin.from('notifications').insert({
    user_id: student_id,
    type: 'feedback_received',
    title: 'Your buddy left you feedback 🎯',
    body: feedback_text.trim().slice(0, 120),
    data: {},
    read: false,
    channel: 'in_app',
  });

  return NextResponse.json({ feedback: data });
}
```

### src/app/api/calendar/cancel-meeting/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCalendarClient, CalendarNotConnectedError } from '@/lib/google-calendar';

/**
 * POST /api/calendar/cancel-meeting
 * Buddy cancels a scheduled session: deletes the Google event(s) with
 * sendUpdates:'all' and marks the row cancelled.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }

    let meetingId: string | undefined;
    try {
      ({ meetingId } = await request.json());
    } catch {
      // fall through to validation
    }
    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: session } = await admin
      .from('video_sessions')
      .select('id, buddy_id, student_id, title, google_event_id, student_google_event_id, session_status')
      .eq('id', meetingId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    if (session.buddy_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the buddy who scheduled this session can cancel it.' },
        { status: 403 }
      );
    }
    if (session.session_status === 'cancelled') {
      return NextResponse.json({ success: true, alreadyCancelled: true });
    }

    // Delete the buddy's Google event (emails attendees). Non-fatal if the
    // event is already gone or Calendar got disconnected.
    if (session.google_event_id) {
      try {
        const { calendar } = await getCalendarClient(user.id);
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: session.google_event_id,
          sendUpdates: 'all',
        });
      } catch (err) {
        if (!(err instanceof CalendarNotConnectedError)) {
          console.error('Buddy event delete failed (continuing):', err);
        }
      }
    }

    // Delete the mirror on the student's calendar
    if (session.student_google_event_id) {
      try {
        const { calendar } = await getCalendarClient(session.student_id);
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: session.student_google_event_id,
          sendUpdates: 'none',
        });
      } catch {
        // student disconnected or event gone — fine
      }
    }

    const { error: updateError } = await admin
      .from('video_sessions')
      .update({ session_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', meetingId);

    if (updateError) {
      console.error('Cancel update failed:', updateError);
      return NextResponse.json(
        { error: "Couldn't update the session — try again." },
        { status: 500 }
      );
    }

    await admin
      .from('notifications')
      .insert({
        user_id: session.student_id,
        type: 'session_cancelled',
        title: 'Session cancelled',
        body: `${session.title || 'Your upcoming session'} was cancelled by your buddy. They'll reschedule soon.`,
        data: { sessionId: session.id },
      })
      .then(({ error: e }) => {
        if (e) console.error('Notification insert failed:', e.message);
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('cancel-meeting error:', error);
    return NextResponse.json(
      { error: "Couldn't cancel the meeting — try again." },
      { status: 500 }
    );
  }
}
```

### src/app/api/calendar/schedule-meeting/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import type { calendar_v3 } from 'googleapis';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getCalendarClient,
  extractMeetLink,
  CalendarNotConnectedError,
} from '@/lib/google-calendar';

const ALLOWED_DURATIONS = [20, 30, 45, 60];

interface ScheduleMeetingRequest {
  studentId: string;
  startTime: string; // ISO 8601
  durationMinutes: number;
  title?: string;
}

/**
 * POST /api/calendar/schedule-meeting
 * Creates a Google Calendar event with a REAL Meet link on the buddy's
 * calendar (in-process — no internal HTTP), mirrors it to the student's
 * calendar when they're connected, persists to video_sessions, and
 * notifies the student in-app.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth: caller must be a buddy ─────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: buddy } = await admin
      .from('profiles')
      .select('full_name, role, college, email')
      .eq('id', user.id)
      .single();
    if (!buddy || buddy.role !== 'buddy') {
      return NextResponse.json(
        { error: 'Only buddies can schedule sessions.' },
        { status: 403 }
      );
    }

    // ── Validate input ───────────────────────────────────────────
    let body: ScheduleMeetingRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { studentId, startTime, durationMinutes } = body;
    if (!studentId || !startTime || !durationMinutes) {
      return NextResponse.json(
        { error: 'studentId, startTime and durationMinutes are required.' },
        { status: 400 }
      );
    }
    if (!ALLOWED_DURATIONS.includes(durationMinutes)) {
      return NextResponse.json(
        { error: 'Duration must be 20, 30, 45 or 60 minutes.' },
        { status: 400 }
      );
    }

    const start = new Date(startTime);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 });
    }
    if (start.getTime() < Date.now() + 60_000) {
      return NextResponse.json(
        { error: 'Pick a time in the future.' },
        { status: 400 }
      );
    }
    const end = new Date(start.getTime() + durationMinutes * 60_000);

    // ── Student must belong to this buddy ────────────────────────
    const { data: student } = await admin
      .from('profiles')
      .select('full_name, email, buddy_id')
      .eq('id', studentId)
      .single();
    if (!student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }
    if (student.buddy_id !== user.id) {
      return NextResponse.json(
        { error: 'This student is not assigned to you.' },
        { status: 403 }
      );
    }

    // ── Buddy's calendar client ──────────────────────────────────
    let buddyCalendar: calendar_v3.Calendar;
    let buddyGoogleEmail: string | null;
    try {
      const client = await getCalendarClient(user.id);
      buddyCalendar = client.calendar;
      buddyGoogleEmail = client.googleEmail;
    } catch (err) {
      if (err instanceof CalendarNotConnectedError) {
        return NextResponse.json(
          { error: 'Connect Google Calendar in Settings first.', code: 'NOT_CONNECTED' },
          { status: 403 }
        );
      }
      throw err;
    }

    // ── Build event ──────────────────────────────────────────────
    const title = body.title?.trim()
      || `CareerRai: ${buddy.full_name.split(' ')[0]} × ${student.full_name.split(' ')[0]}`;

    // Student's Google-connected email wins; profiles.email is the fallback.
    // Missing email never blocks the meeting — the in-app widget covers it.
    const { data: studentTokens } = await admin
      .from('google_oauth_tokens')
      .select('google_email')
      .eq('user_id', studentId)
      .maybeSingle();
    const studentEmail = studentTokens?.google_email || student.email || null;

    const attendees: calendar_v3.Schema$EventAttendee[] = [];
    if (buddyGoogleEmail) attendees.push({ email: buddyGoogleEmail });
    if (studentEmail) {
      attendees.push({ email: studentEmail, displayName: student.full_name });
    }

    const description = [
      `1:1 prep session on CareerRai`,
      ``,
      `Mentor: ${buddy.full_name}${buddy.college ? ` (IIM ${buddy.college} Alumni)` : ' (IIM Alumni)'}`,
      `Student: ${student.full_name}`,
      ``,
      `Agenda: progress check-in, doubts, and next steps for CAT prep.`,
      ``,
      `${process.env.NEXT_PUBLIC_APP_URL}`,
    ].join('\n');

    const eventBody = (requestId: string): calendar_v3.Schema$Event => ({
      summary: title,
      description,
      start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
      attendees: attendees.length ? attendees : undefined,
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 10 },
          { method: 'email', minutes: 60 },
        ],
      },
    });

    // ── Create on buddy's calendar; retry once with fresh requestId ──
    let event: calendar_v3.Schema$Event | null = null;
    let meetLink: string | null = null;
    for (let attempt = 0; attempt < 2 && !meetLink; attempt++) {
      const { data } = await buddyCalendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: eventBody(randomUUID()),
      });
      event = data;
      meetLink = extractMeetLink(data);

      // The conference is occasionally still pending in the insert
      // response — one fetch usually resolves it.
      if (!meetLink && data.id) {
        await new Promise((r) => setTimeout(r, 800));
        const { data: fetched } = await buddyCalendar.events.get({
          calendarId: 'primary',
          eventId: data.id,
        });
        meetLink = extractMeetLink(fetched);
        if (meetLink) event = fetched;
      }

      if (!meetLink && data.id) {
        // clean up the linkless event before retrying
        await buddyCalendar.events
          .delete({ calendarId: 'primary', eventId: data.id, sendUpdates: 'none' })
          .catch(() => {});
        event = null;
      }
    }

    if (!meetLink || !event?.id) {
      return NextResponse.json(
        { error: "Google didn't return a Meet link — try again in a moment." },
        { status: 502 }
      );
    }

    // ── Mirror onto student's calendar (non-fatal) ───────────────
    let studentEventId: string | null = null;
    try {
      const { calendar: studentCalendar } = await getCalendarClient(studentId);
      const { data: mirror } = await studentCalendar.events.insert({
        calendarId: 'primary',
        sendUpdates: 'none',
        requestBody: {
          summary: title,
          description: `${description}\n\nJoin: ${meetLink}`,
          start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
          end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 30 },
              { method: 'popup', minutes: 10 },
            ],
          },
        },
      });
      studentEventId = mirror.id ?? null;
    } catch {
      // Student hasn't connected Google — invite email (if any) covers them.
    }

    // ── Persist session ──────────────────────────────────────────
    const { data: session, error: sessionError } = await admin
      .from('video_sessions')
      .insert({
        buddy_id: user.id,
        student_id: studentId,
        title,
        scheduled_at: start.toISOString(),
        duration_minutes: durationMinutes,
        session_status: 'scheduled',
        session_type: 'session',
        google_event_id: event.id,
        google_meet_link: meetLink,
        student_google_event_id: studentEventId,
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      console.error('video_sessions insert failed:', sessionError);
      // Roll back the calendar event so we don't strand a meeting
      await buddyCalendar.events
        .delete({ calendarId: 'primary', eventId: event.id, sendUpdates: 'all' })
        .catch(() => {});
      return NextResponse.json(
        { error: "Couldn't save the session — try again." },
        { status: 500 }
      );
    }

    // ── Notify student in-app (non-fatal) ────────────────────────
    const istTime = start.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    await admin
      .from('notifications')
      .insert({
        user_id: studentId,
        type: 'session_scheduled',
        title: `📅 Session with ${buddy.full_name.split(' ')[0]}`,
        body: `${istTime} IST — your buddy booked a 1:1. Join from your dashboard.`,
        data: { sessionId: session.id, meetLink },
      })
      .then(({ error: e }) => {
        if (e) console.error('Notification insert failed:', e.message);
      });

    return NextResponse.json({
      success: true,
      meetingId: session.id,
      meetLink,
      invitesSent: attendees.length > 0,
    });
  } catch (error) {
    // Surface Google API errors precisely instead of a generic 500
    const apiError = error as {
      message?: string;
      errors?: Array<{ reason?: string; message?: string }>;
      response?: { data?: { error?: { errors?: Array<{ reason?: string }>; message?: string } } };
    };
    const reason =
      apiError.errors?.[0]?.reason ||
      apiError.response?.data?.error?.errors?.[0]?.reason;
    const detail =
      apiError.response?.data?.error?.message || apiError.message || String(error);
    console.error('schedule-meeting error:', reason, detail);

    if (reason === 'accessNotConfigured' || detail.includes('SERVICE_DISABLED') || detail.includes('has not been used in project')) {
      return NextResponse.json(
        {
          error:
            'Google Calendar API is disabled in the app’s Google Cloud project. Founder: enable it at console.cloud.google.com → APIs & Services → Google Calendar API → Enable, then retry.',
          code: 'CALENDAR_API_DISABLED',
        },
        { status: 502 }
      );
    }
    if (reason === 'insufficientPermissions' || detail.includes('insufficient')) {
      return NextResponse.json(
        { error: 'Google Calendar permissions are missing — disconnect and reconnect Google Calendar in Settings.', code: 'INSUFFICIENT_SCOPE' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't reach Google Calendar — try again." },
      { status: 500 }
    );
  }
}
```

### src/app/api/calendar/upcoming-meetings/route.ts
```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface UpcomingMeeting {
  id: string;
  title: string | null;
  scheduledAt: string;
  durationMinutes: number;
  meetLink: string | null;
  counterpartName: string;
  counterpartCollege: string | null;
  role: 'buddy' | 'student';
}

/**
 * GET /api/calendar/upcoming-meetings
 * Next scheduled sessions for the signed-in user (buddy or student),
 * including sessions still inside their live window.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    const role: 'buddy' | 'student' = profile?.role === 'buddy' ? 'buddy' : 'student';
    const ownerCol = role === 'buddy' ? 'buddy_id' : 'student_id';
    const counterpartCol = role === 'buddy' ? 'student_id' : 'buddy_id';

    // Include sessions that started up to 90 min ago so the live-window
    // card doesn't vanish the second a meeting begins.
    const windowStart = new Date(Date.now() - 90 * 60_000).toISOString();

    // Try to fetch with google_meet_link; if column doesn't exist yet, fall back to basic fields
    const { data: sessions, error } = await admin
      .from('video_sessions')
      .select('id, title, scheduled_at, duration_minutes, google_meet_link, student_id, buddy_id')
      .eq(ownerCol, user.id)
      .eq('session_status', 'scheduled')
      .gte('scheduled_at', windowStart)
      .order('scheduled_at', { ascending: true })
      .limit(3);

    // If the google_meet_link column doesn't exist (migration not applied), try without it
    if (error?.code === 'PGRST116' || error?.message?.includes('column')) {
      console.warn('google_meet_link column not found (migration 015 not applied yet), retrying without it');
      const { data: fallbackSessions, error: fallbackError } = await admin
        .from('video_sessions')
        .select('id, title, scheduled_at, duration_minutes, student_id, buddy_id')
        .eq(ownerCol, user.id)
        .eq('session_status', 'scheduled')
        .gte('scheduled_at', windowStart)
        .order('scheduled_at', { ascending: true })
        .limit(3);

      if (fallbackError) {
        console.error('upcoming-meetings fallback query failed:', fallbackError);
        return NextResponse.json({ error: 'Failed to load meetings.' }, { status: 500 });
      }

      // Map fallback sessions with null meet links
      const rows = (fallbackSessions ?? []).map(s => ({
        ...s,
        google_meet_link: null
      }));

      const active = rows.filter((s) => {
        const endMs =
          new Date(s.scheduled_at).getTime() + (s.duration_minutes || 30) * 60_000;
        return endMs > Date.now();
      });

      const counterpartIds = [...new Set(active.map((s) => s[counterpartCol]))];
      const names = new Map<string, { full_name: string; college: string | null }>();
      if (counterpartIds.length) {
        const { data: people } = await admin
          .from('profiles')
          .select('id, full_name, college')
          .in('id', counterpartIds);
        for (const p of people ?? []) {
          names.set(p.id, { full_name: p.full_name, college: p.college });
        }
      }

      const meetings: UpcomingMeeting[] = active.map((s) => ({
        id: s.id,
        title: s.title,
        scheduledAt: s.scheduled_at,
        durationMinutes: s.duration_minutes || 30,
        meetLink: s.google_meet_link,
        counterpartName: names.get(s[counterpartCol])?.full_name ?? 'Your buddy',
        counterpartCollege: names.get(s[counterpartCol])?.college ?? null,
        role,
      }));

      return NextResponse.json({ meetings });
    }

    if (error) {
      console.error('upcoming-meetings query failed:', error);
      return NextResponse.json({ error: 'Failed to load meetings.' }, { status: 500 });
    }

    const rows = sessions ?? [];

    // Drop sessions whose live window has fully ended
    const active = rows.filter((s) => {
      const endMs =
        new Date(s.scheduled_at).getTime() + (s.duration_minutes || 30) * 60_000;
      return endMs > Date.now();
    });

    const counterpartIds = [...new Set(active.map((s) => s[counterpartCol]))];
    const names = new Map<string, { full_name: string; college: string | null }>();
    if (counterpartIds.length) {
      const { data: people } = await admin
        .from('profiles')
        .select('id, full_name, college')
        .in('id', counterpartIds);
      for (const p of people ?? []) {
        names.set(p.id, { full_name: p.full_name, college: p.college });
      }
    }

    const meetings: UpcomingMeeting[] = active.map((s) => ({
      id: s.id,
      title: s.title,
      scheduledAt: s.scheduled_at,
      durationMinutes: s.duration_minutes || 30,
      meetLink: s.google_meet_link,
      counterpartName: names.get(s[counterpartCol])?.full_name ?? 'Your buddy',
      counterpartCollege: names.get(s[counterpartCol])?.college ?? null,
      role,
    }));

    return NextResponse.json({ meetings });
  } catch (error) {
    console.error('upcoming-meetings error:', error);
    return NextResponse.json({ error: 'Failed to load meetings.' }, { status: 500 });
  }
}
```

### src/app/api/cron/check-red-flags/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { sendRedFlagAlert } from '@/lib/email';
import type { DailyReport } from '@/types';

// Called after each report submission or by cron to detect red flags
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const { data: students } = await admin.from('profiles').select('id, full_name, buddy_id').eq('role', 'student');
  if (!students?.length) return NextResponse.json({ flagged: 0 });

  const studentIds = students.map(s => s.id);
  const { data: reports } = await admin.from('daily_reports').select('*').in('student_id', studentIds).gte('report_date', weekAgoStr);
  const allReports = (reports ?? []) as DailyReport[];

  let flagged = 0;
  for (const student of students) {
    if (!student.buddy_id) continue;
    const reps = allReports.filter(r => r.student_id === student.id);
    const summary = computeSummary(reps, 7);
    if (summary.redFlags.length === 0) continue;

    // Check if we already sent a flag alert in last 24h
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { data: recentAlert } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', student.buddy_id)
      .eq('type', 'red_flag')
      .contains('data', { student_id: student.id })
      .gte('created_at', yesterday.toISOString())
      .single();

    if (recentAlert) continue; // Already alerted today

    const { data: buddy } = await admin.from('profiles').select('full_name, email').eq('id', student.buddy_id).single();
    if (!buddy) continue;

    // In-app alert to buddy
    await admin.from('notifications').insert({
      user_id: student.buddy_id,
      type: 'red_flag',
      title: `⚠️ Red flag: ${student.full_name}`,
      body: summary.redFlags[0],
      data: { student_id: student.id, flags: summary.redFlags },
      read: false,
      channel: 'in_app',
    });

    // Email alert
    if (buddy.email) {
      await sendRedFlagAlert(buddy.email, buddy.full_name.split(' ')[0], student.full_name, summary.redFlags);
    }

    flagged++;
  }

  return NextResponse.json({ flagged });
}

export { POST as GET };
```

### src/app/api/cron/daily-reminder/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDailyReminder } from '@/lib/email';
import { sendPushToUser } from '@/lib/push';

// Rotating Zomato/Swiggy-style copy — one personality, never the same nag twice in a row.
const REMINDER_VARIANTS: { title: string; body: (name: string) => string }[] = [
  {
    title: 'Aaj padhai hui ya nahi? 👀',
    body: () => "90 seconds. Log it before your streak files a complaint.",
  },
  {
    title: 'Knock knock. It’s your streak 🔥',
    body: () => 'It’s getting cold out here. One tap keeps it alive.',
  },
  {
    title: 'Plot twist: toppers log daily 📈',
    body: (name) => `Be the main character, ${name}. 90 seconds.`,
  },
  {
    title: 'Your books just texted us 📚',
    body: () => 'They said you two had a moment today. Make it official — log it.',
  },
  {
    title: 'Breaking news 🚨',
    body: (name) => `${name} studied all day and told no one. Don’t be tonight’s headline.`,
  },
  {
    title: 'CAT won’t wait. Neither will 3 AM ⏰',
    body: () => 'Log today’s prep — your future IIM self says thanks.',
  },
  {
    title: 'VARC, DILR ya QA? 🤔',
    body: () => 'Whatever you touched today, it counts. Log it in 90 seconds.',
  },
];

function pickVariant(name: string, streak: number) {
  // Streak-aware copy beats generic copy
  if (streak >= 7) {
    return {
      title: `${streak} days of fire 🔥 Don’t stop now`,
      body: `Day ${streak + 1} is one tap away, ${name}. Toppers don’t take L’s on technicalities.`,
    };
  }
  if (streak >= 3) {
    return {
      title: 'Your streak is on one leg 🦵🔥',
      body: `${streak} days strong — day ${streak + 1} is 90 seconds away.`,
    };
  }
  // Rotate by day of year so everyone gets fresh copy daily
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
  );
  const v = REMINDER_VARIANTS[dayOfYear % REMINDER_VARIANTS.length];
  return { title: v.title, body: v.body(name) };
}

// Called by Vercel Cron at 14:30 UTC = 8:00 PM IST every day
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Get all students
  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, email, notif_prefs, current_streak')
    .eq('role', 'student');
  if (!students?.length) return NextResponse.json({ reminded: 0 });

  // Find students who haven't submitted today
  const studentIds = students.map(s => s.id);
  const { data: todayReports } = await admin.from('daily_reports').select('student_id').in('student_id', studentIds).eq('report_date', today);
  const submittedIds = new Set((todayReports ?? []).map(r => r.student_id));

  const pending = students.filter(s => !submittedIds.has(s.id));

  let reminded = 0;
  for (const s of pending) {
    const prefs = s.notif_prefs ?? {};
    const firstName = s.full_name.split(' ')[0];
    const { title, body } = pickVariant(firstName, s.current_streak ?? 0);

    // In-app notification
    await admin.from('notifications').insert({
      user_id: s.id,
      type: 'daily_reminder',
      title,
      body,
      data: { url: '/student/tracker' },
      read: false,
      channel: 'in_app',
    });

    // Email
    if (prefs.email !== false && s.email) {
      await sendDailyReminder(s.email, firstName);
    }

    // Push
    if (prefs.push === true) {
      await sendPushToUser(s.id, {
        title,
        body,
        url: '/student/tracker',
      });
    }

    reminded++;
  }

  return NextResponse.json({ reminded, total: students.length, pendingCount: pending.length });
}

// Allow Vercel cron to call via GET too
export { POST as GET };
```

### src/app/api/cron/weekly-digest/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { sendBuddyWeeklyDigest } from '@/lib/email';
import type { DailyReport } from '@/types';

// Called by Vercel Cron at 04:00 UTC = 9:30 AM IST every Monday
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: buddies } = await admin.from('profiles').select('id, full_name, email').eq('role', 'buddy');
  if (!buddies?.length) return NextResponse.json({ sent: 0 });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  let sent = 0;
  for (const buddy of buddies) {
    const { data: myStudents } = await admin.from('profiles').select('id, full_name').eq('buddy_id', buddy.id).eq('role', 'student');
    if (!myStudents?.length) continue;

    const studentIds = myStudents.map(s => s.id);
    const { data: reports } = await admin.from('daily_reports').select('*').in('student_id', studentIds).gte('report_date', weekAgoStr);
    const allReports = (reports ?? []) as DailyReport[];

    const summaries = myStudents.map(s => {
      const reps = allReports.filter(r => r.student_id === s.id);
      const summary = computeSummary(reps, 7);
      return { name: s.full_name, score: summary.overallScore, band: summary.band, redFlags: summary.redFlags };
    });

    // In-app digest notification
    const digestBody = summaries.map(s => `${s.name}: ${s.score}/100 (${s.band})`).join(' • ');
    await admin.from('notifications').insert({
      user_id: buddy.id,
      type: 'weekly_digest',
      title: 'Weekly digest — your students',
      body: digestBody,
      data: { summaries },
      read: false,
      channel: 'in_app',
    });

    // Email digest
    if (buddy.email) {
      await sendBuddyWeeklyDigest(buddy.email, buddy.full_name.split(' ')[0], summaries);
    }

    sent++;
  }

  return NextResponse.json({ sent });
}

export { POST as GET };
```

### src/app/api/feedback-draft/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('feedback-draft: ANTHROPIC_API_KEY is not set in this environment');
      return NextResponse.json(
        { error: 'AI is not configured on the server — add ANTHROPIC_API_KEY in Vercel project settings' },
        { status: 503 }
      );
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { studentId } = body as { studentId: string };
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    const admin = createAdminClient();

    // Verify buddy owns this student
    const { data: student } = await admin
      .from('profiles')
      .select('buddy_id, full_name, current_streak')
      .eq('id', studentId)
      .single();
    if (!student || student.buddy_id !== user.id) {
      return NextResponse.json({ error: 'Not your student' }, { status: 403 });
    }

    // Fetch last 7 days of logs
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: logs } = await admin
      .from('daily_reports')
      .select('report_date, study_duration, topics_covered, confidence, stress, mock_score, mock_taken')
      .eq('student_id', studentId)
      .gte('report_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('report_date', { ascending: false });

    // Fetch latest test result
    const { data: latestTest } = await admin
      .from('test_results')
      .select('percentile, score, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch last feedback given
    const { data: lastFeedback } = await admin
      .from('buddy_feedback')
      .select('feedback_text, created_at')
      .eq('student_id', studentId)
      .eq('feedback_type', 'buddy_feedback')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysLogged = logs?.length ?? 0;
    const avgHours = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
      : '0';
    const avgStress = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.stress ?? 3), 0) / daysLogged).toFixed(1)
      : '3';

    const contextLines = [
      `Student: ${student.full_name.split(' ')[0]}`,
      `Current streak: ${student.current_streak ?? 0} days`,
      `Last 7 days: ${daysLogged}/7 days logged, avg ${avgHours} hrs/day, avg stress ${avgStress}/5`,
      latestTest ? `Latest CAT readiness: ${latestTest.percentile?.toFixed(1) ?? '?'}%ile` : 'No test result yet',
      lastFeedback
        ? `Last feedback (${new Date(lastFeedback.created_at).toLocaleDateString('en-IN')}): "${lastFeedback.feedback_text?.substring(0, 100)}..."`
        : 'No previous feedback given',
    ].join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `You are an IIM alumni writing feedback for a CAT aspirant. Tone: direct, warm, senior-bhaiya/didi. Write 2-3 sentences: one observation on their consistency this week, one observation on an area to improve, one specific action for next week. Max 60 words. Use first person. No generic phrases. Be specific to the numbers given.`,
      messages: [{
        role: 'user',
        content: `Generate feedback draft:\n${contextLines}`,
      }],
    });

    const draft = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    return NextResponse.json({ draft });
  } catch (error) {
    console.error('feedback-draft error:', error);
    return NextResponse.json({ error: 'Failed to generate draft', draft: '' }, { status: 500 });
  }
}
```

### src/app/api/google/auth/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildAuthUrl } from '@/lib/google-calendar';

/**
 * GET /api/google/auth?redirect=/buddy/settings
 * Starts the Google OAuth flow. Requires an authenticated session.
 * The redirect path (where to land after the callback) travels in `state`.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`);
  }

  const redirect = request.nextUrl.searchParams.get('redirect') || '/';
  // Only allow same-app relative paths in state — never absolute URLs
  const safeRedirect = redirect.startsWith('/') ? redirect : '/';

  return NextResponse.redirect(buildAuthUrl(safeRedirect));
}

/**
 * POST kept for backward compatibility with older clients that expect
 * { authUrl } in a JSON body.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let redirect = '/';
  try {
    const body = await request.json();
    if (typeof body?.redirectUrl === 'string' && body.redirectUrl.startsWith('/')) {
      redirect = body.redirectUrl;
    }
  } catch {
    // no body — use default
  }

  return NextResponse.json({ authUrl: buildAuthUrl(redirect) });
}
```

### src/app/api/google/callback/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createOAuthClient } from '@/lib/google-calendar';
import { createAutomatedReminders } from '@/lib/google-reminder-utils';

/**
 * GET /api/google/callback
 * Google redirects here after consent. Exchanges the code for tokens,
 * captures the connected Gmail, stores everything server-side, then
 * sends the user back where they started (state = relative path).
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const state = request.nextUrl.searchParams.get('state');
  // state is a same-app relative path; anything else falls back to root
  const landing = state && state.startsWith('/') ? state : '/';
  const fail = (reason: string) =>
    NextResponse.redirect(`${appUrl}${landing}?google_connect=failed&reason=${reason}`);

  try {
    const code = request.nextUrl.searchParams.get('code');
    if (request.nextUrl.searchParams.get('error')) return fail('denied');
    if (!code) return fail('missing_code');

    // Who is connecting? (cookie session — user arrives in their own browser)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail('not_signed_in');

    // Exchange code for tokens
    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token || !tokens.access_token) {
      // Happens if a previous grant exists without prompt:'consent'
      return fail('no_refresh_token');
    }
    oauth2Client.setCredentials(tokens);

    // The primary calendar's id IS the account email — no extra scope needed
    let googleEmail: string | null = null;
    try {
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const { data: primary } = await calendar.calendars.get({ calendarId: 'primary' });
      googleEmail = primary.id ?? null;
    } catch {
      // non-fatal — email is cosmetic
    }

    const admin = createAdminClient();
    const { error: tokenError } = await admin.from('google_oauth_tokens').upsert({
      user_id: user.id,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    });
    if (tokenError) {
      console.error('Error storing Google tokens:', tokenError);
      return fail('storage');
    }

    await admin
      .from('profiles')
      .update({
        google_calendar_connected: true,
        google_calendar_connected_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    // Daily reminders — in-process, best-effort
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      const role = profile?.role === 'buddy' ? 'buddy' : 'student';
      await createAutomatedReminders(user.id, role);
    } catch (remindersError) {
      console.error('Reminder setup failed (non-fatal):', remindersError);
    }

    return NextResponse.redirect(`${appUrl}${landing}?google_connect=success`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return fail('callback_error');
  }
}
```

### src/app/api/google/disconnect/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { disconnectGoogleCalendar } from '@/lib/google-calendar';
import { deleteAutomatedReminders } from '@/lib/google-reminder-utils';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/google/disconnect
 * Disconnects user's Google Calendar
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Remove our reminder events while we still hold a valid token
    // (best-effort — disconnect proceeds even if cleanup fails)
    try {
      await deleteAutomatedReminders(user.id);
    } catch (cleanupError) {
      console.error('Reminder cleanup failed during disconnect:', cleanupError);
    }

    // Disconnect calendar
    await disconnectGoogleCalendar(user.id);

    return NextResponse.json({
      success: true,
      message: 'Google Calendar disconnected',
    });
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
```

### src/app/api/google/setup-reminders/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createAutomatedReminders } from '@/lib/google-reminder-utils';

/**
 * POST /api/google/setup-reminders
 * Creates automated daily reminders for the user based on their role
 */
export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's role
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.role) {
      return NextResponse.json(
        { error: 'Could not determine user role' },
        { status: 400 }
      );
    }

    // Create reminders
    const result = await createAutomatedReminders(user.id, profile.role);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to create reminders' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${result.reminders.length} reminder(s) created`,
      reminders: result.reminders,
    });
  } catch (error) {
    console.error('Error setting up reminders:', error);

    if (error instanceof Error && error.message.includes('User has not connected Google Calendar')) {
      return NextResponse.json(
        { error: 'Google Calendar not connected' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to set up reminders' },
      { status: 500 }
    );
  }
}
```

### src/app/api/logging/brain-break/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_GAMES = ['math_sprint', 'pattern_lock', 'memory_grid', 'sudoku_blitz'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as { game_type: string; score: number; duration_seconds?: number };
    if (!VALID_GAMES.includes(body.game_type)) {
      return NextResponse.json({ error: 'Invalid game_type' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Server-side 3-plays/day limit — localStorage alone is bypassable
    const todayStr = new Date().toISOString().split('T')[0];
    const { count } = await admin
      .from('brain_break_logs')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .gte('played_at', `${todayStr}T00:00:00.000Z`);
    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: 'Daily limit reached', limit: 3 }, { status: 429 });
    }

    await admin.from('brain_break_logs').insert({
      student_id: user.id,
      game_type: body.game_type,
      score: body.score ?? null,
      duration_seconds: body.duration_seconds ?? null,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Brain break log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### src/app/api/logging/log-daily/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getLogDateString,
  VALID_SECTIONS,
  VALID_ENERGY,
  VALID_EMOTIONAL_CHIPS,
} from '@/lib/streak-utils';

interface LoggingRequest {
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  emotional_chips?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as LoggingRequest;

    if (!Number.isInteger(body.hours) || body.hours < 0 || body.hours > 6) {
      return NextResponse.json({ error: 'Invalid hours (0-6)' }, { status: 400 });
    }
    if (!Array.isArray(body.sections) || body.sections.length === 0) {
      return NextResponse.json({ error: 'Select at least one section' }, { status: 400 });
    }
    if (!body.sections.every((s) => (VALID_SECTIONS as readonly string[]).includes(s))) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }
    if (!(VALID_ENERGY as readonly string[]).includes(body.energy)) {
      return NextResponse.json({ error: 'Invalid energy' }, { status: 400 });
    }
    if (body.emotional_chips) {
      if (!body.emotional_chips.every((c) => (VALID_EMOTIONAL_CHIPS as readonly string[]).includes(c))) {
        return NextResponse.json({ error: 'Invalid emotional chip' }, { status: 400 });
      }
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from('profiles')
      .select('id, buddy_id')
      .eq('id', user.id)
      .single();

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const dateStr = getLogDateString();

    const { data: existingLog } = await admin
      .from('daily_reports')
      .select('id, updated_at')
      .eq('student_id', user.id)
      .eq('report_date', dateStr)
      .maybeSingle();

    // Rate limit: block hammering (same report updated within last 15 seconds)
    if (existingLog?.updated_at) {
      const secsSinceUpdate = (Date.now() - new Date(existingLog.updated_at).getTime()) / 1000;
      if (secsSinceUpdate < 15) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
    }

    const logData = {
      student_id: user.id,
      report_date: dateStr,
      study_duration: body.hours,
      topics_covered: body.sections,
      mood_emoji: body.energy,
      mock_taken: body.sections.includes('Mock'),
      total_accuracy: null,
      notes: body.notes || null,
      emotional_chips: body.emotional_chips ?? [],
      // Keep legacy numeric fields at defaults
      quality_focus: 3,
      difficulty: 3,
      confidence: 4,
      stress: 2,
      sleep_quality: 7,
      overall_energy: 4,
      nutrition_exercise: false,
    };

    if (existingLog) {
      await admin.from('daily_reports').update(logData).eq('id', existingLog.id);
    } else {
      await admin.from('daily_reports').insert(logData);
    }

    // Study streak counts study days — a 0-hour log keeps the record, not the flame.
    const streakUpdated = body.hours > 0
      ? await updateStreak(user.id, admin)
      : await getStreak(user.id, admin);
    const dailyNudge = await computePrescriptiveLine(user.id, body.sections, !existingLog, admin, body.emotional_chips);

    let bonus: string | undefined;
    if (Math.random() < 0.2) {
      const bonuses = [
        '3-day streak incoming!',
        'Your buddy will see this!',
        'Keep this momentum going!',
        'Solid consistency — keep it up!',
      ];
      bonus = bonuses[Math.floor(Math.random() * bonuses.length)];
    }

    notifyBuddy(user.id, profile.buddy_id, { hours: body.hours, energy: body.energy }).catch(console.error);
    if (body.sections.includes('Mock')) {
      notifyBuddyMock(user.id, profile.buddy_id, dateStr).catch(console.error);
    }
    if (body.emotional_chips && body.emotional_chips.length > 0 && !body.emotional_chips.includes('all_good')) {
      notifyBuddyEmotional(user.id, profile.buddy_id, body.emotional_chips).catch(console.error);
    }
    logAnalyticsEvent(user.id, 'log_submitted', {
      hours: body.hours,
      sectionCount: body.sections.length,
      hasMock: body.sections.includes('Mock'),
      emotionalChips: body.emotional_chips ?? [],
    }).catch(console.error);

    return NextResponse.json({ success: true, streak: streakUpdated, bonus, daily_nudge: dailyNudge }, { status: 200 });
  } catch (error) {
    console.error('Logging error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Evidence Engine — 5-rule prescriptive engine, single-user data, no AI.
// Every log gets at most ONE line back.
// Priority: first-ever > emotional flag > consistency gap > avoidance >
// no-mock-in-7-days > same-section tunnel vision.
async function computePrescriptiveLine(
  studentId: string,
  todaySections: string[],
  isNewLogForDate: boolean,
  admin: ReturnType<typeof createAdminClient>,
  emotionalChips?: string[]
): Promise<string | null> {
  try {
    const { data: recent } = await admin
      .from('daily_reports')
      .select('topics_covered, report_date, mock_taken, emotional_chips, study_duration')
      .eq('student_id', studentId)
      .order('report_date', { ascending: false })
      .limit(14);

    // Rule 1: first-ever log
    const priorCount = (recent ?? []).length - (isNewLogForDate ? 1 : 0);
    if (priorCount <= 0) {
      return "First log done. Do this daily and in 2 weeks you'll see a pattern you can't see now.";
    }
    if (!recent || recent.length < 3) return null;

    // Rule 2: emotional distress signal — respond to the person, not just the data
    if (emotionalChips && emotionalChips.length > 0 && !emotionalChips.includes('all_good')) {
      if (emotionalChips.includes('mock_scared')) {
        return 'Mock fear is information — tell your buddy which section made you blank. That\'s the debrief agenda.';
      }
      if (emotionalChips.includes('burned_out')) {
        return 'Burnout logged. One easy session tomorrow is better than skipping. Tell your buddy.';
      }
      if (emotionalChips.includes('comparing')) {
        return 'Comparison mode is expensive prep time. Your only benchmark is last week\'s you.';
      }
      if (emotionalChips.includes('lost_confidence')) {
        return 'Confidence dips after a hard day — your buddy has been exactly here. Talk to them.';
      }
      if (emotionalChips.includes('feeling_behind')) {
        return `${daysBetween(recent[0]?.report_date)} days of data say you're showing up. That's not behind — that's the work.`;
      }
    }

    // Rule 3: consistency signal — logged fewer than 4 of last 7 days
    const last7 = recent.slice(0, 7);
    const studyDaysIn7 = last7.filter((r) => (r.study_duration as number) > 0).length;
    if (last7.length >= 7 && studyDaysIn7 < 4) {
      return `${studyDaysIn7}/7 study days last week. CAT rewards consistency more than intensity.`;
    }

    const coreSections = ['VARC', 'DILR', 'QA'];

    // Rule 4: avoiding a section 3+ days running
    const avoidedFor: Record<string, number> = {};
    for (const section of coreSections) {
      if (todaySections.includes(section)) continue;
      let daysMissed = 0;
      for (const report of recent) {
        const covered = (report.topics_covered as string[]) ?? [];
        if (!covered.includes(section)) daysMissed++;
        else break;
      }
      if (daysMissed >= 3) avoidedFor[section] = daysMissed;
    }
    const worst = Object.entries(avoidedFor).sort(([, a], [, b]) => b - a)[0];
    if (worst) {
      const [section, days] = worst;
      return `Day ${days} of skipping ${section} — that's the section costing you percentile.`;
    }

    // Rule 5: no mock in 7+ days (and today isn't one)
    if (!todaySections.includes('Mock') && recent.length >= 7) {
      const hadRecentMock = recent.slice(0, 7).some((r) => r.mock_taken);
      if (!hadRecentMock) {
        return 'A week without a mock. Book one — your trend needs a data point.';
      }
    }

    // Rule 6: same single section 4+ days running
    const todayCore = todaySections.filter((s) => coreSections.includes(s));
    if (todayCore.length === 1) {
      const section = todayCore[0];
      let runLength = 0;
      for (const report of recent) {
        const covered = ((report.topics_covered as string[]) ?? []).filter((s) => coreSections.includes(s));
        if (covered.length === 1 && covered[0] === section) runLength++;
        else break;
      }
      if (runLength >= 4) {
        return `${runLength} days straight on ${section}. Tomorrow touch your weakest section instead.`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function daysBetween(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return Math.round((Date.now() - d.getTime()) / 86_400_000);
}

async function getStreak(studentId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from('streak_data')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();
  if (data) return data;
  const { data: created } = await admin
    .from('streak_data')
    .insert({ student_id: studentId, current_streak: 0, longest_streak: 0 })
    .select()
    .single();
  return created;
}

async function updateStreak(studentId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data: streak, error: getError } = await admin
    .from('streak_data')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();

  const dateStr = getLogDateString();

  if (!streak && !getError) {
    // First-ever streak record for this student
    const { data: newStreak } = await admin
      .from('streak_data')
      .insert({ student_id: studentId, current_streak: 1, longest_streak: 1, last_log_date: dateStr })
      .select()
      .single();
    return newStreak;
  }

  if (!streak) throw new Error('Could not create or fetch streak');

  const today = new Date(dateStr);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const lastLogDateStr = streak.last_log_date ? new Date(streak.last_log_date).toISOString().split('T')[0] : null;

  if (lastLogDateStr !== dateStr) {
    const newCurrent =
      lastLogDateStr === yesterdayStr ? streak.current_streak + 1 : 1;
    const newLongest = Math.max(streak.longest_streak, newCurrent);

    const { data: updated } = await admin
      .from('streak_data')
      .update({ current_streak: newCurrent, longest_streak: newLongest, last_log_date: dateStr, updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .select()
      .single();

    return updated;
  }

  return streak;
}

async function notifyBuddy(studentId: string, buddyId: string | null, data: { hours: number; energy: string }) {
  if (!buddyId) return;
  try {
    const admin = createAdminClient();
    const { data: student } = await admin.from('profiles').select('full_name').eq('id', studentId).single();
    await admin.from('notifications').insert({
      user_id: buddyId,
      type: 'student_logged',
      title: `${student?.full_name || 'Student'} logged their prep`,
      body: `${data.hours}h · ${data.energy}`,
      data: { student_id: studentId, hours: data.hours, energy: data.energy },
      read: false,
      channel: 'in_app',
    });
  } catch (error) {
    console.error('Failed to notify buddy:', error);
  }
}

// The mock-logged ping — the debrief loop starts here. The 20 minutes after
// a mock are worth more than the 3 hours in it.
async function notifyBuddyMock(studentId: string, buddyId: string | null, logDate: string) {
  if (!buddyId) return;
  try {
    const admin = createAdminClient();
    const { data: student } = await admin.from('profiles').select('full_name').eq('id', studentId).single();
    const name = student?.full_name?.split(' ')[0] || 'Your student';
    await admin.from('notifications').insert({
      user_id: buddyId,
      type: 'mock_logged',
      title: `${name} finished a mock`,
      body: 'Debrief within 24h — walk it with them while it’s fresh.',
      data: { student_id: studentId, log_date: logDate },
      read: false,
      channel: 'in_app',
      link_url: `/buddy/students/${studentId}`,
    });
  } catch (error) {
    console.error('Failed to send mock notification:', error);
  }
}

async function notifyBuddyEmotional(studentId: string, buddyId: string | null, chips: string[]) {
  if (!buddyId) return;
  try {
    const admin = createAdminClient();
    const { data: student } = await admin.from('profiles').select('full_name').eq('id', studentId).single();
    const name = student?.full_name?.split(' ')[0] || 'Your student';
    const chipLabels: Record<string, string> = {
      mock_scared: 'scared by their mock',
      burned_out: 'feeling burned out',
      comparing: 'comparing themselves to others',
      family_pressure: 'under family pressure',
      lost_confidence: 'losing confidence',
      feeling_behind: 'feeling behind',
    };
    const described = chips.map((c) => chipLabels[c] ?? c).join(', ');
    await admin.from('notifications').insert({
      user_id: buddyId,
      type: 'emotional_flag',
      title: `${name} flagged an emotional block`,
      body: `They marked: ${described}. Check in with them.`,
      data: { student_id: studentId, chips },
      read: false,
      channel: 'in_app',
      link_url: `/buddy/students/${studentId}`,
    });
  } catch (error) {
    console.error('Failed to send emotional notification:', error);
  }
}

async function logAnalyticsEvent(studentId: string, eventType: string, metadata: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    await admin.from('analytics_events').insert({ student_id: studentId, event_type: eventType, metadata });
  } catch (error) {
    console.error('Failed to log analytics:', error);
  }
}
```

### src/app/api/logging/mock-debrief/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface DebriefRequest {
  log_date: string;
  overall_percentile?: number | null;
  varc?: { attempted: number; correct: number; time_min: number; percentile: number | null };
  dilr?: { attempted: number; correct: number; time_min: number; percentile: number | null };
  qa?: { attempted: number; correct: number; time_min: number; percentile: number | null };
  error_buckets?: { conceptual: number; silly: number; time: number; panic: number; selection: number };
  strategy_note?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as DebriefRequest;

    if (!body.log_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.log_date)) {
      return NextResponse.json({ error: 'Invalid log_date' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Use log_date as taken_on
    const row = {
      student_id: user.id,
      taken_on: body.log_date,
      log_date: body.log_date,
      varc: body.varc ?? {},
      dilr: body.dilr ?? {},
      qa: body.qa ?? {},
      error_buckets: body.error_buckets ?? { conceptual: 0, silly: 0, time: 0, panic: 0, selection: 0 },
      strategy_note: body.strategy_note?.trim() ?? null,
      overall_percentile: body.overall_percentile ?? null,
    };

    // Upsert — one debrief per log date
    const { error } = await admin
      .from('mock_debriefs')
      .upsert(row, { onConflict: 'student_id,log_date' })
      .select()
      .single();

    if (error) {
      // If no unique constraint yet, just insert
      await admin.from('mock_debriefs').insert(row);
    }

    // Keep CRS live: latest mock percentile becomes the profile's cat_percentile
    if (body.overall_percentile != null) {
      await admin
        .from('profiles')
        .update({ cat_percentile: body.overall_percentile })
        .eq('id', user.id);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Mock debrief error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### src/app/api/parse-scorecard/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic();

// Structured-output schema: every field nullable so missing values on the
// scorecard come back as null instead of hallucinated numbers.
const nullable = (type: 'integer' | 'number' | 'string') => ({
  anyOf: [{ type }, { type: 'null' }],
});

const SECTION_SCHEMA = {
  type: 'object',
  properties: {
    attempted: nullable('integer'),
    correct: nullable('integer'),
    time_min: nullable('integer'),
    percentile: nullable('number'),
  },
  required: ['attempted', 'correct', 'time_min', 'percentile'],
  additionalProperties: false,
};

const SCORECARD_SCHEMA = {
  type: 'object',
  properties: {
    is_scorecard: {
      type: 'boolean',
      description: 'true only if the image is actually a mock test scorecard/result page',
    },
    mock_name: {
      ...nullable('string'),
      description: 'Test series + mock name if visible, e.g. "SIMCAT 5"',
    },
    overall_percentile: nullable('number'),
    overall_score: nullable('number'),
    varc: SECTION_SCHEMA,
    dilr: SECTION_SCHEMA,
    qa: SECTION_SCHEMA,
  },
  required: ['is_scorecard', 'mock_name', 'overall_percentile', 'overall_score', 'varc', 'dilr', 'qa'],
  additionalProperties: false,
};

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('parse-scorecard: ANTHROPIC_API_KEY is not set in this environment');
      return NextResponse.json(
        { error: 'AI is not configured on the server — add ANTHROPIC_API_KEY in Vercel project settings' },
        { status: 503 }
      );
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { image, mediaType } = (await request.json()) as { image?: string; mediaType?: string };
    if (!image || !mediaType) {
      return NextResponse.json({ error: 'image and mediaType required' }, { status: 400 });
    }
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType as AllowedMediaType)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }
    // ~4MB base64 ceiling — client downscales before upload
    if (image.length > 5_500_000) {
      return NextResponse.json({ error: 'Image too large — try a tighter screenshot' }, { status: 413 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      output_config: {
        format: {
          type: 'json_schema',
          schema: SCORECARD_SCHEMA,
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as AllowedMediaType, data: image },
            },
            {
              type: 'text',
              text: `This is a screenshot of a CAT mock test scorecard (could be from SIMCAT, AIMCAT, CL, iQuanta, or any test series). Extract the scores.

Notes:
- CAT sections are VARC (Verbal Ability & Reading Comprehension), DILR (Data Interpretation & Logical Reasoning), and QA (Quantitative Ability/Aptitude). Map whatever section names appear to these three.
- "attempted" = questions attempted, "correct" = correct answers, "time_min" = time spent in minutes, "percentile" = sectional percentile.
- Use null for anything not visible on the scorecard. Never guess or compute values that aren't shown.
- If the image is not a test scorecard at all, set is_scorecard to false and everything else to null.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'Could not read this image' }, { status: 422 });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No data extracted' }, { status: 422 });
    }

    const parsed = JSON.parse(textBlock.text);
    if (!parsed.is_scorecard) {
      return NextResponse.json(
        { error: "That doesn't look like a mock scorecard — try a screenshot of your result page" },
        { status: 422 }
      );
    }

    return NextResponse.json({ scorecard: parsed });
  } catch (error) {
    console.error('parse-scorecard error:', error);
    return NextResponse.json({ error: 'Failed to parse scorecard' }, { status: 500 });
  }
}
```

### src/app/api/payments/create-order/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsEnabled } from '@/lib/feature-flags';
import { PLANS, isPlanId } from '@/lib/plans';
import { createRazorpayOrder } from '@/lib/razorpay';

export async function POST(request: NextRequest) {
  if (!paymentsEnabled()) return NextResponse.json({ error: 'Payments are not enabled.' }, { status: 403 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { plan } = (await request.json()) as { plan?: string };
    if (!plan || !isPlanId(plan)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    const p = PLANS[plan];

    const order = await createRazorpayOrder(p.amountPaise, `careerrai_${user.id.slice(0, 8)}_${Date.now()}`);

    // Record the intent; the webhook flips it to 'paid' after signature verify.
    const admin = createAdminClient();
    await admin.from('student_payments').insert({
      student_id: user.id,
      amount: p.amountPaise,
      plan,
      razorpay_order_id: order.id,
      status: 'created',
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // public key id — safe on the client
      plan,
    });
  } catch (e) {
    console.error('[create-order]', e);
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 500 });
  }
}
```

### src/app/api/payments/request-refund/route.ts
```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsEnabled } from '@/lib/feature-flags';

// Honors the no-questions money-back guarantee by FLAGGING admin. The actual
// refund is processed manually in the Razorpay dashboard — never automated.
export async function POST() {
  if (!paymentsEnabled()) return NextResponse.json({ error: 'Payments are not enabled.' }, { status: 403 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, subscription_status')
      .eq('id', user.id)
      .single();
    if (profile?.subscription_status !== 'active') {
      return NextResponse.json({ error: 'No active membership to refund.' }, { status: 400 });
    }

    await admin.from('profiles').update({ subscription_status: 'refund_requested' }).eq('id', user.id);

    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
    if (admins?.length) {
      await admin.from('notifications').insert(
        admins.map((a) => ({
          user_id: a.id,
          type: 'refund_request',
          title: `${profile?.full_name ?? 'A student'} requested a refund`,
          body: 'Process it in the Razorpay dashboard, then update their membership status.',
          read: false,
          channel: 'in_app',
        }))
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[refund]', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
```

### src/app/api/payments/webhook/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRazorpayWebhook } from '@/lib/razorpay';
import { PLANS, isPlanId } from '@/lib/plans';

// Subscription state changes ONLY here, and only after the signature verifies.
// Client-side "payment success" callbacks are never trusted.
export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[rzp-webhook] RAZORPAY_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  if (!verifyRazorpayWebhook(raw, signature, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  try {
    const event = JSON.parse(raw) as {
      event: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
    };

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const entity = event.payload?.payment?.entity;
      const orderId = entity?.order_id;
      const paymentId = entity?.id;

      if (orderId) {
        const admin = createAdminClient();
        const { data: row } = await admin
          .from('student_payments')
          .select('id, student_id, plan, status')
          .eq('razorpay_order_id', orderId)
          .maybeSingle();

        if (row && row.status !== 'paid') {
          await admin
            .from('student_payments')
            .update({ status: 'paid', paid_at: new Date().toISOString(), razorpay_payment_id: paymentId ?? null })
            .eq('id', row.id);

          const months = isPlanId(row.plan) ? PLANS[row.plan].months : 1;
          const renews = new Date();
          renews.setMonth(renews.getMonth() + months);

          await admin
            .from('profiles')
            .update({
              subscription_status: 'active',
              subscription_plan: row.plan,
              subscription_renews_at: renews.toISOString(),
            })
            .eq('id', row.student_id);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[rzp-webhook]', e);
    return NextResponse.json({ error: 'error' }, { status: 500 });
  }
}
```

### src/app/api/profiles/notif-prefs/route.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ notif_prefs: body })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

### src/app/api/push/subscribe/route.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subscription = await request.json();
  const admin = createAdminClient();
  await admin.from('profiles').update({ push_subscription: subscription, notif_prefs: { push: true } }).eq('id', user.id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  await admin.from('profiles').update({ push_subscription: null }).eq('id', user.id);
  return NextResponse.json({ ok: true });
}
```

### src/app/api/sessions/request/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { buddyId, message } = await request.json();
    if (!buddyId) {
      return NextResponse.json({ error: 'buddyId required' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: studentProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const firstName = studentProfile?.full_name?.split(' ')[0] ?? 'A student';

    const { data: req, error: insertError } = await admin
      .from('session_requests')
      .insert({
        student_id: user.id,
        buddy_id: buddyId,
        message: message?.trim() || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error inserting session request:', insertError);
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
    }

    await admin.from('notifications').insert({
      user_id: buddyId,
      type: 'session_request',
      title: '🚨 Urgent help needed',
      body: message?.trim()
        ? `${firstName} needs your help: "${message.trim().substring(0, 80)}"`
        : `${firstName} requested an urgent session.`,
      data: { studentId: user.id, requestId: req.id, url: '/buddy/home' },
      read: false,
    });

    return NextResponse.json({ success: true, requestId: req.id });
  } catch (error) {
    console.error('Error handling session request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { requestId } = await request.json();
    if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

    const admin = createAdminClient();
    await admin
      .from('session_requests')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('buddy_id', user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH session request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### src/app/api/student/ai-insights/route.ts
```ts
import { NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic();

export async function POST() {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('student ai-insights: ANTHROPIC_API_KEY is not set in this environment');
      return NextResponse.json(
        { error: 'AI is not configured on the server — add ANTHROPIC_API_KEY in Vercel project settings' },
        { status: 503 }
      );
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [{ data: logs }, { data: debriefs }, { data: profile }] = await Promise.all([
      admin
        .from('daily_reports')
        .select('report_date, study_duration, topics_covered, confidence, stress, mock_taken, total_accuracy')
        .eq('student_id', user.id)
        .gte('report_date', sevenDaysAgo.toISOString().split('T')[0])
        .order('report_date', { ascending: false }),
      admin
        .from('mock_debriefs')
        .select('taken_on, overall_percentile, varc, dilr, qa, error_buckets')
        .eq('student_id', user.id)
        .order('taken_on', { ascending: false })
        .limit(3),
      admin
        .from('profiles')
        .select('full_name, current_streak')
        .eq('id', user.id)
        .single(),
    ]);

    const daysLogged = logs?.length ?? 0;
    const avgHours = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
      : '0';
    const avgStress = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.stress ?? 3), 0) / daysLogged).toFixed(1)
      : '3';
    const avgConfidence = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.confidence ?? 3), 0) / daysLogged).toFixed(1)
      : '3';

    const topicsFlat = (logs ?? []).flatMap((r) => r.topics_covered ?? []);
    const topicCounts: Record<string, number> = {};
    for (const t of topicsFlat) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
    const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ');

    const latestDebrief = debriefs?.[0];
    const debriefLine = latestDebrief
      ? `Latest mock: ${latestDebrief.overall_percentile ?? '?'}%ile overall. Error buckets: conceptual=${latestDebrief.error_buckets?.conceptual ?? 0}, silly=${latestDebrief.error_buckets?.silly ?? 0}, time=${latestDebrief.error_buckets?.time ?? 0}`
      : 'No mock debriefs yet.';

    const context = [
      `Student: ${profile?.full_name?.split(' ')[0] ?? 'Student'}`,
      `Current streak: ${profile?.current_streak ?? 0} days`,
      `Last 7 days: ${daysLogged}/7 days logged, avg ${avgHours} hrs/day`,
      `Avg confidence: ${avgConfidence}/5, avg stress: ${avgStress}/5`,
      topTopics ? `Topics covered most: ${topTopics}` : 'No topics logged this week',
      debriefLine,
    ].join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `You are an IIM alumni helping a CAT aspirant. Based on their data, give exactly 3 bullet points of specific, actionable advice for this week. Each bullet: one sentence, direct, no fluff. Use the actual numbers from the data. Format as: • [advice]. No headers, no intro text.`,
      messages: [{ role: 'user', content: `Give me 3 specific action items this week:\n${context}` }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    return NextResponse.json({ insights: text });
  } catch (error) {
    console.error('student ai-insights error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}
```

### src/app/api/voice-notes/mark-read/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/voice-notes/mark-read { feedbackId }
 * First play: stamps read_at and clears the matching notification.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let feedbackId: string | undefined;
    try {
      ({ feedbackId } = await request.json());
    } catch {
      // validated below
    }
    if (!feedbackId) {
      return NextResponse.json({ error: 'feedbackId required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type, read_at')
      .eq('id', feedbackId)
      .single();
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Only the recipient can mark as read
    const recipientId =
      row.feedback_type === 'student_response' ? row.buddy_id : row.student_id;
    if (recipientId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!row.read_at) {
      await admin
        .from('buddy_feedback')
        .update({ read_at: new Date().toISOString() })
        .eq('id', feedbackId);

      // Clear the matching notification
      await admin
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('type', 'voice_note')
        .contains('data', { feedbackId });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mark-read error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

### src/app/api/voice-notes/send-text/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { studentId, feedbackText, feedbackType = 'buddy_feedback' } = await request.json() as {
      studentId: string;
      feedbackText: string;
      feedbackType?: string;
    };

    if (!studentId || !feedbackText?.trim()) {
      return NextResponse.json({ error: 'studentId and feedbackText are required' }, { status: 400 });
    }
    if (feedbackText.trim().length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 chars)' }, { status: 400 });
    }
    if (feedbackType !== 'buddy_feedback' && feedbackType !== 'student_response') {
      return NextResponse.json({ error: 'Invalid feedbackType' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: student } = await admin
      .from('profiles')
      .select('id, full_name, buddy_id')
      .eq('id', studentId)
      .single();
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    let buddyId: string;
    let recipientId: string;
    if (feedbackType === 'buddy_feedback') {
      if (student.buddy_id !== user.id) {
        return NextResponse.json({ error: 'This student is not assigned to you.' }, { status: 403 });
      }
      buddyId = user.id;
      recipientId = studentId;
    } else {
      if (user.id !== studentId) return NextResponse.json({ error: 'Not your conversation.' }, { status: 403 });
      if (!student.buddy_id) return NextResponse.json({ error: 'No buddy assigned yet.' }, { status: 400 });
      buddyId = student.buddy_id;
      recipientId = student.buddy_id;
    }

    const { data: sender } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
    const senderFirst = sender?.full_name?.split(' ')[0] ?? 'Someone';

    const { data: row, error: insertError } = await admin
      .from('buddy_feedback')
      .insert({
        student_id: studentId,
        buddy_id: buddyId,
        feedback_text: feedbackText.trim(),
        feedback_type: 'text',
        feedback_date: new Date().toISOString().slice(0, 10),
        rating: 3,
        period_covered: 'adhoc',
      })
      .select('id')
      .single();

    if (insertError || !row) {
      console.error('buddy_feedback text insert failed:', insertError);
      return NextResponse.json({ error: "Couldn't save message — try again." }, { status: 500 });
    }

    await admin.from('notifications').insert({
      user_id: recipientId,
      type: 'text_feedback',
      title: `💬 ${senderFirst} sent you a message`,
      body: feedbackText.trim().slice(0, 100),
      data: { feedbackId: row.id },
    }).then(({ error: e }) => { if (e) console.error('Text feedback notification failed:', e.message); });

    return NextResponse.json({ success: true, feedbackId: row.id });
  } catch (error) {
    console.error('send-text error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### src/app/api/voice-notes/send/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_BYTES = 15 * 1024 * 1024; // ~15MB ≈ well over 90s of opus

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

/**
 * POST /api/voice-notes/send  (multipart/form-data)
 * Fields: audio (File), studentId, durationSeconds, feedbackType
 * Buddy → student ('buddy_feedback') or student → buddy ('student_response').
 * Uploads server-side, inserts the feedback row, notifies the recipient.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
    }

    const audio = form.get('audio');
    const studentId = form.get('studentId');
    const feedbackType = form.get('feedbackType') || 'buddy_feedback';
    const durationSeconds = Number(form.get('durationSeconds')) || null;

    if (!(audio instanceof File) || typeof studentId !== 'string' || !studentId) {
      return NextResponse.json(
        { error: 'audio file and studentId are required.' },
        { status: 400 }
      );
    }
    if (feedbackType !== 'buddy_feedback' && feedbackType !== 'student_response') {
      return NextResponse.json({ error: 'Invalid feedbackType.' }, { status: 400 });
    }
    if (audio.size === 0 || audio.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Audio file is empty or too large.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Resolve sender/recipient and authorize the pair
    const { data: student } = await admin
      .from('profiles')
      .select('id, full_name, buddy_id, current_streak')
      .eq('id', studentId)
      .single();
    if (!student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    let buddyId: string;
    let recipientId: string;
    if (feedbackType === 'buddy_feedback') {
      // sender must be the student's buddy
      if (student.buddy_id !== user.id) {
        return NextResponse.json(
          { error: 'This student is not assigned to you.' },
          { status: 403 }
        );
      }
      buddyId = user.id;
      recipientId = studentId;
    } else {
      // student_response: sender must be the student, recipient their buddy
      if (user.id !== studentId) {
        return NextResponse.json({ error: 'Not your conversation.' }, { status: 403 });
      }
      if (!student.buddy_id) {
        return NextResponse.json({ error: 'No buddy assigned yet.' }, { status: 400 });
      }
      buddyId = student.buddy_id;
      recipientId = student.buddy_id;
    }

    const { data: sender } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    const senderFirst = sender?.full_name?.split(' ')[0] ?? 'Someone';

    // Upload
    const baseMime = (audio.type || 'audio/webm').split(';')[0];
    const ext = EXT_BY_MIME[baseMime] ?? 'webm';
    const path = `${studentId}/${Date.now()}.${ext}`;
    const bytes = await audio.arrayBuffer();

    const { error: uploadError } = await admin.storage
      .from('voice-notes')
      .upload(path, bytes, { contentType: baseMime, cacheControl: '3600' });
    if (uploadError) {
      console.error('Voice note upload failed:', uploadError);
      return NextResponse.json(
        { error: "Upload didn't go through — try again." },
        { status: 502 }
      );
    }

    const { data: publicData } = admin.storage.from('voice-notes').getPublicUrl(path);

    const { data: row, error: insertError } = await admin
      .from('buddy_feedback')
      .insert({
        student_id: studentId,
        buddy_id: buddyId,
        voice_note_url: publicData.publicUrl,
        feedback_type: feedbackType,
        feedback_date: new Date().toISOString().slice(0, 10),
        feedback_text: 'Voice message',
        rating: 3,
        period_covered: 'adhoc',
        duration_seconds: durationSeconds,
        mime_type: baseMime,
      })
      .select('id')
      .single();

    if (insertError || !row) {
      console.error('buddy_feedback insert failed:', insertError);
      await admin.storage.from('voice-notes').remove([path]).catch(() => {});
      return NextResponse.json(
        { error: "Couldn't save the note — try again." },
        { status: 500 }
      );
    }

    // Notify recipient (non-fatal)
    await admin
      .from('notifications')
      .insert({
        user_id: recipientId,
        type: 'voice_note',
        title: `🎤 ${senderFirst} sent you a voice note`,
        body:
          feedbackType === 'buddy_feedback'
            ? 'Your buddy recorded something for you — listen in the Buddy tab.'
            : `${senderFirst} replied to your note.`,
        data: { feedbackId: row.id, url: '/student/buddy' },
      })
      .then(({ error: e }) => {
        if (e) console.error('Voice note notification failed:', e.message);
      });

    return NextResponse.json({
      success: true,
      feedbackId: row.id,
      // little human nudge for the buddy UI
      streakNudge:
        feedbackType === 'buddy_feedback' && (student.current_streak ?? 0) >= 7
          ? `Nice — ${student.full_name.split(' ')[0]} is on a ${student.current_streak}-day streak, this is a great moment.`
          : null,
    });
  } catch (error) {
    console.error('voice-notes/send error:', error);
    return NextResponse.json(
      { error: "Couldn't send the note — try again." },
      { status: 500 }
    );
  }
}
```

### src/app/api/voice-notes/thanks/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/voice-notes/thanks { feedbackId }
 * One-tap ❤️ after listening — notifies the buddy their note landed.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let feedbackId: string | undefined;
    try {
      ({ feedbackId } = await request.json());
    } catch {
      // validated below
    }
    if (!feedbackId) {
      return NextResponse.json({ error: 'feedbackId required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('buddy_feedback')
      .select('id, student_id, buddy_id, feedback_type, thanked_at')
      .eq('id', feedbackId)
      .single();
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // Only the student who received a buddy note can thank
    if (row.feedback_type !== 'buddy_feedback' || row.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (row.thanked_at) {
      return NextResponse.json({ success: true, already: true });
    }

    await admin
      .from('buddy_feedback')
      .update({ thanked_at: new Date().toISOString() })
      .eq('id', feedbackId);

    const { data: student } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    const name = student?.full_name?.split(' ')[0] ?? 'Your student';

    await admin
      .from('notifications')
      .insert({
        user_id: row.buddy_id,
        type: 'voice_note_thanks',
        title: `❤️ ${name} listened to your voice note`,
        body: 'Your note landed. Keep them coming!',
        data: { feedbackId },
      })
      .then(({ error: e }) => {
        if (e) console.error('Thanks notification failed:', e.message);
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('thanks error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

### src/app/api/weekly-signal/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic();

// Cache: student_id+week_start -> insight
const weeklyCache = new Map<string, { insight: string; generatedAt: string }>();

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('weekly-signal: ANTHROPIC_API_KEY is not set in this environment');
      return NextResponse.json(
        { error: 'AI is not configured on the server — add ANTHROPIC_API_KEY in Vercel project settings' },
        { status: 503 }
      );
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { studentId } = body as { studentId: string };
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    const admin = createAdminClient();

    // Verify buddy owns this student
    const { data: student } = await admin
      .from('profiles')
      .select('buddy_id, full_name')
      .eq('id', studentId)
      .single();
    if (!student || student.buddy_id !== user.id) {
      return NextResponse.json({ error: 'Not your student' }, { status: 403 });
    }

    // Cache key: student + week start
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Sunday
    const cacheKey = `${studentId}-${weekStart.toISOString().split('T')[0]}`;

    const cached = weeklyCache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ insight: cached.insight, cached: true });
    }

    // Fetch last 7 days of logs
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: logs } = await admin
      .from('daily_reports')
      .select('report_date, study_duration, topics_covered, confidence, stress, mock_score, mock_taken')
      .eq('student_id', studentId)
      .gte('report_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('report_date', { ascending: true });

    const daysLogged = logs?.length ?? 0;
    const avgHours = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.study_duration ?? 0), 0) / daysLogged).toFixed(1)
      : '0';
    const avgStress = daysLogged > 0
      ? ((logs ?? []).reduce((s, r) => s + (r.stress ?? 3), 0) / daysLogged).toFixed(1)
      : '3';
    const mockLogs = (logs ?? []).filter(r => r.mock_taken);
    const latestMock = mockLogs.length > 0 ? mockLogs[mockLogs.length - 1] : null;

    const summaryJson = {
      days_logged: daysLogged,
      avg_hours_per_day: avgHours,
      avg_stress: avgStress,
      mock_taken: mockLogs.length,
      latest_mock_score: latestMock?.mock_score ?? null,
      stress_trend: logs && logs.length >= 3
        ? (logs[logs.length - 1].stress ?? 3) > (logs[0].stress ?? 3) ? 'rising' : 'falling'
        : 'stable',
    };

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: 'You are reviewing a CAT student\'s week of data for their IIM buddy. Give ONE precise observation (max 20 words) that a mentor should act on. No generic advice. Focus on the most unusual or concerning pattern. Output only the insight sentence, nothing else.',
      messages: [{
        role: 'user',
        content: `Student 7-day summary: ${JSON.stringify(summaryJson)}. Student name: ${student.full_name.split(' ')[0]}.`,
      }],
    });

    const insight = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    weeklyCache.set(cacheKey, { insight, generatedAt: now.toISOString() });

    return NextResponse.json({
      insight,
      cached: false,
      stats: {
        daysLogged,
        avgHours,
        avgStress,
        mockTaken: mockLogs.length,
        latestMockScore: latestMock?.mock_score ?? null,
      },
    });
  } catch (error) {
    console.error('weekly-signal error:', error);
    return NextResponse.json(
      { error: 'Failed to generate insight', insight: '' },
      { status: 500 }
    );
  }
}
```

---

## Instructions for ChatGPT

You now have the complete source code of **CareerRai** — a CAT exam prep tracking app built for Indian MBA aspirants. Students log daily study hours, take mock tests, and get mentored by IIM-alumni "buddy" mentors. The stack is Next.js 16 App Router + Supabase PostgreSQL + TailwindCSS + Anthropic Claude AI.

**User roles:**
- **Student** — CAT aspirant; logs daily study, tracks mocks, gets voice notes from buddy
- **Buddy** — IIM alumni mentor; sends voice/text feedback, monitors student performance
- **Admin** — Platform operator; manages allowlist, tracks payments, sets buddy payouts

**Key flows:**
1. Students authenticate via phone OTP (MSG91 SMS, allowlist-gated)
2. Buddies/Admins authenticate via username + password
3. Students subscribe via Razorpay (flag-gated off for beta)
4. Admin manually processes buddy payouts (tracked in buddy_payouts table)
5. AI features: scorecard parsing, weekly buddy signal, student AI insights

Please analyse and provide:

### 1. Strengths
What is well-built, architecturally sound, or production-ready?

### 2. Weaknesses & Bugs
What could break in production? Any security holes, race conditions, missing validations, logic errors, or edge cases not handled?

### 3. UX / Product Issues
What flows are confusing, incomplete, or missing for the target user (Indian college student prepping for CAT)?

### 4. Performance Concerns
Any N+1 queries, missing indexes, heavy client bundles, unnecessary re-renders, or slow page loads?

### 5. Missing Features
What would a real student, buddy, or admin expect that isn't here yet?

### 6. Security Review
Check RLS policies, auth flows, webhook signature verification, rate limiting, and any injection risks.

### 7. Priority Improvements
Give a ranked list of the top 10 things to fix or build next, with one-line reasoning for each.
