# 🧪 CareerRai Testing Plan

**Goal:** Verify all 3 dashboards work with real users  
**Duration:** 1-2 hours  
**Users:** 10 test accounts (5 students + 2 buddies + admin already exists)

---

## **Step 1: Create Test Users**

### 📝 Import Test CSV

Use this test data - file: `test-users.csv`

```csv
full_name,email,phone,role,exam_target,buddy_email,username,password
Test Student 1,teststudent1@careerrai.com,+91-9000000001,student,CAT,testbuddy1@careerrai.com,teststudent1,Test@1234
Test Student 2,teststudent2@careerrai.com,+91-9000000002,student,CAT,testbuddy1@careerrai.com,teststudent2,Test@2345
Test Student 3,teststudent3@careerrai.com,+91-9000000003,student,CAT,testbuddy2@careerrai.com,teststudent3,Test@3456
Test Student 4,teststudent4@careerrai.com,+91-9000000004,student,CAT,testbuddy2@careerrai.com,teststudent4,Test@4567
Test Student 5,teststudent5@careerrai.com,+91-9000000005,student,CAT,,teststudent5,Test@5678
Test Buddy 1,testbuddy1@careerrai.com,+91-9000000010,buddy,,testbuddy1,Test@buddy1
Test Buddy 2,testbuddy2@careerrai.com,+91-9000000011,buddy,,testbuddy2,Test@buddy2
```

### 📱 How to Import

**On your phone:**

1. Go to: https://careerrai-daily.vercel.app/login
2. Login as admin:
   - Username: `admin`
   - Password: `CareerRai2026!`
3. Go to **Admin Dashboard** → **Data Management**
4. Copy the CSV data above into a text file
5. Upload the file
6. You should see: ✅ **7 Successfully Created**

---

## **Step 2: Test Student Dashboard**

### 🧑‍🎓 Login as Student

**Credentials:**
- Username: `teststudent1`
- Password: `Test@1234`

### ✅ Checklist

**Home Page (`/student/home`)**
- [ ] Can see "Your Progress" section
- [ ] Can see study streak
- [ ] Can see today's prep time
- [ ] Can see assigned buddy: "Test Buddy 1"

**Reports Page (`/student/reports`)**
- [ ] Can click "Add Report"
- [ ] Can fill in study duration
- [ ] Can select topics (Quant, Verbal, etc.)
- [ ] Can set quality focus (1-5 slider)
- [ ] Can add notes
- [ ] Can submit report
- [ ] Report appears in list

**Exams Page (`/student/exams`)**
- [ ] Can see "CAT Readiness Test" (only CAT, no CUET)
- [ ] Can click "Take Test"
- [ ] Can answer 10 questions
- [ ] Can get percentile score
- [ ] Can see score saved

**Profile Page (`/student/profile`)**
- [ ] Can see: name, email, phone, exam target (CAT)
- [ ] Can see buddy: "Test Buddy 1"
- [ ] Can change password
- [ ] Can toggle notifications

---

## **Step 3: Test Buddy Dashboard**

### 👥 Login as Buddy

**Credentials:**
- Username: `testbuddy1`
- Password: `Test@buddy1`

### ✅ Checklist

**Students Page (`/buddy/students`)**
- [ ] Can see 2 students assigned:
  - Test Student 1
  - Test Student 2
- [ ] Each shows:
  - Study hours last 7 days
  - Performance score (CAT)
  - Last report date
  - Click to view details

**Student Detail Page (`/buddy/students/[id]`)**
- [ ] Can see all student reports (30-day view)
- [ ] Can see charts:
  - Study duration trend
  - Quality focus
  - Stress level
- [ ] Can click "Add Feedback"
- [ ] Can write feedback comment
- [ ] Can rate (1-5 stars)
- [ ] Can select next steps
- [ ] Can submit feedback
- [ ] Feedback appears in list

**Trends Page (`/buddy/trends`)**
- [ ] Can see all 2 students' trends
- [ ] Can filter by study duration
- [ ] Can see overall performance

**Profile Page (`/buddy/profile`)**
- [ ] Can see buddy info
- [ ] Can change password

---

## **Step 4: Test Admin Dashboard**

### 🔑 Login as Admin

Already logged in. Go to: https://careerrai-daily.vercel.app/admin

### ✅ Checklist

