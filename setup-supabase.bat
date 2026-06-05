@echo off
REM =============================================================================
REM CareerRai Dashboard - Supabase Setup Script (Windows)
REM =============================================================================
REM This script automates the Supabase setup process
REM Requirements: supabase-cli and node.js installed
REM =============================================================================

setlocal enabledelayedexpansion

echo.
echo 🚀 CareerRai Dashboard - Supabase Setup (Windows)
echo ================================================
echo.

REM Step 1: Check if Supabase CLI is installed
echo 📋 Checking dependencies...
supabase --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Supabase CLI not found. Installing...
    echo Please run: npm install -g supabase@latest
    pause
    exit /b 1
)
echo ✅ Supabase CLI found
echo.

REM Step 2: Get Supabase Access Token
echo 🔑 Supabase Authentication
echo -------------------------
echo.
echo 1. Go to: https://app.supabase.com/account/tokens
echo 2. Create a new access token or use existing
echo 3. Copy the token
echo.
set /p SUPABASE_TOKEN="Paste your Supabase access token: "
set SUPABASE_ACCESS_TOKEN=%SUPABASE_TOKEN%
echo ✅ Token saved
echo.

REM Step 3: Login
echo 📱 Logging in to Supabase...
call supabase login --no-browser
echo ✅ Logged in
echo.

REM Step 4: Create new project
echo 🏗️  Creating Supabase Project
echo ----------------------------
echo.
set /p PROJECT_NAME="Enter project name (e.g., careerrai-production): "
set /p DB_PASSWORD="Enter database password (strong, 12+ chars): "
set /p REGION="Enter region (e.g., us-east-1, ap-south-1, eu-west-1): "

echo.
echo Creating project: %PROJECT_NAME%
echo Region: %REGION%
echo.

REM Step 5: Link local project
echo 🔗 Linking local project to Supabase...
if not exist "supabase\" (
    echo ❌ supabase directory not found. Make sure you're in the project root.
    exit /b 1
)

REM For Windows, we'll use the web interface to create the project instead
echo.
echo 📌 MANUAL STEP: Create Project in Supabase Web Interface
echo ========================================================
echo.
echo 1. Go to: https://supabase.com/dashboard
echo 2. Click "New Project"
echo 3. Fill in:
echo    - Organization: [Select your org]
echo    - Project Name: %PROJECT_NAME%
echo    - Database Password: %DB_PASSWORD%
echo    - Region: %REGION%
echo 4. Click "Create new project" and wait 2-3 minutes
echo 5. Go to Settings ^> API to get your keys:
echo    - SUPABASE_URL
echo    - SUPABASE_ANON_KEY
echo    - SUPABASE_SERVICE_ROLE_KEY
echo.

set /p PROJECT_ID="Once project is created, enter your PROJECT_ID (from supabase.com/dashboard/projects): "
set /p SUPABASE_URL="Enter your NEXT_PUBLIC_SUPABASE_URL: "
set /p SUPABASE_ANON_KEY="Enter your NEXT_PUBLIC_SUPABASE_ANON_KEY: "

echo ✅ Project credentials saved
echo.

REM Step 6: Link local project
echo 🔗 Linking local project...
call supabase link --project-ref %PROJECT_ID%
echo ✅ Project linked
echo.

REM Step 7: Apply migrations
echo 📤 Applying database migrations...
call supabase db push
echo ✅ Migrations applied
echo.

REM Step 8: Create storage buckets (manual SQL)
echo 🪣 Create storage buckets manually:
echo ===================================
echo.
echo 1. Go to: https://supabase.com/dashboard/project/%PROJECT_ID%/sql/new
echo 2. Paste this SQL and run it:
echo.
(
echo INSERT INTO storage.buckets ^(id, name, public^)
echo VALUES
echo   ^('buddy-intros', 'buddy-intros', true^),
echo   ^('voice-notes', 'voice-notes', true^)
echo ON CONFLICT ^(id^) DO NOTHING;
echo.
echo CREATE POLICY "Public Read buddy-intros"
echo ON storage.objects FOR SELECT
echo USING ^(bucket_id = 'buddy-intros'^);
echo.
echo CREATE POLICY "Public Read voice-notes"
echo ON storage.objects FOR SELECT
echo USING ^(bucket_id = 'voice-notes'^);
echo.
echo CREATE POLICY "Authenticated Upload"
echo ON storage.objects FOR INSERT
echo WITH CHECK ^(auth.role^(^) = 'authenticated'^);
) > %CD%\.supabase\create-buckets.sql

echo ✅ SQL saved to .supabase/create-buckets.sql
echo.

REM Step 9: Create .env files
echo 📝 Creating environment files...

(
echo # Supabase
echo NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%
echo NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_ANON_KEY%
echo.
echo # Admin ^(for seed scripts only - keep safe!^)
echo SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
echo # ^ Get this from Supabase ^> Settings ^> API ^> Keys ^> Service Role Key
echo.
echo # Claude API
echo ANTHROPIC_API_KEY=sk-ant-...
echo # ^ Get this from https://console.anthropic.com/account/keys
echo.
echo # Vercel ^(optional, auto-detected^)
echo VERCEL_URL=https://careerrai-daily.vercel.app
) > .env.local

(
echo # Supabase Configuration
echo NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_ID].supabase.co
echo NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
echo.
echo # Admin Client ^(Keep Secure!^)
echo SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
echo.
echo # Anthropic Claude API
echo ANTHROPIC_API_KEY=sk-ant-...
echo.
echo # Vercel
echo VERCEL_URL=https://careerrai-daily.vercel.app
) > .env.example

echo ✅ Environment files created
echo.

REM Step 10: Summary
echo.
echo ✅ SUPABASE SETUP COMPLETE!
echo ==================================
echo.
echo 📋 IMPORTANT NEXT STEPS:
echo.
echo 1. Complete the API keys in .env.local:
echo    - Get Service Role Key from Supabase Dashboard
echo    - Get Claude API Key from https://console.anthropic.com
echo.
echo 2. Create storage buckets:
echo    - Open: https://supabase.com/dashboard/project/%PROJECT_ID%/sql/new
echo    - Copy SQL from: .supabase/create-buckets.sql
echo    - Paste and run
echo.
echo 3. Create test users ^(see DEPLOYMENT_GUIDE.md^)
echo.
echo 4. Deploy to Vercel:
echo    - git push origin main
echo.
echo 📊 Your credentials:
echo    Project ID: %PROJECT_ID%
echo    URL: %SUPABASE_URL%
echo.
echo 🎉 Your Supabase project is ready!
echo.

pause
