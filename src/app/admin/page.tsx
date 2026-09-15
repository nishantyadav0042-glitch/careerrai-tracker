import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { assembleFounderInbox, type Severity } from '@/lib/os/founder-inbox';
import { findSacredFailures } from '@/lib/os/sacred-guard';
import { readDismissedIds, withoutDismissed } from '@/lib/os/alert-dismissal';
import { findCadenceBursts } from '@/lib/os/rep-cadence';
import { findUncorroboratedReps } from '@/lib/os/rep-corroboration';
import { findStarvedBooks } from '@/lib/os/book-starvation';
import { findPromiseDebt } from '@/lib/os/promise-debt';
import { DismissAlert } from './dismiss-alert';
import { getRealStudents, getLoggedToday, getSalesReadyToCall, getWantsBuddy } from '@/lib/admin-filters';
import { CheckCircle2, ArrowRight, AlertOctagon, AlertTriangle, Circle, ShieldAlert, Phone, SearchCheck } from 'lucide-react';

import { fetchAll } from '@/lib/supabase/fetch-all';
// Always render live — a cached inbox showing work that is already cleared, or
// hiding work that just appeared, is worse than no inbox.
export const dynamic = 'force-dynamic';

// ── COMMAND CENTER = the Founder Inbox ──────────────────────────────────────
//
// Co-founder review, 9 Aug: "Forget dashboard, think inbox. Every widget ends
// with 'what should Nishant do?' When I clear the inbox, CareerRai is healthy.
// One score in the morning; click for the reasons."
//
// So this screen leads with the score and the open work, not with counts. The
// old summary tiles ("127 students", "logged today") move BELOW the fold as
// context — they answer "what is happening", which matters, but only after the
// screen has answered "what should I do".
//
// Every item here comes from lib/os/founder-inbox, where every number is a real
// query and every item carries the one action that clears it.

const SEV: Record<Severity, { ring: string; chip: string; Icon: typeof AlertOctagon; label: string }> = {
  critical: { ring: 'border-red-300', chip: 'bg-red-100 text-red-700', Icon: AlertOctagon, label: 'Critical' },
  high:     { ring: 'border-amber-300', chip: 'bg-amber-100 text-amber-800', Icon: AlertTriangle, label: 'High' },
  normal:   { ring: 'border-stone-200', chip: 'bg-stone-100 text-stone-600', Icon: Circle, label: 'Normal' },
};

function scoreTone(score: number): { text: string; bg: string; word: string } {
  if (score >= 90) return { text: 'text-emerald-700', bg: 'bg-emerald-50', word: 'Healthy' };
  if (score >= 70) return { text: 'text-teal-700', bg: 'bg-teal-50', word: 'Steady' };
  if (score >= 50) return { text: 'text-amber-700', bg: 'bg-amber-50', word: 'Needs work' };
  return { text: 'text-red-700', bg: 'bg-red-50', word: 'Under strain' };
}

