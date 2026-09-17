import { requireAdmin } from '@/lib/admin-auth';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { studyDayString } from '@/lib/study-day';
import { readRetention, type ReadoutLog } from '@/lib/retention-readout';
import {
  BASELINE, BASELINE_FROZEN_ON, SIGNAL_BANDS, STRONG_LIFT_POINTS, NOISE_BAND_POINTS, readSignal,
} from '@/lib/retention-baseline';

// ── BEFORE AND AFTER, THROUGH ONE SET OF DEFINITIONS ────────────────────────
//
// The frozen baseline (16 Sep) and this readout are computed by the SAME pure
// function over the same window shape, so the comparison cannot drift. A
// readout written independently would cut a cohort a day differently, or count
// an open 7-day tail as a failure to return, and that difference would read as
// the intervention working.
//
// Everything here comes from `daily_reports` — never from the `daily_log`
// event, which undercounted real logs by 80-88% until 15 Sep and put a wrong
// denominator under every retention figure quoted before then.

export const dynamic = 'force-dynamic';

const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

function Delta({ now, was }: { now: number | null; was: number }) {
  if (now == null) return <span className="text-stone-400">no data yet</span>;
  const d = Math.round((now - was) * 10) / 10;
  const tone = d >= STRONG_LIFT_POINTS ? 'text-emerald-700'
    : d <= -NOISE_BAND_POINTS ? 'text-rose-700' : 'text-stone-500';
  return <span className={`font-mono font-bold ${tone}`}>{d >= 0 ? '+' : ''}{d.toFixed(1)}</span>;
}

export default async function RetentionReadoutPage() {
  const { admin } = await requireAdmin();
  const asOf = studyDayString();

  const [{ data: logs }, { data: people }] = await Promise.all([
    fetchAll(() => admin.from('daily_reports').select('student_id, report_date, day_outcome, study_duration')),
    fetchAll(() => admin.from('profiles').select('id, role, is_demo, is_test_account')),
  ]);

  // Same exclusions as the baseline: staff, demo and test accounts are not
  // students and would move every rate on this page.
  const real = new Set(
    (people ?? [])
      .filter((p) => p.role === 'student' && p.is_demo !== true && p.is_test_account !== true)
      .map((p) => p.id as string),
  );
  const rows = ((logs ?? []) as ReadoutLog[]).filter((l) => real.has(l.student_id));
  const now = readRetention(rows, { asOf });

  // The strong band requires the lift to survive the meaningfulness filter, not
  // merely to appear in the raw rate. Note this is CONSERVATIVE: the frozen
  // 59.2% was measured without that filter, so comparing a filtered "after"
  // against an unfiltered "before" can only understate the improvement. That is
  // the right direction for a number a decision hangs on.
  const meaningfulLiftHolds = now.meaningfulRepeatWithin7d.pct != null
    && now.meaningfulRepeatWithin7d.pct - BASELINE.repeat_log_within_7d.value >= STRONG_LIFT_POINTS;
  const signal = now.repeatWithin7d.pct == null
    ? null
    : readSignal(now.repeatWithin7d.pct, meaningfulLiftHolds);

  const ROWS = [
    { label: 'Repeat log within 7 days', note: 'THE GATE', was: BASELINE.repeat_log_within_7d, now: now.repeatWithin7d },
    { label: '…that carried real preparation', note: 'strong/weak split', was: BASELINE.repeat_log_within_7d, now: now.meaningfulRepeatWithin7d },
    { label: 'Second log within 7 days', note: 'stated goal', was: BASELINE.second_log_within_7d, now: now.secondLogWithin7d },
    { label: 'Day-2 return', note: '', was: BASELINE.day2_return, now: now.day2Return },
    { label: 'One-and-done', note: 'lower is better', was: BASELINE.one_and_done, now: now.oneAndDone },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-black text-stone-900">Retention readout</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-600">
        Against the baseline frozen on {BASELINE_FROZEN_ON}, before confirm-or-correct and the
        right-size card shipped. Same definitions on both sides — every figure from{' '}
        <span className="font-mono">daily_reports</span>, never from the <span className="font-mono">daily_log</span> event.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wide text-stone-500">
              <th className="py-2 pr-3 font-semibold">Metric</th>
              <th className="py-2 pr-3 text-right font-semibold">{BASELINE_FROZEN_ON}</th>
              <th className="py-2 pr-3 text-right font-semibold">Now</th>
              <th className="py-2 pr-3 text-right font-semibold">Δ pts</th>
              <th className="py-2 text-right font-semibold">n</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {ROWS.map((r) => (
              <tr key={r.label} className="border-b border-stone-100">
                <td className="py-2.5 pr-3">
                  <span className="font-semibold text-stone-900">{r.label}</span>
                  {r.note && <span className="ml-2 text-[11px] uppercase tracking-wide text-stone-400">{r.note}</span>}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono text-stone-500">{r.was.value.toFixed(1)}%</td>
                <td className="py-2.5 pr-3 text-right font-mono font-bold text-stone-900">{pct(r.now.pct)}</td>
                <td className="py-2.5 pr-3 text-right"><Delta now={r.now.pct} was={r.was.value} /></td>
                <td className="py-2.5 text-right font-mono text-[12px] text-stone-500">
                  {r.now.hits}/{r.now.n}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-stone-500">
        New first-loggers in the window: <span className="font-mono font-bold">{now.newFirstLoggers}</span>. At this
        rate the stated goal cannot move measurably inside two weeks, which is why the gate is the repeat rate —
        see <span className="font-mono">retention-baseline.ts</span>.
      </p>

      <section className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
          The decision, written before the numbers arrived
        </h2>
        {signal == null ? (
          <p className="mt-2 text-sm text-stone-600">
            NOT ESTABLISHED — no log yet has a complete 7-day tail inside the window.
          </p>
        ) : (
          <>
            <p className="mt-2 text-lg font-black uppercase tracking-wide text-stone-900">{signal}</p>
            <p className="mt-1 text-sm text-stone-700">{SIGNAL_BANDS[signal].meaning}</p>
            <p className="mt-2 text-sm font-semibold text-stone-900">→ {SIGNAL_BANDS[signal].then}</p>
          </>
        )}
        <p className="mt-3 text-[11.5px] leading-relaxed text-stone-500">
          A lift counts as strong only if it survives the meaningfulness filter — a return that ticked nothing and
          reported no study is an opening, not a preparation event. The filtered figure is compared against an
          unfiltered baseline, so this reads conservatively by construction.
        </p>
      </section>
    </div>
  );
}
