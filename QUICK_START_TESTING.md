# Quick Start: Voice Recording Testing Guide

**Time Required:** 20-30 minutes for full test  
**What You Need:** Browser + Vercel link + Demo credentials  

---

## ⚡ Fast Track (5 minutes)

### 1. Open Vercel App
Go to: https://careerrai-daily.vercel.app

### 2. Log In As Student
- Username: `aarav`
- Password: `CareerRai2026!`

### 3. Go to Home Page
- You should see your dashboard with "Daily Report" and "Buddy Feedback" sections

### 4. Look for Buddy Feedback Card
- Should show feedback from your buddy
- Should have a "Record voice response" button

### 5. Try Recording
- Click "Record voice response"
- Record 5 seconds of audio
- Click "Send"
- Should see success message

### ✅ If it works: Proceed to Full Testing (below)  
### ❌ If it fails: Jump to Troubleshooting section

---

## 🧪 Full Testing (30 minutes)

You'll need **2 browser windows open side by side:**
- Window 1: Student (Aarav)
- Window 2: Buddy (Nishant)

### Step 1: Open 2 Windows
1. Open https://careerrai-daily.vercel.app in Window 1
2. Open https://careerrai-daily.vercel.app in Window 2 (in another window/tab)

### Step 2: Log In As Student (Window 1)
- Username: `aarav`
- Password: `CareerRai2026!`

### Step 3: Log In As Buddy (Window 2)
- Username: `nishant`
- Password: `CareerRai2026!`

---

## 📝 Test A: Buddy Records Feedback

**Window 2 (Buddy: Nishant)**

1. Click on "Students" or navigate to students list
2. Find "Aarav Sharma" or any student
3. Click to open the student view
4. Look for a "Voice Note" button (usually floating on the right side)
5. Click "Voice Note"
6. **Record 5-10 seconds** of audio (say something like "Great work this week")
7. Click "Send"
8. **Wait for upload** → Should see "Success" or "Recording saved"

**Expected:** ✅ Audio uploads without errors

**If Failed:** Go to Troubleshooting section below

---

## 📝 Test B: Student Sees Buddy Feedback

**Window 1 (Student: Aarav)**

1. Refresh the page (press F5 or Cmd+R)
2. Wait for page to load
3. Look for the buddy feedback section
4. **Should see a new feedback card** with the audio you just recorded
5. Click the play button to verify audio works
6. Audio should play back

**Expected:** ✅ New feedback appears with audio

**If Not Appearing:**
- Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
- Wait 2-3 seconds
- Check if data appears

**If Still Not:** Go to Troubleshooting section

---

## 📝 Test C: Student Records Response

**Window 1 (Student: Aarav)**

1. Find the buddy feedback card (from Test B)
2. Look for "Record voice response" button
3. Click "Record voice response"
4. **Record 5-10 seconds** (say something like "Thanks for the feedback")
5. Click "Send"
6. **Wait for upload** → Should see success message

**Expected:** ✅ Response uploads successfully

**If Failed:** Go to Troubleshooting section

---

## 📝 Test D: Buddy Sees Student Response

**Window 2 (Buddy: Nishant)**

1. Stay on the student view (should still have Aarav open)
2. Refresh the page (press F5)
3. Look for "Student Responses" section or similar
4. **Should see the response audio** you just recorded
5. Click play to verify audio works

**Expected:** ✅ Student response appears with audio

**If Not Appearing:**
- Hard refresh: Ctrl+Shift+R
- Wait 2-3 seconds
- Check data

---

## 📝 Test E: Verify Audio Attribution

**Window 1 (Student)**

1. Make sure you see:
   - ✅ Buddy's feedback (in "Buddy Feedback" section)
   - ❌ NOT anything labeled as "My Recordings" or "My Feedback"
   - ✅ Your response appears (in same feedback card)

**Window 2 (Buddy)**

1. Make sure you see:
   - ✅ Student's response (in student view)
   - ✅ Your own feedback (that you recorded)
   - ❌ NOT any student recordings as if they were buddy's own

**Expected:** ✅ Each person sees only appropriate recordings

---

## 🔧 Troubleshooting

### "Recording button is hidden" or doesn't appear

**Check:**
1. Are you logged in? (Check top-right for username)
2. Do you see the buddy feedback section? (Scroll down if needed)
3. Try F5 to refresh the page
4. Try Ctrl+Shift+R to hard refresh

**If still not:**
1. Open browser console: Press F12
2. Go to "Console" tab
3. Look for red error messages
4. Take a screenshot and document the error

---

