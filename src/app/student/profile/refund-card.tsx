'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, CheckCircle, Clock } from 'lucide-react';

interface Props {
  daysLogged: number;
  required: number;
  eligible: boolean;
  existingRequest: { status: 'pending' | 'approved' | 'rejected'; requestedAt: string } | null;
}

export function RefundCard({ daysLogged, required, eligible, existingRequest }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/student/request-refund', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setDone(true);
      } else {
        setError(data.error ?? 'Something went wrong. Try again.');
      }
    } catch {
      setError('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const pct = Math.min(100, Math.round((daysLogged / required) * 100));

  if (done || existingRequest?.status === 'pending') {
    return (
      <Card className="p-5 border-teal-200 bg-teal-50">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-teal-800">Refund request received</p>
            <p className="text-xs text-teal-700 mt-0.5">Nishant will review and process it within 2–3 days. You can also reach him directly.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (existingRequest?.status === 'approved') {
    return (
      <Card className="p-5 border-green-200 bg-green-50">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-green-800">Refund approved</p>
            <p className="text-xs text-green-700 mt-0.5">Your refund has been approved and will be processed via UPI/bank transfer.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (existingRequest?.status === 'rejected') {
    return (
      <Card className="p-5 border-stone-200">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-stone-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-stone-700">Refund request</p>
            <p className="text-xs text-stone-500 mt-0.5">Your refund request was not approved. Contact Nishant directly if you have questions.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-orange-500" />
        <span className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Refund guarantee</span>
      </div>
      <p className="text-sm text-stone-700 mb-3">
        If CareerRai hasn&apos;t helped in your first month, you can request a full refund —
        you need at least {required} days logged. We review every request within 2–3 days.
      </p>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-stone-500">{daysLogged} of {required} days studied</span>
          {eligible
            ? <Badge color="green">Eligible</Badge>
            : <Badge color="stone">{required - daysLogged} more to go</Badge>
          }
        </div>
        <div className="w-full bg-stone-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${eligible ? 'bg-green-500' : 'bg-orange-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {eligible ? (
        <button
          onClick={claim}
          disabled={loading}
          className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {loading ? 'Submitting…' : 'Request refund'}
        </button>
      ) : (
        <p className="text-xs text-stone-400 text-center">Keep updating daily to unlock the refund guarantee.</p>
      )}
    </Card>
  );
}
