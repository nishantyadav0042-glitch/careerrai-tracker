'use client';
import { useState } from 'react';

// "Run today's intake now." The same engine the scheduler runs at 2:30 PM
// IST, with the founder recorded as the actor. Pressing it twice is safe: the
// daily fuse and ON CONFLICT DO NOTHING make the second run a no-op that
// says so. The result is shown verbatim — the founder sees exactly what the
// database did, never a reassuring "done".

type Run = {
  ok: boolean; state: string; poolSize: number; waiting: number; arrivals: number;
  enrolled: { name: string; requested: number; landed: number; boundBy: string; allowance: number }[];
  error?: string;
};

const STATE_COPY: Record<string, string> = {
  ALLOCATED: 'Enrolled.',
  POOL_EMPTY: 'Nobody is waiting — every eligible student is already in a book.',
  ALL_SEATS_FUSED: 'Every seat has used its new-per-day cap for today. Raise a cap to take more.',
  NO_ELIGIBLE_SEAT: 'No active sales seat — nobody can receive students.',
  ENGINE_DISABLED: 'The intake is switched off (SALES_INTAKE_ENABLED).',
  SOURCE_UNAVAILABLE: 'Could not read the roster — nothing was changed.',
  PARTIAL: 'Partially enrolled — run again to finish.',
};

export function IntakeNowButton() {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null); setRun(null);
    try {
      const res = await fetch('/api/admin/lead-intake', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as Run | { error?: string } | null;
      if (!body) { setErr('No answer from the server.'); return; }
      if ('state' in body) setRun(body as Run);
      else setErr((body as { error?: string }).error ?? `Failed (${res.status}).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error.');
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-2">
      <button onClick={() => void go()} disabled={busy}
        className="rounded-xl bg-stone-900 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50">
        {busy ? 'Running intake…' : "Run today's intake now"}
      </button>
      {err && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-800">{err}</p>}
      {run && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-[12px] ${run.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
          <p className="font-bold">{STATE_COPY[run.state] ?? run.state}</p>
          {run.enrolled.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {run.enrolled.map((e) => (
                <li key={e.name}>
                  {e.name}: <span className="font-semibold tabular-nums">{e.landed}</span> enrolled
                  {e.landed !== e.requested && <> ({e.requested} planned — the rest were already owned)</>}
                  {' · '}could take {e.allowance} today ({e.boundBy.replace(/_/g, ' ')})
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] opacity-80">
            {run.poolSize} eligible students were waiting · {run.waiting} still waiting · {run.arrivals} new arrivals had their SLA clock started
          </p>
          {run.error && <p className="mt-1 text-[11px]">{run.error}</p>}
        </div>
      )}
    </div>
  );
}
