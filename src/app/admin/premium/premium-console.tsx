'use client';

import { useMemo, useState } from 'react';

interface StudentRow {
  id: string; name: string; phone: string | null;
  isPremium: boolean; plan: string | null; premiumSince: string | null; renewsAt: string | null;
  buddyId: string | null; buddyName: string | null;
}
interface BuddyRow { id: string; name: string; percentile: number | null; college: string | null; mentees: number }

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export function PremiumConsole({ premium, free, buddies }: { premium: StudentRow[]; free: StudentRow[]; buddies: BuddyRow[] }) {
  // Local overrides so an assignment reflects instantly without a reload.
  const [assignedNames, setAssignedNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const buddyName = (s: StudentRow) => assignedNames.get(s.id) ?? s.buddyName;
  const sortedBuddies = useMemo(() => [...buddies].sort((a, b) => a.mentees - b.mentees), [buddies]);

  async function assign(studentId: string, buddyId: string) {
    setBusy(studentId);
    setError(null);
    try {
      const res = await fetch('/api/admin/assign-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, buddy_id: buddyId }),
      });
      if (!res.ok) {
        setError(`Assignment failed (${res.status}) — try again.`);
        return;
      }
      const name = buddies.find((b) => b.id === buddyId)?.name ?? 'assigned';
      setAssignedNames((prev) => new Map(prev).set(studentId, name));
    } catch {
      setError('Network error — assignment may not have saved. Reload to check.');
    } finally {
      setBusy(null);
    }
  }

  const row = (s: StudentRow, showPlan: boolean) => {
    const current = buddyName(s);
    return (
      <div key={s.id} className={`rounded-xl border p-3 ${current ? 'border-stone-200 bg-white' : 'border-orange-300 bg-orange-50'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-900">{s.name}</p>
            <p className="text-[11px] text-stone-500">
              {s.phone ?? 'no phone'}
              {showPlan && s.plan && ` · ${s.plan}`}
              {showPlan && s.premiumSince && ` · paid ${fmtDate(s.premiumSince)}`}
              {showPlan && s.renewsAt && ` · renews ${fmtDate(s.renewsAt)}`}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${current ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-500 text-white'}`}>
            {current ? `🤝 ${current}` : 'NO BUDDY'}
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <select
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[12px] text-stone-800"
            defaultValue=""
            id={`pick-${s.id}`}
            disabled={busy === s.id}
          >
            <option value="" disabled>{current ? 'Reassign to…' : 'Choose buddy…'}</option>
            {sortedBuddies.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.percentile != null ? ` · ${b.percentile}%ile` : ''} · {b.mentees} mentee{b.mentees === 1 ? '' : 's'}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy === s.id}
            onClick={() => {
              const sel = document.getElementById(`pick-${s.id}`) as HTMLSelectElement | null;
              if (sel?.value) void assign(s.id, sel.value);
            }}
            className="shrink-0 rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
          >
            {busy === s.id ? 'Assigning…' : current ? 'Reassign' : 'Assign'}
          </button>
        </div>
      </div>
    );
  };

  const unassigned = premium.filter((s) => !buddyName(s));
  const assigned = premium.filter((s) => !!buddyName(s));
  const freeMatches = query.trim().length >= 2
    ? free.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">{error}</p>}

      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-orange-600">
          Subscribed — waiting for a buddy ({unassigned.length})
        </h2>
        {unassigned.length > 0
          ? <div className="space-y-2">{unassigned.map((s) => row(s, true))}</div>
          : <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">Every subscriber has a buddy ✓</p>}
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-500">
          Subscribed — matched ({assigned.length})
        </h2>
        <div className="space-y-2">{assigned.map((s) => row(s, true))}</div>
        {assigned.length === 0 && <p className="text-[12px] text-stone-400">No matched subscribers yet.</p>}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-stone-500">Founder override — assign any student</h2>
        <p className="mt-0.5 text-[11px] text-stone-400">
          Buddy is a paid feature (your rule, 15 Jul) — assigning a free student here is a deliberate comp, not the normal path.
        </p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any student by name (e.g. Harsh)…"
          className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-[13px]"
        />
        {freeMatches.length > 0 && <div className="mt-2 space-y-2">{freeMatches.map((s) => row(s, false))}</div>}
        {query.trim().length >= 2 && freeMatches.length === 0 && (
          <p className="mt-2 text-[12px] text-stone-400">No free student matches “{query.trim()}”. (Subscribers are listed above.)</p>
        )}
      </section>
    </div>
  );
}
