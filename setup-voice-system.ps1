# 🎙️ CareerRai Voice Recording System - Automated Setup (PowerShell)
# This script sets up everything needed for voice recording to work

Write-Host "🎙️ CareerRai Voice Recording System - Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Get Supabase credentials
$SUPABASE_URL = Read-Host "Enter your Supabase project URL (https://xxxxx.supabase.co)"
$SUPABASE_KEY = Read-Host "Enter your Supabase API key (anon key)" -AsSecureString
$SUPABASE_KEY_PLAIN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($SUPABASE_KEY))

Write-Host ""
Write-Host "Phase 1: Running Database Migration..." -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Yellow

try {
    # Read the migration file
    $migrationSQL = Get-Content "supabase/migrations/005_add_voice_notes_to_feedback.sql" -Raw

    # Prepare the request
    $headers = @{
        "apikey" = $SUPABASE_KEY_PLAIN
        "Content-Type" = "application/json"
    }

    $body = @{
        sql = $migrationSQL
    } | ConvertTo-Json

    # Execute SQL (using REST endpoint)
    $response = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/rpc/exec_sql" `
        -Method POST `
        -Headers $headers `
        -Body $body `
        -ErrorAction SilentlyContinue

    Write-Host "✓ Database migration complete" -ForegroundColor Green
}
catch {
    Write-Host "⚠️  If migration failed, please run manually in Supabase SQL Editor:" -ForegroundColor Yellow
    Write-Host "   Copy content from: supabase/migrations/005_add_voice_notes_to_feedback.sql" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Phase 2: Creating Storage Bucket..." -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow

try {
    $headers = @{
        "apikey" = $SUPABASE_KEY_PLAIN
        "Content-Type" = "application/json"
    }

    $bucketBody = @{
        name = "voice-notes"
        public = $true
    } | ConvertTo-Json

    # Create bucket
    $response = Invoke-WebRequest -Uri "$SUPABASE_URL/storage/v1/bucket" `
        -Method POST `
        -Headers $headers `
        -Body $bucketBody `
        -ErrorAction SilentlyContinue

    Write-Host "✓ Storage bucket created" -ForegroundColor Green
}
catch {
    Write-Host "⚠️  If bucket creation failed:" -ForegroundColor Yellow
    Write-Host "   1. Go to Supabase → Storage" -ForegroundColor Yellow
    Write-Host "   2. Click Create New Bucket" -ForegroundColor Yellow
    Write-Host "   3. Name: voice-notes" -ForegroundColor Yellow
    Write-Host "   4. Select: PUBLIC" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Phase 3: Setting Storage Policies..." -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow

try {
    $headers = @{
        "apikey" = $SUPABASE_KEY_PLAIN
        "Content-Type" = "application/json"
    }

    # Policy 1: Allow authenticated uploads
    $policy1Body = @{
        definition = "((bucket_id = 'voice-notes'::text) AND (auth.role() = 'authenticated'::text))"
        operation = "INSERT"
    } | ConvertTo-Json

    $response1 = Invoke-WebRequest -Uri "$SUPABASE_URL/storage/v1/bucket/voice-notes/policies" `
        -Method POST `
        -Headers $headers `
        -Body $policy1Body `
        -ErrorAction SilentlyContinue

    # Policy 2: Allow public reads
    $policy2Body = @{
        definition = "((bucket_id = 'voice-notes'::text))"
        operation = "SELECT"
    } | ConvertTo-Json

    $response2 = Invoke-WebRequest -Uri "$SUPABASE_URL/storage/v1/bucket/voice-notes/policies" `
        -Method POST `
        -Headers $headers `
        -Body $policy2Body `
        -ErrorAction SilentlyContinue

    Write-Host "✓ Storage policies configured" -ForegroundColor Green
}
catch {
    Write-Host "⚠️  If policies failed:" -ForegroundColor Yellow
    Write-Host "   1. Go to Supabase → Storage → voice-notes → Policies" -ForegroundColor Yellow
    Write-Host "   2. Add both policies from SUPABASE_SETUP.md" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ SETUP COMPLETE!" -ForegroundColor Green
Write-Host "=================" -ForegroundColor Green
Write-Host ""
Write-Host "Voice recording system is now ready to use." -ForegroundColor Cyan
Write-Host ""
Write-Host "Test it:" -ForegroundColor Yellow
Write-Host "1. Open https://careerrai-daily.vercel.app/admin/voice-test" -ForegroundColor Yellow
Write-Host "2. Check all tests pass ✓" -ForegroundColor Yellow
Write-Host "3. Student records voice note → Buddy hears it" -ForegroundColor Yellow
Write-Host "4. Buddy records feedback → Student hears it" -ForegroundColor Yellow
Write-Host ""
Write-Host "🎙️ Ready to go!" -ForegroundColor Green
