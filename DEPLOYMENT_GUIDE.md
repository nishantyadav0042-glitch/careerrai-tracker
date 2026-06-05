# CareerRai Dashboard - DEPLOYMENT GUIDE

**Version:** 1.0  
**Date:** June 6, 2026  
**Status:** PRODUCTION READY ✅

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### Code Review
- [ ] All 9 phases complete and tested
- [ ] TypeScript: 0 errors
- [ ] Build passes: `npm run build`
- [ ] No console errors in dev mode
- [ ] All environment variables documented
- [ ] Git history clean with semantic commits

### Database
- [ ] All 4 migrations created
- [ ] RLS policies configured
- [ ] Storage buckets defined
- [ ] Test data prepared (optional)

### Environment Setup
- [ ] `.env.local` configured locally
- [ ] `.env.production` ready for deployment
- [ ] Supabase project created
- [ ] Vercel project created
- [ ] API keys secured in secrets manager

### Testing
- [ ] Manual testing on Chrome/Safari/Firefox
- [ ] Mobile testing (iPhone/Android)
- [ ] Login flow tested
- [ ] Student onboarding completed
- [ ] Buddy dashboard accessed
- [ ] Voice notes recorded and played
- [ ] Analytics load without errors

---

## 🗄️ STEP 1: PREPARE SUPABASE

### 1.1 Create Supabase Project
```bash
# Go to https://supabase.com/dashboard
# Click "New Project"
# Project Name: careerrai-production
# Database Password: [STRONG PASSWORD]
# Region: [Select closest to users]
# Create project and wait 2-3 minutes
```

### 1.2 Get Connection Credentials
```bash
# In Supabase Dashboard:
# Settings > Database > Connection Pooling
# Copy:
# - SUPABASE_URL: postgresql://... (postgres://...)
# - SUPABASE_ANON_KEY: eyJhbGc...
# - SUPABASE_SERVICE_ROLE_KEY: eyJhbGc...
```

### 1.3 Apply Database Migrations

```bash
# Method 1: Using Supabase CLI (Recommended)
npm install -g supabase@latest

# Login
supabase login
# Paste API token from https://app.supabase.com/account/tokens

# Link project
supabase link --project-ref [YOUR_PROJECT_ID]

# Push migrations
supabase db push
# This applies all migrations from supabase/migrations/

# Method 2: Manual SQL (If CLI doesn't work)
# Copy entire content of each migration file:
# 1. supabase/migrations/001_initial_schema.sql
# 2. supabase/migrations/002_add_username_to_profiles.sql
# 3. supabase/migrations/20260605_add_streak_and_alerts_tables.sql
# 4. supabase/migrations/20260605_enhance_mock_drop_alerts.sql

# Paste into Supabase SQL Editor (Dashboard > SQL Editor > New Query)
# Run each one in order
```

### 1.4 Create Storage Buckets

```sql
-- In Supabase SQL Editor, run:

-- Bucket 1: Buddy Intro Audio
INSERT INTO storage.buckets (id, name, public)
VALUES ('buddy-intros', 'buddy-intros', true);

-- Bucket 2: Voice Notes
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', true);

-- Set policies
CREATE POLICY "Public Read" ON storage.objects
  FOR SELECT USING (bucket_id = 'buddy-intros' OR bucket_id = 'voice-notes');

CREATE POLICY "Authenticated Upload" ON storage.objects
  FOR INSERT WITH CHECK (
    (bucket_id = 'buddy-intros' AND auth.role() = 'authenticated')
    OR
    (bucket_id = 'voice-notes' AND auth.role() = 'authenticated')
  );
```

### 1.5 Verify RLS Policies

```bash
# In Supabase Dashboard > Authentication > Policies
# Verify these exist for each table:
# - Students can only see their own data
# - Buddies can see assigned students' data
# - Admins can see all data

# If missing, they were auto-created by migrations
# If not, re-run the migration SQL
```

### 1.6 Test Database Connection

```bash
# Create test file: test-supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

const { data } = await supabase.from('profiles').select('count(*)')
console.log('✅ Database connected:', data)
```

---

## 🌐 STEP 2: CONFIGURE ENVIRONMENT VARIABLES

### 2.1 Local Development (.env.local)

```bash
# Create: .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Vercel (from Vercel Dashboard)
VERCEL_URL=https://careerrai-daily.vercel.app

# Claude API (from Anthropic)
ANTHROPIC_API_KEY=sk-ant-...

# Admin Client (for seed scripts only)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### 2.2 Production Environment (Vercel)

```bash
# Go to: https://vercel.com/dashboard
# Select your project
# Settings > Environment Variables

