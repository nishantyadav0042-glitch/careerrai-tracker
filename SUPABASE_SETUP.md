# Supabase Voice Recording Setup Guide

## Step 1: Run Database Migrations

Execute this SQL in your Supabase SQL Editor (Copy & Paste):

```sql
-- Add voice note support to buddy_feedback table
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
```

## Step 2: Create Storage Bucket

1. Go to **Supabase Dashboard**
2. Click **Storage** (left sidebar)
3. Click **Create New Bucket**
4. Name: `voice-notes`
5. Select **Public** bucket
6. Click **Create**

## Step 3: Set Storage Bucket Policies

In Supabase, go to **Storage → voice-notes → Policies**

Copy and paste these policies:

### Policy 1: Allow uploads
```sql
CREATE POLICY "Allow authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'voice-notes');
```

### Policy 2: Allow public reads
```sql
CREATE POLICY "Allow public reads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'voice-notes');
```

## Step 4: Verify Setup

1. Open the app at `/student/home`
2. Look for "Buddy Feedback" section (top)
3. Look for "Your Voice Notes" section (below feedback)
4. Click "Record voice response" or "Record new note"
5. Record a test message (5 seconds)
6. Click "Send Voice Note"
7. Check if it uploads without error

## Troubleshooting

If you see "Failed to send voice note":

### Check 1: Storage Bucket Exists
```
Supabase Dashboard → Storage → voice-notes bucket visible?
```

### Check 2: Bucket is Public
```
Storage → voice-notes → Settings → Visibility = Public?
```

### Check 3: Policies are Set
```
Storage → voice-notes → Policies → Check both policies exist
```

### Check 4: Browser Console Error
```
Open DevTools (F12) → Console tab
Record a voice note and check for error messages
```

### Check 5: Microphone Permission
```
Browser settings → Permissions → Microphone enabled for this site?
```

## Testing Checklist

- [ ] Database columns added (voice_note_url, feedback_type)
- [ ] voice-notes bucket created
- [ ] Bucket is PUBLIC
- [ ] Policies are set
- [ ] Student can record voice note (no error)
- [ ] Audio uploads to storage (check Storage tab)
- [ ] Voice note appears in buddy's feedback
- [ ] Buddy can record voice feedback (no error)
- [ ] Voice feedback appears in student's buddy feedback card

---

## Quick Reference: Where Voice Features Are

**Student Homepage:**
- Buddy Feedback Card (top) - shows buddy feedback + audio playback
- Your Voice Notes Card (below) - record and manage personal voice notes

**Buddy Dashboard:**
- Student Voice Notes Section (top) - see which students have voice notes
- Click student → can record voice feedback in student view

---

If you have any issues after following these steps, check the browser console for specific error messages!
