'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Mail, Phone, CheckCircle2 } from 'lucide-react';

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
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
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
          phone: phone || null,
          email: email || null,
          full_name: fullName,
          assigned_buddy_id: personType === 'student' ? (buddyId || null) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not add person.'); return; }
      setPhone(''); setEmail(''); setFullName(''); setBuddyId('');
      setSuccess(`${personType === 'buddy' ? 'Buddy' : 'Student'} added — they can now log in with mobile OTP.`);
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
              onClick={() => { setPersonType(t); setError(null); setSuccess(null); }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                t === 'student'
                  ? personType === t ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
                  : personType === t ? 'bg-teal-700 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {t === 'student' ? '🎓 Student' : '👤 Buddy'}
            </button>
          ))}
        </div>

        {/* Name */}
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          required
          className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
        />

        {/* Phone — PRIMARY (required) */}
        <div>
          <div className="relative flex items-center">
            <span className="absolute left-3 text-sm font-medium text-stone-500 select-none">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Mobile number"
              required
              maxLength={10}
              className="w-full pl-12 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
            />
          </div>
          <p className="text-[10px] text-stone-400 mt-1 pl-1">This is their login — used for OTP</p>
        </div>

        {/* Email — OPTIONAL, Google Calendar only */}
        <div>
          <div className="relative flex items-center">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 text-stone-500"
            />
          </div>
          <p className="text-[10px] text-stone-400 mt-1 pl-1">Only needed for Google Calendar · Meet integration</p>
        </div>

        {/* Buddy assignment (student only) */}
        {personType === 'student' ? (
          <select
            value={buddyId}
            onChange={(e) => setBuddyId(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
          >
            <option value="">Assign buddy later</option>
            {buddies.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
          </select>
        ) : (
          <div className="px-3 py-2.5 bg-teal-50 border border-teal-100 rounded-xl text-xs text-teal-700 flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            Buddy gets mobile OTP login — they set a password on first login
          </div>
        )}

        <button
          type="submit"
          disabled={busy || phone.length < 10}
          className={`w-full py-2.5 rounded-xl text-white text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 ${
            personType === 'buddy' ? 'bg-teal-700 hover:bg-teal-800' : 'bg-stone-900 hover:bg-stone-800'
          }`}
        >
          {busy ? 'Adding…' : `Add ${personType === 'buddy' ? 'buddy' : 'student'}`}
        </button>
      </form>

      {error && <p className="text-xs text-rose-600 mb-3 px-1">{error}</p>}
      {success && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-3">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          {success}
        </div>
      )}

      {/* Students list */}
      {students.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-2">
            Students ({students.length})
          </p>
          <div className="space-y-2">
            {students.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 bg-stone-50 rounded-xl p-3 border border-stone-100">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900 flex items-center gap-2 flex-wrap">
                    {r.full_name}
                    <Badge color={r.status === 'active' ? 'green' : 'stone'}>{r.status}</Badge>
                  </div>
                  <div className="text-xs text-stone-500 mt-1 space-y-0.5">
                    {r.phone && (
                      <div className="flex items-center gap-1 font-medium text-stone-700">
                        <Phone className="w-3 h-3" /> {r.phone}
                      </div>
                    )}
                    {r.email && (
                      <div className="flex items-center gap-1 text-stone-400">
                        <Mail className="w-3 h-3" /> {r.email}
                      </div>
                    )}
                    {buddyName(r.assigned_buddy_id) && (
                      <div className="text-teal-600 font-medium">Buddy: {buddyName(r.assigned_buddy_id)}</div>
                    )}
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
                    className="text-xs font-medium text-stone-500 hover:text-stone-900 px-2 py-1.5 bg-white border border-stone-200 rounded-lg transition-colors"
                  >
                    {r.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buddies list */}
      {buddyRows.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-2">
            Buddies ({buddyRows.length})
          </p>
          <div className="space-y-2">
            {buddyRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 bg-teal-50 rounded-xl p-3 border border-teal-100">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900 flex items-center gap-2 flex-wrap">
                    {r.full_name}
                    <Badge color="orange">Buddy</Badge>
                    <Badge color={r.status === 'active' ? 'green' : 'stone'}>{r.status}</Badge>
                  </div>
                  <div className="text-xs mt-1 space-y-0.5">
                    {r.phone && (
                      <div className="flex items-center gap-1 font-medium text-stone-700">
                        <Phone className="w-3 h-3" /> {r.phone}
                      </div>
                    )}
                    {r.email && (
                      <div className="flex items-center gap-1 text-stone-400">
                        <Mail className="w-3 h-3" /> {r.email}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => patch(r.id, { status: r.status === 'active' ? 'paused' : 'active' })}
                  className="text-xs font-medium text-stone-500 hover:text-stone-900 px-2 py-1.5 bg-white border border-teal-200 rounded-lg transition-colors shrink-0"
                >
                  {r.status === 'active' ? 'Pause' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-stone-400 text-center py-6">No one yet. Add a student or buddy above.</p>
      )}
    </Card>
  );
}
