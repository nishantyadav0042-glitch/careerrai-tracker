# 🚀 SUPABASE SETUP - QUICK START GUIDE

**Time Required:** 10-15 minutes  
**Difficulty:** Easy ✅  
**Status:** Automated scripts provided

---

## 🎯 WHAT THIS DOES

Creates a complete Supabase project with:
- ✅ PostgreSQL database
- ✅ All 4 migrations applied (tables, columns, RLS policies)
- ✅ 2 storage buckets (buddy-intros, voice-notes)
- ✅ Environment variables configured
- ✅ Ready for deployment

---

## 📋 PREREQUISITES

```bash
# 1. Install Node.js
# Download from: https://nodejs.org (LTS version)

# 2. Install Supabase CLI
npm install -g supabase@latest

# 3. Create Supabase Account (Free)
# Go to: https://supabase.com
# Sign up with email

# 4. Create Anthropic API Key
# Go to: https://console.anthropic.com/account/keys
# Create new API key (keep it safe)
```

---

## 🚀 INSTALLATION (Choose Your OS)

### Option A: Windows Users
```bash
# 1. Open PowerShell in your project directory
cd C:\Users\shekh\careerrai-tracker

# 2. Run the setup script
.\setup-supabase.bat

# 3. Follow the prompts:
# - Paste your Supabase access token
# - Enter project name (e.g., careerrai-production)
# - Enter database password (strong!)
# - Enter region (e.g., us-east-1)
# - Enter your Supabase URL and anon key when prompted
```

### Option B: Mac/Linux Users
```bash
# 1. Navigate to project
cd ~/careerrai-tracker

# 2. Make script executable
chmod +x setup-supabase.sh

# 3. Run the setup
./setup-supabase.sh

# 4. Follow the prompts (same as Windows)
```

### Option C: Manual Setup (If Scripts Don't Work)

#### Step 1: Create Supabase Project
```
1. Go to: https://supabase.com/dashboard
2. Click "New Project"
3. Fill in:
   - Organization: [Select yours]
   - Project Name: careerrai-production
   - Database Password: [Strong password, 12+ chars]
   - Region: [Choose closest to users]
4. Click "Create new project"
5. Wait 2-3 minutes for it to be ready
```

#### Step 2: Get Your API Keys
```
1. Go to: Dashboard > Settings > API
2. Copy these three keys:
   - SUPABASE_URL: https://[PROJECT_ID].supabase.co
   - SUPABASE_ANON_KEY: eyJhbGc...
   - SUPABASE_SERVICE_ROLE_KEY: eyJhbGc...
3. Keep them safe!
```

#### Step 3: Link Local Project
```bash
cd ~/careerrai-tracker
supabase link --project-ref [YOUR_PROJECT_ID]
```

#### Step 4: Apply Migrations
```bash
supabase db push
```

#### Step 5: Create Storage Buckets
```
1. Go to: Dashboard > SQL Editor > New Query
2. Paste this SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('buddy-intros', 'buddy-intros', true),
  ('voice-notes', 'voice-notes', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Read buddy-intros"
ON storage.objects FOR SELECT
USING (bucket_id = 'buddy-intros');

CREATE POLICY "Public Read voice-notes"
ON storage.objects FOR SELECT
USING (bucket_id = 'voice-notes');

CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

3. Click "Run"
4. Should show "OK" ✅
```

#### Step 6: Create Environment Files
```bash
# Create .env.local with your credentials:
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
ANTHROPIC_API_KEY=sk-ant-...
VERCEL_URL=https://careerrai-daily.vercel.app
```

---

## ✅ VERIFY SETUP

After running the script, verify everything worked:

```bash
# 1. Check migrations applied
supabase db list

# Expected output: All tables should appear
# - profiles
# - daily_reports
# - feedback
# - test_results
# - streak_data
# - mock_drop_alerts
# etc.

# 2. Check storage buckets
# Go to: Dashboard > Storage
# You should see:
# - buddy-intros
# - voice-notes

# 3. Check environment variables
cat .env.local

# Should have:
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 🔑 GET YOUR API KEYS

### Supabase Keys
```
Dashboard > Settings > API > Keys

1. SUPABASE_URL (Project URL)
   Format: https://[PROJECT_ID].supabase.co

2. SUPABASE_ANON_KEY (Anon/Public Key)
   Format: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

