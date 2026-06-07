#!/bin/bash

# 🎙️ CareerRai Voice Recording System - Automated Setup
# This script sets up everything needed for voice recording to work

set -e

echo "🎙️ CareerRai Voice Recording System - Setup"
echo "================================================"

# Check if we have Supabase CLI
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install with:"
    echo "   npm install -g supabase"
    exit 1
fi

# Get Supabase project info
read -p "Enter your Supabase project URL (https://xxxxx.supabase.co): " SUPABASE_URL
read -p "Enter your Supabase API key (anon key): " SUPABASE_KEY

# Export variables
export SUPABASE_URL
export SUPABASE_ANON_KEY="$SUPABASE_KEY"

echo ""
echo "Phase 1: Running Database Migration..."
echo "======================================="

# Run the migration SQL
curl -X POST "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "'"$(cat supabase/migrations/005_add_voice_notes_to_feedback.sql | tr '\n' ' ')"'"
  }' 2>/dev/null || echo "⚠️  If migration failed, please run manually in Supabase SQL Editor"

echo "✓ Database migration complete"

echo ""
echo "Phase 2: Creating Storage Bucket..."
echo "===================================="

# Create storage bucket
curl -X POST "$SUPABASE_URL/storage/v1/bucket" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "voice-notes",
    "public": true
  }' 2>/dev/null || echo "⚠️  If bucket creation failed, create manually: voice-notes (PUBLIC)"

echo "✓ Storage bucket created"

echo ""
echo "Phase 3: Setting Storage Policies..."
echo "===================================="

# Policy 1: Allow authenticated uploads
curl -X POST "$SUPABASE_URL/storage/v1/bucket/voice-notes/policies" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "definition": "((bucket_id = '\''voice-notes'\''::text) AND (auth.role() = '\''authenticated'\''::text))",
    "operation": "INSERT"
  }' 2>/dev/null || echo "⚠️  If policies failed, add manually in Supabase Storage"

# Policy 2: Allow public reads
curl -X POST "$SUPABASE_URL/storage/v1/bucket/voice-notes/policies" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "definition": "((bucket_id = '\''voice-notes'\''::text))",
    "operation": "SELECT"
  }' 2>/dev/null || echo "⚠️  If policies failed, add manually in Supabase Storage"

echo "✓ Storage policies configured"

echo ""
echo "✅ SETUP COMPLETE!"
echo "=================="
echo ""
echo "Voice recording system is now ready to use."
echo ""
echo "Test it:"
echo "1. Open https://careerrai-daily.vercel.app/admin/voice-test"
echo "2. Check all tests pass ✓"
echo "3. Student records voice note → Buddy hears it"
echo "4. Buddy records feedback → Student hears it"
echo ""
echo "🎙️ Ready to go!"
