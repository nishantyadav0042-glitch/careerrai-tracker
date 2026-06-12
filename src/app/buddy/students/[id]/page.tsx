import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FeedbackList } from './feedback-form';
import { BuddyStudentViewClient } from './buddy-student-view-client';
import { VideoSessionPromptClient } from './video-session-prompt-client';
import type { DailyReport, BuddyFeedback } from '@/types';
import { ArrowLeft, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
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

interface MockDebrief {
  id: string;
  taken_on: string;
  overall_percentile: number | null;
  varc: { percentile?: number; correct?: number; attempted?: number };
  dilr: { percentile?: number; correct?: number; attempted?: number };
  qa: { percentile?: number; correct?: number; attempted?: number };
  error_buckets: { conceptual: number; silly: number; time: number; panic: number; selection: number };
  strategy_note: string | null;
}

const BUCKET_LABELS: { key: keyof MockDebrief['error_buckets']; emoji: string; label: string }[] = [
  { key: 'conceptual', emoji: '🧠', label: 'Conceptual' },
  { key: 'silly', emoji: '🤏', label: 'Silly' },
  { key: 'time', emoji: '⏱️', label: 'Time pressure' },
  { key: 'panic', emoji: '😰', label: 'Panic/misread' },
  { key: 'selection', emoji: '🎯', label: 'Wrong selection' },
];

function computeNeedsAttentionFlags(
  reports: DailyReport[],
  debriefs: MockDebrief[]
): string[] {
  const flags: string[] = [];

  // Consistency — logged < 3/7 days
  const last7 = reports.filter((r) => {
    const d = new Date(r.report_date + 'T00:00:00');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return d >= cutoff;
  });
  if (last7.length < 3) {
    flags.push(`Only ${last7.length}/7 days logged this week — consistency is the foundation`);
  }

  // Avoidance — section skipped 3+ consecutive days
  const weakSections = ['VARC', 'DILR', 'QA'];
  for (const section of weakSections) {
    let streak = 0;
    for (const r of reports.slice(0, 7)) {
      const covered = (r.topics_covered as string[]) ?? [];
      if (!covered.includes(section)) streak++;
      else break;
    }
    if (streak >= 3) {
      flags.push(`Avoiding ${section} for ${streak} days straight — classic avoidance pattern`);
    }
  }

  // Mock percentile declining over last 2 mocks
  if (debriefs.length >= 2) {
    const [latest, prev] = debriefs;
    if (
      latest.overall_percentile !== null &&
      prev.overall_percentile !== null &&
      latest.overall_percentile < prev.overall_percentile - 5
    ) {
      flags.push(
        `Percentile dropped ${prev.overall_percentile}→${latest.overall_percentile} — needs debrief review`
      );
    }
  }

  // Silly errors dominant
  if (debriefs.length > 0) {
    const eb = debriefs[0].error_buckets;
    const total = Object.values(eb).reduce((a, b) => a + b, 0);
    if (total > 0 && eb.silly / total > 0.4) {
      flags.push(
        `${eb.silly} silly errors in last mock (${Math.round((eb.silly / total) * 100)}%) — speed or focus issue`
      );
    }
    if (total > 0 && eb.conceptual / total > 0.4) {
      flags.push(
        `${eb.conceptual} conceptual errors in last mock — foundational gaps remain`
      );
    }
  }

  return flags;
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

  const { data: student } = await admin
    .from('profiles')
    .select('buddy_id, full_name, exam_target, email, cat_percentile')
    .eq('id', id)
    .single();
  if (!student || student.buddy_id !== user.id) notFound();

  const [{ data: reportsRaw }, { data: feedbackRaw }, { data: debriefsRaw }] = await Promise.all([
    admin
      .from('daily_reports')
      .select('*')
      .eq('student_id', id)
      .order('report_date', { ascending: false })
      .limit(period),
    admin
      .from('buddy_feedback')
      .select('*')
      .eq('student_id', id)
      .eq('feedback_type', 'buddy_feedback')
      .order('feedback_date', { ascending: false }),
    admin
      .from('mock_debriefs')
      .select('*')
      .eq('student_id', id)
      .order('taken_on', { ascending: false })
      .limit(5),
  ]);

  const reports = (reportsRaw ?? []) as DailyReport[];
  const feedback = (feedbackRaw ?? []) as BuddyFeedback[];
  const debriefs = (debriefsRaw ?? []) as MockDebrief[];

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
    ? Math.floor((new Date().getTime() - lastSessionDate.getTime()) / 86_400_000)
    : null;

  const { data: buddyTokens } = await admin
    .from('google_oauth_tokens')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const calendarConnected = !!buddyTokens;

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
  const needsAttentionFlags = computeNeedsAttentionFlags(reports, debriefs);
  const firstName = student.full_name.split(' ')[0];
  const baseUrl = `/buddy/students/${id}`;

  const latestDebrief = debriefs[0] ?? null;
  const prevDebrief = debriefs[1] ?? null;
  const percentileArrow =
    latestDebrief?.overall_percentile !== null &&
    prevDebrief?.overall_percentile !== null
      ? (latestDebrief?.overall_percentile ?? 0) > (prevDebrief?.overall_percentile ?? 0)
        ? 'up'
        : 'down'
      : null;

  // Aggregate error buckets
  const totalBuckets = debriefs.reduce(
    (acc, d) => {
      acc.conceptual += d.error_buckets?.conceptual ?? 0;
      acc.silly += d.error_buckets?.silly ?? 0;
      acc.time += d.error_buckets?.time ?? 0;
      acc.panic += d.error_buckets?.panic ?? 0;
      acc.selection += d.error_buckets?.selection ?? 0;
      return acc;
    },
    { conceptual: 0, silly: 0, time: 0, panic: 0, selection: 0 }
  );

  return (
    <div className="space-y-5 pb-24">
      <Link href="/buddy/students" className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft className="w-4 h-4" /> Back to students
      </Link>

      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Diagnosis view</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>
          {student.full_name}
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">{student.exam_target ?? 'CAT'} · {student.email}</p>
      </div>

      {/* Period selector */}
      <div className="flex bg-stone-100 rounded-xl p-1 gap-1">
        {([7, 10, 30] as const).map((p) => (
          <PeriodTab key={p} href={`${baseUrl}?period=${p}`} label={`${p} days`} active={period === p} />
        ))}
      </div>

      {/* Needs-attention flags — the most important thing */}
      {needsAttentionFlags.length > 0 && (
        <Card className="p-4 bg-rose-50 border-rose-200">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
              Needs your attention ({needsAttentionFlags.length})
            </span>
          </div>
          <ul className="space-y-2">
            {needsAttentionFlags.map((flag, i) => (
              <li key={i} className="text-sm text-rose-900 flex items-start gap-2">
                <span className="text-rose-400 mt-0.5 shrink-0">•</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Latest mock debrief summary */}
      {latestDebrief && (
        <Card className="p-5 bg-stone-900 text-white border-stone-900">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-60 font-semibold">Latest mock</p>
              <p className="text-sm text-stone-400 mt-0.5">
                {new Date(latestDebrief.taken_on + 'T00:00:00').toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            </div>
            {latestDebrief.overall_percentile !== null && (
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold font-mono">{latestDebrief.overall_percentile}</span>
                <span className="text-lg opacity-60">%ile</span>
                {percentileArrow === 'up' && <TrendingUp className="w-5 h-5 text-teal-400" />}
                {percentileArrow === 'down' && <TrendingDown className="w-5 h-5 text-rose-400" />}
              </div>
            )}
          </div>

          {/* Section breakdown */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {(['varc', 'dilr', 'qa'] as const).map((sec) => {
              const s = latestDebrief[sec];
              const acc = s.attempted ? Math.round(((s.correct ?? 0) / s.attempted) * 100) : null;
              return (
                <div key={sec} className="bg-white/10 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider opacity-60 font-semibold">{sec.toUpperCase()}</p>
                  <p className="text-lg font-bold mt-1">{s.percentile ?? '—'}<span className="text-xs opacity-60">%ile</span></p>
                  {acc !== null && <p className="text-xs opacity-50">{acc}% acc</p>}
                </div>
              );
            })}
          </div>

          {/* Strategy note */}
          {latestDebrief.strategy_note && (
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider opacity-60 font-semibold mb-1">Will do differently</p>
              <p className="text-sm italic opacity-90">&quot;{latestDebrief.strategy_note}&quot;</p>
            </div>
          )}
        </Card>
      )}

      {/* Error bucket summary across all debriefs */}
      {debriefs.length > 0 && Object.values(totalBuckets).some((v) => v > 0) && (
        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">
            Error pattern ({debriefs.length} mock{debriefs.length > 1 ? 's' : ''})
          </h2>
          <div className="space-y-2">
            {BUCKET_LABELS.map(({ key, emoji, label }) => {
              const val = totalBuckets[key];
              const total = Object.values(totalBuckets).reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-base shrink-0">{emoji}</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium text-stone-700">{label}</span>
                      <span className="text-xs text-stone-500">{val} ({pct}%)</span>
                    </div>
                    <div className="bg-stone-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Consistency summary */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total study', val: `${summary.totalStudy.toFixed(1)}`, unit: 'hrs' },
          { label: 'Days logged', val: `${summary.daysSubmitted}`, unit: `/ ${period}` },
          { label: 'Mocks taken', val: `${debriefs.length}`, unit: 'total' },
          { label: 'Avg hours/day', val: summary.daysSubmitted > 0 ? (summary.totalStudy / summary.daysSubmitted).toFixed(1) : '—', unit: 'hrs' },
        ].map(({ label, val, unit }) => (
          <Card key={label} className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold font-mono mt-1 text-stone-900">
              {val}<span className="text-sm text-stone-500 font-normal ml-1">{unit}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Upcoming sessions */}
      {(upcomingSessions?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border-2 border-teal-200 p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-600">
            Upcoming sessions with {firstName}
          </h3>
          {upcomingSessions!.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2">
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

      <VideoSessionPromptClient
        studentId={id}
        studentName={student.full_name}
        calendarConnected={calendarConnected}
        daysSinceLastSession={daysSinceLastSession}
      />

      {/* Voice notes */}
      {feedback.some((f) => f.voice_note_url) && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2.5">Voice notes you sent</p>
          <div className="space-y-1.5">
            {feedback
              .filter((f) => f.voice_note_url)
              .slice(0, 5)
              .map((f) => {
                const listened = !!(f as unknown as { read_at: string | null }).read_at;
                const thanked = !!(f as unknown as { thanked_at: string | null }).thanked_at;
                return (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-lg bg-stone-50">
                    <span className="text-stone-600">
                      🎤 {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className={cn('font-medium', listened ? 'text-emerald-600' : 'text-stone-400')}>
                      {thanked ? '❤️ Loved it' : listened ? '✓ Listened' : 'Not played yet'}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Feedback form */}
      <div id="feedback-section">
        <FeedbackList initial={feedback} studentId={id} studentFirstName={firstName} />
      </div>

      <BuddyStudentViewClient
        studentId={id}
        studentName={student.full_name}
        studentPercentile={student.cat_percentile}
        buddyId={user.id}
      />
    </div>
  );
}
