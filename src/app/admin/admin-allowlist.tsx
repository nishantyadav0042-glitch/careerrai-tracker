'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Mail, Phone } from 'lucide-react';

interface BuddyOption { id: string; full_name: string }
export interface AllowlistRow {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string;
  status: 'active' | 'paused';
  assigned_buddy_id: string | null;
  person_type: 'student' | 'buddy';
}

export function AdminAllowlist({ rows, buddies }: { rows: AllowlistRow[]; buddies: BuddyOption[] }) {
  const router = useRouter();
  const [personType, setPersonType] = useState<'student' | 'buddy'>('student');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [buddyId, setBuddyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const buddyName = (id: string | null) => buddies.find((b) => b.id === id)?.full_name ?? null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_type: personType,
          email: email.trim().toLowerCase(),
          phone: phone || null,
          full_name: fullName,
          assigned_buddy_id: personType === 'student' ? (buddyId || null) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not add person.'); return; }
      setEmail(''); setPhone(''); setFullName(''); setBuddyId('');
      setSuccess(`${personType === 'buddy' ? 'Buddy' : 'Student'} added — they can now log in with email OTP.`);
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

  const students = rows.filter((r) => r.person_type !== 'buddy');
  const buddyRows = rows.filter((r) => r.person_type === 'buddy');

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus className="w-4 h-4 text-stone-500" />
        <span className="text-xs uppercase tracking-widest text-stone-500 font-semibold">People access</span>
      </div>

      {/* Add person form */}
      <form onSubmit={add} className="space-y-3 mb-5">
        {/* Type toggle */}
        <div className="flex rounded-xl border border-stone-200 overflow-hidden">
          {(['student', 'buddy'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPersonType(t)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                personType === t
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {t === 'student' ? 'Student' : 'Buddy'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            required
            className="px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
          />
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              maxLength={10}
              placeholder="Phone (optional)"
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
            />
          </div>
          {personType === 'student' ? (
            <select
              value={buddyId}
              onChange={(e) => setBuddyId(e.target.value)}
              className="px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
            >
              <option value="">No buddy yet</option>
              {buddies.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
            </select>
          ) : (
            <div className="px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-400 flex items-center">
              Buddy accounts get OTP login + set-password flow
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Adding…' : `Add ${personType === 'buddy' ? 'buddy' : 'student'}`}
        </button>
      </form>

      {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
      {success && <p className="text-xs text-emerald-600 mb-3">{success}</p>}

      {/* Students */}
      {students.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-2">Students ({students.length})</p>
          <div className="space-y-2">
            {students.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-stone-50 rounded-xl p-3 border border-stone-100">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                    {r.full_name}
                    <Badge color={r.status === 'active' ? 'green' : 'stone'}>{r.status}</Badge>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5 space-y-0.5">
                    {r.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {r.email}</div>}
                    {r.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {r.phone}</div>}
                    {buddyName(r.assigned_buddy_id) && <div>Buddy: {buddyName(r.assigned_buddy_id)}</div>}
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
        </div>
      )}

      {/* Buddies */}
      {buddyRows.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-2">Buddies ({buddyRows.length})</p>
          <div className="space-y-2">
            {buddyRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-orange-50 rounded-xl p-3 border border-orange-100">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                    {r.full_name}
                    <Badge color="orange">Buddy</Badge>
                    <Badge color={r.status === 'active' ? 'green' : 'stone'}>{r.status}</Badge>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5 space-y-0.5">
                    {r.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {r.email}</div>}
                    {r.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {r.phone}</div>}
                  </div>
                </div>
                <button
                  onClick={() => patch(r.id, { status: r.status === 'active' ? 'paused' : 'active' })}
                  className="text-xs font-medium text-stone-600 hover:text-stone-900 px-2 py-1.5 shrink-0"
                >
                  {r.status === 'active' ? 'Pause' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-stone-500 text-center py-4">No people yet. Add a student or buddy above.</p>
      )}
    </Card>
  );
}
