'use client';
import { useState } from 'react';
import { PhoneCall, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

interface Props {
  buddyId: string;
  hasPendingRequest: boolean;
}

export function UrgentHelpBanner({ buddyId, hasPendingRequest: initialPending }: Props) {
  const [pending, setPending] = useState(initialPending);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
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
      setExpanded(false);
    } catch {
      setError('Could not send. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (pending) {
    return (
      <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
        <p className="text-sm text-green-800 font-medium flex-1">Urgent session requested — your buddy has been notified.</p>
        <Link href="/student/buddy" className="text-xs text-green-700 underline shrink-0">View</Link>
      </div>
    );
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-orange-100 transition-colors"
      >
        <PhoneCall className="w-4 h-4 text-orange-700 shrink-0" />
        <p className="text-sm font-semibold text-orange-900 flex-1 text-left">Need urgent help from your buddy?</p>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-orange-600 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-orange-600 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What do you need help with?"
            rows={2}
            maxLength={200}
            className="w-full px-3 py-2 text-sm bg-white border border-orange-200 rounded-lg focus:outline-none focus:border-orange-400 resize-none"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
            {submitting ? 'Sending…' : 'Request session'}
          </button>
        </div>
      )}
    </div>
  );
}
