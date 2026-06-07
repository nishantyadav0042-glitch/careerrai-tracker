# 🎙️ Audio Auto-Cleanup Setup Guide

**Automatic deletion of voice notes older than 10 days**

Prevent storage bloat by automatically deleting old voice messages. This guide shows how to set up daily cleanup.

---

## 📋 Overview

- **Retention Period:** 10 days
- **What Gets Deleted:** Voice notes older than 10 days from creation
- **Storage Saved:** ~50KB per audio file deleted
- **Frequency:** Daily (configurable)
- **Safety:** Can be paused/disabled anytime

---

## 🚀 Quick Setup (Choose One Option)

### Option 1: Vercel Cron (Recommended for Vercel Deploy)

**Easiest if using Vercel**

1. Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/admin/cleanup-voice-notes",
    "schedule": "0 2 * * *"
  }]
}
```

2. This runs cleanup daily at 2 AM UTC

**That's it! Vercel handles the rest.**

---

### Option 2: GitHub Actions (Free & Reliable)

**Works with any deployment**

1. Create `.github/workflows/cleanup-voice-notes.yml`:

```yaml
name: Daily Voice Notes Cleanup
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily
  workflow_dispatch:     # Manual trigger

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install @supabase/supabase-js
      
      - name: Run cleanup
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: node scripts/cleanup-voice-notes.js
```

2. Add secrets to GitHub:
   - Go to Settings → Secrets and variables → Actions
   - Add `SUPABASE_URL`
   - Add `SUPABASE_SERVICE_ROLE_KEY`

3. Done! GitHub runs the cleanup daily at 2 AM UTC

---

### Option 3: Manual Cleanup Script

**For any environment**

```bash
# Run once
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
node scripts/cleanup-voice-notes.js
```

**Schedule with cron (Linux/Mac):**
```bash
# Edit crontab
crontab -e

# Add this line (daily at 2 AM)
0 2 * * * cd /path/to/careerrai && SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/cleanup-voice-notes.js
```

**Schedule with Task Scheduler (Windows):**
1. Open Task Scheduler
2. Create Basic Task
3. Name: "Voice Notes Cleanup"
4. Trigger: Daily at 2 AM
5. Action: Run `node.exe` with arguments: `C:\path\to\scripts\cleanup-voice-notes.js`
6. Set environment variables before running

---

### Option 4: Supabase Edge Functions (Advanced)

**If you want it in Supabase**

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Create edge function:
```bash
supabase functions new cleanup-voice-notes
```

3. Add function code (uses cleanup library)

4. Schedule with `pg_cron` in Supabase:
```sql
SELECT cron.schedule('delete-old-voice-notes', '0 2 * * *', 'SELECT delete_old_voice_notes()');
```

---

## 📊 Monitoring Cleanup

### View Cleanup Statistics
```bash
curl -X GET https://careerrai-daily.vercel.app/api/admin/cleanup-voice-notes \
  -H "Authorization: Bearer {admin_token}"
```

Response:
```json
{
  "success": true,
  "stats": {
    "totalVoiceNotes": 150,
    "oldVoiceNotes": 23,
    "estimatedStorageGB": "7.32",
    "estimatedOldStorageGB": "1.12"
  }
}
```

### Manual Cleanup Trigger
```bash
curl -X POST https://careerrai-daily.vercel.app/api/admin/cleanup-voice-notes \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "message": "Voice notes cleanup completed",
  "filesDeleted": 23,
  "recordsDeleted": 23,
  "durationMs": 1234
}
```

---

## ⚙️ Configuration

### Change Retention Period

Edit `src/lib/voice-cleanup.ts`:
```typescript
const AUDIO_RETENTION_DAYS = 10;  // Change this to desired days
```

Or in API route:
```typescript
const AUDIO_RETENTION_DAYS = 10;
```

### Change Schedule Time

**Vercel:**
```json
{
  "crons": [{
    "path": "/api/admin/cleanup-voice-notes",
    "schedule": "0 3 * * *"  // 3 AM UTC instead of 2 AM
  }]
}
```

**GitHub Actions:**
```yaml
schedule:
  - cron: '0 3 * * *'  # 3 AM UTC
