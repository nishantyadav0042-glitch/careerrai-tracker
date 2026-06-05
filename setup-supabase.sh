#!/bin/bash

# =============================================================================
# CareerRai Dashboard - Supabase Setup Script
# =============================================================================
# This script automates the entire Supabase setup process
# Requirements: supabase-cli installed (npm install -g supabase@latest)
# =============================================================================

set -e

echo "🚀 CareerRai Dashboard - Supabase Setup"
echo "========================================"
echo ""

# Step 1: Check if Supabase CLI is installed
echo "📋 Checking dependencies..."
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase@latest
fi
echo "✅ Supabase CLI found"
echo ""

# Step 2: Get Supabase Access Token
echo "🔑 Supabase Authentication"
echo "------------------------"
echo "1. Go to: https://app.supabase.com/account/tokens"
echo "2. Create a new access token (or use existing)"
echo "3. Copy the token"
echo ""
read -p "Paste your Supabase access token: " SUPABASE_TOKEN
export SUPABASE_ACCESS_TOKEN=$SUPABASE_TOKEN
echo "✅ Token saved"
echo ""

# Step 3: Login
echo "📱 Logging in to Supabase..."
supabase login --no-browser
echo "✅ Logged in"
echo ""

# Step 4: Create new project
echo "🏗️  Creating Supabase Project"
echo "----------------------------"
read -p "Enter project name (e.g., careerrai-production): " PROJECT_NAME
read -p "Enter database password (strong, 12+ chars): " DB_PASSWORD
read -p "Enter region (e.g., us-east-1, ap-south-1, eu-west-1): " REGION

PROJECT_ID=$(echo $PROJECT_NAME | tr ' ' '-' | tr '[:upper:]' '[:lower:]')

echo ""
echo "Creating project: $PROJECT_NAME"
echo "Region: $REGION"
echo ""

# Use Supabase API to create project
RESPONSE=$(curl -s -X POST "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$PROJECT_NAME\",
    \"organization_id\": \"$(supabase projects list --json | jq -r '.[0].organization_id' 2>/dev/null || echo '')\",
    \"db_pass\": \"$DB_PASSWORD\",
    \"region\": \"$REGION\"
  }")

PROJECT_ID=$(echo $RESPONSE | jq -r '.id' 2>/dev/null)

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
    echo "❌ Failed to create project. Response:"
    echo $RESPONSE
    exit 1
fi

echo "✅ Project created: $PROJECT_ID"
echo ""

# Step 5: Wait for project to be ready
echo "⏳ Waiting for project to be ready (2-3 minutes)..."
for i in {1..30}; do
    STATUS=$(curl -s -X GET "https://api.supabase.com/v1/projects/$PROJECT_ID" \
      -H "Authorization: Bearer $SUPABASE_TOKEN" | jq -r '.status' 2>/dev/null)

    if [ "$STATUS" = "ACTIVE" ]; then
        echo "✅ Project is ready!"
        break
    fi

    echo "  Checking... ($i/30)"
    sleep 5
done
echo ""

# Step 6: Get project credentials
echo "🔐 Getting project credentials..."
PROJECT_INFO=$(curl -s -X GET "https://api.supabase.com/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $SUPABASE_TOKEN")

SUPABASE_URL=$(echo $PROJECT_INFO | jq -r '.connectionString' | sed 's|postgresql://.*@||' | sed 's|/postgres||')
SUPABASE_URL="https://${PROJECT_ID}.supabase.co"

# Get anon key
SUPABASE_ANON_KEY=$(curl -s -X GET "https://api.supabase.com/v1/projects/$PROJECT_ID/api-keys" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" | jq -r '.[] | select(.name=="anon, public") | .api_key' 2>/dev/null)

echo "✅ Credentials retrieved"
echo ""

# Step 7: Link local project
echo "🔗 Linking local project..."
if [ ! -d "supabase" ]; then
    echo "❌ supabase directory not found. Make sure you're in the project root."
    exit 1
fi

supabase link --project-ref $PROJECT_ID
echo "✅ Project linked"
echo ""

# Step 8: Apply migrations
echo "📤 Applying database migrations..."
supabase db push
echo "✅ Migrations applied"
echo ""

# Step 9: Create storage buckets
echo "🪣 Creating storage buckets..."
cat > /tmp/create-buckets.sql << 'EOF'
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('buddy-intros', 'buddy-intros', true),
  ('voice-notes', 'voice-notes', true)
ON CONFLICT (id) DO NOTHING;

-- Set bucket policies
CREATE POLICY "Public Read buddy-intros"
ON storage.objects FOR SELECT
USING (bucket_id = 'buddy-intros');

CREATE POLICY "Public Read voice-notes"
ON storage.objects FOR SELECT
USING (bucket_id = 'voice-notes');

CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
EOF

echo "Run this in Supabase SQL Editor to create buckets:"
echo "See .supabase/create-buckets.sql"
cp /tmp/create-buckets.sql .supabase/create-buckets.sql
echo "✅ Bucket creation SQL saved"
echo ""

# Step 10: Create .env files
echo "📝 Creating environment files..."

cat > .env.local << EOF
# Supabase
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

# Admin (for seed scripts only - keep safe!)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# ^ Get this from Supabase > Settings > API > Keys > Service Role Key

# Claude API
ANTHROPIC_API_KEY=sk-ant-...
# ^ Get this from https://console.anthropic.com/account/keys

# Vercel (optional, auto-detected)
VERCEL_URL=https://careerrai-daily.vercel.app
EOF

cat > .env.example << EOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Admin Client (Keep Secure!)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Vercel
VERCEL_URL=https://careerrai-daily.vercel.app
EOF

echo "✅ Environment files created:"
echo "  .env.local (added to .gitignore)"
echo "  .env.example (for reference)"
echo ""

# Step 11: Summary
echo "✅ SUPABASE SETUP COMPLETE!"
echo "===================================="
echo ""
echo "📋 Next Steps:"
echo "1. Add your Supabase API keys to .env.local:"
echo ""
echo "NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL"
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY"
echo ""
echo "2. Get your Service Role Key:"
echo "   Dashboard > Settings > API > Keys > Service Role Key"
echo ""
echo "3. Get your Claude API Key:"
echo "   https://console.anthropic.com/account/keys"
echo ""
echo "4. Create storage buckets:"
echo "   Dashboard > SQL Editor > paste contents of .supabase/create-buckets.sql"
echo ""
echo "5. Create test users (see DEPLOYMENT_GUIDE.md)"
echo ""
echo "6. Deploy to Vercel:"
echo "   git push origin main"
echo ""
echo "🎉 Your Supabase project is ready!"
echo ""
echo "Project ID: $PROJECT_ID"
echo "URL: $SUPABASE_URL"
echo "Anon Key: ${SUPABASE_ANON_KEY:0:20}..."
