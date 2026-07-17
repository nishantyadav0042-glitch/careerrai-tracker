'use client';
import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';

interface Briefing {
  summary_text: string;
  source: 'ai' | 'fallback';
  generated_at: string;
}

interface BriefingPanelProps {
  studentId: string;
  initial: Briefing | null;
}

export function BriefingPanel({ studentId, initial }: BriefingPanelProps) {
  const [briefing, setBriefing] = useState<Briefing | null>(initial);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/buddy/briefing/${studentId}`, { method: 'POST' });
      if (!res.ok) return;
      const { briefing: next } = (await res.json()) as { briefing: Briefing };
      setBriefing(next);
    } catch {
      // Silent — existing briefing stays
    } finally {
      setLoading(false);
    }
  }

  const ageLabel = briefing
    ? (() => {
        const mins = Math.round((Date.now() - new Date(briefing.generated_at).getTime()) / 60_000);
        if (mins < 60) return `${mins}m ago`;
        if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
        return `${Math.round(mins / 1440)}d ago`;
      })()
    : null;

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
            AI Facts Summary
          </span>
          {ageLabel && (
            <span className="text-[10px] text-teal-500">{ageLabel}</span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Generating…' : 'Refresh'}
        </button>
      </div>

      {briefing ? (
        <div className="text-sm text-teal-900 leading-relaxed whitespace-pre-line">
          {briefing.summary_text}
        </div>
      ) : (
        <p className="text-sm text-teal-700 italic">
          No briefing yet — tap Refresh to generate a facts-only summary.
        </p>
      )}

      <p className="text-[10px] text-teal-500">
        Facts only — AI summarises, you interpret. Never shown to the student.
      </p>
    </div>
  );
}
