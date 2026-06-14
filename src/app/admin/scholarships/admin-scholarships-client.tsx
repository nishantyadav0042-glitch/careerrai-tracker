'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface StudentOption {
  id: string;
  fullName: string;
  email: string;
}

export interface ScholarshipRow {
  id: string;
  studentName: string;
  studentEmail: string;
  discountLabel: string;
  reason: string | null;
  status: 'active' | 'revoked' | 'expired';
  grantedAt: string | null;
  expiresAt: string | null;
}

type Kind = 'percent' | 'final';

const STATUS_BADGE: Record<ScholarshipRow['status'], { label: string; color: 'green' | 'stone' | 'amber' }> = {
  active: { label: 'Active', color: 'green' },
  revoked: { label: 'Revoked', color: 'stone' },
  expired: { label: 'Expired', color: 'amber' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminScholarshipsClient({
  students,
  scholarships,
}: {
  students: StudentOption[];
  scholarships: ScholarshipRow[];
}) {
  const router = useRouter();

  // Grant form state
  const [studentId, setStudentId] = useState('');
  const [kind, setKind] = useState<Kind>('percent');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [granted, setGranted] = useState(false);

  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleGrant() {
    setError(null);
    setGranted(false);

    if (!studentId) {
      setError('Choose a student.');
      return;
    }
    const num = Number(value);
    if (value === '' || !Number.isFinite(num)) {
      setError('Enter a value.');
      return;
    }
    if (kind === 'percent' && (!Number.isInteger(num) || num < 1 || num > 100)) {
      setError('Percent must be a whole number between 1 and 100.');
      return;
    }
    if (kind === 'final' && num < 0) {
      setError('Fixed price cannot be negative.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/scholarships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          kind,
          value: num,
          reason: reason.trim() || undefined,
          expires_at: expiresAt || undefined,
        }),
      });
      if (res.ok) {
        setGranted(true);
        setStudentId('');
        setValue('');
        setReason('');
        setExpiresAt('');
        setTimeout(() => setGranted(false), 2500);
        router.refresh();
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? 'Could not grant scholarship.');
      }
    } catch {
      setError('Could not grant scholarship.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch('/api/admin/scholarships', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? 'Could not revoke scholarship.');
      }
    } catch {
      setError('Could not revoke scholarship.');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Grant form */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-stone-900">Grant scholarship</h2>
        <p className="text-xs text-stone-500 mt-1">
          Grant access to students in genuine financial hardship. No codes — it attaches to their account.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Student</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
            >
              <option value="">Choose a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}{s.email ? ` — ${s.email}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Type</label>
            <div className="flex bg-stone-100 rounded-xl p-1">
              {(['percent', 'final'] as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                    kind === k ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
                  }`}
                >
                  {k === 'percent' ? 'Percent off' : 'Fixed price'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              {kind === 'percent' ? 'Discount (%)' : 'Price (₹)'}
            </label>
            <div className="relative">
              {kind === 'final' && (
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-500">₹</span>
              )}
              <input
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder={kind === 'percent' ? 'e.g. 80' : 'e.g. 199'}
                className={`w-full ${kind === 'final' ? 'pl-6' : 'pl-3'} pr-3 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-600`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="A short, private note"
              className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Expires (optional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleGrant}
              disabled={busy}
              className="text-sm font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-50"
              style={{ backgroundColor: '#E8652D' }}
            >
              {busy ? 'Granting…' : 'Grant'}
            </button>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            {granted && <p className="text-xs text-emerald-700">✓ Granted</p>}
          </div>
        </div>
      </Card>

      {/* Existing scholarships */}
      <div>
        <h2 className="text-sm font-semibold text-stone-900 mb-2 px-1">Scholarships</h2>
        {scholarships.length === 0 ? (
          <Card className="p-8 text-center text-sm text-stone-500">No scholarships yet.</Card>
        ) : (
          <div className="space-y-2">
            {scholarships.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 flex items-center gap-2 flex-wrap">
                      {s.studentName}
                      <Badge color="blue">{s.discountLabel}</Badge>
                      <Badge color={STATUS_BADGE[s.status].color}>{STATUS_BADGE[s.status].label}</Badge>
                    </div>
                    {s.studentEmail && (
                      <div className="text-xs text-stone-500 mt-0.5">{s.studentEmail}</div>
                    )}
                    {s.reason && (
                      <p className="text-xs text-stone-500 mt-1 italic">{s.reason}</p>
                    )}
                    <div className="text-[10px] text-stone-400 mt-1">
                      Granted {formatDate(s.grantedAt)}
                      {s.expiresAt && <> · expires {formatDate(s.expiresAt)}</>}
                    </div>
                  </div>
                  {s.status === 'active' && (
                    <button
                      onClick={() => handleRevoke(s.id)}
                      disabled={revokingId === s.id}
                      className="shrink-0 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
                    >
                      {revokingId === s.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
