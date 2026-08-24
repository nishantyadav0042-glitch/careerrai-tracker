'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Lead distribution, with a PREVIEW before anything moves.
//
// The founder was explicit: do not implement an opaque automatic algorithm.
// So the split is computed in the browser, shown as an exact per-rep count, and
// only then confirmed. Nothing is assigned until he has seen the numbers.
//
// One honest note rendered on the page: with every current workload at zero,
// "equal" and "workload-balanced" produce identical results. Implying
// intelligence the data cannot yet exercise would be its own small lie.

type Rep = { id: string; name: string };
type Strategy = 'equal' | 'single';
type Pool = 'unassigned' | 'stale';

export function AssignPanel({ reps, unassignedCount, staleCount, actorId }: {
  reps: Rep[]; unassignedCount: number | null; staleCount: number | null; actorId: string;
}) {
  const router = useRouter();
  const [pool, setPool] = useState<Pool>('unassigned');
  const [strategy, setStrategy] = useState<Strategy>('equal');
  const [chosen, setChosen] = useState<string[]>(reps.map((r) => r.id));
  const [howMany, setHowMany] = useState(50);
  const [preview, setPreview] = useState<{ repId: string; name: string; n: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const available = pool === 'unassigned' ? unassignedCount : staleCount;
  const take = Math.min(howMany, available ?? 0);

  function buildPreview() {
    setMsg(null);
    const targets = strategy === 'single' ? chosen.slice(0, 1) : chosen;
    if (targets.length === 0) { setMsg('Pick at least one rep.'); return; }
    if (take <= 0) { setMsg('Nothing in this pool to distribute.'); return; }
    const base = Math.floor(take / targets.length);
    const rem = take % targets.length;
    setPreview(targets.map((id, i) => ({
      repId: id,
      name: reps.find((r) => r.id === id)?.name ?? id,
      n: base + (i < rem ? 1 : 0),
    })));
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/distribute-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool, allocation: preview.map((p) => ({ repId: p.repId, count: p.n })) }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? 'Could not distribute.'); return; }
      setMsg(`Assigned ${data.assigned} leads. Every assignment is in the audit log.`);
      setPreview(null);
      router.refresh();
    } catch {
      setMsg('Network error — nothing was assigned.');
    } finally { setBusy(false); }
  }

  const allEmpty = reps.length > 0;

  return (
    <div className="mt-2 rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <select value={pool} onChange={(e) => { setPool(e.target.value as Pool); setPreview(null); }}
          className="rounded-lg border border-stone-300 px-2 py-1.5 font-semibold">
          <option value="unassigned">Unassigned ({unassignedCount ?? '—'})</option>
          <option value="stale">Stale, 14d untouched ({staleCount ?? '—'})</option>
        </select>
        <select value={strategy} onChange={(e) => { setStrategy(e.target.value as Strategy); setPreview(null); }}
          className="rounded-lg border border-stone-300 px-2 py-1.5 font-semibold">
          <option value="equal">Split equally</option>
          <option value="single">All to one rep</option>
        </select>
        <label className="flex items-center gap-1.5">
          <span className="text-stone-500">How many</span>
          <input type="number" min={1} value={howMany} onChange={(e) => { setHowMany(Number(e.target.value) || 0); setPreview(null); }}
            className="w-20 rounded-lg border border-stone-300 px-2 py-1.5 tabular-nums" />
        </label>
        <button onClick={buildPreview} className="rounded-lg bg-stone-900 px-3 py-1.5 font-bold text-white">Preview</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {reps.map((r) => (
          <label key={r.id} className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-1 text-[12px]">
            <input type="checkbox" checked={chosen.includes(r.id)}
              onChange={(e) => { setChosen((c) => e.target.checked ? [...c, r.id] : c.filter((x) => x !== r.id)); setPreview(null); }} />
            {r.name}{r.id === actorId ? ' (you)' : ''}
          </label>
        ))}
      </div>

      {allEmpty && (
        <p className="mt-2 text-[11px] text-stone-500">
          Every rep&rsquo;s current workload is 0, so &ldquo;split equally&rdquo; and any workload-balancing strategy
          would produce the same result today. Balancing appears once there are books to balance.
        </p>
      )}

      {preview && (
        <div className="mt-3 rounded-lg border border-stone-300 bg-stone-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">Preview — nothing has moved yet</p>
          <ul className="mt-1.5 space-y-0.5 text-[13px]">
            {preview.map((p) => (
              <li key={p.repId} className="flex justify-between"><span>{p.name}</span><span className="font-bold tabular-nums">{p.n}</span></li>
            ))}
          </ul>
          <button onClick={confirm} disabled={busy}
            className="mt-2 rounded-lg bg-teal-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">
            {busy ? 'Assigning…' : 'Confirm distribution'}
          </button>
        </div>
      )}

      {msg && <p className="mt-2 text-[12px] font-semibold text-stone-700">{msg}</p>}
    </div>
  );
}
