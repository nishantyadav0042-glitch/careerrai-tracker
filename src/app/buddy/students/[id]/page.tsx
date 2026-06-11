import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoodChart } from './student-charts';
import { FeedbackList } from './feedback-form';
import { BuddyStudentViewClient } from './buddy-student-view-client';
import { VideoSessionPromptClient } from './video-session-prompt-client';
import type { DailyReport, BuddyFeedback } from '@/types';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

function PeriodTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-all text-center', active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900')}
    >
      {label}
    </Link>
  );
}

export default async function BuddyStudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { id } = await params;
  const { period: periodParam } = await searchParams;
  const period = parseInt(periodParam ?? '7');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Verify this student belongs to this buddy
  const { data: student } = await admin.from('profiles').select('buddy_id, full_name, exam_target, email, cat_percentile').eq('id', id).single();
  if (!student || student.buddy_id !== user.id) notFound();

  const { data: reportsRaw } = await admin
    .from('daily_reports')
    .select('*')
    .eq('student_id', id)
    .order('report_date', { ascending: false })
    .limit(period);

  const reports = (reportsRaw ?? []) as DailyReport[];

  // Fetch buddy's feedback to student (not student responses)
  const { data: feedbackRaw } = await admin
    .from('buddy_feedback')
    .select('*')
    .eq('student_id', id)
    .eq('feedback_type', 'buddy_feedback')
    .order('feedback_date', { ascending: false });

  const feedback = (feedbackRaw ?? []) as BuddyFeedback[];

  // Fetch last video session for this student-buddy pair
  const { data: lastVideoSession } = await admin
    .from('video_sessions')
    .select('ended_at')
    .eq('student_id', id)
    .eq('buddy_id', user.id)
    .eq('session_status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(1)
    .single();

  const lastSessionDate = lastVideoSession?.ended_at ? new Date(lastVideoSession.ended_at) : null;
  const daysSinceLastSession = lastSessionDate
    ? Math.floor((Date.now() - lastSessionDate.getTime()) / 86_400_000)
    : null;

  const { data: buddyTokens } = await admin
    .from('google_oauth_tokens')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const calendarConnected = !!buddyTokens;

  // Upcoming scheduled sessions with this student (for the join-link list)
  const { data: upcomingSessions } = await admin
    .from('video_sessions')
    .select('id, title, scheduled_at, google_meet_link')
    .eq('student_id', id)
    .eq('buddy_id', user.id)
    .eq('session_status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(3);

  const summary = computeSummary(reports, period);

  const moodData = reports.slice().reverse().map((r) => ({
    date: formatDate(r.report_date),
    confidence: r.confidence,
    stress: r.stress,
    sleep: r.sleep_quality,
    energy: r.overall_energy,
  }));

  const bandColor = summary.band === 'On track' ? 'green' : summary.band === 'Needs nudging' ? 'amber' : 'red';
  const firstName = student.full_name.split(' ')[0];
  const baseUrl = `/buddy/students/${id}`;

  return (
    <div className="space-y-5 pb-24">
      <Link href="/buddy/students" className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft className="w-4 h-4" /> Back to students
      </Link>

      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Student report</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>
          {student.full_name}
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">{student.exam_target ?? 'CAT'} · {student.email}</p>
      </div>

      {/* Period selector — uses URL params, no JS needed */}
      <div className="flex bg-stone-100 rounded-xl p-1 gap-1">
        {([7, 10, 30] as const).map((p) => (
          <PeriodTab key={p} href={`${baseUrl}?period=${p}`} label={`${p} days`} active={period === p} />
        ))}
      </div>

      {/* Overall score */}
      <Card className="p-5 bg-gradient-to-br from-stone-900 to-stone-800 text-white border-stone-900">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest opacity-70 font-semibold">Overall Status</div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-5xl font-bold font-mono leading-none">{summary.overallScore}</span>
              <span className="text-lg opacity-70">/100</span>
            </div>
            <div className="mt-3"><Badge color={bandColor}>{summary.band}</Badge></div>
          </div>
          <div className="text-right space-y-1.5 text-xs opacity-80">
            <div>Consistency: {Math.round((summary.daysSubmitted / period) * 25)}/25</div>
            <div>Study: {Math.round(Math.min(25, (summary.avgStudy / 6) * 25))}/25</div>
            <div>Mocks: {summary.totalMocks > 0 ? Math.round(Math.min(25, (summary.avgMockScore / 100) * 25)) : 12}/25</div>
            <div>Mood: {Math.round(Math.min(25, ((summary.avgConfidence + (6 - summary.avgStress) + summary.avgEnergy) / 15) * 25))}/25</div>
          </div>
        </div>
      </Card>

      {/* Red flags */}
      {summary.redFlags.length > 0 && (
        <Card className="p-4 bg-rose-50 border-rose-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Red flags</span>
          </div>
          <ul className="space-y-1.5">
            {summary.redFlags.map((f, i) => (
              <li key={i} className="text-sm text-rose-900 flex items-start gap-2">
                <span className="text-rose-400 mt-0.5">•</span><span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total study', val: `${summary.totalStudy.toFixed(1)}`, unit: 'hrs' },
          { label: 'Days submitted', val: `${summary.daysSubmitted}`, unit: `/ ${period}` },
          { label: 'Avg confidence', val: summary.avgConfidence.toFixed(1), unit: '/5' },
          { label: 'Avg stress', val: summary.avgStress.toFixed(1), unit: '/5', red: summary.avgStress >= 4 },
        ].map(({ label, val, unit, red }) => (
          <Card key={label} className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">{label}</div>
            <div className={cn('text-2xl font-bold font-mono mt-1', red ? 'text-rose-600' : 'text-stone-900')}>
              {val}<span className="text-sm text-stone-500 font-normal ml-1">{unit}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Mood chart */}
      {moodData.length > 0 && (
        <Card className="p-5">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Mood trends</h2>
          <MoodChart data={moodData} />
        </Card>
      )}

      {/* Day-by-day — HTML details, no JS */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Day by day</h2>
        <div className="space-y-2">
          {reports.map((r) => (
            <details key={r.report_date} className="bg-white border border-stone-200 rounded-2xl overflow-hidden group">
              <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-stone-50 transition-colors list-none">
                <div className="flex items-center gap-3 text-left">
                  <div className="text-center min-w-[36px]">
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                      {new Date(r.report_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-stone-900 leading-none">
                      {new Date(r.report_date + 'T00:00:00').getDate()}
                    </div>
                  </div>
                  <div className="border-l border-stone-200 pl-3">
                    <div className="text-sm font-semibold text-stone-900">
                      {r.study_duration.toFixed(1)} hrs · {(r.topics_covered ?? []).slice(0, 2).join(', ')}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-2">
                      {r.mock_taken && <Badge color="orange">Mock {r.total_accuracy}%</Badge>}
                      <span>Stress {r.stress}/5</span>
                    </div>
                  </div>
                </div>
                <span className="text-stone-400 text-xs group-open:hidden">▼</span>
                <span className="text-stone-400 text-xs hidden group-open:block">▲</span>
              </summary>
              <div className="border-t border-stone-200 p-4 bg-stone-50/50 space-y-1.5 text-sm text-stone-700">
                <div>Study {r.study_duration.toFixed(1)}h · Quality {r.quality_focus}/5 · Difficulty {r.difficulty}/5</div>
                <div>Confidence {r.confidence}/5 · Stress {r.stress}/5 · Sleep {r.sleep_quality}/5 · Energy {r.overall_energy}/5</div>
                {r.nutrition_exercise && <div className="text-teal-700">✓ Nutrition &amp; exercise done</div>}
                {r.notes && <div className="italic text-stone-500">"{r.notes}"</div>}
                {r.mock_taken && (
                  <div className="pt-1 border-t border-stone-100">
                    Mock: {r.mock_name} · Accuracy {r.total_accuracy}% · Quant {r.quant_score}% · Verbal {r.verbal_score}%
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* Upcoming sessions with this student */}
      {(upcomingSessions?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border-2 border-teal-200 p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-600">
            Upcoming Sessions with {firstName}
          </h3>
          {upcomingSessions!.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{s.title || 'Session'}</p>
                <p className="text-xs text-stone-600">
                  {new Date(s.scheduled_at!).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {s.google_meet_link ? (
                <a
                  href={s.google_meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Join Meet →
                </a>
              ) : (
                <span className="flex-shrink-0 text-xs text-stone-400">No Meet link</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Schedule session CTA — nudges harder when 10+ days since last session */}
      <VideoSessionPromptClient
        studentId={id}
        studentName={student.full_name}
        calendarConnected={calendarConnected}
        daysSinceLastSession={daysSinceLastSession}
      />

      {/* Sent voice notes — read receipts */}
      {feedback.some((f) => f.voice_note_url) && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2.5">
            Voice notes you sent
          </p>
          <div className="space-y-1.5">
            {feedback
              .filter((f) => f.voice_note_url)
              .slice(0, 5)
              .map((f) => {
                const listened = !!(f as unknown as { read_at: string | null }).read_at;
                const thanked = !!(f as unknown as { thanked_at: string | null }).thanked_at;
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-lg bg-stone-50"
                  >
                    <span className="text-stone-600">
                      🎤 {new Date(f.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <span
                      className={cn(
                        'font-medium',
                        listened ? 'text-emerald-600' : 'text-stone-400'
                      )}
                    >
                      {thanked ? '❤️ Loved it' : listened ? '✓ Listened' : 'Not played yet'}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Feedback list + form (client component - manages optimistic updates) */}
      <FeedbackList initial={feedback} studentId={id} studentFirstName={firstName} />

      {/* Voice note recorder (client component) */}
      <BuddyStudentViewClient
        studentId={id}
        studentName={student.full_name}
        studentPercentile={student.cat_percentile}
        buddyId={user.id}
      />
    </div>
  );
}