```

**Cron Syntax:**
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
0 2 * * *

Common schedules:
0 2 * * *     = Daily at 2 AM UTC
0 2 * * 0     = Weekly on Sunday at 2 AM UTC
0 2 1 * *     = Monthly on 1st at 2 AM UTC
*/6 * * * *   = Every 6 hours
```

---

## 🔍 Understanding Cleanup

### What Happens During Cleanup

1. **Find Old Files**
   - Queries database for voice notes older than 10 days
   - Based on `created_at` timestamp

2. **Delete from Storage**
   - Removes audio files from `voice-notes` bucket
   - Files are permanently deleted (no recovery)

3. **Delete from Database**
   - Removes corresponding records from `buddy_feedback` table
   - Frees up database storage

4. **Log Results**
   - Records files deleted
   - Reports any errors
   - Updates storage statistics

### Example Timeline

```
Day 1:   Student records voice note
Days 1-10: Message visible to buddy
Day 11:  Cleanup runs at 2 AM
         - File deleted from storage
         - Record deleted from database
         - Storage freed
```

---

## 📈 Storage Impact

### Before Cleanup
- 500 students × 2 voice notes/day = 1,000 notes/day
- After 30 days: 30,000 notes
- Estimated size: 30,000 × 50KB = ~1.5 GB

### After Cleanup (10-day retention)
- 10 days × 1,000 notes/day = 10,000 notes max
- Estimated size: 10,000 × 50KB = ~500 MB
- **Savings: 66% storage reduction**

### Cost Savings
- Supabase storage: $0.06 per GB
- Monthly saving: ~$0.054 (1 GB saved per month)
- Yearly saving: ~$0.65
- **Plus:** Better performance with less data

---

## ⚠️ Important Notes

### Data Loss Warning
🚨 **Files deleted by cleanup are PERMANENT**
- Cannot be recovered after deletion
- User gets 10 days to save/listen to messages
- Then automatically deleted

### Recommendations
1. **Notify Users** - Tell students/buddies about 10-day retention
2. **Test First** - Run cleanup manually on a test account
3. **Monitor First Week** - Watch logs to ensure it's working
4. **Have Backup** - Periodic database backups recommended

---

## 🔧 Troubleshooting

### Cleanup Not Running
**Check:**
1. Cron schedule is correct
2. Environment variables set
3. Service role key is valid
4. Check logs in Vercel/GitHub

**Fix:**
```bash
# Test manually
NEXT_PUBLIC_SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/cleanup-voice-notes.js
```

### Storage Not Freed
**Check:**
1. Verify files deleted from `voice-notes` bucket
2. Check database records were deleted
3. Look for error messages in cleanup logs

**Fix:**
```bash
# Manual cleanup
curl -X POST /api/admin/cleanup-voice-notes -H "Authorization: Bearer {token}"
```

### Only Database Deleted, Not Storage
**This is OK** - Storage can be cleaned separately
```bash
# Manual storage cleanup via Supabase CLI
supabase storage objects remove voice-notes {filename}
```

---

## 📋 Verification Checklist

- [ ] Cleanup script created (`scripts/cleanup-voice-notes.js`)
- [ ] API endpoint created (`src/app/api/admin/cleanup-voice-notes/route.ts`)
- [ ] Database migration applied (`006_add_audio_auto_cleanup.sql`)
- [ ] Schedule configured (Vercel/GitHub Actions/Cron)
- [ ] Environment variables set
- [ ] Manual test run successful
- [ ] Monitoring dashboard set up
- [ ] Team notified about retention policy

---

## 📞 Support

**Testing cleanup manually:**
```bash
npm install @supabase/supabase-js
node scripts/cleanup-voice-notes.js
```

**Checking status:**
- Vercel: Check deployment logs
- GitHub Actions: Check workflow runs
- Manual: Review console output

**Disabling cleanup:**
- Remove from Vercel cron config
- Disable GitHub workflow
- Delete scheduled cron task

---

## 🎉 Summary

You now have automatic daily cleanup of voice notes:
- ✅ Prevents storage bloat
- ✅ Reduces costs
- ✅ Improves performance
- ✅ Maintains 10-day retention
- ✅ Fully automated
- ✅ Can be monitored/controlled

The system will automatically delete voice notes older than 10 days, keeping storage lean and efficient!

