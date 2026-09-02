import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell } from '@/components/admin/workspace-shell';
import { getTeamCapacity } from '@/lib/sales-capacity';
import { CapacityPanel } from './capacity-panel';
import { NewRepForm } from './new-rep-form';
import { IntakeNowButton } from './intake-now-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales capacity · CareerRai' };

// Phase 2B-1 — capacity VISIBILITY, and since 2 Sep 2026 the one place the
// founder can run the daily intake by hand (Phase 2B-3, lib/lead-intake.ts).
// Nothing on this screen moves LIVE WORK: the intake enrols students into a
// book; the queue still decides today's opportunities against capacity.

export default async function SalesCapacityPage() {
  const { admin } = await requireAdmin();
  const reps = await getTeamCapacity(admin);

  const configured = reps.filter((r) => r.configured);
  const totalAvailable = configured.reduce((s, r) => s + r.available, 0);
  const anyOverflow = configured.some((r) => r.overflow > 0);

  return (
    <WorkspaceShell workspaceId="sales" activeHref="/admin/sales/capacity"
      title="Capacity" subtitle="How much live work each rep is holding, and how much more they could take.">

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        {configured.length === 0 ? (
          <>
            <p className="text-sm font-bold text-stone-900">No rep is configured yet.</p>
            <p className="mt-1 text-[12px] text-stone-600">
              Capacity cannot be stated for an account with no configuration. That is missing setup, not zero
              capacity — and the difference is the whole point of this screen.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-stone-900">
              The team could take <span className="tabular-nums">{totalAvailable}</span> more lead{totalAvailable === 1 ? '' : 's'} right now.
            </p>
            <p className="mt-1 text-[12px] text-stone-600">
              Capacity counts <strong>active work</strong>, not owned students. A student who is healthy and studying
              stays with their rep but consumes nothing — so a rep who retains well keeps receiving new leads instead
              of being locked out by their own success.
            </p>
            {anyOverflow && (
              <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-800">
                One or more reps are over capacity. Existing relationships are never transferred automatically —
                expand the rep below to see exactly which students, and why.
              </p>
            )}
          </>
        )}
        <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-[11.5px] text-stone-600">
          <strong>Daily intake, 2:30 PM IST.</strong> Every new free student with a phone enters a book that day,
          newest first, split across the active seats and never more than a seat&apos;s new-per-day cap. That is
          responsibility, not work: the calling list still picks today&apos;s opportunities within capacity.
        </p>
        <IntakeNowButton />
      </div>

      <NewRepForm />

      <div className="mt-3">
        <CapacityPanel reps={reps} />
      </div>
    </WorkspaceShell>
  );
}