**Dashboard Home**
- [ ] Can see KPI cards:
  - Students: Should show 12+ (7 test + 5 existing)
  - Reported today: 0 (test users haven't reported yet)
  - Red flags: 0
  - On track: Shows count

**All Students Section**
- [ ] Can see all 7 test students in list
- [ ] Each shows:
  - Score (100/100 initially)
  - Status (Pending)
  - Last report date
  - Assigned buddy dropdown

**Data Management Section**
- [ ] "Import Data" section visible
- [ ] Can download template
- [ ] Can upload CSV again

**Buddies Section**
- [ ] Can see both test buddies
- [ ] Each shows student count (2 each)

---

## **Step 5: Test Full User Flow**

### 📋 Workflow Test (30 minutes)

**As Student (teststudent1):**
1. Login → Student home
2. Click "Submit Report"
3. Fill in:
   - Study duration: 4 hours
   - Topics: Quant (2hr), Verbal (2hr)
   - Quality: 4/5
   - Stress: 3/5
   - Sleep: 8 hours
   - Nutrition: Yes
   - Mock: No
   - Confidence: 4/5
   - Notes: "Good session on number systems"
4. Submit report
5. Go to Reports → See report in list
6. Go to Exams → Take CAT Readiness Test
7. Answer all 10 questions → Get score

**As Buddy (testbuddy1):**
1. Login → Buddy students
2. Click on "Test Student 1"
3. View their reports and charts
4. Click "Add Feedback"
5. Write: "Great progress on quant! Keep up the mock practice."
6. Rate: 4/5
7. Select next steps: "Increase mock frequency", "Focus on weak topics"
8. Submit feedback
9. Go to Trends → See student trend

**As Admin:**
1. Login → Admin dashboard
2. Verify:
   - KPI updated (student count = 12)
   - Student report shows "Today" status
   - Buddy shows 2 students
3. Go to All Students → Find teststudent1
4. Click dropdown → Change buddy to "Test Buddy 2"
5. Verify change saved

---

## **Step 6: Mobile Responsiveness Test**

### 📱 On Phone Browser

**What to Check:**
- [ ] Login page responsive (text readable, buttons clickable)
- [ ] Home page responsive (no horizontal scroll)
- [ ] Report form responsive (inputs fill screen)
- [ ] Charts responsive (visible on small screen)
- [ ] Navigation bottom bar works
- [ ] Dropdown menus work on touch

**Test Devices:**
- [ ] iPhone (iOS)
- [ ] Android phone
- [ ] Tablet (optional)

---

## **Step 7: Performance & Error Check**

### ⚡ Speed Test

**Measure (on phone):**
1. Time to login: Should be < 3 seconds
2. Time to load student home: Should be < 2 seconds
3. Time to submit report: Should be < 2 seconds
4. Time to load admin dashboard: Should be < 3 seconds

**Look for errors:**
- [ ] Open browser console (F12 on desktop, DevTools on mobile)
- [ ] Check for red error messages
- [ ] Network requests should return 200 (not 500)

### 📊 Database Check

**Verify data saved:**
```
Students created: 7
Reports submitted: 1 (from student 1)
Feedback created: 1 (from buddy 1)
```

---

## **Testing Timeline**

| Task | Time | Status |
|------|------|--------|
| Import test users | 5 min | ⏳ |
| Test student flow | 15 min | ⏳ |
| Test buddy flow | 15 min | ⏳ |
| Test admin flow | 10 min | ⏳ |
| Mobile responsiveness | 10 min | ⏳ |
| Performance check | 5 min | ⏳ |
| **TOTAL** | **60 min** | ⏳ |

---

## **Troubleshooting**

### ❌ Login fails
- Check username exists: `SELECT * FROM profiles WHERE username = ?`
- Check password: Try demo account first (admin/CareerRai2026!)
- Check email_confirmed: Should be true in database

### ❌ Report won't submit
- Check student_id in database
- Check no duplicate entry for same date
- Check browser console for error message

### ❌ Charts not showing
- Check if reports exist (need at least 3-4 reports)
- Check dates are correct in database
- Try refreshing page

### ❌ Mobile looks broken
- Check viewport meta tag in HTML
- Try landscape orientation
- Clear browser cache

---

## **Success Criteria**

✅ **Test Passes When:**
1. All 7 test users created successfully
2. Student can login, submit report, take test
3. Buddy can view students, add feedback
4. Admin can view dashboard, assign buddies
5. Mobile is responsive (no horizontal scroll)
6. No errors in browser console
7. All pages load in < 3 seconds
8. Charts display correctly

✅ **Ready for 100 Students When:**
1. Above 8 items all pass
2. All 3 dashboards work
3. No crashes or errors
4. Performance acceptable
5. Data persists after reload

---

## **After Testing**

### ✅ If All Tests Pass:
1. Delete test users (optional)
2. Import real students (100)
3. Send them login credentials
4. Monitor for issues

### ❌ If Tests Fail:
1. Note which test failed
2. Check browser console for error
3. Check database logs
4. Report issue for fixing

---

## **Quick Start (TL;DR)**

```
1. Import test-users.csv to admin dashboard
2. Login as teststudent1 / Test@1234
3. Submit a report → Go to Reports → Verify appears
4. Go to Exams → Take CAT test → Get score
5. Login as testbuddy1 / Test@buddy1
6. View Test Student 1 → Add feedback
7. Login as admin → Verify dashboard shows all data
8. Check on phone → Everything responsive?
9. All good? Ready for 100 real students!
```

---

**Estimated Time:** 1-2 hours (with setup)
**Cost:** $0
**Risk:** Low (test data only)

Ready to test? 🚀
