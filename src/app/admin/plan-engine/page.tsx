import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty, AdminStat } from '@/components/admin/workspace-shell';
import { buildFullPlan } from '@/lib/full-plan';
import { checkPlanIntegrity } from '@/lib/plan-integrity';
import { studentEffortMultiplier } from '@/lib/study-pace';
import { SECTIONS, topicsInSection } from '@/lib/prep-model';
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

// STUDY PLAN ENGINE — the control room.
//
// Founder, 9 Aug: "this is where you verify the intelligence."
//
// It runs the SAME functions a student's phone runs — buildFullPlan and
// checkPlanIntegrity — across a spread of daily-hour commitments, so a
// regression in the planner is visible here before a student meets it. The
// alternative is what happened this morning: a 2h/day student was being handed
// sixteen days of 3.5h work, and it was found by writing a throwaway script.

const ALL_TOPICS = SECTIONS.flatMap((s) => topicsInSection(s));
const HOURS = [2, 3, 4, 6, 8, 10];

export default async function PlanEnginePage() {
  await requireAdmin();

  const today = new Date();
  const fresh = () => ALL_TOPICS.map((topic) => ({ topic, status: 'not_started' }));

  const runs = HOURS.map((h) => {
    const plan = buildFullPlan({
      coverage: fresh(),
      effort: studentEffortMultiplier({ isRepeater: false, lastYearPercentile: null }),
      weekdayHours: h,
      today,
      attemptYear: today.getFullYear(),
    });
    const report = checkPlanIntegrity({ plan, committedHours: h });
    const scheduled = new Set(
      plan.days.flatMap((d) => d.items.filter((i) => i.kind === 'topic').map((i) => i.label)),
    );
    const over = plan.days.filter((d) => d.totalHours > h + 0.01);
    return { hours: h, plan, report, topics: scheduled.size, over: over.length };
  });

  // The engine verdict excludes `depth`, on purpose. Depth failing at 2h/day is
  // not a bug — it is the true statement that a 2h student cannot finish 397
  // hours before CAT, and the door is supposed to say so. Everything else IS an
  // engine fault: a dropped topic, a missing mock, a day that overruns.
  const anyFail = runs.some((r) => r.report.checks.some((c) => c.status === 'fail' && c.id !== 'depth'));
  const anyOver = runs.some((r) => r.over > 0);
  // Coverage no longer varies with hours (every student opens all 46 since the
  // 11 Aug unification), so the signature is what genuinely differs: how much
  // of their own syllabus those hours actually place.
  const placedFor = (r: (typeof runs)[number]) =>
    r.plan.days.flatMap((d) => d.items.filter((i) => i.kind === 'topic')).reduce((s, i) => s + i.hours, 0);
  const signatures = new Set(runs.map((r) => `${r.topics}|${r.plan.feasibility.fits}|${placedFor(r)}`)).size;
  const allCovered = runs.every((r) => r.topics === ALL_TOPICS.length);

  return (
    <WorkspaceShell
      workspaceId="plan"
      activeHref="/admin/plan-engine"
      title="Plan integrity"
      subtitle="A fresh 46-topic student, run at every commitment, through the live engine"
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
        <AdminStat label="Engine" value={anyFail ? 'FAIL' : 'PASS'} tone={anyFail ? 'bad' : 'good'} />
        <AdminStat
          label="Hours respected"
          value={anyOver ? 'NO' : 'YES'}
          tone={anyOver ? 'bad' : 'good'}
          hint="No day exceeds what the student agreed to"
        />
        <AdminStat
          label="46/46 covered"
          value={allCovered ? 'YES' : 'NO'}
          tone={allCovered ? 'good' : 'bad'}
          hint="Every student opens every topic, at every commitment"
        />
        <AdminStat
          label="Distinct plans"
          value={`${signatures}/${HOURS.length}`}
          tone={signatures >= HOURS.length - 1 ? 'good' : 'warn'}
          hint="Two students must never get the same plan"
        />
      </div>

      {runs.length === 0 ? (
        <AdminEmpty>Engine produced nothing.</AdminEmpty>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <div key={r.hours} className="rounded-2xl border border-stone-200 bg-white p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-bold text-stone-900">{r.hours}h a day</p>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    {r.topics}/{ALL_TOPICS.length} topics · {r.plan.mockCount} mocks · {r.plan.days.length} days
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    r.plan.feasibility.fits ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {r.plan.feasibility.fits ? 'syllabus fits' : 'does not fit'}
                </span>
              </div>

              {r.over > 0 && (
                <p className="mt-2 flex items-center gap-1 text-[11.5px] font-semibold text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {r.over} day{r.over === 1 ? '' : 's'} demand more than {r.hours}h
                </p>
              )}

              <div className="mt-2.5 space-y-1">
                {r.report.checks.map((c) => {
                  const Icon = c.status === 'pass' ? CheckCircle2 : c.status === 'fail' ? XCircle : MinusCircle;
                  const tone = c.status === 'pass' ? 'text-emerald-600'
                    : c.status === 'fail' ? 'text-red-600' : 'text-stone-300';
                  return (
                    <div key={c.id} className="flex items-start gap-1.5">
                      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
                      <p className="text-[11.5px] leading-snug text-stone-600">
                        <b className="text-stone-800">{c.label}</b> — {c.detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </WorkspaceShell>
  );
}
