import { requireAdmin } from '@/lib/admin-auth';
import { studyDayString } from '@/lib/study-day';
import { momentumStreak } from '@/lib/streak-utils';
import { cohortOf, whatsappDraft, type LogBreakerRow, type LogBreakerCohort } from '@/lib/log-breakers';
import { getKindTimeline } from '@/lib/os/timeline';
import { CopyDraftButton, MarkContactedButton } from './row-actions';
import Link from 'next/link';

import { fetchAll } from '@/lib/supabase/fetch-all';
// ── LOG BREAKERS — the founder's retention-research queue ───────────────────
//
// Not an analytics dashboard. A worklist: every student who logged at least
// once, bucketed by how far they got before stopping, with the WhatsApp
// message ready to send and a place to record what came back. The founder
// talks to these students personally; this page just makes sure no
// conversation is lost and no student is asked twice.
//
// Everything is computed from the same authorities the product uses:
// daily_reports for what happened, momentumStreak() for streak truth (the
// stored counter lies — it freezes at its last value until the next log),
// timeline_events for who was already contacted.

export const dynamic = 'force-dynamic';

const COHORT_LABELS: Record<LogBreakerCohort, string> = {
  '1': '1 day', '2': '2 days', '3': '3 days', '4': '4 days', '5': '5 days',
  '6': '6 days', '7plus': '7+ days', broken: 'Broken streak', never_returned: 'Never returned',
};

export default async function LogBreakersPage({ searchParams }: {
  searchParams: Promise<{ cohort?: string }>;
}) {
  const { admin } = await requireAdmin();
  const { cohort: rawCohort } = await searchParams;
  const active = (rawCohort && rawCohort in COHORT_LABELS ? rawCohort : 'never_returned') as LogBreakerCohort;
  const today = studyDayString();

  const [{ data: reports }, { data: streaks }, contacts] = await Promise.all([
    fetchAll(() => admin.from('daily_reports').select('student_id, report_date')),
    fetchAll(() => admin.from('streak_data').select('student_id, current_streak, longest_streak, last_log_date, shields')),
    getKindTimeline(admin, 'founder_contact'),
  ]);

  // Per-student log history
  const byStudent = new Map<string, string[]>();
  for (const r of reports ?? []) {
    const arr = byStudent.get(r.student_id) ?? [];
    arr.push(r.report_date as string);
    byStudent.set(r.student_id as string, arr);
  }
  const ids = [...byStudent.keys()];
  const { data: profiles } = await admin.from('profiles')
    .select('id, full_name, phone, created_at, app_installed, role, is_demo, is_test_account')
    .in('id', ids);

  const streakById = new Map((streaks ?? []).map((s) => [s.student_id as string, s]));
  const contactById = new Map<string, { at: string; note: string }>();
  for (const c of contacts) {
    if (!contactById.has(c.entityId)) contactById.set(c.entityId, { at: c.createdAt, note: c.summary });
  }

  const rows: LogBreakerRow[] = [];
  for (const p of profiles ?? []) {
    if (p.role !== 'student' || p.is_demo === true || p.is_test_account === true) continue;
    const days = [...new Set(byStudent.get(p.id as string) ?? [])].sort();
    if (days.length === 0) continue;
    const st = streakById.get(p.id as string);
    const m = momentumStreak(st?.current_streak as number | null, st?.shields as number | null, st?.last_log_date as string | null);
    const first = days[0], last = days[days.length - 1];
    const gapToSecond = days.length > 1 ? (Date.parse(days[1]) - Date.parse(first)) / 86_400_000 : null;
    const contact = contactById.get(p.id as string) ?? null;
    rows.push({
      studentId: p.id as string,
      name: (p.full_name as string | null) ?? '(no name)',
      phone: (p.phone as string | null) ?? null,
      signupDate: (p.created_at as string).slice(0, 10),
      installed: p.app_installed === true,
      logDays: days.length,
      firstLog: first, lastLog: last,
      daysSinceLastLog: Math.floor((Date.parse(today) - Date.parse(last)) / 86_400_000),
      longestStreak: (st?.longest_streak as number | null) ?? 1,
      liveStreak: m.streak,
      streakBroken: m.broken,
      returnedNextDay: gapToSecond !== null && gapToSecond <= 1,
      returnedWithin3: days.some((d) => { const g = (Date.parse(d) - Date.parse(first)) / 86_400_000; return g >= 1 && g <= 3; }),
      returnedWithin7: days.some((d) => { const g = (Date.parse(d) - Date.parse(first)) / 86_400_000; return g >= 1 && g <= 7; }),
      lastContactAt: contact?.at?.slice(0, 10) ?? null,
      lastContactNote: contact?.note ?? null,
    });
  }

  const counts = new Map<LogBreakerCohort, number>();
  for (const r of rows) for (const c of cohortOf(r, today)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const visible = rows
    .filter((r) => cohortOf(r, today).includes(active))
    .sort((a, b) => b.lastLog.localeCompare(a.lastLog));

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Log Breakers</h1>
        <p className="mt-1 text-sm text-stone-500">
          {rows.length} students have logged at least once. These are the ones to call — bucketed by how far they got before stopping.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(COHORT_LABELS) as LogBreakerCohort[]).map((c) => (
          <Link key={c} href={`/admin/log-breakers?cohort=${c}`}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${
              c === active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600'}`}>
            {COHORT_LABELS[c]} · {counts.get(c) ?? 0}
          </Link>
        ))}
      </div>

      <div className="space-y-2.5">
        {visible.length === 0 && <p className="py-8 text-center text-sm text-stone-400">Nobody in this bucket.</p>}
        {visible.map((r) => (
          <div key={r.studentId} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-bold text-stone-900">{r.name}</span>
                {r.phone && <span className="ml-2 font-mono text-[12px] text-stone-500">{r.phone}</span>}
                {r.lastContactAt && (
                  <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                    contacted {r.lastContactAt}
                  </span>
                )}
              </div>
              <span className="text-[12px] text-stone-400">last log {r.lastLog} · {r.daysSinceLastLog}d ago</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-stone-500">
              <span>{r.logDays} log day{r.logDays === 1 ? '' : 's'}</span>
              <span>first {r.firstLog}</span>
              <span>best streak {r.longestStreak}</span>
              <span>live streak {r.liveStreak}</span>
              <span>{r.installed ? 'installed' : 'no install'}</span>
              <span>day-2 return: {r.returnedNextDay ? 'yes' : 'no'}</span>
              <span>within 7d: {r.returnedWithin7 ? 'yes' : 'no'}</span>
            </div>
            {r.lastContactNote && (
              <p className="mt-1.5 rounded bg-stone-50 px-2 py-1 text-[12px] italic text-stone-600">“{r.lastContactNote}”</p>
            )}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <CopyDraftButton draft={whatsappDraft(r)} phone={r.phone} />
              <MarkContactedButton studentId={r.studentId} />
              <Link href={`/admin/leads/${r.studentId}`} className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] font-semibold text-stone-600">
                Open student →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
