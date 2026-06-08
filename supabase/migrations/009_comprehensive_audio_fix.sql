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
