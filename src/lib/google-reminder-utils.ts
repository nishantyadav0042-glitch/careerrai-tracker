import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';
import { getValidGoogleAccessToken } from './google-oauth-utils';

/**
 * Create automated daily reminder events in Google Calendar
 * Reminders are hidden events that trigger notifications
 */
export async function createAutomatedReminders(
  userId: string,
  role: 'student' | 'buddy'
): Promise<{ success: boolean; reminders: string[] }> {
  try {
    const accessToken = await getValidGoogleAccessToken(userId);

    // Create OAuth2 client and set access token
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
    });

    // Create Google Calendar API client
    const calendar = google.calendar({
      version: 'v3',
      auth: oauth2Client,
    });

    const reminders: string[] = [];
    const today = new Date();

    if (role === 'student') {
      // Student reminders: 9 PM, 10 PM, 10:30 PM (daily)
      const times = [21, 22, 22.5]; // hours in IST

      for (const hour of times) {
        const reminderEvent = await createReminderEvent(
          calendar,
          `CareerRai Daily Reminder - ${hour === 22.5 ? '10:30 PM' : `${Math.floor(hour)} PM`}`,
          `Daily reminder to submit your report`,
          hour
        );

        if (reminderEvent) reminders.push(reminderEvent);
      }
    } else if (role === 'buddy') {
      // Buddy reminders: 6 PM, 10 PM (daily)
      const times = [18, 22]; // hours in IST

      for (const hour of times) {
        const reminderEvent = await createReminderEvent(
          calendar,
          `CareerRai Daily Reminder - ${hour === 18 ? '6 PM' : '10 PM'}`,
          `Daily reminder to check on your student`,
          hour
        );

        if (reminderEvent) reminders.push(reminderEvent);
      }
    }

    return {
      success: reminders.length > 0,
      reminders,
    };
  } catch (error) {
    console.error('Error creating automated reminders:', error);
    throw error;
  }
}

/**
 * Create a single recurring reminder event
 */
async function createReminderEvent(
  calendar: any,
  title: string,
  description: string,
  hourOfDay: number
): Promise<string | null> {
  try {
    const now = new Date();
    const eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Set hour in IST
    const startTime = new Date(eventDate);
    startTime.setHours(hourOfDay, Math.floor((hourOfDay % 1) * 60), 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 1);

    // Create event with recurrence (daily for next 365 days)
    const eventData = {
      summary: title,
      description,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      recurrence: [
        'RRULE:FREQ=DAILY;COUNT=365', // Daily for 1 year
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 0 }, // Popup at event time
          { method: 'notification', minutes: 5 }, // Push notification 5 min before
        ],
      },
      transparency: 'transparent', // Don't mark as busy
      visibility: 'private',
    } as any;

    const response = await calendar.events.insert(
      {
        calendarId: 'primary',
        requestBody: eventData,
      } as any
    );

    return response.data.id || null;
  } catch (error) {
    console.error('Error creating reminder event:', error);
    return null;
  }
}

/**
 * Delete all automated reminders for a user
 */
export async function deleteAutomatedReminders(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    // Get list of reminder event IDs stored in profile metadata
    // (In a real implementation, you'd store these in a separate table)
    const { data: profile } = await admin
      .from('profiles')
      .select('metadata')
      .eq('id', userId)
      .single();

    if (profile?.metadata?.reminderEventIds) {
      const accessToken = await getValidGoogleAccessToken(userId);

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({
        version: 'v3',
        auth: oauth2Client,
      });

      // Delete each reminder event
      for (const eventId of profile.metadata.reminderEventIds) {
        try {
          await calendar.events.delete({
            calendarId: 'primary',
            eventId,
          });
        } catch (error) {
          console.error('Error deleting reminder event:', eventId, error);
        }
      }
    }
  } catch (error) {
    console.error('Error deleting automated reminders:', error);
    throw error;
  }
}
