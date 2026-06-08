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
