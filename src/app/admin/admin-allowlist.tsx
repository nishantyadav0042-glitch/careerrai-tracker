'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Phone } from 'lucide-react';

interface BuddyOption { id: string; full_name: string }
export interface AllowlistRow {
  id: string;
  phone: string;
  full_name: string;
  status: 'active' | 'paused';
  assigned_buddy_id: string | null;
}

export function AdminAllowlist({ rows, buddies }: { rows: AllowlistRow[]; buddies: BuddyOption[] }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [buddyId, setBuddyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buddyName = (id: string | null) => buddies.find((b) => b.id === id)?.full_name ?? null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, full_name: fullName, assigned_buddy_id: buddyId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not add number.'); return; }
      setPhone(''); setFullName(''); setBuddyId('');
      router.refresh();
    } catch {
      setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch('/api/admin/allowlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });
    router.refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus className="w-4 h-4 text-stone-500" />
        <span className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Student access list</span>
      </div>

      {/* Add number + assign buddy in one action */}
      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          required
          className="px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
        />
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-stone-500">+91</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile"
            required
            className="w-full pl-11 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
          />
        </div>
        <select
          value={buddyId}
          onChange={(e) => setBuddyId(e.target.value)}
          className="px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
        >
          <option value="">No buddy yet</option>
          {buddies.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add student'}
        </button>
      </form>
      {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-stone-500 text-center py-4">No numbers yet. Add a student above to grant phone-OTP access.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-stone-50 rounded-xl p-3 border border-stone-100">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                  {r.full_name}
                  <Badge color={r.status === 'active' ? 'green' : 'stone'}>{r.status}</Badge>
                </div>
                <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {r.phone}
                  {buddyName(r.assigned_buddy_id) && <> · Buddy: {buddyName(r.assigned_buddy_id)}</>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={r.assigned_buddy_id ?? ''}
                  onChange={(e) => patch(r.id, { assigned_buddy_id: e.target.value || null })}
                  className="text-xs px-2 py-1.5 bg-white border border-stone-200 rounded-lg"
                >
                  <option value="">No buddy</option>
                  {buddies.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
                </select>
                <button
                  onClick={() => patch(r.id, { status: r.status === 'active' ? 'paused' : 'active' })}
                  className="text-xs font-medium text-stone-600 hover:text-stone-900 px-2 py-1.5"
                >
                  {r.status === 'active' ? 'Pause' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
