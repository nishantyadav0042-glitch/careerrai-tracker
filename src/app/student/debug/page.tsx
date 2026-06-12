import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-stone-100 last:border-0">
      <span className="text-xs text-stone-500 font-medium shrink-0">{label}</span>
      <span className="text-xs text-stone-800 font-mono text-right break-all">{value ?? '—'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default async function DebugPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const [
    { data: profile },
    { data: streak },
    { count: reportCount },
    { count: notifCount },
    { data: recentReports },
    { data: latestTest },
  ] = await Promise.all([
    admin.from('profiles')
      .select('full_name, email, role, buddy_id, current_streak, best_streak, last_log_date, total_logs_completed, onboarding_completed, cat_percentile, study_target_hours, created_at')
      .eq('id', user.id)
      .single(),
    admin.from('streak_data')
      .select('current_streak, longest_streak, last_log_date, updated_at')
      .eq('student_id', user.id)
      .maybeSingle(),
    admin.from('daily_reports')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id),
    admin.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    admin.from('daily_reports')
      .select('report_date, study_duration, mock_taken')
      .eq('student_id', user.id)
      .order('report_date', { ascending: false })
      .limit(5),
    admin.from('test_results')
      .select('test_name, percentile, attempt_date')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const now = new Date().toISOString();

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Debug
            </h1>
            <p className="text-sm text-stone-500">Account diagnostics · share with support</p>
          </div>
        </div>

        <Section title="Identity">
          <Row label="User ID" value={user.id} />
          <Row label="Email" value={user.email} />
          <Row label="Provider" value={user.app_metadata?.provider ?? 'email'} />
          <Row label="Created" value={user.created_at ? new Date(user.created_at).toLocaleDateString('en-IN') : null} />
          <Row label="Last sign in" value={user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('en-IN') : null} />
        </Section>

        <Section title="Profile">
          <Row label="Name" value={profile?.full_name} />
          <Row label="Role" value={profile?.role} />
          <Row label="Buddy assigned" value={profile?.buddy_id ? 'Yes' : 'No'} />
          <Row label="Onboarding done" value={profile?.onboarding_completed ? 'Yes' : 'No'} />
          <Row label="CRS (cat_percentile)" value={profile?.cat_percentile != null ? `${profile.cat_percentile}%ile` : null} />
          <Row label="Study target" value={profile?.study_target_hours != null ? `${profile.study_target_hours}h/day` : null} />
          <Row label="Member since" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN') : null} />
        </Section>

        <Section title="Activity">
          <Row label="Total days logged" value={reportCount ?? 0} />
          <Row label="Total notifications" value={notifCount ?? 0} />
          <Row label="Last log date" value={profile?.last_log_date ?? streak?.last_log_date ?? null} />
        </Section>

        <Section title="Streak">
          <Row label="Current streak" value={streak?.current_streak ?? profile?.current_streak ?? 0} />
          <Row label="Longest streak" value={streak?.longest_streak ?? profile?.best_streak ?? 0} />
          <Row label="Streak last updated" value={streak?.updated_at ? new Date(streak.updated_at).toLocaleString('en-IN') : null} />
        </Section>

        {latestTest && (
          <Section title="Latest Test Result">
            <Row label="Test" value={latestTest.test_name} />
            <Row label="Percentile" value={`${latestTest.percentile}%ile`} />
            <Row label="Date" value={new Date(latestTest.attempt_date + 'T00:00:00').toLocaleDateString('en-IN')} />
          </Section>
        )}

        {recentReports && recentReports.length > 0 && (
          <Section title="Recent Logs">
            {recentReports.map((r, i) => (
              <Row
                key={i}
                label={new Date(r.report_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                value={`${r.study_duration}h${r.mock_taken ? ' · mock' : ''}`}
              />
            ))}
          </Section>
        )}

        <Section title="Environment">
          <Row label="App" value="CareerRai" />
          <Row label="Server time" value={new Date(now).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} />
          <Row label="Supabase project" value="pobhpszlsozeonejtzqy" />
        </Section>

        <p className="text-center text-[11px] text-stone-400">
          This page is for diagnostics only. Don&apos;t share your User ID publicly.
        </p>
      </div>
    </div>
  );
}
