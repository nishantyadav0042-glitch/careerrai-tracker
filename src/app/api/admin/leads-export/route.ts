import { NextResponse } from 'next/server';
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
    .select('full_name, phone, email, role, created_at, onboarding_completed, onboarding_step_reached, app_installed, notif_prefs, signup_source, syllabus_target_date, study_target_hours, pain_points, wants_mentor, buddy_id, college, target_percentile, attempt_year')
    .in('role', ['student', 'buddy'])
    .eq('is_demo', false)
    .order('created_at', { ascending: false });

  const header = [
    'Name', 'Phone', 'Email', 'Type', 'Signed up', 'Journey', 'App installed',
    'Notifications on', 'Source', 'Target date', 'Hours/day', 'Pain points',
    'Wants buddy', 'Has buddy', 'College', 'Target %ile', 'Attempt year',
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
