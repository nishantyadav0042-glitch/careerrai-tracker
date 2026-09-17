import { requireAdmin } from '@/lib/admin-auth';
import { studyDayString } from '@/lib/study-day';
import { momentumStreak } from '@/lib/streak-utils';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getKindTimeline } from '@/lib/os/timeline';
import {
  outreachState, outreachDraft, STATE_ORDER, STATE_LABEL,
  type OutreachRow, type OutreachState,
} from '@/lib/student-outreach';
import { CopyDraftButton, MarkContactedButton } from '../log-breakers/row-actions';
import Link from 'next/link';

// ── STUDENT OUTREACH — the founder's own feedback round ─────────────────────
//
// Founder, 16 Sep 2026: "Make a separate section for every student who logged
// in the last three weeks — I'll reach out to them on WhatsApp myself."
//
// One question per student: give me ONE suggestion, strength or weakness.
// Raw and honest. He sends every message by hand.
//
// WHY THIS IS NOT log-breakers. That board asks "you stopped — why?", and it
// only holds students who already went quiet. This one deliberately INCLUDES
// students who are still logging, because the person mid-streak is the only
// one who can say what is working, and no list in this product has ever asked
// them. That is the whole reason it is a separate section rather than another
// cohort filter on the old page.
//
// THE WINDOW IS 21 DAYS OF LOG ACTIVITY, not 21 days of signup. A student who
// joined in July and logged last Tuesday is exactly who he wants; a student
// who joined last Tuesday and never logged has nothing to give feedback about.
//
// Every number shown — and every number quoted in a draft — comes from
// daily_reports and momentumStreak(), the same authorities the product uses.
// The stored streak counter is NOT used: it freezes at its last value until
// the next log, so it would tell a student they are on a 6-day streak that
// died last week. A wrong number in a personal message is worse than a
// generic message, because it proves nobody actually looked.

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 21;

