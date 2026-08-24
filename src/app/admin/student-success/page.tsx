import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/admin-auth';
import { MisView } from './mis-view';
import {
  returnPicture, interventionPicture, conversionPicture, learningPicture, reachPicture,
  type ReturnRow, type LedgerRow,
} from '@/lib/student-success-mis';
import type { SessionRow } from '@/lib/session-lifecycle';
import type { ReasonCategory } from '@/lib/intervention-taxonomy';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Student Success · CareerRai' };

// ── STUDENT SUCCESS, with the human layer sitting on top of it ──────────────
//
// Deliberately NOT a sales dashboard, and deliberately not a second Mission
// Control. Mission Control answers "is the company healthy". This answers the
// four questions the loop turns on:
//
//   STUDENT -> SIGNAL -> INTERVENTION -> RESPONSE -> OUTCOME -> LEARNING
//
// Every read here is CHECKED. An unchecked read that renders as a confident
// business answer is an infrastructure failure wearing a business answer's
// clothes — and this is the screen a funding case gets argued from.

const DAY = 86_400_000;

/** A read that failed is UNKNOWN, never an empty result silently shown as zero. */
type Read<T> = { ok: true; rows: T[] } | { ok: false; error: string };

export default async function StudentSuccessPage() {
  const { admin } = await requireAdmin();
  // eslint-disable-next-line react-hooks/purity -- server component; per-request "now" is correct
  const now = Date.now();

  const [profilesR, reportsR, ledgerR, sessionsR, pushR] = await Promise.all([
    admin.from('profiles').select('id, created_at, push_subscription, phone')
      .eq('role', 'student').limit(5000),
    admin.from('daily_reports').select('student_id, report_date').limit(50000),
    admin.from('intervention_ledger')
      .select('student_id, rep_id, lane, reason_category, logged_d3, logged_d7').limit(5000),
    admin.from('video_sessions').select('session_status, started_at, ended_at').limit(5000),
    admin.from('notifications').select('user_id, pushed_at')
      .gte('pushed_at', new Date(now - 7 * DAY).toISOString()).limit(50000),
  ]);

  const failures: string[] = [];
  const take = <T,>(r: { data: T[] | null; error: { message: string } | null }, what: string): Read<T> => {
    if (r.error) { failures.push(`${what}: ${r.error.message}`); return { ok: false, error: r.error.message }; }
    return { ok: true, rows: (r.data ?? []) as T[] };
  };

  const profiles = take<{ id: string; created_at: string | null; push_subscription: unknown; phone: string | null }>(profilesR, 'students');
  const reports = take<{ student_id: string; report_date: string }>(reportsR, 'daily logs');
  const ledger = take<{ student_id: string; rep_id: string; lane: string | null; reason_category: string | null; logged_d3: boolean | null; logged_d7: boolean | null }>(ledgerR, 'intervention ledger');
  const sessions = take<SessionRow>(sessionsR, 'sessions');
  const pushes = take<{ user_id: string; pushed_at: string | null }>(pushR, 'push delivery');

  // ── Return, computed cohort-correctly ─────────────────────────────────────
  const logsByStudent = new Map<string, string[]>();
  if (reports.ok) {
    for (const r of reports.rows) {
      const a = logsByStudent.get(r.student_id);
      if (a) a.push(r.report_date); else logsByStudent.set(r.student_id, [r.report_date]);
    }
  }

  const returnRows: ReturnRow[] = profiles.ok ? profiles.rows.map((p) => {
    const created = p.created_at ? Date.parse(p.created_at) : null;
    const tenureDays = created == null ? null : Math.floor((now - created) / DAY);
    const days = logsByStudent.get(p.id) ?? [];
    const signupDay = created == null ? null : new Date(created).toISOString().slice(0, 10);
    // A window is only answerable once the student has LIVED through it.
    // Otherwise "did they return by day 7" has no answer, and false would be
    // a fabricated failure.
    const within = (n: number): boolean | null => {
      if (signupDay == null || tenureDays == null || tenureDays < n) return null;
      const end = new Date(Date.parse(signupDay) + n * DAY).toISOString().slice(0, 10);
      return days.some((d) => d > signupDay && d <= end);
    };
    return { studentId: p.id, tenureDays, logDays: new Set(days).size, d1: within(1), d3: within(3), d7: within(7) };
  }) : [];

  const ledgerRows: LedgerRow[] = ledger.ok ? ledger.rows.map((l) => ({
    studentId: l.student_id, repId: l.rep_id, lane: l.lane,
    reasonCategory: (l.reason_category as ReasonCategory | null) ?? null,
    loggedD3: l.logged_d3, loggedD7: l.logged_d7,
  })) : [];

  // Pushes per day, over students who ACTUALLY RECEIVED one. Dividing by all
  // students would hide the pressure on the few we can reach behind the many
  // we cannot.
  let pushesPerDay: number | null = null;
  if (pushes.ok) {
    const delivered = pushes.rows.filter((p) => p.pushed_at != null);
    const reached = new Set(delivered.map((p) => p.user_id)).size;
    pushesPerDay = reached === 0 ? null : Math.round((delivered.length / reached / 7) * 10) / 10;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="text-stone-400 hover:text-stone-700"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-lg font-bold text-stone-900">Student Success</h1>
      </div>
      <p className="text-[12px] leading-snug text-stone-500">
        Student → signal → intervention → response → outcome → learning. The human
        layer appears here only through what happened to students afterwards.
      </p>

      {failures.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
          <p className="text-[12px] font-bold text-rose-800">
            Some numbers on this page could not be read and are missing, not zero:
          </p>
          <ul className="mt-1 list-disc pl-4 text-[11px] text-rose-700">
            {failures.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      {ledgerRows.length > 0 && (
        <p className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] leading-snug text-stone-500">
          <b>The comparison arm is not yet instrumented.</b> Lane-matched
          contacted-vs-uncontacted needs every uncontacted student classified by
          the same authority the call queue uses. Until that exists, the lane
          rows below report counts and UNAVAILABLE rather than a difference.
        </p>
      )}

      <MisView
        ret={returnPicture(returnRows)}
        intervention={interventionPicture(ledgerRows, [])}
        conversion={conversionPicture(sessions.ok ? sessions.rows : [])}
        learning={learningPicture(ledgerRows)}
        reach={reachPicture(profiles.ok ? profiles.rows.map((p) => ({
          hasPush: p.push_subscription != null,
          hasPhone: typeof p.phone === 'string' && p.phone.trim().length > 0,
        })) : [])}
        pushesPerReachedStudentPerDay={pushesPerDay}
      />
    </div>
  );
}
