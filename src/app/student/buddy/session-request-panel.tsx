'use client';
import { useState } from 'react';
import { Loader2, CheckCircle, Sparkles } from 'lucide-react';

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
  const [showAI, setShowAI] = useState(false);
  const [aiInsights, setAiInsights] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

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

  async function loadAIInsights() {
    setAiLoading(true);
    setShowAI(true);
    try {
      const res = await fetch('/api/student/ai-insights', { method: 'POST' });
      if (res.ok) {
        const { insights } = await res.json();
        setAiInsights(insights ?? '');
      } else {
        setAiInsights('Could not generate insights right now — try again later.');
      }
    } catch {
      setAiInsights('Network error. Try again.');
    } finally {
      setAiLoading(false);
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
      <div className="flex gap-2">
        <button
          onClick={submitRequest}
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitting ? 'Sending…' : 'Request urgent session'}
        </button>
        <button
          onClick={loadAIInsights}
          disabled={aiLoading}
          title="Get AI study tips"
          className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-orange-200 text-orange-700 rounded-xl text-sm font-medium hover:bg-orange-50 transition-colors disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {aiLoading ? '…' : 'AI tips'}
        </button>
      </div>

      {showAI && (
        <div className="bg-white border border-orange-200 rounded-xl p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-orange-700 mb-2">AI study advice for this week</p>
          {aiLoading ? (
            <p className="text-sm text-stone-500 animate-pulse">Generating…</p>
          ) : (
            <div className="text-sm text-stone-800 whitespace-pre-line leading-relaxed">{aiInsights}</div>
          )}
        </div>
      )}
    </div>
  );
}
