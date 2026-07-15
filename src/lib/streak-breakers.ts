import { getLogDateString } from '@/lib/streak-utils';

// "Streak breakers": students who logged the day BEFORE yesterday, then SKIPPED
// yesterday, and still haven't logged today — the freshest habit-break, and the
// highest-value win-back (they had momentum right up to the miss). Anyone who
// already logged today is excluded (they're back on their own). Shared by the
// admin dashboard door (count) and the reminder page (the list).

export interface StreakBreaker {
  id: string;
  name: string;
  first: string;
  phone: string | null;
}

// Calendar-date string math (UTC-safe: we only ever touch the date part).
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getStreakBreakers(admin: any): Promise<StreakBreaker[]> {
  const today = getLogDateString();          // app log-day (3 AM IST boundary)
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);

  const [{ data: students }, { data: reports }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, phone, is_test_account, is_demo')
      .eq('role', 'student'),
    admin.from('daily_reports')
      .select('student_id, report_date')
      .in('report_date', [dayBefore, yesterday, today]),
  ]);

  const daysByStudent = new Map<string, Set<string>>();
  for (const r of reports ?? []) {
    const id = r.student_id as string;
    if (!daysByStudent.has(id)) daysByStudent.set(id, new Set());
    daysByStudent.get(id)!.add(r.report_date as string);
  }

  return (students ?? [])
    .filter((s: { is_test_account?: boolean | null; is_demo?: boolean | null }) =>
      s.is_test_account !== true && s.is_demo !== true)
    .filter((s: { id: string }) => {
      const d = daysByStudent.get(s.id) ?? new Set<string>();
      return d.has(dayBefore) && !d.has(yesterday) && !d.has(today);
    })
    .map((s: { id: string; full_name: string | null; phone: string | null }) => ({
      id: s.id,
      name: s.full_name ?? 'Student',
      first: (s.full_name ?? '').trim().split(' ')[0] || 'there',
      phone: s.phone,
    }));
}
