import Link from 'next/link';
import { AlertTriangle, Video, Lock } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeBreach } from '@/lib/plan-breach';
import { computeRequiredPace, remainingSyllabusHours, remainingMockHours, studentEffortMultiplier } from '@/lib/study-pace';
import { CallCloseout } from './call-closeout';
import { QuickNote } from './quick-note';
import { SessionStart } from './session-start';
import { joinState, canJoinNow, countdownLabel } from '@/lib/session-link';
import { isCovered } from '@/lib/coverage-status';

// ── The Buddy Cockpit ───────────────────────────────────────────────────────
//
// Founder brief, 5 Aug: why the student joined · call notes · what's next ·
// when's the next call — and a close-out that costs a working professional
// almost nothing.
//
// Ordered the way a time-poor mentor needs it three minutes before a call, not
// the way the database is shaped: next call → the one thing to do → why they
// came → the open promise → notes → close out.
//
// Everything here is computed from engines the student side already uses
// (plan-breach, study-pace), so a mentor can never be shown a different
// reality from their student — the Incident #5/#17 rule.

/** Signup answers are stored as keys; a mentor should read the sentence. */
const PAIN_IN_THEIR_WORDS: Record<string, string> = {
  no_tracking: 'I can’t track whether my prep is actually working.',
  no_mentor: 'I have no one to guide me.',
  no_structure: 'I have no structure — I don’t know what to study each day.',
  mock_plateau: 'My mock scores have stopped improving.',
  time: 'I can’t find enough time.',
  consistency: 'I start well and then fall off.',
  weak_section: 'One section keeps dragging my score down.',
  syllabus: 'The syllabus feels too big to finish.',
};

const NEED_IN_THEIR_WORDS: Record<string, string> = {
  falling_behind: 'I have a plan but I keep falling behind.',
  no_plan: 'I don’t have a proper plan at all.',
  managing: 'I’m managing on my own, but want to be sure.',
};

export interface CockpitProps {
  studentId: string;
  buddyId: string;
  fullName: string;
  painPoints: string[] | null;
  needCheck: string | null;
  dreamColleges: string[] | null;
  targetPercentile: number | null;
  weakestSection: string | null;
  coachingEnrolled: boolean | null;
  hoursAvailable: number | null;
  isRepeater: boolean | null;
  lastYearPercentile: number | null;
  isWorkingProfessional: boolean | null;
  syllabusTargetDate: string | null;
  nextSession: {
    id: string; scheduled_at: string; google_meet_link: string | null;
    // Carried so the card can show Start / Live. Without these the cockpit
    // cannot tell a booked call from one already running.
    session_status?: string | null; started_at?: string | null;
  } | null;
}

