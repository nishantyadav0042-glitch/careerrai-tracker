'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RepCapacity, WorkItem } from '@/lib/sales-capacity';
import { BINDING_LABEL } from '@/lib/sales-capacity';
import { EMPLOYMENT_LABEL } from '@/lib/sales-rep-provisioning';

// Founder capacity view. Founder, 24 Aug: "Do not make the capacity dashboard
// merely a number. If it says 37 active, I should be able to see the exact 37
// students." So every count here is rendered as `list.length` and the same
// list is what expands — a number and its drill-down cannot diverge, because
// they are the same array.

const REASON_LABEL: Record<WorkItem['reason'], string> = {
  never_contacted: 'Never contacted',
  action_due: 'Callback / retry due',
  followup_overdue: 'Follow-up overdue',
  retention_lane: 'Needs retention call',
};
const REASON_CLS: Record<WorkItem['reason'], string> = {
  never_contacted: 'bg-teal-50 text-teal-700',
  action_due: 'bg-sky-50 text-sky-700',
  followup_overdue: 'bg-amber-50 text-amber-800',
  retention_lane: 'bg-rose-50 text-rose-700',
};

// Working days, written out. "Mon–Sat" and "Tue, Thu" are the difference
// between full-time and part-time made legible; an array of integers is not.
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function DAY_LABEL(days: number[]): string {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 0) return '—';
  const contiguous = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  return contiguous && d.length > 2 ? `${DAY_NAMES[d[0]]}–${DAY_NAMES[d[d.length - 1]]}` : d.map((x) => DAY_NAMES[x]).join(', ');
}

function Num({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className={`text-2xl font-extrabold tabular-nums ${tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-600' : 'text-stone-900'}`}>{value}</div>
      <div className="text-[11px] font-semibold text-stone-600">{label}</div>
      {sub && <div className="text-[10px] text-stone-400">{sub}</div>}
    </div>
  );
}

export function CapacityPanel({ reps }: { reps: RepCapacity[] }) {
  const [openRep, setOpenRep] = useState<string | null>(null);
  const [filter, setFilter] = useState<WorkItem['reason'] | null>(null);

  if (reps.length === 0) {
    return <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">No sales or admin accounts exist yet.</div>;
  }

  return (
    <div className="space-y-3">
      {reps.map((r) => {
        const open = openRep === r.repId;
        const shown = filter && open ? r.workItems.filter((w) => w.reason === filter) : r.workItems;
        return (
          <div key={r.repId} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className="border-b border-stone-100 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-[15px] font-bold text-stone-900">{r.name}</p>
                  {/* Employment terms belong next to the ceiling they explain.
                      A part-time rep showing 12 units is correctly configured;
                      the same 12 on a full-time rep is a question. */}
                  {r.config && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.config.employmentType === 'part_time' ? 'bg-indigo-50 text-indigo-700' : 'bg-stone-100 text-stone-600'}`}>
                      {EMPLOYMENT_LABEL[r.config.employmentType]}
                    </span>
                  )}
                </div>
                {/* NOT CONFIGURED must never render as "0 capacity" — the
                    founder must not read missing setup as a full rep. */}
                {r.configured ? (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.overflow > 0 ? 'bg-rose-600 text-white' : r.binding === 'ASSIGNABLE' ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-700'}`}>
                    {BINDING_LABEL[r.binding]}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">NOT CONFIGURED</span>
                )}
              </div>

              {r.readFailed ? (
                <p className="mt-1.5 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-800">
                  Could not read this rep&apos;s leads. Every number here is <strong>UNAVAILABLE</strong>, not zero —
                  &ldquo;nothing to do&rdquo; and &ldquo;we could not look&rdquo; must never look the same. Retry, and if it
                  persists check the data-quality panel.
                </p>
              ) : !r.configured ? (
                <p className="mt-1.5 text-[12px] text-stone-500">
                  No capacity row for this account, so no capacity can be stated. This is missing setup, not zero capacity.
                </p>
              ) : (
                <>
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    <Num label="Capacity" value={r.capacity ?? '—'} />
                    <Num label="Active work" value={r.activeNow} sub="click to see who" />
                    <Num label="Available" value={r.available} tone={r.available > 0 ? 'good' : undefined} />
                    {/* Real since 2 Sep 2026: every door into a book stamps
                        enrolled_at. null = the read failed, shown as "—". */}
                    <Num label="New today" value={r.newToday ?? '—'} sub={`cap ${r.config?.maxNewPerDay ?? '—'} per day`}
                      tone={r.newToday != null && r.config && r.newToday >= r.config.maxNewPerDay ? 'warn' : undefined} />
                    <Num label="Overflow" value={r.overflow} tone={r.overflow > 0 ? 'bad' : undefined} />
                    <Num label="Dormant" value={r.dormantCount} sub="owned, no work" />
                  </div>
                  <p className="mt-2 text-[11px] text-stone-500">
                    Binding constraint: <span className="font-bold text-stone-700">{BINDING_LABEL[r.binding]}</span>
                    {r.config && <> · {DAY_LABEL(r.config.workDays)} {r.config.workStartIst}–{r.config.workEndIst} IST · SLA {r.config.firstContactSlaMinutes} working min</>}
                    {!r.inWindow && r.config?.active && <> · <span className="font-semibold text-stone-600">outside working hours right now</span></>}
                  </p>
                  {r.overflow > 0 && (
                    <p className="mt-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[11.5px] font-semibold text-rose-800">
                      {r.overflow} unit{r.overflow === 1 ? '' : 's'} over capacity. Existing relationships stay with {r.name.split(' ')[0]} — nothing was transferred, and no new leads will be added while this is true.
                    </p>
                  )}
                </>
              )}
            </div>

            {r.configured && (
              <>
                <button
                  type="button"
                  onClick={() => { setOpenRep(open ? null : r.repId); setFilter(null); }}
                  className="flex w-full items-center justify-center gap-1.5 bg-stone-50 py-2 text-[12px] font-bold text-stone-700 hover:bg-stone-100"
                >
                  {open ? 'Hide' : `Show the ${r.workItems.length} student${r.workItems.length === 1 ? '' : 's'} behind this`}
                  <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="px-4 py-3">
                    {r.workItems.length === 0 ? (
                      <p className="text-[12.5px] text-stone-500">No active work. {r.dormantCount > 0 ? `${r.dormantCount} owned student${r.dormantCount === 1 ? '' : 's'} are healthy right now and consume no capacity.` : 'No students owned yet.'}</p>
                    ) : (
                      <>
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {(['never_contacted', 'action_due', 'followup_overdue', 'retention_lane'] as const).map((k) => {
                            const n = r.workItems.filter((w) => w.reason === k).length;
                            if (n === 0) return null;
                            return (
                              <button key={k} type="button" onClick={() => setFilter(filter === k ? null : k)}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${filter === k ? 'bg-stone-900 text-white' : REASON_CLS[k]}`}>
                                {REASON_LABEL[k]} · {n}
                              </button>
                            );
                          })}
                        </div>
                        <div className="space-y-1">
                          {shown.map((w) => (
                            <a key={w.studentId} href={`/admin/leads/${w.studentId}`}
                              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                              <span className="truncate text-[13px] font-semibold text-stone-800">{w.name}</span>
                              <span className="shrink-0 text-[11px] text-stone-500">{w.detail}</span>
                            </a>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