# Add:
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
ANTHROPIC_API_KEY=sk-ant-...
```

⚠️ **NEVER commit .env files to git**

```bash
# Verify .gitignore contains:
.env.local
.env.*.local
.env.production
```

---

## 🚀 STEP 3: DEPLOY TO VERCEL

### 3.1 Connect Repository

```bash
# Option 1: Via Vercel Dashboard
# 1. Go to https://vercel.com/new
# 2. Import GitHub repository
# 3. Select: careerrai-tracker
# 4. Click "Import"

# Option 2: Via Vercel CLI
npm install -g vercel
vercel link
vercel
```

### 3.2 Deploy

```bash
# Automatic: Every push to main branch auto-deploys
git push origin main

# Manual:
vercel --prod
```

### 3.3 Verify Deployment

```bash
# Check deployment status
# Dashboard > Deployments > [Latest]
# Status should be: ✅ Ready

# Visit live site
# https://careerrai-daily.vercel.app

# Check for errors
# Dashboard > Functions > Logs
# Should show: no errors
```

---

## 👥 STEP 4: CREATE INITIAL DATA

### 4.1 Admin User

```sql
-- In Supabase > SQL Editor

INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  role,
  created_at
) VALUES (
  gen_random_uuid(),
  'admin@careerrai.com',
  crypt('SecureAdminPassword123!', gen_salt('bf')),
  now(),
  '{"role":"admin"}',
  'authenticated',
  now()
);

-- Get the user ID and add to profiles
INSERT INTO profiles (
  id,
  email,
  full_name,
  role,
  created_at
) VALUES (
  [USER_ID_FROM_ABOVE],
  'admin@careerrai.com',
  'CareerRai Admin',
  'admin',
  now()
);
```

### 4.2 Test Student & Buddy

```bash
# Use CSV import via Admin Dashboard
# See: BULK_IMPORT_GUIDE.md

# Or manually in SQL:
-- Create test buddy
INSERT INTO profiles (email, full_name, role, college, cat_percentile)
VALUES (
  'testbuddy@careerrai.com',
  'Test Buddy IIM',
  'buddy',
  'IIM Ahmedabad',
  98.5
);

-- Create test student
INSERT INTO profiles (email, full_name, role, buddy_id)
VALUES (
  'teststudent@careerrai.com',
  'Test Student',
  'student',
  [BUDDY_ID]
);
```

### 4.3 Test Login

```bash
# Visit: https://careerrai-daily.vercel.app/login
# Test Credentials:
# Email: teststudent@careerrai.com
# Password: [whatever you set]

# Should see: Student home page
# Should see: Onboarding modal (if first login)
```

---

## 🔒 STEP 5: SECURITY HARDENING

### 5.1 Enable Supabase Security Features

```bash
# 1. Enable MFA (optional but recommended)
# Dashboard > Authentication > MFA
# Enable for admin users

# 2. Configure Email Verification
# Dashboard > Authentication > Email
# Enable: Confirm email before signing in

# 3. Set Password Requirements
# Dashboard > Authentication > Policies
# Min length: 8 characters
# Require special characters: true

# 4. Rate Limiting
# Dashboard > Settings > API Rate Limiting
# Enable: Limit to 100 requests/min per IP
```

### 5.2 API Security

```bash
# 1. Restrict CORS
# Supabase > Settings > API > CORS
# Add allowed origins:
# - https://careerrai-daily.vercel.app
# - https://careerrai.vercel.app (custom domain)

# 2. Row Level Security
# All tables should have RLS enabled ✅ (done by migrations)

# 3. API Keys Rotation
# Dashboard > Settings > API > Key Rotation
# Set: Rotate every 90 days
```

### 5.3 Monitoring

```bash
# Set up alerts in Supabase
# Dashboard > Logs > Configure Alerts

# Alert on:
# - Database errors
# - Auth failures (>10 in 5 min)
# - Unusual queries
# - API key usage spikes
```

---

## 📊 STEP 6: MONITORING & LOGS

### 6.1 Vercel Analytics

```bash
# Dashboard > Analytics
# Monitor:
# - Page load times
# - API response times
# - Error rates
# - User sessions

# Set alerts for:
# - Response time > 3s
# - Error rate > 1%
# - Database connection failures
```

### 6.2 Supabase Logs

```bash
# Dashboard > Logs > Database
# Monitor SQL queries
# Look for slow queries (>1s)

# Dashboard > Logs > Auth
# Monitor login failures
# Alert on multiple failed attempts
```

### 6.3 Application Logs

```bash
# Vercel > Functions > Logs
# View real-time logs from:
# - /api/buddy-insight
# - /api/auth/logout
# - Other API routes