### "Recording won't start" or microphone error

**Check Browser Permissions:**
1. Click 🔒 lock icon in address bar (next to URL)
2. Look for "Microphone" setting
3. If it says "Block" → Change to "Allow"
4. Refresh the page
5. Try recording again

**If using localhost:3000:**
- HTTPS required for microphone
- localhost exceptions may apply
- Vercel (https) always works

---

### "Upload works but audio doesn't appear"

**Wait and Refresh:**
1. Wait 2-3 seconds (upload takes time)
2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. Check if audio appears now

**Check Developer Tools:**
1. Press F12 → Network tab
2. Refresh page
3. Look for request to `/buddy_feedback`
4. Response should show your new recording
5. If you see row count: 0 → data not in database

---

### "Audio file won't play / 404 error"

**Check:**
1. File was uploaded (check response in Network tab)
2. Try hard refresh: Ctrl+Shift+R
3. Wait 5 seconds
4. Try playing audio again

**If still 404:**
- File may not have uploaded correctly
- Check browser console for errors during upload
- Contact support if issue persists

---

### "See other student's data" or "Cross-visibility issue"

**This is a BUG** - immediately document and report:
1. Screenshot of what you see
2. Which user is logged in
3. What data you're seeing that you shouldn't
4. Submit to team for investigation

---

## ✅ Verification Checklist

Once all tests A-E pass, verify:

- [ ] Recording button shows correct text:
  - Student: "Record voice response"
  - Buddy: "Voice Note" or "Record feedback"

- [ ] Audio files upload successfully (no 403/404 errors)

- [ ] Audio plays back correctly without errors

- [ ] Student sees ONLY:
  - Buddy's feedback (what buddy recorded)
  - NOT anything as "buddy feedback" that they recorded

- [ ] Buddy sees:
  - Their own feedback to the student
  - Student's responses
  - NOT student's own recordings as their feedback

- [ ] No buttons/options for:
  - Student to "record feedback" (only responses)
  - Buddy to "record as student"

---

## 📊 Test Result Template

Copy and fill in:

```
TEST DATE: ___________
TESTED ON: https://careerrai-daily.vercel.app

TEST A (Buddy Records): ✅ PASS / ❌ FAIL
TEST B (Student Sees): ✅ PASS / ❌ FAIL
TEST C (Student Records): ✅ PASS / ❌ FAIL
TEST D (Buddy Sees): ✅ PASS / ❌ FAIL
TEST E (Attribution): ✅ PASS / ❌ FAIL

FAILURES:
[List any failures here]

ERRORS:
[Any error messages from console]

NOTES:
[Any other observations]
```

---

## 🎯 Success Criteria

### All tests pass (5/5) → ✅ SYSTEM WORKING
- Feature is complete
- No further action needed
- Users can start using voice recording

### Some tests fail → 🔧 DEBUG NEEDED
- Document which tests failed
- Check troubleshooting section
- Report specific errors
- System needs fixes before release

### Many tests fail → ❌ MAJOR ISSUE
- Check network connectivity
- Verify database migrations ran
- Check Supabase status
- Contact support if persistent

---

## 🆘 If You Get Stuck

**For Microphone Issues:**
- Make sure you granted browser permission
- Try a different browser
- Restart browser

**For Upload Issues:**
- Check internet connection
- Open DevTools → Network tab
- Look for failed uploads
- Note the error response

**For Data Not Appearing:**
- Hard refresh (Ctrl+Shift+R)
- Wait 3-5 seconds
- Check browser console (F12)
- Look for RLS policy errors

**For Other Issues:**
- Open browser console (F12 → Console)
- Copy any red error messages
- Take a screenshot
- Share with development team

---

## Demo Credentials (If Needed)

| Role | Username | Password |
|------|----------|----------|
| Student 1 | `aarav` | `CareerRai2026!` |
| Student 2 | `priya` | `CareerRai2026!` |
| Buddy | `nishant` | `CareerRai2026!` |
| Admin | `admin` | `CareerRai2026!` |

All use the same password. If login fails:
- Check your internet connection
- Wait a few seconds and try again
- Try a different user

---

## 🎉 When Tests Pass

You're done! The voice recording system is working correctly.

Next steps:
1. Document the test results
2. Share with team that feature is ready
3. Do a final smoke test on mobile (optional)
4. Deploy to production if not already live

---

**Time Estimate:**
- Fast Track: 5 minutes
- Full Testing: 30 minutes
- With Troubleshooting: 45 minutes

**Start Now:** https://careerrai-daily.vercel.app
