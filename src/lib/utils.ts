import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function getTodayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function calcStreak(reports: { report_date: string }[]): number {
  if (!reports.length) return 0;
  const sorted = [...reports].sort((a, b) => b.report_date.localeCompare(a.report_date));
  let streak = 0;
  let cursor = new Date(getTodayIST() + 'T00:00:00');
  for (const r of sorted) {
    const rDate = new Date(r.report_date + 'T00:00:00');
    const diff = Math.round((cursor.getTime() - rDate.getTime()) / 86400000);
    if (diff === 0 || diff === 1) {
      streak++;
      cursor = rDate;
    } else {
      break;
    }
  }
  return streak;
}
