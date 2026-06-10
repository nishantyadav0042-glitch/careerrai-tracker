import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { getValidGoogleAccessToken } from './google-oauth-utils';

interface ReminderDef {
  key: string; // stable id used for idempotency via extendedProperties
  title: string;
  description: string;
  hour: number; // IST
  minute: number;
}

const STUDENT_REMINDERS: ReminderDef[] = [
  {
    key: 'student-2100',
    title: 'Log your prep today on CareerRai 📝',
    hour: 21,
    minute: 0,
    description: 'Time to log today’s prep!',
  },
  {
    key: 'student-2200',
    title: 'Add your doubts for your Buddy on CareerRai 💬',
    hour: 22,
    minute: 0,
    description: 'Share today’s doubts so your buddy can help.',
  },
  {
    key: 'student-2230',
    title: 'Last chance: fill today’s prep log on CareerRai ✅',
    hour: 22,
    minute: 30,
    description: 'Final reminder — keep your streak alive!',
  },
];

const BUDDY_REMINDERS: ReminderDef[] = [
  {
    key: 'buddy-1800',
    title: 'Check your CareerRai dashboard — students need you 👀',
    hour: 18,
    minute: 0,
    description: 'See how your students did today.',
  },
  {
    key: 'buddy-2200',
    title: 'Review student logs before midnight on CareerRai 🎯',
    hour: 22,
    minute: 0,
    description: 'Last call to review today’s student logs.',
  },
];

function getCalendarClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Today's date in IST as YYYY-MM-DD (server may run in any timezone).
 */
function todayInIST(): string {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return istNow.toISOString().slice(0, 10);
}

/**
 * Build a timezone-local dateTime string (no Z suffix!). Combined with
 * timeZone: 'Asia/Kolkata' this pins the event to IST wall-clock time
 * regardless of the server's own timezone.
 */
function istDateTime(date: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${date}T${hh}:${mm}:00`;
}

async function findExistingReminder(
  calendar: calendar_v3.Calendar,
  key: string
): Promise<string | null> {
  const res = await calendar.events.list({
    calendarId: 'primary',
    privateExtendedProperty: [`careerraiReminder=${key}`],
    maxResults: 1,
    showDeleted: false,
  });
  return res.data.items?.[0]?.id ?? null;
}

/**
 * Create automated daily reminder events in the user's Google Calendar.
 * Idempotent: each reminder carries a private extended property and is
 * skipped if it already exists, so reconnecting never duplicates events.
 */
export async function createAutomatedReminders(
  userId: string,
  role: 'student' | 'buddy'
): Promise<{ success: boolean; reminders: string[] }> {
  const accessToken = await getValidGoogleAccessToken(userId);
  const calendar = getCalendarClient(accessToken);

  const defs = role === 'student' ? STUDENT_REMINDERS : BUDDY_REMINDERS;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${role}/home`;
  const date = todayInIST();
  const reminders: string[] = [];

  for (const def of defs) {
    try {
      const existing = await findExistingReminder(calendar, def.key);
      if (existing) {
        reminders.push(existing);
        continue;
      }

      const start = istDateTime(date, def.hour, def.minute);
      // 15-minute window
      const endMinute = def.minute + 15;
      const endStr = endMinute >= 60
        ? istDateTime(date, def.hour + 1, endMinute - 60)
        : istDateTime(date, def.hour, endMinute);

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: def.title,
          description: `${def.description}\n\nOpen your dashboard: ${dashboardUrl}`,
          start: { dateTime: start, timeZone: 'Asia/Kolkata' },
          end: { dateTime: endStr, timeZone: 'Asia/Kolkata' },
          recurrence: ['RRULE:FREQ=DAILY'],
          reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: 10 }],
          },
          transparency: 'transparent',
          visibility: 'private',
          extendedProperties: {
            private: { careerraiReminder: def.key },
          },
        },
      });

      if (response.data.id) reminders.push(response.data.id);
    } catch (error) {
      console.error(`Error creating reminder ${def.key}:`, error);
    }
  }

  return { success: reminders.length > 0, reminders };
}

/**
 * Delete all automated CareerRai reminders from the user's calendar.
 * Finds them by their private extended property — no local bookkeeping.
 */
export async function deleteAutomatedReminders(userId: string): Promise<void> {
  const accessToken = await getValidGoogleAccessToken(userId);
  const calendar = getCalendarClient(accessToken);

  const allDefs = [...STUDENT_REMINDERS, ...BUDDY_REMINDERS];
  for (const def of allDefs) {
    try {
      const eventId = await findExistingReminder(calendar, def.key);
      if (eventId) {
        await calendar.events.delete({ calendarId: 'primary', eventId });
      }
    } catch (error) {
      console.error(`Error deleting reminder ${def.key}:`, error);
    }
  }
}
