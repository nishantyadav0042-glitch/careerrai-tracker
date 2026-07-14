import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { STUDENT_BUDGET_TYPES } from '@/lib/notification-os';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Notification Health · CareerRai' };

// The honest funnel: Sent → Pushed → Clicked → Acted. "Acted" is the only
// KPI that matters — did the expected action happen after the send.
// Deliberately NO "delivered" or "opened" stage: web push has no delivery
// receipt or impression event, and a fabricated funnel stage would poison
// every decision made from this page.
//
// Acted definitions per expected_action:
//   log_today      → a daily report dated on the send day or the 2 days after
//   finish_builder → onboarding is complete now (the nudge only ever went to
//                    incomplete students, so completion = it worked)
//   open_plan      → the push was clicked (the only observable signal for
//                    "went and looked")

const TYPE_LABEL: Record<string, string> = {
  onboarding_morning: 'Arc · morning',
  onboarding_evening: 'Arc · evening',
  activation: 'Activation ladder',
  builder_recovery: 'Builder recovery',
  revision_due: 'Revision due',
  topic_earned: 'Topic earned',
  mission_changed: 'Plan changed',
  weekly_evolved: 'Weekly evolution',
  inactive_recovery: 'Recovery ladder',
  companion_kickoff: 'Companion · 08:00 kickoff',
  companion_morning: 'Companion · 09:30 plan',
  companion_spark: 'Companion · 11:00 strategy',
  companion_fact: 'Companion · 13:00 tip',
  companion_open: 'Companion · 17:00 window',
  companion_wind: 'Companion · 18:30 evening',
  companion_progress: 'Companion · 20:30 progress',
  companion_log: 'Companion · 21:30 log',
  companion_close: 'Companion · 22:00 close',
};

interface NotifRow {
  id: string;
  user_id: string;
  type: string;
  reason: string | null;
  expected_action: string | null;
  created_at: string;
  pushed_at: string | null;
  emailed_at: string | null;
  clicked_at: string | null;
}

function istDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function addDays(dateStr: string, days: number): string {
  return new Date(Date.parse(dateStr) + days * 86_400_000).toISOString().slice(0, 10);
}