export default async function StudentOutreachPage() {
  const { admin } = await requireAdmin();
  const today = studyDayString();
  const cutoffMs = Date.parse(today) - WINDOW_DAYS * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);

  const [{ data: reports }, { data: streaks }, contacts] = await Promise.all([
    fetchAll(() => admin.from('daily_reports').select('student_id, report_date')),
    fetchAll(() => admin.from('streak_data').select('student_id, current_streak, last_log_date, shields')),
    getKindTimeline(admin, 'founder_contact'),
  ]);

  // Full log history per student — needed for longest-streak and total days
  // even though the WINDOW decides who appears.
  const byStudent = new Map<string, string[]>();
  for (const r of reports ?? []) {
    const arr = byStudent.get(r.student_id as string) ?? [];
    arr.push(r.report_date as string);
    byStudent.set(r.student_id as string, arr);
  }

  // Who logged inside the window. This is the guest list.
  const recent = [...byStudent.entries()]
    .filter(([, days]) => days.some((d) => d >= cutoff))
    .map(([id]) => id);

  const { data: profiles } = recent.length
    ? await admin.from('profiles')
        .select('id, full_name, phone, role, is_demo, is_test_account')
        .in('id', recent)
    : { data: [] };

  const streakById = new Map((streaks ?? []).map((s) => [s.student_id as string, s]));
  const contactedAt = new Map<string, string>();
  for (const c of contacts) if (!contactedAt.has(c.entityId)) contactedAt.set(c.entityId, c.createdAt);

  const rows: (OutreachRow & { contacted: string | null })[] = [];
  for (const p of profiles ?? []) {
    // Staff, demo and test rows would waste the founder's messages and skew
    // every count on the page. Same filter the other boards use.
    if (p.role !== 'student' || p.is_demo === true || p.is_test_account === true) continue;
    const days = [...new Set(byStudent.get(p.id as string) ?? [])].sort();
    if (days.length === 0) continue;

    const st = streakById.get(p.id as string);
    const live = momentumStreak(
      st?.current_streak as number | null,
      st?.shields as number | null,
      st?.last_log_date as string | null,
    );
    const last = days[days.length - 1];

    rows.push({
      studentId: p.id as string,
      name: (p.full_name as string | null) ?? '(no name)',
      phone: (p.phone as string | null) ?? null,
      logDays: days.length,
      liveStreak: typeof live === 'number' ? live : 0,
      longestStreak: longestRun(days),
      lastLog: last,
      daysSinceLastLog: Math.floor((Date.parse(today) - Date.parse(last)) / 86_400_000),
      contacted: contactedAt.get(p.id as string) ?? null,
    });
  }

  const grouped = new Map<OutreachState, typeof rows>();
  for (const r of rows) {
    const s = outreachState(r);
    grouped.set(s, [...(grouped.get(s) ?? []), r]);
  }
  // Within a group: longest streak first, then most recently active.
  for (const [, list] of grouped) {
    list.sort((a, b) => (b.liveStreak - a.liveStreak) || (a.daysSinceLastLog - b.daysSinceLastLog));
  }

  const reachable = rows.filter((r) => r.phone).length;
  const done = rows.filter((r) => r.contacted).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-black text-stone-900">Student outreach</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-600">
        Every student who logged in the last {WINDOW_DAYS} days. One question each: one suggestion,
        strength or weakness. Each draft is written from that student&apos;s own log pattern — send it as
        it is, or edit it first. Nothing here sends anything by itself.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-semibold">
        <span className="rounded-lg bg-stone-900 px-3 py-1.5 text-white">{rows.length} students</span>
        <span className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-700">{reachable} with a phone number</span>
        <span className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-700">{done} already contacted</span>
      </div>

      {rows.length === 0 && (
        <p className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
          Nobody has logged in the last {WINDOW_DAYS} days. That is the finding, not an empty page.
        </p>
      )}

      {STATE_ORDER.map((state) => {
        const list = grouped.get(state) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={state} className="mt-8">
            <h2 className="flex items-baseline gap-2 text-sm font-bold uppercase tracking-wide text-stone-500">
              {STATE_LABEL[state]}
              <span className="font-mono text-[12px] font-normal text-stone-400">{list.length}</span>
            </h2>
            <ul className="mt-3 space-y-3">
              {list.map((r) => (
                <li key={r.studentId} className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-bold text-stone-900">{r.name}</span>
                    {r.phone
                      ? <span className="font-mono text-[12px] text-stone-500">{r.phone}</span>
                      : <span className="rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800">no phone — can&apos;t reach</span>}
                    {r.contacted && (
                      <span className="rounded bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-700">
                        contacted {r.contacted.slice(0, 10)}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 font-mono text-[12px] text-stone-500">
                    {r.logDays} log day{r.logDays === 1 ? '' : 's'} · live streak {r.liveStreak} ·
                    longest {r.longestStreak} · last logged {r.lastLog}
                    {r.daysSinceLastLog > 0 ? ` (${r.daysSinceLastLog}d ago)` : ' (today)'}
                  </p>

                  <p className="mt-2 rounded-lg bg-stone-50 p-3 text-[13px] leading-relaxed text-stone-800">
                    {outreachDraft(r)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <CopyDraftButton draft={outreachDraft(r)} phone={r.phone} />
                    <MarkContactedButton studentId={r.studentId} />
                    <Link
                      href={`/admin/leads/${r.studentId}`}
                      className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] font-semibold text-stone-600"
                    >
                      Profile
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Longest run of consecutive calendar days in a sorted, de-duplicated list.
 *
 * Computed here rather than read from streak_data.longest_streak because that
 * column is a running maximum maintained by the same writer that freezes
 * current_streak — trusting it would let a message quote a streak the student
 * never actually had.
 */
function longestRun(sortedDays: string[]): number {
  let best = 0, run = 0, prev = 0;
  for (const d of sortedDays) {
    const t = Date.parse(d);
    run = prev && t - prev === 86_400_000 ? run + 1 : 1;
    prev = t;
    if (run > best) best = run;
  }
  return best;
}
