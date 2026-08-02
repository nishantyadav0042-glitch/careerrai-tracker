'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { StudyHoursChart } from './study-hours-chart';
import {
  dailyBars, weeklyAverage, consistency, sectionSplit, concentrationLine,
  type StudyLogRow, type SplitRow,
} from '@/lib/study-report';

// The study report — restored as a real page.
//
// This route was a bare `redirect('/student/profile?tab=history')`: the report
// had been folded into a Profile tab, where a student asking for it by name
// could not find it. Vedprakash — 18 logged days and 41 hours, the most engaged
// student on the product — wrote in asking for "a page on dashboard where we
// can see our study report.. how much we studied per day.. any graph… also avg
// weekly study ratio.. topics finished".
//
// Three of his four asks existed nowhere. The Profile list shows what he
// logged; it never told him his weekly average, his direction, or where his
// hours actually went. Those are the things he cannot work out in his head —
// and the only honest reason to open an app you already gave the data to.
//
// Every number comes from lib/study-report (pure, 20 tests). This file fetches
// and arranges; it computes nothing, so nothing here can quietly disagree with
// the tests.
export default function StudentReportsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<StudyLogRow[] | null>(null);
  const [coverage, setCoverage] = useState<{ done: number; total: number } | null>(null);
  // Captured once, in the effect — never read from the clock during render.
  // Every figure on this page is anchored to a single "today", so a re-render
  // that crossed midnight cannot leave the chart on one day and the weekly
  // comparison on another.
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // IST, because a CAT aspirant's "today" is not UTC's — a 1 a.m. session
      // belongs to the day they lived, not the day the server is in.
      setToday(new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setRows([]); return; }

      // 60 days: enough for the 14-day chart AND the 7-vs-7 comparison behind
      // it, with room for a student who logs sparsely.
      const [{ data: reps }, { data: cov }] = await Promise.all([
        supabase.from('daily_reports')
          .select('report_date, study_duration, topics_covered')
          .eq('student_id', user.id)
          .order('report_date', { ascending: false })
          .limit(60),
        supabase.from('topic_coverage')
          .select('status')
          .eq('student_id', user.id),
      ]);

      setRows((reps ?? []) as StudyLogRow[]);
      const all = cov ?? [];
      setCoverage({
        done: all.filter((c) => c.status !== 'not_started').length,
        total: all.length,
      });
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows === null || today === null) {
    return <Shell><p className="text-sm text-stone-500">Loading your report…</p></Shell>;
  }

  const bars = dailyBars(rows, today, 14);
  const week = weeklyAverage(rows, today);
  const days = consistency(rows, today);
  const split = sectionSplit(rows);
  const headline = concentrationLine(split, days.daysLogged);

  if (rows.length === 0) {
    return (
      <Shell>
        <Card>
          <p className="text-sm font-medium text-stone-800">Nothing to report yet.</p>
          <p className="mt-1 text-sm text-stone-600">
            Log a day of study and this page starts filling in — your hours, your
            weekly average, and where your time is actually going.
          </p>
          <Link href="/student/tracker" className="mt-4 inline-block rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">
            Log today →
          </Link>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Shown only when the split is genuinely lopsided (see
          concentrationLine). A report with a headline every week is a report
          whose headline nobody reads. */}
      {headline && (
        <Card className="border-orange-200 bg-orange-50">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600">What stands out</p>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-stone-900">{headline}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="This week"
          value={`${week.thisWeek}h`}
          sub={
            week.direction === 'new' ? 'first week logged'
              : week.deltaPct === null ? 'vs last week'
                : `${week.deltaPct > 0 ? '+' : ''}${week.deltaPct}% vs last week`
          }
          tone={week.direction === 'down' ? 'down' : week.direction === 'up' ? 'up' : 'flat'}
        />
        <Stat
          label="Days logged"
          value={`${days.daysLogged}/${days.daysElapsed}`}
          sub={`${days.pct}% of days since you started`}
          tone={days.pct >= 60 ? 'up' : days.pct < 30 ? 'down' : 'flat'}
        />
      </div>

      <Card>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Hours per day · last 14 days</h2>
        <div className="mt-3">
          <StudyHoursChart data={bars} />
        </div>
        <p className="mt-2 text-[11px] text-stone-400">
          Empty bars are days with no log — the gaps are part of the picture.
        </p>
      </Card>

      {split.length > 0 && (
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Where your hours went</h2>
          <div className="mt-3 space-y-2.5">
            {split.map((s) => <SplitBar key={s.label} row={s} />)}
          </div>
        </Card>
      )}

      {coverage && coverage.total > 0 && (
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Syllabus</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-stone-900">{coverage.done}</span>
            <span className="text-sm text-stone-500">of {coverage.total} topics started</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-stone-900"
              style={{ width: `${Math.round((coverage.done / coverage.total) * 100)}%` }}
            />
          </div>
          <Link href="/student/plan/topics" className="mt-3 inline-block text-xs font-semibold text-stone-700 underline underline-offset-2">
            See every topic →
          </Link>
        </Card>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-4 pb-28">
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="rounded-lg p-2 transition-colors hover:bg-stone-100">
            <ArrowLeft className="h-5 w-5 text-stone-600" />
          </Link>
          <h1 className="text-lg font-bold text-stone-900">Your study report</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'up' | 'down' | 'flat' }) {
  const toneClass = tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-600' : 'text-stone-500';
  return (
    <Card>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
      <p className={`mt-0.5 text-[11px] font-medium ${toneClass}`}>{sub}</p>
    </Card>
  );
}

function SplitBar({ row }: { row: SplitRow }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-stone-800">{row.label}</span>
        <span className="text-xs text-stone-500">
          {row.hours > 0 ? `${row.hours}h · ` : ''}{row.days} {row.days === 1 ? 'day' : 'days'}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-100">
        {/* min 3% so a real-but-tiny share is still visibly present rather than
            rendering as nothing, which reads as "no data". */}
        <div className="h-full rounded-full bg-stone-700" style={{ width: `${Math.max(3, row.pct)}%` }} />
      </div>
    </div>
  );
}