export default async function NotificationHealthPage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const nowMs = Date.now();
  const fourteenDaysAgoIso = new Date(nowMs - 14 * 86_400_000).toISOString();
  const reportsWindowStart = new Date(nowMs - 16 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const [{ data: notifs }, { data: reports }, { data: students }] = await Promise.all([
    admin.from('notifications')
      .select('id, user_id, type, reason, expected_action, created_at, pushed_at, emailed_at, clicked_at')
      .in('type', STUDENT_BUDGET_TYPES)
      .gte('created_at', fourteenDaysAgoIso)
      .order('created_at', { ascending: false })
      .limit(2000),
    admin.from('daily_reports').select('student_id, report_date').gte('report_date', reportsWindowStart),
    admin.from('profiles')
      .select('id, full_name, notif_prefs, push_subscription, push_died_at, onboarding_completed')
      .eq('role', 'student'),
  ]);

  const rows = (notifs ?? []) as NotifRow[];
  const reportDatesByStudent = new Map<string, Set<string>>();
  for (const r of reports ?? []) {
    if (!reportDatesByStudent.has(r.student_id)) reportDatesByStudent.set(r.student_id, new Set());
    reportDatesByStudent.get(r.student_id)!.add(r.report_date);
  }
  const profileById = new Map((students ?? []).map((s) => [s.id, s]));

  function acted(n: NotifRow): boolean {
    if (n.expected_action === 'finish_builder') {
      return profileById.get(n.user_id)?.onboarding_completed === true;
    }
    if (n.expected_action === 'open_plan') {
      return n.clicked_at != null;
    }
    // log_today (and legacy rows with no expected_action): a report dated
    // send-day..+2. Arc/decision sends only go to not-yet-logged students,
    // so a same-day report always postdates the send.
    const dates = reportDatesByStudent.get(n.user_id);
    if (!dates) return false;
    const sendDate = istDate(n.created_at);
    const limit = addDays(sendDate, 2);
    for (const d of dates) if (d >= sendDate && d <= limit) return true;
    return false;
  }

  // Funnel
  const sent = rows.length;
  const pushed = rows.filter((r) => r.pushed_at != null).length;
  const clicked = rows.filter((r) => r.clicked_at != null).length;
  const actedCount = rows.filter(acted).length;
  const pct = (n: number) => (sent > 0 ? `${Math.round((n / sent) * 100)}%` : '—');

  // By type
  const byType = new Map<string, { sent: number; pushed: number; clicked: number; acted: number }>();
  for (const r of rows) {
    const cur = byType.get(r.type) ?? { sent: 0, pushed: 0, clicked: 0, acted: 0 };
    cur.sent++;
    if (r.pushed_at) cur.pushed++;
    if (r.clicked_at) cur.clicked++;
    if (acted(r)) cur.acted++;
    byType.set(r.type, cur);
  }
  const typeRows = [...byType.entries()].sort((a, b) => b[1].sent - a[1].sent);

  // By day (last 7)
  const byDay = new Map<string, { sent: number; acted: number }>();
  for (const r of rows) {
    const d = istDate(r.created_at);
    const cur = byDay.get(d) ?? { sent: 0, acted: 0 };
    cur.sent++;
    if (acted(r)) cur.acted++;
    byDay.set(d, cur);
  }
  const dayRows = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 7);

  // Push channel health
  const allStudents = students ?? [];
  const pushGranted = allStudents.filter((s) => {
    const p = (s.notif_prefs ?? {}) as Record<string, unknown>;
    return p.push === true && s.push_subscription != null;
  }).length;
  const pushDead = allStudents.filter((s) => s.push_died_at != null).length;

  const recent = rows.slice(0, 15);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Notification Health</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Last 14 days. Acted is the only KPI — did the expected behaviour happen after the send.
          </p>
        </div>

        {/* Funnel */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Sent', value: sent, sub: 'in-app rows' },
            { label: 'Pushed', value: pushed, sub: pct(pushed) },
            { label: 'Clicked', value: clicked, sub: pct(clicked) },
            { label: 'Acted', value: actedCount, sub: pct(actedCount) },
          ].map((t) => (
            <div key={t.label} className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="text-xl font-bold text-stone-900">{t.value}</p>
              <p className="text-[11px] font-semibold text-stone-500">{t.label}</p>
              <p className="text-[10px] text-stone-400">{t.sub}</p>
            </div>
          ))}
        </div>

        {/* Push channel */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xl font-bold text-teal-700">{pushGranted}</p>
            <p className="text-[11px] font-semibold text-stone-500">Push reachable</p>
            <p className="text-[10px] text-stone-400">granted + live subscription</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xl font-bold text-rose-700">{pushDead}</p>
            <p className="text-[11px] font-semibold text-stone-500">Push dead</p>
            <p className="text-[10px] text-stone-400">endpoint 410 — likely uninstalled</p>
          </div>
        </div>

        {/* By type */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 mb-4">
          <h2 className="text-sm font-bold text-stone-900 mb-3">Which message changes behaviour</h2>
          {typeRows.length === 0 ? (
            <p className="text-sm text-stone-500">No sends in the last 14 days — measurement starts with the next cron run.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr className="text-left text-stone-400">
                    <th className="py-1.5 pr-2 font-semibold">Type</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">Sent</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">Pushed</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">Clicked</th>
                    <th className="py-1.5 font-semibold text-right">Acted</th>
                  </tr>
                </thead>
                <tbody>
                  {typeRows.map(([type, t]) => (
                    <tr key={type} className="border-t border-stone-100">
                      <td className="py-1.5 pr-2 font-semibold text-stone-700">{TYPE_LABEL[type] ?? type}</td>
                      <td className="py-1.5 pr-2 text-right text-stone-600">{t.sent}</td>
                      <td className="py-1.5 pr-2 text-right text-stone-600">{t.pushed}</td>
                      <td className="py-1.5 pr-2 text-right text-stone-600">{t.clicked}</td>
                      <td className={cn('py-1.5 text-right font-bold', t.acted > 0 ? 'text-teal-700' : 'text-stone-400')}>
                        {t.acted} <span className="font-normal text-stone-400">({t.sent > 0 ? Math.round((t.acted / t.sent) * 100) : 0}%)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* By day */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 mb-4">
          <h2 className="text-sm font-bold text-stone-900 mb-3">Last 7 days</h2>
          {dayRows.length === 0 ? (
            <p className="text-sm text-stone-500">No sends yet.</p>
          ) : (
            <div className="space-y-1.5">
              {dayRows.map(([day, d]) => (
                <div key={day} className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">{day}</span>
                  <span className="text-stone-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {d.sent} sent · <span className={d.acted > 0 ? 'font-bold text-teal-700' : 'text-stone-400'}>{d.acted} acted</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent sends with reasons */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900 mb-1">Recent sends</h2>
          <p className="text-[11px] text-stone-400 mb-3">Every send carries its reason — “why did this student get this?” is answered here, not in cron code.</p>
          {recent.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing sent yet.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((n) => (
                <div key={n.id} className="border-t border-stone-100 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-stone-700 truncate">
                      {(profileById.get(n.user_id)?.full_name as string | null) ?? 'Student'}
                      <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">{TYPE_LABEL[n.type] ?? n.type}</span>
                    </p>
                    <div className="flex shrink-0 gap-1">
                      {n.pushed_at && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">pushed</span>}
                      {n.clicked_at && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">clicked</span>}
                      {acted(n) && <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-700">acted</span>}
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {n.reason ?? 'sent before measurement existed'}
                    <span className="text-stone-300"> · {new Date(n.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
