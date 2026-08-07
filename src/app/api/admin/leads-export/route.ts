import { NextResponse } from 'next/server';
import { readCallFeedback } from '@/lib/call-feedback';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stepLabel } from '@/lib/lead-intel';

// One-click Excel export of every lead (students + buddies), admin-only.
// CSV with a UTF-8 BOM — opens directly in Excel with columns intact.
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rows } = await admin
    .from('profiles')
    .select('id, full_name, phone, email, role, created_at, onboarding_completed, onboarding_step_reached, app_installed, notif_prefs, signup_source, syllabus_target_date, study_target_hours, pain_points, wants_mentor, buddy_id, college, target_percentile, attempt_year, dream_colleges, self_reported_weakest_section, expedify_status, call_feedback')
    .in('role', ['student', 'buddy'])
    .eq('is_test_account', false) // founder/friend test accounts never appear in the export
    .order('created_at', { ascending: false });

  // Last-log map -> category (same rules as the Expedify pack DOC 3).
  const { data: streaks } = await admin.from('streak_data').select('student_id, last_log_date');
  const lastLog = new Map((streaks ?? []).map((r) => [r.student_id, r.last_log_date as string | null]));
  const todayMs = Date.now();
  const category = (r: { role: string | null; notif_prefs: unknown; app_installed: boolean | null; id: string }): string => {
    if (r.role !== 'student') return '';
    const pushOn = ((r.notif_prefs as { push?: boolean } | null)?.push) === true;
    if (r.app_installed !== true || !pushOn) return 'A - setup stuck';
    const ll = lastLog.get(r.id) ?? null;
    if (!ll) return 'C - never logged';
    const days = Math.round((todayMs - Date.parse(ll)) / 86_400_000);
    return days >= 3 ? 'D - dormant' : 'B - active logger';
  };

  // A tri-state the spreadsheet can read: yes / no / (unknown).
  const yesNoBlank = (v: boolean | null | undefined) => (v === true ? 'yes' : v === false ? 'no' : '');

  const header = [
    'Name', 'Phone', 'Email', 'Type', 'Signed up', 'Journey', 'App installed',
    'Notifications on', 'Source', 'Target date', 'Hours/day', 'Pain points',
    'Wants buddy', 'Has buddy', 'College', 'Target %ile', 'Attempt year',
    'Category', 'Dream college', 'Weakest section', 'Last log',
    'AI call', 'Disposition', 'Drop reason', 'Momentum (0-5)', 'Call notes',
    'Call: lead type', 'Call: installed', 'Call: plan opened', 'Call: next step',
  ];
  const lines = [header.join(',')];
  for (const r of rows ?? []) {
    const prefs = (r.notif_prefs as { push?: boolean } | null) ?? {};
    lines.push([
      csvCell(r.full_name), csvCell(r.phone), csvCell(r.email), csvCell(r.role),
      csvCell((r.created_at as string).split('T')[0]),
      csvCell(r.role === 'buddy' ? '—' : r.onboarding_completed ? 'Plan built' : stepLabel((r.onboarding_step_reached as number | null) ?? 0)),
      csvCell(r.app_installed ? 'yes' : 'no'),
      csvCell(prefs.push === true ? 'yes' : 'no'),
      csvCell(r.signup_source), csvCell(r.syllabus_target_date), csvCell(r.study_target_hours),
      csvCell(Array.isArray(r.pain_points) ? (r.pain_points as string[]).join(' | ') : ''),
      csvCell(r.wants_mentor === true ? 'yes' : r.wants_mentor === false ? 'no' : ''),
      csvCell(r.buddy_id ? 'yes' : 'no'),
      csvCell(r.college), csvCell(r.target_percentile), csvCell(r.attempt_year),
      csvCell(category(r)),
      csvCell(Array.isArray(r.dream_colleges) ? (r.dream_colleges as string[])[0] : ''),
      csvCell(r.self_reported_weakest_section),
      csvCell(lastLog.get((r as { id: string }).id) ?? ''),
      csvCell(r.expedify_status ?? ''),
      // One reader for the column, so a legacy string write still exports its
      // text instead of four blank cells (lib/call-feedback).
      csvCell(readCallFeedback(r.call_feedback)?.disposition ?? ''),
      csvCell(readCallFeedback(r.call_feedback)?.drop_reason ?? ''),
      csvCell(readCallFeedback(r.call_feedback)?.momentum_score ?? ''),
      csvCell(readCallFeedback(r.call_feedback)?.notes ?? ''),
      // What the AI call actually produced. 'installed'/'plan opened' stay
      // blank when the agent didn't report them — blank means unknown, which
      // is not the same as 'no' and must not read as one.
      csvCell(readCallFeedback(r.call_feedback)?.lead_type ?? ''),
      csvCell(yesNoBlank(readCallFeedback(r.call_feedback)?.installed)),
      csvCell(yesNoBlank(readCallFeedback(r.call_feedback)?.plan_opened)),
      csvCell(readCallFeedback(r.call_feedback)?.next_step ?? ''),
    ].join(','));
  }

  const csv = '﻿' + lines.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="careerrai-leads-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