export async function BuddyCockpit(p: CockpitProps) {
  const admin = createAdminClient();
  const first = p.fullName.split(' ')[0];

  const [{ data: coverage }, { data: logs }, { data: streak }, { data: notes }, { data: openCommit }] =
    await Promise.all([
      admin.from('topic_coverage').select('topic, status').eq('student_id', p.studentId),
      admin.from('daily_reports').select('report_date, study_duration')
        .eq('student_id', p.studentId).order('report_date', { ascending: false }).limit(21),
      admin.from('streak_data').select('current_streak, last_log_date').eq('student_id', p.studentId).maybeSingle(),
      admin.from('buddy_notes').select('id, body, created_at')
        .eq('buddy_id', p.buddyId).eq('student_id', p.studentId)
        .order('created_at', { ascending: false }).limit(4),
      admin.from('session_commitments').select('id, commitment, created_at')
        .eq('buddy_id', p.buddyId).eq('student_id', p.studentId).is('outcome', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

  const rows = coverage ?? [];
  const done = rows.filter((r) => isCovered(r.status)).length;
  // A repeater's remaining syllabus is genuinely smaller than a first-timer's;
  // the mentor needs to see the same number the student's app shows.
  const syllabusLeft = remainingSyllabusHours(rows, studentEffortMultiplier({
    isRepeater: p.isRepeater, lastYearPercentile: p.lastYearPercentile,
  }));

  // Observed pace over the window — the honest denominator, not "days they
  // chose to log". Same rule the replan engine learned the hard way.
  const window = logs ?? [];
  const observedPerDay = window.length
    ? window.reduce((s, l) => s + Number(l.study_duration ?? 0), 0) / Math.max(window.length, 7)
    : null;

  const now = new Date();
  const pace = p.syllabusTargetDate
    ? computeRequiredPace({
        remainingHours: syllabusLeft,
        mockHours: remainingMockHours(syllabusLeft),
        today: now,
        targetDate: new Date(p.syllabusTargetDate + 'T00:00:00'),
        committedPerDay: p.hoursAvailable ?? null,
      })
    : null;

  const breach = pace
    ? computeBreach({
        lastLogDate: streak?.last_log_date ?? null,
        requiredPerDay: pace.requiredPerDay,
        observedPerDay,
        daysToTarget: pace.daysLeft,
        today: now,
        firstName: first,
      })
    : null;

  const quotes = [
    ...(p.needCheck ? [NEED_IN_THEIR_WORDS[p.needCheck]].filter(Boolean) : []),
    ...(p.painPoints ?? []).map((k) => PAIN_IN_THEIR_WORDS[k]).filter(Boolean),
  ] as string[];

  // Commitment chips built from THIS student's real state — the common case
  // should be one tap on something already true.
  const suggestions: string[] = [];
  if ((streak?.current_streak ?? 0) < 3) suggestions.push('Log every day this week');
  if (breach && breach.level !== 'none') suggestions.push(`Study ${Math.max(1, Math.round(pace!.requiredPerDay / 2))} hrs/day this week`);
  if (p.weakestSection) suggestions.push(`Finish ${p.weakestSection} basics`);
  suggestions.push('Take 1 full mock');
  if (done < rows.length) suggestions.push('Close 3 more topics');

  const sessionAt = p.nextSession ? new Date(p.nextSession.scheduled_at) : null;
  const minsAway = sessionAt ? Math.round((sessionAt.getTime() - now.getTime()) / 60_000) : null;
  // eslint-disable-next-line react-hooks/purity -- live countdown; a fresh now() each render is the point
  const sessionNowMs = Date.now();
  const sessionJoinState = joinState({
    scheduledAtIso: p.nextSession?.scheduled_at ?? '',
    nowMs: sessionNowMs,
    hasLink: !!p.nextSession?.google_meet_link,
  });

  const critical = breach?.level === 'critical';

  return (
    <section className="space-y-3">
      {/* 1 · Next call — the first thing a mentor looks for */}
      {sessionAt ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-teal-700 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-teal-100">Next call</p>
            <p className="truncate text-[18px] font-bold">
              {sessionAt.toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short',
                hour: 'numeric', minute: '2-digit',
              })}
            </p>
          </div>
          {/* Both sides open on the SAME rule (lib/session-link). Two different
              gates is how one person ends up alone in a room wondering whether
              the other is coming. */}
          <div className="flex shrink-0 items-center gap-2">
            {canJoinNow(sessionJoinState) && p.nextSession?.google_meet_link ? (
              <a href={p.nextSession.google_meet_link} target="_blank" rel="noopener noreferrer"
                 className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-[14px] font-extrabold text-teal-700">
                Join →
              </a>
            ) : (
              <span className="shrink-0 rounded-lg bg-teal-800 px-2.5 py-1 text-[12px] font-semibold">
                {p.nextSession
                  ? countdownLabel({ scheduledAtIso: p.nextSession.scheduled_at, nowMs: sessionNowMs })
                  : ''}
              </span>
            )}
            {/* Start is gated on the SAME window as Join. A mentor cannot mark
                a call live three hours before it is due — that would make
                started_at meaningless as evidence that the call happened. */}
            {p.nextSession && (canJoinNow(sessionJoinState) || p.nextSession.session_status === 'active') && (
              <SessionStart
                sessionId={p.nextSession.id}
                status={p.nextSession.session_status ?? 'scheduled'}
                startedAt={p.nextSession.started_at ?? null}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2.5 text-stone-600">
            <Video className="h-4 w-4 shrink-0" />
            <p className="text-[14px] font-semibold">No call booked with {first}</p>
          </div>
          <Link href="/buddy/schedule"
                className="shrink-0 rounded-xl bg-stone-900 px-3.5 py-2 text-[13px] font-bold text-white">
            Schedule →
          </Link>
        </div>
      )}

      {/* 2 · The one thing to do on this call */}
      {breach && breach.level !== 'none' && (
        <div className={`rounded-2xl border-2 p-4 ${critical ? 'border-red-300 bg-red-50' : 'border-orange-300 bg-orange-50'}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 shrink-0 ${critical ? 'text-red-600' : 'text-orange-600'}`} />
            <p className={`text-[10px] font-bold uppercase tracking-widest ${critical ? 'text-red-700' : 'text-orange-700'}`}>
              {critical ? 'Plan breached' : 'Off plan'} · do this on the call
            </p>
          </div>
          <p className="mt-1.5 text-[15px] font-bold leading-snug text-stone-900">{breach.buddyLine}</p>
          <ul className="mt-2 space-y-0.5">
            {breach.receipts.map((r) => (
              <li key={r} className="text-[12.5px] leading-snug text-stone-600">· {r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 3 · Why they came — their own words. Never ask this again. */}
      {quotes.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Why {first} came to us</p>
          <div className="mt-2.5 space-y-2">
            {quotes.map((q) => (
              <p key={q} className="border-l-2 border-teal-600 pl-3 text-[15px] leading-snug text-stone-900"
                 style={{ fontFamily: 'Georgia, serif' }}>&ldquo;{q}&rdquo;</p>
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 sm:grid-cols-3">
            {[
              ['Dream', p.dreamColleges?.[0] ?? '—'],
              ['Target', p.targetPercentile ? `${Math.round(p.targetPercentile)}%ile` : '—'],
              ['Coaching', p.coachingEnrolled === true ? 'Yes' : p.coachingEnrolled === false ? 'Self-study' : '—'],
              ['Says he has', p.hoursAvailable ? `${p.hoursAvailable} hrs/day` : '—'],
              ['Attempt', p.isRepeater ? 'Repeater' : 'First'],
              ['Weak section', p.weakestSection ?? 'Not told us'],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-3 py-2">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{k}</dt>
                <dd className="mt-0.5 text-[13.5px] font-semibold text-stone-900">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* 4 · The open promise — the first question of every call */}
      {openCommit && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{first} promised last call</p>
          <p className="mt-1.5 text-[15px] font-semibold text-stone-900">&ldquo;{openCommit.commitment}&rdquo;</p>
          <p className="mt-0.5 text-[12px] text-stone-500">
            Agreed {new Date(openCommit.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} · open the call with this
          </p>
        </div>
      )}

      {/* 5 · Private notes */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-400">
          <Lock className="h-3 w-3" /> Your notes
        </p>
        {(notes ?? []).length > 0 ? (
          <div className="mt-2.5 space-y-2">
            {notes!.map((n) => (
              <div key={n.id} className="rounded-xl bg-stone-50 p-2.5 text-[13.5px] leading-snug text-stone-600">
                <span className="font-semibold text-stone-900">
                  {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                </span>{' — '}{n.body}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-stone-400">Nothing yet. Jot things down during the call.</p>
        )}
        <QuickNote studentId={p.studentId} />
      </div>

      {/* 6 · Close the call */}
      <CallCloseout
        studentId={p.studentId}
        studentFirstName={first}
        sessionId={p.nextSession?.id ?? null}
        openCommitment={openCommit ? { id: openCommit.id, commitment: openCommit.commitment } : null}
        suggestions={suggestions.slice(0, 4)}
      />
    </section>
  );
}
