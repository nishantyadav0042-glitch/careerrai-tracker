'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface OutreachState {
  status: string;
  /** Follow-up DATE (YYYY-MM-DD). Stored as next_action_at, 11:00 IST — the one clock (SA-1A). */
  next_action_date: string;
  notes: string;
}

const STATUS_OPTIONS = [
  { value: 'not_contacted', label: 'Not contacted' },
  { value: 'called', label: 'Called' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_interested', label: 'Not interested' },
];

// The team's working state per lead — exactly five fields, nothing more.
// `owner` is display-only (SA-1D): ownership is set by the atomic claim when
// a call is logged, and moved only by the admin reassign action — never by
// typing a name into a form.
export function OutreachPanel({ studentId, owner, initial }: { studentId: string; owner: string | null; initial: OutreachState }) {
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          status: state.status,
          nextActionDate: state.next_action_date || null,
          notes: state.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? 'Could not save — try again.');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Connection issue — try again.');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-400';

  return (
    <Card className="p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Outreach</p>

      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500">Status</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setState((s) => ({ ...s, status: value }))}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  state.status === value ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">Owner</label>
            <p className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-sm text-stone-700">
              {owner ?? 'Unclaimed'}
            </p>
            <p className="mt-1 text-[10px] text-stone-400">Set by logging a call; moved only by admin reassign.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">Next follow-up</label>
            <input
              type="date"
              value={state.next_action_date}
              onChange={(e) => setState((s) => ({ ...s, next_action_date: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500">Notes</label>
          <textarea
            value={state.notes}
            onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
            placeholder="What happened on the last call, objections, context…"
            rows={3}
            maxLength={2000}
            className={cn(inputClass, 'resize-none')}
          />
        </div>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </Card>
  );
}
