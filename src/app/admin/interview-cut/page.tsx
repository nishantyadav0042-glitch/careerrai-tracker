import { requireAdmin } from '@/lib/admin-auth';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { studyDayString } from '@/lib/study-day';
import {
  classifyCohorts, matchedRepeaterSample, SETTLE_DAYS,
  type CohortRow, type CohortStudent,
} from '@/lib/interview-cohorts';

// ── THE INTERVIEW CUT ───────────────────────────────────────────────────────
//
// Read-only. Nothing here sends anything, and nothing here drafts anything —
// see lib/interview-cohorts for why a drafted message would defeat the point.
//
// Student Outreach lists students who logged in the LAST 21 DAYS, which is
// almost the opposite of the population this research needs: 174 of 302
// students logged once and never came back, and nearly all of them fall
// outside that window. This page is the full roster plus a repeater sample
// drawn from the same signup months, so the two conversations are with people
// who arrived at the same time.

export const dynamic = 'force-dynamic';

const OPENING = 'You used CareerRai on {date}. Tell me what you remember about that experience and what happened afterwards.';

const THEN = [
  'What did you do for CAT preparation that week?',
  'What did you do instead that week?',
  'Did you think about opening CareerRai again?',
  'What did you expect to find if you opened it?',
  'What actually happened?',
  'What would you have wanted CareerRai to do differently?',
];

function Roster({ title, note, rows }: { title: string; note: string; rows: CohortStudent[] }) {
  return (
    <section className="mt-8">
      <h2 className="flex items-baseline gap-2 text-sm font-bold uppercase tracking-wide text-stone-500">
        {title}
        <span className="font-mono text-[12px] font-normal text-stone-400">{rows.length}</span>
      </h2>
      <p className="mt-1 text-[12px] text-stone-500">{note}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wide text-stone-500">
              <th className="py-2 pr-3 font-semibold">Student</th>
              <th className="py-2 pr-3 font-semibold">Phone</th>
              <th className="py-2 pr-3 font-semibold">Joined</th>
              <th className="py-2 pr-3 font-semibold">First log</th>
              <th className="py-2 pr-3 font-semibold">Last log</th>
              <th className="py-2 pr-3 text-right font-semibold">Days</th>
              <th className="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((s) => (
              <tr key={s.studentId} className="border-b border-stone-100">
                <td className="py-2 pr-3 font-semibold text-stone-900">{s.name}</td>
                <td className="py-2 pr-3 font-mono text-[12px] text-stone-600">
                  {s.phone ?? <span className="text-amber-700">no phone</span>}
                </td>
                <td className="py-2 pr-3 font-mono text-[12px] text-stone-500">{s.joined}</td>
                <td className="py-2 pr-3 font-mono text-[12px] text-stone-700">{s.firstLog}</td>
                <td className="py-2 pr-3 font-mono text-[12px] text-stone-500">{s.lastLog}</td>
                <td className="py-2 pr-3 text-right font-mono text-[12px] text-stone-700">{s.logDays}</td>
                <td className="py-2">
                  <a href={`/admin/leads/${s.studentId}`} className="text-[12px] font-semibold text-stone-500 underline underline-offset-2">
                    Profile
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function InterviewCutPage() {
  const { admin } = await requireAdmin();
  const asOf = studyDayString();

  const [{ data: logs }, { data: people }] = await Promise.all([
    fetchAll(() => admin.from('daily_reports').select('student_id, report_date')),
    fetchAll(() => admin.from('profiles').select('id, full_name, phone, role, is_demo, is_test_account, created_at')),
  ]);

  const byStudent = new Map<string, string[]>();
  for (const l of logs ?? []) {
    const id = l.student_id as string;
    byStudent.set(id, [...(byStudent.get(id) ?? []), l.report_date as string]);
  }

  const rows: CohortRow[] = (people ?? [])
    .filter((p) => p.role === 'student' && p.is_demo !== true && p.is_test_account !== true)
    .map((p) => ({
      studentId: p.id as string,
      name: (p.full_name as string | null) ?? '(no name)',
      phone: (p.phone as string | null) ?? null,
      joined: String(p.created_at).slice(0, 10),
      logDates: byStudent.get(p.id as string) ?? [],
    }));

  const { oneAndDone, repeaters, tooRecent } = classifyCohorts(rows, { asOf });
  const sample = matchedRepeaterSample(oneAndDone, repeaters, 10);
  const reachable = oneAndDone.filter((s) => s.phone).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-black text-stone-900">Interview cut</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-600">
        Read-only. Nothing here sends or drafts a message — deliberately, because a drafted message is a leading
        question with a send button attached.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-semibold">
        <span className="rounded-lg bg-stone-900 px-3 py-1.5 text-white">{oneAndDone.length} logged once, never again</span>
        <span className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-700">{reachable} of those reachable</span>
        <span className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-700">{repeaters.length} repeaters</span>
        <span className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-500">{tooRecent} too recent to judge</span>
      </div>

      <section className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-stone-500">Open with exactly this</h2>
        <p className="mt-2 rounded-lg bg-white p-3 text-[13px] leading-relaxed text-stone-900">{OPENING}</p>
        <ul className="mt-3 space-y-1 text-[13px] text-stone-700">
          {THEN.map((q) => <li key={q}>· {q}</li>)}
        </ul>
        <p className="mt-3 text-[11.5px] leading-relaxed text-stone-500">
          Do not say this is about retention, and do not name a theory. Never ask whether a better plan, a reminder
          or an adaptive schedule would have brought them back — almost everyone says yes and the answer means
          nothing. Record what they say close to verbatim; classify the mechanism afterwards, across all twenty,
          not one interview at a time.
        </p>
      </section>

      <Roster
        title="Logged once, never again"
        note={`Every one of them, not a recent slice. Excludes anyone whose first log is less than ${SETTLE_DAYS} days old — they have not yet had the week in which returning was possible.`}
        rows={oneAndDone}
      />

      <Roster
        title="Repeaters — matched sample"
        note="Drawn to mirror the signup months above, because repeaters skew older and an unmatched comparison would recover the calendar rather than the behaviour. A sample for conversation, never a rate."
        rows={sample}
      />
    </div>
  );
}