3. SUPABASE_SERVICE_ROLE_KEY (Service Role Key - KEEP SECRET!)
   Format: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Claude API Key
```
https://console.anthropic.com/account/keys

1. Click "Create New Key"
2. Name it: careerrai-production
3. Copy the key: sk-ant-...
4. NEVER commit this to git!
```

---

## 📝 UPDATE YOUR .env.local

After getting your keys, update `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Claude API
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Vercel
VERCEL_URL=https://careerrai-daily.vercel.app
```

⚠️ **IMPORTANT:** Never commit .env.local to git!
```bash
# Verify it's in .gitignore
cat .gitignore
# Should contain: .env.local
```

---

## ✨ TEST THE CONNECTION

```bash
# Run the dev server
npm run dev

# Visit: http://localhost:3000/login

# Try to sign up:
# Email: test@example.com
# Password: TestPassword123!

# Expected: Sign up succeeds, you can log in
```

---

## 🚨 TROUBLESHOOTING

### "Supabase CLI not found"
```bash
# Install it:
npm install -g supabase@latest

# Verify:
supabase --version
```

### "Can't login to Supabase"
```bash
# Get a new access token:
# 1. Go to: https://app.supabase.com/account/tokens
# 2. Create new token
# 3. Copy and paste into setup script
```

### "Project creation failed"
```bash
# Try manual creation:
# 1. Go to: https://supabase.com/dashboard
# 2. Click "New Project" manually
# 3. Follow the wizard
```

### "Migrations didn't apply"
```bash
# Check if linked correctly:
supabase projects list

# Should show your project

# Try pushing again:
supabase db push --verbose
```

### "Storage buckets not created"
```bash
# Go to Dashboard > SQL Editor
# Copy SQL from: .supabase/create-buckets.sql
# Paste and run manually
```

### "Environment variables not working"
```bash
# Verify .env.local exists:
ls -la .env.local

# Verify it has your keys:
cat .env.local

# If using npm run dev:
# Restart the server
# Press Ctrl+C and run npm run dev again
```

---

## 🎯 NEXT STEPS AFTER SETUP

### 1. Create Test Users (Optional but recommended)
```bash
# Go to Supabase Dashboard > SQL Editor > New Query
# Paste:

-- Create test buddy
INSERT INTO profiles (id, email, full_name, role, college, cat_percentile)
VALUES (
  gen_random_uuid(),
  'testbuddy@careerrai.com',
  'Test Buddy IIM',
  'buddy',
  'IIM Ahmedabad',
  98.5
);

-- Create test student
INSERT INTO profiles (id, email, full_name, role, buddy_id)
VALUES (
  gen_random_uuid(),
  'teststudent@careerrai.com',
  'Test Student',
  'student',
  [BUDDY_ID_FROM_ABOVE]
);

# Run the query
```

### 2. Start Development
```bash
npm run dev
# Visit: http://localhost:3000
```

### 3. Deploy to Vercel
```bash
# Push to GitHub
git push origin main

# Vercel auto-deploys
# Check: https://vercel.com/dashboard
```

### 4. Add Environment Variables to Vercel
```
Dashboard > Settings > Environment Variables

Add:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- ANTHROPIC_API_KEY
```

---

## 📚 DOCUMENTATION

- **DEPLOYMENT_GUIDE.md** - Complete step-by-step deployment
- **LAUNCH_SUMMARY.md** - Quick reference guide
- **setup-supabase.bat** - Windows automation script
- **setup-supabase.sh** - Mac/Linux automation script

---

## ✅ SETUP CHECKLIST

```
After running setup script:

[ ] Supabase account created
[ ] Project created in Supabase
[ ] Migrations applied (4 migrations)
[ ] Storage buckets created (2 buckets)
[ ] .env.local file created with keys
[ ] ANTHROPIC_API_KEY added to .env.local
[ ] Database tables visible in Dashboard
[ ] Can start local dev server: npm run dev
[ ] Can sign up at http://localhost:3000
[ ] Ready to deploy to Vercel
```

---

## 🎉 YOU'RE READY!

Once you've completed this guide:
1. Your Supabase project is live
2. Database is ready with all tables
3. Environment variables are configured
4. Ready to deploy to Vercel

See **DEPLOYMENT_GUIDE.md** for next steps on Vercel deployment.

---

**Questions?** Check the Supabase docs: https://supabase.com/docs
