'use client';
import { useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';

interface Props {
  buddyId: string;
  buddyName: string;
  hasPendingRequest: boolean;
}

export function SessionRequestPanel({ buddyId, buddyName, hasPendingRequest }: Props) {
  const [pending, setPending] = useState(hasPendingRequest);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submitRequest() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/sessions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buddyId, message }),
      });
      if (!res.ok) throw new Error('Failed');
      setPending(true);
      setMessage('');
    } catch {
      setError('Could not send request. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (pending) {
    return (
      <div className="flex items-center gap-2 text-orange-800">
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
        <p className="text-sm font-medium">Request sent — {buddyName} has been notified and will reach out soon.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-orange-900">
        Stuck on something? Ping {buddyName} for an urgent call.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`What do you need help with? e.g. "Struggling with DILR under time pressure"`}
        rows={2}
        maxLength={200}
        className="w-full px-3 py-2.5 text-sm bg-white border border-orange-200 rounded-xl focus:outline-none focus:border-orange-400 resize-none"
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <button
        onClick={submitRequest}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {submitting ? 'Sending…' : 'Request urgent session'}
      </button>
    </div>
  );
}