# Look for:
# - Claude API errors
# - Database connection issues
# - Authentication failures
```

---

## ✅ STEP 7: POST-LAUNCH VALIDATION

### 7.1 Smoke Tests

Run these within 1 hour of launch:

```bash
# 1. Login as student
curl -X POST https://careerrai-daily.vercel.app/api/auth/login \
  -d "email=teststudent@careerrai.com&password=..."

# 2. Fetch home page
curl https://careerrai-daily.vercel.app/student/home

# 3. Create daily report
curl -X POST https://careerrai-daily.vercel.app/api/daily-log \
  -H "Authorization: Bearer $TOKEN" \
  -d "study_duration=2&topics_covered=Quant"

# 4. Get buddy insight
curl https://careerrai-daily.vercel.app/api/buddy-insight

# Expected: All return 200 status
```

### 7.2 User Flow Testing

- [ ] Student signup → onboarding → home
- [ ] Student logs daily report → confetti shows
- [ ] Buddy login → views assigned students
- [ ] Buddy records voice note → student receives
- [ ] Student views journey timeline
- [ ] Analytics dashboard loads
- [ ] Mobile: All flows work on iOS/Android

### 7.3 Performance Baselines

```
Metric              Target    Actual
Page Load (LCP)     < 2.5s    ___
Cumulative Shift    < 0.1     ___
Time to Interactive < 3.5s    ___
API Response Time   < 200ms   ___
Database Query      < 100ms   ___
```

---

## 🚨 ROLLBACK PLAN

If critical issues occur after launch:

### Immediate Actions (within 5 minutes)
```bash
# 1. Pause traffic to new version
vercel rollback careerrai-daily

# 2. Verify previous version is live
curl https://careerrai-daily.vercel.app/api/health

# 3. Notify team
# Slack: #engineering-alerts
```

### Investigation (5-30 minutes)
```bash
# 1. Check error logs
# Vercel Dashboard > Functions > Logs

# 2. Check database
# Supabase Dashboard > Logs > Database

# 3. Check API health
# Anthropic status page
```

### Fix & Redeploy
```bash
# 1. Fix issue in code
git commit -am "Fix: [issue]"

# 2. Push to main
git push origin main

# 3. Vercel auto-deploys
# Wait 2-3 minutes for new build

# 4. Re-run smoke tests
# See Step 7.1 above
```

---

## 📞 SUPPORT & ESCALATION

### During Launch (First 24 Hours)
- **Critical Issues:** Slack #engineering-urgent
- **Team:** Full team on standby
- **Monitoring:** Active (check every 30 min)

### First Week
- **Daily Reports:** 9 AM team sync
- **Monitoring:** Check dashboards 3x daily
- **User Feedback:** Monitor for issues

### First Month
- **Weekly Reviews:** Performance metrics
- **User Surveys:** Collect feedback
- **Optimization:** Fine-tune based on data

---

## 📚 REFERENCE DOCS

- [Supabase Docs](https://supabase.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Vercel Docs](https://vercel.com/docs)
- [Anthropic API](https://docs.anthropic.com)

---

## ✨ SUCCESS CRITERIA

Launch is successful when:

✅ **Technical**
- [ ] All pages load < 3s
- [ ] No TypeScript errors in production
- [ ] Database migrations applied
- [ ] Storage buckets created
- [ ] API routes responding

✅ **Functional**
- [ ] Student signup works
- [ ] Onboarding completes
- [ ] Daily logs can be submitted
- [ ] Voice notes record and play
- [ ] Analytics load data

✅ **Security**
- [ ] RLS policies enforced
- [ ] API keys secured
- [ ] CORS configured
- [ ] SSL certificate valid
- [ ] No sensitive data in logs

✅ **Performance**
- [ ] LCP < 2.5s
- [ ] CLS < 0.1
- [ ] TTI < 3.5s
- [ ] API response < 200ms

---

## 🎉 LAUNCH CHECKLIST

```bash
# Run this before launching:
npm run build            # ✅ Build succeeds
npm run type-check      # ✅ No TS errors
vercel --prod          # ✅ Deploy to production
# Wait 3 minutes...
curl https://careerrai-daily.vercel.app  # ✅ Site loads
# Check all smoke tests above
echo "🚀 LAUNCH READY"
```

---

**CONGRATULATIONS! 🎊 CareerRai Dashboard is now LIVE!**

Next steps:
1. Monitor metrics for 24 hours
2. Collect user feedback
3. Plan Phase 10: Advanced features
4. Celebrate with the team! 🎉
