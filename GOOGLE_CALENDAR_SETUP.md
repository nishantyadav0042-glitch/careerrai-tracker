# Google Calendar Integration Setup Guide

This guide walks you through setting up Google Calendar OAuth for CareerRai. This enables:
- Automatic scheduling of video sessions with Google Meet links
- Daily reminder notifications
- Calendar synchronization

## Prerequisites

- Google Cloud Console access
- Active CareerRai deployment with a public URL
- Environment variables ready to be set

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project selector at the top and click "NEW PROJECT"
3. Name it "CareerRai" and click "CREATE"
4. Wait for the project to be created

## Step 2: Enable Required APIs

1. In the Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for and enable these APIs:
   - **Google Calendar API** - Click "Enable"
   - **Google Meet API** - Click "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
3. You'll be asked to configure the OAuth consent screen first
   - Click **CONFIGURE CONSENT SCREEN**

### Configure Consent Screen

1. Choose **External** user type (recommended)
2. Click **CREATE**
3. Fill in the required fields:
   - **App name**: CareerRai
   - **User support email**: your-email@example.com
   - **Developer contact**: your-email@example.com
4. Click **SAVE AND CONTINUE** through all steps
5. On the final summary page, click **BACK TO DASHBOARD**

### Create OAuth Client ID

1. Back in **Credentials**, click **+ CREATE CREDENTIALS** > **OAuth client ID**
2. Select application type: **Web application**
3. Name it: "CareerRai Web"
4. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3000/api/google/callback
   https://your-production-domain.com/api/google/callback
   ```
   Replace `your-production-domain.com` with your actual Vercel domain
5. Click **CREATE**
6. You'll see a popup with your credentials. Click the copy button to save them.

## Step 4: Set Environment Variables

1. Copy the **Client ID** and **Client Secret** from the credentials popup
2. Add them to your `.env.local` file:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

For production (Vercel):
1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
   ```

## Step 5: Configure OAuth Consent Screen for Production

1. In Google Cloud Console, go to **OAuth consent screen**
2. Click **EDIT APP** and update:
   - Add your app logo
   - Update support email to production email
   - Add privacy policy URL (if you have one)
3. Under **Scopes**, verify these are selected:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`

## Step 6: Test the Integration

### Local Testing

1. Ensure your `.env.local` is set correctly
2. Start the dev server: `npm run dev`
3. Login as a student or buddy
4. Go to **Settings**
5. Click **Connect Google Calendar**
6. You should be redirected to Google login
7. Authorize the app
8. You should see "Google Calendar Connected" ✓

### Production Testing (Vercel)

1. Deploy your code to Vercel
2. Ensure environment variables are set
3. Go to `https://your-domain.vercel.app/student/settings` (or `/buddy/settings`)
4. Test the Connect Google Calendar flow

## Step 7: Test Calendar Event Creation

Once connected, test event creation:

```bash
curl -X POST http://localhost:3000/api/google/create-event \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "title": "Test Session",
    "studentName": "John Doe",
    "startTime": "2026-06-10T14:00:00Z",
    "endTime": "2026-06-10T15:00:00Z"
  }'
```

Response should include:
```json
{
  "success": true,
  "eventId": "...",
  "meetLink": "https://meet.google.com/..."
}
```

## Troubleshooting

### "Google Calendar not connected"

- Ensure you've clicked "Connect Google Calendar" and completed the OAuth flow
- Check that `google_calendar_connected` is `true` in the database

### OAuth redirect URI mismatch

- Verify the redirect URI in Google Cloud matches your deployment URL
- For localhost, it should be `http://localhost:3000/api/google/callback`
- For production, it should be `https://your-vercel-domain.vercel.app/api/google/callback`

### Access token not refreshing

- The system automatically refreshes tokens with a 5-minute buffer
- If you see "Failed to refresh token", the refresh token may have expired
- User should disconnect and reconnect their calendar

### No Meet link in created events

- Ensure "Google Meet API" is enabled in Google Cloud Console
- Verify the Calendar API scope includes `calendar.events` permission

## Architecture

### Token Management
- **Refresh token**: Stored securely in Supabase, encrypted
- **Access token**: Automatically refreshed when needed (5-min buffer)
- **Never** exposed to client-side code

### Reminder Creation
- **When**: Automatically created after OAuth connection
- **What**: 5 recurring daily events (student: 3, buddy: 2)
- **Duration**: 1 year of daily reminders

### Event Creation
- **When**: Called when buddy schedules a session
- **Meet link**: Real `hangoutLink` from Google Calendar API
- **Storage**: Event ID and Meet link saved to `video_sessions` table

## Security Considerations

✅ **Implemented:**
- Tokens stored server-side only
- RLS policies restrict token access to user themselves
- No token exposure to frontend
- Automatic token refresh

⚠️ **Recommendations:**
- Regularly audit Supabase RLS policies
- Monitor Google Cloud Console for unusual activity
- Use service accounts for scheduled tasks (future)

## Support

For issues:
1. Check the error message in Settings
2. Review `GOOGLE_CALENDAR_SETUP.md` troubleshooting section
3. Check Google Cloud Console API quotas
4. Check Supabase auth logs
