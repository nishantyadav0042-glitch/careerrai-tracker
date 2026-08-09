import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty, AdminStat } from '@/components/admin/workspace-shell';

export const dynamic = 'force-dynamic';

// AI CENTER — every Gemini call, and who pulls the trigger.
//
// Founder, 9 Aug: "instead of AI everywhere, one dedicated section."
//
// The number that matters here is not how many callers exist, it is WHO fires
// them. A call fired by a human tap costs what it is worth; a call fired by a
// page load or a cron costs the whole roster whether or not anyone reads the
// output. Three such paths were removed on 9 Aug — a card that fired Gemini
// from a useEffect on mount, a briefing regenerated on every mock log, and a
// cron that rewrote a summary each morning for every student who had logged.
//
// COST IS DELIBERATELY ABSENT. Gemini returns token counts and we have never
// stored them, so there is no honest cost number to show. The tab is marked
// `planned` in lib/admin-workspaces with exactly that reason rather than being
// filled with an estimate — an invented rupee figure is worse than a gap,
// because a gap gets fixed and an estimate gets budgeted against.

/** The AI event types recorded by recordAiCall / the OCR routes. */
const AI_EVENTS: Record<string, { label: string; trigger: string }> = {
  chat_draft:      { label: 'Chat reply facts',     trigger: 'Mentor taps "Get reply facts"' },
  feedback_draft:  { label: 'Feedback facts',       trigger: 'Mentor taps "AI facts"' },
  buddy_briefing:  { label: 'Student briefing',     trigger: 'Mentor taps Refresh' },
  scorecard_parse: { label: 'Scorecard OCR',        trigger: 'Student uploads a scorecard' },
  weekly_signal:   { label: 'Weekly signal',        trigger: 'Mentor taps "Read this week"' },
};

export default async function AiCenterPage() {
  const { admin } = await requireAdmin();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: rows } = await admin
    .from('analytics_events')
    .select('event_type, created_at, student_id')
    .in('event_type', Object.keys(AI_EVENTS))
    .gte('created_at', since)
    .limit(5000);

  const all = rows ?? [];
  const dayAgo = Date.now() - 86_400_000;
  const weekAgo = Date.now() - 7 * 86_400_000;

  const byType = new Map<string, { total: number; week: number; day: number; people: Set<string> }>();
  for (const r of all) {
    const k = r.event_type as string;
    const cur = byType.get(k) ?? { total: 0, week: 0, day: 0, people: new Set<string>() };
    cur.total++;
    const t = Date.parse(r.created_at as string);
    if (t >= weekAgo) cur.week++;
    if (t >= dayAgo) cur.day++;
    if (r.student_id) cur.people.add(r.student_id as string);
    byType.set(k, cur);
  }

  const last7 = all.filter((r) => Date.parse(r.created_at as string) >= weekAgo).length;
  const last1 = all.filter((r) => Date.parse(r.created_at as string) >= dayAgo).length;

  const ordered = Object.keys(AI_EVENTS)
    .map((k) => ({ key: k, ...AI_EVENTS[k], ...(byType.get(k) ?? { total: 0, week: 0, day: 0, people: new Set<string>() }) }))
    .sort((a, b) => b.total - a.total);

  return (
    <WorkspaceShell
      workspaceId="ai"
      activeHref="/admin/ai"
      title="AI usage"
      subtitle="Every recorded Gemini call in the last 30 days"
    >
      <div className="mb-4 grid grid-cols-3 gap-2">
        <AdminStat label="Last 24h" value={last1} />
        <AdminStat label="Last 7 days" value={last7} />
        <AdminStat label="Last 30 days" value={all.length} />
      </div>

      <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
        <p className="text-[12px] font-bold text-stone-800">Every call below is fired by a human tap.</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-stone-600">
          Three paths used to fire on their own — a card that called Gemini when a page loaded,
          a briefing rewritten on every mock log, and a cron that regenerated summaries each
          morning for every student who had logged. All three were removed on 9 Aug, and a guard
          test fails the build if an AI call reappears inside a cron.
        </p>
      </div>

      {all.length === 0 ? (
        <AdminEmpty>No AI calls recorded in the last 30 days.</AdminEmpty>
      ) : (
        <div className="space-y-2">
          {ordered.map((r) => (
            <div key={r.key} className="rounded-2xl border border-stone-200 bg-white p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-stone-900">{r.label}</p>
                  <p className="mt-0.5 text-[11px] text-stone-500">{r.trigger}</p>
                </div>
                <p className="shrink-0 text-[20px] font-bold leading-none text-stone-900">{r.total}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 text-[11.5px] text-stone-600">
                <span><b className="text-stone-900">{r.day}</b> today</span>
                <span><b className="text-stone-900">{r.week}</b> this week</span>
                <span><b className="text-stone-900">{r.people.size}</b> distinct people</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white p-3.5">
        <p className="text-[12px] font-bold text-stone-700">Why there is no cost figure here</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-stone-500">
          Gemini returns token counts on every response and we have never stored them, so any
          rupee number on this page would be an estimate wearing the clothes of a measurement.
          Recording <code className="text-[10.5px]">usageMetadata</code> in <code className="text-[10.5px]">lib/gemini.ts</code> is
          the one change that makes cost real — until then this stays blank on purpose.
        </p>
      </div>
    </WorkspaceShell>
  );
}