export default async function CommandCenterPage() {
  const { admin } = await requireAdmin();
  const now = Date.now();

  // Sacred-student failures are computed FIRST and pinned ABOVE everything.
  // Co-founder rule: a paying student in a broken state is a P0 the system
  // surfaces before the founder has to look for it.
  const [rawAlerts, inbox, dismissedIds, cadenceBursts, uncorroborated, starvedBooks, promiseDebt] = await Promise.all([
    findSacredFailures(admin, now),
    assembleFounderInbox(admin, now),
    readDismissedIds(admin),
    // ── RECORD-INTEGRITY WATCHES (founder, 15 Sep 2026) ────────────────────
    //
    // Every sales number is self_reported. These two ask whether a record
    // could be true at all — one from the clock, one from the student's side.
    // Both return [] on any read failure: they exist to question a record,
    // never to manufacture a doubt out of our database having a bad moment.
    //
    // They are NOT productivity measures and must never be presented as one
    // (SALES-OS §0). Rendered BELOW the sacred alerts, because a paying
    // student in a broken state outranks a counsellor's paperwork every time.
    findCadenceBursts(admin, now).catch((e) => {
      console.error('[command-center] cadence watch failed:', e); return [];
    }),
    findUncorroboratedReps(admin, now).catch((e) => {
      console.error('[command-center] corroboration watch failed:', e); return [];
    }),
    // The third asks a different question: not whether a record is true, but
    // whether the students we never recorded anything about are reachable at
    // all. On 15 Sep, 609 of 1,138 students in the two books had never once
    // been dealt a card (lib/os/book-starvation).
    findStarvedBooks(admin, now).catch((e) => {
      console.error('[command-center] book starvation watch failed:', e); return [];
    }),
    // WHY the book is not moving, which is a different question from THAT it
    // is not moving. An overdue promise is redealt every morning and nothing
    // ages it out, so unkept promises become a standing charge against the
    // day — 24 of ~70 slots on 15 Sep (lib/os/promise-debt).
    findPromiseDebt(admin, now).catch((e) => {
      console.error('[command-center] promise debt watch failed:', e); return [];
    }),
  ]);
  const integrity = [...cadenceBursts, ...uncorroborated, ...starvedBooks, ...promiseDebt];
  // Alerts the founder has already closed ("already assigned", "completed").
  // Subtracted here rather than inside findSacredFailures so the detector stays
  // the single authority on what IS wrong, and dismissal stays what it is: the
  // founder's judgement laid over the top, never a change to the facts.
  const alerts = withoutDismissed(rawAlerts, dismissedIds);

  // Context counts + the revenue-opportunity numbers, after the decisions.
  const students = await getRealStudents(admin);
  const istDay = (offset: number) =>
    new Date(now - offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [logged, salesReady, wantsBuddy, activeYesterday, activeWeek] = await Promise.all([
    getLoggedToday(admin, students),
    getSalesReadyToCall(admin, students),
    getWantsBuddy(admin),
    // Distinct students who logged YESTERDAY — the "studied yesterday" number.
    fetchAll(() => admin.from('daily_reports').select('student_id').eq('report_date', istDay(1))),
    // Distinct students who logged in the last 7 days — active this week.
    fetchAll(() => admin.from('daily_reports').select('student_id').gte('report_date', istDay(7))),
  ]);
  const yesterdayCount = new Set((activeYesterday.data ?? []).map((r: { student_id: string }) => r.student_id)).size;
  const weekCount = new Set((activeWeek.data ?? []).map((r: { student_id: string }) => r.student_id)).size;

  const tone = scoreTone(inbox.score);
  const cleared = inbox.items.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-20">
      {/* SACRED ALERTS — pinned to the very top, above the score. A paying
          student the system could not fix itself is the one thing that should
          reach the founder before they go looking. */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className={`rounded-2xl border-2 p-3.5 ${a.severity === 'critical' ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
              <div className="flex items-start gap-2.5">
                <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold leading-snug text-stone-900">{a.title}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-stone-600">{a.rootCause}</p>
                  <p className="mt-1 text-[11px] text-stone-500">
                    {a.student.name}{a.student.phone ? ` · ${a.student.phone}` : ''}{a.amountRupees != null ? ` · ₹${a.amountRupees}` : ''}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6.5">
                <Link href={a.actionRoute} className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-bold text-white">
                  {a.actionLabel} <ArrowRight className="h-3 w-3" />
                </Link>
                {a.student.phone && (
                  <a href={`https://wa.me/${a.student.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-teal-700">
                    <Phone className="h-3 w-3" /> Call
                  </a>
                )}
                <DismissAlert alertId={a.id} studentId={a.student.id || null} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RECORD INTEGRITY — "can this record be true at all?" Never a
          performance panel: it carries no rate, no comparison between the two
          counsellors, and no target. One line saying what the clock or the
          student side shows, and where to look. */}
      {integrity.length > 0 && (
        <div className="mb-4 space-y-2">
          {integrity.map((x) => (
            <div key={x.id} className="rounded-2xl border border-stone-300 bg-white p-3.5">
              <div className="flex items-start gap-2.5">
                <SearchCheck className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
                    Record check · {x.entity.label}
                  </p>
                  <p className="mt-1 text-[13.5px] leading-snug text-stone-800">{x.reason}</p>
                </div>
              </div>
              <div className="mt-2.5 pl-6.5">
                <Link href={x.destination} className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-[12px] font-bold text-stone-800">
                  {x.suggestedAction.label} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FOUNDER WORKLOAD — the operational number. "100,000 students don't
          matter if only 23 things need me today." Lead with the work, keep the
          health score as a secondary glance. */}
      <div className={`mb-4 rounded-2xl border border-stone-200 ${tone.bg} p-4`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Your workload today</p>
            {cleared ? (
              <p className="mt-1 text-[22px] font-bold text-emerald-700">All clear</p>
            ) : (
              <p className="mt-1 text-[22px] font-bold text-stone-900">
                {inbox.workload.actions} action{inbox.workload.actions === 1 ? '' : 's'}
                <span className="ml-2 text-[13px] font-semibold text-stone-500">≈ {inbox.workload.estMinutes} min</span>
              </p>
            )}
          </div>
          <div className={`text-right ${tone.text}`}>
            <p className="text-[26px] font-bold leading-none">{inbox.score}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide">{tone.word}</p>
          </div>
        </div>
        {!cleared && (
          <div className="mt-2.5 flex gap-3 text-[12px] font-semibold">
            {inbox.workload.critical > 0 && <span className="text-red-600">🔴 {inbox.workload.critical} critical</span>}
            {inbox.workload.high > 0 && <span className="text-amber-600">🟠 {inbox.workload.high} high</span>}
            {inbox.workload.normal > 0 && <span className="text-stone-500">🟡 {inbox.workload.normal} normal</span>}
          </div>
        )}
      </div>

      {/* THE INBOX — open work, most severe first, each ending in an action. */}
      {cleared ? (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-2 text-[15px] font-bold text-emerald-800">All clear.</p>
          <p className="mt-1 text-[12px] text-emerald-700">Every mentor has a room, every paying student has a buddy, nothing is going cold. Go build.</p>
        </div>
      ) : (
        <div className="mb-5 space-y-2">
          {inbox.items.map((item) => {
            const s = SEV[item.severity];
            return (
              <Link
                key={item.id}
                href={item.route}
                className={`block rounded-2xl border ${s.ring} bg-white p-3.5 transition-colors hover:border-stone-400`}
              >
                <div className="flex items-start gap-2.5">
                  <s.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.severity === 'critical' ? 'text-red-600' : item.severity === 'high' ? 'text-amber-600' : 'text-stone-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-snug text-stone-900">{item.title}</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-stone-500">{item.why}</p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between pl-6.5">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.chip}`}>
                    {s.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-stone-700">
                    {item.action} <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* REVENUE OPPORTUNITY — the money on the table. Every tile links to the
          EXACT filtered list behind it, and a tile with zero work is not shown
          at all. Founder rule, 9 Aug: never a dead door, never fake work. */}
      {(() => {
        const paymentsToVerify = alerts.filter((a) => a.id.startsWith('unlock:')).length;
        const premiumNoMentor = alerts.filter((a) => a.id.startsWith('buddy:')).length;
        const tiles = [
          // buddy=wants already excludes premium, so this lists EXACTLY the
          // getWantsBuddy set the count comes from — no extra sub filter that
          // would drop wanting students still stuck in a payment state.
          // NOT a live signal, and the flame said otherwise. This is
          // `wants_mentor = true` — a box ticked at SIGNUP, for some of these
          // students months ago. Live commercial intent across the whole base
          // is 12 buddy taps and 1 intent-door crossing in the last fourteen
          // days, which is why the conversion lane has been empty since 11 Sep.
          // Named for what it measures (15 Sep 2026, same pass as the context
          // tiles); the drill-down behind it is unchanged and still matches.
          { emoji: '🙋', label: 'Said yes to a mentor at signup', value: wantsBuddy.length, href: '/admin/people?buddy=wants' },
          { emoji: '📞', label: 'Sales-ready to call', value: salesReady.length, href: '/admin/sales-queue' },
          // These are CAPTURED-but-not-unlocked payments (money paid, premium
          // never granted). Such a student derives as sub=free, NOT payment_failed
          // — so this must open Revenue Operations' captured-not-unlocked list,
          // the exact set behind the count, where the one-click retry lives.
          { emoji: '💳', label: 'Captured, not unlocked', value: paymentsToVerify, href: '/admin/revenue?state=captured_not_unlocked' },
          { emoji: '🤝', label: 'Premium without a mentor', value: premiumNoMentor, href: '/admin/people?sub=premium&buddy=none' },
        ].filter((t) => t.value > 0); // hide-when-zero: no fake work
        if (tiles.length === 0) return null;
        return (
          <>
            <div className="mb-2 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-600">Revenue opportunity</p>
            </div>
            <div className="mb-5 grid grid-cols-2 gap-2">
              {tiles.map((t) => (
                <RevenueTile key={t.label} emoji={t.emoji} label={t.label} value={t.value} href={t.href} hot />
              ))}
            </div>
          </>
        );
      })()}

      {/* CONTEXT — what is happening, below what to do. */}
      <div className="mb-2 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Today, for context</p>
      </div>
      {/* ── SAY WHAT IS MEASURED (15 Sep 2026) ──────────────────────────────
          These three read `daily_reports`, so every one of them counts a LOG,
          and a log row is written whether the student studied or recorded that
          they could not. On 14 Sep the tiles said "Studied yesterday 29" when
          11 students had actually studied, and "Active this week 67" when 166
          had opened the app — overstating study by 2.6x and understating
          activity by 2.5x, on the same screen.

          Relabelled rather than re-pointed: these counts and the People lists
          behind them come from the same filter, which is the rule this whole
          file exists for, and the People page derives activity from logging
          too. The honest split — students who STUDIED, the share of rows that
          recorded no study, and the count an arrival spike cannot explain —
          is in the founder digest (lib/os/study-truth). */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <ContextTile label="Students" value={students.length} href="/admin/people" />
        <ContextTile label="Logged today" value={`${logged.length}/${students.length}`} href="/admin/people?activity=today" />
        <ContextTile label="Logged yesterday" value={yesterdayCount} href="/admin/people?activity=yesterday" />
        <ContextTile label="Logged this week" value={weekCount} href="/admin/people?activity=this_week" />
      </div>
      <p className="mt-2 px-1 text-[11px] leading-relaxed text-stone-400">
        A log is a student answering, not a student studying — roughly half record no study time.
        The daily digest carries how many actually studied.
      </p>
    </div>
  );
}

function RevenueTile({ emoji, label, value, href, hot }: { emoji: string; label: string; value: number; href: string; hot: boolean }) {
  return (
    <Link href={href} className={`rounded-2xl border p-3.5 transition-colors ${hot ? 'border-orange-300 bg-orange-50 hover:border-orange-400' : 'border-stone-200 bg-white hover:border-stone-400'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[15px]" aria-hidden>{emoji}</span>
        <span className={`text-[22px] font-bold leading-none ${hot ? 'text-orange-700' : 'text-stone-900'}`}>{value}</span>
      </div>
      <p className="mt-1.5 text-[11.5px] font-semibold leading-snug text-stone-600">{label}</p>
    </Link>
  );
}

function ContextTile({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-stone-200 bg-white p-3.5 transition-colors hover:border-stone-400">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-1 text-[18px] font-bold leading-none text-stone-900">{value}</p>
    </Link>
  );
}
