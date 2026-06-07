# 🎙️ Voice Recording Setup - Choose Your Method

## OPTION 1: Automated Setup (Easiest) ⭐ RECOMMENDED

### For Windows (PowerShell):
```powershell
# Run this in PowerShell in the project directory:
.\setup-voice-system.ps1
```

### For Mac/Linux (Bash):
```bash
# Run this in terminal in the project directory:
bash setup-voice-system.sh
```

**What it does:**
1. Asks for your Supabase URL and API key
2. Runs database migration automatically
3. Creates storage bucket automatically
4. Sets up storage policies automatically
5. ✅ Done! System ready to test

**Time:** 2 minutes

---

## OPTION 2: Manual Setup (Transparent)

### Step 1: Database (2 min)

1. Go to https://supabase.com → Your Project → SQL Editor
2. Copy ALL text from: `supabase/migrations/005_add_voice_notes_to_feedback.sql`
3. Paste in SQL Editor
4. Click **RUN**

### Step 2: Storage Bucket (3 min)

1. Go to **Storage** in Supabase
2. Click **Create New Bucket**
3. Name: `voice-notes` (exactly)
4. Select: **Public** bucket
5. Click **Create**

### Step 3: Storage Policies (3 min)

Open `voice-notes` bucket → **Policies** tab

**Add Policy 1:**
```sql
CREATE POLICY "Allow authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'voice-notes');
```

**Add Policy 2:**
```sql
CREATE POLICY "Allow public reads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'voice-notes');
```

**Time:** 8 minutes

---

## OPTION 3: Provide Me Access (No Setup Required)

If you provide your Supabase API key, I can:
1. Run migrations for you
2. Create storage bucket
3. Set up policies
4. Verify everything works

**Your choice:** Keep your key safe, or let me automate?

---

## ✅ Verification (All Options)

Once setup is complete (any option above):

1. Open: https://careerrai-daily.vercel.app/admin/voice-test
2. All tests should show ✓ (green)
3. Run manual upload test
4. ✅ Ready!

---

## 🚀 Quick Summary

| Option | Time | Effort | Safety |
|--------|------|--------|--------|
| **Automated Script** | 2 min | None | Safe (sends to your Supabase) |
| **Manual Copy-Paste** | 8 min | Low | Transparent |
| **Provide API Key** | 0 min | None | Your choice |

---

## Choose One and Tell Me! 🎙️

1. Run `.\setup-voice-system.ps1` (Windows) or `bash setup-voice-system.sh` (Mac/Linux)
2. OR follow manual steps 1-3 above
3. OR provide API key and I'll do it

**Then open `/admin/voice-test` to verify everything works!**
